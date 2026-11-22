// 🎲 Rastgele: sistemsiz, keyfine göre çalışma. Bas → rastgele cümle / paragraf / kelime / kalıp-deyim gelir.
// Her kartta: kelimeye dokun-anlam, Türkçesi, dinle (normal/yavaş), tekrar et (puanlı), Loki açıklasın, desteye ekle, önceki/sonraki.
import { useEffect, useRef, useState } from "react";
import { Dices, SkipBack, SkipForward, Volume2, Snail, Languages, Mic, Square, Sparkles, Plus, Check } from "lucide-react";
import { PageHead, Lv, Spinner, toast, useMicConsent } from "../components/ui";
import { LEVELS, findWord, phrases, sentences, words, load, KIND_TR, trShow, type Level, type Word, type Phrase } from "../lib/data";
import { speak, stopSpeaking, Listener, type Heard } from "../lib/speech";
import { chat, translateTr } from "../lib/ai";
import { alignWords, scoreOf } from "../lib/grade";
import { addCard } from "../lib/srs";
import { addStat } from "../lib/stats";
import { usePersist } from "../lib/persist";
import type { BookMeta } from "./Reading";

export type RKind = "cumle" | "paragraf" | "kelime" | "kalip" | "karisik";
const KINDS: [RKind, string][] = [["karisik", "🎲 Karışık"], ["cumle", "Cümle"], ["paragraf", "Paragraf"], ["kelime", "Kelime"], ["kalip", "Kalıp & deyim"]];

interface Item {
  kind: Exclude<RKind, "karisik">; en: string; tr?: string; lv?: Level;
  head?: string; sub?: string; ex?: string; card?: { kind: "word" | "phrase" | "sentence"; id: number }; src?: string;
}

const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

async function fetchItem(kind: Exclude<RKind, "karisik">, lv: Level | "hepsi"): Promise<Item> {
  const L = lv === "hepsi" ? rnd(LEVELS) : lv;
  if (kind === "cumle") {
    const s = rnd((await sentences(L)).filter((x) => x[1].split(" ").length >= 4));
    return { kind, en: s[1], tr: s[2], lv: L, card: { kind: "sentence", id: s[0] } };
  }
  if (kind === "kelime") {
    const all = await words();
    const pool = all.filter((w) => (lv === "hepsi" || w.lv === L) && w.tr.length > 0);
    const w = rnd(pool.length ? pool : all);
    return { kind, en: w.w, head: w.w, sub: [w.ipa, w.pos.join(", ")].filter(Boolean).join(" · "), tr: trShow(w.tr, 4), lv: w.lv, ex: w.d.find((d) => d.ex)?.ex || undefined, card: { kind: "word", id: w.id } };
  }
  if (kind === "kalip") {
    const all = await phrases();
    // Kalıp/deyim seviyeleri B1–C1 arası: A1/A2 → B1, C2 → C1
    const PL: Level = lv === "hepsi" ? L : lv === "A1" || lv === "A2" ? "B1" : lv === "C2" ? "C1" : lv;
    const byLv = all.filter((p) => lv === "hepsi" || p.lv === PL);
    const withTr = byLv.filter((p) => p.tr.length > 0);
    const p: Phrase = rnd(withTr.length >= 20 ? withTr : byLv.length ? byLv : all);
    return { kind, en: p.w, head: p.w, sub: KIND_TR[p.k], tr: trShow(p.tr, 3), lv: p.lv, ex: p.ex || undefined, card: { kind: "phrase", id: p.id } };
  }
  // paragraf: kitaplıktan rastgele bir kitap → rastgele bölüm → 1-2 ardışık paragraf
  const idx = await load<BookMeta[]>("books/index.json");
  const pool = idx.filter((b) => (lv === "hepsi" || b.lv === L) && b.kind !== "book");
  const b = rnd(pool.length ? pool : idx);
  const book = await load<{ chapters: { title: string; p: string[]; tr?: string[] }[] }>(`books/${b.id}.json`);
  const okCh = book.chapters.filter((c) => c.p.some((p) => p.split(" ").length >= 25));
  const ch = rnd(okCh.length ? okCh : book.chapters);
  const ps = ch.p.map((p, i) => [p, i] as const).filter(([p]) => p.split(" ").length >= 25 && p.split(" ").length <= 140);
  const [p, i] = ps.length ? rnd(ps) : [ch.p[0], 0];
  return { kind: "paragraf", en: p, tr: ch.tr?.[i], lv: b.lv, src: (ch.title && ch.title !== b.title ? `${b.title} · ${ch.title}` : b.title).slice(0, 90) };
}

