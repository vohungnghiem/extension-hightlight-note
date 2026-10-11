// Popup / Side Panel: quản lý danh sách, lọc nhanh, thêm mục, ôn tập, sao lưu.

const $ = (id) => document.getElementById(id);
const { VN_TYPES, detectLang, isVietnamese, speak, hostBlocked } = self.HN_CONST;

let words = [];
let settings = {};
let composerType = "vocab"; // loại đang chọn ở màn hình Thêm
let statusFilter = "all";   // all | page | learned | disabled
let typeFilter = "all";     // lọc theo loại
let tagFilter = null;       // lọc theo 1 tag (null = không lọc)
let pageIds = null;         // Set id các mục đang hiện trên trang (null = chưa biết / không hỏi được)
let renderLimit = 150;      // danh sách dài → hiện dần cho nhanh
const PAGE_SIZE = 150;

// ---------- Chế độ hiển thị ----------
// popup mặc định · cửa sổ riêng (?window=1) · Side Panel (?panel=1).
// Side Panel là document thật → gõ tiếng Việt (fcitx5/ibus) chạy bình thường.
const urlParams = new URLSearchParams(location.search);
const isWindowMode = urlParams.get("window") === "1";
const isSidePanel = urlParams.get("panel") === "1";
const focusTarget = urlParams.get("focus");
if (isWindowMode) document.body.classList.add("window-mode");
if (isSidePanel) document.body.classList.add("panel-mode");

// Nhớ windowId ngay khi load để nút mở Side Panel gọi sidePanel.open() đồng bộ
// trong user-gesture (await trước lời gọi có thể làm mất tư cách gesture).
let currentWindowId = null;
try { chrome.windows.getCurrent(w => { if (w) currentWindowId = w.id; }); } catch (e) {}

// Trong window mode, sau khi lưu xong tự đóng cửa sổ (tránh window mồ côi)
function autoCloseIfWindow() {
  if (!isWindowMode) return;
  setTimeout(() => {
    try {
      chrome.windows.getCurrent((w) => {
        if (w && w.id != null) chrome.windows.remove(w.id);
        else window.close();
      });
    } catch (e) { window.close(); }
  }, 500);
}

// ---------- Icon ----------
const svg = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON = {
  learn: svg('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  unlearn: svg('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  eye: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
  edit: svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
  del: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  speak: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  open: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
  sun: svg('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'),
  moon: svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  globe: svg('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  block: svg('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'),
  pin: svg('<path d="M12 17v5"/><path d="M9 10.76V6h6v4.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V17H5v-1.76a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 10.76z"/><path d="M8 6h8"/>'),
  highlight: svg('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>')
};
const TYPE_ICON = {
  vocab:     svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  important: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  todo:      svg('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  question:  svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  reference: svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>')
};
const TYPE_DESC = {
  vocab:     "Từ vựng để học — tự dịch, phát âm, ôn tập giãn cách.",
  important: "Điểm quan trọng — tô đỏ trên trang để dễ thấy lại.",
  todo:      "Việc cần làm — tô xanh lá, đánh dấu xong khi hoàn tất.",
  question:  "Câu hỏi cần giải đáp — tô tím để quay lại tìm câu trả lời.",
  reference: "Tư liệu tham khảo — tô xanh ngọc, lưu nguồn cần đọc."
};

const typeOf = (w) => (w && VN_TYPES[w.type]) ? w.type : "vocab";
function doneLabel(w) {
  const t = typeOf(w);
  return t === "vocab" ? "đã thuộc" : t === "todo" ? "đã xong" : "đã xử lý";
}
function langOf(w) {
  const l = w.lang || detectLang(w.term);
  return (l === "en" && isVietnamese(w.term)) ? "vi" : l;
}

// ---------- Tag ----------
function parseTags(str) {
  return [...new Set(
    String(str || "").split(",").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean).map(s => s.slice(0, 40))
  )].slice(0, 20);
}
function tagsToStr(tags) { return (tags || []).join(", "); }
function hasTag(w, tag) {
  const t = String(tag || "").toLowerCase();
  return (w.tags || []).some(x => String(x).toLowerCase() === t);
}
function usedTags() {
  const map = new Map(); // lower -> { label, count }
  for (const w of words) for (const t of (w.tags || [])) {
    const k = String(t).toLowerCase();
    if (!map.has(k)) map.set(k, { label: t, count: 0 });
    map.get(k).count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function relDate(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (isNaN(d)) return "";
  if (d <= 0) return "hôm nay";
  if (d === 1) return "hôm qua";
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}
function hostOf(url) {
  try { return new URL(url).hostname || url; } catch { return url || ""; }
}
function levelOf(w) {
  if (w.learned) return "learned";
  const p = (w.hoverCount || 0) / (w.autoDeleteAt || 20);
  if (p >= 0.7) return "hot";
  if (p >= 0.3) return "warm";
  return "new";
}
function debounce(fn, ms) {
  let h;
  return (...args) => { clearTimeout(h); h = setTimeout(() => fn(...args), ms); };
}
function newId() {
  return "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}
function imeSafe(handler) {
  return (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    handler(e);
  };
}
function autoGrow(ta, max = 140) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight + 2, max) + "px";
}
// storage.onChanged thay `words` bằng BẢN SAO mới sau mỗi lần lưu → object giữ trong
// closure (buổi ôn, form sửa, nút Hoàn tác) bị "cũ". Luôn tra lại theo id trước khi sửa,
// nếu không thay đổi sẽ ghi vào object cũ và bị mất (trước đây buổi ôn chỉ lưu thẻ đầu).
function byId(id) { return words.find(x => x.id === id) || null; }
function saveSettings() { chrome.storage.local.set({ settings }); }
function save() { chrome.storage.local.set({ words }); }

// ---------- Dịch + phiên âm (dùng cho màn hình Thêm) ----------
function looksTranslatable(text) {
  const t = (text || "").trim();
  if (!t || t.length > 1500) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return false;
  if (isVietnamese(t)) return false;
  return /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ㐀-鿿가-힯]/.test(t);
}
const _trCache = new Map();
async function translateText(text) {
  const key = text.trim();
  if (_trCache.has(key)) return _trCache.get(key);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const out = data[0].map(seg => (seg && seg[0]) || "").join("").trim();
    const lang = typeof data[2] === "string" ? data[2].toLowerCase() : "";
    const r = { text: out && out.toLowerCase() !== key.toLowerCase() ? out : "", lang };
    _trCache.set(key, r);
    return r;
  } catch (e) { return null; }
}
async function fetchPhonetic(term) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
    if (!res.ok) return "";
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return "";
    if (data[0].phonetic) return data[0].phonetic;
    const ph = (data[0].phonetics || []).find(x => x && x.text);
    return ph ? ph.text : "";
  } catch (e) { return ""; }
}

// ---------- Theme ----------
function effectiveTheme() {
  const t = settings.theme || "auto";
  if (t === "light" || t === "dark") return t;
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}
function applyTheme() {
  const eff = effectiveTheme();
  document.documentElement.setAttribute("data-theme", eff);
  try { localStorage.setItem("hn-theme", settings.theme || "auto"); } catch (e) {} // cho theme-init.js
  const btn = $("themeBtn");
  btn.innerHTML = eff === "dark" ? ICON.sun : ICON.moon;
  btn.title = eff === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối";
}
$("themeBtn").onclick = () => {
  settings.theme = effectiveTheme() === "dark" ? "light" : "dark";
  saveSettings();
  applyTheme();
};
try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!settings.theme || settings.theme === "auto") applyTheme();
  });
} catch (e) {}

// ---------- Toast (thay alert của trình duyệt) ----------
let toastTimer = null;
function toast(msg, kind = "", action = null) {
  const t = $("toast");
  t.className = "popup-toast" + (kind ? " " + kind : "");
  t.querySelector(".toast-text").textContent = msg;
  const btn = t.querySelector(".toast-act");
  if (action) {
    btn.hidden = false;
    btn.textContent = action.label;
    btn.onclick = () => { t.hidden = true; clearTimeout(toastTimer); action.onClick(); };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 2600);
}

// ---------- Load ----------
function load() {
  chrome.storage.local.get(["words", "settings"], (data) => {
    words = data.words || [];
    settings = data.settings || { defaultThreshold: 20 };
    if (settings.enabled === undefined) settings.enabled = true;
    // Migration: gán lang + type cho mục cũ (mặc định = từ vựng)
    let migrated = false;
    for (const w of words) {
      if (!w.lang) { w.lang = detectLang(w.term); migrated = true; }
      if (!w.type) { w.type = "vocab"; migrated = true; }
    }
    if (migrated) save();
    applyTheme();
    $("enabledToggle").checked = settings.enabled !== false;
    renderTypePicker();
    render();
    refreshSync();
    renderSiteBar();
    refreshPageItems();
    if (!isWindowMode && !isSidePanel) setTimeout(() => $("searchInput").focus(), 30);
  });
}

