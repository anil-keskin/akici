// Lokilingo'nun Claude Yapıtları (claude.ai artifact) sürümünü üretir → app/artifact-out/
// - VITE_ARTIFACT=1 ile derler (PWA yok, yapay zekâ = Claude, mikrofon = Claude dikte)
// - 1.173 kitabı ~50'şerli paketlere toplar (yapıt başına dosya sınırı 511)
// - Ses dosyalarını almaz (sesli okuma tarayıcının ses motoruyla yapılır)
// - lokilingo-app.html: yapıtın sayfası (doctype/head yok; yayınlarken Claude sarar)
// Çalıştırma: node scripts/build-artifact.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(import.meta.dirname, "..");
const OUT = path.join(APP, "artifact-out");
const PUB = path.join(APP, "public");

execSync("npx vite build", { cwd: APP, stdio: "inherit", env: { ...process.env, VITE_ARTIFACT: "1" } });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "data", "media"), { recursive: true });
fs.mkdirSync(path.join(OUT, "data", "books"), { recursive: true });
fs.cpSync(path.join(APP, "dist-artifact", "assets"), path.join(OUT, "assets"), { recursive: true });
for (const f of ["icon.svg", "icon-192.png"]) if (fs.existsSync(path.join(PUB, f))) fs.copyFileSync(path.join(PUB, f), path.join(OUT, f));

// Ana veri + medya
for (const f of fs.readdirSync(path.join(PUB, "data"))) {
  const p = path.join(PUB, "data", f);
  if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(OUT, "data", f));
}
for (const f of fs.readdirSync(path.join(PUB, "data", "media"))) fs.copyFileSync(path.join(PUB, "data", "media", f), path.join(OUT, "data", "media", f));

// Kitapları paketle (her paket en fazla ~3 MB ve 60 kitap)
const BOOKS = path.join(PUB, "data", "books");
fs.copyFileSync(path.join(BOOKS, "index.json"), path.join(OUT, "data", "books", "index.json"));
const map = {}; let pack = {}, size = 0, n = 0, count = 0;
const flush = () => { if (!count) return; fs.writeFileSync(path.join(OUT, "data", `books-pack-${n}.json`), JSON.stringify(pack)); n++; pack = {}; size = 0; count = 0; };
for (const f of fs.readdirSync(BOOKS).filter((x) => x.endsWith(".json") && x !== "index.json").sort()) {
  const txt = fs.readFileSync(path.join(BOOKS, f), "utf8").replace(/�/g, ""); // bozuk karakterler (yapıt sistemi kabul etmiyor)
  if (size + txt.length > 3_000_000 || count >= 60) flush();
  const id = f.slice(0, -5);
  pack[id] = JSON.parse(txt); map[id] = n; size += txt.length; count++;
}
flush();
fs.writeFileSync(path.join(OUT, "data", "books-packs.json"), JSON.stringify(map));

// Sayfa: Vite'in index.html'inden script/css bağlantılarını al, yapıt biçimine çevir
const html = fs.readFileSync(path.join(APP, "dist-artifact", "index.html"), "utf8");
const tags = [...html.matchAll(/<(script|link)\b[^>]*(?:src|href)="\.?\/?(assets\/[^"]+)"[^>]*>(?:<\/script>)?/g)].map((m) => m[0].replace(/"\.?\/?(assets\/)/, '"$1'));
const page = `<title>Lokilingo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="icon" type="image/svg+xml" href="icon.svg">
${tags.filter((t) => t.startsWith("<link")).join("\n")}
<div id="root"></div>
${tags.filter((t) => t.startsWith("<script")).join("\n")}
`;
fs.writeFileSync(path.join(OUT, "lokilingo-app.html"), page);

// Yayın listesi (Artifact files haritası için)
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f !== "lokilingo-app.html") files.push(path.relative(OUT, p).split(path.sep).join("/")); } };
walk(OUT);
fs.writeFileSync(path.join(APP, "artifact-files.json"), JSON.stringify(files, null, 0));
const total = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`artifact-out: ${files.length} dosya, ${(total / 1e6).toFixed(1)} MB, ${n} kitap paketi`);
