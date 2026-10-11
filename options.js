const $ = (id) => document.getElementById(id);
const { VN_TYPE_COLORS: tcDef, VN_TYPES, detectLang } = self.HN_CONST;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Điều hướng: menu trái, mỗi lần hiện 1 khu ----------
const SEC_ALIAS = { backup: "sync", appearance: "general" }; // link cũ từ popup
function showSection(name, focusEl) {
  name = SEC_ALIAS[name] || name;
  if (!document.querySelector(`section[data-sec="${name}"]`)) name = "highlight";
  document.querySelectorAll("main section").forEach(s => { s.hidden = s.dataset.sec !== name; });
  document.querySelectorAll(".nav button").forEach(b => {
    const on = b.dataset.sec === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-current", on ? "page" : "false");
  });
  if (focusEl) {
    const el = $(focusEl);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  } else {
    window.scrollTo(0, 0);
  }
}
document.querySelector(".nav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sec]");
  if (!b) return;
  history.replaceState(null, "", "#" + b.dataset.sec);
  showSection(b.dataset.sec);
});
(function initSection() {
  const h = (location.hash || "").slice(1);
  showSection(h || "highlight", h === "backup" ? "backup" : null);
})();
window.addEventListener("hashchange", () => showSection(location.hash.slice(1)));
try { $("ver").textContent = "Phiên bản " + chrome.runtime.getManifest().version; } catch (e) {}

// ---------- Theme ----------
function resolveTheme(t) {
  return (t === "light" || t === "dark") ? t
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function applyThemeFromStorage() {
  chrome.storage.local.get("settings", ({ settings }) => {
    const t = (settings && settings.theme) || "auto";
    document.documentElement.setAttribute("data-theme", resolveTheme(t));
    try { localStorage.setItem("hn-theme", t); } catch (e) {} // cho theme-init.js
    const r = document.querySelector(`input[name="theme"][value="${t}"]`);
    if (r) r.checked = true;
  });
}
applyThemeFromStorage();
try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyThemeFromStorage); } catch (e) {}
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.settings) applyThemeFromStorage(); });
document.querySelectorAll('input[name="theme"]').forEach(r => r.addEventListener("change", () => {
  if (r.checked) patchSettings({ theme: r.value }, savedFeedback);
}));

// ---------- Hộp thoại + toast (thay alert/confirm của trình duyệt) ----------
// buttons: [{ label, value, cls }] — nút cuối là nút mặc định (focus sẵn).
function uiDialog(title, bodyHtml, buttons) {
  return new Promise(resolve => {
    $("dlgTitle").textContent = title;
    $("dlgBody").innerHTML = bodyHtml;
    $("dlgActs").innerHTML = "";
    const close = (v) => { $("dlg").hidden = true; document.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(null); } };
    buttons.forEach(b => {
      const el = document.createElement("button");
      el.textContent = b.label;
      el.className = "btn " + (b.cls || "");
      el.onclick = () => close(b.value);
      $("dlgActs").appendChild(el);
    });
    $("dlg").onclick = (e) => { if (e.target === $("dlg")) close(null); };
    document.addEventListener("keydown", onKey, true);
    $("dlg").hidden = false;
    $("dlgActs").lastElementChild.focus();
  });
}
let toastTimer = null;
function uiToast(text, kind) {
  const t = $("toast");
  t.textContent = text;
  t.className = "toast" + (kind ? " " + kind : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === "err" ? 5000 : 2600);
}
// Phản hồi nhẹ khi tự lưu cài đặt (không chặn thao tác).
let savedTimer = null;
function savedFeedback() {
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => uiToast("✓ Đã lưu"), 250);
}

