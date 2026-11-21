"""Kaikki (English Wiktionary, CC BY-SA 4.0) dökümünden sadece gereken alanları süzer.

Girdi : data/raw/kaikki-en.jsonl.gz (~3.4 GB açık)
Çıktı : data/work/wikt.jsonl  — her satır bir (kelime, tür) girdisi, küçültülmüş

Tek geçiş; tek kelimelerde wordfreq ilk 120k formu, çok kelimelilerde deyim/phrasal/kalıp olanlar tutulur.
"""
import gzip
import json
import re
import sys
from pathlib import Path

import orjson
from wordfreq import top_n_list, zipf_frequency

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "kaikki-en.jsonl.gz"
OUT = ROOT / "work" / "wikt.jsonl"
OUT.parent.mkdir(exist_ok=True)

TOP = set(top_n_list("en", 250000))
NAMES_OUT = ROOT / "work" / "names.txt"
names = set()
SKIP_TAGS = {"obsolete", "archaic", "rare", "dated", "historical", "nonstandard", "misspelling", "dialectal", "Scotland", "pronunciation-spelling"}
FLAG_TAGS = {"vulgar", "offensive", "derogatory", "slur", "slang", "informal", "colloquial", "British", "US", "formal", "idiomatic", "figuratively"}
MW_CATS = re.compile(r"English (phrasal verbs|idioms|proverbs|similes|collocations|phrasebook|interjections|prepositional phrases|catchphrases|set phrases|discourse markers|binomial)", re.I)
GOOD_POS = {"noun", "verb", "adj", "adv", "pron", "prep", "conj", "det", "intj", "num", "phrase", "prep_phrase", "proverb", "particle", "article", "contraction", "postp"}


def pick_ipa(sounds):
    best = None
    for s in sounds or []:
        ipa = s.get("ipa")
        if not ipa or not ipa.startswith("/"):
            continue
        tags = set(s.get("tags", []))
        if "General-American" in tags or "US" in tags:
            return ipa
        if best is None:
            best = ipa
    return best


def tr_words(entry):
    out = []
    for t in entry.get("translations", []) or []:
        if t.get("code") == "tr" and t.get("word"):
            out.append((t["word"], t.get("sense", "")))
    for s in entry.get("senses", []) or []:
        for t in s.get("translations", []) or []:
            if t.get("code") == "tr" and t.get("word"):
                out.append((t["word"], t.get("sense", "")))
    seen, res = set(), []
    for w, sense in out:
        if w not in seen:
            seen.add(w)
            res.append({"w": w, "s": sense[:60]})
    return res[:8]


def main():
    n_in = n_out = 0
    with gzip.open(RAW, "rb") as f, OUT.open("wb") as out:
        for line in f:
            n_in += 1
            if n_in % 200000 == 0:
                print(f"{n_in:,} okundu, {n_out:,} yazıldı", flush=True)
            # hızlı ön eleme: Türkçe çevirisi ya da top listesinde olabilecek kelime
            d = orjson.loads(line)
            if d.get("lang_code") != "en":
                continue
            word = d.get("word", "")
            pos = d.get("pos", "")
            if pos == "name" and word[:1].isupper() and " " not in word:
                names.add(word.lower())
            if pos not in GOOD_POS or not word or len(word) > 40:
                continue
            multi = " " in word
            cats = [c if isinstance(c, str) else c.get("name", "") for c in d.get("categories", []) or []]
            for s in d.get("senses", []) or []:
                cats += [c if isinstance(c, str) else c.get("name", "") for c in s.get("categories", []) or []]
            if multi:
                if not (any(MW_CATS.search(c) for c in cats) or pos in ("phrase", "prep_phrase", "proverb")):
                    if not (pos == "verb" and len(word.split()) == 2):
                        continue
                if zipf_frequency(word, "en") < 1.5:
                    continue
            else:
                if word.lower() not in TOP:
                    continue
            senses = []
            form_of = None
            flags = set()
            for s in d.get("senses", []) or []:
                tags = set(s.get("tags", []))
                if s.get("form_of") and not form_of:
                    form_of = {"lemma": s["form_of"][0].get("word"), "tags": sorted(tags & {"plural", "past", "participle", "present", "third-person", "singular", "comparative", "superlative", "gerund"})}
                if tags & SKIP_TAGS:
                    continue
                gl = (s.get("glosses") or [""])[-1]
                if not gl:
                    continue
                flags |= tags & FLAG_TAGS
                ex = None
                for e in s.get("examples", []) or []:
                    if e.get("type") == "example" and 8 <= len(e.get("text", "")) <= 140:
                        ex = e["text"]
                        break
                senses.append({"g": gl[:220], "t": sorted(tags & FLAG_TAGS), "ex": ex})
                if len(senses) >= 4:
                    break
            if not senses and not form_of:
                continue
            rec = {
                "w": word,
                "p": pos,
                "ipa": pick_ipa(d.get("sounds")),
                "tr": tr_words(d),
                "se": senses,
                "fo": form_of,
                "fl": sorted(flags),
                "syn": [s.get("word") for s in (d.get("synonyms") or [])[:6] if s.get("word")],
                "ant": [s.get("word") for s in (d.get("antonyms") or [])[:4] if s.get("word")],
                "mw": [c for c in cats if MW_CATS.search(c)][:3] if multi else None,
            }
            out.write(orjson.dumps(rec) + b"\n")
            n_out += 1
    NAMES_OUT.write_text(chr(10).join(sorted(names)), encoding="utf-8")
    print(f"BİTTİ: {n_in:,} girdi okundu, {n_out:,} yazıldı -> {OUT}")


if __name__ == "__main__":
    main()
