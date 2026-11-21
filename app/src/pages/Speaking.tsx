import { useEffect, useRef, useState } from "react";
import { Mic, Repeat2, Target, MessagesSquare, ArrowLeft, Play, Square, SkipForward, Volume2 } from "lucide-react";
import { AudioBtn, Lv, PageHead, Spinner, useMicConsent } from "../components/ui";
import { Speak } from "../components/Exercises";
import { LEVELS, minimalPairs, pick, sentences, type Level, type Sentence } from "../lib/data";
import { speak, stopSpeaking, Listener, health, type Heard } from "../lib/speech";
import { alignWords, scoreOf } from "../lib/grade";
import { kvGet } from "../lib/db";
import { addStat } from "../lib/stats";
import { go } from "../lib/router";

type Mode = "shadow" | "coach" | "pairs";

const SOUNDS = [
  { k: "th", t: "TH /θ/ – /ð/", tip: "Dilinin ucunu üst ve alt dişlerinin arasına hafifçe koy ve üfle. /θ/ (think) sessiz, /ð/ (this) titreşimli. 'S', 'T', 'D' ya da 'Z' deme.",
    s: ["I think these three things are worth thinking about.", "This is the thirteenth time this month.", "They thanked their mother for the birthday cake.", "Both of them breathe through their mouths."] },
  { k: "wv", t: "W – V", tip: "W için dudaklarını yuvarlayıp öne it (u gibi), dişler dudağa değmez. V'de üst dişler alt dudağa değer. 'very well' → /ˈveri wel/.",
    s: ["We went to the village very early.", "What will we do with the van?", "Vivian visited the west wing on Wednesday.", "The wind was very violent."] },
  { k: "ii", t: "Uzun İ /iː/ – kısa I /ɪ/", tip: "sheep/ship: /iː/ uzun ve gergin (gülümse), /ɪ/ kısa ve gevşek, Türkçe İ ile I arası. 'live' kısa, 'leave' uzun.",
    s: ["Please leave the little ship in the sea.", "He will feel ill if he eats this meal.", "Sit in the seat and read the list.", "These bins are full of beans."] },
  { k: "ae", t: "/æ/ (cat) – /e/ (bed) – /ʌ/ (cut)", tip: "/æ/ için ağzını 'e' der gibi açıp çeneyi aşağı indir (Türkçede yok). /ʌ/ kısa ve gevşek bir 'a'.",
    s: ["The bad man had a black cat.", "Pack the bag and catch the bus.", "My brother runs much faster than me.", "Dad sat on the mat with his hat."] },
  { k: "ed", t: "-ed sonu: /t/, /d/, /ɪd/", tip: "Fiil sonu sessizse /t/ (worked = workt), sesliyse /d/ (played), t/d ile bitiyorsa /ɪd/ (wanted). 'worked' asla 'work-ed' değil!",
    s: ["She worked hard and finished early.", "We played, laughed and danced all night.", "He wanted to know why they needed it.", "I washed the dishes and watched TV."] },
  { k: "ng", t: "NG /ŋ/", tip: "'sing' sonunda G sesi yok: dilin arkası damağa yapışır, ses burundan çıkar. 'singing' = /ˈsɪŋɪŋ/, 'sin-gin-g' değil.",
    s: ["She is singing a song in the morning.", "Bring the ring to the king.", "I'm going shopping this evening.", "Nothing is wrong with the ceiling."] },
  { k: "r", t: "Amerikan R /ɹ/", tip: "Dil hiçbir yere dokunmaz ve titremez (Türkçe R gibi değil). Dilin ucunu hafif geriye kıvır. Kelime sonundaki R de okunur (car, water).",
    s: ["Red roses are really rare in the Rural areas.", "Her brother read a very short story.", "The car is parked near the river.", "Are you sure you're ready for the party?"] },
  { k: "schwa", t: "Schwa /ə/ ve vurgu", tip: "İngilizcede vurgusuz heceler /ə/ olur ve hızlı söylenir: 'banana' = /bəˈnænə/. Türkçedeki gibi her heceyi eşit söyleme; vurguyu abart.",
    s: ["I want to go to the cinema with a friend.", "What do you think about the photograph?", "It's a comfortable chocolate cake.", "Can you give me a banana and a tomato?"] },
];

