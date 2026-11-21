// Dizi & Şarkı: telifsiz şarkılar, dizi kalıpları, günlük diyaloglar ve KULLANICININ KENDİ altyazı/söz dosyaları.
// Telifli söz/altyazı bizde barındırılmaz; kullanıcı kendi dosyasını yükler, veri sadece bu cihazda (IndexedDB) kalır.
import { useEffect, useMemo, useRef, useState } from "react";
import { Music, Clapperboard, MessagesSquare, Upload, Play, Square, Languages, Gamepad2, Plus, Trash2, ArrowLeft, Check, Volume2 } from "lucide-react";
import { AudioBtn, Lv, PageHead, Spinner, toast, confetti } from "../components/ui";
import { findWord, load, shuffle, type Word } from "../lib/data";
import { db, type MediaRow } from "../lib/db";
import { addCard } from "../lib/srs";
import { speak, stopSpeaking } from "../lib/speech";
import { addStat } from "../lib/stats";
import { sfx } from "../lib/sfx";
import { go } from "../lib/router";

interface Song { id: string; title: string; lv: string; by: string; lines: [string, string][] }
interface Expr { en: string; tr: string; note: string; cat: string }
interface Dlg { lv: string; l: string[] }
interface Line { en: string; tr?: string; t?: number }

const TABS = [
  { k: "sarki", label: "Şarkılar", icon: Music },
  { k: "kalip", label: "Dizi kalıpları", icon: Clapperboard },
  { k: "diyalog", label: "Diyaloglar", icon: MessagesSquare },
  { k: "benim", label: "Kendi dizin / şarkın", icon: Upload },
] as const;

export default function Media({ id, params }: { id?: string; params: URLSearchParams }) {
  const tab = id || "sarki";
  return (
    <div>
      <PageHead title="Dizi & Şarkı" sub="Şarkı sözleri, dizi replikleri ve gerçek diyaloglarla İngilizce: dinle, boşluk doldur, kelime topla." icon={<div className="ico coral"><Clapperboard /></div>} />
      <div className="scroll-x" style={{ marginBottom: 16 }}>
        {TABS.map((t) => <button key={t.k} className={`chip ${tab === t.k ? "on" : ""}`} onClick={() => go(`/medya/${t.k}`)}><t.icon size={15} /> {t.label}</button>)}
      </div>
      {tab === "sarki" && <Songs open={params.get("s")} />}
      {tab === "kalip" && <Expressions />}
      {tab === "diyalog" && <Dialogs chunk={Number(params.get("c") || 0)} open={params.get("d")} />}
      {tab === "benim" && <Mine open={params.get("m")} />}
    </div>
  );
}

/* ---------- Şarkılar ---------- */
function Songs({ open }: { open: string | null }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  useEffect(() => { load<Song[]>("media/songs.json").then(setSongs); }, []);
  if (!songs) return <Spinner />;
  const s = open && songs.find((x) => x.id === open);
  if (s) return <LinePlayer title={s.title} sub={s.by} lines={s.lines.map(([en, tr]) => ({ en, tr }))} back="/medya/sarki" />;
  return (
    <div className="grid g3">
      {songs.map((x) => (
        <div key={x.id} className="card hover col" style={{ gap: 8 }} onClick={() => go(`/medya/sarki?s=${x.id}`)}>
          <div className="row between"><b>{x.title}</b><Lv lv={x.lv} /></div>
          <div className="muted small">{x.by}</div>
          <div className="small sub" style={{ fontStyle: "italic" }}>“{x.lines[0][0]}”</div>
        </div>
      ))}
      <div className="card col" style={{ gap: 8, borderStyle: "dashed" }}>
        <b>Sevdiğin şarkı burada yok mu?</b>
        <div className="small sub">Popüler şarkıların sözleri telifli olduğu için uygulamaya koyamıyoruz. Sözleri kendin yapıştır, aynı oyunlarla çalış.</div>
        <button className="btn sm primary" onClick={() => go("/medya/benim")}><Upload size={15} /> Söz / altyazı ekle</button>
      </div>
    </div>
  );
}

