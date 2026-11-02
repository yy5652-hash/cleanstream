"""Web field test: everyday items in free stock photos and video frames (Pexels), labelled by looking at each one.

These photos were never used for training; ml/field.csv lists them, data/field holds the files.

    .venv/bin/python ml/field_test.py ViT-B-32-SigLIP2-256:webli web/public/model/encoder.onnx base=ml/cache/cand/base/head.json new=ml/cache/cand/new/head.json
"""
import csv, json, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from compare import mcnemar, softmax  # noqa: E402
from embed import CACHE, load, onnx_image_embeddings  # noqa: E402
from taxonomy import NAMES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def main():
    spec, onnx, *heads = sys.argv[1:]
    rows = list(csv.DictReader(open(ROOT / "ml/field.csv")))
    y = [r["label"] for r in rows]
    cache = CACHE / (Path(onnx).stem + "." + spec.replace(":", "_") + ".field.npy")
    if cache.exists() and len(np.load(cache)) == len(rows):
        X = np.load(cache).astype(np.float32)
    else:
        _, pre, _ = load(spec)
        X = onnx_image_embeddings(ROOT / onnx, pre, [ROOT / "data/field" / (r["file"] + ".jpg") for r in rows]).astype(np.float32)
        np.save(cache, X)
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}
    res = {}
    for name, f in (h.split("=", 1) for h in heads):
        h = json.loads((ROOT / f).read_text())
        P = softmax((X @ np.array(h["W"]).T + np.array(h["b"])) / h["temperature"])
        ok = {"item": np.array([NAMES[k] == l for k, l in zip(P.argmax(1), y)])}
        for pid, pack in packs.items():
            bm = {k: v["bin"] for k, v in pack["items"].items()}
            names = sorted(set(bm.values()))
            M = np.stack([P[:, [c for c, n in enumerate(NAMES) if bm[n] == bn]].sum(1) for bn in names], 1)
            ok[pid] = np.array([names[k] == pack["items"][l]["bin"] or names[k] in pack["items"][l].get("also", []) for k, l in zip(M.argmax(1), y)])
        res[name] = (ok, P)
        print(f"{name:10s} {len(y)} photos  item {ok['item'].mean():.3f}  bin " + " ".join(f"{p} {ok[p].mean():.3f}" for p in packs))
    names = list(res)
    if len(names) > 1:
        for name in names[1:]:
            w, l, p = mcnemar(res[names[0]][0]["nyc"], res[name][0]["nyc"])
            print(f"{name} vs {names[0]}: nyc bin +{w}/-{l} p={p:.3g}")
    last = names[-1]
    wrong = [f"{r['file']}:{r['label']}->{NAMES[res[last][1][i].argmax()]}" for i, r in enumerate(rows) if not res[last][0]["item"][i]]
    print(f"{last} item errors:", "; ".join(wrong))


if __name__ == "__main__":
    main()
