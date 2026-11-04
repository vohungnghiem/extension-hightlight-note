# Highlight Note — ghi chú phát triển

Tài liệu cho người sửa / phát triển tiếp. Cập nhật lần cuối: 2026-11-05, sau v1.2.0.
Mục 2, 2b, 2c sẽ phát hành là **v1.2.1** (`manifest.json` đã tăng), chưa đưa lên store (mục 2 đã commit ở 293f27c; 2b, 2c chưa commit).

## 1. Bản đồ nhanh

| File | Việc |
|---|---|
| `manifest.json` | MV3, quyền, phím tắt, content script chạy `<all_urls>` |
| `background.js` | Service worker: menu chuột phải, phím tắt, badge, đồng bộ Drive, tự backup |
| `sync.js` | Gộp từng mục (`mergeStates`) + gọi Google Drive API |
| `constants.js` | Dùng chung: loại mục, `detectLang`, `isVietnamese`, `dictLink`, `TARGET_LANGS`/`langName`, "ngôn ngữ của bạn" (`nativeLang`, `nativeTargetLang`, `isNativeText`…), luật ôn tập |
| `i18n.js` / `i18n-en.js` | Dịch giao diện (xem 2b) |
| `_locales/` | Chỉ tên / mô tả / mô tả phím tắt trong manifest |
| `tests/` | E2E + kiểm câu chưa dịch — **không đóng gói** |
| `content.js` / `.css` | Tô sáng, thanh nổi khi bôi đen, thẻ Dịch, thẻ Lưu, ghi chú dán trang |
| `popup.*` | Danh sách quản lý (dùng chung cho Side Panel) |
| `options.*` | Cài đặt |
| `welcome.*` | Trang chào mừng lần cài đầu |
| `store-assets/mo-ta-store.txt` | Mô tả dán vào Developer Dashboard (không tự đồng bộ) |

Dữ liệu: `chrome.storage.local` → `words` (mảng), `settings`, và các khoá nội bộ do background ghi (`__itemTimes`, `__tombstones`, `__lastSync`, `__driveAccount`, `__lastAutoBackupAt`, `__syncRemoved`). Ghi chú dán trang là một `word` có `sticky: true`.

## 2. Thay đổi chưa phát hành (so với v1.2.0)