$("enabledToggle").addEventListener("change", () => {
  settings.enabled = $("enabledToggle").checked;
  saveSettings();
  render();
  toast(settings.enabled ? "Đã bật tô sáng" : "Đã tắt tô sáng trên mọi trang");
});

// ---------- Lọc ----------
function matchesSearch(w, raw) {
  if (!raw) return true;
  if (raw.startsWith("#")) {
    const q = raw.slice(1).toLowerCase();
    return (w.tags || []).some(t => String(t).toLowerCase().includes(q));
  }
  const k = raw.toLowerCase();
  return w.term.toLowerCase().includes(k) ||
    (w.meaning || "").toLowerCase().includes(k) ||
    (w.note || "").toLowerCase().includes(k) ||
    (w.tags || []).some(t => String(t).toLowerCase().includes(k));
}
function statusMatch(w, st) {
  if (st === "learned") return !!w.learned;
  if (st === "disabled") return !!w.disabled && !w.learned;
  if (st === "page") return !!(pageIds && pageIds.has(w.id));
  return !w.learned;
}
function filteredWords() {
  const raw = $("searchInput").value.trim();
  return words.filter(w =>
    statusMatch(w, statusFilter) &&
    (typeFilter === "all" || typeOf(w) === typeFilter) &&
    (!tagFilter || hasTag(w, tagFilter)) &&
    matchesSearch(w, raw));
}
function clearFilters() {
  statusFilter = "all"; typeFilter = "all"; tagFilter = null;
  $("searchInput").value = "";
  render();
}

function renderChips() {
  const row = $("chipRow");
  const n = (st) => words.filter(w => statusMatch(w, st)).length;
  const nPage = pageIds ? n("page") : 0;
  const nLearned = n("learned");
  const nDisabled = n("disabled");
  const chip = (st, label, count, extra = "") =>
    `<button class="chip${statusFilter === st ? " active" : ""}${extra}" data-status="${st}">${label}<span class="n">${count}</span></button>`;
  let html = chip("all", "Tất cả", n("all"));
  if (nPage || statusFilter === "page") html += chip("page", `${ICON.highlight} Trang này`, nPage, " page");
  if (nLearned || statusFilter === "learned") {
    // Nhãn theo đúng loại đang có: học từ → "Đã thuộc", việc/ghi chú → "Đã xong".
    const lt = new Set(words.filter(w => w.learned).map(w => typeOf(w) === "vocab"));
    html += chip("learned", lt.size === 2 ? "Đã thuộc / xong" : lt.has(false) ? "Đã xong" : "Đã thuộc", nLearned);
  }
  if (nDisabled || statusFilter === "disabled") html += chip("disabled", "Tạm ẩn", nDisabled);

  // Lọc theo loại — chỉ hiện khi đang dùng >1 loại (giữ gọn cho ai chỉ học từ).
  const used = new Set(words.map(typeOf));
  if (typeFilter !== "all" && !used.has(typeFilter)) typeFilter = "all";
  if (used.size > 1) {
    html += `<span class="chip-sep"></span>`;
    for (const t of Object.keys(VN_TYPES)) {
      if (!used.has(t)) continue;
      html += `<button class="chip${typeFilter === t ? " active" : ""}" data-type="${t}" data-vn-type="${t}" title="Chỉ hiện ${escapeHtml(VN_TYPES[t].label)} (bấm lần nữa để bỏ lọc)">${TYPE_ICON[t]}${VN_TYPES[t].label}</button>`;
    }
  }
  row.innerHTML = html;

  // Tag
  const bar = $("tagBar");
  const tags = usedTags();
  if (tagFilter && !tags.some(t => t.label.toLowerCase() === tagFilter.toLowerCase())) tagFilter = null;
  if (!tags.length) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = tags.map(t =>
    `<button class="chip tag${tagFilter && tagFilter.toLowerCase() === t.label.toLowerCase() ? " active" : ""}" data-tag="${escapeHtml(t.label)}"><span class="hash">#</span>${escapeHtml(t.label)}<span class="n">${t.count}</span></button>`
  ).join("");
}
$("chipRow").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  if (b.dataset.status) statusFilter = b.dataset.status;
  if (b.dataset.type) typeFilter = typeFilter === b.dataset.type ? "all" : b.dataset.type;
  renderLimit = PAGE_SIZE;
  render();
});
$("tagBar").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  const t = b.dataset.tag;
  tagFilter = tagFilter && tagFilter.toLowerCase() === t.toLowerCase() ? null : t;
  renderLimit = PAGE_SIZE;
  render();
});

// ---------- Render danh sách ----------
const sorters = {
  newest: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
  oldest: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""),
  alpha: (a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()),
  hoverDesc: (a, b) => (b.hoverCount || 0) - (a.hoverCount || 0),
  hoverAsc: (a, b) => (a.hoverCount || 0) - (b.hoverCount || 0),
  closest: (a, b) => ((b.hoverCount || 0) / (b.autoDeleteAt || 20)) - ((a.hoverCount || 0) / (a.autoDeleteAt || 20))
};

function tagChipsHtml(w) {
  if (!w.tags || !w.tags.length) return "";
  return `<div class="tags">` + w.tags.map(t =>
    `<button class="tag-chip" data-act="tag" data-tag="${escapeHtml(t)}" title="Lọc theo tag">#${escapeHtml(t)}</button>`
  ).join("") + `</div>`;
}
function actBtn(act, icon, title, extraClass = "") {
  return `<button class="act-${act}${extraClass}" data-act="${act}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${icon}</button>`;
}

function itemHtml(w) {
  const vt = typeOf(w);
  if (w.sticky) {
    const src = w.url ? `<a class="src-link" data-act="open" title="${escapeHtml(w.pageTitle || w.url)}">${escapeHtml(hostOf(w.url))}</a>` : "";
    return `
      <div class="item sticky-item${w.disabled ? " disabled" : ""}" data-id="${w.id}" data-vn-type="${vt}">
        <div class="info">
          <div class="term"><span class="type-badge sticky">${ICON.pin} Ghi chú trang</span></div>
          <div class="meaning">${escapeHtml(w.term)}</div>
          ${w.note ? `<div class="note">${escapeHtml(w.note)}</div>` : ""}
          ${tagChipsHtml(w)}
          <div class="meta">${w.disabled ? `<span class="status-tag">Đang ẩn trên trang</span><span class="dot-sep">·</span>` : ""}<span>${relDate(w.createdAt)}</span>${src ? `<span class="dot-sep">·</span>${src}` : ""}</div>
        </div>
        <div class="actions">
          ${w.url ? actBtn("open", ICON.open, "Mở trang có ghi chú") : ""}
          ${actBtn("toggle", w.disabled ? ICON.eyeOff : ICON.eye, w.disabled ? "Hiện lại trên trang" : "Ẩn trên trang (vẫn giữ)")}
          ${actBtn("edit", ICON.edit, "Sửa")}
          ${actBtn("del", ICON.del, "Xoá")}
        </div>
      </div>`;
  }
  // Màu viền theo mức học (đỏ/cam/xanh) chỉ có nghĩa ở chế độ học từ.
  const lv = learningOn ? levelOf(w) : "plain";
  const lang = langOf(w);
  const isVocab = vt === "vocab";
  const long = w.term.length > 120;
  const threshold = w.autoDeleteAt || 20;
  const pct = Math.min(100, Math.round(((w.hoverCount || 0) / threshold) * 100));
  const canSpeak = isVocab && lang !== "vi";
  const typeBadge = !isVocab ? `<span class="type-badge" data-vn-type="${vt}">${TYPE_ICON[vt]}${VN_TYPES[vt].label}</span>` : "";
  const langTag = (isVocab && lang !== "vi") ? `<span class="lang-tag lang-${escapeHtml(lang)}">${escapeHtml(lang.toUpperCase())}</span>` : "";

  const meta = [];
  if (w.learned) meta.push(`<span class="status-tag">${isVocab ? "🎓" : "✓"} ${doneLabel(w)}</span>`);
  else if (w.disabled) meta.push(`<span class="status-tag">Đang tạm ẩn</span>`);
  if (isVocab && learningOn && !w.learned && !w.disabled) {
    meta.push(`<span class="mini-progress" title="Đã gặp ${w.hoverCount || 0}/${threshold} lần — đủ sẽ tự đánh dấu đã thuộc"><i style="width:${pct}%"></i></span><span class="seen" title="Số lần gặp / ngưỡng">${w.hoverCount || 0}/${threshold}</span>`);
    if (w.srsDue) meta.push(`<span class="srs-due" title="Lịch ôn giãn cách">${srsDueLabel(w.srsDue)}</span>`);
  }
  if (!isVocab || !learningOn) meta.push(`<span>${relDate(w.createdAt)}</span>`);
  if (w.url) meta.push(`<a class="src-link" data-act="open" title="Mở trang nguồn: ${escapeHtml(w.pageTitle || w.url)}">🔗 ${escapeHtml(hostOf(w.url))}</a>`);

  const actions = w.learned
    ? actBtn("unlearn", ICON.unlearn, `Bỏ đánh dấu ${doneLabel(w)} (tô sáng lại)`) + actBtn("edit", ICON.edit, "Sửa") + actBtn("del", ICON.del, "Xoá")
    : (!isVocab || learningOn ? actBtn("learn", isVocab ? ICON.learn : ICON.check, `Đánh dấu ${doneLabel(w)} (giữ mục, ngừng tô sáng)`) : "")
      + actBtn("toggle", w.disabled ? ICON.eyeOff : ICON.eye, w.disabled ? "Bật lại tô sáng" : "Tạm ẩn tô sáng (vẫn giữ trong danh sách)")
      + actBtn("edit", ICON.edit, "Sửa")
      + actBtn("del", ICON.del, "Xoá");

  return `
    <div class="item lv-${lv}${w.disabled ? " disabled" : ""}${w.learned ? " learned" : ""}" data-id="${w.id}" data-vn-type="${vt}">
      <div class="info">
        <div class="term">
          <span class="term-text${long ? " clamp" : ""}"${long ? ` data-act="expand" title="Bấm để xem đầy đủ"` : ""}>${escapeHtml(w.term)}</span>
          ${langTag}
          ${canSpeak ? `<button class="spk" data-act="speak" title="Nghe phát âm" aria-label="Nghe phát âm">${ICON.speak}</button>` : ""}
          ${typeBadge}
        </div>
        ${w.phonetic ? `<div class="phon">${escapeHtml(w.phonetic)}</div>` : ""}
        ${w.meaning ? `<div class="meaning">${escapeHtml(w.meaning)}</div>` : ""}
        ${w.note ? `<div class="note">${escapeHtml(w.note)}</div>` : ""}
        ${tagChipsHtml(w)}
        ${meta.length ? `<div class="meta">${meta.join('<span class="dot-sep">·</span>')}</div>` : ""}
      </div>
      <div class="actions">${actions}</div>
    </div>`;
}

