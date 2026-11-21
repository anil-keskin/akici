"""Önemli içerik için doğal İngilizce ses üretir (Kokoro, tamamen yerel, Apache-2.0).

Çalıştırma: E:\\AI\\envs\\kokoro\\Scripts\\python.exe -I data\\pipeline\\make_audio.py [--words 3000]
Çıktı: app/public/audio/<özet>.ogg + index.json  (özet = uygulamadaki fnv1a(metin))
Var olan dosyalar atlanır; diyaloglar üretildikçe tekrar çalıştırılabilir.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data"
OUT = ROOT / "app" / "public" / "audio"
MODEL = Path(r"E:\AI\models\kokoro\kokoro-v1.0.onnx")
VOICES = Path(r"E:\AI\models\kokoro\voices-v1.0.bin")


def fnv1a(s: str) -> str:
    h = 0x811C9DC5
    for ch in s.encode("utf-16-le").decode("utf-16-le"):
        for unit in ([ord(ch)] if ord(ch) < 0x10000 else [0xD800 + ((ord(ch) - 0x10000) >> 10), 0xDC00 + ((ord(ch) - 0x10000) & 0x3FF)]):
            h ^= unit
            h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def collect(n_words: int):
    jobs = []  # (metin, ses, hız)
    def add(t, voice="af_heart", speed=1.0):
        t = t.strip()
        if t and len(t) < 600:
            jobs.append((t, voice, speed))
    for s in json.loads((DATA / "scenarios.json").read_text(encoding="utf-8")):
        for en, _ in s["phrases"]:
            add(en)
        for who, en, _ in s.get("dialog", []):
            add(en, "am_michael" if who == "you" else "af_heart")
    for t in json.loads((DATA / "grammar.json").read_text(encoding="utf-8")):
        for en, _ in t["examples"]:
            add(en, "bf_emma")
    for p in sorted((DATA / "books").glob("s-*.json")):
        for ch in json.loads(p.read_text(encoding="utf-8"))["chapters"]:
            for para in ch["p"]:
                add(para, "af_heart", 0.95)
    tsx = (ROOT / "app" / "src" / "pages" / "Speaking.tsx").read_text(encoding="utf-8")
    for block in re.findall(r"s: \[(.*?)\]", tsx, re.S):
        for sent in re.findall(r'"([^"]+)"', block):
            add(sent)
    mp = json.loads((DATA / "minimal-pairs.json").read_text(encoding="utf-8"))
    for pairs in mp.values():
        for a, b in pairs:
            add(a, "am_michael", 0.9); add(b, "am_michael", 0.9)
    words = json.loads((DATA / "words-0.json").read_text(encoding="utf-8"))[:n_words]
    for w in words:
        add(w["w"], "am_michael", 0.9)
    seen, uniq = set(), []
    for j in jobs:
        if j[0] not in seen:
            seen.add(j[0]); uniq.append(j)
    return uniq


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--words", type=int, default=3000)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    idx_path = OUT / "index.json"
    index = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {}
    k = Kokoro(str(MODEL), str(VOICES))
    jobs = collect(a.words)
    print(len(jobs), "metin", flush=True)
    made = 0
    for i, (text, voice, speed) in enumerate(jobs):
        key = fnv1a(text)
        name = f"{key}.ogg"
        if not (OUT / name).exists():
            try:
                samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
                sf.write(OUT / name, samples, sr, format="OGG", subtype="VORBIS")
                made += 1
            except Exception as e:
                print("hata:", text[:40], type(e).__name__, flush=True)
                continue
        index[key] = name
        if (i + 1) % 100 == 0:
            idx_path.write_text(json.dumps(index), encoding="utf-8")
            print(f"{i + 1}/{len(jobs)} (+{made} yeni)", flush=True)
    idx_path.write_text(json.dumps(index), encoding="utf-8")
    print("BİTTİ", len(index), "ses,", made, "yeni")


if __name__ == "__main__":
    main()
