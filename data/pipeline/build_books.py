"""Okuma kitaplığı → app/public/data/books/
- Seviyeli hikâyeler: stories_src.py (Akıcı için yazıldı)
- Klasikler: Project Gutenberg (ABD'de kamu malı). Ham metin data/raw/gutenberg/ altına bir kez indirilir.
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from wordfreq import top_n_list

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stories_src import STORIES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "gutenberg"
OUT = ROOT.parent / "app" / "public" / "data" / "books"
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

BOOKS = [  # (gutenberg id, kısa id, başlık, yazar, Türkçe tanıtım)
    (11, "alice", "Alice's Adventures in Wonderland", "Lewis Carroll", "Alice tavşan deliğinden düşer ve mantığın tersine işlediği bir dünyaya girer."),
    (902, "happy-prince", "The Happy Prince and Other Tales", "Oscar Wilde", "Fedakârlık ve sevgi üzerine dokunaklı kısa masallar."),
    (55, "oz", "The Wonderful Wizard of Oz", "L. Frank Baum", "Dorothy, Korkuluk, Teneke Adam ve Aslan ile Oz'a yolculuk."),
    (2591, "grimm", "Grimm's Fairy Tales", "Brothers Grimm", "Kırmızı Başlıklı Kız, Hansel ve Gretel ve daha fazlası."),
    (16, "peter-pan", "Peter Pan", "J. M. Barrie", "Büyümeyi reddeden çocuk ve Neverland maceraları."),
    (46, "christmas-carol", "A Christmas Carol", "Charles Dickens", "Cimri Scrooge'un bir gecede değişen hayatı."),
    (215, "call-wild", "The Call of the Wild", "Jack London", "Buck adlı köpeğin Alaska'daki hayatta kalma mücadelesi."),
    (35, "time-machine", "The Time Machine", "H. G. Wells", "Bir mucit 802.701 yılına yolculuk eder."),
    (236, "jungle-book", "The Jungle Book", "Rudyard Kipling", "Kurtların büyüttüğü Mowgli ve ormanın kanunları."),
    (1661, "sherlock", "The Adventures of Sherlock Holmes", "Arthur Conan Doyle", "Dünyanın en ünlü dedektifinin 12 vakası."),
    (5200, "metamorphosis", "Metamorphosis", "Franz Kafka (çev. D. Wyllie)", "Gregor Samsa bir sabah dev bir böceğe dönüşmüş olarak uyanır."),
    (1952, "yellow-wallpaper", "The Yellow Wallpaper", "Charlotte Perkins Gilman", "Bir odaya kapatılan kadının zihinsel çözülüşü (kısa öykü)."),
    (120, "treasure-island", "Treasure Island", "Robert Louis Stevenson", "Korsanlar, hazine haritası ve Long John Silver."),
    (1342, "pride-prejudice", "Pride and Prejudice", "Jane Austen", "Elizabeth Bennet ve Bay Darcy: gurur, önyargı ve aşk."),
    (84, "frankenstein", "Frankenstein", "Mary Shelley", "Victor Frankenstein'ın yarattığı yaratık ve sorumluluk."),
]

RANK = {w: i for i, w in enumerate(top_n_list("en", 60000))}
HEAD = re.compile(r"^\s*(?:CHAPTER|Chapter|STAVE|Stave|BOOK|PART|Part)\s+[IVXLC\d]+\b.*$|^\s*(?:[IVXLC]+\.)\s+[A-Z][A-Z ,'’\-]+\s*$")


def level_of(text):
    toks = [t for t in re.findall(r"[a-z]+", text.lower()) if len(t) > 1]
    if not toks:
        return "B1"
    cover = {n: sum(1 for t in toks if RANK.get(t, 99999) < n) / len(toks) for n in (1500, 3000, 6000, 12000)}
    # %95 kapsama hedefi (anlaşılır girdi)
    if cover[1500] >= 0.95:
        return "A2"
    if cover[3000] >= 0.95:
        return "B1"
    if cover[6000] >= 0.95:
        return "B2"
    if cover[12000] >= 0.95:
        return "C1"
    return "C2"


def fetch(gid):
    p = RAW / f"pg{gid}.txt"
    if not p.exists():
        url = f"https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt"
        req = urllib.request.Request(url, headers={"User-Agent": "akici-reader/1.0 (personal, low volume)"})
        p.write_bytes(urllib.request.urlopen(req, timeout=120).read())
        time.sleep(2)  # Gutenberg'e nazik ol
    return p.read_text(encoding="utf-8", errors="replace")


def body(txt):
    s = re.search(r"\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", txt)
    e = re.search(r"\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK", txt)
    return txt[s.end() if s else 0: e.start() if e else len(txt)]


def chapters(text):
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", text.replace("\r", ""))]
    paras = [p.replace("_", "") for p in paras if p and not re.fullmatch(r"[\W\d_]+", p)]
    out, cur = [], None
    for p in paras:
        if HEAD.match(p) and len(p) < 80:
            if cur and sum(len(x) for x in cur["p"]) > 400:
                out.append(cur)
            cur = {"title": re.sub(r"(?i)\b([ivxlc]+)\b(?=[.:]|$)", lambda m: m.group(1).upper(), p.title()) if p.isupper() else p, "p": []}
        elif cur is not None:
            cur["p"].append(p)
    if cur and cur["p"]:
        out.append(cur)
    if len(out) < 2:  # başlık bulunamadı: ~2500 kelimelik parçalara böl
        out, buf, n = [], [], 0
        start = next((i for i, p in enumerate(paras) if len(p) > 200), 0)
        for p in paras[start:]:
            buf.append(p); n += len(p.split())
            if n > 2500:
                out.append({"title": f"Part {len(out) + 1}", "p": buf}); buf, n = [], 0
        if buf:
            out.append({"title": f"Part {len(out) + 1}", "p": buf})
    return out


def main():
    index = []
    for s in STORIES:
        ch = [{"title": s["title"], "p": [a for a, _ in s["paras"]], "tr": [b for _, b in s["paras"]]}]
        (OUT / f"{s['id']}.json").write_text(json.dumps({"meta": None, "chapters": ch}, ensure_ascii=False), encoding="utf-8")
        meta = {"id": s["id"], "title": s["title"], "author": "Lokilingo", "lv": s["lv"], "kind": "story", "chapters": 1,
                "words": sum(len(a.split()) for a, _ in s["paras"]), "blurb": s["blurb"]}
        index.append(meta)
    for gid, sid, title, author, blurb in BOOKS:
        try:
            raw = fetch(gid)
        except Exception as e:
            print("indirilemedi", gid, e)
            continue
        if title.split()[0].lower() not in raw[:3000].lower():
            print("UYARI başlık eşleşmedi:", gid, title)
        chs = chapters(body(raw))
        text = " ".join(" ".join(c["p"]) for c in chs)
        meta = {"id": sid, "title": title, "author": author, "lv": level_of(text), "kind": "book", "chapters": len(chs),
                "words": len(text.split()), "blurb": blurb}
        index.append(meta)
        print(f"{sid:18s} {meta['lv']}  {len(chs):3d} bölüm  {meta['words']:7,d} kelime")
    for m in index:  # meta'yı kitap dosyasına da koy
        p = OUT / f"{m['id']}.json"
        if m["kind"] == "book":
            raw = fetch(next(g for g, s, *_ in BOOKS if s == m["id"]))
            chs = chapters(body(raw))
        else:
            chs = json.loads(p.read_text(encoding="utf-8"))["chapters"]
        p.write_text(json.dumps({"meta": m, "chapters": chs}, ensure_ascii=False), encoding="utf-8")
    order = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4, "C2": 5}
    index.sort(key=lambda m: (m["kind"] != "story", order[m["lv"]], m["words"]))
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(len(index), "kitap/hikâye")


if __name__ == "__main__":
    main()