// ---------- Nạp cài đặt ----------
let blacklist = [];
chrome.storage.local.get("settings", ({ settings }) => {
  const s = settings || {};
  $("threshold").value = s.defaultThreshold ?? 20;
  $("cooldownMin").value = Math.max(1, Math.round((s.hoverCooldownMs ?? 300000) / 60000));
  $("color").value = s.highlightColor ?? "#ffeb3b";
  const tc = s.typeColors || {};
  $("colorImportant").value = tc.important || tcDef.important;
  $("colorTodo").value = tc.todo || tcDef.todo;
  $("colorQuestion").value = tc.question || tcDef.question;
  $("colorReference").value = tc.reference || tcDef.reference;
  const st = document.querySelector(`input[name="hlStyle"][value="${s.highlightStyle || "underline"}"]`);
  if (st) st.checked = true;
  $("hlThickness").value = s.highlightThickness ?? 2;
  $("caseSensitive").checked = !!s.caseSensitive;
  $("learningMode").checked = s.learningMode === true;
  $("srsReminder").checked = s.srsReminder !== false;
  $("srsNewPerDay").value = s.srsNewPerDay ?? 20;
  $("showToasts").checked = s.showToasts !== false;
  $("previewTranslate").checked = s.previewTranslate !== false;
  $("showSelButton").checked = s.showSelButton !== false;
  $("showSelCopy").checked = s.showSelCopy !== false;
  $("showSelSpeak").checked = s.showSelSpeak !== false;
  $("autoBackup").checked = s.autoBackup !== false;
  blacklist = (s.blacklistedHosts || []).slice();
  renderSites();
  updatePreview();
  updateDependents();
});

// ---------- Xem trước tô sáng ----------
function contrastTextFor(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "#000";
  let h = m[1];
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return ((r * 299 + g * 587 + b * 114) / 1000) >= 140 ? "#000" : "#fff";
}
function currentStyle() {
  const r = document.querySelector('input[name="hlStyle"]:checked');
  return r ? r.value : "underline";
}
function updatePreview() {
  const root = document.documentElement.style;
  const colors = {
    vocab: $("color").value, important: $("colorImportant").value, todo: $("colorTodo").value,
    question: $("colorQuestion").value, reference: $("colorReference").value
  };
  for (const [t, c] of Object.entries(colors)) {
    root.setProperty(`--c-${t}`, c);
    root.setProperty(`--tc-${t}`, contrastTextFor(c));
  }
  const thick = parseInt($("hlThickness").value) || 2;
  document.querySelectorAll(".pv").forEach(p => p.style.setProperty("--th", thick + "px"));
  $("preview").dataset.style = currentStyle();
  $("hlThicknessVal").textContent = thick + "px";
  // Kiểu Tô nền không dùng độ dày nét.
  $("thickRow").classList.toggle("off", currentStyle() === "background");
  $("hlThickness").disabled = currentStyle() === "background";
}
// Tuỳ chọn con chỉ có nghĩa khi tuỳ chọn cha đang bật → làm mờ cho dễ hiểu.
function updateDependents() {
  const sel = $("showSelButton").checked;
  ["previewTranslate", "showSelSpeak", "showSelCopy"].forEach(id => {
    $(id).disabled = !sel;
    $(id).closest(".row").classList.toggle("off", !sel);
  });
  const rev = $("learningMode").checked;
  ["srsReminder", "srsNewPerDay", "threshold", "cooldownMin"].forEach(id => {
    $(id).disabled = !rev;
    $(id).closest(".row").classList.toggle("off", !rev);
  });
}

// ---------- Tự động lưu ----------
function patchSettings(patch, cb) {
  chrome.storage.local.get("settings", ({ settings }) => {
    chrome.storage.local.set({ settings: { ...(settings || {}), ...patch } }, cb || (() => {}));
  });
}
function saveAll() {
  patchSettings({
    defaultThreshold: Math.min(200, Math.max(1, parseInt($("threshold").value) || 20)),
    hoverCooldownMs: Math.min(1440, Math.max(1, parseInt($("cooldownMin").value) || 5)) * 60000,
    highlightColor: $("color").value,
    typeColors: {
      important: $("colorImportant").value,
      todo: $("colorTodo").value,
      question: $("colorQuestion").value,
      reference: $("colorReference").value
    },
    highlightStyle: currentStyle(),
    highlightThickness: Math.min(5, Math.max(1, parseInt($("hlThickness").value) || 2)),
    caseSensitive: $("caseSensitive").checked,
    learningMode: $("learningMode").checked,
    srsReminder: $("srsReminder").checked,
    srsNewPerDay: Math.min(500, Math.max(1, parseInt($("srsNewPerDay").value) || 20)),
    showToasts: $("showToasts").checked,
    previewTranslate: $("previewTranslate").checked,
    showSelButton: $("showSelButton").checked,
    showSelCopy: $("showSelCopy").checked,
    showSelSpeak: $("showSelSpeak").checked,
    blacklistedHosts: blacklist.slice()
  }, savedFeedback);
}
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAll, 500);
}

