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

## Có gì mới ở v1.2.1

- **Sau khi cập nhật, hỏi có muốn khôi phục cài đặt gốc** — chỉ khi thật sự có cài đặt khác mặc định, mỗi phiên bản 1 lần, trong popup (không bật tab). Hộp thoại chọn từng mục: mặc định đã đổi mà bạn chưa chỉnh được chọn sẵn, tính năng chính đang tắt được nhắc "có thể bạn đã quên", thứ bạn tự chỉnh thì giữ. Có Hoàn tác. Xem lại bất cứ lúc nào: Cài đặt → Chung.

- **Cài đặt dễ tìm hơn:** rê chuột vào thanh nổi → bấm **⋯** để *tắt trên trang này*, *tắt thanh*, *đổi ngôn ngữ dịch* ngay tại chỗ; thẻ Dịch có nút bánh răng mở đúng mục Ngôn ngữ. Trang Cài đặt có **ô tìm kiếm** (gõ không dấu được: "mau" → "màu"; phím `/`), **dấu chấm** cạnh cài đặt đã đổi, **Khôi phục mặc định** cho từng mục, công tắc tổng, mục **Ngôn ngữ** đặt lên đầu.
- **Giao diện tiếng Anh** (mặc định vẫn tiếng Việt cho người Việt — kể cả khi dùng Chrome tiếng Anh, nhờ nhận múi giờ Việt Nam). Chọn trong Cài đặt → Ngôn ngữ giao diện.
- **"Ngôn ngữ của bạn"** thay cho "chữ Việt" cứng trong code: người Nhật, Đức… dùng cũng đúng (chữ nước ngoài → ngôn ngữ của bạn; chữ của bạn → ngôn ngữ bạn chọn). Thêm Bồ Đào Nha, Ý, Indonesia, Hindi, Ả Rập, Thổ Nhĩ Kỳ.
- **Gợi ý thông minh, hỏi 1 lần:** thanh nổi hiện 15 lần liền mà không bấm → hỏi có muốn tắt; đã lưu 8 từ vựng → gợi ý bật Chế độ học từ.
- **Sửa lỗi:** tắt tô sáng ở popup / "Tắt ở đây" không gỡ tô sáng trên tab đang mở; trang Cài đặt đang mở ghi đè thay đổi làm ở thẻ Dịch / popup; "Gộp vào" khi nhập backup âm thầm ghi đè cài đặt (kể cả tắt luôn tiện ích); đổi ngưỡng "đã thuộc" không áp dụng cho từ đã lưu; "khách hàng", "có", "là" không được nhận là chữ Việt; nút giao diện popup không quay về "Tự động" được; "phân biệt hoa/thường" phải tải lại trang mới có tác dụng.
- **Kiểm thử tự động:** `tests/` — e2e với extension thật (2 lượt: trình duyệt Việt / Anh) + kiểm câu chưa dịch.

## Có gì mới ở v1.2

