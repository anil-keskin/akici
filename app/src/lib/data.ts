// İçerik verisi: /data/*.json (açık lisanslı kaynaklardan üretildi, bkz. Hakkında).
export type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const LEVEL_TR: Record<Level, string> = {
  A1: "Başlangıç", A2: "Temel", B1: "Orta", B2: "Orta üstü", C1: "İleri", C2: "Ustalık",
};
export interface Def { p: string; g: string; ex?: string | null }
export interface Word {
  id: number; w: string; ipa?: string | null; pos: string[]; tr: string[]; d: Def[]; lv: Level;
  f: string[]; syn: string[]; ant: string[]; fl: string[]; z: number; s: number[]; mt?: number;
}
export interface Phrase { id: number; w: string; k: "phrasal" | "idiom" | "proverb" | "phrase"; tr: string[]; g: string; ex?: string | null; z: number; lv: Level }
export type Sentence = [number, string, string]; // id, en, tr
export interface Meta { words: number; sentences: number; phrases: number; wordChunks: number; levels: Level[]; pos_tr: Record<string, string> }

const cache = new Map<string, Promise<unknown>>();
export function load<T>(name: string): Promise<T> {
  if (!cache.has(name)) {
    cache.set(name, fetch(`${import.meta.env.BASE_URL}data/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${name} yüklenemedi (${r.status})`);
      return r.json();
    }).catch((e) => { cache.delete(name); throw e; }));
  }
  return cache.get(name) as Promise<T>;
}

export const meta = () => load<Meta>("meta.json");

let allWords: Promise<Word[]> | null = null;
export function words(): Promise<Word[]> {
  if (!allWords) {
    allWords = meta().then((m) => Promise.all(Array.from({ length: m.wordChunks }, (_, i) => load<Word[]>(`words-${i}.json`))))
      .then((parts) => parts.flat());
    allWords.catch(() => { allWords = null; });
  }
  return allWords;
}
export async function wordsFirst(): Promise<Word[]> { return load<Word[]>("words-0.json"); } // ilk 5000 hızlı

let formIndex: Promise<Map<string, Word>> | null = null;
/** "ran" → run, "children" → child: okuma ve dikte için kök bulma */
export function lookup(): Promise<Map<string, Word>> {
  if (!formIndex) {
    formIndex = words().then((ws) => {
      const m = new Map<string, Word>();
      for (const w of ws) for (const f of w.f) if (!m.has(f)) m.set(f, w);
      for (const w of ws) m.set(w.w.toLowerCase(), w);
      return m;
    });
  }
  return formIndex;
}
export async function findWord(token: string): Promise<Word | undefined> {
  const m = await lookup();
  const t = token.toLowerCase().replace(/[’']/g, "'").replace(/^'+|'+$/g, "");
  return m.get(t) || m.get(t.replace(/'s$/, "")) || m.get(t.replace(/s$/, "")) || m.get(t.replace(/(ed|ing)$/, "")) || m.get(t.replace(/ies$/, "y"));
}
export async function wordById(id: number): Promise<Word | undefined> {
  const ws = await words();
  return ws[id - 1]?.id === id ? ws[id - 1] : ws.find((w) => w.id === id);
}

export const phrases = () => load<Phrase[]>("phrases.json");
export const sentences = (lv: Level) => load<Sentence[]>(`sent-${lv}.json`);
const sentIdx = new Map<number, Sentence>();
export async function sentencesById(ids: number[], hint: Level[] = LEVELS): Promise<Sentence[]> {
  const missing = ids.filter((i) => !sentIdx.has(i));
  for (const lv of hint) {
    if (!missing.some((i) => !sentIdx.has(i))) break;
    for (const s of await sentences(lv)) sentIdx.set(s[0], s);
  }
  return ids.map((i) => sentIdx.get(i)).filter(Boolean) as Sentence[];
}
export const minimalPairs = () => load<Record<string, [string, string][]>>("minimal-pairs.json");

export function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
export function pick<T>(a: T[], n: number): T[] { return shuffle(a).slice(0, n); }
export const POS_TR: Record<string, string> = {
  noun: "isim", verb: "fiil", adj: "sıfat", adv: "zarf", pron: "zamir", prep: "edat", conj: "bağlaç", det: "belirteç",
  intj: "ünlem", num: "sayı", phrase: "kalıp", prep_phrase: "edat öbeği", proverb: "atasözü", particle: "parçacık",
  article: "tanımlık", contraction: "kısaltma", postp: "edat",
};
export const KIND_TR = { phrasal: "Phrasal verb", idiom: "Deyim", proverb: "Atasözü", phrase: "Kalıp" } as const;
