// Slices RPG-Maker overworld charsets (256x256, 4x4 grid of 64px frames, top row
// = front-facing walk cycle) into per-trainer assets the game can use:
//   public/sprites/trainers/<key>.png  — a single front-facing icon (frame 0)
//   public/sprites/trainers/<key>.gif  — a looping idle walk (top-row 4 frames)
// and emits src/game/trainers.gen.ts mapping each opponent category to its pool.
//
// Crucially, every sprite is emitted WITH metadata so the game never has to
// guess: roadside trainers carry their class + sex (read straight off the
// gendered source filenames, e.g. trSwimmer_F / trYoungster), and the famous
// tiers carry the canonical character the rip depicts (verified against the
// games — Alder, Elesa, Clay, Roxie, …). That keeps the displayed name/sex
// honest: a "Lass" is never a male body, and Clay's sprite is always "Clay".
//
// Two sources are fused, both © Nintendo / Game Freak and used here only for a
// private, non-commercial project:
//   • the Gen-5 "OW PACK" (BW/B2W2 style) — the bulk of roadside classes and the
//     numbered Gym/Elite/Champion rips, AND
//   • the "FRLG Accurate NPC Megapack" (Relic Castle Edition) — which adds extra
//     Gen-1-flavoured roadside classes (Bug Catcher, Biker, Burglar, …) and, most
//     importantly, the anime overworld cast (James, Jessie, Meowth, Brock, Misty,
//     Gary, Sabrina, …). Those anime sprites back the game's "special" trainers,
//     who field hand-picked teams straight from the show (see src/game/specials.ts).
//
// All charsets are RMXP 4×4 grids (top row = front-facing walk), so the same
// slicer handles every source regardless of cell size.
//
// Requires ImageMagick (`magick`). Run: node scripts/build-trainers.mjs
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OWPACK = process.env.OWPACK_DIR || '/Users/milano/Downloads/OW PACK';
const MEGAPACK =
  process.env.MEGAPACK_DIR ||
  '/Users/milano/Downloads/FRLG Accurate NPC Megapack (Relic Castle Edition)';
const animeDir = join(MEGAPACK, 'Anime NPCs', 'Characters');
const frlgDir = join(MEGAPACK, 'FRLG NPCs', 'Characters');
const playableDir = join(MEGAPACK, 'Playable Characters', 'Characters');
const rseDir = join(MEGAPACK, 'RSE NPCs', 'Characters');
const hgssDir = join(MEGAPACK, 'HGSS NPCs', 'Characters');
const otherDir = join(MEGAPACK, 'Other or Custom NPCs');
const outDir = join(root, 'public/sprites/trainers');
const tmp = join(tmpdir(), 'trainer-frames');

// Canonical identities for the numbered role rips, verified by eye against the
// source art and cross-checked with Bulbapedia (e.g. Roxie = white ponytail +
// magenta dress; Lenora = cyan hair, dark skin; Burgh = brown hair, green eyes).
// 'm'/'f' is each character's sex, used for sprite/name agreement.
const GYM = [
  ['trGymLeader01', 'Chili', 'm'],
  ['trGymLeader02', 'Lenora', 'f'],
  ['trGymLeader03', 'Burgh', 'm'],
  ['trGymLeader04', 'Elesa', 'f'],
  ['trGymLeader05', 'Clay', 'm'],
  ['trGymLeader06', 'Skyla', 'f'],
  ['trGymLeader07', 'Brycen', 'm'],
  ['trGymLeader08', 'Drayden', 'm'],
  ['trGymLeader09', 'Cheren', 'm'],
  ['trGymLeader10', 'Roxie', 'f'],
  ['trGymLeader11', 'Marlon', 'm'],
];
const ELITE = [
  ['trElite4_1', 'Shauntal', 'f'],
  ['trElite4_2', 'Grimsley', 'm'],
  ['trElite4_3', 'Caitlin', 'f'],
  ['trElite4_4', 'Marshal', 'm'],
];
const CHAMPION = [
  ['trChampion01', 'Alder', 'm'],
  ['trChampion02', 'Iris', 'f'],
  ['trBenga', 'Benga', 'm'], // Alder's grandson, the Black Tower/Treehollow boss
];

