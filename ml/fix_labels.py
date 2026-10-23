"""Finds beverage and food cartons filed under "cardboard" in TrashNet, the Garbage Dataset and RealWaste; writes ml/relabel.csv.

    .venv/bin/python ml/fix_labels.py ViT-B-32-SigLIP2-256__webli__onnx

Cartons (milk, juice, soup) go in a different bin from cardboard in New York, so the mix-up teaches the wrong answer.
A photo is relabelled "carton" when its embedding is closer to the encoder's text description of a carton than of
cardboard by at least MARGIN (cosine). The threshold was set by looking at photos on both sides of it; it is applied to
every split, before any training. prepare.py reads the file.
"""
import csv, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import NAMES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MARGIN = 0.03


def main(key):
    rows = list(csv.DictReader(open(ROOT / "data/manifest.csv")))
    cache = ROOT / "ml/cache"
    paths = (cache / f"{key}.paths.txt").read_text().splitlines()
    assert paths == [r["path"] for r in rows], "embeddings are stale: rerun ml/embed.py"
    X = np.load(cache / f"{key}.img.npy").astype(np.float32)
    T = np.load(cache / f"{key}.text.npy").astype(np.float32)
    d = T[NAMES.index("carton")] - T[NAMES.index("cardboard")]
    out = []
    for i, r in enumerate(rows):
        if r["source"] in ("trashnet", "garbage_v2", "realwaste") and r["label"] in ("cardboard", "carton"):
            m = float(X[i] @ d)
            if m >= MARGIN:
                out.append({"path": r["path"], "label": "carton", "was": "cardboard", "margin": round(m, 4)})
    with open(ROOT / "ml/relabel.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["path", "label", "was", "margin"])
        w.writeheader()
        w.writerows(out)
    print(len(out), "cardboard photos relabelled as carton")


if __name__ == "__main__":
    main(*sys.argv[1:])
