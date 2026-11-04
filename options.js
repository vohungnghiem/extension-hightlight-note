const $ = (id) => document.getElementById(id);
const C = self.HN_CONST;
const { VN_TYPE_COLORS: tcDef, VN_TYPES, detectLang, TARGET_LANGS, langName, sameLang } = C;
const I18N = self.HN_I18N;
const T = I18N.t, TR = I18N.tr;
I18N.initPage();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ======================================================================
// Mô hình: mỗi ô cài đặt có data-set="<khoá>" (typeColors.x = khoá con).
//   - Đọc giá trị qua getVal (có mặc định + khoá cũ), ghi qua patch: CHỈ ghi khoá vừa đổi,
//     gộp vào bản mới nhất trong storage. Trước đây saveAll() ghi lại CẢ FORM → đổi ngôn ngữ
//     trên thẻ Dịch hay bật Chế độ học từ ở popup khi trang này đang mở là bị trả về cũ.
//   - storage đổi ở nơi khác → điền lại form (trừ ô đang gõ).
// ======================================================================
let cur = {};

// Mặc định + đọc giá trị: dùng chung với popup / background (constants.js).
const defaults = C.settingDefaults;
const getVal = C.settingVal;
// Giá trị → bản vá storage.
function toPatch(key, v) {
  if (key.startsWith("typeColors.")) {
    const tc = { ...tcDef, ...(cur.typeColors || {}) };
    tc[key.slice(11)] = v;
    return { typeColors: tc };
  }
  const p = { [key]: v };
  if (key === "nativeTargetLang") p.viTargetLang = undefined;   // bỏ khoá cũ (≤1.2)
  if (key === "hideSelNative") p.hideSelVietnamese = undefined;
  if (key === "nativeLang") {
    // Đích của chữ nước ngoài đang "theo ngôn ngữ của bạn" → theo luôn ngôn ngữ mới.
    if (sameLang(C.mainTargetLang(cur), C.nativeLang(cur))) p.targetLang = v;
    if (sameLang(C.nativeTargetLang(cur), v)) p.nativeTargetLang = C.defaultNativeTarget(v);
  }
  return p;
}
function patch(p, cb) {
  chrome.storage.local.get("settings", ({ settings }) => {
    const next = { ...(settings || {}), ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    cur = next;
    chrome.storage.local.set({ settings: next }, () => { renderAll(); cb && cb(); });
  });
}

// ---------- Hộp thoại + toast ----------
// buttons: [{ label, value, cls }] — nút cuối là nút mặc định (focus sẵn).
function uiDialog(title, bodyHtml, buttons) {
  return new Promise(resolve => {
    $("dlgTitle").textContent = TR(title);
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
  t.textContent = TR(text);
  t.className = "toast" + (kind ? " " + kind : "");
  const dur = kind === "err" ? 5000 : 2600;
  t.style.setProperty("--dur", dur + "ms");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, dur);
}
let savedTimer = null;
function savedFeedback() {
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => uiToast("✓ Đã lưu"), 250);
}

// ---------- Điều hướng: menu trái, mỗi lần hiện 1 khu ----------
// Link: options.html#<mục>[#<khoá>] — vd #selection#showSelButton mở đúng mục và làm nổi dòng đó
// (thanh nổi / thẻ Dịch trên trang web mở Cài đặt theo cách này).
const SEC_ALIAS = { backup: "sync", appearance: "general", update: "general" }; // link cũ / hộp thoại cập nhật
let currentSec = "language";
function showSection(name, rowKey) {
  name = SEC_ALIAS[name] || name;
  if (!document.querySelector(`section[data-sec="${name}"]`)) name = "language";
  currentSec = name;
  document.querySelectorAll("main section").forEach(s => { s.hidden = s.dataset.sec !== name; });
  document.querySelectorAll(".nav button").forEach(b => {
    const on = b.dataset.sec === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-current", on ? "page" : "false");
  });
  const target = rowKey && (document.querySelector(`[data-set="${CSS.escape(rowKey)}"]`) || $(rowKey));
  if (target) {
    const row = target.closest(".row") || target;
    setTimeout(() => {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
      if (target.focus && target.matches("input, select")) target.focus({ preventScroll: true });
    }, 60);
  } else {
    window.scrollTo(0, 0);
  }
}
function fromHash() {
  const [sec, row] = (location.hash || "").slice(1).split("#");
  clearSearch();
  showSection(sec || "language", row || (sec === "backup" ? "backup" : null));
}
document.querySelector(".nav").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sec]");
  if (!b) return;
  clearSearch();
  history.replaceState(null, "", "#" + b.dataset.sec);
  showSection(b.dataset.sec);
});
window.addEventListener("hashchange", fromHash);
try { $("ver").textContent = T("Phiên bản {0}", chrome.runtime.getManifest().version); } catch (e) {}

