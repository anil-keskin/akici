import { lazy, Suspense, useEffect, type ComponentType } from "react";
import {
  Home as HomeI, BookOpen, Repeat, GraduationCap, Quote, Headphones, Mic, BookMarked, Theater, MessageCircle,
  BarChart3, Settings as SetI, LayoutGrid, Library, Clapperboard, Compass, ChevronLeft, ChevronRight,
} from "lucide-react";
import { back, go, useRoute } from "./lib/router";
import { Mascot, Spinner, ToastHost, ConfettiHost, toast } from "./components/ui";
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
  { to: "/kelimeler", label: "Kelimeler", icon: BookOpen },
  { to: "/gramer", label: "Gramer", icon: GraduationCap },
  { to: "/kaliplar", label: "Kalıplar & deyimler", icon: Quote },
  { to: "/okuma", label: "Okuma", icon: Library },
  { to: "/medya", label: "Dizi & Şarkı", icon: Clapperboard },
  { to: "/kesfet", label: "Keşfet", icon: Compass },
  { sec: "Pratik" },
  { to: "/dinleme", label: "Dinleme", icon: Headphones },
  { to: "/konusma", label: "Konuşma & telaffuz", icon: Mic },
  { to: "/senaryolar", label: "Senaryolar", icon: Theater },
  { to: "/sohbet", label: "AI öğretmen", icon: MessageCircle },
  { sec: "Sen" },
  { to: "/ilerleme", label: "İlerleme", icon: BarChart3 },
  { to: "/ayarlar", label: "Ayarlar", icon: SetI },
] as const;
const TITLES: Record<string, string> = Object.fromEntries([
  ...NAV.filter((n) => "to" in n).map((n) => [(n as { to: string }).to, (n as { label: string }).label]),
  ["/ogren", "Öğren"], ["/test", "Seviye testi"],
]);
const TABS = [
  { to: "/", label: "Bugün", icon: HomeI, match: ["/", "/ders", "/tekrar"] },
  { to: "/ogren", label: "Öğren", icon: LayoutGrid, match: ["/ogren", "/kelimeler", "/gramer", "/kaliplar", "/okuma", "/medya", "/konusma", "/dinleme", "/senaryolar"] },
  { to: "/kesfet", label: "Keşfet", icon: Compass, match: ["/kesfet"] },
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
    const onSynced = () => location.reload();
    window.addEventListener("lokilingo-synced", onSynced);
    return () => window.removeEventListener("lokilingo-synced", onSynced);
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
          <Suspense fallback={<Spinner />}>
            <Page id={id} params={params} />
          </Suspense>
        </div>
      </main>
      {!focus && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <a key={t.to} href={`#${t.to}`} className={`tab ${t.match.includes(base) ? "on" : ""}`}><t.icon size={22} />{t.label}</a>
          ))}
        </nav>
      )}
      <ToastHost />
      <ConfettiHost />
    </div>
  );
}
