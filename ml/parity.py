"""Checks that the shipped int8 ONNX encoder agrees with the PyTorch model used for evaluation.

    .venv/bin/python ml/parity.py ViT-B-32:openai web/public/model [n]

Runs n held-out test photos through both and reports embedding cosine and item-type agreement.
"""
import csv, json, random, sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from embed import load  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def main(spec, model_dir, n=300):
    d = Path(model_dir)
    head = json.loads((d / "head.json").read_text())
    W, b, t = np.array(head["W"], np.float32), np.array(head["b"], np.float32), head["temperature"]
    model, preprocess, _ = load(spec)
    model = model.to("cpu")
    sess = ort.InferenceSession(str(d / "encoder.onnx"))
    rows = [r for r in csv.DictReader(open(ROOT / "data/manifest.csv")) if r["split"] == "test" and r["label"]]
    rows = random.Random(0).sample(rows, int(n))
    cos, same, ok_t, ok_o = [], 0, 0, 0
    for r in rows:
        x = preprocess(Image.open(ROOT / "data" / r["path"]).convert("RGB")).unsqueeze(0)
        with torch.no_grad():
            e = model.encode_image(x).float()
            e = (e / e.norm(dim=-1, keepdim=True)).numpy()[0]
        o = sess.run(None, {"pixels": x.numpy()})[0][0]
        cos.append(float(e @ o))
        pt, po = int(np.argmax(W @ e + b)), int(np.argmax(W @ o + b))
        same += pt == po
        ok_t += head["classes"][pt] == r["label"]
        ok_o += head["classes"][po] == r["label"]
    print(f"{n} photos: cosine mean {np.mean(cos):.4f} min {np.min(cos):.4f}; same item type {same / len(rows):.3f}; "
          f"accuracy fp32 {ok_t / len(rows):.3f} vs int8 {ok_o / len(rows):.3f}")


if __name__ == "__main__":
    main(*sys.argv[1:])
