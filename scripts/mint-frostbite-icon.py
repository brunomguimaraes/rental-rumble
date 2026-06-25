#!/usr/bin/env python3
"""Mints the Frostbite status pill — the energy-side counterpart to Burn — in the
exact FireRed pill style of the existing icons, fully offline.

Rather than re-cropping the pret sheet (see build-status-icons.py, which needs a
network fetch), this composes straight from the already-committed PNGs:
  - the pill FRAME + the "F" and "R" glyphs come from freeze.png ("FRZ"),
  - the "B" glyph comes from burn.png ("BRN"),
so the frame geometry and font are pixel-identical to the rest of the set. The
result is recoloured to an icy cyan (distinct from the soft periwinkle of the
unused freeze pill and from Burn's warm orange) and re-lettered "FRB".

Run: python3 scripts/mint-frostbite-icon.py
"""
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_DIR = os.path.join(ROOT, "public", "sprites", "status")
SCALE = 4

# Known source palette of the committed pills (recovered by ÷4 downscale).
WHITE = (255, 255, 255, 255)
FREEZE_FILL = (139, 180, 230, 255)
FREEZE_EDGE = (156, 197, 246, 255)

# Frostbite palette: a cold, saturated cyan so it reads as "icy + special" and
# stays clearly apart from the legacy freeze pill.
FROST_FILL = (74, 176, 200, 255)
FROST_EDGE = (146, 216, 235, 255)

# The shared font grid (cols, 0-indexed) in the cropped 20x8 pill: three 4px
# glyph slots with 1px gaps; glyph rows span y=1..6.
SLOTS = (3, 8, 13)
GLYPH_W, GLYPH_ROWS = 4, range(1, 7)


def source(name):
    """The committed pill at its original 20x8 source resolution."""
    im = Image.open(os.path.join(OUT_DIR, f"{name}.png")).convert("RGBA")
    w, h = im.size
    return im.resize((w // SCALE, h // SCALE), Image.NEAREST)


def glyph_mask(img, slot):
    """Extract a glyph (white pixels) from one 4px slot as a boolean grid."""
    px = img.load()
    return [
        [px[slot + c, y] == WHITE for c in range(GLYPH_W)] for y in GLYPH_ROWS
    ]


frz = source("freeze")
brn = source("burn")
sw, sh = frz.size

# F and R from FRZ's first two slots; B from BRN's first slot.
F = glyph_mask(frz, SLOTS[0])
R = glyph_mask(frz, SLOTS[1])
B = glyph_mask(brn, SLOTS[0])

out = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
op = out.load()
fp = frz.load()

# Base frame: recolour freeze's frame, flattening its old letters back to fill.
for y in range(sh):
    for x in range(sw):
        c = fp[x, y]
        if c[3] == 0:
            continue  # clipped corner / margin
        op[x, y] = FROST_EDGE if c == FREEZE_EDGE else FROST_FILL

# Stamp the new word.
for slot, mask in zip(SLOTS, (F, R, B)):
    for ry, row in enumerate(mask):
        for c, on in enumerate(row):
            if on:
                op[slot + c, 1 + ry] = WHITE

out = out.resize((sw * SCALE, sh * SCALE), Image.NEAREST)
out.save(os.path.join(OUT_DIR, "frostbite.png"))
print(f"  frostbite.png  {out.width}x{out.height}  -> {OUT_DIR}")
