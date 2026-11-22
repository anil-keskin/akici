// AI alıştırma seti: herhangi bir konu × herhangi bir seviye (A1→C2). Her "tekrar"da Loki yepyeni sorular yazar.
// Yanlış yapılan soru sette bir kez daha sorulur (Duolingo gibi). Sonraki set arka planda hazırlanır → tekrar anında başlar.
import { useEffect, useRef, useState } from "react";
import { Celebrate, combo } from "../components/fx";
import { ArrowLeft, Sparkles, RotateCcw, ArrowUp, X } from "lucide-react";
import { Bar, Lv, Mascot, Spinner, confetti } from "../components/ui";
import { StepView } from "./Session";
import type { Result } from "../components/Exercises";
import type { Step } from "../lib/lesson";
import { generateSet, type GenKind } from "../lib/aigen";
import { LEVELS, type Level } from "../lib/data";
import { db, kvGet, kvSet } from "../lib/db";
import { addStat } from "../lib/stats";
import { back, go } from "../lib/router";

const KIND_TR: Record<string, string> = { grammar: "Gramer", phrase: "Kalıp & deyim", vocab: "Kelime", reading: "Okuma", free: "Serbest" };

export default function AIPractice({ params }: { params: URLSearchParams }) {
  const kind = (params.get("k") || "free") as GenKind;
  const [topic, setTopic] = useState(params.get("t") || "");
  const [draft, setDraft] = useState(params.get("t") || "");
  const backTo = params.get("b");
  const [lv, setLv] = useState<Level>((params.get("lv") as Level) || "B1");
  const [state, setState] = useState<"idle" | "gen" | "play" | "end">("idle");
  const [steps, setSteps] = useState<Step[]>([]);
  const [i, setI] = useState(0);
  const [ok, setOk] = useState(0);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [sets, setSets] = useState(0);
  const pre = useRef<{ key: string; p: Promise<Step[]> } | null>(null);
  const text = useRef<string | undefined>(undefined);
  const key = `${kind}|${topic}|${lv}`;
  const SUG: Record<string, string[]> = {
    grammar: ["Present Perfect vs Past Simple", "Prepositions: in / on / at", "Articles: a / an / the", "Conditionals (if)", "Passive voice", "Modal verbs", "Relative clauses", "Reported speech"],
    phrase: ["Phrasal verbs with get", "Phrasal verbs with take", "Idioms about time", "Idioms about money", "Business expressions", "Everyday expressions"],
    vocab: ["Travel and airport", "Job interview", "At the doctor", "Food and restaurant", "Feelings and emotions", "Technology", "Shopping", "Weather"],
    free: ["Daily conversation", "Small talk", "Making plans", "Giving opinions", "Telling a story in the past", "Asking for directions", "Phone calls", "Complaining politely"],
    reading: [],
  };
  const pid = `ai:${kind}:${topic}`.slice(0, 120);

  useEffect(() => {
    if (!params.get("lv")) kvGet<Level>("level", "B1").then((l) => setLv(l));
    if (kind === "reading") { try { text.current = sessionStorage.getItem("pratik.text") || undefined; } catch { /* */ } }
  }, []);
  useEffect(() => { if (topic) db.progress.get(pid).then((p) => setSets(p?.done || 0)); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSet = (k = key, level = lv) => {
    if (pre.current?.key === k) { const p = pre.current.p; pre.current = null; return p; }
    return generateSet({ kind, topic, lv: level, text: text.current });
  };
  const prefetch = () => { pre.current = { key, p: generateSet({ kind, topic, lv, text: text.current }) }; pre.current.p.catch(() => { pre.current = null; }); };

  const start = async (level = lv) => {
    setErr(""); setState("gen");
    try {
      const s = await fetchSet(`${kind}|${topic}|${level}`, level);
      setSteps(s); setI(0); setOk(0); setTotal(s.length); setState("play"); combo.miss();
      setTimeout(prefetch, 1500); // bir sonraki set hazır olsun
    } catch (e) { setErr((e as Error).message); setState("idle"); }
  };
  const done = (r: Result) => {
    const good = r === "ok" || r === "typo";
    addStat({ xp: good ? 5 : 1, correct: good ? 1 : 0, total: 1 });
    let list = steps;
    if (good) setOk((o) => o + 1);
    else if (r !== "skip" && !(steps[i] as Step & { _again?: boolean })._again) { list = [...steps, { ...steps[i], _again: true } as unknown as Step]; setSteps(list); }
    if (i + 1 >= list.length) finish(good ? ok + 1 : ok);
    else setI(i + 1);
  };
  const finish = async (good: number) => {
    const score = Math.round((good / Math.max(1, total)) * 100);
    setState("end");
    addStat({ xp: 15 });
    const p = await db.progress.get(pid);
    await db.progress.put({ id: pid, kind: "ai", done: (p?.done || 0) + 1, score: Math.max(score, p?.score || 0), ts: Date.now() });
    setSets((p?.done || 0) + 1);
    await kvSet("lastPractice", { kind, topic, lv });
  };
  const exit = () => (backTo ? go(backTo) : back());

  if (state === "play" && steps[i]) return (
    <div className="ex-wrap">
      <div className="ex-top">
        <button className="btn icon" aria-label="Çık" onClick={() => setState("idle")}><X /></button>
        <Bar value={i / steps.length} />
        <span className="muted small">{lv}</span>
      </div>
      <div key={i} className="pop"><StepView step={steps[i]} onDone={done} /></div>
    </div>
  );

  const score = Math.round((ok / Math.max(1, total)) * 100);
  const nextLv0 = LEVELS[Math.min(LEVELS.indexOf(lv) + 1, LEVELS.length - 1)];
  if (state === "end") return (
    <Celebrate title="Set tamam!" xp={ok * 5 + 15} acc={score} extra={`${ok} / ${total} doğru`}>
      <button className="btn primary big" onClick={() => start()}><RotateCcw size={18} /> Farklı sorularla tekrar</button>
      {lv !== nextLv0 && score >= 70 && <button className="btn mint big" onClick={() => { setLv(nextLv0); pre.current = null; start(nextLv0); }}><ArrowUp size={18} /> {nextLv0} seviyesine geç</button>}
      <button className="btn ghost big" onClick={exit}>Geri dön</button>
    </Celebrate>
  );
  const nextLv = LEVELS[Math.min(LEVELS.indexOf(lv) + 1, LEVELS.length - 1)];
  return (
    <div className="col" style={{ gap: 16, maxWidth: 680, margin: "0 auto" }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={exit}><ArrowLeft size={16} /> Geri</button>
      <div className="row" style={{ gap: 12 }}>
        <Mascot size={64} mood="happy" />
        <div style={{ minWidth: 0 }}>
          <div className="muted small">{KIND_TR[kind] || "Alıştırma"} · Loki'nin hazırladığı set</div>
          <h1 className="h2" style={{ margin: 0 }}>{topic || "Bir konu seç"}</h1>
          {sets > 0 && <div className="tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>Bu konuda {sets} set çözdün</div>}
        </div>
      </div>

      <div className="card col" style={{ gap: 10 }}>
        <b className="small">Seviye seç (istediğin zaman değiştir)</b>
        <div className="row wrap" style={{ gap: 6 }}>{LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => { setLv(l); pre.current = null; }}>{l}</button>)}</div>
        <div className="muted tiny">Her sette ~12 soru: boşluk doldurma, çoktan seçmeli, cümle kurma, eşleştirme, sesli söyleme ve çeviri. Her seferinde farklı cümleler.</div>
      </div>

      {kind !== "reading" && state !== "gen" && (
        <div className="card col" style={{ gap: 8 }}>
          <b className="small">Konu (istediğini yaz ya da seç)</b>
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setTopic(draft.trim()); pre.current = null; } }}>
            <input className="input" value={draft} maxLength={120} placeholder="ör. Present Perfect, phrasal verbs with get, airport…" onChange={(e) => setDraft(e.target.value)} />
            <button className="btn" disabled={!draft.trim() || draft.trim() === topic}>Seç</button>
          </form>
          <div className="row wrap" style={{ gap: 6 }}>{(SUG[kind] || SUG.free).map((x) => <button key={x} className={`chip ${topic === x ? "on" : ""}`} onClick={() => { setTopic(x); setDraft(x); pre.current = null; }}>{x}</button>)}</div>
        </div>
      )}
      {err && <div className="card small" style={{ background: "var(--coral-soft)" }}>⚠️ {err}</div>}
      {state === "gen" ? <Spinner label=" Loki yeni sorular yazıyor… (~10 sn)" /> : (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary big grow" disabled={!topic} onClick={() => start()}><Sparkles size={18} /> Başla ({lv})</button>
        </div>
      )}
      <div className="row" style={{ justifyContent: "center" }}><Lv lv={lv} /></div>
    </div>
  );
}
