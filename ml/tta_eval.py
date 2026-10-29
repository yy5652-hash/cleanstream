"""Does averaging the answer for a photo and its mirror image help? A paired test on held-out and RealWaste photos.

Embeds the left-right flip of every test and RealWaste photo with the shipped encoder.onnx, then compares the shipped
head on the photo alone against the average of the photo and its flip, photo by photo (McNemar exact test).

    .venv/bin/python ml/tta_eval.py ViT-B-32-SigLIP2-256:webli web/public/model/encoder.onnx
"""
import json, sys
from math import comb
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from embed import CACHE, load, onnx_image_embeddings  # noqa: E402
from taxonomy import NAMES  # noqa: E402
from train import EXTERNAL, ROOT, TRAIN_SOURCES, bins_for, load as load_rows, ok_bin, softmax  # noqa: E402


class Flip:
    """The encoder's own preprocessing, applied to the mirrored photo."""
    def __init__(self, pre):
        self.pre = pre

    def __call__(self, img):
        return self.pre(img.transpose(Image.FLIP_LEFT_RIGHT))


def mcnemar(a, b):
    """Exact two-sided p-value for paired right/wrong outcomes a (baseline) and b (new)."""
    lose, win = int(np.sum(a & ~b)), int(np.sum(~a & b))
    n, k = lose + win, min(lose, win)
    p = min(1.0, 2 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n) if n else 1.0
    return win, lose, p


def main():
    spec, onnx = sys.argv[1], ROOT / sys.argv[2]
    key = spec.replace(":", "__").replace("/", "_") + "__onnx"
    rows, X, _ = load_rows(key)
    split = np.array([r["split"] for r in rows])
    src = np.array([r["source"] for r in rows])
    sets = {"test": np.where((split == "test") & np.isin(src, TRAIN_SOURCES))[0], "external": np.where(src == EXTERNAL)[0]}
    idx = np.concatenate(list(sets.values()))

    f = CACHE / f"{key}.flip.npz"
    if f.exists() and np.array_equal(np.load(f)["idx"], idx):
        Xf_sub = np.load(f)["X"]
    else:
        _, pre, _ = load(spec)
        Xf_sub = onnx_image_embeddings(onnx, Flip(pre), [ROOT / "data" / rows[i]["path"] for i in idx])
        np.savez(f, idx=idx, X=Xf_sub)
    Xf = np.zeros_like(X)
    Xf[idx] = Xf_sub.astype(np.float32)

    head = json.loads((ROOT / "web/public/model/head.json").read_text())
    W, b, t = np.array(head["W"]), np.array(head["b"]), head["temperature"]
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}
    out = {}
    for name, j in sets.items():
        lab = np.array([bool(rows[i]["label"]) for i in j])
        j = j[lab]
        y = [rows[i]["label"] for i in j]
        P0 = softmax((X[j] @ W.T + b) / t)
        P1 = (P0 + softmax((Xf[j] @ W.T + b) / t)) / 2
        res = {"n": len(j)}
        r0 = np.array([NAMES[k] == l for k, l in zip(P0.argmax(1), y)])
        r1 = np.array([NAMES[k] == l for k, l in zip(P1.argmax(1), y)])
        res["item"] = (r0.mean(), r1.mean(), *mcnemar(r0, r1))
        for pid, pack in packs.items():
            bmap = bins_for(pack)
            names = sorted(set(bmap.values()))
            cols = [[c for c, n in enumerate(NAMES) if bmap[n] == bn] for bn in names]
            ok = []
            for P in (P0, P1):
                M = np.stack([P[:, c].sum(1) for c in cols], 1)
                ok.append(np.array([ok_bin(pack, l, names[k]) for k, l in zip(M.argmax(1), y)]))
            res[f"bin_{pid}"] = (ok[0].mean(), ok[1].mean(), *mcnemar(ok[0], ok[1]))
        out[name] = res
        print(f"{name} (n={len(j)})   baseline -> flip-average   wins/losses   p")
        for k, (a0, a1, w, l, p) in ((k, v) for k, v in res.items() if k != "n"):
            print(f"  {k:9s} {a0:.4f} -> {a1:.4f}   +{w}/-{l}   p={p:.3g}")
    (ROOT / "ml/results/tta_flip.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
