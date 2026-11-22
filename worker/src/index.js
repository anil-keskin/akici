// Akıcı AI aracı: uygulama → bu Worker → Gemini. API anahtarı sadece Cloudflare'in gizli ayarında (GEMINI_KEY) durur.
// Güvenlik: sadece POST /chat, boyut sınırları, IP + cihaz başına hız sınırı, sabit model, içerik LOGLANMAZ.
// Ücret güvencesi: faturalandırması KAPALI (ücretsiz kota) bir Gemini anahtarı kullan; en kötü durumda kota dolar, fatura çıkmaz.
// Sırayla denenir: ücretsiz kotada açık olan ilk model kullanılır
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const MODEL = MODELS[0];
let geminiDeadUntil = 0; // bu Worker kopyasında Gemini geçici olarak atlanır
const CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// YouTube araması: resmi YouTube Data API v3 (anahtar gizli ayarda: YOUTUBE_KEY). Sadece altyazılı, aile dostu videolar.
async function ytSearch(url, req, env) {
  const YK = env.YOUTUBE_KEY;
  if (!YK) return json({ error: "YouTube araması henüz kurulmadı (youtube-anahtar.bat)" }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const ok = await env.PER_IP.limit({ key: "yt:" + ip });
  if (!ok.success) return json({ error: "çok hızlı; bir dakika bekle" }, 429);
  const q = (url.searchParams.get("q") || "").slice(0, 100).trim();
  if (!q) return json({ items: [] });
  const api = new URL("https://www.googleapis.com/youtube/v3/search");
  Object.entries({ part: "snippet", type: "video", maxResults: "20", q, videoCaption: "closedCaption", relevanceLanguage: "en", safeSearch: "strict", videoEmbeddable: "true", key: YK })
    .forEach(([k, v]) => api.searchParams.set(k, v));
  const r = await fetch(api, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) { const t = (await r.text()).slice(0, 300); return json({ error: r.status === 403 ? "YouTube araması için Google hesabında YouTube Data API açılmalı" : `YouTube hatası ${r.status}`, detail: t.replace(/AIza[\w-]+/g, "***") }, 502); }
  const d = await r.json();
  return json({ items: (d.items || []).map((x) => ({ id: x.id?.videoId, title: x.snippet?.title, channel: x.snippet?.channelTitle, thumb: x.snippet?.thumbnails?.medium?.url })).filter((x) => x.id) });
}

// Anahtarsız: seçili eğitim kanallarının herkese açık RSS akışı (son ~15 video)
const CHANNELS = {
  bbc: "UCHaHD477h-FeBbVh9Sh7syA", voa: "UCKyTokYo0nK2OA-az-sDijA", lucy: "UCz4tgANd4yy8Oe0iXCdSWfA", vanessa: "UCxJGMJbjokfnr2-s4_RXPxQ",
  teded: "UCsooa4yRKGN_zEE8iknghZA", kurz: "UCsXVk37bltHxD1rDPwtNM8Q", ted: "UCAuUUnT6oDeKwE6v1NGQxug", khan: "UC4a-Gbdw7vOaccHmFo40b9g",
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

// Konuşmayı yazıya çevir: Groq Whisper (ses saklanmaz, sadece iletilir). En fazla ~30 sn / 3 MB.
async function stt(req, env) {
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
  fd.append("language", "en");
  fd.append("response_format", "json");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${env.GROQ_KEY}` }, body: fd });
  if (r.status === 429) return json({ error: "günlük ses kotası doldu; yarın tekrar dene" }, 429);
  if (!r.ok) return json({ error: `ses tanınamadı (${r.status})` }, 502);
  const d = await r.json();
  return json({ text: String(d.text || "").trim() });
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

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Akici-Device", "Access-Control-Max-Age": "86400" };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health") return json({ ok: true, model: MODEL });
    if (req.method === "GET" && url.pathname === "/yt") return ytSearch(url, req, env);
    if (req.method === "GET" && url.pathname === "/ytfeed") return ytFeed(url);
    if (req.method === "POST" && url.pathname === "/stt") return stt(req, env);
    if (url.pathname.startsWith("/sync/")) return sync(req, url, env);
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
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 600, 50), 1200);

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
    if (env.GEMINI_KEY && Date.now() > geminiDeadUntil) {
      for (const model of MODELS.slice(0, 2)) {
        const r = await fetch(UPSTREAM, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GEMINI_KEY}` },
          body: JSON.stringify({ model, messages: clean, max_tokens: maxTokens, ...(body.json ? { response_format: { type: "json_object" } } : {}) }),
        });
        if (r.ok) { const d = await r.json(); return json({ content: d.choices?.[0]?.message?.content ?? "", via: "gemini:" + model, tried }); }
        tried.push(`${model}:${r.status}`);
        if ([401, 402, 403, 429].includes(r.status)) { geminiDeadUntil = Date.now() + 30 * 60_000; break; }
      }
    }
    // C planı: Cloudflare Workers AI (hesapta günlük ücretsiz kota)
    try {
      let out;
      try { out = await env.AI.run(CF_MODEL, { messages: clean, max_tokens: maxTokens }); }
      catch { out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { messages: clean, max_tokens: maxTokens }); } // daha hafif model
      const text = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? "");
      return json({ content: text, via: "cf", tried });
    } catch (e) {
      if (String(e).includes("4006") || String(e).toLowerCase().includes("neuron")) return json({ error: "günlük ücretsiz kota doldu; yarın tekrar dene" }, 429);
      return json({ error: "yapay zekâ şu an yanıt vermiyor", tried }, 502);
    }
  },
};
