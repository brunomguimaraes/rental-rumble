"""
Ground shadows for every bundled PMD battle sheet.

SpriteCollab ships a <sheet>-Shadow.png beside each <sheet>-Anim.png, on the
same frame grid: per frame it draws the shadow where the game places it (a
white centre pixel inside three nested ellipses: green small, red medium, blue
large), so the shadow follows the body through walks, lunges and faints. This
downloads them, keeps the ellipse AnimData.xml's <ShadowSize> picks (0 small,
1 medium, 2 large) in opaque black, and writes
public/sprites/pmd/<id>/<sheet>-Shadow.png; PmdSprite draws it under the body
with the same frame offsets. When the upstream sheet is missing or its grid no
longer matches the bundled Anim sheet (SpriteCollab redrew it after our
download), every frame gets the shadow at the canvas centre plus GROUND_Y.

Also writes public/sprites/ui/battle-shadow.png, the medium shadow drawn under
battle sprites that have no PMD sheet.

Run it after a sprite refresh (scripts/fetch-battle-sprites.mjs), then
scripts/build-pmd-bodies.py, which measures the ground line from these files.

    python3 scripts/build-pmd-shadows.py [--cache=DIR] [--ids=1,4,6]

--cache keeps the raw upstream sheets in DIR so a rerun skips the download.
"""
import re
import sys
import tempfile
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "sprites" / "pmd"
FALLBACK_OUT = ROOT / "public" / "sprites" / "ui" / "battle-shadow.png"
UPSTREAM = "https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite"
# Where SpriteCollab rests a body's shadow centre: source px below the canvas
# centre (1918 of 1950 resting facings).
GROUND_Y = 4
# Upstream colours each size adds, smallest first; the white centre is in all.
SIZE_COLOURS = [
    {(255, 255, 255), (0, 255, 0)},
    {(255, 255, 255), (0, 255, 0), (255, 0, 0)},
    {(255, 255, 255), (0, 255, 0), (255, 0, 0), (0, 0, 255)},
]
# The same three ellipses as horizontal spans (dx from, dx to) per row, top row
# first, around the centre pixel; the centre is on row 2, 3 and 4 respectively.
SIZE_SPANS = [
    [(-3, 2), (-4, 3), (-4, 3), (-3, 2)],
    [(-3, 2), (-6, 5), (-7, 6), (-7, 6), (-6, 5), (-3, 2)],
    [(-4, 3), (-8, 7), (-10, 9), (-11, 10), (-11, 10), (-10, 9), (-8, 7), (-4, 3)],
]
# Sheets are 2-colour palette PNGs: index 0 transparent, index 1 the shadow.
INK = 1


def blank(width: int, height: int) -> Image.Image:
    img = Image.new("P", (width, height), 0)
    img.putpalette([0, 0, 0, 0, 0, 0])
    img.info["transparency"] = 0
    return img


def shadow_size(xml: str) -> int:
    found = re.search(r"<ShadowSize>(\d+)</ShadowSize>", xml)
    return min(int(found.group(1)), 2) if found else 1


def frame_sizes(xml: str) -> dict:
    """Concrete sheet name -> (fw, fh), from AnimData.xml (CopyOf entries skipped)."""
    sizes = {}
    for block in re.findall(r"<Anim>([\s\S]*?)</Anim>", xml):
        name = re.search(r"<Name>([^<]+)</Name>", block)
        fw = re.search(r"<FrameWidth>(\d+)</FrameWidth>", block)
        fh = re.search(r"<FrameHeight>(\d+)</FrameHeight>", block)
        if name and fw and fh and "<CopyOf>" not in block:
            sizes[name.group(1)] = (int(fw.group(1)), int(fh.group(1)))
    return sizes