1. **Tự backup ra thư mục Tải về: TẮT mặc định.** `background.js` chỉ tải khi `settings.autoBackup === true`; Cài đặt hiện đúng trạng thái. Người dùng cũ chưa từng đụng công tắc cũng thành tắt.
2. **Link từ điển theo ngôn ngữ** (`dictLink` trong `constants.js`, dùng cho tooltip và thẻ Dịch): Anh→Cambridge, Nhật→Jisho, Trung→Hanzii, Hàn→Naver, còn lại→Wiktionary.
3. **Nhận diện tiếng Trung:** chữ Hán không kana + trang khai báo `lang="zh…"` → `zh`. Khi dịch xong, mã Google (`zh-CN`/`zh-TW`) thắng.
4. **Chọn ngôn ngữ dịch ngay trên thẻ Dịch** (người dùng không phải vào Cài đặt): đầu thẻ là `EN [Tiếng Việt ▾]` — bấm vào chọn Anh/Nhật/Hàn/Trung/Thái/Pháp/Đức… (`TARGET_LANGS` trong `constants.js`). Chọn xong thẻ dịch lại ngay và nhớ lựa chọn. **Hai hướng nhớ riêng:** chữ nước ngoài → `settings.targetLang` (mặc định `vi`); chữ Việt → `settings.viTargetLang` (mặc định `en`). Nếu chữ đã đúng ngôn ngữ đích (Google trả `data[2]` trùng đích — vd chọn đích Anh mà chữ là tiếng Anh) thì tự dịch lại sang ngôn ngữ phụ (`fallbackTarget`: vi↔en). `targetLang` cũng quyết định ngôn ngữ của xem trước nghĩa, nghĩa tự điền khi Lưu và ô "Thêm mục" trong popup. Có nút **Nghe** bản dịch khi đích khác tiếng Việt. Cài đặt → "Khi bôi đen chữ" có 2 ô chọn tương ứng.
5. **Thanh nổi gọn hơn và không che chữ:** bỏ logo khi chưa có nghĩa xem trước; Nghe/Sao chép chỉ bung ra khi rê chuột; nút Lưu dịu hơn (~235px → ~134px). Vị trí (`positionSelBtn`/`computeSelAnchor` trong `content.js`): ưu tiên PHÍA TRÊN vùng chọn để không che dòng sắp đọc — chọn 1 dòng: trên dòng đó, căn mép trái; chọn nhiều dòng: trên **dòng đầu**, căn mép trái dòng đầu. Sát mép trên màn hình mới lật xuống dưới dòng cuối. (Lần đầu mình đặt thanh dưới dòng cuối khi chọn nhiều dòng → che dòng kế tiếp; đã sửa.)
5b. **Thanh bám theo khi cuộn:** thanh là `position: fixed` nhưng trước đây chỉ tính vị trí 1 lần → cuộn trang là thanh đứng yên giữa trang. Nay `scroll` (capture, kể cả cuộn trong khung con) và `resize` gọi `refreshSelBtnPosition`: tính lại vị trí theo vùng chọn, ẩn khi vùng chọn đã ra khỏi màn hình.
6. **Công tắc ẩn thanh khi bôi chữ Việt** (`settings.hideSelVietnamese`, mặc định `false`).
7. **Trang chào mừng:** emoji → icon SVG cùng bộ với popup; hình minh hoạ thanh nổi; Ghi chú thành dòng riêng; thêm dòng "Học ngôn ngữ khác?".
8. **Cài đặt:** nhãn 5 loại và nút Drive dùng SVG; `busy()` giữ lại icon khi khôi phục nút.
8a. **Sửa lỗi bố cục thẻ Dịch (phát hiện qua ảnh chụp thật):** thêm nút Nghe làm chân thẻ 340px bị tràn, nút Lưu bị cắt. Nay thẻ rộng 384px (`max-width: 100vw - 20px`), chân thẻ `flex-wrap: wrap` (chật thì xuống dòng chứ không cắt), nút Nghe chỉ icon (nhãn trong tooltip). Ô chọn ngôn ngữ trên thẻ dùng tên ngắn (`short` trong `TARGET_LANGS`: "Thái", "Trung (giản)"…) vì `<select>` tự giãn theo tên dài nhất. Cài đặt: hai ô ngôn ngữ tách thành nhóm "Ngôn ngữ dịch" riêng (trước đó xen giữa các công tắc phụ làm gãy nhóm).
8b. **Chọn bằng bàn phím cũng hiện thanh** (Shift + mũi tên/Home/End/PageUp/PageDown), **Esc tắt thanh** (`trySelBar` + `keyup` trong `content.js`).
8c. **Emoji → SVG** trong popup (🎓 🔗 🔁 🎉) và ghi chú dán trang (📌); toast bỏ emoji. Còn lại có chủ đích: tiêu đề xuất Markdown (`## 📌 Ghi chú trang`) và menu chuột phải (menu hệ thống).
8d. **Dấu `!` đỏ trên icon bớt sớm:** chỉ bật khi từ 50 mục hoặc mục cũ nhất ≥14 ngày (`isBadgeWorthy` trong `background.js`); dải nhắc trong popup vẫn hiện từ 20 mục / 3 ngày. Lý do: tự backup đã tắt mặc định nên nhiều người sẽ vào mức "danger" sớm.
8e. **Tooltip khi rê chuột vào từ đã tô:** `SHOW_DELAY_MS` 400 → 120ms (đo thực: hiện sau ~130ms); vào mượt 0.11s chỉ ở lần hiện đầu (class `vn-enter` tự gỡ sau 140ms, nên các lần dựng lại khi phiên âm về không nhấp nháy). Độ trễ ẩn (`scheduleHide`, 250ms) giữ nguyên để kịp đưa chuột từ chữ sang tooltip.
8f. **Toast trên trang viết lại (`showToast` + CSS `.vocab-note-toast`):** nền tối giống thanh nổi/thẻ thay cho ô xanh phẳng; icon tròn theo loại (ok ✓ xanh / warn ⚠ vàng / undo 🗑 trung tính — dùng `opts.warn` / `opts.undo` như cũ); phần trong "…" của câu in đậm (tên từ); nút hành động dạng chữ (không còn khối trắng); thanh thời gian ở đáy, rê chuột vào thì tạm dừng, rời ra còn 1.8s; có animation vào/ra; tối đa 3 toast một lúc. Bỏ dấu ✓ thừa trong câu "đã thuộc". Chưa đổi: toast trong popup (`.popup-toast`, `toast()` trong `popup.js`) và `uiToast()` trong Cài đặt — vẫn kiểu cũ, nếu muốn đồng bộ thì làm tiếp.
8g. **Form sửa mục trong popup:** ô chọn Loại là `<select>` nên chỉ hiện emoji (📚⭐✅❓📎) — đổi sang hàng chip SVG (`.tp-chip`, dùng lại kiểu form "Thêm mục"), giá trị lưu ở `.ef-types[data-value]`. Lưu ý: `<select>`/`<option>` gốc của trình duyệt KHÔNG hiện được SVG; muốn đồng bộ icon thì phải dùng chip/menu tự vẽ. Emoji còn lại có chủ đích: tiêu đề xuất Markdown (`VN_TYPES[t].icon`).
8h. **Nhận dạng ngôn ngữ: đoán ở máy chỉ là bước đầu, Google quyết định.** Lỗ hổng cũ: `isVietnamese` coi `â ê ô` là chữ Việt nhưng tiếng Pháp/Bồ/Rumani cũng có (être, château, hôtel) → bị dịch như chữ Việt (sang tiếng Anh). Nay thẻ Dịch gửi `sl=auto`, đọc ngôn ngữ Google trả về (`data[2]`) rồi tự sửa hướng và dịch lại (`runTranslate`, tối đa 2 lần sửa): thật ra là chữ Việt (kể cả không dấu) → đích `viTargetLang`; không phải chữ Việt (vd Pháp) → đích `targetLang`; đã đúng ngôn ngữ đích → ngôn ngữ phụ. Ô chọn, nút Nghe, link Google, nút từ điển và nhãn nguồn đồng bộ theo (`syncCardToTarget`). `isSureVietnamese` (ă đ ơ ư + dấu chồng, không tính â ê ô) dùng để quyết định có xin bản xem trước không (`looksTranslatable`). Còn lại giới hạn: `hideSelVietnamese` và gợi ý loại mục vẫn dùng `isVietnamese` rộng.
8i. **Đẩy sang Google Dịch khi lỗi:** thẻ không dịch được → hiện liên kết "Mở Google Dịch →" ngay trong thẻ; `doTranslateSelection` bọc try/catch, nếu dựng thẻ ném lỗi thì mở thẳng Google Dịch (trước đây bấm mà im lặng).
8j. **Bộ chuyển động (nhẹ, nhất quán):** trên trang — nút lún khi bấm; vừa lưu thì các chỗ từ đó sáng lên một nhịp (`flashHighlights`, `.vn-flash`); popup — danh sách trượt vào so le đúng 1 lần mỗi lần mở (`playListEnter`), toast popup/Cài đặt cùng kiểu toast trên trang (nền tối + chấm màu + thanh thời gian + trượt vào); trang chào mừng — hero/thẻ vào so le. Mọi nơi đều tôn trọng `prefers-reduced-motion` (tắt hết animation/transition).
8k. **Thanh nổi chống "bấm không ăn":** hành động chạy khi NHẢ chuột theo nút đã NHẤN xuống (`barDown`/`runBarAction` trong `content.js`), còn `click` chỉ là dự phòng (bàn phím…) — nên vẫn ăn khi thanh dịch chỗ giữa lúc nhấn và nhả hoặc trình duyệt không phát `click`. Khi bản dịch xem trước về, giữ nguyên chỗ nút Dịch/Lưu (`reflowKeepingActions`: chỉ phần nghĩa bên trái co giãn). Bấm Dịch mà không thấy thẻ `.vn-tr-card` sau 400ms (hoặc dựng thẻ ném lỗi) → toast "Chưa mở được thẻ dịch" kèm nút "Mở Google Dịch" (`fallbackToGoogle`; nếu người dùng tắt toast thì mở thẳng). **Nguyên nhân gốc của báo cáo "bấm Dịch không được" chưa tìm ra** — đã thử với extension THẬT (Chromium `--load-extension`, chuột thật qua CDP) trên en/de.wikipedia, kể cả nạp lại extension khi tab đang mở, bấm cả 3 nút (nghĩa/Dịch/Lưu): đều chạy; các biện pháp trên là phòng thủ cho các nguyên nhân khả dĩ, chưa xác nhận cái nào là thủ phạm. Nếu còn tái diễn: mở F12 → Console trên trang đó xem có dòng đỏ không; thử tắt các extension khác (nhiều extension dịch/từ điển cũng chèn thanh nổi và bắt sự kiện chuột).
8l. **Sự cố "bấm không được, phím tắt cũng không" — NGUYÊN NHÂN GỐC (đã sửa).** Khi viết lại toast, khối thay thế trong `content.css` để lại một dấu `}` thừa ngay sau `@keyframes vn-toast-out`. Trình duyệt coi dấu thừa là lỗi và **bỏ luôn quy tắc ngay sau nó** — chính là `.vocab-note-mini-card { position: fixed; … }`, tức toàn bộ kiểu dáng thẻ Dịch/Lưu. Thẻ vẫn được tạo nhưng `position: static`, rơi xuống cuối trang, ngoài tầm nhìn → bấm chuột, phím tắt (Alt+Shift+D/H, cùng mở thẻ đó) đều "không có gì xảy ra", không có lỗi nào trong Console. Thanh nổi có kiểu dáng riêng nên vẫn hiện bình thường, làm người dùng tưởng nút hỏng. Phát hiện được nhờ kiểm tra `getComputedStyle(card).position` trên extension thật. **Bài học:** bài thử headless trước đó dùng bản CSS cũ nên không thấy; sau mỗi lần sửa CSS phải chạy `python3 docs/check-css.py` (kiểm tra dấu ngoặc mọi file CSS và khối `<style>`).
8m. **Tooltip che thanh nổi (lỗi thật thứ hai, cũng đã sửa):** sau khi giảm độ trễ tooltip xuống 120ms, con trỏ lướt qua từ đã lưu trên đường tới thanh là tooltip (khung ~340×200) bật ra và che nút — đo được phần tử dưới con trỏ là nút "Sửa" của tooltip. Nay: đang hiện thanh nổi hoặc thẻ thì không bật tooltip (`selBarOrCardOpen`), thanh/thẻ xuất hiện thì ẩn tooltip đang mở (`dismissTooltipForUi`, trừ khi đã ghim/đang gõ), và tooltip có z-index thấp hơn thanh/thẻ (…645 so với …647).
9. Mô tả store + README viết lại theo hướng người Việt học ngoại ngữ, có mục Ghi chú.