- **Tách Dịch và Lưu:** thanh nổi khi bôi đen có 2 nút rõ ràng — **Dịch** (chỉ xem bản dịch, đọc được cả đoạn dài) và **Lưu** (lưu & tô sáng). Đoạn dài khi lưu được coi là ý cần nhớ (loại *Quan trọng*, ô *Ghi chú*), không bị nhồi vào "Từ vựng".
- **Lưu nhanh hơn:** bôi đen → bấm **Lưu** → thẻ mở sẵn bản dịch trong ô sửa được, chỉ cần nhấn `Enter`. Ghi chú/tag ẩn sau nút "＋", lỡ tay bấm ra ngoài không mất chữ đang gõ. Lưu xong có nút **Hoàn tác**.
- **Popup gọn lại:** bỏ dải thống kê + 2 ô chọn, thay bằng hàng chip lọc có số đếm, thêm lọc **Trang này** (các mục đang hiện trên tab đang xem). Nút thao tác chỉ hiện khi rê chuột vào mục; các chức năng ít dùng gom vào menu **⋯**.
- **Thêm mục trong popup tự dịch** khi đang gõ (trước đây ô Nghĩa ghi "tự dịch" nhưng không dịch).
- **Xoá không hỏi lại, có Hoàn tác.** Ôn tập dùng phím `Space` / `1` `2` `3`, mỗi nút hiện trước lịch ôn kế tiếp.
- **Đồng bộ làm lại từ đầu:** bỏ tự đồng bộ ngầm (nguyên nhân mất dữ liệu), thay bằng nút **Đồng bộ** gộp từng mục qua Google Drive; lần nào sắp sửa/xoá mục trên máy thì hỏi trước — xem mục *Đồng bộ giữa các máy*.
- **Trang Cài đặt làm lại:** menu bên trái, mỗi lần một nhóm, công tắc bật/tắt rõ ràng, xem trước tô sáng cả 5 loại, quản lý trang bị tắt dạng thẻ.
- **Sửa lỗi:** chữ có dấu (tiếng Việt, Pháp…) ở đầu/cuối từ không được tô sáng; lịch ôn chỉ lưu thẻ đầu tiên của mỗi buổi; badge đếm cả mục không phải từ vựng; Import làm mất trạng thái "tạm ẩn" và lịch ôn; nút Quét lại/Ghi chú làm hỏng content script; giao diện tối bị nháy sáng khi mở; tab mở trước khi cài không nhận phím tắt (giờ tự kích hoạt trên các tab đang mở).
- Không chen thanh "Lưu" khi bạn đang gõ trong ô soạn thảo (Gmail, Notion…); không tô sáng bên trong SVG, sticky note hay UI của extension.

## Tính năng