// ---------- Tìm cài đặt ----------
// Khớp cả khi gõ không dấu ("mau" → "màu") và theo từ khoá ẩn (data-kw, có cả tiếng Anh).
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
function runSearch() {
  const q = fold($("setSearch").value).trim();
  if (!q) { clearSearch(); return; }
  const toks = q.split(/\s+/);
  document.body.classList.add("searching");
  let any = false;
  document.querySelectorAll("main section").forEach(sec => {
    let secHit = false;
    sec.querySelectorAll(".rows").forEach(rows => {
      let hit = false;
      rows.querySelectorAll(":scope > .row, :scope > .how, :scope > .preview, :scope > .sync-box").forEach(r => {
        const hay = fold(r.textContent + " " + (r.dataset.kw || "") + " " + [...r.querySelectorAll("[placeholder]")].map(x => x.placeholder).join(" "));
        const ok = !r.classList.contains("preview") && toks.every(t => hay.includes(t));
        r.hidden = !ok;
        if (ok) hit = true;
      });
      // khối Đồng bộ: hiện cả khối nếu phần mô tả khớp
      if (rows.querySelector(":scope > .how:not([hidden])")) rows.querySelectorAll(":scope > .sync-box").forEach(x => { x.hidden = false; });
      if (!hit && rows.id === "kbdList" && toks.every(t => fold(rows.dataset.kw + " " + rows.textContent).includes(t))) {
        rows.querySelectorAll(":scope > .row").forEach(r => { r.hidden = false; }); hit = true;
      }
      rows.hidden = !hit;
      const h3 = rows.previousElementSibling;
      if (h3 && h3.tagName === "H3") h3.hidden = !hit;
      if (hit) secHit = true;
    });
    sec.hidden = !secHit;
    if (secHit) any = true;
  });
  $("searchEmpty").hidden = any;
}
function clearSearch() {
  if (!document.body.classList.contains("searching")) return;
  $("setSearch").value = "";
  document.body.classList.remove("searching");
  document.querySelectorAll("main .rows, main .rows > *, main h3").forEach(el => { el.hidden = false; });
  $("searchEmpty").hidden = true;
  applySyncStatus(lastSyncStatus); // các khối Drive tự ẩn/hiện theo trạng thái
  showSection(currentSec);
}
$("setSearch").addEventListener("input", runSearch);
$("setSearch").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { clearSearch(); e.target.blur(); }
  if (e.key === "Enter") {
    const first = [...document.querySelectorAll("main .row")].find(r => !r.hidden && r.offsetParent);
    const ctl = first && first.querySelector("input:not([type=hidden]), select, button");
    if (ctl) ctl.focus();
  }
});
document.addEventListener("keydown", (e) => {
  // "/" hoặc Ctrl+F (khi không gõ trong ô nào) → nhảy vào ô tìm
  if ((e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key === "f")) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    e.preventDefault(); $("setSearch").focus();
  }
});

// ---------- Ô chọn ngôn ngữ ----------
function fillLangSelects() {
  const ui = I18N.getLang();
  const opt = (code, label, sel) => `<option value="${code}"${code === sel ? " selected" : ""}>${escapeHtml(label)}</option>`;
  // Tên ngôn ngữ giao diện viết bằng chính ngôn ngữ đó → ai cũng đọc được; không qua bảng dịch.
  $("uiLang").setAttribute("data-hn-raw", "");
  $("uiLang").innerHTML = I18N.UI_LANGS.map(l => opt(l.code, l.code === "auto" ? T(l.label) : l.label, getVal(cur, "uiLang"))).join("");
  const native = C.nativeLang(cur);
  for (const id of ["nativeLang", "targetLang", "nativeTargetLang"]) {
    const el = $(id);
    el.setAttribute("data-hn-raw", "");
    el.innerHTML = TARGET_LANGS.filter(t => !(id === "nativeTargetLang" && sameLang(t.code, native)))
      .map(t => opt(t.code, langName(t.code, ui), getVal(cur, id))).join("");
  }
  $("hideNativeHint").textContent = T("Bôi chữ {0} thì không bật thanh (vẫn dịch / lưu được bằng phím tắt hoặc chuột phải).", langName(native, ui).replace(/^Tiếng /, "tiếng "));
}

