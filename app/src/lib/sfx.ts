// Özgün ses efektleri (Web Audio ile sentezlenir; dosya yok, telif yok).
import { getSettings } from "./settings";

let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return ctx;
}
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.18) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}
export function sfx(kind: "ok" | "bad" | "done" | "tap" | "level") {
  if (getSettings().sfx === false) return;
  try {
    if (kind === "ok") { tone(784, 0, 0.12, "triangle"); tone(1175, 0.09, 0.22, "triangle"); }
    else if (kind === "bad") { tone(220, 0, 0.18, "sawtooth", 0.08); tone(196, 0.12, 0.25, "sawtooth", 0.07); }
    else if (kind === "tap") tone(660, 0, 0.05, "sine", 0.08);
    else if (kind === "done") [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.3, "triangle"));
    else if (kind === "level") [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.35, "square", 0.06));
  } catch { /* ses yok */ }
}