| | |
|---|---|
| 🏷️ **Đa loại mục** | Không chỉ học từ — mỗi mục có **loại** riêng, màu riêng: 📚 Từ vựng · ⭐ Quan trọng · ✅ Cần làm · ❓ Câu hỏi · 📎 Tư liệu. Biến extension thành công cụ tô sáng đa mục đích cho công việc & nghiên cứu. Chọn loại ngay khi lưu (mini-card / popup), lọc danh sách theo loại. Dữ liệu cũ tự nhận là "Từ vựng" — không phá vỡ gì. |
| 📌 **Neo đoạn văn theo trang** | Bôi đen **cả câu/đoạn dài** để ghi nhớ → extension lưu URL + ngữ cảnh và **tự tô sáng lại đúng đoạn đó mỗi khi bạn mở lại trang** (dù đoạn trải nhiều thẻ/nhiều dòng). Popup có link 🔗 **nguồn** để nhảy về đúng trang. Cực hợp đọc tài liệu / nghiên cứu. (Từ/cụm ngắn vẫn tô ở mọi trang như cũ.) |
| 🟡 **Auto-highlight** | Mọi từ trong danh sách được tô màu ngay trên trang web đang đọc, không cần thao tác gì thêm |
| 🌐 **Dịch nhanh** | Bôi đen → bấm **Dịch** (hoặc `Alt+Shift+D` / chuột phải) → thẻ bản dịch dễ đọc, kể cả đoạn dài; chữ Việt thì dịch sang tiếng Anh. Chỉ xem, không lưu gì |
| 💾 **Lưu nhanh** | Bôi đen → bấm **Lưu** (hoặc `Alt+Shift+H` / chuột phải) → thẻ hiện sát chữ. Từ ngắn: nghĩa điền sẵn → `Enter`. Đoạn dài: tự chọn loại *Quan trọng*, ô *Ghi chú* để trống (có nút thêm bản dịch) |
| 🔤 **Phiên âm IPA** | Tự lấy phiên âm cho từ tiếng Anh qua `dictionaryapi.dev` (miễn phí) |
| 🌐 **Auto-translate** | Dịch tự động qua Google Translate (tự nhận ngôn ngữ nguồn: Anh, Pháp, Đức, Nhật…), bạn chỉ cần click **Lưu** |
| 🌗 **Giao diện Sáng / Tối** | Tự đổi theo hệ thống; có nút chuyển tay 🌙/☀️ ngay trong popup |
| 📊 **Progress** | (Chế độ học từ) Mỗi từ có thanh tiến độ riêng: gặp (hover) đủ ngưỡng → tự đánh dấu **đã thuộc** & ngừng tô sáng (không xoá dữ liệu) |
| 🔁 **Chế độ học từ (tuỳ chọn)** | **Tắt mặc định** — bật ở popup → ⋯ hoặc Cài đặt → Ôn tập. Khi bật: ôn tập flashcard giãn cách (1→3→7→14… ngày, phím `Space` `1` `2` `3`), nhắc từ đến hạn (số trên icon + 1 dòng trong popup, ẩn được trong ngày), tiến độ số lần gặp, tự đánh dấu đã thuộc. Khi tắt: im hẳn, không còn gì trong số đó |
| 📋 **Bulk add** | Dán cả danh sách `word - nghĩa - ghi chú`, mỗi dòng một từ |
| 📑 **Side Panel** | Mở toàn bộ giao diện quản lý ở **bảng cạnh trang** (nút ⧉ trong popup hoặc `Alt+Shift+S`): panel đứng yên khi bạn đọc/cuộn, kéo rộng hẹp tuỳ ý và nhập liệu ổn định — thay hẳn workaround cửa sổ riêng trên Linux (IME fcitx5/ibus). |
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
- **Đang đọc web** → bôi đen từ → bấm **Lưu** nổi cạnh chữ (hoặc `Alt+Shift+H`) → thẻ xuất hiện cạnh từ, tự dịch + phiên âm → nhấn `Enter`
- **Click icon** → **＋ Thêm mục** để nhập thủ công (nghĩa tự dịch khi bạn gõ), `Ctrl+Enter` để thêm
- **Nhiều dòng** → menu **⋯** → *Thêm nhiều dòng cùng lúc* (dán từ Excel/Sheets cũng được)

### Trong popup
- Gõ ngay để tìm (hoặc `/`), `#tag` để lọc theo tag
- Chip **Trang này** = các mục đang được tô trên tab bạn đang xem
- Rê chuột vào mục để hiện nút: đã thuộc · tạm ẩn · sửa · xoá (xoá có **Hoàn tác**)
- **Ôn tập:** `Space` lật thẻ, `1` Quên · `2` Nhớ · `3` Dễ

### Phím tắt mặc định

| Phím | Hành động |
|---|---|
| `Alt + Shift + H` | Lưu & tô sáng chữ đang bôi đen |
| `Alt + Shift + D` | Dịch chữ đang bôi đen (chỉ xem) |
| `Alt + Shift + S` | Mở Side Panel (bảng quản lý cạnh trang) |
| `Ctrl + Shift + Y` | Mở popup Highlight Note |

Đổi phím tắt tại `chrome://extensions/shortcuts`.

### Hover counter
Mỗi lần rê chuột vào từ được highlight, counter tăng (mặc định cooldown 5 phút để mỗi lần gặp mới được tính 1 lần). Thanh progress trong tooltip cho biết bạn đã gặp từ này bao nhiêu lần. **Khi đạt ngưỡng (mặc định 20), extension tự đánh dấu từ là "đã thuộc" và ngừng tô sáng** — dữ liệu KHÔNG bị xoá, từ vẫn nằm trong danh sách và bạn có thể bỏ đánh dấu bất cứ lúc nào. Đổi ngưỡng / cooldown trong **Cài đặt**.

## Gõ tiếng Việt trên Linux (fcitx5/ibus)

