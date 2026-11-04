// Liệt kê câu tiếng Việt trên giao diện CHƯA có bản dịch trong i18n-en.js.
//   cd tests && npm i && node i18n-missing.js        (thoát mã 1 nếu còn thiếu)
// Trích từ: chuỗi trong JS (cả template `...${x}...` → {0}) và chữ / title / placeholder trong HTML.
// Đoạn bị thẻ HTML cắt rời được kiểm từng mảnh — đúng như lúc i18n.js dịch DOM.
const fs = require("fs"), path = require("path");
const acorn = require("acorn"), walk = require("acorn-walk");
const ROOT = path.join(__dirname, "..");
const FILES = ["content.js", "popup.js", "options.js", "background.js", "welcome.js", "sync.js", "constants.js",
  "options.html", "popup.html", "welcome.html"];
const VN = /[À-ÖØ-öø-ỹ]/;
const norm = s => s.replace(/\s+/g, " ").trim();
// Không phải chữ giao diện (mẫu dữ liệu, tên ngôn ngữ hiển thị qua Intl…)
const IGNORE = [/^Tiếng /, /^(Việt|Anh|Nhật|Hàn|Pháp|Đức|Nga|Thái|Ý|Ả Rập|Hindi|Indonesia|Bồ Đào Nha|Tây Ban Nha|Thổ Nhĩ Kỳ|Trung \((giản|phồn)\))$/,
  /^tiếng$/, /^ubiquitous - /, /[="]\s*\/?>?$/, /^".*title=/, /^data-act=/, /&#10;/];
const out = new Map();
const add = (s, f) => { s = norm(s); if (s && VN.test(s) && !IGNORE.some(r => r.test(s))) { if (!out.has(s)) out.set(s, new Set()); out.get(s).add(f); } };
function frags(s, f) {
  for (const m of s.matchAll(/(?:title|placeholder|aria-label|data-tag|alt)="([^"]*)"/g)) { let i = 0; add(m[1].replace(/\{x\}/g, () => "{" + i++ + "}"), f); }
  s = s.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, "");
  for (let part of s.split(/<[^>]*>/)) {
    let i = 0; part = part.replace(/\{x\}/g, () => "{" + i++ + "}");
    add(part.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'), f);
  }
}
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (f.endsWith(".html")) { frags(src, f); continue; }
  walk.full(acorn.parse(src, { ecmaVersion: "latest" }), n => {
    if (n.type === "Literal" && typeof n.value === "string") frags(n.value.replace(/\{(\d)\}/g, "{x}"), f);
    if (n.type === "TemplateLiteral") {
      let s = "";
      n.quasis.forEach((q, i) => {
        s += q.value.cooked;
        const e = n.expressions[i];
        if (!e) return;
        const code = src.slice(e.start, e.end);
        // biểu thức sinh HTML (icon, nút…) cắt câu ra như một thẻ; còn lại là chỗ điền {0}
        s += /ICON|svg|Html\(|join\(|BRAND|\?\s*`|`|chips|Btn\b|btns|lead/i.test(code) ? "<x>" : "{x}";
      });
      frags(s, f);
    }
  });
}
const self = {};
new Function("self", fs.readFileSync(path.join(ROOT, "i18n-en.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "i18n.js"), "utf8"))(self);
self.HN_I18N.setLang("en");
const missing = [...out.keys()].filter(k => {
  const probe = k.replace(/\{\d\}/g, "X1");
  return self.HN_I18N.tr(probe) === probe && self.HN_I18N.t(k) === k;
}).sort();
for (const k of missing) console.log(`${[...out.get(k)].join(",")}\t${k}`);
console.log(`\n${out.size} câu, thiếu ${missing.length}`);
process.exit(missing.length ? 1 : 0);
