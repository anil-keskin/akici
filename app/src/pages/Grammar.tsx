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
import { generateLecture, type Lecture } from "../lib/aigen";
import { kvGet } from "../lib/db";
import { Route as RouteI, RefreshCw } from "lucide-react";

/** Hazır konuların ötesi: B2 → C2'ye kadar Loki'nin anlattığı ek konular (anlatım + alıştırma tamamen AI) */
interface AiTopic { id: string; lv: "B2" | "C1" | "C2"; title: string; tr: string }
const AI_TOPICS: AiTopic[] = [
  { id: "ai-reported", lv: "B2", title: "Reported speech (dolaylı anlatım)", tr: "He said that… / She asked if…" },
  { id: "ai-passive2", lv: "B2", title: "İleri edilgen: It is said that… / He is believed to…", tr: "Haber ve resmi dilde edilgen" },
  { id: "ai-relative2", lv: "B2", title: "İleri sıfat cümlecikleri: whose, whom, which", tr: "Virgüllü ve virgülsüz relative clause" },
  { id: "ai-gerinf", lv: "B2", title: "Gerund mu infinitive mi? (remember doing / to do)", tr: "Anlam değiştiren fiiller" },
  { id: "ai-modaldeduction", lv: "B2", title: "Çıkarım modalları: must be, can't be, might have been", tr: "Tahmin ve kesinlik derecesi" },
  { id: "ai-mixedcond", lv: "C1", title: "Koşul yapıları (ileri): unless, provided, supposing", tr: "Gelişmiş koşul yapıları" },
  { id: "ai-emph", lv: "C1", title: "Vurgu: do/does/did, what… is, the thing is", tr: "Konuşmada vurgu yapmak" },
  { id: "ai-hedging", lv: "C1", title: "Temkinli dil (hedging): tend to, it appears that", tr: "Akademik ve kibar dil" },
  { id: "ai-future2", lv: "C1", title: "İleri gelecek: be to, be about to, be on the verge of", tr: "Planlar, kader, yakın gelecek" },
  { id: "ai-nounphr", lv: "C1", title: "İsimleştirme (nominalisation)", tr: "Yazı dilinde yoğun anlatım" },
  { id: "ai-inversion2", lv: "C2", title: "Devrik yapı (ileri): Little did I know, Not until, Only then", tr: "Edebi ve vurgulu devrik cümleler" },
  { id: "ai-subjunctive", lv: "C2", title: "Subjunctive ve resmi dil: It is essential that he be…", tr: "Resmi İngilizcede dilek kipi" },
  { id: "ai-ellipsis", lv: "C2", title: "Eksiltme ve yerine koyma: so, not, do so, one(s)", tr: "Doğal anadil konuşması" },
  { id: "ai-fronting", lv: "C2", title: "Öne alma (fronting) ve bilgi sırası", tr: "Cümlede vurgu ve akış" },
  { id: "ai-modalperf", lv: "C2", title: "İleri modal perfect: needn't have, would have had to", tr: "Geçmişe dair ince anlamlar" },
  { id: "ai-discourse", lv: "C2", title: "Söylem belirteçleri: mind you, that said, by the same token", tr: "Akıcı ve bağlantılı konuşma" },
  { id: "ai-idiomgram", lv: "C2", title: "Kalıplaşmış gramer: no sooner… than, hardly… when", tr: "Kitabi kalıplar" },
  { id: "ai-articles2", lv: "C2", title: "Tanımlıkların incelikleri: soyut ve genel isimler", tr: "a/an/the/—'nin zor durumları" },
  { id: "ai-tense-nuance", lv: "C2", title: "Zamanların ince farkları: I was wondering, I'm hoping", tr: "Kibarlık ve mesafe için zaman kaydırma" },
  { id: "ai-collocations", lv: "C2", title: "Söz dizimi: make/do, heavy rain, strong coffee", tr: "Doğal kelime birliktelikleri" },
];

