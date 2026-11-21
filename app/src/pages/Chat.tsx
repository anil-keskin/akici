import { useEffect, useRef, useState } from "react";
import { Send, Mic, Square, Volume2, VolumeX, Trash2, Settings2, Loader2, Phone, PhoneOff } from "lucide-react";
import { PageHead, useMicConsent } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { MODES, PERSONAS, chat, chatTurn, type Mode, type Msg } from "../lib/ai";
import { db, kvGet } from "../lib/db";
import { speak, stopSpeaking, Listener, health } from "../lib/speech";
import { useSettings } from "../lib/settings";
import { addStat } from "../lib/stats";
import { go } from "../lib/router";
import { loadScenarios, type Scenario } from "./Scenarios";

const STARTERS: Record<Mode, string[]> = {
  free: ["Hi! Let's talk about my day.", "Can we talk about movies?", "Ask me about my hobbies.", "I want to practice small talk."],
  roleplay: ["Hello!", "Start the scenario, please."],
  correct: ["Yesterday I go to the cinema with my friends and we watched a very funny film.", "I am living in Istanbul since five years."],
  explain: ["Present perfect ile past simple farkı ne?", "make ve do farkını açıkla", "a / an / the ne zaman kullanılır?"],
  exam: ["Let's start the IELTS speaking test."],
  vocab: ["Bana 'improve, achieve, ability' kelimelerini öğret.", "Seyahatle ilgili 5 önemli kelime öğret."],
};
interface Line { role: "user" | "assistant"; content: string; fix?: string; why?: string }

