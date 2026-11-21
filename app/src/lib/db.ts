// Cihazdaki veritabanı (IndexedDB). Hesap yok, sunucu yok: veri bu cihazdan çıkmaz.
import Dexie, { type Table } from "dexie";
import type { Card } from "ts-fsrs";

export type CardKind = "word" | "phrase" | "sentence" | "custom";
export interface CardRow {
  id: string;            // "w:123" | "p:45" | "s:9876" | "c:uuid"
  kind: CardKind;
  ref: number | string;
  front?: string;        // custom kartlar için
  back?: string;
  note?: string;         // hafıza ipucu (Memrise "mem")
  card: Card;            // FSRS durumu
  due: number;           // ms — indeks için
  created: number;
  suspended?: 0 | 1;
}
export interface ReviewLog { id?: number; cardId: string; rating: number; ts: number; ms: number; mode: string }
export interface DayStat { day: string; xp: number; minutes: number; reviews: number; learned: number; speakSec: number; correct: number; total: number }
export interface KV { k: string; v: unknown }
export interface ChatRow { id?: number; mode: string; title: string; messages: { role: "user" | "assistant" | "system"; content: string }[]; ts: number }
export interface MediaRow { id?: number; title: string; kind: "subs" | "lyrics" | "text"; lines: { t?: number; en: string }[]; video?: string; ts: number }
export interface Progress { id: string; kind: "grammar" | "book" | "scenario" | "pairs"; done: number; score: number; pos?: number; ts: number }

class AkiciDB extends Dexie {
  cards!: Table<CardRow, string>;
  logs!: Table<ReviewLog, number>;
  days!: Table<DayStat, string>;
  kv!: Table<KV, string>;
  chats!: Table<ChatRow, number>;
  progress!: Table<Progress, string>;
  media!: Table<MediaRow, number>;
  constructor() {
    super("akici");
    this.version(1).stores({
      cards: "id, kind, due, created",
      logs: "++id, cardId, ts",
      days: "day",
      kv: "k",
      chats: "++id, mode, ts",
      progress: "id, kind, ts",
    });
    this.version(2).stores({ media: "++id, kind, ts" });
  }
}
export const db = new AkiciDB();

export async function kvGet<T>(k: string, def: T): Promise<T> {
  try { const r = await db.kv.get(k); return (r?.v as T) ?? def; } catch { return def; }
}
export async function kvSet(k: string, v: unknown) { await db.kv.put({ k, v }); }

export async function exportAll(): Promise<string> {
  const [cards, logs, days, kv, chats, progress] = await Promise.all([
    db.cards.toArray(), db.logs.toArray(), db.days.toArray(), db.kv.toArray(), db.chats.toArray(), db.progress.toArray(),
  ]);
  // Anahtarlar yedeğe girmez
  const safeKv = kv.filter((x) => !/key|token|secret/i.test(x.k));
  return JSON.stringify({ app: "akici", v: 1, at: new Date().toISOString(), cards, logs, days, kv: safeKv, chats, progress });
}

export async function importAll(json: string) {
  const d = JSON.parse(json);
  if (d?.app !== "akici") throw new Error("Bu bir Lokilingo yedeği değil");
  await db.transaction("rw", [db.cards, db.logs, db.days, db.kv, db.chats, db.progress], async () => {
    const revive = (c: CardRow) => ({ ...c, card: { ...c.card, due: new Date(c.card.due), last_review: c.card.last_review ? new Date(c.card.last_review) : undefined } });
    await db.cards.bulkPut((d.cards || []).map(revive));
    await db.logs.bulkPut(d.logs || []);
    await db.days.bulkPut(d.days || []);
    await db.kv.bulkPut(d.kv || []);
    await db.chats.bulkPut(d.chats || []);
    await db.progress.bulkPut(d.progress || []);
  });
}

export async function wipeAll() {
  await db.delete();
  try { localStorage.clear(); } catch { /* yok */ }
}

/** Seçerek sıfırlama: ayarlar ve onaylar korunur */
export async function resetPart(part: "cards" | "reading" | "stats" | "chats" | "all-progress") {
  const t = {
    cards: [db.cards, db.logs],
    reading: [db.progress],
    stats: [db.days],
    chats: [db.chats],
    "all-progress": [db.cards, db.logs, db.progress, db.days, db.chats, db.media],
  }[part];
  await db.transaction("rw", t, async () => { for (const x of t) await x.clear(); });
  if (part === "all-progress") { await kvSet("level", "A1"); }
}