/* ---------- Satır oynatıcı: oku, dinle, boşluk doldurma oyunu, kelimeye dokun ---------- */
function LinePlayer({ title, sub, lines, back, video, onDelete }: { title: string; sub?: string; lines: Line[]; back: string; video?: string; onDelete?: () => void }) {
  const [mode, setMode] = useState<"oku" | "oyun">("oku");
  const [tr, setTr] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [word, setWord] = useState<{ tok: string; w?: Word } | null>(null);
  const [cur, setCur] = useState(-1);
  const stop = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [localUrl, setLocalUrl] = useState("");
  useEffect(() => () => { stop.current = true; stopSpeaking(); }, []);
  const yt = video && ytId(video);
  const seek = (t?: number) => {
    if (t === undefined) return;
    if (yt && frame.current) frame.current.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [t, true] }), "*");
    if (vid.current) { vid.current.currentTime = t; vid.current.play(); }
  };
  const playAll = async () => {
    if (playing !== null) { stop.current = true; stopSpeaking(); setPlaying(null); return; }
    stop.current = false;
    for (let i = 0; i < lines.length && !stop.current; i++) { setPlaying(i); await speak(lines[i].en); }
    setPlaying(null);
  };
  const onTime = () => {
    const t = vid.current?.currentTime ?? 0;
    let k = -1; lines.forEach((l, i) => { if (l.t !== undefined && l.t <= t) k = i; });
    setCur(k);
  };
  const tap = async (tok: string) => { setWord({ tok }); setWord({ tok, w: await findWord(tok) }); };
  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => go(back)}><ArrowLeft size={16} /> Geri</button>
        <div className="row" style={{ gap: 6 }}>
          <button className={`chip ${mode === "oku" ? "on" : ""}`} onClick={() => setMode("oku")}>Oku & dinle</button>
          <button className={`chip ${mode === "oyun" ? "on" : ""}`} onClick={() => setMode("oyun")}><Gamepad2 size={15} /> Boşluk doldur</button>
          {onDelete && <button className="btn icon sm" aria-label="Sil" onClick={onDelete}><Trash2 size={16} /></button>}
        </div>
      </div>
      <h2 className="h2">{title}</h2>
      {sub && <div className="muted small" style={{ marginBottom: 12 }}>{sub}</div>}
      {yt && <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 16, overflow: "hidden", margin: "10px 0 16px" }}>
        <iframe ref={frame} title="Video" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          src={`https://www.youtube-nocookie.com/embed/${yt}?enablejsapi=1&rel=0`} allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>}
      {video === "local" && <div style={{ margin: "10px 0 16px" }}>
        {localUrl ? <video ref={vid} src={localUrl} controls onTimeUpdate={onTime} style={{ width: "100%", borderRadius: 16 }} />
          : <label className="btn sm"><Upload size={15} /> Videoyu seç (sadece bu cihazda oynatılır)<input type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setLocalUrl(URL.createObjectURL(f)); }} /></label>}
      </div>}
      {mode === "oku" ? (
        <>
          <div className="row" style={{ gap: 6, margin: "8px 0 14px" }}>
            <button className="btn sm primary" onClick={playAll}>{playing !== null ? <><Square size={14} /> Durdur</> : <><Play size={14} /> Hepsini dinle</>}</button>
            {lines.some((l) => l.tr) && <button className={`btn sm ${tr ? "mint" : "ghost"}`} onClick={() => setTr(!tr)}><Languages size={14} /> Türkçesi</button>}
          </div>
          <div className="col" style={{ gap: 6 }}>
            {lines.map((l, i) => (
              <div key={i} className="card" style={{ padding: "10px 14px", borderColor: playing === i || cur === i ? "var(--iris)" : undefined }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div style={{ fontSize: 17, lineHeight: 1.6 }}>
                    {l.en.split(/(\s+|[.,!?;:"“”()—-]+)/).map((t, k) => /^[A-Za-z’']+$/.test(t)
                      ? <span key={k} className={`tok ${word?.tok === t ? "sel" : ""}`} onClick={() => tap(t)}>{t}</span> : <span key={k}>{t}</span>)}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {l.t !== undefined && (yt || localUrl) && <button className="btn icon sm" aria-label="Videoda bu satıra git" onClick={() => seek(l.t)}><Play size={14} /></button>}
                    <AudioBtn text={l.en} size={16} />
                  </div>
                </div>
                {tr && l.tr && <div className="muted small">{l.tr}</div>}
              </div>
            ))}
          </div>
        </>
      ) : <Cloze lines={lines} />}
      {word && (
        <div className="card pop" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 84, width: "min(560px, calc(100% - 24px))", zIndex: 50, boxShadow: "var(--shadow-2)" }}>
          <div className="row between">
            <div className="row"><b className="display" style={{ fontSize: 22 }}>{word.w?.w || word.tok}</b>{word.w && <Lv lv={word.w.lv} />}<span className="ipa small">{word.w?.ipa}</span></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn icon" aria-label="Dinle" onClick={() => speak(word.w?.w || word.tok)}><Volume2 size={18} /></button>
              {word.w && <button className="btn icon primary" aria-label="Desteye ekle" onClick={async () => { await addCard("word", word.w!.id); toast("Desteye eklendi"); }}><Plus size={18} /></button>}
              <button className="btn icon" aria-label="Kapat" onClick={() => setWord(null)}>✕</button>
            </div>
          </div>
          <div style={{ marginTop: 6, fontWeight: 650 }}>{word.w ? (word.w.tr.slice(0, 3).join(" · ") || word.w.d[0]?.g) : "Sözlükte yok."}</div>
        </div>
      )}
    </div>
  );
}

