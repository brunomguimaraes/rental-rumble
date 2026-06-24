#!/usr/bin/env python3
"""Render the 12 zodiac glyphs as crisp, anti-aliased white icons on a
transparent canvas: public/sprites/zodiac/<sign>.png (128x128, to match the
type icons).

The signs are standard Unicode symbols (U+2648..U+2653), so instead of upscaling
a blocky 16px sprite we draw them straight from a vector font at high resolution
and let them scale down smoothly in the UI. Run: python3 scripts/build-zodiac.py
"""
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


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    font_path = pick_font()
    for sign, cp in SIGNS:
        render(sign, cp, font_path)
    print(f"zodiac: {len(SIGNS)} glyphs from {os.path.basename(font_path)} -> {OUT_DIR}")


if __name__ == "__main__":
    main()
