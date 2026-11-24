// Akıcı AI aracı: uygulama → bu Worker → Gemini. API anahtarı sadece Cloudflare'in gizli ayarında (GEMINI_KEY) durur.
// Güvenlik: sadece POST /chat, boyut sınırları, IP + cihaz başına hız sınırı, sabit model, içerik LOGLANMAZ.
// Ücretli Gemini SADECE İngilizce uygulama içindir (X-Lokilingo-App: en) ve sadece Groq dolunca çalışır.
// Ücret güvencesi: sabit ucuz model, istek/çıktı sınırı, günlük ve aylık çağrı tavanı + Google tarafında harcama limiti.
const MODEL = "gemini-3.1-flash-lite";
const GEMINI_DAY_CAP = 200, GEMINI_MONTH_CAP = 2500, GEMINI_MAX_INPUT = 16000, GEMINI_MAX_OUTPUT = 1200;
let geminiDeadUntil = 0; // bu Worker kopyasında Gemini geçici olarak atlanır
const CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// YouTube araması: resmi YouTube Data API v3 (anahtar gizli ayarda: YOUTUBE_KEY). Sadece altyazılı, aile dostu videolar.
const langOf = (v) => (v === "de" ? "de" : "en");
async function ytSearch(url, req, env) {
  const YK = env.YOUTUBE_KEY;
  if (!YK) return json({ error: "YouTube araması henüz kurulmadı (youtube-anahtar.bat)" }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const ok = await env.PER_IP.limit({ key: "yt:" + ip });
  if (!ok.success) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  const q = (url.searchParams.get("q") || "").slice(0, 100).trim();
  if (!q) return json({ items: [] });
  const api = new URL("https://www.googleapis.com/youtube/v3/search");
  Object.entries({ part: "snippet", type: "video", maxResults: "20", q, videoCaption: "closedCaption", relevanceLanguage: langOf(url.searchParams.get("lang")), safeSearch: "strict", videoEmbeddable: "true", key: YK })
    .forEach(([k, v]) => api.searchParams.set(k, v));
  const r = await fetch(api, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) { const t = (await r.text()).slice(0, 300); return json({ error: r.status === 403 ? "YouTube araması için Google hesabında YouTube Data API açılmalı" : `YouTube hatası ${r.status}`, detail: t.replace(/AIza[\w-]+/g, "***") }, 502); }
  const d = await r.json();
  return json({ items: (d.items || []).map((x) => ({ id: x.id?.videoId, title: x.snippet?.title, channel: x.snippet?.channelTitle, thumb: x.snippet?.thumbnails?.medium?.url })).filter((x) => x.id) });
}

// Anahtarsız: seçili eğitim kanallarının herkese açık RSS akışı (son ~15 video)
const DE_CHANNELS = { easyde: "UCbxb2fqe9oNgglAoYqsYOtQ", dw: "UCxUWIEL-USsiPak0Qy6_vVg", marija: "UCCAI6jmeW5hWz2-jaLPqLUQ", anja: "UCZwegPHTG4gvnR0WLzaq5OQ", dfd: "UC_0KCpDLHCQd3fNNtfQPyRQ" };
const CHANNELS = {
  bbc: "UCHaHD477h-FeBbVh9Sh7syA", voa: "UCKyTokYo0nK2OA-az-sDijA", lucy: "UCz4tgANd4yy8Oe0iXCdSWfA", vanessa: "UCxJGMJbjokfnr2-s4_RXPxQ",
  teded: "UCsooa4yRKGN_zEE8iknghZA",
  ...DE_CHANNELS, kurz: "UCsXVk37bltHxD1rDPwtNM8Q", ted: "UCAuUUnT6oDeKwE6v1NGQxug", khan: "UC4a-Gbdw7vOaccHmFo40b9g",
};
async function ytFeed(url) {
  const id = CHANNELS[url.searchParams.get("ch") || ""];
  if (!id) return json({ error: "kanal yok" }, 404);
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!r.ok) return json({ error: `akış alınamadı ${r.status}` }, 502);
  const xml = await r.text();
  const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const e = m[1];
    const vid = (e.match(/<yt:videoId>([^<]+)</) || [])[1];
    const title = (e.match(/<title>([^<]*)</) || [])[1] || "";
    const channel = (xml.match(/<author>\s*<name>([^<]+)</) || [])[1] || "";
    return vid ? { id: vid, title, channel, thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` } : null;
  }).filter(Boolean);
  return json({ items });
}

// Bulut sesi (İngilizce): bilgisayarda İngilizce ses yoksa (ör. şirket bilgisayarı) uygulama buradan okur.
// Cloudflare Workers AI ücretsiz payı; metin saklanmaz, aynı metin önbellekten gelir (pay harcanmaz).
const TTS_VOICES = new Set(["asteria", "luna", "stella", "athena", "hera", "orion", "arcas", "perseus", "angus", "orpheus", "helios", "zeus"]);
async function tts(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const device = (req.headers.get("X-Akici-Device") || "").slice(0, 64) || ip;
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").replace(/s+/g, " ").trim();
  const voice = TTS_VOICES.has(body.voice) ? body.voice : "asteria";
  if (!text || text.length > 400) return json({ error: "metin 1-400 karakter olmalı" }, 400);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(voice + "|" + text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = new Request("https://tts.cache/" + hash);
  const hit = await caches.default.match(key);
  if (hit) return new Response(hit.body, { headers: { ...CORS, "Content-Type": "audio/mpeg", "X-Cache": "hit" } });
  const [a, b] = await Promise.all([env.PER_IP.limit({ key: "tts:" + ip }), env.PER_DEVICE.limit({ key: "tts:" + device })]);
  if (!a.success || !b.success) return json({ error: "çok hızlı; biraz bekle" }, 429);
  let out;
  try { out = await env.AI.run("@cf/deepgram/aura-1", { text, speaker: voice, encoding: "mp3" }); }
  catch (e) { return json({ error: "bulut sesi şu an yok", detail: String(e.message || e).slice(0, 120) }, 503); }
  const buf = out instanceof ReadableStream ? await new Response(out).arrayBuffer()
    : out?.audio ? Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0)).buffer
    : out instanceof ArrayBuffer ? out : out?.buffer || null;
  if (!buf || !buf.byteLength) return json({ error: "boş ses" }, 502);
  await caches.default.put(key, new Response(buf, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=2592000" } }));
  return new Response(buf, { headers: { ...CORS, "Content-Type": "audio/mpeg", "X-Cache": "miss" } });
}

// Konuşmayı yazıya çevir: Groq Whisper (ses saklanmaz, sadece iletilir). En fazla ~30 sn / 3 MB.
async function stt(req, env) {
  const lang = langOf(new URL(req.url).searchParams.get("lang"));
  if (!env.GROQ_KEY) return json({ error: "ses tanıma kurulmadı" }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const device = (req.headers.get("X-Akici-Device") || "").slice(0, 64) || ip;
  const [a, b] = await Promise.all([env.PER_IP.limit({ key: "stt:" + ip }), env.PER_DEVICE.limit({ key: "stt:" + device })]);
  if (!a.success || !b.success) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  const len = Number(req.headers.get("Content-Length") || 0);
  if (!len || len > 3_000_000) return json({ error: "ses kaydı çok uzun" }, 413);
  const type = (req.headers.get("Content-Type") || "audio/webm").split(";")[0];
  if (!/^audio\/(webm|ogg|mp4|mpeg|wav|aac|x-m4a)$/.test(type)) return json({ error: "desteklenmeyen ses türü" }, 415);
  const audio = await req.arrayBuffer();
  const ext = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" }[type] || "webm";
  const fd = new FormData();
  fd.append("file", new Blob([audio], { type }), "speech." + ext);
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("language", lang);
  fd.append("response_format", "json");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${env.GROQ_KEY}` }, body: fd });
  if (r.status === 429) return json({ error: "günlük ses kotası doldu; yarın tekrar dene" }, 429);
  if (!r.ok) return json({ error: `ses tanınamadı (${r.status})` }, 502);
  const d = await r.json();
  return json({ text: String(d.text || "").trim() });
}