["learningMode", "srsReminder", "caseSensitive", "showToasts", "previewTranslate", "showSelButton", "showSelCopy", "showSelSpeak"]
  .forEach(id => $(id).addEventListener("change", () => { updateDependents(); saveAll(); }));
["color", "colorImportant", "colorTodo", "colorQuestion", "colorReference"].forEach(id => {
  $(id).addEventListener("input", () => { updatePreview(); saveSoon(); });   // kéo bảng màu
  $(id).addEventListener("change", () => { updatePreview(); saveAll(); });
});
document.querySelectorAll('input[name="hlStyle"]').forEach(r => r.addEventListener("change", () => { updatePreview(); saveAll(); }));
$("hlThickness").addEventListener("input", () => { updatePreview(); saveSoon(); });
["threshold", "cooldownMin", "srsNewPerDay"].forEach(id => {
  $(id).addEventListener("input", saveSoon);
  $(id).addEventListener("change", saveAll);
});
$("resetColorsBtn").onclick = () => {
  $("color").value = "#ffeb3b";
  $("colorImportant").value = tcDef.important;
  $("colorTodo").value = tcDef.todo;
  $("colorQuestion").value = tcDef.question;
  $("colorReference").value = tcDef.reference;
  updatePreview();
  saveAll();
};

// ---------- Trang web bị tắt ----------
// Người dùng hay dán cả URL ("https://www.facebook.com/abc") → lấy hostname.
function normHost(line) {
  let s = String(line || "").trim().toLowerCase();
  if (!s) return "";
  try { if (/^[a-z]+:\/\//.test(s)) s = new URL(s).hostname; } catch (e) {}
  return s.replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
}
function renderSites() {
  const box = $("siteList");
  if (!blacklist.length) {
    box.innerHTML = `<span class="empty-note">Chưa tắt trang nào.</span>`;
    return;
  }
  box.innerHTML = blacklist.map((h, i) =>
    `<span class="chip">${escapeHtml(h)}<button data-i="${i}" title="Bật lại trang này" aria-label="Bỏ ${escapeHtml(h)}">×</button></span>`
  ).join("");
}
function addSite() {
  const h = normHost($("siteInput").value);
  if (!h || (!/\./.test(h) && h !== "localhost")) { uiToast("Nhập tên miền, vd: facebook.com", "err"); return; }
  if (!blacklist.includes(h)) blacklist.push(h);
  $("siteInput").value = "";
  renderSites();
  saveAll();
}
$("siteAddBtn").onclick = addSite;
$("siteInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSite(); } });
$("siteList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  blacklist.splice(+b.dataset.i, 1);
  renderSites();
  saveAll();
});
// Popup bấm "Tắt ở đây" khi trang này đang mở → cập nhật danh sách.
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local" || !c.settings || !c.settings.newValue) return;
  const nb = c.settings.newValue.blacklistedHosts || [];
  if (JSON.stringify(nb) !== JSON.stringify(blacklist)) { blacklist = nb.slice(); renderSites(); }
});

// ---------- Phím tắt ----------
const CMD_LABEL = {
  "add-selected-word": "Lưu chữ đang bôi đen",
  "translate-selection": "Dịch chữ đang bôi đen",
  "open-side-panel": "Mở Side Panel (bảng cạnh trang)",
  "_execute_action": "Mở popup Highlight Note"
};
function renderShortcuts() {
  if (!chrome.commands || !chrome.commands.getAll) return;
  chrome.commands.getAll((cmds) => {
    $("kbdList").innerHTML = (cmds || []).filter(c => CMD_LABEL[c.name]).map(c => {
      const keys = c.shortcut
        ? c.shortcut.split("+").map(k => `<kbd>${escapeHtml(k)}</kbd>`).join(" + ")
        : `<span class="empty-note">chưa đặt</span>`;
      return `<div class="row"><div class="rt"><b>${CMD_LABEL[c.name]}</b></div><span>${keys}</span></div>`;
    }).join("");
  });
}
renderShortcuts();
window.addEventListener("focus", renderShortcuts); // quay lại sau khi đổi phím tắt
$("shortcutsBtn").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
$("openWelcomeBtn").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });

