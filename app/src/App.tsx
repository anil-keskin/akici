import { motion } from "motion/react";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import {
  Home as HomeI, BookOpen, Repeat, GraduationCap, Quote, Headphones, Mic, BookMarked, Theater, MessageCircle,
  BarChart3, Settings as SetI, LayoutGrid, Library, Clapperboard, Compass, ChevronLeft, ChevronRight, Dices, Sparkles,
} from "lucide-react";
import { back, go, useRoute } from "./lib/router";
import { SelectTranslate } from "./components/SelectTranslate";
import { Mascot, Spinner, ToastHost, ConfettiHost, toast, confetti } from "./components/ui";
import { haptic } from "./components/fx";
import { kvGet } from "./lib/db";

type PageMod = { default: ComponentType<{ id?: string; params: URLSearchParams }> };
// Yeni sürüm yayınlanınca eski sayfa parçaları silinir; yüklenemezse sayfayı bir kez yenile.
const P = (f: () => Promise<PageMod>) => lazy(() => f().catch((e) => {
  if (!sessionStorage.getItem("akici-reloaded")) { sessionStorage.setItem("akici-reloaded", "1"); location.reload(); }
  throw e;
}));
window.addEventListener("akici-levelup", (e) => toast(`🎉 Seviye atladın: Seviye ${(e as CustomEvent).detail}!`));
window.addEventListener("vite:preloadError", () => { if (!sessionStorage.getItem("akici-reloaded")) { sessionStorage.setItem("akici-reloaded", "1"); location.reload(); } });
setTimeout(() => { try { sessionStorage.removeItem("akici-reloaded"); } catch { /* yok */ } }, 10000);
const pages: Record<string, ReturnType<typeof P>> = {
  "/": P(() => import("./pages/Home")),
  "/ders": P(() => import("./pages/Session")),
  "/kelimeler": P(() => import("./pages/Words")),
  "/tekrar": P(() => import("./pages/Review")),
  "/gramer": P(() => import("./pages/Grammar")),
  "/kaliplar": P(() => import("./pages/Phrases")),
  "/dinleme": P(() => import("./pages/Listening")),
  "/konusma": P(() => import("./pages/Speaking")),
  "/okuma": P(() => import("./pages/Reading")),
  "/medya": P(() => import("./pages/Media")),
  "/kesfet": P(() => import("./pages/Explore")),
  "/rastgele": P(() => import("./pages/Random")),
  "/pratik": P(() => import("./pages/AIPractice")),
  "/yol": P(() => import("./pages/Track")),
  "/oyun": P(() => import("./pages/Games")),
  "/senaryolar": P(() => import("./pages/Scenarios")),
  "/sohbet": P(() => import("./pages/Chat")),
  "/ilerleme": P(() => import("./pages/Progress")),
  "/ayarlar": P(() => import("./pages/Settings")),
  "/ogren": P(() => import("./pages/Learn")),
  "/test": P(() => import("./pages/Placement")),
  "/basla": P(() => import("./pages/Onboarding")),
};

const NAV = [
  { sec: "Bugün" },
  { to: "/", label: "Ana sayfa", icon: HomeI },
  { to: "/tekrar", label: "Tekrar", icon: Repeat },
  { sec: "Öğren" },
  { to: "/ogren", label: "Kategoriler", icon: LayoutGrid },
  { to: "/kelimeler", label: "Kelimeler", icon: BookOpen },
  { to: "/gramer", label: "Gramer", icon: GraduationCap },
  { to: "/kaliplar", label: "Kalıplar & deyimler", icon: Quote },
  { to: "/okuma", label: "Okuma", icon: Library },
  { to: "/dinleme", label: "Dinleme", icon: Headphones },
  { sec: "Konuş" },
  { to: "/sohbet", label: "Loki ile sohbet", icon: MessageCircle },
  { to: "/konusma", label: "Konuşma & telaffuz", icon: Mic },
  { to: "/senaryolar", label: "Senaryolar", icon: Theater },
  { sec: "Keşfet" },
  { to: "/kesfet", label: "Keşfet", icon: Compass },
  { to: "/oyun", label: "Oyunlar", icon: Sparkles },
  { to: "/medya", label: "Podcast, şarkı & dizi", icon: Clapperboard },
  { to: "/rastgele", label: "Rastgele", icon: Dices },
  { sec: "Sen" },
  { to: "/ilerleme", label: "İlerleme", icon: BarChart3 },
  { to: "/ayarlar", label: "Ayarlar", icon: SetI },
] as const;
const TITLES: Record<string, string> = Object.fromEntries([
  ...NAV.filter((n) => "to" in n).map((n) => [(n as { to: string }).to, (n as { label: string }).label]),
  ["/ogren", "Öğren"], ["/test", "Seviye testi"], ["/yol", "Kategori"], ["/pratik", "Loki alıştırma"], ["/oyun", "Oyunlar"],
]);
const DISCOVER: [string, string][] = [["/kesfet", "Oku"], ["/oyun", "Oyunlar"], ["/medya", "İzle"], ["/rastgele", "Rastgele"]];
const TABS = [
  { to: "/", label: "Bugün", icon: HomeI, match: ["/", "/ders", "/tekrar"] },
  { to: "/ogren", label: "Öğren", icon: LayoutGrid, match: ["/ogren", "/yol", "/pratik", "/kelimeler", "/gramer", "/kaliplar", "/okuma", "/konusma", "/dinleme", "/senaryolar"] },
  { to: "/kesfet", label: "Keşfet", icon: Compass, match: ["/kesfet", "/oyun", "/medya", "/rastgele"] },
  { to: "/sohbet", label: "Loki", icon: MessageCircle, match: ["/sohbet"] },
  { to: "/ilerleme", label: "Sen", icon: BarChart3, match: ["/ilerleme", "/ayarlar", "/test"] },
];

