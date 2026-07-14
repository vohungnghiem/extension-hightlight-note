const $ = (id) => document.getElementById(id);

// ---------- Theme (áp theo cài đặt đã lưu; mặc định theo hệ thống) ----------
(function initTheme() {
  const resolve = (t) => (t === "light" || t === "dark") ? t
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const apply = () => chrome.storage.local.get("settings", ({ settings }) =>
    document.documentElement.setAttribute("data-theme", resolve((settings && settings.theme) || "auto")));
  apply();
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
      chrome.storage.local.get("settings", ({ settings }) => {
        if (!settings || !settings.theme || settings.theme === "auto") apply();
      }));
  } catch (e) {}
  // Theme có thể đổi từ popup khi trang này đang mở → cập nhật ngay.
  chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.settings) apply(); });
})();

chrome.storage.local.get("settings", ({ settings }) => {
  const s = settings || {};
  $("threshold").value = s.defaultThreshold ?? 20;
  $("cooldown").value = Math.round((s.hoverCooldownMs ?? 300000) / 1000);
  $("color").value = s.highlightColor ?? "#ffeb3b";
  const tcDef = self.HN_CONST.VN_TYPE_COLORS; // dùng chung từ constants.js
  const tc = s.typeColors || {};
  $("colorImportant").value = tc.important || tcDef.important;
  $("colorTodo").value = tc.todo || tcDef.todo;
  $("colorQuestion").value = tc.question || tcDef.question;
  $("colorReference").value = tc.reference || tcDef.reference;
  $("highlightStyle").value = s.highlightStyle ?? "underline";
  $("hlThickness").value = s.highlightThickness ?? 2;
  $("caseSensitive").checked = !!s.caseSensitive;
  $("showReview").checked = s.showReview !== false;
  $("srsReminder").checked = s.srsReminder !== false;
  $("srsNewPerDay").value = s.srsNewPerDay ?? 20;
  $("showToasts").checked = s.showToasts !== false;
  $("previewTranslate").checked = s.previewTranslate !== false;
  $("showSelButton").checked = s.showSelButton !== false;
  $("showSelCopy").checked = s.showSelCopy !== false;
  $("showSelSpeak").checked = s.showSelSpeak !== false;
  $("blacklist").value = (s.blacklistedHosts || []).join("\n");
  $("syncEnabled").checked = s.syncEnabled !== false;
  $("syncMode").value = s.syncMode === "drive" ? "drive" : "auto";
  $("autoBackup").checked = s.autoBackup !== false;
  if (typeof updateSyncModeHint === "function") updateSyncModeHint();
  updateHlPreview();
  updateTypePreviews();
});

// ---------- Xem trước highlight (đồng bộ với màu/kiểu/độ dày đang chọn) ----------
function contrastTextFor(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "#000";
  let h = m[1];
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return ((r * 299 + g * 587 + b * 114) / 1000) >= 140 ? "#000" : "#fff";
}
// Preview trực tiếp cho từng loại: tô mẫu "chữ mẫu" theo màu + kiểu highlight đang chọn,
// và nhuộm icon loại theo đúng màu → đổi màu là thấy ngay (giống preview của Từ vựng).
function updateTypePreviews() {
  const style = $("highlightStyle").value;
  const thick = parseInt($("hlThickness").value) || 2;
  [["important", "colorImportant"], ["todo", "colorTodo"], ["question", "colorQuestion"], ["reference", "colorReference"]].forEach(([t, id]) => {
    const color = $(id).value;
    const pv = document.querySelector(`.tc-preview[data-type="${t}"]`);
    if (pv) {
      pv.style.setProperty("--vocab-color", color);
      pv.style.setProperty("--vocab-text-color", contrastTextFor(color));
      pv.style.setProperty("--vocab-thickness", thick + "px");
      pv.setAttribute("data-vocab-style", style);
    }
    const ico = document.querySelector(`.tc-ico[data-type="${t}"]`);
    if (ico) ico.style.color = color;
  });
}