// ---------- Điền form từ cài đặt ----------
const controls = () => [...document.querySelectorAll("[data-set]")];
function fillForm() {
  const active = document.activeElement;
  for (const el of controls()) {
    if (el === active && (el.type === "number" || el.type === "range" || el.type === "color")) continue; // đang chỉnh
    const key = el.dataset.set;
    const v = getVal(cur, key);
    if (el.type === "checkbox") el.checked = !!v;
    else if (el.type === "radio") el.checked = el.value === v;
    else if (key === "hoverCooldownMs") el.value = Math.max(1, Math.round(v / 60000));
    else if (el.tagName !== "SELECT") el.value = v;
  }
}
function renderAll() {
  fillLangSelects();
  fillForm();
  updatePreview();
  updateDependents();
  markChanged();
  renderSites();
}

// Dấu chấm cạnh tên cài đặt đã khác mặc định → nhìn là biết mình đã chỉnh gì.
function markChanged() {
  const d = defaults(cur);
  document.querySelectorAll("main .row").forEach(row => {
    const keys = [...new Set([...row.querySelectorAll("[data-set]")].map(e => e.dataset.set))].filter(k => k in d);
    const changed = keys.some(k => JSON.stringify(getVal(cur, k)) !== JSON.stringify(d[k]));
    row.classList.toggle("changed", changed);
    const b = row.querySelector(".rt b");
    if (b) { if (changed) b.title = T("Đã đổi so với mặc định"); else b.removeAttribute("title"); }
  });
}

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
  ["previewTranslate", "showSelSpeak", "showSelCopy", "hideSelNative"].forEach(id => {
    $(id).disabled = !sel;
    $(id).closest(".row").classList.toggle("off", !sel);
  });
  const rev = $("learningMode").checked;
  ["srsReminder", "srsNewPerDay", "threshold", "cooldownMin"].forEach(id => {
    $(id).disabled = !rev;
    $(id).closest(".row").classList.toggle("off", !rev);
  });
}

// ---------- Ghi khi người dùng đổi ----------
function readControl(el) {
  const key = el.dataset.set;
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number" || el.type === "range") {
    const min = +el.min || 1, max = +el.max || 1e9;
    const n = parseInt(el.value);
    if (!Number.isFinite(n)) return undefined; // đang gõ dở / để trống → chưa lưu
    const v = Math.min(max, Math.max(min, n));
    return key === "hoverCooldownMs" ? v * 60000 : v;
  }
  return el.value;
}
const pendingTimers = {};
function commit(el, soon) {
  const key = el.dataset.set;
  const v = readControl(el);
  if (v === undefined) return;
  clearTimeout(pendingTimers[key]);
  const run = () => {
    patch(toPatch(key, v), savedFeedback);
    if (key === "defaultThreshold") applyThresholdToWords(v);
  };
  if (soon) pendingTimers[key] = setTimeout(run, 400); else run();
}
// Ngưỡng "đã thuộc" chép vào từng mục (autoDeleteAt) lúc lưu → trước đây đổi ngưỡng chỉ ảnh
// hưởng từ lưu SAU đó, từ cũ vẫn 20. Nay áp dụng cho mọi mục.
function applyThresholdToWords(n) {
  chrome.storage.local.get("words", ({ words }) => {
    const arr = words || [];
    let changed = false;
    for (const w of arr) if (!w.sticky && w.autoDeleteAt !== n) { w.autoDeleteAt = n; changed = true; }
    if (changed) chrome.storage.local.set({ words: arr });
  });
}
document.addEventListener("change", (e) => {
  const el = e.target.closest && e.target.closest("[data-set]");
  if (!el) return;
  if (el.type === "radio" && !el.checked) return;
  if (el.type === "number") el.value = Math.min(+el.max, Math.max(+el.min, parseInt(el.value) || +el.min)); // hiện đúng giá trị đã lưu
  if (el.type === "checkbox" || el.type === "radio") { updateDependents(); updatePreview(); }
  commit(el, false);
});
document.addEventListener("input", (e) => {
  const el = e.target.closest && e.target.closest("[data-set]");
  if (!el || !/^(color|range|number)$/.test(el.type)) return;
  updatePreview();
  commit(el, true);
});