// ---------------- Podcast + şarkı sözü (anahtarsız, herkese açık kaynaklar) ----------------
// Podcast arama: Apple iTunes Search API (ücretsiz, anahtarsız). Bölümler: podcast'in kendi herkese açık RSS'i.
// Transkript: bölüm ses adresi Groq Whisper'a verilir (ses bizde saklanmaz), sonuç KV'de 60 gün önbellekte (aynı bölüm 2. kez bedava ve anında).
// Şarkı sözü: lrclib.net (ücretsiz, açık, zaman damgalı söz veritabanı).
function safeUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(x.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(x.hostname)) return null;
    return x.toString();
  } catch { return null; }
}
const unx = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? unx(m[1]) : ""; };
const dur = (s) => { if (!s) return 0; if (/^\d+$/.test(s)) return +s; return s.split(":").reduce((a, b) => a * 60 + (+b || 0), 0); };

async function limited(req, env, kind) {
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const ok = await env.PER_IP.limit({ key: kind + ":" + ip });
  return ok.success;
}

async function podSearch(url, req, env) {
  if (!(await limited(req, env, "pod"))) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  const q = (url.searchParams.get("q") || "").slice(0, 100).trim();
  if (!q) return json({ items: [] });
  const r = await fetch(`https://itunes.apple.com/search?media=podcast&limit=25&term=${encodeURIComponent(q)}`, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) {
    // Apple, Cloudflare sunucularını sık sınırlıyor: yedek olarak fyyd.de (açık podcast dizini)
    const f = await fetch(`https://api.fyyd.de/0.2/search/podcast?title=${encodeURIComponent(q)}&count=25`, { cf: { cacheTtl: 86400, cacheEverything: true } });
    if (!f.ok) return json({ error: `arama hatası ${r.status}/${f.status}` }, 502);
    const fd = await f.json();
    return json({ items: (fd.data || []).filter((x) => x.xmlURL).map((x) => ({ id: x.id, title: x.title, author: x.author, art: x.imgURL || x.layoutImageURL, feed: x.xmlURL, n: x.episode_count, genre: "" })) });
  }
  const d = await r.json();
  return json({ items: (d.results || []).filter((x) => x.feedUrl).map((x) => ({ id: x.collectionId, title: x.collectionName, author: x.artistName, art: x.artworkUrl600 || x.artworkUrl100, feed: x.feedUrl, n: x.trackCount, genre: x.primaryGenreName })) });
}

