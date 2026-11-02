"""Builds data/manifest.csv from the downloaded datasets: one row per image (or TACO object crop).

    .venv/bin/python ml/prepare.py

Splits are fixed by a hash of the source image, so crops of one TACO photo never land in two splits.
"""
import csv, hashlib, json, sys
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import COMMONS, EWASTE, GARBAGE_V2, HOUSEHOLD, WARP, MATERIAL, REALWASTE, TACO, TRASHNET  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
IMG = {".jpg", ".jpeg", ".png", ".webp"}
PAD = 1.1  # crop side relative to the object's longer side: a little context, not much ground
COARSE = {"metal": "metal", "plastic": "plastic", "Metal": "metal", "Plastic": "plastic"}


def split_of(key):
    h = int(hashlib.sha1(key.encode()).hexdigest()[:8], 16) % 100
    return "train" if h < 70 else "val" if h < 85 else "test"


def folder_dataset(name, top, mapping):
    """Rows for a dataset laid out as <class folder>/<image>."""
    rows = []
    for d in sorted(p for p in top.rglob("*") if p.is_dir() and p.name in mapping and "__MACOSX" not in str(p)):
        label = mapping[d.name]
        material = MATERIAL[label] if label else COARSE.get(d.name, "")
        for f in sorted(d.iterdir()):
            if f.suffix.lower() in IMG:
                rows.append({"path": str(f.relative_to(DATA)), "source": name, "label": label or "",
                             "material": material, "split": split_of(f"{name}/{f.name}")})
    return rows


def taco_crops(top):
    """Crops every mapped TACO object to a square with some context and saves it under data/taco_crops."""
    ann = next(top.rglob("annotations.json"))
    coco = json.loads(ann.read_text())
    cats = {c["id"]: c["name"] for c in coco["categories"]}
    images = {i["id"]: i for i in coco["images"]}
    out = DATA / f"taco_crops_p{int(PAD * 100)}"
    out.mkdir(exist_ok=True)
    rows, opened = [], {}
    for a in sorted(coco["annotations"], key=lambda a: a["image_id"]):
        label = TACO.get(cats[a["category_id"]])
        x, y, w, h = a["bbox"]
        if not label or max(w, h) < 40:
            continue
        info = images[a["image_id"]]
        dest = out / f"{a['id']}.jpg"
        if not dest.exists():
            if info["id"] not in opened:
                im = Image.open(ann.parent / info["file_name"])
                if im.size != (info["width"], info["height"]):  # some photos are stored rotated: boxes follow the EXIF view
                    im = ImageOps.exif_transpose(im)
                opened = {info["id"]: im.convert("RGB") if im.size == (info["width"], info["height"]) else None}
            im = opened[info["id"]]
            if im is None:
                continue
            side = max(w, h) * PAD
            cx, cy = x + w / 2, y + h / 2
            box = [max(0, cx - side / 2), max(0, cy - side / 2), min(im.width, cx + side / 2), min(im.height, cy + side / 2)]
            crop = im.crop(tuple(int(v) for v in box))
            crop.thumbnail((384, 384))
            crop.save(dest, quality=92)
        rows.append({"path": str(dest.relative_to(DATA)), "source": "taco", "label": label,
                     "material": MATERIAL[label], "split": split_of(f"taco/{info['file_name']}")})
    return rows


def nested_dataset(name, top, mapping):
    """Rows for a dataset with images anywhere below its class folders; file names repeat, so the split key is the whole path."""
    rows = []
    for d in sorted(p for p in top.rglob("*") if p.is_dir() and p.name in mapping and "__MACOSX" not in str(p)):
        for f in sorted(d.rglob("*")):
            if f.suffix.lower() in IMG:
                key = str(f.relative_to(DATA))
                rows.append({"path": key, "source": name, "label": mapping[d.name], "material": MATERIAL[mapping[d.name]], "split": split_of(key)})
    return rows


def main():
    rows = folder_dataset("trashnet", DATA / "trashnet", TRASHNET)
    for name, sub, mapping in [("realwaste", "realwaste", REALWASTE), ("garbage_v2", "garbage_v2/standardized_384", GARBAGE_V2)]:
        if (DATA / sub).exists():
            rows += folder_dataset(name, DATA / sub, mapping)
    if (DATA / "taco").exists():
        rows += taco_crops(DATA / "taco")
    for name, mapping in [("household", HOUSEHOLD), ("ewaste", EWASTE)]:
        if (DATA / name).exists():
            rows += nested_dataset(name, DATA / name, mapping)
    if (DATA / "warp/Warp-C").exists():
        rows += nested_dataset("warp", DATA / "warp/Warp-C", WARP)
    if (DATA / "commons").exists():
        keep = ROOT / "ml/commons_keep.txt"  # written by ml/filter_commons.py: photos that really show the item type
        kept = set(keep.read_text().splitlines()) if keep.exists() else None
        rescued = {r["path"]: r["label"] for r in csv.DictReader(open(ROOT / "ml/commons_rescue.csv"))}  # picked by eye from what the filter removed
        commons = nested_dataset("commons", DATA / "commons", {c: c for c in COMMONS})
        for r in commons:
            if r["path"] in rescued:
                r["label"], r["material"] = rescued[r["path"]], MATERIAL[rescued[r["path"]]]
        rows += [r for r in commons if kept is None or r["path"] in kept or r["path"] in rescued]
    fixes = ROOT / "ml/relabel.csv"  # label corrections from ml/fix_labels.py (cartons filed as cardboard)
    if fixes.exists():
        new = {r["path"]: r["label"] for r in csv.DictReader(open(fixes))}
        for r in rows:
            if r["path"] in new:
                r["label"], r["material"] = new[r["path"]], MATERIAL[new[r["path"]]]
    with open(DATA / "manifest.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["path", "source", "label", "material", "split"])
        w.writeheader()
        w.writerows(rows)
    by = {}
    for r in rows:
        by[(r["source"], r["split"])] = by.get((r["source"], r["split"]), 0) + 1
    print(len(rows), "rows", by)


if __name__ == "__main__":
    main()
