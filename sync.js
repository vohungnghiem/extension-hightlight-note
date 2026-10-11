// sync.js — Đồng bộ thủ công qua 1 file JSON trên Google Drive của người dùng.
// Module thuần, không phụ thuộc DOM; nạp bởi service worker (importScripts).
//
// Nguyên tắc (v1.2): GỘP TỪNG MỤC, không bao giờ thay nguyên cả danh sách.
//   - Mục chỉ có ở một bên → giữ.
//   - Mục có ở cả hai bên → giữ bản SỬA sau cùng (theo mốc sửa từng mục).
//   - Mục bị xoá → chỉ xoá ở bên kia nếu lần xoá MUỘN HƠN lần sửa cuối của mục đó.
//   - Bộ đếm lần gặp (hover) không tính là "sửa": luôn lấy số lớn nhất.
// Bản cũ (v1.1) dùng "cả cuốn, bản mới nhất thắng" + tự động đẩy/kéo → một máy có
// dữ liệu cũ chỉ cần tăng bộ đếm là đè mất dữ liệu máy kia. Đó là lý do bỏ hẳn.

(function (root) {
  "use strict";

  const DRIVE_FILE_NAME = "Highlight Note - Tu vung.json";
  const FORMAT_VERSION = 2;
  const TOMBSTONE_TTL_MS = 180 * 86400000; // quên dấu xoá sau 180 ngày
  // Trường "tiến độ": đổi liên tục khi rê chuột → không tính là sửa, gộp bằng max.
  const PROGRESS_FIELDS = ["hoverCount", "lastCountedAt"];

  // ======================= GỘP (hàm thuần, không gọi mạng) =======================

  function keyOf(text) { return String(text || "").replace(/\s+/g, " ").trim().toLowerCase(); }

  // Nội dung của mục, bỏ các trường tiến độ — dùng để biết mục có thật sự bị sửa không.
  function contentKey(w) {
    const o = {};
    for (const k of Object.keys(w || {}).sort()) {
      if (PROGRESS_FIELDS.includes(k) || k.startsWith("_")) continue;
      o[k] = w[k];
    }
    return JSON.stringify(o);
  }

  // Mốc sửa của mục: lấy từ bảng times; dữ liệu cũ chưa có thì lấy mốc muộn nhất biết được.
  function itemTime(w, times) {
    const t = times && times[w.id];
    if (t) return t;
    let best = 0;
    for (const k of ["srsLast", "learnedAt", "createdAt"]) {
      const v = Date.parse(w[k] || "");
      if (v > best) best = v;
    }
    return best;
  }

  // Chuẩn hoá dữ liệu remote (file Drive) về { words, times, tombstones }.
  // Chấp nhận cả file định dạng cũ v1 (chỉ có words) → coi như chưa có mốc/dấu xoá.
  function normalizeState(data) {
    const d = data && typeof data === "object" ? data : {};
    const words = Array.isArray(d.words)
      ? d.words.filter(w => w && typeof w === "object" && w.id && typeof w.term === "string")
      : [];
    return {
      words,
      times: (d.times && typeof d.times === "object") ? d.times : {},
      tombstones: (d.tombstones && typeof d.tombstones === "object") ? d.tombstones : {}
    };
  }

  // local, remote: { words, times, tombstones }. now: mốc hiện tại (tham số để test được).
  // keepIds: id các mục người dùng chọn "giữ bản máy này" → coi như vừa sửa ở máy này.
  // Trả về { words, times, tombstones, removed (mục máy này bị bỏ), changes, stats }.
  //   changes: danh sách thay đổi ĐỤNG tới dữ liệu máy này (để hỏi trước khi áp):
  //   { id, term, kind: "updated" (máy khác sửa sau) | "removed" (máy khác đã xoá / trùng) }
  function mergeStates(local, remote, now = Date.now(), keepIds = []) {
    if (keepIds && keepIds.length) {
      const times = { ...local.times };
      for (const id of keepIds) times[id] = now;
      local = { ...local, times };
    }
    const L = new Map(local.words.map(w => [w.id, w]));
    const R = new Map(remote.words.map(w => [w.id, w]));
    const tomb = {};
    for (const src of [remote.tombstones, local.tombstones]) {
      for (const [id, t] of Object.entries(src || {})) tomb[id] = Math.max(tomb[id] || 0, +t || 0);
    }
    const stats = { added: 0, updated: 0, removed: 0, sent: 0 };
    const updatedLocal = [];
    const times = {};
    const merged = [];

    // Giữ thứ tự: mục máy này trước, rồi mục chỉ có trên Drive.
    const ids = [...L.keys()];
    for (const id of R.keys()) if (!L.has(id)) ids.push(id);

    for (const id of ids) {
      const l = L.get(id), r = R.get(id);
      const tl = l ? itemTime(l, local.times) : -1;
      const tr = r ? itemTime(r, remote.times) : -1;
      const tDel = tomb[id] || 0;
      if (tDel && tDel >= Math.max(tl, tr)) {
        if (l) stats.removed++;
        continue; // đã xoá sau lần sửa cuối → bỏ
      }
      delete tomb[id]; // còn sống (vd được thêm lại sau khi xoá) → bỏ dấu xoá cũ
      let pick, t;
      if (l && r) {
        const same = contentKey(l) === contentKey(r);
        pick = (!same && tr > tl) ? r : l;
        t = Math.max(tl, tr);
        if (!same) {
          if (pick === r) { stats.updated++; updatedLocal.push({ id, term: l.term, kind: "updated" }); }
          else stats.sent++;
        }
        const hc = Math.max(l.hoverCount || 0, r.hoverCount || 0);
        const lc = Math.max(l.lastCountedAt || 0, r.lastCountedAt || 0);
        if (hc !== (pick.hoverCount || 0) || lc !== (pick.lastCountedAt || 0)) {
          pick = { ...pick, hoverCount: hc };
          if (lc) pick.lastCountedAt = lc;
        }
      } else if (l) {
        pick = l; t = tl; stats.sent++;
      } else {
        pick = r; t = tr; stats.added++;
      }
      merged.push(pick);
      times[id] = t;
    }

    // Cùng một từ được thêm riêng ở 2 máy (khác id) → giữ bản sửa sau cùng, bỏ bản kia.
    const out = [];
    const byKey = new Map();
    for (const w of merged) {
      if (w.sticky) { out.push(w); continue; }
      const k = keyOf(w.term);
      if (!byKey.has(k)) { byKey.set(k, out.length); out.push(w); continue; }
      const i = byKey.get(k);
      const cur = out[i];
      const keep = (times[w.id] || 0) > (times[cur.id] || 0) ? w : cur;
      const drop = keep === w ? cur : w;
      out[i] = { ...keep, hoverCount: Math.max(keep.hoverCount || 0, drop.hoverCount || 0) };
      tomb[drop.id] = now;
      delete times[drop.id];
      if (L.has(drop.id)) stats.removed++;
      else stats.added = Math.max(0, stats.added - 1);
    }

    for (const [id, t] of Object.entries(tomb)) if (now - t > TOMBSTONE_TTL_MS) delete tomb[id];
    const keptIds = new Set(out.map(w => w.id));
    const removed = local.words.filter(w => !keptIds.has(w.id));
    const changes = updatedLocal.filter(c => keptIds.has(c.id))
      .concat(removed.map(w => ({ id: w.id, term: w.term, kind: "removed" })));
    return { words: out, times, tombstones: tomb, removed, changes, stats };
  }

  // ======================= GOOGLE DRIVE =======================

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

  async function getStoredToken() {
    try { return (await chrome.storage.local.get(TOKEN_STORE_KEY))[TOKEN_STORE_KEY] || null; }
    catch (e) { return null; }
  }
  async function clearToken() {
    try { await chrome.storage.local.remove(TOKEN_STORE_KEY); } catch (e) {}
  }

  // launchWebAuthFlow (implicit flow): KHÔNG phụ thuộc Item ID, chỉ cần OAuth client
  // loại "Web application" khai redirect URI = chrome.identity.getRedirectURL().
  // Token chỉ sống ~1 giờ → hết hạn thì thử lấy lại IM LẶNG (prompt=none) trước, chỉ
  // hiện cửa sổ Google khi thật cần (lần đầu kết nối, hoặc Google đòi xác nhận lại).
  function launchAuth({ interactive, chooseAccount, loginHint }) {
    return new Promise((resolve, reject) => {
      if (!chrome.identity || !chrome.identity.launchWebAuthFlow) {
        return reject(new Error("Trình duyệt này không hỗ trợ đăng nhập Google cho tiện ích"));
      }
      const { clientId, scopes } = getOAuthConfig();
      if (!clientId) return reject(new Error("Chưa cấu hình OAuth client_id trong manifest"));
      const p = new URLSearchParams({
        client_id: clientId,
        response_type: "token",
        redirect_uri: chrome.identity.getRedirectURL(),
        scope: scopes.join(" ")
      });
      if (!interactive) p.set("prompt", "none");
      else if (chooseAccount) p.set("prompt", "select_account");
      if (loginHint) p.set("login_hint", loginHint);
      const url = "https://accounts.google.com/o/oauth2/auth?" + p.toString();
      chrome.identity.launchWebAuthFlow({ url, interactive: !!interactive }, (redirectUrl) => {
        const e = chrome.runtime.lastError;
        if (e || !redirectUrl) return reject(new Error(e ? e.message : "Đăng nhập bị huỷ"));
        const frag = redirectUrl.split("#")[1] || redirectUrl.split("?")[1] || "";
        const params = new URLSearchParams(frag);
        if (params.get("error")) return reject(new Error("Google: " + params.get("error")));
        const token = params.get("access_token");
        if (!token) return reject(new Error("Không nhận được quyền truy cập từ Google"));
        const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
        resolve({ token, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
      });
    });
  }

  // opts: { interactive, chooseAccount, loginHint }
  async function getAuthToken(opts = {}) {
    if (!opts.chooseAccount) {
      const cached = await getStoredToken();
      if (cached && cached.token && cached.expiresAt > Date.now()) return cached.token;
      try {
        const silent = await launchAuth({ interactive: false, loginHint: opts.loginHint });
        await chrome.storage.local.set({ [TOKEN_STORE_KEY]: silent });
        return silent.token;
      } catch (e) {
        if (!opts.interactive) throw e;
      }
    }
    const fresh = await launchAuth({ interactive: true, chooseAccount: opts.chooseAccount, loginHint: opts.loginHint });
    await chrome.storage.local.set({ [TOKEN_STORE_KEY]: fresh });
    return fresh.token;
  }

  // Thu hồi quyền phía Google (đăng xuất hẳn khỏi app).
  async function revokeToken(token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
    } catch (e) { /* mạng lỗi cũng bỏ qua */ }
  }

  async function driveFetch(token, url, opts) {
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: "Bearer " + token, ...(opts && opts.headers) }
    });
    if (res.status === 401) {
      await clearToken(); // token hết hạn → lần sau lấy mới
      throw Object.assign(new Error("Phiên đăng nhập Google đã hết hạn"), { unauthorized: true });
    }
    if (!res.ok) throw new Error("Google Drive lỗi " + res.status);
    return res;
  }

  // Scope drive.file chỉ thấy file do chính app tạo → tìm theo tên là đủ.
  // Nhiều file trùng tên (hiếm) → lấy file sửa gần nhất.
  async function getDriveFileInfo(token) {
    const q = "name='" + DRIVE_FILE_NAME + "' and trashed=false";
    const url = "https://www.googleapis.com/drive/v3/files"
      + "?spaces=drive&orderBy=modifiedTime%20desc&fields=files(id,name,size,modifiedTime,webViewLink)"
      + "&q=" + encodeURIComponent(q);
    const data = await (await driveFetch(token, url, { method: "GET" })).json();
    return (data.files && data.files[0]) ? data.files[0] : null;
  }

  async function getDriveEmail(token) {
    try {
      const res = await driveFetch(token, "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { method: "GET" });
      const d = await res.json();
      return (d.user && d.user.emailAddress) || "";
    } catch (e) { return ""; }
  }

  // Tải file về: { fileId, data } (data = null nếu chưa có file).
  async function downloadDrive(token) {
    const info = await getDriveFileInfo(token);
    if (!info) return { fileId: null, data: null };
    const res = await driveFetch(token, "https://www.googleapis.com/drive/v3/files/" + info.id + "?alt=media", { method: "GET" });
    let data = null;
    try { data = JSON.parse(await res.text()); } catch (e) { data = null; }
    return { fileId: info.id, data };
  }

  // Ghi đè file (hoặc tạo mới ở My Drive để người dùng nhìn thấy & tải được).
  // Drive tự giữ lịch sử phiên bản của file → vẫn có đường lùi nếu cần.
  async function uploadDrive(token, fileId, payload) {
    const boundary = "hn_boundary_" + Date.now();
    const metadata = fileId ? {} : { name: DRIVE_FILE_NAME, mimeType: "application/json" };
    const body =
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: application/json\r\n\r\n" +
      JSON.stringify(payload) + "\r\n" +
      "--" + boundary + "--";
    const url = fileId
      ? "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=multipart"
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    await driveFetch(token, url, {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body
    });
  }

  // ======================= DỮ LIỆU CŨ (v1.1) =======================
  // Bản cũ lưu 1 bản sao trong chrome.storage.sync (chia mảnh). Chỉ đọc 1 lần khi
  // cập nhật để không bỏ sót mục nào chỉ còn nằm ở đó.
  async function readLegacySync() {
    try {
      const meta = (await chrome.storage.sync.get("hn_meta")).hn_meta;
      if (!meta || meta.mode !== "sync" || !meta.chunkCount) return null;
      const keys = [];
      for (let i = 0; i < meta.chunkCount; i++) keys.push("hn_chunk_" + i);
      const parts = await chrome.storage.sync.get(keys);
      let json = "";
      for (const k of keys) {
        if (parts[k] == null) return null;
        json += parts[k];
      }
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  root.HNSync = {
    DRIVE_FILE_NAME, FORMAT_VERSION, PROGRESS_FIELDS,
    keyOf, contentKey, normalizeState, mergeStates,
    isDriveConfigured, getAuthToken, clearToken, revokeToken,
    getDriveFileInfo, getDriveEmail, downloadDrive, uploadDrive,
    readLegacySync
  };
})(typeof self !== "undefined" ? self : this);
