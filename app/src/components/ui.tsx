import { useEffect, useState, type ReactNode } from "react";
import { Volume2, Snail, Loader2, X, Mic, ShieldCheck } from "lucide-react";
import { speak } from "../lib/speech";
import { kvGet, kvSet } from "../lib/db";
import { go } from "../lib/router";
import { sfx } from "../lib/sfx";
import type { Level } from "../lib/data";

export function Lv({ lv }: { lv: Level | string }) {
  return <span className="lv" style={{ background: `var(--lv-${lv})` }}>{lv}</span>;
}

export function Ring({ value, size = 120, stroke = 12, color = "url(#rg)", children, track = "var(--bg-2)" }:
  { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; track?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="#ffb02e" /><stop offset="1" stopColor="#ff6b5b" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

export function Bar({ value, cls = "" }: { value: number; cls?: string }) {
  return <div className={`bar ${cls}`}><i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="col" style={{ alignItems: "center", padding: 40, color: "var(--ink-3)", gap: 8 }}>
      <div className="loki-bounce"><Mascot size={56} /></div>
      <div className="row small" style={{ gap: 6 }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />{label || " Yükleniyor…"}</div>
    </div>
  );
}

export function AudioBtn({ text, size = 20, slow = true, big = false }: { text: string; size?: number; slow?: boolean; big?: boolean }) {
  const [on, setOn] = useState(false);
  const play = async (s = false) => { setOn(true); await speak(text, { slow: s }); setOn(false); };
  return (
    <span className="row" style={{ gap: 6, display: "inline-flex" }}>
      <button className={`btn icon ${big ? "primary" : ""}`} aria-label="Dinle" title="Dinle" onClick={(e) => { e.stopPropagation(); play(false); }}
        style={big ? { width: 64, height: 64, borderRadius: 22 } : undefined}>
        <Volume2 size={big ? 28 : size} style={{ opacity: on ? 0.5 : 1 }} />
      </button>
      {slow && <button className="btn icon" aria-label="Yavaş dinle" title="Yavaş" onClick={(e) => { e.stopPropagation(); play(true); }}><Snail size={size - 2} /></button>}
    </span>
  );
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: -8 }}>
          <button className="btn icon" aria-label="Kapat" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

let toastSet: ((s: string | null) => void) | null = null;
export function toast(msg: string) { toastSet?.(msg); setTimeout(() => toastSet?.(null), 2400); }
export function ToastHost() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => { toastSet = setM; return () => { toastSet = null; }; }, []);
  return m ? <div className="toast pop">{m}</div> : null;
}

