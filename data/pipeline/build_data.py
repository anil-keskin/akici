"""Uygulama verisini üretir → app/public/data/*.json

Kaynaklar (hepsi açık lisans, bkz. README):
- wordfreq (sıklık), English Wiktionary + Türkçe Vikisözlük (kaikki; CC BY-SA), Tatoeba (CC BY 2.0 FR), CMUdict (BSD).
"""
import gzip
import json
import re
from collections import defaultdict
from pathlib import Path

import orjson
from wordfreq import top_n_list, word_frequency, zipf_frequency

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work"
OUT = ROOT.parent / "app" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

N_WORDS = 20000
BAN = {"slur", "derogatory", "offensive"}  # tamamen çıkarılır
CEFR = [(600, "A1"), (1500, "A2"), (3500, "B1"), (7000, "B2"), (12000, "C1"), (10**9, "C2")]
POS_TR = {"noun": "isim", "verb": "fiil", "adj": "sıfat", "adv": "zarf", "pron": "zamir", "prep": "edat", "conj": "bağlaç",
          "det": "belirteç", "intj": "ünlem", "num": "sayı", "phrase": "kalıp", "prep_phrase": "edat öbeği", "proverb": "atasözü",
          "particle": "parçacık", "article": "tanımlık", "contraction": "kısaltma", "postp": "edat"}


def cefr(rank):
    for lim, lv in CEFR:
        if rank <= lim:
            return lv


def clean_tr(s):
    s = re.sub(r"\s*\([^)]*\)", "", s).strip(" ;,.")
    return s if 0 < len(s) <= 45 else None


ARPA = {"AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "EH": "ɛ",
        "ER": "ɝ", "EY": "eɪ", "F": "f", "G": "ɡ", "HH": "h", "IH": "ɪ", "IY": "i", "JH": "dʒ", "K": "k", "L": "l", "M": "m",
        "N": "n", "NG": "ŋ", "OW": "oʊ", "OY": "ɔɪ", "P": "p", "R": "ɹ", "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "UH": "ʊ",
        "UW": "u", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}


ONSETS = {"pl", "pɹ", "bl", "bɹ", "tɹ", "dɹ", "kl", "kɹ", "ɡl", "ɡɹ", "fl", "fɹ", "θɹ", "ʃɹ", "st", "sp", "sk", "sl", "sm", "sn",
          "sw", "tw", "kw", "pj", "bj", "kj", "mj", "fj", "vj", "hj", "dw", "ɡw"}


def arpa_ipa(phones):
    syms, marks = [], []
    vowels = set()
    for i, ph in enumerate(phones):
        base, stress = re.sub(r"\d", "", ph), re.sub(r"\D", "", ph)
        sym = ARPA.get(base, "")
        if base == "AH" and stress == "0":
            sym = "ə"
        if base == "ER" and stress == "0":
            sym = "ɚ"
        syms.append(sym)
        if stress:
            vowels.add(i)
        marks.append({"1": "ˈ", "2": "ˌ"}.get(stress, "") if len(phones) > 2 or stress == "2" else "")
    out = list(syms)
    # vurgu işaretini hecenin başına (ünsüz öbeğinin önüne) koy
    for i in sorted((i for i, m in enumerate(marks) if m), reverse=True):
        j = i
        if j - 1 >= 0 and (j - 1) not in vowels:
            j -= 1
            if j - 1 >= 0 and (j - 1) not in vowels and (syms[j - 1] + syms[j]) in ONSETS:
                j -= 1
        if i == 0 or (j == 0 and len(vowels) == 1):
            continue
        out.insert(j, marks[i])
    return "/" + "".join(out) + "/"


def write(name, obj):
    p = OUT / name
    p.write_bytes(orjson.dumps(obj))
    print(f"  {name}: {p.stat().st_size/1e6:.2f} MB")