// ---------- Khôi phục mặc định (từng mục / toàn bộ) ----------
function resetKeys(keys, cb) {
  const d = defaults(cur);
  let p = {};
  for (const k of keys) if (k in d) Object.assign(p, toPatch(k, d[k]));
  // Màu theo loại: chỉ đưa về mặc định đúng các màu được chọn
  const tcKeys = keys.filter(k => k.startsWith("typeColors."));
  if (tcKeys.length) { p.typeColors = { ...tcDef, ...(cur.typeColors || {}) }; tcKeys.forEach(k => { p.typeColors[k.slice(11)] = tcDef[k.slice(11)]; }); }
  patch(p, cb || (() => uiToast("✓ Đã khôi phục mặc định", "ok")));
  if (keys.includes("defaultThreshold")) applyThresholdToWords(d.defaultThreshold);
}
document.querySelectorAll(".sec-reset").forEach(b => b.addEventListener("click", async () => {
  const sec = document.querySelector(`section[data-sec="${b.dataset.sec}"]`);
  const name = sec.querySelector("h2").textContent;
  const ok = await uiDialog(T("Khôi phục mặc định cho “{0}”?", name), `<p>${escapeHtml(T("Chỉ các cài đặt trong mục này. Dữ liệu của bạn giữ nguyên."))}</p>`,
    [{ label: T("Huỷ"), value: false, cls: "ghost" }, { label: T("Khôi phục"), value: true, cls: "primary" }]);
  if (ok) resetKeys([...new Set([...sec.querySelectorAll("[data-set]")].map(e => e.dataset.set))]);
}));
$("resetAllBtn").onclick = async () => {
  const ok = await uiDialog(T("Khôi phục toàn bộ cài đặt?"),
    `<p>${escapeHtml(T("Mọi cài đặt về mặc định. Từ vựng, ghi chú, danh sách trang bị tắt và kết nối Drive giữ nguyên."))}</p>`,
    [{ label: T("Huỷ"), value: false, cls: "ghost" }, { label: T("Khôi phục"), value: true, cls: "danger" }]);
  if (ok) resetKeys(Object.keys(defaults(cur)));
};

