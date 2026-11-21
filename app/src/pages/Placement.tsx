import { useEffect, useState } from "react";
import { X, Check, HelpCircle } from "lucide-react";
import { Bar, Lv, Mascot, Spinner, confetti } from "../components/ui";
import { words, shuffle, type Level, type Word } from "../lib/data";
import { kvSet } from "../lib/db";
import { go } from "../lib/router";

// LexTALE benzeri: gerçek kelimeler + sahte kelimeler. Sahteye "biliyorum" demek puanı düşürür (tahmin cezası).
const FAKE = ["plinder", "crumbish", "mernate", "sprindle", "obvert", "flodium", "grastic", "brantle", "skerple", "wimbrous", "proctile", "dworth",
  "fenstral", "calmorous", "trubble", "ploath", "nestify", "gundrel", "mabble", "sorvent", "blattive", "rendle", "quorbish", "tarnicle"];
const BANDS = [[1, 500], [500, 1000], [1000, 2000], [2000, 3500], [3500, 5000], [5000, 7500], [7500, 10000], [10000, 14000], [14000, 20000]] as const;

interface Q { w: string; real: boolean; band: number; tr?: string }

export default function Placement() {
  const [qs, setQs] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<boolean[]>([]);
  useEffect(() => {
    words().then((ws: Word[]) => {
      const real: Q[] = BANDS.flatMap(([a, b], bi) => shuffle(ws.slice(a, b).filter((w) => w.tr.length && w.w.length > 2)).slice(0, 6).map((w) => ({ w: w.w, real: true, band: bi, tr: w.tr[0] })));
      const fake: Q[] = shuffle(FAKE).slice(0, 14).map((w) => ({ w, real: false, band: -1 }));
      setQs(shuffle([...real, ...fake]));
    });
  }, []);
  if (!qs) return <Spinner />;
  if (i >= qs.length) {
    const realQ = qs.map((q, k) => ({ q, a: ans[k] })).filter((x) => x.q.real);
    const fakeYes = qs.filter((q, k) => !q.real && ans[k]).length / qs.filter((q) => !q.real).length;
    let vocab = 0;
    BANDS.forEach(([a, b], bi) => {
      const inBand = realQ.filter((x) => x.q.band === bi);
      const yes = inBand.filter((x) => x.a).length / Math.max(1, inBand.length);
      vocab += Math.max(0, yes - fakeYes) / Math.max(0.0001, 1 - fakeYes) * (b - a);
    });
    vocab = Math.round(vocab / 50) * 50;
    const lv: Level = vocab < 700 ? "A1" : vocab < 1600 ? "A2" : vocab < 3500 ? "B1" : vocab < 6500 ? "B2" : vocab < 11000 ? "C1" : "C2";
    return (
      <div className="ex-wrap col pop" style={{ alignItems: "center", textAlign: "center", gap: 16, paddingTop: 30 }}>
        <Mascot size={120} mood="wow" />
        <div className="muted">Tahmini kelime dağarcığın</div>
        <div className="display" style={{ fontSize: 64, fontWeight: 700 }}>~{vocab.toLocaleString("tr")}</div>
        <div className="row"><span>Önerilen seviye</span><Lv lv={lv} /></div>
        {fakeYes > 0.3 && <div className="card small" style={{ background: "var(--amber-soft)" }}>Uydurma kelimelerin bir kısmına "biliyorum" dedin; sonuç biraz düşürüldü. Emin olmadıklarına "bilmiyorum" de.</div>}
        <button className="btn primary big" onClick={async () => { await kvSet("level", lv); await kvSet("vocabEstimate", vocab); confetti(); go("/"); }}>Seviyemi {lv} yap ve başla</button>
        <button className="btn ghost" onClick={() => go("/")}>Kapat</button>
      </div>
    );
  }
  const q = qs[i];
  const answer = (v: boolean) => { setAns([...ans, v]); setI(i + 1); };
  return (
    <div className="ex-wrap col" style={{ gap: 22 }}>
      <div className="ex-top"><button className="btn icon" aria-label="Çık" onClick={() => go("/")}><X /></button><Bar value={i / qs.length} /><span className="muted small">{i + 1}/{qs.length}</span></div>
      <div className="muted" style={{ textAlign: "center" }}>Bu İngilizce kelimeyi biliyor musun? <HelpCircle size={14} /> Bazıları uydurma!</div>
      <div className="prompt-word" key={i}>{q.w}</div>
      <div className="grid g2">
        <button className="btn ghost big" onClick={() => answer(false)}><X /> Bilmiyorum</button>
        <button className="btn primary big" onClick={() => answer(true)}><Check /> Biliyorum</button>
      </div>
    </div>
  );
}
