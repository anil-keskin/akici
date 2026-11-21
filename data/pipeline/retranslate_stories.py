"""gen_stories.json Türkçe çevirilerini Helsinki-NLP/opus-mt-tc-big-en-tr (CC BY 4.0) ile yeniden çevirir.
Yerel LLM'in Türkçesi hatalıydı ("paparot", anlamı ters cümleler). Cümle cümle, GPU'da.
Çalıştırma: E:/AI/envs/img/Scripts/python.exe -I -X utf8 retranslate_stories.py
"""
import json
import re
import shutil
from pathlib import Path

import torch
from transformers import MarianMTModel, MarianTokenizer

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / "work" / "gen_stories.json"
NAME = "Helsinki-NLP/opus-mt-tc-big-en-tr"


def main():
    if not (ROOT / "work" / "gen_stories.llm.json").exists():
        shutil.copy(P, ROOT / "work" / "gen_stories.llm.json")  # eski hali yedek
    data = json.loads(P.read_text(encoding="utf-8"))
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    tok = MarianTokenizer.from_pretrained(NAME)
    model = MarianMTModel.from_pretrained(NAME).to(dev).eval()
    if dev == "cuda":
        model = model.half()
    sents, where = [], []
    for si, s in enumerate(data):
        for pi, (en, _) in enumerate(s["paras"]):
            for x in re.split(r"(?<=[.!?…])[\"”']?\s+(?=[\"“'A-Z])", en.strip()):
                if x.strip():
                    sents.append(x.strip()); where.append((si, pi))
    print(len(sents), "cümle", dev, flush=True)
    out = []
    order = sorted(range(len(sents)), key=lambda i: len(sents[i]))
    res = [None] * len(sents)
    B = 48
    for k in range(0, len(order), B):
        idx = order[k:k + B]
        batch = tok([sents[i] for i in idx], return_tensors="pt", padding=True, truncation=True, max_length=256).to(dev)
        with torch.no_grad():
            gen = model.generate(**batch, num_beams=4, max_new_tokens=256)
        for i, t in zip(idx, tok.batch_decode(gen, skip_special_tokens=True)):
            res[i] = t
        if k % (B * 20) == 0:
            print(k, "/", len(order), flush=True)
    paras = {}
    for (si, pi), t in zip(where, res):
        paras.setdefault((si, pi), []).append(t)
    for (si, pi), ts in paras.items():
        data[si]["paras"][pi][1] = " ".join(ts)
    P.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print("BİTTİ")


if __name__ == "__main__":
    main()
