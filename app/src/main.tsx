import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/fraunces";
import "./styles/global.css";
import App from "./App";
import { loadSettings } from "./lib/settings";
import { initSrs } from "./lib/srs";
import { startStudyClock } from "./lib/stats";
import { setupNative } from "./native";

// Yeni sürüm yüklenince (service worker değişince) sayfayı bir kez yenile: eski sürümde kalınmasın
if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
  setInterval(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => null), 30 * 60 * 1000);
}

(async () => {
  await loadSettings().catch(() => null);
  await initSrs().catch(() => null);
  await setupNative().catch(() => null);
  startStudyClock();
  createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
})();