function emptyHtml() {
  if (words.length === 0) {
    return `
      <div class="empty">
        <div class="em-ico">${ICON.highlight}</div>
        <h4>Bắt đầu trong 5 giây</h4>
        <ol>
          <li>Mở một trang web bất kỳ và <b>bôi đen</b> một từ hoặc đoạn.</li>
          <li>Bấm <b>Lưu</b> trên thanh nổi lên ngay cạnh (hoặc <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd>). Chỉ muốn xem nghĩa thì bấm <b>Dịch</b>.</li>
          <li>Từ đó tự được <b>tô sáng</b> mỗi khi gặp lại — rê chuột để xem nghĩa.</li>
        </ol>
        <div class="em-acts">
          <button class="primary" data-act="add-first">＋ Thêm thủ công</button>
          <button data-act="help">Xem hướng dẫn</button>
        </div>
      </div>`;
  }
  if (statusFilter === "page") {
    return `<div class="empty"><h4>Trang này chưa có mục nào</h4>Bôi đen chữ trên trang và bấm <b>Lưu</b> để thêm.<div class="em-acts" style="margin-top:12px"><button data-act="clear-filters">Xem tất cả</button></div></div>`;
  }
  return `<div class="empty"><h4>Không có mục nào khớp</h4>Thử từ khoá khác hoặc bỏ bớt bộ lọc.<div class="em-acts" style="margin-top:12px"><button data-act="clear-filters">Bỏ lọc</button></div></div>`;
}

let learningOn = false; // Chế độ học từ đang bật (và có từ vựng) → hiện tiến độ học
function render() {
  renderChips();
  renderReviewBar();
  const list = $("list");
  if (list.querySelector(".item.editing")) return; // đang sửa dở → không vẽ lại mất chữ
  learningOn = reviewState().eligible;
  // Sắp xếp theo tiến độ học chỉ có nghĩa khi đang học từ.
  const sortSel = $("sortSel");
  for (const o of sortSel.options) {
    if (["closest", "hoverDesc", "hoverAsc"].includes(o.value)) o.hidden = !learningOn;
  }
  if (sortSel.selectedOptions[0] && sortSel.selectedOptions[0].hidden) sortSel.value = "newest";
  const sorted = filteredWords().sort(sorters[$("sortSel").value] || sorters.newest);

  let html = "";
  // Bản mới tắt Chế độ học từ mặc định. Ai đã từng ôn tập thì hỏi 1 lần (tới khi chọn).
  if (settings.learningMode === undefined && words.some(w => w.srsLast)) {
    html += `<div class="notice learn-notice"><span>Ôn tập &amp; nhắc nhở giờ <b>tắt mặc định</b> cho popup gọn. Bạn vẫn đang học từ?</span>
      <button data-act="learn-on">Bật lại</button><button data-act="learn-off" class="ghost">Để tắt</button></div>`;
  }
  if (settings.enabled === false) {
    html += `<div class="notice"><span>⏸ Tô sáng đang TẮT trên mọi trang</span><button data-act="enable">Bật lại</button></div>`;
  }
  if (sorted.length === 0) {
    list.innerHTML = html + emptyHtml();
    return;
  }
  html += sorted.slice(0, renderLimit).map(itemHtml).join("");
  if (sorted.length > renderLimit) {
    html += `<div class="more-wrap"><button data-act="more">Hiện thêm (${sorted.length - renderLimit} mục)</button></div>`;
  }
  list.innerHTML = html;
}

// Một listener cho cả danh sách (event delegation) thay vì gắn từng nút.
$("list").addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const itemEl = el.closest(".item");
  const w = itemEl ? words.find(x => x.id === itemEl.dataset.id) : null;
  switch (act) {
    case "enable":
      settings.enabled = true; $("enabledToggle").checked = true; saveSettings(); render(); return;
    case "more": renderLimit += PAGE_SIZE; render(); return;
    case "clear-filters": clearFilters(); return;
    case "add-first": openAddScreen(); return;
    case "help": openHelp(); return;
    case "learn-on": setLearning(true); return;
    case "learn-off": setLearning(false); return;
  }
  if (!w) return;
  switch (act) {
    case "expand": el.classList.toggle("open"); break;
    case "speak": speak(w.term, langOf(w)); break;
    case "tag": tagFilter = el.dataset.tag || null; renderLimit = PAGE_SIZE; render(); break;
    case "open": if (w.url) chrome.tabs.create({ url: w.url }); break;
    case "learn":
      w.learned = true; w.learnedAt = new Date().toISOString();
      save(); render();
      toast(`"${short(w.term)}" — ${doneLabel(w)}`, "success", {
        label: "Hoàn tác", onClick: () => {
          const cur = byId(w.id);
          if (cur) { cur.learned = false; delete cur.learnedAt; save(); render(); }
        }
      });
      break;
    case "unlearn":
      w.learned = false; delete w.learnedAt;
      save(); render();
      toast(`Đã tô sáng lại "${short(w.term)}"`);
      break;
    case "toggle":
      w.disabled = !w.disabled;
      save(); render();
      break;
    case "edit": startInlineEdit(itemEl, w); break;
    case "del": deleteWord(w); break;
  }
});

function short(s, n = 36) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; }

// Xoá ngay + cho hoàn tác (không hỏi xác nhận — nhanh mà vẫn an toàn).
function deleteWord(w) {
  const idx = words.findIndex(x => x.id === w.id);
  if (idx === -1) return;
  const removed = words.splice(idx, 1)[0];
  save(); render();
  toast(`Đã xoá "${short(removed.term)}"`, "", {
    label: "Hoàn tác",
    onClick: () => {
      if (words.some(x => x.id === removed.id)) return;
      words.splice(Math.min(idx, words.length), 0, removed);
      save(); render();
    }
  });
}

