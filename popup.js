// Popup: quản lý danh sách, sort/filter, stats, bulk add, quiz, backup nhắc

const $ = (id) => document.getElementById(id);
let words = [];
let settings = {};
let composerType = "vocab"; // loại đang chọn ở khu Thêm
let typeFilter = "all";     // lọc danh sách theo loại
let tagFilter = null;       // lọc danh sách theo 1 tag (null = không lọc)

// ---------- Tag / Collection ----------
// tags = mảng nhãn tự do (gom mục theo dự án/chủ đề). Khớp không phân biệt hoa/thường.
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
// Danh sách tag đang dùng (giữ nhãn hiển thị đầu tiên gặp), kèm số lượng.
function usedTags() {
  const map = new Map(); // lower -> { label, count }
  for (const w of words) for (const t of (w.tags || [])) {
    const k = String(t).toLowerCase();
    if (!map.has(k)) map.set(k, { label: t, count: 0 });
    map.get(k).count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ---------- Theme (Sáng / Tối, mặc định theo hệ thống) ----------
function effectiveTheme() {
  const t = settings.theme || "auto";
  if (t === "light" || t === "dark") return t;
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}
function applyTheme() {
  const eff = effectiveTheme();
  document.documentElement.setAttribute("data-theme", eff);
  const btn = $("themeBtn");
  if (btn) {
    btn.textContent = eff === "dark" ? "☀️" : "🌙";
    btn.title = eff === "dark" ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối";
  }
}
if ($("themeBtn")) $("themeBtn").onclick = () => {
  // Toggle dứt khoát Sáng↔Tối (ghi đè "auto"). Muốn quay về theo hệ thống thì
  // xoá key theme — nhưng đa số người dùng chỉ cần bật/tắt tối, giữ đơn giản.
  settings.theme = effectiveTheme() === "dark" ? "light" : "dark";
  saveSettings();
  applyTheme();
};
try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!settings.theme || settings.theme === "auto") applyTheme();
  });
} catch (e) {}

// Bộ icon SVG dùng chung (nét đồng nhất, ăn theo màu chữ) — thay cho emoji rời rạc
const svg = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON = {
  learn: svg('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/>'),
  unlearn: svg('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  bellOff: svg('<path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M18 8a6 6 0 0 0-9.3-5"/><path d="M6 8c0 7-3 9-3 9h13"/><line x1="2" y1="2" x2="22" y2="22"/>'),
  edit: svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
  del: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  save: svg('<polyline points="20 6 9 17 4 12"/>'),
  cancel: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  speak: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>')
};

// Icon SVG line ĐỒNG NHẤT cho từng loại (thay emoji nhiều màu 📚⭐✅❓📎).
// Lúc chưa chọn tất cả cùng màu xám dịu; khi chọn mới lấy màu của loại (xem CSS).
const TYPE_ICON = {
  vocab:     svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  important: svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  todo:      svg('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
  question:  svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  reference: svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>')
};

// Mô tả ngắn từng loại — hiện dưới hàng chọn loại để người dùng hiểu loại đó dùng làm gì.
const TYPE_DESC = {
  vocab:     "Từ vựng để học — tự dịch, phát âm, ôn tập khi hover đủ số lần.",
  important: "Điểm quan trọng — tô sáng đỏ trên trang để dễ thấy lại.",
  todo:      "Việc cần làm — tô xanh lá, đánh dấu xong khi hoàn tất.",
  question:  "Câu hỏi cần giải đáp — tô tím để quay lại tìm câu trả lời.",
  reference: "Tư liệu tham khảo — tô xanh ngọc, lưu nguồn cần đọc."
};

// ---------- Loại mục (type) — đa mục đích: học từ + hỗ trợ công việc ----------
// VN_TYPES nạp từ constants.js (thẻ script đặt trước popup.js trong popup.html).
const VN_TYPES = self.HN_CONST.VN_TYPES;
const typeOf = (w) => (w && VN_TYPES[w.type]) ? w.type : "vocab";
function doneLabel(w) {
  const t = typeOf(w);
  return t === "vocab" ? "đã thuộc" : t === "todo" ? "đã xong" : "đã xử lý";
}

// Phát âm bằng giọng theo ngôn ngữ (dùng cho mục note dịch thuật)
function speakTerm(text, lang) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {}
}

// Phân biệt các chế độ: popup mặc định · cửa sổ riêng (?window=1) · Side Panel (?panel=1).
// Side Panel là document thật → gõ tiếng Việt (fcitx5/ibus) chạy bình thường, KHÔNG
// cần workaround cửa sổ riêng và KHÔNG tự đóng như window mode.
const urlParams = new URLSearchParams(location.search);
const isWindowMode = urlParams.get("window") === "1";
const isSidePanel = urlParams.get("panel") === "1";
const focusTarget = urlParams.get("focus");

// Nhớ windowId hiện tại NGAY khi load để nút mở Side Panel gọi sidePanel.open() được
// đồng bộ trong user-gesture (await trước lời gọi có thể làm mất tư cách gesture).
let currentWindowId = null;
try { chrome.windows.getCurrent(w => { if (w) currentWindowId = w.id; }); } catch (e) {}

// Trong window mode, sau khi lưu xong sẽ tự đóng cửa sổ (tránh window mồ côi)
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
    $("enabledToggle").checked = settings.enabled;
    applyComposerState();
    renderTypePicker();
    render();
    renderBackupBanner();
    refreshSyncDot();
    renderSiteBar(); // sau khi settings đã load → bar hiện đúng trạng thái blacklist
  });
}

// Chỉ báo trạng thái đồng bộ ở header (hỏi service worker).
function refreshSyncDot() {
  const dot = $("syncDot");
  if (!dot) return;
  chrome.runtime.sendMessage({ type: "SYNC_STATUS" }, (s) => {
    if (chrome.runtime.lastError || !s) { dot.style.display = "none"; return; }
    dot.style.display = "";
    dot.classList.remove("syncing", "ok", "drive", "warn", "off");
    // Icon luôn là ⚙ (vào Cài đặt khi bấm); MÀU bánh răng phản ánh trạng thái đồng bộ.
    dot.textContent = "⚙";
    if (!s.enabled) {
      dot.classList.add("off");
      dot.title = "Cài đặt · Đồng bộ đang TẮT";
    } else if (s.needsDriveAuth || s.lastPushError) {
      dot.classList.add("warn");
      dot.title = "Cài đặt · " + (s.lastPushError || "Cần kết nối Google Drive");
    } else if (s.mode === "drive") {
      dot.classList.add("drive");
      dot.title = "Cài đặt · Đang đồng bộ qua Google Drive";
    } else {
      dot.classList.add("ok");
      dot.title = "Cài đặt · Đã đồng bộ qua Tài khoản Chrome";
    }
  });
}

