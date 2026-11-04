// E2E cho Highlight Note: Chromium THẬT + extension THẬT (chuột / bàn phím thật qua Playwright).
//
//   cd tests && npm i && npx playwright-core install chromium   (lần đầu)
//   node e2e/run.js            → chạy cả 2 lượt: trình duyệt tiếng Việt + trình duyệt tiếng Anh
//   node e2e/run.js vi|en      → chỉ 1 lượt
//   CHROME=/đường/dẫn/chrome   → dùng Chromium khác (Chrome chính thức KHÔNG cho --load-extension)
//
// Ảnh chụp: tests/e2e/shots/. Mã thoát 1 nếu có bài trượt.
// Cần mạng cho vài bài (Google Dịch); không có mạng thì thẻ Dịch hiện "Mở Google Dịch →" — vẫn đạt.
const { chromium } = require("playwright-core");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SRC = path.resolve(__dirname, "../..");
// Chrome từ chối nạp thư mục có file/thư mục tên bắt đầu bằng "_" (node_modules của tests/ có) →
// chép bản sạch của extension (bỏ tests/, .git, docs…) ra thư mục tạm rồi nạp bản đó.
const SKIP = new Set(["tests", ".git", "docs", "store-assets", "node_modules"]);
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), "hn-ext-"));
for (const f of fs.readdirSync(SRC)) {
  if (SKIP.has(f) || f.endsWith(".zip")) continue;
  fs.cpSync(path.join(SRC, f), path.join(EXT, f), { recursive: true });
}
process.on("exit", () => { try { fs.rmSync(EXT, { recursive: true, force: true }); } catch (e) {} });
const SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), ".cache/ms-playwright");
  try {
    for (const d of fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win/chrome.exe", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = path.join(base, d, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) {}
  return undefined; // để playwright tự tìm
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test</title>
<style>body{font:18px/1.6 sans-serif;max-width:720px;margin:40px auto;padding:0 16px}</style></head><body>
<h1>Serendipity</h1>
<p id="p1">It was pure serendipity that our resilient team found such a handy tool for reading.</p>
<p id="p2">Sáng mai họp với khách hàng để chốt hợp đồng.</p>
<p id="p3">Another paragraph mentions serendipity again, and resilient people.</p>
<div style="height:1500px"></div></body></html>`;

const results = [];
let suite = "";
const ok = (name, cond, info = "") => {
  results.push({ suite, name, pass: !!cond, info });
  console.log((cond ? "  PASS " : "  FAIL ") + name + (info ? "  — " + info : ""));
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Chữ tiếng Việt còn sót trên giao diện (bỏ qua nội dung người dùng: [data-hn-raw], ô nhập…)
const SCAN_VI = (rootSel) => {
  const VI = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]|\b(và|của|không|được|trên)\b/i;
  const roots = rootSel ? [...document.querySelectorAll(rootSel)] : [document.body];
  const bad = new Set();
  const skip = (el) => !el || el.closest("[data-hn-raw], script, style, textarea, .term-text, .meaning, .note, .vn-mini-term, .vn-tr-word, .vn-tr-out, .vn-sel-trans");
  for (const r of roots) {
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (skip(el) || !el.getClientRects().length) continue;
      if (VI.test(n.nodeValue)) bad.add(n.nodeValue.trim().slice(0, 70));
    }
    for (const el of r.querySelectorAll("[title], [placeholder], [aria-label]")) {
      if (skip(el)) continue;
      for (const a of ["title", "placeholder", "aria-label"]) { const v = el.getAttribute(a); if (v && VI.test(v)) bad.add(a + ": " + v.slice(0, 70)); }
    }
  }
  return [...bad];
};

async function launch({ lang, tz }) {
  const server = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(PAGE); });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://localhost:${server.address().port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "hn-e2e-"));
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: findChrome(), headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--headless=new", "--no-first-run", `--lang=${lang}`],
    env: { ...process.env, TZ: tz, LANGUAGE: lang.replace("-", "_") },
    locale: lang, timezoneId: tz, viewport: { width: 1280, height: 800 }
  });
  const errors = [];
  const watchErr = (p) => p.on("pageerror", e => errors.push(p.url().slice(0, 60) + " :: " + e.message));
  ctx.pages().forEach(watchErr);
  ctx.on("page", watchErr);
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = sw.url().split("/")[2];
  const H = {
    ctx, sw, extId, url, errors,
    store: (keys) => sw.evaluate(k => chrome.storage.local.get(k), keys),
    set: (obj) => sw.evaluate(o => chrome.storage.local.set(o), obj),
    patch: (p) => sw.evaluate(async p => { const { settings } = await chrome.storage.local.get("settings"); await chrome.storage.local.set({ settings: { ...settings, ...p } }); }, p),
    close: async () => { await ctx.close(); server.close(); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} }
  };
  await sleep(1500);
  return H;
}

// ----- thao tác trên trang web -----
async function selectText(page, sel, word) {
  const box = await page.evaluate(({ sel, word }) => {
    const el = document.querySelector(sel);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const i = n.data.indexOf(word);
      if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }
    }
    return null;
  }, { sel, word });
  await page.mouse.click(5, 760); await sleep(120);
  await page.mouse.move(box.x + 1, box.y + box.h / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w - 1, box.y + box.h / 2, { steps: 5 });
  await page.mouse.up();
  await sleep(450);
}
const barVisible = (page) => page.evaluate(() => {
  const b = document.querySelector(".vocab-note-sel-btn");
  return !!b && getComputedStyle(b).display !== "none" && b.getBoundingClientRect().width > 0;
});
const hlCount = (page) => page.$$eval(".vocab-note-highlight", e => e.length);
async function clickBar(page, cls) {
  const bar = await page.$(".vocab-note-sel-btn");
  const bb = await bar.boundingBox();
  await page.mouse.move(bb.x + 10, bb.y + bb.height / 2); await sleep(250); // rê vào → Nghe/Sao chép/⋯ bung ra
  const btn = await page.$(".vocab-note-sel-btn " + cls);
  if (!btn) return false;
  const b = await btn.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await sleep(220);
  await page.mouse.down(); await page.mouse.up();
  await sleep(500);
  return true;
}
const toggle = (page, id) => page.click(`label.tgl:has(#${id})`);

// =====================================================================
async function suiteVi() {
  suite = "vi"; console.log("\n=== Trình duyệt tiếng Việt (vi-VN, Asia/Ho_Chi_Minh) ===");
  const H = await launch({ lang: "vi-VN", tz: "Asia/Ho_Chi_Minh" });
  const { ctx, sw, extId } = H;
  ok("Service worker chạy", !!extId);
  ok("Cài lần đầu mở trang chào mừng", ctx.pages().some(p => p.url().includes("welcome.html")));
  let { settings } = await H.store("settings");
  ok("Mặc định: giao diện tự động→vi, ngôn ngữ của bạn vi, dịch sang vi / en",
    settings.uiLang === "auto" && settings.nativeLang === "vi" && settings.targetLang === "vi" && settings.nativeTargetLang === "en" && settings.autoBackup === false,
    JSON.stringify({ ui: settings.uiLang, n: settings.nativeLang, t: settings.targetLang, nt: settings.nativeTargetLang }));
  ok("Service worker nhận giao diện tiếng Việt", (await sw.evaluate(() => HN_I18N.getLang())) === "vi");

  // ----- hàm thuần trong service worker -----
  const det = await sw.evaluate(() => ["khách hàng", "có", "là", "hợp đồng", "café", "déjà vu", "está", "resilient"].map(t => HN_CONST.isVietnamese(t)));
  ok("Nhận diện chữ Việt (kể cả chỉ có dấu sắc/huyền), không nhầm café/déjà vu/está", JSON.stringify(det) === "[true,true,true,true,false,false,false,false]", JSON.stringify(det));
  const mig = await sw.evaluate(() => migrateSettings({ viTargetLang: "ja", hideSelVietnamese: true, theme: "dark" }));
  ok("Chuyển cài đặt cũ (≤1.2): giữ tiếng Việt, viTargetLang→nativeTargetLang", mig && mig.uiLang === "vi" && mig.nativeLang === "vi" && mig.nativeTargetLang === "ja" && mig.hideSelNative === true && !("viTargetLang" in mig) && mig.theme === "dark", JSON.stringify(mig));

  // ----- trang web -----
  const page = await ctx.newPage();
  await page.goto(H.url); await sleep(800);
  await selectText(page, "#p1", "serendipity");
  ok("Bôi đen → thanh nổi hiện", await barVisible(page));
  await page.screenshot({ path: path.join(SHOTS, "vi-1-bar.png") });

  await clickBar(page, ".vn-sel-tr"); await sleep(1300);
  const card = await page.evaluate(() => {
    const c = document.querySelector(".vn-tr-card"); if (!c) return null;
    const r = c.getBoundingClientRect();
    return { pos: getComputedStyle(c).position, top: r.top, bottom: r.bottom, gear: !!c.querySelector(".vn-mini-gear"), out: c.querySelector(".vn-tr-out").textContent.trim().slice(0, 40) };
  });
  ok("Bấm Dịch → thẻ Dịch: position fixed, nằm trong màn hình, có nút Cài đặt", card && card.pos === "fixed" && card.top >= 0 && card.bottom <= 800 && card.gear, JSON.stringify(card));
  await page.screenshot({ path: path.join(SHOTS, "vi-2-translate.png") });
  if (card) {
    await page.selectOption(".vn-tr-card .vn-tr-tl", "ja"); await sleep(700);
    ({ settings } = await H.store("settings"));
    ok("Đổi ngôn ngữ trên thẻ → nhớ settings.targetLang", settings.targetLang === "ja", settings.targetLang);
    // Nút bánh răng → mở Cài đặt đúng mục Ngôn ngữ
    const [opt0] = await Promise.all([ctx.waitForEvent("page", { timeout: 5000 }).catch(() => null), page.click(".vn-tr-card .vn-mini-gear")]);
    await sleep(800);
    const optUrl = opt0 ? opt0.url() : (ctx.pages().find(p => p.url().includes("options.html")) || { url: () => "" }).url();
    ok("Nút bánh răng trên thẻ Dịch → mở Cài đặt#language", /options\.html#language/.test(optUrl), optUrl.split("/").pop());
    if (opt0) await opt0.close();
    await H.patch({ targetLang: "vi" });
  }
  await page.bringToFront();
  await page.keyboard.press("Escape");

  // Lưu
  await selectText(page, "#p1", "resilient");
  await clickBar(page, ".vn-sel-save");
  const sc = await page.evaluate(() => { const c = document.querySelector(".vn-save-card"); if (!c) return null; const r = c.getBoundingClientRect(); return { pos: getComputedStyle(c).position, top: r.top, bottom: r.bottom }; });
  ok("Bấm Lưu → thẻ Lưu: position fixed, trong màn hình", sc && sc.pos === "fixed" && sc.top >= 0 && sc.bottom <= 800, JSON.stringify(sc));
  await page.fill(".vn-save-card .vn-mini-meaning", "kiên cường");
  await page.click(".vn-save-card .vn-mini-save"); await sleep(1000);
  let { words } = await H.store("words");
  ok("Lưu → mục vào storage", (words || []).some(w => w.term === "resilient" && w.meaning === "kiên cường"));
  ok("Từ vừa lưu được tô ở cả 2 chỗ trên trang", (await page.$$eval(".vocab-note-highlight", els => els.filter(e => /resilient/i.test(e.textContent)).length)) === 2);
  const hl = await page.$(".vocab-note-highlight");
  const hb = await hl.boundingBox();
  await page.mouse.click(5, 760);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await sleep(500);
  ok("Rê chuột vào từ đã lưu → tooltip", await page.evaluate(() => { const t = document.querySelector(".vocab-note-tooltip"); return !!t && getComputedStyle(t).display !== "none" && t.getBoundingClientRect().width > 0; }));
  await page.mouse.move(5, 760); await sleep(500);

  // Cài đặt áp ngay lên trang
  await H.patch({ highlightColor: "#00ff00", highlightStyle: "background" }); await sleep(500);
  const vars = await page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue("--vocab-color").trim(), document.documentElement.getAttribute("data-vocab-style")]);
  ok("Đổi màu / kiểu → trang cập nhật ngay", vars[0] === "#00ff00" && vars[1] === "background", vars.join(" "));
  await H.patch({ highlightColor: "#ffeb3b", highlightStyle: "underline" });

  await H.patch({ showSelButton: false }); await sleep(300);
  await selectText(page, "#p1", "handy");
  ok("Tắt 'Hiện thanh' → không hiện thanh", !(await barVisible(page)));
  await H.patch({ showSelButton: true, hideSelNative: true }); await sleep(300);
  await selectText(page, "#p2", "khách hàng");
  ok("Bật 'Không hiện khi bôi chữ của bạn' → bôi \"khách hàng\" không hiện thanh", !(await barVisible(page)));
  await selectText(page, "#p1", "handy");
  ok("…nhưng bôi chữ Anh vẫn hiện thanh", await barVisible(page));
  await H.patch({ hideSelNative: false }); await sleep(300);

  await H.patch({ blacklistedHosts: ["localhost"] }); await sleep(1200);
  await selectText(page, "#p1", "handy");
  ok("Chặn trang → gỡ tô sáng VÀ không tô lại (đợi 1.2s), không hiện thanh", (await hlCount(page)) === 0 && !(await barVisible(page)), "highlight còn " + (await hlCount(page)));
  await H.patch({ blacklistedHosts: [] }); await sleep(700);
  ok("Bỏ chặn → tô sáng lại", (await hlCount(page)) > 0);

  await H.patch({ enabled: false }); await sleep(1000);
  ok("Công tắc tổng tắt → gỡ tô sáng trên tab đang mở", (await hlCount(page)) === 0, "còn " + (await hlCount(page)));
  await H.patch({ enabled: true }); await sleep(700);
  ok("Bật lại → tô sáng lại", (await hlCount(page)) > 0);

  await H.patch({ caseSensitive: true }); await sleep(600);
  await page.evaluate(() => { const p = document.createElement("p"); p.id = "p4"; p.textContent = "RESILIENT in caps."; document.body.prepend(p); });
  await sleep(700);
  const caps = await page.$$eval("#p4 .vocab-note-highlight", e => e.length);
  await H.patch({ caseSensitive: false }); await sleep(700);
  const caps2 = await page.$$eval("#p4 .vocab-note-highlight", e => e.length);
  ok("Phân biệt hoa/thường có tác dụng ngay (không cần tải lại)", caps === 0 && caps2 === 1, `bật: ${caps}, tắt: ${caps2}`);

  // Menu ⋯ trên thanh
  await selectText(page, "#p1", "handy");
  await clickBar(page, ".vn-sel-more");
  const menu = await page.$$eval(".vocab-note-sel-menu button", b => b.map(x => x.textContent));
  ok("Thanh nổi có menu ⋯ (tắt trên trang này / tắt thanh / ngôn ngữ / tuỳ chỉnh)", menu.length === 4, menu.join(" | "));
  await page.screenshot({ path: path.join(SHOTS, "vi-3-bar-menu.png") });
  if (menu.length) {
    await page.click('.vocab-note-sel-menu button[data-act="off-here"]'); await sleep(900);
    ({ settings } = await H.store("settings"));
    ok("⋯ → Tắt trên trang này → thêm vào danh sách chặn, gỡ tô sáng", (settings.blacklistedHosts || []).includes("localhost") && (await hlCount(page)) === 0);
    const undo = await page.$('.vocab-note-toast .vn-toast-act');
    if (undo) { await undo.click(); await sleep(800); }
    ({ settings } = await H.store("settings"));
    ok("…Hoàn tác trên toast → bật lại", !(settings.blacklistedHosts || []).includes("localhost") && (await hlCount(page)) > 0);
  }
  await selectText(page, "#p1", "handy");
  await clickBar(page, ".vn-sel-more");
  await page.click('.vocab-note-sel-menu button[data-act="off-bar"]').catch(() => {}); await sleep(500);
  ({ settings } = await H.store("settings"));
  ok("⋯ → Tắt thanh này → showSelButton = false", settings.showSelButton === false);
  await H.patch({ showSelButton: true });

  // Gợi ý tắt thanh sau 15 lần không dùng
  await H.patch({ tipBarAsked: false });
  await page.reload(); await sleep(800);
  for (let i = 0; i < 15; i++) await selectText(page, i % 2 ? "#p1" : "#p3", i % 2 ? "pure" : "Another");
  const hint = await page.$$eval(".vocab-note-toast", t => t.map(x => x.textContent).join(" | "));
  ({ settings } = await H.store("settings"));
  ok("Thanh hiện 15 lần không bấm → hỏi 1 lần có muốn tắt", /làm phiền/.test(hint) && settings.tipBarAsked === true, hint.slice(0, 80));

  // ----- Trang Cài đặt -----
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`); await sleep(800);
  const secs = ["language", "selection", "highlight", "review", "sites", "sync", "general"];
  let allSec = true;
  for (const s of secs) {
    await opt.click(`.nav button[data-sec="${s}"]`); await sleep(120);
    if (!(await opt.$eval(`#sec-${s}`, e => !e.hidden))) allSec = false;
    await opt.screenshot({ path: path.join(SHOTS, `vi-opt-${s}.png`), fullPage: true });
  }
  ok("Cài đặt: 7 mục đều mở được", allSec);
  ok("Cài đặt có công tắc tổng, ô tìm kiếm, chọn ngôn ngữ giao diện", !!(await opt.$("#enabled")) && !!(await opt.$("#setSearch")) && !!(await opt.$("#uiLang")));

  // Link sâu: mở đúng dòng
  await opt.goto(`chrome-extension://${extId}/options.html#selection#showSelButton`); await sleep(500);
  const deep = await opt.evaluate(() => ({ sec: !document.querySelector("#sec-selection").hidden, flash: document.querySelector("#showSelButton").closest(".row").classList.contains("flash") }));
  ok("Link #selection#showSelButton → mở đúng mục, làm nổi đúng dòng", deep.sec && deep.flash, JSON.stringify(deep));

  // Không ghi đè thay đổi từ nơi khác
  await H.patch({ targetLang: "ko", learningMode: true }); await sleep(400);
  await opt.click('.nav button[data-sec="highlight"]');
  await toggle(opt, "caseSensitive"); await sleep(500);
  ({ settings } = await H.store("settings"));
  ok("Cài đặt đang mở KHÔNG ghi đè thay đổi từ thẻ Dịch / popup", settings.targetLang === "ko" && settings.learningMode === true && settings.caseSensitive === true, `targetLang=${settings.targetLang}, learningMode=${settings.learningMode}`);
  ok("Cài đặt đang mở tự cập nhật theo thay đổi ở nơi khác", (await opt.$eval("#targetLang", e => e.value)) === "ko" && (await opt.$eval("#learningMode", e => e.checked)));
  await toggle(opt, "caseSensitive"); await sleep(300);

  // Dấu "đã đổi" + khôi phục mặc định theo mục
  await H.patch({ highlightColor: "#123456" }); await sleep(400);
  ok("Dòng khác mặc định có dấu 'đã đổi'", await opt.$eval("#color", e => e.closest(".row").classList.contains("changed")));
  await opt.click('.sec-reset[data-sec="highlight"]'); await sleep(200);
  await opt.click("#dlgActs .btn.primary"); await sleep(500);
  ({ settings } = await H.store("settings"));
  ok("Khôi phục mặc định cho mục Tô sáng", settings.highlightColor === "#ffeb3b" && settings.caseSensitive === false && settings.targetLang === "ko", `color=${settings.highlightColor}, targetLang (mục khác, giữ)=${settings.targetLang}`);

  // Ngưỡng 'đã thuộc' áp dụng cho từ đã lưu
  await opt.click('.nav button[data-sec="review"]');
  await opt.fill("#threshold", "7"); await opt.press("#threshold", "Tab"); await sleep(700);
  ({ words } = await H.store("words"));
  ok("Đổi 'Sau bao nhiêu lần gặp' → áp dụng cho từ đã lưu", words.every(w => w.sticky || w.autoDeleteAt === 7), words.map(w => w.autoDeleteAt).join(","));

  // Ngôn ngữ của bạn: đổi sang en → đích chữ nước ngoài theo, đích chữ của mình không trùng
  await H.patch({ targetLang: "vi", nativeTargetLang: "en" }); await sleep(300);
  await opt.click('.nav button[data-sec="language"]');
  await opt.selectOption("#nativeLang", "en"); await sleep(600);
  ({ settings } = await H.store("settings"));
  ok("Đổi Ngôn ngữ của bạn → đích dịch đi theo cho hợp lý", settings.nativeLang === "en" && settings.targetLang === "en" && settings.nativeTargetLang === "es", JSON.stringify({ n: settings.nativeLang, t: settings.targetLang, nt: settings.nativeTargetLang }));
  ok("Ô 'dịch chữ của bạn sang' không có chính ngôn ngữ của bạn", !(await opt.$$eval("#nativeTargetLang option", o => o.map(x => x.value))).includes("en"));
  await H.patch({ nativeLang: "vi", targetLang: "vi", nativeTargetLang: "en" }); await sleep(300);

  // Tìm kiếm
  await opt.fill("#setSearch", "mau"); await sleep(300);
  const found = await opt.$$eval("main .row", rs => rs.filter(r => !r.hidden && r.offsetParent).map(r => r.querySelector(".rt b") ? r.querySelector(".rt b").textContent.trim() : ""));
  ok("Tìm 'mau' (không dấu) → chỉ hiện các dòng màu", found.length === 5 && found.includes("Từ vựng"), found.join(", "));
  await opt.fill("#setSearch", "vuong"); await sleep(300);
  const f2 = await opt.$$eval("main .row", rs => rs.filter(r => !r.hidden && r.offsetParent).map(r => r.querySelector(".rt b").textContent.trim()));
  ok("Tìm 'vướng' (từ khoá ẩn) → ra 'Hiện thanh Dịch / Lưu'", f2.some(t => /Hiện thanh/.test(t)), f2.join(", "));
  await opt.screenshot({ path: path.join(SHOTS, "vi-opt-search.png") });
  await opt.fill("#setSearch", "zzzz"); await sleep(300);
  ok("Tìm không ra → báo không tìm thấy", await opt.$eval("#searchEmpty", e => !e.hidden));
  await opt.press("#setSearch", "Escape"); await sleep(200);

  // Công tắc tổng trong Cài đặt
  await opt.click('.nav button[data-sec="sites"]');
  await toggle(opt, "enabled"); await sleep(400);
  ({ settings } = await H.store("settings"));
  ok("Công tắc tổng trong Cài đặt → enabled=false", settings.enabled === false);
  await toggle(opt, "enabled"); await sleep(300);
  await opt.fill("#siteInput", "https://www.facebook.com/abc?x=1"); await opt.click("#siteAddBtn"); await sleep(400);
  ({ settings } = await H.store("settings"));
  ok("Dán link vào ô trang bị tắt → lưu đúng tên miền", JSON.stringify(settings.blacklistedHosts) === '["facebook.com"]', JSON.stringify(settings.blacklistedHosts));

  // Nhập file: Gộp vào KHÔNG ghi đè cài đặt (trừ khi tích chọn)
  await H.patch({ theme: "dark", blacklistedHosts: ["a.com"] });
  const bk = path.join(os.tmpdir(), "hn-e2e-backup.json");
  fs.writeFileSync(bk, JSON.stringify({ version: 1, words: [{ term: "ephemeral", meaning: "phù du" }], settings: { theme: "light", blacklistedHosts: ["b.com"], enabled: false } }));
  await opt.click('.nav button[data-sec="sync"]');
  await opt.setInputFiles("#importFile", bk); await sleep(500);
  await opt.click('#dlgActs .btn.primary'); await sleep(600);
  ({ settings, words } = await H.store(["settings", "words"]));
  ok("Nhập file 'Gộp vào' → thêm mục, GIỮ cài đặt máy này", words.some(w => w.term === "ephemeral") && settings.theme === "dark" && settings.enabled !== false && settings.blacklistedHosts.length === 1,
    `theme=${settings.theme}, enabled=${settings.enabled}, blacklist=${JSON.stringify(settings.blacklistedHosts)}`);
  await opt.setInputFiles("#importFile", bk); await sleep(500);
  await opt.check("#impSettings"); await opt.click('#dlgActs .btn.primary'); await sleep(600);
  ({ settings } = await H.store("settings"));
  ok("…tích 'Nạp cả cài đặt' → áp cài đặt, gộp danh sách trang bị tắt", settings.theme === "light" && settings.blacklistedHosts.length === 2, JSON.stringify(settings.blacklistedHosts));
  await H.patch({ theme: "auto", enabled: true, blacklistedHosts: [] });

  await opt.click('.nav button[data-sec="general"]'); await sleep(300);
  ok("Mục Chung liệt kê phím tắt", (await opt.$$eval("#kbdList .row", r => r.length)) >= 3);

  // ----- Popup -----
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 380, height: 600 });
  await pop.goto(`chrome-extension://${extId}/popup.html`); await sleep(900);
  ok("Popup hiện danh sách", (await pop.$$eval("#list .item", e => e.length)) >= 2);
  await pop.click("#enabledSwitch"); await sleep(400);
  ({ settings } = await H.store("settings"));
  ok("Popup: công tắc tổng ghi enabled=false (không đụng khoá khác)", settings.enabled === false && settings.nativeLang === "vi");
  await pop.click("#enabledSwitch"); await sleep(300);
  const themes = [];
  for (let i = 0; i < 3; i++) { await pop.click("#themeBtn"); await sleep(200); themes.push((await H.store("settings")).settings.theme); }
  ok("Nút giao diện popup quay vòng Sáng → Tối → Tự động", themes.join(">") === "light>dark>auto", themes.join(" → "));
  // Gợi ý bật Chế độ học từ khi đã có ≥ 8 từ vựng
  await H.patch({ learningMode: false, tipLearningAsked: false });
  const many = Array.from({ length: 8 }, (_, i) => ({ id: "t" + i, term: "word" + i, meaning: "nghĩa " + i, type: "vocab", lang: "en", createdAt: new Date().toISOString() }));
  await H.set({ words: [...(await H.store("words")).words, ...many] }); await sleep(600);
  const tip = await pop.$('#list [data-act="tip-learn-on"]');
  ok("Đã lưu ≥ 8 từ vựng → popup gợi ý bật Chế độ học từ (1 lần)", !!tip);
  if (tip) { await pop.click('#list [data-act="tip-learn-no"]'); await sleep(400); }
  ({ settings } = await H.store("settings"));
  ok("…bấm 'Không, cảm ơn' → không hỏi lại", settings.tipLearningAsked === true && !(await pop.$('#list [data-act="tip-learn-on"]')));
  await pop.screenshot({ path: path.join(SHOTS, "vi-popup.png") });

  // ----- Sau khi cập nhật: hỏi có muốn khôi phục cài đặt gốc -----
  // (không giả lập được việc Chrome cập nhật extension → gọi đúng hàm mà onInstalled("update") gọi)
  await H.patch({ tipLearningAsked: true, defaultThreshold: 20, learningMode: false });
  const clean = await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get("settings"); return [prepareUpdateReview(settings, "1.2.0"), prepareUpdateReview({ highlightColor: "#000000" }, chrome.runtime.getManifest().version)]; });
  ok("Cập nhật mà cài đặt đúng mặc định / cùng phiên bản → KHÔNG hỏi", clean[0] === null && clean[1] === null, JSON.stringify(clean));
  await H.patch({ autoBackup: true, showSelButton: false, highlightColor: "#000000" });
  const review = await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get("settings"); const r = prepareUpdateReview(settings, "1.2.0"); await chrome.storage.local.set({ __updateReview: r }); return r; });
  ok("Cập nhật từ 1.2.0 với 3 cài đặt khác mặc định → ghi yêu cầu hỏi", review && review.count === 3 && review.to === "1.2.1", JSON.stringify(review));
  await pop.reload(); await sleep(800);
  const note = await pop.$eval(".update-notice", e => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
  ok("Popup hiện dải hỏi khôi phục cài đặt gốc", /1\.2\.1/.test(note) && /3 cài đặt/.test(note), note.slice(0, 90));
  const [rv] = await Promise.all([ctx.waitForEvent("page"), pop.click('[data-act="update-review"]')]);
  await rv.waitForLoadState(); await sleep(900);
  const rows = await rv.$$eval("#dlgBody .rv-row", rs => rs.map(r => ({ key: r.querySelector("input").dataset.key, checked: r.querySelector("input").checked, tag: r.querySelector(".rv-tag").textContent })));
  ok("Hộp thoại: 3 mục, 'mặc định mới' lên đầu và chọn sẵn, 'đang tắt' thứ 2, 'bạn đã chỉnh' không chọn",
    rows.length === 3 && rows[0].key === "autoBackup" && rows[0].checked && rows[1].key === "showSelButton" && !rows[1].checked && rows[2].key === "highlightColor" && !rows[2].checked,
    rows.map(r => `${r.key}:${r.checked ? "✓" : "·"}`).join(" "));
  await rv.screenshot({ path: path.join(SHOTS, "vi-update-review.png") });
  await rv.click("#dlgActs .btn.primary"); await sleep(700);
  ({ settings } = await H.store("settings"));
  const left = (await H.store("__updateReview")).__updateReview;
  ok("Khôi phục mục đã chọn → chỉ mục đó về mặc định, còn lại giữ; không hỏi lại", settings.autoBackup === false && settings.showSelButton === false && settings.highlightColor === "#000000" && !left,
    `autoBackup=${settings.autoBackup}, showSelButton=${settings.showSelButton}, color=${settings.highlightColor}`);
  await rv.click("#toast .toast-undo"); await sleep(600);
  ({ settings } = await H.store("settings"));
  ok("…Hoàn tác → trả lại đúng như trước", settings.autoBackup === true);
  await rv.close();
  await H.set({ __updateReview: review });
  await pop.bringToFront(); await pop.reload(); await sleep(700);
  await pop.click('[data-act="update-keep"]'); await sleep(400);
  ok("Popup 'Giữ nguyên' → không hỏi nữa", !(await H.store("__updateReview")).__updateReview && !(await pop.$(".update-notice")));
  await H.patch({ autoBackup: false, showSelButton: true, highlightColor: "#ffeb3b" });

  ok("Không có lỗi JS trên các trang", H.errors.length === 0, H.errors.slice(0, 4).join(" | "));
  await H.close();
}

