import { useEffect, useState } from "react";
import { Settings as SetI, Download, Upload, Trash2, ShieldCheck, Server, Sparkles, Volume2, Info } from "lucide-react";
import { PageHead, toast } from "../components/ui";
import { saveSettings, useSettings } from "../lib/settings";
import { englishVoices, health, speak, type Health } from "../lib/speech";
import { exportAll, importAll, kvGet, kvSet, wipeAll } from "../lib/db";
import { LEVELS, meta, type Meta } from "../lib/data";

export default function Settings() {
  const s = useSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [h, setH] = useState<Health | null>(null);
  const [name, setName] = useState("");
  const [lv, setLv] = useState("A1");
  const [m, setM] = useState<Meta | null>(null);
  useEffect(() => {
    const load = () => setVoices(englishVoices());
    load(); if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = load;
    health(true).then(setH); kvGet("name", "").then(setName); kvGet("level", "A1").then(setLv); meta().then(setM).catch(() => null);
  }, [s.server]);
  const doExport = async () => {
    const blob = new Blob([await exportAll()], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `akici-yedek-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  const doImport = () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = async () => { const f = inp.files?.[0]; if (!f || f.size > 50e6) return; try { await importAll(await f.text()); toast("Yedek yüklendi"); setTimeout(() => location.reload(), 800); } catch (e) { toast((e as Error).message); } };
    inp.click();
  };
  return (
    <div className="col" style={{ gap: 18, maxWidth: 820 }}>
      <PageHead title="Ayarlar" icon={<div className="ico iris"><SetI /></div>} />
      <Sec t="Profil">
        <Row l="Adın (isteğe bağlı, sadece bu cihazda)"><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => kvSet("name", name.trim())} /></Row>
        <Row l="Seviyen"><select className="input" value={lv} onChange={(e) => { setLv(e.target.value); kvSet("level", e.target.value); }}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Row>
        <Row l="Günlük hedef (XP)"><select className="input" value={s.goalXp} onChange={(e) => saveSettings({ goalXp: Number(e.target.value) })}>
          {[[20, "Rahat · 20"], [50, "Normal · 50"], [100, "Ciddi · 100"], [200, "Yoğun · 200"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        <Row l="Günlük yeni kelime"><input className="input" type="number" min={3} max={60} value={s.dailyNew} onChange={(e) => saveSettings({ dailyNew: Math.max(3, Math.min(60, Number(e.target.value))) })} /></Row>
        <Row l="Tema"><select className="input" value={s.theme} onChange={(e) => saveSettings({ theme: e.target.value as "auto" })}><option value="auto">Sistem</option><option value="light">Açık</option><option value="dark">Koyu</option></select></Row>
        <Row l="Argo/küfür kelimelerini göster"><input type="checkbox" checked={s.showVulgar} onChange={(e) => saveSettings({ showVulgar: e.target.checked })} /></Row>
      </Sec>

      <Sec t="Ses" i={<Volume2 />}>
        <Row l="Aksan"><select className="input" value={s.accent} onChange={(e) => saveSettings({ accent: e.target.value as "en-US", voiceURI: "" })}><option value="en-US">Amerikan</option><option value="en-GB">İngiliz</option></select></Row>
        <Row l="Ses"><select className="input" value={s.voiceURI} onChange={(e) => saveSettings({ voiceURI: e.target.value })}>
          <option value="">Otomatik (en doğal olanı)</option>
          {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></Row>
        <Row l={`Konuşma hızı · ${s.rate}×`}><input type="range" min={0.5} max={1.3} step={0.05} value={s.rate} onChange={(e) => saveSettings({ rate: Number(e.target.value) })} /></Row>
        <Row l="Otomatik seslendir"><input type="checkbox" checked={s.autoplay} onChange={(e) => saveSettings({ autoplay: e.target.checked })} /></Row>
        <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => speak("Hello! This is how I sound. Practice makes perfect.")}>Sesi dene</button>
        <Row l="Konuşma tanıma"><select className="input" value={s.stt} onChange={(e) => saveSettings({ stt: e.target.value as "auto" })}>
          <option value="auto">Otomatik (önce yerel Whisper)</option><option value="whisper">Sadece yerel Whisper (gizli)</option><option value="browser">Tarayıcı (Google/Microsoft)</option></select></Row>
      </Sec>

      <Sec t="Yerel sunucu" i={<Server />}>
        <div className="small" style={{ color: h?.ok ? "var(--mint)" : "var(--coral)", fontWeight: 700 }}>
          {h?.ok ? `Bağlı · Whisper: ${h.whisper} · Ollama: ${h.ollama ? "açık" : "kapalı"}` : "Bağlı değil (uygulama yine çalışır; AI sohbet ve yerel puanlama kapalı)."}
        </div>
        <Row l="Sunucu adresi (boş = bu adres)"><input className="input" placeholder="ör. http://192.168.1.20:8790" value={s.server} onChange={(e) => saveSettings({ server: e.target.value.trim() })} /></Row>
        <Row l="Erişim kodu (sadece LAN/telefon modu)"><input className="input" value={s.serverToken} onChange={(e) => saveSettings({ serverToken: e.target.value.trim() })} /></Row>
        <div className="muted tiny">Telefondan bağlanmak için bilgisayarda <b>baslat-lan.bat</b> çalıştır; ekranda yazan adresi ve kodu buraya gir.</div>
      </Sec>

      <Sec t="Yapay zekâ" i={<Sparkles />}>
        <Row l="Sağlayıcı"><select className="input" value={s.aiProvider} onChange={(e) => {
          const p = e.target.value as "local";
          saveSettings({ aiProvider: p, aiModel: p === "local" ? "qwen3:8b" : p === "anthropic" ? "claude-haiku-5-5" : "gpt-4o-mini" });
        }}>
          <option value="local">Yerel (Ollama) — ücretsiz, veri bilgisayardan çıkmaz</option>
          <option value="anthropic">Anthropic Claude — kendi anahtarın</option>
          <option value="openai">OpenAI uyumlu — kendi anahtarın</option>
        </select></Row>
        <Row l="Model"><input className="input" value={s.aiModel} onChange={(e) => saveSettings({ aiModel: e.target.value.trim() })} /></Row>
        {s.aiProvider === "openai" && <Row l="API adresi"><input className="input" value={s.aiBase} onChange={(e) => saveSettings({ aiBase: e.target.value.trim() })} /></Row>}
        {s.aiProvider !== "local" && (
          <>
            <Row l="API anahtarı"><input className="input" type="password" autoComplete="off" value={s.aiKey} onChange={(e) => saveSettings({ aiKey: e.target.value.trim() })} /></Row>
            <div className="card small" style={{ background: "var(--amber-soft)" }}>
              ⚠️ Bulut sağlayıcı seçince yazdıkların yurtdışındaki sunuculara gider (KVKK md. 9: yurtdışına aktarım). Kişisel bilgi (TC no, adres, sağlık) yazma.
              Anahtar sadece bu cihazda saklanır, yedeğe girmez; ama cihazına erişen biri görebilir. Harcama limiti koyduğun bir anahtar kullan.
            </div>
          </>
        )}
      </Sec>

      <Sec t="Gizlilik ve veriler (KVKK)" i={<ShieldCheck />}>
        <div className="small sub" style={{ lineHeight: 1.7 }}>
          <b>Aydınlatma:</b> Akıcı'nın hesabı, sunucu veritabanı, çerezi ve analitiği yoktur. İlerlemen, kartların ve sohbet geçmişin <b>sadece bu cihazda</b> (tarayıcı veritabanı) tutulur.
          Mikrofon sadece konuşma alıştırmasında açılır; yerel sunucu açıksa ses bu bilgisayarda Whisper ile çözülür ve kalıcı kaydedilmez. Sunucu kapalıysa tarayıcının konuşma tanıması kullanılır (Chrome: Google, Edge: Microsoft).
          AI sohbette yerel model seçiliyse metin bilgisayardan çıkmaz; bulut sağlayıcı seçersen metin o sağlayıcıya gider. İstediğin an verilerini dışa aktarabilir ya da tamamen silebilirsin (KVKK md. 11).
        </div>
        <div className="row wrap">
          <button className="btn ghost" onClick={doExport}><Download size={16} /> Yedeği indir</button>
          <button className="btn ghost" onClick={doImport}><Upload size={16} /> Yedekten yükle</button>
          <button className="btn ghost" onClick={async () => { await kvSet("micConsent", false); toast("Mikrofon onayı geri alındı"); }}>Mikrofon onayını geri al</button>
          <button className="btn coral" onClick={async () => { if (confirm("Tüm ilerlemen, kartların ve ayarların bu cihazdan kalıcı olarak silinecek. Emin misin?")) { await wipeAll(); location.href = location.pathname; } }}><Trash2 size={16} /> Tüm verilerimi sil</button>
        </div>
      </Sec>

      <Sec t="Hakkında ve lisanslar" i={<Info />}>
        <div className="small sub" style={{ lineHeight: 1.7 }}>
          {m && <>İçerik: {m.words.toLocaleString("tr")} kelime, {m.sentences.toLocaleString("tr")} cümle, {m.phrases.toLocaleString("tr")} kalıp.<br /></>}
          Kelime sıklığı: <b>wordfreq</b> (Robyn Speer, veri CC BY-SA 4.0). Sözlük: <b>Vikisözlük / Wiktionary</b> İngilizce ve Türkçe sürümleri, kaikki.org çıkarımı (CC BY-SA 4.0).
          Cümleler: <b>Tatoeba</b> (CC BY 2.0 FR, tatoeba.org katkıcıları). Telaffuz: <b>CMU Pronouncing Dictionary</b> (BSD). Kitaplar: <b>Project Gutenberg</b> (ABD'de telifsiz).
          Aralıklı tekrar: <b>ts-fsrs</b> (MIT). "makine çevirisi" etiketli karşılıklar yerel yapay zekâ ile üretildi, hata içerebilir.
          Seviyeli hikâyeler, gramer anlatımları ve senaryolar Akıcı için yazıldı.
        </div>
      </Sec>
    </div>
  );
}
function Sec({ t, i, children }: { t: string; i?: React.ReactNode; children: React.ReactNode }) {
  return <div className="card col" style={{ gap: 12 }}><div className="row">{i}<div className="h3">{t}</div></div>{children}</div>;
}
function Row({ l, children }: { l: string; children: React.ReactNode }) {
  return <label className="row between wrap" style={{ gap: 12 }}><span className="small" style={{ fontWeight: 650, minWidth: 180 }}>{l}</span><div style={{ flex: "1 1 260px", maxWidth: 420, display: "flex", justifyContent: "flex-end" }}>{children}</div></label>;
}
