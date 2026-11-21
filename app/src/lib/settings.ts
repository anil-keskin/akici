import { useEffect, useState } from "react";
import { kvGet, kvSet } from "./db";

export interface Settings {
  theme: "auto" | "light" | "dark";
  accent: "en-US" | "en-GB";
  voiceURI: string;
  rate: number;
  stt: "auto" | "whisper" | "browser";
  server: string;            // boş = aynı adres (yerel sunucu)
  serverToken: string;       // LAN modu erişim kodu
  aiProvider: "akici" | "local" | "openai" | "anthropic";
  aiModel: string;
  aiBase: string;            // OpenAI uyumlu taban adres
  aiKey: string;             // sadece bu cihazda
  showVulgar: boolean;
  dailyNew: number;
  goalXp: number;
  autoplay: boolean;
  trHints: boolean;
  sfx: boolean;
}
export const DEFAULTS: Settings = {
  theme: "auto", accent: "en-US", voiceURI: "", rate: 1, stt: "auto", server: "", serverToken: "",
  aiProvider: "local", aiModel: "qwen3:8b", aiBase: "https://api.openai.com/v1", aiKey: "", showVulgar: false,
  dailyNew: 15, goalXp: 50, autoplay: true, trHints: true, sfx: true,
};
let current: Settings = { ...DEFAULTS };
const subs = new Set<(s: Settings) => void>();

export async function loadSettings() {
  const s = await kvGet<Partial<Settings>>("settings", {});
  current = { ...DEFAULTS, ...s };
  // İlk açılış: bilgisayardaki yerel sunucuda değilsek hazır Loki AI'yı kullan
  if (!s.aiProvider) {
    const { AKICI_AI } = await import("./ai");
    const onPc = /^(127\.|localhost|192\.168\.|10\.|172\.)/.test(location.hostname) && location.protocol === "http:";
    if (AKICI_AI && !onPc) current = { ...current, aiProvider: "akici", aiModel: "akici" };
  }
  applyTheme();
  return current;
}
export function getSettings() { return current; }
export async function saveSettings(p: Partial<Settings>) {
  current = { ...current, ...p };
  await kvSet("settings", current);
  if (p.goalXp !== undefined) await kvSet("goalXp", p.goalXp);
  applyTheme();
  subs.forEach((f) => f(current));
}
export function useSettings(): Settings {
  const [s, set] = useState(current);
  useEffect(() => { subs.add(set); return () => { subs.delete(set); }; }, []);
  return s;
}
function applyTheme() {
  const el = document.documentElement;
  if (current.theme === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", current.theme);
}
