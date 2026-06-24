// Slices the 12 zodiac glyphs out of a 128x128 alchemy icon sheet (an 8x8 grid
// of 16px cells) into white-on-transparent PNGs the UI can tint/scale freely:
//   public/sprites/zodiac/<sign>.png  — 128x128, white glyph, transparent bg
//
// The sheet lays the zodiac out consecutively across two rows (row index 3 and
// 4, 0-based): Aries..Scorpio on row 3, Sagittarius..Pisces on row 4 — the
// standard astrological order. Source glyphs are black-on-white with no alpha,
// so we negate (glyph -> bright) and copy that luminance into the alpha channel
// of a flat white image, then upscale 8x with a point filter to stay crisp.
//
// Requires ImageMagick (`magick`). Run: node scripts/build-zodiac.mjs <sheet.png>
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET =
  process.argv[2] ||
  process.env.ZODIAC_SHEET ||
  join(root, 'assets', 'Icons_Alchemy.png');
const outDir = join(root, 'public/sprites/zodiac');

const CELL = 16; // px per cell in the source sheet

// [sign, column, row] — row 3 holds Aries..Scorpio, row 4 the last four.
const SIGNS = [
  ['aries', 0, 3],
  ['taurus', 1, 3],
  ['gemini', 2, 3],
  ['cancer', 3, 3],
  ['leo', 4, 3],
  ['virgo', 5, 3],
  ['libra', 6, 3],
  ['scorpio', 7, 3],
  ['sagittarius', 0, 4],
  ['capricorn', 1, 4],
  ['aquarius', 2, 4],
  ['pisces', 3, 4],
];

function magick(args) {
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

if (!existsSync(SHEET)) {
  console.error(`Alchemy sheet not found: ${SHEET}\nPass a path or set ZODIAC_SHEET.`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const [sign, col, row] of SIGNS) {
  const x = col * CELL;
  const y = row * CELL;
  magick([
    SHEET,
    '-crop', `${CELL}x${CELL}+${x}+${y}`,
    '+repage',
    // glyph (black) -> bright; background (white) -> dark.
    '-colorspace', 'Gray',
    '-negate',
    // Paint a flat white image and use the negated luminance as its alpha, so
    // the glyph becomes opaque white and the old background goes transparent.
    '(', '+clone', '-fill', 'white', '-colorize', '100', ')',
    '+swap',
    '-compose', 'CopyOpacity', '-composite',
    // Crisp pixel-art upscale to match the 128px type icons.
    '-filter', 'point', '-resize', '800%',
    join(outDir, `${sign}.png`),
  ]);
}

console.log(`zodiac: ${SIGNS.length} glyphs -> public/sprites/zodiac/`);
