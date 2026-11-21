// Cevap karşılaştırma: noktalama/büyük harf/kısaltma toleransı + yazım hatası payı.
const CONTRACT: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"], [/\bwon't\b/g, "will not"], [/\bshan't\b/g, "shall not"], [/\b(\w+)n't\b/g, "$1 not"],
  [/\bi'm\b/g, "i am"], [/\b(\w+)'re\b/g, "$1 are"], [/\b(\w+)'ve\b/g, "$1 have"], [/\b(\w+)'ll\b/g, "$1 will"], [/\b(\w+)'d\b/g, "$1 would"],
  [/\b(it|he|she|that|there|what|who|where|here)'s\b/g, "$1 is"],
];
export function norm(s: string, expand = true): string {
  let t = s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').normalize("NFC");
  if (expand) for (const [re, r] of CONTRACT) t = t.replace(re, r);
  return t.replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
}
export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export type Verdict = "ok" | "typo" | "bad";
/** Birden çok doğru cevap olabilir (Türkçe anlamlar gibi). */
export function check(input: string, answers: string[]): { v: Verdict; best: string } {
  const a = norm(input);
  if (!a) return { v: "bad", best: answers[0] };
  let best = answers[0], bestD = 1e9;
  for (const ans of answers) {
    for (const variant of ans.split(/[,;/]| veya /).map((x) => x.replace(/\(.*?\)/g, "").trim()).filter(Boolean).concat([ans])) {
      const b = norm(variant);
      if (!b) continue;
      if (a === b) return { v: "ok", best: ans };
      const d = lev(a, b);
      if (d < bestD) { bestD = d; best = ans; }
    }
  }
  const tol = norm(best).length <= 4 ? 0 : norm(best).length <= 8 ? 1 : 2;
  return { v: bestD <= tol ? "typo" : "bad", best };
}

/** Kelime düzeyi hizalama (dikte/telaffuz): hedef kelimelerin her birine durum verir. */
export type WState = "ok" | "bad" | "miss";
export function alignWords(target: string, heard: string): { w: string; s: WState; heard?: string }[] {
  const T = target.split(/\s+/).filter(Boolean);
  const tn = T.map((w) => norm(w, false));
  const hn = norm(heard, false).split(" ").filter(Boolean);
  const m = tn.length, n = hn.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  const cost = (a: string, b: string) => (a === b ? 0 : lev(a, b) <= Math.max(1, Math.floor(a.length / 4)) ? 0.4 : 1);
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost(tn[i - 1], hn[j - 1]));
  const out: { w: string; s: WState; heard?: string }[] = [];
  let i = m, j = n;
  while (i > 0) {
    if (j > 0 && dp[i][j] === dp[i - 1][j - 1] + cost(tn[i - 1], hn[j - 1])) {
      const c = cost(tn[i - 1], hn[j - 1]);
      out.unshift({ w: T[i - 1], s: c === 0 || c === 0.4 ? (c === 0 ? "ok" : "ok") : "bad", heard: hn[j - 1] });
      i--; j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) { j--; }
    else { out.unshift({ w: T[i - 1], s: "miss" }); i--; }
  }
  return out;
}
export function scoreOf(al: { s: WState }[]): number {
  if (!al.length) return 0;
  return Math.round((al.filter((x) => x.s === "ok").length / al.length) * 100);
}
