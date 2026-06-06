// Service worker: tạo context menu "Tô sáng & lưu" khi user bôi đen text trên web
// + Bộ điều phối đồng bộ lai (Tier 1: storage.sync, Tier 2: Google Drive)

importScripts("sync.js");

const MENU_ID = "vocab-note-add-selection";

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Tô sáng & lưu '%s' vào Highlight Note",
    contexts: ["selection"]
  });

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
        extendBy: 20,
        hoverCooldownMs: 300000,
        highlightColor: "#ffeb3b",
        highlightStyle: "underline",
        highlightThickness: 2,
        caseSensitive: false,
        enabled: true,
        showReview: true,
        composerOpen: false,
        blacklistedHosts: [],
        syncEnabled: true,
        showToasts: true
      };
    }
    if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const term = info.selectionText.trim();
  if (!term || term.length > 2000) return; // cho phép lưu cả đoạn dài (thuật ngữ, viết tắt, ghi chú)
  chrome.tabs.sendMessage(tab.id, { type: "PROMPT_ADD_WORD", term });
});

// Phím tắt Ctrl+Shift+V: lấy text đang chọn → mở mini-card
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "add-selected-word") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { type: "ADD_FROM_SELECTION" });
  }
});

// Khi popup yêu cầu mở chính nó dưới dạng cửa sổ riêng (workaround IME fcitx5/ibus)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "OPEN_POPUP_WINDOW") {
    const url = chrome.runtime.getURL("popup.html") + "?window=1" + (msg.focus ? `&focus=${encodeURIComponent(msg.focus)}` : "");
    chrome.windows.create({ url, type: "popup", width: 396, height: 680 });
    return;
  }
  // UI (options/popup) yêu cầu đồng bộ thủ công ngay.
  if (msg && msg.type === "SYNC_NOW") {
    (async () => {
      try {
        await pullRemote();
        await pushNow(true);
        sendResponse({ ok: true, status: await getSyncStatus() });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // giữ kênh async
  }
  if (msg && msg.type === "SYNC_STATUS") {
    getSyncStatus().then((s) => sendResponse(s));
    return true;
  }
  if (msg && msg.type === "SYNC_GET_DRIVE_LINK") {
    (async () => {
      try {
        if (!HNSync.isDriveConfigured()) throw new Error("Drive chưa thiết lập");
        const token = await HNSync.getAuthToken(false);
        const info = await HNSync.getDriveFileInfo(token);
        sendResponse({ ok: true, info });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
  if (msg && msg.type === "SYNC_DISCONNECT_DRIVE") {
    (async () => {
      try {
        await disconnectDrive();
        updateBadge();
        sendResponse({ ok: true, status: await getSyncStatus() });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
  if (msg && msg.type === "SYNC_CONNECT_DRIVE") {
    (async () => {
      try {
        if (!HNSync.isDriveConfigured()) throw new Error("Chưa cấu hình OAuth client_id trong manifest");
        // THU HỒI HẲN token cũ (có thể còn scope drive.appdata cũ) rồi xin lại sạch,
        // để Chrome hỏi đúng quyền mới drive.file thay vì trả token scope cũ từ cache.
        try {
          const old = await HNSync.getAuthToken(false);
          if (old) { await HNSync.revokeToken(old); await HNSync.removeCachedToken(old); }
        } catch (e) {}
        const token = await HNSync.getAuthToken(true); // tương tác → hiện màn hình đăng nhập Google
        // Kiểm tra token mới gọi Drive được không (bắt lỗi scope ngay tại đây cho rõ).
        await HNSync.findDriveFileId(token);
        // QUAN TRỌNG: KÉO bản trên Drive về TRƯỚC khi đẩy. Nếu bản Drive mới hơn
        // (vd máy mới/local rỗng) → lấy nguyên bản Drive về. Nếu local mới hơn →
        // giữ local rồi đẩy lên. Tránh đẩy đè rỗng làm mất dữ liệu Drive.
        try {
          const remote = await HNSync.pullFromDrive(token);
          if (remote) await applyRemoteIfNewer(remote, remote.syncRev || 0);
        } catch (e) { /* chưa có file trên Drive cũng không sao */ }
        await pushNow(true);
        updateBadge();
        if (needsDriveAuth || lastPushError) {
          sendResponse({ ok: false, error: lastPushError || "Đẩy lên Drive thất bại", status: await getSyncStatus() });
        } else {
          sendResponse({ ok: true, status: await getSyncStatus() });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});

// ======================= ĐỒNG BỘ "BẢN SỬA GẦN NHẤT THẮNG" =======================
// Mô hình Last-Write-Wins cả cuốn: mỗi lần local đổi → ghi mốc thời gian __rev
// (LƯU TRÊN ĐĨA, không phải bộ nhớ tạm — nên service worker ngủ rồi dậy vẫn đúng).
// Khi đồng bộ: bên nào __rev MỚI HƠN thì lấy NGUYÊN bản đó (cả thêm/sửa/XOÁ),
// không gộp union nữa → xoá là xoá thật, không có chuyện từ tự sống lại.
//
// Cài đặt mang tính riêng-từng-máy thì giữ nguyên, không để bản remote ghi đè.

let applyingRemote = false;   // đang ghi dữ liệu remote vào local → bỏ qua push
let pushTimer = null;
let lastPushError = null;
let needsDriveAuth = false;
const PUSH_DEBOUNCE_MS = 4000;
const DEVICE_LOCAL_SETTINGS = ["syncEnabled", "syncMode", "blacklistedHosts", "composerOpen", "autoBackup", "lastExportAt"];

async function isSyncEnabled() {
  const { settings } = await HNSync.getLocal();
  return settings.syncEnabled !== false;
}

// __rev = { at: <mốc thời gian ms>, device }. Lưu trong storage.local, KHÔNG đồng bộ.
function getLocalRev() {
  return new Promise((r) =>
    chrome.storage.local.get("__rev", (d) => r(d.__rev || { at: 0, device: null }))
  );
}
async function bumpLocalRev() {
  const device = await HNSync.getDeviceId();
  const rev = { at: Date.now(), device };
  await new Promise((r) => chrome.storage.local.set({ __rev: rev }, r));
  return rev;
}

// Đẩy NGUYÊN bản local lên remote, tự chọn tier theo kích thước.
async function pushNow(force) {
  if (!force && !(await isSyncEnabled())) return;
  const { words, settings } = await HNSync.getLocal();
  // Chốt an toàn: KHÔNG tự động đẩy khi local đang rỗng. Tránh cảnh local vừa bị
  // xoá/cài lại liền đẩy bản rỗng đè mất dữ liệu đã có trên remote. Muốn đẩy bản
  // rỗng (đã xoá hết có chủ đích) thì dùng "Đồng bộ ngay" (force=true).
  if (!force && (!words || words.length === 0)) return;
  const size = HNSync.estimateSize(words, settings);
  // syncMode: "auto" (mặc định, theo dung lượng) hoặc "drive" (luôn dùng Drive).
  const forceDrive = settings.syncMode === "drive";
  const tier = forceDrive ? "drive" : HNSync.decideTier(size);
  const rev = await getLocalRev();
  const revAt = rev.at || Date.now();
  const device = rev.device || await HNSync.getDeviceId();
  lastPushError = null;

  if (tier === "sync") {
    try {
      await HNSync.pushToSync(revAt, device);
      needsDriveAuth = false;
      return;
    } catch (e) {
      if (!e.quota) { lastPushError = e.message; throw e; }
      // Quá quota dù ước lượng dưới ngưỡng → rơi xuống Drive.
    }
  }

  // Tier Drive.
  if (!HNSync.isDriveConfigured()) {
    needsDriveAuth = true;
    lastPushError = forceDrive
      ? "Đã chọn chế độ Drive nhưng chưa cấu hình OAuth client_id trong manifest (xem README)"
      : "Dữ liệu vượt giới hạn Sync, cần kết nối Google Drive";
    return;
  }
  try {
    const token = await HNSync.getAuthToken(false); // im lặng; cần user bấm kết nối lần đầu
    await HNSync.pushToDrive(token, revAt, device);
    needsDriveAuth = false;
  } catch (e) {
    needsDriveAuth = true;
    lastPushError = "Cần cấp quyền Google Drive: " + e.message;
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; pushNow(false).catch(() => {}); }, PUSH_DEBOUNCE_MS);
}

// Kéo remote về; CHỈ áp khi remote mới hơn local (so theo __rev).
async function pullRemote() {
  if (!(await isSyncEnabled())) return;
  const meta = await HNSync.getRemoteMeta();
  if (!meta) return;

  const remoteRev = meta.syncRev || 0;
  const localRev = await getLocalRev();
  const { words: lw0 } = await HNSync.getLocal();
  // Local rỗng KHÔNG bao giờ thắng (coi mốc = 0) → máy mới/vừa cài lại luôn kéo về.
  const effLocalAt = (lw0 && lw0.length) ? localRev.at : 0;
  if (remoteRev <= effLocalAt) return;

  let payload = null;
  if (meta.mode === "sync") {
    payload = await HNSync.pullFromSync();
  } else if (meta.mode === "drive") {
    if (!HNSync.isDriveConfigured()) { needsDriveAuth = true; return; }
    try {
      const token = await HNSync.getAuthToken(false);
      payload = await HNSync.pullFromDrive(token);
    } catch (e) {
      needsDriveAuth = true;
      return;
    }
  }
  await applyRemoteIfNewer(payload, remoteRev);
}

// Áp NGUYÊN bản remote vào local (Last-Write-Wins) nếu remote mới hơn.
// Words: thay nguyên. Settings: lấy remote nhưng GIỮ các khoá riêng-từng-máy.
async function applyRemoteIfNewer(payload, remoteRev) {
  if (!payload || !Array.isArray(payload.words)) return;
  const localRev = await getLocalRev();
  const { words: lw, settings: localSettings } = await HNSync.getLocal();
  // Local rỗng coi mốc = 0 (không bao giờ thắng); ngược lại so mốc bình thường.
  const effLocalAt = (lw && lw.length) ? localRev.at : 0;
  if ((remoteRev || 0) <= effLocalAt) return; // local đã mới hơn → bỏ

  const remoteSettings = payload.settings || {};
  const mergedSettings = { ...remoteSettings };
  for (const k of DEVICE_LOCAL_SETTINGS) {
    if (localSettings[k] !== undefined) mergedSettings[k] = localSettings[k];
  }

  applyingRemote = true;
  await new Promise((resolve) =>
    chrome.storage.local.set({ words: payload.words, settings: mergedSettings }, resolve)
  );
  // Nhận luôn mốc của remote để không dội ngược (local giờ = remote).
  await new Promise((r) =>
    chrome.storage.local.set({ __rev: { at: remoteRev, device: payload.deviceId || null } }, r)
  );
  setTimeout(() => { applyingRemote = false; }, 250);
}

// Ngắt kết nối Drive: thu hồi quyền + xoá cache token, chuyển về chế độ Tự động.
async function disconnectDrive() {
  try {
    const token = await HNSync.getAuthToken(false);
    if (token) {
      await HNSync.revokeToken(token);
      await HNSync.removeCachedToken(token);
    }
  } catch (e) { /* chưa có token cũng không sao */ }
  const { settings } = await HNSync.getLocal();
  const next = { ...settings, syncMode: "auto" };
  await new Promise((r) => chrome.storage.local.set({ settings: next }, r));
  needsDriveAuth = false;
  lastPushError = null;
}

// Kiểm tra Drive đã kết nối chưa (có token im lặng) + lấy email nếu có.
async function getDriveConnection() {
  if (!HNSync.isDriveConfigured()) return { connected: false, email: "" };
  let connected = false;
  try {
    await HNSync.getAuthToken(false); // im lặng: có token = đã từng cấp quyền
    connected = true;
  } catch (e) {
    connected = false;
  }
  let email = "";
  try {
    email = await new Promise((resolve) => {
      if (!chrome.identity.getProfileUserInfo) return resolve("");
      chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }, (info) => resolve((info && info.email) || ""));
    });
  } catch (e) {}
  return { connected, email };
}

async function getSyncStatus() {
  const meta = await HNSync.getRemoteMeta();
  const bytes = await HNSync.syncBytesInUse();
  const { words, settings } = await HNSync.getLocal();
  const drive = await getDriveConnection();
  return {
    enabled: settings.syncEnabled !== false,
    syncMode: settings.syncMode === "drive" ? "drive" : "auto",
    mode: meta ? meta.mode : "sync",
    lastUpdatedAt: meta ? meta.updatedAt : null,
    bytesInUse: bytes,
    quota: HNSync.QUOTA_BYTES,
    estimatedSize: HNSync.estimateSize(words, settings),
    driveConfigured: HNSync.isDriveConfigured(),
    driveConnected: drive.connected,
    driveEmail: drive.email,
    needsDriveAuth,
    lastPushError,
    safety: await computeSafety()
  };
}

// ======================= MỨC AN TOÀN DỮ LIỆU =======================
// Trả về mức an toàn để (1) popup hiện banner phù hợp, (2) gắn badge lên icon
// tiện ích → người dùng biết nguy cơ mất dữ liệu mà KHÔNG cần mở popup.
//   safe    : đã ở cloud (Drive) hoặc Tài khoản Chrome → còn nguyên khi gỡ/cài lại.
//   caution : không sync cloud, nhưng có file backup trên đĩa còn mới (sống sót khi gỡ).
//   danger  : chỉ nằm trong storage.local máy này → gỡ extension là mất.
//   empty   : chưa có dữ liệu → không cần cảnh báo.
async function computeSafety() {
  try {
    const { words, settings } = await HNSync.getLocal();
    if (!words || words.length === 0) return { level: "empty" };

    const drive = await getDriveConnection();
    if (drive.connected) return { level: "safe", via: "drive" };

    const meta = await HNSync.getRemoteMeta();
    const syncEnabled = settings.syncEnabled !== false;
    // Có meta trên storage.sync nghĩa là dữ liệu đã nằm ở Tài khoản Chrome
    // (hoặc con trỏ Drive) → đăng nhập Chrome ở máy khác sẽ kéo về được.
    if (syncEnabled && meta && !needsDriveAuth) {
      return { level: "safe", via: meta.mode === "drive" ? "drive" : "account" };
    }

    // Không sync cloud → xét file backup trên đĩa (auto-backup hoặc export tay).
    const lastAuto = await getLastAutoBackup();
    const lastAutoMs = lastAuto ? Date.parse(lastAuto) : 0;
    const lastExportMs = settings.lastExportAt ? Date.parse(settings.lastExportAt) : 0;
    const lastBackupMs = Math.max(lastAutoMs || 0, lastExportMs || 0);
    const fresh = lastBackupMs && (Date.now() - lastBackupMs < AUTO_BACKUP_INTERVAL_MS);
    if (fresh) return { level: "caution", via: "backup", lastBackupMs };

    return { level: "danger", lastBackupMs: lastBackupMs || 0 };
  } catch (e) {
    return { level: "unknown" };
  }
}

// Gắn/xoá badge cảnh báo trên icon tiện ích theo mức an toàn.
let badgeUpdating = false;
async function updateBadge() {
  if (badgeUpdating) return;
  badgeUpdating = true;
  try {
    const s = await computeSafety();
    if (s.level === "danger") {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#e53935" });
      if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: "#ffffff" });
      chrome.action.setTitle({
        title: "Highlight Note — ⚠ Dữ liệu CHƯA được sao lưu, có thể mất khi gỡ tiện ích.\nBấm để bật đồng bộ hoặc tải backup."
      });
    } else {
      chrome.action.setBadgeText({ text: "" });
      chrome.action.setTitle({ title: "Highlight Note" });
    }
  } catch (e) {} finally {
    badgeUpdating = false;
  }
}

// ======================= TỰ ĐỘNG BACKUP RA MÁY =======================
// Định kỳ tải 1 file backup .json vào thư mục Tải về (ghi đè 1 file duy nhất).
// File nằm trên ổ đĩa → SỐNG SÓT cả khi gỡ extension. Mốc thời gian lưu ở key
// local riêng (__lastAutoBackupAt) để KHÔNG đồng bộ → mỗi máy tự backup độc lập.

const AUTO_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // mỗi 7 ngày
const AUTO_BACKUP_FILENAME = "Highlight Note - Tu vung.json";

function getLastAutoBackup() {
  return new Promise((r) =>
    chrome.storage.local.get("__lastAutoBackupAt", (d) => r(d.__lastAutoBackupAt || 0))
  );
}

// Tạo & tải file backup ngay (dùng data URL vì service worker không có createObjectURL).
async function doAutoBackup(words, settings) {
  const data = { version: 1, exportedAt: new Date().toISOString(), words, settings };
  const json = JSON.stringify(data, null, 2);
  const url = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  await new Promise((resolve) => {
    try {
      chrome.downloads.download(
        { url, filename: AUTO_BACKUP_FILENAME, conflictAction: "overwrite", saveAs: false },
        () => resolve()
      );
    } catch (e) { resolve(); }
  });
  await new Promise((r) =>
    chrome.storage.local.set({ __lastAutoBackupAt: new Date().toISOString() }, r)
  );
}

// Chỉ backup khi: bật tính năng, có dữ liệu, và đã quá hạn (hoặc force).
async function maybeAutoBackup(force) {
  const { words, settings } = await HNSync.getLocal();
  if (settings.autoBackup === false) return;        // user đã tắt
  if (!words || words.length === 0) return;          // không có gì để lưu
  const last = (await getLastAutoBackup());
  const lastMs = last ? Date.parse(last) : 0;
  if (!force && Date.now() - lastMs < AUTO_BACKUP_INTERVAL_MS) return;
  await doAutoBackup(words, settings);
}

// --- Trigger ---

// local đổi (do user/máy này) → ghi mốc __rev mới rồi đẩy lên.
// Bỏ qua nếu đang áp remote (applyingRemote) hoặc chỉ đổi khoá nội bộ (__rev, __deviceId…).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || applyingRemote) return;
  if (changes.words || changes.settings) {
    bumpLocalRev().then(() => schedulePush()).catch(() => schedulePush());
  }
  // Dữ liệu / cài đặt / mốc backup đổi → tính lại badge cảnh báo trên icon.
  if (changes.words || changes.settings || changes.__lastAutoBackupAt) {
    updateBadge();
  }
});

// remote đổi (máy khác ghi) → kéo về.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes[HNSync.META_KEY]) pullRemote().catch(() => {});
});

// Pull lúc khởi động/cài + lập alarm pull định kỳ + kiểm tra auto-backup.
chrome.runtime.onStartup.addListener(() => {
  pullRemote().catch(() => {});
  maybeAutoBackup(false).catch(() => {});
  updateBadge();
});
chrome.runtime.onInstalled.addListener(() => {
  pullRemote().catch(() => {});
  chrome.alarms.create("hn-sync-pull", { periodInMinutes: 15 });
  // Kiểm tra backup mỗi ngày 1 lần; bản thân hàm tự quyết đã quá 7 ngày chưa.
  chrome.alarms.create("hn-auto-backup", { periodInMinutes: 1440 });
  updateBadge();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "hn-sync-pull") pullRemote().catch(() => {});
  if (a.name === "hn-auto-backup") maybeAutoBackup(false).catch(() => {}).finally(() => updateBadge());
});

// Cho phép options bấm "Sao lưu ngay vào máy".
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
  // Content script hỏi: icon đã ghim lên thanh công cụ chưa? (để ẩn nút Hướng dẫn
  // trong trang khi đã ghim). getUserSettings có từ Chrome 91.
  if (msg && msg.type === "GET_ACTION_PINNED") {
    if (chrome.action && chrome.action.getUserSettings) {
      chrome.action.getUserSettings()
        .then((s) => sendResponse({ pinned: !!s.isOnToolbar }))
        .catch(() => sendResponse({ pinned: false }));
      return true; // async
    }
    sendResponse({ pinned: false });
    return;
  }
});
