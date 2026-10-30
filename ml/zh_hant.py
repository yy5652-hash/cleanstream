"""Writes web/public/i18n/zh-Hant.json from zh-Hans.json with OpenCC (Taiwan phrases), so the two never drift apart.

    .venv/bin/python ml/zh_hant.py
"""
import json
from pathlib import Path

from opencc import OpenCC

DIR = Path(__file__).resolve().parents[1] / "web/public/i18n"
cc = OpenCC("s2twp")


def convert(v):
    if isinstance(v, str):
        return cc.convert(v)
    if isinstance(v, list):
        return [convert(x) for x in v]
    return {k: convert(x) for k, x in v.items()}


d = json.loads((DIR / "zh-Hans.json").read_text())
# ui keys are the English source strings; only the values are Chinese. Ids and English keys stay as they are.
out = {sec: {k: convert(v) for k, v in d[sec].items()} for sec in d}
(DIR / "zh-Hant.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
print("wrote", DIR / "zh-Hant.json")