Popup của Chrome trên Linux có bug với bộ gõ fcitx5/ibus: không gõ được tiếng Việt.
Dùng **Side Panel** (nút ▣ ở chân popup, `Alt+Shift+S`, hoặc chuột phải vào icon →
*Mở Highlight Note ở Side Panel*): đây là trang thật nên gõ tiếng Việt bình thường,
và bảng đứng yên cạnh trang khi bạn đọc. Thẻ lưu nhanh ngay trên trang web cũng gõ được.

## Cấu trúc dự án

```
highlight-note/
├── manifest.json          # MV3 config
├── background.js          # service worker: context menu, phím tắt, đồng bộ, badge, tiêm content script
├── sync.js                # đồng bộ Google Drive: gộp từng mục (hàm thuần mergeStates) + gọi API
├── constants.js           # loại mục, màu mặc định, nhận diện ngôn ngữ, "ngôn ngữ của bạn", phát âm (dùng chung)
├── i18n.js / i18n-en.js   # dịch giao diện: câu tiếng Việt là khoá, bảng tiếng Anh (xem docs/NOTES.md)
├── _locales/              # chỉ tên / mô tả / phím tắt trong manifest (Chrome bắt buộc)
├── content.js / .css      # tô sáng DOM, tooltip, thẻ lưu nhanh, sticky note, đếm lần gặp
├── popup.html / .js / .css   # giao diện quản lý (dùng chung cho Side Panel)
├── sidepanel.html         # nhúng popup vào Side Panel
├── options.html / .js     # cài đặt
├── welcome.html / .js     # trang chào mừng lần cài đầu
├── theme-init.js          # đặt theme sáng/tối trước khi vẽ (chống nháy)
├── icons/                 # icon 16/48/128
└── tests/                 # e2e (Playwright + extension thật), kiểm câu chưa dịch — KHÔNG đóng gói
```

### Chạy kiểm thử

```bash
cd tests && npm i && npx playwright-core install chromium   # lần đầu
# Lưu ý: khi còn tests/node_modules, Chrome KHÔNG nạp được thư mục này bằng "Tải tiện ích đã giải nén"
# (file tên bắt đầu bằng "_"). Chạy test xong thì xoá tests/node_modules, hoặc nạp bản zip.
node e2e/run.js          # ~3 phút, 2 lượt: trình duyệt tiếng Việt + tiếng Anh; ảnh ở tests/e2e/shots/
node i18n-missing.js     # liệt kê câu giao diện chưa có trong i18n-en.js
```

## Stack

Pure vanilla — không framework, không bundler, không dependency.

- Chrome Extension Manifest V3
- `chrome.storage.local` để lưu data
- `MutationObserver` cho SPA
- `dictionaryapi.dev` (IPA) + `translate.googleapis.com` (dịch)
- `SpeechSynthesisUtterance` cho phát âm

## Đồng bộ giữa các máy (Google Drive, bấm khi cần)

Đơn giản: **Cài đặt → Đồng bộ → Kết nối Google Drive** một lần, sau đó bấm nút ☁ trên
popup (hoặc **Đồng bộ ngay** trong Cài đặt) mỗi khi muốn đồng bộ. Không có gì chạy ngầm.

Dữ liệu nằm trong 1 file `Highlight Note - Tu vung.json` trên Google Drive của chính bạn
(quyền `drive.file`: extension chỉ thấy đúng file nó tạo). Mỗi lần đồng bộ, hai bên được
**gộp từng mục** — không bao giờ thay nguyên cả danh sách:

- Mục mới thêm ở máy nào cũng được giữ.
- Mục sửa ở cả 2 máy → giữ bản sửa sau cùng. Bộ đếm lần gặp lấy số lớn nhất (rê chuột không tính là "sửa").
- Chỉ mục bạn **bấm xoá** mới bị xoá ở máy kia. Mục bị bỏ trong lần đồng bộ có nút **Khôi phục**.
- **Hỏi trước khi đụng vào dữ liệu máy này:** nếu lần đồng bộ sẽ sửa hoặc xoá mục nào trên máy đang dùng,
  extension liệt kê ra và cho chọn **Đồng ý** / **Giữ bản máy này** / **Huỷ**. Chỉ thêm mới thì chạy luôn.
