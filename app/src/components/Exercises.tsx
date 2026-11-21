import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, X, Volume2, Mic, Square, ArrowRight, Lightbulb, RotateCcw } from "lucide-react";
import { AudioBtn, Lv, Mascot, useMicConsent } from "./ui";
import { check, alignWords, scoreOf, norm } from "../lib/grade";
import { speak, Listener, type Heard } from "../lib/speech";
import { shuffle, POS_TR, type Word } from "../lib/data";
import { getSettings } from "../lib/settings";
import { sfx } from "../lib/sfx";

export type Result = "ok" | "typo" | "bad" | "skip";
export interface ExProps { onDone: (r: Result) => void }

/** Alt kısımdaki geri bildirim + Devam düğmesi */
export function Feedback({ r, answer, extra, onNext }: { r: Result | null; answer?: ReactNode; extra?: ReactNode; onNext: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (r) { setTimeout(() => btn.current?.focus(), 50); sfx(r === "ok" || r === "typo" ? "ok" : "bad"); } }, [r]);
  if (!r) return null;
  const good = r === "ok" || r === "typo";
  return (
    <div className={`feedback pop ${good ? "ok" : "bad"}`}>
      <div className={good ? "loki-bounce" : "loki-shake"} style={{ flex: "none" }}><Mascot size={54} mood={good ? "happy" : "sad"} /></div>
      <div className="grow">
        <div style={{ fontWeight: 800, fontSize: 18 }}>{r === "ok" ? "Harika!" : r === "typo" ? "Neredeyse — küçük bir yazım farkı" : r === "skip" ? "Geçildi" : "Doğrusu:"}</div>
        {answer && <div style={{ fontWeight: 650 }}>{answer}</div>}
        {extra && <div className="small" style={{ opacity: .85, marginTop: 4 }}>{extra}</div>}
      </div>
      <button ref={btn} className={`btn ${good ? "mint" : "coral"}`} onClick={onNext}>Devam <ArrowRight size={18} /></button>
    </div>
  );
}

function useEnter(fn: () => void, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); fn(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
}

// ------------------------------------------------------------------ Yeni kelime tanıtımı
export function Intro({ w, example, onDone }: ExProps & { w: Word; example?: [string, string] }) {
  useEffect(() => { if (getSettings().autoplay) speak(w.w); }, [w]);
  useEnter(() => onDone("ok"), true);
  return (
    <div className="col" style={{ gap: 18, alignItems: "center", textAlign: "center" }}>
      <div className="row"><span className="chip on">Yeni kelime</span><Lv lv={w.lv} /></div>
      <div className="prompt-word">{w.w}</div>
      {w.ipa && <div className="ipa" style={{ fontSize: 20 }}>{w.ipa}</div>}
      <AudioBtn text={w.w} big />
      <div className="row wrap" style={{ justifyContent: "center", gap: 6 }}>{w.pos.slice(0, 2).map((p) => <span key={p} className="tag">{POS_TR[p] || p}</span>)}</div>
      <div className="h2">{w.tr.slice(0, 3).join(" · ") || w.d[0]?.g}</div>
      {example && (
        <div className="card" style={{ width: "100%", background: "var(--surface-2)" }}>
          <div className="row" style={{ justifyContent: "center" }}><AudioBtn text={example[0]} size={16} slow={false} /><b>{example[0]}</b></div>
          <div className="muted small">{example[1]}</div>
        </div>
      )}
      <button className="btn primary big" onClick={() => onDone("ok")}>Anladım <ArrowRight size={18} /></button>
    </div>
  );
}

