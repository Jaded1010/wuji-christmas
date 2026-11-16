// 零依赖的小服务器: 托管静态页面 + 把大家挂的礼物存到 data/gifts.json
// 运行: node server.js   (默认 http://localhost:3000)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA = path.join(DATA_DIR, "gifts.json");
const ANSWERS_DATA = path.join(DATA_DIR, "answers.json");
const MAX_GIFTS = 300;
const BOXES = new Set(["pudding", "pig", "xmas"]);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json",
};
const PUBLIC = new Set(["index.html", "css", "js", "assets"]);

fs.mkdirSync(DATA_DIR, { recursive: true });
const read = () => { try { return JSON.parse(fs.readFileSync(DATA, "utf8")); } catch { return []; } };
const write = (a) => fs.writeFileSync(DATA, JSON.stringify(a, null, 2));
const readAnswers = () => { try { return JSON.parse(fs.readFileSync(ANSWERS_DATA, "utf8")); } catch { return null; } };
const writeAnswers = (a) => fs.writeFileSync(ANSWERS_DATA, JSON.stringify(a, null, 2));
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

const lastPost = new Map(); // 简单限流: 同一 IP 3 秒内只能挂一个
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/api/answers") {
    if (req.method === "GET") return json(res, 200, { answers: readAnswers() });
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 5000) req.destroy(); });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          if (Array.isArray(b.answers) && b.answers.length === 10) {
            writeAnswers(b.answers);
            return json(res, 200, { success: true, answers: b.answers });
          }
          return json(res, 400, { error: "必须是10道题的答案" });
        } catch { json(res, 400, { error: "格式不对" }); }
      });
      return;
    }
    return json(res, 405, { error: "method" });
  }

  if (url.pathname === "/api/gifts") {
    if (req.method === "GET") return json(res, 200, { gifts: read() });
    if (req.method === "POST") {
      const ip = req.socket.remoteAddress;
      if (Date.now() - (lastPost.get(ip) || 0) < 3000) return json(res, 429, { error: "太快啦,稍等一下" });
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          const g = { from: clean(b.from, 15), gift: clean(b.gift, 30), msg: String(b.msg ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 120), box: BOXES.has(b.box) ? b.box : "xmas" };
          if (!g.from || !g.gift) return json(res, 400, { error: "缺少名字或礼物" });
          const all = read();
          if (all.length >= MAX_GIFTS) return json(res, 400, { error: "树上挂满啦" });
          g.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          g.at = Date.now();
          all.push(g); write(all); lastPost.set(ip, Date.now());
          json(res, 200, { gift: g });
        } catch { json(res, 400, { error: "格式不对" }); }
      });
      return;
    }
    return json(res, 405, { error: "method" });
  }

  // 静态文件(只开放白名单,避免泄露 data/ server.js)
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const top = rel.split("/")[0];
  const file = path.join(ROOT, rel);
  if (!PUBLIC.has(top) || !file.startsWith(ROOT) || rel.split("/").some((p) => p.startsWith("_"))) { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`🎄 乌鸡的圣诞已启动: http://localhost:${PORT}\n   乌鸡本人拆礼物入口: http://localhost:${PORT}/?owner=1`));
