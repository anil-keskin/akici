import { useEffect, useState } from "react";
import { Flame, Repeat, Sparkles, Trophy, Cloud, MessageCircle, Dices } from "lucide-react";
import { motion } from "motion/react";
import { LokiBuddy, CountUp } from "../components/fx";
import { AudioBtn, Lv, Mascot } from "../components/ui";
import { TRACKS, unitPid } from "../lib/tracks";
import { WordSheet } from "../components/WordSheet";
import { counts } from "../lib/srs";
import { goal, levelFromXp, onStats, streak, today, totalXp } from "../lib/stats";
import { words, type Word, trShow } from "../lib/data";
import { db, kvGet } from "../lib/db";
import { go } from "../lib/router";

function hello() {
  const h = new Date().getHours();
  return h < 6 ? "İyi geceler" : h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar";
}
const daySeed = () => { const d = new Date(); return d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(); };

export default function Home() {
  const [st, setSt] = useState({ xp: 0, goal: 50, streak: 0, shield: false, due: 0, fresh: 0, total: 0, mature: 0, lvl: { lvl: 1, into: 0, need: 120 }, minutes: 0 });
  const [wod, setWod] = useState<Word | null>(null);
  const [open, setOpen] = useState<Word | null>(null);
  const [name, setName] = useState("");
  const [noBackup, setNoBackup] = useState(false);
  useEffect(() => { kvGet("sync.code", "").then((c) => setNoBackup(!c)); }, []);
  const [lastTrack, setLastTrack] = useState("");
  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());

  const refresh = async () => {
    const [t, g, s, c, tx] = await Promise.all([today(), goal(), streak(), counts(), totalXp()]);
    setSt({ xp: t.xp, goal: g, streak: s.days, shield: s.shieldUsed, due: c.due, fresh: c.fresh, total: c.total, mature: c.mature, lvl: levelFromXp(tx), minutes: t.minutes });
  };
  useEffect(() => {
    refresh();
    kvGet("lastTrack", "").then(setLastTrack);
    db.progress.where("kind").equals("ai").toArray().then((r) => setDoneSet(new Set(r.filter((p) => p.done > 0).map((p) => p.id))));
    const off = onStats(refresh);
    kvGet("name", "").then(setName);
    kvGet("level", "A1").then((l) => {
      const band = { A1: [0, 600], A2: [600, 1500], B1: [1500, 3500], B2: [3500, 7000], C1: [7000, 12000], C2: [12000, 20000] }[l] || [0, 600];
      words().then((ws) => setWod(ws[band[0] + (daySeed() % (band[1] - band[0]))]));
    });
    return off;
  }, []);

  const pct = Math.min(1, st.xp / st.goal);
  const last = lastTrack ? TRACKS.find((t) => t.id === lastTrack) : undefined;
  const lastN = last ? last.units.filter((un) => doneSet.has(unitPid(un))).length : 0;
  return (
    <div className="col stagger" style={{ gap: 16, maxWidth: 640, margin: "0 auto" }}>
      <div className="today-top">
        <LokiBuddy size={50} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="muted small">{hello()}</div>
          <b style={{ fontSize: 20 }}>{name || "Hoş geldin"}</b>
        </div>
        <span className="pill" title="Gün serisi"><Flame size={16} color="#ff7a00" /> {st.streak}</span>
        <span className="pill" title="Seviye"><Trophy size={15} color="var(--amber)" /> {st.lvl.lvl}</span>
      </div>

      <div className="go-card">
        <div className="row between" style={{ alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 800, letterSpacing: ".06em" }}>GÜNÜN DERSİ · ~5 DK</div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, marginTop: 4 }}>{st.xp >= st.goal ? "Hedef tamam! Bir ders daha?" : "Yeni kelimeler, gramer ve konuşma"}</div>
          </div>
          <motion.div style={{ background: "rgba(255,255,255,.92)", borderRadius: "50%", padding: 4, flex: "none" }} animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}><Mascot size={60} mood={st.xp >= st.goal ? "wow" : "happy"} /></motion.div>
        </div>
        <div>
          <div className="meter"><motion.i initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }} /></div>
          <div className="small" style={{ marginTop: 6 }}><CountUp to={st.xp} /> / {st.goal} XP · günlük hedef</div>
        </div>
        <button className="btn white" onClick={() => go("/ders")}><Sparkles size={20} /> {st.xp > 0 ? "Devam et" : "Başla"}</button>
      </div>

      <div className="quick">
        <button onClick={() => go("/tekrar")}>{st.due > 0 && <span className="badge">{st.due}</span>}<Repeat size={24} color="var(--sky)" />Tekrar</button>
        <button onClick={() => go("/sohbet")}><MessageCircle size={24} color="var(--mint)" />Loki ile konuş</button>
        <button onClick={() => go("/rastgele")}><Dices size={24} color="var(--amber)" />Rastgele</button>
      </div>

      {last ? (
        <button className={`track-card ${last.color}`} style={{ flexDirection: "row", alignItems: "center", gap: 12 }} onClick={() => go(`/yol/${last.id}`)}>
          <span className="track-emoji">{last.emoji}</span>
          <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
            <span className="tiny muted" style={{ fontWeight: 800, letterSpacing: ".05em" }}>KALDIĞIN KATEGORİ</span>
            <b>{last.title}</b>
            <span className="track-prog" style={{ marginTop: 4 }}><i style={{ width: `${(lastN / last.units.length) * 100}%` }} /></span>
          </span>
          <span className="small" style={{ fontWeight: 800 }}>{lastN}/{last.units.length}</span>
        </button>
      ) : null}

      <div className="row between"><div className="sec-title">Kategoriler</div><button className="btn sm ghost" onClick={() => go("/ogren")}>Tümü</button></div>
      <div className="scroll-x" style={{ gap: 10 }}>
        {TRACKS.slice(0, 6).map((t) => (
          <button key={t.id} className={`track-card ${t.color}`} style={{ minWidth: 150, maxWidth: 150 }} onClick={() => go(`/yol/${t.id}`)}>
            <span className="track-emoji">{t.emoji}</span><b>{t.title}</b>
          </button>
        ))}
      </div>

      {wod && (
        <div className="card hover" onClick={() => setOpen(wod)}>
          <div className="row between"><span className="sec-title" style={{ margin: 0 }}>Günün kelimesi</span><Lv lv={wod.lv} /></div>
          <div className="row between" style={{ marginTop: 8, gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div className="display" style={{ fontSize: 32, fontWeight: 650 }}>{wod.w}</div>
              <div className="ipa">{wod.ipa}</div>
              <div className="sub" style={{ marginTop: 4 }}>{trShow(wod.tr, 3) || wod.d[0]?.g}</div>
            </div>
            <AudioBtn text={wod.w} slow={false} />
          </div>
        </div>
      )}

      {noBackup && (
        <button className="btn ghost" style={{ justifyContent: "flex-start" }} onClick={() => go("/ayarlar")}><Cloud size={18} color="var(--mint)" /> İlerlemeni yedekle (telefon değişse de kaybolmaz)</button>
      )}
      <WordSheet w={open} onClose={() => setOpen(null)} />
    </div>
  );
}