// Ẩn/hiện nút Ôn tập theo cài đặt (dùng class trên body vì nút nằm ở thanh CTA).
function applyComposerState() {
  document.body.classList.toggle("no-review", settings.showReview === false);
}

// ---------- Màn hình Thêm mục (phủ toàn bộ, tách khỏi danh sách) ----------
function openAddScreen() {
  const s = $("addScreen");
  if (!s) return;
  s.hidden = false;
  setTimeout(() => $("termInput").focus(), 40);
}
function closeAddScreen() {
  const s = $("addScreen");
  if (!s) return;
  s.hidden = true;
  // Xoá nội dung nhập dở để lần mở sau bắt đầu sạch.
  $("termInput").value = "";
  $("meaningInput").value = "";
  $("noteInput").value = "";
  $("tagsInput").value = "";
  growTerm();
}
if ($("openAddBtn")) $("openAddBtn").onclick = openAddScreen;
if ($("addBack")) $("addBack").onclick = closeAddScreen;
if ($("addCancel")) $("addCancel").onclick = closeAddScreen;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("addScreen") && !$("addScreen").hidden) closeAddScreen();
});

function saveSettings() { chrome.storage.local.set({ settings }); }
function save() { chrome.storage.local.set({ words }); }

$("enabledToggle").addEventListener("change", () => {
  settings.enabled = $("enabledToggle").checked;
  saveSettings();
  render();
});

// ---------- Bộ chọn loại (khu Thêm) + tab lọc theo loại ----------
function renderTypePicker() {
  const box = $("typePicker");
  if (!box) return;
  box.innerHTML = Object.keys(VN_TYPES).map(t =>
    `<button type="button" class="tp-chip${t === composerType ? " active" : ""}" data-type="${t}" data-vn-type="${t}">`
    + `<span class="tp-ico">${TYPE_ICON[t] || VN_TYPES[t].icon}</span><span class="tp-label">${VN_TYPES[t].label}</span></button>`
  ).join("");
  box.querySelectorAll(".tp-chip").forEach(b => {
    b.onclick = () => { composerType = b.dataset.type; renderTypePicker(); };
  });
  const hint = $("typeHint");
  if (hint) hint.textContent = TYPE_DESC[composerType] || "";
}

// Tab lọc theo loại — chỉ hiện khi đang dùng >1 loại (giữ gọn cho ai chỉ học từ).
function renderTypeTabs() {
  const bar = $("typeTabs");
  if (!bar) return;
  const used = new Set(words.map(typeOf));
  if (used.size <= 1) {
    bar.style.display = "none";
    typeFilter = "all";
    return;
  }
  if (typeFilter !== "all" && !used.has(typeFilter)) typeFilter = "all";
  bar.style.display = "flex";
  const tab = (val, label, icon) =>
    `<button type="button" class="tt-tab${typeFilter === val ? " active" : ""}" data-type="${val}"`
    + `${val !== "all" ? ` data-vn-type="${val}"` : ""}>${icon ? icon + " " : ""}${label}</button>`;
  let html = tab("all", "Tất cả", "");
  for (const t of Object.keys(VN_TYPES)) {
    if (used.has(t)) html += tab(t, VN_TYPES[t].label, VN_TYPES[t].icon);
  }
  bar.innerHTML = html;
  bar.querySelectorAll(".tt-tab").forEach(b => {
    b.onclick = () => { typeFilter = b.dataset.type; render(); };
  });
}

// Thanh lọc theo tag — chỉ hiện khi có ít nhất 1 tag đang dùng.
function renderTagBar() {
  const bar = $("tagBar");
  if (!bar) return;
  const tags = usedTags();
  if (tags.length === 0) { bar.style.display = "none"; tagFilter = null; return; }
  // Tag đang lọc có thể vừa bị xoá hết → bỏ lọc.
  if (tagFilter && !tags.some(t => t.label.toLowerCase() === tagFilter.toLowerCase())) tagFilter = null;
  bar.style.display = "flex";
  const chip = (label, count, active) =>
    `<button type="button" class="tag-tab${active ? " active" : ""}" data-tag="${escapeHtml(label)}">`
    + `<span class="tag-hash">#</span>${escapeHtml(label)}${count != null ? `<span class="tag-count">${count}</span>` : ""}</button>`;
  let html = `<button type="button" class="tag-tab${tagFilter ? "" : " active"}" data-tag="">Tất cả tag</button>`;
  for (const t of tags) html += chip(t.label, t.count, tagFilter && tagFilter.toLowerCase() === t.label.toLowerCase());
  bar.innerHTML = html;
  bar.querySelectorAll(".tag-tab").forEach(b => {
    b.onclick = () => { tagFilter = b.dataset.tag || null; render(); };
  });
}

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("vi-VN");
}
function hostOf(url) {
  try { return new URL(url).hostname || url; } catch { return url || ""; }
}
function tagChipsHtml(w) {
  if (!w.tags || !w.tags.length) return "";
  return `<div class="tags">` + w.tags.map(t =>
    `<button class="tag-chip" data-tag="${escapeHtml(t)}" title="Lọc theo tag">#${escapeHtml(t)}</button>`
  ).join("") + `</div>`;
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
function detectLang(s) {
  return /[぀-ゟ゠-ヿ一-鿿]/.test(s) ? "ja" : "en";
}
function imeSafe(handler) {
  return (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    handler(e);
  };
}

// ---------- Toast + Modal helpers (thay alert/confirm/prompt của trình duyệt) ----------
function toast(msg, kind = "", onClickAction = null) {
  const t = $("toast");
  t.className = "popup-toast " + kind + (onClickAction ? " clickable" : "");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._timer);
  t.onclick = onClickAction ? () => {
    t.style.display = "none";
    clearTimeout(t._timer);
    onClickAction();
  } : null;
  t._timer = setTimeout(() => { t.style.display = "none"; t.onclick = null; },
    onClickAction ? 6000 : 2500);
}

