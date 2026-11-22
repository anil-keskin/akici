// Bulut yedeği ("kaldığın yerden devam"): hesap, e-posta, şifre YOK.
// - Cihaz 20 haneli rastgele bir kurtarma kodu üretir (≈100 bit; tahmin edilemez).
// - İlerleme bu cihazda sıkıştırılır ve koddan türetilen anahtarla AES-GCM ile ŞİFRELENİR.
// - Sunucuya sadece şifreli kutu + kodun özeti (SHA-256) gider; kodun kendisi ve içerik sunucuda okunamaz.
// - Yeni telefonda kodu girince ilerleme geri gelir. Kodu kaybeden yedeği açamaz (biz de açamayız).
import { exportAll, importAll, kvGet, kvSet } from "./db";
import { AKICI_AI } from "./ai";

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // karışan harfler (0/O, 1/I) yok
export function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(b, (x) => ALPH[x & 31]).join("").match(/.{4}/g)!.join("-");
}
export function normCode(c: string): string { return c.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/0/g, "O").replace(/1/g, "I"); }
export function validCode(c: string): boolean { const n = normCode(c); return n.length === 20 && [...n].every((x) => ALPH.includes(x)); }
export function prettyCode(c: string): string { return normCode(c).match(/.{1,4}/g)?.join("-") || ""; }

const enc = new TextEncoder();
async function sha(s: string | ArrayBuffer): Promise<Uint8Array> { return new Uint8Array(await crypto.subtle.digest("SHA-256", typeof s === "string" ? enc.encode(s) : s)); }
const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
async function derive(code: string) {
  const n = normCode(code);
  const id = hex(await sha("lokilingo-sync-id:" + n));
  const key = await crypto.subtle.importKey("raw", (await sha("lokilingo-sync-key:" + n)) as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
  return { id, key };
}
async function gzip(s: string) { return new Response(new Blob([s]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(); }
async function gunzip(b: ArrayBuffer) { return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text(); }

/** Değişip değişmediğini anlamak için tarihsiz anlık görüntü */
async function snapshot() { const d = JSON.parse(await exportAll()); delete d.at; const s = JSON.stringify(d); return { s, h: hex(await sha(s)) }; }

export interface SyncState { code: string; at: number; err?: string }
export async function syncState(): Promise<SyncState> { return { code: await kvGet("sync.code", ""), at: await kvGet("sync.at", 0), err: await kvGet("sync.err", "") || undefined }; }

async function api(id: string, init?: RequestInit, q = "") {
  const r = await fetch(`${AKICI_AI}/sync/${id}${q}`, { cache: "no-store", ...init });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || `Yedek sunucusu hatası ${r.status}`), { status: r.status }); }
  return r;
}

let busy = false;
/** Bu cihazdaki ilerlemeyi buluta yolla (değişmediyse yollamaz) */
export async function pushNow(force = false): Promise<"sent" | "same" | "off"> {
  const code = await kvGet("sync.code", "");
  if (!code || busy) return "off";
  busy = true;
  try {
    const { s, h } = await snapshot();
    if (!force && h === (await kvGet("sync.hash", ""))) return "same";
    const { id, key } = await derive(code);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await gzip(s)));
    const body = new Uint8Array(12 + ct.length); body.set(iv); body.set(ct, 12);
    const d = await (await api(id, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body })).json();
    await kvSet("sync.hash", h); await kvSet("sync.at", d.ts || Date.now()); await kvSet("sync.err", "");
    return "sent";
  } catch (e) { await kvSet("sync.err", (e as Error).message); throw e; } finally { busy = false; }
}

/** Kodla buluttaki ilerlemeyi bu cihaza getir (bu cihazdakiyle birleştirir) */
export async function restore(code: string) {
  if (!validCode(code)) throw new Error("Kod 20 harf/rakam olmalı (ör. ABCD-EFGH-JKLM-NPQR-STUV).");
  const { id, key } = await derive(code);
  const buf = await (await api(id)).arrayBuffer();
  let json: string;
  try { json = await gunzip(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(buf.slice(0, 12)) }, key, buf.slice(12))); }
  catch { throw new Error("Yedek açılamadı (kod yanlış olabilir)."); }
  await importAll(json);
  await kvSet("sync.code", prettyCode(code));
  const meta = await (await api(id, undefined, "?meta=1")).json().catch(() => ({ ts: Date.now() }));
  await kvSet("sync.at", meta.ts || Date.now());
  await kvSet("sync.hash", (await snapshot()).h);
  await kvSet("sync.err", "");
}

/** Yedeklemeyi aç: yeni kod üret ve hemen yedekle */
export async function enable(): Promise<string> {
  const code = newCode();
  await kvSet("sync.code", code); await kvSet("sync.hash", "");
  await pushNow(true);
  return code;
}

/** Yedeklemeyi kapat ve buluttaki kutuyu sil */
export async function disable(removeCloud = true) {
  const code = await kvGet("sync.code", "");
  if (code && removeCloud) { const { id } = await derive(code); await api(id, { method: "DELETE" }); }
  await kvSet("sync.code", ""); await kvSet("sync.hash", ""); await kvSet("sync.at", 0); await kvSet("sync.err", "");
}

/** Açılışta: başka cihazda daha yeni ilerleme varsa ve burada yeni bir şey yapılmadıysa onu getir. Sonra düzenli yedekle. */
let started = false;
export async function startAutoSync() {
  if (started) return; started = true;
  const tick = () => { pushNow().catch(() => { /* çevrimdışı: sonra tekrar dener */ }); };
  try {
    const code = await kvGet("sync.code", "");
    if (code) {
      const { id } = await derive(code);
      const meta = await (await api(id, undefined, "?meta=1")).json();
      const localChanged = (await snapshot()).h !== (await kvGet("sync.hash", ""));
      if (meta.ts > (await kvGet("sync.at", 0)) + 5000 && !localChanged) {
        await restore(code);
        window.dispatchEvent(new Event("lokilingo-synced"));
      }
    }
  } catch { /* çevrimdışı ya da yedek yok */ }
  setInterval(tick, 3 * 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") tick(); });
}
