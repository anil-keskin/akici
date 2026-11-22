import { useEffect, useState } from "react";
import { Celebrate, combo } from "../components/fx";
import { X, Flame, Trophy, Target, Repeat } from "lucide-react";
import { Bar, Mascot, Spinner, confetti } from "../components/ui";
import { Build, Choice, ClozeLine, Intro, Match, Speak, Typing, blankOut, type Result } from "../components/Exercises";
import { db, kvGet } from "../lib/db";
import { words, sentences, shuffle, pick, type Level, type Word, trShow } from "../lib/data";
import { addCard, dueCards, review, Rating, cardId } from "../lib/srs";
import { addStat, streak } from "../lib/stats";
import { getSettings } from "../lib/settings";
import { go } from "../lib/router";
import { levelBand, meaning, wordStep, type Step } from "../lib/lesson";
import { loadGrammar } from "../lib/grammar";

const RATE: Record<Result, number> = { ok: Rating.Good, typo: Rating.Hard, bad: Rating.Again, skip: Rating.Hard };

async function buildLesson(): Promise<Step[]> {
  const lv = (await kvGet<Level>("level", "A1"));
  const all = await words();
  const steps: Step[] = [];
  // 1) vadesi gelen tekrarlar (en fazla 10)
  const due = await dueCards(10, ["word"]);
  for (const c of due) {
    const w = all[Number(c.ref) - 1];
    if (w) steps.push(await wordStep(w, all, c.card.stability, c.id));
  }
  // 2) yeni kelimeler: seviyedeki ilk öğrenilmemiş kelimeler
  const nNew = Math.max(3, Math.min(8, Math.round(getSettings().dailyNew / 2)));
  const [a, b] = levelBand(lv);
  const known = new Set((await db.cards.where("kind").equals("word").toArray()).map((c) => Number(c.ref)));
  const fresh: Word[] = [];
  for (let i = a - 1; i < Math.min(b + 3000, all.length) && fresh.length < nNew; i++) {
    const w = all[i];
    if (!known.has(w.id) && (w.tr.length || w.d.length) && (getSettings().showVulgar || !w.fl.includes("vulgar"))) fresh.push(w);
  }
  const lvlSents = await sentences(lv);
  for (const w of fresh) {
    const ex = w.s.length ? lvlSents.find((s) => s[0] === w.s[0]) : undefined;
    steps.push({ t: "intro", w, ex }, await wordStep(w, all, 0, cardId("word", w.id)));
  }
  // 3) eşleştirme (bugünün kelimeleri)
  const mpool = [...fresh, ...due.map((c) => all[Number(c.ref) - 1]).filter(Boolean)].filter((w) => w.tr.length);
  if (mpool.length >= 4) steps.push({ t: "match", pairs: pick(mpool, 5).map((w) => [w.w, meaning(w)] as [string, string]) });
  // 4) gramer (açık konu)
  try {
    const g = await loadGrammar();
    const cur = (await kvGet<string>("gramCurrent", "")) || g.find((t) => t.lv === lv)?.id || g[0]?.id;
    const topic = g.find((t) => t.id === cur);
    if (topic?.ex?.length) for (const e of pick(topic.ex, 2)) steps.push({ t: "gram", topic: topic.title, q: e.q, a: e.a, tr: e.tr, h: e.h, ch: e.ch });
  } catch { /* gramer verisi yok */ }
  // 5) cümle kurma + dikte + konuşma
  const short = lvlSents.filter((s) => { const n = s[1].split(" ").length; return n >= 4 && n <= 9; });
  const [s1, s2, s3] = pick(short, 3);
  if (s1) steps.push({ t: "build", s: s1 });
  if (s2) steps.push({ t: "dict", s: s2 });
  if (s3) steps.push({ t: "speak", text: s3[1], tr: s3[2] });
  // karıştır ama tanıtım hemen kendi alıştırmasından önce kalsın
  const blocks: Step[][] = [];
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].t === "intro") { blocks.push([steps[i], steps[i + 1]]); i++; } else blocks.push([steps[i]]);
  }
  return shuffle(blocks).flat();
}

