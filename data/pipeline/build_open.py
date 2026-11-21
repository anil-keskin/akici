"""Açık lisanslı büyük okuma kitaplığı → app/public/data/books/
- TinyStories (CDLA-Sharing-1.0): 25'lik ciltler, kind="tiny"
- Simple English Wikipedia (CC BY-SA 4.0): 30 makalelik ciltler, kind="wiki"
- Project Gutenberg (ABD'de kamu malı; HF sedthh/gutenberg_english): kind="book"
- Yerel LLM hikâyeleri (gen_stories.json, Türkçe çevirili): kind="story"
build_books.py'den SONRA çalıştırılır; index.json'a ekler (önceki açık kayıtları siler, yeniden üretir).
Çalıştırma: python -I -X utf8 build_open.py
"""
import json
import re
import sys
from pathlib import Path

import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_books import OUT, body, chapters, level_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "open"
ORDER = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4, "C2": 5}
OPEN_KINDS = {"tiny", "wiki", "gen"}


def write(meta, chs):
    (OUT / f"{meta['id']}.json").write_text(json.dumps({"meta": meta, "chapters": chs}, ensure_ascii=False), encoding="utf-8")
    return meta


def tiny(n_vol=200, per=25):
    txt = (RAW / "tinystories-valid.txt").read_text(encoding="utf-8", errors="replace")
    stories = []
    for s in txt.split("<|endoftext|>"):
        s = s.strip()
        paras = [re.sub(r"\s+", " ", p).strip() for p in s.split("\n") if p.strip()]
        w = sum(len(p.split()) for p in paras)
        if 80 <= w <= 400 and not re.search(r"[^\x00-\x7f’‘“”—–…]", s):
            stories.append(paras)
    out = []
    for v in range(min(n_vol, len(stories) // per)):
        chs = []
        for paras in stories[v * per:(v + 1) * per]:
            first = re.sub(r"[^\w' ]", "", " ".join(paras[0].split()[:6]))
            chs.append({"title": first + "…", "p": paras})
        meta = {"id": f"t{v + 1:03d}", "title": f"Little Stories {v + 1}", "author": "TinyStories (CDLA-Sharing-1.0)", "lv": "A1" if v % 2 == 0 else "A2",
                "kind": "tiny", "chapters": len(chs), "words": sum(len(p.split()) for c in chs for p in c["p"]),
                "blurb": f"{per} kısa, çok basit hikâye. Yeni başlayanlar için akıcı okuma pratiği."}
        out.append(write(meta, chs))
    print("tiny", len(out), "cilt", len(out) * per, "hikâye")
    return out


SENSITIVE = re.compile(r"suicid|violen|abuse|sex|rape|murder|kill|terror|porn|drug|genocide|nazi|massacre|torture|abortion|prostitut|slave|weapon|bomb|execution|death penalty|euthanasia|alcohol|cocaine|heroin|\bguns?\b|\bwars?\b|crime|criminal|disease|cancer", re.I)
BAD_WIKI = re.compile(r"\b(commune|municipality|footballer|census|district of|village in|album|discography|population of|is a town in|is a city in the)\b", re.I)


def wiki(n_vol=120, per=30):
    col = pq.read_table(RAW / "simplewiki.parquet", columns=["text"]).column("text").to_pylist()
    arts, cur = [], None
    for row in col:
        row = (row or "").strip()
        if not row:
            continue
        if len(row) < 60 and not re.search(r"[.!?]$", row):
            if cur and 150 <= sum(len(p.split()) for p in cur["p"]) <= 700:
                arts.append(cur)
            cur = {"title": row, "p": []}
        elif cur is not None:
            cur["p"].append(row)
    good = []
    for a in arts:
        t = " ".join(a["p"])
        if BAD_WIKI.search(t[:300]) or SENSITIVE.search(a["title"] + " " + t[:400]) or len(re.findall(r"\d", t)) > len(t) / 40 or not re.match(r"^[A-Z][\w ,'()\-]+$", a["title"]):
            continue
        a["lv"] = level_of(t)
        good.append(a)
    good.sort(key=lambda a: (ORDER[a["lv"]], a["title"]))
    step = max(1, len(good) // (n_vol * per))
    pick = good[::step][: n_vol * per]
    pick.sort(key=lambda a: (ORDER[a["lv"]], a["title"]))
    out = []
    for v in range(len(pick) // per):
        chs = [{"title": a["title"], "p": a["p"]} for a in pick[v * per:(v + 1) * per]]
        lvs = [a["lv"] for a in pick[v * per:(v + 1) * per]]
        lv = max(set(lvs), key=lvs.count)
        meta = {"id": f"w{v + 1:03d}", "title": f"Simple Wiki {v + 1}: {chs[0]['title']} – {chs[-1]['title']}", "author": "Simple English Wikipedia (CC BY-SA 4.0)",
                "lv": lv, "kind": "wiki", "chapters": len(chs), "words": sum(len(p.split()) for c in chs for p in c["p"]),
                "blurb": f"{per} kısa bilgi metni (bilim, tarih, doğa, kültür). Gerçek dünya İngilizcesi."}
        out.append(write(meta, chs))
    print("wiki", len(out), "cilt", len(pick), "makale (aday", len(good), ")")
    return out


SHELF = re.compile(r"Children|Fantasy|Adventure|Detective|Mystery|Science Fiction|Humor|Short Stories|Fairy|Animal|Ghost|Horror|Best Books|Harvard Classics|Movie Books", re.I)


def gutenberg(cap=250):
    pf = pq.ParquetFile(RAW / "gutenberg0.parquet")
    cands = []
    for b in pf.iter_batches(batch_size=50, columns=["TEXT", "METADATA"]):
        for text, md in zip(b.column("TEXT").to_pylist(), b.column("METADATA").to_pylist()):
            m = json.loads(md)
            title = re.sub(r"\s+", " ", m.get("title", "")).strip()
            if m.get("language") != "en" or not SHELF.search(m.get("bookshelves", "") + " " + m.get("subjects", "")) or len(title) > 70:
                continue
            chs = chapters(body(text))
            words = sum(len(p.split()) for c in chs for p in c["p"])
            if not 6000 <= words <= 160000 or len(chs) < 2:
                continue
            au = m.get("authors", "").split(";")[0]
            au = re.sub(r",\s*\d.*$", "", au)
            if "," in au:
                last, first = au.split(",", 1)
                au = f"{first.strip()} {last.strip()}"
            au = re.sub(r"\s*\(.*?\)", "", au).strip() or "Anonymous"
            lv = level_of(" ".join(p for c in chs[:3] for p in c["p"]))
            subj = (m.get("bookshelves") or m.get("subjects") or "").split(";")[0].strip()
            cands.append(({"id": f"gb{m['text_id']}", "title": title, "author": au, "lv": lv, "kind": "book", "chapters": len(chs), "words": words,
                           "blurb": f"Klasik, orijinal metin · {subj}"[:90]}, chs))
    cands.sort(key=lambda x: (ORDER[x[0]["lv"]], x[0]["words"]))
    out = [write(m, c) for m, c in cands[:cap]]
    print("gutenberg", len(out), "kitap (aday", len(cands), ")")
    return out


def gen():
    p = ROOT / "work" / "gen_stories.json"
    if not p.exists():
        return []
    out = []
    for s in json.loads(p.read_text(encoding="utf-8")):
        chs = [{"title": s["title"], "p": [a for a, _ in s["paras"]], "tr": [b for _, b in s["paras"]]}]
        meta = {"id": s["id"], "title": s["title"], "author": "Akıcı AI", "lv": s["lv"], "kind": "story", "chapters": 1,
                "words": sum(len(a.split()) for a, _ in s["paras"]), "blurb": f"Türkçe çevirili · {s['topic']}", "gen": 1}
        out.append(write(meta, chs))
    print("gen", len(out), "hikâye")
    return out


def main():
    idx_p = OUT / "index.json"
    base = [m for m in json.loads(idx_p.read_text(encoding="utf-8")) if m["kind"] in ("story", "book") and not m.get("gen") and not m["id"].startswith("gb")]
    allm = base + gen() + tiny() + wiki() + gutenberg()
    kinds = {"story": 0, "tiny": 1, "wiki": 2, "book": 3}
    allm.sort(key=lambda m: (kinds[m["kind"]], ORDER[m["lv"]], m["words"]))
    idx_p.write_text(json.dumps(allm, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    texts = sum(m["chapters"] if m["kind"] in ("tiny", "wiki") else 1 for m in allm)
    print("TOPLAM", len(allm), "kayıt,", texts, "okuma metni")


if __name__ == "__main__":
    main()
