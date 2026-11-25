"""From the repo root, run .venv/bin/python ml/web_parity.py /tmp/browser-probs.json after
ml/web_parity.mjs. This compares the frozen photos and writes ml/results/web_parity.json.
Use --selftest to check the comparison without running the encoder.
"""

import argparse
import json
from pathlib import Path

import numpy as np

from heldup_test import MODEL, ROOT, SPEC, decide, load, onnx_image_embeddings, softmax


def compare(rows, classes, python, browser, packs):
    """Agreement counts use the complete (kind, shown item, bin) returned by decide."""
    if not rows or python.shape != browser.shape or python.shape != (len(rows), len(classes)):
        raise ValueError("Expected one probability per class and photo")
    if not np.isfinite(python).all() or not np.isfinite(browser).all():
        raise ValueError("Non-finite probability")

    delta = np.abs(python.astype(np.float64) - browser)
    item_agree = 0
    pack_agree = {name: 0 for name in packs}
    disagreements = []
    per_photo = []
    for i, row in enumerate(rows):
        py_top, web_top = python[i].argmax(), browser[i].argmax()
        same_item = bool(py_top == web_top)
        item_agree += same_item
        max_diff = float(delta[i].max())
        photo = {"pageid": row["pageid"], "label": row["label"], "max_abs_dp": max_diff,
                 "python_item": classes[py_top], "browser_item": classes[web_top]}
        per_photo.append(photo)
        decisions = {}
        for name, pack in packs.items():
            py_decision = decide(pack, classes, python[i])
            web_decision = decide(pack, classes, browser[i])
            pack_agree[name] += py_decision == web_decision
            if py_decision != web_decision or not same_item:
                decisions[name] = {"python": py_decision, "browser": web_decision}
        if decisions:
            disagreements.append({**photo, "python_top_p": float(python[i, py_top]),
                                  "browser_top_p": float(browser[i, web_top]), "decisions": decisions})

    summary = {"n": len(rows), "item_agree": item_agree, "decision_agree": pack_agree,
               "max_abs_dp": float(delta.max()), "mean_abs_dp": float(delta.mean())}
    return {"summary": summary, "disagreements": disagreements, "rows": per_photo}


def main(args):
    rows = json.loads(args.heldup.read_text())["rows"]
    capture = json.loads(args.browser.read_text())
    head = json.loads((MODEL / "head.json").read_text())
    classes = head["classes"]
    if capture.get("classes", classes) != classes:
        raise ValueError("Browser and local model class orders differ")

    # Align by page ID so reordered captures still compare the same JPEGs.
    probs = {str(row["pageid"]): row["probs"] for row in capture["rows"]}
    ids = [str(row["pageid"]) for row in rows]
    if len(probs) != len(capture["rows"]) or len(set(ids)) != len(ids) or set(probs) != set(ids):
        raise ValueError("Expected exactly one browser row for every held-up page ID")
    browser = np.array([probs[pid] for pid in ids], dtype=np.float32)

    # heldup.json already contains the photos retained by the scorer's duplicate filter.
    files = [args.images / f"{pid}.jpg" for pid in ids]
    _, preprocess, _ = load(SPEC)
    embeddings = onnx_image_embeddings(MODEL / "encoder.onnx", preprocess, files).astype(np.float32)
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
    weights = np.array(head["W"], dtype=np.float32)
    bias = np.array(head["b"], dtype=np.float32)
    python = softmax((embeddings @ weights.T + bias) / head["temperature"])

    paths = sorted((ROOT / "web/public/rules").glob("*.json"), key=lambda p: (p.stem != "nyc", p.stem))
    packs = {p.stem: json.loads(p.read_text()) for p in paths}
    report = compare(rows, classes, python, browser, packs)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"], indent=2))


def selftest():
    classes = ["bottle", "paper"]
    rows = [{"pageid": str(i), "label": "bottle"} for i in range(3)]
    separate = {"items": {"bottle": {"bin": "blue"}, "paper": {"bin": "green"}}}
    combined = {"items": {"bottle": {"bin": "blue"}, "paper": {"bin": "blue"}}}
    python = np.array([[0.61, 0.39], [0.49, 0.51], [0.75, 0.25]])
    browser = np.array([[0.59, 0.41], [0.51, 0.49], [0.75, 0.25]])
    result = compare(rows, classes, python, browser, {"nyc": separate, "other": combined})
    summary = result["summary"]
    assert (summary["item_agree"], summary["n"]) == (2, 3)
    assert summary["decision_agree"] == {"nyc": 1, "other": 2}
    assert np.isclose(summary["max_abs_dp"], 0.02)
    assert np.isclose(summary["mean_abs_dp"], 0.08 / 6)
    first, second = result["disagreements"]
    assert first["pageid"] == "0" and second["pageid"] == "1"
    assert first["decisions"] == {"nyc": {"python": ("resolved", "bottle", "blue"),
                                          "browser": ("ask-item", None, "blue")}}
    assert (first["python_top_p"], first["browser_top_p"]) == (0.61, 0.59)
    print("Parity comparison selftest passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("browser", type=Path, nargs="?")
    parser.add_argument("--heldup", type=Path, default=ROOT / "ml/results/heldup.json")
    parser.add_argument("--images", type=Path, default=ROOT / "data/heldup")
    parser.add_argument("--output", type=Path, default=ROOT / "ml/results/web_parity.json")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        selftest()
    elif args.browser is None:
        parser.error("provide the browser probabilities JSON or --selftest")
    else:
        main(args)
