// Service worker: context menu, phím tắt, badge, sao lưu tự động
// + đồng bộ THỦ CÔNG qua Google Drive (gộp từng mục — xem sync.js)

importScripts("constants.js", "sync.js");

const MENU_ID = "vocab-note-add-selection";
const MENU_ID_STICKY = "vocab-note-add-sticky";
const MENU_ID_PANEL = "vocab-note-open-panel";
const MENU_ID_TR = "vocab-note-translate";
const CONTENT_FILES = ["constants.js", "content.js"];

// Gửi lệnh tới content script; nếu tab mở TRƯỚC khi cài/cập nhật extension (chưa có
// content script) thì tự tiêm rồi gửi lại. Trước đây phím tắt / chuột phải im lặng
// không làm gì trên những tab này → người dùng tưởng extension hỏng.
async function sendToTab(tabId, msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
    return true;
  } catch (e) {
    if (!(await injectContent(tabId))) return false;
    try { await chrome.tabs.sendMessage(tabId, msg); return true; } catch (e2) { return false; }
  }
}

async function injectContent(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return true;
  } catch (e) {
    return false; // chrome://, Web Store, trang PDF… không cho tiêm
  }
}

// Cài mới / cập nhật: tiêm vào các tab web đang mở để dùng được NGAY, khỏi phải
// tải lại từng tab. (content.js tự chống chạy trùng & tự thay instance cũ.)
async function injectIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const t of tabs) {
      if (t.discarded || t.status === "unloaded") continue;
      injectContent(t.id);
    }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener((details) => {
  // removeAll trước khi create: onInstalled cũng chạy khi CẬP NHẬT phiên bản,
  // tạo lại cùng id sẽ ném lỗi "duplicate id". Dọn sạch rồi tạo mới cho chắc.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID_TR,
      title: "Dịch “%s” (Highlight Note)",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Lưu & tô sáng “%s” (Highlight Note)",
      contexts: ["selection"]
    });
    // Ghim ghi chú lên trang — không cần bôi đen chữ nào (hiện khi chuột phải vùng trống).
    chrome.contextMenus.create({
      id: MENU_ID_STICKY,
      title: "📌 Ghim ghi chú lên trang này (Highlight Note)",
      contexts: ["page"]
    });
    // Chuột phải vào icon extension → mở bảng quản lý cạnh trang.
    chrome.contextMenus.create({
      id: MENU_ID_PANEL,
      title: "Mở Highlight Note ở Side Panel",
      contexts: ["action"]
    });
  });

  injectIntoOpenTabs();

  // Lần cài đầu tiên → mở trang chào mừng + hướng dẫn ghim icon cho người dùng.
  // Chỉ chạy khi reason === "install" (không bật lại mỗi lần cập nhật phiên bản).
  if (details && details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }

  // Khởi tạo storage lần đầu
  chrome.storage.local.get(["words", "settings"], (data) => {
    const updates = {};
    if (!data.words) updates.words = [];
    if (!data.settings) {
      updates.settings = {
        defaultThreshold: 20,
        hoverCooldownMs: 300000,
        theme: "auto",
        srsReminder: true,
        srsNewPerDay: 20,
        highlightColor: "#ffeb3b",
        highlightStyle: "underline",
        highlightThickness: 2,
        caseSensitive: false,
        enabled: true,
        learningMode: false, // chế độ học từ: tắt mặc định (im lặng)
        composerOpen: false,
        blacklistedHosts: [],
        showToasts: true,
        previewTranslate: true,
        showSelButton: true,
        showSelCopy: true,
        showSelSpeak: true
      };
    }
    if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID_PANEL) {
    // Click menu là user-gesture hợp lệ cho sidePanel.open() — gọi ngay, không await trước.
    if (chrome.sidePanel && tab) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    return;
  }
  if (!tab) return;
  if (info.menuItemId === MENU_ID_STICKY) {
    sendToTab(tab.id, { type: "ADD_STICKY_NOTE" });
    return;
  }
  if (info.menuItemId === MENU_ID_TR && info.selectionText) {
    sendToTab(tab.id, { type: "PROMPT_TRANSLATE", term: info.selectionText.trim() });
    return;
  }
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const term = info.selectionText.trim();
  if (!term || term.length > 2000) return; // cho phép lưu cả đoạn dài (thuật ngữ, viết tắt, ghi chú)
  sendToTab(tab.id, { type: "PROMPT_ADD_WORD", term });
});

