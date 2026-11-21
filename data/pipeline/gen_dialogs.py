"""Her senaryo için 8-12 satırlık örnek diyalog üretir (yerel Ollama, qwen3:8b).
GPU boşsa GPU, değilse CPU kullanır (AKICI_GPU=1 ile GPU zorlanır). Kaldığı yerden devam eder → work/dialogs.json
"""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_scenarios import parse  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work" / "dialogs.json"


def ask(prompt):
    opts = {"temperature": 0.6, "num_ctx": 4096, "num_predict": 1800}
    if os.environ.get("AKICI_GPU") != "1":
        opts["num_gpu"] = 0
    body = json.dumps({"model": "qwen3:8b", "prompt": prompt, "stream": False, "think": False, "format": "json", "options": opts}).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/generate", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=1800) as r:
        return json.loads(r.read())["response"]


def ok_line(x):
    return (isinstance(x, list) and len(x) == 3 and x[0] in ("you", "ai") and isinstance(x[1], str) and isinstance(x[2], str)
            and 2 <= len(x[1]) <= 220 and 1 <= len(x[2]) <= 260 and not re.search(r"[<>{}]", x[1] + x[2]))


def main():
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for s in parse():
        if s["id"] in done:
            continue
        phrases = "; ".join(p[0] for p in s["phrases"])
        prompt = (
            f"Write a natural, realistic English dialogue for language learners at CEFR {s['lv']} level.\n"
            f"Scenario: {s['en']}. Setting: {s['setting']}. Speaker 'you' = {s['you']}. Speaker 'ai' = {s['ai']}.\n"
            f"Goal: the learner should achieve this (Turkish description): {s['goal']}\n"
            f"Naturally use some of these phrases: {phrases}\n"
            "Rules: 8 to 12 lines, alternate speakers, start with whoever would naturally speak first, short natural sentences matching the level, "
            "no names of real brands or people. For each line give a natural Turkish translation (correct Turkish grammar and spelling).\n"
            'Return JSON: {"lines": [["you" or "ai", "English line", "Türkçe çeviri"], ...]}'
        )
        t = time.time()
        try:
            lines = [x for x in json.loads(ask(prompt)).get("lines", []) if ok_line(x)]
        except Exception as e:
            print(s["id"], "hata:", type(e).__name__, e, flush=True)
            continue
        if 6 <= len(lines) <= 14:
            done[s["id"]] = lines
            OUT.write_text(json.dumps(done, ensure_ascii=False, indent=0), encoding="utf-8")
        print(f"{s['id']}: {len(lines)} satır, {time.time() - t:.0f}s", flush=True)
    print("BİTTİ", len(done))


if __name__ == "__main__":
    main()
