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
            protectMsg.textContent = "✕ Chưa kết nối được. Bạn có thể thử lại trong Cài đặt.";
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
