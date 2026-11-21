"""Seviyeli okuma hikâyeleri üretir (yerel Ollama, qwen3:8b). Paragraf paragraf İngilizce + Türkçe.
Kaldığı yerden devam eder → data/work/gen_stories.json.  Çalıştırma: python -I gen_stories.py [--n 600]
"""
import argparse
import itertools
import json
import random
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "work" / "gen_stories.json"

TOPICS = ["a lost wallet", "first day at a new job", "a trip to the mountains", "a birthday surprise", "a cooking disaster", "a missed flight",
          "a new neighbour", "learning to drive", "a football match", "a rainy weekend", "a job interview", "a strange phone call", "a street cat",
          "moving to another country", "a family dinner", "a broken phone", "a school exam", "an old photograph", "a night at the hospital",
          "a summer festival", "a small business", "a mystery in the library", "a train journey", "online shopping gone wrong", "a wedding",
          "a camping trip", "a robot assistant", "a time traveller", "a village by the sea", "an unexpected friendship", "a marathon",
          "a doctor's advice", "a museum night", "a lost dog", "a power cut", "a snowstorm", "a talent show", "a language exchange",
          "a hotel mistake", "saving money", "a difficult boss", "grandparents' stories", "a fishing trip", "a new smartphone app",
          "a cyclist crossing a country", "a market in Istanbul", "a ghost story", "a scientist's discovery", "an earthquake drill",
          "a chess tournament", "a first date", "a car breakdown", "a volunteer at a shelter", "a cooking class", "a stolen bicycle",
          "a picnic in the park", "an island holiday", "a hackathon", "a writer's block", "a musician's first concert", "a lottery ticket",
          "a parrot that talks", "a secret recipe", "a lighthouse keeper", "a space mission", "a detective case", "climate change in a town",
          "a farm in winter", "a film set", "a bakery at dawn", "a podcast interview", "a city at night", "a kind stranger", "a lost passport"]
LEVELS = {"A1": "very simple present tense, short sentences, the 600 most common words", "A2": "simple past and present, short sentences, common words",
          "B1": "varied tenses, everyday vocabulary, some dialogue", "B2": "natural style, richer vocabulary, some idioms"}


def ask(prompt):
    body = json.dumps({"model": "qwen3:8b", "prompt": prompt, "stream": False, "think": False, "format": "json", "keep_alive": "30m",
                       "options": {"temperature": 0.85, "num_ctx": 4096, "num_predict": 2200}}).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/generate", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(r.read())["response"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=600)
    a = ap.parse_args()
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else []
    combos = list(itertools.product(LEVELS, TOPICS))
    random.seed(7)
    random.shuffle(combos)
    have = {(s["lv"], s["topic"]) for s in done}
    for lv, topic in combos * 3:
        if len(done) >= a.n:
            break
        if (lv, topic) in have and sum(1 for s in done if s["lv"] == lv and s["topic"] == topic) >= 2:
            continue
        prompt = (f"Write an original short story for English learners at CEFR {lv} ({LEVELS[lv]}). Topic: {topic}. "
                  f"Make it engaging with a small surprise or emotional moment, {('4' if lv in ('A1','A2') else '5')} paragraphs of 40-80 words. "
                  "Give a short catchy English title. For EACH paragraph also give a natural, correct Turkish translation. No real brands or celebrities.\n"
                  'Return JSON: {"title": "...", "paras": [["English paragraph", "Türkçe çeviri"], ...]}')
        t = time.time()
        try:
            d = json.loads(ask(prompt))
            paras = [p for p in d.get("paras", []) if isinstance(p, list) and len(p) == 2 and 60 < len(p[0]) < 900 and len(p[1]) > 30]
            title = str(d.get("title", "")).strip()[:80]
        except Exception as e:
            print("hata", type(e).__name__, flush=True)
            continue
        if len(paras) < 3 or not title or re.search(r"[<>{}]", title):
            continue
        done.append({"id": f"g{len(done) + 1:04d}", "lv": lv, "topic": topic, "title": title, "paras": paras})
        have.add((lv, topic))
        OUT.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
        print(f"{len(done)} {lv} {title} ({time.time() - t:.0f}s)", flush=True)
    print("BİTTİ", len(done))


if __name__ == "__main__":
    main()
