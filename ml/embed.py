"""Image and text embeddings for every manifest row, per backbone, cached in ml/cache/.

    .venv/bin/python ml/embed.py ViT-B-32:openai ViT-B-32:laion2b_s34b_b79k
"""
import csv, sys
from pathlib import Path

import numpy as np
import open_clip
import torch
from PIL import Image
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import CLASSES, TEMPLATES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "ml/cache"
DEV = "mps" if torch.backends.mps.is_available() else "cpu"


def load(spec):
    arch, tag = spec.split(":")
    model, _, preprocess = open_clip.create_model_and_transforms(arch, pretrained=tag, device=DEV)
    return model.eval(), preprocess, open_clip.get_tokenizer(arch)


@torch.no_grad()
def text_embeddings(model, tok):
    out = []
    for prompts in CLASSES.values():
        t = tok([tpl.format(p) for p in prompts for tpl in TEMPLATES]).to(DEV)
        e = model.encode_text(t).float()
        e = e / e.norm(dim=-1, keepdim=True)
        m = e.mean(0)
        out.append((m / m.norm()).cpu().numpy())
    return np.stack(out)


@torch.no_grad()
def image_embeddings(model, preprocess, paths, bs=64):
    out = []
    for i in tqdm(range(0, len(paths), bs), desc="images", disable=not sys.stderr.isatty()):
        batch = torch.stack([preprocess(Image.open(p).convert("RGB")) for p in paths[i:i + bs]]).to(DEV)
        e = model.encode_image(batch).float()
        out.append((e / e.norm(dim=-1, keepdim=True)).cpu().numpy())
    return np.concatenate(out).astype(np.float16)


def main():
    rows = list(csv.DictReader(open(ROOT / "data/manifest.csv")))
    CACHE.mkdir(parents=True, exist_ok=True)
    for spec in sys.argv[1:]:
        key = spec.replace(":", "__").replace("/", "_")
        model, preprocess, tok = load(spec)
        np.save(CACHE / f"{key}.text.npy", text_embeddings(model, tok))
        f = CACHE / f"{key}.img.npy"
        done = {}
        if f.exists() and (CACHE / f"{key}.paths.txt").exists():
            old = np.load(f)
            done = dict(zip((CACHE / f"{key}.paths.txt").read_text().splitlines(), old))
        todo = [r["path"] for r in rows if r["path"] not in done]
        if todo:
            new = image_embeddings(model, preprocess, [ROOT / "data" / p for p in todo])
            done.update(zip(todo, new))
        paths = [r["path"] for r in rows]
        np.save(f, np.stack([done[p] for p in paths]))
        (CACHE / f"{key}.paths.txt").write_text("\n".join(paths))
        print(spec, "->", f.name, len(paths))


if __name__ == "__main__":
    main()
