// Akıcı AI aracı: uygulama → bu Worker → Gemini. API anahtarı sadece Cloudflare'in gizli ayarında (GEMINI_KEY) durur.
// Güvenlik: sadece POST /chat, boyut sınırları, IP + cihaz başına hız sınırı, sabit model, içerik LOGLANMAZ.
// Ücret güvencesi: faturalandırması KAPALI (ücretsiz kota) bir Gemini anahtarı kullan; en kötü durumda kota dolar, fatura çıkmaz.
const MODEL = "gemini-flash-latest";
const UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Akici-Device", "Access-Control-Max-Age": "86400" };

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/health") return json({ ok: true, model: MODEL });
    if (req.method !== "POST" || url.pathname !== "/chat") return json({ error: "bulunamadı" }, 404);
    if (!env.GEMINI_KEY) return json({ error: "sunucu ayarlanmamış" }, 503);

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

    const call = (fmt) => fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GEMINI_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: clean, max_tokens: maxTokens, temperature: 0.7, ...(fmt ? { response_format: { type: "json_object" } } : {}) }),
    });
    let r = await call(!!body.json);
    if (body.json && r.status === 400) r = await call(false);
    if (r.status === 429) return json({ error: "günlük ücretsiz kota doldu; yarın tekrar dene" }, 429);
    if (!r.ok) return json({ error: `yapay zekâ hatası ${r.status}` }, 502);
    const d = await r.json();
    return json({ content: d.choices?.[0]?.message?.content ?? "" });
  },
};
