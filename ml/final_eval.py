"""Final numbers, from the encoder.onnx file itself: held-out test photos, RealWaste and the web field test.

    .venv/bin/python ml/final_eval.py ViT-B-16-SigLIP2-256:ml/cache/b16.safetensors web/public/model KEY

KEY names the cached text embeddings and manifest used for training. Writes the test, external, zero_shot and answered parts
of web/public/model/metrics.json, plus field and original-sources results, so the README and the app show what the file does.
"""
import csv, json, sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from embed import CACHE, ROOT, load as load_model, onnx_image_embeddings  # noqa: E402
from taxonomy import NAMES  # noqa: E402
from train import EXTERNAL, SCALE, TRAIN_SOURCES, bin_answers, load, scores, softmax  # noqa: E402

ORIGINAL = ["trashnet", "garbage_v2", "taco"]
CHUNK = 320


def brief(r):
    return {"item_acc": r["item_acc"], "material_acc": r["material_acc"], "n_item": r["n_item"], "n_material": r["n_material"],
            "bin_acc": {k[8:]: v for k, v in r.items() if k.startswith("bin_acc_")}}


def main():
    embed_only = "--embed-only" in sys.argv
    spec, model_dir, key = [a for a in sys.argv[1:] if not a.startswith("--")]
    d = ROOT / model_dir
    rows, _, T = load(key)
    split = np.array([r["split"] for r in rows])
    src = np.array([r["source"] for r in rows])
    ours = np.isin(src, TRAIN_SOURCES)
    idx = np.where(((split == "test") & ours) | (src == EXTERNAL))[0]
    _, pre, _ = load_model(spec)
    # Chunks on disk: resumable, and several --embed-only processes can share the work
    parts = CACHE / f"{key}.final"
    parts.mkdir(exist_ok=True)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 3
    sess = None
    chunks = list(range(0, len(idx), CHUNK))
    for k in chunks:
        out, claim = parts / f"{k}.npy", parts / f"{k}.claim"
        if out.exists() or (embed_only and claim.exists()):
            continue
        claim.touch()
        sess = sess or ort.InferenceSession(str(d / "encoder.onnx"), opts)
        files = [ROOT / "data" / rows[i]["path"] for i in idx[k:k + CHUNK]]
        e = np.concatenate([sess.run(None, {"pixels": np.stack([pre(Image.open(f).convert("RGB")).numpy() for f in files[i:i + 32]])})[0] for i in range(0, len(files), 32)])
        np.save(parts / f"{k}.tmp.npy", e.astype(np.float16))
        (parts / f"{k}.tmp.npy").rename(out)
        print("chunk", k, "of", len(idx), flush=True)
    if embed_only:
        return
    Xs = np.concatenate([np.load(parts / f"{k}.npy") for k in chunks]).astype(np.float32)
    X = np.zeros((len(rows), Xs.shape[1]), np.float32)
    X[idx] = Xs
    head = json.loads((d / "head.json").read_text())
    W, b, t = np.array(head["W"]), np.array(head["b"]), head["temperature"]
    packs = {p.stem: json.loads(p.read_text()) for p in sorted((ROOT / "web/public/rules").glob("*.json"))}
    m = json.loads((d / "metrics.json").read_text())
    groups = {"test": (split == "test") & ours, "external": src == EXTERNAL}
    m["zero_shot"] = {}
    m["answered"] = {}
    for part, mask in groups.items():
        j = np.where(mask)[0]
        m[part] = brief(scores(softmax((X[j] @ W.T + b) / t), rows, j, packs))
        m["zero_shot"][part] = brief(scores(softmax(X[j] @ (T * SCALE).T), rows, j, packs))
        P = softmax((X[j] @ W.T + b) / t)
        for pid, pack in packs.items():
            m["answered"].setdefault(pid, {})[part] = bin_answers(P, rows, j, pack, 0.6)
    j = np.where((split == "test") & np.isin(src, ORIGINAL))[0]
    m["test_original"] = brief(scores(softmax((X[j] @ W.T + b) / t), rows, j, packs))
    # the web field test
    fr = list(csv.DictReader(open(ROOT / "ml/field.csv")))
    fx = onnx_image_embeddings(d / "encoder.onnx", pre, [ROOT / "data/field" / (r["file"] + ".jpg") for r in fr]).astype(np.float32)  # noqa: E501
    P = softmax((fx @ W.T + b) / t)
    frows = [{"label": r["label"], "material": ""} for r in fr]
    m["field"] = brief(scores(P, frows, np.arange(len(fr)), packs))
    wrong = [f"{r['file']}: {r['label']} -> {NAMES[P[i].argmax()]}" for i, r in enumerate(fr) if NAMES[P[i].argmax()] != r["label"]]
    (d / "metrics.json").write_text(json.dumps(m, indent=1))
    for k in ("test", "test_original", "external", "field"):
        print(k, m[k]["n_item"], "item", round(m[k]["item_acc"], 4), {p: round(v, 4) for p, v in m[k]["bin_acc"].items()})
    print("field errors:", "; ".join(wrong))


if __name__ == "__main__":
    main()
