// Android (Capacitor) köprüsü. Tarayıcıda hiçbir şey yapmaz.
import { native } from "./lib/speech";

export async function setupNative() {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;
  try {
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
    native.speak = async (text, lang, rate) => { await TextToSpeech.speak({ text, lang, rate, pitch: 1, volume: 1, category: "playback" }); };
    native.stopSpeak = async () => { await TextToSpeech.stop(); };
  } catch { /* eklenti yok */ }
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      const h = location.hash.replace(/^#/, "") || "/";
      // Açık bir pencere (alt sayfa) varsa önce onu kapat
      const sheet = document.querySelector<HTMLElement>(".sheet-back");
      if (sheet) { sheet.click(); return; }
      window.dispatchEvent(new CustomEvent("akici-back"));
      if (h === "/" ) App.minimizeApp();
      else if (history.length > 1) history.back();
      else location.hash = "#/";
    });
  } catch { /* eklenti yok */ }
  try {
    const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
    const ensurePerm = async () => {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") throw new Error("Mikrofon izni verilmedi");
    };
    native.listen = async (lang) => {
      await ensurePerm();
      const r = await SpeechRecognition.start({ language: lang, maxResults: 3, partialResults: false, popup: false });
      const alts = r?.matches || [];
      return { text: alts[0] || "", alts };
    };
    // Google penceresi açmadan dinle: ara sonuçlar canlı gelir, susunca biter
    native.listenStart = async (lang, onPartial, onEnd) => {
      await ensurePerm();
      await SpeechRecognition.removeAllListeners();
      await SpeechRecognition.addListener("partialResults", (d: { matches?: string[] }) => { if (d?.matches?.[0]) onPartial(d.matches[0]); });
      await SpeechRecognition.addListener("listeningState", (d: { status?: string }) => { if (d?.status === "stopped") onEnd(); });
      await SpeechRecognition.start({ language: lang, maxResults: 3, partialResults: true, popup: false });
    };
    native.listenStop = async () => { try { await SpeechRecognition.stop(); } catch { /* zaten durdu */ } };
  } catch { /* eklenti yok */ }
}