function dlgConfirm(title, body, opts = {}) {
  return new Promise(resolve => {
    $("dlgTitle").textContent = title;
    $("dlgBody").textContent = body;
    $("dlgActions").innerHTML = `
      <button class="btn-cancel" id="dlgCancel">${opts.cancelText || "Huỷ"}</button>
      <button class="btn-primary" id="dlgOk">${opts.okText || "OK"}</button>
    `;
    $("dlgModal").style.display = "flex";
    $("dlgCancel").onclick = () => { $("dlgModal").style.display = "none"; resolve(false); };
    $("dlgOk").onclick = () => { $("dlgModal").style.display = "none"; resolve(true); };
  });
}

function dlgChoice(title, body, choices) {
  // choices: [{label, value, kind}]
  return new Promise(resolve => {
    $("dlgTitle").textContent = title;
    $("dlgBody").textContent = body;
    $("dlgActions").innerHTML = choices
      .map((c, i) => `<button class="${c.kind || "btn-primary"}" data-i="${i}">${c.label}</button>`)
      .join("");
    $("dlgModal").style.display = "flex";
    $("dlgActions").querySelectorAll("button").forEach(b => {
      b.onclick = () => { $("dlgModal").style.display = "none"; resolve(choices[+b.dataset.i].value); };
    });
  });
}

function dlgAlert(title, body) {
  return new Promise(resolve => {
    $("dlgTitle").textContent = title;
    $("dlgBody").textContent = body;
    $("dlgActions").innerHTML = `<button class="btn-primary" id="dlgOk">OK</button>`;
    $("dlgModal").style.display = "flex";
    $("dlgOk").onclick = () => { $("dlgModal").style.display = "none"; resolve(); };
  });
}

// ---------- Stats ----------
function renderStats() {
  const total = words.length;
  let n = 0, wa = 0, h = 0, d = 0, ln = 0;
  for (const w of words) {
    if (w.sticky) continue; // ghi chú dán trang không tính vào thống kê học tập
    if (w.learned) { ln++; continue; }
    if (w.disabled) { d++; continue; }
    const lv = levelOf(w);
    if (lv === "hot") h++;
    else if (lv === "warm") wa++;
    else n++;
  }
  $("stats").innerHTML = `
    <span><b>${total}</b>Tổng</span>
    <span class="s-new"><b>${n}</b>Mới</span>
    <span class="s-warm"><b>${wa}</b>Học</span>
    <span class="s-hot"><b>${h}</b>Sắp thuộc</span>
    ${ln ? `<span class="s-learned"><b>${ln}</b>Đã thuộc</span>` : ""}
    ${d ? `<span><b>${d}</b>Tắt</span>` : ""}
  `;
}

// ---------- Backup nhắc ----------
function renderBackupBanner() {
  const banner = $("backupBanner");
  if (words.length < 1) { banner.style.display = "none"; return; }

  // Banner "thông minh" theo mức an toàn do background tính (safe/caution/danger).
  // Mục tiêu: phản ánh ĐÚNG rủi ro mất dữ liệu, không doạ nhầm khi đã có Tài khoản
  // Chrome / backup. (Badge "!" trên icon tiện ích lo phần "biết mà không cần mở".)
  chrome.runtime.sendMessage({ type: "SYNC_STATUS" }, (s) => {
    if (chrome.runtime.lastError) s = null;
    const safety = (s && s.safety) || { level: s && s.driveConnected ? "safe" : "danger" };
    banner.classList.remove("danger", "safe", "caution");

    const fmtDays = (ms) => {
      if (!ms) return "";
      const d = Math.floor((Date.now() - ms) / 86400000);
      return d <= 0 ? "hôm nay" : d === 1 ? "hôm qua" : `${d} ngày trước`;
    };

    // An toàn (hoặc chưa có dữ liệu) → KHÔNG hiện banner. Tránh người dùng ỷ y vào
    // dải xanh thường trực; trạng thái an toàn đã thể hiện qua màu icon ⚙ ở header.
    if (safety.level === "safe" || safety.level === "empty") {
      banner.style.display = "none";
      return;
    }

    if (safety.level === "caution") {
      banner.classList.add("caution");
      banner.style.display = "flex";
      banner.innerHTML = `
        <span>🟡 Đã có bản backup trên máy (${fmtDays(safety.lastBackupMs)}), nhưng chưa bật đồng bộ đám mây. Bật Drive để an toàn nhất.</span>
        <span class="banner-acts">
          <button id="connectDriveQuick">☁ Kết nối Drive</button>
          <button id="backupNow" class="ghost">⬇ Backup lại</button>
        </span>
      `;
      $("connectDriveQuick").onclick = () => chrome.runtime.openOptionsPage();
      $("backupNow").onclick = () => $("exportBtn").click();
      return;
    }

    // danger (và unknown): chỉ ở storage.local máy này → nguy cơ mất khi gỡ.
    banner.classList.add("danger");
    banner.style.display = "flex";
    banner.innerHTML = `
      <span>🔒 Dữ liệu đang chỉ lưu trên máy này — gỡ tiện ích sẽ mất. Hãy kết nối Drive hoặc tải backup.</span>
      <span class="banner-acts">
        <button id="connectDriveQuick">☁ Kết nối Drive</button>
        <button id="backupNow" class="ghost">⬇ Backup</button>
      </span>
    `;
    $("connectDriveQuick").onclick = () => chrome.runtime.openOptionsPage();
    $("backupNow").onclick = () => $("exportBtn").click();
  });
}