// ---------- Sao lưu ra file ----------
$("autoBackup").addEventListener("change", () => patchSettings({ autoBackup: $("autoBackup").checked }, savedFeedback));
$("backupNowBtn").onclick = () => {
  chrome.runtime.sendMessage({ type: "AUTO_BACKUP_NOW" }, (r) => {
    if (chrome.runtime.lastError || !r || !r.ok) uiToast("Không lưu được file backup", "err");
    else uiToast("✓ Đã lưu file backup vào thư mục Tải về", "ok");
  });
};

function downloadBackup(words, settings) {
  const data = { version: 1, exportedAt: new Date().toISOString(), words: words || [], settings: settings || {} };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Highlight Note - Tu vung (${new Date().toISOString().slice(0, 10)}).json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("exportBtn").onclick = () => {
  chrome.storage.local.get(["words", "settings"], (d) => {
    downloadBackup(d.words, d.settings);
    patchSettings({ lastExportAt: new Date().toISOString() });
    uiToast(`✓ Đã tải file backup (${(d.words || []).length} mục)`, "ok");
  });
};

$("clearBtn").onclick = () => {
  chrome.storage.local.get(["words", "settings"], async (d) => {
    const n = (d.words || []).length;
    if (!n) { uiToast("Chưa có dữ liệu nào để xoá"); return; }
    const ok = await uiDialog(
      `Xoá toàn bộ ${n} mục?`,
      `<p>Mọi từ vựng, ghi chú và lịch ôn sẽ bị xoá khỏi máy này. Nếu đang dùng Google Drive, lần <b>Đồng bộ</b> tiếp theo sẽ hỏi bạn có xoá trên các máy khác không.</p>
       <p>Một file backup sẽ tự tải về trước khi xoá để bạn khôi phục nếu cần.</p>`,
      [{ label: "Huỷ", value: false, cls: "ghost" }, { label: "Xoá hết", value: true, cls: "danger" }]
    );
    if (!ok) return;
    downloadBackup(d.words, d.settings);
    chrome.storage.local.set({ words: [] }, () => uiToast("Đã xoá hết. File backup phòng hờ ở thư mục Tải về.", "ok"));
  });
};

// ---------- Đồng bộ Google Drive (thủ công, gộp từng mục) ----------
function relTime(ms) {
  if (!ms) return "";
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
  if (st.added) parts.push(`lấy về ${st.added} mục mới`);
  if (st.updated) parts.push(`cập nhật ${st.updated} mục`);
  if (st.sent) parts.push(`gửi lên ${st.sent} mục`);
  if (st.removed) parts.push(`bỏ ${st.removed} mục đã xoá ở máy khác`);
  return parts.length ? parts.join(", ") : "hai bên đã khớp, không có gì mới";
}

function applySyncStatus(s) {
  if (!s) return;
  $("syncNotConfigured").hidden = s.driveConfigured;
  $("syncDisconnected").hidden = !s.driveConfigured || s.connected;
  $("syncConnected").hidden = !s.driveConfigured || !s.connected;
  if (!s.connected) return;
  $("syncAccount").textContent = "Đã kết nối Google Drive" + (s.email ? " · " + s.email : "");
  const ls = s.lastSync;
  $("syncLast").textContent = ls
    ? `Đồng bộ lần cuối trên máy này: ${relTime(ls.at)} · ${ls.count} mục`
    : "Máy này chưa đồng bộ lần nào — bấm Đồng bộ ngay.";
  $("syncResult").textContent = ls && ls.stats ? "Lần trước: " + syncSummary(ls.stats) + "." : "";
  const rb = $("restoreBtn");
  rb.hidden = !s.removedCount;
  rb.textContent = `Khôi phục ${s.removedCount} mục bị bỏ ở lần trước`;
}
function refreshSyncStatus() {
  chrome.runtime.sendMessage({ type: "SYNC_STATUS" }, (r) => {
    if (chrome.runtime.lastError || !r || !r.ok) return;
    applySyncStatus(r.status);
  });
}
refreshSyncStatus();
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && (c.__lastSync || c.__driveAccount || c.__syncRemoved)) refreshSyncStatus();
});

