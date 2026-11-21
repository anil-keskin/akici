"""Dizi & Şarkı modülü verisi → app/public/data/media/
- songs.json, expr.json: media_src.txt (özgün + kamu malı şarkılar, konuşma kalıpları)
- dd-N.json: DailyDialog (CC BY-NC-SA 4.0, ticari olmayan kullanım), 500'lük parçalar + dd-index.json
Çalıştırma: python -I -X utf8 build_media.py
"""
import json
import re
import sys
from pathlib import Path

import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_books import level_of  # noqa: E402

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "raw" / "open"
OUT = HERE.parents[1] / "app" / "public" / "data" / "media"
OUT.mkdir(parents=True, exist_ok=True)


def src():
    songs, expr, cat = [], [], ""
    for ln in (HERE / "media_src.txt").read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if not ln or (ln.startswith("#") and not ln.startswith("##")):
            continue
        if ln.startswith("== "):
            sid, title, lv, by = [x.strip() for x in ln[3:].split("|")]
            songs.append({"id": sid, "title": title, "lv": lv, "by": by, "lines": []})
        elif ln.startswith("## "):
            cat = ln[3:].strip()
        elif cat:
            en, tr, note = [x.strip() for x in ln.split("|")]
            expr.append({"en": en, "tr": tr, "note": note, "cat": cat})
        else:
            en, tr = [x.strip() for x in ln.split(" = ", 1)]
            songs[-1]["lines"].append([en, tr])
    return songs, expr


def fix(u):
    u = re.sub(r"\s+([,.!?;:])", r"\1", u.strip())
    u = re.sub(r"\s+'\s*", "'", u).replace(" ’ ", "'")
    u = re.sub(r"'(Ve|Ll|Re|S|D|M|T)\b", lambda m: "'" + m.group(1).lower(), u)
    return re.sub(r"\s+", " ", u)


def dailydialog(per=500):
    dlg = []
    for part in ("train", "validation", "test"):
        for row in pq.read_table(RAW / f"dd-{part}.parquet", columns=["utterances", "topic"] if False else ["utterances"]).column("utterances").to_pylist():
            lines = [fix(u) for u in row if u and u.strip()]
            if 4 <= len(lines) <= 14 and all(len(x) < 300 for x in lines):
                dlg.append(lines)
    seen, uniq = set(), []
    for d in dlg:
        k = d[0].lower()[:60]
        if k not in seen:
            seen.add(k); uniq.append(d)
    order = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4, "C2": 5}
    items = sorted(({"lv": level_of(" ".join(d)), "l": d} for d in uniq), key=lambda x: (order[x["lv"]], len(" ".join(x["l"]))))
    for x in items:
        x["lv"] = {"A2": "A2", "B1": "B1"}.get(x["lv"], "A2" if order[x["lv"]] < 1 else "B2")
    index = []
    for i in range(0, len(items), per):
        ch = items[i:i + per]
        n = i // per
        (OUT / f"dd-{n}.json").write_text(json.dumps(ch, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index.append({"n": n, "count": len(ch), "lv": ch[len(ch) // 2]["lv"], "first": ch[0]["l"][0][:60]})
    (OUT / "dd-index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    return len(items)


def main():
    songs, expr = src()
    (OUT / "songs.json").write_text(json.dumps(songs, ensure_ascii=False), encoding="utf-8")
    (OUT / "expr.json").write_text(json.dumps(expr, ensure_ascii=False), encoding="utf-8")
    n = dailydialog()
    print(len(songs), "şarkı,", sum(len(s["lines"]) for s in songs), "dize;", len(expr), "kalıp;", n, "diyalog")


if __name__ == "__main__":
    main()
