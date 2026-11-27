"""Score the shipped head (web/public/model/head.json) against every rule pack, without retraining.

Adding a city only adds a rule pack, so its bin accuracy comes from the same held-out photos and the same model the
page downloads. Updates the per-city entries of metrics.json; existing cities must come out unchanged.

Uses the held-out embeddings final_eval.py cached from the shipped encoder.

  .venv/bin/python ml/eval_packs.py ViT-B-16-SigLIP2-256__int8__onnx
"""
import json, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from final_eval import CHUNK  # noqa: E402
from taxonomy import NAMES  # noqa: E402
from train import CACHE, EXTERNAL, ROOT, SCALE, TRAIN_SOURCES, bin_answers, load, scores, softmax  # noqa: E402


def main():
    key = sys.argv[1]
    model = ROOT / "web/public/model"
    rows, _, T = load(key)
    head = json.loads((model / "head.json").read_text())
    assert head["classes"] == NAMES
    W, b, temp = np.array(head["W"]), np.array(head["b"]), head["temperature"]
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}
    split = np.array([r["split"] for r in rows])
    src = np.array([r["source"] for r in rows])
    ours = np.isin(src, TRAIN_SOURCES)
    masks = {"test": (split == "test") & ours, "external": src == EXTERNAL}
    eval_idx = np.where(masks["test"] | masks["external"])[0]
    parts = CACHE / f"{key}.final"
    X = np.concatenate([np.load(parts / f"{k}.npy") for k in range(0, len(eval_idx), CHUNK)]).astype(np.float32)
    assert len(X) == len(eval_idx), "cached embeddings do not match the test rows: rerun final_eval.py"

    m = json.loads((model / "metrics.json").read_text())
    for part, mask in masks.items():
        idx = np.where(mask)[0]
        features = X[mask[eval_idx]]
        for Wm, bm, t, out in [(W, b, temp, m[part]), (T * SCALE, np.zeros(len(NAMES)), 1.0, m["zero_shot"][part])]:
            s = scores(softmax((features @ Wm.T + bm) / t), rows, idx, packs)
            for pid in packs:
                new = s[f"bin_acc_{pid}"]
                old = out["bin_acc"].get(pid)
                assert old is None or abs(old - new) < 1e-9, f"{pid} {part}: {old} != {new} (head or data changed)"
                out["bin_acc"][pid] = new
        P = softmax((features @ W.T + b) / temp)
        for pid, pack in packs.items():
            new = bin_answers(P, rows, idx, pack, 0.6)
            answered = m["answered"].setdefault(pid, {})
            assert part not in answered or answered[part] == new, f"{pid} {part}: answered metrics changed"
            answered[part] = new
    (model / "metrics.json").write_text(json.dumps(m, indent=1))
    for pid in packs:
        a = m["answered"][pid]
        print(f"{pid:4s} bin test {m['test']['bin_acc'][pid]:.3f}  external {m['external']['bin_acc'][pid]:.3f}  "
              f"answered test {a['test']['coverage']:.3f} @ {a['test']['accuracy_answered']:.3f}")


if __name__ == "__main__":
    main()
