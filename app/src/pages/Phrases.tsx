import { useEffect, useMemo, useState } from "react";
import { usePersist } from "../lib/persist";
import { Quote, Plus, Check, Search, Sparkles } from "lucide-react";
import { AudioBtn, PageHead, Spinner, toast, Sheet } from "../components/ui";
import { KIND_TR, phrases, type Phrase, trShow } from "../lib/data";
import { db } from "../lib/db";
import { addCard } from "../lib/srs";
import { norm } from "../lib/grade";
import { go } from "../lib/router";

const KINDS = ["phrasal", "idiom", "proverb", "phrase"] as const;
const TIPS: Record<string, string> = {
  phrasal: "Phrasal verb = fiil + edat (give up, look after). Anlamı çoğu zaman tahmin edilemez; cümle içinde ezberle.",
  idiom: "Deyimler kelime kelime çevrilmez. 'Break the ice' = buzları kırmak (ortamı yumuşatmak).",
  proverb: "Atasözlerinin çoğunun Türkçe karşılığı var; eşleştirerek öğrenmek kolaylaştırır.",
  phrase: "Kalıplar konuşmada hazır parçalar gibidir: ezberle, aynen kullan.",
};

export default function Phrases() {
  const [all, setAll] = useState<Phrase[] | null>(null);
  const [k, setK] = usePersist<(typeof KINDS)[number]>("phr.k", "phrasal");
  const [q, setQ] = useState("");
  const [onlyTr, setOnlyTr] = useState(true);
  const [pages, setPages] = usePersist<Record<string, number>>("phr.pages", {});
  const [deck, setDeck] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Phrase | null>(null);
  useEffect(() => {
    phrases().then(setAll);
    db.cards.where("kind").equals("phrase").toArray().then((r) => setDeck(new Set(r.map((c) => Number(c.ref)))));
  }, []);
  const list = useMemo(() => {
    if (!all) return [];
    const nq = norm(q, false);
    return all.filter((p) => (nq ? p.w.includes(nq) || p.tr.some((t) => norm(t, false).includes(nq)) : p.k === k) && (!onlyTr || p.tr.length || nq));
  }, [all, k, q, onlyTr]);
  const page = q ? 0 : pages[k] || 0;
  const setPage = (n: number) => { setPages({ ...pages, [k]: n }); window.scrollTo({ top: 0 }); };
  const PER = 40;
  if (!all) return <Spinner />;
  const add = async (p: Phrase) => { await addCard("phrase", p.id); setDeck(new Set([...deck, p.id])); toast(`“${p.w}” desteye eklendi`); };
  const counts = Object.fromEntries(KINDS.map((x) => [x, all.filter((p) => p.k === x).length]));
  return (
    <div>
      <PageHead title="Kalıplar & deyimler" sub={`${all.length.toLocaleString("tr")} phrasal verb, deyim, atasözü ve kalıp`} icon={<div className="ico amber"><Quote /></div>} right={<button className="btn sm amber" onClick={() => go("/rastgele?k=kalip")}>🎲 Rastgele</button>} />
      <div className="card col" style={{ gap: 12 }}>
        <div className="row" style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, color: "var(--ink-3)" }} />
          <input className="input" style={{ paddingLeft: 42 }} placeholder="Ara… (ör. give up, vazgeçmek)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="scroll-x">
          {KINDS.map((x) => <button key={x} className={`chip ${k === x && !q ? "on" : ""}`} onClick={() => { setK(x); setQ(""); }}>{KIND_TR[x]} · {counts[x]}</button>)}
          <button className={`chip ${onlyTr ? "on" : ""}`} onClick={() => setOnlyTr(!onlyTr)}>Sadece Türkçesi olanlar</button>
        </div>
        {!q && <div className="muted small">💡 {TIPS[k]}</div>}
        {!q && list.length > PER && <div className="small">📍 Kaldığın yer: {page * PER + 1}–{Math.min(list.length, page * PER + PER)} / {list.length.toLocaleString("tr")}</div>}
      </div>
      <div className="sp" />
      <div className="grid auto">
        {list.slice(page * PER, page * PER + PER).map((p) => (
          <div key={p.id} className="card hover col" style={{ gap: 6 }} onClick={() => setOpen(p)}>
            <div className="row between"><b className="display" style={{ fontSize: 21 }}>{p.w}</b>
              <button className="btn icon sm" aria-label="Desteye ekle" disabled={deck.has(p.id)} onClick={(e) => { e.stopPropagation(); add(p); }}>{deck.has(p.id) ? <Check size={16} color="var(--mint)" /> : <Plus size={16} />}</button>
            </div>
            <div style={{ fontWeight: 650 }}>{trShow(p.tr, 6) || <span className="muted small">{p.g}</span>}</div>
            {p.ex && <div className="muted small" style={{ fontStyle: "italic" }}>“{p.ex}”</div>}
          </div>
        ))}
      </div>
      {list.length > PER && (
        <div className="row between" style={{ marginTop: 16 }}>
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Önceki {PER}</button>
          <span className="muted small">{page * PER + 1}–{Math.min(list.length, page * PER + PER)} / {list.length.toLocaleString("tr")}</span>
          <button className="btn sm" disabled={(page + 1) * PER >= list.length} onClick={() => setPage(page + 1)}>Sonraki {PER} ›</button>
        </div>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <div className="col" style={{ gap: 14 }}>
            <span className="tag">{KIND_TR[open.k]}</span>
            <div className="row between"><div className="display" style={{ fontSize: 38, fontWeight: 650 }}>{open.w}</div><AudioBtn text={open.w} /></div>
            {open.tr.length > 0 && <div className="h2">{trShow(open.tr, 6)}</div>}
            <div className="card" style={{ background: "var(--surface-2)" }}>{open.g}</div>
            {open.ex && <div className="row"><AudioBtn text={open.ex} size={16} slow={false} /><i>“{open.ex}”</i></div>}
            <div className="row wrap">
              <button className="btn primary" disabled={deck.has(open.id)} onClick={() => add(open)}>{deck.has(open.id) ? "Destede" : "Öğrenmeye ekle"}</button>
              <button className="btn ghost" onClick={() => go(`/sohbet?mode=explain&q=${encodeURIComponent(`"${open.w}" ne demek, nasıl kullanılır? Örneklerle açıkla.`)}`)}><Sparkles size={16} /> AI açıklasın</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
