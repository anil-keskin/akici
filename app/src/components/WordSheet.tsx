import { useEffect, useState } from "react";
import { Plus, Check, Sparkles } from "lucide-react";
import { POS_TR, sentencesById, type Word, type Sentence } from "../lib/data";
import { addCard, cardId, hasCard } from "../lib/srs";
import { AudioBtn, Lv, Sheet, toast } from "./ui";
import { go } from "../lib/router";

export function WordView({ w }: { w: Word }) {
  const [ex, setEx] = useState<Sentence[]>([]);
  const [inDeck, setIn] = useState(false);
  useEffect(() => {
    setEx([]);
    sentencesById(w.s, [w.lv, "A1", "A2", "B1", "B2", "C1", "C2"]).then(setEx);
    hasCard(cardId("word", w.id)).then(setIn);
  }, [w]);
  const add = async () => { await addCard("word", w.id); setIn(true); toast(`“${w.w}” desteye eklendi`); };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row between wrap">
        <div>
          <div className="row" style={{ gap: 10 }}><Lv lv={w.lv} /><span className="muted small">#{w.id} en sık kelime</span></div>
          <div className="display" style={{ fontSize: 46, fontWeight: 650, marginTop: 6 }}>{w.w}</div>
          {w.ipa && <div className="ipa" style={{ fontSize: 18 }}>{w.ipa}</div>}
        </div>
        <AudioBtn text={w.w} big />
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {w.pos.map((p) => <span key={p} className="tag">{POS_TR[p] || p}</span>)}
        {w.fl.map((f) => <span key={f} className="tag">{f}</span>)}
        {!!w.mt && <span className="tag mt" title="Bu karşılık yerel yapay zekâ ile çevrildi">makine çevirisi</span>}
      </div>
      {w.tr.length > 0 && <div className="h3" style={{ fontSize: 22 }}>{w.tr.join(" · ")}</div>}
      {w.d.length > 0 && (
        <div className="card" style={{ background: "var(--surface-2)", padding: 16 }}>
          {w.d.map((d, i) => (
            <div key={i} style={{ marginBottom: i < w.d.length - 1 ? 10 : 0 }}>
              <span className="tag" style={{ marginRight: 6 }}>{POS_TR[d.p] || d.p}</span>
              <span>{d.g}</span>
              {d.ex && <div className="muted small" style={{ marginTop: 4, fontStyle: "italic" }}>“{d.ex}”</div>}
            </div>
          ))}
        </div>
      )}
      {ex.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <div className="h3">Gerçek cümlelerde</div>
          {ex.map(([id, en, tr]) => (
            <div key={id} className="row" style={{ alignItems: "flex-start" }}>
              <AudioBtn text={en} size={16} slow={false} />
              <div><div style={{ fontWeight: 650 }}>{en}</div><div className="muted small">{tr}</div></div>
            </div>
          ))}
        </div>
      )}
      {(w.f.length > 0 || w.syn.length > 0 || w.ant.length > 0) && (
        <div className="grid g3 small">
          {w.f.length > 0 && <div><div className="muted tiny">Biçimleri</div>{w.f.join(", ")}</div>}
          {w.syn.length > 0 && <div><div className="muted tiny">Eş anlamlı</div>{w.syn.join(", ")}</div>}
          {w.ant.length > 0 && <div><div className="muted tiny">Zıt anlamlı</div>{w.ant.join(", ")}</div>}
        </div>
      )}
      <div className="row wrap">
        <button className={`btn ${inDeck ? "ghost" : "primary"}`} onClick={add} disabled={inDeck}>{inDeck ? <><Check size={18} /> Destede</> : <><Plus size={18} /> Öğrenmeye ekle</>}</button>
        <button className="btn ghost" onClick={() => go(`/sohbet?mode=vocab&q=${encodeURIComponent(w.w)}`)}><Sparkles size={18} /> AI ile çalış</button>
      </div>
    </div>
  );
}

export function WordSheet({ w, onClose }: { w: Word | null; onClose: () => void }) {
  return <Sheet open={!!w} onClose={onClose}>{w && <WordView w={w} />}</Sheet>;
}