## 2b. Đợt "Cài đặt dễ tìm + đa ngôn ngữ" (2026-11-05, chưa commit)

Lý do: người dùng ít tìm hiểu không biết chỉnh ở đâu; cài đặt không học theo hành vi; định hướng ra thế giới nhưng mặc định tiếng Việt. Tất cả đã có bài e2e (`tests/e2e/run.js`, 71/71 đạt).

**Sửa lỗi (phát hiện bằng e2e với extension thật):**
1. Tắt công tắc tổng (popup) không gỡ tô sáng trên tab đang mở; "Phân biệt hoa/thường" phải tải lại trang. Gốc: nhánh `changes.settings` trong `content.js` không gọi `rebuildIndex()` (regex cũ vẫn dùng).
2. "Tắt ở đây" gỡ tô sáng rồi tô lại ngay. Gốc: `combinedRegex` vẫn còn → MutationObserver coi text vừa gỡ là nội dung mới. Nay đặt `combinedRegex = null` khi trang bị chặn.
3. Trang Cài đặt đang mở ghi đè thay đổi từ nơi khác (đổi ngôn ngữ trên thẻ Dịch, bật Học từ ở popup → bấm bất kỳ công tắc nào trong Cài đặt là mất). Gốc: `saveAll()` ghi cả form. Nay mỗi ô có `data-set="<khoá>"`, chỉ ghi khoá vừa đổi (`patch`), và điền lại form khi storage đổi. Popup cũng chỉ ghi khoá đã đổi (`saveSettings` so với `settingsSnap`).
4. Nhập backup "Gộp vào" âm thầm ghi đè cài đặt (file có `enabled:false` là tắt luôn tiện ích). Nay chỉ khi tích "Nạp cả cài đặt", và danh sách trang bị tắt được gộp.
5. Đổi "Sau bao nhiêu lần gặp" chỉ áp cho từ lưu sau (ngưỡng chép vào `autoDeleteAt` từng mục). Nay áp cho mọi mục.
6. `isVietnamese("khách hàng" / "có" / "là")` = false (regex không có á à ã…). Nay: có ký tự riêng tiếng Việt → Việt; có dấu Latin thì mọi tiếng phải là âm tiết tiếng Việt hợp lệ → "café", "déjà vu", "está" không bị nhận nhầm.
7. Nút giao diện popup chỉ đổi Sáng↔Tối, mất "Tự động". Nay quay vòng Tự động → Sáng → Tối.
8. `__MSG_cmd__execute_action__` (hai dấu `_` giữa tên) làm Chrome **không nạp được extension** — tên khoá message không được có `__`.