// ---------- Sửa trực tiếp trong danh sách ----------
function startInlineEdit(itemEl, w) {
  if (!itemEl) return;
  const info = itemEl.querySelector(".info");
  const isSticky = !!w.sticky;
  const typeOpts = Object.keys(VN_TYPES).map(t =>
    `<option value="${t}"${typeOf(w) === t ? " selected" : ""}>${VN_TYPES[t].icon} ${VN_TYPES[t].label}</option>`).join("");
  info.innerHTML = `
    <div class="edit-form">
      <label>${isSticky ? "Nội dung ghi chú" : "Từ / cụm từ"}</label>
      <textarea class="ef-term" rows="1">${escapeHtml(w.term)}</textarea>
      ${isSticky ? "" : `<label>Loại</label><select class="ef-type">${typeOpts}</select>
      <label>Nghĩa / mô tả</label>
      <textarea class="ef-meaning" rows="1" placeholder="Nghĩa">${escapeHtml(w.meaning || "")}</textarea>`}
      <label>Ghi chú</label>
      <input type="text" class="ef-note" value="${escapeHtml(w.note || "")}" placeholder="Ghi chú (tuỳ chọn)" />
      <label>Tag</label>
      <input type="text" class="ef-tags" value="${escapeHtml(tagsToStr(w.tags))}" placeholder="Cách nhau bởi dấu phẩy" />
      <div class="ef-acts">
        <span class="kbd-hint"><kbd>Enter</kbd> lưu · <kbd>Esc</kbd> huỷ</span>
        <button class="btn-cancel ef-cancel">Huỷ</button>
        <button class="btn-primary ef-save">Lưu</button>
      </div>
    </div>`;
  itemEl.classList.add("editing");
  const termInput = info.querySelector(".ef-term");
  const meaningInput = info.querySelector(".ef-meaning");
  const noteInput = info.querySelector(".ef-note");
  const tagsInput = info.querySelector(".ef-tags");
  [termInput, meaningInput].forEach(ta => {
    if (!ta) return;
    autoGrow(ta);
    ta.addEventListener("input", () => autoGrow(ta));
  });
  const focusEl = meaningInput || termInput;
  focusEl.focus();
  focusEl.setSelectionRange(focusEl.value.length, focusEl.value.length);

  const finish = () => { itemEl.classList.remove("editing"); render(); };
  const doSave = () => {
    w = byId(w.id) || w; // dữ liệu có thể vừa được làm mới khi đang sửa
    const newTerm = termInput.value.trim();
    if (!newTerm) { toast(isSticky ? "Ghi chú đang trống" : "Từ không được để trống", "error"); return; }
    if (!isSticky && words.some(x => x.id !== w.id && !x.sticky && x.term.toLowerCase() === newTerm.toLowerCase())) {
      toast(`"${short(newTerm)}" đã có trong danh sách`, "error");
      return;
    }
    if (newTerm !== w.term) { w.term = newTerm; if (!isSticky) w.lang = detectLang(newTerm); }
    const typeSel = info.querySelector(".ef-type");
    if (typeSel) w.type = typeSel.value;
    if (meaningInput) w.meaning = meaningInput.value.trim();
    w.note = noteInput.value.trim();
    const tags = parseTags(tagsInput.value);
    if (tags.length) w.tags = tags; else delete w.tags;
    itemEl.classList.remove("editing");
    save(); render();
    toast("Đã lưu", "success");
    autoCloseIfWindow();
  };
  info.querySelector(".ef-save").onclick = doSave;
  info.querySelector(".ef-cancel").onclick = finish;
  info.querySelectorAll("input, textarea, select").forEach(inp => {
    inp.addEventListener("keydown", imeSafe(e => {
      if (e.key === "Enter" && !e.shiftKey && inp.tagName !== "SELECT") { e.preventDefault(); doSave(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(); }
    }));
  });
}

// ---------- Màn hình Thêm mục ----------
let meaningDirty = false;
let autoTr = null; // { term, text, lang } bản dịch tự động mới nhất
function openAddScreen(prefill) {
  $("addScreen").hidden = false;
  closeMenu();
  const dl = $("tagSuggest");
  dl.innerHTML = usedTags().slice(0, 30).map(t => `<option value="${escapeHtml(t.label)}">`).join("");
  if (prefill) { $("termInput").value = prefill; onTermInput(); }
  setTimeout(() => $("termInput").focus(), 40);
}
function closeAddScreen() {
  $("addScreen").hidden = true;
  ["termInput", "meaningInput", "noteInput", "tagsInput"].forEach(id => { $(id).value = ""; });
  meaningDirty = false; autoTr = null;
  setMeaningHint("");
  autoGrow($("termInput"), 130); autoGrow($("meaningInput"));
}
$("openAddBtn").onclick = () => openAddScreen();
$("addBack").onclick = closeAddScreen;

function setMeaningHint(text, ok) {
  const el = $("meaningHint");
  el.textContent = text ? "· " + text : "";
  el.className = "opt" + (ok ? " ok" : "");
}

function renderTypePicker() {
  const box = $("typePicker");
  box.innerHTML = Object.keys(VN_TYPES).map(t =>
    `<button type="button" class="tp-chip${t === composerType ? " active" : ""}" data-type="${t}" data-vn-type="${t}" aria-pressed="${t === composerType}">${TYPE_ICON[t]}${VN_TYPES[t].label}</button>`
  ).join("");
  $("typeHint").textContent = TYPE_DESC[composerType] || "";
}
$("typePicker").addEventListener("click", (e) => {
  const b = e.target.closest(".tp-chip");
  if (!b) return;
  composerType = b.dataset.type;
  renderTypePicker();
});

const autoTranslate = debounce(async () => {
  const term = $("termInput").value.trim();
  if (!term || meaningDirty || !looksTranslatable(term) || settings.previewTranslate === false) {
    if (!term) setMeaningHint("");
    return;
  }
  setMeaningHint("đang dịch…");
  const r = await translateText(term);
  if ($("termInput").value.trim() !== term || meaningDirty) return; // đã gõ tiếp
  if (r && r.text) {
    autoTr = { term, text: r.text, lang: r.lang };
    $("meaningInput").value = r.text;
    autoGrow($("meaningInput"));
    setMeaningHint("đã tự dịch, sửa thoải mái", true);
  } else {
    autoTr = r ? { term, text: "", lang: r.lang } : null;
    setMeaningHint(r ? "không tìm được bản dịch" : "không dịch được (mất mạng?)");
  }
}, 600);

function onTermInput() {
  autoGrow($("termInput"), 130);
  if (!meaningDirty) { $("meaningInput").value = ""; autoGrow($("meaningInput")); }
  autoTranslate();
}
$("termInput").addEventListener("input", onTermInput);
$("meaningInput").addEventListener("input", () => {
  meaningDirty = $("meaningInput").value.trim() !== "";
  autoGrow($("meaningInput"));
  setMeaningHint("");
});

async function addFromForm() {
  const term = $("termInput").value.trim();
  if (!term) { $("termInput").focus(); return; }
  if (words.some(w => !w.sticky && w.term.toLowerCase() === term.toLowerCase())) {
    toast(`"${short(term)}" đã có trong danh sách`, "warn");
    return;
  }
  const btn = $("addBtn");
  btn.disabled = true;
  let meaning = $("meaningInput").value.trim();
  let lang = (autoTr && autoTr.term === term && autoTr.lang) || detectLang(term);
  // Bấm Thêm khi chưa kịp dịch → dịch luôn (tối đa ~3s) thay vì để nghĩa trống.
  if (!meaning && looksTranslatable(term) && settings.previewTranslate !== false) {
    setMeaningHint("đang dịch…");
    const r = await Promise.race([translateText(term), new Promise(res => setTimeout(() => res(null), 3000))]);
    if (r) { meaning = r.text || ""; if (r.lang) lang = r.lang; }
  }
  btn.disabled = false;
  const tags = parseTags($("tagsInput").value);
  const rec = {
    id: newId(),
    term,
    lang,
    type: composerType,
    meaning,
    note: $("noteInput").value.trim(),
    tags: tags.length ? tags : undefined,
    hoverCount: 0,
    autoDeleteAt: settings.defaultThreshold || 20,
    createdAt: new Date().toISOString()
  };
  words.push(rec);
  save();
  // Phiên âm IPA cho từ tiếng Anh ngắn — chạy nền, có thì cập nhật sau.
  if (composerType === "vocab" && lang === "en" && term.length <= 40) {
    fetchPhonetic(term).then(p => {
      if (!p) return;
      const w = words.find(x => x.id === rec.id);
      if (w && !w.phonetic) { w.phonetic = p; save(); render(); }
    });
  }
  statusFilter = "all";
  render();
  if (isWindowMode) { autoCloseIfWindow(); return; }
  closeAddScreen();
  toast(`Đã thêm "${short(term)}"`, "success", {
    label: "Hoàn tác", onClick: () => { words = words.filter(x => x.id !== rec.id); save(); render(); }
  });
}
$("addBtn").onclick = addFromForm;
$("addScreen").addEventListener("keydown", imeSafe(e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addFromForm(); return; }
  if (e.key === "Escape") { e.preventDefault(); closeAddScreen(); return; }
  // Ô 1 dòng: Enter chuyển ô tiếp / thêm ở ô cuối.
  if (e.key === "Enter" && !e.shiftKey) {
    if (e.target.id === "termInput") { e.preventDefault(); $("meaningInput").focus(); }
    else if (e.target.id === "meaningInput") { e.preventDefault(); $("noteInput").focus(); }
    else if (e.target.id === "noteInput") { e.preventDefault(); $("tagsInput").focus(); }
    else if (e.target.id === "tagsInput") { e.preventDefault(); addFromForm(); }
  }
}));