export default function Random({ params }: { params: URLSearchParams }) {
  const [kind, setKind] = usePersist<RKind>("rnd.kind", (params.get("k") as RKind) || "karisik");
  const [lv, setLv] = usePersist<Level | "hepsi">("rnd.lv", "hepsi");
  const [autoTr, setAutoTr] = usePersist<boolean>("rnd.tr", false);
  const [hist, setHist] = useState<Item[]>([]);
  const [pos, setPos] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { const k = params.get("k") as RKind; if (k && k !== kind) setKind(k); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = async () => {
    if (pos < hist.length - 1) { setPos(pos + 1); return; }
    setBusy(true); setErr(""); stopSpeaking();
    try {
      const k = kind === "karisik" ? rnd<Exclude<RKind, "karisik">>(["cumle", "cumle", "paragraf", "kelime", "kalip"]) : kind;
      const it = await fetchItem(k, lv);
      setHist((h) => [...h.slice(-99), it]); setPos((p) => Math.min(p + 1, 99));
      addStat({ xp: 1 });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  // Tür ya da seviye değişince yeni bir tane getir
  useEffect(() => { setHist([]); setPos(-1); }, [kind, lv]);
  useEffect(() => { if (pos === -1 && !busy) next(); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === "INPUT") return; if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft" && pos > 0) setPos(pos - 1); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => () => stopSpeaking(), []);
  const it = hist[pos];

  return (
    <div className="col" style={{ gap: 14, maxWidth: 760, margin: "0 auto" }}>
      <PageHead title="Rastgele" sub="Canın sıkılınca bas: rastgele cümle, paragraf, kelime ya da deyim. Dinle, tekrar et, Türkçesine bak." icon={<div className="ico amber"><Dices /></div>} />
      <div className="scroll-x">{KINDS.map(([k, l]) => <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{l}</button>)}</div>
      <div className="scroll-x">
        <button className={`chip ${lv === "hepsi" ? "on" : ""}`} onClick={() => setLv("hepsi")}>Her seviye</button>
        {LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}
        <label className="chip row" style={{ gap: 6 }}><input type="checkbox" checked={autoTr} onChange={(e) => setAutoTr(e.target.checked)} /> Türkçesi hep açık</label>
      </div>
      {err && <div className="card small" style={{ background: "var(--amber-soft)" }}>{err}</div>}
      {!it ? <Spinner /> : <RCard key={pos + it.en} it={it} autoTr={autoTr} />}
      <div className="row" style={{ gap: 10, position: "sticky", bottom: 76, background: "var(--bg)", padding: "8px 0" }}>
        <button className="btn big ghost" style={{ flex: "0 0 auto" }} disabled={pos <= 0} aria-label="Önceki" onClick={() => setPos(pos - 1)}><SkipBack /></button>
        <button className="btn big primary grow" disabled={busy} onClick={next}><Dices /> {busy ? "Getiriliyor…" : "Rastgele getir"} <SkipForward size={18} /></button>
      </div>
    </div>
  );
}

function RCard({ it, autoTr }: { it: Item; autoTr: boolean }) {
  const [tr, setTr] = useState<string | undefined>(it.tr);
  const [showTr, setShowTr] = useState(autoTr);
  const [sel, setSel] = useState<{ tok: string; w?: Word } | null>(null);
  const [ai, setAi] = useState("");
  const [added, setAdded] = useState(false);
  const toks = it.en.split(/(\s+|[.,!?;:"“”()—-]+)/);
  useEffect(() => { if (autoTr && !it.tr) doTr(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function doTr() {
    setShowTr(true);
    if (tr) return;
    setTr("Çevriliyor…");
    try { setTr(await translateTr(it.en)); } catch (e) { setTr(`Çevrilemedi: ${(e as Error).message}`); }
  }
  const explain = async () => {
    setAi("Loki düşünüyor…");
    try {
      const what = it.kind === "kelime" ? "kelimeyi" : it.kind === "kalip" ? "kalıbı/deyimi" : it.kind === "paragraf" ? "paragrafı" : "cümleyi";
      setAi(await chat([
        { role: "system", content: "Sen Türk öğrencilere İngilizce öğreten sıcak, kısa ve net bir öğretmensin. Cevabı TÜRKÇE yaz, en fazla 120 kelime, madde işaretleriyle. İngilizce örnekleri İngilizce bırak." },
        { role: "user", content: `Şu ${what} bana açıkla: "${it.en}"${it.tr ? ` (Türkçesi: ${it.tr})` : ""}.\n${it.kind === "kelime" || it.kind === "kalip" ? "Anlamı, ne zaman kullanılır, 2 kısa örnek cümle (Türkçeleriyle)." : "Cümle yapısı (özne/fiil/zaman), önemli kelime/kalıplar ve aynı yapıyla 1 örnek cümle."}` },
      ], { maxTokens: 500 }));
    } catch (e) { setAi(`Loki şu an cevap veremedi: ${(e as Error).message}`); }
  };
  const tap = async (t: string) => { setSel({ tok: t }); setSel({ tok: t, w: await findWord(t) }); };
  const big = it.kind === "kelime" || it.kind === "kalip";
  return (
    <div className="card pad-lg col pop" style={{ gap: 12 }}>
      <div className="row between wrap" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="tag">{{ cumle: "Cümle", paragraf: "Paragraf", kelime: "Kelime", kalip: it.sub || "Kalıp" }[it.kind]}</span>
          {it.lv && <Lv lv={it.lv} />}
        </div>
        {it.src && <span className="muted tiny">{it.src}</span>}
      </div>
      {big ? (
        <div className="col" style={{ gap: 4 }}>
          <div className="display" style={{ fontSize: 34, fontWeight: 700 }}>{it.head}</div>
          {it.kind === "kelime" && it.sub && <div className="ipa muted">{it.sub}</div>}
        </div>
      ) : (
        <div style={{ fontSize: it.kind === "paragraf" ? 18 : 24, lineHeight: 1.6, fontWeight: it.kind === "cumle" ? 600 : 450 }}>
          {toks.map((t, k) => /^[A-Za-z’']+$/.test(t) ? <span key={k} className={`tok ${sel?.tok === t ? "sel" : ""}`} onClick={() => tap(t)}>{t}</span> : <span key={k}>{t}</span>)}
        </div>
      )}
      {showTr && tr && <div className="card small" style={{ background: "var(--iris-soft)", fontWeight: 600 }}>🇹🇷 {tr}</div>}
      {it.ex && <div className="small" style={{ fontStyle: "italic" }}>“{it.ex}” <button className="btn sm ghost" style={{ padding: "0 6px" }} aria-label="Örneği dinle" onClick={() => speak(it.ex!)}><Volume2 size={13} /></button></div>}
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm primary" onClick={() => speak(it.en)}><Volume2 size={15} /> Dinle</button>
        <button className="btn sm ghost" onClick={() => speak(it.en, { slow: true })}><Snail size={15} /> Yavaş</button>
        <button className={`btn sm ${showTr ? "mint" : "ghost"}`} onClick={() => (showTr ? setShowTr(false) : doTr())}><Languages size={15} /> Türkçesi</button>
        <button className="btn sm ghost" onClick={explain}><Sparkles size={15} /> Loki açıklasın</button>
        {it.card && <button className="btn sm ghost" disabled={added} onClick={async () => { await addCard(it.card!.kind, it.card!.id); setAdded(true); toast("Desteye eklendi"); }}>{added ? <Check size={15} /> : <Plus size={15} />} Desteye</button>}
      </div>
      <Repeat text={it.kind === "paragraf" ? it.en.split(/(?<=[.!?])\s+/)[0] : it.en} />
      {ai && <div className="card small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{ai}</div>}
      {sel && (
        <div className="card small row between" style={{ background: "var(--surface-2, var(--iris-soft))", gap: 8 }}>
          <div><b>{sel.w?.w || sel.tok}</b> {sel.w?.ipa && <span className="ipa muted">{sel.w.ipa}</span>} — {sel.w ? (trShow(sel.w.tr, 3) || sel.w.d[0]?.g) : "Sözlükte yok."}</div>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn icon sm" aria-label="Kelimeyi dinle" onClick={() => speak(sel.w?.w || sel.tok)}><Volume2 size={15} /></button>
            {sel.w && <button className="btn icon sm primary" aria-label="Kelimeyi desteye ekle" onClick={async () => { await addCard("word", sel.w!.id); toast("Desteye eklendi"); }}><Plus size={15} /></button>}
            <button className="btn icon sm" aria-label="Kapat" onClick={() => setSel(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tekrar et: mikrofona söyle, susunca puanlanır */
export function Repeat({ text }: { text: string }) {
  const [, request, consentUi] = useMicConsent();
  const [st, setSt] = useState<"idle" | "rec" | "wait">("idle");
  const [h, setH] = useState<Heard | null>(null);
  const [err, setErr] = useState("");
  const lis = useRef<Listener | null>(null);
  useEffect(() => () => lis.current?.cancel(), []);
  const stop = async () => {
    const l = lis.current; if (!l) return; lis.current = null;
    setSt("wait");
    try { const r = await l.stop(); setH(r); if (!r.text) setErr("Sesini duyamadım; mikrofona yakın söyle."); else addStat({ xp: 3 }); } catch (e) { setErr((e as Error).message); }
    setSt("idle");
  };
  const start = async () => {
    setErr(""); setH(null); stopSpeaking();
    if (!(await request())) return;
    const l = new Listener(); lis.current = l;
    try { await l.start(30, () => stop()); setSt("rec"); } catch (e) { setErr((e as Error).message); lis.current = null; }
  };
  const al = h?.text ? alignWords(text, h.text) : [];
  return (
    <div className="col" style={{ gap: 6 }}>
      {consentUi}
      <div className="row wrap" style={{ gap: 8 }}>
        {st === "rec" ? <button className="btn sm coral" onClick={stop}><span className="rec-dot" /> Söyle… (susunca biter) <Square size={13} /></button>
          : <button className="btn sm coral" disabled={st === "wait"} onClick={start}><Mic size={15} /> {st === "wait" ? "Değerlendiriliyor…" : h ? "Tekrar söyle" : "Tekrar et (sesli)"}</button>}
        {h?.text && <b className="small">{scoreOf(al)} / 100</b>}
        {h?.audioUrl && h.text && <button className="btn sm ghost" onClick={() => new Audio(h.audioUrl).play()}><Volume2 size={14} /> Kendi sesim</button>}
      </div>
      {h?.text && <div className="small">{al.map((x, k) => <span key={k} className={x.s === "ok" ? "w-ok" : x.s === "miss" ? "w-miss" : "w-bad"}>{x.w} </span>)}</div>}
      {err && <div className="small" style={{ color: "var(--coral)" }}>{err}</div>}
    </div>
  );
}