// =====================================================================
async function suiteEn() {
  suite = "en"; console.log("\n=== Trình duyệt tiếng Anh (en-US, America/New_York) ===");
  const H = await launch({ lang: "en-US", tz: "America/New_York" });
  const { ctx, sw, extId } = H;
  let { settings } = await H.store("settings");
  ok("Cài mới ở trình duyệt tiếng Anh → ngôn ngữ của bạn = en, dịch chữ của bạn sang es",
    settings.uiLang === "auto" && settings.nativeLang === "en" && settings.targetLang === "en" && settings.nativeTargetLang === "es",
    JSON.stringify({ ui: settings.uiLang, n: settings.nativeLang, t: settings.targetLang, nt: settings.nativeTargetLang }));
  ok("Service worker: giao diện tiếng Anh, menu chuột phải tiếng Anh",
    (await sw.evaluate(() => HN_I18N.getLang())) === "en" && (await sw.evaluate(() => T("Dịch “%s” (Highlight Note)"))) === "Translate “%s” (Highlight Note)");

  await H.set({ words: [{ id: "a1", term: "serendipity", meaning: "luck", type: "vocab", lang: "en", createdAt: new Date().toISOString() },
    { id: "a2", term: "Call the client", meaning: "", type: "todo", lang: "en", createdAt: new Date().toISOString() }] });

  const welcome = ctx.pages().find(p => p.url().includes("welcome.html"));
  if (welcome) {
    await welcome.reload(); await sleep(700);
    const left = await welcome.evaluate(SCAN_VI);
    ok("Trang chào mừng: không còn chữ tiếng Việt", left.length === 0, left.slice(0, 6).join(" | "));
    await welcome.screenshot({ path: path.join(SHOTS, "en-welcome.png"), fullPage: true });
  }

  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`); await sleep(1000);
  ok("Cài đặt: tiêu đề tiếng Anh", (await opt.title()) === "Highlight Note – Settings", await opt.title());
  let leftAll = [];
  for (const s of ["language", "selection", "highlight", "review", "sites", "sync", "general"]) {
    await opt.click(`.nav button[data-sec="${s}"]`); await sleep(150);
    leftAll = leftAll.concat(await opt.evaluate(SCAN_VI));
    await opt.screenshot({ path: path.join(SHOTS, `en-opt-${s}.png`), fullPage: true });
  }
  ok("Cài đặt (7 mục): không còn chữ tiếng Việt", leftAll.length === 0, [...new Set(leftAll)].slice(0, 6).join(" | "));
  await opt.fill("#setSearch", "color"); await sleep(300);
  ok("Tìm cài đặt bằng tiếng Anh ('color')", (await opt.$$eval("main .row", rs => rs.filter(r => !r.hidden && r.offsetParent).length)) === 5);
  await opt.press("#setSearch", "Escape");
  // reset dialog in English
  await opt.click('.nav button[data-sec="highlight"]');
  await opt.click('.sec-reset[data-sec="highlight"]'); await sleep(250);
  const dlg = await opt.$eval("#dlg", d => d.textContent.replace(/\s+/g, " ").trim());
  ok("Hộp thoại khôi phục bằng tiếng Anh", /Reset/.test(dlg) && !/Khôi phục/.test(dlg), dlg.slice(0, 80));
  await opt.keyboard.press("Escape");

  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 380, height: 600 });
  await pop.goto(`chrome-extension://${extId}/popup.html`); await sleep(900);
  const lp = await pop.evaluate(SCAN_VI);
  ok("Popup: không còn chữ tiếng Việt", lp.length === 0, lp.slice(0, 6).join(" | "));
  await pop.click("#moreBtn"); await sleep(200);
  const menuTxt = await pop.$eval("#moreMenu", m => m.textContent.replace(/\s+/g, " ").trim());
  ok("Popup menu ⋯ bằng tiếng Anh", /Export Markdown/.test(menuTxt) && /Learning mode/.test(menuTxt), menuTxt.slice(0, 90));
  await pop.screenshot({ path: path.join(SHOTS, "en-popup.png") });

  const page = await ctx.newPage();
  await page.goto(H.url); await sleep(900);
  await selectText(page, "#p1", "handy");
  ok("Trang web: thanh nổi hiện", await barVisible(page));
  const barTitle = await page.$eval(".vocab-note-sel-btn .vn-sel-tr", b => b.title).catch(() => "");
  ok("Thanh nổi: chữ của bạn (Anh) → 'Translate to Spanish'", /Translate to Spanish/.test(barTitle), barTitle);
  await clickBar(page, ".vn-sel-more");
  const menu = await page.$$eval(".vocab-note-sel-menu button", b => b.map(x => x.textContent).join(" | "));
  ok("Menu ⋯ bằng tiếng Anh", /Turn off Highlight Note on this site/.test(menu), menu);
  await page.keyboard.press("Escape");
  await selectText(page, "#p1", "handy");
  await clickBar(page, ".vn-sel-tr"); await sleep(1500);
  const lc = await page.evaluate(SCAN_VI, ".vn-tr-card");
  const cardTitle = await page.$eval(".vn-tr-card .vn-tr-title", e => e.textContent).catch(() => "");
  const opts = await page.$$eval(".vn-tr-card .vn-tr-tl option", o => o.map(x => x.textContent)).catch(() => []);
  ok("Thẻ Dịch bằng tiếng Anh, tên ngôn ngữ tiếng Anh", cardTitle === "Translate" && opts.includes("Vietnamese") && lc.length === 0, `${cardTitle}; ${opts.slice(0, 4).join(",")}; sót: ${lc.join(" | ")}`);
  await page.screenshot({ path: path.join(SHOTS, "en-translate.png") });
  await page.keyboard.press("Escape");
  await selectText(page, "#p3", "people");
  await clickBar(page, ".vn-sel-save"); await sleep(400);
  const ls = await page.evaluate(SCAN_VI, ".vn-save-card");
  ok("Thẻ Lưu bằng tiếng Anh", (await page.$(".vn-save-card")) && ls.length === 0, ls.join(" | "));
  await page.screenshot({ path: path.join(SHOTS, "en-save.png") });
  await page.click(".vn-save-card .vn-mini-save"); await sleep(900);
  const toast = await page.$$eval(".vocab-note-toast", t => t.map(x => x.textContent).join(" | "));
  ok("Toast bằng tiếng Anh", /Saved|Added/.test(toast) && !/Đã/.test(toast), toast.slice(0, 80));
  // tooltip
  await page.mouse.click(5, 760);
  const hl = await page.$(".vocab-note-highlight");
  if (hl) { const b = await hl.boundingBox(); await page.mouse.move(b.x + 3, b.y + 3); await sleep(500); }
  const lt = await page.evaluate(SCAN_VI, ".vocab-note-tooltip");
  ok("Tooltip bằng tiếng Anh", lt.length === 0, lt.join(" | "));

  // Đổi giao diện sang tiếng Việt trong Cài đặt → cả trang chuyển ngay
  await opt.bringToFront();
  await opt.click('.nav button[data-sec="language"]');
  await opt.selectOption("#uiLang", "vi"); await sleep(1500);
  const h2 = await opt.$eval("#sec-language h2", e => e.textContent).catch(() => "");
  ok("Chọn giao diện Tiếng Việt → trang Cài đặt chuyển sang tiếng Việt", h2 === "Ngôn ngữ", h2);
  await sleep(300);
  await selectText(page, "#p1", "pure");
  const vtitle = await page.$eval(".vocab-note-sel-btn .vn-sel-tr", b => b.title).catch(() => "");
  ok("…và thanh nổi trên trang web cũng tiếng Việt", /Dịch sang|Xem bản dịch/.test(vtitle), vtitle);

  ok("Không có lỗi JS trên các trang", H.errors.length === 0, H.errors.slice(0, 4).join(" | "));
  await H.close();
}

(async () => {
  const which = process.argv[2];
  try {
    if (!which || which === "vi") await suiteVi();
    if (!which || which === "en") await suiteEn();
  } catch (e) { console.error("CRASH", e); results.push({ suite, name: "CRASH " + e.message.split("\n")[0], pass: false }); }
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(results, null, 2));
  const fail = results.filter(r => !r.pass);
  console.log(`\n${results.length - fail.length}/${results.length} đạt`);
  if (fail.length) { console.log("Trượt:"); fail.forEach(f => console.log(`  [${f.suite}] ${f.name}${f.info ? " — " + f.info : ""}`)); }
  process.exit(fail.length ? 1 : 0);
})();
