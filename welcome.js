// Áp theme đã lưu (pre-paint đã đặt theo hệ thống; đây là chỉnh lại nếu người
// dùng đã chọn cố định Sáng/Tối trong popup).
try {
  chrome.storage.local.get("settings", ({ settings }) => {
    const t = (settings && settings.theme) || "auto";
    const eff = (t === "light" || t === "dark") ? t
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", eff);
    localStorage.setItem("hn-theme", t);
  });
} catch (e) {}

// Nút "Kết nối Google Drive": đăng nhập + đồng bộ lần đầu (gộp, không ghi đè gì).
const protectBtn = document.getElementById("protectBtn");
const protectMsg = document.getElementById("protectMsg");
if (protectBtn) {
  protectBtn.addEventListener("click", () => {
    protectBtn.disabled = true;
    protectMsg.style.color = "";
    protectMsg.textContent = "Đang mở đăng nhập Google…";
    chrome.runtime.sendMessage({ type: "SYNC_CONNECT" }, (r) => {
      protectBtn.disabled = false;
      if (r && r.ok && r.needConfirm) {
        // Hiếm: Drive có thay đổi đụng tới dữ liệu máy này → xem & xác nhận ở trang Cài đặt.
        protectMsg.style.color = "";
        protectMsg.textContent = "Đã kết nối. Mở Cài đặt → Đồng bộ để xem các thay đổi và xác nhận.";
        chrome.tabs.create({ url: chrome.runtime.getURL("options.html#sync") });
        return;
      }
      if (chrome.runtime.lastError || !r || !r.ok) {
        protectMsg.style.color = "#b91c1c";
        const detail = (chrome.runtime.lastError && chrome.runtime.lastError.message)
          || (r && r.error) || "không rõ nguyên nhân";
        protectMsg.textContent = "✕ Chưa kết nối được: " + detail;
      } else {
        protectMsg.style.color = "#15803d";
        protectMsg.textContent = "✓ Đã kết nối. Trên máy khác, bấm Đồng bộ (biểu tượng ☁ trong popup) để lấy dữ liệu về.";
        protectBtn.textContent = "✓ Đã kết nối Google Drive";
      }
    });
  });
}

// Thử ngay: mở 1 bài viết thật để người dùng bôi đen thử (content script chỉ chạy
// trên trang web, không chạy được trong trang của extension).
document.getElementById("tryBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://en.wikipedia.org/wiki/Serendipity" });
});

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
