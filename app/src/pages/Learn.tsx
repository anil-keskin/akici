// Öğren: üstte kategori yolları (İş, Seyahat, Sınav…), altında becerilere göre gruplanmış sade liste.
import { useEffect, useState } from "react";
import { BookOpen, GraduationCap, Quote, Library, Headphones, Mic, Theater, Sparkles, ChevronRight, Target, Clapperboard, MessageCircle } from "lucide-react";
import { TrackGrid } from "./Track";
import { db } from "../lib/db";
import { go } from "../lib/router";

type Row = [string, string, string, typeof BookOpen, string];
const GROUPS: [string, Row[]][] = [
  ["Temel", [
    ["/kelimeler", "Kelimeler", "20.000 kelime, sık kullanılandan", BookOpen, "iris"],
    ["/gramer", "Gramer", "A1 → C2 öğrenme yolu, 73 konu", GraduationCap, "mint"],
    ["/kaliplar", "Kalıplar & deyimler", "Phrasal verb, deyim, atasözü", Quote, "amber"],
  ]],
  ["Dinle & oku", [
    ["/okuma", "Okuma", "9.000+ hikâye, makale, kitap", Library, "rose"],
    ["/dinleme", "Dinleme", "Dikte, akış, hızlı dinleme", Headphones, "sky"],
    ["/medya", "Podcast, şarkı & dizi", "Otomatik döküm, çift altyazı", Clapperboard, "coral"],
  ]],
  ["Konuş", [
    ["/konusma", "Konuşma & telaffuz", "Shadowing, telaffuz puanı", Mic, "coral"],
    ["/senaryolar", "Senaryolar", "Restoran, havalimanı, mülakat…", Theater, "iris"],
    ["/sohbet", "Loki ile sohbet", "Sesli sohbet, hata düzeltme", MessageCircle, "mint"],
  ]],
  ["Ekstra", [
    ["/pratik", "Loki alıştırma", "İstediğin konu, her seferinde yeni sorular", Sparkles, "iris"],
    ["/test", "Seviye testi", "3 dakikada seviyeni bul", Target, "amber"],
  ]],
];

export default function Learn() {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => { db.progress.where("kind").equals("ai").toArray().then((r) => setDone(new Set(r.filter((p) => p.done > 0).map((p) => p.id)))); }, []);
  return (
    <div className="col" style={{ gap: 14, maxWidth: 900, margin: "0 auto" }}>
      <div className="sec-title">Kategoriler · bir yol seç</div>
      <TrackGrid done={done} />
      {GROUPS.map(([g, rows]) => (
        <div key={g} className="col" style={{ gap: 8 }}>
          <div className="sec-title" style={{ marginTop: 10 }}>{g}</div>
          <div className="list">
            {rows.map(([to, t, d, I, c]) => (
              <button key={to} onClick={() => go(to)}>
                <span className={`ico ${c}`}><I size={20} /></span>
                <span className="grow col" style={{ gap: 1 }}><b>{t}</b><span className="small muted">{d}</span></span>
                <ChevronRight size={18} color="var(--ink-3)" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
