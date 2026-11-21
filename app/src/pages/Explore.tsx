// Keşfet: her gün yeni, gerçek İngilizce içerik. Vikipedi'nin günlük akışı (CC BY-SA) + yapay zekânın seviyene göre yazdığı yazılar.
import { useEffect, useState } from "react";
import { Compass, RefreshCw, ArrowLeft, Sparkles, Wand2 } from "lucide-react";
import { Lv, PageHead, Spinner, toast } from "../components/ui";
import { TapText } from "../components/TapText";
import { kvGet } from "../lib/db";
import { aiJson } from "../lib/ai";
import { addStat } from "../lib/stats";

interface Item { id: string; cat: string; title: string; paras: string[]; img?: string; src?: string; ai?: boolean }

const WIKI_CATS = [
  { k: "news", label: "📰 Gündem" },
  { k: "onthisday", label: "📅 Bugün tarihte" },
  { k: "dyk", label: "💡 Biliyor muydun?" },
  { k: "read", label: "🔥 Çok okunanlar" },
  { k: "random", label: "🎲 Rastgele bilgi" },
];
const AI_CATS = [
  { k: "science", label: "🔬 Bilim", en: "science (a surprising discovery or how something works)" },
  { k: "history", label: "🏛️ Tarih", en: "history (a fascinating event, person or ancient civilisation)" },
  { k: "tech", label: "💻 Teknoloji", en: "technology (an invention, gadget or how the internet works)" },
  { k: "nature", label: "🌿 Doğa & hayvanlar", en: "nature and animals (an amazing animal or natural wonder)" },
  { k: "space", label: "🚀 Uzay", en: "space and astronomy" },
  { k: "health", label: "🧠 Sağlık & psikoloji", en: "health, sleep, habits or psychology (general, non-medical advice)" },
  { k: "travel", label: "✈️ Seyahat & kültür", en: "travel and world cultures (a city, festival or tradition)" },
  { k: "food", label: "🍜 Yemek", en: "food and cooking around the world" },
  { k: "sport", label: "⚽ Spor", en: "sports (history of a sport, a famous match or record)" },
  { k: "money", label: "💼 İş & para", en: "business, famous companies or how money works (no financial advice)" },
  { k: "life", label: "😄 Günlük hayat", en: "everyday life situations with useful expressions" },
];
const strip = (h: string) => h.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const cache = new Map<string, Item[]>();