**Chỉnh ngay tại chỗ:** thanh nổi có nút ⋯ (hiện khi rê chuột): Tắt trên trang này (có Hoàn tác) / Tắt thanh (có Hoàn tác + Cài đặt) / Đổi ngôn ngữ dịch… / Tuỳ chỉnh thanh…. Thẻ Dịch có nút bánh răng → `options.html#language`. `OPEN_OPTIONS` nhận `section` (`"selection#showSelButton"`), dùng lại tab Cài đặt đang mở.

**Trang Cài đặt:** mục sắp theo việc người dùng muốn làm: Ngôn ngữ → Dịch & thanh nổi → Tô sáng → Học từ → Bật/tắt theo trang (có công tắc tổng) → Dữ liệu & đồng bộ → Chung (giao diện, phím tắt, hướng dẫn, góp ý → trang đánh giá Web Store, khôi phục toàn bộ). Ô tìm (không dấu, từ khoá ẩn `data-kw` có cả tiếng Anh, phím `/`). Dấu chấm cạnh cài đặt khác mặc định. "Khôi phục mặc định" từng mục. Link sâu `#<mục>#<khoá>` làm nổi đúng dòng.

**Gợi ý thông minh (hỏi đúng 1 lần, không tự bật/tắt):** thanh hiện 15 lần liền không bấm gì → toast hỏi tắt (`tipBarAsked`); ≥ 8 từ vựng có nghĩa mà chưa bật Học từ → dải gợi ý trong popup (`tipLearningAsked`).

**"Ngôn ngữ của bạn" thay "tiếng Việt" cứng:** `nativeLang` (mặc định vi). `targetLang` = chữ nước ngoài → (mặc định = nativeLang). `nativeTargetLang` = chữ của mình → (thay `viTargetLang`, mặc định en; native là en thì es). `hideSelNative` thay `hideSelVietnamese`. Hàm đọc (`nativeTargetLang()`, `hideSelNative()`) vẫn đọc khoá cũ; `migrateSettings` (background, khi cập nhật) chuyển khoá cũ và đặt `uiLang:"vi"` cho người dùng cũ. Đổi `nativeLang` trong Cài đặt thì `targetLang` đi theo nếu đang bằng native.

