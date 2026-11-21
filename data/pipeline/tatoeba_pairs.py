"""Tatoeba (CC BY 2.0 FR) İngilizce–Türkçe cümle çiftleri + zorluk seviyesi.

Çıktı: data/work/pairs.jsonl  {id, en, tr, n (kelime sayısı), r (en nadir kelimenin sıklık sırası), lv}
Seviye: cümledeki en nadir kelimenin sıklık sırası + uzunluk.
"""
import bz2
import csv
import re
import sys
from pathlib import Path

import orjson
from wordfreq import top_n_list

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"
OUT = ROOT / "work" / "pairs.jsonl"
OUT.parent.mkdir(exist_ok=True)
csv.field_size_limit(10**7)

RANK = {w: i + 1 for i, w in enumerate(top_n_list("en", 200000))}
TOKEN = re.compile(r"[a-z]+(?:'[a-z]+)?")
BAD = re.compile(r"[\[\]{}<>@#|\\_*~^]|https?:")
LEVELS = [("A1", 800, 7), ("A2", 2000, 10), ("B1", 4500, 14), ("B2", 9000, 18), ("C1", 20000, 24), ("C2", 10**9, 40)]


def read(name):
    with bz2.open(RAW / name, "rt", encoding="utf-8", newline="") as f:
        for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            yield row


def level(words):
    ranks = []
    for w in words:
        base = w.split("'")[0]
        r = RANK.get(w) or RANK.get(base) or 200000
        ranks.append(r)
    hardest = max(ranks) if ranks else 0
    n = len(words)
    for lv, rmax, nmax in LEVELS:
        if hardest <= rmax and n <= nmax:
            return lv, hardest
    return "C2", hardest


def main():
    tur = {int(r[0]): r[2] for r in read("tur_sentences.tsv.bz2") if len(r) >= 3}
    eng = {int(r[0]): r[2] for r in read("eng_sentences.tsv.bz2") if len(r) >= 3}
    print("eng", len(eng), "tur", len(tur), flush=True)
    links = {}
    for r in read("eng-tur_links.tsv.bz2"):
        a, b = int(r[0]), int(r[1])
        if a in eng and b in tur:
            links.setdefault(a, b)
    print("eng->tur bağlantısı", len(links), flush=True)
    seen = set()
    n = 0
    counts = {}
    with OUT.open("wb") as out:
        for eid, tid in sorted(links.items()):
            en, tr = eng[eid].strip(), tur[tid].strip()
            key = en.lower()
            if key in seen or BAD.search(en) or BAD.search(tr):
                continue
            raw = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", en)
            words = [w.lower() for w in raw]
            # Özel isimler (cümle ortasında büyük harfle başlayan) seviyeyi etkilemesin
            content = [w.lower() for i, w in enumerate(raw) if i == 0 or w == "I" or not w[0].isupper()]
            if not 2 <= len(words) <= 30 or len(en) > 220:
                continue
            seen.add(key)
            lv, hardest = level(content)
            counts[lv] = counts.get(lv, 0) + 1
            out.write(orjson.dumps({"id": eid, "en": en, "tr": tr, "n": len(words), "r": hardest, "lv": lv}) + b"\n")
            n += 1
    print("yazıldı", n, counts)


if __name__ == "__main__":
    main()
