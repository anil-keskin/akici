import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Lv, Mascot } from "../components/ui";
import { kvSet } from "../lib/db";
import { saveSettings } from "../lib/settings";
import { go } from "../lib/router";
import { LEVELS, LEVEL_TR, type Level } from "../lib/data";

const GOALS = [[20, "Rahat", "5 dk/gün"], [50, "Normal", "10-15 dk/gün"], [100, "Ciddi", "20-30 dk/gün"], [200, "Yoğun", "45+ dk/gün"]] as const;
const WHY = ["İş / kariyer", "Seyahat", "Sınav (IELTS, YDS, TOEFL)", "Dizi-film, oyun", "Yurtdışında yaşamak", "Kendimi geliştirmek"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [why, setWhy] = useState<string[]>([]);
  const [goal, setGoal] = useState(50);
  const finish = async (lv: Level | "test") => {
    await kvSet("name", name.trim().slice(0, 40));
    await kvSet("why", why);
    await saveSettings({ goalXp: goal });
    await kvSet("level", lv === "test" ? "A1" : lv);
    await kvSet("onboarded", true);
    go(lv === "test" ? "/test" : "/");
  };
  return (
    <div className="ex-wrap col" style={{ gap: 20, paddingTop: 30, maxWidth: 560 }}>
      {step === 0 && (
        <div className="col pop" style={{ gap: 18, alignItems: "center", textAlign: "center" }}>
          <Mascot size={130} />
          <h1 className="h1">Akıcı'ya hoş geldin!</h1>
          <p className="sub" style={{ fontSize: 18 }}>20.000 kelime, gerçek cümleler, gramer, dinleme, telaffuz ve yapay zekâ öğretmen — hepsi tek yerde, reklamsız ve ücretsiz.</p>
          <div className="card small row" style={{ textAlign: "left", alignItems: "flex-start" }}><ShieldCheck color="var(--mint)" style={{ flex: "none" }} />Hesap açmana gerek yok. İlerlemen sadece bu cihazda tutulur; hiçbir yere gönderilmez.</div>
          <input className="input" placeholder="Adın (isteğe bağlı)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <button className="btn primary big block" onClick={() => setStep(1)}>Başlayalım <ArrowRight /></button>
        </div>
      )}
      {step === 1 && (
        <div className="col pop" style={{ gap: 14 }}>
          <h2 className="h2">Neden İngilizce öğreniyorsun?</h2>
          <div className="row wrap">{WHY.map((w) => <button key={w} className={`chip ${why.includes(w) ? "on" : ""}`} style={{ padding: "10px 14px", fontSize: 15 }} onClick={() => setWhy(why.includes(w) ? why.filter((x) => x !== w) : [...why, w])}>{w}</button>)}</div>
          <h2 className="h2" style={{ marginTop: 10 }}>Günlük hedefin</h2>
          <div className="grid g2">{GOALS.map(([v, t, d]) => (
            <button key={v} className={`opt ${goal === v ? "ok" : ""}`} onClick={() => setGoal(v)}><div><b>{t}</b><div className="muted small">{d} · {v} XP</div></div></button>
          ))}</div>
          <button className="btn primary big" onClick={() => setStep(2)}>Devam <ArrowRight /></button>
        </div>
      )}
      {step === 2 && (
        <div className="col pop" style={{ gap: 12 }}>
          <h2 className="h2">Seviyen ne?</h2>
          <button className="opt" style={{ borderColor: "var(--iris)" }} onClick={() => finish("test")}><div><b>🎯 Bilmiyorum, test et (3 dk)</b><div className="muted small">Kelime dağarcığını ölçüp seviyeni bulalım</div></div></button>
          {LEVELS.map((l) => (
            <button key={l} className="opt" onClick={() => finish(l)}><Lv lv={l} /><div><b>{LEVEL_TR[l]}</b><div className="muted small">{{ A1: "Hiç ya da çok az biliyorum", A2: "Basit cümleler kurabiliyorum", B1: "Günlük konuşmayı idare ederim", B2: "Dizi izleyip çoğunu anlarım", C1: "Akıcıyım, inceliklere çalışıyorum", C2: "Ana dil seviyesine yakın" }[l]}</div></div></button>
          ))}
        </div>
      )}
    </div>
  );
}
