// Seslendirme (TTS), konuşma tanıma (STT) ve kayıt.
// Öncelik: önceden üretilmiş doğal ses (Kokoro) → tarayıcı/Android sesi.
// Tanıma: yerel Whisper sunucusu (ses bilgisayardan çıkmaz) → tarayıcı tanıması (Google/Microsoft'a gider, onaylı).
import { getSettings } from "./settings";
import { addStat } from "./stats";

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- önceden üretilmiş sesler
let audioIndex: Promise<Record<string, string>> | null = null;
function audioMap() {
  if (!audioIndex) audioIndex = fetch(`${import.meta.env.BASE_URL}audio/index.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return audioIndex;
}

// ---------------------------------------------------------------- native köprü (Android/Capacitor)
export interface NativeBridge {
  speak?(text: string, lang: string, rate: number): Promise<void>;
  stopSpeak?(): Promise<void>;
  listen?(lang: string): Promise<{ text: string; alts: string[] }>;
  /** Ekrana pencere açmadan dinlemeye başlar; ara sonuçlar onPartial ile gelir, susunca onEnd çağrılır */
  listenStart?(lang: string, onPartial: (t: string) => void, onEnd: () => void): Promise<void>;
  listenStop?(): Promise<void>;
}
export const native: NativeBridge = {};

let currentAudio: HTMLAudioElement | null = null;
let pendingDone: (() => void) | null = null; // durdurulunca bekleyen konuşma sözünü bitir
export function stopSpeaking() {
  try { currentAudio?.pause(); } catch { /* */ }
  const d = pendingDone; pendingDone = null; d?.();
  try { speechSynthesis?.cancel(); } catch { /* */ }
  native.stopSpeak?.();
}

const MALE = /(guy|davis|tony|jason|andrew|brian|eric|roger|steffan|christopher|ryan|thomas|george|david|mark|james|daniel|male|man)/i;
const FEMALE = /(aria|jenny|ana|michelle|emma|ava|sonia|libby|zira|hazel|susan|samantha|karen|female|woman|google us english|google uk english female)/i;
function pickVoice(gender?: "female" | "male"): SpeechSynthesisVoice | undefined {
  const s = getSettings();
  const vs = speechSynthesis.getVoices();
  if (gender) {
    const re = gender === "male" ? MALE : FEMALE;
    const g = vs.filter((v) => v.lang.startsWith("en") && re.test(v.name));
    const best = g.find((v) => v.lang === s.accent && /natural|online|neural/i.test(v.name)) || g.find((v) => v.lang === s.accent) || g[0];
    if (best) return best;
  }
  return vs.find((v) => v.voiceURI === s.voiceURI)
    || vs.find((v) => v.lang === s.accent && /natural|online|neural|google/i.test(v.name))
    || vs.find((v) => v.lang === s.accent)
    || vs.find((v) => v.lang.startsWith("en"));
}
export function englishVoices(): SpeechSynthesisVoice[] {
  try { return speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")); } catch { return []; }
}

/** Metni okur. Bittiğinde resolve olur. */
export async function speak(text: string, opts: { rate?: number; slow?: boolean; voice?: "female" | "male" } = {}): Promise<void> {
  stopSpeaking();
  const s = getSettings();
  const rate = (opts.rate ?? s.rate) * (opts.slow ? 0.75 : 1);
  const map = await audioMap();
  const file = map[fnv1a(text.trim())];
  if (file) {
    return new Promise((res) => {
      pendingDone = res;
      const a = new Audio(`${import.meta.env.BASE_URL}audio/${file}`);
      a.playbackRate = rate; a.preservesPitch = true; currentAudio = a;
      a.onended = () => res(); a.onerror = () => res();
      a.play().catch(() => res());
    });
  }
  if (native.speak) return new Promise((res) => { pendingDone = res; native.speak!(text, s.accent, rate).catch(() => null).finally(() => res()); });
  if (!("speechSynthesis" in window)) return;
  return new Promise((res) => {
    pendingDone = res;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(opts.voice); if (v) u.voice = v;
    u.lang = v?.lang || s.accent; u.rate = rate;
    u.onend = () => res(); u.onerror = () => res();
    speechSynthesis.speak(u);
  });
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => { /* sesler yüklendi */ };

// ---------------------------------------------------------------- yerel sunucu
export function serverBase() { return (getSettings().server || "").replace(/\/$/, ""); }
function authHeaders(): Record<string, string> {
  const t = getSettings().serverToken;
  return t ? { "X-Akici-Token": t } : {};
}
export interface Health { ok: boolean; whisper?: string; ollama?: boolean; models?: string[] }
let healthCache: { at: number; v: Health } | null = null;
export async function health(force = false): Promise<Health> {
  if (!force && healthCache && Date.now() - healthCache.at < 20000) return healthCache.v;
  let v: Health = { ok: false };
  try {
    const r = await fetch(`${serverBase()}/api/health`, { headers: authHeaders(), signal: AbortSignal.timeout(2500) });
    if (r.ok) v = { ok: true, ...(await r.json()) };
  } catch { /* sunucu kapalı */ }
  healthCache = { at: Date.now(), v };
  return v;
}
export async function serverPost<T>(path: string, body: BodyInit, json = true): Promise<T> {
  const r = await fetch(`${serverBase()}${path}`, {
    method: "POST", body, headers: { ...authHeaders(), ...(json ? { "Content-Type": "application/json" } : { "Content-Type": "application/octet-stream" }) },
  });
  if (!r.ok) throw new Error(`Sunucu hatası ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ---------------------------------------------------------------- kayıt + tanıma
export interface Heard { text: string; words?: { w: string; p: number }[]; audioUrl?: string; engine: "whisper" | "browser" | "native" }
type SR = { lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };
export function browserSTT(): boolean { return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition); }

export async function micAvailable() { return !!navigator.mediaDevices?.getUserMedia; }

export class Listener {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private sr: SR | null = null;
  private srText = "";
  private engine: Heard["engine"] = "browser";
  private t0 = 0;
  private timer: number | undefined;
  /** Konuşurken ara metin (ekranda canlı göstermek için) */
  onPartial?: (t: string) => void;

  async start(maxSec = 20, onAutoStop?: () => void) {
    const s = getSettings();
    const h = s.stt === "browser" ? { ok: false } : await health();
    this.engine = h.ok && (h as Health).whisper && !/kapalı|yok|error/i.test(String((h as Health).whisper)) ? "whisper" : native.listen ? "native" : "browser";
    if (s.stt === "whisper" && this.engine !== "whisper") throw new Error("Whisper sunucusu açık değil. Ayarlar → Sunucu.");
    if (this.engine === "native") {
      this.srText = ""; this.t0 = Date.now();
      if (native.listenStart) {
        let quiet: number | undefined;
        await native.listenStart(s.accent, (t) => {
          this.srText = t; this.onPartial?.(t);
          // 1,8 sn yeni kelime gelmezse konuşma bitti say ve gönder
          clearTimeout(quiet); quiet = window.setTimeout(() => onAutoStop?.(), 1800);
        }, () => { clearTimeout(quiet); onAutoStop?.(); });
        this.timer = window.setTimeout(() => onAutoStop?.(), maxSec * 1000);
      }
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.t0 = Date.now();
    if (this.engine === "browser") {
      const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (C) {
        const sr: SR = new C();
        sr.lang = s.accent; sr.interimResults = false; sr.maxAlternatives = 3; sr.continuous = true;
        this.srText = "";
        sr.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) this.srText += " " + e.results[i][0].transcript; };
        sr.onerror = () => { /* sessizlik vb. */ };
        try { sr.start(); this.sr = sr; } catch { /* */ }
      }
    }
    this.timer = window.setTimeout(() => onAutoStop?.(), maxSec * 1000);
  }

  async stop(): Promise<Heard> {
    clearTimeout(this.timer);
    if (this.engine === "native") {
      if (native.listenStart && native.listenStop) {
        await native.listenStop();
        await new Promise((r) => setTimeout(r, 250)); // son ara sonuç gelsin
        addStat({ speakSec: Math.round((Date.now() - this.t0) / 1000) });
        return { text: this.srText.trim(), engine: "native" };
      }
      const r = await native.listen!(getSettings().accent);
      return { text: r.text, engine: "native" };
    }
    const blob: Blob = await new Promise((res) => {
      if (!this.rec || this.rec.state === "inactive") return res(new Blob(this.chunks));
      this.rec.onstop = () => res(new Blob(this.chunks, { type: this.rec?.mimeType || "audio/webm" }));
      this.rec.stop();
    });
    this.stream?.getTracks().forEach((t) => t.stop());
    const audioUrl = URL.createObjectURL(blob);
    addStat({ speakSec: Math.round((Date.now() - this.t0) / 1000) });
    if (this.engine === "whisper") {
      const r = await serverPost<{ text: string; words: { w: string; p: number }[] }>("/api/score", blob, false);
      return { text: r.text, words: r.words, audioUrl, engine: "whisper" };
    }
    if (this.sr) {
      await new Promise((res) => { this.sr!.onend = () => res(null); try { this.sr!.stop(); } catch { res(null); } setTimeout(res, 1500); });
    }
    return { text: this.srText.trim(), audioUrl, engine: "browser" };
  }

  cancel() {
    clearTimeout(this.timer);
    try { this.rec?.stop(); } catch { /* */ }
    try { this.sr?.abort(); } catch { /* */ }
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