let confettiSet: ((n: number) => void) | null = null;
export function confetti() { sfx("done"); confettiSet?.(Date.now()); }
export function ConfettiHost() {
  const [k, setK] = useState(0);
  useEffect(() => { confettiSet = setK; return () => { confettiSet = null; }; }, []);
  useEffect(() => { if (k) { const t = setTimeout(() => setK(0), 1800); return () => clearTimeout(t); } }, [k]);
  if (!k) return null;
  const colors = ["#5b4bff", "#ff6b5b", "#14b892", "#ffb02e", "#2f9bff", "#ff4f8b"];
  return (
    <div className="confetti" key={k}>
      {Array.from({ length: 70 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 9) * 0.05}s` }} />
      ))}
    </div>
  );
}

export function PageHead({ title, sub, right, icon }: { title: string; sub?: string; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="row between wrap pagehead" style={{ marginBottom: 22, gap: 16 }}>
      <div className="row" style={{ gap: 14 }}>
        {icon}
        <div>
          <h1 className="h1">{title}</h1>
          {sub && <div className="sub" style={{ marginTop: 6 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 40 }}>
      <Mascot size={90} mood="think" />
      <div className="h3" style={{ marginTop: 12 }}>{title}</div>
      {text && <p className="sub">{text}</p>}
      {action}
    </div>
  );
}

/** Loki: bej Fransız bulldog maskot (özgün çizim) */
export function Mascot({ size = 64, mood = "happy" }: { size?: number; mood?: "happy" | "think" | "wow" | "sad" }) {
  const look = mood === "think" ? -3 : 0;
  const mouth = {
    happy: "M41 71 Q45.5 76 50 72 Q54.5 76 59 71",
    think: "M44 73 L56 72",
    wow: "M46 74 a4 5 0 1 0 8 0 a4 5 0 1 0 -8 0",
    sad: "M42 76 Q50 70 58 76",
  }[mood];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M24 44 C8 36 4 12 14 5 C27 2 38 20 41 33 Z" fill="#cfa77c" />
      <path d="M24 37 C14 31 11 15 17 11 C26 10 33 22 35 31 Z" fill="#f0b4a4" />
      <path d="M76 44 C92 36 96 12 86 5 C73 2 62 20 59 33 Z" fill="#cfa77c" />
      <path d="M76 37 C86 31 89 15 83 11 C74 10 67 22 65 31 Z" fill="#f0b4a4" />
      <path d="M50 28 C76 28 92 42 92 60 C92 80 74 93 50 93 C26 93 8 80 8 60 C8 42 24 28 50 28 Z" fill="#dfbd93" />
      <path d="M43 38 Q50 35 57 38 M45 43 Q50 41 55 43" stroke="#b78f68" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M29 66 C29 56 39 51 50 51 C61 51 71 56 71 66 C71 79 63 86 56 84 C53 88 47 88 44 84 C37 86 29 79 29 66 Z" fill="#7a5a4c" />
      <circle cx="30" cy="51" r="8.5" fill="#22150f" /><circle cx="70" cy="51" r="8.5" fill="#22150f" />
      <circle cx={32.5 + look} cy="48" r="3" fill="#fff" /><circle cx={72.5 + look} cy="48" r="3" fill="#fff" />
      {mood === "sad" && <><path d="M21 47 Q30 41 39 47 L39 42 L21 42Z" fill="#dfbd93" /><path d="M61 47 Q70 41 79 47 L79 42 L61 42Z" fill="#dfbd93" /></>}
      <ellipse cx="50" cy="59" rx="9" ry="5.5" fill="#22150f" />
      <ellipse cx="47" cy="57.5" rx="2.6" ry="1.3" fill="#6a5248" />
      <path d="M50 64 L50 69" stroke="#22150f" strokeWidth="2" strokeLinecap="round" />
      <path d={mouth} stroke="#22150f" strokeWidth="2.4" fill={mood === "wow" ? "#22150f" : "none"} strokeLinecap="round" strokeLinejoin="round" />
      {mood === "happy" && <path d="M47 73.5 Q50 81 53 73.5 Z" fill="#ef7f8f" />}
      <circle cx="20" cy="70" r="5" fill="#f19a9a" opacity=".45" /><circle cx="80" cy="70" r="5" fill="#f19a9a" opacity=".45" />
    </svg>
  );
}

/** Mikrofon onayı (KVKK aydınlatma) — ilk kullanımda bir kez */
export function useMicConsent(): [boolean, () => Promise<boolean>, ReactNode] {
  const [ok, setOk] = useState(false);
  const [ask, setAsk] = useState<null | ((v: boolean) => void)>(null);
  useEffect(() => { kvGet("micConsent", false).then(setOk); }, []);
  const request = () => new Promise<boolean>((res) => {
    if (ok) return res(true);
    setAsk(() => (v: boolean) => { setAsk(null); if (v) { kvSet("micConsent", true); setOk(true); } res(v); });
  });
  const ui = (
    <Sheet open={!!ask} onClose={() => ask?.(false)}>
      <div className="col" style={{ gap: 14 }}>
        <div className="row"><div className="ico iris"><Mic /></div><div className="h2">Mikrofon kullanımı</div></div>
        <p className="sub" style={{ margin: 0 }}>Konuşma alıştırmaları için mikrofonun kullanılacak. Kayıt sadece alıştırma sırasında açılır.</p>
        <div className="card" style={{ background: "var(--surface-2)" }}>
          <div className="row" style={{ alignItems: "flex-start" }}><ShieldCheck color="var(--mint)" style={{ flex: "none" }} />
            <div className="small">
              <b>Yerel sunucu açıksa (önerilen):</b> sesin bu bilgisayarda Whisper ile çözülür, internete gitmez ve kalıcı kaydedilmez.<br />
              <b>Telefon uygulamasında:</b> konuşman kısa bir ses kaydı olarak Lokilingo'nun aracı sunucusu (Cloudflare) üzerinden Groq'a (ABD) gönderilir, yazıya çevrilir ve saklanmaz. Bu yurtdışına aktarımdır (KVKK md. 9).<br />
              <b>Tarayıcıda, sunucu kapalıysa:</b> tarayıcının konuşma tanıması kullanılır; ses Chrome'da Google'a, Edge'de Microsoft'a gider.<br />
              Kendi sesini tekrar dinleyebilmen için kayıt sadece bu sayfada geçici tutulur. Onayı istediğin an Ayarlar → Gizlilik'ten geri alabilirsin.
            </div>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={() => ask?.(false)}>Vazgeç</button>
          <button className="btn primary" onClick={() => ask?.(true)}>Anladım, devam</button>
        </div>
        <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => { ask?.(false); go("/ayarlar"); }}>Gizlilik ayrıntıları</button>
      </div>
    </Sheet>
  );
  return [ok, request, ui];
}
