"""What the app's screen would do on the held-out test photos and RealWaste, not just which bin has most probability.

    .venv/bin/python ml/app_decision_eval.py ViT-B-16-SigLIP2-256__int8__onnx web/public/model

Uses the embeddings final_eval.py cached from the shipped encoder.onnx (ml/cache/<KEY>.final) and the decision mirror in
heldup_test.py: below 60% on the top summed bin it asks which item; an item with a condition question asks it; otherwise
it shows a bin. These photos carry item labels but no condition, so a bin counts as right only if it is the item's main
bin or an "also accepted" bin, i.e. the safe default the rule pack defines (a battery must go to drop-off, not to the
trash exception that only a confirmed alkaline battery gets). "unsafe" counts wrong answers for batteries and electronics. Writes the "app_decision" part of metrics.json.
"""
import json, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from compare import softmax  # noqa: E402
from embed import CACHE, ROOT  # noqa: E402
from final_eval import CHUNK  # noqa: E402
from heldup_test import decide, right_bins  # noqa: E402
from taxonomy import MATERIAL  # noqa: E402
from train import EXTERNAL, TRAIN_SOURCES, load  # noqa: E402


def main():
    key, model_dir = sys.argv[1:3]
    d = ROOT / model_dir
    rows, _, _ = load(key)
    split = np.array([r["split"] for r in rows])
    src = np.array([r["source"] for r in rows])
    ours = np.isin(src, TRAIN_SOURCES)
    idx = np.where(((split == "test") & ours) | (src == EXTERNAL))[0]
    parts = CACHE / f"{key}.final"
    Xs = np.concatenate([np.load(parts / f"{k}.npy") for k in range(0, len(idx), CHUNK)]).astype(np.float32)
    assert len(Xs) == len(idx), "cached embeddings do not match the test rows: rerun final_eval.py"
    X = np.zeros((len(rows), Xs.shape[1]), np.float32)
    X[idx] = Xs
    head = json.loads((d / "head.json").read_text())
    classes = head["classes"]
    W, b, t = np.array(head["W"], np.float32), np.array(head["b"], np.float32), head["temperature"]
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}
    m = json.loads((d / "metrics.json").read_text())
    m["app_decision"] = {}
    for part, mask in {"test": (split == "test") & ours, "external": src == EXTERNAL}.items():
        j = [i for i in np.where(mask)[0] if rows[i]["label"]]
        P = softmax((X[j] @ W.T + b) / t)
        for pid, pack in packs.items():
            tally = {"right": 0, "asked": 0, "wrong": 0, "unsafe": 0}
            for k, i in enumerate(j):
                kind, _, binid = decide(pack, classes, P[k])
                label = rows[i]["label"]
                if kind != "resolved":
                    tally["asked"] += 1
                elif binid in right_bins(pack, label, ""):
                    tally["right"] += 1
                else:
                    tally["wrong"] += 1
                    tally["unsafe"] += MATERIAL[label] == "hazardous"  # a battery or device shown a regular bin
            n = len(j)
            m["app_decision"].setdefault(pid, {})[part] = {"n": n, **tally, "right_rate": tally["right"] / n, "ask_rate": tally["asked"] / n,
                                                          "wrong_rate": tally["wrong"] / n, "right_when_answered": tally["right"] / max(1, n - tally["asked"])}
            s = m["app_decision"][pid][part]
            print(f"{part:8s} {pid:4s} n {n}  right {s['right_rate']:.3f}  asked {s['ask_rate']:.3f}  wrong {s['wrong_rate']:.3f}  unsafe {s['unsafe']}  "
                  f"right-when-answered {s['right_when_answered']:.3f}")
    (d / "metrics.json").write_text(json.dumps(m, indent=1))


if __name__ == "__main__":
    main()
