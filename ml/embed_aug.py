"""Extra embeddings of augmented training photos (random crop, flip, colour and blur), cached per backbone.

    .venv/bin/python ml/embed_aug.py ViT-B-32:openai --views 2

Writes ml/cache/<key>.aug.npy and <key>.aug.paths.txt (one line per view: the training photo's path).
train.py adds them as extra training rows with the photo's own labels when --aug is passed.
"""
import argparse, csv, sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision import transforms as T

sys.path.insert(0, str(Path(__file__).parent))
from embed import CACHE, DEV, ROOT, load  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--views", type=int, default=2)
    a = ap.parse_args()
    rows = [r for r in csv.DictReader(open(ROOT / "data/manifest.csv"))
            if r["split"] == "train" and r["source"] != "realwaste" and (r["label"] or r["material"])]
    model, preprocess, _ = load(a.spec)
    size = model.visual.preprocess_cfg["size"]
    size = size if isinstance(size, int) else size[0]
    norm = preprocess.transforms[-1]
    aug = T.Compose([
        T.RandomResizedCrop(size, scale=(0.45, 1.0), interpolation=T.InterpolationMode.BICUBIC),
        T.RandomHorizontalFlip(),
        T.RandomApply([T.ColorJitter(0.35, 0.35, 0.3, 0.04)], p=0.8),
        T.RandomApply([T.GaussianBlur(5, (0.1, 1.5))], p=0.2),
        T.ToTensor(), norm])
    torch.manual_seed(0)
    paths, out = [], []
    with torch.no_grad():
        for v in range(a.views):
            for i in range(0, len(rows), 64):
                chunk = rows[i:i + 64]
                x = torch.stack([aug(Image.open(ROOT / "data" / r["path"]).convert("RGB")) for r in chunk]).to(DEV)
                e = model.encode_image(x).float()
                out.append((e / e.norm(dim=-1, keepdim=True)).cpu().numpy().astype(np.float16))
                paths += [r["path"] for r in chunk]
            print(f"view {v + 1}/{a.views} done", flush=True)
    key = a.spec.replace(":", "__").replace("/", "_")
    np.save(CACHE / f"{key}.aug.npy", np.concatenate(out))
    (CACHE / f"{key}.aug.paths.txt").write_text("\n".join(paths))
    print(key, len(paths), "augmented views")


if __name__ == "__main__":
    main()
