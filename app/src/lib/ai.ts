// Yapay zekâ öğretmeni. Varsayılan: bu bilgisayardaki Ollama (yerel sunucu üzerinden, metin dışarı çıkmaz).
// İsteğe bağlı: OpenAI uyumlu ya da Anthropic API (kullanıcının kendi anahtarıyla, yurtdışı aktarım uyarılı).
import { getSettings } from "./settings";
import { serverPost } from "./speech";

export type Msg = { role: "user" | "assistant" | "system"; content: string };
export interface Turn { fix?: string; why?: string; reply: string }

const JSON_RULE = `
Respond ONLY with a JSON object: {"fix": "", "why": "", "reply": ""}
- "fix": if the learner's last message has a grammar/vocabulary mistake, the full corrected sentence in English; otherwise "".
- "why": if there is a fix, a very short explanation IN TURKISH; otherwise "".
- "reply": your natural spoken reply in English (never include the correction here).`;

export interface Persona { name: string; role: string; color: string; skin: string; hair: string; voice: "female" | "male" }
export const PERSONAS: Record<string, Persona> = {
  aki: { name: "Loki", role: "Öğretmen bulldog", color: "#c9a37a", skin: "#f2c9a5", hair: "#2b1d16", voice: "male" },
  sam: { name: "Sam", role: "Sınav görevlisi", color: "#14b892", skin: "#8d5a3b", hair: "#1a1a1a", voice: "male" },
  emma: { name: "Emma", role: "Garson, resepsiyonist…", color: "#ff6b5b", skin: "#f7d7c4", hair: "#c8872f", voice: "female" },
  leo: { name: "Leo", role: "Yönetici, komşu…", color: "#2f9bff", skin: "#d9a27a", hair: "#4a2f1c", voice: "male" },
};

export const MODES = {
  free: {
    title: "Serbest sohbet", persona: "aki", json: true,
    system: (lv: string) => `You are Aki, a warm, curious English conversation partner for a Turkish learner at CEFR ${lv} level.
Speak naturally at ${lv} level (short, simple sentences for A1-A2). Keep replies to 1-3 sentences and usually end with a question.
If the learner writes Turkish, answer in English and show how to say it in English.` + JSON_RULE,
  },
  roleplay: {
    title: "Rol yapma", persona: "emma", json: true,
    system: (lv: string, ctx = "") => `You are role-playing with a Turkish English learner (CEFR ${lv}). Scenario: ${ctx}
Stay in character, 1-3 natural sentences per turn at ${lv} level, move the scene forward with questions.
When the scenario goal is reached, start the reply with "🎉 Scenario complete!" and add 2 short tips in Turkish.` + JSON_RULE,
  },
  exam: {
    title: "Sınav konuşması", persona: "sam", json: true,
    system: (lv: string) => `You are Sam, an IELTS speaking examiner practising with a Turkish learner (around CEFR ${lv}).
Ask ONE exam question at a time (Part 1 personal questions, then a Part 2 cue card, then Part 3 discussion).
In "reply": first a one-line band estimate and one concrete tip in Turkish for the previous answer (skip on the first turn), then the next question in English.` + JSON_RULE,
  },
  correct: {
    title: "Yazımı düzelt", persona: "aki", json: false,
    system: (lv: string) => `You are an English writing teacher for a Turkish learner (CEFR ${lv}). The learner sends a text.
Respond in this exact structure:
✅ Düzeltilmiş metin: the fully corrected text.
🔍 Hatalar: a list "wrong → right — short Turkish explanation".
⭐ Daha doğal: one more natural version.
📊 Tahmini seviye: CEFR estimate and one tip in Turkish.`,
  },
  explain: {
    title: "Bana açıkla", persona: "aki", json: false,
    system: (lv: string) => `You are a friendly English teacher who explains in TURKISH to a Turkish learner (CEFR ${lv}).
Explain grammar, words, idioms or differences clearly with 3-5 short English examples (with Turkish translations). Mention common mistakes Turkish speakers make. Use short headings and bullet points. No HTML.`,
  },
  vocab: {
    title: "Kelime koçu", persona: "aki", json: false,
    system: (lv: string) => `You are a vocabulary coach for a Turkish learner (CEFR ${lv}). For each word: Turkish meaning, 2 natural example sentences with Turkish, common collocations, a memorable mnemonic in Turkish. Then quiz the learner with one fill-in-the-blank question.`,
  },
} as const;
export type Mode = keyof typeof MODES;

