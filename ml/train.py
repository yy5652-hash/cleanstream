"""Trains the item-type head on cached embeddings and writes the evaluation report.

    .venv/bin/python ml/train.py ViT-B-32__openai [--export web/public/model]

The head is a linear layer that starts at the zero-shot text weights and is pulled back toward them while it
learns from labelled images (an L2 anchor), so item types with no training photos keep their zero-shot weights.
"""
import argparse, csv, json, sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import MATERIAL, NAMES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "ml/cache"
IDX = {n: i for i, n in enumerate(NAMES)}
SCALE = 100.0  # CLIP logit scale


def load(key):
    rows = list(csv.DictReader(open(ROOT / "data/manifest.csv")))
    paths = (CACHE / f"{key}.paths.txt").read_text().splitlines()
    assert paths == [r["path"] for r in rows], "embeddings are stale: rerun ml/embed.py"
    X = np.load(CACHE / f"{key}.img.npy").astype(np.float32)
    T = np.load(CACHE / f"{key}.text.npy").astype(np.float32)
    return rows, X, T


def drop_near_duplicates(rows, X, train_mask, thr=0.97):
    """Removes training images that are near-copies of any val/test image (datasets reuse each other's photos)."""
    held = np.where(~train_mask)[0]
    tr = np.where(train_mask)[0]
    keep = train_mask.copy()
    Xt = torch.tensor(X[tr])
    for i in range(0, len(held), 2048):
        sims = torch.tensor(X[held[i:i + 2048]]) @ Xt.T
        hit = (sims > thr).any(0).numpy()
        keep[tr[hit]] = False
    return keep, int(train_mask.sum() - keep.sum())


def fit_head(X, y, T, lam, Xc=None, Mc=None, epochs=300, seed=0):
    """Xc/Mc: images labelled only by material and, per image, a mask of the item types of that material.
    They add a partial-label loss: -log of the probability summed over the allowed item types.
    Item types with no labelled photo keep their zero-shot weights (frozen): otherwise they only ever see negatives
    and learn to reject whatever backgrounds the other datasets happen to have (e.g. grass behind litter)."""
    torch.manual_seed(seed)
    X, y = torch.tensor(X), torch.tensor(y)
    W0 = torch.tensor(T) * SCALE
    W = W0.clone().requires_grad_(True)
    b = torch.zeros(len(NAMES), requires_grad=True)
    trained = torch.bincount(y, minlength=len(NAMES)) > 0
    opt = torch.optim.Adam([W, b], lr=0.05)
    for _ in range(epochs):
        opt.zero_grad()
        loss = torch.nn.functional.cross_entropy(X @ W.T + b, y) + lam * ((W - W0) ** 2).sum() / SCALE
        if Xc is not None and len(Xc):
            lp = torch.log_softmax(torch.tensor(Xc) @ W.T + b, 1)
            loss = loss - torch.logsumexp(lp.masked_fill(~torch.tensor(Mc), -1e9), 1).mean()
        loss.backward()
        opt.step()
        with torch.no_grad():
            W[~trained] = W0[~trained]
            b[~trained] = b[trained].median()
    return W.detach().numpy(), b.detach().numpy()


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def fit_temperature(logits, y):
    best = min(np.linspace(0.3, 3, 28), key=lambda t: -np.log(softmax(logits / t)[np.arange(len(y)), y] + 1e-9).mean())
    return float(best)


def bins_for(pack):
    return {k: v["bin"] for k, v in pack["items"].items()}


def ok_bin(pack, item, bin):
    """The city accepts this item in this bin (its main bin or one of its alternatives)."""
    r = pack["items"][item]
    return bin == r["bin"] or bin in r.get("also", [])


def scores(P, rows, idx, packs):
    """Item, material and per-city bin accuracy for rows idx given class probabilities P (aligned with idx)."""
    pred = P.argmax(1)
    lab = [(k, rows[i]["label"]) for k, i in enumerate(idx) if rows[i]["label"]]
    mat = [(k, rows[i]["material"]) for k, i in enumerate(idx) if rows[i]["material"]]
    out = {"n_item": len(lab), "item_acc": float(np.mean([NAMES[pred[k]] == l for k, l in lab])) if lab else None,
           "n_material": len(mat),
           "material_acc": float(np.mean([MATERIAL[NAMES[pred[k]]] == m for k, m in mat])) if mat else None}
    for pid, pack in packs.items():
        b = bins_for(pack)
        # bin answer = the bin with the most probability mass, which is what the app shows
        binp = defaultdict(lambda: np.zeros(len(idx)))
        for c, n in enumerate(NAMES):
            binp[b[n]] += P[:, c]
        names = list(binp)
        M = np.stack([binp[n] for n in names], 1)
        guess = [names[j] for j in M.argmax(1)]
        out[f"bin_acc_{pid}"] = float(np.mean([ok_bin(pack, l, guess[k]) for k, l in lab])) if lab else None
    return out


