// Ağsız test: Groq dolu senaryosu, sadece İngilizce Gemini kullanır, tavan çalışır.
import worker from "./src/index.js";
const calls = [];
globalThis.fetch = async (u, o) => {
  const url = String(u); calls.push(url);
  if (url.includes("groq.com")) return new Response("{}", { status: globalThis.groq });
  if (url.includes("generativelanguage")) { globalThis.sent = JSON.parse(o.body); return Response.json({ choices: [{ message: { content: "gem" } }] }); }
  throw new Error(url);
};
const kv = new Map();
const env = { GROQ_KEY: "x", GEMINI_KEY: "y", PER_IP: { limit: async () => ({ success: true }) }, PER_DEVICE: { limit: async () => ({ success: true }) },
  SYNC: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v) }, AI: { run: async () => ({ response: "cf" }) } };
const ask = async (app, content = "hi") => {
  const headers = { "Content-Type": "application/json", "X-Akici-Device": "t" }; if (app) headers["X-Lokilingo-App"] = app;
  const r = await worker.fetch(new Request("https://x/chat", { method: "POST", headers, body: JSON.stringify({ messages: [{ role: "user", content }], max_tokens: 3000 }) }), env);
  return (await r.json()).via?.split(":")[0];
};
const ok = (n, a, b) => { if (a !== b) { console.log("HATA", n, a, b); process.exitCode = 1; } else console.log("ok ", n); };
globalThis.groq = 200; const g = await (async () => { globalThis.fetch0 = fetch; const f = fetch; globalThis.fetch = async (u, o) => String(u).includes("groq") ? Response.json({ choices: [{ message: { content: "g" } }] }) : f(u, o); const v = await ask("en"); globalThis.fetch = f; return v; })();
ok("Groq açıkken İngilizce Groq", g, "groq");
globalThis.groq = 429;
ok("Groq dolu: Almanca Gemini kullanmaz", await ask("de"), "cf");
ok("Groq dolu: başlıksız eski istek Gemini kullanmaz", await ask(null), "cf");
ok("Groq dolu: büyük istek Gemini kullanmaz", await ask("en", "x".repeat(5900).repeat(1)) , "gemini");
ok("model sabit", globalThis.sent.model, "gemini-3.1-flash-lite");
ok("çıktı sınırı", globalThis.sent.max_tokens, 1200);
const day = "gem:d:" + new Date().toISOString().slice(0, 10);
kv.set(day, "200"); ok("günlük tavan", await ask("en"), "cf"); kv.set(day, "0");
kv.set("gem:m:" + new Date().toISOString().slice(0, 7), "2500"); ok("aylık tavan", await ask("en"), "cf");
