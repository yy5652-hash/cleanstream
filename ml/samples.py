"""Copies held-out test photos into web/public/samples for the "try a test photo" strip and the demo feed.

    .venv/bin/python ml/samples.py

One photo per item type, drawn at random (fixed seed) from the test split of the permissively licensed datasets,
without looking at whether the model gets it right.
"""
import csv, json, random, shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/public/samples"
SOURCES = {"trashnet": "TrashNet (MIT)", "garbage_v2": "Garbage Dataset (MIT)", "taco": "TACO (CC BY 4.0)"}
ORDER = ["plastic_bottle", "metal_can", "plastic_bag_film", "cardboard", "glass_bottle_jar", "paper_cup", "food_scraps",
         "battery", "snack_wrapper", "paper", "textile", "foam", "carton", "shoes", "plastic_container", "aluminum_foil",
         "cigarette_butt", "drinking_glass_ceramic", "plastic_cup", "pizza_box"]


def main():
    rows = [r for r in csv.DictReader(open(ROOT / "data/manifest.csv")) if r["split"] == "test" and r["label"] and r["source"] in SOURCES]
    rng = random.Random(7)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    picked = []
    for label in ORDER:
        pool = [r for r in rows if r["label"] == label and min(Image.open(ROOT / "data" / r["path"]).size) >= 160]
        if not pool:
            continue
        r = rng.choice(sorted(pool, key=lambda r: r["path"]))
        name = f"{len(picked):02d}-{label}.jpg"
        im = Image.open(ROOT / "data" / r["path"]).convert("RGB")
        im.thumbnail((512, 512))
        im.save(OUT / name, quality=88)
        picked.append({"file": name, "label": label, "source": SOURCES[r["source"]], "origin": r["path"]})
    (OUT / "samples.json").write_text(json.dumps(picked, indent=1))
    print(len(picked), "samples:", ", ".join(p["label"] for p in picked))


if __name__ == "__main__":
    main()
