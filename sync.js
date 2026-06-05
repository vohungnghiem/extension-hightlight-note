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
  // Mỗi chunk chừa biên cho key + cú pháp JSON, dùng ~7KB payload an toàn.
  const CHUNK_PAYLOAD = 7000;
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

  // ---------- Merge (chống mất dữ liệu khi nhiều máy sửa song song) ----------
  // Union theo term (lowercase). Giữ hoverCount max, trạng thái learned mới nhất,
  // field rỗng thì lấp từ bên kia. Tái dùng tinh thần merge trong popup import.
  function mergeWords(localWords, remoteWords) {
    const byTerm = new Map();
    const keyOf = (w) => (w.term || "").toLowerCase();
    for (const w of localWords) byTerm.set(keyOf(w), { ...w });
    for (const r of remoteWords) {
      const k = keyOf(r);
      if (!byTerm.has(k)) {
        byTerm.set(k, { ...r });
        continue;
      }
      const ex = byTerm.get(k);
      ex.hoverCount = Math.max(ex.hoverCount || 0, r.hoverCount || 0);
      if (!ex.meaning && r.meaning) ex.meaning = r.meaning;
      if (!ex.note && r.note) ex.note = r.note;
      if (!ex.phonetic && r.phonetic) ex.phonetic = r.phonetic;
      if (!ex.lang && r.lang) ex.lang = r.lang;
      // learned: ưu tiên bản có learnedAt mới hơn
      const exAt = ex.learnedAt ? Date.parse(ex.learnedAt) : 0;
      const rAt = r.learnedAt ? Date.parse(r.learnedAt) : 0;
      if (rAt > exAt) { ex.learned = !!r.learned; ex.learnedAt = r.learnedAt; }
      else if (!ex.learnedAt && r.learned) { ex.learned = true; ex.learnedAt = r.learnedAt; }
      if (!ex.createdAt && r.createdAt) ex.createdAt = r.createdAt;
      if (ex.autoDeleteAt == null && r.autoDeleteAt != null) ex.autoDeleteAt = r.autoDeleteAt;
    }
    return Array.from(byTerm.values());
  }

  // Merge settings: last-write-wins ở cấp đối tượng, nhưng không nuốt mất key local.
  function mergeSettings(localSettings, remoteSettings, remoteIsNewer) {
    if (!remoteSettings) return localSettings || {};
    if (remoteIsNewer) return { ...(localSettings || {}), ...remoteSettings };
    return { ...(remoteSettings || {}), ...(localSettings || {}) };
  }

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

  // Cắt chuỗi JSON thành các mảnh <= CHUNK_PAYLOAD byte (cắt theo byte an toàn).
  function splitToChunks(jsonStr) {
    const chunks = [];
    let buf = "";
    let bufBytes = 0;
    for (const ch of jsonStr) {
      const cb = byteLen(ch);
      if (bufBytes + cb > CHUNK_PAYLOAD) {
        chunks.push(buf);
        buf = "";
        bufBytes = 0;
      }
      buf += ch;
      bufBytes += cb;
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

  function isDriveConfigured() {
    try {
      const m = chrome.runtime.getManifest();
      return !!(m.oauth2 && m.oauth2.client_id && !/<.*>/.test(m.oauth2.client_id));
    } catch (e) { return false; }
  }

  function getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
      if (!chrome.identity || !chrome.identity.getAuthToken) {
        return reject(new Error("identity API không khả dụng"));
      }
      chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
        const e = chrome.runtime.lastError;
        if (e || !token) return reject(new Error(e ? e.message : "Không lấy được token"));
        resolve(token);
      });
    });
  }

  function removeCachedToken(token) {
    return new Promise((resolve) => {
      try { chrome.identity.removeCachedAuthToken({ token }, () => resolve()); }
      catch (e) { resolve(); }
    });
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
    mergeWords, mergeSettings,
    // tier 1
    pushToSync, pullFromSync, syncBytesInUse, getRemoteMeta, syncGet, syncSet, syncRemove,
    // tier 2
    isDriveConfigured, getAuthToken, removeCachedToken, revokeToken, pushToDrive, pullFromDrive, findDriveFileId, getDriveFileInfo
  };
})(typeof self !== "undefined" ? self : this);