// ---------- Render list ----------
function render() {
  renderStats();
  renderReviewBar();
  renderTypeTabs();
  renderTagBar();
  const rawKeyword = $("searchInput").value.trim();
  const sortBy = $("sortSel").value;
  const filterBy = $("filterSel").value;

  let filtered = words;
  if (typeFilter !== "all") filtered = filtered.filter(w => typeOf(w) === typeFilter);
  if (tagFilter) filtered = filtered.filter(w => hasTag(w, tagFilter));
  // Cú pháp "#tag" trong ô tìm: lọc theo tag chứa chuỗi (kết hợp với thanh tag).
  let keyword = rawKeyword.toLowerCase();
  if (rawKeyword.startsWith("#")) {
    const q = rawKeyword.slice(1).toLowerCase();
    filtered = filtered.filter(w => (w.tags || []).some(t => String(t).toLowerCase().includes(q)));
    keyword = "";
  }
  if (keyword) {
    filtered = filtered.filter(w =>
      w.term.toLowerCase().includes(keyword) ||
      (w.meaning || "").toLowerCase().includes(keyword) ||
      (w.note || "").toLowerCase().includes(keyword) ||
      (w.tags || []).some(t => String(t).toLowerCase().includes(keyword)));
  }
  if (filterBy === "disabled") filtered = filtered.filter(w => w.disabled && !w.learned);
  else if (filterBy === "learned") filtered = filtered.filter(w => w.learned);
  else if (filterBy === "all") filtered = filtered.filter(w => !w.learned);
  else filtered = filtered.filter(w => !w.disabled && !w.learned && levelOf(w) === filterBy);

  const sorters = {
    newest: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
    oldest: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""),
    alpha: (a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()),
    hoverDesc: (a, b) => (b.hoverCount || 0) - (a.hoverCount || 0),
    hoverAsc: (a, b) => (a.hoverCount || 0) - (b.hoverCount || 0),
    closest: (a, b) => ((b.hoverCount || 0) / (b.autoDeleteAt || 20)) - ((a.hoverCount || 0) / (a.autoDeleteAt || 20))
  };
  const sorted = [...filtered].sort(sorters[sortBy] || sorters.newest);

  $("count").textContent = words.length;
  const list = $("list");
  list.innerHTML = "";

  if (settings.enabled === false) {
    const b = document.createElement("div");
    b.className = "disabled-banner";
    b.textContent = "⏸ Extension đang TẮT — không highlight trang web";
    list.appendChild(b);
  }

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = words.length === 0
      ? "Chưa có mục nào.<br>Bôi đen chữ trên web → chuột phải → 'Tô sáng & lưu'<br>hoặc Alt+Shift+H"
      : "Không tìm thấy.";
    list.appendChild(empty);
    return;
  }

  for (const w of sorted) {
    // Sticky note (ghi chú dán theo URL): thẻ riêng, không có tiến độ/hover/đã-thuộc.
    if (w.sticky) {
      const vt = typeOf(w);
      const item = document.createElement("div");
      item.className = "item sticky-item" + (w.disabled ? " disabled" : "");
      item.dataset.vnType = vt;
      const srcBadge = w.url
        ? ` · <a class="src-link" data-url="${escapeHtml(w.url)}" title="Mở trang: ${escapeHtml(w.pageTitle || w.url)}">🔗 ${escapeHtml(hostOf(w.url))}</a>` : "";
      item.innerHTML = `
        <div class="info">
          <div class="term">
            <span class="type-badge" data-vn-type="${vt}">📌 Ghi chú trang</span>
            ${w.disabled ? `<span class="lang-tag">ĐÃ ẨN</span>` : ""}
          </div>
          <div class="meaning">${escapeHtml(w.term)}</div>
          ${w.note ? `<div class="note">${escapeHtml(w.note)}</div>` : ""}
          <div class="meta">${formatDate(w.createdAt)}${srcBadge}</div>
          ${tagChipsHtml(w)}
        </div>
        <div class="actions">
          <button class="ic-btn toggle-word" data-id="${w.id}" title="${w.disabled ? "Hiện lại trên trang" : "Ẩn trên trang (vẫn giữ)"}">${w.disabled ? ICON.bellOff : ICON.bell}</button>
          <button class="ic-btn edit" data-id="${w.id}" title="Sửa">${ICON.edit}</button>
          <button class="ic-btn del" data-id="${w.id}" title="Xoá">${ICON.del}</button>
        </div>
      `;
      list.appendChild(item);
      continue;
    }
    const pct = Math.min(100, Math.round((w.hoverCount / w.autoDeleteAt) * 100));
    const lv = levelOf(w);
    const lang = w.lang || "en";
    const vtype = typeOf(w);
    // Chỉ hiện phiên âm + nút nghe cho mục dịch thuật (có IPA, hoặc tiếng Nhật) — note thường giữ gọn
    const isTranslation = !!w.phonetic || lang === "ja";
    const item = document.createElement("div");
    item.className = "item" + (w.disabled ? " disabled" : "") + (w.learned ? " learned" : "") + " lv-" + lv;
    item.dataset.vnType = vtype;
    const doneIcon = vtype === "vocab" ? "🎓" : "✅";
    const statusBadge = w.learned ? ` · ${doneIcon} ${doneLabel(w).toUpperCase()}` : (w.disabled ? " · ĐÃ TẮT" : "");
    // Badge loại (ẩn với từ vựng để giữ giao diện học từ gọn như cũ)
    const typeBadge = vtype !== "vocab"
      ? `<span class="type-badge" data-vn-type="${vtype}">${VN_TYPES[vtype].icon} ${VN_TYPES[vtype].label}</span>` : "";
    const countBadge = (!w.learned && !w.disabled) ? ` · <span class="hint-count" title="Số lần đã gặp / ngưỡng">${w.hoverCount || 0}/${w.autoDeleteAt || 20}</span>` : "";
    const srsBadge = (!w.learned && !w.disabled && w.srsDue && Date.parse(w.srsDue) > Date.now())
      ? ` · <span class="srs-due" title="Lịch ôn giãn cách">🔁 ${srsDueLabel(w.srsDue)}</span>` : "";
    // Đoạn được neo vào 1 trang cụ thể → link mở lại đúng trang nguồn.
    const srcBadge = w.url
      ? ` · <a class="src-link" data-url="${escapeHtml(w.url)}" title="Mở trang nguồn: ${escapeHtml(w.pageTitle || w.url)}">🔗 nguồn</a>` : "";
    item.innerHTML = `
      <div class="info">
        <div class="term">
          <span class="term-text">${escapeHtml(w.term)}</span>
          ${typeBadge}
          <span class="lang-tag lang-${lang}">${lang.toUpperCase()}</span>
          ${isTranslation ? `<button class="spk" data-id="${w.id}" title="Nghe phát âm">${ICON.speak}</button>` : ""}
        </div>
        ${w.phonetic ? `<div class="phon">${escapeHtml(w.phonetic)}</div>` : ""}
        ${w.meaning ? `<div class="meaning">${escapeHtml(w.meaning)}</div>` : ""}
        ${w.note ? `<div class="note">${escapeHtml(w.note)}</div>` : ""}
        <div class="meta">${formatDate(w.createdAt)}${statusBadge}${countBadge}${srsBadge}${srcBadge}</div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        ${tagChipsHtml(w)}
      </div>
      <div class="actions">
        ${w.learned
          ? `<button class="ic-btn unlearn" data-id="${w.id}" title="Bỏ đánh dấu đã thuộc (tô sáng lại)">${ICON.unlearn}</button>`
          : `<button class="ic-btn learn" data-id="${w.id}" title="Đánh dấu đã thuộc (giữ từ, ngừng tô sáng)">${ICON.learn}</button>`}
        <button class="ic-btn toggle-word" data-id="${w.id}" title="${w.disabled ? "Bật lại tô sáng" : "Tạm ẩn tô sáng (vẫn giữ trong danh sách)"}">${w.disabled ? ICON.bellOff : ICON.bell}</button>
        <button class="ic-btn edit" data-id="${w.id}" title="Sửa">${ICON.edit}</button>
        <button class="ic-btn del" data-id="${w.id}" title="Xoá">${ICON.del}</button>
      </div>
    `;
    list.appendChild(item);
  }

  list.querySelectorAll(".learn").forEach(b => {
    b.onclick = () => {
      const w = words.find(x => x.id === b.dataset.id);
      w.learned = true;
      w.learnedAt = new Date().toISOString();
      save(); render();
      toast(`🎓 Đã đánh dấu "${w.term}" là đã thuộc`, "success");
    };
  });
  list.querySelectorAll(".unlearn").forEach(b => {
    b.onclick = () => {
      const w = words.find(x => x.id === b.dataset.id);
      w.learned = false;
      delete w.learnedAt;
      save(); render();
      toast(`Đã bỏ đánh dấu "${w.term}"`, "success");
    };
  });

  list.querySelectorAll(".spk").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const w = words.find(x => x.id === b.dataset.id);
      if (w) speakTerm(w.term, (w.lang || "en") === "ja" ? "ja-JP" : "en-US");
    };
  });

  list.querySelectorAll(".toggle-word").forEach(b => {
    b.onclick = () => {
      const w = words.find(x => x.id === b.dataset.id);
      w.disabled = !w.disabled;
      save(); render();
    };
  });
  list.querySelectorAll(".del").forEach(b => {
    b.onclick = async () => {
      const w = words.find(x => x.id === b.dataset.id);
      const ok = await dlgConfirm("Xoá từ", `Xoá "${w.term}"?`, { okText: "Xoá" });
      if (!ok) return;
      const removed = { ...w };
      words = words.filter(x => x.id !== b.dataset.id);
      save(); render();
      toast(`Đã xoá "${removed.term}" — bấm để hoàn tác`, "undo", () => {
        if (words.some(x => x.id === removed.id)) return;
        words.push(removed);
        save(); render();
        toast(`Đã khôi phục "${removed.term}"`, "success");
      });
    };
  });
  list.querySelectorAll(".edit").forEach(b => {
    b.onclick = () => {
      startInlineEdit(b.closest(".item"), b.dataset.id);
    };
  });
  list.querySelectorAll(".src-link").forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (a.dataset.url) chrome.tabs.create({ url: a.dataset.url });
    };
  });
  list.querySelectorAll(".tag-chip").forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      tagFilter = b.dataset.tag || null;
      render();
    };
  });
}