async function wikiFeed(): Promise<Record<string, Item[]>> {
  const d = new Date(); const ds = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${ds}`);
  if (!r.ok) throw new Error("Vikipedi akışı alınamadı");
  const f = await r.json();
  type Page = { title?: string; normalizedtitle?: string; extract?: string; thumbnail?: { source: string }; titles?: { normalized: string } };
  const pg = (p: Page) => ({ title: p.titles?.normalized || p.normalizedtitle || p.title || "", extract: p.extract || "", img: p.thumbnail?.source });
  const out: Record<string, Item[]> = { news: [], onthisday: [], dyk: [], read: [] };
  (f.news || []).forEach((n: { story: string; links: Page[] }, i: number) => {
    const p = pg(n.links?.[0] || {});
    out.news.push({ id: "n" + i, cat: "news", title: strip(n.story).slice(0, 90), paras: [strip(n.story), p.extract].filter(Boolean), img: p.img, src: "Wikipedia · In the news" });
  });
  (f.onthisday || []).forEach((n: { year: number; text: string; pages: Page[] }, i: number) => {
    const p = pg(n.pages?.[0] || {});
    out.onthisday.push({ id: "o" + i, cat: "onthisday", title: `${n.year}: ${n.text.slice(0, 80)}`, paras: [`In ${n.year}, ${n.text}`, p.extract].filter(Boolean), img: p.img, src: "Wikipedia · On this day" });
  });
  (f.dyk || []).forEach((n: { html?: string; text?: string }, i: number) => {
    const t = strip(n.html || n.text || "");
    if (t) out.dyk.push({ id: "d" + i, cat: "dyk", title: t.replace(/^\.\.\.\s*/, "…").slice(0, 90), paras: ["Did you know " + t.replace(/^\.\.\.\s*(that\s*)?/, "that ")], src: "Wikipedia · Did you know" });
  });
  if (f.tfa) { const p = pg(f.tfa); out.read.push({ id: "tfa", cat: "read", title: "⭐ " + p.title, paras: [p.extract], img: p.img, src: "Wikipedia · Today's featured article" }); }
  (f.mostread?.articles || []).slice(0, 25).forEach((a: Page, i: number) => {
    const p = pg(a); if (p.extract && !/^(Main Page|Special:)/.test(p.title)) out.read.push({ id: "m" + i, cat: "read", title: p.title, paras: [p.extract], img: p.img, src: "Wikipedia · Most read" });
  });
  return out;
}

async function randomWiki(n = 8): Promise<Item[]> {
  const res = await Promise.all(Array.from({ length: n }, () => fetch("https://simple.wikipedia.org/api/rest_v1/page/random/summary").then((r) => r.json()).catch(() => null)));
  return res.filter((x) => x?.extract && x.extract.length > 120).map((x, i) => ({
    id: "r" + Date.now() + i, cat: "random", title: x.titles?.normalized || x.title, paras: [x.extract], img: x.thumbnail?.source, src: "Simple English Wikipedia",
  }));
}

export default function Explore({ id }: { id?: string; params: URLSearchParams }) {
  const [cat, setCat] = useState(id || "news");
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Item | null>(null);
  const [lv, setLv] = useState("A2");
  const [busy, setBusy] = useState(false);
  useEffect(() => { kvGet("level", "A2").then(setLv); }, []);

  const loadCat = async (c: string, fresh = false) => {
    setCat(c); setErr(""); setOpen(null);
    if (!fresh && cache.has(c)) { setItems(cache.get(c)!); return; }
    setItems(null);
    try {
      if (c === "random") { const r = await randomWiki(); cache.set(c, r); setItems(r); return; }
      if (WIKI_CATS.some((w) => w.k === c)) { const f = await wikiFeed(); for (const k in f) cache.set(k, f[k]); setItems(f[c] || []); return; }
      setItems(cache.get(c) || []);
      if (!cache.get(c)?.length) await aiNew(c);
    } catch (e) { setErr((e as Error).message); setItems([]); }
  };
  useEffect(() => { loadCat(cat); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aiNew = async (c: string) => {
    const meta = AI_CATS.find((a) => a.k === c)!;
    setBusy(true); setErr("");
    try {
      const seen = (cache.get(c) || []).map((x) => x.title).join("; ");
      const d = await aiJson<{ title: string; paras: string[] }>(
        "You write short, accurate, engaging reading texts for English learners. Facts must be true and well-known. No violence, politics or medical advice. Return ONLY JSON.",
        `Write an article for a CEFR ${lv} learner about one specific, interesting topic in ${meta.en}. Pick a different topic each time${seen ? ` (not: ${seen})` : ""}. Use vocabulary and grammar suitable for ${lv}. 4 paragraphs, 40-80 words each. Return JSON: {"title": "...", "paras": ["...", "...", "...", "..."]}`,
      );
      const paras = (d.paras || []).map((p) => String(p).trim()).filter((p) => p.length > 30);
      if (!d.title || paras.length < 2) throw new Error("Yazı oluşturulamadı, tekrar dene.");
      const it: Item = { id: "ai" + Date.now(), cat: c, title: String(d.title).slice(0, 100), paras, ai: true, src: "Loki AI · " + lv };
      const list = [it, ...(cache.get(c) || [])];
      cache.set(c, list); setItems(list); setOpen(it);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  const simplify = async (it: Item) => {
    setBusy(true);
    try {
      const d = await aiJson<{ paras: string[] }>("You rewrite texts for English learners. Keep facts exactly. Return ONLY JSON.",
        `Rewrite this text for a CEFR ${lv} learner, simple and clear, 2-4 short paragraphs. Return JSON {"paras": ["..."]}\n\n${it.paras.join("\n\n").slice(0, 3000)}`);
      const paras = (d.paras || []).map(String).filter((p) => p.length > 20);
      if (!paras.length) throw new Error("Sadeleştirilemedi");
      setOpen({ ...it, paras, src: (it.src || "") + ` · ${lv} seviyesine sadeleştirildi` });
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };

  if (open) return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 14 }}>
        <button className="btn ghost sm" onClick={() => setOpen(null)}><ArrowLeft size={16} /> Liste</button>
        <div className="row" style={{ gap: 6 }}>
          {!open.ai && <button className="btn sm" disabled={busy} onClick={() => simplify(open)}><Wand2 size={15} /> {busy ? "Sadeleştiriliyor…" : `${lv} seviyesine sadeleştir`}</button>}
          {open.ai && <Lv lv={lv} />}
        </div>
      </div>
      {open.img && <img src={open.img} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 18, marginBottom: 14 }} referrerPolicy="no-referrer" />}
      <h2 className="h2" style={{ marginBottom: 14 }}>{open.title}</h2>
      <TapText key={open.id + open.paras.length} paras={open.paras} />
      <div className="row between wrap" style={{ marginTop: 10 }}>
        <span className="muted tiny">{open.src}{open.ai ? " · Yapay zekâ yazdı; bilgiler hatalı olabilir." : " · CC BY-SA 4.0"}</span>
        <button className="btn mint" onClick={() => { addStat({ xp: 10 }); toast("Okudun! +10 XP"); setOpen(null); }}>Okudum ✓</button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHead title="Keşfet" sub="Her gün yeni içerik: gündem, tarih, bilim… Kelimeye dokun, cümleyi çevir, seviyene sadeleştir." icon={<div className="ico sky"><Compass /></div>} />
      <div className="muted tiny" style={{ marginBottom: 6 }}>GERÇEK İÇERİK (Vikipedi, her gün yenilenir)</div>
      <div className="scroll-x" style={{ marginBottom: 10 }}>
        {WIKI_CATS.map((c) => <button key={c.k} className={`chip ${cat === c.k ? "on" : ""}`} onClick={() => loadCat(c.k)}>{c.label}</button>)}
      </div>
      <div className="muted tiny" style={{ marginBottom: 6 }}>LOKİ SENİN İÇİN YAZSIN (seviyene göre)</div>
      <div className="scroll-x" style={{ marginBottom: 16 }}>
        {AI_CATS.map((c) => <button key={c.k} className={`chip ${cat === c.k ? "on" : ""}`} onClick={() => loadCat(c.k)}>{c.label}</button>)}
      </div>
      {AI_CATS.some((a) => a.k === cat) && (
        <button className="btn primary block" disabled={busy} onClick={() => aiNew(cat)} style={{ marginBottom: 14 }}>
          <Sparkles size={17} /> {busy ? "Loki yazıyor…" : "Yeni yazı getir"}
        </button>
      )}
      {cat === "random" && <button className="btn block" onClick={() => loadCat("random", true)} style={{ marginBottom: 14 }}><RefreshCw size={16} /> Başka rastgele bilgiler</button>}
      {err && <div className="card small" style={{ background: "var(--coral-soft)", marginBottom: 12 }}>{err}</div>}
      {items === null ? <Spinner label=" İçerik getiriliyor…" /> : (
        <div className="grid g2">
          {items.map((it) => (
            <div key={it.id} className="card hover row" style={{ gap: 12, alignItems: "flex-start" }} onClick={() => setOpen(it)}>
              {it.img && <img src={it.img} alt="" referrerPolicy="no-referrer" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 12, flex: "none" }} />}
              <div className="grow" style={{ minWidth: 0 }}>
                <b style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.title}</b>
                <div className="muted small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 4 }}>{it.paras[it.paras.length > 1 ? 1 : 0]}</div>
              </div>
            </div>
          ))}
          {!items.length && !busy && !err && <div className="card muted">Burada henüz içerik yok.</div>}
        </div>
      )}
      <p className="muted tiny" style={{ marginTop: 20 }}>Vikipedi içerikleri CC BY-SA 4.0 lisanslıdır. Yapay zekâ yazıları Loki AI ile üretilir.</p>
    </div>
  );
}
