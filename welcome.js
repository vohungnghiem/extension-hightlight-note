// Áp theme đã lưu (pre-paint đã đặt theo hệ thống; đây là chỉnh lại nếu người
// dùng đã chọn cố định Sáng/Tối trong popup).
try {
  chrome.storage.local.get("settings", ({ settings }) => {
    const t = (settings && settings.theme) || "auto";
    const eff = (t === "light" || t === "dark") ? t
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", eff);
  });
} catch (e) {}

// Nút "Bảo vệ dữ liệu": bật chế độ Drive rồi kết nối Google Drive ngay.
const protectBtn = document.getElementById("protectBtn");
const protectMsg = document.getElementById("protectMsg");
if (protectBtn) {
  protectBtn.addEventListener("click", () => {
    protectBtn.disabled = true;
    protectMsg.textContent = "Đang mở đăng nhập Google…";
    chrome.storage.local.get("settings", ({ settings }) => {
      const next = { ...(settings || {}), syncMode: "drive", syncEnabled: true };
      chrome.storage.local.set({ settings: next }, () => {
        chrome.runtime.sendMessage({ type: "SYNC_CONNECT_DRIVE" }, (r) => {
          protectBtn.disabled = false;
          if (chrome.runtime.lastError || !r || !r.ok) {
            protectMsg.style.color = "#b91c1c";
            const detail = (chrome.runtime.lastError && chrome.runtime.lastError.message)
              || (r && r.error) || "không rõ nguyên nhân";
            protectMsg.textContent = "✕ Chưa kết nối được: " + detail;
          } else {
            protectMsg.style.color = "#15803d";
            protectMsg.textContent = "✓ Đã kết nối Google Drive — dữ liệu của bạn giờ an toàn!";
            protectBtn.textContent = "✓ Đã kết nối Google Drive";
          }
        });
      });
    });
  });
}

// Trang chào mừng: nút "bắt đầu" đóng tab hiện tại.
document.getElementById("closeBtn").addEventListener("click", () => {
  // Đóng tab welcome; nếu không đóng được (vài trình duyệt) thì về trang trống.
  chrome.tabs.getCurrent((tab) => {
    if (tab && tab.id != null) {
      chrome.tabs.remove(tab.id);
    } else {
      window.close();
    }
  });
});
