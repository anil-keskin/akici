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
    const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
    native.listen = async (lang) => {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") throw new Error("Mikrofon izni verilmedi");
      const r = await SpeechRecognition.start({ language: lang, maxResults: 3, partialResults: false, popup: true });
      const alts = r?.matches || [];
      return { text: alts[0] || "", alts };
    };
  } catch { /* eklenti yok */ }
}
