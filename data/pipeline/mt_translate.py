"""Türkçe karşılığı olmayan kelimeleri yerel Ollama (qwen3:8b, CPU) ile çevirir.

- GPU'ya dokunmaz (num_gpu=0): kanal render'larıyla çakışmaz.
- Kaldığı yerden devam eder: data/work/mt_tr.json
- Sonuçlar uygulamada "makine çevirisi" diye işaretlenir.
Çalıştırma: E:\\AI\\envs\\akici\\Scripts\\python.exe -I mt_translate.py
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT.parent / "app" / "public" / "data"
OUT = ROOT / "work" / "mt_tr.json"
BATCH = 40
TR_OK = re.compile(r"^[a-zA-ZçğıöşüâîûÇĞİÖŞÜÂÎÛ ,()'/-]{1,40}$")


def ask(prompt):
    body = json.dumps({"model": "qwen3:8b", "prompt": prompt, "stream": False, "think": False, "format": "json",
                       "options": {"temperature": 0.2, "num_ctx": 8192, "num_predict": 3000}}).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/generate", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(r.read())["response"]


def main():
    words = [x for i in range(4) for x in json.loads((DATA / f"words-{i}.json").read_text(encoding="utf-8"))]
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    here = Path(__file__).parent
    manual = set(json.loads((here / "overrides.json").read_text(encoding="utf-8"))) | set(json.loads((here / "overrides2.json").read_text(encoding="utf-8")))
    todo = [w for w in words if not w["tr"] and w["w"] not in done and w["w"] not in manual]
    print(f"çevrilecek {len(todo)} kelime (önceden {len(done)})", flush=True)
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        lines = "\n".join(f'{w["w"]} ({w["pos"][0] if w["pos"] else ""}): {(w["d"][0]["g"] if w["d"] else "")[:90]}' for w in chunk)
        prompt = ("You are an English–Turkish lexicographer. For each English word below, give 1-3 short, common Turkish "
                  "dictionary equivalents (single words or very short phrases, correct Turkish spelling, no explanations). "
                  "Use the part of speech and definition to choose the right sense. "
                  'Return JSON: {"items": [{"w": "<english word>", "tr": ["...", "..."]}]}\n\n' + lines)
        t = time.time()
        try:
            res = json.loads(ask(prompt)).get("items", [])
        except Exception as e:
            print("hata:", type(e).__name__, e, flush=True)
            time.sleep(10)
            continue
        ok = 0
        want = {w["w"] for w in chunk}
        for it in res:
            w = str(it.get("w", "")).strip().lower()
            trs = [s.strip() for s in it.get("tr", []) if isinstance(s, str) and TR_OK.match(s.strip())]
            if w in want and trs:
                done[w] = trs[:3]
                ok += 1
        OUT.write_text(json.dumps(done, ensure_ascii=False, indent=0), encoding="utf-8")
        print(f"{i + len(chunk)}/{len(todo)}  +{ok}  {time.time() - t:.0f}s", flush=True)
    print("BİTTİ", len(done))


if __name__ == "__main__":
    main()
