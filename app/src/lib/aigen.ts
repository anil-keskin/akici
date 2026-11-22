// Yapay zekâ alıştırma üreticisi: her konu için, A1 → C2 her seviyede, her seferinde FARKLI içerikle Duolingo tarzı set.
// Çıktı mevcut alıştırma bileşenlerine (Step) çevrilir: boşluk doldurma, çoktan seçmeli, cümle kurma, eşleştirme, sesli söyleme, yazma.
import { aiJson } from "./ai";
import type { Step } from "./lesson";
import type { Level } from "./data";

export type GenKind = "grammar" | "phrase" | "vocab" | "reading" | "free";
export interface GenReq { kind: GenKind; topic: string; lv: Level | string; text?: string; n?: number }
export interface Lecture { summary: string; points: string[]; examples: [string, string][]; mistakes: [string, string, string][] }

const THEMES = ["daily life", "travel", "work and office", "school", "food", "sports", "family", "shopping", "technology", "nature", "movies and music", "health", "city life", "holidays", "friends", "science", "history", "weather", "hobbies", "money"];
const pickTheme = () => THEMES[Math.floor(Math.random() * THEMES.length)];

const LV_HINT: Record<string, string> = {
  A1: "very short and simple sentences (4-8 words), only the most common words",
  A2: "short everyday sentences (6-10 words), common words",
  B1: "natural sentences (8-14 words), some less common words",
  B2: "longer, natural sentences (10-18 words) with richer vocabulary",
  C1: "sophisticated sentences (12-22 words), advanced vocabulary and nuance",
  C2: "near-native, complex and idiomatic sentences (14-26 words), subtle distinctions",
};

const KIND_EN: Record<GenKind, string> = {
  grammar: "the grammar topic",
  phrase: "phrasal verbs / idioms / fixed expressions about",
  vocab: "vocabulary about",
  reading: "the reading text below (comprehension and its key vocabulary)",
  free: "",
};

