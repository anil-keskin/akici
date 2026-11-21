// Aralıklı tekrar: FSRS (Anki'nin yeni algoritması; Duolingo'nun HLR'sinden daha iyi tahmin eder).
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Grade } from "ts-fsrs";
import { db, kvGet, type CardKind, type CardRow } from "./db";
import { addStat } from "./stats";

export { Rating, State };
let F = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9, maximum_interval: 3650 }));
export async function initSrs() {
  const r = await kvGet<number>("retention", 0.9);
  F = fsrs(generatorParameters({ enable_fuzz: true, request_retention: r, maximum_interval: 3650 }));
}

export function cardId(kind: CardKind, ref: number | string) {
  return `${kind[0]}:${ref}`;
}
export async function addCard(kind: CardKind, ref: number | string, extra: Partial<CardRow> = {}) {
  const id = extra.id || cardId(kind, ref);
  const ex = await db.cards.get(id);
  if (ex) return ex;
  const c = createEmptyCard(new Date());
  const row: CardRow = { id, kind, ref, card: c, due: c.due.getTime(), created: Date.now(), ...extra };
  await db.cards.put(row);
  return row;
}
export async function hasCard(id: string) { return !!(await db.cards.get(id)); }

export async function review(id: string, rating: Grade, ms = 0, mode = "card") {
  const row = await db.cards.get(id);
  if (!row) return;
  const wasNew = row.card.state === State.New;
  const { card } = F.next(row.card, new Date(), rating);
  await db.cards.put({ ...row, card, due: card.due.getTime() });
  await db.logs.add({ cardId: id, rating, ts: Date.now(), ms, mode });
  await addStat({ reviews: 1, xp: rating === Rating.Again ? 2 : 5 + (wasNew ? 5 : 0), learned: wasNew && rating !== Rating.Again ? 1 : 0, correct: rating === Rating.Again ? 0 : 1, total: 1 });
}
/** Seçilen derecelendirmenin bir sonraki tekrar aralığı ("10 dk", "3 gün") */
export function preview(row: CardRow): Record<number, string> {
  const res: Record<number, string> = {};
  const log = F.repeat(row.card, new Date());
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) res[g] = humanize(log[g].card.due.getTime() - Date.now());
  return res;
}
export function humanize(ms: number) {
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} dk`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} sa`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} gün`;
  if (d < 365) return `${Math.round(d / 30)} ay`;
  return `${(d / 365).toFixed(1)} yıl`;
}
export async function dueCards(limit = 200, kinds?: CardKind[]) {
  const now = Date.now();
  const rows = await db.cards.where("due").belowOrEqual(now).limit(limit * 2).toArray();
  return rows.filter((r) => !r.suspended && r.card.state !== State.New && (!kinds || kinds.includes(r.kind))).slice(0, limit);
}
export async function newCards(limit = 20, kinds?: CardKind[]) {
  const rows = await db.cards.orderBy("created").toArray();
  return rows.filter((r) => r.card.state === State.New && !r.suspended && (!kinds || kinds.includes(r.kind))).slice(0, limit);
}
export async function counts() {
  const all = await db.cards.toArray();
  const now = Date.now();
  return {
    total: all.length,
    due: all.filter((r) => r.card.state !== State.New && r.due <= now && !r.suspended).length,
    fresh: all.filter((r) => r.card.state === State.New).length,
    learning: all.filter((r) => r.card.state === State.Learning || r.card.state === State.Relearning).length,
    mature: all.filter((r) => r.card.state === State.Review && r.card.stability >= 21).length,
    young: all.filter((r) => r.card.state === State.Review && r.card.stability < 21).length,
  };
}