// Roadside trainer classes: [sourceBase, displayTitle, sex]. 'both' expands to
// the _F and _M variants the pack ships; 'm'/'f' use the bare tr<Name>.png file.
const CLASSES = [
  ['AceTrainer', 'Ace Trainer', 'both'],
  ['Artist', 'Artist', 'm'],
  ['Backpacker', 'Backpacker', 'both'],
  ['Baker', 'Baker', 'f'],
  ['BattleGirl', 'Battle Girl', 'f'],
  ['Beauty', 'Beauty', 'f'],
  ['BlackBelt', 'Black Belt', 'm'],
  ['Breeder', 'Pokémon Breeder', 'both'],
  ['Cyclist', 'Cyclist', 'both'],
  ['Dancer', 'Dancer', 'm'],
  ['DepotAgent', 'Depot Agent', 'm'],
  ['Doctor', 'Doctor', 'm'],
  ['Fisher', 'Fisherman', 'm'],
  ['Gentleman', 'Gentleman', 'm'],
  ['Guitarist', 'Guitarist', 'm'],
  ['Harlequin', 'Harlequin', 'm'],
  ['Hiker', 'Hiker', 'm'],
  ['Janitor', 'Janitor', 'm'],
  ['Lady', 'Lady', 'f'],
  ['Lass', 'Lass', 'f'],
  ['Maid', 'Maid', 'f'],
  ['Musician', 'Musician', 'm'],
  ['Nurse', 'Nurse', 'f'],
  ['NurseryAide', 'Nursery Aide', 'f'],
  ['ParasolLady', 'Parasol Lady', 'f'],
  ['Pilot', 'Pilot', 'm'],
  ['PokeFan', 'PokéFan', 'both'],
  ['Policeman', 'Police Officer', 'm'],
  ['Preschooler', 'Preschooler', 'both'],
  ['Psychic', 'Psychic', 'both'],
  ['Ranger', 'Pokémon Ranger', 'both'],
  ['RichBoy', 'Rich Boy', 'm'],
  ['Roughneck', 'Roughneck', 'm'],
  ['SchoolKid', 'Schoolkid', 'both'],
  ['Scientist', 'Scientist', 'both'],
  ['Socialite', 'Socialite', 'f'],
  ['Swimmer', 'Swimmer', 'both'],
  ['Veteran', 'Veteran', 'both'],
  ['Waiter', 'Waiter', 'm'],
  ['Waitress', 'Waitress', 'f'],
  ['Worker', 'Worker', 'm'],
  ['Youngster', 'Youngster', 'm'],
];

// Extra roadside classes only the FRLG Megapack ships — Gen-1 flavour the OW PACK
// lacks. [sourceCode, displayTitle, sex]; file is `trainer_<CODE>.png`. We only
// pull classes the OW PACK doesn't already cover, so the random pool gains breadth
// (Bug Catcher, Biker, Burglar, …) instead of duplicate Lasses.
const FRLG_CLASSES = [
  ['BUGCATCHER', 'Bug Catcher', 'm'],
  ['BIKER2', 'Biker', 'm'],
  ['BURGLAR', 'Burglar', 'm'],
  ['SUPERNERD', 'Super Nerd', 'm'],
  ['ROCKER', 'Rocker', 'm'],
  ['TAMER', 'Tamer', 'm'],
  ['PAINTER', 'Painter', 'm'],
  ['RUINMANIAC', 'Ruin Maniac', 'm'],
  ['BIRDKEEPER', 'Bird Keeper', 'm'],
  ['ENGINEER', 'Engineer', 'm'],
  ['JUGGLER', 'Juggler', 'm'],
  ['POKEMANIAC', 'Poké Maniac', 'm'],
  ['CRUSHGIRL', 'Crush Girl', 'f'],
  ['AROMALADY', 'Aroma Lady', 'f'],
];

// Anime overworld cast → "special" trainers. [sourceFile (sans .png), key, name,
// sex]. Files live under `Anime NPCs/Characters/`. The matching hand-picked teams
// (straight from the show) are defined in src/game/specials.ts, keyed by `key`.
const SPECIAL = [
  ['Anime James', 'james', 'James', 'm'],
  ['Anime Jessie', 'jessie', 'Jessie', 'f'],
  ['Anime Meowth', 'meowth', 'Meowth', 'x'],
  ['Anime Brock', 'brock', 'Brock', 'm'],
  ['Anime Misty', 'misty', 'Misty', 'f'],
  ['Anime Gary Oak', 'gary', 'Gary Oak', 'm'],
  ['Anime Sabrina', 'sabrina', 'Sabrina', 'f'],
  ['Anime Blaine in Disguise', 'blaine', 'Blaine', 'm'],
  ['Anime Lorelei', 'lorelei', 'Lorelei', 'f'],
  ['Anime Bruno', 'bruno', 'Bruno', 'm'],
  ['Anime Cassidy', 'cassidy', 'Cassidy', 'f'],
  ['Anime Butch', 'butch', 'Butch', 'm'],
  ['Anime Samurai', 'samurai', 'Samurai', 'm'],
  ['Anime Tracy', 'tracey', 'Tracey', 'm'],
  ['Anime Samuel Oak', 'oak', 'Prof. Oak', 'm'],
  ['Anime Delia Ketchum', 'delia', 'Delia', 'f'],
];