// ---------- Thêm nhiều dòng ----------
function parseBulk() {
  const lines = $("bulkText").value.split("\n").map(l => l.trim()).filter(Boolean);
  const seen = new Set(words.filter(w => !w.sticky).map(w => w.term.toLowerCase()));
  const items = []; let dup = 0;
  for (const line of lines) {
    // Tách theo " - " hoặc tab hoặc " : "
    const parts = line.split(/\s+-\s+|\t+|\s+:\s+/);
    const term = (parts[0] || "").trim();
    if (!term) continue;
    if (seen.has(term.toLowerCase())) { dup++; continue; }
    seen.add(term.toLowerCase());
    items.push({ term, meaning: (parts[1] || "").trim(), note: (parts.slice(2).join(" - ") || "").trim() });
  }
  return { items, dup };
}
function openBulk() {
  closeMenu();
  $("bulkModal").hidden = false;
  updateBulkPreview();
  $("bulkText").focus();
}
function updateBulkPreview() {
  const { items, dup } = parseBulk();
  $("bulkPreview").textContent = items.length || dup
    ? `Sẽ thêm ${items.length} mục${dup ? ` · bỏ qua ${dup} mục trùng` : ""} · loại: ${VN_TYPES[composerType].label}`
    : "";
  $("bulkSave").disabled = items.length === 0;
}
$("bulkBtn").onclick = openBulk;
$("bulkText").addEventListener("input", debounce(updateBulkPreview, 150));
$("bulkCancel").onclick = () => { $("bulkModal").hidden = true; };
$("bulkModal").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.stopPropagation(); $("bulkModal").hidden = true; }
});
$("bulkSave").onclick = () => {
  const { items, dup } = parseBulk();
  const now = Date.now();
  items.forEach((it, i) => words.push({
    id: newId(),
    term: it.term,
    lang: detectLang(it.term),
    type: composerType,
    meaning: it.meaning,
    note: it.note,
    hoverCount: 0,
    autoDeleteAt: settings.defaultThreshold || 20,
    createdAt: new Date(now + i).toISOString()
  }));
  save();
  $("bulkText").value = "";
  $("bulkModal").hidden = true;
  if (!$("addScreen").hidden) closeAddScreen();
  render();
  toast(`Đã thêm ${items.length} mục${dup ? `, bỏ qua ${dup} trùng` : ""}`, "success");
  autoCloseIfWindow();
};

// ---------- Ôn tập giãn cách (SRS — SM-2 rút gọn) ----------
// Mỗi từ mang lịch riêng: srsDue (khi nào ôn lại), srsInterval (ngày), srsEase,
// srsReps. Đến hạn (srsDue <= giờ) hoặc chưa có lịch = "đến hạn". Buổi ôn lấy
// từ đến hạn trước, rồi thêm tối đa `srsNewPerDay` từ mới. Chấm điểm:
//   Quên → về đầu, ôn lại ngay trong phiên   Nhớ → giãn theo ease   Dễ → giãn xa hơn.
// Interval đủ lớn (SRS_GRAD_DAYS) → tự đánh dấu "đã thuộc" (giữ từ, ngừng tô sáng).
const SRS_DAY_MS = 86400000;
const SRS_GRAD_DAYS = 45;

// Luật "khi nào cần ôn" dùng chung với số trên biểu tượng (constants.js).
function reviewState() { return self.HN_CONST.reviewState(words, settings); }
function srsDueCount() {
  return settings.srsReminder === false ? 0 : reviewState().due;
}
// Bộ thẻ buổi ôn: từ đã đến hạn trước (quá hạn lâu nhất trước), rồi từ mới (cũ trước).
function srsBuildDeck() {
  const { overdue, fresh } = reviewState();
  const limit = settings.srsNewPerDay || 20;
  overdue.sort((a, b) => Date.parse(a.srsDue) - Date.parse(b.srsDue));
  const newOnes = [...fresh]
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .slice(0, limit);
  return overdue.concat(newOnes);
}
// Tính lịch mới (không ghi) — dùng cả để chấm điểm lẫn hiện "sau N ngày" trên nút.
function srsCompute(w, grade) {
  let ease = w.srsEase || 2.5;
  let reps = w.srsReps || 0;
  let interval = w.srsInterval || 0;
  if (grade === "again") {
    reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2);
  } else if (grade === "good") {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.max(1, Math.round(interval * ease));
  } else { // easy
    reps += 1; ease += 0.15;
    interval = reps === 1 ? 3 : Math.max(1, Math.round(interval * ease * 1.3));
  }
  return { ease: Math.round(ease * 100) / 100, reps, interval };
}
function srsGrade(w, grade) {
  const now = Date.now();
  const r = srsCompute(w, grade);
  w.srsEase = r.ease;
  w.srsReps = r.reps;
  w.srsInterval = r.interval;
  w.srsLast = new Date(now).toISOString();
  w.srsDue = new Date(now + r.interval * SRS_DAY_MS).toISOString();
  // Giãn đủ xa → coi như nhớ lâu dài, đánh dấu đã thuộc.
  if (r.interval >= SRS_GRAD_DAYS && !w.learned) {
    w.learned = true;
    w.learnedAt = new Date(now).toISOString();
  }
}
function intervalLabel(d) {
  if (d <= 0) return "ôn lại ngay";
  if (d === 1) return "1 ngày";
  if (d < 30) return `${d} ngày`;
  return `~${Math.round(d / 30)} tháng`;
}
function srsDueLabel(iso) {
  const diff = Date.parse(iso) - Date.now();
  if (diff <= 0) return "cần ôn";
  const d = Math.ceil(diff / SRS_DAY_MS);
  return d <= 1 ? "ôn mai" : `ôn sau ${d} ngày`;
}

