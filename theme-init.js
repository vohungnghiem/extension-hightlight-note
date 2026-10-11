// Đặt theme TRƯỚC khi trang vẽ để không nháy sáng → tối. Phải là file riêng: script
// inline trong trang extension bị CSP của MV3 chặn (bản trước để inline nên chưa
// từng chạy). Lựa chọn của người dùng (auto/light/dark) được popup/options/welcome
// cache vào localStorage — đọc đồng bộ được, khác chrome.storage (bất đồng bộ).
(function () {
  try {
    var t = localStorage.getItem("hn-theme");
    if (t !== "light" && t !== "dark") {
      t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
