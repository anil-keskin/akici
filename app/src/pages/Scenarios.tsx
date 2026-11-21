import { useEffect, useMemo, useState } from "react";
import { Theater, ArrowLeft, Sparkles, Plus, Play, User, Bot } from "lucide-react";
import { AudioBtn, Lv, PageHead, Spinner, toast } from "../components/ui";
import { Speak } from "../components/Exercises";
import { load, LEVELS, type Level } from "../lib/data";
import { addCard } from "../lib/srs";
import { speak } from "../lib/speech";
import { go } from "../lib/router";
import { addStat } from "../lib/stats";

export interface Scenario {
  id: string; cat: string; lv: Level; title: string; en: string; setting: string; you: string; ai: string; goal: string;
  phrases: [string, string][]; dialog?: [string, string, string][]; icon?: string;
}
export const loadScenarios = () => load<Scenario[]>("scenarios.json");

export default function Scenarios({ id }: { id?: string }) {
  const [all, setAll] = useState<Scenario[] | null>(null);
  const [cat, setCat] = useState("");
  const [lv, setLv] = useState<Level | "">("");
  useEffect(() => { loadScenarios().then(setAll); }, []);
  const cats = useMemo(() => [...new Set((all || []).map((s) => s.cat))], [all]);
  if (!all) return <Spinner />;
  if (id) { const s = all.find((x) => x.id === id); return s ? <Detail s={s} /> : <div className="card">Bulunamadı</div>; }
  const list = all.filter((s) => (!cat || s.cat === cat) && (!lv || s.lv === lv));
  return (
    <div>
      <PageHead title="Senaryolar" sub={`${all.length} gerçek hayat durumu · kalıpları öğren, diyaloğu dinle, sonra AI ile canlandır`} icon={<div className="ico iris"><Theater /></div>} />
      <div className="scroll-x" style={{ marginBottom: 10 }}>
        <button className={`chip ${!cat ? "on" : ""}`} onClick={() => setCat("")}>Hepsi</button>
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="scroll-x" style={{ marginBottom: 18 }}>
        <button className={`chip ${!lv ? "on" : ""}`} onClick={() => setLv("")}>Tüm seviyeler</button>
        {LEVELS.slice(0, 5).map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => setLv(l)}>{l}</button>)}
      </div>
      <div className="grid g3">
        {list.map((s) => (
          <div key={s.id} className="card hover col" style={{ gap: 8 }} onClick={() => go(`/senaryolar/${s.id}`)}>
            <div className="row between"><span style={{ fontSize: 30 }}>{s.icon || "💬"}</span><Lv lv={s.lv} /></div>
            <div className="h3">{s.title}</div>
            <div className="muted small">{s.en}</div>
            <div className="small sub">🎯 {s.goal}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ s }: { s: Scenario }) {
  const [role, setRole] = useState(false);
  const [li, setLi] = useState(0);
  const playAll = async () => { for (const [, en] of s.dialog || []) await speak(en); };
  const lines = s.dialog || [];
  if (role && lines.length) {
    const line = lines[li];
    const mine = line && line[0] === "you";
    return (
      <div className="ex-wrap col" style={{ gap: 16 }}>
        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => { setRole(false); setLi(0); }}><ArrowLeft size={16} /> Senaryo</button>
        <div className="chat">
          {lines.slice(0, li).map(([who, en], k) => <div key={k} className={`msg ${who === "you" ? "me" : "ai"}`}>{en}</div>)}
        </div>
        {line ? (mine ? (
          <div className="card" key={li}><Speak text={line[1]} tr={line[2]} onDone={() => { addStat({ xp: 4 }); setLi(li + 1); }} /></div>
        ) : (
          <div className="card row" key={li}>
            <Bot color="var(--iris)" /><div className="grow"><b>{line[1]}</b><div className="muted small">{line[2]}</div></div>
            <button className="btn primary" onClick={async () => { await speak(line[1]); setLi(li + 1); }}><Play size={16} /> Dinle & devam</button>
          </div>
        )) : (
          <div className="card col" style={{ alignItems: "center", textAlign: "center" }}>
            <div className="h2">🎉 Diyaloğu tamamladın!</div>
            <button className="btn primary" onClick={() => go(`/sohbet?mode=roleplay&sc=${s.id}`)}><Sparkles size={18} /> Şimdi AI ile serbest canlandır</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 18, maxWidth: 860, margin: "0 auto" }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => go("/senaryolar")}><ArrowLeft size={16} /> Senaryolar</button>
      <div className="row"><span style={{ fontSize: 44 }}>{s.icon || "💬"}</span><div><Lv lv={s.lv} /><h1 className="h1">{s.title}</h1><div className="muted">{s.en}</div></div></div>
      <div className="grid g3">
        <div className="card"><div className="muted tiny">ORTAM</div>{s.setting}</div>
        <div className="card"><div className="muted tiny">SEN</div>{s.you}</div>
        <div className="card"><div className="muted tiny">KARŞINDAKİ</div>{s.ai}</div>
      </div>
      <div className="card" style={{ background: "var(--mint-soft)" }}>🎯 <b>Hedef:</b> {s.goal}</div>
      <div className="card col" style={{ gap: 10 }}>
        <div className="row between"><div className="h3">Anahtar kalıplar</div>
          <button className="btn sm ghost" onClick={async () => { for (const [en, tr] of s.phrases) await addCard("custom", `${s.id}:${en}`, { front: en, back: tr }); toast(`${s.phrases.length} kalıp desteye eklendi`); }}><Plus size={14} /> Hepsini desteye ekle</button>
        </div>
        {s.phrases.map(([en, tr]) => <div key={en} className="row" style={{ alignItems: "flex-start" }}><AudioBtn text={en} size={16} slow={false} /><div><b>{en}</b><div className="muted small">{tr}</div></div></div>)}
      </div>
      {lines.length > 0 && (
        <div className="card col" style={{ gap: 10 }}>
          <div className="row between"><div className="h3">Örnek diyalog</div><button className="btn sm ghost" onClick={playAll}><Play size={14} /> Hepsini dinle</button></div>
          {lines.map(([who, en, tr], k) => (
            <div key={k} className="row" style={{ alignItems: "flex-start" }}>
              {who === "you" ? <User size={18} color="var(--coral)" /> : <Bot size={18} color="var(--iris)" />}
              <div className="grow"><b>{en}</b><div className="muted small">{tr}</div></div>
              <AudioBtn text={en} size={15} slow={false} />
            </div>
          ))}
        </div>
      )}
      <div className="row wrap">
        {lines.length > 0 && <button className="btn coral big" onClick={() => setRole(true)}>🎙️ Rolünü sesli oyna</button>}
        <button className="btn primary big" onClick={() => go(`/sohbet?mode=roleplay&sc=${s.id}`)}><Sparkles size={18} /> AI ile canlandır</button>
      </div>
    </div>
  );
}