// Playable protagonists (Megapack "Playable Characters") → Champion faces. These
// are the heroes who, canonically, grow up to take the title — so they join the
// rotation of possible Champions (cosmetic faces; the daily boss team stays the
// procedural one). [sourceFile (sans .png), key, name, sex]; files live under
// `Playable Characters/Characters/`.
const PLAYABLE = [
  ['trainer_TRAINER_Brendan', 'brendan', 'Brendan', 'm'],
  ['trainer_TRAINER_ORAS_May', 'may', 'May', 'f'],
  ['trainer_TRAINER_Ethan', 'ethan', 'Ethan', 'm'],
  ['trainer_TRAINER_Lyra', 'lyra', 'Lyra', 'f'],
];

// Hoenn Gym Leaders & Elite Four (Megapack "RSE NPCs") → famous fixed-pool
// trainers. Unlike the numbered Gen-5 Gym rips (which are cosmetic faces over
// procedural teams), these carry a canonical identity and slot straight into the
// famous roster in src/game/specials.ts (keyed `special-<key>`), where each
// fields a random draw from an on-theme species pool. [sourceFile (sans .png),
// key, name, sex]; files live under `RSE NPCs/Characters/`.
const HOENN = [
  ['trainer_LEADER_Roxanne', 'roxanne', 'Roxanne', 'f'],
  ['trainer_LEADER_Brawly', 'brawly', 'Brawly', 'm'],
  ['trainer_LEADER_Wattson', 'wattson', 'Wattson', 'm'],
  ['trainer_LEADER_Flannery', 'flannery', 'Flannery', 'f'],
  ['trainer_LEADER_Norman', 'norman', 'Norman', 'm'],
  ['trainer_LEADER_Winona', 'winona', 'Winona', 'f'],
  ['trainer_LEADER_Tate', 'tate', 'Tate', 'm'],
  ['trainer_LEADER_Liza', 'liza', 'Liza', 'f'],
  ['trainer_LEADER_Wallace', 'wallace', 'Wallace', 'm'],
  ['trainer_LEADER_Juan', 'juan', 'Juan', 'm'],
  ['trainer_ELITEFOUR_Sidney', 'sidney', 'Sidney', 'm'],
  ['trainer_ELITEFOUR_Phoebe', 'phoebe', 'Phoebe', 'f'],
  ['trainer_ELITEFOUR_Glacia', 'glacia', 'Glacia', 'f'],
  ['trainer_ELITEFOUR_Drake', 'drake', 'Drake', 'm'],
];

// Misc famous faces pulled from across the Megapack's region/anime sets, each
// bound to a canonical character in src/game/specials.ts (Champions, villain team
// bosses, rivals, anime cameos). Mixed source folders, so each entry names its
// own directory. [sourceDir, sourceFile (sans .png), key, name, sex].
const EXTRA_FAMOUS = [
  [rseDir, 'trainer_STEVEN', 'steven', 'Steven', 'm'],
  [otherDir, 'trainer_CYNTHIA', 'cynthia', 'Cynthia', 'f'],
  [rseDir, 'trainer_ARCHIE', 'archie', 'Archie', 'm'],
  [rseDir, 'trainer_MAXIE', 'maxie', 'Maxie', 'm'],
  [rseDir, 'trainer_WALLY', 'wally', 'Wally', 'm'],
  [hgssDir, 'trainer_SILVER', 'silver', 'Silver', 'm'],
  [animeDir, 'Anime Officer Jenny', 'jenny', 'Officer Jenny', 'f'],
  [animeDir, 'Anime Prof Ivy', 'ivy', 'Prof. Ivy', 'f'],
  [animeDir, 'Anime Brockfather', 'flint', 'Flint', 'm'],
];

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
    srcFile, '-crop', `${cw}x${ch}`, '+repage',
    '-background', 'none', join(tmp, 'f_%02d.png'),
  ]);

  // Static icon: trim transparent padding, then re-center on a square canvas so
  // every trainer lines up regardless of how tall their sprite sits in-cell.
  magick([
    join(tmp, 'f_00.png'), '-trim', '+repage', '-background', 'none',
    '-gravity', 'south', '-extent', `${cw}x${ch}`, join(outDir, `${key}.png`),
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
      join(tmp, `${f}.png`), '-background', KEY,
      '-alpha', 'remove', '-alpha', 'off', dst,
    ]);
    return dst;
  });
  magick([
    '-dispose', 'background', '-delay', '18', '-loop', '0',
    ...keyed, '-transparent', KEY, join(outDir, `${key}.gif`),
  ]);
}

