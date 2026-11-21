// XP, seri (streak), günlük hedef. Seri kalkanı: haftada 1 kaçırılan gün seriyi bozmaz.
import { db, kvGet, kvSet, type DayStat } from "./db";
import { sfx } from "./sfx";

export function dayKey(d = new Date()) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const EMPTY = (day: string): DayStat => ({ day, xp: 0, minutes: 0, reviews: 0, learned: 0, speakSec: 0, correct: 0, total: 0 });

const listeners = new Set<() => void>();
export function onStats(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export async function addStat(p: Partial<Omit<DayStat, "day">>) {
  const k = dayKey();
  const before = p.xp ? levelFromXp(await totalXp()).lvl : 0;
  await db.transaction("rw", db.days, async () => {
    const cur = (await db.days.get(k)) || EMPTY(k);
    for (const [key, val] of Object.entries(p)) (cur as unknown as Record<string, number>)[key] += val as number;
    await db.days.put(cur);
  });
  if (p.xp && levelFromXp(await totalXp()).lvl > before) {
    sfx("level");
    window.dispatchEvent(new CustomEvent("akici-levelup", { detail: levelFromXp(await totalXp()).lvl }));
  }
  listeners.forEach((f) => f());
}
export async function today(): Promise<DayStat> { return (await db.days.get(dayKey())) || EMPTY(dayKey()); }
export async function lastDays(n: number): Promise<DayStat[]> {
  const out: DayStat[] = [];
  const all = new Map((await db.days.toArray()).map((d) => [d.day, d]));
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d); out.push(all.get(k) || EMPTY(k));
  }
  return out;
}
export async function goal(): Promise<number> { return kvGet<number>("goalXp", 50); }

/** Seri: hedefin en az yarısını yapılan ardışık günler. Bugün henüz yapılmadıysa dünden sayılır. */
export async function streak(): Promise<{ days: number; shieldUsed: boolean; todayDone: boolean }> {
  const g = await goal();
  const days = await lastDays(400);
  const active = (d: DayStat) => d.xp >= Math.max(10, g / 2);
  let i = days.length - 1;
  const todayDone = active(days[i]);
  if (!todayDone) i--;
  let count = 0, shieldUsed = false, weekShield = 0;
  for (; i >= 0; i--) {
    if (active(days[i])) { count++; continue; }
    // kalkan: son 7 günde bir kez boş gün affedilir (önceki ve sonraki gün aktifse)
    if (weekShield === 0 && i > 0 && active(days[i - 1]) && count > 0) { weekShield = 7; shieldUsed = true; continue; }
    break;
  }
  return { days: count, shieldUsed, todayDone };
}
export async function totalXp() { return (await db.days.toArray()).reduce((s, d) => s + d.xp, 0); }
export function levelFromXp(xp: number) {
  // seviye eğrisi: her seviye bir öncekinden %15 fazla XP ister
  let lvl = 1, need = 120, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = Math.round(need * 1.15); }
  return { lvl, into: xp - acc, need };
}
export async function setGoal(xp: number) { await kvSet("goalXp", xp); listeners.forEach((f) => f()); }

let t0 = Date.now();
/** Aktif çalışma süresini dakikaya çevirir (sekme görünürken). */
export function startStudyClock() {
  const tick = () => {
    if (document.visibilityState === "visible") {
      const m = (Date.now() - t0) / 60000;
      if (m >= 1) { addStat({ minutes: Math.floor(m) }); t0 = Date.now(); }
    } else t0 = Date.now();
  };
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", () => { t0 = Date.now(); });
}
