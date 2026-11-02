"""Keeps the Wikimedia Commons photos that really show their item type; writes ml/commons_keep.txt for prepare.py.

    .venv/bin/python ml/filter_commons.py ViT-B-32-SigLIP2-256__webli__onnx

Commons searches are noisy ("metal lid" also finds machinery). A photo stays when its item type is among the TOP item types
closest to the photo in the encoder's text descriptions. Photos listed in ml/commons_drop.txt, removed by eye, always go.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import NAMES  # noqa: E402
from train import ROOT, load  # noqa: E402

TOP = 4


def main():
    rows, X, T = load(sys.argv[1])
    drop_file = ROOT / "ml/commons_drop.txt"
    drop = set(drop_file.read_text().splitlines()) if drop_file.exists() else set()
    keep, per = [], {}
    idx = [i for i, r in enumerate(rows) if r["source"] == "commons"]
    S = X[idx] @ T.T
    order = np.argsort(-S, 1)
    for j, i in enumerate(idx):
        r = rows[i]
        c = NAMES.index(r["label"])
        ok = c in order[j, :TOP] and r["path"] not in drop
        a, b = per.get(r["label"], (0, 0))
        per[r["label"]] = (a + ok, b + 1)
        if ok:
            keep.append(r["path"])
    (ROOT / "ml/commons_keep.txt").write_text("\n".join(keep))
    print(len(keep), "of", len(idx), "kept;", {k: f"{a}/{b}" for k, (a, b) in sorted(per.items())})


if __name__ == "__main__":
    main()
