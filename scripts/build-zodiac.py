#!/usr/bin/env python3
"""Render the zodiac glyphs as crisp, anti-aliased white icons on a transparent
canvas: public/sprites/zodiac/<sign>.png (128x128, to match the type icons).

The 12 common signs are standard Unicode symbols (U+2648..U+2653), so instead of
upscaling a blocky 16px sprite we draw them straight from a vector font at high
resolution and let them scale down smoothly in the UI.

The 5 rare/mythic "celestial" signs (Orion, Cetus, Aquila, Serpens, Abhijit)
have no clean Unicode glyph, so we draw each as a simple white constellation /
silhouette procedurally on a supersampled canvas and downscale for smooth edges.

Run: python3 scripts/build-zodiac.py
"""
import math
import os
from PIL import Image, ImageFont, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "sprites", "zodiac")

# Prefer a font whose zodiac glyphs are clean, filled and consistent.
FONT_CANDIDATES = [
    "/System/Library/Fonts/Apple Symbols.ttf",
    "/System/Library/Fonts/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
]

# (filename, codepoint) in astrological order.
SIGNS = [
    ("aries", 0x2648),
    ("taurus", 0x2649),
    ("gemini", 0x264A),
    ("cancer", 0x264B),
    ("leo", 0x264C),
    ("virgo", 0x264D),
    ("libra", 0x264E),
    ("scorpio", 0x264F),
    ("sagittarius", 0x2650),
    ("capricorn", 0x2651),
    ("aquarius", 0x2652),
    ("pisces", 0x2653),
]

OUT = 128       # output canvas size
PAD = 12        # transparent padding around the glyph
FONT_PX = 900   # render size before fitting (supersampled for crisp edges)


def pick_font():
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    raise SystemExit("No suitable Unicode symbol font found.")


def render(sign: str, codepoint: int, font_path: str) -> None:
    font = ImageFont.truetype(font_path, FONT_PX)
    ch = chr(codepoint)

    # Draw the glyph as a grayscale alpha mask on a generous canvas, centered.
    mask = Image.new("L", (FONT_PX * 2, FONT_PX * 2), 0)
    ImageDraw.Draw(mask).text(
        (FONT_PX, FONT_PX), ch, fill=255, font=font, anchor="mm"
    )
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit(f"Font has no glyph for {sign} (U+{codepoint:04X}).")
    glyph = mask.crop(bbox)

    # Fit into the padded box, preserving aspect ratio.
    box = OUT - 2 * PAD
    gw, gh = glyph.size
    scale = min(box / gw, box / gh)
    glyph = glyph.resize(
        (max(1, round(gw * scale)), max(1, round(gh * scale))), Image.LANCZOS
    )

    # Composite a flat-white glyph using the mask as its alpha.
    out = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    white = Image.new("RGBA", glyph.size, (255, 255, 255, 255))
    ox = (OUT - glyph.size[0]) // 2
    oy = (OUT - glyph.size[1]) // 2
    out.paste(white, (ox, oy), glyph)
    out.save(os.path.join(OUT_DIR, f"{sign}.png"))


# --- Celestial signs (drawn procedurally) ----------------------------------

WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
SS = 6              # supersample factor for smooth downscaling
W = OUT * SS        # working canvas size


def _lw(frac: float) -> int:
    """Stroke width as a fraction of the working canvas."""
    return max(2, round(frac * W))


def _star(d, cx, cy, ro, ri, points, fill=WHITE, rot=-math.pi / 2) -> None:
    """Filled n-pointed star centered at (cx, cy)."""
    pts = []
    for i in range(points * 2):
        ang = rot + i * math.pi / points
        r = ro if i % 2 == 0 else ri
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.polygon(pts, fill=fill)


def _p(x: float, y: float):
    return (x * W, y * W)


def draw_orion(d) -> None:
    """The Hunter — four corner stars + the three-star belt, joined by faint
    constellation lines into Orion's hourglass figure."""
    bet, bel = _p(0.29, 0.22), _p(0.71, 0.27)   # shoulders
    sai, rig = _p(0.34, 0.80), _p(0.74, 0.73)   # feet
    b0, b1, b2 = _p(0.44, 0.46), _p(0.51, 0.52), _p(0.58, 0.58)  # belt
    thin = _lw(0.013)
    for a, b in [(bet, bel), (bet, b0), (bel, b2), (b0, sai), (b2, rig), (sai, rig)]:
        d.line([a, b], fill=WHITE, width=thin)
    for c in (bet, bel, sai, rig):
        _star(d, c[0], c[1], 0.075 * W, 0.03 * W, 4)
    for c in (b0, b1, b2):
        _star(d, c[0], c[1], 0.042 * W, 0.017 * W, 4)


