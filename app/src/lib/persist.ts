// Sayfa konumunu (filtre, sayfa no) bu cihazda hatırlar: uygulamayı açınca kaldığın yerden devam.
import { useEffect, useRef, useState } from "react";

export function usePersist<T>(key: string, def: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem("pos:" + key); return s ? (JSON.parse(s) as T) : def; } catch { return def; }
  });
  const set = (x: T) => { setV(x); try { localStorage.setItem("pos:" + key, JSON.stringify(x)); } catch { /* yok */ } };
  return [v, set];
}

/** deps değişince fn çalışır, ama ilk açılışta değil (kayıtlı sayfayı sıfırlamasın) */
export function useChangeEffect(fn: () => void, deps: unknown[]) {
  const first = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (first.current) { first.current = false; return; } fn(); }, deps);
}