// Phím tắt Alt+Shift+H: lấy text đang chọn → mở mini-card
chrome.commands.onCommand.addListener(async (cmd, cmdTab) => {
  if (cmd === "add-selected-word") {
    const tab = cmdTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (tab) sendToTab(tab.id, { type: "ADD_FROM_SELECTION" });
  } else if (cmd === "translate-selection") {
    const tab = cmdTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (tab) sendToTab(tab.id, { type: "TRANSLATE_SELECTION" });
  } else if (cmd === "open-side-panel") {
    // Phím tắt là user-gesture hợp lệ cho sidePanel.open().
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (chrome.sidePanel && tab) await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (e) {}
  }
});

// Khi popup yêu cầu mở chính nó dưới dạng cửa sổ riêng (workaround IME fcitx5/ibus)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "OPEN_POPUP_WINDOW") {
    const url = chrome.runtime.getURL("popup.html") + "?window=1" + (msg.focus ? `&focus=${encodeURIComponent(msg.focus)}` : "");
    chrome.windows.create({ url, type: "popup", width: 396, height: 680 });
    return;
  }
  // ---- Đồng bộ (chỉ chạy khi người dùng bấm) ----
  const reply = (p) => {
    p.then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, error: friendlyError(e) }));
    return true; // giữ kênh async
  };
  if (msg.type === "SYNC_STATUS") return reply(getSyncStatus().then(status => ({ status })));
  if (msg.type === "SYNC_CONNECT") return reply(connectDrive());
  // { confirm, keepIds }: lần đầu gọi không confirm → nếu sẽ sửa/xoá mục trên máy này
  // thì trả về danh sách để người dùng xem & xác nhận; gọi lại với confirm:true để áp.
  if (msg.type === "SYNC_NOW") return reply(runSync({ confirm: !!msg.confirm, keepIds: msg.keepIds || [] })
    .then(async (r) => ({ ...r, status: await getSyncStatus() })));
  if (msg.type === "SYNC_DISCONNECT") return reply(disconnectDrive().then(async () => ({ status: await getSyncStatus() })));
  if (msg.type === "SYNC_RESTORE_REMOVED") return reply(restoreRemoved());
  if (msg.type === "SYNC_GET_DRIVE_LINK") {
    return reply((async () => {
      const acc = await getAccount();
      const token = await HNSync.getAuthToken({ interactive: true, loginHint: acc && acc.email });
      return { info: await HNSync.getDriveFileInfo(token) };
    })());
  }
});

// ======================= ĐỒNG BỘ THỦ CÔNG QUA GOOGLE DRIVE =======================
// Bấm "Đồng bộ" → tải file trên Drive → GỘP TỪNG MỤC với dữ liệu máy này → lưu lại
// cả hai nơi. Không tự chạy ngầm, không bao giờ thay nguyên cả danh sách (xem sync.js).
//
// Để gộp đúng, mỗi mục cần biết "lần sửa cuối" và mục nào đã bị xoá. Thay vì sửa
// mọi chỗ ghi dữ liệu, background tự so sánh trước/sau mỗi lần `words` đổi:
//   __itemTimes  { id: mốc sửa cuối }   — bỏ qua bộ đếm hover (không tính là sửa)
//   __tombstones { id: mốc xoá }        — để lần đồng bộ sau xoá đúng ở máy kia
// Hai khoá này chỉ background ghi; mọi thao tác được xếp hàng tuần tự (localQueue).