export default function Speaking() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [srv, setSrv] = useState<string>("");
  useEffect(() => { health().then((h) => setSrv(h.ok ? `Whisper: ${h.whisper}` : "")); }, []);
  if (mode === "shadow") return <Shadow onBack={() => setMode(null)} />;
  if (mode === "coach") return <Coach onBack={() => setMode(null)} />;
  if (mode === "pairs") return <PairsSpeak onBack={() => setMode(null)} />;
  return (
    <div>
      <PageHead title="Konuşma & telaffuz" sub="Konuşmayı ancak konuşarak öğrenirsin. Günde 5 dakika sesli pratik bile fark yaratır." icon={<div className="ico coral"><Mic /></div>} />
      <div className="card row small" style={{ marginBottom: 16, background: srv ? "var(--mint-soft)" : "var(--amber-soft)" }}>
        {srv ? `✅ Yerel puanlama açık (${srv}). Sesin bilgisayardan çıkmaz.` : "ℹ️ Yerel sunucu kapalı: tarayıcının konuşma tanıması kullanılacak (Chrome/Edge). Daha hassas ve gizli puanlama için 'baslat.bat' ile sunucuyu aç."}
      </div>
      <div className="grid g2">
        <Mod i={Repeat2} c="iris" t="Shadowing stüdyosu" d="Ana dili konuşanı dinle, aynı anda/hemen ardından tekrar et. Ritim, vurgu ve akıcılık için en etkili teknik." on={() => setMode("shadow")} />
        <Mod i={Target} c="coral" t="Telaffuz koçu" d="Türklerin zorlandığı 8 ses: TH, W/V, uzun-kısa İ, /æ/, -ed, NG, R, schwa. İpucu + hedefli cümleler." on={() => setMode("coach")} />
        <Mod i={Volume2} c="amber" t="Minimal çiftleri söyle" d="ship/sheep, think/sink… İkisini de doğru söyleyebiliyor musun?" on={() => setMode("pairs")} />
        <Mod i={MessagesSquare} c="mint" t="Serbest konuşma" d="AI öğretmenle sesli sohbet ya da IELTS konuşma sınavı pratiği." on={() => go("/sohbet?mode=exam")} />
      </div>
    </div>
  );
}
function Mod({ i: I, c, t, d, on }: { i: typeof Mic; c: string; t: string; d: string; on: () => void }) {
  return <div className="card hover row" onClick={on}><div className={`ico ${c}`}><I /></div><div className="grow"><div className="h3">{t}</div><div className="muted small">{d}</div></div></div>;
}

function chunks(s: string): string[] {
  const parts = s.split(/(?<=[,;:])\s+/);
  const out: string[] = [];
  for (const p of parts) {
    const w = p.split(" ");
    if (w.length <= 6) out.push(p);
    else for (let i = 0; i < w.length; i += 4) out.push(w.slice(i, i + 4).join(" "));
  }
  return out;
}

