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
  /** Android mikrofon iznini sistemden iste (WebView kaydı için gerekli) */
  ensureMic?(): Promise<boolean>;
}
export const native: NativeBridge = {};

let currentAudio: HTMLAudioElement | null = null;
let pendingDone: (() => void) | null = null; // durdurulunca bekleyen konuşma sözünü bitir
export function stopSpeaking() {
  speakGen++; speakingNow = false;
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

/** Uzun metni cümle cümle parçala (Chrome uzun konuşmayı ~15 sn'de sessizce kesiyor; durdurma da anında olsun) */
function splitSpeech(text: string): string[] {
  const t = text.trim();
  if (t.length <= 180) return [t];
  const sents = t.match(/[^.!?;:]+[.!?;:]*["')\]]*\s*/g) || [t];
  const out: string[] = []; let cur = "";
  for (const s of sents) {
    if ((cur + s).length > 180 && cur) { out.push(cur.trim()); cur = ""; }
    if (s.length > 220) { for (const w of s.match(/.{1,180}(\s|$)/g) || [s]) out.push(w.trim()); continue; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
let speakGen = 0; // her yeni konuşma ya da durdurma bir öncekini geçersiz kılar
let speakingNow = false;
export function isSpeaking() { return speakingNow; }

/** Metni okur. Bittiğinde (ya da durdurulunca) resolve olur. */
export async function speak(text: string, opts: { rate?: number; slow?: boolean; voice?: "female" | "male" } = {}): Promise<void> {
  stopSpeaking();
  const my = ++speakGen;
  const map = await audioMap();
  const parts = map[fnv1a(text.trim())] ? [text] : splitSpeech(text);
  speakingNow = true;
  try {
    for (const p of parts) {
      if (my !== speakGen) return;
      await speakOne(p, opts, map);
    }
  } finally { if (my === speakGen) speakingNow = false; }
}

async function speakOne(text: string, opts: { rate?: number; slow?: boolean; voice?: "female" | "male" }, map: Record<string, string>): Promise<void> {
  const s = getSettings();
  const rate = (opts.rate ?? s.rate) * (opts.slow ? 0.75 : 1);
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
  if (native.speak) return new Promise((res) => {
    pendingDone = res;
    // Bazı telefonlarda konuşma bitti haberi gelmiyor: tahmini süre dolunca yine de devam et
    const guard = window.setTimeout(() => res(), 4000 + text.length * 120 / Math.max(0.4, rate)); // geç bitsin: erken açılan mikrofon Loki'nin sesini yakalamasın
    native.speak!(text, s.accent, rate).catch(() => null).finally(() => { clearTimeout(guard); res(); });
  });
  if (!("speechSynthesis" in window)) return;
  return new Promise((res) => {
    pendingDone = res;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(opts.voice); if (v) u.voice = v;
    u.lang = v?.lang || s.accent; u.rate = rate;
    u.onend = () => res(); u.onerror = () => res();
    // Güvence: bazı tarayıcılarda "bitti" haberi hiç gelmez → tahmini süre + 3 sn sonra devam et
    window.setTimeout(() => res(), 3000 + text.length * 110 / Math.max(0.4, rate));
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
export interface Heard { text: string; words?: { w: string; p: number }[]; audioUrl?: string; engine: "whisper" | "browser" | "native" | "cloud" }
type SR = { lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };
export function browserSTT(): boolean { return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition); }

export async function micAvailable() { return !!navigator.mediaDevices?.getUserMedia; }

/** Sesi Loki sunucusu üzerinden Groq Whisper'a gönderip yazıya çevirir (2 deneme) */
export async function cloudStt(blob: Blob): Promise<string> {
  const { AKICI_AI } = await import("./ai");
  let dev = "anon"; try { dev = localStorage.getItem("akici-device") || "anon"; } catch { /* */ }
  let last: Error = new Error("Ses tanınamadı");
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`${AKICI_AI}/stt`, { method: "POST", headers: { "Content-Type": (blob.type || "audio/webm").split(";")[0], "X-Akici-Device": dev }, body: blob, signal: AbortSignal.timeout(20000) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return String(d.text || "").trim();
      last = new Error(d.error ? `Ses tanıma: ${d.error}` : `Ses tanıma hatası ${r.status}`);
      if (r.status === 413 || r.status === 415) break;
    } catch { last = new Error("Ses gönderilemedi (internet?)"); }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw last;
}

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
    // Yerel Whisper yoksa her yerde (telefon + bilgisayar) aynı yol: sesi kaydet, Loki sunucusunda Whisper ile yazıya çevir.
    // Sessizliği kendisi algılar, Google penceresi yok. Sadece ayarda açıkça "Tarayıcı" seçilirse tarayıcı tanıması kullanılır.
    if (this.engine !== "whisper" && !(s.stt === "browser" && browserSTT())) {
      const { AKICI_AI } = await import("./ai");
      if (AKICI_AI && typeof navigator.mediaDevices?.getUserMedia === "function") this.engine = "cloud";
    }
    if (this.engine === "cloud" && native.ensureMic && !(await native.ensureMic())) {
      throw new Error("Mikrofon izni yok. Telefonda Ayarlar → Uygulamalar → Lokilingo → İzinler → Mikrofon → İzin ver.");
    }
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
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const n = (e as Error).name;
      if (n === "NotAllowedError" || n === "SecurityError") throw new Error("Mikrofon izni verilmedi. Telefonda Ayarlar → Uygulamalar → Lokilingo → İzinler → Mikrofon → İzin ver, sonra tekrar dene.");
      if (n === "NotFoundError") throw new Error("Mikrofon bulunamadı.");
      throw e;
    }
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.t0 = Date.now();
    if (this.engine === "cloud" || this.engine === "whisper") this.watchSilence(onAutoStop);
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

  private ac: AudioContext | null = null;
  private iv: number | undefined;
  private spoke = false;
  private watched = false; // ses seviyesi gerçekten ölçülebildi mi
  /** Konuşma başlayıp 2,5 sn susunca (ya da 30 sn hiç konuşma gelmezse) otomatik bitir.
   *  Eşik ortam gürültüsüne göre ayarlanır (telefon mikrofonları çok kısık olabiliyor). Ölçüm yapılamazsa 15 sn sonra gönderir. */
  private watchSilence(onAutoStop?: () => void) {
    if (!this.stream || !onAutoStop) return;
    this.watched = false; this.spoke = false;
    const start = Date.now();
    try {
      const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ac.state !== "running") ac.resume().catch(() => null);
      const an = ac.createAnalyser(); an.fftSize = 1024;
      ac.createMediaStreamSource(this.stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      let loud = 0, quietSince = Date.now(), floor = 0.003, spokeAt = 0;
      const calib: number[] = []; // ilk ~0,5 sn: ortam gürültüsünü ölç (vantilatör, sokak sesi…)
      this.ac = ac;
      this.iv = window.setInterval(() => {
        const now = Date.now();
        if (ac.state === "running") {
          an.getFloatTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += v * v;
          const rms = Math.sqrt(sum / buf.length);
          if (rms > 0) this.watched = true;
          if (now - start < 500) { calib.push(rms); if (calib.length >= 4) floor = Math.max(floor, [...calib].sort((a, b) => a - b)[Math.floor(calib.length / 2)]); return; }
          const thr = Math.max(0.008, Math.min(0.06, floor * 2.8));
          if (rms > thr) { loud++; quietSince = now; if (loud >= 2 && !this.spoke) { this.spoke = true; spokeAt = now; this.onPartial?.("🎙️ …"); } }
          else { floor = floor * 0.92 + rms * 0.08; if (now - quietSince > 400) loud = 0; }
        }
        const stop = this.watched
          // konuştuysan 2,2 sn susunca gönder; sürekli gürültü varsa en geç 20 sn'de gönder; hiç konuşmadıysan 30 sn bekle
          ? (this.spoke && now - quietSince > 2200) || (this.spoke && now - spokeAt > 20000) || (!this.spoke && now - start > 30000)
          : now - start > 15000;
        if (stop) { this.stopWatch(); onAutoStop(); }
      }, 100);
    } catch { /* ses analizi yok: süre sınırı yeter */ }
  }
  private stopWatch() { clearInterval(this.iv); this.iv = undefined; try { this.ac?.close(); } catch { /* */ } this.ac = null; }

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
    this.stopWatch();
    // Hiç konuşulmadıysa gönderme: Whisper sessizlikte "Thank you." gibi şeyler uydurur
    if ((this.engine === "cloud" || this.engine === "whisper") && (blob.size < 2000 || (this.watched && !this.spoke))) return { text: "", audioUrl, engine: this.engine };
    if (this.engine === "cloud") return { text: await cloudStt(blob), audioUrl, engine: "cloud" };
    if (this.engine === "whisper") {
      try {
        const r = await serverPost<{ text: string; words: { w: string; p: number }[] }>("/api/score", blob, false);
        return { text: r.text, words: r.words, audioUrl, engine: "whisper" };
      } catch (e) {
        // Bilgisayardaki Whisper hata verdiyse buluttakine geç (kullanıcı takılı kalmasın)
        try { return { text: await cloudStt(blob), audioUrl, engine: "cloud" }; } catch { throw e; }
      }
    }
    if (this.sr) {
      await new Promise((res) => { this.sr!.onend = () => res(null); try { this.sr!.stop(); } catch { res(null); } setTimeout(res, 1500); });
    }
    return { text: this.srText.trim(), audioUrl, engine: "browser" };
  }

  cancel() {
    clearTimeout(this.timer); this.stopWatch();
    try { this.rec?.stop(); } catch { /* */ }
    try { this.sr?.abort(); } catch { /* */ }
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