// Nút Ôn tập + dòng nhắc chỉ xuất hiện khi đã có đủ từ vựng để ôn (người chỉ dịch /
// tô sáng không bao giờ thấy). Dòng nhắc gọn 1 dòng, bấm × là ẩn tới hết hôm nay.
const REVIEW_HIDE_KEY = "__reviewBarHiddenDay";
let reviewBarHiddenDay = "";
try { chrome.storage.local.get(REVIEW_HIDE_KEY, (d) => { reviewBarHiddenDay = d[REVIEW_HIDE_KEY] || ""; renderReviewBar(); }); } catch (e) {}
function todayKey() { return new Date().toLocaleDateString("en-CA"); }
function renderReviewBar() {
  const bar = $("reviewBar");
  renderLearningItem();
  const st = reviewState();
  document.body.classList.toggle("no-review", !st.eligible);
  const n = settings.srsReminder === false ? 0 : st.due;
  if (n === 0 || reviewBarHiddenDay === todayKey()) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<button class="rb-go" id="reviewNowBtn" title="Bắt đầu ôn">🔁 <b>${n}</b> từ đến hạn ôn · <u>Ôn ngay</u></button>
    <button class="rb-x" id="reviewHideBtn" title="Ẩn tới hết hôm nay" aria-label="Ẩn tới hết hôm nay">×</button>`;
  $("reviewNowBtn").onclick = startReview;
  $("reviewHideBtn").onclick = () => {
    reviewBarHiddenDay = todayKey();
    chrome.storage.local.set({ [REVIEW_HIDE_KEY]: reviewBarHiddenDay });
    bar.hidden = true;
    toast("Đã ẩn tới hết hôm nay", "", { label: "Tắt hẳn", onClick: () => setLearning(false) });
  };
}

let reviewDeck = [];
let reviewPos = 0;
let reviewStats = { again: 0, good: 0, easy: 0 };
let reviewRevealed = false;

$("quizBtn").onclick = startReview;
function closeQuiz() { $("quizModal").hidden = true; render(); }
$("quizX").onclick = closeQuiz;
$("quizModal").addEventListener("mousedown", (e) => { if (e.target === $("quizModal")) closeQuiz(); });

function startReview() {
  let deck = srsBuildDeck();
  if (deck.length === 0) {
    // Không còn từ đến hạn → ôn nhẹ các từ sắp tới hạn (luyện thêm, không bắt buộc).
    deck = words.filter(w => !w.sticky && typeOf(w) === "vocab" && !w.disabled && !w.learned && w.meaning)
      .sort((a, b) => Date.parse(a.srsDue || 0) - Date.parse(b.srsDue || 0))
      .slice(0, 15);
    if (deck.length === 0) {
      toast("Chưa có từ vựng nào có nghĩa để ôn — thêm vài từ trước nhé", "warn");
      return;
    }
    toast("Chưa có từ đến hạn — ôn thử vài từ gần đây");
  }
  reviewDeck = deck.map(w => ({ w, requeued: false }));
  reviewPos = 0;
  reviewStats = { again: 0, good: 0, easy: 0 };
  $("quizModal").hidden = false;
  showReviewCard();
}

function showReviewCard() {
  const card = $("quizCard");
  const actions = $("quizActions");
  const total = reviewDeck.length;
  $("quizBar").style.width = Math.round((reviewPos / total) * 100) + "%";
  if (reviewPos >= total) {
    $("quizProgress").textContent = `${total}/${total}`;
    const remembered = reviewStats.good + reviewStats.easy;
    card.innerHTML = `
      <div class="q-done">🎉</div>
      <div class="q-meaning">Xong buổi ôn!</div>
      <div class="q-summary">Nhớ <b>${remembered}</b> · Cần ôn lại <b>${reviewStats.again}</b></div>`;
    actions.innerHTML = `<button class="btn-primary" id="quizClose">Đóng</button>`;
    $("quizKeys").textContent = "";
    $("quizClose").onclick = closeQuiz;
    $("quizClose").focus();
    return;
  }
  const w = reviewDeck[reviewPos].w;
  $("quizProgress").textContent = `${reviewPos + 1}/${total}`;
  reviewRevealed = false;
  const canSpeak = langOf(w) !== "vi";
  card.innerHTML = `
    <div class="q-term">${escapeHtml(w.term)}${canSpeak ? `<button class="spk" id="qSpeak" title="Nghe phát âm" aria-label="Nghe phát âm">${ICON.speak}</button>` : ""}</div>
    <div class="q-ans" hidden>
      ${w.phonetic ? `<div class="q-phon">${escapeHtml(w.phonetic)}</div>` : ""}
      <div class="q-meaning">${escapeHtml(w.meaning)}</div>
      ${w.note ? `<div class="q-note">${escapeHtml(w.note)}</div>` : ""}
    </div>
    <div><span class="q-hidden">Bấm hoặc nhấn Space để xem nghĩa</span></div>`;
  const sp = $("qSpeak");
  if (sp) sp.onclick = (e) => { e.stopPropagation(); speak(w.term, langOf(w)); };
  card.onclick = revealCard;
  const lbl = (g) => intervalLabel(srsCompute(w, g).interval);
  // Nút chấm điểm khoá tới khi lật thẻ (bắt buộc tự nhớ trước khi xem).
  actions.innerHTML = `
    <button class="btn-bad" data-g="again" disabled>Quên<small>${lbl("again")}</small></button>
    <button class="btn-good" data-g="good" disabled>Nhớ<small>${lbl("good")}</small></button>
    <button class="btn-easy" data-g="easy" disabled>Dễ<small>${lbl("easy")}</small></button>`;
  actions.querySelectorAll("button").forEach(b => { b.onclick = () => gradeCard(b.dataset.g); });
  $("quizKeys").innerHTML = `<kbd>Space</kbd> lật thẻ · <kbd>1</kbd> Quên · <kbd>2</kbd> Nhớ · <kbd>3</kbd> Dễ`;
  card.focus();
}
function revealCard() {
  if (reviewRevealed || reviewPos >= reviewDeck.length) return;
  reviewRevealed = true;
  const card = $("quizCard");
  card.querySelector(".q-ans").hidden = false;
  card.querySelector(".q-hidden").parentElement.remove();
  $("quizActions").querySelectorAll("button").forEach(b => { b.disabled = false; });
}
function gradeCard(g) {
  if (reviewPos >= reviewDeck.length) return;
  if (!reviewRevealed) { revealCard(); return; }
  const item = reviewDeck[reviewPos];
  item.w = byId(item.w.id) || item.w;
  srsGrade(item.w, g);
  if (g === "again") {
    reviewStats.again++;
    if (!item.requeued) { item.requeued = true; reviewDeck.push({ w: item.w, requeued: true }); }
  } else if (g === "easy") reviewStats.easy++;
  else reviewStats.good++;
  save();
  reviewPos++;
  showReviewCard();
}
$("quizModal").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeQuiz(); return; }
  if (reviewPos >= reviewDeck.length) return;
  if (e.key === " " || e.key === "Enter") {
    if (e.target.tagName === "BUTTON" && e.target.id !== "quizCard") return; // để nút tự xử
    e.preventDefault();
    revealCard();
  } else if (e.key === "1") gradeCard("again");
  else if (e.key === "2") gradeCard("good");
  else if (e.key === "3") gradeCard("easy");
});

// ---------- Sao lưu / xuất ----------
function exportJson() {
  const data = { version: 1, exportedAt: new Date().toISOString(), words, settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Highlight Note - Tu vung (${new Date().toISOString().slice(0, 10)}).json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  settings.lastExportAt = new Date().toISOString();
  saveSettings();
  setTimeout(refreshSync, 300);
  toast("Đã tải file backup về thư mục Tải về", "success");
}

// Xuất Markdown — nhóm theo loại, đưa thẳng vào Obsidian/Notion/ghi chú công việc.
// To-do xuất dạng checkbox (- [ ] / - [x]) để dùng luôn như danh sách việc.
function exportMarkdown() {
  if (!words.length) { toast("Chưa có mục nào để xuất", "warn"); return; }
  const oneLine = (s) => String(s || "").replace(/\s*\n+\s*/g, " ").trim();
  const byType = {};
  for (const w of words) { if (w.sticky) continue; (byType[typeOf(w)] = byType[typeOf(w)] || []).push(w); }
  let md = `# Highlight Note — ${new Date().toLocaleDateString("vi-VN")}\n\n`;
  for (const t of Object.keys(VN_TYPES)) {
    const arr = byType[t];
    if (!arr || !arr.length) continue;
    md += `## ${VN_TYPES[t].icon} ${VN_TYPES[t].label} (${arr.length})\n\n`;
    for (const w of arr) {
      const term = oneLine(w.term);
      let line = t === "todo" ? `- [${w.learned ? "x" : " "}] **${term}**` : `- **${term}**`;
      if (w.phonetic) line += ` ${oneLine(w.phonetic)}`;
      if (w.meaning) line += ` — ${oneLine(w.meaning)}`;
      if (w.tags && w.tags.length) line += ` ${w.tags.map(tg => "#" + oneLine(tg).replace(/\s+/g, "-")).join(" ")}`;
      if (w.url) line += ` ([nguồn](${w.url}))`;
      md += line + "\n";
      if (w.note) md += `  - _${oneLine(w.note)}_\n`;
    }
    md += "\n";
  }
  // Sticky note (ghi chú dán trang): nhóm theo trang nguồn để dễ tra lại.
  const stickies = words.filter(w => w.sticky);
  if (stickies.length) {
    md += `## 📌 Ghi chú trang (${stickies.length})\n\n`;
    const byUrl = {};
    for (const w of stickies) (byUrl[w.url || ""] = byUrl[w.url || ""] || []).push(w);
    for (const url of Object.keys(byUrl)) {
      const grp = byUrl[url];
      const title = oneLine(grp[0].pageTitle || url || "(không rõ trang)");
      md += url ? `### [${title}](${url})\n\n` : `### ${title}\n\n`;
      for (const w of grp) md += `- ${oneLine(w.term)}\n`;
      md += "\n";
    }
  }
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Highlight Note (${new Date().toISOString().slice(0, 10)}).md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Đã xuất Markdown", "success");
}

