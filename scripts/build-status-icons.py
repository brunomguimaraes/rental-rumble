#!/usr/bin/env python3
"""Builds the FireRed/LeafGreen status-condition icons into
public/sprites/status/<status>.png.

The source is the in-game status icon sheet from the pret/pokefirered
disassembly: a 256x8 4bpp strip of eight 32x8 cells in this order:
  poison, paralyzed, sleep, frozen, burn, pokerus, faint, blank.

These are (c) Nintendo/Game Freak, used here only for a private,
non-commercial project. Each cell is cropped to its content, palette
index 0 (the green key colour) is made transparent, and the result is
upscaled with nearest-neighbour so it stays crisp at any size.

Run: python3 scripts/build-status-icons.py
"""
import io
import os
import urllib.request

from PIL import Image

SRC = "https://raw.githubusercontent.com/pret/pokefirered/master/graphics/interface/status_icons.png"

# Cell index in the sheet -> our StatusKind file name. Paralysis maps to the
# game's "stun" status; freeze is included for completeness even though the
# battle engine never inflicts it.
CELLS = {
    0: "poison",
    1: "stun",
    2: "sleep",
    3: "freeze",
    4: "burn",
}

SCALE = 4
CELL_W = 32
CELL_H = 8

# Confusion has no in-game marker (it is a volatile status), so we mint one in
# the same pill style: a dark "???" badge. Built from the poison cell's frame
# geometry, recoloured, with three hand-drawn 4x6 question-mark glyphs stamped
# at the same column slots the real font uses (x = 9, 14, 19).
CONFUSION_FILL = (52, 52, 64, 255)
CONFUSION_EDGE = (96, 96, 112, 255)
WHITE = (255, 255, 255, 255)
QMARK = [
    "0110",
    "1001",
    "0001",
    "0010",
    "0000",
    "0010",
]
GLYPH_COLS = (9, 14, 19)

root = os.path.join(os.path.dirname(__file__), "..")
out_dir = os.path.join(root, "public", "sprites", "status")
os.makedirs(out_dir, exist_ok=True)

raw = urllib.request.urlopen(SRC).read()
sheet = Image.open(io.BytesIO(raw)).convert("RGBA")
src = Image.open(io.BytesIO(raw))
# Background key colour = palette index 0.
pal = src.getpalette()
key = tuple(pal[0:3]) + (255,)


def finalize(icon, name):
    bbox = icon.getbbox()
    if bbox:
        icon = icon.crop(bbox)
    icon = icon.resize((icon.width * SCALE, icon.height * SCALE), Image.NEAREST)
    icon.save(os.path.join(out_dir, f"{name}.png"))
    print(f"  {name}.png  {icon.width}x{icon.height}")


for cell, name in CELLS.items():
    box = (cell * CELL_W, 0, (cell + 1) * CELL_W, CELL_H)
    icon = sheet.crop(box)
    px = icon.load()
    for y in range(icon.height):
        for x in range(icon.width):
            if px[x, y] == key:
                px[x, y] = (0, 0, 0, 0)
    finalize(icon, name)


# Confusion: reuse the poison cell's pill outline, recolour, erase its letters,
# then stamp "???".
conf = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
poison_idx = src.crop((0, 0, CELL_W, CELL_H)).load()
edge_idx = {5}  # light corner/highlight index in the poison cell
out = conf.load()
for y in range(CELL_H):
    for x in range(CELL_W):
        idx = poison_idx[x, y]
        if idx == 0:
            continue  # transparent margin
        out[x, y] = CONFUSION_EDGE if idx in edge_idx else CONFUSION_FILL
for gx in GLYPH_COLS:
    for r, row in enumerate(QMARK):
        for c, bit in enumerate(row):
            if bit == "1":
                out[gx + c, 1 + r] = WHITE
finalize(conf, "confusion")

print(f"status icons: {len(CELLS) + 1} saved -> {out_dir}")
