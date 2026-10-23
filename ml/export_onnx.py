"""Exports a CLIP image encoder to ONNX (int8 weights) for the browser, and checks it against PyTorch.

    .venv/bin/python ml/export_onnx.py ViT-B-32:openai web/public/model

Writes encoder.onnx (input "pixels" N x 3 x S x S, normalised as in preprocess.json; output "embedding", L2-normalised)
and preprocess.json (size, mean, std) so the browser preprocesses exactly like training.
"""
import json, sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import open_clip
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic


class Encoder(torch.nn.Module):
    def __init__(self, visual):
        super().__init__()
        self.visual = visual

    def forward(self, pixels):
        e = self.visual(pixels)
        return e / e.norm(dim=-1, keepdim=True)


def main(spec, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    arch, tag = spec.split(":")
    model, _, preprocess = open_clip.create_model_and_transforms(arch, pretrained=tag)
    model.eval()
    cfg = model.visual.preprocess_cfg
    size = cfg["size"] if isinstance(cfg["size"], int) else cfg["size"][0]
    enc = Encoder(model.visual).eval()
    x = torch.randn(2, 3, size, size)
    fp32 = out / "encoder.fp32.onnx"
    torch.onnx.export(enc, x, fp32, input_names=["pixels"], output_names=["embedding"],
                      dynamic_axes={"pixels": {0: "n"}, "embedding": {0: "n"}}, opset_version=17, dynamo=False)
    q = out / "encoder.onnx"
    quantize_dynamic(fp32, q, weight_type=QuantType.QUInt8)
    fp32.unlink()
    with torch.no_grad():
        ref = enc(x).numpy()
    got = ort.InferenceSession(str(q)).run(None, {"pixels": x.numpy()})[0]
    cos = (ref * got).sum(1)
    (out / "preprocess.json").write_text(json.dumps({
        "backbone": spec, "size": size, "mean": list(cfg["mean"]), "std": list(cfg["std"]),
        "resize": "shorter side to size, then center crop"}))
    print(f"{q} {q.stat().st_size / 1e6:.1f} MB, cosine to fp32 {cos.min():.4f}..{cos.max():.4f}, size {size}")


if __name__ == "__main__":
    main(*sys.argv[1:])
