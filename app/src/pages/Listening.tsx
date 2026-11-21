import { useEffect, useRef, useState } from "react";
import { Headphones, PenLine, ListChecks, Radio, Ear, ArrowLeft, Play, Pause, SkipForward } from "lucide-react";
import { AudioBtn, Lv, PageHead, Spinner } from "../components/ui";
import { Choice, Feedback, type Result } from "../components/Exercises";
import { LEVELS, minimalPairs, pick, sentences, shuffle, type Level, type Sentence } from "../lib/data";
import { alignWords, scoreOf } from "../lib/grade";
import { speak, stopSpeaking } from "../lib/speech";
import { kvGet } from "../lib/db";
import { addStat } from "../lib/stats";
import { getSettings, saveSettings, useSettings } from "../lib/settings";

type Mode = "dict" | "comp" | "flow" | "pairs";
const MODES = [
  { k: "dict" as Mode, t: "Dikte", d: "Dinle, yaz; kelime kelime fark gör. Kulak + yazım birlikte.", i: PenLine, c: "iris" },
  { k: "comp" as Mode, t: "Dinleyip anla", d: "Cümleyi duy, doğru Türkçeyi seç. Hızlı anlama.", i: ListChecks, c: "mint" },
  { k: "flow" as Mode, t: "Cümle akışı", d: "Eller serbest: İngilizce → bekle → Türkçe → tekrar. Yolda, yürürken.", i: Radio, c: "amber" },
  { k: "pairs" as Mode, t: "Kulak eğitimi", d: "ship/sheep, think/sink… Türklerin karıştırdığı sesleri ayırt et.", i: Ear, c: "coral" },
];

export default function Listening() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [lv, setLv] = useState<Level>("A1");
  const s = useSettings();
  useEffect(() => { kvGet<Level>("level", "A1").then(setLv); }, []);
  const head = (
    <div className="row wrap between" style={{ marginBottom: 16 }}>
      <button className="btn ghost sm" onClick={() => { stopSpeaking(); setMode(null); }}><ArrowLeft size={16} /> Modlar</button>
      <div className="row wrap">
        <div className="scroll-x">{LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}</div>
        <select className="input" style={{ width: "auto" }} value={s.rate} onChange={(e) => saveSettings({ rate: Number(e.target.value) })} aria-label="Hız">
          {[0.6, 0.75, 0.9, 1, 1.1, 1.25].map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
      </div>
    </div>
  );
  if (mode === "dict") return <>{head}<Dictation lv={lv} /></>;
  if (mode === "comp") return <>{head}<Comprehension lv={lv} /></>;
  if (mode === "flow") return <>{head}<Flow lv={lv} /></>;
  if (mode === "pairs") return <>{head}<Pairs /></>;
  return (
    <div>
      <PageHead title="Dinleme" sub="Anlamak, konuşmanın yarısı. Önce yavaş, sonra normal hızda dinle." icon={<div className="ico sky"><Headphones /></div>} />
      <div className="grid g2">
        {MODES.map((m) => (
          <div key={m.k} className="card hover row" onClick={() => setMode(m.k)}>
            <div className={`ico ${m.c}`}><m.i /></div>
            <div className="grow"><div className="h3">{m.t}</div><div className="muted small">{m.d}</div></div>
          </div>
        ))}
      </div>
      <div className="sp" />
      <div className="card small sub">💡 <b>İpucu:</b> Daha doğal sesler için Ayarlar'dan "Natural/Online" adlı bir ses seç (Edge'de Microsoft Aria/Guy, Chrome'da Google US English). Yerel sunucu açıkken bazı cümleler önceden üretilmiş doğal sesle (Kokoro) çalar.</div>
    </div>
  );
}

function useSentences(lv: Level, filter: (s: Sentence) => boolean) {
  const [list, setList] = useState<Sentence[] | null>(null);
  useEffect(() => { setList(null); sentences(lv).then((a) => setList(shuffle(a.filter(filter)).slice(0, 200))); }, [lv]); // eslint-disable-line
  return list;
}

