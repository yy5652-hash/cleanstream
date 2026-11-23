"""Held-up test: photos of people holding one item, scored once with the exact file the page downloads.

    .venv/bin/python ml/heldup_test.py [manifest.csv image_dir out.json]   (defaults: ml/heldup.csv data/heldup ml/results/heldup.json)

Protocol, fixed before the model is run on these photos (see git history: ml/heldup.csv and this file are committed
before ml/results/heldup.json exists):
- ml/heldup.csv lists the photos (Wikimedia Commons, CC0 / public domain / CC BY / CC BY-SA), with the item type and,
  where it is visible in the photo, the condition (battery: alkaline / rechargeable / button; pizza box: greasy / clean;
  paper bag: soiled / clean). Labels were set by looking at each photo; no model output was consulted.
- Files are checked against their recorded SHA-256. Photos already used for training (Commons page ids in
  ml/commons_credits.csv) were excluded when collecting. Any photo within cosine 0.97 of an image from the training
  sources (the same rule train.py uses) is dropped before scoring and reported.
- Two scores, for every rule pack:
  1. Visual bin, the same rule as the other benchmarks: the top summed bin counts as right if any condition of the
     labelled item allows it.
  2. App decision, what the screen would actually do: the top summed bin below 60% asks which item; an item with a
     condition question asks it; an item with conditions and no question takes the case in its main bin; otherwise the
     item's bin. Each photo ends as right, asked, or wrong. The right bins are those of the labelled condition when it is
     visible, otherwise the item's main bin and its "also accepted" bins (the safe default the rules define).
     Wrong answers for a hazardous item (battery, electronics: ml/taxonomy.py MATERIAL) are also counted as unsafe.
- The numbers are reported as they come out; nothing is tuned on this set.
"""
import csv, hashlib, json, sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from compare import softmax  # noqa: E402
from embed import CACHE, ROOT, load, onnx_image_embeddings  # noqa: E402
from taxonomy import MATERIAL  # noqa: E402

SPEC = "ViT-B-16-SigLIP2-256:ml/cache/b16.safetensors"
MODEL = ROOT / "web/public/model"
TRAIN_CACHE = CACHE / "ViT-B-16-SigLIP2-256__int8__onnx.img.npy"
SURE = 0.6  # web/src/rules.ts SURE
DUP = 0.97  # ml/train.py drop_near_duplicates


def decide(pack, classes, p):
    """Mirror of web/src/rules.ts answer() + station-decision.ts stationDecision() for one photo."""
    mass = {}
    for c, q in zip(classes, p):
        b = pack["items"].get(c, {}).get("bin")
        if b:
            mass[b] = mass.get(b, 0.0) + float(q)
    top = max(mass, key=mass.get)
    if mass[top] < SURE:
        return "ask-item", None, top
    order = np.argsort(-p)
    item = next(classes[k] for k in order if pack["items"].get(classes[k], {}).get("bin") == top)
    rule = pack["items"][item]
    if rule.get("ask") and rule.get("cases"):
        return "ask-condition", item, top
    case = next((c for c in rule.get("cases", []) if c["bin"] == rule["bin"]), None)
    return "resolved", item, case["bin"] if case else rule["bin"]


def right_bins(pack, label, condition):
    rule = pack["items"][label]
    case = next((c for c in rule.get("cases", []) if c["id"] == condition), None)
    if case:
        return {case["bin"]}
    return {rule["bin"], *rule.get("also", [])}


def visual_ok(pack, label, top_bin):
    rule = pack["items"][label]
    return top_bin == rule["bin"] or top_bin in rule.get("also", []) or top_bin in [c["bin"] for c in rule.get("cases", [])]


