// Uygulamanın her yerinde: birkaç kelimeyi / cümleyi seç → altta "Çevir" çubuğu çıkar (tek tek dokunmaya gerek yok).
import { useEffect, useRef, useState } from "react";
import { Languages, Volume2, X } from "lucide-react";
import { translateTr } from "../lib/ai";
import { speak } from "../lib/speech";

export function SelectTranslate() {
  const [sel, setSel] = useState("");
  const [tr, setTr] = useState("");
  const t = useRef<number | undefined>(undefined);
  useEffect(() => {
    const read = () => {
      clearTimeout(t.current);
      t.current = window.setTimeout(() => {
        const s = window.getSelection();
        const txt = (s?.toString() || "").replace(/\s+/g, " ").trim();
        const node = s?.anchorNode?.parentElement;
        if (node?.closest("input, textarea, .sel-bar")) return;
        if (txt.length >= 2 && txt.length <= 1200 && /[A-Za-z]{2}/.test(txt) && txt.includes(" ")) { setSel((p) => { if (p !== txt) setTr(""); return txt; }); }
        else if (!txt && !trRef.current) setSel(""); // seçim kalktı ve henüz çevrilmedi → çubuğu kapat
      }, 450);
    };
    const nav = () => { setSel(""); setTr(""); };
    document.addEventListener("selectionchange", read);
    window.addEventListener("hashchange", nav); // başka sayfaya geçince kapat
    return () => { document.removeEventListener("selectionchange", read); window.removeEventListener("hashchange", nav); clearTimeout(t.current); };
  }, []);
  const trRef = useRef(""); trRef.current = tr;
  if (!sel) return null;
  const close = () => { setSel(""); setTr(""); try { window.getSelection()?.removeAllRanges(); } catch { /* */ } };
  const go = async () => {
    setTr("Çevriliyor…");
    try { setTr(await translateTr(sel)); } catch (e) { setTr(`Çevrilemedi: ${(e as Error).message}`); }
  };
  return (
    <div className="card pop sel-bar" role="dialog" aria-label="Seçili metni çevir"
      style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(84px + env(safe-area-inset-bottom, 0px))", width: "min(620px, calc(100% - 24px))", zIndex: 60, boxShadow: "var(--shadow-2)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
        <div className="small" style={{ fontStyle: "italic", maxHeight: 72, overflowY: "auto", minWidth: 0 }}>“{sel}”</div>
        <button className="btn icon sm" aria-label="Kapat" onClick={close}><X size={15} /></button>
      </div>
      {tr && <div style={{ fontWeight: 650, maxHeight: 140, overflowY: "auto" }}>🇹🇷 {tr}</div>}
      <div className="row" style={{ gap: 6 }}>
        {!tr && <button className="btn sm primary" onClick={go}><Languages size={15} /> Seçimi çevir</button>}
        <button className="btn sm ghost" onClick={() => speak(sel)}><Volume2 size={15} /> Dinle</button>
      </div>
    </div>
  );
}