function Shadow({ onBack }: { onBack: () => void }) {
  const [lv, setLv] = useState<Level>("A2");
  const [list, setList] = useState<Sentence[] | null>(null);
  const [i, setI] = useState(0);
  const [rate, setRate] = useState(0.85);
  const [, request, consentUi] = useMicConsent();
  const [rec, setRec] = useState<"idle" | "rec" | "wait">("idle");
  const [heard, setHeard] = useState<Heard | null>(null);
  const lis = useRef<Listener | null>(null);
  useEffect(() => { kvGet<Level>("level", "A2").then(setLv); }, []);
  useEffect(() => { setList(null); sentences(lv).then((a) => setList(pick(a.filter((s) => { const n = s[1].split(" ").length; return n >= 5 && n <= 16; }), 100))); }, [lv]);
  useEffect(() => () => { stopSpeaking(); lis.current?.cancel(); }, []);
  if (!list) return <Spinner />;
  const cur = list[i];
  const parts = chunks(cur[1]);
  const shadowRun = async () => {
    if (!(await request())) return;
    setHeard(null);
    const l = new Listener(); lis.current = l;
    await l.start(30);
    setRec("rec");
    await speak(cur[1], { rate });       // aynı anda dinle + konuş (gerçek shadowing)
    await new Promise((r) => setTimeout(r, 700));
    setRec("wait");
    const h = await l.stop(); lis.current = null;
    setHeard(h); setRec("idle");
    addStat({ xp: 6 });
  };
  const al = heard ? alignWords(cur[1], heard.text) : [];
  return (
    <div className="ex-wrap col" style={{ gap: 16 }}>
      {consentUi}
      <div className="row between wrap">
        <button className="btn ghost sm" onClick={onBack}><ArrowLeft size={16} /> Konuşma</button>
        <div className="scroll-x">{LEVELS.map((l) => <button key={l} className={`chip ${lv === l ? "on" : ""}`} onClick={() => { setLv(l); setI(0); }}>{l}</button>)}</div>
      </div>
      <div className="card pad-lg col" style={{ gap: 14, textAlign: "center", alignItems: "center" }}>
        <Lv lv={lv} />
        <div className="display" style={{ fontSize: 28, fontWeight: 650, lineHeight: 1.4 }}>
          {heard ? al.map((x, k) => <span key={k} className={x.s === "ok" ? "w-ok" : x.s === "miss" ? "w-miss" : "w-bad"}>{x.w} </span>) : cur[1]}
        </div>
        <div className="muted">{cur[2]}</div>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          {parts.length > 1 && parts.map((p, k) => <button key={k} className="chip" onClick={() => speak(p, { rate })}>▶ {p}</button>)}
        </div>
        <div className="row">
          <span className="small muted">Hız</span>
          <input type="range" min={0.5} max={1.2} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Hız" />
          <b className="small">{rate.toFixed(2)}×</b>
        </div>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={() => speak(cur[1], { rate })}><Play size={18} /> Dinle</button>
          <button className="btn coral" disabled={rec !== "idle"} onClick={shadowRun}>{rec === "rec" ? <><span className="rec-dot" /> Birlikte söyle…</> : rec === "wait" ? "Değerlendiriliyor…" : <><Mic size={18} /> Shadowing yap</>}</button>
          <button className="btn ghost" onClick={() => { setHeard(null); setI((i + 1) % list.length); }}><SkipForward size={18} /> Sonraki</button>
        </div>
        {heard && (
          <div className="col" style={{ gap: 6 }}>
            <div className="h2">{scoreOf(al)} / 100</div>
            <div className="row" style={{ justifyContent: "center" }}>
              {heard.audioUrl && <button className="btn sm ghost" onClick={() => new Audio(heard.audioUrl).play()}><Volume2 size={14} /> Kendi sesim</button>}
              <button className="btn sm ghost" onClick={() => speak(cur[1], { rate })}>🔊 Orijinal</button>
            </div>
          </div>
        )}
      </div>
      <div className="card small sub">
        <b>Nasıl yapılır?</b> 1) Önce sadece dinle. 2) Parçalara dokunup tek tek tekrar et. 3) "Shadowing yap"a bas: ses çalarken <b>aynı anda</b> sen de söyle; yetişemezsen hızı düşür. 4) Kendi sesini dinleyip orijinalle karşılaştır.
      </div>
    </div>
  );
}

function Coach({ onBack }: { onBack: () => void }) {
  const [k, setK] = useState(SOUNDS[0].k);
  const [i, setI] = useState(0);
  const snd = SOUNDS.find((s) => s.k === k)!;
  return (
    <div className="ex-wrap col" style={{ gap: 16 }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={onBack}><ArrowLeft size={16} /> Konuşma</button>
      <div className="scroll-x">{SOUNDS.map((s) => <button key={s.k} className={`chip ${k === s.k ? "on" : ""}`} onClick={() => { setK(s.k); setI(0); }}>{s.t}</button>)}</div>
      <div className="card" style={{ background: "var(--sky-soft)" }}><b>{snd.t}</b><div className="small" style={{ marginTop: 4 }}>{snd.tip}</div></div>
      <div className="card" key={k + i}>
        <Speak text={snd.s[i % snd.s.length]} onDone={() => setI(i + 1)} allowSkip />
      </div>
    </div>
  );
}

function PairsSpeak({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Record<string, [string, string][]> | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => { minimalPairs().then(setData); }, []);
  if (!data) return <Spinner />;
  const keys = Object.keys(data).filter((x) => data[x].length >= 4);
  const k = keys[round % keys.length];
  const pair = data[k][Math.floor((round * 7) % data[k].length)];
  return (
    <div className="ex-wrap col" style={{ gap: 16 }}>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={onBack}><ArrowLeft size={16} /> Konuşma</button>
      <div className="row" style={{ justifyContent: "center" }}>{pair.map((w) => <span key={w} className="chip"><AudioBtn text={w} size={14} slow={false} /> {w}</span>)}</div>
      <div className="card" key={round}>
        <Speak text={`${pair[0]}, ${pair[1]}`} onDone={() => setRound(round + 1)} />
      </div>
    </div>
  );
}

export { Square };
