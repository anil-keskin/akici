// Keşfet → Oyunlar: Loki'nin her seferinde yeni ürettiği kısa İngilizce oyunlar (seviyeye göre).
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Check, X, Sparkles, Smile, BookOpenText, Lightbulb, Scale, RotateCcw } from "lucide-react";
import { Lv, Mascot, Spinner } from "../components/ui";
import { Celebrate, Burst, haptic } from "../components/fx";
import { TapText } from "../components/TapText";
import { aiJson } from "../lib/ai";
import { LEVELS, type Level } from "../lib/data";
import { kvGet } from "../lib/db";
import { addStat } from "../lib/stats";
import { sfx } from "../lib/sfx";
import { speak } from "../lib/speech";
import { go } from "../lib/router";
import { usePersist } from "../lib/persist";

const GAMES = [
  { id: "dogru-yanlis", t: "Doğru mu, yanlış mı?", d: "Şaşırtıcı iddialar: tahmin et, öğren", I: Scale, c: "sky" },
  { id: "bil-bakalim", t: "Bil bakalım", d: "Loki kelimeyi anlatır, sen bulursun", I: Lightbulb, c: "amber" },
  { id: "emoji", t: "Emoji bilmece", d: "Emojilerden deyimi ve kalıbı bul", I: Smile, c: "coral" },
  { id: "hikaye", t: "Hikâyeni seç", d: "Hikâyeyi sen yönet, okurken öğren", I: BookOpenText, c: "iris" },
] as const;
type GameId = (typeof GAMES)[number]["id"];

interface Q { prompt: string; opts: string[]; a: string; why?: string; say?: string }

/** Şıkları karıştır (yapay zekâ doğru cevabı hep başa koyuyor) */
const mix = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

const SYS = "You create fun, accurate English-learning mini games for Turkish adults. Facts must be true and well-known; no politics, violence or medical advice. Explanations ('why', 'tr') are in natural TURKISH. Return ONLY JSON.";

async function makeQuiz(id: GameId, lv: string): Promise<Q[]> {
  if (id === "dogru-yanlis") {
    const d = await aiJson<{ items: { s: string; t: boolean; why: string }[] }>(SYS,
      `Make 8 surprising TRUE or FALSE statements (science, animals, history, geography, language, everyday life) for a CEFR ${lv} learner. Mix true and false roughly 50/50. Vocabulary suitable for ${lv}. Return JSON {"items":[{"s":"English statement","t":true,"why":"Türkçe kısa açıklama (doğrusu ne)"}]}`, 1800);
    return (d.items || []).filter((x) => x.s && typeof x.t === "boolean").map((x) => ({ prompt: x.s, opts: ["Doğru", "Yanlış"], a: x.t ? "Doğru" : "Yanlış", why: x.why, say: x.s }));
  }
  if (id === "bil-bakalim") {
    const d = await aiJson<{ items: { clue: string; a: string; o: string[]; tr: string }[] }>(SYS,
      `Make 8 "guess the word" riddles for a CEFR ${lv} learner. For each, describe an everyday English word in 1-2 simple English sentences WITHOUT using the word itself. Give 4 options (the answer + 3 plausible wrong words of the same type). Return JSON {"items":[{"clue":"...","a":"answer","o":["4 options incl. answer"],"tr":"cevabın Türkçesi"}]}`, 1800);
    return (d.items || []).filter((x) => x.clue && x.a && Array.isArray(x.o)).map((x) => ({ prompt: x.clue, opts: mix(Array.from(new Set([...x.o, x.a])).slice(0, 4)), a: x.a, why: `${x.a} = ${x.tr}`, say: x.clue }));
  }
  const d = await aiJson<{ items: { e: string; a: string; o: string[]; tr: string }[] }>(SYS,
    `Make 8 emoji puzzles: each is a sequence of 2-4 emojis that represents a common English idiom, phrasal verb or fixed expression suitable for a CEFR ${lv} learner. Give 4 English options (answer + 3 wrong but plausible expressions). Return JSON {"items":[{"e":"emojis","a":"the expression","o":["4 options incl. answer"],"tr":"Türkçe anlamı ve kısa örnek"}]}`, 1800);
  return (d.items || []).filter((x) => x.e && x.a && Array.isArray(x.o)).map((x) => ({ prompt: x.e, opts: mix(Array.from(new Set([...x.o, x.a])).slice(0, 4)), a: x.a, why: `${x.a} — ${x.tr}`, say: x.a }));
}