async function podFeed(url, req, env) {
  if (!(await limited(req, env, "pod"))) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  const feed = safeUrl(url.searchParams.get("url") || "");
  if (!feed) return json({ error: "geçersiz adres" }, 400);
  const r = await fetch(feed, { headers: { "User-Agent": "Lokilingo/1.0 (podcast reader)" }, cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!r.ok) return json({ error: `akış alınamadı ${r.status}` }, 502);
  let xml = await r.text();
  if (xml.length > 6_000_000) xml = xml.slice(0, 6_000_000);
  const head = xml.split(/<item[\s>]/i)[0];
  const showImg = (head.match(/<itunes:image[^>]*href="([^"]+)"/i) || [])[1] || (head.match(/<image>[\s\S]*?<url>([^<]+)<\/url>/i) || [])[1] || "";
  const items = [];
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const e = m[1];
    const enc = (e.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i) || [])[1];
    if (!enc) continue;
    items.push({
      title: tag(e, "title").slice(0, 200), audio: enc.replace(/&amp;/g, "&"), date: tag(e, "pubDate"),
      dur: dur(tag(e, "itunes:duration")), desc: tag(e, "itunes:summary") ? tag(e, "itunes:summary").slice(0, 300) : tag(e, "description").slice(0, 300),
      img: (e.match(/<itunes:image[^>]*href="([^"]+)"/i) || [])[1] || showImg,
    });
    if (items.length >= 60) break;
  }
  return json({ title: tag(head, "title"), img: showImg, items });
}

async function sha256hex(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }

