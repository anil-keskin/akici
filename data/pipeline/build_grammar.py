"""Gramer konuları + Tatoeba'dan otomatik alıştırma → app/public/data/grammar.json

Her konunun 'pat' kalıpları gerçek cümlelerde aranır; 1. grup boşluk yapılır.
Seçenek listesi varsa çoktan seçmeli, yoksa yazmalı (ipucu: fiilin yalın hali).
"""
import json
import random
import re
from pathlib import Path

import sys

import orjson

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I ile çalışınca kendi klasörü
from grammar_src_a import TOPICS as A  # noqa: E402
from grammar_src_b import TOPICS as B

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT.parent / "app" / "public" / "data"
random.seed(42)
MAX_EX = 160

IRREG = {"went": "go", "gone": "go", "saw": "see", "seen": "see", "came": "come", "took": "take", "taken": "take", "made": "make", "got": "get",
         "gotten": "get", "gave": "give", "given": "give", "found": "find", "thought": "think", "told": "tell", "became": "become", "left": "leave",
         "felt": "feel", "brought": "bring", "began": "begin", "begun": "begin", "kept": "keep", "held": "hold", "wrote": "write", "written": "write",
         "stood": "stand", "heard": "hear", "meant": "mean", "met": "meet", "ran": "run", "paid": "pay", "sat": "sit", "spoke": "speak", "spoken": "speak",
         "led": "lead", "grew": "grow", "grown": "grow", "lost": "lose", "fell": "fall", "fallen": "fall", "sent": "send", "built": "build",
         "understood": "understand", "drew": "draw", "drawn": "draw", "broke": "break", "broken": "break", "spent": "spend", "drove": "drive",
         "driven": "drive", "bought": "buy", "wore": "wear", "worn": "wear", "chose": "choose", "chosen": "choose", "ate": "eat", "eaten": "eat",
         "drank": "drink", "drunk": "drink", "slept": "sleep", "sang": "sing", "sung": "sing", "swam": "swim", "forgot": "forget", "forgotten": "forget",
         "won": "win", "caught": "catch", "taught": "teach", "sold": "sell", "fought": "fight", "flew": "fly", "flown": "fly", "knew": "know",
         "known": "know", "threw": "throw", "thrown": "throw", "woke": "wake", "hid": "hide", "hidden": "hide", "said": "say", "did": "do", "done": "do",
         "had": "have", "been": "be", "was": "be", "were": "be", "stolen": "steal", "stole": "steal", "born": "bear", "read": "read", "cut": "cut",
         "put": "put", "let": "let", "hit": "hit", "hurt": "hurt", "set": "set", "shut": "shut", "children": "child", "men": "man", "women": "woman",
         "people": "person", "feet": "foot", "teeth": "tooth", "mice": "mouse"}


def load_lemmas():
    m = dict(IRREG)
    for p in sorted(DATA.glob("words-*.json")):
        for w in json.loads(p.read_text(encoding="utf-8")):
            for f in w["f"]:
                m.setdefault(f, w["w"])
    return m


def lemma(tok, lm):
    t = tok.lower()
    if t in lm:
        return lm[t]
    for suf, rep in (("ies", "y"), ("ied", "y"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")):
        if t.endswith(suf) and len(t) - len(suf) >= 2:
            return t[: -len(suf)] + rep
    return t


def blocks(src):
    out = []
    for b in src:
        if b[0] == "table":
            out.append({"t": "table", "h": b[1], "rows": b[2]})
        else:
            out.append({"t": b[0], "x": b[1]})
    return out


def main():
    lm = load_lemmas()
    pairs = [orjson.loads(l) for l in (ROOT / "work" / "pairs.jsonl").open("rb")]
    by_lv = {}
    for p in pairs:
        if 4 <= p["n"] <= 16:
            by_lv.setdefault(p["lv"], []).append(p)
    for v in by_lv.values():
        random.shuffle(v)
    out = []
    for t in A + B:
        exs, seen = [], set()
        pool = [p for lv in t.get("lvls", [t["lv"]]) for p in by_lv.get(lv, [])]
        pats = [(re.compile(r), ch, hint) for r, ch, hint in t.get("pat", [])]
        per_pat = MAX_EX // max(1, len(pats))
        for rx, ch, hint in pats:
            got = 0
            for p in pool:
                if got >= per_pat:
                    break
                en = p["en"]
                m = rx.search(en)
                if not m or m.group(1) is None:
                    continue
                ans = m.group(1)
                a, b = m.span(1)
                q = en[:a] + "___" + en[b:]
                if q in seen or q.count("___") != 1:
                    continue
                e = {"q": q, "a": ans, "tr": p["tr"]}
                if ch:
                    low = {c.lower(): c for c in ch}
                    if ans.lower() not in low:
                        continue
                    cap = a == 0
                    opts = [c[0].upper() + c[1:] if cap else c.lower() if c[0].isupper() and c not in ("I",) else c for c in ch]
                    if len(opts) > 4:  # 4 seçenek: doğru + 3 rastgele
                        right = next(o for o in opts if o.lower() == ans.lower())
                        others = [o for o in opts if o.lower() != ans.lower()]
                        random.shuffle(others)
                        opts = [right] + others[:3]
                    e["ch"] = opts
                    e["a"] = next(o for o in opts if o.lower() == ans.lower())
                elif hint == "lemma":
                    last = re.findall(r"[A-Za-z']+", ans)[-1]
                    h = lemma(last, lm)
                    if h.lower() == ans.lower() and " " not in ans:
                        continue  # ipucu cevabın aynısı olur; alıştırma anlamsız
                    e["h"] = h
                seen.add(q)
                exs.append(e)
                got += 1
        random.shuffle(exs)
        out.append({
            "id": t["id"], "lv": t["lv"], "title": t["title"], "tr": t["tr"], "summary": t["summary"],
            "blocks": blocks(t["blocks"]), "examples": [list(x) for x in t["examples"]],
            "mistakes": [list(x) for x in t["mistakes"]], "quiz": t["quiz"], "ex": exs,
        })
        print(f'{t["lv"]} {t["id"]:12s} {len(exs):4d} alıştırma')
    (DATA / "grammar.json").write_bytes(orjson.dumps(out))
    print("toplam konu", len(out), "alıştırma", sum(len(t["ex"]) for t in out))


if __name__ == "__main__":
    main()
