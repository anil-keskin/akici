// Claude Yapıtları (claude.ai artifact) sürümü: dış sitelere erişim yok; yapay zekâ = Claude ("sample"), mikrofon = Claude dikte ("dictation").
// Normal sürümde ART=false ve bu dosyanın hiçbir yolu çalışmaz.
export const ART = import.meta.env.VITE_ARTIFACT === "1";

type Use = (name: string) => Promise<unknown>;
const use = (n: string): Promise<unknown> => {
  const c = (window as unknown as { claude?: { use?: Use } }).claude;
  return c?.use ? c.use(n).catch(() => null) : Promise.resolve(null);
};

export interface Sample {
  (input: string | { role: "user" | "assistant"; content: string }[], opts?: { modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<{ text: string; truncated?: boolean }>;
}
export interface Dictation {
  start(): Promise<void>; stop(): Promise<void>;
  onPartial(fn: (e: { text: string }) => void): () => void;
  onFinal(fn: (e: { text: string }) => void): () => void;
  onState(fn: (e: { state: string; reason?: string }) => void): () => void;
}

export interface Tts {
  speak(text: string, opts?: { rate?: number; language?: string; voice?: string }): Promise<{ playedMs: number }>;
  stop(): Promise<void>;
}
/** Claude sesi (tts): yapıtlarda tarayıcının ses motoru çalışmıyor */
export let ttsReady: Tts | null = null;
if (ART) (use("tts") as Promise<Tts | null>).then((t) => { ttsReady = t; });

let samp: Promise<Sample | null> | null = null;
let dict: Promise<Dictation | null> | null = null;
export const sampleCap = () => (samp ??= use("sample") as Promise<Sample | null>);
export const dictationCap = () => (dict ??= use("dictation") as Promise<Dictation | null>);
/** Dikteyi önceden hazırla: start() tıklamanın hemen içinde (beklemeden) çağrılabilsin */
export let dictReady: Dictation | null = null;
if (ART) dictationCap().then((d) => { dictReady = d; });

/** Claude'a sor: sistem talimatı + konuşma geçmişi → metin */
export async function claudeChat(messages: { role: "system" | "user" | "assistant"; content: string }[], json: boolean, quick = false): Promise<string> {
  const s = await sampleCap();
  if (!s) throw new Error("Yapay zekâ bu görünümde kapalı (Claude izni verilmedi).");
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const conv = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  if (!conv.length || conv[conv.length - 1].role !== "user") conv.push({ role: "user", content: "Continue." });
  // Sistem talimatını ilk kullanıcı mesajına göm (sample hafızasız; talimat + veri + biçim tek seferde gider)
  const pre = `${sys ? `INSTRUCTIONS:\n${sys}\n\n` : ""}${json ? "Reply with ONLY valid JSON, no prose, no code fences.\n\n" : ""}`;
  if (conv[0].role === "user") conv[0] = { role: "user", content: pre + conv[0].content };
  else conv.unshift({ role: "user", content: pre + "(The conversation starts below.)" });
  const r = await s(conv, { modelTier: quick ? "quick" : "default", cache: false });
  return r.text || "";
}