// ------------------------------------------------------------------ Çoktan seçmeli
export function Choice({ prompt, sub, options, answer, audio, onDone, hint }: ExProps & {
  prompt: ReactNode; sub?: ReactNode; options: string[]; answer: string; audio?: string; hint?: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const opts = useMemo(() => shuffle(Array.from(new Set([answer, ...options])).slice(0, 4)), [answer, options]);
  const r: Result | null = picked ? (picked === answer ? "ok" : "bad") : null;
  useEffect(() => { if (audio && getSettings().autoplay) speak(audio); }, [audio]);
  useEffect(() => {
    if (picked) return;
    const k = (e: KeyboardEvent) => { const i = Number(e.key) - 1; if (i >= 0 && i < opts.length) setPicked(opts[i]); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [opts, picked]);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div style={{ textAlign: "center" }}>{prompt}</div>
      {sub && <div className="muted" style={{ textAlign: "center" }}>{sub}</div>}
      {audio && <div className="row" style={{ justifyContent: "center" }}><AudioBtn text={audio} big /></div>}
      <div className="col" style={{ gap: 10 }}>
        {opts.map((o, i) => (
          <button key={o} className={`opt ${picked && o === answer ? "ok" : picked === o ? "bad shake" : ""}`} disabled={!!picked} onClick={() => setPicked(o)}>
            <kbd>{i + 1}</kbd><span className="grow">{o}</span>
          </button>
        ))}
      </div>
      {hint && !picked && <div className="muted small row" style={{ justifyContent: "center" }}><Lightbulb size={14} /> {hint}</div>}
      <Feedback r={r} answer={r === "bad" ? answer : undefined} onNext={() => onDone(r!)} />
    </div>
  );
}

// ------------------------------------------------------------------ Yazarak cevapla
export function Typing({ prompt, answers, placeholder, audio, onDone, reveal, extra }: ExProps & {
  prompt: ReactNode; answers: string[]; placeholder?: string; audio?: string; reveal?: string; extra?: ReactNode;
}) {
  const [v, setV] = useState("");
  const [r, setR] = useState<Result | null>(null);
  const [best, setBest] = useState("");
  const [hint, setHint] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); if (audio && getSettings().autoplay) speak(audio); }, [audio]);
  const submit = () => {
    if (r) return;
    if (!v.trim()) return;
    const c = check(v, answers);
    setBest(c.best);
    setR(c.v);
  };
  const a0 = reveal || answers[0];
  return (
    <div className="col" style={{ gap: 16 }}>
      <div style={{ textAlign: "center" }}>{prompt}</div>
      {audio && <div className="row" style={{ justifyContent: "center" }}><AudioBtn text={audio} big /></div>}
      <input ref={inp} className={`input big ${r === "ok" || r === "typo" ? "ok" : r === "bad" ? "bad" : ""}`} value={v} placeholder={placeholder || "Yaz…"}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !r) { e.preventDefault(); e.stopPropagation(); submit(); } }}
        disabled={!!r} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      {!r && (
        <div className="row between">
          <button className="btn sm ghost" onClick={() => setHint((h) => Math.min(h + 1, a0.length))}><Lightbulb size={14} /> İpucu{hint ? `: ${a0.slice(0, hint)}…` : ""}</button>
          <div className="row">
            <button className="btn ghost" onClick={() => { setBest(a0); setR("bad"); }}>Bilmiyorum</button>
            <button className="btn primary" onClick={submit} disabled={!v.trim()}>Kontrol et</button>
          </div>
        </div>
      )}
      <Feedback r={r} answer={r !== "ok" ? (best || a0) : undefined} extra={extra} onNext={() => onDone(hint >= 2 && r === "ok" ? "typo" : r!)} />
    </div>
  );
}