**Đa ngôn ngữ giao diện (`i18n.js`):** kiểu gettext — **câu tiếng Việt là khoá**, bảng `i18n-en.js`. Giao diện tiếng Việt không đi qua bảng nào (người dùng hiện tại không bị ảnh hưởng). Không dùng `chrome.i18n` cho giao diện vì nó luôn theo ngôn ngữ trình duyệt — mà 50% người dùng Việt dùng Chrome tiếng Anh. Ngôn ngữ: `settings.uiLang` (`auto`/`vi`/`en`); `auto` = vi nếu trình duyệt tiếng Việt **hoặc múi giờ Asia/Ho_Chi_Minh**, còn lại en. Cách chạy:
- `T("Dịch sang {0}", x)` cho chuỗi có biến (code mới nên dùng);
- trang extension: `HN_I18N.initPage()` dịch cả DOM + theo dõi phần tử thêm sau (MutationObserver), đổi ngôn ngữ thì tải lại trang;
- content script: chỉ theo dõi các khối UI của mình (con trực tiếp của `<body>` có class `vocab-note-…`), không quan sát trang web;
- chuỗi đã ghép sẵn (toast…) dịch bằng `tr()`, khớp cả mẫu có `{0}` (phần biến cũng được dịch nếu có trong bảng);
- nội dung người dùng (từ, nghĩa, ghi chú, bản dịch) không dịch: `[data-hn-raw]` hoặc selector skip của từng trang.
**Thêm / sửa câu giao diện:** viết tiếng Việt như thường, rồi `cd tests && node i18n-missing.js` → thêm dòng vào `i18n-en.js`. Thêm ngôn ngữ thứ 3: tạo `i18n-xx.js` (`self.HN_I18N_XX`), thêm vào `DICTS`/`UI_LANGS` trong `i18n.js` và vào danh sách script (manifest, background `importScripts`/`CONTENT_FILES`, các trang HTML).
**manifest:** `default_locale: "en"` + `_locales/{vi,en}` cho tên/mô tả/phím tắt (trình duyệt tiếng Việt thấy tiếng Việt).
Tên ngôn ngữ trong ô chọn: vi dùng tên viết tay (`TARGET_LANGS`), ngôn ngữ khác dùng `Intl.DisplayNames` (`langName`).

## 2c. Hỏi khôi phục cài đặt gốc sau khi cập nhật (v1.2.1)

- `chrome.runtime.onInstalled` với `reason: "update"` → `prepareUpdateReview(settings, previousVersion)` (background) → nếu có cài đặt khác mặc định thì ghi `__updateReview = { from, to, count, at }`. **Không** mở tab mới; popup hiện 1 dải "Đã cập nhật lên … muốn khôi phục cài đặt gốc?" [Xem & chọn] [Giữ nguyên]. Bấm Xem → `options.html#update` → hộp thoại chọn từng mục.
- Thông minh: không có gì khác mặc định → không hỏi; cùng / thấp hơn phiên bản → không hỏi; popup đếm lại lúc mở (đã tự chỉnh về mặc định thì thôi); so theo **hiệu lực** (giao diện "vi" ở máy tiếng Việt ≡ "tự động"). Mỗi mục được phân loại (`settingsDiff` trong `constants.js`):
  - `newDefault` — giá trị đúng bằng mặc định CŨ của bản người dùng đang dùng (bảng `DEFAULT_CHANGES`) → chưa từng chỉnh → **chọn sẵn**;
  - `off` — đang tắt một tính năng chính (`SETTING_INFO[k].core`: công tắc tổng, thanh nổi, xem trước nghĩa, thông báo) → lên đầu, nhắc "có thể bạn đã quên", không chọn sẵn;
  - `custom` — người dùng tự chỉnh → không chọn sẵn.
- Khôi phục xong có Hoàn tác (bản trước lưu ở `__settingsBeforeReset`). Không đụng `nativeLang`, danh sách trang bị tắt, dữ liệu, Drive.
- Mở lại bất cứ lúc nào: Cài đặt → Chung → "Xem cài đặt khác mặc định".
- **Khi đổi một mặc định trong `settingDefaults`, thêm 1 dòng vào `DEFAULT_CHANGES`** (`{ in: "<bản mới>", key, old: <mặc định cũ> }`) — nếu không, người dùng cũ sẽ thấy mục đó là "bạn đã chỉnh" thay vì được chọn sẵn mặc định mới.
- Mặc định / cách đọc giá trị cài đặt giờ nằm chung ở `constants.js` (`settingDefaults`, `settingVal`, `SETTING_INFO`) — Cài đặt, popup, background cùng dùng.

## 2d. Thanh nổi: gộp nghĩa vào nút Dịch, bỏ logo (v1.2.1)

- Trước: `[logo may mắn] [Dịch] [Lưu]` — đã có nghĩa mà vẫn có nút "Dịch" → thừa, đọc như "chưa dịch"; bấm Dịch chỉ ra lại đúng nghĩa đó (+ phiên âm, từ điển).
- Nay: **1 nút** — chưa có nghĩa: `[Dịch]`; có nghĩa (xem trước hoặc nghĩa đã lưu): `[may mắn ›]`, bấm mở thẻ chi tiết (tooltip ghi rõ "Xem chi tiết: phiên âm, nghe, từ điển, đổi ngôn ngữ"). Đo trên "fortunate": thanh 230px → 151px.
- KHÔNG ẩn nút Dịch khi nghĩa về: nghĩa về sau ~0.2s, ẩn nút lúc đó = nút biến mất dưới con trỏ. Gộp + `reflowKeepingActions` giữ nguyên chỗ nút **Lưu** (nút Dịch giãn sang trái) → chỗ chữ "Dịch" cũ vẫn thuộc nút Dịch, nút Lưu không nhảy (đã đo: x nút Lưu trước/sau như nhau, `elementFromPoint` tại chỗ "Dịch" cũ vẫn là nút Dịch).
- Lúc đang chờ nghĩa: vẫn là "Dịch" (bỏ "…" — tránh thanh nhảy 2 lần).
- **Bỏ logo khỏi thanh**: không có chức năng, chiếm ~33px, lúc có lúc không (chỉ hiện khi có nghĩa) làm thanh co giãn. Nhận diện giữ ở thẻ Dịch / Lưu, tooltip, toast, và tiêu đề "Highlight Note" đầu menu ⋯.

