"""Embeddings from the shipped int8 weights, on the Mac's GPU: encoder.onnx takes hours on CPU for B/16.

    .venv/bin/python ml/embed_int8.py ViT-B-16-SigLIP2-256:ml/cache/b16.safetensors web/public/model

Rounds every large Linear and Conv2d weight to int8 with one scale per output, exactly as ml/wq.py does for ONNX, then
embeds with those weights. The cache key ends in __onnx like other shipped-model embeddings; the script first compares 300
photos with encoder.onnx itself and stops if they differ.
"""
import csv, random, sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from embed import CACHE, DEV, ROOT, load, text_embeddings  # noqa: E402


@torch.no_grad()
def to_int8(model, min_size=4096):
    n = 0
    for m in model.modules():
        if isinstance(m, (torch.nn.Linear, torch.nn.Conv2d)) and m.weight.numel() >= min_size:
            w = m.weight.data
            other = tuple(range(1, w.ndim))
            scale = w.abs().amax(dim=other, keepdim=True) / 127.0
            scale[scale == 0] = 1.0
            m.weight.data = torch.clamp(torch.round(w / scale), -127, 127) * scale
            n += 1
    return n


@torch.no_grad()
def embed(model, preprocess, files, bs=64):
    out = []
    for i in range(0, len(files), bs):
        b = torch.stack([preprocess(Image.open(f).convert("RGB")) for f in files[i:i + bs]]).to(DEV)
        e = model.encode_image(b).float()
        out.append((e / e.norm(dim=-1, keepdim=True)).cpu().numpy().astype(np.float16))
        if i % (bs * 50) == 0:
            print(i, "of", len(files), flush=True)
    return np.concatenate(out)


def main(spec, model_dir):
    arch = spec.split(":")[0]
    key = arch + "__int8__onnx"
    rows = list(csv.DictReader(open(ROOT / "data/manifest.csv")))
    model, preprocess, tok = load(spec)
    text = text_embeddings(model, tok)  # the text side is not shipped, so it stays as published
    print("rounded", to_int8(model.visual), "image weight tensors to int8", flush=True)
    sess = ort.InferenceSession(str(Path(model_dir) / "encoder.onnx"))
    pick = random.Random(0).sample(rows, 300)
    files = [ROOT / "data" / r["path"] for r in pick]
    a = embed(model, preprocess, files).astype(np.float32)
    b = np.concatenate([sess.run(None, {"pixels": np.stack([preprocess(Image.open(f).convert("RGB")).numpy() for f in files[i:i + 32]])})[0] for i in range(0, 300, 32)])
    cos = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
    print(f"cosine to encoder.onnx over 300 photos: mean {cos.mean():.5f}, min {cos.min():.5f}", flush=True)
    assert cos.mean() > 0.999, "these weights do not match encoder.onnx"
    np.save(CACHE / f"{key}.text.npy", text)
    paths = [r["path"] for r in rows]
    # dedupe: one manifest path appears twice
    uniq = list(dict.fromkeys(paths))
    X = embed(model, preprocess, [ROOT / "data" / p for p in uniq])
    done = dict(zip(uniq, X))
    np.save(CACHE / f"{key}.img.npy", np.stack([done[p] for p in paths]))
    (CACHE / f"{key}.paths.txt").write_text("\n".join(paths))
    print("wrote", key, len(paths))


if __name__ == "__main__":
    main(*sys.argv[1:])
