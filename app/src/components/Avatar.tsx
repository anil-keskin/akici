// Konuşan yapay zekâ yüzleri (özgün, SVG). Konuşurken ağız hareket eder, ara sıra göz kırpar.
import { useEffect, useState } from "react";
import type { Persona } from "../lib/ai";
import { Mascot } from "./ui";

export function Avatar({ p, talking = false, listening = false, size = 120 }: { p: Persona; talking?: boolean; listening?: boolean; size?: number }) {
  const [open, setOpen] = useState(0);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!talking) { setOpen(0); return; }
    const t = setInterval(() => setOpen(Math.random()), 110);
    return () => clearInterval(t);
  }, [talking]);
  useEffect(() => {
    let to: number;
    const loop = () => { setBlink(true); setTimeout(() => setBlink(false), 140); to = window.setTimeout(loop, 2500 + Math.random() * 3000); };
    to = window.setTimeout(loop, 1800);
    return () => clearTimeout(to);
  }, []);
  if (p.name === "Loki") {
    // Öğretmen Loki: konuşurken ağzı açılıp kapanır, dinlerken kulak kabartır
    return (
      <div style={{ position: "relative", width: size, height: size, flex: "none" }} className={talking ? "loki-talk" : listening ? "loki-listen" : ""}>
        {(talking || listening) && <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: `3px solid ${listening ? "var(--coral)" : p.color}`, animation: "pulse 1.2s infinite", opacity: .6 }} />}
        <div style={{ borderRadius: "50%", background: "color-mix(in srgb, #c9a37a 22%, transparent)", width: size, height: size, display: "grid", placeItems: "center" }}>
          <Mascot size={size * 0.9} mood={talking ? (open > 0.5 ? "wow" : "happy") : listening ? "think" : blink ? "think" : "happy"} />
        </div>
      </div>
    );
  }
  const female = p.voice === "female";
  const mouthH = 2 + open * 9;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      {(talking || listening) && <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: `3px solid ${listening ? "var(--coral)" : p.color}`, animation: "pulse 1.2s infinite", opacity: .6 }} />}
      <svg width={size} height={size} viewBox="0 0 120 120" aria-label={p.name}>
        <defs><clipPath id={`c-${p.name}`}><circle cx="60" cy="60" r="58" /></clipPath></defs>
        <circle cx="60" cy="60" r="58" fill={p.color} opacity=".18" />
        <g clipPath={`url(#c-${p.name})`}>
          {female && <path d="M22 70 Q20 24 60 20 Q100 24 98 70 L98 112 L22 112 Z" fill={p.hair} />}
          <path d="M28 120 Q30 92 60 90 Q90 92 92 120 Z" fill={p.color} />
          <rect x="52" y="76" width="16" height="16" rx="6" fill={p.skin} />
          <ellipse cx="60" cy="56" rx="28" ry="32" fill={p.skin} />
          {female
            ? <path d="M32 52 Q34 24 60 24 Q86 24 88 52 Q76 36 60 34 Q46 36 32 52 Z" fill={p.hair} />
            : <path d="M32 50 Q30 26 60 24 Q90 26 88 50 Q84 38 72 36 Q60 42 46 36 Q36 40 32 50 Z" fill={p.hair} />}
          <ellipse cx="31" cy="58" rx="4" ry="6" fill={p.skin} /><ellipse cx="89" cy="58" rx="4" ry="6" fill={p.skin} />
          {blink
            ? <><path d="M44 55 h9" stroke="#15132b" strokeWidth="2.5" strokeLinecap="round" /><path d="M67 55 h9" stroke="#15132b" strokeWidth="2.5" strokeLinecap="round" /></>
            : <><circle cx="48.5" cy="55" r="3.6" fill="#15132b" /><circle cx="71.5" cy="55" r="3.6" fill="#15132b" /><circle cx="49.6" cy="53.8" r="1.1" fill="#fff" /><circle cx="72.6" cy="53.8" r="1.1" fill="#fff" /></>}
          <path d="M43 47 q5 -3 10 0 M67 47 q5 -3 10 0" stroke={p.hair} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M58 60 q2 6 -1 8" stroke="#00000022" strokeWidth="2" fill="none" />
          <circle cx="42" cy="66" r="4" fill="#ff8fa3" opacity=".35" /><circle cx="78" cy="66" r="4" fill="#ff8fa3" opacity=".35" />
          {talking
            ? <ellipse cx="60" cy="74" rx="7" ry={mouthH / 2 + 1} fill="#7a2230" />
            : <path d="M51 72 Q60 79 69 72" stroke="#7a2230" strokeWidth="2.6" fill="none" strokeLinecap="round" />}
        </g>
      </svg>
    </div>
  );
}