interface RawItem {
  type?: string; q?: string; a?: string | number; ch?: string[]; o?: string[]; tr?: string; why?: string; en?: string; pairs?: [string, string][];
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Ham JSON'u doğrulanmış alıştırma adımlarına çevir; bozuk olanları at */
export function toSteps(items: RawItem[], topic: string): Step[] {
  const out: Step[] = [];
  for (const it of items) {
    const t = (it.type || "").toLowerCase();
    try {
      if (t === "cloze") {
        const q = clean(it.q), a = clean(it.a), ch = (it.ch || []).map(clean).filter(Boolean);
        if (!q.includes("___") || !a) continue;
        if (ch.length && !ch.some((c) => c.toLowerCase() === a.toLowerCase())) ch.push(a);
        out.push({ t: "gram", topic, q, a, tr: clean(it.tr) || undefined, h: undefined, ch: ch.length >= 2 ? Array.from(new Set(ch)).slice(0, 4) : undefined, why: clean(it.why) || undefined });
      } else if (t === "pick") {
        const o = (it.o || []).map(clean).filter(Boolean);
        const ai = typeof it.a === "number" ? it.a : o.findIndex((x) => x.toLowerCase() === clean(it.a).toLowerCase());
        if (o.length < 2 || ai < 0 || ai >= o.length || !clean(it.q)) continue;
        out.push({ t: "choice", prompt: clean(it.q), tr: clean(it.tr) || undefined, opts: o, a: o[ai], why: clean(it.why) || undefined });
      } else if (t === "build") {
        const en = clean(it.en), tr = clean(it.tr);
        const n = en.split(" ").length;
        if (!en || !tr || n < 3 || n > 16) continue;
        out.push({ t: "build", s: [0, en, tr] });
      } else if (t === "match") {
        const pairs = (it.pairs || []).map((p) => [clean(p?.[0]), clean(p?.[1])] as [string, string]).filter(([a, b]) => a && b);
        const uniq = pairs.filter((p, i) => pairs.findIndex((x) => x[0] === p[0] || x[1] === p[1]) === i);
        if (uniq.length >= 3) out.push({ t: "match", pairs: uniq.slice(0, 5) });
      } else if (t === "speak") {
        // "Say aloud: ‘…’" gibi talimat ve tırnakları at; sadece söylenecek cümle kalsın
        const en = clean(it.en).replace(/^(please\s+)?(say( it| this)?( out)? ?aloud|read( it)? aloud|repeat( after me)?|say)\s*[:\-–]\s*/i, "").replace(/^[‘'"“]+|[’'"”]+$/g, "").trim();
        const tr = clean(it.tr).replace(/^(sesli\s+)?(söyle|oku|tekrarla)\s*[:\-–]\s*/i, "").replace(/^[‘'"“]+|[’'"”]+$/g, "").trim();
        if (en && en.split(" ").length <= 18) out.push({ t: "speak", text: en, tr: tr || undefined });
      } else if (t === "write") {
        const tr = clean(it.tr), a = clean(it.a || it.en);
        if (tr && a && a.split(" ").length <= 12) out.push({ t: "write", tr, a, why: clean(it.why) || undefined });
      }
    } catch { /* bozuk madde: atla */ }
  }
  return out;
}

export async function generateSet(req: GenReq): Promise<Step[]> {
  const lv = String(req.lv || "B1");
  const n = req.n ?? 12;
  const theme = pickTheme();
  const subject = req.kind === "free" ? req.topic : `${KIND_EN[req.kind]} "${req.topic}"`;
  const sys = "You are an expert English teacher for Turkish learners, writing Duolingo-style exercises. Every English sentence must be natural and 100% grammatically correct; answers must be unambiguous (only ONE option correct). Turkish translations must be natural Turkish. Explanations ('why') are in TURKISH, max 20 words. Return ONLY JSON.";
  const user = `Create ${n} varied exercises practising ${subject} for a CEFR ${lv} learner (${LV_HINT[lv] || LV_HINT.B1}).
Use fresh, different sentences each time; this time set most sentences around the theme "${theme}".${req.text ? `\n\nTEXT:\n${req.text.slice(0, 3000)}\n\nBase the exercises on this text (its facts and its useful words).` : ""}
Mix these types (about: 4 cloze, 3 pick, 2 build, 1 match, 1 speak, 1 write):
- {"type":"cloze","q":"sentence with ___ for the missing part","a":"correct answer","ch":["4 options incl. answer"],"tr":"Turkish of the full sentence","why":"Türkçe kısa açıklama"}
- {"type":"pick","q":"question (English, or Turkish if asking about meaning)","o":["4 options"],"a":0,"why":"Türkçe kısa açıklama"}
- {"type":"build","en":"English sentence (5-12 words)","tr":"its Turkish"}
- {"type":"match","pairs":[["english","türkçe"],... 4 pairs]}
- {"type":"speak","en":"a sentence to say aloud","tr":"its Turkish"}
- {"type":"write","tr":"Turkish sentence","a":"its English translation (short)","why":"Türkçe kısa açıklama"}
Return JSON {"items":[...]}`;
  let last: Error | null = null;
  for (let i = 0; i < 2; i++) {
    try {
      const d = await aiJson<{ items: RawItem[] }>(sys, user, 2400);
      const steps = toSteps(d.items || [], req.topic);
      if (steps.length >= 5) return shuffleKeepFirst(steps);
      last = new Error("Yeterli alıştırma üretilemedi");
    } catch (e) { last = e as Error; }
  }
  throw last || new Error("Alıştırma üretilemedi");
}

/** Konuyu seviyeye göre Türkçe anlat (AI); her istekte farklı örnekler */
export async function generateLecture(topic: string, lv: string): Promise<Lecture> {
  const d = await aiJson<Partial<Lecture>>(
    "You are a warm, clear English grammar teacher for Turkish speakers. Explanations in TURKISH, examples in English with Turkish translations. Be correct and concise. Return ONLY JSON.",
    `Teach the English topic "${topic}" to a CEFR ${lv} learner. Theme for examples: ${pickTheme()}.
Return JSON {"summary":"2-3 cümlelik Türkçe özet","points":["4-6 kısa Türkçe kural/ipucu (formüller İngilizce olabilir)"],"examples":[["English example","Türkçesi"], ... 8 tane, kolaydan zora],"mistakes":[["yanlış cümle","doğrusu","Türkçe neden"], ... 3 tane, Türklerin sık yaptığı]}`, 1800);
  const ex = (d.examples || []).filter((x) => Array.isArray(x) && x[0] && x[1]).map((x) => [clean(x[0]), clean(x[1])] as [string, string]);
  if (!d.summary || ex.length < 3) throw new Error("Anlatım üretilemedi, tekrar dene.");
  return {
    summary: clean(d.summary), points: (d.points || []).map(clean).filter(Boolean).slice(0, 8), examples: ex.slice(0, 10),
    mistakes: (d.mistakes || []).filter((x) => Array.isArray(x) && x[0] && x[1]).map((x) => [clean(x[0]), clean(x[1]), clean(x[2])] as [string, string, string]).slice(0, 4),
  };
}

function shuffleKeepFirst<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
