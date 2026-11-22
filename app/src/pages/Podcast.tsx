// Podcast + şarkı sözü arama. İstediğin podcast'i ara → bölüm seç → otomatik transkript (Whisper) → çift altyazıyla dinle.
// Şarkı: sözü ara (lrclib, zaman damgalı) → YouTube videosuyla akan söz + Türkçe çeviri. Kayıtlar sadece bu cihazda (IndexedDB).
import { useEffect, useState } from "react";
import { Search, ArrowLeft, Music, Loader2, Clock } from "lucide-react";
import { Spinner, toast } from "../components/ui";
import { AKICI_AI } from "../lib/ai";
import { db } from "../lib/db";
import { go } from "../lib/router";
import { usePersist } from "../lib/persist";

interface Show { id: number | string; title: string; author: string; art?: string; feed: string; n?: number; genre?: string }
interface Ep { title: string; audio: string; date: string; dur: number; desc: string; img?: string }

const PICKS = ["6 Minute English", "VOA Learning English", "All Ears English", "Luke's English Podcast", "English Learning for Curious Minds", "Easy Stories in English", "TED Talks Daily", "The Daily", "Stuff You Should Know", "Kids short stories"];

function dev() { try { return localStorage.getItem("akici-device") || "anon"; } catch { return "anon"; } }
const mins = (s: number) => (s ? `${Math.round(s / 60)} dk` : "");
const https = (u?: string) => (u || "").replace(/^http:\/\//, "https://");

async function searchShows(q: string): Promise<Show[]> {
  // Önce Apple'a doğrudan (kendi IP'nden, hızlı); olmazsa Loki sunucusu üzerinden yedek dizin
  try {
    const r = await fetch(`https://itunes.apple.com/search?media=podcast&limit=25&term=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = await r.json();
      const items = (d.results || []).filter((x: { feedUrl?: string }) => x.feedUrl).map((x: Record<string, string | number>) => ({ id: x.collectionId, title: x.collectionName, author: x.artistName, art: x.artworkUrl600 || x.artworkUrl100, feed: x.feedUrl, n: x.trackCount, genre: x.primaryGenreName }));
      if (items.length) return items;
    }
  } catch { /* yedeğe geç */ }
  const r = await fetch(`${AKICI_AI}/pod/search?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Arama yapılamadı");
  return d.items;
}

export function Podcasts({ feed, title }: { feed: string | null; title: string }) {
  const [q, setQ] = usePersist<string>("pod.q", "");
  const [res, setRes] = useState<Show[] | null>([]);
  const [msg, setMsg] = useState("");
  const search = async (term: string) => {
    setQ(term); setMsg(""); setRes(null);
    try { setRes(await searchShows(term)); } catch (e) { setMsg((e as Error).message); setRes([]); }
  };
  useEffect(() => { if (!feed) search(q || PICKS[0]); }, [feed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (feed) return <Episodes feed={feed} title={title} />;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card small" style={{ background: "var(--iris-soft)" }}>
        🎧 <b>İstediğin podcast'i ara</b>, bir bölüm seç: Loki konuşmayı otomatik yazıya döker. Dinlerken o anki cümle <b>İngilizce + Türkçe</b> görünür, kelimeye dokunup anlamına bakarsın.
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) search(q.trim()); }}>
        <input className="input" placeholder="Podcast ara (ör. BBC, TED, history, football…)" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" aria-label="Ara"><Search size={18} /></button>
      </form>
      <div className="scroll-x">{PICKS.map((x) => <button key={x} className={`chip ${q === x ? "on" : ""}`} onClick={() => search(x)}>{x}</button>)}</div>
      {msg && <div className="card small" style={{ background: "var(--amber-soft)" }}>{msg}</div>}
      {res === null ? <Spinner label=" Aranıyor…" /> : (
        <div className="grid g3">
          {res.map((x) => (
            <div key={x.feed} className="card hover row" style={{ gap: 10, padding: 10, alignItems: "flex-start" }} onClick={() => go(`/medya/podcast?f=${encodeURIComponent(x.feed)}&t=${encodeURIComponent(x.title.slice(0, 80))}`)}>
              {x.art && <img src={https(x.art)} alt="" referrerPolicy="no-referrer" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", flex: "none" }} />}
              <div style={{ minWidth: 0 }}>
                <b className="small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{x.title}</b>
                <div className="muted tiny">{x.author}{x.n ? ` · ${x.n} bölüm` : ""}</div>
              </div>
            </div>
          ))}
          {res.length === 0 && !msg && <div className="muted small">Sonuç yok. Başka bir kelime dene.</div>}
        </div>
      )}
    </div>
  );
}

function Episodes({ feed, title }: { feed: string; title: string }) {
  const [d, setD] = useState<{ title: string; img: string; items: Ep[] } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch(`${AKICI_AI}/pod/feed?url=${encodeURIComponent(feed)}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Bölümler alınamadı"); setD(j); }).catch((e) => setErr(e.message));
    db.media.toArray().then((rows) => { const m: Record<string, number> = {}; rows.forEach((r) => { if (r.audio) m[r.audio] = r.id!; }); setDone(m); });
  }, [feed]);
  const open = async (e: Ep) => {
    const audio = e.audio;
    if (done[audio]) { go(`/medya/benim?m=${done[audio]}`); return; }
    setBusy(e.audio);
    try {
      const r = await fetch(`${AKICI_AI}/pod/transcript`, { method: "POST", headers: { "Content-Type": "application/json", "X-Akici-Device": dev() }, body: JSON.stringify({ audio: e.audio }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Döküm yapılamadı");
      if (!j.lines?.length) throw new Error("Bu bölümde konuşma bulunamadı");
      const id = await db.media.add({ title: e.title.slice(0, 120), kind: "subs", lines: j.lines, audio, sub: `${d?.title || title} · ${mins(e.dur)}`, src: "podcast", ts: Date.now() });
      go(`/medya/benim?m=${id}`);
    } catch (x) { toast((x as Error).message); }
    setBusy(null);
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => go("/medya/podcast")}><ArrowLeft size={16} /> Podcast ara</button>
      <div className="row" style={{ gap: 12 }}>
        {d?.img && <img src={https(d.img)} alt="" referrerPolicy="no-referrer" style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover" }} />}
        <h2 className="h2">{d?.title || title}</h2>
      </div>
      {err && <div className="card small" style={{ background: "var(--amber-soft)" }}>{err}</div>}
      {!d && !err && <Spinner label=" Bölümler getiriliyor…" />}
      {d && <div className="muted tiny">Bölüme dokun → yazıya dökülür (ilk seferde ~5-30 sn; sonra anında açılır). Kısa bölümler (5-30 dk) öğrenmeye en uygunu.</div>}
      {d?.items.map((e) => (
        <div key={e.audio} className="card hover col" style={{ gap: 4, padding: "10px 14px", opacity: busy && busy !== e.audio ? 0.5 : 1 }} onClick={() => !busy && open(e)}>
          <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
            <b className="small">{e.title}</b>
            {busy === e.audio ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite", flex: "none" }} /> : done[e.audio] ? <span className="tag" style={{ flex: "none" }}>Hazır ✓</span> : null}
          </div>
          <div className="muted tiny row" style={{ gap: 6 }}>{e.dur > 0 && <><Clock size={12} /> {mins(e.dur)} ·</>} {e.date ? new Date(e.date).toLocaleDateString("tr") : ""}</div>
          {busy === e.audio && <div className="small" style={{ color: "var(--iris)", fontWeight: 700 }}>Yazıya dökülüyor… (uzun bölümde 30 sn sürebilir)</div>}
          {e.desc && <div className="muted tiny" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.desc}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------- Şarkı sözü arama (lrclib) ---------- */
interface Lyric { id: number; title: string; artist: string; album: string; dur: number; synced: string; plain: string }
const SONG_PICKS = ["Ed Sheeran Perfect", "Adele Someone Like You", "Coldplay Yellow", "Imagine Dragons Believer", "Taylor Swift Love Story", "Bruno Mars Just the Way You Are", "Queen Bohemian Rhapsody", "Billie Eilish Ocean Eyes"];

function lrcLines(synced: string, plain: string) {
  if (synced) {
    const out: { t: number; en: string }[] = [];
    for (const row of synced.split("\n")) {
      const m = row.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
      if (m && m[3].trim()) out.push({ t: Math.round((+m[1] * 60 + +m[2]) * 10) / 10, en: m[3].trim() });
    }
    if (out.length) return out;
  }
  return plain.split("\n").map((x) => x.trim()).filter(Boolean).map((en) => ({ en }));
}

export function SongSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Lyric[] | null>([]);
  const [msg, setMsg] = useState("");
  const search = async (term: string) => {
    setQ(term); setMsg(""); setRes(null);
    try {
      const r = await fetch(`${AKICI_AI}/lyrics?q=${encodeURIComponent(term)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Arama yapılamadı");
      setRes(d.items);
    } catch (e) { setMsg((e as Error).message); setRes([]); }
  };
  const open = async (x: Lyric) => {
    const lines = lrcLines(x.synced, x.plain);
    if (lines.length < 2) { toast("Bu şarkının sözü yok"); return; }
    const title = (x.title.toLowerCase().includes(x.artist.toLowerCase()) ? x.title : `${x.artist} – ${x.title}`).slice(0, 120);
    const old = await db.media.filter((r) => r.src === "song" && r.title === title).first();
    if (old) { go(`/medya/benim?m=${old.id}`); return; }
    let video: string | undefined;
    // YouTube arama anahtarı kuruluysa videoyu kendiliğinden bul
    try {
      const r = await fetch(`${AKICI_AI}/yt?q=${encodeURIComponent(`${x.artist} ${x.title} lyrics`)}`);
      if (r.ok) { const d = await r.json(); if (d.items?.[0]?.id) video = `https://youtu.be/${d.items[0].id}`; }
    } catch { /* elle eklenir */ }
    const id = await db.media.add({ title, kind: "lyrics", lines: lines.slice(0, 400), video, sub: x.album ? `Albüm: ${x.album}` : "Şarkı sözü", src: "song", ts: Date.now() });
    go(`/medya/benim?m=${id}`);
  };
  return (
    <div className="col" style={{ gap: 10, marginBottom: 18 }}>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) search(q.trim()); }}>
        <input className="input" placeholder="Herhangi bir şarkıyı ara (şarkıcı + şarkı adı)…" value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" aria-label="Ara"><Search size={18} /></button>
      </form>
      <div className="scroll-x">{SONG_PICKS.map((x) => <button key={x} className="chip" onClick={() => search(x)}><Music size={13} /> {x}</button>)}</div>
      {msg && <div className="card small" style={{ background: "var(--amber-soft)" }}>{msg}</div>}
      {res === null && <Spinner label=" Sözler aranıyor…" />}
      {res && res.length > 0 && <div className="col" style={{ gap: 6 }}>
        {res.map((x) => (
          <div key={x.id} className="card hover row between" style={{ padding: "10px 14px", gap: 8 }} onClick={() => open(x)}>
            <div style={{ minWidth: 0 }}><b className="small">{x.title}</b><div className="muted tiny">{x.artist}{x.album ? ` · ${x.album}` : ""}</div></div>
            <span className="tag" style={{ flex: "none" }}>{x.synced ? "Akan söz ✓" : "Söz"}</span>
          </div>
        ))}
      </div>}
      {res && res.length === 0 && q && !msg && <div className="muted small">Bulunamadı. Şarkıcı ve şarkı adını birlikte yaz.</div>}
    </div>
  );
}