function Dictation({ lv }: { lv: Level }) {
  const list = useSentences(lv, (s) => { const n = s[1].split(" ").length; return n >= 3 && n <= 14; });
  const [i, setI] = useState(0);
  const [v, setV] = useState("");
  const [r, setR] = useState<Result | null>(null);
  const [score, setScore] = useState({ n: 0, sum: 0 });
  const cur = list?.[i];
  useEffect(() => { if (cur) speak(cur[1]); }, [cur]);
  if (!list) return <Spinner />;
  if (!cur) return null;
  const al = r ? alignWords(cur[1], v) : [];
  const sc = r ? scoreOf(al) : 0;
  const submit = () => {
    const a = alignWords(cur[1], v); const s = scoreOf(a);
    setR(s >= 95 ? "ok" : s >= 70 ? "typo" : "bad");
    setScore({ n: score.n + 1, sum: score.sum + s });
    addStat({ xp: Math.round(s / 12), correct: s >= 70 ? 1 : 0, total: 1 });
  };
  return (
    <div className="ex-wrap col" style={{ gap: 16 }}>
      <div className="row between"><Lv lv={lv} /><span className="muted small">{score.n ? `Ortalama %${Math.round(score.sum / score.n)}` : ""} · {i + 1}. cümle</span></div>
      <div className="row" style={{ justifyContent: "center" }}><AudioBtn text={cur[1]} big /></div>
      <textarea className="input" style={{ minHeight: 90, fontSize: 20 }} value={v} onChange={(e) => setV(e.target.value)} disabled={!!r} placeholder="Duyduğunu yaz… (Enter = kontrol)"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !r) { e.preventDefault(); if (v.trim()) submit(); } }} autoFocus />
      {!r && <button className="btn primary" disabled={!v.trim()} onClick={submit}>Kontrol et</button>}
      {r && (
        <div className="card pop">
          <div className="display" style={{ fontSize: 22, lineHeight: 1.6 }}>{al.map((x, k) => <span key={k} className={x.s === "ok" ? "w-ok" : x.s === "miss" ? "w-miss" : "w-bad"} title={x.heard ? `sen: ${x.heard}` : "eksik"}>{x.w} </span>)}</div>
          <div className="muted" style={{ marginTop: 6 }}>{cur[2]}</div>
          <div className="h3" style={{ marginTop: 8 }}>%{sc}</div>
        </div>
      )}
      <Feedback r={r} onNext={() => { setR(null); setV(""); setI(i + 1); }} />
    </div>
  );
}

function Comprehension({ lv }: { lv: Level }) {
  const list = useSentences(lv, (s) => s[1].split(" ").length >= 4);
  const [i, setI] = useState(0);
  if (!list) return <Spinner />;
  const cur = list[i];
  if (!cur) return null;
  const opts = pick(list.filter((s) => s !== cur), 3).map((s) => s[2]);
  return (
    <div className="ex-wrap" key={i}>
      <Choice prompt={<div className="h3">Ne dendi?</div>} audio={cur[1]} options={opts} answer={cur[2]}
        onDone={(r) => { addStat({ xp: r === "ok" ? 6 : 1, correct: r === "ok" ? 1 : 0, total: 1 }); setI(i + 1); }} />
    </div>
  );
}

function Flow({ lv }: { lv: Level }) {
  const list = useSentences(lv, (s) => { const n = s[1].split(" ").length; return n >= 3 && n <= 12; });
  const [i, setI] = useState(0);
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState("");
  const run = useRef(0);
  useEffect(() => () => { run.current++; stopSpeaking(); }, []);
  useEffect(() => {
    if (!on || !list) return;
    const my = ++run.current;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      for (let k = i; k < list.length && run.current === my; k++) {
        setI(k);
        const [, en, tr] = list[k];
        setPhase("İngilizce"); await speak(en); if (run.current !== my) return;
        setPhase("Tekrar et (sesli)"); await wait(Math.max(1800, en.length * 70)); if (run.current !== my) return;
        setPhase("Türkçesi"); await speakTr(tr); if (run.current !== my) return;
        setPhase("İngilizce (yavaş)"); await speak(en, { slow: true }); if (run.current !== my) return;
        await wait(900);
        addStat({ xp: 1 });
      }
    })();
  }, [on, list]); // eslint-disable-line
  if (!list) return <Spinner />;
  const cur = list[i];
  return (
    <div className="ex-wrap col" style={{ alignItems: "center", textAlign: "center", gap: 18 }}>
      <div className="chip on">{phase || "Hazır"}</div>
      <div className="display" style={{ fontSize: 30, fontWeight: 650 }}>{cur?.[1]}</div>
      <div className="sub">{cur?.[2]}</div>
      <div className="row">
        <button className="btn primary big" onClick={() => { if (on) { run.current++; stopSpeaking(); } setOn(!on); }}>{on ? <><Pause /> Durdur</> : <><Play /> Başlat</>}</button>
        <button className="btn ghost big" onClick={() => { run.current++; stopSpeaking(); setI(i + 1); setOn(false); }}><SkipForward /></button>
      </div>
      <div className="muted small">Ekranı kapatmadan arka planda dinleyebilirsin. Her cümlede sesli tekrar etmen için boşluk bırakılır.</div>
    </div>
  );
}
async function speakTr(text: string) {
  if (!("speechSynthesis" in window)) return;
  const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith("tr"));
  if (!v) return;
  return new Promise<void>((res) => { const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = getSettings().rate; u.onend = () => res(); u.onerror = () => res(); speechSynthesis.speak(u); });
}

