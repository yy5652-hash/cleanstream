"""Run .venv/bin/python ml/resize_fixtures.py to regenerate the RGB byte fixtures with Pillow 13."""

from pathlib import Path

import numpy as np
from PIL import Image

DEST = Path(__file__).resolve().parents[1] / "web/src/model/__fixtures__"
CASES = {
    "large": (1000, 700),
    "odd": (333, 217),
    "upscale": (200, 150),
    "wide": (1200, 90),
    "identity": (256, 256),
    "portrait": (500, 1200),
}


def source(width, height):
    y, x = np.ogrid[:height, :width]
    mix = (x * y) % 251
    return np.stack([
        (17 * x + 31 * y + mix) % 256,
        (7 * x + 53 * mix) % 256,
        (43 * y + 11 * mix) % 256,
    ], axis=-1).astype(np.uint8)


if __name__ == "__main__":
    DEST.mkdir(exist_ok=True, parents=True)
    for name, (width, height) in CASES.items():
        image = Image.fromarray(source(width, height))
        expected = image.resize((256, 256), Image.Resampling.BICUBIC)
        (DEST / f"resize_{name}.bin").write_bytes(expected.tobytes())
