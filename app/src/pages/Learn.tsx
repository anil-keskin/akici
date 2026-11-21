import { BookOpen, GraduationCap, Quote, Library, Headphones, Mic, Theater, Repeat, Settings, MessageCircle, Clapperboard, Compass } from "lucide-react";
import { PageHead } from "../components/ui";
import { go } from "../lib/router";

const ITEMS = [
  ["/kelimeler", "Kelimeler", "20.000 kelime", BookOpen, "iris"],
  ["/gramer", "Gramer", "A1 → C1", GraduationCap, "mint"],
  ["/kaliplar", "Kalıplar", "Phrasal verb, deyim", Quote, "amber"],
  ["/okuma", "Okuma", "8.800+ hikâye, makale, kitap", Library, "rose"],
  ["/kesfet", "Keşfet", "Gündem, tarih, bilim — her gün yeni", Compass, "sky"],
  ["/medya", "Dizi & Şarkı", "Şarkılar, replikler, diyaloglar", Clapperboard, "coral"],
  ["/dinleme", "Dinleme", "Dikte, akış", Headphones, "sky"],
  ["/konusma", "Konuşma", "Shadowing, telaffuz", Mic, "coral"],
  ["/senaryolar", "Senaryolar", "Gerçek hayat", Theater, "iris"],
  ["/tekrar", "Tekrar", "Aralıklı tekrar", Repeat, "mint"],
  ["/sohbet", "AI öğretmen", "Sohbet, düzeltme", MessageCircle, "amber"],
  ["/ayarlar", "Ayarlar", "Ses, AI, gizlilik", Settings, "sky"],
] as const;

export default function Learn() {
  return (
    <div>
      <PageHead title="Öğren" sub="Bir beceri seç." />
      <div className="grid g2 learn-grid">
        {ITEMS.map(([to, t, d, I, c]) => (
          <div key={to} className="card hover col learn-tile" style={{ gap: 8 }} onClick={() => go(to)}>
            <div className={`ico ${c}`}><I /></div><div className="h3">{t}</div><div className="muted small">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