def draw_cetus(d) -> None:
    """The Sea Monster — a whale-like body with a fluked tail, dorsal fin, spout,
    waterline and a carved-out eye."""
    d.ellipse([_p(0.16, 0.40), _p(0.74, 0.66)], fill=WHITE)            # body
    d.polygon([_p(0.69, 0.53), _p(0.89, 0.39), _p(0.83, 0.53)], fill=WHITE)  # upper fluke
    d.polygon([_p(0.69, 0.53), _p(0.89, 0.67), _p(0.83, 0.53)], fill=WHITE)  # lower fluke
    d.polygon([_p(0.40, 0.40), _p(0.50, 0.27), _p(0.57, 0.40)], fill=WHITE)  # dorsal fin
    d.line([_p(0.27, 0.40), _p(0.22, 0.23)], fill=WHITE, width=_lw(0.02))     # spout
    d.line([_p(0.27, 0.40), _p(0.32, 0.23)], fill=WHITE, width=_lw(0.02))
    water = [
        _p(0.12 + 0.76 * (i / 40), 0.79 + 0.028 * math.sin(i / 40 * math.pi * 4))
        for i in range(41)
    ]
    d.line(water, fill=WHITE, width=_lw(0.016), joint="curve")          # waterline
    er = 0.026 * W                                                     # carved eye
    ex, ey = _p(0.30, 0.48)
    d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=CLEAR)


def draw_aquila(d) -> None:
    """The Eagle — a head, tapering body, swept-up wings and a tail."""
    d.polygon([_p(0.47, 0.40), _p(0.13, 0.27), _p(0.20, 0.39), _p(0.39, 0.49), _p(0.47, 0.49)], fill=WHITE)
    d.polygon([_p(0.53, 0.40), _p(0.87, 0.27), _p(0.80, 0.39), _p(0.61, 0.49), _p(0.53, 0.49)], fill=WHITE)
    d.polygon([_p(0.46, 0.33), _p(0.54, 0.33), _p(0.52, 0.66), _p(0.48, 0.66)], fill=WHITE)  # body
    d.polygon([_p(0.48, 0.63), _p(0.41, 0.80), _p(0.59, 0.80), _p(0.52, 0.63)], fill=WHITE)  # tail
    d.ellipse([_p(0.45, 0.23), _p(0.55, 0.34)], fill=WHITE)            # head


def draw_serpens(d) -> None:
    """The Serpent — a thick S-curve body with a head and a forked tongue."""
    n = 60
    body = [
        _p(0.5 + 0.26 * math.sin(t / n * math.pi * 2), 0.17 + 0.66 * (t / n))
        for t in range(n + 1)
    ]
    d.line(body, fill=WHITE, width=_lw(0.05), joint="curve")
    hx, hy = body[0]
    r = 0.07 * W
    d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=WHITE)            # head
    d.line([(hx, hy), _p(0.44, 0.06)], fill=WHITE, width=_lw(0.018))   # tongue
    d.line([(hx, hy), _p(0.56, 0.06)], fill=WHITE, width=_lw(0.018))


def draw_abhijit(d) -> None:
    """The Victorious — a radiant 16-point starburst around a bright core."""
    cx, cy = 0.5 * W, 0.5 * W
    _star(d, cx, cy, 0.47 * W, 0.15 * W, 16)
    r = 0.13 * W
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)


CELESTIALS = [
    ("orion", draw_orion),
    ("cetus", draw_cetus),
    ("aquila", draw_aquila),
    ("serpens", draw_serpens),
    ("abhijit", draw_abhijit),
]


def render_celestial(name: str, draw_fn) -> None:
    big = Image.new("RGBA", (W, W), CLEAR)
    draw_fn(ImageDraw.Draw(big))
    big.resize((OUT, OUT), Image.LANCZOS).save(os.path.join(OUT_DIR, f"{name}.png"))


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    font_path = pick_font()
    for sign, cp in SIGNS:
        render(sign, cp, font_path)
    for name, fn in CELESTIALS:
        render_celestial(name, fn)
    print(
        f"zodiac: {len(SIGNS)} font glyphs + {len(CELESTIALS)} celestial icons "
        f"-> {OUT_DIR}"
    )


if __name__ == "__main__":
    main()
