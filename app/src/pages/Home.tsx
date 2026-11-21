import { useEffect, useState } from "react";
import { Flame, Repeat, Sparkles, BookOpen, GraduationCap, Headphones, Mic, Theater, MessageCircle, Library, Quote, ShieldCheck, Trophy, Clock, Clapperboard, Check, Lock, Star, Gift } from "lucide-react";
import { AudioBtn, Bar, Lv, Mascot, Ring } from "../components/ui";
import { WordSheet } from "../components/WordSheet";
import { counts } from "../lib/srs";
import { goal, levelFromXp, onStats, streak, today, totalXp } from "../lib/stats";
import { phrases, words, type Phrase, type Word, KIND_TR } from "../lib/data";
import { db, kvGet } from "../lib/db";
import { go } from "../lib/router";

function hello() {
  const h = new Date().getHours();
  return h < 6 ? "İyi geceler" : h < 12 ? "Günaydın" : h < 18 ? "İyi günler" : "İyi akşamlar";
}
const daySeed = () => { const d = new Date(); return d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(); };

const MODULES = [
  { to: "/kelimeler", t: "Kelimeler", d: "20.000 kelime, sıklık sırasıyla", i: BookOpen, c: "iris" },
  { to: "/gramer", t: "Gramer", d: "A1'den C1'e konu konu", i: GraduationCap, c: "mint" },
  { to: "/kaliplar", t: "Kalıplar", d: "Phrasal verb, deyim, atasözü", i: Quote, c: "amber" },
  { to: "/dinleme", t: "Dinleme", d: "Dikte, hızlı dinleme, cümle akışı", i: Headphones, c: "sky" },
  { to: "/konusma", t: "Konuşma", d: "Shadowing, telaffuz puanı", i: Mic, c: "coral" },
  { to: "/okuma", t: "Okuma", d: "Hikâyeler ve klasik kitaplar", i: Library, c: "rose" },
  { to: "/medya", t: "Dizi & Şarkı", d: "Şarkılar, dizi kalıpları, 8.900 diyalog", i: Clapperboard, c: "coral" },
  { to: "/senaryolar", t: "Senaryolar", d: "Restoran, havalimanı, iş görüşmesi…", i: Theater, c: "iris" },
  { to: "/sohbet", t: "AI öğretmen", d: "Sohbet, düzeltme, sınav pratiği", i: MessageCircle, c: "mint" },
] as const;