// ---------- Sau khi CẬP NHẬT: hỏi có muốn khôi phục cài đặt gốc không ----------
// background ghi __updateReview khi cập nhật mà có cài đặt khác mặc định. Thông minh ở chỗ:
//   - không có gì khác mặc định → không hỏi; mỗi phiên bản hỏi tối đa 1 lần;
//   - "mặc định đã đổi ở bản mới, bạn chưa chỉnh" → chọn sẵn; "đang tắt tính năng chính" →
//     đưa lên đầu, nhắc "có thể bạn đã quên"; "bạn đã chỉnh" → giữ nguyên (không chọn sẵn);
//   - khôi phục xong có Hoàn tác (giữ bản trước đó trong __settingsBeforeReset).
function fmtVal(key, v) {
  const info = C.SETTING_INFO[key] || {};
  const ui = I18N.getLang();
  switch (info.kind) {
    case "bool": return v ? T("Bật") : T("Tắt");
    case "lang": return langName(v, ui);
    case "ui": return v === "auto" ? T("Tự động (theo trình duyệt)") : (I18N.UI_LANGS.find(l => l.code === v) || {}).label || v;
    case "theme": return T({ auto: "Tự động", light: "Sáng", dark: "Tối" }[v] || v);
    case "style": return T({ underline: "Gạch chân", background: "Tô nền", wavy: "Lượn sóng", outline: "Khung viền" }[v] || v);
    case "px": return v + "px";
    case "min": return T("{0} phút", Math.round(v / 60000));
    case "color": return `<span class="sw" style="background:${escapeHtml(v)}"></span>${escapeHtml(v)}`;
  }
  return String(v);
}
const REASON_TAG = {
  newDefault: "Mặc định mới — bạn chưa từng chỉnh",
  off: "Đang tắt — có thể bạn đã quên",
  custom: "Bạn đã chỉnh"
};
async function openSettingsReview(review) {
  const diff = C.settingsDiff(cur, review && review.from, I18N.resolve);
  if (!diff.length) {
    chrome.storage.local.remove("__updateReview");
    if (!review) uiToast("Mọi cài đặt đang đúng mặc định", "ok");
    return;
  }
  const head = review
    ? `<p>${escapeHtml(T("Highlight Note vừa cập nhật lên {0}. Bạn có {1} cài đặt khác mặc định — chọn mục muốn đưa về mặc định gốc, còn lại giữ nguyên.", review.to, diff.length))}</p>`
    : `<p>${escapeHtml(T("Bạn có {0} cài đặt khác mặc định. Chọn mục muốn đưa về mặc định gốc.", diff.length))}</p>`;
  const rows = diff.map(d => `
    <label class="rv-row rv-${d.reason}">
      <input type="checkbox" data-key="${escapeHtml(d.key)}"${d.reason === "newDefault" ? " checked" : ""} />
      <span class="rv-main"><b>${escapeHtml(T(C.SETTING_INFO[d.key].label))}</b>
        <small class="rv-tag">${escapeHtml(T(REASON_TAG[d.reason]))}</small>
        <small class="rv-vals">${escapeHtml(T("Của bạn:"))} ${fmtVal(d.key, d.cur)} → ${escapeHtml(T("Mặc định:"))} ${fmtVal(d.key, d.def)}</small></span>
    </label>`).join("");
  const body = head + `<div class="rv-list">${rows}</div>
    <p class="rv-note">${escapeHtml(T("Từ vựng, ghi chú, danh sách trang bị tắt và kết nối Drive không bị ảnh hưởng."))}</p>`;
  const v = await uiDialog(review ? T("Khôi phục cài đặt gốc sau khi cập nhật?") : T("Cài đặt khác mặc định"), body, [
    { label: T("Giữ nguyên tất cả"), value: "keep", cls: "ghost" },
    { label: T("Khôi phục tất cả"), value: "all", cls: "" },
    { label: T("Khôi phục mục đã chọn"), value: "sel", cls: "primary" }
  ]);
  const picked = [...document.querySelectorAll("#dlgBody .rv-row input:checked")].map(i => i.dataset.key);
  chrome.storage.local.remove("__updateReview");
  if (!v || v === "keep") { if (v === "keep") uiToast("Đã giữ nguyên cài đặt của bạn"); return; }
  const keys = v === "all" ? diff.map(d => d.key) : picked;
  if (!keys.length) { uiToast("Chưa chọn mục nào — giữ nguyên cài đặt"); return; }
  const before = { ...cur };
  chrome.storage.local.set({ __settingsBeforeReset: { at: Date.now(), settings: before } });
  resetKeys(keys, () => {
    showUndoToast(T("✓ Đã khôi phục {0} cài đặt về mặc định", keys.length), () => {
      chrome.storage.local.set({ settings: before }, () => uiToast("Đã hoàn tác", "ok"));
    });
  });
}
// Toast có nút Hoàn tác (toast thường của trang này không có nút).
function showUndoToast(text, onUndo) {
  const t = $("toast");
  t.innerHTML = "";
  t.append(TR(text) + " ");
  const b = document.createElement("button");
  b.className = "toast-undo";
  b.textContent = T("Hoàn tác");
  b.onclick = () => { t.hidden = true; onUndo(); };
  t.appendChild(b);
  t.className = "toast ok";
  t.style.setProperty("--dur", "8000ms");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 8000);
}
$("reviewSettingsBtn").onclick = () => openSettingsReview(null);
function maybeOpenUpdateReview() {
  chrome.storage.local.get("__updateReview", ({ __updateReview: r }) => {
    if (r) openSettingsReview(r);
    else if ((location.hash || "").startsWith("#update")) openSettingsReview(null);
  });
}