export default function Session() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [i, setI] = useState(0);
  const [stats, setStats] = useState({ ok: 0, bad: 0, xp: 0 });
  const [retry, setRetry] = useState<Step[]>([]);
  const [t0] = useState(Date.now());
  const [end, setEnd] = useState<{ streak: number } | null>(null);
  useEffect(() => { combo.miss(); buildLesson().then(setSteps); }, []);

  if (!steps) return <Spinner label=" Dersin hazırlanıyor…" />;
  const total = steps.length;
  const cur = steps[i];

  const finish = async () => {
    const s = await streak();
    setEnd({ streak: s.days });
  };
  const next = async (r: Result, step: Step) => {
    const good = r === "ok" || r === "typo";
    // FSRS: kelime kartları
    if ("w" in step && step.t !== "intro") {
      const id = step.card || cardId("word", step.w.id);
      await addCard("word", step.w.id);
      await review(id, RATE[r] as 1 | 2 | 3 | 4, 0, step.t);
    } else if (step.t !== "intro" && r !== "skip") {
      await addStat({ xp: good ? 8 : 2, correct: good ? 1 : 0, total: 1 });
    }
    setStats((s) => ({ ok: s.ok + (good ? 1 : 0), bad: s.bad + (r === "bad" ? 1 : 0), xp: s.xp + (step.t === "intro" ? 0 : good ? 8 : 2) }));
    // yanlışlar sonda bir kez daha gelir (Duolingo tekniği)
    const again = r === "bad" && step.t !== "speak" && step.t !== "match" && !retry.includes(step) ? [step] : [];
    if (again.length) setRetry((x) => [...x, ...again]);
    if (i + 1 < steps.length) setI(i + 1);
    else if (retry.length + again.length) { setSteps([...steps, ...retry, ...again]); setRetry([]); setI(i + 1); }
    else finish();
  };

  if (end) {
    const mins = Math.max(1, Math.round((Date.now() - t0) / 60000));
    const acc = stats.ok + stats.bad ? Math.round((stats.ok / (stats.ok + stats.bad)) * 100) : 100;
    return (
      <Celebrate title="Ders tamam!" xp={stats.xp} acc={acc} extra={`doğruluk · ${mins} dk`} streak={end.streak}>
        <button className="btn primary big" onClick={() => location.reload()}><Repeat size={18} /> Bir ders daha</button>
        <button className="btn ghost big" onClick={() => go("/")}>Ana sayfa</button>
      </Celebrate>
    );
  }
  if (!cur) return <Spinner />;
  return (
    <div className="ex-wrap">
      <div className="ex-top">
        <button className="btn icon" aria-label="Çık" onClick={() => go("/")}><X /></button>
        <Bar value={i / total} />
        <span className="chip" style={{ background: "var(--amber-soft)", color: "#c27400" }}><Trophy size={14} /> {stats.xp}</span>
      </div>
      <div key={i} className="pop"><StepView step={cur} onDone={(r) => next(r, cur)} /></div>
    </div>
  );
}