// ---------- Inline edit (thay prompt) ----------
function startInlineEdit(itemEl, id) {
  const w = words.find(x => x.id === id);
  if (!w || !itemEl) return;
  const info = itemEl.querySelector(".info");
  const typeOpts = Object.keys(VN_TYPES).map(t =>
    `<option value="${t}"${typeOf(w) === t ? " selected" : ""}>${VN_TYPES[t].icon} ${VN_TYPES[t].label}</option>`).join("");
  info.innerHTML = `
    <input type="text" class="term-input" value="${escapeHtml(w.term)}" placeholder="Từ" />
    <select class="type-input" title="Loại mục">${typeOpts}</select>
    <input type="text" class="meaning-input" value="${escapeHtml(w.meaning || "")}" placeholder="Nghĩa" />
    <input type="text" class="note-input" value="${escapeHtml(w.note || "")}" placeholder="Ghi chú" />
    <input type="text" class="tags-input" value="${escapeHtml(tagsToStr(w.tags))}" placeholder="Tag (cách nhau bởi dấu phẩy)" />
  `;
  itemEl.classList.add("editing");
  itemEl.querySelector(".actions").innerHTML = `
    <button class="ic-btn save-edit" title="Lưu">${ICON.save}</button>
    <button class="ic-btn cancel-edit" title="Huỷ">${ICON.cancel}</button>
  `;
  const termInput = info.querySelector(".term-input");
  const meaningInput = info.querySelector(".meaning-input");
  const noteInput = info.querySelector(".note-input");
  const tagsInput = info.querySelector(".tags-input");
  meaningInput.focus();
  meaningInput.select();

  const doSave = () => {
    const newTerm = termInput.value.trim();
    if (!newTerm) { toast("Từ không được trống", "error"); return; }
    // Trùng với từ khác?
    if (words.some(x => x.id !== id && x.term.toLowerCase() === newTerm.toLowerCase())) {
      toast(`"${newTerm}" đã có trong danh sách`, "error");
      return;
    }
    w.term = newTerm;
    const typeSel = info.querySelector(".type-input");
    if (typeSel) w.type = typeSel.value;
    w.meaning = meaningInput.value.trim();
    w.note = noteInput.value.trim();
    const tags = parseTags(tagsInput.value);
    if (tags.length) w.tags = tags; else delete w.tags;
    save(); render();
    toast("Đã lưu", "success");
    autoCloseIfWindow();
  };

  itemEl.querySelector(".save-edit").onclick = doSave;
  itemEl.querySelector(".cancel-edit").onclick = render;
  [termInput, meaningInput, noteInput, tagsInput].forEach(inp => {
    inp.addEventListener("keydown", imeSafe(e => {
      if (e.key === "Enter") doSave();
      else if (e.key === "Escape") render();
    }));
  });
}

// ---------- Thêm thủ công ----------
$("addBtn").onclick = () => {
  const term = $("termInput").value.trim();
  if (!term) { $("termInput").focus(); return; }
  if (words.some(w => w.term.toLowerCase() === term.toLowerCase())) {
    toast(`"${term}" đã có trong danh sách`, "warn");
    return;
  }
  const tags = parseTags($("tagsInput").value);
  words.push({
    id: newId(),
    term,
    lang: detectLang(term),
    type: composerType,
    meaning: $("meaningInput").value.trim(),
    note: $("noteInput").value.trim(),
    tags: tags.length ? tags : undefined,
    hoverCount: 0,
    autoDeleteAt: settings.defaultThreshold || 20,
    createdAt: new Date().toISOString()
  });
  save();
  render();
  if (isWindowMode) {
    autoCloseIfWindow();
  } else {
    // Xong 1 mục → quay lại danh sách để thấy ngay mục vừa thêm (mô hình 1-việc-1-lúc).
    closeAddScreen();
    toast(`Đã thêm "${term}"`, "success");
  }
};

