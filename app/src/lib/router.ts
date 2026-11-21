// Küçük hash yönlendirici (react-router yerine: bir bağımlılık ve güvenlik açığı daha az).
import { useEffect, useState } from "react";

export function parseHash(): { path: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, q = ""] = raw.split("?");
  return { path: path || "/", params: new URLSearchParams(q) };
}

export function useRoute() {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const on = () => { setR(parseHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}

export function go(path: string) {
  location.hash = path.startsWith("#") ? path : "#" + path;
}

export function back(fallback = "/") {
  if (history.length > 1) history.back();
  else go(fallback);
}
