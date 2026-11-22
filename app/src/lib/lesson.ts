// Ders kurgusu: bir kelime için alıştırma türü seçimi + çeldirici üretimi.
import { pick, sentencesById, type Word, type Sentence, type Level, LEVELS } from "./data";

export type Step =
  | { t: "intro"; w: Word; ex?: Sentence }
  | { t: "en2tr"; w: Word; opts: string[]; card?: string }
  | { t: "tr2en"; w: Word; opts: string[]; card?: string }
  | { t: "type"; w: Word; card?: string }
  | { t: "listen"; w: Word; card?: string }
  | { t: "cloze"; w: Word; s: Sentence; opts: string[]; card?: string }
  | { t: "build"; s: Sentence }
  | { t: "dict"; s: Sentence }
  | { t: "speak"; text: string; tr?: string }
  | { t: "match"; pairs: [string, string][] }
  | { t: "gram"; topic: string; q: string; a: string; tr?: string; h?: string; ch?: string[]; why?: string }
  | { t: "choice"; prompt: string; tr?: string; opts: string[]; a: string; why?: string }
  | { t: "write"; tr: string; a: string; why?: string };

export function meaning(w: Word) { return w.tr[0] || w.d[0]?.g || w.w; }

export function distractors(w: Word, pool: Word[], n = 3, field: "tr" | "w" = "tr"): string[] {
  const near = pool.filter((x) => x.id !== w.id && (field === "w" || x.tr.length) && Math.abs(x.id - w.id) < 1500 && x.pos[0] === w.pos[0]);
  const src = near.length >= n ? near : pool.filter((x) => x.id !== w.id && (field === "w" || x.tr.length));
  const out = new Set<string>();
  for (const x of pick(src, n * 3)) {
    const v = field === "tr" ? meaning(x) : x.w;
    if (v && v !== (field === "tr" ? meaning(w) : w.w)) out.add(v);
    if (out.size >= n) break;
  }
  return [...out];
}

/** Bir kart (kelime) için, kartın olgunluğuna göre alıştırma seç */
export async function wordStep(w: Word, pool: Word[], stability: number, card?: string): Promise<Step> {
  const r = Math.random();
  if (stability < 2) return r < 0.6 ? { t: "en2tr", w, opts: distractors(w, pool), card } : { t: "tr2en", w, opts: distractors(w, pool, 3, "w"), card };
  if (stability < 10) {
    if (r < 0.35 && w.s.length) {
      const [s] = await sentencesById(w.s.slice(0, 1), [w.lv, ...LEVELS]);
      if (s) return { t: "cloze", w, s, opts: distractors(w, pool, 3, "w"), card };
    }
    return r < 0.7 ? { t: "type", w, card } : { t: "listen", w, card };
  }
  if (r < 0.4 && w.s.length) {
    const [s] = await sentencesById(w.s.slice(0, 1), [w.lv, ...LEVELS]);
    if (s) return { t: "cloze", w, s, opts: [], card };
  }
  return r < 0.75 ? { t: "type", w, card } : { t: "listen", w, card };
}

export function levelBand(lv: Level): [number, number] {
  return ({ A1: [1, 600], A2: [601, 1500], B1: [1501, 3500], B2: [3501, 7000], C1: [7001, 12000], C2: [12001, 20000] } as const)[lv] as [number, number];
}
