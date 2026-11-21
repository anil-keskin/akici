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
    <div className="row" style={{ justifyContent: "center", padding: 40, color: "var(--ink-3)" }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />{label}
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
    <div className="row between wrap" style={{ marginBottom: 22, gap: 16 }}>
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

/** Akı: özgün maskot (konuşma balonu) */
export function Mascot({ size = 64, mood = "happy" }: { size?: number; mood?: "happy" | "think" | "wow" | "sad" }) {
  const mouth = {
    happy: "M38 58 Q50 68 62 58", think: "M40 61 L60 59",
    wow: "M45 60 a5 6 0 1 0 10 0 a5 6 0 1 0 -10 0", sad: "M38 64 Q50 55 62 64",
  }[mood];
  const look = mood === "think" ? -2 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6b5bff" /><stop offset="1" stopColor="#b061ff" /></linearGradient>
      </defs>
      <path d="M50 8c24 0 42 15 42 35S74 78 50 78c-5 0-10-.6-14-1.8L18 88l5-16C14 65 8 55 8 43 8 23 26 8 50 8z" fill="url(#mg)" />
      <circle cx="37" cy="40" r="7" fill="#fff" /><circle cx="63" cy="40" r="7" fill="#fff" />
      <circle cx={38 + (mood === "think" ? 1 : 0)} cy={40 + look} r="3.4" fill="#15132b" />
      <circle cx={64 + (mood === "think" ? 1 : 0)} cy={40 + look} r="3.4" fill="#15132b" />
      <path d={mouth} stroke="#fff" strokeWidth="4.5" fill={mood === "wow" ? "#fff" : "none"} strokeLinecap="round" />
      <circle cx="27" cy="52" r="4" fill="#ff8fb3" opacity=".7" /><circle cx="73" cy="52" r="4" fill="#ff8fb3" opacity=".7" />
      <circle cx="82" cy="16" r="5" fill="#ffb02e" />
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
              <b>Sunucu kapalıysa:</b> tarayıcının konuşma tanıması kullanılır; ses Chrome'da Google'a, Edge'de Microsoft'a gider.<br />
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