export default function Chat({ params }: { params: URLSearchParams }) {
  const s = useSettings();
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "free");
  const [lines, setLines] = useState<Line[]>([]);
  const [v, setV] = useState(params.get("q") || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tts, setTts] = useState(true);
  const [lv, setLv] = useState("A2");
  const [sc, setSc] = useState<Scenario | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [talking, setTalking] = useState(false);
  const [rec, setRec] = useState(false);
  const [call, setCall] = useState(false);
  const [, request, consentUi] = useMicConsent();
  const lis = useRef<Listener | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatId = useRef<number | undefined>(undefined);
  const callRef = useRef(false);
  const persona = PERSONAS[mode === "roleplay" && sc ? (["leo", "emma"][sc.id.length % 2]) : MODES[mode].persona];

  useEffect(() => { kvGet("level", "A2").then(setLv); }, []);
  useEffect(() => {
    if (s.aiProvider === "local") health(true).then((h) => setReady(!!h.ok && !!h.ollama)); else setReady(!!s.aiKey);
  }, [s.aiProvider, s.aiKey]);
  useEffect(() => {
    const id = params.get("sc");
    if (id) loadScenarios().then((all) => setSc(all.find((x) => x.id === id) || null));
  }, [params]);
  useEffect(() => { setLines([]); chatId.current = undefined; setErr(""); }, [mode, sc]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [lines, busy]);
  useEffect(() => () => { callRef.current = false; stopSpeaking(); lis.current?.cancel(); }, []);

  const system = (): Msg => ({
    role: "system",
    content: mode === "roleplay" && sc
      ? MODES.roleplay.system(sc.lv, `${sc.en}. Setting: ${sc.setting}. You play: ${sc.ai}. The learner plays: ${sc.you}. Goal: ${sc.goal}. Start in character.`)
      : MODES[mode].system(lv),
  });

  const say = async (text: string) => {
    if (!tts || !text) return;
    setTalking(true);
    await speak(text.replace(/[🎉✅🔍⭐📊]/gu, ""), { voice: persona.voice });
    setTalking(false);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    if (t.length > 4000) { setErr("Mesaj çok uzun (en fazla 4000 karakter)."); return; }
    const next: Line[] = [...lines, { role: "user", content: t }];
    setLines(next); setV(""); setBusy(true); setErr("");
    try {
      const history: Msg[] = [system(), ...next.slice(-16).map((l) => ({ role: l.role, content: l.content }))];
      let line: Line;
      if (MODES[mode].json) {
        const turn = await chatTurn(history);
        line = { role: "assistant", content: turn.reply };
        next[next.length - 1] = { ...next[next.length - 1], fix: turn.fix, why: turn.why };
      } else {
        line = { role: "assistant", content: await chat(history) };
      }
      const all = [...next, line];
      setLines(all);
      addStat({ xp: 3 });
      const row = { mode, title: t.slice(0, 60), messages: all.map((l) => ({ role: l.role, content: l.content })), ts: Date.now() };
      if (chatId.current) await db.chats.put({ ...row, id: chatId.current }); else chatId.current = await db.chats.add(row);
      setBusy(false);
      await say(MODES[mode].json ? line.content : line.content.split("\n").filter((l) => !/[çğışöüÇĞİŞÖÜ]/.test(l)).join(" ").slice(0, 500));
      if (callRef.current) startListening();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  async function startListening() {
    if (!(await request())) { callRef.current = false; setCall(false); return; }
    const l = new Listener(); lis.current = l;
    try { await l.start(40, () => stopListening()); setRec(true); } catch (e) { setErr((e as Error).message); callRef.current = false; setCall(false); }
  }
  async function stopListening() {
    if (!lis.current) return;
    setRec(false);
    const h = await lis.current.stop().catch((e) => { setErr((e as Error).message); return null; });
    lis.current = null;
    if (h?.text) send(h.text);
    else if (callRef.current) setErr("Seni duyamadım. Mikrofona tekrar bas.");
  }
  const toggleCall = async () => {
    if (call) { callRef.current = false; setCall(false); stopSpeaking(); lis.current?.cancel(); lis.current = null; setRec(false); return; }
    callRef.current = true; setCall(true); setTts(true);
    if (!lines.length) send(mode === "roleplay" ? "Hello!" : "Hi!");
    else startListening();
  };

  const starters = mode === "roleplay" && sc ? STARTERS.roleplay : STARTERS[mode];
  return (
    <div className="col" style={{ gap: 14, maxWidth: 880, margin: "0 auto", minHeight: "calc(100vh - 140px)" }}>
      {consentUi}
      <PageHead title="AI öğretmen" sub={sc ? `Senaryo: ${sc.title}` : "Hatalarını düzeltir, Türkçe açıklar, seninle sesli konuşur."}
        right={<div className="row"><button className="btn icon" title="Sesli yanıt" onClick={() => { setTts(!tts); stopSpeaking(); }}>{tts ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <button className="btn icon" title="Temizle" onClick={() => { setLines([]); chatId.current = undefined; }}><Trash2 size={18} /></button>
          <button className="btn icon" title="Ayarlar" onClick={() => go("/ayarlar")}><Settings2 size={18} /></button></div>} />
      <div className="scroll-x">
        {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} className={`chip ${mode === m ? "on" : ""}`} onClick={() => { setMode(m); if (m !== "roleplay") setSc(null); }}>{MODES[m].title}</button>)}
        {mode === "roleplay" && !sc && <button className="chip" onClick={() => go("/senaryolar")}>Senaryo seç →</button>}
      </div>
      <div className="card row" style={{ gap: 18, background: `linear-gradient(135deg, color-mix(in srgb, ${persona.color} 14%, var(--surface)), var(--surface))` }}>
        <Avatar p={persona} talking={talking} listening={rec} size={96} />
        <div className="grow">
          <div className="h3">{persona.name} <span className="muted small">· {sc ? sc.ai : persona.role}</span></div>
          <div className="muted small">{rec ? "Dinliyorum… bitince mikrofona bas." : talking ? "Konuşuyor…" : busy ? "Düşünüyor…" : call ? "Sesli sohbet açık" : "Yaz ya da sesli sohbeti başlat."}</div>
        </div>
        {MODES[mode].json && (
          <button className={`btn ${call ? "coral" : "mint"}`} onClick={toggleCall}>{call ? <><PhoneOff size={18} /> Bitir</> : <><Phone size={18} /> Sesli sohbet</>}</button>
        )}
      </div>
      {ready === false && (
        <div className="card small" style={{ background: "var(--amber-soft)" }}>
          {s.aiProvider === "local"
            ? <>Yerel yapay zekâ kapalı. Bilgisayarda <b>baslat.bat</b> ile Akıcı sunucusunu ve Ollama'yı aç. Ya da Ayarlar → Yapay zekâ'dan kendi API anahtarını gir.</>
            : <>API anahtarı girilmemiş. Ayarlar → Yapay zekâ.</>}
        </div>
      )}
      <div className="chat grow">
        {!lines.length && (
          <div className="card col" style={{ alignItems: "center", textAlign: "center", gap: 10 }}>
            <div className="h3">{MODES[mode].title}</div>
            <div className="muted small">{mode === "correct" ? "Bir paragraf yaz; düzeltip açıklayayım." : mode === "explain" ? "Türkçe sor, Türkçe anlatayım." : "Bir şey yaz, öneriye dokun ya da sesli sohbeti başlat."}</div>
            <div className="row wrap" style={{ justifyContent: "center" }}>{starters.map((x) => <button key={x} className="chip" onClick={() => send(x)}>{x}</button>)}</div>
          </div>
        )}
        {lines.map((m, i) => m.role === "user" ? (
          <div key={i} className="col" style={{ gap: 6, alignItems: "flex-end" }}>
            <div className="msg me">{m.content}</div>
            {m.fix && <div className="msg fix" style={{ alignSelf: "flex-end" }}>✏️ <b>{m.fix}</b>{m.why && <div className="small">{m.why}</div>}</div>}
          </div>
        ) : (
          <div key={i} className="row" style={{ alignItems: "flex-end", gap: 8 }}>
            <Avatar p={persona} size={34} />
            <div className="msg ai">{m.content}
              <button className="btn sm ghost" style={{ marginLeft: 8, padding: "2px 8px" }} aria-label="Dinle" onClick={() => say(m.content)}><Volume2 size={13} /></button>
            </div>
          </div>
        ))}
        {busy && <div className="row" style={{ gap: 8 }}><Avatar p={persona} size={34} /><div className="msg ai"><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> düşünüyor…</div></div>}
        <div ref={endRef} />
      </div>
      {err && <div className="small" style={{ color: "var(--coral)" }}>{err}</div>}
      <div className="row" style={{ position: "sticky", bottom: 76, background: "var(--bg)", paddingTop: 8 }}>
        <button className={`btn icon ${rec ? "coral" : ""}`} style={{ width: 52, height: 52 }} onClick={() => (rec ? stopListening() : startListening())} aria-label="Sesle yaz">{rec ? <Square /> : <Mic />}</button>
        <textarea className="input grow" rows={1} style={{ minHeight: 52, maxHeight: 160 }} value={v} placeholder={mode === "explain" ? "Türkçe sorabilirsin…" : "İngilizce yaz…"}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(v); } }} />
        <button className="btn primary icon" style={{ width: 52, height: 52 }} disabled={!v.trim() || busy} onClick={() => send(v)} aria-label="Gönder"><Send /></button>
      </div>
    </div>
  );
}
