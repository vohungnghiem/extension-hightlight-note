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

  // Nhận diện tiếng Việt. Trước đây chỉ dựa vào ký tự riêng (ă â đ ê ô ơ ư + khối U+1EA0–1EF9)
  // nên bỏ sót chữ chỉ có dấu sắc/huyền/ngã trên nguyên âm thường: "khách hàng", "có", "là"…
  // Nay: có ký tự riêng → Việt; còn nếu có dấu Latin (á à ã é…) thì mọi tiếng trong cụm
  // phải là âm tiết tiếng Việt hợp lệ (phụ âm đầu + vần + phụ âm cuối của tiếng Việt).
  // Nhờ vậy "café", "déjà vu", "está", "más" (có f/j/s cuối…) không bị nhận nhầm.
  const VI_ONLY = /[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹĩũĨŨ]/;
  const LATIN_MARK = /[àáãèéìíòóõùúýÀÁÃÈÉÌÍÒÓÕÙÚÝ]/;
  const VI_SYLLABLE = /^(ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdđghklmnpqrstvx])?[aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ]{1,3}(ng|nh|ch|[cmnpt])?$/;
  function isVietnamese(s) {
    const t = String(s || "");
    if (VI_ONLY.test(t)) return true;
    if (!LATIN_MARK.test(t)) return false;
    const toks = t.toLowerCase().split(/[^a-zà-ỹđ]+/).filter(Boolean);
    return toks.length > 0 && toks.every(w => VI_SYLLABLE.test(w));
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
    ru: "ru-RU", th: "th-TH", id: "id-ID", hi: "hi-IN", ar: "ar-SA", tr: "tr-TR"
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

  // Ngôn ngữ có thể chọn (mã theo Google Dịch). Tên hiển thị lấy theo ngôn ngữ giao diện
  // (langName); vi giữ tên viết tay cho tự nhiên. Ba lựa chọn, mỗi cái nhớ riêng:
  //   settings.nativeLang       — "Ngôn ngữ của bạn" (mặc định vi). Chữ bằng ngôn ngữ này
  //                               được coi là "chữ của mình" (không tự dịch xem trước…)
  //   settings.targetLang       — dịch CHỮ NƯỚC NGOÀI sang đâu (mặc định = nativeLang)
  //   settings.nativeTargetLang — dịch CHỮ CỦA MÌNH sang đâu (mặc định en; trước đây là viTargetLang)
  // targetLang / nativeTargetLang chọn được ngay trên thẻ Dịch.
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
    { code: "pt",    label: "Tiếng Bồ Đào Nha",       short: "Bồ Đào Nha" },
    { code: "it",    label: "Tiếng Ý",                short: "Ý" },
    { code: "ru",    label: "Tiếng Nga",              short: "Nga" },
    { code: "th",    label: "Tiếng Thái",             short: "Thái" },
    { code: "id",    label: "Tiếng Indonesia",        short: "Indonesia" },
    { code: "hi",    label: "Tiếng Hindi",            short: "Hindi" },
    { code: "ar",    label: "Tiếng Ả Rập",            short: "Ả Rập" },
    { code: "tr",    label: "Tiếng Thổ Nhĩ Kỳ",       short: "Thổ Nhĩ Kỳ" }
  ];
  const isLangCode = (c) => TARGET_LANGS.some(t => t.code === c);
  // Tên ngôn ngữ theo giao diện. vi: tên viết tay; khác: Intl.DisplayNames (tự đúng mọi ngôn ngữ).
  function langName(code, uiLang, short) {
    const t = TARGET_LANGS.find(x => x.code === code);
    if (!uiLang || uiLang === "vi") return t ? (short ? t.short : t.label) : String(code);
    try {
      const n = new Intl.DisplayNames([uiLang], { type: "language" }).of(code);
      if (n) return n.charAt(0).toUpperCase() + n.slice(1);
    } catch (e) {}
    return t ? t.label : String(code);
  }
  // Cùng một ngôn ngữ? ("zh-CN" ≈ "zh-TW" ≈ "zh")
  function sameLang(a, b) {
    const x = String(a || "").toLowerCase().split("-")[0], y = String(b || "").toLowerCase().split("-")[0];
    return !!x && x === y;
  }
  function nativeLang(settings) {
    const c = settings && settings.nativeLang;
    return isLangCode(c) ? c : "vi";
  }
  function mainTargetLang(settings) {
    const c = settings && settings.targetLang;
    return isLangCode(c) ? c : nativeLang(settings);
  }
  function defaultNativeTarget(native) { return sameLang(native, "en") ? "es" : "en"; }
  // Đọc cả khoá cũ viTargetLang (bản ≤1.2) để người dùng cũ không mất lựa chọn.
  function nativeTargetLang(settings) {
    const s = settings || {};
    const n = nativeLang(s);
    const c = s.nativeTargetLang !== undefined ? s.nativeTargetLang : s.viTargetLang;
    return (isLangCode(c) && !sameLang(c, n)) ? c : defaultNativeTarget(n);
  }
  // Chữ có phải ngôn ngữ của người dùng không (đoán ở máy; thẻ Dịch sửa lại theo Google).
  function isNativeText(text, settings) {
    const n = nativeLang(settings);
    return n === "vi" ? isVietnamese(text) : sameLang(detectLang(text), n);
  }
  // CHẮC CHẮN là chữ của mình → khỏi tự gửi đi dịch xem trước. Ngôn ngữ Latin khác
  // không chắc được ở máy → trả false (cứ dịch, Google sẽ trả y nguyên nếu trùng).
  function isSureNative(text, settings) {
    const n = nativeLang(settings);
    if (n === "vi") return isSureVietnamese(text);
    return /^(ja|ko|zh)/.test(n) && sameLang(detectLang(text), n);
  }
  function hideSelNative(settings) {
    const s = settings || {};
    return (s.hideSelNative !== undefined ? s.hideSelNative : s.hideSelVietnamese) === true;
  }
  // Giữ tên cũ cho chỗ nào còn gọi.
  const viTargetLang = nativeTargetLang;

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

  // ---------- Cài đặt: mặc định, đọc giá trị, so sánh (dùng chung Cài đặt / popup / background) ----------
  // nativeLang & blacklistedHosts KHÔNG có "mặc định để khôi phục": đó là "bạn là ai" / dữ liệu của bạn.
  function settingDefaults(s) {
    const native = nativeLang(s);
    return {
      uiLang: "auto", targetLang: native, nativeTargetLang: defaultNativeTarget(native),
      showSelButton: true, previewTranslate: true, hideSelNative: false, showSelSpeak: true, showSelCopy: true, showToasts: true,
      highlightStyle: "underline", highlightThickness: 2, highlightColor: "#ffeb3b",
      "typeColors.important": VN_TYPE_COLORS.important, "typeColors.todo": VN_TYPE_COLORS.todo,
      "typeColors.question": VN_TYPE_COLORS.question, "typeColors.reference": VN_TYPE_COLORS.reference,
      caseSensitive: false,
      learningMode: false, srsReminder: true, srsNewPerDay: 20, defaultThreshold: 20, hoverCooldownMs: 300000,
      enabled: true, autoBackup: false, theme: "auto"
    };
  }
  // Giá trị ĐANG CÓ HIỆU LỰC của một khoá (có mặc định + đọc khoá cũ ≤1.2).
  function settingVal(s, key) {
    s = s || {};
    switch (key) {
      case "uiLang": return s.uiLang || "auto";
      case "nativeLang": return nativeLang(s);
      case "targetLang": return mainTargetLang(s);
      case "nativeTargetLang": return nativeTargetLang(s);
      case "hideSelNative": return hideSelNative(s);
      case "theme": return s.theme || "auto";
      case "learningMode": return s.learningMode === true;
      case "autoBackup": return s.autoBackup === true;
    }
    if (key.startsWith("typeColors.")) { const k = key.slice(11); return (s.typeColors || {})[k] || VN_TYPE_COLORS[k]; }
    const d = settingDefaults(s)[key];
    return s[key] === undefined ? d : s[key];
  }
  // Cách hiển thị + nhóm của từng khoá (cho hộp thoại "khôi phục sau khi cập nhật").
  //   core: tắt thì mất tính năng chính → nhắc "có thể bạn đã quên".
  const SETTING_INFO = {
    enabled:          { label: "Bật Highlight Note trên các trang web", sec: "sites", kind: "bool", core: true },
    showSelButton:    { label: "Hiện thanh Dịch / Lưu khi bôi đen", sec: "selection", kind: "bool", core: true },
    previewTranslate: { label: "Hiện sẵn nghĩa của từ ngắn", sec: "selection", kind: "bool", core: true },
    showToasts:       { label: "Thông báo nhỏ góc màn hình", sec: "selection", kind: "bool", core: true },
    hideSelNative:    { label: "Không hiện khi bôi chữ bằng ngôn ngữ của bạn", sec: "selection", kind: "bool" },
    showSelSpeak:     { label: "Nút phát âm", sec: "selection", kind: "bool" },
    showSelCopy:      { label: "Nút sao chép", sec: "selection", kind: "bool" },
    uiLang:           { label: "Ngôn ngữ giao diện", sec: "language", kind: "ui" },
    targetLang:       { label: "Chữ nước ngoài dịch sang", sec: "language", kind: "lang" },
    nativeTargetLang: { label: "Chữ bằng ngôn ngữ của bạn dịch sang", sec: "language", kind: "lang" },
    highlightStyle:   { label: "Kiểu tô sáng", sec: "highlight", kind: "style" },
    highlightThickness: { label: "Độ dày nét", sec: "highlight", kind: "px" },
    highlightColor:   { label: "Màu Từ vựng", sec: "highlight", kind: "color" },
    "typeColors.important": { label: "Màu Quan trọng", sec: "highlight", kind: "color" },
    "typeColors.todo":      { label: "Màu Cần làm", sec: "highlight", kind: "color" },
    "typeColors.question":  { label: "Màu Câu hỏi", sec: "highlight", kind: "color" },
    "typeColors.reference": { label: "Màu Tư liệu", sec: "highlight", kind: "color" },
    caseSensitive:    { label: "Phân biệt chữ hoa / thường", sec: "highlight", kind: "bool" },
    learningMode:     { label: "Chế độ học từ", sec: "review", kind: "bool" },
    srsReminder:      { label: "Nhắc khi có từ đến hạn ôn", sec: "review", kind: "bool" },
    srsNewPerDay:     { label: "Số từ mới mỗi ngày", sec: "review", kind: "num" },
    defaultThreshold: { label: "Sau bao nhiêu lần gặp", sec: "review", kind: "num" },
    hoverCooldownMs:  { label: "Mỗi từ tính tối đa 1 lần gặp trong (phút)", sec: "review", kind: "min" },
    autoBackup:       { label: "Tự sao lưu mỗi tuần", sec: "sync", kind: "bool" },
    theme:            { label: "Giao diện", sec: "general", kind: "theme" }
  };
  // Mặc định đã ĐỔI qua các phiên bản: { in: bản đổi, key, old: mặc định trước đó }.
  // Người dùng cập nhật từ bản cũ hơn `in` mà giá trị vẫn đúng bằng `old` → nhiều khả năng họ
  // CHƯA TỪNG chỉnh (chỉ là mặc định cũ) → hộp thoại chọn sẵn "dùng mặc định mới".
  // Thêm 1 dòng ở đây mỗi khi đổi mặc định trong settingDefaults.
  const DEFAULT_CHANGES = [
    { in: "1.2.1", key: "autoBackup", old: true } // bản 1.2.0 coi như bật (undefined = bật)
  ];
  function cmpVersion(a, b) {
    const x = String(a || "0").split(".").map(Number), y = String(b || "0").split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }
  // Các cài đặt đang khác mặc định → [{ key, cur, def, reason }], reason:
  //   "newDefault" — mặc định đổi ở bản mới, bạn chưa chỉnh (nên dùng mặc định mới)
  //   "off"        — đang tắt một tính năng chính (có thể bạn đã quên)
  //   "custom"     — bạn tự chỉnh
  // fromVersion: bản trước khi cập nhật (để nhận ra "mặc định cũ"); resolveUi: so ngôn ngữ giao
  // diện theo HIỆU LỰC (vd uiLang "vi" ở máy tiếng Việt ≡ "auto" → không tính là khác).
  function settingsDiff(settings, fromVersion, resolveUi) {
    const s = settings || {};
    const d = settingDefaults(s);
    const out = [];
    for (const key of Object.keys(SETTING_INFO)) {
      const cur = settingVal(s, key), def = d[key];
      if (JSON.stringify(cur) === JSON.stringify(def)) continue;
      if (key === "uiLang" && resolveUi && resolveUi(s) === resolveUi({ ...s, uiLang: "auto" })) continue;
      const ch = fromVersion && DEFAULT_CHANGES.find(c => c.key === key && cmpVersion(fromVersion, c.in) < 0);
      const reason = ch && JSON.stringify(ch.old) === JSON.stringify(cur) ? "newDefault"
        : (SETTING_INFO[key].core && cur === false) ? "off" : "custom";
      out.push({ key, cur, def, reason });
    }
    const rank = { newDefault: 0, off: 1, custom: 2 };
    return out.sort((a, b) => rank[a.reason] - rank[b.reason]);
  }

  root.HN_CONST = {
    VN_TYPES, VN_TYPE_COLORS, isVietnamese, isSureVietnamese, detectLang, speechLang, dictLink, TARGET_LANGS, langName,
    nativeLang, nativeTargetLang, viTargetLang, mainTargetLang, isNativeText, isSureNative, hideSelNative, defaultNativeTarget, sameLang, speak, hostBlocked,
    learningEnabled, isReviewable, reviewState,
    settingDefaults, settingVal, SETTING_INFO, DEFAULT_CHANGES, cmpVersion, settingsDiff
  };
})(typeof self !== "undefined" ? self : this);