// Lần đồng bộ sắp sửa/xoá mục trên máy này → liệt kê để người dùng quyết định.
async function confirmSyncChanges(res) {
  const n = res.changeCount || res.changes.length;
  const show = res.changes.slice(0, 10);
  const st = res.stats || {};
  const extra = [];
  if (st.added) extra.push(`lấy về ${st.added} mục mới`);
  if (st.sent) extra.push(`gửi lên ${st.sent} mục`);
  const body =
    `<p>Máy khác đã thay đổi các mục dưới đây. Bạn muốn làm gì?</p>
     <ul class="chg-list">${show.map(c => `<li><b title="${escapeHtml(c.term)}">${escapeHtml(c.term)}</b>${c.kind === "removed"
        ? '<span class="tag del">máy khác đã xoá</span>' : '<span class="tag">máy khác sửa sau</span>'}</li>`).join("")}
       ${n > show.length ? `<li><span>… và ${n - show.length} mục khác</span></li>` : ""}</ul>
     ${extra.length ? `<p>Ngoài ra sẽ ${extra.join(", ")} (không ảnh hưởng gì).</p>` : ""}
     <p><b>Giữ bản máy này</b> = không xoá / sửa các mục trên, gửi bản của máy này lên Drive.</p>`;
  const v = await uiDialog(`Đồng bộ sẽ thay đổi ${n} mục trên máy này`, body, [
    { label: "Huỷ", value: null, cls: "ghost" },
    { label: "Giữ bản máy này", value: "keep", cls: "" },
    { label: "Đồng ý", value: "ok", cls: "primary" }
  ]);
  if (!v) return null;
  return v === "keep" ? { keepIds: res.changes.map(c => c.id) } : {};
}

function busy(btn, text) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  return () => { btn.disabled = false; btn.textContent = old; };
}
function runSyncFlow(type, btn, busyText, extra = {}) {
  const done = busy(btn, busyText);
  chrome.runtime.sendMessage({ type, ...extra }, async (res) => {
    done();
    if (chrome.runtime.lastError || !res) { uiToast("Không liên lạc được với tiện ích — thử lại", "err"); return; }
    if (!res.ok) { refreshSyncStatus(); uiToast("Chưa đồng bộ được: " + res.error, "err"); return; }
    if (res.status) applySyncStatus(res.status);
    if (res.needConfirm) {
      const choice = await confirmSyncChanges(res);
      if (!choice) { uiToast("Đã huỷ — chưa thay đổi gì"); return; }
      runSyncFlow("SYNC_NOW", $("syncNowBtn"), "⏳ Đang đồng bộ…", { confirm: true, keepIds: choice.keepIds || [] });
      return;
    }
    uiToast("✓ Đã đồng bộ: " + syncSummary(res.result && res.result.stats), "ok");
  });
}
$("connectDriveBtn").onclick = () => runSyncFlow("SYNC_CONNECT", $("connectDriveBtn"), "⏳ Đang kết nối…");
$("syncNowBtn").onclick = () => runSyncFlow("SYNC_NOW", $("syncNowBtn"), "⏳ Đang đồng bộ…");

$("restoreBtn").onclick = () => {
  chrome.runtime.sendMessage({ type: "SYNC_RESTORE_REMOVED" }, (res) => {
    if (res && res.ok) uiToast(`✓ Đã khôi phục ${res.restored} mục — bấm Đồng bộ để gửi lại lên Drive`, "ok");
    else uiToast("Không khôi phục được: " + ((res && res.error) || "không rõ"), "err");
    refreshSyncStatus();
  });
};
$("disconnectDriveBtn").onclick = async () => {
  const ok = await uiDialog(
    "Ngắt kết nối Google Drive?",
    "<p>Dữ liệu trên máy này và file trên Drive đều giữ nguyên. Máy này chỉ ngừng đồng bộ cho tới khi bạn kết nối lại.</p>",
    [{ label: "Huỷ", value: false, cls: "ghost" }, { label: "Ngắt kết nối", value: true, cls: "danger" }]
  );
  if (!ok) return;
  chrome.runtime.sendMessage({ type: "SYNC_DISCONNECT" }, (res) => {
    if (res && res.ok) { applySyncStatus(res.status); uiToast("Đã ngắt kết nối Drive", "ok"); }
    else uiToast("Lỗi: " + ((res && res.error) || "không rõ"), "err");
  });
};
$("openDriveBtn").onclick = () => {
  chrome.runtime.sendMessage({ type: "SYNC_GET_DRIVE_LINK" }, (res) => {
    if (chrome.runtime.lastError || !res) { uiToast("Không lấy được link", "err"); return; }
    if (res.ok && res.info && res.info.webViewLink) window.open(res.info.webViewLink, "_blank");
    else if (res.ok) uiToast("Chưa có file trên Drive — bấm \"Đồng bộ ngay\" để tạo.");
    else uiToast("Lỗi: " + res.error, "err");
  });
};