const STOP = new Set("the a an and or but to of in on at is are was were be i you he she it we they my your his her its our their me him us them this that with for so do not no yes oh".split(" "));
function Cloze({ lines }: { lines: Line[] }) {
  const items = useMemo(() => {
    const pool = [...new Set(lines.flatMap((l) => l.en.match(/[A-Za-z']{3,}/g) || []).map((w) => w.toLowerCase()))];
    return lines.map((l) => {
      const ws = (l.en.match(/[A-Za-z']{3,}/g) || []).filter((w) => !STOP.has(w.toLowerCase()));
      if (!ws.length) return null;
      const ans = ws.sort((a, b) => b.length - a.length)[Math.floor(Math.random() * Math.min(2, ws.length))];
      const wrong = shuffle(pool.filter((w) => w !== ans.toLowerCase() && Math.abs(w.length - ans.length) < 4)).slice(0, 3);
      return { l, ans, opts: shuffle([ans.toLowerCase(), ...wrong]) };
    }).filter(Boolean) as { l: Line; ans: string; opts: string[] }[];
  }, [lines]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  if (!items.length) return <div className="card muted">Bu metinde oyun için yeterli kelime yok.</div>;
  if (i >= items.length) return (
    <div className="card col" style={{ alignItems: "center", gap: 10, padding: 30 }}>
      <div className="display" style={{ fontSize: 40 }}>{score}/{items.length}</div>
      <div className="sub">{score === items.length ? "Kusursuz! 🎉" : "Güzel! Bir tur daha?"}</div>
      <button className="btn primary" onClick={() => { setI(0); setScore(0); setPicked(null); }}>Tekrar oyna</button>
    </div>
  );
  const it = items[i];
  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === it.ans.toLowerCase();
    sfx(ok ? "ok" : "bad");
    if (ok) setScore(score + 1);
    speak(it.l.en);
    setTimeout(() => {
      setPicked(null);
      if (i + 1 >= items.length) { addStat({ xp: 10 + score, correct: score + (ok ? 1 : 0), total: items.length }); if (score + (ok ? 1 : 0) === items.length) confetti(); else sfx("done"); }
      setI(i + 1);
    }, ok ? 900 : 1800);
  };
  const re = new RegExp(`\\b${it.ans}\\b`);
  return (
    <div className="card col" style={{ gap: 16, padding: 22 }}>
      <div className="row between"><span className="muted small">{i + 1}/{items.length}</span><span className="tag">Puan {score}</span></div>
      <div style={{ fontSize: 20, lineHeight: 1.6, textAlign: "center" }}>
        {it.l.en.split(re).map((part, k, arr) => <span key={k}>{part}{k < arr.length - 1 && <span className="blank" style={{ padding: "0 18px", borderBottom: "3px solid var(--iris)" }}>{picked ? it.ans : "\u00a0"}</span>}</span>)}
      </div>
      {it.l.tr && <div className="muted small" style={{ textAlign: "center" }}>{it.l.tr}</div>}
      <div className="grid g2" style={{ gap: 8 }}>
        {it.opts.map((o) => <button key={o} className={`opt ${picked ? (o === it.ans.toLowerCase() ? "ok" : o === picked ? "bad" : "") : ""}`} onClick={() => choose(o)}>{o}</button>)}
      </div>
      <button className="btn ghost sm" onClick={() => speak(it.l.en, { slow: true })}><Volume2 size={14} /> İpucu: satırı dinle</button>
    </div>
  );
}

/* ---------- Dizi kalıpları ---------- */
function Expressions() {
  const [ex, setEx] = useState<Expr[] | null>(null);
  const [cat, setCat] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  useEffect(() => { load<Expr[]>("media/expr.json").then(setEx); }, []);
  if (!ex) return <Spinner />;
  const cats = [...new Set(ex.map((e) => e.cat))];
  const list = ex.filter((e) => !cat || e.cat === cat);
  const add = async (e: Expr) => {
    await addCard("custom", "x:" + e.en, { front: e.en, back: e.tr, note: e.note });
    setAdded(new Set([...added, e.en])); toast("Desteye eklendi");
  };
  return (
    <div>
      <div className="scroll-x" style={{ marginBottom: 12 }}>
        <button className={`chip ${!cat ? "on" : ""}`} onClick={() => setCat("")}>Tümü ({ex.length})</button>
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {list.map((e) => (
          <div key={e.en} className="card row between" style={{ padding: "10px 14px" }}>
            <div><b style={{ fontSize: 16.5 }}>{e.en}</b><div className="small">{e.tr}</div><div className="muted tiny">{e.note}</div></div>
            <div className="row" style={{ gap: 4 }}>
              <AudioBtn text={e.en} size={16} />
              <button className="btn icon sm" aria-label="Desteye ekle" disabled={added.has(e.en)} onClick={() => add(e)}>{added.has(e.en) ? <Check size={16} /> : <Plus size={16} />}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Günlük diyaloglar (DailyDialog) ---------- */
function Dialogs({ chunk, open }: { chunk: number; open: string | null }) {
  const [idx, setIdx] = useState<{ n: number; count: number; lv: string }[] | null>(null);
  const [items, setItems] = useState<Dlg[] | null>(null);
  const [page, setPage] = useState(0);
  useEffect(() => { load<typeof idx>("media/dd-index.json").then(setIdx); }, []);
  useEffect(() => { setItems(null); setPage(0); load<Dlg[]>(`media/dd-${chunk}.json`).then(setItems); }, [chunk]);
  if (!idx || !items) return <Spinner />;
  const total = idx.reduce((s, x) => s + x.count, 0);
  if (open !== null) {
    const d = items[Number(open)];
    if (d) return <DialogView d={d} back={`/medya/diyalog?c=${chunk}`} title={`Diyalog ${chunk * 500 + Number(open) + 1}`} />;
  }
  const per = 20;
  return (
    <div>
      <div className="row wrap between" style={{ marginBottom: 12, gap: 8 }}>
        <span className="muted small">{total.toLocaleString("tr")} gerçekçi günlük diyalog, kolaydan zora sıralı.</span>
        <select className="input" style={{ maxWidth: 230, padding: "6px 10px" }} aria-label="Bölüm" value={chunk} onChange={(e) => go(`/medya/diyalog?c=${e.target.value}`)}>
          {idx.map((x) => <option key={x.n} value={x.n}>Paket {x.n + 1} · {x.lv} ({x.count})</option>)}
        </select>
      </div>
      <div className="col" style={{ gap: 6 }}>
        {items.slice(page * per, page * per + per).map((d, k) => {
          const i = page * per + k;
          return (
            <div key={i} className="card hover row between" style={{ padding: "10px 14px" }} onClick={() => go(`/medya/diyalog?c=${chunk}&d=${i}`)}>
              <div><b>{d.l[0].slice(0, 70)}</b><div className="muted small">{d.l[1]?.slice(0, 70)}</div></div>
              <div className="row" style={{ gap: 6 }}><span className="tag">{d.l.length} satır</span><Lv lv={d.lv} /></div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 14 }}>
        <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Önceki</button>
        <span className="muted small">{page + 1}/{Math.ceil(items.length / per)}</span>
        <button className="btn sm" disabled={(page + 1) * per >= items.length} onClick={() => setPage(page + 1)}>Sonraki</button>
      </div>
      <p className="muted tiny" style={{ marginTop: 20 }}>Kaynak: DailyDialog (Li ve ark., 2017), CC BY-NC-SA 4.0 — ticari olmayan eğitim amaçlı kullanılır.</p>
    </div>
  );
}

function DialogView({ d, back, title }: { d: Dlg; back: string; title: string }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [role, setRole] = useState(false);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; stopSpeaking(); }, []);
  const playAll = async () => {
    if (playing !== null) { stop.current = true; stopSpeaking(); setPlaying(null); return; }
    stop.current = false;
    for (let i = 0; i < d.l.length && !stop.current; i++) {
      if (role && i % 2 === 1) { setPlaying(i); await new Promise((r) => setTimeout(r, 900 + d.l[i].length * 60)); continue; }
      setPlaying(i); await speak(d.l[i], { voice: i % 2 ? "male" : "female" });
    }
    setPlaying(null); addStat({ xp: 5 });
  };
  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <button className="btn ghost sm" onClick={() => go(back)}><ArrowLeft size={16} /> Liste</button>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm primary" onClick={playAll}>{playing !== null ? <><Square size={14} /> Durdur</> : <><Play size={14} /> Dinle</>}</button>
          <button className={`chip ${role ? "on" : ""}`} onClick={() => setRole(!role)}>B rolünü sen konuş</button>
        </div>
      </div>
      <h2 className="h2" style={{ marginBottom: 12 }}>{title} <Lv lv={d.lv} /></h2>
      {role && <div className="muted small" style={{ marginBottom: 10 }}>B'nin satırları gizli. Sıra sana gelince yüksek sesle söyle, sonra dokunup kontrol et.</div>}
      <div className="col" style={{ gap: 8 }}>
        {d.l.map((x, i) => {
          const b = i % 2 === 1, hide = role && b && !shown.has(i);
          return (
            <div key={i} className="row" style={{ justifyContent: b ? "flex-end" : "flex-start" }}>
              <div className="card" onClick={() => hide && setShown(new Set([...shown, i]))}
                style={{ maxWidth: "82%", padding: "10px 14px", background: b ? "var(--iris-soft)" : undefined, borderColor: playing === i ? "var(--iris)" : undefined, cursor: hide ? "pointer" : undefined }}>
                <div className="muted tiny">{b ? "B" : "A"}</div>
                {hide ? <span className="muted">🎤 Senin sıran — dokun, göster</span> : <span style={{ fontSize: 16.5 }}>{x}</span>}
                {!hide && <span style={{ marginLeft: 6 }}><AudioBtn text={x} size={14} /></span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Kullanıcının kendi altyazı/sözleri ---------- */
function Mine({ open }: { open: string | null }) {
  const [rows, setRows] = useState<MediaRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [video, setVideo] = useState("");
  const refresh = () => db.media.orderBy("ts").reverse().toArray().then(setRows);
  useEffect(() => { refresh(); }, []);
  if (!rows) return <Spinner />;
  const m = open && rows.find((r) => String(r.id) === open);
  if (m) return <LinePlayer title={m.title} sub={m.kind === "subs" ? "Altyazı" : m.kind === "lyrics" ? "Şarkı sözü" : "Metin"} lines={m.lines} video={m.video} back="/medya/benim"
    onDelete={async () => { await db.media.delete(m.id!); toast("Silindi"); go("/medya/benim"); }} />;
  const file = async (f: File) => {
    if (f.size > 2_000_000) { toast("Dosya çok büyük (en fazla 2 MB)"); return; }
    setText(await f.text()); if (!title) setTitle(f.name.replace(/\.(srt|vtt|lrc|txt)$/i, ""));
  };
  const save = async () => {
    const lines = parseSubs(text);
    if (lines.length < 2) { toast("En az 2 satır metin gerekli"); return; }
    if (video && video !== "local" && !ytId(video)) { toast("Geçerli bir YouTube bağlantısı değil"); return; }
    const kind: MediaRow["kind"] = lines.some((l) => l.t !== undefined) ? (/\[\d+:\d+/.test(text) ? "lyrics" : "subs") : "lyrics";
    const id = await db.media.add({ title: (title || "Başlıksız").slice(0, 100), kind, lines: lines.slice(0, 3000), video: video || undefined, ts: Date.now() });
    setTitle(""); setText(""); setVideo(""); await refresh(); go(`/medya/benim?m=${id}`);
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card col" style={{ gap: 10 }}>
        <b>Altyazı veya şarkı sözü ekle</b>
        <div className="small sub">İzlediğin dizinin <b>.srt / .vtt</b> altyazısını, şarkının <b>.lrc</b> dosyasını yükle ya da sözleri yapıştır. İstersen YouTube bağlantısı ekle; satıra dokununca video o ana gider. Dosyaların sadece bu cihazda saklanır, hiçbir yere gönderilmez.</div>
        <input className="input" placeholder="Başlık (ör. Friends S01E01)" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" rows={6} placeholder="Sözleri veya altyazıyı buraya yapıştır…" value={text} onChange={(e) => setText(e.target.value.slice(0, 2_000_000))} />
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="btn sm"><Upload size={15} /> Dosya seç<input type="file" accept=".srt,.vtt,.lrc,.txt,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) file(f); }} /></label>
          <input className="input" style={{ flex: "1 1 240px" }} placeholder="YouTube bağlantısı (isteğe bağlı)" value={video === "local" ? "" : video} onChange={(e) => setVideo(e.target.value.trim())} />
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={video === "local"} onChange={(e) => setVideo(e.target.checked ? "local" : "")} /> Bilgisayarımdaki video</label>
        </div>
        <button className="btn primary" onClick={save} disabled={!text.trim()}><Plus size={16} /> Kaydet ve çalış</button>
      </div>
      {rows.length > 0 && <div className="col" style={{ gap: 6 }}>
        <b>Kayıtlıların</b>
        {rows.map((r) => (
          <div key={r.id} className="card hover row between" style={{ padding: "10px 14px" }} onClick={() => go(`/medya/benim?m=${r.id}`)}>
            <div><b>{r.title}</b><div className="muted tiny">{r.lines.length} satır · {new Date(r.ts).toLocaleDateString("tr")}</div></div>
            <span className="tag">{r.kind === "subs" ? "Altyazı" : "Söz"}</span>
          </div>
        ))}
      </div>}
    </div>
  );
}

export function ytId(url: string): string | null {
  const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function parseSubs(raw: string): Line[] {
  const txt = raw.replace(/\r/g, "").replace(/^\uFEFF/, "");
  const out: Line[] = [];
  const clean = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\{[^}]*\}/g, "").replace(/^[-–]\s*/, "").replace(/\s+/g, " ").trim();
  if (/\d\d:\d\d[:.,]\d\d[.,]?\d*\s*-->/.test(txt)) { // SRT / VTT
    for (const block of txt.split(/\n\s*\n/)) {
      const ls = block.split("\n");
      const ti = ls.findIndex((l) => l.includes("-->"));
      if (ti < 0) continue;
      const m = ls[ti].match(/(?:(\d+):)?(\d\d):(\d\d)[.,](\d+)/);
      const t = m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number("0." + m[4]) : undefined;
      const en = clean(ls.slice(ti + 1).join(" "));
      if (en && /[a-z]/i.test(en)) out.push({ en, t });
    }
    return out;
  }
  for (const l of txt.split("\n")) {
    const m = l.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\](.*)$/); // LRC
    if (m) { const en = clean(m[3]); if (en) out.push({ en, t: Number(m[1]) * 60 + Number(m[2]) }); continue; }
    if (/^\s*\[[a-z]+:.*\]\s*$/i.test(l)) continue; // LRC etiketleri
    const en = clean(l);
    if (en && /[a-z]/i.test(en)) out.push({ en });
  }
  return out;
}
