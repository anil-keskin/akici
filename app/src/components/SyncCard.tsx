// "Kaldığın yerden devam" kartı: bulut yedeğini aç, kodu sakla (e-postana gönder), başka cihazda kodla geri getir.
import { useEffect, useState } from "react";
import { Cloud, CloudOff, Copy, Mail, RefreshCw, Eye, EyeOff } from "lucide-react";
import { toast } from "./ui";
import { disable, enable, pushNow, restore, syncState, validCode, type SyncState } from "../lib/sync";

export function SyncCard() {
  const [st, setSt] = useState<SyncState | null>(null);
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => syncState().then(setSt);
  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, []);
  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await f(); if (ok) toast(ok); } catch (e) { toast((e as Error).message); }
    setBusy(false); load();
  };
  if (!st) return null;
  const mail = `mailto:?subject=${encodeURIComponent("Lokilingo kurtarma kodum")}&body=${encodeURIComponent(`Lokilingo kurtarma kodum: ${st.code}\n\nYeni telefonda: Sen → Ayarlar → Kaldığın yerden devam → kodu gir.\nBu kodu kimseyle paylaşma.`)}`;
  return (
    <div className="card col" id="yedek" style={{ gap: 10, background: "linear-gradient(135deg, color-mix(in srgb, var(--mint) 12%, var(--surface)), var(--surface))" }}>
      <div className="row" style={{ gap: 10 }}><div className="ico mint"><Cloud /></div><div><b>Kaldığın yerden devam (bulut yedeği)</b>
        <div className="muted small">Telefon değişse ya da uygulama silinse bile ilerlemen kaybolmaz.</div></div></div>
      {st.code ? (
        <>
          <div className="small" style={{ color: st.err ? "var(--coral)" : "var(--mint)", fontWeight: 700 }}>
            {st.err ? `⚠️ Son yedek alınamadı: ${st.err}` : st.at ? `✅ Açık · son yedek ${new Date(st.at).toLocaleString("tr")}` : "Açık"}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="muted small">Kurtarma kodun:</span>
            <code style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1 }}>{show ? st.code : "••••-••••-••••-••••-" + st.code.slice(-4)}</code>
            <button className="btn icon sm ghost" aria-label="Kodu göster" onClick={() => setShow(!show)}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <a className="btn sm primary" href={mail}><Mail size={15} /> Kodu e-postama gönder</a>
            <button className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(st.code).then(() => toast("Kod kopyalandı"))}><Copy size={15} /> Kopyala</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => run(() => pushNow(true), "Yedeklendi")}><RefreshCw size={15} /> Şimdi yedekle</button>
            <button className="btn sm ghost" disabled={busy} onClick={() => { if (confirm("Bulut yedeği kapatılsın ve buluttaki kopyan silinsin mi? Bu cihazdaki ilerlemen kalır.")) run(() => disable(true), "Bulut yedeği silindi"); }}><CloudOff size={15} /> Kapat ve sil</button>
          </div>
          <div className="muted tiny">Bu kodu sakla (en kolayı kendine e-posta at). Kodu bilen ilerlemeni açabilir; kimseyle paylaşma. Eşin kendi telefonunda ayrı bir kod açsın.</div>
        </>
      ) : (
        <>
          <button className="btn primary" disabled={busy} onClick={() => run(async () => { await enable(); setShow(true); }, "Yedekleme açıldı. Kodu e-postana gönder!")}><Cloud size={16} /> Yedeklemeyi aç</button>
          <div className="muted small">Her birkaç dakikada bir kendiliğinden yedeklenir. Hesap, şifre, e-posta istemez.</div>
        </>
      )}
      <details>
        <summary className="small" style={{ cursor: "pointer", fontWeight: 700 }}>Başka cihazdaki ilerlemeni buraya getir</summary>
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <input className="input grow" placeholder="ABCD-EFGH-JKLM-NPQR-STUV" value={code} autoComplete="off" autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} />
          <button className="btn mint" disabled={busy || !validCode(code)} onClick={() => run(async () => { await restore(code); setTimeout(() => location.reload(), 900); }, "İlerlemen geldi!")}>Getir</button>
        </div>
        <div className="muted tiny" style={{ marginTop: 4 }}>Buluttaki ilerleme bu cihazdakiyle birleştirilir; bundan sonra bu cihaz da aynı koda yedeklenir.</div>
      </details>
      <div className="muted tiny">Gizlilik: ilerlemen telefonda koddan türetilen anahtarla şifrelenir; sunucu (Cloudflare) sadece okunamaz bir kutu saklar. İsim/e-posta tutulmaz. 400 gün kullanılmazsa kendiliğinden silinir; “Kapat ve sil” ile hemen silebilirsin.</div>
    </div>
  );
}