### Khoá `settings` mới / đổi mặc định

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `autoBackup` | `false` (trước: coi như bật) | Tự tải backup mỗi tuần |
| `uiLang` | `"auto"` (người dùng cũ: `"vi"`) | Ngôn ngữ giao diện: `auto` / `vi` / `en` |
| `nativeLang` | `"vi"` (cài mới ở trình duyệt khác: theo trình duyệt) | Ngôn ngữ của bạn |
| `targetLang` | = `nativeLang` | Dịch chữ nước ngoài sang ngôn ngữ nào |
| `nativeTargetLang` | `"en"` (native en → `"es"`) | Dịch chữ của bạn sang đâu (thay `viTargetLang`, vẫn đọc khoá cũ) |
| `hideSelNative` | `false` | Không hiện thanh khi bôi chữ của bạn (thay `hideSelVietnamese`) |
| `tipBarAsked` / `tipLearningAsked` | — | Đã hỏi gợi ý tắt thanh / bật Học từ (chỉ hỏi 1 lần) |

Danh sách ngôn ngữ đích: `TARGET_LANGS` trong `constants.js` (thêm ngôn ngữ ở đó là đủ, UI tự đọc).

## 3. Chưa kiểm chứng — làm trước khi phát hành

Đã thử bằng node (hàm thuần) và chụp Chrome headless (CSS thanh nổi, trang chào mừng). **Chưa chạy trong Chrome thật:**

- [ ] Link Hanzii (`hanzii.net/search/word/<từ>?hl=vi`): trang mở được nhưng chưa xác nhận đường dẫn tìm đúng từ.
- [ ] Link Naver Hàn-Việt (`korean.dict.naver.com/kovidict/#/search?query=`): bị công cụ chặn, địa chỉ nhớ lại, **chưa mở được**.
- [ ] Bôi 1 từ và bôi nhiều dòng → thanh nằm trên, không che dòng nào của vùng chọn hay dòng kế tiếp; sát mép trên/dưới/phải màn hình. (Đã chụp thử trên Chrome headless với `content.js` thật + API giả lập: đúng.)
- [ ] Cuộn trang khi đang chọn → thanh bám theo; cuộn hẳn ra khỏi vùng chọn → thanh ẩn. (Đã thử bằng sự kiện `scroll` giả lập: bám/lật/ẩn đúng. Chưa thử cuộn thật bằng chuột/trackpad, cuộn trong khung con như Gmail/Notion.)
- [ ] Rê chuột vào thanh: Nghe/Sao chép bung ra, không bị tràn mép phải.
- [ ] Thẻ Dịch: bôi chữ Anh → đổi sang Thái trên thẻ → dịch lại đúng, lần sau mở thẻ vẫn là Thái; bôi chữ Việt → đổi sang Nhật. Nút Nghe có tiếng (cần giọng cài trên máy). (Đã thử với `fetch` giả lập: đích mặc định, đích Thái, đích Anh với chữ Anh → tự chuyển sang Việt: đúng. Chưa thử Google Dịch thật.)
- [ ] Chọn bằng Shift+mũi tên trên trang thường → thanh hiện; trong ô nhập (Gmail/Notion) → không hiện; Esc → tắt.
- [ ] Chạy `python3 docs/check-css.py` (phải báo cân ngoặc) — bắt buộc trước khi phát hành.
- [ ] **Thẻ Dịch/Lưu hiện đúng chỗ** (không bị rơi xuống cuối trang): bấm Dịch, bấm Lưu, Alt+Shift+D, Alt+Shift+H. Thử cả trang có từ đã lưu (tooltip) và trang không có.
- [ ] **Bấm thanh nổi:** nghĩa / Dịch / Lưu đều mở đúng (thẻ dịch / thẻ dịch / thẻ lưu); rê chuột vào thanh rồi bấm Nghe, Sao chép; mạng chậm (bản dịch xem trước về giữa lúc giữ chuột) vẫn bấm được. Thử với extension khác đang bật (Google Dịch, Immersive Translate, Grammarly…).
- [ ] Bôi chữ Pháp có â/ê/ô (être, château) → Dịch ra tiếng Việt (không phải tiếng Anh); chữ Việt không dấu ("nha cua toi") → dịch sang đích của chữ Việt. (Đã thử với Google giả lập: đúng.)
- [ ] Ngắt mạng / chặn translate.googleapis.com → thẻ hiện "Mở Google Dịch →" và bấm được.
- [ ] Lưu một từ → các chỗ từ đó trên trang nhấp sáng (chưa thử trên Chrome thật).
- [ ] Bật "Giảm chuyển động" của hệ điều hành → không còn animation nào.
- [ ] Tooltip: rê chuột vào từ đã tô → hiện nhanh (~0.1s), lướt chuột nhanh qua nhiều từ không bật loạt tooltip; chuyển từ này sang từ khác không nhấp nháy.
- [ ] Toast: Lưu → có Hoàn tác (bấm được), Xoá → toast trung tính, cảnh báo → vàng; rê chuột vào thì thanh thời gian dừng; 4 thao tác liên tiếp chỉ còn 3 toast.
- [ ] Popup → sửa mục: chip loại đổi được, Lưu xong loại đúng.
- [ ] Popup: nhãn "đã thuộc", link nguồn, thanh nhắc ôn, màn hình "Xong buổi ôn!" — icon hiển thị đúng cỡ, không bị phóng to.
- [ ] Bật `hideSelVietnamese` rồi bôi chữ Việt (có dấu) → không hiện thanh. Chữ Việt **không dấu** vẫn hiện (không nhận ra được).
- [ ] Trang chào mừng chế độ tối; nút "Thử ngay"; nút Kết nối Drive (chữ đổi thành "Đã kết nối…").
- [ ] Cài đặt → bấm Đồng bộ ngay: sau khi xong nút vẫn còn icon.
- [ ] **Windows** (62% người dùng): thanh nổi, Side Panel, phím tắt.