/** Zaman damgalı segmentleri okunur satırlara böl (en fazla ~18 kelime, cümle sonunda kes) */
function toLines(segs) {
  const out = [];
  // Noktalamasız uzun segmentleri ~14 kelimelik parçalara böl (zamanı kelime sırasına göre paylaştır)
  const split = [];
  for (const s of segs) {
    const w = String(s.text || "").trim().split(/\s+/).filter(Boolean);
    if (w.length <= 22) { split.push(s); continue; }
    const n = Math.ceil(w.length / 14), per = Math.ceil(w.length / n), span = (s.end ?? s.start + w.length * 0.4) - s.start;
    for (let i = 0; i < w.length; i += per) split.push({ start: s.start + (i / w.length) * span, text: w.slice(i, i + per).join(" ") });
  }
  segs = split;
  for (const s of segs) {
    const text = String(s.text || "").trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.en.split(" ").length + text.split(" ").length <= 18 && !/[.!?]["']?$/.test(last.en)) last.en += " " + text;
    else out.push({ t: Math.round(s.start * 10) / 10, en: text });
  }
  return out;
}

async function podTranscript(req, env) {
  if (!env.GROQ_KEY) return json({ error: "transkript kurulmadı" }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const device = (req.headers.get("X-Akici-Device") || "").slice(0, 64) || ip;
  let body; try { body = await req.json(); } catch { return json({ error: "geçersiz istek" }, 400); }
  const audio = safeUrl(String(body?.audio || ""));
  if (!audio) return json({ error: "geçersiz ses adresi" }, 400);
  const lang = langOf(body?.lang);
  const key = (lang === "en" ? "pt4:" : "pt4" + lang + ":") + (await sha256hex(audio));
  const cached = await env.SYNC.get(key, "json");
  if (cached) return json({ lines: cached, cached: true });
  const [a, b] = await Promise.all([env.PER_IP.limit({ key: "ptr:" + ip }), env.PER_DEVICE.limit({ key: "ptr:" + device })]);
  if (!a.success || !b.success) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  // Podcast adresleri genelde yönlendirmeli (istatistik servisleri); Groq yönlendirme takip etmez → son adresi bul
  let final = audio;
  try {
    const h = await fetch(audio, { method: "GET", headers: { Range: "bytes=0-1", "User-Agent": "Lokilingo/1.0" }, redirect: "follow" });
    final = safeUrl(h.url) || audio;
    const size = Number((h.headers.get("Content-Range") || "").split("/")[1] || h.headers.get("Content-Length") || 0);
    try { await h.body?.cancel(); } catch { /* */ }
    if (size > 100_000_000) return json({ error: "Bu bölüm çok büyük. Daha kısa bir bölüm seç (≈ 60 dk altı)." }, 413);
  } catch { /* olduğu gibi dene */ }
  const fd = new FormData();
  fd.append("url", final);
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("language", lang);
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "segment");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${env.GROQ_KEY}` }, body: fd });
  if (!r.ok) {
    const t = (await r.text().catch(() => "")).slice(0, 300);
    if (r.status === 429) return json({ error: "Saatlik ücretsiz döküm kotası doldu; biraz sonra tekrar dene.", detail: t }, 429);
    if (r.status === 413 || /too large|size/i.test(t)) return json({ error: "Bu bölüm çok uzun/büyük. Daha kısa bir bölüm seç (≈ 30 dk altı).", detail: t }, 413);
    return json({ error: `döküm yapılamadı (${r.status})`, detail: t }, 502);
  }
  const d = await r.json();
  const lines = toLines(d.segments || [{ start: 0, text: d.text }]).slice(0, 4000);
  await env.SYNC.put(key, JSON.stringify(lines), { expirationTtl: 60 * 86400 });
  return json({ lines });
}


/** Podcast sesi aktarıcısı: http (güvensiz) adresli podcastler https uygulamada çalınabilsin. Sadece ses dosyası geçer, saklanmaz. */
async function podAudio(url, req) {
  const src = safeUrl(url.searchParams.get("url") || "");
  if (!src) return new Response("geçersiz", { status: 400, headers: CORS });
  const h = { "User-Agent": "Lokilingo/1.0" };
  const range = req.headers.get("Range"); if (range) h.Range = range;
  const r = await fetch(src, { headers: h, redirect: "follow" });
  const type = r.headers.get("Content-Type") || "";
  if (!/^(audio\/|application\/octet-stream|video\/mp4)/i.test(type)) { try { await r.body?.cancel(); } catch { /* */ } return new Response("ses değil", { status: 415, headers: CORS }); }
  const out = new Headers(CORS);
  for (const k of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag"]) { const v = r.headers.get(k); if (v) out.set(k, v); }
  out.set("Cache-Control", "public, max-age=86400");
  out.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  return new Response(r.body, { status: r.status, headers: out });
}

async function lyrics(url, req, env) {
  if (!(await limited(req, env, "lyr"))) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  const q = (url.searchParams.get("q") || "").slice(0, 120).trim();
  if (!q) return json({ items: [] });
  const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "Lokilingo/1.0 (personal English learning)" }, cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!r.ok) return json({ error: `söz araması hatası ${r.status}` }, 502);
  const d = await r.json();
  return json({ items: (Array.isArray(d) ? d : []).filter((x) => x.syncedLyrics || x.plainLyrics).slice(0, 25).map((x) => ({ id: x.id, title: x.trackName, artist: x.artistName, album: x.albumName, dur: Math.round(x.duration || 0), synced: x.syncedLyrics || "", plain: x.plainLyrics || "" })) });
}

// Bulut yedeği: ilerleme CİHAZDA şifrelenir (AES-GCM, anahtar = kurtarma kodu). Burada sadece okunamaz bir kutu durur.
// Kimlik = kodun SHA-256 özeti (kodun kendisi sunucuya hiç gelmez). E-posta/isim yok. 400 gün kullanılmazsa kendiliğinden silinir.
const SYNC_TTL = 400 * 86400;
async function sync(req, url, env) {
  const id = url.pathname.slice("/sync/".length);
  if (!/^[a-f0-9]{64}$/.test(id)) return json({ error: "geçersiz kimlik" }, 400);
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const ok = await env.PER_IP.limit({ key: "sync:" + ip });
  if (!ok.success) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  if (req.method === "GET" && url.searchParams.has("meta")) {
    const ts = await env.SYNC.get("m:" + id);
    return ts ? json({ ts: Number(ts) }) : json({ error: "yedek yok" }, 404);
  }
  if (req.method === "GET") {
    const v = await env.SYNC.get("d:" + id, "arrayBuffer");
    if (!v) return json({ error: "Bu koda ait yedek bulunamadı" }, 404);
    return new Response(v, { headers: { ...CORS, "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
  }
  if (req.method === "PUT") {
    const len = Number(req.headers.get("Content-Length") || 0);
    if (!len || len > 8_000_000) return json({ error: "yedek çok büyük" }, 413);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 8_000_000 || buf.byteLength < 29) return json({ error: "geçersiz yedek" }, 400);
    const ts = Date.now();
    await env.SYNC.put("d:" + id, buf, { expirationTtl: SYNC_TTL });
    await env.SYNC.put("m:" + id, String(ts), { expirationTtl: SYNC_TTL });
    return json({ ok: true, ts });
  }
  if (req.method === "DELETE") {
    await Promise.all([env.SYNC.delete("d:" + id), env.SYNC.delete("m:" + id)]);
    return json({ ok: true });
  }
  return json({ error: "bulunamadı" }, 404);
}

// Ücretli çağrı sayacı: tavan aşılırsa Gemini o gün/ay hiç çağrılmaz (fatura sürprizi olmasın)
async function geminiBudget(env) {
  const now = new Date().toISOString();
  const dk = "gem:d:" + now.slice(0, 10), mk = "gem:m:" + now.slice(0, 7);
  const [d, m] = await Promise.all([env.SYNC.get(dk), env.SYNC.get(mk)]);
  const dn = Number(d || 0), mn = Number(m || 0);
  if (dn >= GEMINI_DAY_CAP || mn >= GEMINI_MONTH_CAP) return false;
  await Promise.all([env.SYNC.put(dk, String(dn + 1), { expirationTtl: 3 * 86400 }), env.SYNC.put(mk, String(mn + 1), { expirationTtl: 40 * 86400 })]);
  return true;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Akici-Device, X-Lokilingo-App, Range", "Access-Control-Max-Age": "86400" };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health") return json({ ok: true, model: MODEL });
    if (req.method === "GET" && url.pathname === "/yt") return ytSearch(url, req, env);
    if (req.method === "GET" && url.pathname === "/ytfeed") return ytFeed(url);
    if (req.method === "POST" && url.pathname === "/stt") return stt(req, env);
    if (req.method === "POST" && url.pathname === "/tts") return tts(req, env);
    if (url.pathname.startsWith("/sync/")) return sync(req, url, env);
    if (req.method === "GET" && url.pathname === "/pod/search") return podSearch(url, req, env);
    if (req.method === "GET" && url.pathname === "/pod/feed") return podFeed(url, req, env);
    if (req.method === "POST" && url.pathname === "/pod/transcript") return podTranscript(req, env);
    if (req.method === "GET" && url.pathname === "/lyrics") return lyrics(url, req, env);
    if (req.method === "GET" && url.pathname === "/pod/audio") return podAudio(url, req);
    if (req.method !== "POST" || url.pathname !== "/chat") return json({ error: "bulunamadı" }, 404);

    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const device = (req.headers.get("X-Akici-Device") || "").slice(0, 64) || ip;
    const [a, b] = await Promise.all([env.PER_IP.limit({ key: ip }), env.PER_DEVICE.limit({ key: device })]);
    if (!a.success || !b.success) return json({ error: "çok hızlı; bir dakika bekle" }, 429);

    if (Number(req.headers.get("Content-Length") || 0) > 40000) return json({ error: "istek çok büyük" }, 413);
    let body;
    try { body = await req.json(); } catch { return json({ error: "geçersiz istek" }, 400); }
    const msgs = Array.isArray(body?.messages) ? body.messages : null;
    if (!msgs || msgs.length === 0 || msgs.length > 30) return json({ error: "geçersiz mesajlar" }, 400);
    const clean = [];
    for (const m of msgs) {
      if (!m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 6000) return json({ error: "geçersiz mesaj" }, 400);
      clean.push({ role: m.role, content: m.content });
    }
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 600, 50), 3000);

    const tried = [];
    // A planı: Groq (en hızlı; ücretsiz kota). Her modelin kotası ayrı, biri dolarsa sıradakine geç.
    if (env.GROQ_KEY) {
      for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"]) {
        const g = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_KEY}` },
          body: JSON.stringify({
            model, messages: clean, ...(body.json ? { response_format: { type: "json_object" } } : {}),
            // gpt-oss düşünen modeldir: düşünmeyi kısa tut ki cevap yarıda kesilmesin
            ...(model.startsWith("openai/") ? { reasoning_effort: "low", reasoning_format: "hidden", max_completion_tokens: maxTokens + 1500 } : { max_tokens: maxTokens }),
          }),
        });
        if (g.ok) { const gd = await g.json(); return json({ content: gd.choices?.[0]?.message?.content ?? "", via: "groq:" + model, tried }); }
        tried.push(`${model}:${g.status}`);
        if (g.status === 401) break; // anahtar geçersiz
      }
    }
    // B planı: Gemini (anahtar varsa). Ödeme/kota hatası alınca 30 dk hiç deneme (boşa bekletmesin).
    const inputSize = clean.reduce((n, m) => n + m.content.length, 0);
    if (env.GEMINI_KEY && req.headers.get("X-Lokilingo-App") === "en" && inputSize <= GEMINI_MAX_INPUT && Date.now() > geminiDeadUntil && await geminiBudget(env)) {
      const r = await fetch(UPSTREAM, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GEMINI_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: clean, max_tokens: Math.min(maxTokens, GEMINI_MAX_OUTPUT), reasoning_effort: "none", ...(body.json ? { response_format: { type: "json_object" } } : {}) }),
      });
      let text = "";
      if (r.ok) { const d = await r.json(); text = d.choices?.[0]?.message?.content ?? ""; if (text.trim()) return json({ content: text, via: "gemini:" + MODEL, tried }); }
      tried.push(`${MODEL}:${r.ok ? "bos" : r.status}`); // boş cevap da başarısız sayılır, yedeğe geç
      if ([401, 402, 403, 429].includes(r.status)) geminiDeadUntil = Date.now() + 30 * 60_000;
    }
    // C planı: Cloudflare Workers AI (hesapta günlük ücretsiz kota)
    try {
      let out;
      try { out = await env.AI.run(CF_MODEL, { messages: clean, max_tokens: maxTokens }); }
      catch { out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { messages: clean, max_tokens: maxTokens }); } // daha hafif model
      const text = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? "");
      return json({ content: text, via: "cf", tried });
    } catch (e) {
      if (String(e).includes("4006") || String(e).toLowerCase().includes("neuron")) return json({ error: "günlük ücretsiz kota doldu; yarın tekrar dene", tried }, 429);
      return json({ error: "yapay zekâ şu an yanıt vermiyor", tried }, 502);
    }
  },
};
