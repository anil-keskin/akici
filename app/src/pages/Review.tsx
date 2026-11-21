import { useEffect, useState } from "react";
import { X, Repeat, Layers, Eye, Keyboard, Headphones } from "lucide-react";
import { AudioBtn, Bar, Empty, Mascot, PageHead, Spinner, confetti } from "../components/ui";
import { StepView } from "./Session";
import type { Result } from "../components/Exercises";
import { phrases, words, type Phrase, type Word, trShow } from "../lib/data";
import { db, type CardRow } from "../lib/db";
import { counts, dueCards, newCards, preview, review, Rating } from "../lib/srs";
import { wordStep, type Step } from "../lib/lesson";
import { go } from "../lib/router";
import { speak } from "../lib/speech";

type Mode = "flash" | "mixed" | "type" | "listen";
const MODES: { k: Mode; t: string; d: string; i: typeof Layers }[] = [
  { k: "flash", t: "Kartlar", d: "Anki tarzı: gör, hatırla, kendini puanla", i: Layers },
  { k: "mixed", t: "Karışık", d: "Seçmeli, yazma, dinleme, cümlede boşluk", i: Repeat },
  { k: "type", t: "Yazarak", d: "Türkçesini gör, İngilizcesini yaz (en güçlü hatırlama)", i: Keyboard },
  { k: "listen", t: "Dinleyerek", d: "Duy, yaz — kulak eğitimi", i: Headphones },
];