// ---------- Trang web bị tắt ----------
// Người dùng hay dán cả URL ("https://www.facebook.com/abc") → lấy hostname.
function normHost(line) {
  let s = String(line || "").trim().toLowerCase();
  if (!s) return "";
  try { if (/^[a-z]+:\/\//.test(s)) s = new URL(s).hostname; } catch (e) {}
  return s.replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
}
const blacklist = () => (cur.blacklistedHosts || []).slice();
function renderSites() {
  const box = $("siteList");
  const list = blacklist();
  if (!list.length) {
    box.innerHTML = `<span class="empty-note">${escapeHtml(T("Chưa tắt trang nào."))}</span>`;
    return;
  }
  box.innerHTML = list.map((h, i) =>
    `<span class="chip"><span data-hn-raw>${escapeHtml(h)}</span><button data-i="${i}" title="${escapeHtml(T("Bật lại trang này"))}" aria-label="${escapeHtml(T("Bỏ {0}", h))}">×</button></span>`
  ).join("");
}
function addSite() {
  const h = normHost($("siteInput").value);
  if (!h || (!/\./.test(h) && h !== "localhost")) { uiToast("Nhập tên miền, vd: facebook.com", "err"); return; }
  const list = blacklist();
  if (!list.includes(h)) list.push(h);
  $("siteInput").value = "";
  patch({ blacklistedHosts: list }, savedFeedback);
}
$("siteAddBtn").onclick = addSite;
$("siteInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSite(); } });
$("siteList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  const list = blacklist();
  list.splice(+b.dataset.i, 1);
  patch({ blacklistedHosts: list }, savedFeedback);
});

// ---------- Theme ----------
function resolveTheme(t) {
  return (t === "light" || t === "dark") ? t
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function applyTheme() {
  const t = cur.theme || "auto";
  document.documentElement.setAttribute("data-theme", resolveTheme(t));
  try { localStorage.setItem("hn-theme", t); } catch (e) {} // cho theme-init.js
}
try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {}

// ---------- Nạp + theo dõi ----------
chrome.storage.local.get("settings", ({ settings }) => {
  cur = settings || {};
  applyTheme();
  renderAll();
  fromHash();
  maybeOpenUpdateReview();
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c.settings) { cur = c.settings.newValue || {}; applyTheme(); renderAll(); }
  if (c.__lastSync || c.__driveAccount || c.__syncRemoved) refreshSyncStatus();
});

// ---------- Phím tắt, hướng dẫn, góp ý ----------
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
        : `<span class="empty-note">${escapeHtml(T("chưa đặt"))}</span>`;
      return `<div class="row"><div class="rt"><b>${escapeHtml(T(CMD_LABEL[c.name]))}</b></div><span>${keys}</span></div>`;
    }).join("");
  });
}
renderShortcuts();
window.addEventListener("focus", renderShortcuts); // quay lại sau khi đổi phím tắt
$("shortcutsBtn").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
$("openWelcomeBtn").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
$("feedbackBtn").onclick = () => chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews` });

// ---------- Sao lưu ra file ----------
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
    patch({ lastExportAt: new Date().toISOString() });
    uiToast(T("✓ Đã tải file backup ({0} mục)", (d.words || []).length), "ok");
  });
};

$("clearBtn").onclick = () => {
  chrome.storage.local.get(["words", "settings"], async (d) => {
    const n = (d.words || []).length;
    if (!n) { uiToast("Chưa có dữ liệu nào để xoá"); return; }
    const ok = await uiDialog(
      T("Xoá toàn bộ {0} mục?", n),
      `<p>Mọi từ vựng, ghi chú và lịch ôn sẽ bị xoá khỏi máy này. Nếu đang dùng Google Drive, lần <b>Đồng bộ</b> tiếp theo sẽ hỏi bạn có xoá trên các máy khác không.</p>
       <p>Một file backup sẽ tự tải về trước khi xoá để bạn khôi phục nếu cần.</p>`,
      [{ label: T("Huỷ"), value: false, cls: "ghost" }, { label: T("Xoá hết"), value: true, cls: "danger" }]
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
  if (m < 1) return T("vừa xong");
  if (m < 60) return T("{0} phút trước", m);
  const h = Math.round(m / 60);
  if (h < 24) return T("{0} giờ trước", h);
  const d = Math.round(h / 24);
  return d === 1 ? T("hôm qua") : T("{0} ngày trước", d);
}
function syncSummary(st) {
  if (!st) return "";
  const parts = [];
  if (st.added) parts.push(T("lấy về {0} mục mới", st.added));
  if (st.updated) parts.push(T("cập nhật {0} mục", st.updated));
  if (st.sent) parts.push(T("gửi lên {0} mục", st.sent));
  if (st.removed) parts.push(T("bỏ {0} mục đã xoá ở máy khác", st.removed));
  return parts.length ? parts.join(", ") : T("hai bên đã khớp, không có gì mới");
}

let lastSyncStatus = null;
function applySyncStatus(s) {
  if (!s) return;
  lastSyncStatus = s;
  $("syncNotConfigured").hidden = s.driveConfigured;
  $("syncDisconnected").hidden = !s.driveConfigured || s.connected;
  $("syncConnected").hidden = !s.driveConfigured || !s.connected;
  if (!s.connected) return;
  $("syncAccount").textContent = T("Đã kết nối Google Drive") + (s.email ? " · " + s.email : "");
  const ls = s.lastSync;
  $("syncLast").textContent = ls
    ? T("Đồng bộ lần cuối trên máy này: {0} · {1} mục", relTime(ls.at), ls.count)
    : T("Máy này chưa đồng bộ lần nào — bấm Đồng bộ ngay.");
  $("syncResult").textContent = ls && ls.stats ? T("Lần trước: {0}.", syncSummary(ls.stats)) : "";
  const rb = $("restoreBtn");
  rb.hidden = !s.removedCount;
  rb.textContent = T("Khôi phục {0} mục bị bỏ ở lần trước", s.removedCount);
}
function refreshSyncStatus() {
  chrome.runtime.sendMessage({ type: "SYNC_STATUS" }, (r) => {
    if (chrome.runtime.lastError || !r || !r.ok) return;
    applySyncStatus(r.status);
  });
}
refreshSyncStatus();

// Lần đồng bộ sắp sửa/xoá mục trên máy này → liệt kê để người dùng quyết định.
async function confirmSyncChanges(res) {
  const n = res.changeCount || res.changes.length;
  const show = res.changes.slice(0, 10);
  const st = res.stats || {};
  const extra = [];
  if (st.added) extra.push(T("lấy về {0} mục mới", st.added));
  if (st.sent) extra.push(T("gửi lên {0} mục", st.sent));
  const body =
    `<p>Máy khác đã thay đổi các mục dưới đây. Bạn muốn làm gì?</p>
     <ul class="chg-list">${show.map(c => `<li><b data-hn-raw title="${escapeHtml(c.term)}">${escapeHtml(c.term)}</b>${c.kind === "removed"
        ? '<span class="tag del">máy khác đã xoá</span>' : '<span class="tag">máy khác sửa sau</span>'}</li>`).join("")}
       ${n > show.length ? `<li><span>${escapeHtml(T("… và {0} mục khác", n - show.length))}</span></li>` : ""}</ul>
     ${extra.length ? `<p>${escapeHtml(T("Ngoài ra sẽ {0} (không ảnh hưởng gì).", extra.join(", ")))}</p>` : ""}
     <p><b>Giữ bản máy này</b> = không xoá / sửa các mục trên, gửi bản của máy này lên Drive.</p>`;
  const v = await uiDialog(T("Đồng bộ sẽ thay đổi {0} mục trên máy này", n), body, [
    { label: T("Huỷ"), value: null, cls: "ghost" },
    { label: T("Giữ bản máy này"), value: "keep", cls: "" },
    { label: T("Đồng ý"), value: "ok", cls: "primary" }
  ]);
  if (!v) return null;
  return v === "keep" ? { keepIds: res.changes.map(c => c.id) } : {};
}

function busy(btn, text) {
  const old = btn.innerHTML; // giữ cả icon SVG trong nút
  btn.disabled = true;
  btn.textContent = TR(text);
  return () => { btn.disabled = false; btn.innerHTML = old; };
}
function runSyncFlow(type, btn, busyText, extra = {}) {
  const done = busy(btn, busyText);
  chrome.runtime.sendMessage({ type, ...extra }, async (res) => {
    done();
    if (chrome.runtime.lastError || !res) { uiToast("Không liên lạc được với tiện ích — thử lại", "err"); return; }
    if (!res.ok) { refreshSyncStatus(); uiToast(T("Chưa đồng bộ được: {0}", TR(res.error)), "err"); return; }
    if (res.status) applySyncStatus(res.status);
    if (res.needConfirm) {
      const choice = await confirmSyncChanges(res);
      if (!choice) { uiToast("Đã huỷ — chưa thay đổi gì"); return; }
      runSyncFlow("SYNC_NOW", $("syncNowBtn"), "⏳ Đang đồng bộ…", { confirm: true, keepIds: choice.keepIds || [] });
      return;
    }
    uiToast(T("✓ Đã đồng bộ: {0}", syncSummary(res.result && res.result.stats)), "ok");
  });
}
$("connectDriveBtn").onclick = () => runSyncFlow("SYNC_CONNECT", $("connectDriveBtn"), "⏳ Đang kết nối…");
$("syncNowBtn").onclick = () => runSyncFlow("SYNC_NOW", $("syncNowBtn"), "⏳ Đang đồng bộ…");

$("restoreBtn").onclick = () => {
  chrome.runtime.sendMessage({ type: "SYNC_RESTORE_REMOVED" }, (res) => {
    if (res && res.ok) uiToast(T("✓ Đã khôi phục {0} mục — bấm Đồng bộ để gửi lại lên Drive", res.restored), "ok");
    else uiToast(T("Không khôi phục được: {0}", TR((res && res.error) || "không rõ")), "err");
    refreshSyncStatus();
  });
};
$("disconnectDriveBtn").onclick = async () => {
  const ok = await uiDialog(
    "Ngắt kết nối Google Drive?",
    "<p>Dữ liệu trên máy này và file trên Drive đều giữ nguyên. Máy này chỉ ngừng đồng bộ cho tới khi bạn kết nối lại.</p>",
    [{ label: T("Huỷ"), value: false, cls: "ghost" }, { label: T("Ngắt kết nối"), value: true, cls: "danger" }]
  );
  if (!ok) return;
  chrome.runtime.sendMessage({ type: "SYNC_DISCONNECT" }, (res) => {
    if (res && res.ok) { applySyncStatus(res.status); uiToast("Đã ngắt kết nối Drive", "ok"); }
    else uiToast(T("Lỗi: {0}", TR((res && res.error) || "không rõ")), "err");
  });
};
$("openDriveBtn").onclick = () => {
  chrome.runtime.sendMessage({ type: "SYNC_GET_DRIVE_LINK" }, (res) => {
    if (chrome.runtime.lastError || !res) { uiToast("Không lấy được link", "err"); return; }
    if (res.ok && res.info && res.info.webViewLink) window.open(res.info.webViewLink, "_blank");
    else if (res.ok) uiToast("Chưa có file trên Drive — bấm \"Đồng bộ ngay\" để tạo.");
    else uiToast(T("Lỗi: {0}", TR(res.error)), "err");
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
  out.autoDeleteAt = settings.defaultThreshold || w.autoDeleteAt || 20;
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
    catch (err) { uiToast(T("Không đọc được file: {0}", err.message), "err"); return; }
    if (!data || !Array.isArray(data.words)) { uiToast("File không hợp lệ (không có danh sách mục)", "err"); return; }
    const incoming = data.words.filter(w => w && typeof w.term === "string" && w.term.trim());
    chrome.storage.local.get(["words", "settings"], async (d) => {
      let words = d.words || [];
      let settings = d.settings || {};
      const hasSettings = data.settings && typeof data.settings === "object" && Object.keys(data.settings).length > 0;
      const mode = await uiDialog(
        "Nạp dữ liệu từ file backup",
        `<p>${escapeHtml(T("File có {0} mục. Máy này đang có {1} mục.", incoming.length, words.length))}</p>
         <p><b>Gộp vào</b> (khuyên dùng): thêm mục mới, giữ nguyên mục đang có.<br>
         <b>Thay thế toàn bộ</b>: xoá hết dữ liệu hiện tại rồi dùng đúng nội dung file.</p>
         ${hasSettings ? `<label class="chk"><input type="checkbox" id="impSettings" /><span>Nạp cả cài đặt từ file (màu, ngôn ngữ, giao diện…). Bỏ trống = giữ cài đặt của máy này.</span></label>` : ""}`,
        [
          { label: T("Huỷ"), value: null, cls: "ghost" },
          { label: T("Thay thế toàn bộ"), value: "replace", cls: "danger" },
          { label: T("Gộp vào"), value: "merge", cls: "primary" }
        ]
      );
      if (!mode) return;
      // Trước đây cài đặt trong file LUÔN ghi đè (kể cả khi "Gộp vào") → file cũ có enabled:false
      // là tắt luôn tiện ích, mất danh sách trang bị tắt… Nay chỉ khi người dùng tích chọn.
      const takeSettings = hasSettings && $("impSettings") && $("impSettings").checked;

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
      if (takeSettings) {
        const hosts = [...new Set([...(settings.blacklistedHosts || []), ...(data.settings.blacklistedHosts || [])])];
        settings = { ...settings, ...data.settings, blacklistedHosts: hosts };
      }
      chrome.storage.local.set({ words, settings }, () => {
        uiToast(mode === "replace"
          ? T("✓ Đã thay thế — hiện có {0} mục", words.length)
          : T("✓ Đã gộp — thêm {0} mục mới, tổng {1} mục", added, words.length), "ok");
      });
    });
  };
  reader.readAsText(file);
};