export default function Games({ id }: { id?: string }) {
  const [lv, setLv] = usePersist<Level>("game.lv", "B1");
  useEffect(() => { kvGet<Level>("level", "B1").then((l) => { try { if (!localStorage.getItem("pos:game.lv")) setLv(l); } catch { /* */ } }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const g = GAMES.find((x) => x.id === id);
  if (g?.id === "hikaye") return <Adventure lv={lv} />;
  if (g) return <QuizGame key={g.id} id={g.id} title={g.t} lv={lv} />;
  return (
    <div className="col stagger" style={{ gap: 14, maxWidth: 760, margin: "0 auto" }}>
      <div className="row" style={{ gap: 12 }}>
        <Mascot size={56} />
        <div><h1 className="h2" style={{ margin: 0 }}>Oyunlar</h1><div className="muted small">Her oyunda Loki yepyeni sorular yazar.</div></div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}><span className="muted small" style={{ alignSelf: "center" }}>Seviye:</span>{LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}</div>
      <div className="track-grid">
        {GAMES.map((x) => (
          <button key={x.id} className={`track-card ${x.c}`} onClick={() => go(`/oyun/${x.id}`)}>
            <span className="track-emoji"><x.I size={28} /></span>
            <b>{x.t}</b>
            <span className="small muted">{x.d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuizGame({ id, title, lv }: { id: GameId; title: string; lv: string }) {
  const [qs, setQs] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [ok, setOk] = useState(0);
  const [err, setErr] = useState("");
  const [round, setRound] = useState(0);
  useEffect(() => {
    setQs(null); setI(0); setOk(0); setPick(null); setErr("");
    makeQuiz(id, lv).then((q) => (q.length >= 3 ? setQs(q) : setErr("Oyun hazırlanamadı, tekrar dene."))).catch((e) => setErr(e.message));
  }, [id, lv, round]);
  if (err) return <div className="col" style={{ gap: 12, maxWidth: 560, margin: "0 auto" }}><div className="card" style={{ background: "var(--coral-soft)" }}>⚠️ {err}</div><button className="btn primary" onClick={() => setRound(round + 1)}><RotateCcw size={16} /> Tekrar dene</button></div>;
  if (!qs) return <Spinner label=" Loki oyunu hazırlıyor…" />;
  if (i >= qs.length) {
    const acc = Math.round((ok / qs.length) * 100);
    return (
      <Celebrate title={`${title} bitti!`} xp={ok * 4 + 10} acc={acc} extra={`${ok} / ${qs.length} doğru`}>
        <button className="btn primary big" onClick={() => setRound(round + 1)}><RotateCcw size={18} /> Yeni sorularla oyna</button>
        <button className="btn ghost big" onClick={() => go("/oyun")}>Oyunlar</button>
      </Celebrate>
    );
  }
  const q = qs[i];
  const choose = (o: string) => {
    if (pick) return;
    setPick(o);
    const good = o === q.a;
    if (good) setOk((x) => x + 1);
    sfx(good ? "ok" : "bad"); haptic(good ? "ok" : "bad");
    addStat({ xp: good ? 4 : 1, correct: good ? 1 : 0, total: 1 });
  };
  const next = () => { setPick(null); setI(i + 1); };
  return (
    <div className="ex-wrap col" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 10 }}>
        <button className="btn icon" aria-label="Çık" onClick={() => go("/oyun")}><ArrowLeft /></button>
        <div className="bar grow"><i style={{ width: `${(i / qs.length) * 100}%` }} /></div>
        <Lv lv={lv} />
      </div>
      <div className="muted small" style={{ textAlign: "center", fontWeight: 800 }}>{title} · {i + 1} / {qs.length}</div>
      <motion.div key={i} className="card col" style={{ gap: 10, alignItems: "center", textAlign: "center", padding: 24 }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ fontSize: id === "emoji" ? 54 : 22, fontWeight: 800, lineHeight: 1.35 }}>{q.prompt}</div>
        {id !== "emoji" && <button className="btn sm ghost" onClick={() => speak(q.say || q.prompt)}>🔊 Dinle</button>}
      </motion.div>
      <div className={id === "dogru-yanlis" ? "row" : "col"} style={{ gap: 10 }}>
        {q.opts.map((o) => (
          <button key={o} className={`opt grow ${pick && o === q.a ? "ok" : pick === o ? "bad" : ""}`} style={id === "dogru-yanlis" ? { justifyContent: "center", fontSize: 18 } : undefined} disabled={!!pick} onClick={() => choose(o)}>
            {id === "dogru-yanlis" && (o === "Doğru" ? <Check size={20} /> : <X size={20} />)}<span className="grow" style={id === "dogru-yanlis" ? { flex: "none" } : undefined}>{o}</span>
          </button>
        ))}
      </div>
      {pick && (
        <motion.div className={`feedback ${pick === q.a ? "ok" : "bad"}`} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <div style={{ position: "relative", flex: "none" }}><Mascot size={50} mood={pick === q.a ? "happy" : "sad"} />{pick === q.a && <Burst />}</div>
          <div className="grow"><b>{pick === q.a ? "Doğru!" : `Cevap: ${q.a}`}</b>{q.why && <div className="small" style={{ marginTop: 2 }}>{q.why}</div>}</div>
          <button className={`btn ${pick === q.a ? "mint" : "coral"}`} onClick={next}>Devam</button>
        </motion.div>
      )}
    </div>
  );
}

/** Hikâyeni seç: Loki bir paragraf yazar + 3 seçenek; sen seçersin, hikâye 6 adımda biter. */
function Adventure({ lv }: { lv: string }) {
  const [story, setStory] = useState<{ text: string; choices: string[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [gen, setGen] = useState(0); // "Yeni hikâye" → sıfırdan başlat
  const STEPS = 6;
  const step = async (choice?: string) => {
    setBusy(true); setErr("");
    const so = story.map((s, k) => `${s.text}${picked[k] ? `\n[Reader chose: ${picked[k]}]` : ""}`).join("\n\n");
    const last = story.length + 1 >= STEPS;
    try {
      const d = await aiJson<{ text: string; choices: string[] }>(SYS,
        `${story.length ? `Story so far:\n${so}\n\nThe reader chose: "${choice}". Continue the story.` : `Start a new, original, fun adventure story (pick a random genre: mystery, sci-fi, fantasy, travel, comedy or detective). Second person ("you").`}
Write ONE paragraph (60-90 words) for a CEFR ${lv} learner. ${last ? "This is the FINAL part: give a satisfying ending and return an empty choices array." : "End at a decision point and give exactly 3 short choices (max 8 words each)."}
Return JSON {"text":"...","choices":[${last ? "" : '"...","...","..."'}]}`, 900);
      if (!d.text) throw new Error("Hikâye yazılamadı");
      setStory((s) => [...s, { text: String(d.text).trim(), choices: (d.choices || []).map(String).slice(0, 3) }]);
      addStat({ xp: 3 });
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 100);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { step(); }, [gen]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = story[story.length - 1];
  const done = story.length >= STEPS || (cur && !cur.choices.length);
  return (
    <div className="col" style={{ gap: 14, maxWidth: 760, margin: "0 auto" }}>
      <div className="row between">
        <button className="btn ghost sm" onClick={() => go("/oyun")}><ArrowLeft size={16} /> Oyunlar</button>
        <span className="row" style={{ gap: 6 }}><Lv lv={lv} /><span className="muted small">Bölüm {story.length} / {STEPS}</span></span>
      </div>
      {story.map((s, k) => (
        <motion.div key={k} className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <TapText paras={[s.text]} />
          {picked[k] && <div className="small" style={{ marginTop: -6, color: "var(--iris)", fontWeight: 800 }}>➜ Seçimin: {picked[k]}</div>}
        </motion.div>
      ))}
      {err && <div className="card small" style={{ background: "var(--coral-soft)" }}>⚠️ {err} <button className="btn sm" onClick={() => step(picked[picked.length - 1])}>Tekrar dene</button></div>}
      {busy && <Spinner label=" Loki yazıyor…" />}
      {!busy && cur && !done && (
        <div className="col" style={{ gap: 8 }}>
          <b className="small">Ne yaparsın?</b>
          {cur.choices.map((c) => <button key={c} className="opt" onClick={() => { setPicked((p) => [...p, c]); step(c); }}><Sparkles size={16} color="var(--iris)" /> <span className="grow">{c}</span></button>)}
        </div>
      )}
      {done && !busy && (
        <div className="card col" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
          <Mascot size={70} mood="wow" /><b>Hikâye bitti! 🎉</b>
          <button className="btn primary" onClick={() => { setStory([]); setPicked([]); setGen((g) => g + 1); }}><RotateCcw size={16} /> Yeni hikâye</button>
        </div>
      )}
    </div>
  );
}
