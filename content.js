// Content script: chạy trên mọi trang web
// - Quét DOM, highlight từ có trong danh sách
// - Tooltip hover (nghĩa + counter + nút xoá)
// - Modal nhập nghĩa khi user chọn "Lưu vào Vocab" từ context menu

(() => {
  if (window.__vocabNoteInjected) return;
  window.__vocabNoteInjected = true;

  // ---------- Chống nhân đôi UI khi có NHIỀU instance cùng chạy ----------
  // Reload extension mà chưa reload tab rồi bấm "Quét lại"/"Ghi chú" có thể khiến
  // content script bị tiêm vào một world mới → 2 instance cùng sống trên 1 trang,
  // hover hiện 2 tooltip chồng nhau. Instance mới phát tín hiệu "takeover"; instance
  // cũ (nếu cũng chạy mã này) nghe được sẽ tự tắt và gỡ UI của mình. Phát TRƯỚC rồi
  // mới đăng ký listener để không tự nhận tín hiệu của chính mình.
  let superseded = false;
  const VN_TAKEOVER = "vocabNote:takeover";
  try { document.dispatchEvent(new CustomEvent(VN_TAKEOVER)); } catch (e) {}
  document.addEventListener(VN_TAKEOVER, () => {
    superseded = true;
    try { hideTooltip(); } catch (e) {}
    if (tooltipEl && tooltipEl.parentNode) tooltipEl.remove();
    tooltipEl = null;
    try { hideSelBtn(); } catch (e) {}
    if (selBtn && selBtn.parentNode) selBtn.remove();
    selBtn = null;
    if (stickyLayer && stickyLayer.parentNode) stickyLayer.remove();
    stickyLayer = null;
    document.querySelectorAll(".vocab-note-mini-card").forEach(el => el.remove());
    try { observer.disconnect(); } catch (e) {} // instance cũ thôi quét DOM
  });

  // Bộ icon SVG dùng chung (đồng bộ với popup) — thay cho emoji rời rạc
  const svgIco = (paths, sz = 16) =>
    `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const VN_ICON = {
    speak: svgIco('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
    book: svgIco('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    globe: svgIco('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
    close: svgIco('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
    edit: svgIco('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
    bell: svgIco('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
    bellOff: svgIco('<path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M18 8a6 6 0 0 0-9.3-5"/><path d="M6 8c0 7-3 9-3 9h13"/><line x1="2" y1="2" x2="22" y2="22"/>'),
    learn: svgIco('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/>'),
    del: svgIco('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    save: svgIco('<polyline points="20 6 9 17 4 12"/>'),
    minimize: svgIco('<line x1="5" y1="12" x2="19" y2="12"/>'),
    translate: svgIco('<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>'),
    highlighter: svgIco('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'),
    pin: svgIco('<path d="M12 17v5"/><path d="M9 10.76V6h6v4.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V17H5v-1.76a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 10.76z"/><path d="M8 6h8"/>', 13),
    copy: svgIco('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    help: svgIco('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    more: svgIco('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
    gear: svgIco('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')
  };

  // Icon SVG line ĐỒNG NHẤT cho từng loại — khớp với popup (thay emoji 📚⭐✅❓📎).
  // Dùng ở thẻ mini + chip loại trong tooltip (nơi render bằng innerHTML).
  const VN_TYPE_ICON = {
    vocab:     svgIco('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    important: svgIco('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    todo:      svgIco('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    question:  svgIco('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    reference: svgIco('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>')
  };

  // ---------- Loại mục (type) ----------
  // vocab = mặc định, giữ NGUYÊN hành vi cũ (màu theo settings.highlightColor).
  // Các loại khác biến extension từ "chỉ học từ" thành công cụ tô sáng đa mục đích
  // cho công việc: đánh dấu điểm quan trọng, việc cần làm, câu hỏi, tư liệu tham khảo.
  // VN_TYPES & VN_TYPE_COLORS nạp từ constants.js (chạy trước content.js theo manifest).
  const VN_TYPES = self.HN_CONST.VN_TYPES;
  const VN_TYPE_COLORS = self.HN_CONST.VN_TYPE_COLORS;
  const { detectLang, isVietnamese, speak, dictLink, TARGET_LANGS, langName, nativeLang, nativeTargetLang, mainTargetLang,
    isNativeText, isSureNative, hideSelNative, sameLang } = self.HN_CONST;
  // Dịch giao diện (i18n.js nạp trước). T("Dịch sang {0}", x) — câu tiếng Việt là khoá.
  const HN_I18N = self.HN_I18N;
  const T = HN_I18N ? HN_I18N.t : (s, ...a) => String(s).replace(/\{(\d+)\}/g, (_, i) => a[i]);
  const uiLang = () => (HN_I18N ? HN_I18N.getLang() : "vi");
  // UI của mình (thanh, thẻ, tooltip, toast, ghi chú dán) là con trực tiếp của <body> với class
  // "vocab-note-…" → theo dõi riêng từng khối đó (KHÔNG quan sát cả trang web, đỡ tốn).
  // Nội dung người dùng (từ, nghĩa, ghi chú, bản dịch) nằm trong selector skip → không bị dịch.
  function i18nWatchUi() {
    if (!HN_I18N || uiLang() === "vi" || !document.body) return;
    for (const n of document.body.children) {
      if (typeof n.className === "string" && /\bvocab-note-(?!highlight)/.test(n.className)) HN_I18N.watch(n);
    }
  }
  if (HN_I18N) {
    HN_I18N.setSkip(".vn-mini-term, .vn-sel-trans, .vn-tr-word b, .vn-tr-src, .vn-term-text, .vn-meaning, .vn-note, .vn-tag, .vn-phonetic, .vn-mini-phonetic, .vns-text");
    const rootObs = new MutationObserver(() => i18nWatchUi());
    const startObs = () => { if (document.body) rootObs.observe(document.body, { childList: true }); };
    if (document.body) startObs(); else document.addEventListener("DOMContentLoaded", startObs, { once: true });
  }
  function applyUiLang() {
    if (!HN_I18N) return;
    const l = HN_I18N.resolve(settings);
    if (l !== uiLang()) { HN_I18N.setLang(l); i18nWatchUi(); }
  }
  const vnTypeOf = (w) => (w && VN_TYPES[w.type]) ? w.type : "vocab";
  // Nhãn "hoàn tất" theo ngữ cảnh loại (vocab: đã thuộc; todo: đã xong; khác: đã xử lý)
  const vnDoneLabel = (w) => {
    const t = vnTypeOf(w);
    return t === "vocab" ? "đã thuộc" : t === "todo" ? "đã xong" : "đã xử lý";
  };
  // Tag: nhãn tự do gom mục theo dự án/chủ đề (đồng bộ với popup)
  const vnParseTags = (str) => [...new Set(
    String(str || "").split(",").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean).map(s => s.slice(0, 40))
  )].slice(0, 20);
  const vnTagsToStr = (tags) => (tags || []).join(", ");

  // Mở trang Cài đặt / Hướng dẫn (nhờ background mở giúp — content script không
  // gọi trực tiếp được openOptionsPage / chrome.tabs).
  // section: mục trong Cài đặt (vd "selection#showSelButton" → mở đúng mục và làm nổi dòng đó).
  function openExtPage(which, section) {
    try { chrome.runtime.sendMessage({ type: which === "welcome" ? "OPEN_WELCOME" : "OPEN_OPTIONS", section }); } catch (e) {}
  }

  // Icon thương hiệu — gắn vào tooltip & toast để người dùng nhận ra đây là của
  // Highlight Note, không nhầm với UI của trang web.
  const BRAND_ICON = chrome.runtime.getURL("icons/icon16.png");

  // Ngưỡng độ dài: từ/cụm ngắn hơn = tô sáng trên web; dài hơn = note (chỉ lưu, không tô)
  const HIGHLIGHT_MAX = 60;

  let words = [];
  let settings = {
    defaultThreshold: 20,
    highlightColor: "#ffeb3b",
    highlightStyle: "underline", // underline | background | wavy | outline
    highlightThickness: 2,       // độ dày nét (px)
    caseSensitive: false,
    enabled: true,
    hoverCooldownMs: 300000, // 5 phút: mỗi từ chỉ đếm tối đa 1 lần / 5 phút
    blacklistedHosts: [],    // mảng hostname không highlight
    showToasts: true,        // hiện thông báo nhỏ (toast)
    previewTranslate: true,  // dịch nhanh khi bôi đen (xem trước trước khi lưu)
    showSelButton: true,     // hiện thanh nổi khi bôi đen text
    showSelCopy: true,       // nút Sao chép trên thanh nổi
    showSelSpeak: true       // nút Phát âm trên thanh nổi
    // hideSelNative / nativeLang / targetLang / nativeTargetLang: đọc qua hàm trong constants.js
  };
  let wordMap = new Map(); // termLower -> word object
  // Chế độ học từ đang bật (và có từ vựng) → mới hiện thanh tiến độ "1/20" và nút
  // "Đã thuộc" cho từ vựng. Tắt = im hẳn, cùng luật với nút Ôn tập / số trên biểu tượng.
  let learningOn = false;
  let variantMap = new Map(); // variantLower -> word object (cho stem matching EN)
  let combinedRegex = null;

  // Sinh các biến thể tiếng Anh phổ biến để khớp "generic" với "generics", "manage" với "managing"...
  // Cố ý KHÔNG sinh đuôi "-er/-ers/-d" rời: chúng hay tạo từ NGHĨA KHÁC (use→user,
  // read→reader) khiến tô sáng nhầm. Chỉ giữ các biến thể chia số nhiều / thì cơ bản
  // gần nghĩa gốc (-s/-es/-ed/-ing và quy tắc bỏ "e", "y→ies").
  function enVariants(term) {
    const lc = term.toLowerCase();
    const set = new Set([lc]);
    set.add(lc + "s");
    set.add(lc + "es");
    set.add(lc + "ed");
    set.add(lc + "ing");
    set.add(lc + "'s");
    if (lc.endsWith("e")) {
      set.add(lc.slice(0, -1) + "ing");
      set.add(lc.slice(0, -1) + "ed");
    }
    if (lc.endsWith("y")) {
      set.add(lc.slice(0, -1) + "ies");
      set.add(lc.slice(0, -1) + "ied");
    }
    // CVC doubling: stop→stopped/stopping, plan→planning, occur→occurred
    // Quy tắc: kết thúc phụ âm–nguyên âm–phụ âm, phụ âm cuối không phải w/x/y.
    // Chỉ thêm -ed/-ing (không thêm -er/-ers để tránh danh từ nghĩa khác).
    if (lc.length >= 3) {
      const c1 = lc[lc.length - 3];
      const vw = lc[lc.length - 2];
      const c2 = lc[lc.length - 1];
      const isVowel = ch => "aeiou".includes(ch);
      const isCons = ch => /[a-z]/.test(ch) && !isVowel(ch);
      if (isCons(c1) && isVowel(vw) && isCons(c2) && !"wxy".includes(c2)) {
        set.add(lc + c2 + "ed");
        set.add(lc + c2 + "ing");
      }
    }
    return Array.from(set);
  }

  // Khoá tra cứu: gộp khoảng trắng/xuống dòng + chữ thường. Mục bôi đen qua 2 dòng
  // ("deadline\n dự án") và chữ trên trang ("deadline dự án") phải ra cùng một khoá.
  function keyOf(text) { return String(text || "").replace(/\s+/g, " ").trim().toLowerCase(); }

  function findWordByText(text) {
    const lc = keyOf(text);
    return wordMap.get(lc) || variantMap.get(lc) || null;
  }

  // ---------- Storage helpers ----------
  function loadData(cb) {
    chrome.storage.local.get(["words", "settings"], (data) => {
      words = data.words || [];
      settings = { ...settings, ...(data.settings || {}) };
      applyUiLang();
      rebuildIndex();
      cb && cb();
    });
  }

  // Atomic update: đọc từ storage → modify → ghi lại. Tránh race condition
  // khi nhiều tab cùng tăng counter / fetch phonetic / sửa nghĩa.
  function updateWordById(id, mutator) {
    return new Promise(resolve => {
      chrome.storage.local.get("words", (data) => {
        const arr = data.words || [];
        const idx = arr.findIndex(x => x.id === id);
        if (idx === -1) { resolve(false); return; }
        const updated = mutator({ ...arr[idx] });
        if (!updated) { resolve(false); return; }
        arr[idx] = updated;
        chrome.storage.local.set({ words: arr }, () => resolve(true));
      });
    });
  }

  // Mục cũ chữ Việt từng bị gán "en" (detectLang cũ) → coi là "vi" để không sinh
  // biến thể kiểu Anh và phát âm đúng giọng.
  function effLang(w) {
    const l = w.lang || detectLang(w.term);
    return (l === "en" && isVietnamese(w.term)) ? "vi" : l;
  }
  // Chữ viết không dùng khoảng trắng giữa các từ (Hán/Kana/Thái) → không áp ranh giới từ.
  const NOSPACE_SCRIPT = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\u0e00-\u0e7f]/;
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Chọn màu chữ đen/trắng dựa trên độ sáng background (Y trong YIQ)
  function contrastTextFor(hex) {
    if (!hex) return "#000";
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return "#000";
    let h = m[1];
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const y = (r * 299 + g * 587 + b * 114) / 1000;
    return y >= 140 ? "#000" : "#fff";
  }

  // Áp màu + độ dày + kiểu highlight lên <html> để CSS biến thể bám theo cài đặt.
  function applyHighlightVars() {
    const root = document.documentElement;
    root.style.setProperty("--vocab-color", settings.highlightColor);
    root.style.setProperty("--vocab-text-color", contrastTextFor(settings.highlightColor));
    root.style.setProperty("--vocab-thickness", (settings.highlightThickness || 2) + "px");
    root.setAttribute("data-vocab-style", settings.highlightStyle || "underline");
    // Màu riêng cho từng loại (ngoài vocab). CSS map qua [data-vn-type].
    const tc = settings.typeColors || {};
    for (const t of Object.keys(VN_TYPE_COLORS)) {
      const c = tc[t] || VN_TYPE_COLORS[t];
      root.style.setProperty(`--vn-color-${t}`, c);
      root.style.setProperty(`--vn-text-${t}`, contrastTextFor(c));
    }
  }

  function rebuildIndex() {
    applyHighlightVars();
    learningOn = self.HN_CONST.reviewState(words, settings).eligible;
    wordMap.clear();
    variantMap.clear();
    for (const w of words) {
      // Migration: gán lang + type cho mục cũ chưa có (mặc định = từ vựng)
      if (!w.lang) w.lang = detectLang(w.term);
      if (!w.type) w.type = "vocab";
      // Sticky note (ghi chú dán theo URL) KHÔNG tô sáng chữ trên trang → không đưa
      // vào wordMap/regex; nó được vẽ riêng bởi module renderStickyNotes bên dưới.
      if (w.sticky) continue;
      wordMap.set(keyOf(w.term), w);
    }
    const activeWords = settings.enabled === false ? [] : words.filter(w => !w.disabled && !w.learned && !w.sticky);
    if (activeWords.length === 0) {
      combinedRegex = null;
      return;
    }
    // Đoạn dài hơn HIGHLIGHT_MAX coi là "note" → không tô sáng (giữ highlight gọn & nhanh)
    const highlightable = activeWords.filter(w => w.term.length <= HIGHLIGHT_MAX);
    // Build variantMap cho nhóm chữ có khoảng trắng (khớp theo ranh giới từ Unicode).
    // EN: sinh thêm biến thể (số nhiều, -ed, -ing…). Ngôn ngữ khác (vi, es, fr, de…):
    // chỉ khớp đúng từ — không áp quy tắc biến đổi kiểu Anh cho sai. CJK xử riêng bên dưới.
    const enTokens = new Set();
    for (const w of highlightable) {
      if (NOSPACE_SCRIPT.test(w.term)) continue;
      if (effLang(w) === "en") {
        for (const v of enVariants(keyOf(w.term))) {
          enTokens.add(v);
          if (!variantMap.has(v)) variantMap.set(v, w);
        }
      } else {
        const lc = keyOf(w.term);
        enTokens.add(lc);
        if (!variantMap.has(lc)) variantMap.set(lc, w);
      }
    }
    // Khoảng trắng trong cụm từ khớp được cả nhiều space / xuống dòng trên trang.
    const toPattern = (t) => escapeRe(t).replace(/\s+/g, "\\s+");
    const en = Array.from(enTokens).sort((a,b) => b.length - a.length).map(toPattern);
    const ja = highlightable.filter(w => NOSPACE_SCRIPT.test(w.term)).map(w => w.term).sort((a,b) => b.length - a.length).map(toPattern);
    const parts = [];
    // Ranh giới từ theo Unicode: \b cũ chỉ hiểu [A-Za-z0-9_] nên từ bắt đầu/kết thúc
    // bằng chữ có dấu ("ở đây", "été", "niño") không bao giờ khớp.
    const W = "[\\p{L}\\p{M}\\p{N}_]";
    if (en.length) parts.push(`(?<!${W})(?:${en.join("|")})(?!${W})`);
    if (ja.length) parts.push(`(?:${ja.join("|")})`); // CJK không có word boundary
    if (parts.length === 0) { combinedRegex = null; return; }
    const flags = settings.caseSensitive ? "gu" : "giu";
    combinedRegex = new RegExp(parts.join("|"), flags);
  }

  // ---------- Highlight DOM ----------
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT", "CODE", "PRE", "SELECT", "OPTION"]);
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Không tô sáng bên trong UI của chính extension (sticky note, mini-card, thanh
  // nổi, toast…) — trước đây chữ trong ghi chú dán trang bị bọc span lung tung.
  const SKIP_CLASSES = [
    "vocab-note-highlight", "vocab-note-tooltip", "vocab-note-toast", "vocab-note-toast-stack",
    "vocab-note-modal-overlay", "vocab-note-mini-card", "vocab-note-sel-btn", "vocab-note-sel-menu", "vocab-note-sticky-layer"
  ];
  function shouldSkip(node) {
    let p = node.parentNode;
    while (p) {
      if (p.nodeType === 1) {
        if (SKIP_TAGS.has(p.tagName)) return true;
        if (p.namespaceURI === SVG_NS) return true; // chèn <span> vào SVG làm vỡ hình
        if (p.classList) {
          for (const c of SKIP_CLASSES) if (p.classList.contains(c)) return true;
        }
        if (p.isContentEditable) return true;
      }
      p = p.parentNode;
    }
    return false;
  }

  function highlightTextNode(textNode) {
    if (!combinedRegex) return;
    const text = textNode.nodeValue;
    if (!text || text.length < 2) return;
    combinedRegex.lastIndex = 0;
    if (!combinedRegex.test(text)) return;

    combinedRegex.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let m;
    while ((m = combinedRegex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      }
      const wRef = findWordByText(m[0]);
      if (!wRef) {
        // Khớp regex nhưng không tìm thấy base — bỏ qua, giữ nguyên text
        frag.appendChild(document.createTextNode(m[0]));
        lastIndex = m.index + m[0].length;
        continue;
      }
      const span = document.createElement("span");
      span.className = "vocab-note-highlight";
      span.dataset.term = keyOf(wRef.term);
      span.dataset.vnType = vnTypeOf(wRef);
      const pct = (wRef.hoverCount || 0) / (wRef.autoDeleteAt || 20);
      span.dataset.level = !learningOn ? "new" : pct >= 0.7 ? "hot" : pct >= 0.3 ? "warm" : "new";
      // A11y: screen-reader vẫn đọc được qua role + aria-label. KHÔNG đặt
      // tabindex=0 để tránh tạo hàng trăm điểm dừng Tab trên trang có nhiều từ
      // trùng (gây rối cho người dùng bàn phím). Vẫn focus được bằng JS khi cần.
      span.tabIndex = -1;
      span.setAttribute("role", "button");
      span.setAttribute("aria-label",
        wRef.meaning ? `${m[0]} — ${wRef.meaning}` : `${m[0]} (Highlight Note)`);
      span.textContent = m[0];
      frag.appendChild(span);
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    // Guard: trang SPA có thể đã xoá node trước khi batch chạy tới
    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  function scanNode(root) {
    if (!combinedRegex) return;
    const walker = document.createTreeWalker(
      root, NodeFilter.SHOW_TEXT,
      {
        acceptNode(n) {
          if (!n.nodeValue || n.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT;
          if (shouldSkip(n)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    // Xử lý theo batch tránh block UI
    let i = 0;
    function batch() {
      const end = Math.min(i + 200, nodes.length);
      for (; i < end; i++) highlightTextNode(nodes[i]);
      if (i < nodes.length) requestIdleCallback ? requestIdleCallback(batch) : setTimeout(batch, 0);
    }
    batch();
  }

  function removeAllHighlights() {
    document.querySelectorAll(".vocab-note-highlight").forEach(el => {
      if (el.parentNode) {
        const txt = document.createTextNode(el.textContent);
        el.parentNode.replaceChild(txt, el);
      }
    });
  }

  function rescanFullPage() {
    removeAllHighlights();
    anchorAttempts.clear(); // span cũ đã bị gỡ → cho phép neo lại từ đầu
    if (document.body) { scanNode(document.body); anchorPass(); }
  }

  // ============ NEO ĐOẠN VĂN: tô sáng lại đoạn ĐÃ LƯU khi quay lại đúng trang ============
  // Đoạn dài (> HIGHLIGHT_MAX) không tô "everywhere" như từ vựng, mà NEO vào trang gốc:
  // lưu URL + ngữ cảnh; mỗi lần mở lại trang đó thì tìm đúng đoạn text và bọc highlight.
  // Dùng chung tooltip/hover/counter với hệ thống hiện có (qua data-term → wordMap).
  const ANCHOR_MAX_ATTEMPTS = 8;    // ngừng thử sau bấy nhiêu lần (SPA đổi nội dung)
  const ANCHOR_INDEX_CAP = 600000;  // trang quá lớn → bỏ qua để khỏi giật
  const anchorAttempts = new Map(); // id -> số lần đã thử tìm (chưa thấy)

  // Khoá trang: bỏ hash (#...), giữ path + query để phân biệt nội dung.
  function pageUrlKey(href) {
    try { const u = new URL(href || location.href); return u.origin + u.pathname + u.search; }
    catch (e) { return String(href || location.href).split("#")[0]; }
  }
  function normalizeWS(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  // Ngữ cảnh quanh selection (để phân biệt khi 1 đoạn xuất hiện nhiều lần trên trang).
  function captureAnchorContext(range) {
    let prefix = "", suffix = "";
    try {
      const sc = range.startContainer, so = range.startOffset;
      if (sc && sc.nodeType === 3) prefix = sc.nodeValue.slice(Math.max(0, so - 48), so);
      const ec = range.endContainer, eo = range.endOffset;
      if (ec && ec.nodeType === 3) suffix = ec.nodeValue.slice(eo, eo + 48);
    } catch (e) {}
    return { prefix: normalizeWS(prefix), suffix: normalizeWS(suffix) };
  }

  // Tạo dữ liệu neo từ selection hiện tại — CHỈ với đoạn dài (đoạn ngắn vẫn tô everywhere).
  function currentSelectionAnchor(expectedText) {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      const t = normalizeWS(expectedText || sel.toString());
      if (t.length <= HIGHLIGHT_MAX) return null;
      const ctx = captureAnchorContext(sel.getRangeAt(0));
      return { url: pageUrlKey(), pageTitle: (document.title || "").slice(0, 200), prefix: ctx.prefix, suffix: ctx.suffix };
    } catch (e) { return null; }
  }

  function getPageAnchorItems() {
    const here = pageUrlKey();
    return words.filter(w => w && w.anchor && w.url && pageUrlKey(w.url) === here && !w.disabled && !w.learned);
  }

  // Dựng chỉ mục text của trang: chuỗi đã chuẩn hoá khoảng trắng + ánh xạ ngược từng
  // ký tự về (text node, offset). Chèn 1 space "ảo" giữa 2 node để khớp cả ranh giới
  // block (giống cách sel.toString() chèn xuống dòng giữa các khối).
  function buildTextIndex(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(n)) return NodeFilter.FILTER_REJECT; // bỏ text đã nằm trong highlight
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let norm = "";
    const charNode = [], charOff = [];
    let first = true, n;
    while ((n = walker.nextNode())) {
      if (norm.length > ANCHOR_INDEX_CAP) break;
      const raw = n.nodeValue;
      // Chèn space "ảo" giữa 2 node — nhưng KHÔNG nếu norm đã kết thúc bằng space
      // (tránh space kép khi node trước có khoảng trắng ở cuối).
      if (!first && norm.length && !norm.endsWith(" ")) { norm += " "; charNode.push(null); charOff.push(-1); }
      first = false;
      let prevSpace = norm.length === 0 || norm.endsWith(" ");
      for (let i = 0; i < raw.length; i++) {
        if (/\s/.test(raw[i])) {
          if (prevSpace) continue;
          norm += " "; charNode.push(n); charOff.push(i); prevSpace = true;
        } else {
          norm += raw[i]; charNode.push(n); charOff.push(i); prevSpace = false;
        }
      }
    }
    return { norm, charNode, charOff };
  }

  // Chọn lần xuất hiện đúng nhất theo prefix/suffix đã lưu (nếu đoạn lặp lại nhiều lần).
  function findOccurrence(index, targetNorm, w) {
    const positions = [];
    let from = 0, at;
    while ((at = index.norm.indexOf(targetNorm, from)) !== -1) {
      positions.push(at);
      from = at + 1;
      if (positions.length > 50) break;
    }
    if (!positions.length) return -1;
    if (positions.length === 1) return positions[0];
    const pre = normalizeWS(w.anchorPrefix || "");
    const suf = normalizeWS(w.anchorSuffix || "");
    let best = positions[0], bestScore = -1;
    for (const p of positions) {
      // Cắt thêm vài ký tự đệm rồi trim để bỏ qua space ranh giới giữa prefix và đoạn.
      const before = index.norm.slice(Math.max(0, p - pre.length - 4), p).replace(/\s+$/, "");
      const after = index.norm.slice(p + targetNorm.length, p + targetNorm.length + suf.length + 4).replace(/^\s+/, "");
      let score = 0;
      if (pre && before.endsWith(pre)) score += 2;
      if (suf && after.startsWith(suf)) score += 2;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  function makeAnchorSpan(w) {
    const span = document.createElement("span");
    span.className = "vocab-note-highlight";
    span.dataset.term = keyOf(w.term);
    span.dataset.vnType = vnTypeOf(w);
    span.dataset.anchorId = w.id;
    const pct = (w.hoverCount || 0) / (w.autoDeleteAt || 20);
    span.dataset.level = !learningOn ? "new" : pct >= 0.7 ? "hot" : pct >= 0.3 ? "warm" : "new";
    span.tabIndex = -1;
    span.setAttribute("role", "button");
    span.setAttribute("aria-label", w.meaning ? `${w.term} — ${w.meaning}` : `${w.term} (Highlight Note)`);
    return span;
  }

  // Tìm đoạn trên trang & bọc từng phần text-node (đoạn có thể trải nhiều node/thẻ inline).
  function tryAnchor(w, index) {
    const targetNorm = normalizeWS(w.term);
    if (targetNorm.length < 2) return false;
    const start = findOccurrence(index, targetNorm, w);
    if (start < 0) return false;
    const end = start + targetNorm.length;
    const segs = [];
    let cur = null;
    for (let k = start; k < end; k++) {
      const node = index.charNode[k];
      if (!node) continue; // space ảo giữa 2 node
      const off = index.charOff[k];
      if (cur && cur.node === node) cur.end = off + 1;
      else { if (cur) segs.push(cur); cur = { node, start: off, end: off + 1 }; }
    }
    if (cur) segs.push(cur);
    if (!segs.length) return false;
    try {
      for (const s of segs) {
        const range = document.createRange();
        range.setStart(s.node, s.start);
        range.setEnd(s.node, s.end);
        range.surroundContents(makeAnchorSpan(w)); // range trong 1 text-node → luôn hợp lệ
      }
      return true;
    } catch (e) {
      // Lỗi giữa chừng → gỡ các span đã bọc của anchor này để khỏi highlight dở.
      document.querySelectorAll(`.vocab-note-highlight[data-anchor-id="${cssEscape(w.id)}"]`).forEach(el => {
        if (el.parentNode) el.parentNode.replaceChild(document.createTextNode(el.textContent), el);
      });
      return false;
    }
  }

  function anchorPass() {
    if (!document.body) return;
    if (settings.enabled === false || isHostBlacklisted()) return;
    const items = getPageAnchorItems();
    if (!items.length) return;
    for (const w of items) {
      if (document.querySelector(`.vocab-note-highlight[data-anchor-id="${cssEscape(w.id)}"]`)) continue; // đã neo
      if ((anchorAttempts.get(w.id) || 0) >= ANCHOR_MAX_ATTEMPTS) continue;
      const index = buildTextIndex(document.body); // dựng lại: lần bọc trước đã đổi DOM
      if (tryAnchor(w, index)) anchorAttempts.delete(w.id);
      else anchorAttempts.set(w.id, (anchorAttempts.get(w.id) || 0) + 1);
    }
  }

  // ============ STICKY NOTE: ghi chú tự do dán theo URL ============
  // Khác NEO ĐOẠN (tô lại chữ CÓ SẴN trên trang), sticky note là mảnh giấy ghi chú
  // do người dùng tự viết — KHÔNG cần bôi đen chữ nào — hiện lại mỗi khi mở đúng
  // trang (so khớp pageUrlKey). Dùng chung storage words[]/type/màu/tooltip-icon.
  // Item sticky: { sticky:true, term:<nội dung>, url, pageTitle, type, stickyPos,
  //   stickyCollapsed, disabled(=ẩn trên trang nhưng vẫn giữ) }.
  const STICKY_DEFAULT_TYPE = "important";
  let stickyLayer = null;
  let stickyBusyId = null;      // id thẻ đang sửa / kéo → hoãn rebuild để khỏi mất thao tác
  let stickyDraftOpen = false;  // đang mở thẻ tạo mới (chưa lưu)
  let stickyLastUrl = pageUrlKey();

  function getPageStickyItems() {
    const here = pageUrlKey();
    return words.filter(w => w && w.sticky && w.url && pageUrlKey(w.url) === here && !w.disabled);
  }

  function ensureStickyLayer() {
    if (stickyLayer && stickyLayer.isConnected) return stickyLayer;
    stickyLayer = document.createElement("div");
    stickyLayer.className = "vocab-note-sticky-layer";
    document.body.appendChild(stickyLayer);
    return stickyLayer;
  }

  // Vị trí mặc định: xếp so le ở góc phải-TRÊN (góc dưới phải là chỗ của toast —
  // trước đây toast "Đã ghim" che mất chính thẻ vừa tạo).
  function stickyDefaultPos(i) {
    const w = 260, gap = 26;
    let left = window.innerWidth - w - 24 - (i * gap);
    let top = 72 + (i * gap);
    if (left < 12) left = 12 + ((i * gap) % 160);
    if (top > window.innerHeight - 160) top = 12 + ((i * gap) % 160);
    return { left, top };
  }

  // Giữ note luôn còn 1 phần trong khung nhìn (tránh kéo mất hút ra ngoài).
  function clampStickyPos(pos) {
    const margin = 8, minVis = 80;
    let left = Number(pos && pos.left);
    let top = Number(pos && pos.top);
    if (!isFinite(left)) left = window.innerWidth - 280;
    if (!isFinite(top)) top = window.innerHeight - 170;
    left = Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - minVis));
    top = Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - 40));
    return { left, top };
  }

  // Tạo 1 thẻ sticky. w có thể là item đã lưu, hoặc bản nháp { __draft:true, type, term:"" }.
  function makeStickyEl(w) {
    const isDraft = !!w.__draft;
    const key = () => (isDraft ? "__draft" : w.id);
    let selType = VN_TYPES[w.type] ? w.type : STICKY_DEFAULT_TYPE;
    const collapsed = !isDraft && !!w.stickyCollapsed;

    const card = document.createElement("div");
    card.className = "vocab-note-sticky"
      + (collapsed ? " collapsed" : "")
      + (isDraft ? " editing" : "");
    card.setAttribute("data-vn-type", selType);
    if (!isDraft) card.dataset.stickyId = w.id;

    const typeChips = Object.keys(VN_TYPES).map(t =>
      `<button class="vns-type${t === selType ? " active" : ""}" data-type="${t}" title="${escapeHtml(VN_TYPES[t].label)}">${VN_TYPE_ICON[t] || VN_TYPES[t].icon}</button>`
    ).join("");

    card.innerHTML = `
      <div class="vns-head">
        <img class="vns-brand" src="${BRAND_ICON}" alt="" draggable="false" />
        <span class="vns-title">Ghi chú trang</span>
        <button class="vns-btn vns-collapse" title="Thu gọn thành ghim nhỏ" aria-label="Thu gọn">${VN_ICON.minimize}</button>
        <button class="vns-btn vns-edit" title="Sửa" aria-label="Sửa">${VN_ICON.edit}</button>
        <button class="vns-btn vns-del" title="Xoá ghi chú (có thể hoàn tác)" aria-label="Xoá">${VN_ICON.del}</button>
      </div>
      <div class="vns-view"><div class="vns-text"></div></div>
      <div class="vns-editwrap">
        <div class="vns-hint">${VN_ICON.pin} Ghi chú dán riêng cho trang này — mở lại trang sẽ tự hiện. Kéo tiêu đề để di chuyển.</div>
        <div class="vns-types"><span class="vns-types-label">Loại</span>${typeChips}</div>
        <textarea class="vns-input" rows="3" placeholder="Viết ghi chú cho trang này…"></textarea>
        <div class="vns-editact">
          <button class="vns-btn2 vns-cancel">Huỷ</button>
          <button class="vns-btn2 vns-primary vns-save">${VN_ICON.save} Lưu</button>
        </div>
      </div>
      <div class="vns-pin" title="Mở ghi chú">${VN_TYPE_ICON[selType] || VN_TYPES[selType].icon}</div>
    `;

    const head = card.querySelector(".vns-head");
    const textEl = card.querySelector(".vns-text");
    const input = card.querySelector(".vns-input");
    const pinEl = card.querySelector(".vns-pin");

    function refreshView() {
      const body = (w.term || "").trim();
      textEl.textContent = body || "(ghi chú trống)";
      textEl.classList.toggle("vns-empty", !body);
      pinEl.innerHTML = VN_TYPE_ICON[selType] || (VN_TYPES[selType] ? VN_TYPES[selType].icon : "📌");
    }
    refreshView();
    input.value = w.term || "";

    // Chọn loại (đổi màu accent theo type)
    card.querySelectorAll(".vns-type").forEach(b => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        selType = b.dataset.type;
        card.setAttribute("data-vn-type", selType);
        pinEl.innerHTML = VN_TYPE_ICON[selType] || VN_TYPES[selType].icon;
        card.querySelectorAll(".vns-type").forEach(x => x.classList.toggle("active", x === b));
      });
    });

    function enterEdit() {
      card.classList.add("editing");
      stickyBusyId = key();
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
    }
    function exitEdit() {
      card.classList.remove("editing");
      if (stickyBusyId === key()) stickyBusyId = null;
    }
    function removeCard() {
      if (stickyBusyId === key()) stickyBusyId = null;
      if (isDraft) stickyDraftOpen = false;
      card.remove();
    }
    function readPos() {
      return { left: parseFloat(card.style.left) || 0, top: parseFloat(card.style.top) || 0 };
    }

    function doSave() {
      const body = input.value.trim();
      if (!body) { // trống: nháp → bỏ; đã lưu → coi như xoá
        if (isDraft) { removeCard(); return; }
        deleteWord(w.id); removeCard(); return;
      }
      if (isDraft) {
        const rec = {
          id: "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          sticky: true,
          term: body,
          lang: detectLang(body),
          type: selType,
          url: pageUrlKey(),
          pageTitle: (document.title || "").slice(0, 200),
          meaning: "",
          note: "",
          stickyPos: readPos(),
          createdAt: new Date().toISOString()
        };
        stickyDraftOpen = false;
        stickyBusyId = null;
        card.remove();
        chrome.storage.local.get("words", (data) => {
          const arr = data.words || [];
          arr.push(rec);
          chrome.storage.local.set({ words: arr }); // onChanged → renderStickyNotes vẽ lại
        });
        showToast("Đã ghim ghi chú lên trang này");
      } else {
        w.term = body; w.type = selType;
        updateWordById(w.id, (r) => { r.term = body; r.type = selType; return r; });
        refreshView();
        exitEdit();
      }
    }

    head.querySelector(".vns-edit").addEventListener("click", (e) => { e.stopPropagation(); enterEdit(); });
    head.querySelector(".vns-del").addEventListener("click", (e) => {
      e.stopPropagation();
      if (isDraft) { removeCard(); return; }
      deleteWord(w.id); // dùng chung: có toast Hoàn tác
      removeCard();
    });
    head.querySelector(".vns-collapse").addEventListener("click", (e) => {
      e.stopPropagation();
      if (isDraft) { removeCard(); return; } // nháp: nút này = đóng
      const nowCol = !card.classList.contains("collapsed");
      card.classList.toggle("collapsed", nowCol);
      updateWordById(w.id, (r) => { r.stickyCollapsed = nowCol; return r; });
    });
    pinEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isDraft) return;
      card.classList.remove("collapsed");
      updateWordById(w.id, (r) => { r.stickyCollapsed = false; return r; });
    });
    card.querySelector(".vns-save").addEventListener("click", (e) => { e.stopPropagation(); doSave(); });
    card.querySelector(".vns-cancel").addEventListener("click", (e) => {
      e.stopPropagation();
      if (isDraft) { removeCard(); return; }
      input.value = w.term || "";
      selType = VN_TYPES[w.type] ? w.type : STICKY_DEFAULT_TYPE;
      card.setAttribute("data-vn-type", selType);
      card.querySelectorAll(".vns-type").forEach(x => x.classList.toggle("active", x.dataset.type === selType));
      exitEdit();
    });

    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return; // đang gõ IME (fcitx5/unikey)
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSave(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); card.querySelector(".vns-cancel").click(); }
    });

    // Kéo-thả bằng phần đầu thẻ. Dùng pointer capture → sự kiện vẫn về head kể cả
    // khi con trỏ ra ngoài, KHÔNG cần listener trên document (tránh rò rỉ khi rebuild).
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".vns-btn")) return; // bấm nút thì không kéo
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      const p = readPos(); ox = p.left; oy = p.top;
      stickyBusyId = key();
      try { head.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    head.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const pos = clampStickyPos({ left: ox + dx, top: oy + dy });
      card.style.left = pos.left + "px";
      card.style.top = pos.top + "px";
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      try { head.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!card.classList.contains("editing")) { if (stickyBusyId === key()) stickyBusyId = null; }
      if (moved && !isDraft) {
        const pos = readPos();
        w.stickyPos = pos;
        updateWordById(w.id, (r) => { r.stickyPos = pos; return r; });
      }
    };
    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);

    return card;
  }

  function renderStickyNotes() {
    if (superseded) return;
    if (!document.body) return;
    // Tôn trọng bật/tắt + blacklist: tắt → gỡ toàn bộ lớp note.
    if (settings.enabled === false || isHostBlacklisted()) {
      if (stickyLayer) { stickyLayer.remove(); stickyLayer = null; }
      return;
    }
    // Đang sửa / kéo / mở thẻ nháp → hoãn rebuild để không mất thao tác đang dở.
    if (stickyBusyId || stickyDraftOpen) return;
    const items = getPageStickyItems();
    if (!items.length) {
      if (stickyLayer) { stickyLayer.remove(); stickyLayer = null; }
      return;
    }
    const layer = ensureStickyLayer();
    layer.innerHTML = ""; // các listener gắn trên chính thẻ → tự mất khi thẻ bị gỡ
    items.forEach((w, i) => {
      const el = makeStickyEl(w);
      const pos = w.stickyPos ? clampStickyPos(w.stickyPos) : stickyDefaultPos(i);
      el.style.left = pos.left + "px";
      el.style.top = pos.top + "px";
      layer.appendChild(el);
    });
  }

  // Mở thẻ tạo ghi chú mới (không cần bôi đen chữ). Gọi từ context menu / popup.
  function openStickyComposer() {
    if (settings.enabled === false) { showToast("Highlight Note đang tắt", { warn: true }); return; }
    if (isHostBlacklisted()) { showToast("Trang này đang bị tắt tô sáng", { warn: true }); return; }
    if (stickyDraftOpen) { // đã có 1 thẻ nháp → focus vào nó
      const ex = document.querySelector(".vocab-note-sticky.editing .vns-input");
      if (ex) ex.focus();
      return;
    }
    stickyDraftOpen = true;
    stickyBusyId = "__draft";
    const layer = ensureStickyLayer();
    const el = makeStickyEl({ __draft: true, type: STICKY_DEFAULT_TYPE, term: "" });
    const pos = stickyDefaultPos(0);
    el.style.left = pos.left + "px";
    el.style.top = pos.top + "px";
    layer.appendChild(el);
    const input = el.querySelector(".vns-input");
    if (input) input.focus();
  }

  // Đổi URL (SPA điều hướng không tải lại trang) → vẽ lại note theo trang mới.
  function checkStickyUrlChange() {
    const k = pageUrlKey();
    if (k !== stickyLastUrl) {
      stickyLastUrl = k;
      renderStickyNotes();
    }
  }
  window.addEventListener("popstate", checkStickyUrlChange);
  window.addEventListener("hashchange", checkStickyUrlChange);

  // ---------- Tooltip + hover counter ----------
  let tooltipEl = null;
  let activeSpan = null;
  let hoverTimer = null;
  let hideTimer = null;
  let showTimer = null; // delay trước khi hiện tooltip để tránh lướt chuột bật nhầm
  let countedThisHover = false;
  let pinned = false; // tooltip đã được ghim bằng click → không tự ẩn
  let tooltipEditing = false; // user đang gõ trong khu sửa → không rebuild tooltip
  const SHOW_DELAY_MS = 120; // dừng chuột trên từ ≥ 120ms là hiện (lướt qua nhanh thì không bật nhầm)

  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "vocab-note-tooltip";
    tooltipEl.style.display = "none";
    tooltipEl.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    tooltipEl.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function showTooltip(span) {
    if (superseded) { hideTooltip(); return; }
    if (!span || !span.isConnected) { hideTooltip(); return; }
    const term = span.dataset.term;
    const w = wordMap.get(term);
    if (!w) return;
    const tip = ensureTooltip();
    // Chỉ animation lúc MỚI hiện; các lần dựng lại sau đó (phiên âm về, đổi số lần gặp…) không nhấp nháy.
    if (tip.style.display === "none") {
      tip.classList.add("vn-enter");
      clearTimeout(tip._enterT);
      tip._enterT = setTimeout(() => tip.classList.remove("vn-enter"), 140);
    }
    const threshold = w.autoDeleteAt || 20;
    const seen = w.hoverCount || 0;
    const pctBar = Math.min(100, Math.round((seen / threshold) * 100));
    const lang = effLang(w);
    const type = vnTypeOf(w);
    const isVocab = type === "vocab";
    // Từ điển theo ngôn ngữ: JA→Jisho, EN→Cambridge, ZH→Hanzii, KO→Naver, còn lại→Wiktionary.
    const dict = dictLink(w.term, lang);
    const dictUrl = dict.url, dictTitle = "Tra " + dict.title;
    const trUrl = `https://translate.google.com/?sl=auto&tl=${mainTargetLang(settings)}&text=${encodeURIComponent(w.term)}`;
    // Phát âm / tra từ điển chỉ có ý nghĩa với từ vựng; Google Dịch hữu ích với
    // mọi mục chữ nước ngoài. Mục chữ Việt (việc cần làm, ghi chú…) → header gọn.
    const foreign = !sameLang(lang, nativeLang(settings));
    const headBtns =
      (isVocab ? `<button class="vn-icon-btn vn-speak" title="Phát âm" aria-label="Phát âm">${VN_ICON.speak}</button>` : "") +
      (isVocab ? `<a class="vn-icon-btn" href="${dictUrl}" target="_blank" rel="noopener" title="${dictTitle}" aria-label="${dictTitle}">${VN_ICON.book}</a>` : "") +
      (foreign ? `<a class="vn-icon-btn" href="${trUrl}" target="_blank" rel="noopener" title="Mở Google Dịch" aria-label="Mở Google Dịch">${VN_ICON.globe}</a>` : "");
    const doneShort = isVocab ? "Đã thuộc" : type === "todo" ? "Xong" : "Đã xử lý";
    tip.innerHTML = `
      <div class="vn-card" data-vn-type="${type}">
        <div class="vn-head">
          <img class="vn-brand" src="${BRAND_ICON}" alt="" draggable="false" />
          <span class="vn-term-text" title="${escapeHtml(w.term)}">${escapeHtml(w.term)}</span>
          ${foreign ? `<span class="vn-lang">${escapeHtml(lang.toUpperCase())}</span>` : ""}
          ${headBtns}
          <button class="vn-icon-btn vn-close" title="Đóng (Esc)" aria-label="Đóng">${VN_ICON.close}</button>
        </div>
        <div class="vn-body">
          ${isVocab ? "" : `<div class="vn-type-row"><span class="vn-type-chip" data-vn-type="${type}">${VN_TYPE_ICON[type] || VN_TYPES[type].icon} ${escapeHtml(VN_TYPES[type].label)}</span></div>`}
          ${w.phonetic ? `<div class="vn-phonetic">${escapeHtml(w.phonetic)}</div>` : ""}
          ${w.meaning ? `<div class="vn-meaning">${escapeHtml(w.meaning)}</div>` : `<button class="vn-meaning vn-meaning-empty">＋ Thêm nghĩa / ghi chú</button>`}
          ${w.note ? `<div class="vn-note">${escapeHtml(w.note)}</div>` : ""}
          ${(w.tags && w.tags.length) ? `<div class="vn-tags">${w.tags.map(t => `<span class="vn-tag">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}
        </div>
        ${isVocab && learningOn ? `
        <div class="vn-meta" title="Đã gặp ${seen} lần — gặp đủ ${threshold} lần sẽ tự đánh dấu đã thuộc">
          <div class="vn-progress"><div style="width:${pctBar}%"></div></div>
          <span class="vn-seen">${seen}/${threshold}</span>
        </div>` : ""}
        <div class="vn-actions">
          <button class="vn-action vn-edit" title="Sửa nghĩa, ghi chú, tag">${VN_ICON.edit}<span>Sửa</span></button>
          <button class="vn-action vn-mute" title="${w.disabled ? "Bật lại tô sáng" : "Tạm ẩn tô sáng (vẫn giữ trong danh sách)"}">${w.disabled ? VN_ICON.bellOff : VN_ICON.bell}<span>${w.disabled ? "Hiện lại" : "Tạm ẩn"}</span></button>
          ${!isVocab || learningOn ? `<button class="vn-action vn-learn" title="Đánh dấu ${vnDoneLabel(w)} (giữ mục, ngừng tô sáng)">${VN_ICON.learn}<span>${doneShort}</span></button>` : ""}
          <button class="vn-action vn-danger vn-delete" title="Xoá hẳn (có thể hoàn tác)">${VN_ICON.del}<span>Xoá</span></button>
        </div>
        <div class="vn-edit-area" style="display:none">
          <textarea class="vn-edit-meaning" rows="2" placeholder="Nghĩa / mô tả">${escapeHtml(w.meaning || "")}</textarea>
          <input type="text" class="vn-edit-note" placeholder="Ghi chú (tuỳ chọn)" value="${escapeHtml(w.note || "")}" />
          <input type="text" class="vn-edit-tags" placeholder="Tag, cách nhau bởi dấu phẩy" value="${escapeHtml(vnTagsToStr(w.tags))}" />
          <div class="vn-edit-actions">
            <span class="vn-kbd-hint">Enter lưu · Esc huỷ</span>
            <button class="vn-action vn-edit-cancel">Huỷ</button>
            <button class="vn-action vn-edit-save">${VN_ICON.save} Lưu</button>
          </div>
        </div>
        <div class="vn-hint">Bấm vào chữ để giữ thẻ này · Esc để đóng</div>
      </div>
    `;
    tip.classList.toggle("pinned", pinned);

    // Backfill phiên âm cho từ EN cũ chưa có — atomic, không ghi đè
    if (isVocab && lang === "en" && !w.phonetic && !w._phoneticFetching) {
      w._phoneticFetching = true;
      fetchPhonetic(w.term, "en").then(p => {
        delete w._phoneticFetching;
        if (!p) return;
        w.phonetic = p; // local cache để tooltip hiện ngay
        updateWordById(w.id, (rec) => {
          if (rec.phonetic) return null; // đã có rồi (tab khác đã ghi)
          rec.phonetic = p;
          return rec;
        });
        updateVisibleTooltip(term);
      });
    }

    const stop = (e) => e.stopPropagation();
    const speakBtn = tip.querySelector(".vn-speak");
    if (speakBtn) speakBtn.addEventListener("click", (e) => { stop(e); speak(w.term, lang); });
    tip.querySelector(".vn-close").addEventListener("click", (e) => { stop(e); unpinAndHide(); });
    tip.querySelector(".vn-delete").addEventListener("click", (e) => {
      stop(e);
      deleteWord(w.id);
      unpinAndHide();
    });
    tip.querySelector(".vn-mute").addEventListener("click", (e) => {
      stop(e);
      const newDisabled = !w.disabled;
      updateWordById(w.id, (rec) => { rec.disabled = newDisabled; return rec; });
      unpinAndHide();
      showToast(newDisabled ? `Đã tạm ẩn "${w.term}" — bật lại trong danh sách` : `Đã bật lại "${w.term}"`);
    });
    const learnBtn = tip.querySelector(".vn-learn");
    if (learnBtn) learnBtn.addEventListener("click", (e) => {
      stop(e);
      const id = w.id;
      updateWordById(id, (rec) => { rec.learned = true; rec.learnedAt = new Date().toISOString(); return rec; });
      unpinAndHide();
      showToast(`"${w.term}" — ${vnDoneLabel(w)}`, {
        actions: [{ label: "Hoàn tác", onClick: () => updateWordById(id, (rec) => { rec.learned = false; delete rec.learnedAt; return rec; }) }]
      });
    });

    // Nút Sửa: mở inline editor cho nghĩa + ghi chú + tag
    const editArea = tip.querySelector(".vn-edit-area");
    const actionsBar = tip.querySelector(".vn-actions");
    const meaningInput = tip.querySelector(".vn-edit-meaning");
    const noteInput = tip.querySelector(".vn-edit-note");
    const tagsInput = tip.querySelector(".vn-edit-tags");
    const growMeaning = () => {
      meaningInput.style.height = "auto";
      meaningInput.style.height = Math.min(meaningInput.scrollHeight + 2, 160) + "px";
    };
    meaningInput.addEventListener("input", growMeaning);
    const exitEditMode = () => {
      tooltipEditing = false;
      // Bỏ focus khỏi ô đã ẩn — nếu không, Esc tiếp theo vẫn rơi vào ô đó và không đóng được thẻ.
      if (tip.contains(document.activeElement)) document.activeElement.blur();
      editArea.style.display = "none";
      actionsBar.style.display = "flex";
    };
    const enterEditMode = (e) => {
      stop(e);
      pinned = true;
      tooltipEditing = true;
      tip.classList.add("pinned");
      actionsBar.style.display = "none";
      editArea.style.display = "block";
      growMeaning();
      meaningInput.focus();
      meaningInput.select();
      placeTooltip(tip, span); // chiều cao đổi → đặt lại để không tràn màn hình
    };
    tip.querySelector(".vn-edit").addEventListener("click", enterEditMode);
    const emptyMeaning = tip.querySelector(".vn-meaning-empty");
    if (emptyMeaning) emptyMeaning.addEventListener("click", enterEditMode);
    tip.querySelector(".vn-edit-cancel").addEventListener("click", (e) => {
      stop(e);
      exitEditMode();
    });
    const doSaveEdit = () => {
      const newMeaning = meaningInput.value.trim();
      const newNote = noteInput.value.trim();
      const newTags = vnParseTags(tagsInput.value);
      w.meaning = newMeaning;
      w.note = newNote;
      if (newTags.length) w.tags = newTags; else delete w.tags;
      updateWordById(w.id, (rec) => {
        rec.meaning = newMeaning; rec.note = newNote;
        if (newTags.length) rec.tags = newTags; else delete rec.tags;
        return rec;
      });
      exitEditMode();
      showTooltip(activeSpan || span);
      showToast(`Đã cập nhật "${w.term}"`);
    };
    tip.querySelector(".vn-edit-save").addEventListener("click", (e) => { stop(e); doSaveEdit(); });
    [meaningInput, noteInput, tagsInput].forEach(inp => {
      inp.addEventListener("click", stop);
      inp.addEventListener("keydown", (ev) => {
        if (ev.isComposing || ev.keyCode === 229) return;
        // Enter lưu; Shift+Enter xuống dòng trong ô nghĩa.
        if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); doSaveEdit(); }
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          exitEditMode();
        }
      });
    });

    placeTooltip(tip, span);
  }

  // Đặt tooltip sát chữ: ưu tiên bên dưới, tràn thì lật lên trên, luôn trong khung nhìn.
  function placeTooltip(tip, span) {
    const rect = span.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { hideTooltip(); return; }
    tip.style.display = "block";
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + tipRect.width > window.innerWidth - 10) left = window.innerWidth - tipRect.width - 10;
    if (top + tipRect.height > window.innerHeight - 10) top = rect.top - tipRect.height - 4;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }

  function unpinAndHide() {
    pinned = false;
    hideTooltip();
    activeSpan = null;
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = "none";
  }
  function selBarOrCardOpen() {
    return !!((selBtn && selBtn.style.display !== "none") || document.querySelector(".vocab-note-mini-card"));
  }
  // Thanh nổi / thẻ vừa hiện: dọn tooltip đang mở (trừ khi người dùng đã ghim hoặc đang gõ trong đó).
  function dismissTooltipForUi() {
    clearTimeout(showTimer);
    if (pinned || tooltipEditing) return;
    clearTimeout(hideTimer);
    hideTooltip();
    activeSpan = null;
  }
  function updateVisibleTooltip(term) {
    if (!tooltipEl || tooltipEl.style.display === "none") return;
    if (tooltipEditing) return; // đang gõ trong khu sửa → không rebuild để khỏi mất text
    if (!activeSpan || !activeSpan.isConnected || activeSpan.dataset.term !== term) return;
    showTooltip(activeSpan);
  }
  function scheduleHide() {
    if (pinned) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (pinned) return;
      hideTooltip();
      activeSpan = null;
      clearTimeout(hoverTimer);
    }, 250);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Thanh nổi khi bôi đen: [nghĩa xem trước] [Dịch] [Lưu] [🔊] [⧉] ----------
  // Tách rõ 2 việc: DỊCH = chỉ xem bản dịch, không lưu gì · LƯU = lưu & tô sáng.
  // Trước đây chỉ có nút "✓ Lưu" (icon ✓ trông như "đã lưu rồi"); muốn đọc bản dịch
  // một đoạn dài cũng phải bấm Lưu → mở thẻ lưu kiểu "Từ vựng" → rất dễ nhầm.
  let selBtn = null;
  let selBtnCurrentText = "";
  let selBtnToken = 0;             // huỷ kết quả dịch cũ khi selection đổi
  const selTransCache = new Map(); // text -> bản dịch (tránh gọi lại API)

  const SEL_TRANSLATE_MAX = 40;    // xem trước nghĩa ngay trên thanh: chỉ từ/cụm ngắn
  const SAVE_MAX = 2000;           // lưu tối đa
  const SEL_MAX = 5000;            // dịch tối đa (cả đoạn dài, chia nhỏ khi gọi API)
  const TRANSLATE_MAX = SEL_MAX;

  // Bản dịch có "thật" không: rỗng hoặc trùng nguyên văn nguồn → coi như không
  // dịch được (viết tắt, tên riêng, từ Việt không dấu… Google trả về y nguyên).
  function isRealTranslation(src, tr) {
    if (!tr) return false;
    const norm = s => (s || "").trim().toLowerCase();
    return norm(tr) !== norm(src);
  }

  const HAS_LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ㐀-鿿가-힯]/;
  function isEmailOrUrl(t) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) || /^(https?:\/\/|www\.)\S+$/i.test(t);
  }
  // Có nên TỰ dịch sang tiếng Việt không (xem trước / điền sẵn nghĩa khi lưu).
  function looksTranslatable(text, maxLen = SEL_TRANSLATE_MAX) {
    const t = (text || "").trim();
    if (!t || t.length > maxLen || isEmailOrUrl(t) || isSureNative(t, settings)) return false;
    return HAS_LETTER.test(t);
  }
  // Nút "Dịch" có ý nghĩa không — kể cả chữ Việt (khi đó dịch sang tiếng Anh).
  function canTranslate(text) {
    const t = (text || "").trim();
    return !!t && t.length <= SEL_MAX && !isEmailOrUrl(t) && HAS_LETTER.test(t);
  }
  // Đích dịch: chữ của mình (ngôn ngữ của bạn) → nativeTargetLang; chữ nước ngoài → targetLang.
  function targetLangFor(text) { return isNativeText(text, settings) ? nativeTargetLang(settings) : mainTargetLang(settings); }
  // Chữ đã ở đúng ngôn ngữ đích (vd chữ Anh mà đích là Anh) → dịch sang ngôn ngữ phụ.
  function fallbackTarget(tl) { return sameLang(tl, nativeLang(settings)) ? nativeTargetLang(settings) : nativeLang(settings); }
  function saveSettingPatch(patch) {
    try {
      chrome.storage.local.get("settings", ({ settings: s }) => {
        chrome.storage.local.set({ settings: { ...(s || {}), ...patch } });
      });
    } catch (e) {}
  }
  function isLongText(text) { return keyOf(text).length > HIGHLIGHT_MAX; }

  // Gợi ý loại mục theo nội dung (người dùng luôn bấm chip đổi lại được):
  //   - URL                         → Tư liệu
  //   - đoạn dài (> 60 ký tự / > 6 từ) → Quan trọng (là ý cần nhớ, không phải từ để học)
  //   - từ/cụm ngắn tiếng nước ngoài → Từ vựng
  //   - từ/cụm ngắn tiếng Việt      → Quan trọng
  function guessType(text) {
    const t = keyOf(text);
    if (!t) return "vocab";
    if (/^(https?:\/\/|www\.)\S+/i.test(t)) return "reference";
    if (t.length > HIGHLIGHT_MAX || t.split(" ").length > 6) return "important";
    return isNativeText(t, settings) ? "important" : "vocab";
  }

  // Thanh nổi: [Dịch | nghĩa ›] [Lưu] (+ Nghe, Sao chép, ⋯ khi rê chuột).
  // Nghĩa nằm NGAY TRONG nút Dịch: chưa có nghĩa → "Dịch"; có nghĩa (xem trước / đã lưu) → "may mắn ›",
  // bấm để mở thẻ chi tiết. Trước đây nghĩa và nút "Dịch" đứng cạnh nhau → nút Dịch thừa, gây hiểu
  // là "chưa dịch". Dùng chung 1 nút (không ẩn nút đi) vì nghĩa về sau ~0.2s: ẩn nút lúc đó là nút
  // biến mất dưới con trỏ. Không có logo: thanh cần gọn nhất; nhận diện nằm ở thẻ / tooltip / menu ⋯.
  function trTitle(text, hasMeaning, saved) {
    if (saved) return T("Nghĩa đã lưu — bấm để xem chi tiết") + " (Alt+Shift+D)";
    if (hasMeaning) return T("Xem chi tiết: phiên âm, nghe, từ điển, đổi ngôn ngữ") + " (Alt+Shift+D)";
    return (isNativeText(text, settings)
      ? T("Dịch sang {0}", langName(targetLangFor(text), uiLang()).replace(/^Tiếng /, "tiếng "))
      : T("Xem bản dịch — không lưu")) + " (Alt+Shift+D)";
  }
  function buildSelBtn(text) {
    const existing = findWordByText(text);
    const savedMeaning = existing && existing.meaning ? existing.meaning : "";
    // Phát âm chỉ với từ/cụm ngắn (đọc cả đoạn dài vừa vô nghĩa vừa lâu).
    const speakBtn = (settings.showSelSpeak !== false && text.length <= 60)
      ? `<button class="vn-sel-ico vn-sel-speak" title="Phát âm" aria-label="Phát âm">${VN_ICON.speak}</button>` : "";
    const copyBtn = (settings.showSelCopy !== false)
      ? `<button class="vn-sel-ico vn-sel-copy" title="Sao chép" aria-label="Sao chép">${VN_ICON.copy}</button>` : "";
    const trBtn = canTranslate(text)
      ? `<button class="vn-sel-act vn-sel-tr" title="${escapeHtml(trTitle(text, !!savedMeaning, !!savedMeaning))}">${VN_ICON.translate}<span class="vn-sel-tr-label">Dịch</span><span class="vn-sel-trans">${escapeHtml(savedMeaning)}</span><span class="vn-sel-chev" aria-hidden="true">›</span></button>`
      : "";
    let saveBtn = "";
    if (existing) {
      saveBtn = `<button class="vn-sel-act vn-sel-saved" disabled title="Đã có trong Highlight Note">${VN_ICON.save}<span>Đã lưu</span></button>`;
    } else if (text.length <= SAVE_MAX) {
      saveBtn = `<button class="vn-sel-act vn-sel-save" title="Lưu & tô sáng mỗi khi gặp lại (Alt+Shift+H)">${VN_ICON.highlighter}<span>Lưu</span></button>`;
    }
    selBtn.className = "vocab-note-sel-btn" + (existing ? " vn-sel-exists" : "");
    const moreBtn = `<button class="vn-sel-ico vn-sel-more" title="Tuỳ chỉnh thanh này" aria-label="Tuỳ chỉnh thanh này" aria-haspopup="menu">${VN_ICON.more}</button>`;
    selBtn.innerHTML = `${trBtn}${saveBtn}${speakBtn}${copyBtn}${moreBtn}`;
  }

  // Phát âm đoạn đang chọn (theo ngôn ngữ nhận diện được).
  function doSpeakSelection() {
    const text = selBtnCurrentText;
    if (text) speak(text, detectedLangOf(text) || detectLang(text));
  }

  function copyText(text, done) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        return;
      }
    } catch (_) {}
    fallbackCopy(text, done);
  }
  function doCopySelection() {
    copyText(selBtnCurrentText, flashCopied);
  }

  // Phản hồi tức thì ngay trên nút: đổi icon copy thành ✓ "Đã chép", rồi ẩn thanh.
  function flashCopied() {
    if (selBtn) {
      const copyBtn = selBtn.querySelector(".vn-sel-copy");
      if (copyBtn) {
        copyBtn.classList.add("vn-sel-copied");
        copyBtn.innerHTML = `${VN_ICON.save}<span>Đã chép</span>`;
      }
    }
    showToast("Đã sao chép"); // tôn trọng cài đặt tắt toast của user
    setTimeout(hideSelBtn, 850);
  }

  function fallbackCopy(text, cb) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      cb && cb();
    } catch (_) {}
  }

  // Chụp chữ + vị trí + ngữ cảnh neo của selection hiện tại (trước khi nó bị xoá).
  function grabSelection(expected) {
    const sel = window.getSelection();
    let rect = null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }
    const text = (expected || (sel ? sel.toString() : "")).trim();
    return { sel, text, rect, anchorCtx: currentSelectionAnchor(text) };
  }

  function doSaveSelection() {
    const g = grabSelection(selBtnCurrentText);
    const existing = findWordByText(g.text);
    hideSelBtn();
    g.sel && g.sel.removeAllRanges();
    if (existing) {
      showToast(`"${existing.term}" đã có trong danh sách rồi.`, { warn: true });
      return;
    }
    if (g.text && g.text.length <= SAVE_MAX) openAddMiniCard(g.text, g.rect, selTransCache.get(g.text) || "", g.anchorCtx);
  }

  // Thẻ dịch không mở được (lỗi bất ngờ, trang chặn…) → đẩy sang Google Dịch, không để người dùng bấm mà im lặng.
  function fallbackToGoogle(text) {
    const url = googleTranslateUrl(text, targetLangFor(text));
    if (settings.showToasts === false) { window.open(url, "_blank", "noopener"); return; }
    showToast("Chưa mở được thẻ dịch", { warn: true, duration: 7000,
      actions: [{ label: "Mở Google Dịch", onClick: () => window.open(url, "_blank", "noopener") }] });
  }

  function doTranslateSelection() {
    const g = grabSelection(selBtnCurrentText);
    hideSelBtn();
    if (!g.text) return;
    try {
      openTranslateCard(g.text, g.rect, g.anchorCtx);
    } catch (e) {
      fallbackToGoogle(g.text);
      return;
    }
    setTimeout(() => { if (!document.querySelector(".vn-tr-card")) fallbackToGoogle(g.text); }, 400);
  }

  // Nút nào của thanh đang được bấm (từ phần tử con bất kỳ, kể cả icon bên trong nút).
  function barActionOf(target) {
    if (!target || !target.closest) return null;
    if (target.closest(".vn-sel-speak")) return "speak";
    if (target.closest(".vn-sel-copy")) return "copy";
    if (target.closest(".vn-sel-save")) return "save";
    if (target.closest(".vn-sel-tr")) return "translate";
    if (target.closest(".vn-sel-more")) return "more";
    return null;
  }
  function runBarAction(a) {
    if (a !== "more") barIgnored = 0; // có dùng thanh → không gợi ý tắt
    if (a === "more") { toggleSelMenu(); return; }
    if (a === "speak") doSpeakSelection();
    else if (a === "copy") doCopySelection();
    else if (a === "save") doSaveSelection();
    else if (a === "translate") doTranslateSelection();
  }
  // Hành động chạy khi NHẢ chuột, theo nút đã NHẤN xuống. Nhờ vậy bấm vẫn ăn khi thanh bị dịch
  // chỗ giữa lúc nhấn và nhả (bản dịch xem trước về làm đổi bề rộng) hoặc khi trình duyệt không
  // phát sự kiện "click" (nhấn và nhả rơi vào 2 phần tử khác nhau).
  let barDown = null, barHandledAt = 0;
  document.addEventListener("mousedown", (e) => {
    if (!(e.target && e.target.closest && e.target.closest(".vocab-note-sel-btn"))) barDown = null;
  }, true);

  function ensureSelBtn() {
    if (selBtn) return selBtn;
    selBtn = document.createElement("div");
    selBtn.className = "vocab-note-sel-btn";
    selBtn.style.display = "none";
    // Giữ selection khi bấm bất kỳ nút nào trong thanh
    selBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      barDown = barActionOf(e.target);
    });
    selBtn.addEventListener("mouseup", (e) => {
      e.stopPropagation();
      const a = barDown;
      barDown = null;
      if (!a) return;
      e.preventDefault();
      barHandledAt = Date.now();
      runBarAction(a);
    });
    // "click" chỉ còn là dự phòng (kích hoạt bằng bàn phím…); bỏ qua nếu nhả chuột vừa xử lý xong.
    selBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (Date.now() - barHandledAt < 600) return;
      runBarAction(barActionOf(e.target));
    });
    document.body.appendChild(selBtn);
    return selBtn;
  }

  // Đổi nội dung thanh (bản dịch xem trước về) mà GIỮ NGUYÊN chỗ nút Dịch/Lưu: chỉ phần nghĩa
  // bên trái co giãn, nút không trôi dưới con trỏ.
  function reflowKeepingActions(change) {
    // Giữ nguyên chỗ nút LƯU: nút Dịch giãn sang TRÁI để chứa nghĩa → chỗ chữ "Dịch" cũ vẫn
    // thuộc nút Dịch, nút Lưu không xê dịch → con trỏ đang nhắm nút nào vẫn trúng nút đó.
    const btn = selBtn;
    const anchor = btn && (btn.querySelector(".vn-sel-save, .vn-sel-saved") || btn.querySelector(".vn-sel-tr"));
    const x0 = anchor ? anchor.getBoundingClientRect().left : null;
    change();
    if (x0 == null || !btn) return;
    const dx = anchor.getBoundingClientRect().left - x0;
    if (dx) btn.style.left = Math.max(8, (parseFloat(btn.style.left) || 0) - dx) + "px";
  }

  // Thanh nổi KHÔNG được che chữ người đọc sắp đọc tới, nên ưu tiên đặt PHÍA TRÊN
  // vùng chọn (chỉ che dòng đã đọc), căn theo đầu vùng chọn:
  //   - chọn 1 dòng  → trên dòng đó, căn theo mép trái vùng chọn
  //   - chọn nhiều dòng → trên DÒNG ĐẦU, ở mép trái dòng đầu
  // Sát mép trên màn hình (không còn chỗ) mới lật xuống dưới dòng cuối.
  function positionSelBtn(rect) {
    const btn = selBtn;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Nút phát âm/sao chép chỉ bung ra khi rê chuột vào thanh → chừa sẵn chỗ để không tràn mép phải.
    const hidden = btn.matches(":hover") ? 0 : btn.querySelectorAll(".vn-sel-ico").length * 34;
    const bw = (btn.offsetWidth || 160) + hidden;
    const bh = btn.offsetHeight || 30;
    const gap = 5;
    const a = selBtnAnchor || { aboveX: rect.left, aboveTop: rect.top, belowX: rect.left, belowBottom: rect.bottom };
    let left = a.aboveX;
    let top = a.aboveTop - bh - gap;
    if (top < 8) { left = a.belowX; top = a.belowBottom + gap; }   // không còn chỗ trên → xuống dưới
    if (top + bh > vh - 8) top = Math.max(8, vh - bh - 8);
    if (left + bw > vw - 8) left = vw - bw - 8;
    if (left < 8) left = 8;
    btn.style.left = left + "px";
    btn.style.top = top + "px";
  }

  let selBtnAnchor = null;
  // Điểm neo của thanh: gồm chỗ đặt "phía trên" và chỗ đặt "phía dưới" (khi hết chỗ trên).
  function computeSelAnchor(rect) {
    selBtnAnchor = { aboveX: rect.left, aboveTop: rect.top, belowX: rect.left, belowBottom: rect.bottom };
    try {
      const rects = Array.from(window.getSelection().getRangeAt(0).getClientRects()).filter(r => r.width > 0 && r.height > 0);
      if (rects.length < 2) return;
      const first = rects[0];
      const last = rects.reduce((m, r) => (r.bottom > m.bottom + 1 || (Math.abs(r.bottom - m.bottom) <= 1 && r.right > m.right)) ? r : m, rects[0]);
      if (last.bottom - first.bottom > first.height * 0.6) {   // thật sự nhiều dòng
        selBtnAnchor = { aboveX: first.left, aboveTop: first.top, belowX: last.right, belowBottom: last.bottom };
      }
    } catch (e) {}
  }

  // Cuộn / đổi cỡ cửa sổ: thanh dùng position:fixed nên phải tự bám theo vùng chọn,
  // và ẩn đi khi vùng chọn đã trôi khỏi màn hình (trước đây thanh đứng yên giữa trang).
  let selBtnRaf = 0;
  function refreshSelBtnPosition() {
    selBtnRaf = 0;
    if (!selBtn || selBtn.style.display === "none") return;
    try {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideSelBtn(); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) { hideSelBtn(); return; }
      computeSelAnchor(rect);
      positionSelBtn(rect);
    } catch (e) {}
  }
  function scheduleSelBtnRefresh() { if (!selBtnRaf) selBtnRaf = requestAnimationFrame(refreshSelBtnPosition); }
  window.addEventListener("scroll", scheduleSelBtnRefresh, { passive: true, capture: true });
  window.addEventListener("resize", scheduleSelBtnRefresh, { passive: true });

  function showSelBtn(rect, text) {
    if (superseded) return;
    const btn = ensureSelBtn();
    dismissTooltipForUi();
    computeSelAnchor(rect);
    selBtnCurrentText = text;
    buildSelBtn(text);
    btn.style.display = "flex";
    positionSelBtn(rect);
    noteBarShown();

    // Xem trước nghĩa (chỉ từ/cụm ngắn chưa lưu, còn mạng, người dùng cho phép)
    const transEl = btn.querySelector(".vn-sel-trans");
    if (!transEl || findWordByText(text)) return;
    if (settings.previewTranslate === false) return;
    const cached = selTransCache.get(text);
    const trB = btn.querySelector(".vn-sel-tr");
    const showMeaning = (tr) => reflowKeepingActions(() => {
      transEl.textContent = tr;
      if (trB) trB.title = trTitle(text, !!tr, false);
    });
    if (cached) { showMeaning(cached); return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    // Đang chờ: nút vẫn là "Dịch" (không chèn "…" làm thanh nhảy 2 lần).
    const myToken = ++selBtnToken;
    autoTranslate(text, detectLang(text)).then(tr => {
      // Bỏ qua nếu user đã chọn từ khác trong lúc chờ
      if (myToken !== selBtnToken || selBtnCurrentText !== text) return;
      if (isRealTranslation(text, tr)) { selTransCache.set(text, tr); showMeaning(tr); }
    });
  }

  function hideSelBtn() {
    if (selBtn) selBtn.style.display = "none";
    selBtnCurrentText = "";
    hideSelMenu();
  }

  // ---------- Menu ⋯ của thanh nổi: chỉnh NGAY tại chỗ, khỏi phải đi tìm trong Cài đặt ----------
  let selMenu = null;
  function hideSelMenu() { if (selMenu) { selMenu.remove(); selMenu = null; } }
  // Tắt thanh nổi (mọi trang) — có Hoàn tác và đường tới Cài đặt.
  function turnOffSelBar() {
    hideSelBtn();
    settings.showSelButton = false;
    saveSettingPatch({ showSelButton: false });
    showToast(T("Đã tắt thanh Dịch / Lưu. Vẫn dùng được Alt+Shift+D, Alt+Shift+H và chuột phải."), {
      actions: [
        { label: T("Hoàn tác"), onClick: () => { settings.showSelButton = true; saveSettingPatch({ showSelButton: true }); } },
        { label: T("Cài đặt"), onClick: () => openExtPage("options", "selection#showSelButton") }
      ], duration: 8000
    });
  }
  function turnOffHere() {
    hideSelBtn();
    const host = location.hostname.replace(/^www\./, "");
    const list = (settings.blacklistedHosts || []).slice();
    if (!host || list.includes(host)) return;
    saveSettingPatch({ blacklistedHosts: [...list, host] });
    showToast(T("Đã tắt Highlight Note trên \"{0}\"", host), {
      actions: [{ label: T("Hoàn tác"), onClick: () => saveSettingPatch({ blacklistedHosts: list }) }], duration: 8000
    });
  }
  function toggleSelMenu() {
    if (selMenu) { hideSelMenu(); return; }
    if (!selBtn) return;
    selMenu = document.createElement("div");
    selMenu.className = "vocab-note-sel-menu";
    selMenu.setAttribute("role", "menu");
    const item = (act, label) => `<button role="menuitem" data-act="${act}">${escapeHtml(label)}</button>`;
    selMenu.innerHTML =
      `<div class="vn-sel-menu-head"><img src="${BRAND_ICON}" alt="" draggable="false">Highlight Note</div>` +
      item("off-here", T("Tắt Highlight Note trên trang này")) +
      item("off-bar", T("Tắt thanh này (mọi trang)")) +
      `<div class="vn-sel-menu-sep"></div>` +
      item("set-lang", T("Đổi ngôn ngữ dịch…")) +
      item("set-bar", T("Tuỳ chỉnh thanh (nút, xem trước nghĩa)…"));
    selMenu.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    selMenu.addEventListener("mouseup", (e) => e.stopPropagation());
    selMenu.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      hideSelMenu();
      if (a === "off-here") turnOffHere();
      else if (a === "off-bar") turnOffSelBar();
      else if (a === "set-lang") { hideSelBtn(); openExtPage("options", "language"); }
      else if (a === "set-bar") { hideSelBtn(); openExtPage("options", "selection"); }
    });
    document.body.appendChild(selMenu);
    const r = selBtn.getBoundingClientRect();
    const mw = selMenu.offsetWidth, mh = selMenu.offsetHeight;
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 6) top = Math.max(6, r.top - mh - 6);
    selMenu.style.top = top + "px";
    selMenu.style.left = Math.max(6, Math.min(r.right - mw, window.innerWidth - mw - 6)) + "px";
  }

  // Gợi ý thông minh: thanh hiện nhiều lần mà người dùng không bấm gì → có thể thanh đang
  // vướng (vd người hay bôi đen để chép). Hỏi MỘT lần duy nhất, không tự tắt.
  const BAR_IGNORE_HINT = 15;
  let barIgnored = 0;
  function noteBarShown() {
    if (settings.tipBarAsked || settings.showToasts === false) return;
    if (++barIgnored < BAR_IGNORE_HINT) return;
    settings.tipBarAsked = true;
    saveSettingPatch({ tipBarAsked: true });
    showToast(T("Thanh Dịch / Lưu có làm phiền bạn không? Bạn có thể tắt nó ở đây hoặc chỉ trên trang này."), {
      actions: [
        { label: T("Tắt trên trang này"), onClick: turnOffHere },
        { label: T("Tắt thanh"), onClick: turnOffSelBar }
      ], duration: 12000
    });
  }

  // ---------- Thẻ DỊCH (chỉ xem, không lưu) ----------
  // Từ ngắn: chữ to + phiên âm + phát âm + từ điển. Đoạn dài: nguyên văn thu gọn,
  // bản dịch dễ đọc, cuộn được. Có nút Chép bản dịch / Google Dịch / Lưu (nếu muốn).
  const dictLinkFor = dictLink;
  function googleTranslateUrl(text, tl) {
    return `https://translate.google.com/?sl=auto&tl=${tl}&text=${encodeURIComponent(String(text).slice(0, 4000))}`;
  }

  function openTranslateCard(text, anchorRect, anchorCtx) {
    document.querySelectorAll(".vocab-note-mini-card").forEach(el => el.remove());
    dismissTooltipForUi();
    let tl = targetLangFor(text);
    // fromNative chỉ là ĐOÁN ban đầu; Google Dịch nhận diện ngôn ngữ thật rồi sửa lại (xem runTranslate).
    let fromNative = isNativeText(text, settings);
    const native = nativeLang(settings);
    const isWord = text.length <= SEL_TRANSLATE_MAX && text.split(/\s+/).length <= 4;
    let srcLang = detectedLangOf(text) || detectLang(text);
    const existing = findWordByText(text);
    const card = document.createElement("div");
    card.className = "vocab-note-mini-card vn-tr-card" + (isWord ? "" : " vn-long");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Bản dịch");
    const dict = dictLinkFor(text, srcLang);
    card.innerHTML = `
      <div class="vn-mini-head">
        <img class="vn-mini-brand" src="${BRAND_ICON}" alt="" draggable="false" />
        <span class="vn-tr-title">Dịch</span>
        <span class="vn-tr-langs"><span class="vn-tr-sl">${escapeHtml(srcLang.toUpperCase())}</span> → <select class="vn-tr-tl" title="Chọn ngôn ngữ muốn dịch sang" aria-label="Dịch sang ngôn ngữ"></select></span>
        <span class="vn-tr-space"></span>
        <button class="vn-mini-ibtn vn-mini-gear" title="Cài đặt ngôn ngữ dịch" aria-label="Cài đặt ngôn ngữ dịch">${VN_ICON.gear}</button>
        <button class="vn-mini-ibtn vn-mini-x" title="Đóng (Esc)" aria-label="Đóng">${VN_ICON.close}</button>
      </div>
      <div class="vn-tr-body">
        ${isWord
          ? `<div class="vn-tr-word"><b>${escapeHtml(text)}</b>
               <button class="vn-mini-ibtn vn-tr-speak" title="Phát âm" aria-label="Phát âm">${VN_ICON.speak}</button></div>
             <div class="vn-mini-phonetic" style="display:none"></div>`
          : `<div class="vn-tr-src" title="Bấm để xem đầy đủ">${escapeHtml(text)}</div>`}
        <div class="vn-tr-out vn-tr-loading">Đang dịch…</div>
      </div>
      <div class="vn-tr-foot">
        <button class="vn-tr-btn vn-tr-copy" title="Sao chép bản dịch" disabled>${VN_ICON.copy}<span>Sao chép</span></button>
        <button class="vn-tr-btn vn-tr-listen" title="Nghe bản dịch" disabled${sameLang(tl, native) ? " hidden" : ""}>${VN_ICON.speak}<span>Nghe</span></button>
        <a class="vn-tr-btn" href="https://translate.google.com/?sl=auto&tl=${tl}&text=${encodeURIComponent(text.slice(0, 4000))}" target="_blank" rel="noopener" title="Mở trong Google Dịch">${VN_ICON.globe}<span>Google</span></a>
        ${isWord ? `<a class="vn-tr-btn vn-tr-dict" href="${dict.url}" target="_blank" rel="noopener" title="Tra ${dict.title}"${fromNative ? " hidden" : ""}>${VN_ICON.book}</a>` : ""}
        <span class="vn-tr-space"></span>
        ${existing
          ? `<span class="vn-tr-saved">${VN_ICON.save} Đã lưu</span>`
          : (text.length <= SAVE_MAX ? `<button class="vn-mini-btn vn-mini-primary vn-tr-save" title="Lưu & tô sáng mỗi khi gặp lại">${VN_ICON.highlighter} Lưu</button>` : "")}
      </div>`;
    document.body.appendChild(card);

    const out = card.querySelector(".vn-tr-out");
    const copyBtn = card.querySelector(".vn-tr-copy");
    let translation = "";

    const src = card.querySelector(".vn-tr-src");
    if (src) src.addEventListener("click", () => { src.classList.toggle("open"); positionMiniCard(card, anchorRect); });
    const sp = card.querySelector(".vn-tr-speak");
    if (sp) sp.onclick = () => speak(text, srcLang);
    const tlSel = card.querySelector(".vn-tr-tl");
    if (tlSel) tlSel.onchange = () => {
      // Mỗi hướng nhớ riêng: chữ của mình → nativeTargetLang; chữ nước ngoài → targetLang.
      const key = fromNative ? "nativeTargetLang" : "targetLang";
      settings[key] = tlSel.value;
      saveSettingPatch({ [key]: tlSel.value });
      selTransCache.clear(); // nghĩa xem trước đã nhớ là của ngôn ngữ đích cũ
      closeCard();
      openTranslateCard(text, anchorRect, anchorCtx); // dịch lại sang ngôn ngữ vừa chọn
    };
    card.querySelector(".vn-mini-gear").onclick = () => { closeCard(); openExtPage("options", "language"); };
    const listenBtn = card.querySelector(".vn-tr-listen");
    if (listenBtn) listenBtn.onclick = () => { if (translation) speak(translation, tl); };

    copyBtn.onclick = () => {
      if (!translation) return;
      copyText(translation, () => {
        copyBtn.querySelector("span").textContent = "Đã chép ✓";
        setTimeout(() => { if (copyBtn.isConnected) copyBtn.querySelector("span").textContent = "Sao chép"; }, 1500);
      });
    };
    const saveBtn = card.querySelector(".vn-tr-save");
    if (saveBtn) saveBtn.onclick = () => {
      closeCard();
      // Từ ngắn: bản dịch thành nghĩa. Đoạn dài: người dùng vừa đọc bản dịch → giữ làm ghi chú.
      openAddMiniCard(text, anchorRect, translation, anchorCtx);
    };

    function closeCard() {
      card.remove();
      document.removeEventListener("mousedown", onOutside, true);
    }
    function onOutside(ev) {
      if (!card.isConnected) { document.removeEventListener("mousedown", onOutside, true); return; }
      if (!card.contains(ev.target)) closeCard();
    }
    setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    card.querySelector(".vn-mini-x").onclick = closeCard;
    card.tabIndex = -1;
    card.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); closeCard(); }
    });

    positionMiniCard(card, anchorRect);
    try { card.focus({ preventScroll: true }); } catch (e) {}

    if (isWord && srcLang === "en") fetchPhonetic(text, "en").then(p => {
      if (!p || !card.isConnected) return;
      const el = card.querySelector(".vn-mini-phonetic");
      el.textContent = p;
      el.style.display = "block";
      positionMiniCard(card, anchorRect);
    });

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      out.classList.remove("vn-tr-loading");
      out.textContent = "Không có mạng — chưa dịch được.";
      return;
    }
    // Ô chọn ngôn ngữ đích (chữ Việt thì bỏ "Việt" khỏi danh sách).
    function fillLangSelect() {
      if (!tlSel) return;
      tlSel.innerHTML = TARGET_LANGS.filter(t => !(fromNative && sameLang(t.code, native)))
        .map(t => `<option value="${t.code}"${t.code === tl ? " selected" : ""}>${escapeHtml(langName(t.code, uiLang(), true))}</option>`).join("");
    }
    fillLangSelect();
    function syncCardToTarget() {
      fillLangSelect();
      if (listenBtn) listenBtn.hidden = sameLang(tl, native);
      const gl = card.querySelector('a[href*="translate.google.com"]');
      if (gl) gl.href = googleTranslateUrl(text, tl);
      const dictEl = card.querySelector(".vn-tr-dict");
      if (dictEl) {
        const d = dictLinkFor(text, srcLang);
        dictEl.hidden = fromNative;
        dictEl.href = d.url;
        dictEl.title = T("Tra {0}", d.title);
      }
    }

    // Đoán ngôn ngữ ở máy có thể SAI (chữ Pháp/Bồ có â ê ô giống chữ Việt, chữ Latin nào cũng bị
    // gán "en"…). Nên: gửi Google Dịch (sl=auto), đọc ngôn ngữ Google nhận ra, rồi tự sửa hướng
    // dịch và dịch lại nếu cần. Tối đa 2 lần sửa để không lặp.
    let fixes = 0;
    function runTranslate() {
      translateFull(text, tl).then(tr => {
        if (!card.isConnected) return;
        const dl = detectedLangOf(text);
        if (dl) srcLang = dl;
        if (dl && fixes < 2) {
          let next = null;
          if (sameLang(dl, native) && !fromNative) { fromNative = true; next = nativeTargetLang(settings); }        // thật ra là chữ của mình
          else if (!sameLang(dl, native) && fromNative) { fromNative = false; next = mainTargetLang(settings); }  // không phải (vd Pháp)
          else if (sameLang(dl, tl)) { next = fromNative ? nativeTargetLang(settings) : fallbackTarget(tl); }    // đã đúng ngôn ngữ đích
          if (next) {
            fixes++;
            const changed = next !== tl;
            tl = next;
            syncCardToTarget();
            if (changed) {
              out.classList.add("vn-tr-loading");
              out.classList.remove("vn-tr-empty");
              out.textContent = "Đang dịch…";
              runTranslate();
              return;
            }
          }
        }
        syncCardToTarget();
        out.classList.remove("vn-tr-loading");
        if (dl) card.querySelector(".vn-tr-sl").textContent = dl.toUpperCase();
        if (isRealTranslation(text, tr)) {
          translation = tr;
          out.textContent = tr;
          out.setAttribute("data-hn-raw", ""); // bản dịch: không đưa qua bảng dịch giao diện
          copyBtn.disabled = false;
          if (listenBtn) listenBtn.disabled = false;
          if (isWord && sameLang(tl, mainTargetLang(settings))) selTransCache.set(text, tr);
        } else if (tr) {
          out.textContent = "Không có bản dịch khác — có thể là tên riêng, hoặc chữ đã đúng ngôn ngữ đích.";
          out.classList.add("vn-tr-empty");
        } else {
          // Không dịch được ở đây → đẩy sang Google Dịch xử lý.
          out.textContent = "";
          out.append("Chưa dịch được ở đây. ");
          const a = document.createElement("a");
          a.href = googleTranslateUrl(text, tl);
          a.target = "_blank"; a.rel = "noopener";
          a.className = "vn-tr-golink";
          a.textContent = "Mở Google Dịch →";
          out.appendChild(a);
          out.classList.add("vn-tr-empty");
        }
        positionMiniCard(card, anchorRect);
      });
    }
    runTranslate();
  }

  // Đang bôi đen trong ô nhập / vùng soạn thảo (Gmail, Notion, Docs…) → người dùng
  // đang VIẾT, không phải đọc: đừng chen thanh "Lưu" vào. Vẫn lưu được bằng
  // Alt+Shift+H hoặc chuột phải.
  function selectionInEditable(sel) {
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return true;
    const n = sel && sel.anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return !!(el && el.isContentEditable);
  }

  // Hiện thanh cho vùng đang chọn (gọi sau khi nhả chuột HOẶC sau khi chọn bằng bàn phím).
  function trySelBar(target) {
    if (superseded) return;
    if (settings.enabled === false || isHostBlacklisted()) { hideSelBtn(); return; }
    // Người dùng có thể tắt thanh nổi "Lưu" khi bôi đen (vẫn lưu được bằng
    // Alt+Shift+H hoặc chuột phải → "Tô sáng & lưu").
    if (settings.showSelButton === false) { hideSelBtn(); return; }
    if (target && target.closest && target.closest(
      ".vocab-note-sel-btn, .vocab-note-sel-menu, .vocab-note-mini-card, .vocab-note-tooltip, .vocab-note-modal-overlay"
    )) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hideSelBtn(); return; }
      if (selectionInEditable(sel)) { hideSelBtn(); return; }
      const text = sel.toString().trim();
      // Bỏ qua nếu chỉ chọn 1 ký tự hoặc quá dài
      if (!text || text.length < 2 || text.length > SEL_MAX) { hideSelBtn(); return; }
      // Người dùng chọn không hiện thanh khi bôi chữ tiếng Việt (vẫn lưu được bằng phím tắt / chuột phải).
      if (hideSelNative(settings) && isNativeText(text, settings)) { hideSelBtn(); return; }
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { hideSelBtn(); return; }
        showSelBtn(rect, text);
      } catch (_) { hideSelBtn(); }
    }, 10);
  }
  document.addEventListener("mouseup", (e) => trySelBar(e.target));

  // Chọn bằng bàn phím (Shift + mũi tên / Home / End / PageUp / PageDown) cũng hiện thanh;
  // Esc tắt thanh. Trước đây chỉ có chuột mới gọi được thanh.
  document.addEventListener("keyup", (e) => {
    if (superseded) return;
    if (e.key === "Escape") { hideSelBtn(); return; }
    if (e.shiftKey && /^(Arrow|Home$|End$|Page)/.test(e.key)) trySelBar(e.target);
  });

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) hideSelBtn();
  });

  document.addEventListener("mouseover", (e) => {
    const span = e.target.closest && e.target.closest(".vocab-note-highlight");
    if (!span) return;
    // Đang có thanh Dịch/Lưu hoặc thẻ mở → KHÔNG bật tooltip: khung tooltip sẽ đè lên đúng chỗ các nút
    // và bắt mất cú bấm (con trỏ lướt qua từ đã tô trên đường tới thanh là bật ngay).
    if (selBarOrCardOpen()) { clearTimeout(showTimer); return; }
    clearTimeout(hideTimer);
    if (activeSpan === span) return;
    if (tooltipEditing) return; // đang gõ trong tooltip — không chuyển từ khác

    // Nếu tooltip đang hiển thị (hoặc đã ghim) thì chuyển nhanh giữa các từ
    const tooltipVisible = tooltipEl && tooltipEl.style.display !== "none";
    const armCounter = () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (activeSpan === span && !countedThisHover) {
          countedThisHover = true;
          incrementHover(span.dataset.term);
        }
      }, 500);
    };
    const doShow = () => {
      activeSpan = span;
      countedThisHover = false;
      showTooltip(span);
      armCounter();
    };

    clearTimeout(showTimer);
    if (tooltipVisible || pinned) {
      doShow();
    } else {
      // Yêu cầu cursor dừng trên từ tối thiểu SHOW_DELAY_MS mới hiện tooltip
      showTimer = setTimeout(doShow, SHOW_DELAY_MS);
    }
  });

  document.addEventListener("mouseout", (e) => {
    const span = e.target.closest && e.target.closest(".vocab-note-highlight");
    if (!span) return;
    // Hủy show pending nếu cursor rời từ trước khi tooltip kịp hiện
    clearTimeout(showTimer);
    // 1) relatedTarget check
    if (e.relatedTarget) {
      if (span.contains(e.relatedTarget)) return;
      if (tooltipEl && tooltipEl.contains(e.relatedTarget)) return;
    }
    // 2) Fallback: cursor vẫn trong bbox tooltip (kể cả padding bridge) → đừng ẩn
    if (tooltipEl && tooltipEl.style.display !== "none") {
      const r = tooltipEl.getBoundingClientRect();
      if (e.clientX >= r.left - 2 && e.clientX <= r.right + 2 &&
          e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2) return;
    }
    scheduleHide();
  });

  // Thêm watcher mousemove: nếu cursor di chuyển VÀO vùng tooltip bbox, giữ tooltip
  document.addEventListener("mousemove", (e) => {
    if (!tooltipEl || tooltipEl.style.display === "none" || pinned) return;
    const r = tooltipEl.getBoundingClientRect();
    const inside = e.clientX >= r.left - 2 && e.clientX <= r.right + 2 &&
                   e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2;
    if (inside) clearTimeout(hideTimer);
  }, { passive: true });

  // Click vào từ được highlight → GHIM tooltip (không tự ẩn nữa)
  document.addEventListener("click", (e) => {
    const span = e.target.closest && e.target.closest(".vocab-note-highlight");
    if (span) {
      // Nếu từ highlight nằm trong link (thẻ <a href>) → ưu tiên mở link,
      // không ghim tooltip. Người dùng vẫn xem nghĩa được bằng cách hover.
      const link = e.target.closest && e.target.closest("a[href]");
      if (link) {
        if (pinned) unpinAndHide();
        return; // để click đi tiếp tới link → trình duyệt mở link
      }
      // Click vào từ: ghim tooltip
      e.preventDefault();
      e.stopPropagation();
      pinned = true;
      clearTimeout(hideTimer);
      activeSpan = span;
      showTooltip(span);
      return;
    }
    // Click ra ngoài tooltip → unpin
    if (pinned && tooltipEl && !tooltipEl.contains(e.target)) {
      unpinAndHide();
    }
  }, true);

  // A11y: focus bằng bàn phím (Tab) vào từ highlight → hiện tooltip như khi hover.
  document.addEventListener("focusin", (e) => {
    const span = e.target.closest && e.target.closest(".vocab-note-highlight");
    if (!span) return;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    activeSpan = span;
    countedThisHover = false;
    showTooltip(span);
  });
  document.addEventListener("focusout", (e) => {
    const span = e.target.closest && e.target.closest(".vocab-note-highlight");
    if (!span || pinned) return;
    scheduleHide();
  });

  document.addEventListener("keydown", (e) => {
    // ESC để đóng tooltip đã ghim
    if (e.key === "Escape" && pinned) {
      unpinAndHide();
      return;
    }
    // Enter/Space trên từ đang focus → ghim tooltip (tương đương click)
    if (e.key === "Enter" || e.key === " ") {
      const span = e.target.closest && e.target.closest(".vocab-note-highlight");
      if (span) {
        e.preventDefault();
        pinned = true;
        clearTimeout(hideTimer);
        activeSpan = span;
        showTooltip(span);
      }
    }
  });

  // Scroll: reposition tooltip ghim để bám theo từ
  window.addEventListener("scroll", () => {
    if (pinned && activeSpan && activeSpan.isConnected && tooltipEl && tooltipEl.style.display !== "none") {
      placeTooltip(tooltipEl, activeSpan);
    }
  }, { passive: true });

  function incrementHover(term) {
    if (superseded) return; // tránh 2 instance cùng đếm 1 lần hover
    const w = wordMap.get(term);
    if (!w) return;
    const cooldown = settings.hoverCooldownMs || 300000;
    const now = Date.now();
    // Cooldown: kiểm tra trên w.lastCountedAt (persistent — không bị reset khi reload)
    if (now - (w.lastCountedAt || 0) < cooldown) return;
    // Atomic: đọc lại storage để tránh race với tab khác
    let justMastered = false;
    updateWordById(w.id, (rec) => {
      if (now - (rec.lastCountedAt || 0) < cooldown) return null; // tab khác vừa đếm rồi
      rec.hoverCount = (rec.hoverCount || 0) + 1;
      rec.lastCountedAt = now;
      // Gặp đủ ngưỡng → tự đánh dấu "đã thuộc" (giữ từ, ngừng tô sáng).
      // KHÔNG xoá dữ liệu — chỉ chuyển sang trạng thái learned cho an toàn.
      // Chỉ áp dụng cho từ vựng: việc cần làm / tư liệu không nên tự "xong" vì hover.
      if (!rec.learned && vnTypeOf(rec) === "vocab" && settings.learningMode === true
          && rec.hoverCount >= (rec.autoDeleteAt || 20)) {
        rec.learned = true;
        rec.learnedAt = new Date().toISOString();
        justMastered = true;
      }
      // Cập nhật cache local để UI phản hồi ngay
      w.hoverCount = rec.hoverCount;
      w.lastCountedAt = rec.lastCountedAt;
      if (justMastered) { w.learned = true; w.learnedAt = rec.learnedAt; }
      return rec;
    }).then(ok => {
      if (!ok) return;
      if (justMastered) {
        unpinAndHide();
        showToast(`Đã gặp đủ ${w.autoDeleteAt || 20} lần — đánh dấu "${w.term}" là đã thuộc`);
      } else {
        updateVisibleTooltip(term);
      }
    });
  }

  function deleteWord(id) {
    chrome.storage.local.get("words", (data) => {
      const arr = data.words || [];
      const idx = arr.findIndex(x => x.id === id);
      if (idx === -1) return;
      const removed = arr.splice(idx, 1)[0];
      chrome.storage.local.set({ words: arr }, () => {
        // storage onChanged sẽ tự rescan, nhưng gỡ span ngay để đỡ phải chờ.
        // Dùng vòng lặp (không phải attribute-selector) vì đoạn dài có thể chứa
        // xuống dòng / dấu " làm hỏng selector. Khớp theo term HOẶC anchorId.
        const termLc = keyOf(removed.term);
        document.querySelectorAll(".vocab-note-highlight").forEach(el => {
          if (el.dataset.term !== termLc && el.dataset.anchorId !== removed.id) return;
          if (el.parentNode) {
            const txt = document.createTextNode(el.textContent);
            el.parentNode.replaceChild(txt, el);
          }
        });
        // Toast với nút Hoàn tác (giữ 6s)
        showToast(`Đã xoá "${removed.term}"`, {
          duration: 6000,
          undo: true,
          actions: [{
            label: "↶ Hoàn tác",
            onClick: () => {
              chrome.storage.local.get("words", (d) => {
                const a = d.words || [];
                if (a.some(x => x.id === removed.id)) return;
                a.push(removed);
                chrome.storage.local.set({ words: a });
              });
            }
          }]
        });
      });
    });
  }

  function cssEscape(s) {
    return s.replace(/["\\]/g, "\\$&");
  }

  // ---------- Toasts ----------
  // Container cố định để toast XẾP CHỒNG (không đè lên nhau như trước khi mỗi toast
  // tự fixed cùng một góc). Toast mới rơi xuống sát góc, toast cũ đẩy lên trên.
  let toastStack = null;
  function ensureToastStack() {
    if (toastStack && toastStack.isConnected) return toastStack;
    toastStack = document.createElement("div");
    toastStack.className = "vocab-note-toast-stack";
    document.body.appendChild(toastStack);
    return toastStack;
  }

  // Vừa lưu xong → các chỗ từ đó trên trang sáng lên một nhịp (xác nhận trực quan, chỉ ý nghĩa
  // với từ ngắn được tô). Phải chờ rescan dựng lại highlight nên thử vài lần.
  function flashHighlights(term) {
    const key = keyOf(term);
    let tries = 0;
    const iv = setInterval(() => {
      let hit = false;
      document.querySelectorAll(".vocab-note-highlight").forEach(s => {
        if (keyOf(s.dataset.term || "") !== key) return;
        hit = true;
        s.classList.add("vn-flash");
        setTimeout(() => s.classList.remove("vn-flash"), 1000);
      });
      if (hit || ++tries > 8) clearInterval(iv);
    }, 120);
  }

  // Biểu tượng theo loại toast: ok (đã làm xong) / warn (cần chú ý) / undo (xoá, có Hoàn tác).
  const TOAST_ICON = {
    ok:   svgIco('<polyline points="20 6 9 17 4 12"/>', 13),
    warn: svgIco('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 13),
    undo: svgIco('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', 13)
  };

  function showToast(msg, opts = {}) {
    if (superseded) return; // instance đã bị thay thế thì không hiện toast trùng
    // Công tắc tắt toast là công tắc DUY NHẤT: tắt = ẩn TẤT CẢ toast (kể cả toast
    // có nút hành động như "Hoàn tác"). Bật = mọi toast hoạt động bình thường.
    if (settings.showToasts === false) return;
    if (HN_I18N) msg = HN_I18N.tr(msg);

    // ok = xanh lá, warn = vàng, undo = trung tính (thao tác xoá, đừng nhầm với "thành công").
    const kind = opts.warn ? "warn" : opts.undo ? "undo" : "ok";
    const t = document.createElement("div");
    t.className = "vocab-note-toast vn-" + kind;
    t.setAttribute("role", "status");

    const ico = document.createElement("span");
    ico.className = "vn-toast-ico";
    ico.innerHTML = TOAST_ICON[kind];
    t.appendChild(ico);

    // Phần nằm trong "…" (tên từ) in đậm để nổi lên giữa câu.
    const text = document.createElement("span");
    text.className = "vn-toast-text";
    String(msg).split(/("[^"]+")/).forEach(part => {
      if (part.length > 2 && part[0] === '"' && part[part.length - 1] === '"') {
        const b = document.createElement("b");
        b.textContent = part.slice(1, -1);
        text.appendChild(b);
      } else if (part) {
        text.appendChild(document.createTextNode(part));
      }
    });
    t.appendChild(text);

    const stack = ensureToastStack();
    while (stack.children.length >= 3) stack.firstChild.remove(); // tối đa 3 toast, khỏi chất đống

    let timer = null;
    const close = () => {
      clearTimeout(timer);
      if (!t.isConnected || t.classList.contains("vn-out")) return;
      t.classList.add("vn-out");
      setTimeout(() => t.remove(), 200);
    };
    if (opts.actions) {
      opts.actions.forEach(a => {
        const b = document.createElement("button");
        b.className = "vn-toast-act";
        b.textContent = a.label;
        b.onclick = () => { a.onClick(); close(); };
        t.appendChild(b);
      });
    }
    stack.appendChild(t);

    const dur = opts.duration ?? (opts.actions ? 6000 : 3200);
    if (dur > 0) {
      // Thanh thời gian chạy hết = toast tự đóng. Rê chuột vào thì tạm dừng.
      const bar = document.createElement("span");
      bar.className = "vn-toast-bar";
      t.appendChild(bar);
      const arm = (ms) => {
        clearTimeout(timer);
        bar.style.animation = "none"; void bar.offsetWidth; // chạy lại thanh từ đầu
        bar.style.animation = "";
        t.style.setProperty("--vn-dur", ms + "ms");
        timer = setTimeout(close, ms);
      };
      arm(dur);
      t.addEventListener("mouseenter", () => { clearTimeout(timer); bar.style.animationPlayState = "paused"; });
      t.addEventListener("mouseleave", () => { bar.style.animationPlayState = ""; arm(1800); });
    }
  }

  // ---------- Lấy phiên âm IPA (dictionaryapi.dev, miễn phí) ----------
  // Cache theo phiên làm việc + gộp request trùng + lùi thời gian khi bị 429.
  // dictionaryapi.dev trả 404 với rất nhiều từ (tên riêng, chia động từ…) → nhớ lại
  // để KHÔNG hỏi lại mỗi lần tô sáng; 429 (rate-limit) → tạm ngừng gọi 60s.
  const _phoneticCache = new Map();     // term(lc) -> phiên âm ("" = đã tra, không có)
  const _phoneticInflight = new Map();  // term(lc) -> Promise đang chạy
  let _phoneticBackoffUntil = 0;        // mốc thời gian được phép gọi lại sau khi 429
  async function fetchPhonetic(term, lang) {
    if (lang !== "en") return ""; // chỉ EN hỗ trợ; JA dùng kana sẵn có
    const key = (term || "").toLowerCase();
    if (!key) return "";
    if (_phoneticCache.has(key)) return _phoneticCache.get(key);
    if (_phoneticInflight.has(key)) return _phoneticInflight.get(key);
    if (Date.now() < _phoneticBackoffUntil) return ""; // đang bị rate-limit → thử lại sau
    const p = (async () => {
      try {
        const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`;
        const res = await fetch(url);
        if (res.status === 429) { _phoneticBackoffUntil = Date.now() + 60000; return ""; }
        if (!res.ok) { _phoneticCache.set(key, ""); return ""; } // 404: nhớ là không có
        const data = await res.json();
        let found = "";
        if (Array.isArray(data) && data[0]) {
          // Ưu tiên trường .phonetic; fallback duyệt mảng .phonetics
          if (data[0].phonetic) found = data[0].phonetic;
          else if (Array.isArray(data[0].phonetics)) {
            const ph = data[0].phonetics.find(x => x && x.text);
            if (ph) found = ph.text;
          }
        }
        _phoneticCache.set(key, found);
        return found;
      } catch (e) { return ""; } // lỗi mạng tạm thời → không cache, cho phép thử lại
    })();
    _phoneticInflight.set(key, p);
    try { return await p; } finally { _phoneticInflight.delete(key); }
  }

  // ---------- Auto-translate qua Google Translate (endpoint công khai) ----------
  // Cache theo phiên + gộp request trùng: mini-card, tooltip và preview khi bôi đen
  // dùng chung một bộ nhớ, tránh gọi lại Google Translate cho cùng một đoạn (đỡ bị
  // rate-limit khi bôi đen liên tục / mở lại cùng trang).
  const _translateCache = new Map();     // "tl|text" -> bản dịch
  const _translateInflight = new Map();  // "tl|text" -> Promise đang chạy
  const _detectedLang = new Map();       // text -> mã ngôn ngữ Google tự nhận (vd "es", "fr")
  // Ngôn ngữ nguồn Google đã tự nhận cho đoạn text (rỗng nếu chưa dịch lần nào).
  function detectedLangOf(text) { return _detectedLang.get((text || "").trim()) || ""; }
  // tl: ngôn ngữ đích (mặc định tiếng Việt). Chỉ dùng cho đoạn ≤ ~1500 ký tự (GET);
  // đoạn dài hơn dùng translateFull (chia nhỏ theo câu).
  async function autoTranslate(text, srcLang, tl = mainTargetLang(settings)) {
    const key = (text || "").trim();
    if (!key) return "";
    const ck = tl + "|" + key;
    if (_translateCache.has(ck)) return _translateCache.get(ck);
    if (_translateInflight.has(ck)) return _translateInflight.get(ck);
    const p = (async () => {
      try {
        // sl=auto: để Google tự nhận diện ngôn ngữ nguồn → dịch đúng cả từ Pháp/Đức/
        // Tây Ban Nha… (srcLang vẫn dùng cho phát âm/tra từ điển ở nơi khác.)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        if (!res.ok) return "";
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          if (typeof data[2] === "string" && data[2]) _detectedLang.set(key, data[2].toLowerCase());
          const out = data[0].map(seg => (seg && seg[0]) || "").join("").trim();
          if (out) _translateCache.set(ck, out); // chỉ cache khi dịch được
          return out;
        }
      } catch (e) {}
      return "";
    })();
    _translateInflight.set(ck, p);
    try { return await p; } finally { _translateInflight.delete(ck); }
  }

  // Dịch cả đoạn dài: chia theo câu thành các khúc ≤ 1400 ký tự, dịch song song, ghép lại.
  async function translateFull(text, tl = mainTargetLang(settings)) {
    const t = (text || "").trim();
    if (t.length <= 1500) return autoTranslate(t, null, tl);
    const pieces = t.match(/[^.!?。！？\n]+[.!?。！？]*\s*|\n+/g) || [t];
    const chunks = [];
    let cur = "";
    for (let p of pieces) {
      while (p.length > 1400) { // câu quá dài (hiếm) → cắt cứng
        if (cur) { chunks.push(cur); cur = ""; }
        chunks.push(p.slice(0, 1400));
        p = p.slice(1400);
      }
      if ((cur + p).length > 1400 && cur) { chunks.push(cur); cur = ""; }
      cur += p;
    }
    if (cur.trim()) chunks.push(cur);
    const outs = await Promise.all(chunks.map(c => autoTranslate(c, null, tl)));
    if (outs.some(o => !o)) return outs.every(o => !o) ? "" : outs.filter(Boolean).join(" ");
    // Nguồn nhận diện của khúc đầu = nguồn của cả đoạn
    const dl = detectedLangOf(chunks[0]);
    if (dl) _detectedLang.set(t, dl);
    return outs.join(" ").replace(/ *\n */g, "\n");
  }

  // Đặt mini-card sát selection hiện tại; nếu không có → góc dưới phải.
  // anchorRect (tuỳ chọn): vị trí đã chụp sẵn từ selection (dùng khi selection
  // đã bị xoá, vd sau khi bấm nút "Lưu" nổi).
  function positionMiniCard(card, anchorRect) {
    let rect = anchorRect || null;
    if (!rect) {
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const r = sel.getRangeAt(0).getBoundingClientRect();
          if (r && (r.width > 0 || r.height > 0)) rect = r;
        }
      } catch (e) {}
    }

    if (!rect) {
      // Fallback: giữ vị trí mặc định trong CSS (right:20px; bottom:20px)
      return;
    }

    // Đo kích thước thật của card
    card.style.right = "auto";
    card.style.bottom = "auto";
    card.style.visibility = "hidden";
    const cw = card.offsetWidth || 300;
    const ch = card.offsetHeight || 160;
    card.style.visibility = "";

    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Ưu tiên đặt dưới selection, lệch trái cho align với đầu từ
    let left = rect.left;
    let top = rect.bottom + pad;

    if (left + cw > vw - 10) left = vw - cw - 10;
    if (left < 10) left = 10;

    // Nếu tràn dưới → đặt trên selection
    if (top + ch > vh - 10) {
      top = rect.top - ch - pad;
      if (top < 10) top = Math.max(10, vh - ch - 10);
    }

    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  // ---------- Mini-card lưu nhanh (sát từ vừa chọn) ----------
  // Một ô nghĩa duy nhất, điền sẵn bản dịch, gõ sửa trực tiếp (không còn bước "Sửa"
  // → "Xem"). Enter = lưu, Shift+Enter = xuống dòng, Esc = đóng. Ghi chú + tag ẩn
  // sau 1 nút nhỏ để thẻ gọn cho thao tác phổ biến nhất: bôi đen → Enter.
  function openAddMiniCard(term, anchorRect, prefetchedMeaning, anchorCtx) {
    const existing = findWordByText(term);
    if (existing) {
      showToast(keyOf(existing.term) === keyOf(term)
        ? `"${existing.term}" đã có trong danh sách rồi.`
        : `"${term}" đã có trong danh sách (dạng gốc: "${existing.term}").`, { warn: true });
      return;
    }
    // Đóng mini-card cũ nếu có
    document.querySelectorAll(".vocab-note-mini-card").forEach(el => el.remove());
    dismissTooltipForUi();

    // Ưu tiên ngôn ngữ Google đã nhận (nếu preview lúc bôi đen đã dịch); nếu chưa,
    // tạm đoán cục bộ rồi sẽ cập nhật lại sau khi dịch xong bên dưới.
    let lang = detectedLangOf(term) || detectLang(term);
    // Đoạn dài = 1 ý cần nhớ (neo theo trang), KHÔNG phải từ để học: ô nhập là
    // "Ghi chú", không tự nhồi bản dịch; thẻ rộng hơn, nguyên văn bấm để xem đủ.
    const isLong = isLongText(term);
    const typeChips = Object.keys(VN_TYPES).map(t =>
      `<button class="vn-mini-type" data-type="${t}" title="${escapeHtml(VN_TYPES[t].label)}" aria-label="${escapeHtml(VN_TYPES[t].label)}">${VN_TYPE_ICON[t] || VN_TYPES[t].icon}</button>`
    ).join("");
    const card = document.createElement("div");
    card.className = "vocab-note-mini-card vn-save-card" + (isLong ? " vn-long" : "");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Lưu vào Highlight Note");
    card.innerHTML = `
      <div class="vn-mini-head">
        <img class="vn-mini-brand" src="${BRAND_ICON}" alt="" draggable="false" />
        <span class="vn-mini-term${isLong ? " vn-mini-passage" : ""}" title="${isLong ? "Bấm để xem đầy đủ" : escapeHtml(term)}">${escapeHtml(term)}</span>
        <span class="vn-mini-lang"></span>
        <button class="vn-mini-ibtn vn-mini-speak" title="Phát âm" aria-label="Phát âm">${VN_ICON.speak}</button>
        <button class="vn-mini-ibtn vn-mini-gear" title="Cài đặt Highlight Note" aria-label="Cài đặt">${VN_ICON.gear}</button>
        <button class="vn-mini-ibtn vn-mini-x" title="Đóng (Esc)" aria-label="Đóng">${VN_ICON.close}</button>
      </div>
      <div class="vn-mini-body">
        <div class="vn-mini-phonetic" style="display:none"></div>
        <label class="vn-mini-flabel"></label>
        <textarea class="vn-mini-meaning" rows="1" placeholder="Nghĩa / ghi chú nhanh…"></textarea>
        <div class="vn-mini-status"></div>
        <div class="vn-mini-links">
          <button class="vn-mini-more vn-mini-addtr" type="button" style="display:none">${VN_ICON.translate} Thêm bản dịch vào ghi chú</button>
          <button class="vn-mini-more vn-mini-more-btn" type="button">＋ Ghi chú thêm, tag</button>
        </div>
        <div class="vn-mini-extra" style="display:none">
          <input type="text" class="vn-mini-note-input" placeholder="Ghi chú (tuỳ chọn)" />
          <input type="text" class="vn-mini-tags-input" placeholder="Tag: dự-án-A, đọc-sau… (cách nhau bởi dấu phẩy)" />
        </div>
      </div>
      <div class="vn-mini-types"><span class="vn-mini-type-name"></span>${typeChips}</div>
      <div class="vn-mini-foot">
        <span class="vn-mini-kbd"><kbd>Enter</kbd> lưu · <kbd>Esc</kbd> đóng</span>
        <button class="vn-mini-btn vn-mini-primary vn-mini-save" title="Lưu & tô sáng mỗi khi gặp lại">${VN_ICON.highlighter} Lưu &amp; tô sáng</button>
      </div>
    `;
    document.body.appendChild(card);

    const meaningInput = card.querySelector(".vn-mini-meaning");
    const statusEl = card.querySelector(".vn-mini-status");
    const noteInput = card.querySelector(".vn-mini-note-input");
    const tagsInput = card.querySelector(".vn-mini-tags-input");
    const extraEl = card.querySelector(".vn-mini-extra");
    const moreBtn = card.querySelector(".vn-mini-more-btn");
    const addTrBtn = card.querySelector(".vn-mini-addtr");
    const flabel = card.querySelector(".vn-mini-flabel");
    const termEl = card.querySelector(".vn-mini-term");
    if (isLong) termEl.addEventListener("click", () => { termEl.classList.toggle("open"); positionMiniCard(card, anchorRect); });
    const saveBtn = card.querySelector(".vn-mini-save");
    const langEl = card.querySelector(".vn-mini-lang");
    const typeNameEl = card.querySelector(".vn-mini-type-name");
    const speakBtn = card.querySelector(".vn-mini-speak");

    const setLang = (l) => {
      lang = l;
      langEl.textContent = (l || "").toUpperCase();
      langEl.style.display = l && !sameLang(l, nativeLang(settings)) ? "" : "none";
      speakBtn.style.display = (sameLang(l, nativeLang(settings)) || isLong) ? "none" : "";
    };
    setLang(lang);
    speakBtn.onclick = () => speak(term, lang);
    card.querySelector(".vn-mini-gear").onclick = () => { closeCard(); openExtPage("options", "selection"); };

    const setStatus = (text, kind) => {
      statusEl.textContent = text || "";
      statusEl.className = "vn-mini-status" + (kind ? " " + kind : "");
    };
    const grow = () => {
      meaningInput.style.height = "auto";
      meaningInput.style.height = Math.min(meaningInput.scrollHeight + 2, 168) + "px";
    };
    let dirty = false; // người dùng đã tự gõ → không để bản dịch đến muộn ghi đè
    meaningInput.addEventListener("input", () => { dirty = true; grow(); setStatus(""); });

    let fetchedPhonetic = "";
    let selectedType = "vocab";
    let pendingTranslate = null;

    // Chọn loại mục (gợi ý theo nội dung; user bấm chip đổi lại được)
    const typeBtns = card.querySelectorAll(".vn-mini-type");
    const setType = (t) => {
      selectedType = VN_TYPES[t] ? t : "vocab";
      typeBtns.forEach(b => {
        const on = b.dataset.type === selectedType;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      card.setAttribute("data-vn-type", selectedType);
      typeNameEl.textContent = VN_TYPES[selectedType].label;
      // Nhãn ô nhập theo loại: từ vựng → "Nghĩa"; còn lại → "Ghi chú".
      flabel.textContent = selectedType === "vocab" && !isLong ? "Nghĩa" : (isLong && translation ? "Ghi chú / bản dịch" : "Ghi chú");
    };
    let translation = isLong ? (prefetchedMeaning || "") : "";
    typeBtns.forEach(b => { b.onclick = () => setType(b.dataset.type); });
    setType(guessType(term));

    moreBtn.onclick = () => {
      extraEl.style.display = "block";
      moreBtn.style.display = "none";
      noteInput.focus();
      positionMiniCard(card, anchorRect);
    };

    // Từ/cụm ngắn tiếng nước ngoài → tự điền nghĩa. Đoạn dài → để trống ô Ghi chú,
    // chỉ dịch khi người dùng bấm "Thêm bản dịch" (hoặc vừa xem bản dịch ở thẻ Dịch).
    const foreignLong = isLong && looksTranslatable(term, TRANSLATE_MAX);
    const translatable = !isLong && looksTranslatable(term, TRANSLATE_MAX);
    const wantPhonetic = translatable && term.length <= SEL_TRANSLATE_MAX;
    const online = typeof navigator !== "undefined" ? navigator.onLine !== false : true;

    if (isLong) {
      meaningInput.placeholder = "Vì sao đoạn này quan trọng? (tuỳ chọn)";
      if (translation) {
        meaningInput.value = translation;
        setStatus("Bản dịch bạn vừa xem — sửa / xoá tuỳ ý");
      } else if (foreignLong) {
        addTrBtn.style.display = "";
      }
      setType(selectedType); // cập nhật nhãn ô nhập
      addTrBtn.onclick = () => {
        addTrBtn.disabled = true;
        setStatus("⏳ Đang dịch…", "loading");
        translateFull(term).then(tr => {
          if (!card.isConnected) return;
          addTrBtn.style.display = "none";
          if (isRealTranslation(term, tr)) {
            translation = tr;
            const cur = meaningInput.value.trim();
            meaningInput.value = cur ? cur + "\n\n" + tr : tr;
            dirty = true;
            grow();
            setType(selectedType);
            setStatus("Đã thêm bản dịch tự động");
          } else {
            setStatus("Chưa dịch được — kiểm tra mạng", "warn");
          }
          positionMiniCard(card, anchorRect);
        });
      };
    } else if (!translatable) {
      meaningInput.placeholder = isNativeText(term, settings) ? "Ghi chú / mô tả cho mục này (tuỳ chọn)" : "Nhập nghĩa / ghi chú (tuỳ chọn)";
    } else if (prefetchedMeaning) {
      meaningInput.value = prefetchedMeaning;
      setStatus("Bản dịch tự động — sửa thoải mái trước khi lưu");
    } else if (!online) {
      setStatus("Không có mạng — nhập nghĩa tay", "warn");
    } else {
      meaningInput.placeholder = "Đang dịch…";
      setStatus("⏳ Đang dịch…", "loading");
      pendingTranslate = autoTranslate(term, lang).then(translated => {
        pendingTranslate = null;
        if (!card.isConnected) return translated;
        // Google vừa nhận diện ngôn ngữ nguồn → cập nhật badge cho đúng (es/fr/…)
        const dl = detectedLangOf(term);
        if (dl && dl !== lang) setLang(dl);
        meaningInput.placeholder = "Nghĩa / ghi chú nhanh…";
        if (isRealTranslation(term, translated)) {
          if (!dirty) {
            meaningInput.value = translated;
            grow();
            setStatus("Bản dịch tự động — sửa thoải mái trước khi lưu");
          }
        } else if (!dirty) {
          setStatus("Không tìm được bản dịch — tự nhập nghĩa nếu cần");
        }
        positionMiniCard(card, anchorRect);
        return translated;
      });
    }
    grow();

    // Lấy phiên âm song song (chỉ với từ/cụm ngắn)
    if (wantPhonetic) fetchPhonetic(term, lang).then(p => {
      if (!p || !card.isConnected) return;
      fetchedPhonetic = p;
      const el = card.querySelector(".vn-mini-phonetic");
      el.textContent = p;
      el.style.display = "block";
      positionMiniCard(card, anchorRect); // chiều cao thay đổi → đặt lại
    });

    // Định vị sát selection nếu có, fallback góc dưới phải
    positionMiniCard(card, anchorRect);
    try { meaningInput.focus({ preventScroll: true }); } catch (e) { meaningInput.focus(); }
    try { meaningInput.setSelectionRange(meaningInput.value.length, meaningInput.value.length); } catch (e) {}

    let saving = false;
    async function doSave() {
      if (saving) return;
      saving = true;
      saveBtn.disabled = true;
      let meaning = meaningInput.value.trim();
      // Bấm Enter khi bản dịch chưa về → chờ thêm chút thay vì lưu nghĩa rỗng.
      if (!meaning && !dirty && pendingTranslate) {
        setStatus("⏳ Đang chờ bản dịch…", "loading");
        const tr = await Promise.race([pendingTranslate, new Promise(r => setTimeout(() => r(""), 2500))]);
        if (isRealTranslation(term, tr)) meaning = tr;
      }
      const note = noteInput.value.trim();
      const tags = vnParseTags(tagsInput.value);
      const newWord = {
        id: "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        term: term,
        lang: lang,
        type: selectedType,
        phonetic: fetchedPhonetic || "",
        meaning: meaning,
        note: note,
        tags: tags.length ? tags : undefined,
        hoverCount: 0,
        autoDeleteAt: settings.defaultThreshold || 20,
        createdAt: new Date().toISOString()
      };
      // Đoạn dài lưu từ 1 trang cụ thể → neo lại trên trang đó khi quay lại.
      if (anchorCtx && anchorCtx.url && term.length > HIGHLIGHT_MAX) {
        newWord.anchor = true;
        newWord.url = anchorCtx.url;
        newWord.pageTitle = anchorCtx.pageTitle || "";
        newWord.anchorPrefix = anchorCtx.prefix || "";
        newWord.anchorSuffix = anchorCtx.suffix || "";
      }
      // Atomic add: tránh ghi đè khi nhiều tab cùng thêm
      chrome.storage.local.get("words", (data) => {
        const arr = data.words || [];
        if (arr.some(x => !x.sticky && keyOf(x.term) === keyOf(newWord.term))) {
          closeCard();
          showToast(`"${newWord.term}" đã có rồi`, { warn: true });
          return;
        }
        arr.push(newWord);
        chrome.storage.local.set({ words: arr }, () => {
          closeCard();
          flashHighlights(newWord.term);
          showToast(`Đã lưu "${newWord.term.length > 40 ? newWord.term.slice(0, 40) + "…" : newWord.term}"`, {
            actions: [{ label: "Hoàn tác", onClick: () => removeById(newWord.id) }]
          });
        });
        // storage.onChanged sẽ tự rebuildIndex + rescan
      });
    }

    // Đóng card + gỡ listener click-ngoài (tránh rò rỉ)
    function closeCard() {
      card.remove();
      document.removeEventListener("mousedown", onOutsideClick, true);
    }
    function onOutsideClick(ev) {
      if (!card.isConnected) { document.removeEventListener("mousedown", onOutsideClick, true); return; }
      if (card.contains(ev.target)) return;
      // Đã gõ dở thì giữ thẻ lại (đóng bằng Esc / ✕) — tránh mất chữ vì lỡ tay bấm ra ngoài.
      if (dirty || noteInput.value.trim() || tagsInput.value.trim()) return;
      closeCard();
    }
    // Trì hoãn 1 nhịp để không bắt ngay chính cú click vừa mở card
    setTimeout(() => document.addEventListener("mousedown", onOutsideClick, true), 0);

    saveBtn.onclick = doSave;
    card.querySelector(".vn-mini-x").onclick = closeCard;

    card.addEventListener("keydown", (e) => {
      // Bỏ qua khi đang gõ IME (fcitx5, unikey…)
      if (e.isComposing || e.keyCode === 229) return;
      e.stopPropagation(); // không để phím tắt của trang (vd YouTube, Gmail) bắt nhầm
      if (e.key === "Escape") { e.preventDefault(); closeCard(); return; }
      if (e.key === "Enter" && !e.shiftKey && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) {
        e.preventDefault();
        doSave();
      }
    });
    card.addEventListener("keyup", (e) => e.stopPropagation());
    card.addEventListener("keypress", (e) => e.stopPropagation());
  }

  // Xoá 1 mục theo id (không toast) — dùng cho "Hoàn tác" sau khi lưu.
  function removeById(id) {
    chrome.storage.local.get("words", (d) => {
      const arr = (d.words || []).filter(x => x.id !== id);
      chrome.storage.local.set({ words: arr });
    });
  }
  // Alias để giữ tương thích với message cũ
  const openAddModal = openAddMiniCard;

  // ---------- Message từ background / popup (gộp 1 listener) ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type || superseded) return;
    switch (msg.type) {
      case "GET_PAGE_ITEMS":
        sendResponse({ ids: pageItemIds(), host: location.hostname });
        return;
      case "PROMPT_ADD_WORD":
        openAddModal(msg.term, null, "", currentSelectionAnchor(msg.term));
        break;
      case "ADD_FROM_SELECTION": {
        const sel = window.getSelection && window.getSelection().toString().trim();
        if (!sel) showToast("Bôi đen từ/đoạn cần lưu rồi bấm Alt+Shift+H", { warn: true });
        else if (sel.length > 2000) showToast("Đoạn quá dài (tối đa 2000 ký tự)", { warn: true });
        else openAddModal(sel, null, "", currentSelectionAnchor(sel));
        break;
      }
      // Alt+Shift+D / chuột phải → "Dịch": chỉ xem bản dịch, không lưu.
      case "TRANSLATE_SELECTION":
      case "PROMPT_TRANSLATE": {
        const g = grabSelection(msg.type === "PROMPT_TRANSLATE" ? msg.term : "");
        if (!g.text) showToast("Bôi đen chữ cần dịch rồi bấm Alt+Shift+D", { warn: true });
        else if (g.text.length > SEL_MAX) showToast("Đoạn quá dài để dịch (tối đa 5000 ký tự)", { warn: true });
        else { hideSelBtn(); openTranslateCard(g.text, g.rect, g.anchorCtx); }
        break;
      }
      case "FORCE_RESCAN":
        loadData(() => {
          if (!isHostBlacklisted()) rescanFullPage();
          else removeAllHighlights();
          renderStickyNotes();
        });
        break;
      case "ADD_STICKY_NOTE":
        openStickyComposer();
        break;
    }
  });

  // Đồng bộ giữa các tab — phân biệt: chỉ counter thay đổi → update tooltip,
  // còn lại (thêm/xoá/đổi tên/đổi disabled/settings) → rescan
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let needRescan = false;
    if (changes.settings) {
      settings = { ...settings, ...(changes.settings.newValue || {}) };
      applyUiLang();
      // Tắt extension / tắt thanh "Lưu" → ẩn ngay thanh chọn đang hiển thị
      if (settings.enabled === false || settings.showSelButton === false
        || (hideSelNative(settings) && isNativeText(selBtnCurrentText, settings))) hideSelBtn();
      // Áp ngay màu/kiểu/độ dày highlight (kể cả khi không đổi danh sách từ)
      applyHighlightVars();
      learningOn = self.HN_CONST.reviewState(words, settings).eligible; // bật/tắt chế độ học từ
      // Dựng lại chỉ mục: công tắc tổng (enabled) và "phân biệt hoa/thường" nằm trong regex.
      // Trước đây không dựng lại → tắt ở popup mà các tab đang mở vẫn tô sáng.
      if (!changes.words) rebuildIndex();
      // Kiểm tra blacklist trang hiện tại
      if (isHostBlacklisted()) {
        hideSelBtn();
        removeAllHighlights();
        words = changes.words ? (changes.words.newValue || []) : words;
        rebuildIndex();
        // Bỏ regex: nếu không, MutationObserver thấy text vừa gỡ highlight là "nội dung mới"
        // và tô lại ngay → "Tắt ở đây" trông như không có tác dụng.
        combinedRegex = null;
        renderStickyNotes(); // sẽ tự gỡ lớp note vì trang bị blacklist
        return;
      }
      needRescan = true;
    }
    if (changes.words) {
      const oldW = changes.words.oldValue || [];
      const newW = changes.words.newValue || [];
      const structural = oldW.length !== newW.length
        || newW.some(n => {
            const o = oldW.find(x => x.id === n.id);
            return !o || o.term !== n.term || !!o.disabled !== !!n.disabled || !!o.learned !== !!n.learned;
          });
      words = newW;
      rebuildIndex();
      if (structural) needRescan = true;
      // Cập nhật tooltip nếu đang hiển thị
      if (activeSpan) updateVisibleTooltip(activeSpan.dataset.term);
    }
    if (needRescan) rescanFullPage();
    // Note dán trang có thể vừa được thêm/sửa/xoá (kể cả từ tab khác hoặc popup) → vẽ lại.
    if (changes.words || changes.settings) renderStickyNotes();
  });

  function isHostBlacklisted() {
    return self.HN_CONST.hostBlocked(location.hostname, settings.blacklistedHosts);
  }

  // Popup / Side Panel hỏi: trang này đang hiện những mục nào? (để lọc "Trang này")
  function pageItemIds() {
    const ids = new Set();
    document.querySelectorAll(".vocab-note-highlight").forEach(el => {
      if (el.dataset.anchorId) { ids.add(el.dataset.anchorId); return; }
      const w = wordMap.get(el.dataset.term);
      if (w) ids.add(w.id);
    });
    for (const w of getPageStickyItems()) ids.add(w.id);
    return [...ids];
  }

  // ---------- MutationObserver cho SPA ----------
  let mutationDebounce = null;
  let pendingMutationNodes = [];
  const observer = new MutationObserver((mutations) => {
    // Chạy khi có từ vựng để tô, còn đoạn neo chưa tìm thấy, HOẶC có sticky note
    // (để bắt SPA đổi URL mà vẫn cần hiện/ẩn note theo trang).
    if (!combinedRegex && getPageAnchorItems().length === 0 && !words.some(w => w && w.sticky)) return;
    // Gom addedNodes của MỌI đợt mutation vào 1 buffer chung. Trước đây debounce
    // chỉ giữ mảng `mutations` của lần callback CUỐI → các node thêm ở những đợt
    // bị clearTimeout huỷ sẽ không bao giờ được tô sáng. Buffer khắc phục điều đó.
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1 || node.nodeType === 3) pendingMutationNodes.push(node);
      });
    }
    if (pendingMutationNodes.length === 0) return;
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      const nodes = pendingMutationNodes;
      pendingMutationNodes = [];
      if (combinedRegex) {
        for (const node of nodes) {
          if (!node.isConnected) continue; // node đã bị gỡ khỏi DOM trước khi xử lý
          if (node.nodeType === 1) scanNode(node);
          else if (node.nodeType === 3 && !shouldSkip(node)) highlightTextNode(node);
        }
      }
      anchorPass(); // neo lại đoạn văn cho nội dung mới nạp (tự bỏ qua nếu không còn gì)
      checkStickyUrlChange(); // SPA điều hướng đổi URL → cập nhật note theo trang mới
    }, 300);
  });

  // ---------- Init ----------
  function init() {
    loadData(() => {
      if (document.body) {
        if (!isHostBlacklisted()) { scanNode(document.body); anchorPass(); }
        renderStickyNotes(); // hiện các ghi chú đã dán lên trang này (tự bỏ qua nếu blacklist)
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
