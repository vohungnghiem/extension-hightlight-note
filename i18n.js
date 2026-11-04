// Dịch giao diện (i18n) — kiểu gettext: CÂU TIẾNG VIỆT LÀ KHOÁ, bảng dịch nằm ở i18n-en.js.
//
// Vì sao không dùng chrome.i18n + _locales cho giao diện:
//   - chrome.i18n luôn theo ngôn ngữ trình duyệt, không cho người dùng tự chọn. Mà 50% người
//     dùng Việt Nam hiện tại dùng Chrome tiếng Anh → họ sẽ bị đổi sang tiếng Anh ngoài ý muốn.
//   - giữ câu tiếng Việt ngay trong code → người phát triển đọc code vẫn hiểu, giao diện tiếng
//     Việt (mặc định) chạy y nguyên như trước, không qua bảng dịch nào.
// _locales chỉ dùng cho tên / mô tả / phím tắt trong manifest (Chrome bắt buộc).
//
// Cách dùng:
//   HN_I18N.t("Dịch sang {0}", name)   → chuỗi theo ngôn ngữ đang chọn
//   HN_I18N.tr(chuỗi đã ghép sẵn)      → dịch nguyên câu (khớp cả mẫu có {0}); dùng cho toast
//   HN_I18N.dom(el) / watch(el)        → dịch text + title/placeholder/aria-label trong el
//   [data-hn-raw] hoặc selector skip   → nội dung người dùng (từ, nghĩa, ghi chú): không dịch
// Thêm câu mới: viết tiếng Việt như bình thường, rồi thêm 1 dòng vào i18n-en.js
// (chạy `node tests/i18n-missing.js` để liệt kê câu chưa có bản dịch).
(function (root) {
  const DICTS = { en: root.HN_I18N_EN || {} };
  const UI_LANGS = [
    { code: "auto", label: "Tự động (theo trình duyệt)" },
    { code: "vi", label: "Tiếng Việt" },
    { code: "en", label: "English" }
  ];
  let lang = "vi";
  let dict = null;
  let patterns = [];
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();

  function compile(d) {
    patterns = [];
    for (const k of Object.keys(d)) {
      if (!/\{\d\}/.test(k)) continue;
      const order = [];
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const parts = k.split(/\{(\d)\}/); // [chữ, số, chữ, số, chữ…]
      let re = "";
      parts.forEach((p, i) => { if (i % 2) { order.push(+p); re += "(.+?)"; } else re += esc(norm(p) === "" ? p : p.replace(/\s+/g, " ")); });
      patterns.push({ re: new RegExp("^" + re + "$"), order, out: d[k] });
    }
  }

  // Ngôn ngữ giao diện: người dùng chọn (settings.uiLang) hoặc tự động. Tự động = tiếng Việt
  // nếu trình duyệt tiếng Việt HOẶC máy đặt múi giờ Việt Nam (người Việt dùng Chrome tiếng
  // Anh vẫn thấy tiếng Việt), còn lại tiếng Anh.
  function resolve(settings) {
    const u = settings && settings.uiLang;
    if (u && u !== "auto" && (u === "vi" || DICTS[u])) return u;
    try {
      const nav = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
      if (nav[0] && /^vi\b/i.test(nav[0])) return "vi";
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (/^Asia\/(Ho_Chi_Minh|Saigon)$/.test(tz)) return "vi";
      for (const l of nav) { const b = String(l).toLowerCase().split("-")[0]; if (b === "vi") return "vi"; if (DICTS[b]) return b; }
    } catch (e) {}
    return "en";
  }

  function setLang(l) {
    lang = (l && l !== "vi" && DICTS[l]) ? l : "vi";
    dict = lang === "vi" ? null : DICTS[lang];
    if (dict) compile(dict);
    if (typeof document !== "undefined" && document.documentElement && root.HN_I18N_PAGE) document.documentElement.lang = lang;
  }

  const fill = (s, args) => String(s).replace(/\{(\d)\}/g, (_, i) => (args[i] !== undefined ? args[i] : ""));
  function t(key, ...args) {
    const out = dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
    return fill(out, args);
  }
  // Dịch một câu hoàn chỉnh (không có {0}): khớp nguyên văn, hoặc khớp mẫu rồi dịch luôn phần biến.
  function tr(str) {
    if (!dict || str == null) return str;
    const s = String(str);
    const k = norm(s);
    if (!k) return s;
    let out = null;
    if (Object.prototype.hasOwnProperty.call(dict, k)) out = dict[k];
    else {
      for (const p of patterns) {
        const m = p.re.exec(k);
        if (!m) continue;
        const args = [];
        p.order.forEach((idx, j) => { const v = m[j + 1]; args[idx] = Object.prototype.hasOwnProperty.call(dict, v) ? dict[v] : v; });
        out = fill(p.out, args);
        break;
      }
    }
    if (out == null) return s;
    const lead = /^\s*/.exec(s)[0], trail = /\s*$/.exec(s)[0];
    return lead + out + trail;
  }

  const ATTRS = ["title", "placeholder", "aria-label", "data-tag", "alt"];
  let skipSel = "[data-hn-raw]";
  function skipped(el) {
    if (!el || !el.closest) return false;
    if (el.closest(skipSel)) return true;
    const tag = el.tagName;
    return tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || el.isContentEditable;
  }
  function dom(rootEl) {
    if (!dict || !rootEl) return;
    if (rootEl.nodeType === 3) {
      if (!skipped(rootEl.parentElement)) { const v = tr(rootEl.nodeValue); if (v !== rootEl.nodeValue) rootEl.nodeValue = v; }
      return;
    }
    if (rootEl.nodeType !== 1 && rootEl.nodeType !== 9 && rootEl.nodeType !== 11) return;
    const els = rootEl.nodeType === 1 ? [rootEl, ...rootEl.querySelectorAll("*")] : [...rootEl.querySelectorAll("*")];
    for (const el of els) {
      if (skipped(el)) continue;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v) { const n = tr(v); if (n !== v) el.setAttribute(a, n); }
      }
      if (el.tagName === "OPTGROUP" && el.label) el.label = tr(el.label);
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && n.nodeValue.trim()) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
      }
    }
  }
  // Theo dõi el: phần tử / chữ thêm vào sau (render lại danh sách, đổi trạng thái…) cũng được dịch.
  const watched = new WeakSet();
  function watch(el) {
    if (!dict || !el || watched.has(el) || typeof MutationObserver === "undefined") return;
    watched.add(el);
    dom(el);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") { if (!skipped(m.target)) { const v = m.target.getAttribute(m.attributeName); if (v) { const n = tr(v); if (n !== v) m.target.setAttribute(m.attributeName, n); } } }
        else if (m.type === "characterData") dom(m.target);
        else m.addedNodes.forEach(dom);
      }
    }).observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // Trang của extension (popup, Cài đặt, chào mừng): dịch cả trang. Đọc lựa chọn đã nhớ ở
  // localStorage để dịch NGAY khi tải (khỏi nháy tiếng Việt), rồi xác nhận lại bằng storage.
  function initPage(opts = {}) {
    root.HN_I18N_PAGE = true;
    if (opts.skip) skipSel = "[data-hn-raw], " + opts.skip;
    let cached = null;
    try { cached = localStorage.getItem("hn-ui-lang"); } catch (e) {}
    if (cached) setLang(cached); // đặt NGAY: script của trang dựng chữ bằng t() sau dòng này
    const start = () => {
      if (dict) { document.title = tr(document.title); watch(document.documentElement); }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
    try {
      chrome.storage.local.get("settings", ({ settings }) => {
        const l = resolve(settings || {});
        try { localStorage.setItem("hn-ui-lang", l); } catch (e) {}
        if (l !== (cached || "vi")) location.reload(); // lần đầu / vừa đổi ở máy khác
      });
      chrome.storage.onChanged.addListener((c, area) => {
        if (area !== "local" || !c.settings) return;
        const l = resolve(c.settings.newValue || {});
        if (l !== lang) { try { localStorage.setItem("hn-ui-lang", l); } catch (e) {} location.reload(); }
      });
    } catch (e) {}
  }

  root.HN_I18N = {
    t, tr, dom, watch, resolve, setLang, initPage, UI_LANGS,
    getLang: () => lang,
    setSkip: (sel) => { skipSel = "[data-hn-raw]" + (sel ? ", " + sel : ""); }
  };
})(typeof self !== "undefined" ? self : this);
