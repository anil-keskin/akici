import { useEffect, useMemo, useState } from "react";
import { go } from "../lib/router";
import { Search, Plus, Check, BookOpen } from "lucide-react";
import { Lv, PageHead, Spinner, toast, AudioBtn, Bar } from "../components/ui";
import { WordSheet } from "../components/WordSheet";
import { LEVELS, LEVEL_TR, POS_TR, words, type Level, type Word, trShow } from "../lib/data";
import { db } from "../lib/db";
import { useChangeEffect, usePersist } from "../lib/persist";
import { addCard, cardId } from "../lib/srs";
import { getSettings } from "../lib/settings";
import { norm } from "../lib/grade";

const POS = ["noun", "verb", "adj", "adv"];

export default function Words() {
  const [all, setAll] = useState<Word[] | null>(null);
  const [q, setQ] = useState("");
  const [lv, setLv] = usePersist<Level | "all">("words.lv", "A1");
  const [pos, setPos] = usePersist<string>("words.pos", "");
  const [page, setPage] = usePersist<number>("words.page", 0);
  const [lastBatch, setLastBatch] = useState<number[]>([]);
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
  useChangeEffect(() => setPage(0), [q, lv, pos]);
  if (!all) return <Spinner label=" 20.000 kelime yükleniyor…" />;
  const known = list.filter((w) => deck.has(w.id)).length;
  const addNext = async (n: number) => {
    const todo = list.filter((w) => !deck.has(w.id) && (w.tr.length || w.d.length)).slice(0, n);
    for (const w of todo) await addCard("word", w.id);
    setDeck(new Set([...deck, ...todo.map((w) => w.id)]));
    setLastBatch(todo.map((w) => w.id));
    toast(`${todo.length} kelime desteye eklendi`);
  };
  const undoBatch = async () => {
    await db.cards.bulkDelete(lastBatch.map((id) => cardId("word", id)));
    const d = new Set(deck); lastBatch.forEach((id) => d.delete(id)); setDeck(d);
    toast(`${lastBatch.length} kelime desteden çıkarıldı`); setLastBatch([]);
  };
  const PER = 50;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const shown = list.slice(page * PER, page * PER + PER);
  const openIdx = open ? list.findIndex((w) => w.id === open.id) : -1;
  const pager = list.length > PER && (
    <div className="row between" style={{ padding: "8px 4px" }}>
      <button className="btn sm" disabled={page === 0} onClick={() => { setPage(page - 1); window.scrollTo({ top: 0 }); }}>‹ Önceki {PER}</button>
      <span className="muted small">{page * PER + 1}–{Math.min(list.length, page * PER + PER)} / {list.length.toLocaleString("tr")}</span>
      <button className="btn sm" disabled={page + 1 >= pages} onClick={() => { setPage(page + 1); window.scrollTo({ top: 0 }); }}>Sonraki {PER} ›</button>
    </div>
  );
  return (
    <div>
      <PageHead title="Kelimeler" sub={`${all.length.toLocaleString("tr")} kelime · en sık kullanılandan başlayarak. İlk 2.000 kelime günlük konuşmanın ~%80'ini kapsar.`}
        icon={<div className="ico iris"><BookOpen /></div>} right={<div className="row" style={{ gap: 6 }}><button className="btn sm amber" onClick={() => go("/rastgele?k=kelime")}>🎲 Rastgele</button><button className="btn sm primary" onClick={() => go("/pratik?k=vocab&t=" + encodeURIComponent("useful everyday vocabulary") + "&b=/kelimeler")}>✨ Loki alıştırma</button></div>} />
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
              <div className="row" style={{ gap: 6 }}>
                {lastBatch.length > 0 && <button className="btn sm ghost" onClick={undoBatch}>↶ Son {lastBatch.length}'yi geri al</button>}
                <button className="btn primary sm" onClick={() => addNext(20)}><Plus size={16} /> Sıradaki 20'yi öğren</button>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="sp" />
      <div className="card" style={{ padding: 8 }}>
        {pager}
        <div className="list">
          {shown.map((w) => (
            <div key={w.id} className="li" onClick={() => setOpen(w)}>
              <span className="muted tiny" style={{ width: 44, textAlign: "right" }}>{w.id}</span>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 17 }}>{w.w}</b><span className="ipa small">{w.ipa}</span></div>
                <div className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{trShow(w.tr, 3) || w.d[0]?.g}</div>
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
        {pager}
        {!list.length && <div className="muted" style={{ padding: 20, textAlign: "center" }}>Sonuç yok.</div>}
      </div>
      <WordSheet w={open} onClose={() => setOpen(null)}
        onPrev={openIdx > 0 ? () => setOpen(list[openIdx - 1]) : undefined}
        onNext={openIdx >= 0 && openIdx + 1 < list.length ? () => setOpen(list[openIdx + 1]) : undefined} />
    </div>
  );
}
