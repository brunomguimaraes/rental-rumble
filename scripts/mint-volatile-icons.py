#!/usr/bin/env python3
"""Mints the three volatile-status pills — Weight Down, Blinded, Disarmed — in the
exact FireRed pill style of the existing icons, fully offline.

Like mint-frostbite-icon.py, this composes from the already-committed PNGs rather
than re-fetching the pret sheet: real font glyphs (B/N from burn.png, S/L from
sleep.png) are spliced onto a recoloured pill frame, and the two glyphs the set
doesn't already contain (O, E) are hand-authored 4x6 in the same font grid. Output:
  weight.png  -> "SLO"  (slow: a heavy speed cut)
  blind.png   -> "BLN"  (blinded)
  disarm.png  -> "SEL"  (sealed: strongest move locked)

Run: python3 scripts/mint-volatile-icons.py
"""
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_DIR = os.path.join(ROOT, "public", "sprites", "status")
SCALE = 4
WHITE = (255, 255, 255, 255)

# The three 4px glyph slots (col offsets) and the glyph rows (y) in a 20x8 pill.
SLOTS = (3, 8, 13)
GLYPH_W, GLYPH_ROWS = 4, range(1, 7)


def source(name):
    im = Image.open(os.path.join(OUT_DIR, f"{name}.png")).convert("RGBA")
    w, h = im.size
    return im.resize((w // SCALE, h // SCALE), Image.NEAREST)


def extract(img, slot):
    """A glyph (white pixels) from one slot of an existing pill -> 6x4 bool grid."""
    px = img.load()
    return [[px[slot + c, y] == WHITE for c in range(GLYPH_W)] for y in GLYPH_ROWS]


def author(rows):
    """A hand-drawn 6x4 glyph from a '#/.' string list."""
    return [[ch == "#" for ch in row] for row in rows]


brn = source("burn")
slp = source("sleep")

GLYPHS = {
    "B": extract(brn, SLOTS[0]),
    "N": extract(brn, SLOTS[2]),
    "S": extract(slp, SLOTS[0]),
    "L": extract(slp, SLOTS[1]),
    # The two letters the existing pills don't carry, drawn on the same 4x6 grid.
    "O": author([".##.", "#..#", "#..#", "#..#", "#..#", ".##."]),
    "E": author(["####", "#...", "###.", "#...", "#...", "####"]),
}

# filename -> (word, fill, edge). Colours chosen distinct from the existing pills.
PILLS = {
    "weight": ("SLO", (132, 120, 104, 255), (176, 164, 148, 255)),  # stone grey-brown
    "blind": ("BLN", (174, 150, 96, 255), (208, 188, 138, 255)),    # dusty sand
    "disarm": ("SEL", (108, 120, 144, 255), (158, 170, 196, 255)),  # steel slate
}

# Frame template (corner / edge / fill / transparent) read from any pill; freeze's
# light-corner colour marks the rounded-corner highlight pixels.
frame = source("freeze")
FREEZE_EDGE = (156, 197, 246, 255)
fw, fh = frame.size
fp = frame.load()

for fname, (word, fill, edge) in PILLS.items():
    out = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    op = out.load()
    for y in range(fh):
        for x in range(fw):
            c = fp[x, y]
            if c[3] == 0:
                continue
            op[x, y] = edge if c == FREEZE_EDGE else fill
    for slot, ch in zip(SLOTS, word):
        for ry, row in enumerate(GLYPHS[ch]):
            for cx, on in enumerate(row):
                if on:
                    op[slot + cx, 1 + ry] = WHITE
    out = out.resize((fw * SCALE, fh * SCALE), Image.NEAREST)
    out.save(os.path.join(OUT_DIR, f"{fname}.png"))
    print(f"  {fname}.png  '{word}'  {out.width}x{out.height}")