TRAIN_SOURCES = ["trashnet", "garbage_v2", "taco"]  # permissive licences (MIT, MIT, CC BY 4.0)
EXTERNAL = "realwaste"  # never trained on or tuned with: an outside test set (CC BY-NC-SA 4.0, evaluation only)
LAMBDAS = [0.0, 0.0003, 0.001, 0.003, 0.01, 0.03]


def bin_answers(P, rows, idx, pack, thr):
    """Coverage and accuracy of the app's bin answer when it only answers above thr (rows with an item label)."""
    b = bins_for(pack)
    names = sorted(set(b.values()))
    M = np.stack([P[:, [c for c, n in enumerate(NAMES) if b[n] == bn]].sum(1) for bn in names], 1)
    lab = [(k, rows[i]["label"]) for k, i in enumerate(idx) if rows[i]["label"]]
    ans = [(M[k].max() >= thr, ok_bin(pack, l, names[M[k].argmax()])) for k, l in lab]
    answered = [ok for a, ok in ans if a]
    return {"coverage": len(answered) / max(1, len(ans)), "accuracy_answered": float(np.mean(answered)) if answered else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("key")
    ap.add_argument("--export")
    a = ap.parse_args()
    rows, X, T = load(a.key)
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}
    split = np.array([r["split"] for r in rows])
    src = np.array([r["source"] for r in rows])
    has = np.array([bool(r["label"]) for r in rows])
    y_all = np.array([IDX.get(r["label"], -1) for r in rows])
    coarse = np.array([not r["label"] and bool(r["material"]) for r in rows])
    ours = np.isin(src, TRAIN_SOURCES)
    ext = src == EXTERNAL
    pool, n_dup = drop_near_duplicates(rows, X, (split == "train") & ours & (has | coarse))
    pool &= ~ext
    Mall = np.array([[MATERIAL[n] == r["material"] for n in NAMES] for r in rows])
    val, test = (split == "val") & ours, (split == "test") & ours

    def fit(mask, lam):
        return fit_head(X[mask & has], y_all[mask & has], T, lam, X[mask & coarse], Mall[mask & coarse])

    def item_acc(Wm, bm, mask):
        j = np.where(mask & has)[0]
        return float(((X[j] @ Wm.T + bm).argmax(1) == y_all[j]).mean())

    # anchor strength: half in-distribution val, half leave-one-source-out val (rewards generalising to new photo sources)
    grid = {}
    for lam in LAMBDAS:
        W, b = fit(pool, lam)
        lodo = [item_acc(*fit(pool & (src != s), lam), val & (src == s)) for s in TRAIN_SOURCES if (val & (src == s) & has).any()]
        grid[lam] = {"val": item_acc(W, b, val), "lodo_val": float(np.mean(lodo))}
    lam = max(grid, key=lambda k: grid[k]["val"] + grid[k]["lodo_val"])
    W, b = fit(pool, lam)
    vi = np.where(val & has)[0]
    temp = fit_temperature(X[vi] @ W.T + b, y_all[vi])
    zs_W, zs_b = T * SCALE, np.zeros(len(NAMES))
    report = {"backbone": a.key, "train_sources": TRAIN_SOURCES, "external_test": EXTERNAL, "dropped_duplicates": n_dup,
              "train_counts": dict(Counter(rows[i]["label"] or rows[i]["material"] + "*" for i in np.where(pool)[0])),
              "n_train": int(pool.sum()), "n_val": int(val.sum()), "n_test": int(test.sum()), "n_external": int(ext.sum()),
              "lambda_grid": grid, "lam": lam, "temperature": temp}

    def evaluate(Wm, bm, t, mask):
        idx = np.where(mask)[0]
        res = {"all": scores(softmax((X[idx] @ Wm.T + bm) / t), rows, idx, packs)}
        for s in sorted(set(src[idx])):
            j = np.where(mask & (src == s))[0]
            res[s] = scores(softmax((X[j] @ Wm.T + bm) / t), rows, j, packs)
        return res

    report["test"] = {"zero_shot": evaluate(zs_W, zs_b, 1.0, test), "cleanstream": evaluate(W, b, temp, test)}
    report["external"] = {"zero_shot": evaluate(zs_W, zs_b, 1.0, ext), "cleanstream": evaluate(W, b, temp, ext)}
    report["thresholds"] = {}
    for pid, pack in packs.items():
        for name, mask in [("val", val), ("test", test), ("external", ext)]:
            idx = np.where(mask)[0]
            P = softmax((X[idx] @ W.T + b) / temp)
            report["thresholds"].setdefault(pid, {})[name] = {str(t): bin_answers(P, rows, idx, pack, t) for t in [0.0, 0.5, 0.6, 0.7, 0.8]}
    per_class = {}
    j = np.where(test & has)[0]
    pred = (X[j] @ W.T + b).argmax(1)
    for c in sorted(set(y_all[j])):
        m = y_all[j] == c
        per_class[NAMES[c]] = {"n": int(m.sum()), "acc": float((pred[m] == c).mean())}
    report["per_class_test"] = per_class

    out = ROOT / "ml/results"
    out.mkdir(exist_ok=True)
    (out / f"{a.key}.json").write_text(json.dumps(report, indent=1))
    print(a.key, "train", report["n_train"], "dup dropped", n_dup, "lam", lam, "T", round(temp, 2))
    for k, v in grid.items():
        print(f"  lam {k:<7} val {v['val']:.3f}  lodo {v['lodo_val']:.3f}")
    for part in ["test", "external"]:
        for name in ["zero_shot", "cleanstream"]:
            r = report[part][name]["all"]
            print(f"  {part:8s} {name:12s} item {r['item_acc']:.3f} (n={r['n_item']})  material {r['material_acc']:.3f} (n={r['n_material']})  " +
                  "  ".join(f"{k[8:]} {v:.3f}" for k, v in r.items() if k.startswith("bin_acc_")))
    for pid in packs:
        for name in ["test", "external"]:
            t6 = report["thresholds"][pid][name]["0.6"]
            print(f"  {pid} {name} answered at 0.6: coverage {t6['coverage']:.3f} accuracy {t6['accuracy_answered']:.3f}")

    if a.export:
        d = Path(a.export)
        d.mkdir(parents=True, exist_ok=True)
        (d / "head.json").write_text(json.dumps({
            "classes": NAMES, "temperature": temp, "dim": int(W.shape[1]),
            "W": [[round(float(v), 5) for v in row] for row in W], "b": [round(float(v), 5) for v in b]}))

        def brief(r):
            return {"item_acc": r["item_acc"], "material_acc": r["material_acc"], "n_item": r["n_item"], "n_material": r["n_material"],
                    "bin_acc": {k[8:]: v for k, v in r.items() if k.startswith("bin_acc_")}}
        n_src = Counter(src)
        enc = d / "encoder.onnx"
        (d / "metrics.json").write_text(json.dumps({
            "backbone": a.key, "classes": len(NAMES), "n_train": report["n_train"], "n_test": report["n_test"],
            "model_mb": round(enc.stat().st_size / 1e6) if enc.exists() else None,
            "test": brief(report["test"]["cleanstream"]["all"]), "external": brief(report["external"]["cleanstream"]["all"]),
            "zero_shot": {"test": brief(report["test"]["zero_shot"]["all"]), "external": brief(report["external"]["zero_shot"]["all"])},
            "answered": {pid: {k: v["0.6"] for k, v in t.items()} for pid, t in report["thresholds"].items()},
            "datasets": [
                {"name": "TrashNet", "url": "https://github.com/garythung/trashnet", "license": "MIT", "role": "train / test", "images": n_src["trashnet"]},
                {"name": "Garbage Dataset (v2)", "url": "https://www.kaggle.com/datasets/sumn2u/garbage-classification-v2", "license": "MIT", "role": "train / test", "images": n_src["garbage_v2"]},
                {"name": "TACO (object crops)", "url": "http://tacodataset.org", "license": "CC BY 4.0", "role": "train / test", "images": n_src["taco"]},
                {"name": "RealWaste", "url": "https://archive.ics.uci.edu/dataset/908/realwaste", "license": "CC BY-NC-SA 4.0", "role": "outside test only", "images": n_src["realwaste"]},
            ]}, indent=1))
        print("exported head and metrics to", d)


if __name__ == "__main__":
    main()
