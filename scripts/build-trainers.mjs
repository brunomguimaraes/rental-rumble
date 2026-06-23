// Slices RPG-Maker overworld charsets (256x256, 4x4 grid of 64px frames, top row
// = front-facing walk cycle) into per-trainer assets the game can use:
//   public/sprites/trainers/<key>.png  — a single front-facing icon (frame 0)
//   public/sprites/trainers/<key>.gif  — a looping idle walk (top-row 4 frames)
// and emits src/game/trainers.gen.ts mapping each opponent category to its pool.
//
// Sources are RPG Maker / Pokémon Essentials community resources (© Nintendo /
// Game Freak — used here only for a private, non-commercial project):
//   - "Gen 4 OWs v1.5" (Vanilla Sunshine et al.) — trchar* trainer classes
//   - "OW PACK" (Gen 5 BW/B2W2 style) — trGymLeader/trElite4/trChampion roles
//
// Requires ImageMagick (`magick`). Run: node scripts/build-trainers.mjs
import {
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN4 =
  process.env.GEN4_DIR ||
  '/Users/milano/Downloads/Gen 4 OWs v1.5 - Vanilla Sunshine (1)';
const OWPACK = process.env.OWPACK_DIR || '/Users/milano/Downloads/OW PACK';

const outDir = join(root, 'public/sprites/trainers');
const tmp = join(tmpdir(), 'trainer-frames');

function magick(args) {
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

// Cell size of a charset: 4 columns x 4 rows. Returns [w, h] of one frame.
function cellSize(file) {
  const out = execFileSync('magick', ['identify', '-format', '%w %h', file], {
    encoding: 'utf8',
  });
  const [w, h] = out.trim().split(/\s+/).map(Number);
  return [Math.floor(w / 4), Math.floor(h / 4)];
}

// Slice a charset into a static front icon + idle gif under `key`.
function build(srcFile, key) {
  const [cw, ch] = cellSize(srcFile);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  // Explode into individual frames; row-major so 00..03 are the front row.
  magick([
    srcFile,
    '-crop',
    `${cw}x${ch}`,
    '+repage',
    '-background',
    'none',
    join(tmp, 'f_%02d.png'),
  ]);

  const front = join(tmp, 'f_00.png');
  // Static icon: trim transparent padding, then re-center on a square canvas so
  // every trainer lines up regardless of how tall their sprite sits in-cell.
  magick([
    front,
    '-trim',
    '+repage',
    '-background',
    'none',
    '-gravity',
    'south',
    '-extent',
    `${cw}x${ch}`,
    join(outDir, `${key}.png`),
  ]);

  // Idle gif: the four front-facing frames, looping. GIF has no alpha channel,
  // and these rips hide a blue matte color *underneath* their transparent
  // pixels, which a naive export re-exposes as an ugly blue background. So we
  // composite each frame onto a magenta key (using its alpha, which neutralizes
  // whatever matte is hidden), drop the alpha, then flag that key transparent.
  // `-dispose background` keeps frames from smearing into one another.
  const KEY = '#FF00FF';
  const keyed = ['f_00', 'f_01', 'f_02', 'f_03'].map((f) => {
    const dst = join(tmp, `k_${f}.png`);
    magick([
      join(tmp, `${f}.png`),
      '-background',
      KEY,
      '-alpha',
      'remove',
      '-alpha',
      'off',
      dst,
    ]);
    return dst;
  });
  magick([
    '-dispose',
    'background',
    '-delay',
    '18',
    '-loop',
    '0',
    ...keyed,
    '-transparent',
    KEY,
    join(outDir, `${key}.gif`),
  ]);
}

// Pick up to `cap` entries spread evenly across a sorted list (for variety).
function spread(list, cap) {
  if (list.length <= cap) return list;
  const step = list.length / cap;
  return Array.from({ length: cap }, (_, i) => list[Math.floor(i * step)]);
}

if (!existsSync(GEN4) || !existsSync(OWPACK)) {
  console.error('Source sprite folders not found. Set GEN4_DIR / OWPACK_DIR.');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifest = { random: [], gym: [], elite: [], champion: [] };

// --- Random trainers: Gen 4 trainer-class charsets (trchar000..178). --------
const trchars = readdirSync(GEN4)
  .filter((f) => /^trchar\d+\.png$/i.test(f))
  .sort();
for (const [i, f] of spread(trchars, 40).entries()) {
  const key = `random-${String(i).padStart(2, '0')}`;
  build(join(GEN4, f), key);
  manifest.random.push(key);
}

// --- Role sprites: Gen 5 OW PACK (gym leaders / elite four / champions). -----
const roleSets = [
  { cat: 'gym', re: /^trGymLeader(\d+)\.png$/ },
  { cat: 'elite', re: /^trElite4_(\d+)\.png$/ },
  { cat: 'champion', re: /^trChampion(\d+)\.png$/ },
];
const owFiles = readdirSync(OWPACK);
for (const { cat, re } of roleSets) {
  const matches = owFiles
    .map((f) => ({ f, m: f.match(re) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
  for (const [i, { f }] of matches.entries()) {
    const key = `${cat}-${String(i + 1).padStart(2, '0')}`;
    build(join(OWPACK, f), key);
    manifest[cat].push(key);
  }
}

// --- Emit the TypeScript manifest. -------------------------------------------
const ts = `// AUTO-GENERATED by scripts/build-trainers.mjs — do not edit by hand.
// Overworld trainer sprites, grouped by opponent category. Files live at
// public/sprites/trainers/<key>.png (front-facing icon) and .gif (idle loop).
export type TrainerCategory = 'random' | 'gym' | 'elite' | 'champion';

export const TRAINER_SPRITES: Record<TrainerCategory, readonly string[]> = {
  random: ${JSON.stringify(manifest.random)},
  gym: ${JSON.stringify(manifest.gym)},
  elite: ${JSON.stringify(manifest.elite)},
  champion: ${JSON.stringify(manifest.champion)},
};
`;
writeFileSync(join(root, 'src/game/trainers.gen.ts'), ts);
rmSync(tmp, { recursive: true, force: true });

const total = Object.values(manifest).reduce((n, a) => n + a.length, 0);
console.log(
  `trainers: ${total} sprites — ` +
    Object.entries(manifest)
      .map(([k, v]) => `${k} ${v.length}`)
      .join(', '),
);