def main():
    # ---------------- Wiktionary girdileri
    ent = defaultdict(list)
    for l in (WORK / "wikt.jsonl").open("rb"):
        d = orjson.loads(l)
        ent[d["w"]].append(d)
    trg = defaultdict(list)  # Türkçe Vikisözlük: İngilizce kelime -> Türkçe anlamlar (pos sırasıyla)
    for l in gzip.open(ROOT / "raw" / "trwikt.jsonl.gz", "rb"):
        d = orjson.loads(l)
        if d.get("lang_code") != "en":
            continue
        for s in d.get("senses", []) or []:
            for g in s.get("glosses", []) or []:
                c = clean_tr(g)
                if c and c not in trg[d["word"]]:
                    trg[d["word"]].append(c)
    print("tr-vikisözlük İngilizce madde:", len(trg))
    overrides = json.loads((Path(__file__).parent / "overrides.json").read_text(encoding="utf-8"))
    overrides.update(json.loads((Path(__file__).parent / "overrides2.json").read_text(encoding="utf-8")))
    mt_path = WORK / "mt_tr.json"
    mt = json.loads(mt_path.read_text(encoding="utf-8")) if mt_path.exists() else {}
    names = set((WORK / "names.txt").read_text(encoding="utf-8").split())
    import bz2
    lc = defaultdict(int)  # Tatoeba İngilizce cümlelerinde küçük harfle geçiş sayısı (özel isim filtresi)
    for line in bz2.open(ROOT / "raw" / "eng_sentences.tsv.bz2", "rt", encoding="utf-8"):
        parts = line.rstrip(chr(10)).split(chr(9))
        if len(parts) >= 3:
            for t in re.findall(r"(?<![A-Za-z])[a-z]+(?![A-Za-z])", parts[2]):
                lc[t] += 1
    cmu = {}
    for line in (ROOT / "raw" / "cmudict.dict").open(encoding="utf-8"):
        parts = line.split("#")[0].split()
        if parts and "(" not in parts[0] and parts[0] not in cmu:
            cmu[parts[0]] = parts[1:]

    # ---------------- Form → kök ve kök sıklığı
    def lemma_of(form):
        es = ent.get(form) or ent.get(form.lower())
        if not es:
            return None
        own = [e for e in es if e["se"] and not e["fo"]]
        fo = [e["fo"]["lemma"] for e in es if e["fo"] and e["fo"].get("lemma") and e["fo"]["lemma"] in ent]
        # "were", "got", "things": kendi anlamı olsa da Türkçesi yoksa köke katılır
        if own and fo and not any(e["tr"] for e in own) and form not in trg and form not in overrides:
            return fo[0]
        if own:
            return own[0]["w"]
        for e in es:
            if e["fo"] and e["fo"].get("lemma"):
                return e["fo"]["lemma"]
        return es[0]["w"]

    freq = defaultdict(float)
    forms = defaultdict(set)
    for form in top_n_list("en", 250000):
        if not re.fullmatch(r"[a-z][a-z'-]*", form) or (len(form) == 1 and form not in ("a", "i")):
            continue
        lem = lemma_of(form)
        if not lem or lem not in ent:
            continue
        freq[lem] += word_frequency(form, "en")
        if form != lem:
            forms[lem].add(form)
    order = sorted(freq, key=lambda w: -freq[w])

    # ---------------- Kelime kaydı
    words = []
    for lem in order:
        es = [e for e in ent[lem] if e["se"] or e["tr"]]
        if not es:
            continue
        if lem in names and len(words) > 2500 and lc.get(lem, 0) < 3:
            continue  # büyük ihtimalle özel isim (Rudd, Tito…)
        if lem not in overrides and not any(e["tr"] for e in ent[lem]) and lem not in trg:
            if lem in names and lc.get(lem, 0) < 30:
                continue  # john, al, la…
            if len(lem) <= 3:
                continue  # co, st, re… kısaltma/parça
        flags = set().union(*[set(e["fl"]) for e in es])
        if flags & BAN and not any(not (set(s["t"]) & BAN) for e in es for s in e["se"]):
            continue
        # Türkçe anlamlar: en-Vikisözlük çevirileri (anlam etiketli) + tr-Vikisözlük tanımları
        tr = list(overrides.get(lem, []))
        for e in ([] if lem in overrides else es):
            for t in e["tr"]:
                c = clean_tr(t["w"])
                if c and c not in tr:
                    tr.append(c)
        for g in ([] if lem in overrides else trg.get(lem, [])):
            if g not in tr:
                tr.append(g)
        # ÖNEMLİ: listeye girme kararı makine çevirisinden BAĞIMSIZ olmalı; yoksa kelime numaraları (kart id'leri) kayar.
        if not tr and lc.get(lem, 0) < 2:
            continue  # Türkçesi yok ve gerçek cümlelerde neredeyse hiç geçmiyor
        mt_flag = 0
        if not tr and lem in mt:
            tr, mt_flag = list(mt[lem]), 1  # yerel yapay zekâ çevirisi (uygulamada işaretli)
        main = max(es, key=lambda e: (len(e["tr"]), len(e["se"])))
        pos = []
        for e in [main] + es:
            if e["p"] not in pos:
                pos.append(e["p"])
        defs = []
        for e in [main] + [x for x in es if x is not main]:
            for s in e["se"]:
                if set(s["t"]) & BAN:
                    continue
                defs.append({"p": e["p"], "g": s["g"], "ex": s["ex"]})
        ipa = arpa_ipa(cmu[lem]) if lem in cmu else next((e["ipa"] for e in es if e["ipa"]), None)
        rank = len(words) + 1
        words.append({
            "id": rank, "w": lem, "ipa": ipa, "pos": pos[:3], "tr": tr[:5], "d": defs[:3], "lv": cefr(rank),
            "f": sorted((f for f in forms[lem] if zipf_frequency(f, "en") >= 1.8), key=lambda f: -zipf_frequency(f, "en"))[:6],
            "syn": main["syn"][:4], "ant": main["ant"][:3], "mt": mt_flag,
            "fl": sorted(flags & {"vulgar", "slang", "informal", "formal", "British", "US"}),
            "z": round(zipf_frequency(lem, "en"), 2),
        })
        if len(words) >= N_WORDS:
            break
    print("kelime:", len(words), "seviye dağılımı:", {lv: sum(w["lv"] == lv for w in words) for _, lv in CEFR})

    # ---------------- Cümleler: kelime başına en kolay 3 örnek + seviye başına havuz
    tok2lem = {}
    for w in words:
        tok2lem[w["w"]] = w["id"]
        for f in w["f"]:
            tok2lem.setdefault(f, w["id"])
    pairs = [orjson.loads(l) for l in (WORK / "pairs.jsonl").open("rb")]
    lvl_ord = {"A1": 0, "A2": 1, "B1": 2, "B2": 3, "C1": 4, "C2": 5}
    pairs.sort(key=lambda p: (lvl_ord[p["lv"]], abs(p["n"] - 7), p["id"]))
    cand = defaultdict(list)
    for i, p in enumerate(pairs):
        if p["n"] < 3 or p["n"] > 16:
            continue
        for t in set(re.findall(r"[a-z]+(?:'[a-z]+)?", p["en"].lower())):
            wid = tok2lem.get(t)
            if wid and len(cand[wid]) < 3:
                cand[wid].append(i)
    used = set()
    for w in words:
        w["s"] = [pairs[i]["id"] for i in cand.get(w["id"], [])]
        used.update(cand.get(w["id"], []))
    # seviye başına ek cümle havuzu (dinleme, dikte, cloze, shadowing için)
    per_level = {"A1": 9000, "A2": 9000, "B1": 9000, "B2": 7000, "C1": 5000, "C2": 3000}
    taken = defaultdict(int)
    for i, p in enumerate(pairs):
        if i in used or p["n"] < 3 or p["n"] > 22:
            continue
        if taken[p["lv"]] < per_level[p["lv"]]:
            taken[p["lv"]] += 1
            used.add(i)
    sents = defaultdict(list)
    for i in sorted(used):
        p = pairs[i]
        sents[p["lv"]].append([p["id"], p["en"], p["tr"]])
    print("cümle:", {k: len(v) for k, v in sents.items()}, "toplam", sum(len(v) for v in sents.values()))

    # ---------------- Deyimler, phrasal verb'ler, kalıplar
    phrases = []
    for w, es in ent.items():
        if " " not in w:
            continue
        for e in es:
            if set(e["fl"]) & BAN:
                continue
            tr = [c for c in (clean_tr(t["w"]) for t in e["tr"]) if c]
            tr += [g for g in trg.get(w, []) if g not in tr]
            if not e["se"]:
                continue
            cats = " ".join(e["mw"] or []).lower()
            if re.match(r"(simple past|past participle|present participle|plural of|third-person|ellipsis of|alternative|abbreviation|misspelling)", e["se"][0]["g"], re.I):
                break
            kind = ("phrasal" if "phrasal" in cats
                    else "idiom" if "idiom" in cats or "idiomatic" in e["fl"]
                    else "proverb" if "proverb" in cats or e["p"] == "proverb"
                    else "phrase")
            z = zipf_frequency(w, "en")
            phrases.append({"w": w, "k": kind, "tr": tr[:3], "g": e["se"][0]["g"], "ex": e["se"][0]["ex"], "z": round(z, 2)})
            break
    def pscore(p):
        return p["z"] + (1.2 if p["tr"] else 0) + (0.6 if p["k"] in ("idiom", "proverb") else 0) - (1.5 if not p["tr"] and p["w"].split()[0] in ("be", "have", "do", "get") else 0)
    phrases = [p for p in phrases if (p["tr"] or p["k"] != "phrase") and not re.search(r"\b(sex|sexual|genital|penis|vagina|masturbat)", p["g"], re.I)]
    phrases.sort(key=lambda p: -pscore(p))
    phrases = phrases[:12000]
    for i, p in enumerate(phrases):
        p["id"] = i + 1
        p["lv"] = "B1" if i < 1500 else "B2" if i < 5000 else "C1"
    print("kalıp:", len(phrases), {k: sum(p["k"] == k for p in phrases) for k in ("phrasal", "idiom", "proverb", "phrase")})

    # ---------------- Minimal çiftler (Türklerin zorlandığı ses karşıtlıkları), CMUdict
    pron = {}
    for line in (ROOT / "raw" / "cmudict.dict").open(encoding="utf-8"):
        parts = line.split("#")[0].split()
        if parts and "(" not in parts[0]:
            pron[parts[0]] = tuple(re.sub(r"\d", "", x) for x in parts[1:])
    contrasts = {("TH", "S"): "th-s", ("TH", "T"): "th-t", ("DH", "D"): "dh-d", ("DH", "Z"): "dh-z", ("W", "V"): "w-v",
                 ("IY", "IH"): "ee-i", ("AE", "EH"): "a-e", ("UW", "UH"): "uu-u", ("NG", "N"): "ng-n", ("AE", "AH"): "a-u",
                 ("AA", "AH"): "o-u", ("L", "R"): "l-r", ("SH", "CH"): "sh-ch", ("Z", "S"): "z-s"}
    by_pron = {}
    top = {w["w"]: w["id"] for w in words}
    for w in top:
        if w in pron:
            by_pron.setdefault(pron[w], w)
    mp = defaultdict(list)
    for w, ph in ((w, pron[w]) for w in top if w in pron):
        for i, a in enumerate(ph):
            for (x, y), key in contrasts.items():
                if a == x:
                    other = by_pron.get(ph[:i] + (y,) + ph[i + 1:])
                    if other and other != w:
                        mp[key].append([w, other])
    minimal = {k: sorted(v, key=lambda p: top[p[0]] + top[p[1]])[:60] for k, v in mp.items()}
    print("minimal çift:", {k: len(v) for k, v in minimal.items()})

    # ---------------- Yaz
    print("yazılıyor →", OUT)
    for i in range(0, len(words), 5000):
        write(f"words-{i//5000}.json", words[i:i + 5000])
    for lv, arr in sents.items():
        write(f"sent-{lv}.json", arr)
    write("phrases.json", phrases)
    write("minimal-pairs.json", minimal)
    write("meta.json", {
        "words": len(words), "sentences": sum(len(v) for v in sents.values()), "phrases": len(phrases),
        "wordChunks": (len(words) + 4999) // 5000, "levels": list(sents.keys()), "built": "2026-11-21",
        "pos_tr": POS_TR,
    })


if __name__ == "__main__":
    main()
