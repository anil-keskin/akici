"""scenarios_src.txt + (varsa) work/dialogs.json → app/public/data/scenarios.json"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(__file__).parent / "scenarios_src.txt"
OUT = ROOT.parent / "app" / "public" / "data" / "scenarios.json"


def parse():
    out, cur = [], None
    for line in SRC.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        if not line.strip():
            if cur:
                out.append(cur)
            cur = None
            continue
        if cur is None:
            p = line.split("|")
            if len(p) != 10:
                raise ValueError(f"Bozuk başlık satırı: {line}")
            cur = dict(id=p[0], cat=p[1], lv=p[2], icon=p[3], title=p[4], en=p[5], setting=p[6], you=p[7], ai=p[8], goal=p[9], phrases=[])
        else:
            en, _, tr = line.partition(" = ")
            cur["phrases"].append([en.strip(), tr.strip()])
    if cur:
        out.append(cur)
    return out


def main():
    sc = parse()
    ids = [s["id"] for s in sc]
    assert len(ids) == len(set(ids)), "tekrarlı id"
    dpath = ROOT / "work" / "dialogs.json"
    dialogs = json.loads(dpath.read_text(encoding="utf-8")) if dpath.exists() else {}
    for s in sc:
        if s["id"] in dialogs:
            s["dialog"] = dialogs[s["id"]]
    OUT.write_text(json.dumps(sc, ensure_ascii=False), encoding="utf-8")
    print(len(sc), "senaryo,", sum(1 for s in sc if "dialog" in s), "diyaloglu,", sum(len(s["phrases"]) for s in sc), "kalıp")


if __name__ == "__main__":
    main()