let localQueue = Promise.resolve();
function enqueue(fn) {
  const p = localQueue.then(fn);
  localQueue = p.catch(() => {});
  return p;
}
let lastAppliedJson = null; // words do chính đồng bộ vừa ghi → không tính là "sửa"

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.words) {
    const oldW = changes.words.oldValue || [];
    const newW = changes.words.newValue || [];
    enqueue(() => trackChanges(oldW, newW));
  }
  if (changes.words || changes.settings || changes.__lastAutoBackupAt || changes.__lastSync || changes.__driveAccount) updateBadge();
});

async function trackChanges(oldW, newW) {
  if (lastAppliedJson && JSON.stringify(newW) === lastAppliedJson) { lastAppliedJson = null; return; }
  const now = Date.now();
  const d = await chrome.storage.local.get(["__itemTimes", "__tombstones"]);
  const times = d.__itemTimes || {};
  const tomb = d.__tombstones || {};
  const oldMap = new Map(oldW.map(w => [w.id, w]));
  const newIds = new Set();
  let dirty = false;
  for (const w of newW) {
    newIds.add(w.id);
    const o = oldMap.get(w.id);
    if (!o || HNSync.contentKey(o) !== HNSync.contentKey(w)) {
      times[w.id] = now;
      delete tomb[w.id];
      dirty = true;
    }
  }
  for (const o of oldW) {
    if (!newIds.has(o.id)) { tomb[o.id] = now; delete times[o.id]; dirty = true; }
  }
  if (dirty) await chrome.storage.local.set({ __itemTimes: times, __tombstones: tomb });
}

async function getAccount() {
  return (await chrome.storage.local.get("__driveAccount")).__driveAccount || null;
}

function friendlyError(e) {
  const m = (e && e.message) || String(e || "");
  if (/did not approve|canceled|cancelled|bị huỷ|closed by the user/i.test(m)) return "Bạn đã đóng cửa sổ đăng nhập Google";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Không có mạng — kiểm tra kết nối rồi thử lại";
  return m;
}

let syncRunning = null;
function runSync(opts = {}) {
  if (!syncRunning) {
    syncRunning = doSync(opts).finally(() => { syncRunning = null; });
  }
  return syncRunning;
}

const PENDING_KEY = "__pendingRemote"; // bản Drive đã tải ở bước kiểm tra (chờ xác nhận)

// Trả về { result } nếu đã đồng bộ xong, hoặc { needConfirm, changes, changeCount, stats }
// nếu lần đồng bộ sẽ SỬA/XOÁ mục trên máy này → chưa ghi gì, chờ người dùng xác nhận.
async function doSync({ chooseAccount, confirm, keepIds } = {}) {
  if (!HNSync.isDriveConfigured()) throw new Error("Bản cài này chưa hỗ trợ Google Drive — hãy dùng Sao lưu file");
  const acc = await getAccount();
  const token = await HNSync.getAuthToken({ interactive: true, chooseAccount, loginHint: acc && acc.email });
  // Đăng nhập được là coi như đã kết nối (kể cả khi lần đầu còn chờ xác nhận).
  if (!acc || !acc.email || chooseAccount) {
    await chrome.storage.local.set({ __driveAccount: { email: await HNSync.getDriveEmail(token), connectedAt: (acc && acc.connectedAt) || Date.now() } });
  }

  // Bước xác nhận: dùng đúng bản Drive người dùng vừa xem (nếu còn mới), khỏi tải lại.
  let staged = null;
  if (confirm) {
    const p = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    if (p && Date.now() - p.at < 10 * 60000) staged = p;
  }
  if (!staged) {
    const f = await HNSync.downloadDrive(token);
    staged = { at: Date.now(), fileId: f.fileId, remote: HNSync.normalizeState(f.data) };
  }

  // Đọc – gộp – ghi liền một mạch trong hàng đợi để không chen ngang ghi chép khác.
  const out = await enqueue(async () => {
    await migrateLegacyOnce();
    const d = await chrome.storage.local.get(["words", "__itemTimes", "__tombstones"]);
    const local = { words: d.words || [], times: d.__itemTimes || {}, tombstones: d.__tombstones || {} };
    const m = HNSync.mergeStates(local, staged.remote, Date.now(), keepIds || []);
    if (!confirm && m.changes.length) return { m, pending: true };
    const toSet = { __itemTimes: m.times, __tombstones: m.tombstones };
    const json = JSON.stringify(m.words);
    if (json !== JSON.stringify(local.words)) {
      lastAppliedJson = json;
      toSet.words = m.words;
    }
    // Mục máy này bị bỏ (đã xoá ở máy khác / trùng từ) → giữ lại để khôi phục được.
    if (m.removed.length) toSet.__syncRemoved = { at: Date.now(), items: m.removed };
    await chrome.storage.local.set(toSet);
    return { m };
  });
  const merged = out.m;

  if (out.pending) {
    await chrome.storage.session.set({ [PENDING_KEY]: staged });
    return {
      needConfirm: true,
      changes: merged.changes.slice(0, 200).map(c => ({ id: c.id, term: String(c.term).slice(0, 120), kind: c.kind })),
      changeCount: merged.changes.length,
      stats: merged.stats
    };
  }
  await chrome.storage.session.remove(PENDING_KEY);

  const { settings } = await chrome.storage.local.get("settings");
  await HNSync.uploadDrive(token, staged.fileId, {
    app: "highlight-note",
    version: HNSync.FORMAT_VERSION,
    updatedAt: new Date().toISOString(),
    words: merged.words,
    times: merged.times,
    tombstones: merged.tombstones,
    settings: settings || {} // chỉ để file đủ làm backup; đồng bộ KHÔNG ghi đè cài đặt máy khác
  });

  const info = { at: Date.now(), stats: merged.stats, count: merged.words.length };
  await chrome.storage.local.set({ __lastSync: info });
  return { result: info };
}