if (!existsSync(OWPACK)) {
  console.error('OW PACK folder not found. Set OWPACK_DIR.');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifest = { random: [], gym: [], elite: [], champion: [], special: [] };
const slug = (s) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

// --- Roadside "random" trainers: gendered class sprites. ---------------------
for (const [base, title, sex] of CLASSES) {
  const variants =
    sex === 'both'
      ? [['_F', 'f'], ['_M', 'm']]
      : [['', sex]];
  for (const [suffix, g] of variants) {
    const src = join(OWPACK, `tr${base}${suffix}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    const key = `random-${slug(base)}${suffix ? `-${g}` : ''}`;
    build(src, key);
    manifest.random.push({ key, gender: g, cls: title });
  }
}

// --- Extra FRLG roadside classes (Megapack), folded into the random pool. -----
if (existsSync(frlgDir)) {
  for (const [code, title, g] of FRLG_CLASSES) {
    const src = join(frlgDir, `trainer_${code}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    const key = `random-frlg-${slug(title).replace(/[^a-z0-9]+/g, '-')}`;
    build(src, key);
    manifest.random.push({ key, gender: g, cls: title });
  }
} else {
  console.warn(`Megapack FRLG NPCs not found at ${frlgDir} — skipping.`);
}

// --- Anime "special" trainers (Megapack): bound to a canonical character. -----
if (existsSync(animeDir)) {
  for (const [file, key, name, g] of SPECIAL) {
    const src = join(animeDir, `${file}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    const outKey = `special-${key}`;
    build(src, outKey);
    manifest.special.push({ key: outKey, gender: g, name });
  }
} else {
  console.warn(`Megapack Anime NPCs not found at ${animeDir} — skipping.`);
}

// --- Playable protagonists (Megapack): extra Champion faces. ------------------
if (existsSync(playableDir)) {
  for (const [file, key, name, g] of PLAYABLE) {
    const src = join(playableDir, `${file}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    const outKey = `special-${key}`;
    build(src, outKey);
    manifest.special.push({ key: outKey, gender: g, name });
  }
} else {
  console.warn(`Megapack Playable Characters not found at ${playableDir} — skipping.`);
}

// --- Hoenn Gym Leaders & Elite Four (Megapack RSE NPCs): famous fixed-pool. ----
if (existsSync(rseDir)) {
  for (const [file, key, name, g] of HOENN) {
    const src = join(rseDir, `${file}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    const outKey = `special-${key}`;
    build(src, outKey);
    manifest.special.push({ key: outKey, gender: g, name });
  }
} else {
  console.warn(`Megapack RSE NPCs not found at ${rseDir} — skipping.`);
}

// --- Misc famous faces (Champions, team bosses, rivals, anime cameos). --------
for (const [dir, file, key, name, g] of EXTRA_FAMOUS) {
  const src = join(dir, `${file}.png`);
  if (!existsSync(src)) {
    console.warn(`skip missing ${src}`);
    continue;
  }
  const outKey = `special-${key}`;
  build(src, outKey);
  manifest.special.push({ key: outKey, gender: g, name });
}

// --- Famous tiers: numbered role rips bound to their canonical character. -----
const roles = [
  ['gym', GYM, (i) => `gym-${String(i + 1).padStart(2, '0')}`],
  ['elite', ELITE, (i) => `elite-${String(i + 1).padStart(2, '0')}`],
  ['champion', CHAMPION, (i) => `champion-${String(i + 1).padStart(2, '0')}`],
];
for (const [cat, list, keyFor] of roles) {
  list.forEach(([base, name, g], i) => {
    const src = join(OWPACK, `${base}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      return;
    }
    const key = keyFor(i);
    build(src, key);
    manifest[cat].push({ key, gender: g, name });
  });
}

// --- Emit the TypeScript manifest. -------------------------------------------
const fmt = (arr) =>
  '[\n' + arr.map((e) => `    ${JSON.stringify(e)},`).join('\n') + '\n  ]';
const ts = `// AUTO-GENERATED by scripts/build-trainers.mjs — do not edit by hand.
// Overworld trainer sprites + metadata, grouped by opponent category. Files live
// at public/sprites/trainers/<key>.png (front-facing icon) and .gif (idle loop).
// \`gender\` is the sprite's sex ('x' = unisex/ambiguous); roadside sprites carry
// their trainer \`cls\`, and the famous tiers carry the canonical character \`name\`.
export type TrainerCategory = 'random' | 'gym' | 'elite' | 'champion' | 'special';
export type TrainerGender = 'm' | 'f' | 'x';

export interface TrainerSprite {
  key: string;
  gender: TrainerGender;
  /** Canonical character depicted (gym / elite / champion / special). */
  name?: string;
  /** Trainer-class title (roadside "random" trainers). */
  cls?: string;
}

export const TRAINER_SPRITES: Record<TrainerCategory, readonly TrainerSprite[]> = {
  random: ${fmt(manifest.random)},
  gym: ${fmt(manifest.gym)},
  elite: ${fmt(manifest.elite)},
  champion: ${fmt(manifest.champion)},
  special: ${fmt(manifest.special)},
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