function updateHlPreview() {
  const color = $("color").value;
  const style = $("highlightStyle").value;
  const thick = parseInt($("hlThickness").value) || 2;
  const pv = $("hlPreview");
  if (pv) {
    pv.style.setProperty("--vocab-color", color);
    pv.style.setProperty("--vocab-text-color", contrastTextFor(color));
    pv.style.setProperty("--vocab-thickness", thick + "px");
    pv.setAttribute("data-vocab-style", style);
  }
  const lbl = $("hlThicknessVal");
  if (lbl) lbl.textContent = thick + "px";
}

// Bật/tắt auto-backup: lưu ngay (độc lập với nút Lưu của khu cài đặt phía trên).
$("autoBackup").addEventListener("change", () => {
  chrome.storage.local.get("settings", ({ settings: cur }) => {
    chrome.storage.local.set({ settings: { ...(cur || {}), autoBackup: $("autoBackup").checked } });
  });
});

// Sao lưu ngay vào máy (ép backup, bỏ qua mốc 7 ngày).
$("backupNowBtn").onclick = () => {
  const btn = $("backupNowBtn");
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = "Đang lưu…";
  chrome.runtime.sendMessage({ type: "AUTO_BACKUP_NOW" }, (r) => {
    btn.disabled = false; btn.textContent = old;
    ioMsg(chrome.runtime.lastError || !r || !r.ok ? "Không lưu được file backup" : "✓ Đã lưu file backup vào thư mục Tải về", !!(r && r.ok));
  });
};

// ---------- Tự động lưu khu cài đặt (Ôn tập, Hiển thị, Domain) ----------
// Chip góc dưới phản hồi: idle "Tự động lưu" → "Đang lưu…" → "Đã lưu ✓".
let autosaveResetTimer = null;
function setAutosaveState(state) {
  const pill = $("autosavePill");
  const ico = $("apIco");
  const txt = $("apText");
  if (!pill) return;
  pill.classList.remove("saving", "saved");
  clearTimeout(autosaveResetTimer);
  if (state === "saving") {
    pill.classList.add("saving");
    ico.textContent = "⟳";
    txt.textContent = "Đang lưu…";
  } else if (state === "saved") {
    pill.classList.add("saved");
    ico.textContent = "✓";
    txt.textContent = "Đã lưu";
    autosaveResetTimer = setTimeout(() => setAutosaveState("idle"), 1600);
  } else {
    ico.textContent = "✓";
    txt.textContent = "Tự động lưu";
  }
}

function saveTopSettings() {
  setAutosaveState("saving");
  chrome.storage.local.get("settings", ({ settings: cur }) => {
    const settings = {
      ...(cur || {}),
      defaultThreshold: Math.max(1, parseInt($("threshold").value) || 20),
      hoverCooldownMs: Math.max(1, parseInt($("cooldown").value) || 300) * 1000,
      highlightColor: $("color").value,
      typeColors: {
        important: $("colorImportant").value,
        todo: $("colorTodo").value,
        question: $("colorQuestion").value,
        reference: $("colorReference").value
      },
      highlightStyle: $("highlightStyle").value,
      highlightThickness: Math.min(5, Math.max(1, parseInt($("hlThickness").value) || 2)),
      caseSensitive: $("caseSensitive").checked,
      showReview: $("showReview").checked,
      srsReminder: $("srsReminder").checked,
      srsNewPerDay: Math.min(500, Math.max(1, parseInt($("srsNewPerDay").value) || 20)),
      showToasts: $("showToasts").checked,
      previewTranslate: $("previewTranslate").checked,
      showSelButton: $("showSelButton").checked,
      showSelCopy: $("showSelCopy").checked,
      showSelSpeak: $("showSelSpeak").checked,
      blacklistedHosts: $("blacklist").value.split("\n").map(s => s.trim()).filter(Boolean)
    };
    chrome.storage.local.set({ settings }, () => setAutosaveState("saved"));
  });
}

