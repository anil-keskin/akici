// Canlı döküm (bilgisayarda Chrome/Edge): izlediğin sekmenin SESİNİ kullanıcı izniyle alır, 10 sn'lik parçalar halinde
// Whisper ile yazıya döker ve Türkçeye çevirir. YouTube'un sunucusundan hiçbir şey çekilmez; sadece senin duyduğun ses işlenir.
// Ses kaydedilmez; parçalar yazıya çevrilip atılır. Döküm istersen bu cihaza kaydedilir.
import { useEffect, useRef, useState } from "react";
import { Captions, Square, Save } from "lucide-react";
import { cloudStt } from "../lib/speech";
import { aiJson, translateTr } from "../lib/ai";
import { toast } from "./ui";

export interface CapLine { t: number; en: string; tr?: string }
const JUNK = /^(thank you\.?|thanks for watching!?|you|\.+|bye\.?|music|\[music\]|♪+)$/i;

export function canLiveCaption(): boolean {
  return !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent);
}

/** now(): videonun o anki saniyesi (parçanın zamanını işaretlemek için) */
export function LiveCaption({ now, onSave }: { now: () => number; onSave: (lines: CapLine[]) => void }) {
  const [on, setOn] = useState(false);
  const [lines, setLines] = useState<CapLine[]>([]);
  const [err, setErr] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const run = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [lines]);

  function stop() {
    run.current = false; setOn(false);
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null;
  }
  async function start() {
    setErr("");
    let s: MediaStream;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "include" } as any);
    } catch { setErr("İzin verilmedi. Tekrar bas ve “Bu sekme” + “Sekme sesini de paylaş” seç."); return; }
    s.getVideoTracks().forEach((t) => t.stop()); // görüntü gerekmez
    const a = s.getAudioTracks();
    if (!a.length) { setErr("Ses gelmedi: paylaşırken “Sekme sesini de paylaş” kutusunu işaretle."); s.getTracks().forEach((t) => t.stop()); return; }
    a[0].onended = () => stop();
    stream.current = new MediaStream(a); run.current = true; setOn(true);
    loop();
  }
  async function loop() {
    while (run.current && stream.current) {
      const t0 = now();
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream.current);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((r) => { rec.onstop = r; });
      rec.start();
      await new Promise((r) => setTimeout(r, 10000));
      if (rec.state !== "inactive") rec.stop();
      await done;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 3000) continue;
      cloudStt(blob).then(async (text) => {
        const en = text.trim();
        if (!en || JUNK.test(en)) return;
        // Parçayı cümlelere böl; her cümleye parçadaki yerine göre yaklaşık zaman ver
        const sents = (en.match(/[^.!?]+[.!?]*["')]?/g) || [en]).map((s) => s.trim()).filter(Boolean);
        let pos = 0;
        const add: CapLine[] = sents.map((s) => { const l = { t: Math.max(0, Math.round((t0 + (pos / en.length) * 10) * 10) / 10), en: s }; pos += s.length + 1; return l; });
        setLines((ls) => [...ls, ...add].sort((x, y) => x.t - y.t));
        try {
          const tr = add.length === 1 ? [await translateTr(add[0].en)]
            : (await aiJson<{ tr: string[] }>("Translate English subtitle lines into natural Turkish. Same count and order. Return ONLY JSON.", `Return JSON {"tr": [${add.length} strings]}\n` + add.map((l, i) => `${i + 1}. ${l.en}`).join("\n"), 600)).tr || [];
          setLines((ls) => ls.map((l) => { const k = add.indexOf(l); return k >= 0 && tr[k] ? { ...l, tr: String(tr[k]).replace(/^\d+\.\s*/, "") } : l; }));
        } catch { /* çeviri sonra kaydedilen ekranda yapılabilir */ }
      }).catch((e) => setErr((e as Error).message));
    }
  }

  return (
    <div className="card col" style={{ gap: 8 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <b className="small row" style={{ gap: 6 }}><Captions size={16} /> Canlı döküm + Türkçe (bilgisayarda)</b>
        <div className="row" style={{ gap: 6 }}>
          {!on ? <button className="btn sm primary" onClick={start}><Captions size={15} /> Başlat</button>
            : <button className="btn sm coral" onClick={stop}><Square size={14} /> Durdur</button>}
          {lines.length > 1 && !on && <button className="btn sm mint" onClick={() => onSave(lines)}><Save size={14} /> Kaydet ve çalış</button>}
        </div>
      </div>
      {!on && !lines.length && <div className="muted tiny">Başlat'a bas → açılan pencerede <b>“Bu sekme”</b>yi seç ve <b>“Sekme sesini de paylaş”</b>ı işaretle → videoyu oynat. Söylenenler ~10 sn gecikmeyle İngilizce + Türkçe akar. Bitince “Kaydet ve çalış” ile videoya bağlı çift altyazı olarak saklanır.</div>}
      {err && <div className="small" style={{ color: "var(--coral)", fontWeight: 600 }}>⚠️ {err}</div>}
      {lines.length > 0 && <div ref={box} className="col" style={{ gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {lines.map((l, i) => (
          <div key={i} className="small" style={{ padding: "6px 10px", borderRadius: 10, background: i === lines.length - 1 ? "var(--iris-soft)" : "var(--surface-2, transparent)" }}>
            <span className="muted tiny">{Math.floor(l.t / 60)}:{String(Math.floor(l.t % 60)).padStart(2, "0")} </span>{l.en}
            {l.tr && <div style={{ color: "var(--amber, #c98a00)", fontWeight: 600 }}>{l.tr}</div>}
          </div>
        ))}
      </div>}
      {on && <div className="muted tiny">Dinliyorum… (ilk satır ~10 sn sonra gelir)</div>}
    </div>
  );
}

export function liveSaveToast() { toast("Kaydedildi: Kendi dizin / şarkın bölümünde"); }
