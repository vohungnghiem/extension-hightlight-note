<div align="center">

<img src="icons/icon128.png" width="96" alt="Highlight Note">

# Highlight Note

**Tô sáng — Ghi chú — Dịch & ghi nhớ từ/cụm từ ngay trên trang bạn đang đọc.**

Chrome extension giúp bạn **tô sáng (highlight) và ghi chú** những từ, cụm từ
quan trọng trên mọi trang web — extension tự highlight lại mỗi khi gặp,
tự dịch sang tiếng Việt, và đếm số lần bạn hover để biết khi nào đã thật sự nhớ.
Hỗ trợ **đa ngôn ngữ**, dữ liệu lưu **cục bộ**, không theo dõi.

![manifest](https://img.shields.io/badge/manifest-v3-blue) ![license](https://img.shields.io/badge/license-personal-lightgrey) ![status](https://img.shields.io/badge/status-active-success)

</div>

---

## Tính năng

| | |
|---|---|
| 🏷️ **Đa loại mục** | Không chỉ học từ — mỗi mục có **loại** riêng, màu riêng: 📚 Từ vựng · ⭐ Quan trọng · ✅ Cần làm · ❓ Câu hỏi · 📎 Tư liệu. Biến extension thành công cụ tô sáng đa mục đích cho công việc & nghiên cứu. Chọn loại ngay khi lưu (mini-card / popup), lọc danh sách theo loại. Dữ liệu cũ tự nhận là "Từ vựng" — không phá vỡ gì. |
| 📌 **Neo đoạn văn theo trang** | Bôi đen **cả câu/đoạn dài** để ghi nhớ → extension lưu URL + ngữ cảnh và **tự tô sáng lại đúng đoạn đó mỗi khi bạn mở lại trang** (dù đoạn trải nhiều thẻ/nhiều dòng). Popup có link 🔗 **nguồn** để nhảy về đúng trang. Cực hợp đọc tài liệu / nghiên cứu. (Từ/cụm ngắn vẫn tô ở mọi trang như cũ.) |
| 🟡 **Auto-highlight** | Mọi từ trong danh sách được tô màu ngay trên trang web đang đọc, không cần thao tác gì thêm |
| 💾 **Lưu nhanh** | Bôi đen từ → `Alt+Shift+H` (hoặc chuột phải) → mini-card hiện ngay sát từ, tự dịch sang tiếng Việt |
| 🔤 **Phiên âm IPA** | Tự lấy phiên âm cho từ tiếng Anh qua `dictionaryapi.dev` (miễn phí) |
| 🌐 **Auto-translate** | Dịch tự động qua Google Translate (tự nhận ngôn ngữ nguồn: Anh, Pháp, Đức, Nhật…), bạn chỉ cần click **Lưu** |
| 🌗 **Giao diện Sáng / Tối** | Tự đổi theo hệ thống; có nút chuyển tay 🌙/☀️ ngay trong popup |
| 📊 **Progress** | Mỗi từ có thanh tiến độ riêng: gặp (hover) đủ ngưỡng → tự đánh dấu **đã thuộc** & ngừng tô sáng (không xoá dữ liệu) |
| 🔁 **Ôn tập giãn cách (SRS)** | Lịch ôn tự giãn (1→3→7→14… ngày) theo mức nhớ; badge số từ **cần ôn hôm nay** trên icon + thanh nhắc trong popup; buổi ôn flashcard chấm điểm Quên/Nhớ/Dễ |
| 📋 **Bulk add** | Dán cả danh sách `word - nghĩa - ghi chú`, mỗi dòng một từ |
| 🚫 **Per-site blacklist** | Tắt highlight ở những site bạn không muốn (Gmail, dashboard nội bộ, ...) |
| ⬇⬆ **Backup JSON** | Export/Import toàn bộ từ vựng + settings, nhắc backup sau 7 ngày |
| 📝 **Xuất Markdown** | Xuất toàn bộ mục ra file `.md` (nhóm theo loại; To-do thành checkbox `- [ ]`) — đưa thẳng vào Obsidian / Notion / ghi chú công việc |
| 🇯🇵 **Hỗ trợ tiếng Nhật** | Tự nhận kana/kanji, link sang Jisho thay vì Cambridge |

## Cài đặt

1. Tải/clone repo về máy
2. Mở `chrome://extensions` → bật **Developer mode**
3. **Load unpacked** → chọn thư mục dự án
4. Pin icon Highlight Note lên thanh toolbar

## Cách dùng

### Thêm từ
- **Đang đọc web** → bôi đen từ → `Alt+Shift+H` → mini-card xuất hiện cạnh từ, tự dịch + phiên âm → bấm **Lưu**
- **Click icon** → form `+ Thêm` để nhập thủ công
- **Bulk** → dán nhiều dòng cùng lúc

### Phím tắt mặc định

| Phím | Hành động |
|---|---|
| `Alt + Shift + H` | Lưu từ đang bôi đen |
| `Ctrl + Shift + Y` | Mở popup Highlight Note |

Đổi phím tắt tại `chrome://extensions/shortcuts`.

### Hover counter
Mỗi lần rê chuột vào từ được highlight, counter tăng (mặc định cooldown 5 phút để mỗi lần gặp mới được tính 1 lần). Thanh progress trong tooltip cho biết bạn đã gặp từ này bao nhiêu lần. **Khi đạt ngưỡng (mặc định 20), extension tự đánh dấu từ là "đã thuộc" và ngừng tô sáng** — dữ liệu KHÔNG bị xoá, từ vẫn nằm trong danh sách và bạn có thể bỏ đánh dấu bất cứ lúc nào. Đổi ngưỡng / cooldown trong **Cài đặt**.

## Workaround IME tiếng Việt (Linux)

Chrome action-popup có bug với fcitx5/ibus trên Linux: không gõ được tiếng Việt.

Extension tự xử như sau — bạn không cần làm gì:
- Click icon → popup chuẩn (xem danh sách, search, toggle)
- Click vào ô cần gõ TV (Nghĩa / Ghi chú / Bulk / nút Sửa) → popup tự đóng, **cửa sổ riêng** mở ra ngay đúng ô đó
- Sau khi bấm **Lưu** → cửa sổ riêng tự đóng

Không bao giờ có window mồ côi.

## Cấu trúc dự án

```
highlight-note/
├── manifest.json          # MV3 config
├── background.js          # service worker: context menu, commands, popup window
├── content.js             # highlight DOM, tooltip, mini-card, hover counter
├── content.css            # styles cho highlight + tooltip + mini-card
├── popup.html / .js / .css   # giao diện quản lý
├── options.html / .js     # cài đặt (threshold, màu, blacklist...)
└── icons/                 # icon 16/48/128
```

## Stack

Pure vanilla — không framework, không bundler, không dependency.

- Chrome Extension Manifest V3
- `chrome.storage.local` để lưu data
- `MutationObserver` cho SPA
- `dictionaryapi.dev` (IPA) + `translate.googleapis.com` (dịch)
- `SpeechSynthesisUtterance` cho phát âm

## Đồng bộ tài khoản (miễn phí)

Dữ liệu đồng bộ giữa các máy theo cơ chế **lai, tự nâng cấp**:

1. **Mặc định — Storage Sync (0 cấu hình):** từ vựng tự đồng bộ qua tài khoản Chrome
   giữa các máy đã đăng nhập cùng tài khoản Google. Miễn phí, không cần đăng nhập gì thêm.
   Giới hạn ~100KB.
2. **Khi vượt ~100KB — Google Drive:** tự đẩy toàn bộ vào 1 file
   `Highlight Note - Tu vung.json` trong Google Drive của chính bạn (bạn nhìn thấy &
   tải được). Quyền `drive.file` nên extension chỉ truy cập đúng file nó tạo,
   không đọc file khác của bạn. Miễn phí, dung lượng lớn.
3. **Import/Export JSON thủ công** vẫn dùng song song để backup nhanh / chuyển máy offline.

Bật/tắt và xem trạng thái trong **Cài đặt → Đồng bộ tài khoản**. Chỉ báo nhỏ ở góc popup:
`⟳` = Sync, `☁` = Drive, `⚠` = cần kết nối Drive.

### Cấu hình Google Drive (chỉ làm 1 lần, nếu cần Tier 2)

Tier 1 chạy ngay không cần gì. Để bật Tier 2 (Drive):

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project.
2. Bật **Google Drive API** (APIs & Services → Library).
3. APIs & Services → Credentials → **Create OAuth client ID** → loại **Chrome Extension**,
   dán **Extension ID** của bạn (xem ở `chrome://extensions`).
4. Để Extension ID cố định: thêm field `"key"` vào `manifest.json` (hoặc publish lên Web Store).
5. Dán Client ID vào `manifest.json` → `oauth2.client_id`
   (đang để placeholder `<DÁN_OAUTH_CLIENT_ID_CỦA_BẠN>.apps.googleusercontent.com`).
6. Reload extension → vào Cài đặt → **Kết nối Google Drive**.

> Nếu để nguyên placeholder, nút Drive tự ẩn và chỉ Tier 1 hoạt động — không lỗi.

## Lưu ý privacy

- Tất cả từ vựng lưu **cục bộ** trong `chrome.storage.local`, không gửi đi đâu
- Đoạn văn được **neo theo trang** có lưu kèm **URL trang nguồn** (để tô sáng lại đúng chỗ) — vẫn nằm cục bộ, chỉ rời máy nếu chính bạn bật đồng bộ / export
- Khi nào gọi mạng:
  - **Lưu từ mới** → dịch (Google Translate) + lấy phiên âm IPA (dictionaryapi.dev)
  - **Dịch nhanh khi bôi đen** (xem trước trên nút Lưu) → gửi đoạn đang chọn lên Google Translate. Tính năng này **bật sẵn** nhưng có thể **tắt** trong *Cài đặt → Dịch nhanh khi bôi đen*; tắt thì chỉ dịch sau khi bạn bấm Lưu.
  - **Click icon từ điển / dịch trong tooltip** → mở trang tra cứu
- Endpoint dùng: `translate.googleapis.com`, `api.dictionaryapi.dev`, `jisho.org`, `dictionary.cambridge.org` — đều là API/site public, không cần key, không tracking

## Tác giả

**Võ Hùng Nghiêm** — Developer. Tự dùng, tự build, tự sửa khi bug.

Đóng góp / báo lỗi: mở issue hoặc PR.

---

<div align="center">
<sub>Made with ☕ — vì học tiếng Anh kiểu chép từ vở thì chán quá.</sub>
</div>
