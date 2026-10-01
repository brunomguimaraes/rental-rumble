"""
Web derivatives of the Hearth Town art masters.

The masters in public/sprites/world/hearth-town-v2/ are generated PNGs kept as
archival originals (3.7 MB map, 2.1 MB avatar, see
docs/art/night/hearth-town-v2/README.md). This writes the smaller WebP files
the game loads to public/sprites/world/hearth-town-v2/derived/:

  town.webp        exploration-map.png at its full 1536x1024, lossy
  avatar-256.webp  menu-avatar.png, Lanczos-downscaled to 256x256, lossless, alpha kept

The map keeps its full size because the hit regions in hotspots.json (and
src/game/town.ts) are in 1536x1024 source pixels. Quality 88 gives 641 KB and
stays within a hair of the master at 4x zoom; 90 is 709 KB for little visible
gain, and below about 80 the awning stripes and foliage visibly soften. The
avatar is lossless because its 1-2 px details blur in lossy WebP at 256 px.
The masters are never modified, and the output is deterministic for a given
Pillow and libwebp. Outputs are generated: rerun this script instead of editing
them.

    python3 scripts/build-hearth-town.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "sprites" / "world" / "hearth-town-v2"
OUT = SRC / "derived"
MAP_SIZE = (1536, 1024)
MAP_QUALITY = 88
AVATAR_SIZE = 256


def build_map() -> Path:
    img = Image.open(SRC / "exploration-map.png")
    if img.size != MAP_SIZE:
        raise SystemExit(f"exploration-map.png is {img.size}, expected {MAP_SIZE}: the hit regions would misalign")
    out = OUT / "town.webp"
    img.convert("RGB").save(out, "WEBP", quality=MAP_QUALITY, method=6)
    return out


def build_avatar() -> Path:
    img = Image.open(SRC / "menu-avatar.png").convert("RGBA")
    if img.width != img.height:
        raise SystemExit(f"menu-avatar.png is {img.size}, expected a square")
    out = OUT / f"avatar-{AVATAR_SIZE}.webp"
    img.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS).save(out, "WEBP", lossless=True, method=6)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for out in (build_map(), build_avatar()):
        print(f"wrote {out} ({out.stat().st_size / 1000:.1f} KB)")


if __name__ == "__main__":
    main()