export default function Home() {
  const [st, setSt] = useState({ xp: 0, goal: 50, streak: 0, shield: false, due: 0, fresh: 0, total: 0, mature: 0, lvl: { lvl: 1, into: 0, need: 120 }, minutes: 0 });
  const [wod, setWod] = useState<Word | null>(null);
  const [pod, setPod] = useState<Phrase | null>(null);
  const [open, setOpen] = useState<Word | null>(null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("A1");
  const [learned, setLearned] = useState(0);

  const refresh = async () => {
    const [t, g, s, c, tx] = await Promise.all([today(), goal(), streak(), counts(), totalXp()]);
    setSt({ xp: t.xp, goal: g, streak: s.days, shield: s.shieldUsed, due: c.due, fresh: c.fresh, total: c.total, mature: c.mature, lvl: levelFromXp(tx), minutes: t.minutes });
  };
  useEffect(() => {
    refresh();
    db.cards.where("kind").equals("word").count().then(setLearned);
    const off = onStats(refresh);
    kvGet("name", "").then(setName);
    kvGet("level", "A1").then((l) => {
      setLevel(l);
      const band = { A1: [0, 600], A2: [600, 1500], B1: [1500, 3500], B2: [3500, 7000], C1: [7000, 12000], C2: [12000, 20000] }[l] || [0, 600];
      words().then((ws) => setWod(ws[band[0] + (daySeed() % (band[1] - band[0]))]));
    });
    phrases().then((ps) => { const pool = ps.filter((p) => p.tr.length && (p.k === "idiom" || p.k === "phrasal")).slice(0, 1500); setPod(pool[daySeed() % pool.length]); });
    return off;
  }, []);

  const pct = st.xp / st.goal;
  return (
    <div className="stack">
      <div className="hero">
        <div className="blob" style={{ width: 260, height: 260, right: -60, top: -80, background: "#ff9be0" }} />
        <div className="blob" style={{ width: 200, height: 200, left: "40%", bottom: -120, background: "#6fd3ff" }} />
        <div className="row between wrap" style={{ position: "relative", gap: 24 }}>
          <div className="col" style={{ gap: 10, maxWidth: 520 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="chip" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}><Flame size={16} /> {st.streak} gün seri</span>
              {st.shield && <span className="chip" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }} title="Bu hafta bir boş günün affedildi"><ShieldCheck size={16} /> Kalkan</span>}
              <span className="chip" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}><Trophy size={16} /> Seviye {st.lvl.lvl}</span>
            </div>
            <h1 className="h1" style={{ color: "#fff" }}>{hello()}{name ? `, ${name}` : ""}!</h1>
            <div className="sub">{st.due > 0 ? `${st.due} kart tekrarını bekliyor. ` : ""}Bugünkü dersin hazır: yeni kelimeler, gramer, dinleme ve konuşma karışık.</div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn big white" onClick={() => go("/ders")}><Sparkles size={20} /> {st.xp > 0 ? "Devam et" : "Günün dersine başla"}</button>
              {st.due > 0 && <button className="btn big" style={{ background: "rgba(255,255,255,.16)", color: "#fff" }} onClick={() => go("/tekrar")}><Repeat size={20} /> Tekrar ({st.due})</button>}
            </div>
          </div>
          <Ring value={pct} size={150} stroke={14} track="rgba(255,255,255,.2)">
            <div><div style={{ fontSize: 32, fontWeight: 800 }}>{st.xp}</div><div className="small" style={{ opacity: .8 }}>/ {st.goal} XP</div></div>
          </Ring>
        </div>
      </div>

      <Path learned={learned} />

      <div className="grid g4">
        <Stat icon={<Repeat />} c="sky" v={st.due} l="Tekrar bekleyen" onClick={() => go("/tekrar")} />
        <Stat icon={<BookOpen />} c="iris" v={st.total} l="Destedeki kart" onClick={() => go("/kelimeler")} />
        <Stat icon={<Trophy />} c="mint" v={st.mature} l="Kalıcı öğrenilen" />
        <Stat icon={<Clock />} c="amber" v={`${st.minutes} dk`} l="Bugün çalışma" />
      </div>

      <div className="grid g2">
        {wod && (
          <div className="card hover" onClick={() => setOpen(wod)}>
            <div className="row between"><span className="muted small" style={{ fontWeight: 700 }}>GÜNÜN KELİMESİ</span><Lv lv={wod.lv} /></div>
            <div className="row between" style={{ marginTop: 8 }}>
              <div>
                <div className="display" style={{ fontSize: 36, fontWeight: 650 }}>{wod.w}</div>
                <div className="ipa">{wod.ipa}</div>
                <div className="sub" style={{ marginTop: 6 }}>{wod.tr.slice(0, 3).join(" · ") || wod.d[0]?.g}</div>
              </div>
              <AudioBtn text={wod.w} slow={false} />
            </div>
          </div>
        )}
        {pod && (
          <div className="card">
            <div className="row between"><span className="muted small" style={{ fontWeight: 700 }}>GÜNÜN KALIBI</span><span className="tag">{KIND_TR[pod.k]}</span></div>
            <div className="row between" style={{ marginTop: 8 }}>
              <div>
                <div className="display" style={{ fontSize: 30, fontWeight: 650 }}>{pod.w}</div>
                <div className="sub" style={{ marginTop: 6 }}>{pod.tr.join(" · ")}</div>
                {pod.ex && <div className="muted small" style={{ marginTop: 6, fontStyle: "italic" }}>“{pod.ex}”</div>}
              </div>
              <AudioBtn text={pod.ex || pod.w} slow={false} />
            </div>
          </div>
        )}
      </div>

      <div className="row between"><h2 className="h2">Ne çalışmak istersin?</h2><span className="muted small">Seviyen: <Lv lv={level} /></span></div>
      <div className="grid g4">
        {MODULES.map((m) => (
          <div key={m.to} className="card hover" onClick={() => go(m.to)}>
            <div className={`ico ${m.c}`}><m.i size={22} /></div>
            <div className="h3" style={{ marginTop: 12 }}>{m.t}</div>
            <div className="muted small">{m.d}</div>
          </div>
        ))}
      </div>

      <div className="card row" style={{ gap: 18 }}>
        <Mascot size={64} mood="wow" />
        <div className="grow">
          <div className="h3">Seviye {st.lvl.lvl} → {st.lvl.lvl + 1}</div>
          <div className="muted small" style={{ margin: "4px 0 8px" }}>{st.lvl.into} / {st.lvl.need} XP · Tekrar yapmak ve konuşmak en çok XP kazandırır.</div>
          <Bar value={st.lvl.into / st.lvl.need} cls="amber" />
        </div>
        <button className="btn ghost" onClick={() => go("/test")}>Seviye testi</button>
      </div>
      <WordSheet w={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Stat({ icon, c, v, l, onClick }: { icon: React.ReactNode; c: string; v: number | string; l: string; onClick?: () => void }) {
  return (
    <div className={`card ${onClick ? "hover" : ""}`} onClick={onClick}>
      <div className="row"><div className={`ico ${c}`}>{icon}</div><div className="stat"><b>{v}</b><span className="muted small">{l}</span></div></div>
    </div>
  );
}

/* Duolingo tarzı öğrenme yolu: her ünite 20 kelime (sıklık sırasıyla), her 5. durak tekrar sandığı. */
const UNIT = 20;
function Path({ learned }: { learned: number }) {
  const cur = Math.floor(learned / UNIT);
  const start = Math.max(0, cur - 2);
  const nodes = Array.from({ length: 6 }, (_, k) => start + k);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div><div className="h3">Öğrenme yolu</div><div className="muted small">Ünite {cur + 1} / 1000 · her ünite en sık kullanılan 20 yeni kelime</div></div>
        <span className="tag">{learned.toLocaleString("tr")} / 20.000 kelime</span>
      </div>
      <div className="path">
        {nodes.map((u, k) => {
          const done = u < cur, now = u === cur, chest = (u + 1) % 5 === 0;
          const x = [0, 60, 90, 60, 0, -60, -90, -60][k % 8];
          return (
            <div key={u} className="path-row" style={{ transform: `translateX(${x}px)` }}>
              {now && <div className="path-bubble">BAŞLA</div>}
              <button className={`node ${done ? "done" : now ? "now" : "lock"} ${chest ? "chest" : ""}`} aria-label={`Ünite ${u + 1}`}
                disabled={!done && !now} onClick={() => go(chest && done ? "/tekrar" : "/ders")}>
                {done ? <Check size={30} strokeWidth={3.5} /> : !now ? <Lock size={24} /> : chest ? <Gift size={30} /> : <Star size={30} fill="currentColor" />}
              </button>
              <span className="muted tiny">{chest ? "Tekrar" : `Ünite ${u + 1}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
