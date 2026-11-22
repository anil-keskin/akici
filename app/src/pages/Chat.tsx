import { useEffect, useRef, useState } from "react";
import { Send, Mic, Square, Volume2, VolumeX, Trash2, Settings2, Loader2, Phone, PhoneOff, Languages } from "lucide-react";
import { PageHead, useMicConsent } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { MODES, PERSONAS, chat, chatTurn, translateTr, type Mode, type Msg } from "../lib/ai";
import { db, kvGet, kvSet } from "../lib/db";
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
interface Line { role: "user" | "assistant"; content: string; fix?: string; why?: string; tr?: string }

export default function Chat({ params }: { params: URLSearchParams }) {
  const s = useSettings();
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "free");
  const [lines, setLinesState] = useState<Line[]>([]);
  // Sesli sohbette eski kapanışlar (closure) bayat "lines" görmesin: güncel liste hep bu ref'te
  const linesRef = useRef<Line[]>([]);
  const setLines = (v: Line[] | ((ls: Line[]) => Line[])) => setLinesState((ls) => { const n = typeof v === "function" ? v(ls) : v; linesRef.current = n; return n; });
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
  const [heard, setHeard] = useState("");
  const [autoTr, setAutoTr] = useState(false);
  const misses = useRef(0);
  const lastAi = useRef("");
  useEffect(() => { kvGet("chat.autoTr", false).then(setAutoTr); }, []);
  /** Loki'nin mesajının Türkçesi: aç/kapat; yoksa çevir */
  const setTr = (i: number, tr?: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, tr } : l)));
  const trLine = async (i: number, text: string, toggle = true) => {
    if (toggle && lines[i]?.tr) { setTr(i, undefined); return; }
    setTr(i, "Çevriliyor…");
    try { setTr(i, await translateTr(text)); } catch (e) { setTr(i, `Çevrilemedi: ${(e as Error).message}`); }
  };
  const persona = PERSONAS[mode === "roleplay" && sc ? (["leo", "emma"][sc.id.length % 2]) : MODES[mode].persona];

  useEffect(() => { kvGet("level", "A2").then(setLv); }, []);
  useEffect(() => {
    if (s.aiProvider === "local") health(true).then((h) => setReady(!!h.ok && !!h.ollama)); else setReady(s.aiProvider === "akici" || !!s.aiKey);
  }, [s.aiProvider, s.aiKey]);
  useEffect(() => {
    const id = params.get("sc");
    if (id) loadScenarios().then((all) => setSc(all.find((x) => x.id === id) || null));
  }, [params]);
  useEffect(() => { setLines([]); chatId.current = undefined; setErr(""); }, [mode, sc]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [lines, busy]);
  useEffect(() => () => { callRef.current = false; stopSpeaking(); lis.current?.cancel(); }, []);

  // Kategori yolundan gelen canlandırma (rp): kısa senaryo tarifi
  const rp = params.get("rp");
  const system = (): Msg => ({
    role: "system",
    content: mode === "roleplay" && sc
      ? MODES.roleplay.system(sc.lv, `${sc.en}. Setting: ${sc.setting}. You play: ${sc.ai}. The learner plays: ${sc.you}. Goal: ${sc.goal}. Start in character.`)
      : mode === "roleplay" && rp
        ? MODES.roleplay.system(lv, `${rp} Start in character with a short first line.`)
        : MODES[mode].system(lv),
  });

  const hush = useRef(false);
  const say = async (text: string) => {
    if (!tts || !text) return;
    hush.current = false;
    setTalking(true);
    await speak(text.replace(/[🎉✅🔍⭐📊]/gu, ""), { voice: persona.voice });
    setTalking(false);
  };
  /** Konuşmayı hemen kes (mikrofona basınca ya da Sustur ile) */
  const shush = () => { hush.current = true; stopSpeaking(); setTalking(false); };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    if (t.length > 4000) { setErr("Mesaj çok uzun (en fazla 4000 karakter)."); return; }
    const next: Line[] = [...linesRef.current, { role: "user", content: t }];
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
      if (autoTr) trLine(all.length - 1, line.content, false);
      addStat({ xp: 3 });
      const row = { mode, title: t.slice(0, 60), messages: all.map((l) => ({ role: l.role, content: l.content })), ts: Date.now() };
      if (chatId.current) await db.chats.put({ ...row, id: chatId.current }); else chatId.current = await db.chats.add(row);
      setBusy(false);
      lastAi.current = line.content;
      await say(MODES[mode].json ? line.content : line.content.split("\n").filter((l) => !/[çğışöüÇĞİŞÖÜ]/.test(l)).join(" ").slice(0, 500));
      // Loki'nin sesi tamamen bitsin, sonra mikrofonu aç (yoksa kendi sesini "senin cevabın" sanıyor)
      if (callRef.current && !hush.current) { await new Promise((r) => setTimeout(r, 700)); if (callRef.current && !hush.current) startListening(); }
    } catch (e) {
      setErr((e as Error).message + (callRef.current ? " · Tekrar söyleyebilirsin." : ""));
      setBusy(false);
      setLines(next); setV(t); // mesaj kaybolmasın: yazı kutusunda dursun
      if (callRef.current) startListening(); // sesli sohbet takılı kalmasın
    }
  };

  async function startListening() {
    shush(); // konuşuyorsa sustur, sonra dinle
    if (!(await request())) { callRef.current = false; setCall(false); return; }
    const l = new Listener(); lis.current = l;
    setHeard(""); l.onPartial = setHeard;
    try { await l.start(40, () => stopListening()); setRec(true); } catch (e) { setErr((e as Error).message); callRef.current = false; setCall(false); }
  }
  async function stopListening() {
    const cur = lis.current;
    if (!cur) return;
    lis.current = null; // ikinci kez durdurulmasın (sessizlik + düğme aynı anda)
    setRec(false);
    setHeard("Yazıya çevriliyor…");
    const h = await cur.stop().catch((e) => { setErr((e as Error).message); return null; });
    if (!h && callRef.current && misses.current < 2) { misses.current++; setHeard(""); startListening(); return; }
    setHeard("");
    // Mikrofon Loki'nin kendi sözünü yakaladıysa (yankı) gönderme, seni dinlemeye devam et
    if (h?.text && callRef.current && isEcho(h.text, lastAi.current)) { startListening(); return; }
    if (h?.text) { misses.current = 0; send(h.text); return; }
    // Sesli sohbette sessiz kaldıysan acele etme: dinlemeye devam et (yaklaşık 1,5 dk), sonra bekle
    if (callRef.current && h && misses.current < 2) { misses.current++; startListening(); return; }
    misses.current = 0;
    if (callRef.current) setErr("Seni bekliyorum. Hazır olunca mikrofona bas."); else if (h) setErr("Ses gelmedi. Mikrofona biraz daha yakın ve net konuş.");
  }
  /** Mikrofon düğmesi: bir kez bas → eller serbest konuşma (konuş, sus, Loki cevap verir, seni bekler) */
  const micPress = async () => {
    if (rec) { stopListening(); return; } // dinlerken basarsan hemen gönderir
    if (!callRef.current) {
      if (!(await request())) return;
      callRef.current = true; setCall(true); setTts(true); setErr("");
    }
    startListening();
  };
  const toggleCall = async () => {
    if (call) { callRef.current = false; setCall(false); stopSpeaking(); lis.current?.cancel(); lis.current = null; setRec(false); return; }
    // Mikrofon onayını en başta al (Loki selam verdikten sonra pencere çıkıp beklemesin)
    if (!(await request())) return;
    callRef.current = true; setCall(true); setTts(true); setErr("");
    if (!lines.length) send(mode === "roleplay" ? "Hello!" : "Hi!");
    else startListening();
  };

  const starters = mode === "roleplay" && sc ? STARTERS.roleplay : STARTERS[mode];
  return (
    <div className="col" style={{ gap: 14, maxWidth: 880, margin: "0 auto", minHeight: "calc(100vh - 140px)" }}>
      {consentUi}
      <PageHead title="AI öğretmen" sub={sc ? `Senaryo: ${sc.title}` : rp && mode === "roleplay" ? `Canlandırma: ${params.get("rt") || "senaryo"}` : "Hatalarını düzeltir, Türkçe açıklar, seninle sesli konuşur."}
        right={<div className="row"><button className={`btn icon ${autoTr ? "primary" : ""}`} title="Türkçesini hep göster" aria-pressed={autoTr} onClick={() => { const n = !autoTr; setAutoTr(n); kvSet("chat.autoTr", n); }}><Languages size={18} /></button>
          <button className="btn icon" title="Sesli yanıt" onClick={() => { setTts(!tts); stopSpeaking(); }}>{tts ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <button className="btn icon" title="Temizle" onClick={() => { setLines([]); chatId.current = undefined; }}><Trash2 size={18} /></button>
          <button className="btn icon" title="Ayarlar" onClick={() => go("/ayarlar")}><Settings2 size={18} /></button></div>} />
      <div className="scroll-x">
        {(Object.keys(MODES) as Mode[]).map((m) => <button key={m} className={`chip ${mode === m ? "on" : ""}`} onClick={() => { setMode(m); if (m !== "roleplay") setSc(null); }}>{MODES[m].title}</button>)}
        {mode === "roleplay" && !sc && !rp && <button className="chip" onClick={() => go("/senaryolar")}>Senaryo seç →</button>}
      </div>
      <div className="card row chat-head" style={{ gap: 18, background: `linear-gradient(135deg, color-mix(in srgb, ${persona.color} 14%, var(--surface)), var(--surface))` }}>
        <Avatar p={persona} talking={talking} listening={rec} size={96} />
        <div className="grow" style={{ minWidth: 160 }}>
          <div className="h3">{persona.name} <span className="muted small">· {sc ? sc.ai : rp && mode === "roleplay" ? (params.get("rt") || "Canlandırma") : persona.role}</span></div>
          <div className="muted small">{rec ? "🎙️ Senin sıran — acele etme. Konuş, susunca kendim gönderirim." : heard ? heard : talking ? "Konuşuyor… bitince seni dinleyeceğim (susturmak için Sustur)" : busy ? "Düşünüyor…" : call ? "Eller serbest konuşma açık" : "Yaz ya da 🎙️ düğmesine bir kez bas: eller serbest konuşalım."}</div>
          {rec && heard && <div className="small" style={{ marginTop: 4, fontStyle: "italic" }}>“{heard}”</div>}
          {err && <div className="small" style={{ marginTop: 4, color: "var(--coral)", fontWeight: 600 }}>⚠️ {err}</div>}
          {talking && <button className="btn sm coral" style={{ marginTop: 8 }} onClick={shush}><VolumeX size={15} /> Sustur</button>}
        </div>
        {(
          <button className={`btn ${call ? "coral" : "mint"}`} onClick={toggleCall}>{call ? <><PhoneOff size={18} /> Bitir</> : <><Phone size={18} /> Sesli sohbet</>}</button>
        )}
      </div>
      {ready === false && (
        <div className="card small" style={{ background: "var(--amber-soft)" }}>
          {s.aiProvider === "local"
            ? (location.protocol === "https:" || !/^(127\.|localhost|192\.168\.|10\.|172\.)/.test(location.hostname))
              ? <>Bu sürüm (internet sitesi / telefon uygulaması) bilgisayarındaki yapay zekâya ulaşamaz. İki yol var:<br />
                  <b>1) Evde ücretsiz:</b> bilgisayarda <b>baslat-lan.bat</b> çalıştır. Telefonda Chrome'a siyah pencerede yazan <b>http://192.168…:8790</b> adresini yaz, Ayarlar → Yerel sunucu'ya pencerede yazan erişim kodunu gir.<br />
                  <b>2) Her yerde:</b> Ayarlar → Yapay zekâ'dan kendi API anahtarını gir (sadece bu cihazda saklanır).</>
              : <>Yerel yapay zekâ kapalı ya da erişim kodu eksik. Bilgisayarda <b>baslat-lan.bat</b> penceresi açık mı? Açıksa Ayarlar → Yerel sunucu'ya penceredeki erişim kodunu gir. Ya da Ayarlar → Yapay zekâ'dan kendi API anahtarını gir.</>
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
              <button className="btn sm ghost" style={{ marginLeft: 4, padding: "2px 8px" }} aria-label="Türkçesi" title="Türkçesi" onClick={() => trLine(i, m.content)}><Languages size={13} /> TR</button>
              {m.tr && <div className="small" style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line, #ccc)", fontWeight: 600, opacity: 0.9 }}>🇹🇷 {m.tr}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="row" style={{ gap: 8 }}><Avatar p={persona} size={34} /><div className="msg ai"><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> düşünüyor…</div></div>}
        <div ref={endRef} />
      </div>
      {err && <div className="small" style={{ color: "var(--coral)" }}>{err}</div>}
      <div className="row" style={{ position: "sticky", bottom: 76, background: "var(--bg)", paddingTop: 8 }}>
        <button className={`btn icon ${rec ? "coral" : call ? "mint" : ""}`} style={{ width: 52, height: 52 }} onClick={micPress} aria-label={rec ? "Şimdi gönder" : "Sesli konuş"} title={rec ? "Şimdi gönder (beklemene gerek yok, susunca kendim gönderirim)" : "Sesli konuş: bir kez bas, gerisi otomatik"}>{rec ? <Square /> : <Mic />}</button>
        <textarea className="input grow" rows={1} style={{ minHeight: 52, maxHeight: 160 }} value={v} placeholder={mode === "explain" ? "Türkçe sorabilirsin…" : "İngilizce yaz…"}
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(v); } }} />
        <button className="btn primary icon" style={{ width: 52, height: 52 }} disabled={!v.trim() || busy} onClick={() => send(v)} aria-label="Gönder"><Send /></button>
      </div>
    </div>
  );
}

/** Duyulan metin Loki'nin son cevabının tekrarı mı? (hoparlörden mikrofona yankı) */
function isEcho(heard: string, ai: string): boolean {
  // Kelime ÇİFTLERİNE bak: "My favorite food is pizza" ↔ "What is your favorite food?" yankı sayılmasın
  const w = (x: string) => x.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean);
  const pairs = (t: string[]) => t.slice(1).map((x, i) => t[i] + " " + x);
  const h = pairs(w(heard)), a = new Set(pairs(w(ai)));
  if (h.length < 3 || !a.size) return false;
  return h.filter((p) => a.has(p)).length / h.length >= 0.6;
}