// Term là textarea (hỗ trợ đoạn dài) → tự giãn chiều cao; Ctrl/Cmd+Enter để lưu nhanh
function growTerm() {
  const ta = $("termInput");
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
}
$("termInput").addEventListener("input", growTerm);
$("termInput").addEventListener("keydown", imeSafe(e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("addBtn").click(); }
}));
$("meaningInput").addEventListener("keydown", imeSafe(e => { if (e.key === "Enter") $("noteInput").focus(); }));
$("noteInput").addEventListener("keydown", imeSafe(e => { if (e.key === "Enter") $("tagsInput").focus(); }));
$("tagsInput").addEventListener("keydown", imeSafe(e => { if (e.key === "Enter") $("addBtn").click(); }));
$("searchInput").addEventListener("input", debounce(render, 150));
$("sortSel").addEventListener("change", render);
$("filterSel").addEventListener("change", render);

// ---------- Bulk add ----------
$("bulkBtn").onclick = () => { $("bulkModal").style.display = "flex"; $("bulkText").focus(); };
$("bulkCancel").onclick = () => $("bulkModal").style.display = "none";
$("bulkSave").onclick = () => {
  const lines = $("bulkText").value.split("\n").map(l => l.trim()).filter(Boolean);
  let added = 0, dup = 0;
  for (const line of lines) {
    // Tách theo " - " hoặc tab hoặc " : "
    const parts = line.split(/\s+-\s+|\t+|\s+:\s+/);
    const term = (parts[0] || "").trim();
    if (!term) continue;
    if (words.some(w => w.term.toLowerCase() === term.toLowerCase())) { dup++; continue; }
    words.push({
      id: newId(),
      term,
      lang: detectLang(term),
      type: composerType,
      meaning: (parts[1] || "").trim(),
      note: (parts[2] || "").trim(),
      hoverCount: 0,
      autoDeleteAt: settings.defaultThreshold || 20,
      createdAt: new Date().toISOString()
    });
    added++;
  }
  save();
  $("bulkText").value = "";
  $("bulkModal").style.display = "none";
  toast(`Đã thêm ${added} từ${dup ? `, bỏ qua ${dup} trùng` : ""}`, "success");
  render();
};

// ---------- Ôn tập giãn cách (SRS — SM-2 rút gọn) ----------
// Mỗi từ mang lịch riêng: srsDue (khi nào ôn lại), srsInterval (ngày), srsEase,
// srsReps. Đến hạn (srsDue <= giờ) hoặc chưa có lịch = "đến hạn". Buổi ôn lấy
// từ đến hạn trước, rồi thêm tối đa `srsNewPerDay` từ mới. Chấm điểm:
//   Quên → về đầu, ôn lại ngay trong phiên   Nhớ → giãn theo ease   Dễ → giãn xa hơn.
// Interval đủ lớn (SRS_GRAD_DAYS) → tự đánh dấu "đã thuộc" (giữ từ, ngừng tô sáng).
const SRS_DAY_MS = 86400000;
const SRS_GRAD_DAYS = 45;

function srsBuckets(now = Date.now()) {
  const overdue = [], fresh = [];
  for (const w of words) {
    // Ôn tập giãn cách chỉ dành cho từ vựng — không kéo việc cần làm / tư liệu vào.
    if (typeOf(w) !== "vocab") continue;
    if (w.learned || w.disabled || !w.meaning) continue;
    if (!w.srsDue) fresh.push(w);
    else if (Date.parse(w.srsDue) <= now) overdue.push(w);
  }
  return { overdue, fresh };
}
function srsDueCount() {
  if (settings.srsReminder === false) return 0;
  const { overdue, fresh } = srsBuckets();
  return overdue.length + Math.min(fresh.length, settings.srsNewPerDay || 20);
}
function srsBuildDeck() {
  const { overdue, fresh } = srsBuckets();
  const limit = settings.srsNewPerDay || 20;
  overdue.sort((a, b) => Date.parse(a.srsDue) - Date.parse(b.srsDue)); // quá hạn lâu nhất trước
  const newOnes = [...fresh]
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
    .slice(0, limit);
  return overdue.concat(newOnes);
}
function srsGrade(w, grade) {
  const now = Date.now();
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
  w.srsEase = Math.round(ease * 100) / 100;
  w.srsReps = reps;
  w.srsInterval = interval;
  w.srsLast = new Date(now).toISOString();
  w.srsDue = new Date(now + interval * SRS_DAY_MS).toISOString();
  // Giãn đủ xa → coi như nhớ lâu dài, đánh dấu đã thuộc.
  if (interval >= SRS_GRAD_DAYS && !w.learned) {
    w.learned = true;
    w.learnedAt = new Date(now).toISOString();
  }
}
// Nhãn lịch ôn cho danh sách ("ôn hôm nay" / "ôn sau 3 ngày").
function srsDueLabel(iso) {
  const diff = Date.parse(iso) - Date.now();
  if (diff <= 0) return "cần ôn";
  const d = Math.ceil(diff / SRS_DAY_MS);
  return d <= 1 ? "ôn mai" : `ôn sau ${d} ngày`;
}

// Thanh nhắc "Ôn hôm nay: N từ" trên đầu danh sách.
function renderReviewBar() {
  const bar = $("reviewBar");
  if (!bar) return;
  const n = srsDueCount();
  if (settings.srsReminder === false || n === 0) { bar.style.display = "none"; return; }
  bar.style.display = "flex";
  bar.innerHTML = `<span class="rb-text">🔔 Ôn hôm nay: <b>${n}</b> từ</span>
    <button id="reviewNowBtn">Ôn ngay →</button>`;
  $("reviewNowBtn").onclick = startReview;
}

let reviewDeck = [];
let reviewPos = 0;
let reviewStats = { again: 0, good: 0, easy: 0 };

$("quizBtn").onclick = startReview;

// Đóng buổi ôn bất cứ lúc nào: nút ✕, phím Esc, hoặc bấm ra nền.
function closeQuiz() { $("quizModal").style.display = "none"; render(); }
$("quizX").onclick = closeQuiz;
$("quizModal").addEventListener("mousedown", (e) => { if (e.target === $("quizModal")) closeQuiz(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("quizModal").style.display === "flex") closeQuiz();
});