- Cùng một từ được thêm riêng ở 2 máy → giữ 1 bản.
- Cài đặt (màu, phím tắt…) giữ riêng từng máy, không bị máy khác ghi đè.

**Sao lưu file JSON** (Tải backup / Nạp lại) vẫn dùng song song. **Tự sao lưu mỗi tuần vào thư mục Tải về
là tuỳ chọn, TẮT mặc định** (bật ở Cài đặt → Sao lưu) — extension không tự tải file nào về máy nếu bạn không bật.
Khi dữ liệu chưa có bản nào ngoài máy, popup hiện dải nhắc (ẩn được 7 ngày) và icon có dấu `!`.
Với người mới (dưới 20 mục và chưa dùng đủ 3 ngày) thì chưa nhắc — rủi ro còn nhỏ, tránh làm phiền.

> Bản 1.1 tự đồng bộ ngầm theo kiểu "cả cuốn, bản mới nhất thắng" nên một máy có dữ liệu cũ
> có thể đè mất dữ liệu máy khác. Từ 1.2 đã bỏ hẳn; khi cập nhật, bản sao cũ trong Tài khoản
> Chrome được gộp vào máy (chỉ thêm, không xoá gì).

### Cấu hình OAuth (chỉ khi tự build bản riêng)

Bản phát hành đã cấu hình sẵn. Nếu tự build với Extension ID khác:

1. [Google Cloud Console](https://console.cloud.google.com/) → tạo project → bật **Google Drive API**.
2. Credentials → **Create OAuth client ID** → loại **Web application**, thêm Authorized redirect URI
   `https://<EXTENSION_ID>.chromiumapp.org/` (giá trị của `chrome.identity.getRedirectURL()`).
3. Giữ Extension ID cố định bằng field `"key"` trong `manifest.json`, dán Client ID vào `oauth2.client_id`.

> Chưa cấu hình thì khu Drive tự báo "chưa hỗ trợ" và gợi ý dùng Sao lưu file — không lỗi.

## Lưu ý privacy

- Tất cả từ vựng lưu **cục bộ** trong `chrome.storage.local`, không gửi đi đâu
- Đoạn văn được **neo theo trang** có lưu kèm **URL trang nguồn** (để tô sáng lại đúng chỗ) — vẫn nằm cục bộ, chỉ rời máy khi chính bạn bấm Đồng bộ / xuất file
- Khi nào gọi mạng:
  - **Lưu từ mới** → dịch (Google Translate) + lấy phiên âm IPA (dictionaryapi.dev)
  - **Dịch nhanh khi bôi đen** (xem trước trên nút Lưu) → gửi đoạn đang chọn lên Google Translate. Tính năng này **bật sẵn** nhưng có thể **tắt** trong *Cài đặt → Dịch nhanh khi bôi đen*; tắt thì chỉ dịch sau khi bạn bấm Lưu.
  - **Click icon từ điển / dịch trong tooltip** → mở trang tra cứu
- Endpoint dùng: `translate.googleapis.com`, `api.dictionaryapi.dev`, `jisho.org`, `dictionary.cambridge.org` — đều là API/site public, không cần key, không tracking

## Tác giả

**Võ Hùng Nghiêm** — Developer. Tự dùng, tự build, tự sửa khi bug.

Đóng góp / báo lỗi: mở issue hoặc PR.

Ghi chú phát triển (thay đổi chưa phát hành, việc cần kiểm tra, backlog): [docs/NOTES.md](docs/NOTES.md).

---

<div align="center">
<sub>Made with ☕ — vì học tiếng Anh kiểu chép từ vở thì chán quá.</sub>
</div>