export function StepView({ step, onDone }: { step: Step; onDone: (r: Result) => void }) {
  switch (step.t) {
    case "intro": return <Intro w={step.w} example={step.ex ? [step.ex[1], step.ex[2]] : undefined} onDone={onDone} />;
    case "en2tr": return <Choice prompt={<div className="prompt-word">{step.w.w}</div>} sub="Anlamı ne?" audio={step.w.w} options={step.opts} answer={meaning(step.w)} onDone={onDone} />;
    case "tr2en": return <Choice prompt={<div className="h2">“{meaning(step.w)}”</div>} sub="İngilizcesi hangisi?" options={step.opts} answer={step.w.w} onDone={onDone} />;
    case "type": return <Typing prompt={<><div className="muted">İngilizcesini yaz</div><div className="h2" style={{ marginTop: 6 }}>{trShow(step.w.tr, 2) || step.w.d[0]?.g}</div></>}
      answers={[step.w.w]} placeholder="İngilizce…" onDone={onDone} extra={step.w.ipa || undefined} />;
    case "listen": return <Typing prompt={<div className="h3">Duyduğun kelimeyi yaz</div>} audio={step.w.w} answers={[step.w.w]} onDone={onDone} extra={meaning(step.w)} />;
    case "cloze": {
      const b = blankOut(step.s[1], [step.w.w, ...step.w.f]);
      if (!b) return <Typing prompt={<div className="h2">{meaning(step.w)}</div>} answers={[step.w.w]} onDone={onDone} />;
      return step.opts.length
        ? <Choice prompt={<ClozeLine before={b.before} after={b.after} />} sub={step.s[2]} options={step.opts.map((o) => o)} answer={b.word.toLowerCase() === step.w.w ? step.w.w : b.word} onDone={onDone} />
        : <Typing prompt={<><ClozeLine before={b.before} after={b.after} /><div className="muted" style={{ marginTop: 8 }}>{step.s[2]}</div></>} answers={[b.word]} placeholder="Boşluğa gelen kelime" onDone={onDone} extra={step.s[1]} />;
    }
    case "build": return <Build tr={step.s[2]} en={step.s[1]} onDone={onDone} />;
    case "dict": return <Typing prompt={<div className="h3">Dinle ve cümleyi yaz (dikte)</div>} audio={step.s[1]} answers={[step.s[1]]} placeholder="Duyduğunu yaz…" onDone={onDone} extra={step.s[2]} />;
    case "speak": return <Speak text={step.text} tr={step.tr} onDone={onDone} />;
    case "match": return <Match pairs={step.pairs} onDone={onDone} />;
    case "gram": {
      const [before, after = ""] = step.q.split("___");
      return step.ch?.length
        ? <Choice prompt={<><div className="muted small" style={{ marginBottom: 8 }}>Gramer · {step.topic}</div><ClozeLine before={before} after={after} /></>} sub={step.tr} options={step.ch} answer={step.a} hint={step.h} why={step.why && <WhyNote t={step.why} full={before + step.a + after} />} onDone={onDone} />
        : <Typing prompt={<><div className="muted small" style={{ marginBottom: 8 }}>Gramer · {step.topic}</div><ClozeLine before={before} after={after} /><div className="muted" style={{ marginTop: 8 }}>{step.tr}{step.h ? ` · ipucu: ${step.h}` : ""}</div></>} answers={[step.a]} onDone={onDone} extra={<>{before + step.a + after}{step.why && <div className="small muted">{step.why}</div>}</>} />;
    }
    case "choice":
      return <Choice prompt={<div className="h2" style={{ fontSize: 22 }}>{step.prompt}</div>} sub={step.tr} options={step.opts} answer={step.a} why={step.why && <WhyNote t={step.why} />} onDone={onDone} />;
    case "write":
      return <Typing prompt={<><div className="h3">İngilizceye çevir</div><div className="h2" style={{ marginTop: 6 }}>{step.tr}</div></>} answers={[step.a]} placeholder="İngilizcesini yaz…"
        extra={<>Örnek doğru cevap: <b>{step.a}</b>{step.why && <div className="small muted">{step.why}</div>}<div className="small muted">Farklı ama doğru bir cümle yazdıysan sorun değil; anlam aynıysa kendini doğru say.</div></>} onDone={onDone} />;
  }
}

function WhyNote({ t, full }: { t: string; full?: string }) {
  return <div className="small" style={{ marginTop: 4 }}>{full && <div style={{ fontWeight: 650 }}>{full}</div>}<span className="muted">💡 {t}</span></div>;
}
