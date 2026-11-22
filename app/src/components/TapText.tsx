// Dokun-çevir okuyucu: kelimeye dokun → anlamı, desteye ekle, cümleyi çevir. Keşfet ve benzeri sayfalarda kullanılır.
// Okuma hızı: salyangoz (yavaş) + istediğin kadar ayarlanan hız çubuğu; ayar hatırlanır. "Hepsini dinle" ile baştan sona.
import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Plus, Check, Languages, Square, Snail, Play } from "lucide-react";
import { Lv, toast } from "./ui";
import { findWord, type Word, trShow } from "../lib/data";
import { addCard } from "../lib/srs";
import { speak, stopSpeaking } from "../lib/speech";
import { sentenceAt, translateTr } from "../lib/ai";
import { usePersist } from "../lib/persist";

export const SLOW = 0.6;

/** Okuma hızı ayarı (salyangoz + kaydırma çubuğu). Değer tüm okuyucularda ortak ve kalıcı. */
export function useReadRate() { return usePersist<number>("read.rate", 0.9); }
export function RateBar({ rate, setRate, playing, onPlayAll }: { rate: number; setRate: (r: number) => void; playing?: boolean; onPlayAll?: () => void }) {
  const slow = rate <= SLOW + 0.001;
  return (
    <div className="rate-bar" role="group" aria-label="Okuma hızı">
      {onPlayAll && <button className={`btn sm ${playing ? "coral" : "primary"}`} onClick={onPlayAll}>{playing ? <><Square size={14} /> Durdur</> : <><Play size={14} /> Hepsini dinle</>}</button>}
      <button className={`btn sm ${slow ? "mint" : "ghost"}`} aria-pressed={slow} title="Yavaş oku" onClick={() => setRate(slow ? 0.9 : SLOW)}><Snail size={16} /> {slow ? "Yavaş" : "Yavaşlat"}</button>
      <label className="rate-slider">
        <span className="tiny muted">Hız</span>
        <input type="range" min={0.4} max={1.3} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Okuma hızı" />
        <b className="small" style={{ minWidth: 42, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rate.toFixed(2)}×</b>
      </label>
    </div>
  );
}

export function TapText({ paras, tr }: { paras: string[]; tr?: string[] }) {
  const [sel, setSel] = useState<{ tok: string; w?: Word; pi: number; ti: number } | null>(null);
  const [sent, setSent] = useState<{ en: string; tr?: string; err?: string } | null>(null);
  const [showTr, setShowTr] = useState<Set<number>>(new Set());
  const [paraTr, setParaTr] = useState<Record<number, string>>({});
  const [reading, setReading] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [rate, setRate] = useReadRate();
  const run = useRef(0);
  const toks = useMemo(() => paras.map((p) => p.split(/(\s+|[.,!?;:"“”()—-]+)/)), [paras]);
  useEffect(() => () => { run.current++; stopSpeaking(); }, []);

  const tap = async (tok: string, pi: number, ti: number) => { setSent(null); setSel({ tok, pi, ti }); setSel({ tok, pi, ti, w: await findWord(tok) }); };
  const transSentence = async () => {
    if (!sel) return;
    const en = sentenceAt(paras[sel.pi], toks[sel.pi].slice(0, sel.ti).join("").length);
    setSent({ en });
    try { setSent({ en, tr: await translateTr(en) }); } catch (e) { setSent({ en, err: (e as Error).message }); }
  };
  const stopAll = () => { run.current++; stopSpeaking(); setReading(null); setAll(false); };
  /** Tek paragraf (r: bu okuma için hız; salyangoz düğmesi daha da yavaş okur) */
  const readPara = async (pi: number, r = rate) => {
    if (reading === pi) { stopAll(); return; }
    const my = ++run.current; setAll(false);
    setReading(pi); await speak(paras[pi], { rate: r });
    if (run.current === my) setReading(null);
  };
  const playAll = async () => {
    if (all) { stopAll(); return; }
    const my = ++run.current; setAll(true);
    for (let i = 0; i < paras.length && run.current === my; i++) {
      setReading(i);
      document.getElementById(`para-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      await speak(paras[i], { rate });
    }
    if (run.current === my) { setReading(null); setAll(false); }
  };
  const toggleTr = async (pi: number) => {
    const n = new Set(showTr);
    if (n.has(pi)) { n.delete(pi); setShowTr(n); return; }
    n.add(pi); setShowTr(n);
    if (!tr?.[pi] && !paraTr[pi]) {
      setParaTr((m) => ({ ...m, [pi]: "Çevriliyor…" }));
      try { const t = await translateTr(paras[pi]); setParaTr((m) => ({ ...m, [pi]: t })); }
      catch (e) { setParaTr((m) => ({ ...m, [pi]: `Çevrilemedi: ${(e as Error).message}` })); }
    }
  };

  return (
    <div className="reader">
      <RateBar rate={rate} setRate={setRate} playing={all} onPlayAll={playAll} />
      {toks.map((ts, pi) => (
        <div key={pi} id={`para-${pi}`} className={reading === pi ? "para-on" : ""}>
          <p>
            {ts.map((t, ti) => /^[A-Za-z’']+$/.test(t)
              ? <span key={ti} className={`tok ${sel?.pi === pi && sel.ti === ti ? "sel" : ""}`} onClick={() => tap(t, pi, ti)}>{t}</span>
              : <span key={ti}>{t}</span>)}
          </p>
          <div className="row wrap" style={{ marginTop: -10, marginBottom: 16, gap: 6 }}>
            <button className="btn sm ghost" onClick={() => readPara(pi)}>{reading === pi && !all ? <><Square size={13} /> Durdur</> : <><Volume2 size={14} /> Dinle</>}</button>
            <button className="btn sm ghost" aria-label="Yavaş dinle" title="Yavaş dinle" onClick={() => readPara(pi, Math.min(rate, SLOW))}><Snail size={15} /></button>
            <button className="btn sm ghost" onClick={() => toggleTr(pi)}><Languages size={14} /> Türkçesi</button>
          </div>
          {showTr.has(pi) && <div className="card small sub" style={{ marginBottom: 16, fontFamily: "var(--font)" }}>{tr?.[pi] || paraTr[pi]}</div>}
        </div>
      ))}
      {sel && (
        <div className="card pop" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 84, width: "min(560px, calc(100% - 24px))", zIndex: 50, boxShadow: "var(--shadow-2)", fontFamily: "var(--font)", fontSize: 15 }}>
          <div className="row between">
            <div className="row"><b className="display" style={{ fontSize: 24 }}>{sel.w?.w || sel.tok}</b>{sel.w && <Lv lv={sel.w.lv} />}<span className="ipa small">{sel.w?.ipa}</span></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn icon" aria-label="Dinle" onClick={() => speak(sel.w?.w || sel.tok, { rate })}><Volume2 size={18} /></button>
              <button className="btn icon" aria-label="Yavaş dinle" onClick={() => speak(sel.w?.w || sel.tok, { rate: 0.5 })}><Snail size={17} /></button>
              {sel.w && <button className="btn icon primary" aria-label="Desteye ekle" disabled={added.has(sel.w.id)} onClick={async () => {
                await addCard("word", sel.w!.id); setAdded(new Set([...added, sel.w!.id])); toast("Desteye eklendi");
              }}>{added.has(sel.w.id) ? <Check size={18} /> : <Plus size={18} />}</button>}
              <button className="btn icon" aria-label="Kapat" onClick={() => { setSel(null); setSent(null); }}>✕</button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontWeight: 650 }}>{sel.w ? (trShow(sel.w.tr, 3) || sel.w.d[0]?.g) : "Sözlükte yok (özel isim olabilir)."}</div>
          {!sent ? <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={transSentence}><Languages size={14} /> Bu cümleyi çevir</button>
            : <div className="card small" style={{ marginTop: 8, padding: "8px 10px", background: "var(--iris-soft)" }}>
                <div className="muted tiny row between" style={{ fontStyle: "italic" }}><span>{sent.en}</span>
                  <span className="row" style={{ gap: 4 }}><button className="btn sm ghost" aria-label="Cümleyi dinle" onClick={() => speak(sent.en, { rate })}><Volume2 size={13} /></button><button className="btn sm ghost" aria-label="Cümleyi yavaş dinle" onClick={() => speak(sent.en, { rate: SLOW })}><Snail size={13} /></button></span></div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>{sent.err ? `Çevrilemedi: ${sent.err}` : sent.tr ?? "Çevriliyor…"}</div>
              </div>}
        </div>
      )}
    </div>
  );
}
