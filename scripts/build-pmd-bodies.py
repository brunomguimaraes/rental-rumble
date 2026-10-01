"""
Body metrics of every bundled PMD battle sprite, for drawing them at 2x.

PMD frames of every anim share one origin at the canvas centre, but each
species' canvas carries different padding, so the canvas size says little about
where the body stands. For each species this reads AnimData.xml, the sheet its
resting loop renders (Walk, else Idle, as resolvePmdAnim picks for 'idle',
including its RESTING_OVERRIDE) and that sheet's ground shadow
(<sheet>-Shadow.png from scripts/build-pmd-shadows.py), over the direction rows
the battle shows (src/game/pmd.ts DIR_ROW: player row 3, foe row 7; row 0 when
the sheet has fewer rows, as dirRow does):

  top     the highest the body rises above its side's ground point, over every
          frame of both rows, in source px;
  ground  per side, the shadow centre on the row's first frame, in source px
          from the canvas centre. SpriteCollab puts a body's ground there, so
          walkers' feet touch the shadow and fliers hover above it.

It writes src/game/pmdBodies.gen.ts. Outputs are generated: rerun this script
(after build-pmd-shadows.py) instead of editing them.

    python3 scripts/build-pmd-bodies.py [--sprites=public/sprites/pmd]
"""
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "game" / "pmdBodies.gen.ts"
# Battle facing rows per side (keep in step with DIR_ROW in src/game/pmd.ts).
ROWS = {"player": 3, "foe": 7}
# The resting loop's sheet chain (keep in step with FALLBACKS.idle and
# RESTING_OVERRIDE in src/game/pmd.ts).
RESTING = ["Walk", "Idle"]
RESTING_OVERRIDE = {51: ["Idle", "Walk"]}


def parse_anims(xml: str) -> dict:
    """Name -> {copyOf} or {fw, fh}, from AnimData.xml."""
    anims = {}
    for block in re.findall(r"<Anim>([\s\S]*?)</Anim>", xml):
        name = re.search(r"<Name>([^<]+)</Name>", block)
        if not name:
            continue
        copy_of = re.search(r"<CopyOf>([^<]+)</CopyOf>", block)
        if copy_of:
            anims[name.group(1)] = {"copyOf": copy_of.group(1)}
            continue
        fw = re.search(r"<FrameWidth>(\d+)</FrameWidth>", block)
        fh = re.search(r"<FrameHeight>(\d+)</FrameHeight>", block)
        if fw and fh:
            anims[name.group(1)] = {"fw": int(fw.group(1)), "fh": int(fh.group(1))}
    return anims


def resolve(anims: dict, name: str):
    """Follow CopyOf to the concrete sheet name and its frame size."""
    seen = set()
    while name in anims and "copyOf" in anims[name]:
        if name in seen:
            return None
        seen.add(name)
        name = anims[name]["copyOf"]
    anim = anims.get(name)
    return (name, anim["fw"], anim["fh"]) if anim else None


def measure(sprites: Path, dex_id: int):
    """(top, {side: (x, y)}) for one species, or None when it has no resting sheet and shadow."""
    anims = parse_anims((sprites / str(dex_id) / "AnimData.xml").read_text())
    for want in RESTING_OVERRIDE.get(dex_id, RESTING):
        found = resolve(anims, want)
        if not found:
            continue
        sheet, fw, fh = found
        path = sprites / str(dex_id) / f"{sheet}-Anim.png"
        shadow_path = sprites / str(dex_id) / f"{sheet}-Shadow.png"
        if not path.exists() or not shadow_path.exists():
            continue
        alpha = Image.open(path).convert("RGBA").getchannel("A")
        shadow = Image.open(shadow_path).convert("RGBA").getchannel("A")
        cols, rows = alpha.width // fw, alpha.height // fh
        top, ground = 0, {}
        for side, want_row in ROWS.items():
            row = want_row if want_row < rows else 0
            mark = shadow.crop((0, row * fh, fw, (row + 1) * fh)).getbbox()
            if not mark:
                continue
            left, upper, right, lower = mark
            # Every PMD shadow ellipse is an even size around its centre pixel.
            x, y = left + (right - left) // 2 - fw // 2, upper + (lower - upper) // 2 - fh // 2
            ground[side] = (x, y)
            for col in range(cols):
                box = alpha.crop((col * fw, row * fh, (col + 1) * fw, (row + 1) * fh)).getbbox()
                if box:
                    top = max(top, y - (box[1] - fh // 2))
        if top > 0 and len(ground) == len(ROWS):
            return top, ground
    return None


def main() -> None:
    sprites = ROOT / "public" / "sprites" / "pmd"
    for arg in sys.argv[1:]:
        if arg.startswith("--sprites="):
            sprites = Path(arg.split("=", 1)[1]).resolve()
    ids = sorted(int(p.name) for p in sprites.iterdir() if p.name.isdigit() and (p / "AnimData.xml").exists())
    lines = []
    missing = []
    for dex_id in ids:
        body = measure(sprites, dex_id)
        if body is None:
            missing.append(dex_id)
            continue
        top, ground = body
        sides = ", ".join(f"{side}: {{ x: {x}, y: {y} }}" for side, (x, y) in ground.items())
        lines.append(f"  {dex_id}: {{ top: {top}, ground: {{ {sides} }} }},")
    header = """// AUTO-GENERATED by scripts/build-pmd-bodies.py — do not edit by hand.
// Maps National Dex id -> where the PMD sheet that species' resting loop renders
// (Walk, else Idle) stands, measured over the battle's facing rows, in source
// pixels. `ground` is, per side, the resting shadow centre from the frame's
// centre (every anim of a species shares that centre); `top` is the highest the
// body rises above it. See pmdFrameBox in src/game/pmd.ts.
export interface PmdBody {
  /** Highest body pixel above the ground point, in source pixels. */
  top: number;
  /** Resting shadow centre from the frame centre in source pixels (y down), per battle side. */
  ground: { player: { x: number; y: number }; foe: { x: number; y: number } };
}

export const PMD_BODIES: Record<number, PmdBody> = {
"""
    OUT.write_text(header + "\n".join(lines) + "\n};\n")
    print(f"wrote {OUT} ({len(lines)} species)")
    if missing:
        print(f"no resting sheet or shadow: {missing}", file=sys.stderr)


if __name__ == "__main__":
    main()