// Herkese açık Loki AI aracı (Cloudflare Worker). Adres gizli değildir; anahtar sunucuda durur.
export const AKICI_AI = "https://akici-ai.akici-app.workers.dev";
function deviceId(): string {
  try {
    let id = localStorage.getItem("akici-device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("akici-device", id); }
    return id;
  } catch { return "anon"; }
}

async function raw(messages: Msg[], maxTokens: number, json: boolean): Promise<string> {
  const s = getSettings();
  if (s.aiProvider === "local") {
    const r = await serverPost<{ content: string }>("/api/chat", JSON.stringify({ model: s.aiModel || "qwen3:8b", messages, max_tokens: maxTokens, json }));
    return r.content;
  }
  if (s.aiProvider === "akici") {
    if (!AKICI_AI) throw new Error("Loki AI henüz açılmadı. Ayarlar → Yapay zekâ'dan başka bir sağlayıcı seç.");
    const body = JSON.stringify({ messages: messages.map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })).slice(-30), max_tokens: maxTokens, json });
    // Ağ kopması / anlık yoğunlukta 2 kez daha dene (kullanıcı "cevap vermiyor" görmesin)
    let last = "";
    for (let i = 0; i < 3; i++) {
      if (i) await new Promise((r) => setTimeout(r, i * 1500));
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
      try {
        const r = await fetch(`${AKICI_AI}/chat`, { method: "POST", headers: { "Content-Type": "application/json", "X-Akici-Device": deviceId() }, body, signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        if (r.ok && (d.content || "").trim()) return d.content;
        last = d.error ? `Loki AI: ${d.error}` : r.ok ? "Loki AI boş cevap verdi" : `Loki AI hatası ${r.status}`;
        if (r.status === 400 || r.status === 413) break;
      } catch (e) { last = (e as Error).name === "AbortError" ? "Loki AI geç cevap verdi (internet yavaş olabilir)" : "İnternet bağlantısı yok gibi"; }
      finally { clearTimeout(to); }
    }
    throw new Error(last);
  }
  if (!s.aiKey) throw new Error("API anahtarı girilmemiş (Ayarlar → Yapay zekâ).");
  if (s.aiProvider === "openai") {
    const call = (fmt: boolean) => fetch(`${s.aiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.aiKey}` },
      body: JSON.stringify({ model: s.aiModel || "gpt-4o-mini", messages, max_tokens: Math.max(maxTokens, 1024), temperature: 0.7, ...(fmt ? { response_format: { type: "json_object" } } : {}) }),
    });
    let r = await call(json);
    if (json && r.status === 400) r = await call(false); // JSON modunu desteklemeyen sağlayıcı: düz metinle tekrar dene
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "API anahtarı geçersiz (Ayarlar → Yapay zekâ)." : r.status === 429 ? "Kota doldu ya da çok hızlı istek; biraz sonra dene." : r.status === 402 ? "Hesapta kredi yok." : `API hatası ${r.status}`);
    const d = await r.json();
    return d.choices?.[0]?.message?.content ?? "";
  }
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": s.aiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({
      model: s.aiModel || "claude-haiku-5-5", max_tokens: Math.max(maxTokens, 1024), system, messages: messages.filter((m) => m.role !== "system"),
      // Sohbet hızlı ve ucuz olsun: Haiku 5.5'te düşünme kapalı + düşük efor (diğer modellerde varsayılan kalır)
      ...(/^claude-haiku-5/.test(s.aiModel || "claude-haiku-5-5") ? { thinking: { type: "disabled" }, output_config: { effort: "low" } } : {}),
    }),
  });
  if (!r.ok) throw new Error(r.status === 401 ? "API anahtarı geçersiz (Ayarlar → Yapay zekâ)." : r.status === 429 ? "Çok hızlı istek ya da kredi bitti; biraz sonra dene." : `API hatası ${r.status}`);
  const d = await r.json();
  return (d.content || []).map((b: { type: string; text?: string }) => (b.type === "text" ? b.text : "")).join("");
}

/** Düz metin cevap (açıklama, düzeltme modları) */
export async function chat(messages: Msg[], opts: { maxTokens?: number } = {}): Promise<string> {
  return clean(await raw(messages, opts.maxTokens ?? 700, false));
}

/** Konuşma turu: düzeltme + cevap ayrı gelir */
export async function chatTurn(messages: Msg[]): Promise<Turn> {
  const text = await raw(messages, 400, true);
  return parseTurn(text);
}
export function parseTurn(text: string): Turn {
  const t = clean(text);
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      const reply = String(o.reply ?? o.response ?? "").trim();
      if (reply) return { fix: String(o.fix || "").trim() || undefined, why: String(o.why || "").trim() || undefined, reply };
    } catch { /* düz metne düş */ }
  }
  const fixLine = t.split("\n").find((l) => l.includes("✏️"));
  return { fix: fixLine?.replace(/✏️\s*/, "").trim(), reply: t.replace(fixLine || "", "").trim() || t };
}

/** Model çıktısını düz metne indirger (HTML basılmaz; XSS yok). */
export function clean(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)\*(\S[^*]*\S)\*(?=\s|$)/g, "$1$2").trim();
}

const trCache = new Map<string, string>();
/** Bir İngilizce cümleyi doğal Türkçeye çevirir (seçili yapay zekâ ile). */
export async function translateTr(en: string): Promise<string> {
  const k = en.trim();
  if (trCache.has(k)) return trCache.get(k)!;
  const out = clean(await raw([
    { role: "system", content: "You are a professional English-Turkish translator. Translate the user's English text into natural, correct Turkish. Output ONLY the Turkish translation, nothing else." },
    { role: "user", content: k.slice(0, 1500) },
  ], 400, false)).replace(/^["“]|["”]$/g, "").trim();
  trCache.set(k, out);
  return out;
}
/** Metindeki n. kelimenin geçtiği cümleyi bulur */
export function sentenceAt(text: string, charPos: number): string {
  const parts = text.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [text];
  let acc = 0;
  for (const p of parts) { if (charPos < acc + p.length) return p.trim(); acc += p.length; }
  return parts[parts.length - 1].trim();
}

/** Yapay zekâdan JSON ister (Keşfet yazıları vb.) */
export async function aiJson<T>(system: string, user: string, maxTokens = 900): Promise<T> {
  const t = await raw([{ role: "system", content: system }, { role: "user", content: user }], maxTokens, true);
  const m = t.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Yapay zekâ beklenmedik cevap verdi, tekrar dene.");
  return JSON.parse(m[0]) as T;
}
