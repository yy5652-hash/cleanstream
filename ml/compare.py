"""Paired comparison of trained heads on the same photos: right or wrong, photo by photo (McNemar exact test).

    .venv/bin/python ml/compare.py base=KEY:ml/cache/cand/base/head.json new=KEY:ml/cache/cand/new/head.json
    .venv/bin/python ml/compare.py --final base=... new=...

Choices are made on the validation photos. --final adds the held-out test photos and RealWaste: run it once, on the choice.
The first head is the baseline. "Original" means the three first sources, whose photos and splits never change.
"""
import csv, json, sys
from math import comb
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import NAMES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "ml/cache"
ORIGINAL = ["trashnet", "garbage_v2", "taco"]
ADDED = ["household", "ewaste", "commons", "warp"]


def softmax(z):
    z = z - z.max(1, keepdims=True)
    p = np.exp(z)
    return p / p.sum(1, keepdims=True)


def mcnemar(a, b):
    lose, win = int(np.sum(a & ~b)), int(np.sum(~a & b))
    n, k = lose + win, min(lose, win)
    p = min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n) if n else 1.0
    return win, lose, p


def main():
    args = sys.argv[1:]
    final = "--final" in args
    specs = [a.split("=", 1) for a in args if not a.startswith("--")]
    rows = list(csv.DictReader(open(ROOT / "data/manifest.csv")))
    split = np.array([r["split"] for r in rows])
    src = np.array([r["source"] for r in rows])
    has = np.array([bool(r["label"]) for r in rows])
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}

    probs = {}
    for name, spec in specs:
        key, head_file = spec.split(":", 1)
        h = json.loads((ROOT / head_file).read_text())
        assert h["classes"] == NAMES
        paths = (CACHE / f"{key}.paths.txt").read_text().splitlines()
        X = np.load(CACHE / f"{key}.img.npy", mmap_mode="r")
        assert paths == [r["path"] for r in rows], f"{key}: embeddings are stale, rerun ml/embed.py"
        probs[name] = (X, np.array(h["W"]), np.array(h["b"]), h["temperature"])

    sets = {"val, original sources": (split == "val") & np.isin(src, ORIGINAL), "val, added sources": (split == "val") & np.isin(src, ADDED)}
    if final:
        sets.update({"test, original sources": (split == "test") & np.isin(src, ORIGINAL), "test, added sources": (split == "test") & np.isin(src, ADDED), "RealWaste": src == "realwaste"})
    base = specs[0][0]
    for title, mask in sets.items():
        j = np.where(mask & has)[0]
        if not len(j):
            continue
        y = [rows[i]["label"] for i in j]
        res = {}
        for name, (X, W, b, t) in probs.items():
            P = softmax((np.asarray(X[j], dtype=np.float32) @ W.T + b) / t)
            ok = {"item": np.array([NAMES[k] == l for k, l in zip(P.argmax(1), y)])}
            for pid, pack in packs.items():
                bm = {k: v["bin"] for k, v in pack["items"].items()}
                names = sorted(set(bm.values()))
                M = np.stack([P[:, [c for c, n in enumerate(NAMES) if bm[n] == bn]].sum(1) for bn in names], 1)
                ok[pid] = np.array([names[k] == pack["items"][l]["bin"] or names[k] in pack["items"][l].get("also", []) for k, l in zip(M.argmax(1), y)])
            res[name] = ok
        print(f"\n{title} ({len(j)} photos with an item label)")
        for name, ok in res.items():
            line = f"  {name:14s} item {ok['item'].mean():.4f}  bin " + " ".join(f"{p} {ok[p].mean():.4f}" for p in packs)
            if name != base:
                w, l, p = mcnemar(res[base]["item"], ok["item"])
                wn, ln, pn = mcnemar(res[base]["nyc"], ok["nyc"])
                line += f"\n{'':16s}vs {base}: item +{w}/-{l} p={p:.3g}  nyc bin +{wn}/-{ln} p={pn:.3g}"
            print(line)


if __name__ == "__main__":
    main()