def main():
    manifest, images, dest = (sys.argv[1:4] + [None] * 3)[:3]
    rows = list(csv.DictReader(open(manifest or ROOT / "ml/heldup.csv")))
    files = [Path(images or ROOT / "data/heldup") / f"{r['pageid']}.jpg" for r in rows]
    bad = [r["pageid"] for r, f in zip(rows, files) if hashlib.sha256(f.read_bytes()).hexdigest() != r["sha256"]]
    if bad:
        sys.exit(f"SHA-256 mismatch, refusing to score: {bad}")
    head = json.loads((MODEL / "head.json").read_text())
    classes = head["classes"]
    _, pre, _ = load(SPEC)
    X = onnx_image_embeddings(MODEL / "encoder.onnx", pre, files).astype(np.float32)
    X /= np.linalg.norm(X, axis=1, keepdims=True)
    T = np.load(TRAIN_CACHE).astype(np.float32)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    nearest = np.concatenate([(X @ T[i:i + 8192].T).max(1, keepdims=True) for i in range(0, len(T), 8192)], 1).max(1)
    keep = nearest < DUP
    dropped = [r["pageid"] for r, k in zip(rows, keep) if not k]
    rows, X = [r for r, k in zip(rows, keep) if k], X[keep]
    P = softmax((X @ np.array(head["W"], dtype=np.float32).T + np.array(head["b"], dtype=np.float32)) / head["temperature"])
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}

    out = {"n": len(rows), "near_duplicates_dropped": dropped, "item_acc": float(np.mean([classes[k] == r["label"] for k, r in zip(P.argmax(1), rows)])),
           "by_label": {}, "packs": {}, "rows": []}
    for lab in sorted({r["label"] for r in rows}):
        idx = [i for i, r in enumerate(rows) if r["label"] == lab]
        out["by_label"][lab] = {"n": len(idx), "item_acc": float(np.mean([classes[P[i].argmax()] == lab for i in idx]))}
    for pid, pack in packs.items():
        tally = {"visual_ok": 0, "right": 0, "asked": 0, "wrong": 0, "unsafe": 0, "answered": 0}
        for i, r in enumerate(rows):
            kind, item, b = decide(pack, classes, P[i])
            mass = {}
            for c, q in zip(classes, P[i]):
                bb = pack["items"].get(c, {}).get("bin")
                if bb:
                    mass[bb] = mass.get(bb, 0.0) + float(q)
            tally["visual_ok"] += visual_ok(pack, r["label"], max(mass, key=mass.get))
            good = right_bins(pack, r["label"], r["condition"])
            if kind != "resolved":
                tally["asked"] += 1
                verdict = "asked"
            else:
                tally["answered"] += 1
                if b in good:
                    tally["right"] += 1
                    verdict = "right"
                else:
                    tally["wrong"] += 1
                    verdict = "wrong"
                    if MATERIAL[r["label"]] == "hazardous":
                        tally["unsafe"] += 1
                        verdict = "unsafe"
            if pid == "nyc":
                out["rows"].append({"pageid": r["pageid"], "label": r["label"], "condition": r["condition"], "pred_item": classes[P[i].argmax()],
                                    "decision": kind, "shown_item": item, "bin": b, "verdict": verdict})
        n = len(rows)
        out["packs"][pid] = {**tally, "visual_bin_acc": tally["visual_ok"] / n, "right_rate": tally["right"] / n, "ask_rate": tally["asked"] / n,
                             "wrong_rate": tally["wrong"] / n, "right_when_answered": tally["right"] / max(1, tally["answered"])}
    dest = Path(dest or ROOT / "ml/results/heldup.json")
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(out, indent=1))
    print(f"held-up photos {out['n']} (near-duplicates dropped {len(dropped)})  item {out['item_acc']:.3f}")
    for pid, s in out["packs"].items():
        print(f"{pid:4s} visual bin {s['visual_bin_acc']:.3f} | app: right {s['right_rate']:.3f} asked {s['ask_rate']:.3f} wrong {s['wrong_rate']:.3f} "
              f"(unsafe {s['unsafe']}) right-when-answered {s['right_when_answered']:.3f}")


if __name__ == "__main__":
    main()