export default function Grammar({ id }: { id?: string }) {
  const [topics, setTopics] = useState<GTopic[] | null>(null);
  const [prog, setProg] = useState<Map<string, Progress>>(new Map());
  const [err, setErr] = useState("");
  const refresh = () => db.progress.where("kind").equals("grammar").toArray().then((r) => setProg(new Map(r.map((p) => [p.id, p]))));
  useEffect(() => { loadGrammar().then(setTopics).catch((e) => setErr(String(e))); refresh(); }, [id]);
  if (err) return <div className="card">Gramer verisi yüklenemedi: {err}</div>;
  if (!topics) return <Spinner />;
  const aiDone = (t: AiTopic) => (prog.get(`ai:grammar:${t.title}`.slice(0, 120))?.done || 0) > 0;
  if (id?.startsWith("ai-")) {
    const at = AI_TOPICS.find((x) => x.id === id);
    return at ? <AiLesson t={at} next={AI_TOPICS[AI_TOPICS.indexOf(at) + 1]} /> : <div className="card">Konu bulunamadı.</div>;
  }
  if (id) {
    const t = topics.find((x) => x.id === id);
    return t ? <Lesson t={t} next={topics[topics.indexOf(t) + 1]} onSaved={refresh} /> : <div className="card">Konu bulunamadı.</div>;
  }
  const done = topics.filter((t) => prog.get("g:" + t.id)?.done).length + AI_TOPICS.filter(aiDone).length;
  const all = topics.length + AI_TOPICS.length;
  // Öğrenme yolu: sıradaki tamamlanmamış konu (seviye sırasıyla)
  const ordered: { id: string; title: string; lv: string; done: boolean }[] = LEVELS.flatMap((lv) => [
    ...topics.filter((t) => t.lv === lv).map((t) => ({ id: t.id, title: t.title, lv, done: !!prog.get("g:" + t.id)?.done })),
    ...AI_TOPICS.filter((t) => t.lv === lv).map((t) => ({ id: t.id, title: t.title, lv, done: aiDone(t) })),
  ]);
  const nextT = ordered.find((x) => !x.done);
  return (
    <div>
      <PageHead title="Gramer" sub={`${topics.length + AI_TOPICS.length} konu (A1 → C2) · Her konu: Türkçe anlatım, Türklerin sık yaptığı hatalar, mini test ve gerçek cümlelerden alıştırma`}
        icon={<div className="ico mint"><GraduationCap /></div>} />
      <div className="card col" style={{ marginBottom: 20, gap: 12, background: "linear-gradient(135deg, color-mix(in srgb, var(--mint) 14%, var(--surface)), var(--surface))" }}>
        <div className="row" style={{ gap: 10 }}><RouteI color="var(--mint)" /><b>Öğrenme yolu · A1 → C2</b><span className="muted small" style={{ marginLeft: "auto" }}>{done} / {all}</span></div>
        <Bar value={done / all} cls="mint" />
        <div className="row wrap" style={{ gap: 6 }}>{LEVELS.map((lv) => { const xs = ordered.filter((x) => x.lv === lv); const d = xs.filter((x) => x.done).length; return xs.length ? <span key={lv} className="chip" style={{ fontSize: 13 }}>{lv} {d}/{xs.length}{d === xs.length ? " ✓" : ""}</span> : null; })}</div>
        {nextT && <button className="btn primary big" onClick={() => go(`/gramer/${nextT.id}`)}><Play size={18} /> Sıradaki: {nextT.title}</button>}
        <div className="muted tiny">Bitirdiğin konuyu istediğin kadar tekrar oynayabilirsin: konunun içinde “Loki ile daha fazlası” her seferinde farklı sorular yazar, seviyesini de sen seçersin.</div>
      </div>
      {LEVELS.map((lv) => {
        const ts = topics.filter((t) => t.lv === lv);
        const ats = AI_TOPICS.filter((t) => t.lv === lv);
        if (!ts.length && !ats.length) return null;
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
                    {nextT?.id === t.id && <span className="tag" style={{ alignSelf: "flex-start", background: "var(--iris)", color: "#fff" }}>Sıradaki</span>}
                  </div>
                );
              })}
              {ats.map((t) => (
                <div key={t.id} className="card hover col" style={{ gap: 6 }} onClick={() => go(`/gramer/${t.id}`)}>
                  <div className="row between">{aiDone(t) ? <CheckCircle2 color="var(--mint)" /> : <Circle color="var(--line)" />}<span className="muted tiny">✨ Loki anlatır · sınırsız alıştırma</span></div>
                  <div className="h3">{t.title}</div>
                  <div className="muted small">{t.tr}</div>
                  {nextT?.id === t.id && <span className="tag" style={{ alignSelf: "flex-start", background: "var(--iris)", color: "#fff" }}>Sıradaki</span>}
                </div>
              ))}
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
      <MoreWithLoki topic={t.title} id={t.id} lv={t.lv} />
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

/** Her konuda: seviyeyi seç → Loki yeni örnekler üretsin ya da yepyeni alıştırma seti yazsın (sınırsız) */
function MoreWithLoki({ topic, id, lv: baseLv }: { topic: string; id: string; lv: string }) {
  const [lv, setLv] = useState(baseLv);
  const [lec, setLec] = useState<Lecture | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const more = async () => {
    setBusy(true); setErr("");
    try { setLec(await generateLecture(topic, lv)); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="card col" style={{ gap: 10, border: "2px dashed var(--iris)" }}>
      <div className="row" style={{ gap: 8 }}><Sparkles color="var(--iris)" /><b>Loki ile daha fazlası (sınırsız)</b></div>
      <div className="row wrap" style={{ gap: 6 }}>{LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn primary" onClick={() => go(`/pratik?k=grammar&t=${encodeURIComponent(topic)}&lv=${lv}&b=${encodeURIComponent("/gramer/" + id)}`)}><Play size={16} /> Yeni alıştırma seti ({lv})</button>
        <button className="btn ghost" disabled={busy} onClick={more}><RefreshCw size={16} /> {busy ? "Loki yazıyor…" : lec ? "Başka örnekler" : "Yeni örnekler üret"}</button>
      </div>
      {err && <div className="small" style={{ color: "var(--coral)" }}>⚠️ {err}</div>}
      {lec && <LectureView lec={lec} />}
    </div>
  );
}

function LectureView({ lec }: { lec: Lecture }) {
  return (
    <div className="col" style={{ gap: 12 }}>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7 }}>{lec.summary}</p>
      {lec.points.length > 0 && <div className="card" style={{ background: "var(--sky-soft)" }}><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>{lec.points.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      <div className="col" style={{ gap: 8 }}>
        {lec.examples.map(([en, tr], i) => <div key={i} className="row" style={{ alignItems: "flex-start" }}><AudioBtn text={en} size={16} slow={false} /><div><b>{en}</b><div className="muted small">{tr}</div></div></div>)}
      </div>
      {lec.mistakes.length > 0 && <div className="col" style={{ gap: 6 }}>
        {lec.mistakes.map(([w, r, n], i) => <div key={i} className="col" style={{ gap: 2 }}>
          <div className="row wrap" style={{ gap: 8 }}><X size={16} color="var(--coral)" /><s className="muted">{w}</s><CheckCircle2 size={16} color="var(--mint)" /><b>{r}</b></div>
          {n && <div className="small muted" style={{ paddingLeft: 24 }}>{n}</div>}
        </div>)}
      </div>}
    </div>
  );
}

/** Tamamen Loki'nin anlattığı konu (B2–C2 ekleri): anlatım önbellekte tutulur, istenince yenilenir */
function AiLesson({ t, next }: { t: AiTopic; next?: AiTopic }) {
  const [lv, setLv] = useState<string>(t.lv);
  const [lec, setLec] = useState<Lecture | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (fresh = false) => {
    setErr(""); setBusy(true);
    const k = `lec:${t.id}:${lv}`;
    try {
      const c = fresh ? null : await kvGet<Lecture | null>(k, null);
      const l = c || await generateLecture(t.title, lv);
      setLec(l); if (!c) kvSet(k, l);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { setLec(null); load(); }, [t.id, lv]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="col" style={{ gap: 16, maxWidth: 820, margin: "0 auto" }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => go("/gramer")}><ArrowLeft size={16} /> Konular</button>
      <div className="row"><Lv lv={t.lv} /><span className="muted">{t.tr} · ✨ Loki anlatıyor</span></div>
      <h1 className="h1">{t.title}</h1>
      <div className="row wrap" style={{ gap: 6 }}><span className="muted small" style={{ alignSelf: "center" }}>Anlatım seviyesi:</span>{LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}</div>
      {err && <div className="card small" style={{ background: "var(--coral-soft)" }}>⚠️ {err} <button className="btn sm" onClick={() => load(true)}>Tekrar dene</button></div>}
      {!lec && !err ? <Spinner label=" Loki konuyu hazırlıyor…" /> : lec && <div className="card"><LectureView lec={lec} /></div>}
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn primary big" onClick={() => go(`/pratik?k=grammar&t=${encodeURIComponent(t.title)}&lv=${lv}&b=${encodeURIComponent("/gramer/" + t.id)}`)}><Play size={18} /> Alıştırma ({lv})</button>
        <button className="btn ghost big" disabled={busy} onClick={() => load(true)}><RefreshCw size={18} /> Farklı örneklerle anlat</button>
        {next && <button className="btn ghost big" onClick={() => go(`/gramer/${next.id}`)}>Sonraki: {next.title}</button>}
      </div>
    </div>
  );
}