### Kiểm tra end-to-end với extension thật
**Đã tự động hoá:** `cd tests && npm i && node e2e/run.js` (Playwright + Chromium của Playwright, 2 lượt: `vi-VN`/Asia/Ho_Chi_Minh và `en-US`/America/New_York, ảnh ở `tests/e2e/shots/`). **Cẩn thận:** còn `tests/node_modules` thì "Tải tiện ích đã giải nén" thẳng từ repo sẽ lỗi — xoá nó sau khi chạy test. Bộ chạy chép extension ra thư mục tạm (bỏ `tests/`) vì Chrome từ chối nạp thư mục có file tên bắt đầu bằng `_` (trong `node_modules`). Lượt tiếng Anh quét mọi chữ còn sót tiếng Việt trên Cài đặt / popup / chào mừng / thanh / thẻ / tooltip.
Cách làm tay (cũ): Chromium (không phải Chrome chính thức — bản chính thức chặn `--load-extension`) chạy `--headless=new --disable-extensions-except=<thư mục> --load-extension=<thư mục> --remote-debugging-port=<cổng>`, điều khiển qua CDP (`Input.dispatchMouseEvent` = chuột thật; `Runtime.evaluate` với `contextId` của world "Highlight Note" để xem bên trong content script). Dùng cổng và hồ sơ MỚI mỗi lần và đóng bằng `Browser.close` (kill tiến trình snap thường bị từ chối → tiến trình mồ côi, và lần sau sẽ nối nhầm vào trình duyệt cũ qua cổng cũ).

### Cách kiểm tra giao diện không cần cài tiện ích
Chrome headless + `chrome.*` giả lập (storage/runtime/fetch) nạp `content.js`/`popup.js`/`options.js` thật, chụp `--screenshot` và đo tràn (so `getBoundingClientRect` của từng phần tử với thẻ). Nhớ tắt animation (`*{animation:none!important}`) khi chụp, và thay `requestAnimationFrame` bằng `setTimeout` (headless không phát khung hình). Đã dùng để kiểm: thẻ Dịch (từ ngắn, đã lưu, đoạn dài, chữ Việt, ngôn ngữ tên dài), thanh nổi (có/không rê chuột), Cài đặt, popup. Chưa thay thế được việc thử trên Chrome thật.

## 4. Số liệu người dùng (Developer Dashboard, 4/10–2/11/2026)

- ~13 người dùng/tuần; hằng ngày 6–9 (đỉnh 12 ngày 25/10). DAU/WAU > 0.5 → giữ chân tốt, **vấn đề là kéo người mới**.
- Việt Nam 93%, Mỹ 7%. Ngôn ngữ trình duyệt Việt 50% / Anh 50%.
- Windows 62%, Linux 15% (có thể gồm máy của chính người phát triển), macOS 4%, khác 18%.
- 1.1.1 → 1.2.0 chuyển trong ~11–14/10, không có đà giảm. Gần như toàn bộ đang bật.
- 15 → 13: khả năng cao là dao động thường (đếm 7 ngày). Kiểm tra tab Uninstalls để chắc.

## 5. Backlog trải nghiệm (theo thứ tự nên làm)

