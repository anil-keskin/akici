// Dokun-çevir okuyucu: kelimeye dokun → anlamı, desteye ekle, cümleyi çevir. Keşfet ve benzeri sayfalarda kullanılır.
import { useEffect, useMemo, useState } from "react";
import { Volume2, Plus, Check, Languages, Square } from "lucide-react";
import { Lv, toast } from "./ui";
import { findWord, type Word, trShow } from "../lib/data";
import { addCard } from "../lib/srs";
import { speak, stopSpeaking } from "../lib/speech";
import { sentenceAt, translateTr } from "../lib/ai";

export function TapText({ paras, tr }: { paras: string[]; tr?: string[] }) {
  const [sel, setSel] = useState<{ tok: string; w?: Word; pi: number; ti: number } | null>(null);
  const [sent, setSent] = useState<{ en: string; tr?: string; err?: string } | null>(null);
  const [showTr, setShowTr] = useState<Set<number>>(new Set());
  const [paraTr, setParaTr] = useState<Record<number, string>>({});
  const [reading, setReading] = useState<number | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const toks = useMemo(() => paras.map((p) => p.split(/(\s+|[.,!?;:"“”()—-]+)/)), [paras]);
  useEffect(() => () => stopSpeaking(), []);

  const tap = async (tok: string, pi: number, ti: number) => { setSent(null); setSel({ tok, pi, ti }); setSel({ tok, pi, ti, w: await findWord(tok) }); };
  const transSentence = async () => {
    if (!sel) return;
    const en = sentenceAt(paras[sel.pi], toks[sel.pi].slice(0, sel.ti).join("").length);
    setSent({ en });
    try { setSent({ en, tr: await translateTr(en) }); } catch (e) { setSent({ en, err: (e as Error).message }); }
  };
  const readPara = async (pi: number) => {
    if (reading === pi) { stopSpeaking(); setReading(null); return; }
    setReading(pi); await speak(paras[pi]); setReading(null);
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
      {toks.map((ts, pi) => (
        <div key={pi}>
          <p>
            {ts.map((t, ti) => /^[A-Za-z’']+$/.test(t)
              ? <span key={ti} className={`tok ${sel?.pi === pi && sel.ti === ti ? "sel" : ""}`} onClick={() => tap(t, pi, ti)}>{t}</span>
              : <span key={ti}>{t}</span>)}
          </p>
          <div className="row" style={{ marginTop: -10, marginBottom: 16, gap: 6 }}>
            <button className="btn sm ghost" onClick={() => readPara(pi)}>{reading === pi ? <><Square size={13} /> Durdur</> : <><Volume2 size={14} /> Dinle</>}</button>
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
              <button className="btn icon" aria-label="Dinle" onClick={() => speak(sel.w?.w || sel.tok)}><Volume2 size={18} /></button>
              {sel.w && <button className="btn icon primary" aria-label="Desteye ekle" disabled={added.has(sel.w.id)} onClick={async () => {
                await addCard("word", sel.w!.id); setAdded(new Set([...added, sel.w!.id])); toast("Desteye eklendi");
              }}>{added.has(sel.w.id) ? <Check size={18} /> : <Plus size={18} />}</button>}
              <button className="btn icon" aria-label="Kapat" onClick={() => { setSel(null); setSent(null); }}>✕</button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontWeight: 650 }}>{sel.w ? (trShow(sel.w.tr, 3) || sel.w.d[0]?.g) : "Sözlükte yok (özel isim olabilir)."}</div>
          {!sent ? <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={transSentence}><Languages size={14} /> Bu cümleyi çevir</button>
            : <div className="card small" style={{ marginTop: 8, padding: "8px 10px", background: "var(--iris-soft)" }}>
                <div className="muted tiny" style={{ fontStyle: "italic" }}>{sent.en}</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>{sent.err ? `Çevrilemedi: ${sent.err}` : sent.tr ?? "Çevriliyor…"}</div>
              </div>}
        </div>
      )}
    </div>
  );
}