const PAIR_TR: Record<string, string> = {
  "th-s": "TH /θ/ – S", "th-t": "TH /θ/ – T", "dh-d": "TH /ð/ – D", "dh-z": "TH /ð/ – Z", "w-v": "W – V", "ee-i": "uzun İ /iː/ – kısa I /ɪ/",
  "a-e": "/æ/ – /e/ (bad–bed)", "a-u": "/æ/ – /ʌ/ (cat–cut)", "o-u": "/ɑ/ – /ʌ/ (cot–cut)", "uu-u": "uzun U – kısa U", "ng-n": "NG – N", "l-r": "L – R", "sh-ch": "SH – CH", "z-s": "Z – S",
};
function Pairs() {
  const [data, setData] = useState<Record<string, [string, string][]> | null>(null);
  const [k, setK] = useState("th-s");
  const [round, setRound] = useState(0);
  const [res, setRes] = useState<null | boolean>(null);
  const [cur, setCur] = useState<{ pair: [string, string]; target: string } | null>(null);
  const [score, setScore] = useState({ ok: 0, n: 0 });
  useEffect(() => { minimalPairs().then(setData); }, []);
  useEffect(() => {
    if (!data?.[k]?.length) return;
    const pair = pick(data[k], 1)[0];
    const target = pair[Math.random() < 0.5 ? 0 : 1];
    setCur({ pair, target }); setRes(null);
    setTimeout(() => speak(target), 250);
  }, [data, k, round]);
  if (!data) return <Spinner />;
  return (
    <div className="ex-wrap col" style={{ gap: 18 }}>
      <div className="scroll-x">{Object.keys(data).filter((x) => data[x].length >= 4).map((x) => <button key={x} className={`chip ${k === x ? "on" : ""}`} onClick={() => { setK(x); setScore({ ok: 0, n: 0 }); }}>{PAIR_TR[x] || x}</button>)}</div>
      <div className="h3" style={{ textAlign: "center" }}>Hangi kelimeyi duydun?</div>
      {cur && <div className="row" style={{ justifyContent: "center" }}><AudioBtn text={cur.target} big /></div>}
      {cur && (
        <div className="grid g2">
          {cur.pair.map((w) => (
            <button key={w} className={`opt ${res !== null && w === cur.target ? "ok" : ""}`} style={{ justifyContent: "center", fontSize: 26, padding: 24 }} disabled={res !== null}
              onClick={() => { const ok = w === cur.target; setRes(ok); setScore({ ok: score.ok + (ok ? 1 : 0), n: score.n + 1 }); addStat({ xp: ok ? 3 : 0, correct: ok ? 1 : 0, total: 1 }); }}>{w}</button>
          ))}
        </div>
      )}
      {res !== null && cur && (
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="small muted">İkisini karşılaştır:</span>
          {cur.pair.map((w) => <button key={w} className="btn sm ghost" onClick={() => speak(w)}>🔊 {w}</button>)}
          <button className="btn primary" onClick={() => setRound(round + 1)}>Sonraki</button>
        </div>
      )}
      <div className="muted small" style={{ textAlign: "center" }}>{score.n ? `${score.ok}/${score.n} doğru` : "Sesi dinle, iki seçenekten birini seç."}</div>
    </div>
  );
}
