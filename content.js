// Content script: chạy trên mọi trang web
// - Quét DOM, highlight từ có trong danh sách
// - Tooltip hover (nghĩa + counter + nút xoá)
// - Modal nhập nghĩa khi user chọn "Lưu vào Vocab" từ context menu

(() => {
  if (window.__vocabNoteInjected) return;
  window.__vocabNoteInjected = true;

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
    copy: svgIco('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    help: svgIco('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    gear: svgIco('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')
  };

  // Mở trang Cài đặt / Hướng dẫn (nhờ background mở giúp — content script không
  // gọi trực tiếp được openOptionsPage / chrome.tabs).
  function openExtPage(which) {
    try { chrome.runtime.sendMessage({ type: which === "welcome" ? "OPEN_WELCOME" : "OPEN_OPTIONS" }); } catch (e) {}
  }

  // Đã ghim icon lên thanh công cụ chưa? Nếu rồi thì người dùng mở popup dễ →
  // KHÔNG cần nút "Hướng dẫn" trong trang. Hỏi background (content script không
  // gọi được chrome.action). Mặc định coi như chưa ghim để vẫn hiện lối tắt.
  let actionPinned = false;
  function refreshPinnedState() {
    try {
      chrome.runtime.sendMessage({ type: "GET_ACTION_PINNED" }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        actionPinned = !!res.pinned;
      });
    } catch (e) {}
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
  };
  let wordMap = new Map(); // termLower -> word object
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

  function findWordByText(text) {
    const lc = text.toLowerCase();
    return wordMap.get(lc) || variantMap.get(lc) || null;
  }

  // ---------- Storage helpers ----------
  function loadData(cb) {
    chrome.storage.local.get(["words", "settings"], (data) => {
      words = data.words || [];
      settings = { ...settings, ...(data.settings || {}) };
      rebuildIndex();
      refreshPinnedState(); // biết đã ghim chưa để quyết định hiện nút Hướng dẫn
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

  function detectLang(s) {
    return /[぀-ゟ゠-ヿ一-鿿]/.test(s) ? "ja" : "en";
  }
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
  }

  function rebuildIndex() {
    applyHighlightVars();
    wordMap.clear();
    variantMap.clear();
    for (const w of words) {
      // Migration: gán lang cho từ cũ chưa có
      if (!w.lang) w.lang = detectLang(w.term);
      wordMap.set(w.term.toLowerCase(), w);
    }
    const activeWords = settings.enabled === false ? [] : words.filter(w => !w.disabled && !w.learned);
    if (activeWords.length === 0) {
      combinedRegex = null;
      return;
    }
    // Đoạn dài hơn HIGHLIGHT_MAX coi là "note" → không tô sáng (giữ highlight gọn & nhanh)
    const highlightable = activeWords.filter(w => w.term.length <= HIGHLIGHT_MAX);
    // Build variantMap cho EN
    const enTokens = new Set();
    for (const w of highlightable) {
      if (w.lang === "en") {
        for (const v of enVariants(w.term)) {
          enTokens.add(v);
          if (!variantMap.has(v)) variantMap.set(v, w);
        }
      }
    }
    const en = Array.from(enTokens).sort((a,b) => b.length - a.length).map(escapeRe);
    const ja = highlightable.filter(w => w.lang === "ja").map(w => w.term).sort((a,b) => b.length - a.length).map(escapeRe);
    const parts = [];
    if (en.length) parts.push(`\\b(?:${en.join("|")})\\b`);
    if (ja.length) parts.push(`(?:${ja.join("|")})`); // CJK không có word boundary
    if (parts.length === 0) { combinedRegex = null; return; }
    const flags = settings.caseSensitive ? "g" : "gi";
    combinedRegex = new RegExp(parts.join("|"), flags);
  }

  // ---------- Highlight DOM ----------
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT", "CODE", "PRE"]);

  const SKIP_CLASSES = ["vocab-note-highlight", "vocab-note-tooltip", "vocab-note-toast", "vocab-note-modal-overlay"];
  function shouldSkip(node) {
    let p = node.parentNode;
    while (p) {
      if (p.nodeType === 1) {
        if (SKIP_TAGS.has(p.tagName)) return true;
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
      span.dataset.term = wRef.term.toLowerCase();
      const pct = (wRef.hoverCount || 0) / (wRef.autoDeleteAt || 20);
      span.dataset.level = pct >= 0.7 ? "hot" : pct >= 0.3 ? "warm" : "new";
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
    if (document.body) scanNode(document.body);
  }

  // ---------- Tooltip + hover counter ----------
  let tooltipEl = null;
  let activeSpan = null;
  let hoverTimer = null;
  let hideTimer = null;
  let showTimer = null; // delay trước khi hiện tooltip để tránh lướt chuột bật nhầm
  let countedThisHover = false;
  let pinned = false; // tooltip đã được ghim bằng click → không tự ẩn
  let tooltipEditing = false; // user đang gõ trong khu sửa → không rebuild tooltip
  const SHOW_DELAY_MS = 400; // phải dừng chuột trên từ ≥ 400ms tooltip mới hiện

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
    if (!span || !span.isConnected) { hideTooltip(); return; }
    const term = span.dataset.term;
    const w = wordMap.get(term);
    if (!w) return;
    const tip = ensureTooltip();
    const pctRaw = Math.round((w.hoverCount / w.autoDeleteAt) * 100);
    const pct = pctRaw;
    const pctBar = Math.min(100, pctRaw); // thanh progress vẫn cap 100% cho khỏi tràn
    const lang = w.lang || detectLang(w.term);
    const dictUrl = lang === "ja"
      ? `https://jisho.org/search/${encodeURIComponent(w.term)}`
      : `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(w.term)}`;
    const dictTitle = lang === "ja" ? "Jisho" : "Cambridge";
    const trUrl = `https://translate.google.com/?sl=auto&tl=vi&text=${encodeURIComponent(w.term)}`;
    tip.innerHTML = `
      <div class="vn-card">
        <div class="vn-head">
          <img class="vn-brand" src="${BRAND_ICON}" alt="" draggable="false" />
          <span class="vn-term-text">${escapeHtml(w.term)}</span>
          <span class="vn-lang">${lang.toUpperCase()}</span>
          <button class="vn-icon-btn vn-speak" title="Phát âm">${VN_ICON.speak}</button>
          <a class="vn-icon-btn vn-dict" href="${dictUrl}" target="_blank" title="${dictTitle}">${VN_ICON.book}</a>
          <a class="vn-icon-btn vn-dict" href="${trUrl}" target="_blank" title="Google Translate">${VN_ICON.globe}</a>
          ${actionPinned ? "" : `<button class="vn-icon-btn vn-guide" title="Hướng dẫn sử dụng">${VN_ICON.help}</button>`}
          <button class="vn-icon-btn vn-settings" title="Cài đặt">${VN_ICON.gear}</button>
          <button class="vn-icon-btn vn-close" title="Đóng">${VN_ICON.close}</button>
        </div>
        <div class="vn-body">
          ${w.phonetic ? `<div class="vn-phonetic">${escapeHtml(w.phonetic)}</div>` : ""}
          ${w.meaning ? `<div class="vn-meaning">${escapeHtml(w.meaning)}</div>` : `<div class="vn-meaning" style="opacity:.5">(chưa có nghĩa)</div>`}
          ${w.note ? `<div class="vn-note">${escapeHtml(w.note)}</div>` : ""}
        </div>
        <div class="vn-meta">
          <div class="vn-progress"><div style="width:${pctBar}%"></div></div>
        </div>
        <div class="vn-actions">
          <button class="vn-action vn-edit" title="Sửa nghĩa/ghi chú">${VN_ICON.edit}</button>
          <button class="vn-action vn-mute" title="${w.disabled ? "Bật lại tô sáng" : "Tạm ẩn tô sáng (vẫn giữ trong danh sách)"}">${w.disabled ? VN_ICON.bellOff : VN_ICON.bell}</button>
          <button class="vn-action vn-learn" title="Đánh dấu đã thuộc (giữ từ, ngừng tô sáng)">${VN_ICON.learn}</button>
          <button class="vn-action vn-danger vn-delete" title="Xoá hẳn">${VN_ICON.del}</button>
        </div>
        <div class="vn-edit-area" style="display:none">
          <input type="text" class="vn-edit-meaning" placeholder="Nghĩa" value="${escapeHtml(w.meaning || "")}" />
          <input type="text" class="vn-edit-note" placeholder="Ghi chú" value="${escapeHtml(w.note || "")}" />
          <div class="vn-edit-actions">
            <button class="vn-action vn-edit-cancel">Hủy</button>
            <button class="vn-action vn-edit-save">${VN_ICON.save} Lưu</button>
          </div>
        </div>
        <div class="vn-hint">Click vào từ để ghim · ESC để đóng</div>
      </div>
    `;
    tip.classList.toggle("pinned", pinned);

    // Backfill phiên âm cho từ EN cũ chưa có — atomic, không ghi đè
    if (lang === "en" && !w.phonetic && !w._phoneticFetching) {
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
    tip.querySelector(".vn-speak").addEventListener("click", (e) => { stop(e); speak(w.term, lang === "ja" ? "ja-JP" : "en-US"); });
    tip.querySelector(".vn-close").addEventListener("click", (e) => { stop(e); unpinAndHide(); });
    const tipGuide = tip.querySelector(".vn-guide");
    if (tipGuide) tipGuide.addEventListener("click", (e) => { stop(e); openExtPage("welcome"); });
    tip.querySelector(".vn-settings").addEventListener("click", (e) => { stop(e); openExtPage("options"); });
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
      showToast(newDisabled ? `Đã tắt "${w.term}"` : `Đã bật lại "${w.term}"`);
    });
    tip.querySelector(".vn-learn").addEventListener("click", (e) => {
      stop(e);
      updateWordById(w.id, (rec) => { rec.learned = true; rec.learnedAt = new Date().toISOString(); return rec; });
      unpinAndHide();
      showToast(`🎓 Đã đánh dấu "${w.term}" là đã thuộc`);
    });

    // Nút Sửa: mở inline editor cho nghĩa + ghi chú
    const editArea = tip.querySelector(".vn-edit-area");
    const actionsBar = tip.querySelector(".vn-actions");
    const meaningInput = tip.querySelector(".vn-edit-meaning");
    const noteInput = tip.querySelector(".vn-edit-note");
    const exitEditMode = () => {
      tooltipEditing = false;
      editArea.style.display = "none";
      actionsBar.style.display = "flex";
    };
    tip.querySelector(".vn-edit").addEventListener("click", (e) => {
      stop(e);
      pinned = true;
      tooltipEditing = true;
      tip.classList.add("pinned");
      actionsBar.style.display = "none";
      editArea.style.display = "block";
      meaningInput.focus();
      meaningInput.select();
    });
    tip.querySelector(".vn-edit-cancel").addEventListener("click", (e) => {
      stop(e);
      exitEditMode();
    });
    const doSaveEdit = () => {
      const newMeaning = meaningInput.value.trim();
      const newNote = noteInput.value.trim();
      w.meaning = newMeaning;
      w.note = newNote;
      updateWordById(w.id, (rec) => { rec.meaning = newMeaning; rec.note = newNote; return rec; });
      exitEditMode();
      showTooltip(activeSpan || span);
      showToast(`Đã cập nhật "${w.term}"`);
    };
    tip.querySelector(".vn-edit-save").addEventListener("click", (e) => { stop(e); doSaveEdit(); });
    [meaningInput, noteInput].forEach(inp => {
      inp.addEventListener("click", stop);
      inp.addEventListener("keydown", (ev) => {
        if (ev.isComposing || ev.keyCode === 229) return;
        if (ev.key === "Enter") { ev.preventDefault(); doSaveEdit(); }
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          exitEditMode();
        }
      });
    });

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

  function speak(text, lang = "en-US") {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Floating save button khi bôi đen ----------
  let selBtn = null;
  let selBtnCurrentText = "";
  let selBtnToken = 0;             // huỷ kết quả dịch cũ khi selection đổi
  const selTransCache = new Map(); // text -> bản dịch (tránh gọi lại API)

  // Ngưỡng ký tự để hiện bản dịch preview trên nút nổi. Dài hơn (cụm/đoạn dài)
  // → bỏ qua dịch, chỉ hiện nút Lưu + Copy (dịch cả câu vừa vô ích vừa bị cắt).
  const SEL_TRANSLATE_MAX = 40;

  // Nhận diện tiếng Việt qua các ký tự đặc trưng (ă â đ ê ô ơ ư + dấu thanh
  // khối U+1EA0–1EF9). Đích dịch là tiếng Việt nên text Việt thì khỏi dịch.
  function isVietnamese(s) {
    return /[ăâđêôơưĂÂĐÊÔƠƯẠ-ỹ]/.test(s);
  }

  // Bản dịch có "thật" không: rỗng hoặc trùng nguyên văn nguồn → coi như không
  // dịch được (viết tắt, tên riêng, từ Việt không dấu… Google trả về y nguyên).
  function isRealTranslation(src, tr) {
    if (!tr) return false;
    const norm = s => (s || "").trim().toLowerCase();
    return norm(tr) !== norm(src);
  }

  // Phân tích đoạn chọn có "dịch được" không. Email / số / URL / ký hiệu thuần
  // (không có chữ cái nào), tiếng Việt, hoặc đoạn quá dài → khỏi dịch, chỉ hiện nút Lưu.
  function looksTranslatable(text) {
    const t = (text || "").trim();
    if (!t) return false;
    if (t.length > SEL_TRANSLATE_MAX) return false;                  // cụm/đoạn dài
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;          // email
    if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return false;           // URL
    if (isVietnamese(t)) return false;                               // đã là tiếng Việt
    // Cần ít nhất 1 chữ cái thực: Latin (có dấu), Hy Lạp, Cyrillic, CJK, Kana, Hangul…
    if (!/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ㐀-鿿가-힯]/.test(t)) return false;
    return true;
  }

  function buildSelBtn(text) {
    const existing = wordMap.get(text.toLowerCase()) || variantMap.get(text.toLowerCase());
    const brand = `<img class="vn-sel-brand" src="${BRAND_ICON}" alt="" draggable="false">`;
    // Các nút phụ bật/tắt theo cài đặt. Phát âm chỉ hiện với từ/cụm ngắn (đọc cả
    // đoạn dài vừa vô nghĩa vừa lâu).
    const speakBtn = (settings.showSelSpeak !== false && text.length <= 60)
      ? `<button class="vn-sel-speak" title="Phát âm">${VN_ICON.speak}</button>` : "";
    const copyBtn = (settings.showSelCopy !== false)
      ? `<button class="vn-sel-copy" title="Sao chép">${VN_ICON.copy}</button>` : "";
    const extras = speakBtn + copyBtn;
    if (existing) {
      selBtn.className = "vocab-note-sel-btn vn-sel-exists";
      selBtn.innerHTML =
        `<button class="vn-sel-save" disabled>${brand}<span class="vn-sel-action">${VN_ICON.save} Đã lưu</span></button>` +
        extras;
      return;
    }
    selBtn.className = "vocab-note-sel-btn";
    if (looksTranslatable(text)) {
      // Không hiện chữ gốc — chỉ hiện bản dịch (đổ vào .vn-sel-trans sau khi fetch xong)
      selBtn.innerHTML =
        `<button class="vn-sel-save">${brand}<span class="vn-sel-trans"></span><span class="vn-sel-action">${VN_ICON.save} Lưu</span></button>` +
        extras;
    } else {
      // Email / số / URL… không dịch được → chỉ cần nút Lưu
      selBtn.innerHTML =
        `<button class="vn-sel-save">${brand}<span class="vn-sel-action">${VN_ICON.save} Lưu</span></button>` +
        extras;
    }
  }

  // Phát âm đoạn đang chọn (theo ngôn ngữ nhận diện được).
  function doSpeakSelection() {
    const text = selBtnCurrentText;
    if (text) speak(text, detectLang(text) === "ja" ? "ja-JP" : "en-US");
  }

  function doCopySelection() {
    const text = selBtnCurrentText;
    const finish = () => flashCopied();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(finish).catch(() => fallbackCopy(text, finish));
      } else {
        fallbackCopy(text, finish);
      }
    } catch (_) { fallbackCopy(text, finish); }
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

  function doSaveSelection() {
    const existing = wordMap.get(selBtnCurrentText.toLowerCase()) || variantMap.get(selBtnCurrentText.toLowerCase());
    const text = selBtnCurrentText;
    // Chụp vị trí selection TRƯỚC khi xoá để mini-card đặt đúng chỗ (sát từ vừa chọn)
    let anchorRect = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) {
        anchorRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }
    }
    hideSelBtn();
    sel && sel.removeAllRanges();
    if (existing) {
      showToast(`"${existing.term}" đã có trong danh sách rồi.`, { warn: true });
      return;
    }
    if (text && text.length <= 2000) openAddMiniCard(text, anchorRect, selTransCache.get(text) || "");
  }

  function ensureSelBtn() {
    if (selBtn) return selBtn;
    selBtn = document.createElement("div");
    selBtn.className = "vocab-note-sel-btn";
    selBtn.style.display = "none";
    // Giữ selection khi bấm bất kỳ nút nào trong thanh
    selBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    // Phân luồng click cho 2 nút con
    selBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target.closest(".vn-sel-speak")) { doSpeakSelection(); return; }
      if (e.target.closest(".vn-sel-copy")) { doCopySelection(); return; }
      if (e.target.closest(".vn-sel-save")) { doSaveSelection(); return; }
    });
    document.body.appendChild(selBtn);
    return selBtn;
  }

  function positionSelBtn(rect) {
    const btn = selBtn;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = btn.offsetWidth || 160;
    const bh = btn.offsetHeight || 30;
    let left = rect.right;
    let top = rect.bottom + 6;
    if (left + bw > vw - 8) left = vw - bw - 8;
    if (left < 8) left = 8;
    if (top + bh > vh - 8) top = rect.top - bh - 6;
    btn.style.left = left + "px";
    btn.style.top = top + "px";
  }

  function showSelBtn(rect, text) {
    const btn = ensureSelBtn();
    selBtnCurrentText = text;
    buildSelBtn(text);
    btn.style.display = "flex";
    positionSelBtn(rect);

    // Preview dịch (chỉ khi từ chưa có & còn mạng)
    const existing = wordMap.get(text.toLowerCase()) || variantMap.get(text.toLowerCase());
    if (existing) return;
    const transEl = btn.querySelector(".vn-sel-trans");
    if (!transEl) return;
    // Tôn trọng cài đặt privacy: tắt "dịch nhanh khi bôi đen" → KHÔNG gọi mạng lúc
    // chọn chữ. Vẫn lưu bình thường (dịch sẽ chạy trong mini-card sau khi bấm Lưu).
    if (settings.previewTranslate === false) return;
    const cached = selTransCache.get(text);
    if (cached) {
      transEl.textContent = cached;
      positionSelBtn(rect);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    transEl.textContent = "…";
    transEl.classList.add("vn-sel-loading");
    const myToken = ++selBtnToken;
    autoTranslate(text, detectLang(text)).then(tr => {
      // Bỏ qua nếu user đã chọn từ khác trong lúc chờ
      if (myToken !== selBtnToken || selBtnCurrentText !== text) return;
      transEl.classList.remove("vn-sel-loading");
      if (isRealTranslation(text, tr)) {
        selTransCache.set(text, tr);
        transEl.textContent = tr;
      } else {
        // Không dịch được (viết tắt, tên riêng…) → coi như email/số: chỉ hiện nút Lưu
        transEl.textContent = "";
      }
      positionSelBtn(rect);
    });
  }

  function hideSelBtn() {
    if (selBtn) selBtn.style.display = "none";
    selBtnCurrentText = "";
  }

  document.addEventListener("mouseup", (e) => {
    if (settings.enabled === false || isHostBlacklisted()) { hideSelBtn(); return; }
    // Người dùng có thể tắt thanh nổi "Lưu" khi bôi đen (vẫn lưu được bằng
    // Alt+Shift+H hoặc chuột phải → "Tô sáng & lưu").
    if (settings.showSelButton === false) { hideSelBtn(); return; }
    if (e.target.closest && e.target.closest(
      ".vocab-note-sel-btn, .vocab-note-mini-card, .vocab-note-tooltip, .vocab-note-modal-overlay"
    )) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hideSelBtn(); return; }
      const text = sel.toString().trim();
      // Bỏ qua nếu chỉ chọn 1 ký tự hoặc quá dài
      if (!text || text.length < 2 || text.length > 2000) { hideSelBtn(); return; }
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { hideSelBtn(); return; }
        showSelBtn(rect, text);
      } catch (_) { hideSelBtn(); }
    }, 10);
  });

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) hideSelBtn();
  });

  document.addEventListener("mouseover", (e) => {
    const span = e.target.closest && e.target.closest(".vocab-note-highlight");
    if (!span) return;
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
    if (pinned && activeSpan && activeSpan.isConnected) {
      const rect = activeSpan.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const tip = tooltipEl;
      if (!tip) return;
      const tipRect = tip.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + tipRect.width > window.innerWidth - 10) left = window.innerWidth - tipRect.width - 10;
      if (top + tipRect.height > window.innerHeight - 10) top = rect.top - tipRect.height - 4;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, top) + "px";
    }
  }, { passive: true });

  function incrementHover(term) {
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
      if (!rec.learned && rec.hoverCount >= (rec.autoDeleteAt || 20)) {
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
        showToast(`🎓 Đã gặp đủ ${w.autoDeleteAt || 20} lần — đánh dấu "${w.term}" là đã thuộc`);
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
        // storage onChanged sẽ tự rescan, nhưng remove spans ngay để đỡ phải chờ
        document.querySelectorAll(`.vocab-note-highlight[data-term="${cssEscape(removed.term.toLowerCase())}"]`).forEach(el => {
          if (el.parentNode) {
            const txt = document.createTextNode(el.textContent);
            el.parentNode.replaceChild(txt, el);
          }
        });
        // Toast với nút Hoàn tác (giữ 6s)
        showToast(`Đã xoá "${removed.term}"`, {
          duration: 6000,
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

  function showToast(msg, opts = {}) {
    // Công tắc tắt toast là công tắc DUY NHẤT: tắt = ẩn TẤT CẢ toast (kể cả toast
    // có nút hành động như "Hoàn tác"). Bật = mọi toast hoạt động bình thường.
    if (settings.showToasts === false) return;

    const t = document.createElement("div");
    t.className = "vocab-note-toast" + (opts.warn ? " vn-warn" : "");

    const brand = document.createElement("img");
    brand.className = "vn-toast-brand";
    brand.src = BRAND_ICON;
    brand.alt = "";
    brand.draggable = false;
    t.appendChild(brand);

    const text = document.createElement("span");
    text.className = "vn-toast-text";
    text.textContent = msg;
    t.appendChild(text);

    if (opts.actions) {
      opts.actions.forEach(a => {
        const b = document.createElement("button");
        b.textContent = a.label;
        b.onclick = () => { a.onClick(); t.remove(); };
        t.appendChild(b);
      });
    }
    ensureToastStack().appendChild(t);
    const dur = opts.duration ?? (opts.actions ? 6000 : 3500);
    if (dur > 0) setTimeout(() => t.remove(), dur);
  }

  // ---------- Lấy phiên âm IPA (dictionaryapi.dev, miễn phí) ----------
  async function fetchPhonetic(term, lang) {
    if (lang !== "en") return ""; // chỉ EN hỗ trợ; JA dùng kana sẵn có
    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`;
      const res = await fetch(url);
      if (!res.ok) return "";
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]) return "";
      // Ưu tiên trường .phonetic; fallback duyệt mảng .phonetics
      if (data[0].phonetic) return data[0].phonetic;
      if (Array.isArray(data[0].phonetics)) {
        const p = data[0].phonetics.find(x => x && x.text);
        if (p) return p.text;
      }
    } catch (e) {}
    return "";
  }

  // ---------- Auto-translate qua Google Translate (endpoint công khai) ----------
  async function autoTranslate(text, srcLang) {
    try {
      // sl=auto: để Google tự nhận diện ngôn ngữ nguồn → dịch đúng cả từ Pháp/Đức/
      // Tây Ban Nha… Trước đây ép sl="en" khiến mọi từ không phải CJK bị coi là
      // tiếng Anh và dịch sai. (srcLang vẫn dùng cho phát âm/tra từ điển ở nơi khác.)
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) return "";
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        return data[0].map(seg => (seg && seg[0]) || "").join("").trim();
      }
    } catch (e) {}
    return "";
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
  function openAddMiniCard(term, anchorRect, prefetchedMeaning) {
    const existing = wordMap.get(term.toLowerCase()) || variantMap.get(term.toLowerCase());
    if (existing) {
      showToast(`"${term}" đã có trong danh sách rồi (gốc: "${existing.term}").`, { warn: true });
      return;
    }
    // Đóng mini-card cũ nếu có
    document.querySelectorAll(".vocab-note-mini-card").forEach(el => el.remove());

    const lang = detectLang(term);
    const card = document.createElement("div");
    card.className = "vocab-note-mini-card";
    card.innerHTML = `
      <div class="vn-mini-head">
        <span class="vn-mini-term" title="${escapeHtml(term)}">${escapeHtml(term)}</span>
        <span class="vn-mini-lang">${lang.toUpperCase()}</span>
        <button class="vn-mini-speak" title="Phát âm">${VN_ICON.speak}</button>
        ${actionPinned ? "" : `<button class="vn-mini-settings vn-mini-guide" title="Hướng dẫn sử dụng">${VN_ICON.help}</button>`}
        <button class="vn-mini-settings vn-mini-gear" title="Cài đặt">${VN_ICON.gear}</button>
        <button class="vn-mini-x" title="Đóng">${VN_ICON.close}</button>
      </div>
      <div class="vn-mini-body">
        <div class="vn-mini-phonetic" style="display:none"></div>
        <div class="vn-mini-meaning-view">⏳ Đang dịch…</div>
        <div class="vn-mini-edit" style="display:none">
          <input type="text" class="vn-mini-meaning-input" placeholder="Nghĩa" />
          <input type="text" class="vn-mini-note-input" placeholder="Ghi chú (tuỳ chọn)" />
        </div>
      </div>
      <div class="vn-mini-actions">
        <button class="vn-mini-btn vn-mini-edit-btn">${VN_ICON.edit} Sửa</button>
        <button class="vn-mini-btn vn-mini-primary vn-mini-save">${VN_ICON.save} Lưu</button>
      </div>
    `;
    document.body.appendChild(card);

    // Định vị sát selection nếu có, fallback góc dưới phải
    positionMiniCard(card, anchorRect);

    const meaningView = card.querySelector(".vn-mini-meaning-view");
    const editArea = card.querySelector(".vn-mini-edit");
    const meaningInput = card.querySelector(".vn-mini-meaning-input");
    const noteInput = card.querySelector(".vn-mini-note-input");
    const editBtn = card.querySelector(".vn-mini-edit-btn");
    const saveBtn = card.querySelector(".vn-mini-save");
    const closeBtn = card.querySelector(".vn-mini-x");
    const speakBtn = card.querySelector(".vn-mini-speak");
    speakBtn.onclick = () => speak(term, lang === "ja" ? "ja-JP" : "en-US");
    const miniGuideBtn = card.querySelector(".vn-mini-guide");
    if (miniGuideBtn) miniGuideBtn.onclick = () => openExtPage("welcome");
    const miniGearBtn = card.querySelector(".vn-mini-gear");
    if (miniGearBtn) miniGearBtn.onclick = () => openExtPage("options");

    let isEditing = false;
    let fetchedPhonetic = "";

    // Không dịch được (email/số/URL/đoạn dài): bỏ qua phiên âm + dịch,
    // mở sẵn chế độ sửa với ô Nghĩa để trống cho user tự ghi.
    const translatable = looksTranslatable(term);
    if (!translatable) {
      meaningInput.value = "";
      noteInput.value = "";
      toggleEdit(); // sang chế độ sửa, focus ô Nghĩa (input đang rỗng)
    }

    // Lấy phiên âm song song (chỉ với từ/cụm dịch được)
    if (translatable) fetchPhonetic(term, lang).then(p => {
      if (!p) return;
      fetchedPhonetic = p;
      const el = card.querySelector(".vn-mini-phonetic");
      el.textContent = p;
      el.style.display = "block";
      positionMiniCard(card, anchorRect); // chiều cao thay đổi → đặt lại
    });

    // Auto dịch — dùng bản đã dịch sẵn (preview từ nút Lưu) nếu có để hiện ngay
    const online = typeof navigator !== "undefined" ? navigator.onLine !== false : true;
    if (!translatable) {
      // đã mở sẵn ô nhập ở trên — không dịch
    } else if (prefetchedMeaning) {
      meaningView.textContent = prefetchedMeaning;
      meaningView.classList.remove("vn-mini-empty");
      meaningInput.value = prefetchedMeaning;
    } else if (!online) {
      meaningView.textContent = "(không có mạng — bấm Sửa để nhập tay)";
      meaningView.classList.add("vn-mini-empty");
    } else {
      autoTranslate(term, lang).then(translated => {
        if (isRealTranslation(term, translated)) {
          meaningView.textContent = translated;
          meaningView.classList.remove("vn-mini-empty");
          meaningInput.value = translated;
        } else {
          // Không dịch được (viết tắt, tên riêng, từ Việt không dấu…) → mở sẵn ô
          // nhập trống như trường hợp email/số.
          meaningInput.value = "";
          if (!isEditing) toggleEdit();
        }
        positionMiniCard(card, anchorRect);
      });
    }

    function toggleEdit() {
      isEditing = !isEditing;
      if (isEditing) {
        meaningView.style.display = "none";
        editArea.style.display = "block";
        editBtn.textContent = "👁 Xem";
        meaningInput.focus();
        meaningInput.select();
      } else {
        const v = meaningInput.value.trim();
        meaningView.textContent = v || "(chưa có nghĩa)";
        meaningView.classList.toggle("vn-mini-empty", !v);
        meaningView.style.display = "block";
        editArea.style.display = "none";
        editBtn.textContent = "✏ Sửa";
      }
    }

    function doSave() {
      const meaning = meaningInput.value.trim();
      const note = noteInput.value.trim();
      const newWord = {
        id: "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        term: term,
        lang: lang,
        phonetic: fetchedPhonetic || "",
        meaning: meaning,
        note: note,
        hoverCount: 0,
        autoDeleteAt: settings.defaultThreshold,
        createdAt: new Date().toISOString()
      };
      // Atomic add: tránh ghi đè khi nhiều tab cùng thêm
      chrome.storage.local.get("words", (data) => {
        const arr = data.words || [];
        if (arr.some(x => x.term.toLowerCase() === newWord.term.toLowerCase())) {
          closeCard();
          showToast(`"${newWord.term}" đã có rồi`, { warn: true });
          return;
        }
        arr.push(newWord);
        chrome.storage.local.set({ words: arr }, () => {
          closeCard();
          showToast(`Đã lưu "${newWord.term}"`); // tôn trọng cài đặt tắt toast
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
      closeCard();
    }
    // Trì hoãn 1 nhịp để không bắt ngay chính cú click vừa mở card
    setTimeout(() => document.addEventListener("mousedown", onOutsideClick, true), 0);

    editBtn.onclick = toggleEdit;
    saveBtn.onclick = doSave;
    closeBtn.onclick = closeCard;

    [meaningInput, noteInput].forEach(inp => {
      inp.addEventListener("keydown", (e) => {
        // Bỏ qua khi đang gõ IME (fcitx5, unikey…)
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter") doSave();
        if (e.key === "Escape") closeCard();
      });
    });
  }
  // Alias để giữ tương thích với message cũ
  const openAddModal = openAddMiniCard;

  // ---------- Message từ background / popup (gộp 1 listener) ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    switch (msg.type) {
      case "PROMPT_ADD_WORD":
        openAddModal(msg.term);
        break;
      case "ADD_FROM_SELECTION": {
        const sel = window.getSelection && window.getSelection().toString().trim();
        if (!sel) showToast("Bôi đen từ/đoạn cần lưu rồi bấm Alt+Shift+H", { warn: true });
        else if (sel.length > 2000) showToast("Đoạn quá dài (tối đa 2000 ký tự)", { warn: true });
        else openAddModal(sel);
        break;
      }
      case "FORCE_RESCAN":
        loadData(() => {
          if (!isHostBlacklisted()) rescanFullPage();
          else removeAllHighlights();
        });
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
      // Tắt extension / tắt thanh "Lưu" → ẩn ngay thanh chọn đang hiển thị
      if (settings.enabled === false || settings.showSelButton === false) hideSelBtn();
      // Áp ngay màu/kiểu/độ dày highlight (kể cả khi không đổi danh sách từ)
      applyHighlightVars();
      // Kiểm tra blacklist trang hiện tại
      if (isHostBlacklisted()) {
        hideSelBtn();
        removeAllHighlights();
        words = changes.words ? (changes.words.newValue || []) : words;
        rebuildIndex();
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
  });

  function isHostBlacklisted() {
    const list = settings.blacklistedHosts || [];
    const host = location.hostname;
    return list.some(h => host === h || host.endsWith("." + h));
  }

  // ---------- MutationObserver cho SPA ----------
  let mutationDebounce = null;
  let pendingMutationNodes = [];
  const observer = new MutationObserver((mutations) => {
    if (!combinedRegex) return;
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
      for (const node of nodes) {
        if (!node.isConnected) continue; // node đã bị gỡ khỏi DOM trước khi xử lý
        if (node.nodeType === 1) scanNode(node);
        else if (node.nodeType === 3 && !shouldSkip(node)) highlightTextNode(node);
      }
    }, 300);
  });

  // ---------- Init ----------
  function init() {
    loadData(() => {
      if (document.body) {
        if (!isHostBlacklisted()) scanNode(document.body);
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
