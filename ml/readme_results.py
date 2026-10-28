"""Writes the results table in README.md from web/public/model/metrics.json, so the README never drifts from the model.

    .venv/bin/python ml/readme_results.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START, END = "<!-- results:start -->", "<!-- results:end -->"


def pct(x):
    return f"{x * 100:.1f}%"


ORDER = ["nyc", "sf", "la", "chi", "sea", "us"]  # the app's city order; any other pack follows


def main():
    m = json.loads((ROOT / "web/public/model/metrics.json").read_text())
    names = {p.stem: json.loads(p.read_text())["name"] for p in (ROOT / "web/public/rules").glob("*.json")}
    packs = sorted(names, key=lambda p: (ORDER.index(p) if p in ORDER else len(ORDER), p))
    sets = [(f"Held-out test split ({m['test']['n_item']:,} photos)", "test"), (f"RealWaste, never seen ({m['external']['n_item']:,} photos)", "external")]
    lines = ["| Test set | Model | Item type | Material |", "| --- | --- | --- | --- |"]
    for name, k in sets:
        for model, s in [("Text prompts only (zero-shot)", m["zero_shot"][k]), ("**Cleanstream**", m[k])]:
            lines.append(f"| {name} | {model} | {pct(s['item_acc'])} | {pct(s['material_acc'])} |")
            name = ""
    lines += ["", "Right bin under each city's rules (the same model and photos; only the rule pack changes):", "",
              "| Rules | Held-out test: zero-shot | Held-out test: **Cleanstream** | RealWaste: zero-shot | RealWaste: **Cleanstream** |",
              "| --- | --- | --- | --- | --- |"]
    for p in packs:
        lines.append(f"| {names[p]} | " + " | ".join(pct(s[k]["bin_acc"][p]) for k in ("test", "external") for s in (m["zero_shot"], m)) + " |")
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
