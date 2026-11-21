import { useEffect, useState } from "react";
import { GraduationCap, CheckCircle2, Circle, ArrowLeft, AlertTriangle, Lightbulb, Play, Sparkles, X } from "lucide-react";
import { AudioBtn, Bar, Lv, PageHead, Spinner, confetti } from "../components/ui";
import { StepView } from "./Session";
import type { Result } from "../components/Exercises";
import { loadGrammar, type GTopic } from "../lib/grammar";
import { LEVELS, LEVEL_TR, pick } from "../lib/data";
import { db, kvSet, type Progress } from "../lib/db";
import { addStat } from "../lib/stats";
import { go } from "../lib/router";
import type { Step } from "../lib/lesson";

export default function Grammar({ id }: { id?: string }) {
  const [topics, setTopics] = useState<GTopic[] | null>(null);
  const [prog, setProg] = useState<Map<string, Progress>>(new Map());
  const [err, setErr] = useState("");
  const refresh = () => db.progress.where("kind").equals("grammar").toArray().then((r) => setProg(new Map(r.map((p) => [p.id, p]))));
  useEffect(() => { loadGrammar().then(setTopics).catch((e) => setErr(String(e))); refresh(); }, [id]);
  if (err) return <div className="card">Gramer verisi yüklenemedi: {err}</div>;
  if (!topics) return <Spinner />;
  if (id) {
    const t = topics.find((x) => x.id === id);
    return t ? <Lesson t={t} next={topics[topics.indexOf(t) + 1]} onSaved={refresh} /> : <div className="card">Konu bulunamadı.</div>;
  }
  const done = topics.filter((t) => prog.get("g:" + t.id)?.done).length;
  return (
    <div>
      <PageHead title="Gramer" sub={`${topics.length} konu · Her konu: Türkçe anlatım, Türklerin sık yaptığı hatalar, mini test ve gerçek cümlelerden alıştırma`}
        icon={<div className="ico mint"><GraduationCap /></div>} />
      <div className="card row" style={{ marginBottom: 20 }}>
        <div className="grow"><div className="small muted">{done} / {topics.length} konu tamamlandı</div><Bar value={done / topics.length} cls="mint" /></div>
      </div>
      {LEVELS.map((lv) => {
        const ts = topics.filter((t) => t.lv === lv);
        if (!ts.length) return null;
        return (
          <div key={lv} style={{ marginBottom: 28 }}>
            <div className="row" style={{ marginBottom: 12 }}><Lv lv={lv} /><h2 className="h2">{LEVEL_TR[lv]}</h2></div>
            <div className="grid g3">
              {ts.map((t) => {
                const p = prog.get("g:" + t.id);
                return (
                  <div key={t.id} className="card hover col" style={{ gap: 6 }} onClick={() => go(`/gramer/${t.id}`)}>
                    <div className="row between">{p?.done ? <CheckCircle2 color="var(--mint)" /> : <Circle color="var(--line)" />}<span className="muted tiny">{t.ex.length} alıştırma</span></div>
                    <div className="h3">{t.title}</div>
                    <div className="muted small">{t.tr}</div>
                    {p?.score !== undefined && p.done ? <div className="tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>Skor %{p.score}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Lesson({ t, next, onSaved }: { t: GTopic; next?: GTopic; onSaved: () => void }) {
  const [practice, setPractice] = useState<Step[] | null>(null);
  const [qi, setQi] = useState<Record<number, number>>({});
  useEffect(() => { kvSet("gramCurrent", t.id); setQi({}); setPractice(null); }, [t.id]);
  if (practice) return <Practice steps={practice} t={t} onEnd={async (score) => {
    await db.progress.put({ id: "g:" + t.id, kind: "grammar", done: 1, score, ts: Date.now() });
    await addStat({ xp: 20 });
    onSaved(); setPractice(null);
  }} />;
  const start = () => {
    const ex = pick(t.ex, 12);
    setPractice(ex.map((e) => ({ t: "gram", topic: t.title, q: e.q, a: e.a, tr: e.tr, h: e.h, ch: e.ch })));
  };
  return (
    <div className="col" style={{ gap: 18, maxWidth: 820, margin: "0 auto" }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => go("/gramer")}><ArrowLeft size={16} /> Konular</button>
      <div className="row"><Lv lv={t.lv} /><span className="muted">{t.tr}</span></div>
      <h1 className="h1">{t.title}</h1>
      <p className="sub" style={{ fontSize: 18, margin: 0 }}>{t.summary}</p>
      {t.blocks.map((b, i) => b.t === "table" ? (
        <div key={i} className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{b.h.map((h) => <th key={h} style={{ textAlign: "left", padding: "12px 14px", background: "var(--iris-soft)", color: "var(--iris)", fontSize: 14 }}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", fontWeight: k === 0 ? 700 : 500 }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div key={i} className={b.t === "p" ? "" : "card row"} style={b.t === "tip" ? { background: "var(--sky-soft)", alignItems: "flex-start" } : b.t === "warn" ? { background: "var(--coral-soft)", alignItems: "flex-start" } : { fontSize: 17, lineHeight: 1.7 }}>
          {b.t === "tip" && <Lightbulb color="var(--sky)" style={{ flex: "none" }} />}
          {b.t === "warn" && <AlertTriangle color="var(--coral)" style={{ flex: "none" }} />}
          <div>{b.x}</div>
        </div>
      ))}
      {t.examples.length > 0 && (
        <div className="card col" style={{ gap: 10 }}>
          <div className="h3">Örnekler</div>
          {t.examples.map(([en, tr], i) => (
            <div key={i} className="row" style={{ alignItems: "flex-start" }}><AudioBtn text={en} size={16} slow={false} /><div><b>{en}</b><div className="muted small">{tr}</div></div></div>
          ))}
        </div>
      )}
      {t.mistakes.length > 0 && (
        <div className="card col" style={{ gap: 10 }}>
          <div className="h3">Türklerin sık yaptığı hatalar</div>
          {t.mistakes.map(([w, r, n], i) => (
            <div key={i} className="col" style={{ gap: 2 }}>
              <div className="row wrap" style={{ gap: 8 }}><X size={16} color="var(--coral)" /><s className="muted">{w}</s><CheckCircle2 size={16} color="var(--mint)" /><b>{r}</b></div>
              <div className="small muted" style={{ paddingLeft: 24 }}>{n}</div>
            </div>
          ))}
        </div>
      )}
      {t.quiz.length > 0 && (
        <div className="card col" style={{ gap: 14 }}>
          <div className="h3">Mini test</div>
          {t.quiz.map((q, i) => (
            <div key={i} className="col" style={{ gap: 8 }}>
              <b>{i + 1}. {q.q}</b>
              <div className="row wrap" style={{ gap: 8 }}>
                {q.o.map((o, j) => {
                  const picked = qi[i] !== undefined;
                  const cls = picked && j === q.a ? "ok" : picked && qi[i] === j ? "bad" : "";
                  return <button key={j} className={`opt ${cls}`} style={{ width: "auto", padding: "10px 14px" }} disabled={picked} onClick={() => setQi({ ...qi, [i]: j })}>{o}</button>;
                })}
              </div>
              {qi[i] !== undefined && <div className="small" style={{ color: qi[i] === q.a ? "var(--mint)" : "var(--coral)" }}>{qi[i] === q.a ? "Doğru! " : "Yanlış. "}<span className="sub">{q.why}</span></div>}
            </div>
          ))}
        </div>
      )}
      <div className="row wrap">
        {t.ex.length > 0 && <button className="btn primary big" onClick={start}><Play size={18} /> Alıştırma ({Math.min(12, t.ex.length)} soru)</button>}
        <button className="btn ghost big" onClick={() => go(`/sohbet?mode=explain&q=${encodeURIComponent(`${t.title} konusunu bana farklı örneklerle tekrar anlat.`)}`)}><Sparkles size={18} /> AI ile tekrar anlat</button>
        {next && <button className="btn ghost big" onClick={() => go(`/gramer/${next.id}`)}>Sonraki: {next.title}</button>}
      </div>
    </div>
  );
}

function Practice({ steps, t, onEnd }: { steps: Step[]; t: GTopic; onEnd: (score: number) => void }) {
  const [i, setI] = useState(0);
  const [ok, setOk] = useState(0);
  const done = (r: Result) => {
    const good = r === "ok" || r === "typo";
    const nok = ok + (good ? 1 : 0);
    setOk(nok);
    addStat({ xp: good ? 6 : 1, correct: good ? 1 : 0, total: 1 });
    if (i + 1 >= steps.length) { confetti(); onEnd(Math.round((nok / steps.length) * 100)); }
    else setI(i + 1);
  };
  return (
    <div className="ex-wrap">
      <div className="ex-top"><button className="btn icon" aria-label="Çık" onClick={() => onEnd(Math.round((ok / steps.length) * 100))}><X /></button><Bar value={i / steps.length} /><span className="muted small">{t.title}</span></div>
      <div key={i} className="pop"><StepView step={steps[i]} onDone={done} /></div>
    </div>
  );
}