export default function Review() {
  const [c, setC] = useState<Awaited<ReturnType<typeof counts>> | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => { counts().then(setC); }, [mode]);
  if (mode) return <Runner mode={mode} onExit={() => setMode(null)} />;
  if (!c) return <Spinner />;
  return (
    <div>
      <PageHead title="Tekrar" sub="FSRS algoritması her kartı tam unutmak üzereyken karşına çıkarır. Günde 10 dakika yeter." />
      <div className="grid g4">
        <div className="card"><div className="stat"><b style={{ color: "var(--coral)" }}>{c.due}</b><span className="muted small">bugün vadesi gelen</span></div></div>
        <div className="card"><div className="stat"><b style={{ color: "var(--iris)" }}>{c.fresh}</b><span className="muted small">yeni (hiç çalışılmamış)</span></div></div>
        <div className="card"><div className="stat"><b style={{ color: "var(--sky)" }}>{c.learning + c.young}</b><span className="muted small">öğreniliyor</span></div></div>
        <div className="card"><div className="stat"><b style={{ color: "var(--mint)" }}>{c.mature}</b><span className="muted small">kalıcı (21+ gün)</span></div></div>
      </div>
      <div className="sp" />
      {c.total === 0 ? (
        <Empty title="Destende henüz kart yok" text="Kelimeler, kalıplar ya da okuma ekranından kart ekle; ya da günün dersine başla." action={<button className="btn primary" onClick={() => go("/ders")}>Günün dersi</button>} />
      ) : (
        <div className="grid g2">
          {MODES.map((m) => (
            <div key={m.k} className="card hover row" onClick={() => setMode(m.k)}>
              <div className="ico iris"><m.i /></div>
              <div className="grow"><div className="h3">{m.t}</div><div className="muted small">{m.d}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Item { row: CardRow; w?: Word; p?: Phrase; step?: Step }

function Runner({ mode, onExit }: { mode: Mode; onExit: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [t0, setT0] = useState(Date.now());
  useEffect(() => {
    (async () => {
      const [ws, ps] = await Promise.all([words(), phrases()]);
      const due = await dueCards(60);
      const fresh = due.length < 20 ? await newCards(20 - due.length) : [];
      const rows = [...due, ...fresh];
      const out: Item[] = [];
      for (const row of rows) {
        const it: Item = { row };
        if (row.kind === "word") it.w = ws[Number(row.ref) - 1];
        if (row.kind === "phrase") it.p = ps.find((x) => x.id === Number(row.ref));
        if (it.w && mode !== "flash") {
          it.step = mode === "type" ? { t: "type", w: it.w, card: row.id } : mode === "listen" ? { t: "listen", w: it.w, card: row.id } : await wordStep(it.w, ws, row.card.stability, row.id);
        }
        if (it.w || it.p || row.kind === "custom") out.push(it);
      }
      setItems(out);
    })();
  }, [mode]);
  useEffect(() => {
    const it = items?.[i];
    if (!it || mode !== "flash" || flip) return;
    const k = (e: KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlip(true); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [items, i, flip, mode]);
  useEffect(() => {
    if (mode !== "flash" || !flip) return;
    const k = (e: KeyboardEvent) => { const n = Number(e.key); if (n >= 1 && n <= 4) rate(n as 1 | 2 | 3 | 4); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  if (!items) return <Spinner />;
  const it = items[i];
  if (!it) {
    confetti();
    return (
      <div className="ex-wrap col" style={{ alignItems: "center", textAlign: "center", paddingTop: 40 }}>
        <Mascot size={120} mood="wow" /><h1 className="h1">Bugünlük tekrar bitti!</h1>
        <p className="sub">{items.length} kart çalıştın. Kartlar unutmaya yaklaştıkça tekrar gelecek.</p>
        <button className="btn primary big" onClick={onExit}>Tamam</button>
      </div>
    );
  }
  async function rate(r: 1 | 2 | 3 | 4) {
    await review(items![i].row.id, r, Date.now() - t0, mode);
    setFlip(false); setT0(Date.now()); setI((x) => x + 1);
  }
  const onStep = async (r: Result) => {
    const g = r === "ok" ? Rating.Good : r === "typo" || r === "skip" ? Rating.Hard : Rating.Again;
    await rate(g as 1 | 2 | 3 | 4);
  };
  const front = it.w ? it.w.w : it.p ? it.p.w : it.row.front || "";
  const back = it.w ? (trShow(it.w.tr, 6) || it.w.d[0]?.g) : it.p ? (trShow(it.p.tr, 6) || it.p.g) : it.row.back || "";
  const pv = preview(it.row);
  return (
    <div className="ex-wrap">
      <div className="ex-top">
        <button className="btn icon" aria-label="Çık" onClick={onExit}><X /></button>
        <Bar value={i / items.length} />
        <span className="muted small">{i + 1}/{items.length}</span>
      </div>
      {it.step ? <div key={i} className="pop"><StepView step={it.step} onDone={onStep} /></div> : (
        <div key={i} className="col" style={{ gap: 18 }}>
          <div className={`flip ${flip ? "on" : ""}`} onClick={() => { if (!flip) { setFlip(true); speak(front); } }}>
            <div className="flip-in card pad-lg" style={{ minHeight: 320 }}>
              <div className="face">
                <div className="muted small">{it.p ? "Kalıp" : it.row.kind === "custom" ? "Kendi kartın" : "Kelime"}</div>
                <div className="prompt-word" style={{ fontSize: front.length > 16 ? 36 : undefined }}>{front}</div>
                {it.w?.ipa && <div className="ipa">{it.w.ipa}</div>}
                <div className="muted small row"><Eye size={14} /> Hatırlamaya çalış, sonra dokun (Boşluk)</div>
              </div>
              <div className="face back">
                <div className="display" style={{ fontSize: 30, fontWeight: 650 }}>{front}</div>
                <AudioBtn text={front} />
                <div className="h2">{back}</div>
                {it.p?.ex && <div className="muted small" style={{ fontStyle: "italic" }}>“{it.p.ex}”</div>}
                {it.row.note && <div className="tag mt">💡 {it.row.note}</div>}
              </div>
            </div>
          </div>
          {flip && (
            <div className="grid g4 pop" style={{ gap: 10 }}>
              {([[1, "Tekrar", "coral"], [2, "Zor", ""], [3, "İyi", "mint"], [4, "Kolay", "primary"]] as const).map(([r, l, cls]) => (
                <button key={r} className={`btn ${cls} col`} style={{ gap: 0, padding: "10px 6px" }} onClick={(e) => { e.stopPropagation(); rate(r); }}>
                  <span>{l}</span><span className="tiny" style={{ opacity: .8, fontWeight: 600 }}>{pv[r]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export async function deckSize() { return db.cards.count(); }
