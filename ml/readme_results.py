"""Writes the results table in README.md from web/public/model/metrics.json, so the README never drifts from the model.

    .venv/bin/python ml/readme_results.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START, END = "<!-- results:start -->", "<!-- results:end -->"


def pct(x):
    return f"{x * 100:.1f}%"


def main():
    m = json.loads((ROOT / "web/public/model/metrics.json").read_text())
    packs = [("nyc", "NYC"), ("sf", "San Francisco"), ("us", "US general")]
    lines = ["| Test set | Model | Item type | Material | " + " | ".join(f"Bin ({n})" for _, n in packs) + " |",
             "| --- | --- | --- | --- | " + " | ".join("---" for _ in packs) + " |"]
    for name, k in [(f"Held-out test split ({m['test']['n_item']:,} photos)", "test"),
                    (f"RealWaste, never seen ({m['external']['n_item']:,} photos)", "external")]:
        for model, s in [("Text prompts only (zero-shot)", m["zero_shot"][k]), ("**Cleanstream**", m[k])]:
            lines.append(f"| {name} | {model} | {pct(s['item_acc'])} | {pct(s['material_acc'])} | "
                         + " | ".join(pct(s["bin_acc"][p]) for p, _ in packs) + " |")
            name = ""
    a = m["answered"]["nyc"]
    lines += ["", f"Item type and bin columns use photos with an item label. The material column also counts photos labelled only "
              f"by material ({m['test']['n_material']:,} and {m['external']['n_material']:,}).",
              "", f"When the top bin is below 60% the app says it is not sure. With NYC rules it answers {pct(a['test']['coverage'])} of "
              f"held-out test photos and is right on {pct(a['test']['accuracy_answered'])} of those; on RealWaste it answers "
              f"{pct(a['external']['coverage'])} and is right on {pct(a['external']['accuracy_answered'])}."]
    readme = ROOT / "README.md"
    text = readme.read_text()
    i, j = text.index(START) + len(START), text.index(END)
    readme.write_text(text[:i] + "\n" + "\n".join(lines) + "\n" + text[j:])
    print("README results updated")


if __name__ == "__main__":
    main()