// ---------- Đồng bộ Google Drive (bấm mới chạy) ----------
let syncStatus = null;
function relTime(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  return d === 1 ? "hôm qua" : `${d} ngày trước`;
}
function syncSummary(st) {
  if (!st) return "";
  const parts = [];
  if (st.added) parts.push(`lấy về ${st.added}`);
  if (st.updated) parts.push(`cập nhật ${st.updated}`);
  if (st.sent) parts.push(`gửi lên ${st.sent}`);
  if (st.removed) parts.push(`bỏ ${st.removed} mục đã xoá ở máy khác`);
  return parts.length ? parts.join(" · ") : "không có gì mới";
}
function refreshSync() {
  chrome.runtime.sendMessage({ type: "SYNC_STATUS" }, (r) => {
    if (chrome.runtime.lastError || !r || !r.ok) return;
    syncStatus = r.status;
    const btn = $("syncBtn");
    btn.hidden = !syncStatus.driveConfigured;
    const ls = syncStatus.lastSync;
    btn.title = !syncStatus.connected
      ? "Đồng bộ giữa các máy qua Google Drive — bấm để kết nối"
      : `Đồng bộ ngay với Google Drive\nLần cuối: ${ls ? relTime(ls.at) : "chưa đồng bộ"}`;
    // Chấm vàng nhắc: đã kết nối mà lâu chưa đồng bộ (quá 3 ngày).
    btn.querySelector(".hd-dot").hidden = !(syncStatus.connected && (!ls || Date.now() - ls.at > 3 * SRS_DAY_MS));
    renderBackupBanner();
  });
}
// Hộp thoại nhỏ: buttons [{ label, value, cls }] — nút cuối là nút mặc định.
function uiDialog(title, bodyHtml, buttons) {
  return new Promise(resolve => {
    $("dlgTitle").textContent = title;
    $("dlgBody").innerHTML = bodyHtml;
    $("dlgActs").innerHTML = "";
    const close = (v) => { $("dlg").hidden = true; resolve(v); };
    buttons.forEach(b => {
      const el = document.createElement("button");
      el.textContent = b.label;
      el.className = b.cls || "btn-primary";
      el.onclick = () => close(b.value);
      $("dlgActs").appendChild(el);
    });
    $("dlg").onkeydown = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    $("dlg").onmousedown = (e) => { if (e.target === $("dlg")) close(null); };
    $("dlg").hidden = false;
    $("dlgActs").lastElementChild.focus();
  });
}

// Lần đồng bộ sắp sửa/xoá mục trên máy này → liệt kê để người dùng quyết định.
// Trả về null (huỷ) | { keepIds } (giữ bản máy này) | {} (đồng ý).
async function confirmSyncChanges(res) {
  const n = res.changeCount || res.changes.length;
  const show = res.changes.slice(0, 8);
  const st = res.stats || {};
  const extra = [];
  if (st.added) extra.push(`lấy về ${st.added} mục mới`);
  if (st.sent) extra.push(`gửi lên ${st.sent} mục`);
  const body =
    `<p>Máy khác đã thay đổi các mục dưới đây. Bạn muốn làm gì?</p>
     <ul class="chg-list">${show.map(c => `<li><b title="${escapeHtml(c.term)}">${escapeHtml(c.term)}</b>${c.kind === "removed"
        ? '<span class="chg del">máy khác đã xoá</span>' : '<span class="chg upd">máy khác sửa sau</span>'}</li>`).join("")}
       ${n > show.length ? `<li><span>… và ${n - show.length} mục khác</span></li>` : ""}</ul>
     ${extra.length ? `<p>Ngoài ra sẽ ${extra.join(", ")} (không ảnh hưởng gì).</p>` : ""}
     <p><b>Giữ bản máy này</b> = không xoá/sửa các mục trên, gửi bản của máy này lên Drive.</p>`;
  const v = await uiDialog(`Đồng bộ sẽ thay đổi ${n} mục trên máy này`, body, [
    { label: "Huỷ", value: null, cls: "btn-cancel" },
    { label: "Giữ bản máy này", value: "keep", cls: "btn-keep" },
    { label: "Đồng ý", value: "ok", cls: "btn-primary" }
  ]);
  if (!v) return null;
  return v === "keep" ? { keepIds: res.changes.map(c => c.id) } : {};
}

function syncNow() {
  if (!syncStatus || !syncStatus.connected) { openOptions("sync"); return; }
  const btn = $("syncBtn");
  if (btn.classList.contains("spinning")) return;
  const send = (extra) => {
    btn.classList.add("spinning");
    toast("Đang đồng bộ với Google Drive…");
    chrome.runtime.sendMessage({ type: "SYNC_NOW", ...extra }, async (res) => {
      btn.classList.remove("spinning");
      if (chrome.runtime.lastError || !res) { toast("Không liên lạc được với tiện ích — thử lại", "error"); return; }
      if (!res.ok) { toast("Chưa đồng bộ được: " + res.error, "error"); refreshSync(); return; }
      if (res.needConfirm) {
        $("toast").hidden = true;
        const choice = await confirmSyncChanges(res);
        if (!choice) { toast("Đã huỷ — chưa thay đổi gì"); return; }
        send({ confirm: true, keepIds: choice.keepIds || [] });
        return;
      }
      const st = res.result && res.result.stats;
      const restore = st && st.removed
        ? { label: "Khôi phục", onClick: () => chrome.runtime.sendMessage({ type: "SYNC_RESTORE_REMOVED" }, () => { toast("Đã khôi phục — lần đồng bộ sau sẽ gửi lại lên Drive", "success"); refreshSync(); }) }
        : null;
      toast("✓ Đã đồng bộ: " + syncSummary(st), "success", restore);
      refreshSync();
    });
  };
  send({});
}
$("syncBtn").onclick = syncNow;

// ---------- Banner an toàn dữ liệu ----------
const BANNER_SNOOZE_KEY = "__backupBannerSnoozeUntil";
function renderBackupBanner() {
  const banner = $("backupBanner");
  const s = syncStatus;
  if (!s || words.length < 1 || !s.safety || s.safety.level !== "danger") { banner.hidden = true; return; }
  chrome.storage.local.get(BANNER_SNOOZE_KEY, (d) => {
    if ((d[BANNER_SNOOZE_KEY] || 0) > Date.now()) { banner.hidden = true; return; }
    banner.className = "backup-banner" + (s.connected ? " caution" : "");
    banner.hidden = false;
    const text = s.connected
      ? `Đã ${s.lastSync ? relTime(s.lastSync.at) : "lâu"} chưa đồng bộ. Bấm đồng bộ để dữ liệu máy này có bản trên Drive.`
      : (s.driveConfigured
        ? "Dữ liệu chỉ nằm trên máy này — gỡ tiện ích là mất. Kết nối Google Drive hoặc tải backup."
        : "Dữ liệu chỉ nằm trên máy này — gỡ tiện ích là mất. Hãy tải file backup.");
    banner.innerHTML = `
      <div class="bb-text">${text}
        <div class="bb-acts">
          ${s.driveConfigured ? `<button id="bbSync">${s.connected ? "Đồng bộ ngay" : "Kết nối Drive"}</button>` : ""}
          <button id="bbBackup" class="ghost">Tải backup</button>
        </div>
      </div>
      <button class="bb-x" id="bbClose" title="Ẩn 7 ngày" aria-label="Ẩn 7 ngày">×</button>`;
    if ($("bbSync")) $("bbSync").onclick = syncNow;
    $("bbBackup").onclick = exportJson;
    $("bbClose").onclick = () => {
      chrome.storage.local.set({ [BANNER_SNOOZE_KEY]: Date.now() + 7 * SRS_DAY_MS });
      banner.hidden = true;
    };
  });
}

// ---------- Mở trang khác ----------
function openOptions(section) {
  const url = chrome.runtime.getURL("options.html" + (section ? "#" + section : ""));
  chrome.tabs.create({ url });
}
function openHelp() { chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") }); }
$("optionsBtn").onclick = () => chrome.runtime.openOptionsPage();

// ---------- Menu ⋯ ----------
function closeMenu() {
  $("moreMenu").hidden = true;
  $("moreBtn").setAttribute("aria-expanded", "false");
}
$("moreBtn").onclick = (e) => {
  e.stopPropagation();
  const open = $("moreMenu").hidden;
  $("moreMenu").hidden = !open;
  $("moreBtn").setAttribute("aria-expanded", String(open));
  if (open) $("moreMenu").querySelector("button").focus();
};
document.addEventListener("click", (e) => {
  if (!$("moreMenu").hidden && !e.target.closest(".menu-wrap")) closeMenu();
});
$("moreMenu").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  closeMenu();
  switch (b.dataset.act) {
    case "rescan": rescanPage(); break;
    case "bulk": openBulk(); break;
    case "export": exportJson(); break;
    case "exportMd": exportMarkdown(); break;
    // Nhập file ở trang Cài đặt: popup hay tự đóng khi mở hộp thoại chọn file (nhất là Linux).
    case "import": openOptions("backup"); break;
    case "help": openHelp(); break;
    case "learning": setLearning(!(settings.learningMode === true)); break;
  }
});

