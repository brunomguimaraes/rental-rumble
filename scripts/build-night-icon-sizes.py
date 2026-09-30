"""
Small derivatives of the Night UI icon masters for in-app use.

The masters in public/sprites/ui/night/*.png are 1254x1254 archival images
(~500 KB each, see docs/art/night/README.md). This crops each listed icon to
its visible pixels (plus a small margin), pads it square, and writes a 96x96
Lanczos-downscaled copy to public/sprites/ui/night/96/<name>.png. The icons
are smooth generated art, not a pixel grid, so any display size is fine.
Outputs are generated: rerun this script instead of editing them.

    python3 scripts/build-night-icon-sizes.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "sprites" / "ui" / "night"
OUT = SRC / "96"
SIZE = 96
NAMES = ["world-map", "your-box", "explore", "party"]


def derive(name: str) -> None:
    img = Image.open(SRC / f"{name}.png").convert("RGBA")
    alpha = img.getchannel("A").point(lambda a: 255 if a > 24 else 0)
    box = alpha.getbbox() or (0, 0, img.width, img.height)
    left, top, right, bottom = box
    side = max(right - left, bottom - top)
    margin = side // 16
    side += 2 * margin
    cx, cy = (left + right) // 2, (top + bottom) // 2
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    crop = img.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))
    square.paste(crop, (0, 0), crop)
    square.resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        derive(name)
        print(f"wrote {OUT / (name + '.png')}")


if __name__ == "__main__":
    main()
