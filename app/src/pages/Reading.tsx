import { useEffect, useMemo, useState } from "react";
import { Library, ArrowLeft, ChevronLeft, ChevronRight, Volume2, Plus, Check, Languages, Square } from "lucide-react";
import { Lv, PageHead, Spinner, toast } from "../components/ui";
import { findWord, load, type Level, type Word } from "../lib/data";
import { db } from "../lib/db";
import { addCard, cardId } from "../lib/srs";
import { speak, stopSpeaking } from "../lib/speech";
import { addStat } from "../lib/stats";
import { go } from "../lib/router";
import { sentenceAt, translateTr } from "../lib/ai";

export interface BookMeta { id: string; title: string; author: string; lv: Level; kind: "story" | "book" | "tiny" | "wiki"; chapters: number; words: number; blurb: string; gen?: number }
interface Chapter { title: string; p: string[]; tr?: string[] }

const SECTIONS = [
  { k: "story", label: "Hikâyeler", hint: "Türkçe çevirili, seviyeli" },
  { k: "tiny", label: "Kısa hikâyeler", hint: "Her ciltte 25 basit hikâye" },
  { k: "wiki", label: "Bilgi metinleri", hint: "Basit İngilizce Vikipedi" },
  { k: "book", label: "Klasik kitaplar", hint: "Telifsiz, orijinal metin" },
] as const;
const LV_ALL = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export default function Reading({ id, params }: { id?: string; params: URLSearchParams }) {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [err, setErr] = useState("");
  const [sec, setSec] = useState<string>(params.get("k") || "story");
  const [lv, setLv] = useState<string>("");
  const [q, setQ] = useState("");
  const [n, setN] = useState(24);
  const [last, setLast] = useState<{ id: string; pos?: number } | null>(null);
  useEffect(() => { load<BookMeta[]>("books/index.json").then(setBooks).catch((e) => setErr(String(e))); }, []);
  useEffect(() => { db.progress.where("kind").equals("book").reverse().sortBy("ts").then((r) => setLast(r[0] ? { id: r[0].id.slice(2), pos: r[0].pos } : null)); }, []);
  useEffect(() => setN(24), [sec, lv, q]);
  const list = useMemo(() => {
    if (!books) return [];
    const qq = q.trim().toLowerCase();
    return books.filter((b) => (qq ? true : b.kind === sec) && (!lv || b.lv === lv) && (!qq || (b.title + " " + b.author).toLowerCase().includes(qq)));
  }, [books, sec, lv, q]);
  if (id) return <Reader id={id} ch={Number(params.get("ch") || 0)} />;
  if (err) return <div className="card">Kitaplık yüklenemedi: {err}</div>;
  if (!books) return <Spinner />;
  const total = books.reduce((s, b) => s + (b.kind === "tiny" || b.kind === "wiki" ? b.chapters : 1), 0);
  const lastB = last && books.find((b) => b.id === last.id);
  return (
    <div>
      <PageHead title="Okuma" sub={`${total.toLocaleString("tr")} metin. Seviyene uygun olanı seç, bilmediğin kelimeye dokun, desteye ekle.`} icon={<div className="ico rose"><Library /></div>} />
      {lastB && <div className="card hover row between" style={{ marginBottom: 16 }} onClick={() => go(`/okuma/${lastB.id}?ch=${last!.pos || 0}`)}>
        <div><div className="muted tiny">Kaldığın yerden devam et</div><b>{lastB.title}</b> <span className="muted small">· bölüm {(last!.pos || 0) + 1}/{lastB.chapters}</span></div>
        <ChevronRight />
      </div>}
      <div className="scroll-x" style={{ marginBottom: 10 }}>
        {SECTIONS.map((s) => <button key={s.k} className={`chip ${sec === s.k && !q ? "on" : ""}`} onClick={() => { setSec(s.k); setQ(""); }}>{s.label} <span className="muted tiny">({books.filter((b) => b.kind === s.k).length})</span></button>)}
      </div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <input className="input" style={{ flex: "1 1 220px" }} placeholder="Başlık veya yazar ara…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scroll-x">
          <button className={`chip ${!lv ? "on" : ""}`} onClick={() => setLv("")}>Tümü</button>
          {LV_ALL.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}
        </div>
      </div>
      {!q && <div className="muted small" style={{ marginBottom: 12 }}>{SECTIONS.find((s) => s.k === sec)?.hint} · {list.length} sonuç</div>}
      {list.length === 0 ? <div className="card muted">Bu filtrede metin yok.</div>
        : <div className="grid g3">{list.slice(0, n).map((b) => <BookCard key={b.id} b={b} />)}</div>}
      {n < list.length && <div className="row" style={{ justifyContent: "center", marginTop: 18 }}><button className="btn" onClick={() => setN(n + 24)}>Daha fazla göster ({list.length - n})</button></div>}
      <p className="muted tiny" style={{ marginTop: 24 }}>Kaynaklar: TinyStories (CDLA-Sharing-1.0), Simple English Wikipedia (CC BY-SA 4.0), Project Gutenberg (kamu malı). Hikâyeler ve çeviriler Lokilingo için üretildi.</p>
    </div>
  );
}
function BookCard({ b }: { b: BookMeta }) {
  const hue = [...b.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div className="card hover col" style={{ gap: 10 }} onClick={() => go(`/okuma/${b.id}`)}>
      <div style={{ height: 120, borderRadius: 16, background: `linear-gradient(135deg, hsl(${hue} 75% 62%), hsl(${(hue + 50) % 360} 80% 52%))`, display: "grid", placeItems: "center", color: "#fff", padding: 12, textAlign: "center" }}>
        <div className="display" style={{ fontSize: 20, fontWeight: 700, textShadow: "0 2px 10px rgba(0,0,0,.2)" }}>{b.title}</div>
      </div>
      <div className="row between"><span className="muted small">{b.author}</span><Lv lv={b.lv} /></div>
      <div className="small sub">{b.blurb}</div>
      <div className="muted tiny">{b.kind === "tiny" ? `${b.chapters} hikâye` : b.kind === "wiki" ? `${b.chapters} makale` : `${b.chapters} bölüm`} · {b.words.toLocaleString("tr")} kelime{b.gen ? " · TR çeviri" : ""}</div>
    </div>
  );
}

