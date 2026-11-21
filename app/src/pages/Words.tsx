import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Check, BookOpen } from "lucide-react";
import { Lv, PageHead, Spinner, toast, AudioBtn, Bar } from "../components/ui";
import { WordSheet } from "../components/WordSheet";
import { LEVELS, LEVEL_TR, POS_TR, words, type Level, type Word } from "../lib/data";
import { db } from "../lib/db";
import { addCard } from "../lib/srs";
import { getSettings } from "../lib/settings";
import { norm } from "../lib/grade";

const POS = ["noun", "verb", "adj", "adv"];

export default function Words() {
  const [all, setAll] = useState<Word[] | null>(null);
  const [q, setQ] = useState("");
  const [lv, setLv] = useState<Level | "all">("A1");
  const [pos, setPos] = useState<string>("");
  const [limit, setLimit] = useState(80);
  const [open, setOpen] = useState<Word | null>(null);
  const [deck, setDeck] = useState<Set<number>>(new Set());
  useEffect(() => {
    words().then(setAll);
    db.cards.where("kind").equals("word").toArray().then((r) => setDeck(new Set(r.map((c) => Number(c.ref)))));
  }, []);
  const list = useMemo(() => {
    if (!all) return [];
    const nq = norm(q, false);
    return all.filter((w) => {
      if (!getSettings().showVulgar && w.fl.includes("vulgar")) return false;
      if (nq) return w.w.toLowerCase().startsWith(nq) || w.tr.some((t) => norm(t, false).includes(nq));
      return (lv === "all" || w.lv === lv) && (!pos || w.pos[0] === pos);
    });
  }, [all, q, lv, pos]);
  useEffect(() => setLimit(80), [q, lv, pos]);
  if (!all) return <Spinner label=" 20.000 kelime yükleniyor…" />;
  const known = list.filter((w) => deck.has(w.id)).length;
  const addNext = async (n: number) => {
    const todo = list.filter((w) => !deck.has(w.id) && (w.tr.length || w.d.length)).slice(0, n);
    for (const w of todo) await addCard("word", w.id);
    setDeck(new Set([...deck, ...todo.map((w) => w.id)]));
    toast(`${todo.length} kelime desteye eklendi`);
  };
  return (
    <div>
      <PageHead title="Kelimeler" sub={`${all.length.toLocaleString("tr")} kelime · en sık kullanılandan başlayarak. İlk 2.000 kelime günlük konuşmanın ~%80'ini kapsar.`}
        icon={<div className="ico iris"><BookOpen /></div>} />
      <div className="card col" style={{ gap: 14 }}>
        <div className="row" style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, color: "var(--ink-3)" }} />
          <input className="input" style={{ paddingLeft: 42 }} placeholder="Kelime ya da Türkçe anlam ara… (ör. take, almak)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!q && (
          <>
            <div className="scroll-x">
              {LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}><Lv lv={l} /> {LEVEL_TR[l]}</button>)}
              <button className={`chip ${lv === "all" ? "on" : ""}`} onClick={() => setLv("all")}>Tümü</button>
            </div>
            <div className="scroll-x">
              <button className={`chip ${!pos ? "on" : ""}`} onClick={() => setPos("")}>Hepsi</button>
              {POS.map((p) => <button key={p} className={`chip ${pos === p ? "on" : ""}`} onClick={() => setPos(p)}>{POS_TR[p]}</button>)}
            </div>
            <div className="row wrap between">
              <div className="grow" style={{ minWidth: 200 }}>
                <div className="small muted">{known} / {list.length} kelime destende</div>
                <Bar value={list.length ? known / list.length : 0} cls="mint" />
              </div>
              <button className="btn primary sm" onClick={() => addNext(20)}><Plus size={16} /> Sıradaki 20'yi öğren</button>
            </div>
          </>
        )}
      </div>
      <div className="sp" />
      <div className="card" style={{ padding: 8 }}>
        <div className="list">
          {list.slice(0, limit).map((w) => (
            <div key={w.id} className="li" onClick={() => setOpen(w)}>
              <span className="muted tiny" style={{ width: 44, textAlign: "right" }}>{w.id}</span>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{w.w}</b><span className="ipa small">{w.ipa}</span></div>
                <div className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.tr.slice(0, 3).join(" · ") || w.d[0]?.g}</div>
              </div>
              <Lv lv={w.lv} />
              <AudioBtn text={w.w} size={16} slow={false} />
              <button className="btn icon" aria-label="Desteye ekle" disabled={deck.has(w.id)}
                onClick={async (e) => { e.stopPropagation(); await addCard("word", w.id); setDeck(new Set([...deck, w.id])); toast(`“${w.w}” eklendi`); }}>
                {deck.has(w.id) ? <Check size={16} color="var(--mint)" /> : <Plus size={16} />}
              </button>
            </div>
          ))}
        </div>
        {list.length > limit && <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setLimit(limit + 120)}>Daha fazla göster ({(list.length - limit).toLocaleString("tr")})</button>}
        {!list.length && <div className="muted" style={{ padding: 20, textAlign: "center" }}>Sonuç yok.</div>}
      </div>
      <WordSheet w={open} onClose={() => setOpen(null)} />
    </div>
  );
}