1. **Quyền `downloads` → `optional_permissions`.** Hiện bắt buộc khi cài (hiện cảnh báo "quản lý tải xuống" lúc cài — cần xác nhận lại trên hộp thoại cài thật), mà chỉ dùng cho tự backup (`background.js` `chrome.downloads.download`), nay đã tắt mặc định. Xin quyền bằng `chrome.permissions.request` khi người dùng bật công tắc (phải trong thao tác bấm). Giảm rào cản cài đặt.
2. **Quyền `<all_urls>`** là rào cản lớn nhất với người lạ ("đọc và thay đổi dữ liệu trên mọi trang"). Khó bỏ vì tô sáng tự động là lõi; ít nhất giải thích trong mô tả store (đã thêm mục này) và trang chào mừng.
3. ~~Dấu `!` đỏ trên icon~~ — đã giảm nhắc sớm (xem 8d). Có thể đổi hẳn thành chấm nhỏ nếu vẫn thấy phiền.
4. **Phím tắt Alt+Shift+…** trùng phím đổi bộ gõ của Windows khi có ≥2 bố cục bàn phím (hay gặp ở người Việt). Chưa kiểm chứng; nếu có lỗi: hướng dẫn đổi ở `chrome://extensions/shortcuts` hoặc đổi mặc định sang Ctrl+Shift+….
5. ~~Chế độ học từ: gợi ý bật~~ — đã làm (2b, sau 8 từ vựng).
5b. **Luồng chính — còn có thể cải thiện:** thẻ Dịch/Lưu (`positionMiniCard`) vẫn đặt DƯỚI vùng chọn → với đoạn nhiều dòng nó che các dòng sau (chấp nhận được vì người dùng đang đọc thẻ, nhưng nên xem lại); cảm ứng (điện thoại/tablet) chưa có thanh; thanh chưa tự ẩn sau vài giây không dùng. Đã cân nhắc nhưng KHÔNG đổi vị trí thẻ: nó nằm ngay dưới vùng chọn và đóng khi bấm ra ngoài, nguyên văn đã có trong thẻ.
6. ~~Emoji còn sót~~ — đã đổi (xem 8c).
7. **Giọng đọc:** `speak()` không kiểm tra có giọng hay không; tiếng Việt/Nhật/Hàn trên Windows có thể im lặng. Cân nhắc báo "máy chưa có giọng đọc cho ngôn ngữ này".
8. **Kênh phản hồi / xin đánh giá:** đã có nút "Góp ý & đánh giá" (Cài đặt → Chung → trang đánh giá Web Store). Chưa có: xin đánh giá sau ~20 lần lưu.
9. **Ảnh store** làm lại theo hướng người Việt: (1) bôi đen → thẻ dịch, (2) từ đã lưu sáng lên + thẻ nghĩa, (3) Ghi chú ghim trên trang thật, (4) đoạn văn neo theo trang, (5) popup/Side Panel. Chú thích ngắn tiếng Việt.
10. **README** vẫn nghiêng về học từ; phần "Có gì mới" chưa có mục chưa phát hành ở trên.
11. ~~Quốc tế hoá~~ — đã làm phần khung + tiếng Anh (2b). Còn lại: mô tả store tiếng Anh dán vào Dashboard (`store-assets/store-description-en.txt`), ảnh store tiếng Anh; link từ điển Hanzii đang `hl=vi`. Ghi chú cũ: giao diện hàng trăm chuỗi tiếng Việt nằm lẫn trong `content.js`/popup/options → cần `chrome.i18n` + `_locales`. Chỉ làm khi có người nước ngoài tự tìm đến. Ngôn ngữ đích cho chữ nước ngoài hiện cố định là tiếng Việt (nhiều chỗ `"vi"` cứng trong `content.js`/`popup.js`).

## 6. Phát hành (theo cách v1.2.0 đã làm)

1. Kiểm tra mục 3.
2. Tăng `version` trong `manifest.json`.
3. Chạy `cd tests && node e2e/run.js && node i18n-missing.js` (phải đạt hết, thiếu 0).
4. Nén thư mục thành `highlight-note-vX.Y.Z.zip` (như các file zip đã có ở thư mục gốc; **không** đưa `tests/` (có `node_modules` → Chrome Web Store / Chrome từ chối), `docs/`, `.git`, `store-assets/`). Nhớ có `_locales/`, `i18n.js`, `i18n-en.js`.
5. Dán lại `store-assets/mo-ta-store.txt` và ảnh vào Developer Dashboard.
6. Sau vài ngày xem Analytics: Weekly users, Uninstalls, Daily users by item version.

## 7. Hướng dẫn nhanh cho người dùng (để đưa vào hỗ trợ/FAQ)

- **Dịch chữ Việt sang Nhật/Hàn…:** bôi đen chữ Việt → Dịch → đổi ngôn ngữ ở đầu thẻ (nhớ cho lần sau). Hoặc Cài đặt → Khi bôi đen chữ.
- **Không muốn thanh nổi hiện:** Cài đặt → Khi bôi đen chữ → tắt "Hiện thanh Dịch / Lưu" (vẫn dùng phím tắt/chuột phải), hoặc bật "Không hiện khi bôi chữ tiếng Việt".
- **Ghi chú dán trang:** chuột phải vào chỗ trống → "Ghim ghi chú lên trang này". Kéo được, thu gọn được, tạm ẩn được; mở lại đúng trang là hiện lại.
- **Nghe / Sao chép trên thanh nổi:** rê chuột vào thanh để hiện ra.
- **Backup:** Cài đặt → Sao lưu ra file. "Tự sao lưu mỗi tuần" mặc định tắt; bật thì mỗi tuần tải 1 file vào thư mục Tải về. Đồng bộ nhiều máy: Cài đặt → Đồng bộ (chỉ chạy khi bấm).
- **Đổi phím tắt:** `chrome://extensions/shortcuts`.