function startReview() {
  let deck = srsBuildDeck();
  if (deck.length === 0) {
    // Không còn từ đến hạn → ôn nhẹ các từ sắp tới hạn (luyện thêm, không bắt buộc).
    deck = words.filter(w => typeOf(w) === "vocab" && !w.disabled && !w.learned && w.meaning)
      .sort((a, b) => Date.parse(a.srsDue || 0) - Date.parse(b.srsDue || 0))
      .slice(0, 15);
    if (deck.length === 0) { toast("Chưa có mục nào có nghĩa để ôn", "warn"); return; }
  }
  reviewDeck = deck.map(w => ({ w, requeued: false }));
  reviewPos = 0;
  reviewStats = { again: 0, good: 0, easy: 0 };
  $("quizModal").style.display = "flex";
  showReviewCard();
}

function showReviewCard() {
  const card = $("quizCard");
  const actions = $("quizActions");
  const prog = $("quizProgress");
  if (reviewPos >= reviewDeck.length) {
    prog.textContent = "";
    card.innerHTML = `
      <div class="q-meaning">🎉 Xong buổi ôn!</div>
      <div class="q-summary">✅ Nhớ <b>${reviewStats.good + reviewStats.easy}</b> &nbsp;·&nbsp; 🔁 Ôn lại <b>${reviewStats.again}</b></div>`;
    actions.innerHTML = `<button class="btn-primary" id="quizClose">Đóng</button>`;
    $("quizClose").onclick = () => { $("quizModal").style.display = "none"; render(); };
    return;
  }
  const item = reviewDeck[reviewPos];
  const w = item.w;
  prog.textContent = `${reviewPos + 1} / ${reviewDeck.length}`;
  card.innerHTML = `
    <div class="q-term">${escapeHtml(w.term)}</div>
    <div class="q-meaning q-hidden">(bấm để xem nghĩa)</div>`;
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    const m = card.querySelector(".q-meaning");
    m.className = "q-meaning";
    m.innerHTML = escapeHtml(w.meaning) + (w.phonetic ? `<div class="q-phon">${escapeHtml(w.phonetic)}</div>` : "");
    actions.querySelectorAll("button").forEach(b => b.disabled = false);
  };
  card.onclick = reveal;
  // Nút chấm điểm khoá tới khi lật thẻ (bắt buộc tự nhớ trước khi xem).
  actions.innerHTML = `
    <button class="btn-bad" id="rAgain" disabled>Quên</button>
    <button class="btn-good" id="rGood" disabled>Nhớ</button>
    <button class="btn-skip" id="rEasy" disabled>Dễ</button>`;
  const grade = (g) => {
    if (!revealed) { reveal(); return; }
    srsGrade(w, g);
    if (g === "again") {
      reviewStats.again++;
      if (!item.requeued) { item.requeued = true; reviewDeck.push({ w, requeued: true }); }
    } else if (g === "easy") reviewStats.easy++;
    else reviewStats.good++;
    save();
    reviewPos++;
    showReviewCard();
  };
  $("rAgain").onclick = () => grade("again");
  $("rGood").onclick = () => grade("good");
  $("rEasy").onclick = () => grade("easy");
}