// ---------- Nạp lại từ file JSON (chạy trong tab Cài đặt nên ổn định trên Linux) ----------
function ioNewId() { return "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }

// Chuẩn hoá 1 mục từ file: GIỮ mọi trường đã có (tạm ẩn, lịch ôn, neo đoạn, sticky…).
function normImported(w, settings) {
  const out = { ...w };
  out.id = w.id || ioNewId();
  out.term = String(w.term);
  out.lang = w.lang || detectLang(out.term);
  out.type = VN_TYPES[w.type] ? w.type : "vocab";
  out.meaning = w.meaning || "";
  out.note = w.note || "";
  out.phonetic = w.phonetic || "";
  out.hoverCount = w.hoverCount || 0;
  out.autoDeleteAt = w.autoDeleteAt || settings.defaultThreshold || 20;
  out.learned = !!w.learned;
  out.createdAt = w.createdAt || new Date().toISOString();
  if (Array.isArray(w.tags) && w.tags.length) out.tags = w.tags.map(String); else delete out.tags;
  delete out._phoneticFetching;
  return out;
}

$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    e.target.value = "";
    let data;
    try { data = JSON.parse(reader.result); }
    catch (err) { uiToast("Không đọc được file: " + err.message, "err"); return; }
    if (!data || !Array.isArray(data.words)) { uiToast("File không hợp lệ (không có danh sách mục)", "err"); return; }
    const incoming = data.words.filter(w => w && typeof w.term === "string" && w.term.trim());
    chrome.storage.local.get(["words", "settings"], async (d) => {
      let words = d.words || [];
      let settings = d.settings || {};
      const mode = await uiDialog(
        "Nạp dữ liệu từ file backup",
        `<p>File có <b>${incoming.length}</b> mục. Máy này đang có <b>${words.length}</b> mục.</p>
         <p><b>Gộp vào</b> (khuyên dùng): thêm mục mới, giữ nguyên mục đang có.<br>
         <b>Thay thế toàn bộ</b>: xoá hết dữ liệu hiện tại rồi dùng đúng nội dung file.</p>`,
        [
          { label: "Huỷ", value: null, cls: "ghost" },
          { label: "Thay thế toàn bộ", value: "replace", cls: "danger" },
          { label: "Gộp vào", value: "merge", cls: "primary" }
        ]
      );
      if (!mode) return;

      let added = 0;
      if (mode === "replace") {
        words = incoming.map(w => normImported(w, settings));
        added = words.length;
      } else {
        const keyOf = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
        const byTerm = new Map(words.filter(w => !w.sticky).map(w => [keyOf(w.term), w]));
        const ids = new Set(words.map(w => w.id));
        for (const w of incoming) {
          // Sticky note gắn theo URL → không gộp theo tên; thêm mới nếu chưa có id.
          if (w.sticky) { if (!ids.has(w.id)) { words.push(normImported(w, settings)); added++; } continue; }
          const k = keyOf(w.term);
          if (byTerm.has(k)) {
            const ex = byTerm.get(k);
            ex.hoverCount = Math.max(ex.hoverCount || 0, w.hoverCount || 0);
            if (!ex.meaning && w.meaning) ex.meaning = w.meaning;
            if (!ex.note && w.note) ex.note = w.note;
            if (!ex.phonetic && w.phonetic) ex.phonetic = w.phonetic;
            if (Array.isArray(w.tags) && w.tags.length) {
              ex.tags = [...new Set([...(ex.tags || []), ...w.tags].map(s => String(s).trim()).filter(Boolean))];
            }
          } else {
            const nw = normImported(w, settings);
            if (ids.has(nw.id)) nw.id = ioNewId();
            words.push(nw);
            byTerm.set(k, nw);
            ids.add(nw.id);
            added++;
          }
        }
      }
      if (data.settings) settings = { ...settings, ...data.settings };
      chrome.storage.local.set({ words, settings }, () => {
        uiToast(mode === "replace"
          ? `✓ Đã thay thế — hiện có ${words.length} mục`
          : `✓ Đã gộp — thêm ${added} mục mới, tổng ${words.length} mục`, "ok");
      });
    });
  };
  reader.readAsText(file);
};