// Debounce cho ô gõ (số, textarea) để không lưu mỗi lần gõ phím.
let topSaveTimer = null;
function saveTopSettingsDebounced() {
  setAutosaveState("saving");
  clearTimeout(topSaveTimer);
  topSaveTimer = setTimeout(saveTopSettings, 600);
}

// Checkbox + chọn màu → lưu ngay (thao tác dứt khoát, không cần debounce).
["showReview", "srsReminder", "caseSensitive", "showToasts", "previewTranslate", "showSelButton", "showSelCopy", "showSelSpeak"].forEach(id =>
  $(id).addEventListener("change", saveTopSettings));
$("color").addEventListener("change", saveTopSettings);
$("color").addEventListener("input", () => { updateHlPreview(); saveTopSettingsDebounced(); }); // kéo bảng màu
// Màu theo loại: lưu ngay khi chọn, debounce khi kéo bảng màu.
["colorImportant", "colorTodo", "colorQuestion", "colorReference"].forEach(id => {
  $(id).addEventListener("change", saveTopSettings);
  $(id).addEventListener("input", () => { updateTypePreviews(); saveTopSettingsDebounced(); });
});

// Kiểu highlight → lưu ngay + cập nhật preview (cả vocab lẫn từng loại).
$("highlightStyle").addEventListener("change", () => { updateHlPreview(); updateTypePreviews(); saveTopSettings(); });
// Độ dày → preview live khi kéo, debounce khi lưu, chốt khi thả.
$("hlThickness").addEventListener("input", () => { updateHlPreview(); updateTypePreviews(); saveTopSettingsDebounced(); });
$("hlThickness").addEventListener("change", saveTopSettings);

// Ô số → debounce khi gõ, lưu chốt khi rời ô / Enter.
["threshold", "cooldown", "srsNewPerDay"].forEach(id => {
  $(id).addEventListener("input", saveTopSettingsDebounced);
  $(id).addEventListener("change", saveTopSettings);
});
// Textarea domain → debounce khi gõ, lưu chốt khi rời ô.
$("blacklist").addEventListener("input", saveTopSettingsDebounced);
$("blacklist").addEventListener("blur", saveTopSettings);

