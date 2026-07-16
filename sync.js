// sync.js — Lõi đồng bộ kiểu lai (Tier 1: chrome.storage.sync, Tier 2: Google Drive)
// Module thuần, không phụ thuộc DOM. Dùng chung cho service worker (importScripts)
// và cho trang options/popup (qua <script src="sync.js">).
//
// Nguyên tắc: storage.local là nguồn sự thật. Module này chỉ đẩy/kéo và merge.
// Tier 1 chạy 0 setup. Tier 2 (Drive) cần OAuth client_id trong manifest (xem README).

(function (root) {
  "use strict";

  // ---- Hằng số giới hạn chrome.storage.sync ----
  const QUOTA_BYTES = 102400;          // tổng 100KB
  const QUOTA_BYTES_PER_ITEM = 8192;   // 8KB / item
  const MAX_ITEMS = 512;
  // QUAN TRỌNG: storage.sync tính quota mỗi item = độ dài JSON.stringify(value) + key,
  // tức là ĐÃ ESCAPE. JSON từ vựng đầy dấu " (mỗi " → \" gấp đôi byte), nên phải cắt
  // chunk theo kích thước-đã-escape, không phải byte thô — nếu không sẽ vượt 8192 →
  // lỗi kQuotaBytesPerItem. Budget 7600 chừa biên cho key ("hn_chunk_NNN") + 2 dấu ngoặc.
  const CHUNK_ESCAPED_BUDGET = 7600;
  // Ngưỡng chuyển sang Drive: chừa biên dưới 100KB và dưới trần số item.
  const SYNC_SAFE_BYTES = 90000;

  const META_KEY = "hn_meta";
  const CHUNK_PREFIX = "hn_chunk_";
  const DRIVE_FILE_NAME = "Highlight Note - Tu vung.json";
  const FORMAT_VERSION = 1;

  const enc = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;
  function byteLen(str) {
    return enc ? enc.encode(str).length : unescape(encodeURIComponent(str)).length;
  }

  // ---------- Helpers chung ----------

  // deviceId ổn định, lưu trong storage.local (không sync) để nhận diện nguồn ghi.
  function getDeviceId() {
    return new Promise((resolve) => {
      chrome.storage.local.get("__deviceId", (d) => {
        if (d.__deviceId) return resolve(d.__deviceId);
        const id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        chrome.storage.local.set({ __deviceId: id }, () => resolve(id));
      });
    });
  }

  function getLocal() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["words", "settings"], (d) => {
        resolve({ words: d.words || [], settings: d.settings || {} });
      });
    });
  }

  // Bản ghi đồng bộ chuẩn hoá.
  function makePayload(words, settings, rev, deviceId) {
    return {
      version: FORMAT_VERSION,
      updatedAt: new Date().toISOString(),
      syncRev: rev,
      deviceId,
      words,
      settings
    };
  }

  function estimateSize(words, settings) {
    return byteLen(JSON.stringify(makePayload(words, settings, 0, "x")));
  }

  // Quyết định tier dựa trên kích thước serialize.
  function decideTier(size) {
    return size <= SYNC_SAFE_BYTES ? "sync" : "drive";
  }

  // Đồng bộ dùng Last-Write-Wins: khi remote mới hơn (theo syncRev), background
  // thay NGUYÊN mảng words của local bằng remote (xem applyRemoteIfNewer). Không
  // merge từng-item ở luồng đồng bộ — hợp với 1 người dùng vài máy ít sửa song song.
  // (Việc hợp nhất/union chỉ diễn ra ở luồng Import thủ công trong popup/options.)

  // ---------- Tier 1: chrome.storage.sync (chunked) ----------

  function syncGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(keys, (d) => {
        const e = chrome.runtime.lastError;
        if (e) return reject(new Error(e.message));
        resolve(d);
      });
    });
  }
  function syncSet(obj) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(obj, () => {
        const e = chrome.runtime.lastError;
        if (e) return reject(new Error(e.message));
        resolve();
      });
    });
  }
  function syncRemove(keys) {
    return new Promise((resolve) => {
      chrome.storage.sync.remove(keys, () => resolve());
    });
  }

  // Chi phí byte của 1 ký tự KHI ĐÃ nằm trong chuỗi JSON stringify (tính cả escape).
  // Đây mới là con số storage.sync dùng để tính quota mỗi item.
  function jsonCharCost(ch) {
    if (ch === '"' || ch === "\\") return 2;            // " → \" ; \ → \\
    const code = ch.charCodeAt(0);
    if (code < 0x20) {                                   // ký tự điều khiển
      return (ch === "\b" || ch === "\f" || ch === "\n" || ch === "\r" || ch === "\t") ? 2 : 6; // \uXXXX
    }
    return byteLen(ch);
  }

  // Cắt chuỗi JSON thành các mảnh mà kích thước-đã-escape <= CHUNK_ESCAPED_BUDGET,
  // đảm bảo mỗi item lưu vào storage.sync không vượt 8192 byte.
  function splitToChunks(jsonStr) {
    const chunks = [];
    let buf = "";
    let bufCost = 0;
    for (const ch of jsonStr) {           // lặp theo code-point (an toàn với emoji)
      const cc = jsonCharCost(ch);
      if (bufCost + cc > CHUNK_ESCAPED_BUDGET && buf) {
        chunks.push(buf);
        buf = "";
        bufCost = 0;
      }
      buf += ch;
      bufCost += cc;
    }
    if (buf) chunks.push(buf);
    return chunks;
  }

  async function pushToSync(rev, deviceId) {
    const { words, settings } = await getLocal();
    const payload = makePayload(words, settings, rev, deviceId);
    const json = JSON.stringify(payload);
    const chunks = splitToChunks(json);

    if (chunks.length + 1 > MAX_ITEMS || byteLen(json) > QUOTA_BYTES - 2048) {
      throw Object.assign(new Error("QUOTA_EXCEEDED"), { quota: true });
    }

    // Dọn chunk cũ thừa trước khi ghi.
    const existing = await syncGet(null);
    const oldChunkKeys = Object.keys(existing).filter((k) => k.startsWith(CHUNK_PREFIX));

    const toSet = {};
    chunks.forEach((c, i) => { toSet[CHUNK_PREFIX + i] = c; });
    toSet[META_KEY] = {
      mode: "sync",
      syncRev: rev,
      deviceId,
      chunkCount: chunks.length,
      updatedAt: payload.updatedAt,
      version: FORMAT_VERSION
    };

    const staleKeys = oldChunkKeys.filter((k) => {
      const idx = parseInt(k.slice(CHUNK_PREFIX.length), 10);
      return idx >= chunks.length;
    });

    await syncSet(toSet);
    if (staleKeys.length) await syncRemove(staleKeys);
    return { mode: "sync", chunkCount: chunks.length };
  }

  async function pullFromSync() {
    const meta = (await syncGet(META_KEY))[META_KEY];
    if (!meta || meta.mode !== "sync") return null;
    const keys = [];
    for (let i = 0; i < meta.chunkCount; i++) keys.push(CHUNK_PREFIX + i);
    const parts = await syncGet(keys);
    let json = "";
    for (let i = 0; i < meta.chunkCount; i++) {
      const p = parts[CHUNK_PREFIX + i];
      if (p == null) return null; // thiếu chunk → bỏ qua, tránh hỏng dữ liệu
      json += p;
    }
    try {
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function syncBytesInUse() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.getBytesInUse(null, (n) => resolve(n || 0));
      } catch (e) { resolve(0); }
    });
  }

  // ---------- Tier 2: Google Drive (appDataFolder) ----------

  // Nơi cache access_token của launchWebAuthFlow (API này KHÔNG tự cache như getAuthToken).
  const TOKEN_STORE_KEY = "hn_drive_token";

  function getOAuthConfig() {
    const m = chrome.runtime.getManifest();
    const o = (m && m.oauth2) || {};
    return {
      clientId: o.client_id || "",
      scopes: Array.isArray(o.scopes) && o.scopes.length
        ? o.scopes
        : ["https://www.googleapis.com/auth/drive.file"]
    };
  }

  function isDriveConfigured() {
    try {
      const { clientId } = getOAuthConfig();
      return !!(clientId && !/<.*>/.test(clientId));
    } catch (e) { return false; }
  }

  function getStoredToken() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(TOKEN_STORE_KEY, (r) => resolve((r && r[TOKEN_STORE_KEY]) || null));
      } catch (e) { resolve(null); }
    });
  }
  function setStoredToken(obj) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [TOKEN_STORE_KEY]: obj }, () => resolve()); }
      catch (e) { resolve(); }
    });
  }
  function clearStoredToken() {
    return new Promise((resolve) => {
      try { chrome.storage.local.remove(TOKEN_STORE_KEY, () => resolve()); }
      catch (e) { resolve(); }
    });
  }

  // launchWebAuthFlow: KHÔNG phụ thuộc Item ID. Chỉ cần OAuth client loại "Web application"
  // khai redirect URI = chrome.identity.getRedirectURL() (dạng https://<extId>.chromiumapp.org/).
  function launchInteractiveAuth() {
    return new Promise((resolve, reject) => {
      if (!chrome.identity || !chrome.identity.launchWebAuthFlow) {
        return reject(new Error("identity API không khả dụng"));
      }
      const { clientId, scopes } = getOAuthConfig();
      if (!clientId) return reject(new Error("Chưa cấu hình OAuth client_id trong manifest"));

      const redirectUri = chrome.identity.getRedirectURL();
      const authUrl = "https://accounts.google.com/o/oauth2/auth"
        + "?client_id=" + encodeURIComponent(clientId)
        + "&response_type=token"
        + "&redirect_uri=" + encodeURIComponent(redirectUri)
        + "&scope=" + encodeURIComponent(scopes.join(" "))
        + "&prompt=consent";

      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
        const e = chrome.runtime.lastError;
        if (e || !redirectUrl) {
          return reject(new Error(e ? e.message : "Đăng nhập bị huỷ"));
        }
        // Token trả về ở phần fragment (#) của redirect URL.
        const frag = redirectUrl.split("#")[1] || redirectUrl.split("?")[1] || "";
        const params = new URLSearchParams(frag);
        if (params.get("error")) {
          return reject(new Error("Google từ chối: " + params.get("error")));
        }
        const token = params.get("access_token");
        if (!token) return reject(new Error("Không nhận được access_token"));
        const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
        resolve({ token, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
      });
    });
  }

  // Giữ nguyên chữ ký getAuthToken(interactive) để background.js không phải đổi.
  async function getAuthToken(interactive) {
    const cached = await getStoredToken();
    if (cached && cached.token && cached.expiresAt && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    if (!interactive) {
      // Im lặng: chưa có token còn hạn → coi như chưa kết nối.
      throw new Error("Không lấy được token");
    }
    const fresh = await launchInteractiveAuth();
    await setStoredToken(fresh);
    return fresh.token;
  }

  async function removeCachedToken(token) {
    await clearStoredToken();
  }

  // Thu hồi quyền trên phía Google (đăng xuất hẳn khỏi app).
  async function revokeToken(token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
    } catch (e) { /* mạng lỗi cũng bỏ qua, vẫn xoá cache local */ }
  }

  async function driveFetch(token, url, opts) {
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: "Bearer " + token, ...(opts && opts.headers) }
    });
    if (res.status === 401) {
      // Token hết hạn → xoá cache để lần sau lấy mới.
      await removeCachedToken(token);
      throw Object.assign(new Error("UNAUTHORIZED"), { unauthorized: true });
    }
    if (!res.ok) throw new Error("Drive API " + res.status + ": " + (await res.text()));
    return res;
  }

  async function findDriveFileId(token) {
    // Scope drive.file chỉ thấy file do chính app tạo → q theo tên là đủ, không đụng file khác.
    const q = "name='" + DRIVE_FILE_NAME + "' and trashed=false";
    const url = "https://www.googleapis.com/drive/v3/files"
      + "?spaces=drive&fields=files(id,name,modifiedTime)"
      + "&q=" + encodeURIComponent(q);
    const res = await driveFetch(token, url, { method: "GET" });
    const data = await res.json();
    return (data.files && data.files[0]) ? data.files[0].id : null;
  }

  // Lấy đầy đủ thông tin file (kèm link mở trong Drive) để kiểm chứng.
  async function getDriveFileInfo(token) {
    const q = "name='" + DRIVE_FILE_NAME + "' and trashed=false";
    const url = "https://www.googleapis.com/drive/v3/files"
      + "?spaces=drive&fields=files(id,name,size,modifiedTime,webViewLink)"
      + "&q=" + encodeURIComponent(q);
    const res = await driveFetch(token, url, { method: "GET" });
    const data = await res.json();
    return (data.files && data.files[0]) ? data.files[0] : null;
  }

  async function pushToDrive(token, rev, deviceId) {
    const { words, settings } = await getLocal();
    const payload = makePayload(words, settings, rev, deviceId);
    const body = JSON.stringify(payload);

    const fileId = await findDriveFileId(token);
    const boundary = "hn_boundary_" + Date.now();
    // Tạo file ở My Drive (không parents) để bạn nhìn thấy & tải được trong Drive.
    const metadata = fileId
      ? {}
      : { name: DRIVE_FILE_NAME };

    const multipart =
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: application/json\r\n\r\n" +
      body + "\r\n" +
      "--" + boundary + "--";

    const url = fileId
      ? "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=multipart"
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

    await driveFetch(token, url, {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body: multipart
    });

    // Ghi con trỏ nhỏ vào storage.sync để máy khác biết kéo từ Drive.
    await syncSet({
      [META_KEY]: {
        mode: "drive",
        syncRev: rev,
        deviceId,
        updatedAt: payload.updatedAt,
        version: FORMAT_VERSION
      }
    });
    // Dọn chunk sync cũ (nếu trước đó ở tier sync) để giải phóng quota.
    const existing = await syncGet(null);
    const oldChunkKeys = Object.keys(existing).filter((k) => k.startsWith(CHUNK_PREFIX));
    if (oldChunkKeys.length) await syncRemove(oldChunkKeys);

    return { mode: "drive" };
  }

  async function pullFromDrive(token) {
    const fileId = await findDriveFileId(token);
    if (!fileId) return null;
    const url = "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media";
    const res = await driveFetch(token, url, { method: "GET" });
    try {
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // ---------- Đọc meta đang dùng (sync/drive) ----------
  async function getRemoteMeta() {
    try {
      return (await syncGet(META_KEY))[META_KEY] || null;
    } catch (e) { return null; }
  }

  root.HNSync = {
    // hằng số
    QUOTA_BYTES, SYNC_SAFE_BYTES, META_KEY, CHUNK_PREFIX, DRIVE_FILE_NAME,
    // helpers
    getDeviceId, getLocal, estimateSize, decideTier,
    // tier 1
    pushToSync, pullFromSync, syncBytesInUse, getRemoteMeta, syncGet, syncSet, syncRemove,
    // tier 2
    isDriveConfigured, getAuthToken, removeCachedToken, revokeToken, pushToDrive, pullFromDrive, findDriveFileId, getDriveFileInfo
  };
})(typeof self !== "undefined" ? self : this);