def draw_ellipse(img: Image.Image, cx: int, cy: int, size: int) -> None:
    spans = SIZE_SPANS[size]
    for i, (x0, x1) in enumerate(spans):
        y = cy + i - len(spans) // 2
        for x in range(cx + x0, cx + x1 + 1):
            if 0 <= x < img.width and 0 <= y < img.height:
                img.putpixel((x, y), INK)


def still_sheet(width: int, height: int, fw: int, fh: int, size: int) -> Image.Image:
    """The shadow at the resting ground point in every frame."""
    img = blank(width, height)
    for top in range(0, height, fh):
        for left in range(0, width, fw):
            draw_ellipse(img, left + fw // 2, top + fh // 2 + GROUND_Y, size)
    return img


def keep_size(raw: Image.Image, size: int) -> Image.Image:
    rgba = np.asarray(raw.convert("RGBA"))
    ink = np.zeros(rgba.shape[:2], dtype=bool)
    for colour in SIZE_COLOURS[size]:
        ink |= np.all(rgba[..., :3] == colour, axis=-1)
    ink &= rgba[..., 3] > 0
    out = Image.fromarray(np.where(ink, INK, 0).astype(np.uint8), mode="P")
    out.putpalette([0, 0, 0, 0, 0, 0])
    return out


def fetch(url: str, dest: Path) -> bool:
    """Download url to dest (kept if already there); False when upstream has no such file."""
    if dest.exists():
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(3):
        try:
            dest.write_bytes(urllib.request.urlopen(url, timeout=30).read())
            return True
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return False
        except OSError:
            pass
    raise RuntimeError(f"could not download {url}")


def build(dex_id: int, cache: Path) -> list:
    """Write every shadow sheet for one species; returns the sheets drawn still."""
    folder = SPRITES / str(dex_id)
    xml = (folder / "AnimData.xml").read_text()
    size = shadow_size(xml)
    sizes = frame_sizes(xml)
    still = []
    for anim_path in sorted(folder.glob("*-Anim.png")):
        sheet = anim_path.name[: -len("-Anim.png")]
        if sheet not in sizes:
            continue
        fw, fh = sizes[sheet]
        with Image.open(anim_path) as anim:
            width, height = anim.size
        raw_path = cache / str(dex_id) / f"{sheet}-Shadow.png"
        found = fetch(f"{UPSTREAM}/{dex_id:04d}/{sheet}-Shadow.png", raw_path)
        raw = Image.open(raw_path) if found else None
        if raw is not None and raw.size == (width, height):
            out = keep_size(raw, size)
        else:
            out = still_sheet(width, height, fw, fh, size)
            still.append(f"{dex_id}/{sheet}")
        out.save(folder / f"{sheet}-Shadow.png", optimize=True, transparency=0, bits=1)
    return still


def main() -> None:
    cache = None
    only = None
    for arg in sys.argv[1:]:
        if arg.startswith("--cache="):
            cache = Path(arg.split("=", 1)[1]).resolve()
        elif arg.startswith("--ids="):
            only = {int(v) for v in arg.split("=", 1)[1].split(",")}
    if cache is None:
        cache = Path(tempfile.mkdtemp(prefix="pmd-shadows-"))
    ids = sorted(
        int(p.name)
        for p in SPRITES.iterdir()
        if p.name.isdigit() and (p / "AnimData.xml").exists() and (only is None or int(p.name) in only)
    )
    with ThreadPoolExecutor(16) as pool:
        still = [s for sheets in pool.map(lambda i: build(i, cache), ids) for s in sheets]
    fallback = blank(14, 6)
    draw_ellipse(fallback, 7, 3, 1)
    FALLBACK_OUT.parent.mkdir(parents=True, exist_ok=True)
    fallback.save(FALLBACK_OUT, optimize=True, transparency=0, bits=1)
    print(f"wrote shadows for {len(ids)} species; raw sheets cached in {cache}")
    if still:
        print(f"drawn still (upstream missing or redrawn): {', '.join(still)}", file=sys.stderr)


if __name__ == "__main__":
    main()