// Tải 1 file backup ngay (dùng chung cho nút Export & "xoá hết phòng hờ").
function downloadBackup(words, settings) {
  const data = { version: 1, exportedAt: new Date().toISOString(), words: words || [], settings: settings || {} };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Highlight Note - Tu vung (${new Date().toISOString().slice(0, 10)}).json`;
  a.click();
  URL.revokeObjectURL(url);
}

$("clearBtn").onclick = () => {
  if (!confirm("XOÁ TOÀN BỘ từ vựng? Không thể hoàn tác!")) return;
  if (!confirm("Bạn chắc chắn 100%?")) return;
  chrome.storage.local.get(["words", "settings"], (d) => {
    // Phòng hờ: tự tải 1 file backup trước khi xoá (chỉ khi đang có dữ liệu).
    if ((d.words || []).length > 0) downloadBackup(d.words, d.settings);
    chrome.storage.local.set({ words: [] }, () => {
      alert("Đã xoá hết. (Một file backup phòng hờ đã được tải về thư mục Tải về.)");
    });
  });
};

// Mở lại trang chào mừng / hướng dẫn ghim icon.
$("openWelcomeBtn").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
};

// ---------- Khu Đồng bộ ----------
function fmtBytes(n) {
  if (n < 1024) return n + " B";
  return (n / 1024).toFixed(1) + " KB";
}
function fmtTime(iso) {
  if (!iso) return "Chưa đồng bộ lần nào";
  const d = new Date(iso);
  return "Cập nhật gần nhất: " + d.toLocaleString("vi-VN");
}

function applySyncStatus(s) {
  if (!s) return;

  // 1) Đang lưu ở đâu?
  const whereIco = $("whereIco");
  const whereTitle = $("whereTitle");
  const whereDesc = $("whereDesc");
  if (!s.enabled) {
    whereIco.textContent = "⏸";
    whereTitle.textContent = "Đồng bộ đang TẮT";
    whereDesc.textContent = "Từ vựng chỉ lưu trên máy này. Bật lại bằng ô \"Bật đồng bộ tự động\" ở trên.";
  } else if (s.mode === "drive") {
    whereIco.textContent = "☁";
    whereTitle.textContent = "Đang lưu trên Google Drive của bạn";
    whereDesc.textContent = "Mọi máy đăng nhập Google Drive này sẽ nhận được cùng danh sách từ.";
  } else {
    whereIco.textContent = "🌐";
    whereTitle.textContent = "Đang lưu qua Tài khoản Chrome (miễn phí)";
    whereDesc.textContent = "Các máy đăng nhập cùng tài khoản Chrome này sẽ tự nhận từ vựng của bạn.";
  }

  // Tô màu cả bảng theo mức an toàn: xanh (Drive đã nối) / vàng (chỉ Chrome) / xám (tắt).
  const box = $("syncStatusBox");
  if (box) {
    box.classList.remove("safe", "warn-state", "off-state");
    if (!s.enabled) box.classList.add("off-state");
    else if (s.driveConnected) box.classList.add("safe");
    else box.classList.add("warn-state");
  }

  // 2) Google Drive đã kết nối chưa?
  const dot = $("driveDot");
  const driveTitle = $("driveTitle");
  const driveDesc = $("driveDesc");
  const connectBtn = $("connectDriveBtn");
  dot.className = "dot";
  if (!s.driveConfigured) {
    dot.classList.add("off");
    driveTitle.textContent = "Google Drive: chưa thiết lập";
    driveDesc.textContent = "Tính năng Drive chưa được cấu hình. Bạn vẫn đang đồng bộ miễn phí qua Tài khoản Chrome.";
    connectBtn.style.display = "none";
  } else if (s.driveConnected) {
    dot.classList.add("on");
    driveTitle.textContent = "Google Drive: ĐÃ kết nối ✓";
    driveDesc.textContent = s.driveEmail ? ("Tài khoản: " + s.driveEmail) : "Sẵn sàng lưu lên Drive.";
    connectBtn.style.display = "";
    connectBtn.textContent = "↻ Kết nối lại Drive";
    connectBtn.classList.remove("cta-primary");
    $("disconnectDriveBtn").style.display = "";
    $("openDriveBtn").style.display = "";
  } else {
    dot.classList.add(s.needsDriveAuth ? "warn" : "off");
    driveTitle.textContent = "Google Drive: CHƯA kết nối";
    driveDesc.textContent = "Bấm \"Kết nối Google Drive\" và đăng nhập để dùng Drive.";
    connectBtn.style.display = "";
    connectBtn.textContent = "☁ Kết nối Google Drive";
    connectBtn.classList.add("cta-primary");
    $("disconnectDriveBtn").style.display = "none";
    $("openDriveBtn").style.display = "none";
  }
  if (!s.driveConfigured) {
    $("disconnectDriveBtn").style.display = "none";
    $("openDriveBtn").style.display = "none";
  }

  // 3) Dung lượng (chỉ ý nghĩa khi lưu qua Tài khoản Chrome) — ẩn khi đang dùng Drive.
  const usageLine = $("usageLine");
  if (usageLine) usageLine.style.display = (s.mode === "drive") ? "none" : "";
  const pct = Math.min(100, Math.round((s.bytesInUse / s.quota) * 100));
  const meter = $("syncMeter");
  meter.className = "meter" + (pct >= 90 ? " full" : pct >= 70 ? " warn" : "");
  meter.firstElementChild.style.width = pct + "%";
  $("syncUsage").textContent =
    `Đã dùng ${fmtBytes(s.bytesInUse)} / ${fmtBytes(s.quota)} (${pct}%). Dữ liệu của bạn hiện ~${fmtBytes(s.estimatedSize)}.`;

  // 4) Thời điểm + cảnh báo
  $("syncTime").textContent = "🕒 " + fmtTime(s.lastUpdatedAt);

  const warn = $("syncWarn");
  if (s.lastPushError) {
    // Lỗi cụ thể (vd 403 sai scope) — hiện thẳng để dễ chẩn đoán.
    warn.style.display = "";
    warn.textContent = "⚠ " + s.lastPushError;
  } else if (s.needsDriveAuth) {
    warn.style.display = "";
    warn.textContent = s.driveConfigured
      ? "⚠ Cần kết nối Google Drive để tiếp tục đồng bộ (dữ liệu đã vượt giới hạn Tài khoản Chrome, hoặc bạn chọn lưu Drive)."
      : "⚠ Dữ liệu đã vượt giới hạn Tài khoản Chrome. Cần thiết lập Google Drive để lưu thêm.";
  } else {
    warn.style.display = "none";
  }
}

function refreshSyncStatus() {
  chrome.runtime.sendMessage({ type: "SYNC_STATUS" }, (s) => {
    if (chrome.runtime.lastError) return;
    applySyncStatus(s);
  });
}

$("syncNowBtn").onclick = () => {
  $("syncNowBtn").disabled = true;
  $("syncNowBtn").textContent = "⏳ Đang đồng bộ…";
  chrome.runtime.sendMessage({ type: "SYNC_NOW" }, (res) => {
    $("syncNowBtn").disabled = false;
    $("syncNowBtn").textContent = "🔄 Đồng bộ ngay";
    if (chrome.runtime.lastError) return;
    if (res && res.ok) applySyncStatus(res.status);
    else if (res) alert("Lỗi đồng bộ: " + res.error);
  });
};

$("connectDriveBtn").onclick = () => {
  $("connectDriveBtn").disabled = true;
  chrome.runtime.sendMessage({ type: "SYNC_CONNECT_DRIVE" }, (res) => {
    $("connectDriveBtn").disabled = false;
    if (chrome.runtime.lastError) return;
    if (res && res.ok) { applySyncStatus(res.status); alert("Đã kết nối Google Drive ✓"); }
    else if (res) alert("Không kết nối được Drive: " + res.error);
  });
};

$("disconnectDriveBtn").onclick = () => {
  if (!confirm("Ngắt kết nối Google Drive?\n\nFile trên Drive vẫn còn, nhưng extension sẽ ngừng đẩy lên Drive và quay về đồng bộ qua Tài khoản Chrome.")) return;
  $("disconnectDriveBtn").disabled = true;
  chrome.runtime.sendMessage({ type: "SYNC_DISCONNECT_DRIVE" }, (res) => {
    $("disconnectDriveBtn").disabled = false;
    if (chrome.runtime.lastError) return;
    if (res && res.ok) {
      $("syncMode").value = "auto";
      applySyncStatus(res.status);
      alert("Đã ngắt kết nối Drive.");
    } else if (res) alert("Lỗi: " + res.error);
  });
};

$("openDriveBtn").onclick = () => {
  chrome.runtime.sendMessage({ type: "SYNC_GET_DRIVE_LINK" }, (res) => {
    if (chrome.runtime.lastError) { alert("Không lấy được link."); return; }
    if (res && res.ok && res.info && res.info.webViewLink) {
      window.open(res.info.webViewLink, "_blank");
    } else if (res && res.ok && !res.info) {
      alert("Chưa có file trên Drive. Bấm \"🔄 Đồng bộ ngay\" để tạo file, rồi thử lại.");
    } else {
      alert("Lỗi: " + (res ? res.error : "không rõ"));
    }
  });
};

// Khu Đồng bộ tự lưu ngay (không phụ thuộc nút "Lưu cài đặt").
function patchSettings(patch, cb) {
  chrome.storage.local.get("settings", ({ settings }) => {
    const s = { ...(settings || {}), ...patch };
    chrome.storage.local.set({ settings: s }, cb || (() => {}));
  });
}
$("syncEnabled").addEventListener("change", () => {
  patchSettings({ syncEnabled: $("syncEnabled").checked }, refreshSyncStatus);
});
function updateSyncModeHint() {
  const el = $("syncModeHint");
  if (!el) return;
  el.textContent = $("syncMode").value === "drive"
    ? "Luôn lưu thẳng vào Google Drive của bạn — an toàn nhất, còn nguyên cả khi gỡ extension."
    : "Tự động: lưu qua Tài khoản Chrome, khi đầy thì tự chuyển sang Google Drive.";
}
updateSyncModeHint();
$("syncMode").addEventListener("change", () => {
  updateSyncModeHint();
  const mode = $("syncMode").value === "drive" ? "drive" : "auto";
  patchSettings({ syncMode: mode }, () => {
    refreshSyncStatus();
    // Ép đồng bộ lại theo chế độ vừa chọn.
    chrome.runtime.sendMessage({ type: "SYNC_NOW" }, (res) => {
      if (!chrome.runtime.lastError && res && res.ok) applySyncStatus(res.status);
    });
  });
});

refreshSyncStatus();

// ---------- Sao lưu & khôi phục JSON (chạy trong tab Cài đặt nên ổn định trên Linux) ----------
function ioMsg(text, ok) {
  const el = $("ioStatus");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
  if (ok) setTimeout(() => { el.textContent = ""; }, 4000);
}
function ioNewId() { return "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }
function ioDetectLang(s) { return /[぀-ゟ゠-ヿ一-鿿]/.test(s) ? "ja" : "en"; }

$("exportBtn").onclick = () => {
  chrome.storage.local.get(["words", "settings"], (d) => {
    downloadBackup(d.words, d.settings);
    const settings = { ...(d.settings || {}), lastExportAt: new Date().toISOString() };
    chrome.storage.local.set({ settings });
    ioMsg("✓ Đã xuất file", true);
  });
};

$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (err) {
      ioMsg("Lỗi đọc file: " + err.message, false);
      e.target.value = "";
      return;
    }
    if (!Array.isArray(data.words)) {
      ioMsg("File không hợp lệ (thiếu danh sách từ)", false);
      e.target.value = "";
      return;
    }
    const replace = confirm(
      `Tìm thấy ${data.words.length} từ trong file.\n\n` +
      `• OK = THAY THẾ toàn bộ (xoá dữ liệu hiện tại)\n` +
      `• Cancel = GỘP vào dữ liệu hiện tại (giữ counter lớn nhất)`
    );

    chrome.storage.local.get(["words", "settings"], (d) => {
      let words = d.words || [];
      let settings = d.settings || {};
      const norm = (w) => ({
        id: w.id || ioNewId(),
        term: w.term,
        lang: w.lang || ioDetectLang(w.term),
        type: w.type || "vocab",
        tags: (Array.isArray(w.tags) && w.tags.length) ? w.tags : undefined,
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

      if (replace) {
        words = data.words.map(norm);
      } else {
        const byTerm = new Map(words.filter(w => !w.sticky).map(w => [w.term.toLowerCase(), w]));
        const ids = new Set(words.map(w => w.id));
        for (const w of data.words) {
          // Sticky note gắn theo URL → không gộp theo tên; thêm mới nếu chưa có id.
          if (w.sticky) { if (!ids.has(w.id)) words.push(norm(w)); continue; }
          const k = (w.term || "").toLowerCase();
          if (byTerm.has(k)) {
            const ex = byTerm.get(k);
            ex.hoverCount = Math.max(ex.hoverCount || 0, w.hoverCount || 0);
            if (!ex.meaning && w.meaning) ex.meaning = w.meaning;
            if (!ex.note && w.note) ex.note = w.note;
            if (Array.isArray(w.tags) && w.tags.length) {
              const set = new Set([...(ex.tags || []), ...w.tags].map(s => String(s).trim()).filter(Boolean));
              ex.tags = [...set];
            }
          } else {
            words.push(norm(w));
          }
        }
      }
      if (data.settings) settings = { ...settings, ...data.settings };

      chrome.storage.local.set({ words, settings }, () => {
        ioMsg(`✓ Import xong — ${words.length} từ`, true);
        refreshSyncStatus();
      });
    });
    e.target.value = "";
  };
  reader.readAsText(file);
};