async function connectDrive() {
  const r = await runSync({ chooseAccount: true }); // đăng nhập + đồng bộ lần đầu
  return { ...r, status: await getSyncStatus() };
}

async function disconnectDrive() {
  try {
    const t = (await chrome.storage.local.get("hn_drive_token")).hn_drive_token;
    if (t && t.token) await HNSync.revokeToken(t.token);
  } catch (e) {}
  await HNSync.clearToken();
  await chrome.storage.local.remove(["__driveAccount", "__lastSync"]);
}

// Đưa lại các mục bị bỏ ở lần đồng bộ gần nhất (thêm lại = mốc sửa mới → lần đồng bộ
// sau sẽ gửi chúng lên Drive, không bị xoá nữa).
async function restoreRemoved() {
  return enqueue(async () => {
    const d = await chrome.storage.local.get(["words", "__syncRemoved"]);
    const items = (d.__syncRemoved && d.__syncRemoved.items) || [];
    const words = d.words || [];
    const ids = new Set(words.map(w => w.id));
    const back = items.filter(w => !ids.has(w.id));
    await chrome.storage.local.set({ words: words.concat(back) });
    await chrome.storage.local.remove("__syncRemoved");
    return { restored: back.length };
  });
}

async function getSyncStatus() {
  const d = await chrome.storage.local.get(["__driveAccount", "__lastSync", "__syncRemoved", "words"]);
  return {
    driveConfigured: HNSync.isDriveConfigured(),
    connected: !!d.__driveAccount,
    email: (d.__driveAccount && d.__driveAccount.email) || "",
    lastSync: d.__lastSync || null,
    removedCount: (d.__syncRemoved && d.__syncRemoved.items && d.__syncRemoved.items.length) || 0,
    count: (d.words || []).length,
    safety: await computeSafety()
  };
}