function Reader({ id, ch }: { id: string; ch: number }) {
  const [book, setBook] = useState<{ meta: BookMeta; chapters: Chapter[] } | null>(null);
  const [sel, setSel] = useState<{ tok: string; w?: Word; pi: number; ti: number } | null>(null);
  const [sent, setSent] = useState<{ en: string; tr?: string; err?: string } | null>(null);
  const [deck, setDeck] = useState<Set<string>>(new Set());
  const [showTr, setShowTr] = useState<Set<number>>(new Set());
  const [reading, setReading] = useState<number | null>(null);
  useEffect(() => {
    load<{ meta: BookMeta; chapters: Chapter[] }>(`books/${id}.json`).then(setBook);
    db.cards.where("kind").equals("word").toArray().then(async (rows) => {
      const { words } = await import("../lib/data"); const ws = await words();
      const s = new Set<string>();
      for (const r of rows) { const w = ws[Number(r.ref) - 1]; if (w) { s.add(w.w); w.f.forEach((f) => s.add(f)); } }
      setDeck(s);
    });
  }, [id]);
  useEffect(() => { if (book) db.progress.put({ id: "b:" + id, kind: "book", done: 0, score: 0, pos: ch, ts: Date.now() }); }, [book, ch, id]);
  useEffect(() => () => stopSpeaking(), []);
  const chapter = book?.chapters[ch];
  const paras = useMemo(() => chapter?.p.map((p) => p.split(/(\s+|[.,!?;:"“”()—-]+)/)) || [], [chapter]);
  if (!book || !chapter) return <Spinner />;
  const tap = async (tok: string, pi: number, ti: number) => { setSent(null); setSel({ tok, pi, ti }); const w = await findWord(tok); setSel({ tok, w, pi, ti }); };
  const transSentence = async () => {
    if (!sel) return;
    const pos = paras[sel.pi].slice(0, sel.ti).join("").length;
    const en = sentenceAt(chapter.p[sel.pi], pos);
    setSent({ en });
    try { setSent({ en, tr: await translateTr(en) }); } catch (e) { setSent({ en, err: (e as Error).message }); }
  };
  const readPara = async (pi: number) => {
    if (reading === pi) { stopSpeaking(); setReading(null); return; }
    setReading(pi); await speak(chapter.p[pi]); setReading(null);
  };
  const nextCh = () => { addStat({ xp: 15 }); go(`/okuma/${id}?ch=${ch + 1}`); };
  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 18 }}>
        <button className="btn ghost sm" onClick={() => go("/okuma")}><ArrowLeft size={16} /> Kitaplık</button>
        <div className="row"><Lv lv={book.meta.lv} />
          {book.chapters.length > 1
            ? <select className="input" style={{ maxWidth: 260, padding: "6px 10px" }} aria-label="Bölüm seç" value={ch} onChange={(e) => go(`/okuma/${id}?ch=${e.target.value}`)}>
                {book.chapters.map((c, i) => <option key={i} value={i}>{i + 1}. {c.title.slice(0, 50)}</option>)}
              </select>
            : <span className="muted small">{book.meta.title}</span>}
        </div>
      </div>
      <div className="reader">
        <h2 className="h2" style={{ marginBottom: 20 }}>{chapter.title}</h2>
        {paras.map((toks, pi) => (
          <div key={pi} style={{ position: "relative" }}>
            <p>
              {toks.map((t, ti) => /^[A-Za-z’']+$/.test(t)
                ? <span key={ti} className={`tok ${sel?.pi === pi && sel.tok === t ? "sel" : deck.has(t.toLowerCase()) ? "learning" : ""}`} onClick={() => tap(t, pi, ti)}>{t}</span>
                : <span key={ti}>{t}</span>)}
            </p>
            <div className="row" style={{ marginTop: -10, marginBottom: 16, gap: 6 }}>
              <button className="btn sm ghost" onClick={() => readPara(pi)}>{reading === pi ? <><Square size={13} /> Durdur</> : <><Volume2 size={14} /> Dinle</>}</button>
              {chapter.tr?.[pi] && <button className="btn sm ghost" onClick={() => setShowTr(new Set(showTr.has(pi) ? [...showTr].filter((x) => x !== pi) : [...showTr, pi]))}><Languages size={14} /> Türkçesi</button>}
            </div>
            {showTr.has(pi) && chapter.tr?.[pi] && <div className="card small sub" style={{ marginBottom: 16, fontFamily: "var(--font)" }}>{chapter.tr[pi]}</div>}
          </div>
        ))}
        <div className="row between" style={{ marginTop: 30 }}>
          <button className="btn ghost" disabled={ch === 0} onClick={() => go(`/okuma/${id}?ch=${ch - 1}`)}><ChevronLeft /> Önceki</button>
          {ch + 1 < book.chapters.length ? <button className="btn primary" onClick={nextCh}>Sonraki bölüm <ChevronRight /></button>
            : <button className="btn mint" onClick={() => { addStat({ xp: 30 }); toast("Kitabı bitirdin! 🎉"); go("/okuma"); }}>Bitirdim</button>}
        </div>
      </div>
      {sel && (
        <div className="card pop" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 84, width: "min(560px, calc(100% - 24px))", zIndex: 50, boxShadow: "var(--shadow-2)" }}>
          <div className="row between">
            <div className="row"><b className="display" style={{ fontSize: 24 }}>{sel.w?.w || sel.tok}</b>{sel.w && <Lv lv={sel.w.lv} />}<span className="ipa small">{sel.w?.ipa}</span></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn icon" aria-label="Dinle" onClick={() => speak(sel.w?.w || sel.tok)}><Volume2 size={18} /></button>
              {sel.w && <button className="btn icon primary" aria-label="Desteye ekle" disabled={deck.has(sel.w.w)} onClick={async () => {
                await addCard("word", sel.w!.id); setDeck(new Set([...deck, sel.w!.w, ...sel.w!.f])); toast("Desteye eklendi");
              }}>{deck.has(sel.w.w) ? <Check size={18} /> : <Plus size={18} />}</button>}
              <button className="btn icon" aria-label="Kapat" onClick={() => { setSel(null); setSent(null); }}>✕</button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontWeight: 650 }}>{sel.w ? (sel.w.tr.slice(0, 3).join(" · ") || sel.w.d[0]?.g) : "Sözlükte yok (özel isim olabilir)."}</div>
          {sel.w && sel.w.d[0] && sel.w.tr.length > 0 && <div className="muted small">{sel.w.d[0].g}</div>}
          {!sent ? <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={transSentence}><Languages size={14} /> Bu cümleyi çevir</button>
            : <div className="card small" style={{ marginTop: 8, padding: "8px 10px", background: "var(--iris-soft)" }}>
                <div className="muted tiny" style={{ fontStyle: "italic" }}>{sent.en}</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>{sent.err ? `Çevrilemedi: ${sent.err}` : sent.tr ?? "Çevriliyor…"}</div>
              </div>}
        </div>
      )}
    </div>
  );
}
export { cardId };
