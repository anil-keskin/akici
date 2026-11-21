import { useEffect, useState } from "react";
import { BarChart3, Flame, Trophy, Clock, Mic, Target, BookOpen } from "lucide-react";
import { Bar, Lv, PageHead, Ring } from "../components/ui";
import { lastDays, levelFromXp, streak, totalXp } from "../lib/stats";
import { counts } from "../lib/srs";
import { db, type DayStat } from "../lib/db";
import { words, LEVELS } from "../lib/data";
import { levelBand } from "../lib/lesson";
import { go } from "../lib/router";

export default function Progress() {
  const [days, setDays] = useState<DayStat[]>([]);
  const [s, setS] = useState({ streak: 0, xp: 0, mature: 0, total: 0, grammar: 0 });
  const [byLevel, setByLevel] = useState<Record<string, [number, number]>>({});
  useEffect(() => {
    (async () => {
      setDays(await lastDays(182));
      const [st, xp, c, g] = await Promise.all([streak(), totalXp(), counts(), db.progress.where("kind").equals("grammar").count()]);
      setS({ streak: st.days, xp, mature: c.mature, total: c.total, grammar: g });
      const rows = await db.cards.where("kind").equals("word").toArray();
      const ws = await words();
      const res: Record<string, [number, number]> = {};
      for (const lv of LEVELS) { const [a, b] = levelBand(lv); res[lv] = [0, b - a + 1]; }
      for (const r of rows) { const w = ws[Number(r.ref) - 1]; if (w && r.card.stability >= 7) res[w.lv][0]++; }
      setByLevel(res);
    })();
  }, []);
  const lv = levelFromXp(s.xp);
  const sum = (k: keyof DayStat) => days.reduce((a, d) => a + (d[k] as number), 0);
  const max = Math.max(1, ...days.map((d) => d.xp));
  const acc = sum("total") ? Math.round((sum("correct") / sum("total")) * 100) : 0;
  const last30 = days.slice(-30);
  return (
    <div className="stack">
      <PageHead title="İlerleme" sub="Ölçtüğün şey gelişir." icon={<div className="ico iris"><BarChart3 /></div>} right={<button className="btn ghost" onClick={() => go("/test")}>Seviye testi</button>} />
      <div className="grid g4">
        <Card i={<Flame />} c="coral" v={`${s.streak} gün`} l="Seri" />
        <Card i={<Trophy />} c="amber" v={s.xp.toLocaleString("tr")} l={`Toplam XP · Seviye ${lv.lvl}`} />
        <Card i={<BookOpen />} c="mint" v={s.mature} l="Kalıcı öğrenilen kart" />
        <Card i={<Target />} c="sky" v={`%${acc}`} l="Doğruluk (6 ay)" />
      </div>
      <div className="card">
        <div className="row between"><div className="h3">Son 30 gün (XP)</div><span className="muted small"><Clock size={14} /> {sum("minutes")} dk · <Mic size={14} /> {Math.round(sum("speakSec") / 60)} dk konuşma</span></div>
        <div className="row" style={{ alignItems: "flex-end", gap: 4, height: 160, marginTop: 16 }}>
          {last30.map((d) => (
            <div key={d.day} title={`${d.day}: ${d.xp} XP`} style={{ flex: 1, height: `${(d.xp / max) * 100}%`, minHeight: 3, borderRadius: 6, background: d.xp ? "linear-gradient(180deg, var(--iris-2), var(--iris))" : "var(--bg-2)" }} />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="h3" style={{ marginBottom: 12 }}>Çalışma takvimi (6 ay)</div>
        <div className="heat" style={{ overflowX: "auto" }}>
          {days.map((d) => <i key={d.day} title={`${d.day}: ${d.xp} XP`} style={d.xp ? { background: `color-mix(in srgb, var(--mint) ${Math.min(100, 25 + (d.xp / max) * 75)}%, transparent)` } : undefined} />)}
        </div>
      </div>
      <div className="card">
        <div className="h3" style={{ marginBottom: 14 }}>Seviyelere göre kelime hâkimiyeti</div>
        <div className="col" style={{ gap: 12 }}>
          {LEVELS.map((l) => { const [k, n] = byLevel[l] || [0, 1]; return (
            <div key={l} className="row"><Lv lv={l} /><div className="grow"><Bar value={k / n} cls="mint" /></div><span className="small muted" style={{ width: 110, textAlign: "right" }}>{k} / {n.toLocaleString("tr")}</span></div>
          ); })}
        </div>
        <div className="muted tiny" style={{ marginTop: 10 }}>Bir kelime, hafıza dayanıklılığı 7 günü geçince "hâkim" sayılır.</div>
      </div>
      <div className="card row"><Ring value={lv.into / lv.need} size={90} stroke={10}><b>{lv.lvl}</b></Ring><div><div className="h3">Seviye {lv.lvl}</div><div className="muted small">Sonraki seviyeye {lv.need - lv.into} XP · {s.grammar} gramer konusu tamamlandı</div></div></div>
    </div>
  );
}
function Card({ i, c, v, l }: { i: React.ReactNode; c: string; v: string | number; l: string }) {
  return <div className="card row"><div className={`ico ${c}`}>{i}</div><div className="stat"><b>{v}</b><span className="muted small">{l}</span></div></div>;
}