// Chế độ học từ: 1 công tắc cho mọi thứ liên quan học/ôn (nút Ôn tập, nhắc, số trên
// biểu tượng, tiến độ "0/20", nút Đã thuộc của từ vựng, tự đánh dấu đã thuộc).
function setLearning(on) {
  settings.learningMode = on;
  saveSettings();
  render();
  toast(on ? "Đã bật chế độ học từ — có Ôn tập, nhắc từ đến hạn, tiến độ ghi nhớ"
           : "Đã tắt chế độ học từ — không còn nhắc nhở", "success");
}
function renderLearningItem() {
  const on = settings.learningMode === true;
  const it = $("learningItem");
  it.setAttribute("aria-checked", String(on));
  $("learningState").textContent = on ? "Đang bật · ôn tập, nhắc, tiến độ" : "Đang tắt · bật nếu bạn học từ vựng";
}
$("moreMenu").addEventListener("keydown", (e) => {
  const items = [...$("moreMenu").querySelectorAll("button")];
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
});

// ---------- Side Panel ----------
if (isWindowMode || isSidePanel) {
  $("windowBtn").hidden = true;
} else {
  $("windowBtn").onclick = () => {
    if (chrome.sidePanel && currentWindowId != null) {
      try {
        chrome.sidePanel.open({ windowId: currentWindowId });
        window.close();
        return;
      } catch (e) {}
    }
    chrome.runtime.sendMessage({ type: "OPEN_POPUP_WINDOW" });
    window.close();
  };
}

// ---------- Trang đang xem ----------
// Tìm tab đang xem ở cửa sổ trình duyệt (KHÔNG phải cửa sổ popup của extension)
async function getBrowsingTab() {
  const wins = await chrome.windows.getAll({ windowTypes: ["normal"], populate: true });
  wins.sort((a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0) || b.id - a.id);
  for (const w of wins) {
    const tab = w.tabs && w.tabs.find(t => t.active);
    if (tab) return tab;
  }
  return null;
}
function isWebUrl(u) { return /^https?:/i.test(u || ""); }

// Trang mở TRƯỚC khi cài/cập nhật extension → content script chưa có. Gửi lệnh thất
// bại thì tự tiêm (constants.js PHẢI đi trước content.js) rồi gửi lại.
async function sendToTab(tabId, msg) {
  try { return { ok: true, res: await chrome.tabs.sendMessage(tabId, msg) }; } catch (e) {}
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["constants.js", "content.js"] });
  } catch (e) { return { ok: false, reason: "blocked" }; }
  try { return { ok: true, res: await chrome.tabs.sendMessage(tabId, msg) }; } catch (e) { return { ok: false, reason: "notready" }; }
}

async function rescanPage() {
  const tab = await getBrowsingTab();
  if (!tab || !isWebUrl(tab.url)) { toast("Trang này không chạy được tiện ích (vd chrome://, Web Store)", "error"); return; }
  const r = await sendToTab(tab.id, { type: "FORCE_RESCAN" });
  if (r.ok) { toast("Đã quét lại trang", "success"); setTimeout(refreshPageItems, 600); }
  else toast(r.reason === "blocked" ? "Trang này không chạy được tiện ích" : "Trang chưa tải xong — thử lại sau giây lát", "error");
}

const refreshPageItems = debounce(async () => {
  const tab = await getBrowsingTab();
  let ids = null;
  if (tab && isWebUrl(tab.url)) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_ITEMS" });
      if (res && Array.isArray(res.ids)) ids = new Set(res.ids);
    } catch (e) { /* content script chưa có → coi như không biết */ }
  }
  const changed = String(ids && [...ids].sort()) !== String(pageIds && [...pageIds].sort());
  pageIds = ids;
  if (!pageIds && statusFilter === "page") statusFilter = "all";
  if (changed) render();
  renderSiteBar();
}, 120);

async function renderSiteBar() {
  const bar = $("siteBar");
  const tab = await getBrowsingTab();
  if (!tab || !isWebUrl(tab.url)) { bar.hidden = true; return; }
  let host;
  try { host = new URL(tab.url).hostname; } catch { bar.hidden = true; return; }
  if (!host) { bar.hidden = true; return; }
  const list = settings.blacklistedHosts || [];
  const isBlocked = hostBlocked(host, list);
  const nPage = pageIds ? words.filter(w => pageIds.has(w.id)).length : 0;
  bar.hidden = false;
  bar.className = "site-bar" + (isBlocked ? " bl" : "");
  bar.innerHTML = `
    <span class="host" title="${escapeHtml(host)}">${isBlocked ? ICON.block : ICON.globe}<b>${escapeHtml(host)}</b>${!isBlocked && nPage ? `<span class="on-page">· ${nPage} mục</span>` : ""}</span>
    ${isBlocked ? "" : `<button id="stickyBtn" title="Dán một ghi chú lên trang đang xem">${ICON.pin} Ghi chú</button>`}
    <button id="blBtn" title="${isBlocked ? "Tô sáng lại trên trang này" : "Không tô sáng / không hiện thanh Lưu trên trang này"}">${isBlocked ? "Bật lại ở đây" : "Tắt ở đây"}</button>
  `;
  $("blBtn").onclick = () => {
    const h = host.toLowerCase();
    settings.blacklistedHosts = isBlocked
      // Gỡ mọi mục đang chặn host này (kể cả domain cha, vd chặn google.com → mở mail.google.com)
      ? list.filter(b => { b = String(b).toLowerCase(); return !(h === b || h.endsWith("." + b)); })
      : list.concat(host.replace(/^www\./, ""));
    saveSettings();
    renderSiteBar();
    toast(isBlocked ? `Đã bật lại trên ${host}` : `Đã tắt trên ${host}`);
  };
  const stickyBtn = $("stickyBtn");
  if (stickyBtn) stickyBtn.onclick = async () => {
    const r = await sendToTab(tab.id, { type: "ADD_STICKY_NOTE" });
    if (!r.ok) { toast(r.reason === "blocked" ? "Trang này không chạy được tiện ích" : "Trang chưa tải xong — thử lại sau giây lát", "error"); return; }
    if (!isSidePanel) window.close(); // đóng popup để thấy thẻ ghi chú trên trang
  };
}

// Side Panel đứng yên khi người dùng chuyển tab → cập nhật theo tab mới.
if (isSidePanel) {
  chrome.tabs.onActivated.addListener(() => { renderSiteBar(); refreshPageItems(); });
  chrome.tabs.onUpdated.addListener((id, info, tab) => {
    if (tab.active && (info.status === "complete" || info.url)) { renderSiteBar(); refreshPageItems(); }
  });
  chrome.windows.onFocusChanged.addListener(() => { renderSiteBar(); refreshPageItems(); });
}

// ---------- Phím tắt trong popup ----------
$("searchInput").addEventListener("input", debounce(() => { renderLimit = PAGE_SIZE; render(); }, 120));
$("sortSel").addEventListener("change", render);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!$("moreMenu").hidden) { closeMenu(); $("moreBtn").focus(); e.preventDefault(); return; }
    if (document.activeElement === $("searchInput") && $("searchInput").value) {
      $("searchInput").value = ""; render(); e.preventDefault(); return;
    }
  }
  // "/" để tìm nhanh (khi không đang gõ ở ô khác)
  if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
      && $("addScreen").hidden && $("quizModal").hidden) {
    e.preventDefault();
    $("searchInput").focus();
  }
});

// ---------- Khởi động ----------
load();

// Giữ popup đồng bộ với storage: dữ liệu đổi từ nơi khác (đồng bộ kéo về, content
// script sửa/xoá, tab khác…) → cập nhật để lần "save" sau KHÔNG ghi đè bản cũ.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings && changes.settings.newValue) {
    settings = changes.settings.newValue;
    applyTheme();
    $("enabledToggle").checked = settings.enabled !== false;
    renderSiteBar();
    if (!changes.words) render();
  }
  if (changes.__lastSync || changes.__driveAccount) refreshSync();
  if (changes.words && changes.words.newValue) {
    words = changes.words.newValue;
    render();
    refreshPageItems(); // trang vừa tô thêm / bớt
  }
});

// Window mode cũ: mở thẳng đúng chỗ cần gõ (workaround IME trên Linux)
if (isWindowMode && focusTarget) {
  setTimeout(() => {
    if (focusTarget === "bulkBtn") openBulk();
    else if (focusTarget.startsWith("edit:")) {
      const id = focusTarget.slice(5);
      const itemEl = document.querySelector(`.item[data-id="${CSS.escape(id)}"]`);
      const w = words.find(x => x.id === id);
      if (itemEl && w) startInlineEdit(itemEl, w);
    } else if (focusTarget === "termInput") {
      openAddScreen();
    } else {
      const el = $(focusTarget);
      if (el) el.focus();
    }
  }, 150);
}