// ------------------------------------------------------------------ Cümle kurma (kelime blokları)
export function Build({ tr, en, onDone }: ExProps & { tr: string; en: string }) {
  const target = useMemo(() => en.replace(/[.!?]$/, "").split(/\s+/), [en]);
  const [bank, setBank] = useState(() => shuffle(target.map((w, i) => ({ w, i }))));
  const [line, setLine] = useState<{ w: string; i: number }[]>([]);
  const [r, setR] = useState<Result | null>(null);
  const submit = () => {
    const a = norm(line.map((x) => x.w).join(" ")), b = norm(target.join(" "));
    setR(a === b ? "ok" : "bad");
    speak(en);
  };
  useEnter(() => { if (!r && line.length === target.length) submit(); }, !r);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="h3" style={{ textAlign: "center" }}>Bu cümleyi İngilizce kur</div>
      <div className="h2" style={{ textAlign: "center" }}>{tr}</div>
      <div className="card" style={{ minHeight: 76, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", background: "var(--surface-2)" }}>
        {line.map((x, k) => <button key={x.i} className="chip on" disabled={!!r} onClick={() => { setLine(line.filter((_, j) => j !== k)); setBank([...bank, x]); }}>{x.w}</button>)}
        {!line.length && <span className="muted small">Aşağıdaki kelimelere dokun…</span>}
      </div>
      <div className="row wrap" style={{ justifyContent: "center", gap: 8 }}>
        {bank.map((x, k) => <button key={x.i} className="chip" style={{ fontSize: 16, padding: "9px 14px", background: "var(--surface)", border: "1.5px solid var(--line)" }} disabled={!!r}
          onClick={() => { setBank(bank.filter((_, j) => j !== k)); setLine([...line, x]); }}>{x.w}</button>)}
      </div>
      {!r && <button className="btn primary" disabled={line.length !== target.length} onClick={submit}>Kontrol et</button>}
      <Feedback r={r} answer={r === "bad" ? en : undefined} onNext={() => onDone(r!)} />
    </div>
  );
}

// ------------------------------------------------------------------ Eşleştirme
export function Match({ pairs, onDone }: ExProps & { pairs: [string, string][] }) {
  const left = useMemo(() => shuffle(pairs.map((p) => p[0])), [pairs]);
  const right = useMemo(() => shuffle(pairs.map((p) => p[1])), [pairs]);
  const [sel, setSel] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [bad, setBad] = useState<string | null>(null);
  const [miss, setMiss] = useState(0);
  const map = useMemo(() => new Map(pairs), [pairs]);
  const tap = (side: "l" | "r", v: string) => {
    if (side === "l") { setSel(v); speak(v); return; }
    if (!sel) return;
    if (map.get(sel) === v) { const d = [...done, sel]; setDone(d); setSel(null); if (d.length === pairs.length) setTimeout(() => onDone(miss > 1 ? "typo" : "ok"), 400); }
    else { setBad(v); setMiss((m) => m + 1); setTimeout(() => setBad(null), 400); }
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="h3" style={{ textAlign: "center" }}>Eşleştir</div>
      <div className="grid g2" style={{ gap: 10 }}>
        <div className="col" style={{ gap: 10 }}>{left.map((l) => (
          <button key={l} className={`opt ${done.includes(l) ? "ok" : sel === l ? "" : ""}`} style={sel === l ? { borderColor: "var(--iris)", background: "var(--iris-soft)" } : undefined}
            disabled={done.includes(l)} onClick={() => tap("l", l)}>{l}</button>))}</div>
        <div className="col" style={{ gap: 10 }}>{right.map((rv) => {
          const ok = done.some((d) => map.get(d) === rv);
          return <button key={rv} className={`opt ${ok ? "ok" : bad === rv ? "bad shake" : ""}`} disabled={ok} onClick={() => tap("r", rv)}>{rv}</button>;
        })}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Konuş (kelime ya da cümle)
export function Speak({ text, tr, onDone, allowSkip = true }: ExProps & { text: string; tr?: string; allowSkip?: boolean }) {
  const [, request, consentUi] = useMicConsent();
  const [state, setState] = useState<"idle" | "rec" | "wait" | "done">("idle");
  const [heard, setHeard] = useState<Heard | null>(null);
  const [err, setErr] = useState("");
  const lis = useRef<Listener | null>(null);
  useEffect(() => () => lis.current?.cancel(), []);
  const start = async () => {
    setErr("");
    if (!(await request())) return;
    const l = new Listener(); lis.current = l;
    try { await l.start(15, stop); setState("rec"); } catch (e) { setErr((e as Error).message); }
  };
  async function stop() {
    if (!lis.current) return;
    setState("wait");
    try { const h = await lis.current.stop(); setHeard(h); setState("done"); } catch (e) { setErr((e as Error).message); setState("idle"); }
    lis.current = null;
  }
  const al = heard ? alignWords(text, heard.text) : [];
  const sc = heard ? scoreOf(al) : 0;
  const r: Result | null = state === "done" ? (sc >= 85 ? "ok" : sc >= 60 ? "typo" : "bad") : null;
  return (
    <div className="col" style={{ gap: 16, alignItems: "center", textAlign: "center" }}>
      {consentUi}
      <div className="h3">Sesli söyle</div>
      <div className="display" style={{ fontSize: text.length > 40 ? 26 : 38, fontWeight: 650 }}>
        {heard ? al.map((x, i) => <span key={i} className={x.s === "ok" ? "w-ok" : x.s === "miss" ? "w-miss" : "w-bad"}>{x.w} </span>) : text}
      </div>
      {tr && <div className="muted">{tr}</div>}
      <AudioBtn text={text} />
      {state === "idle" && <button className="btn coral big" onClick={start}><Mic /> Konuşmaya başla</button>}
      {state === "rec" && <button className="btn coral big" onClick={stop}><span className="rec-dot" /> Bitir <Square size={16} /></button>}
      {state === "wait" && <div className="wave">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.1}s` }} />)}</div>}
      {heard && (
        <div className="col" style={{ gap: 6 }}>
          <div className="h2">{sc} / 100</div>
          <div className="muted small">Duyulan: “{heard.text || "…"}” · {heard.engine === "whisper" ? "Whisper (yerel)" : heard.engine === "native" ? "Android" : "tarayıcı"}</div>
          <div className="row" style={{ justifyContent: "center" }}>
            {heard.audioUrl && <button className="btn sm ghost" onClick={() => new Audio(heard.audioUrl).play()}><Volume2 size={14} /> Kendi sesim</button>}
            <button className="btn sm ghost" onClick={() => { setHeard(null); setState("idle"); }}><RotateCcw size={14} /> Tekrar dene</button>
          </div>
        </div>
      )}
      {err && <div className="small" style={{ color: "var(--coral)" }}>{err}</div>}
      {allowSkip && state === "idle" && !heard && <button className="btn sm ghost" onClick={() => onDone("skip")}>Şu an konuşamıyorum</button>}
      <Feedback r={r} extra={r === "bad" ? "Yavaş dinleyip tekrar dene; kırmızı kelimelere odaklan." : undefined} onNext={() => onDone(r!)} />
    </div>
  );
}

/** Cümlede hedef kelimeyi boşluk yap */
export function blankOut(sentence: string, forms: string[]): { before: string; word: string; after: string } | null {
  const toks = sentence.split(/(\b)/);
  const set = new Set(forms.map((f) => f.toLowerCase()));
  for (let i = 0; i < toks.length; i++) {
    if (set.has(toks[i].toLowerCase())) return { before: toks.slice(0, i).join(""), word: toks[i], after: toks.slice(i + 1).join("") };
  }
  return null;
}
export function ClozeLine({ before, after, filled }: { before: string; after: string; filled?: string }) {
  return <div className="display" style={{ fontSize: 26, lineHeight: 1.5 }}>{before}<span className="blank">{filled || " "}</span>{after}</div>;
}
