// Hareket ve his: dokununca konuşan Loki, sayan sayılar, yıldız patlaması, titreşim, ders sonu kutlaması.
// Motion (motion.dev) ile yaylı animasyonlar; "hareketi azalt" ayarı açıksa sade kalır.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, animate } from "motion/react";
import { Mascot, confetti } from "./ui";
import { speak } from "../lib/speech";
import { sfx } from "../lib/sfx";

/** Telefonda kısa titreşim (destekleniyorsa) */
export function haptic(kind: "ok" | "bad" | "tap" | "win") {
  try { navigator.vibrate?.({ ok: 25, bad: [60, 40, 60], tap: 10, win: [30, 50, 30, 50, 80] }[kind]); } catch { /* yok */ }
}

/** Üst üste doğru sayacı (ders boyunca) */
let comboN = 0;
export const combo = { hit() { comboN++; return comboN; }, miss() { comboN = 0; }, get() { return comboN; } };

const LINES: [string, string][] = [
  ["Let's learn something new!", "Hadi yeni bir şey öğrenelim!"],
  ["You're doing great!", "Harika gidiyorsun!"],
  ["Practice makes perfect.", "Pratik mükemmelleştirir."],
  ["One more lesson?", "Bir ders daha?"],
  ["Woof! I believe in you.", "Hav! Sana inanıyorum."],
  ["Small steps every day.", "Her gün küçük adımlar."],
  ["Don't give up!", "Pes etme!"],
  ["Ready when you are.", "Sen hazır olunca ben de hazırım."],
];

/** Dokununca zıplayan ve İngilizce bir cümle söyleyen Loki */
export function LokiBuddy({ size = 60, mood = "happy" as const }: { size?: number; mood?: "happy" | "think" | "wow" | "sad" }) {
  const [say, setSay] = useState<[string, string] | null>(null);
  const [k, setK] = useState(0);
  const t = useRef<number | undefined>(undefined);
  const tap = () => {
    const l = LINES[Math.floor(Math.random() * LINES.length)];
    setSay(l); setK((x) => x + 1); haptic("tap"); speak(l[0]);
    clearTimeout(t.current); t.current = window.setTimeout(() => setSay(null), 3200);
  };
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <div style={{ position: "relative", flex: "none" }}>
      <motion.button key={k} type="button" aria-label="Loki" onClick={tap} className="loki-btn"
        initial={k ? { y: 0 } : false} animate={k ? { y: [0, -18, 0, -6, 0], rotate: [0, -8, 6, 0] } : {}} transition={{ duration: 0.7 }}
        whileTap={{ scale: 0.88 }}>
        <Mascot size={size} mood={say ? "wow" : mood} />
      </motion.button>
      <AnimatePresence>
        {say && (
          <motion.div className="speech" initial={{ opacity: 0, scale: 0.6, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}>
            <b>{say[0]}</b><span>{say[1]}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Sayıyı 0'dan hedefe yumuşakça sayar */
export function CountUp({ to, dur = 1.1, prefix = "", suffix = "" }: { to: number; dur?: number; prefix?: string; suffix?: string }) {
  const [v, setV] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setV(to); return; }
    const c = animate(0, to, { duration: dur, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, dur, reduce]);
  return <>{prefix}{v.toLocaleString("tr")}{suffix}</>;
}

/** Doğru cevapta yıldız patlaması */
export function Burst({ n = 10, color = "var(--mint)" }: { n?: number; color?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <span className="burst" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2, d = 34 + (i % 3) * 12;
        return <motion.i key={i} style={{ background: i % 2 ? color : "var(--amber)" }}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }} animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, scale: [0.4, 1.1, 0], opacity: [1, 1, 0] }}
          transition={{ duration: 0.7, ease: "easeOut" }} />;
      })}
    </span>
  );
}

/** Ders / set sonu kutlama ekranı */
export function Celebrate({ title, xp, acc, extra, streak, children }: { title: string; xp: number; acc: number; extra?: string; streak?: number; children?: ReactNode }) {
  useEffect(() => { confetti(); haptic("win"); setTimeout(() => sfx("level"), 500); }, []);
  const mood = acc >= 80 ? "wow" : acc >= 50 ? "happy" : "think";
  const msg = acc >= 90 ? "Mükemmel! 🌟" : acc >= 70 ? "Çok iyi!" : acc >= 50 ? "Güzel gidiyorsun" : "Tekrar etmek işe yarar";
  const stats: [string, ReactNode, string, string][] = [
    ["⚡", <CountUp key="x" to={xp} prefix="+" />, "XP", "amber"],
    ["🎯", <CountUp key="a" to={acc} prefix="%" />, extra || "doğruluk", "mint"],
    ...(streak !== undefined ? [["🔥", <CountUp key="s" to={streak} />, "gün seri", "coral"] as [string, ReactNode, string, string]] : []),
  ];
  return (
    <div className="ex-wrap col" style={{ alignItems: "center", textAlign: "center", gap: 18, paddingTop: 28 }}>
      <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0, y: [0, -24, 0, -10, 0] }}
        transition={{ scale: { type: "spring", stiffness: 260, damping: 14 }, y: { delay: 0.35, duration: 0.9 } }}>
        <div className="celebrate-halo"><Mascot size={140} mood={mood} /></div>
      </motion.div>
      <motion.h1 className="h1" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} style={{ margin: 0 }}>{title}</motion.h1>
      <motion.div className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>{msg}</motion.div>
      <div className="row" style={{ gap: 10, width: "100%", justifyContent: "center" }}>
        {stats.map(([ic, v, l, c], i) => (
          <motion.div key={l} className={`stat-tile ${c}`} initial={{ opacity: 0, y: 30, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.45 + i * 0.12, type: "spring", stiffness: 300, damping: 18 }}>
            <span style={{ fontSize: 22 }}>{ic}</span><b>{v}</b><span className="tiny">{l}</span>
          </motion.div>
        ))}
      </div>
      <motion.div className="col" style={{ gap: 10, width: "100%", maxWidth: 420 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85 }}>
        {children}
      </motion.div>
    </div>
  );
}