// Cập nhật từ bản cũ (v1.1): ngừng mọi đồng bộ tự động + gộp (CHỈ THÊM, không xoá
// gì) bản sao cũ còn nằm trong Tài khoản Chrome để không sót mục nào.
async function migrateLegacyOnce() {
  const d = await chrome.storage.local.get(["__syncV2", "words", "settings"]);
  if (d.__syncV2) return;
  try { await chrome.alarms.clear("hn-sync-pull"); } catch (e) {}
  const words = d.words || [];
  const legacy = await HNSync.readLegacySync();
  let added = 0;
  if (legacy && Array.isArray(legacy.words)) {
    const ids = new Set(words.map(w => w.id));
    const terms = new Set(words.filter(w => !w.sticky).map(w => HNSync.keyOf(w.term)));
    for (const w of legacy.words) {
      if (!w || !w.id || typeof w.term !== "string" || ids.has(w.id)) continue;
      if (!w.sticky && terms.has(HNSync.keyOf(w.term))) continue;
      words.push(w); ids.add(w.id); added++;
    }
  }
  // Máy mới cài: bản sao trong Tài khoản Chrome có thể về chậm → chưa đánh dấu xong,
  // lần khởi động sau thử lại.
  if (!legacy && words.length === 0) return;
  const s = d.settings || {};
  const patch = { __syncV2: { at: Date.now(), legacyAdded: added } };
  if (added) patch.words = words;
  // Người dùng từng chọn Drive ở bản cũ → coi như đã kết nối (đăng nhập lại khi bấm Đồng bộ).
  const legacyMeta = await chrome.storage.sync.get("hn_meta").catch(() => ({}));
  if (s.syncMode === "drive" || (legacyMeta.hn_meta && legacyMeta.hn_meta.mode === "drive")) {
    const acc = (await chrome.storage.local.get("__driveAccount")).__driveAccount;
    if (!acc) patch.__driveAccount = { email: "", connectedAt: Date.now() };
  }
  await chrome.storage.local.set(patch);
}

// ======================= MỨC AN TOÀN DỮ LIỆU =======================
// safe   : đã đồng bộ Drive trong 14 ngày, hoặc có file backup trong 8 ngày
// danger : chỉ nằm trên máy này → gỡ extension là mất
// new    : như danger nhưng người dùng còn mới → CHƯA nhắc (không "!" , không dải đỏ)
// empty  : chưa có dữ liệu
const SAFE_SYNC_MS = 14 * 86400000;
const SAFE_BACKUP_MS = 8 * 86400000;

// "Đã gắn bó": có từ 20 mục, hoặc mục cũ nhất đã lưu từ 3 ngày trước. Trước mốc này
// rủi ro mất dữ liệu còn nhỏ → không hiện "!" đỏ, không dải nhắc sao lưu, chưa tự tải
// file backup (người mới vừa lưu 1 từ đã bị cảnh báo / thấy file lạ trong Tải về).
const ESTABLISHED_COUNT = 20;
const ESTABLISHED_AGE_MS = 3 * 86400000;
function isEstablished(words, now = Date.now()) {
  if (!words || !words.length) return false;
  if (words.length >= ESTABLISHED_COUNT) return true;
  const oldest = Math.min(...words.map(w => Date.parse(w.createdAt || "") || 0));
  return now - oldest >= ESTABLISHED_AGE_MS;
}
async function computeSafety() {
  try {
    const d = await chrome.storage.local.get(["words", "settings", "__lastSync", "__driveAccount", "__lastAutoBackupAt"]);
    if (!d.words || d.words.length === 0) return { level: "empty" };
    const now = Date.now();
    const lastSync = (d.__lastSync && d.__lastSync.at) || 0;
    if (d.__driveAccount && lastSync && now - lastSync < SAFE_SYNC_MS) return { level: "safe", via: "drive" };
    const lastBackup = Math.max(
      Date.parse(d.__lastAutoBackupAt || "") || 0,
      Date.parse((d.settings && d.settings.lastExportAt) || "") || 0
    );
    if (lastBackup && now - lastBackup < SAFE_BACKUP_MS) return { level: "safe", via: "backup", lastBackup };
    if (!isEstablished(d.words, now)) return { level: "new" };
    return { level: "danger", connected: !!d.__driveAccount, lastSync, lastBackup };
  } catch (e) {
    return { level: "unknown" };
  }
}

// Số từ CẦN ÔN hôm nay — cùng luật với popup (HN_CONST.reviewState trong constants.js):
// chỉ khi bật Chế độ học từ; từ mới lưu tính từ hôm sau; người dùng có thể tắt nhắc.
async function computeDueCount() {
  const { words, settings } = await chrome.storage.local.get(["words", "settings"]);
  if (settings && settings.srsReminder === false) return 0;
  return HN_CONST.reviewState(words, settings).due;
}