// ---------- Export / Import ----------
$("exportBtn").onclick = () => {
  const data = { version: 1, exportedAt: new Date().toISOString(), words, settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Highlight Note - Tu vung (${new Date().toISOString().slice(0, 10)}).json`;
  a.click();
  URL.revokeObjectURL(url);
  settings.lastExportAt = new Date().toISOString();
  saveSettings();
  renderBackupBanner();
};

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
      if (w.meaning) line += ` — ${oneLine(w.meaning)}`;
      if (w.tags && w.tags.length) line += ` ${w.tags.map(tg => "#" + oneLine(tg).replace(/\s+/g, "-")).join(" ")}`;
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
  URL.revokeObjectURL(url);
  toast("Đã xuất Markdown", "success");
}
if ($("exportMdBtn")) $("exportMdBtn").onclick = exportMarkdown;

// Import qua trang Cài đặt: popup hay tự đóng khi mở hộp thoại chọn file (đặc biệt trên Linux).
$("importBtn").onclick = () => chrome.runtime.openOptionsPage();
$("importFile").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.words)) throw new Error("File không hợp lệ");
      const mode = await dlgChoice(
        "Import từ vựng",
        `Tìm thấy ${data.words.length} từ trong file.`,
        [
          { label: "Huỷ", value: null, kind: "btn-cancel" },
          { label: "Thay thế", value: "replace", kind: "btn-bad" },
          { label: "Gộp (giữ counter max)", value: "merge", kind: "btn-primary" }
        ]
      );
      if (!mode) { e.target.value = ""; return; }
      const mkWord = (w) => ({
        id: w.id || newId(),
        term: w.term,
        lang: w.lang || detectLang(w.term),
        type: w.type || "vocab",
        tags: (Array.isArray(w.tags) && w.tags.length) ? parseTags(w.tags.join(",")) : undefined,
        sticky: w.sticky || undefined,
        stickyPos: w.stickyPos || undefined,
        stickyCollapsed: w.stickyCollapsed || undefined,
        anchor: w.anchor || undefined,
        url: w.url || undefined,
        pageTitle: w.pageTitle || undefined,
        anchorPrefix: w.anchorPrefix || undefined,
        anchorSuffix: w.anchorSuffix || undefined,
        phonetic: w.phonetic || "",
        meaning: w.meaning || "",
        note: w.note || "",
        hoverCount: w.hoverCount || 0,
        autoDeleteAt: w.autoDeleteAt || (settings.defaultThreshold || 20),
        learned: !!w.learned,
        learnedAt: w.learnedAt || undefined,
        createdAt: w.createdAt || new Date().toISOString()
      });
      if (mode === "merge") {
        const byTerm = new Map(words.filter(w => !w.sticky).map(w => [w.term.toLowerCase(), w]));
        const ids = new Set(words.map(w => w.id));
        for (const w of data.words) {
          // Sticky note gắn theo URL → không gộp theo tên; thêm mới nếu chưa có id.
          if (w.sticky) { if (!ids.has(w.id)) words.push(mkWord(w)); continue; }
          const k = w.term.toLowerCase();
          if (byTerm.has(k)) {
            const ex = byTerm.get(k);
            ex.hoverCount = Math.max(ex.hoverCount || 0, w.hoverCount || 0);
            if (!ex.meaning && w.meaning) ex.meaning = w.meaning;
            if (!ex.note && w.note) ex.note = w.note;
            // Gộp tag (hợp nhất, không trùng)
            if (Array.isArray(w.tags) && w.tags.length) {
              const merged = parseTags([...(ex.tags || []), ...w.tags].join(","));
              if (merged.length) ex.tags = merged;
            }
          } else {
            words.push(mkWord(w));
          }
        }
      } else {
        words = data.words.map(mkWord);
      }
      if (data.settings) settings = { ...settings, ...data.settings };
      chrome.storage.local.set({ words, settings }, () => {
        render();
        toast(`Import xong — ${words.length} từ`, "success");
      });
    } catch (err) {
      toast("Lỗi đọc file: " + err.message, "error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

$("optionsBtn").onclick = () => chrome.runtime.openOptionsPage();
if ($("helpBtn")) $("helpBtn").onclick = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
if ($("syncDot")) $("syncDot").onclick = () => chrome.runtime.openOptionsPage();

if (isWindowMode || isSidePanel) {
  // Trong cửa sổ riêng / side panel: đã gõ được tiếng Việt rồi, ẩn nút mở panel.
  if ($("windowBtn")) $("windowBtn").style.display = "none";
} else {
  // Popup mặc định: nút này giờ mở Side Panel (thay cho cửa sổ riêng cũ) — panel
  // đứng yên cạnh trang, nhập liệu ổn định (IME). Fallback về cửa sổ riêng nếu
  // trình duyệt chưa hỗ trợ sidePanel hoặc chưa kịp lấy windowId.
  $("windowBtn").title = "Mở ở Side Panel";
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

// Trang có thể mở TRƯỚC khi cài/cập nhật extension → content script chưa có sẵn.
// Khi gửi lệnh thất bại, tự tiêm content.js + content.css rồi thử lại.
async function ensureContentScript(tabId) {
  if (!chrome.scripting) return false;
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return true;
  } catch (e) {
    return false;
  }
}

$("rescanBtn").onclick = async () => {
  const tab = await getBrowsingTab();
  if (!tab) return;
  const ok = () => {
    $("rescanBtn").classList.add("ok");
    setTimeout(() => $("rescanBtn").classList.remove("ok"), 1500);
  };
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FORCE_RESCAN" });
    ok();
    return;
  } catch (e) { /* content script chưa có → thử tiêm bên dưới */ }
  // Fallback: tiêm content script rồi gửi lại lệnh
  const injected = await ensureContentScript(tab.id);
  if (!injected) {
    toast("Trang này không chạy được tiện ích (vd chrome://, cửa hàng Web Store)", "error");
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FORCE_RESCAN" });
    ok();
  } catch (e2) {
    toast("Trang chưa tải xong — thử lại sau giây lát", "error");
  }
};

async function renderSiteBar() {
  const bar = $("siteBar");
  const tab = await getBrowsingTab();
  if (!tab || !tab.url) { bar.style.display = "none"; return; }
  let host;
  try { host = new URL(tab.url).hostname; } catch { bar.style.display = "none"; return; }
  if (!host) { bar.style.display = "none"; return; }
  const list = settings.blacklistedHosts || [];
  const isBlocked = list.includes(host);
  bar.className = "site-bar" + (isBlocked ? " bl" : "");
  bar.innerHTML = `
    <span class="host" title="${host}">${isBlocked ? "🚫 " : "🌐 "}${host}</span>
    ${isBlocked ? "" : `<button id="stickyBtn" title="Ghim ghi chú lên trang đang xem">📌 Ghi chú</button>`}
    <button id="blBtn">${isBlocked ? "Bật lại" : "Tắt site này"}</button>
  `;
  $("blBtn").onclick = () => {
    let newList = list.slice();
    if (isBlocked) newList = newList.filter(h => h !== host);
    else newList.push(host);
    settings.blacklistedHosts = newList;
    saveSettings();
    renderSiteBar();
  };
  const stickyBtn = $("stickyBtn");
  if (stickyBtn) stickyBtn.onclick = async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "ADD_STICKY_NOTE" });
    } catch (e) {
      // Content script chưa có (trang mở trước khi cài) → tiêm rồi thử lại.
      const injected = await ensureContentScript(tab.id);
      if (!injected) { toast("Trang này không chạy được tiện ích", "error"); return; }
      try { await chrome.tabs.sendMessage(tab.id, { type: "ADD_STICKY_NOTE" }); }
      catch (e2) { toast("Trang chưa tải xong — thử lại sau giây lát", "error"); return; }
    }
    window.close(); // đóng popup để người dùng thấy thẻ ghi chú trên trang
  };
}

// Sau khi bulk save trong window mode → tự đóng
if (isWindowMode) {
  const origBulkSave = $("bulkSave").onclick;
  $("bulkSave").onclick = function (...args) {
    if (origBulkSave) origBulkSave.apply(this, args);
    autoCloseIfWindow();
  };
}

// Tô đậm window mode để user biết đang ở cửa sổ riêng
if (isWindowMode) {
  document.body.classList.add("window-mode");
}
// Side Panel: bỏ bề rộng cố định để lấp đầy panel (user tự kéo rộng/hẹp).
if (isSidePanel) {
  document.body.classList.add("panel-mode");
}

load(); // load() sẽ tự gọi renderSiteBar() sau khi settings sẵn sàng

// Giữ popup đồng bộ với storage: khi dữ liệu đổi từ nơi khác (đồng bộ kéo về,
// content script sửa/xoá…), cập nhật biến trong popup để lần "save" sau KHÔNG
// ghi đè bản cũ. Bỏ qua khi đang sửa inline để không mất chữ đang gõ.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings && changes.settings.newValue) {
    settings = changes.settings.newValue;
    applyTheme();    // theme có thể đổi từ tab khác
    renderSiteBar(); // blacklist có thể đổi từ Options/tab khác → cập nhật bar
  }
  if (changes.words && changes.words.newValue) {
    words = changes.words.newValue;
    if (!document.querySelector(".editing")) {
      render();
      renderStats && renderStats();
    }
  }
});

// Auto-focus / auto-open theo focus param
if (isWindowMode && focusTarget) {
  setTimeout(() => {
    if (focusTarget === "bulkBtn") $("bulkBtn").click();
    else if (focusTarget.startsWith("edit:")) {
      const id = focusTarget.slice(5);
      const btn = document.querySelector(`.edit[data-id="${id}"]`);
      if (btn) btn.click();
    } else {
      const el = $(focusTarget);
      if (el) el.focus();
    }
  }, 150);
}
