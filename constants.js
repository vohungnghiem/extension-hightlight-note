// Hằng & hàm tiện ích dùng chung giữa content script, popup và options.
// Trước đây VN_TYPES bị nhân đôi ở content.js + popup.js và bảng màu mặc định
// bị nhân đôi ở content.js (VN_TYPE_COLORS) + options.js (tcDef) → dễ lệch khi
// thêm/sửa loại mục. Gom về một nguồn duy nhất tại đây.
//
// Nạp TRƯỚC các file dùng nó (thứ tự được đảm bảo):
//   - manifest content_scripts.js: ["constants.js", "content.js", ...]
//   - popup.html / options.html: <script src="constants.js"> đặt trước popup.js/options.js
//   - background tiêm lại content script: luôn tiêm ["constants.js", "content.js"]
(function (root) {
  // Loại mục (type). vocab = mặc định, giữ nguyên hành vi cũ. Các loại khác biến
  // extension từ "chỉ học từ" thành công cụ tô sáng đa mục đích.
  const VN_TYPES = {
    vocab:     { label: "Từ vựng",    icon: "📚" },
    important: { label: "Quan trọng", icon: "⭐" },
    todo:      { label: "Cần làm",    icon: "✅" },
    question:  { label: "Câu hỏi",    icon: "❓" },
    reference: { label: "Tư liệu",    icon: "📎" }
  };
  // Màu mặc định cho từng loại (ngoài vocab). Đổi được trong Cài đặt (settings.typeColors).
  const VN_TYPE_COLORS = {
    important: "#ff5a5f",
    todo:      "#28c76f",
    question:  "#9b6dff",
    reference: "#00bcd4"
  };

  // Nhận diện tiếng Việt qua các ký tự đặc trưng (ă â đ ê ô ơ ư + dấu thanh khối
  // U+1EA0–1EF9). Dùng để: không dịch chữ Việt, gợi ý loại mục, gắn nhãn VI.
  function isVietnamese(s) {
    return /[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹ]/.test(String(s || ""));
  }

  // CHẮC CHẮN là chữ Việt: có ă đ ơ ư hoặc chữ có dấu chồng (U+1EA0–1EF9). KHÔNG tính â ê ô
  // vì tiếng Pháp / Bồ Đào Nha / Rumani… cũng có (être, château, hôtel) — các chữ đó chỉ
  // mang tính "có thể", để Google Dịch quyết định.
  function isSureVietnamese(s) {
    return /[ăđơưĂĐƠƯẠ-ỹ]/.test(String(s || ""));
  }

  // Đoán ngôn ngữ CỤC BỘ (không gọi mạng). Google Translate sẽ tinh chỉnh lại
  // (es/fr/de…) khi dịch. Trước đây mọi thứ không phải CJK đều bị gán "en" →
  // chữ Việt bị sinh biến thể kiểu Anh và phát âm bằng giọng Anh.
  function detectLang(s) {
    const t = String(s || "");
    if (/[぀-ヿ]/.test(t)) return "ja";        // có kana → chắc chắn tiếng Nhật
    if (/[가-힯]/.test(t)) return "ko";
    if (/[一-鿿]/.test(t)) {
      // Chỉ có Hán tự: không phân biệt được Trung/Nhật chỉ từ chữ. Trang khai báo
      // lang="zh…" thì là tiếng Trung; không thì giữ hành vi cũ (JA). Google Dịch
      // sẽ nhận đúng lại khi dịch (zh-CN/zh-TW) — đây chỉ là đoán tạm lúc chưa có mạng.
      const pageLang = (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) || "";
      return /^zh/i.test(pageLang) ? "zh" : "ja";
    }
    if (isVietnamese(t)) return "vi";
    return "en";
  }

  // Mã ngôn ngữ → giọng đọc SpeechSynthesis. Mã lạ thì đưa thẳng (vd "fr" vẫn chạy).
  const SPEECH_LANG = {
    en: "en-US", ja: "ja-JP", vi: "vi-VN", ko: "ko-KR", zh: "zh-CN", "zh-cn": "zh-CN",
    "zh-tw": "zh-TW", fr: "fr-FR", de: "de-DE", es: "es-ES", it: "it-IT", pt: "pt-PT",
    ru: "ru-RU", th: "th-TH", id: "id-ID"
  };
  function speechLang(lang) {
    const l = String(lang || "en").toLowerCase();
    return SPEECH_LANG[l] || l;
  }

  // Từ điển theo ngôn ngữ nguồn (nhận cả mã Google như "zh-CN"). Dùng chung cho
  // tooltip trên trang và thẻ Dịch để hai nơi không lệch nhau.
  function dictLink(term, lang) {
    const q = encodeURIComponent(term);
    const l = String(lang || "").toLowerCase();
    if (l === "ja") return { url: `https://jisho.org/search/${q}`, title: "Jisho" };
    if (l === "en") return { url: `https://dictionary.cambridge.org/dictionary/english/${q}`, title: "Cambridge" };
    if (l === "zh" || l.startsWith("zh-")) return { url: `https://hanzii.net/search/word/${q}?hl=vi`, title: "Hanzii" };
    if (l === "ko") return { url: `https://korean.dict.naver.com/kovidict/#/search?query=${q}`, title: "Naver" };
    return { url: `https://en.wiktionary.org/wiki/${q}`, title: "Wiktionary" };
  }

  // Ngôn ngữ đích có thể chọn. Mã theo Google Dịch. Hai lựa chọn độc lập, mỗi cái nhớ riêng:
  //   settings.targetLang   — dịch CHỮ NƯỚC NGOÀI sang đâu (mặc định "vi")
  //   settings.viTargetLang — dịch CHỮ VIỆT sang đâu (mặc định "en")
  // Chọn ngay trên thẻ Dịch (người dùng không phải vào Cài đặt).
  // label: tên đầy đủ (Cài đặt); short: tên gọn cho ô chọn nhỏ trên thẻ Dịch.
  const TARGET_LANGS = [
    { code: "vi",    label: "Tiếng Việt",             short: "Việt" },
    { code: "en",    label: "Tiếng Anh",              short: "Anh" },
    { code: "ja",    label: "Tiếng Nhật",             short: "Nhật" },
    { code: "ko",    label: "Tiếng Hàn",              short: "Hàn" },
    { code: "zh-CN", label: "Tiếng Trung (giản thể)", short: "Trung (giản)" },
    { code: "zh-TW", label: "Tiếng Trung (phồn thể)", short: "Trung (phồn)" },
    { code: "fr",    label: "Tiếng Pháp",             short: "Pháp" },
    { code: "de",    label: "Tiếng Đức",              short: "Đức" },
    { code: "es",    label: "Tiếng Tây Ban Nha",      short: "Tây Ban Nha" },
    { code: "ru",    label: "Tiếng Nga",              short: "Nga" },
    { code: "th",    label: "Tiếng Thái",             short: "Thái" }
  ];
  function viTargetLang(settings) {
    const c = settings && settings.viTargetLang;
    return (c !== "vi" && TARGET_LANGS.some(t => t.code === c)) ? c : "en";
  }
  function mainTargetLang(settings) {
    const c = settings && settings.targetLang;
    return TARGET_LANGS.some(t => t.code === c) ? c : "vi";
  }
  // Cùng một ngôn ngữ? ("zh-CN" ≈ "zh-TW" ≈ "zh")
  function sameLang(a, b) {
    const x = String(a || "").toLowerCase().split("-")[0], y = String(b || "").toLowerCase().split("-")[0];
    return !!x && x === y;
  }

  function speak(text, lang) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = speechLang(lang);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  // Domain có nằm trong danh sách chặn không (khớp cả subdomain: chặn "google.com"
  // thì "mail.google.com" cũng bị chặn). Popup và content script PHẢI dùng chung
  // hàm này — trước đây popup so khớp tuyệt đối nên hiển thị lệch với trang.
  function hostBlocked(host, list) {
    const h = String(host || "").toLowerCase();
    if (!h) return false;
    return (list || []).some(x => {
      const b = String(x || "").trim().toLowerCase();
      return b && (h === b || h.endsWith("." + b));
    });
  }

  // ---------- Ôn tập: luật chung cho popup (dòng nhắc, nút Ôn tập) và background
  // (số trên biểu tượng) — để hai nơi không bao giờ đếm lệch nhau. ----------
  // "Chế độ học từ" (settings.learningMode) là MỘT công tắc, TẮT mặc định: tắt thì im
  // hẳn — không nút Ôn tập, không nhắc, không số trên biểu tượng, không thanh tiến độ,
  // không tự đánh dấu đã thuộc. Bật thì: từ mới lưu chỉ tính "cần ôn" từ hôm sau.
  const NEW_WORD_DELAY_MS = 86400000;
  function learningEnabled(settings) { return !!(settings && settings.learningMode === true); }
  function isReviewable(w) {
    return !!(w && !w.sticky && (!VN_TYPES[w.type] || w.type === "vocab") && w.meaning);
  }
  // → { eligible, overdue: [...], fresh: [...] (từ mới đủ 1 ngày), due: số cần ôn hôm nay }
  function reviewState(words, settings, now = Date.now()) {
    const s = settings || {};
    const list = (words || []).filter(isReviewable);
    const eligible = learningEnabled(s) && list.length > 0;
    const overdue = [], fresh = [];
    for (const w of list) {
      if (w.learned || w.disabled) continue;
      if (w.srsDue) { if (Date.parse(w.srsDue) <= now) overdue.push(w); }
      else if (now - (Date.parse(w.createdAt || "") || 0) >= NEW_WORD_DELAY_MS) fresh.push(w);
    }
    const due = eligible ? overdue.length + Math.min(fresh.length, s.srsNewPerDay || 20) : 0;
    return { eligible, overdue, fresh, due };
  }

  root.HN_CONST = {
    VN_TYPES, VN_TYPE_COLORS, isVietnamese, isSureVietnamese, detectLang, speechLang, dictLink, TARGET_LANGS, viTargetLang, mainTargetLang, sameLang, speak, hostBlocked,
    learningEnabled, isReviewable, reviewState
  };
})(typeof self !== "undefined" ? self : this);