// Badge trên icon: ưu tiên số từ cần ôn; nếu không có mà dữ liệu đang nguy cơ mất
// thì hiện "!" đỏ; còn lại thì xoá badge. Gom nhịp 800ms (bộ đếm hover ghi liên tục).
let badgeTimer = null;
function updateBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(updateBadgeNow, 800);
}
async function updateBadgeNow() {
  try {
    const due = await computeDueCount();
    if (due > 0) {
      chrome.action.setBadgeText({ text: due > 99 ? "99+" : String(due) });
      chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
      if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#ffffff" });
      chrome.action.setTitle({ title: `Highlight Note — ${due} từ cần ôn hôm nay` });
      return;
    }
    const s = await computeSafety();
    if (s.level === "danger") {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#e53935" });
      if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#ffffff" });
      chrome.action.setTitle({
        title: "Highlight Note — Dữ liệu chưa được sao lưu, có thể mất khi gỡ tiện ích.\nBấm để đồng bộ Google Drive hoặc tải backup."
      });
    } else {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: "Highlight Note" });
    }
  } catch (e) {}
}

// ======================= TỰ ĐỘNG BACKUP RA MÁY =======================
// Định kỳ tải 1 file backup .json vào thư mục Tải về (ghi đè 1 file duy nhất).
// File nằm trên ổ đĩa → SỐNG SÓT cả khi gỡ extension.

const AUTO_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // mỗi 7 ngày
const AUTO_BACKUP_FILENAME = "Highlight Note - Tu vung.json";

// Tạo & tải file backup ngay (dùng data URL vì service worker không có createObjectURL).
async function doAutoBackup(words, settings) {
  const data = { version: 1, exportedAt: new Date().toISOString(), words, settings };
  const url = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  await new Promise((resolve) => {
    try {
      chrome.downloads.download(
        { url, filename: AUTO_BACKUP_FILENAME, conflictAction: "overwrite", saveAs: false },
        () => resolve()
      );
    } catch (e) { resolve(); }
  });
  await chrome.storage.local.set({ __lastAutoBackupAt: new Date().toISOString() });
}

// Chỉ backup khi: bật tính năng, có dữ liệu, và đã quá hạn (hoặc force).
async function maybeAutoBackup(force) {
  const d = await chrome.storage.local.get(["words", "settings", "__lastAutoBackupAt"]);
  const settings = d.settings || {};
  if (settings.autoBackup === false) return;
  if (!d.words || d.words.length === 0) return;
  if (!force && !isEstablished(d.words)) return; // người mới: chưa tự tải file về máy
  const lastMs = Date.parse(d.__lastAutoBackupAt || "") || 0;
  if (!force && Date.now() - lastMs < AUTO_BACKUP_INTERVAL_MS) return;
  await doAutoBackup(d.words, settings);
}

chrome.runtime.onStartup.addListener(() => {
  enqueue(migrateLegacyOnce).catch(() => {});
  maybeAutoBackup(false).catch(() => {});
  updateBadge();
});
chrome.runtime.onInstalled.addListener(() => {
  enqueue(migrateLegacyOnce).catch(() => {});
  // Kiểm tra backup mỗi ngày 1 lần; bản thân hàm tự quyết đã quá 7 ngày chưa.
  chrome.alarms.create("hn-auto-backup", { periodInMinutes: 1440 });
  updateBadge();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "hn-auto-backup") maybeAutoBackup(false).catch(() => {}).finally(() => updateBadge());
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Options bấm "Sao lưu ngay vào máy".
  if (msg && msg.type === "AUTO_BACKUP_NOW") {
    maybeAutoBackup(true).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  // Mở trang Cài đặt / Hướng dẫn từ UI nổi trong content script (content script
  // không gọi trực tiếp được openOptionsPage / chrome.tabs).
  if (msg && msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (msg && msg.type === "OPEN_WELCOME") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    return;
  }
});