export default function App() {
  const { path, params } = useRoute();
  const base = "/" + (path.split("/")[1] || "");
  const id = path.split("/")[2];
  const focus = base === "/ders" || base === "/basla" || (base === "/test");
  // İlk açılışta tanıtım ekranı: karar, veritabanından okunduktan SONRA verilir (yarış durumu olmasın).
  useEffect(() => {
    // Bulut yedeği açıksa: başka cihazdaki yeni ilerlemeyi getir, sonra düzenli yedekle
    import("./lib/sync").then((m) => m.startAutoSync());
    const onGoal = () => { confetti(); haptic("win"); toast("🎉 Günlük hedef tamam! Loki seninle gurur duyuyor."); };
    window.addEventListener("akici-goal", onGoal);
    const onSynced = () => location.reload();
    window.addEventListener("lokilingo-synced", onSynced);
    return () => { window.removeEventListener("lokilingo-synced", onSynced); window.removeEventListener("akici-goal", onGoal); };
  }, []);
  useEffect(() => {
    kvGet("onboarded", false).then((v) => { if (!v && base !== "/basla" && base !== "/ayarlar" && base !== "/test") go("/basla"); });
  }, [base]);
  const Page = pages[base] || pages["/"];
  return (
    <div className={focus ? "" : "shell"}>
      {!focus && (
        <aside className="side">
          <a className="brand" href="#/"><Mascot size={38} /><b>Lokilingo</b></a>
          {NAV.map((n, i) => "sec" in n
            ? <div key={i} className="nav-sec">{n.sec}</div>
            : <a key={n.to} href={`#${n.to}`} className={`nav-item ${base === n.to ? "on" : ""}`}><n.icon size={19} />{n.label}</a>)}
          <div style={{ flex: 1 }} />
          <a href="#/ders" className="btn primary block" style={{ marginTop: 16 }}><BookMarked size={18} /> Günün dersi</a>
        </aside>
      )}
      <main className={focus ? "" : "main"} style={focus ? { padding: "18px 16px 40px" } : undefined}>
        {!focus && base !== "/" && (
          <div className="topbar">
            <button className="btn icon" aria-label="Geri" onClick={() => back(id ? base : "/")}><ChevronLeft size={22} /></button>
            <b className="topbar-title">{TITLES[base] || "Lokilingo"}</b>
            <button className="btn icon" aria-label="İleri" onClick={() => history.forward()}><ChevronRight size={22} /></button>
          </div>
        )}
        <div className="page">
          {DISCOVER.some(([to]) => to === base) && (
            <div className="seg" role="tablist" aria-label="Keşfet bölümleri">
              {DISCOVER.map(([to, l]) => <button key={to} role="tab" aria-selected={base === to} className={base === to ? "on" : ""} onClick={() => go(to)}>{l}</button>)}
            </div>
          )}
          <Suspense fallback={<Spinner />}>
            <motion.div key={base + (id || "")} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
              <Page id={id} params={params} />
            </motion.div>
          </Suspense>
        </div>
      </main>
      {!focus && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <a key={t.to} href={`#${t.to}`} className={`tab ${t.match.includes(base) ? "on" : ""}`}>
              {t.match.includes(base) && <motion.span layoutId="tabpill" className="tab-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <motion.span key={t.match.includes(base) ? "on" : "off"} className="tab-ico" initial={t.match.includes(base) ? { scale: 0.6, y: 4 } : false} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}><t.icon size={22} /></motion.span>
              {t.label}
            </a>
          ))}
        </nav>
      )}
      <ToastHost />
      <SelectTranslate />
      <ConfettiHost />
    </div>
  );
}
