"""Writes the results table in README.md from web/public/model/metrics.json, so the README never drifts from the model.

    .venv/bin/python ml/readme_results.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START, END = "<!-- results:start -->", "<!-- results:end -->"


def pct(x):
    return "—" if x is None else f"{x * 100:.1f}%"


ORDER = ["nyc", "sf", "la", "chi", "sea", "us"]  # the app's city order; any other pack follows
# metrics.json key, long name for the first table, short name for the per-city table. A set is listed only when metrics has it.
SETS = [("test", "All held-out test photos", "Held-out test"),
        ("test_original", "Held-out test photos from TrashNet, Garbage Dataset and TACO only", "Original three sources"),
        ("external", "RealWaste, never seen", "RealWaste"),
        ("field", "Web field test: stock photos and video frames of everyday items", "Field test")]


def main():
    m = json.loads((ROOT / "web/public/model/metrics.json").read_text())
    names = {p.stem: json.loads(p.read_text())["name"] for p in (ROOT / "web/public/rules").glob("*.json")}
    packs = sorted(names, key=lambda p: (ORDER.index(p) if p in ORDER else len(ORDER), p))
    zs = m.get("zero_shot", {})
    sets = [s for s in SETS if s[0] in m]
    lines = ["| Test set | Model | Item type | Material |", "| --- | --- | --- | --- |"]
    for k, name, _ in sets:
        name = f"{name} ({m[k]['n_item']:,} photos)"
        for model, s in [("Text prompts only (zero-shot)", zs.get(k)), ("**Cleanstream**", m[k])]:
            if s is None:
                continue
            lines.append(f"| {name} | {model} | {pct(s['item_acc'])} | {pct(s.get('material_acc'))} |")
            name = ""
    cols = [(short, model, s) for k, _, short in sets for model, s in [("zero-shot", zs.get(k)), ("**Cleanstream**", m[k])] if s is not None]
    lines += ["", "Right bin under each city's rules (the same model and photos; only the rule pack changes):", "",
              "| Rules | " + " | ".join(f"{short}: {model}" for short, model, _ in cols) + " |",
              "| --- |" + " --- |" * len(cols)]
    for p in packs:
        lines.append(f"| {names[p]} | " + " | ".join(pct(s["bin_acc"].get(p)) for _, _, s in cols) + " |")
    mat = [f"{m[k]['n_material']:,} for {what}" for k, what in [("test", "the held-out test"), ("external", "RealWaste")] if m.get(k, {}).get("n_material")]
    lines += ["", "Item type and bin columns use photos with an item label."
              + (f" The material column also counts photos labelled only by material ({' and '.join(mat)})." if mat else "")
              + (" A dash means the set has no labels of that kind." if any(s.get("material_acc") is None for _, _, s in cols) else "")]
    a = m.get("answered", {}).get("nyc", {})
    parts = [f"{what} it answers {pct(a[k]['coverage'])} of the photos and is right on {pct(a[k]['accuracy_answered'])} of those"
             for k, what in [("test", "on held-out test photos"), ("test_original", "on the original three sources"), ("external", "on RealWaste"), ("field", "on the web field test")]
             if k in a and a[k].get("accuracy_answered") is not None]
    if parts:
        lines += ["", "The app says it is not sure when the top bin gets less than 60% of the probability, and answers otherwise. "
                  "With NYC rules, " + "; ".join(parts) + "."]
    # What the screen actually does (ml/app_decision_eval.py, ml/heldup_test.py), conditions included.
    ad = m.get("app_decision", {}).get("nyc", {})
    held = ROOT / "ml/results/heldup.json"
    rows = [(f"Held-out test photos ({ad[k]['n']:,})" if k == "test" else f"RealWaste ({ad[k]['n']:,})", ad[k]) for k in ("test", "external") if k in ad]
    if held.exists():
        h = json.loads(held.read_text())
        rows.append((f"Held-up photos, labelled and frozen before scoring ({h['n']}; scored once, before NYC blister packs asked)", {**h["packs"]["nyc"], "n": h["n"]}))
    if rows:
        lines += ["", "What the screen does, with NYC rules: below 60% it asks which item, a pizza box asks whether it is greasy, "
                  "and otherwise it shows one bin. A photo whose condition can't be seen counts as right only for the safe default "
                  "(a battery of unknown chemistry must go to drop-off).", "",
                  "| Test set | Right bin shown | Asks | Wrong bin | Battery or device shown a regular bin |", "| --- | --- | --- | --- | --- |"]
        lines += [f"| {name} | {pct(s['right_rate'])} | {pct(s['ask_rate'])} | {pct(s['wrong_rate'])} | {s['unsafe']} |" for name, s in rows]
    if held.exists():
        lines += ["", f"On the held-up photos the item type is right on {pct(h['item_acc'])} and the visual bin (the rule used in the first "
                  f"table) on {pct(h['packs']['nyc']['visual_bin_acc'])}; when the app shows a bin it is right on "
                  f"{pct(h['packs']['nyc']['right_when_answered'])} of those photos (NYC rules)."]
    readme = ROOT / "README.md"
    text = readme.read_text()
    i, j = text.index(START) + len(START), text.index(END)
    readme.write_text(text[:i] + "\n" + "\n".join(lines) + "\n" + text[j:])
    print("README results updated")


if __name__ == "__main__":
    main()
