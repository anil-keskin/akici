// Kategori yolu: dersler dikey bir yolda. Düğüme dokun → Ders (alıştırma) / Kelimeler / Konuş (Loki ile canlandırma).
// Kilit yok: istediğin derse atlayabilirsin; yol sadece önerilen sırayı ve ilerlemeni gösterir.
import { useEffect, useState } from "react";
import { TrackIcon } from "../components/TrackIcon";
import { motion } from "motion/react";
import { ArrowLeft, Check, Star, Sparkles, BookOpen, MessageCircle } from "lucide-react";
import { Bar, Lv, Sheet } from "../components/ui";
import { TRACKS, trackById, unitPid, type Unit } from "../lib/tracks";
import { LEVELS, type Level } from "../lib/data";
import { db, kvSet } from "../lib/db";
import { go } from "../lib/router";

export default function TrackPage({ id }: { id?: string }) {
  const t = id ? trackById(id) : undefined;
  const [done, setDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    db.progress.where("kind").equals("ai").toArray().then((r) => setDone(new Set(r.filter((p) => p.done > 0).map((p) => p.id))));
    if (t) kvSet("lastTrack", t.id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return <TrackList done={done} />;
  const isDone = (un: Unit) => done.has(unitPid(un));
  const n = t.units.filter(isDone).length;
  const cur = t.units.findIndex((un) => !isDone(un));
  return (
    <div className="col" style={{ gap: 16, maxWidth: 620, margin: "0 auto" }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => go("/ogren")}><ArrowLeft size={16} /> Öğren</button>
      <div className={`card col track-head ${t.color}`} style={{ gap: 10 }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="track-emoji"><TrackIcon id={t.id} /></div>
          <div style={{ minWidth: 0 }}><h1 className="h2" style={{ margin: 0 }}>{t.title}</h1><div className="small muted">{t.sub}</div></div>
        </div>
        <div className="row between small" style={{ fontWeight: 700 }}><span>{n} / {t.units.length} ders</span><span>{Math.round((n / t.units.length) * 100)}%</span></div>
        <Bar value={n / t.units.length} cls="mint" />
        {cur >= 0 && <button className="btn primary big" onClick={() => setOpen(cur)}><Star size={18} fill="currentColor" /> Devam: {t.units[cur].t}</button>}
      </div>
      <div className="path">
        {t.units.map((un, k) => {
          const d = isDone(un), now = k === cur;
          const x = [0, 56, 84, 56, 0, -56, -84, -56][k % 8];
          return (
            <div key={k} className="path-row" style={{ transform: `translateX(${x}px)`, ["--x" as string]: `${x}px` }}>
              {now && <div className="path-bubble">BAŞLA</div>}
              <motion.button className={`node ${d ? "done" : now ? "now" : "next"}`} aria-label={un.t} onClick={() => setOpen(k)}
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.08 + k * 0.06, type: "spring", stiffness: 420, damping: 16 }} whileTap={{ scale: 0.9 }}>
                {d ? <Check size={30} strokeWidth={3.5} /> : <span style={{ fontSize: 22, fontWeight: 800 }}>{k + 1}</span>}
              </motion.button>
              <span className="small" style={{ fontWeight: 700, maxWidth: 140, textAlign: "center" }}>{un.t}</span>
            </div>
          );
        })}
      </div>
      <Sheet open={open !== null} onClose={() => setOpen(null)}>
        {open !== null && <UnitSheet t={t.id} un={t.units[open]} k={open} done={isDone(t.units[open])} />}
      </Sheet>
    </div>
  );
}

function UnitSheet({ t, un, k, done }: { t: string; un: Unit; k: number; done: boolean }) {
  const [lv, setLv] = useState<Level>(un.lv);
  const back = encodeURIComponent(`/yol/${t}`);
  const topic = encodeURIComponent(un.en);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 8 }}><span className="tag">Ders {k + 1}</span><Lv lv={un.lv} />{done && <span className="tag" style={{ background: "var(--mint)", color: "#fff" }}>Bitti ✓</span>}</div>
      <h2 className="h2" style={{ margin: 0 }}>{un.t}</h2>
      <div className="col" style={{ gap: 6 }}>
        <span className="muted small">Seviye (istersen değiştir; her seferinde yeni içerik gelir)</span>
        <div className="row wrap" style={{ gap: 6 }}>{LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}</div>
      </div>
      <button className="btn primary big" onClick={() => go(`/pratik?k=free&t=${topic}&lv=${lv}&b=${back}`)}><Sparkles size={18} /> {done ? "Tekrar çalış (yeni sorular)" : "Derse başla"}</button>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost grow" onClick={() => go(`/pratik?k=vocab&t=${encodeURIComponent("key vocabulary for " + un.en)}&lv=${lv}&b=${back}`)}><BookOpen size={17} /> Kelimeler</button>
        <button className="btn ghost grow" onClick={() => go(`/sohbet?mode=roleplay&rp=${encodeURIComponent(un.rp)}&rt=${encodeURIComponent(un.t)}`)}><MessageCircle size={17} /> Konuş</button>
      </div>
      <div className="muted tiny">Ders: ~12 soru (boşluk doldurma, cümle kurma, dinle-söyle). Kelimeler: bu konunun önemli kelimeleri. Konuş: Loki bu durumu seninle canlandırır.</div>
    </div>
  );
}

function TrackList({ done }: { done: Set<string> }) {
  return (
    <div className="col" style={{ gap: 14 }}>
      <h1 className="h1">Kategoriler</h1>
      <TrackGrid done={done} />
    </div>
  );
}

/** Öğren ekranında da kullanılan kategori kartları */
export function TrackGrid({ done }: { done: Set<string> }) {
  return (
    <div className="track-grid">
      {TRACKS.map((t) => {
        const n = t.units.filter((un) => done.has(unitPid(un))).length;
        return (
          <button key={t.id} className={`track-card ${t.color}`} onClick={() => go(`/yol/${t.id}`)}>
            <span className="track-emoji"><TrackIcon id={t.id} /></span>
            <b>{t.title}</b>
            <span className="small muted">{t.sub}</span>
            <span className="track-prog"><i style={{ width: `${(n / t.units.length) * 100}%` }} /></span>
            <span className="tiny muted">{n} / {t.units.length} ders</span>
          </button>
        );
      })}
    </div>
  );
}
