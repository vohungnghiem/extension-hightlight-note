// Hằng dùng chung giữa content script, popup và options.
// Trước đây VN_TYPES bị nhân đôi ở content.js + popup.js và bảng màu mặc định
// bị nhân đôi ở content.js (VN_TYPE_COLORS) + options.js (tcDef) → dễ lệch khi
// thêm/sửa loại mục. Gom về một nguồn duy nhất tại đây.
//
// Nạp TRƯỚC các file dùng nó (thứ tự được đảm bảo):
//   - manifest content_scripts.js: ["constants.js", "content.js", ...]
//   - popup.html / options.html: <script src="constants.js"> đặt trước popup.js/options.js
(function (root) {
  // Loại mục (type). vocab = mặc định, giữ nguyên hành vi cũ. Các loại khác biến
  // extension từ "chỉ học từ" thành công cụ tô sáng đa mục đích.
  const VN_TYPES = {
    vocab:     { label: "Từ vựng",    icon: "📚" },
    important: { label: "Quan trọng", icon: "⭐" },
    todo:      { label: "Cần làm",    icon: "✅" },
    question:  { label: "Câu hỏi",    icon: "❓" },
    reference: { label: "Tư liệu",    icon: "📎" }
  };
  // Màu mặc định cho từng loại (ngoài vocab). Đổi được trong Cài đặt (settings.typeColors).
  const VN_TYPE_COLORS = {
    important: "#ff5a5f",
    todo:      "#28c76f",
    question:  "#9b6dff",
    reference: "#00bcd4"
  };
  root.HN_CONST = { VN_TYPES, VN_TYPE_COLORS };
})(typeof self !== "undefined" ? self : this);
