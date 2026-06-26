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
//     Gary, Sabrina, …). Each famous face is filed into the manifest tier that
//     matches its ladder slot in src/game/specials.ts (gym / elite / champion /
//     special) so procedural Gym & Elite slots can draw cross-gen leader faces,
//     not just the BW-era numbered rips. Sprite keys stay special-<id>.
//
// All charsets are RMXP 4×4 grids (top row = front-facing walk), so the same
// slicer handles every source regardless of cell size.
//
// Requires ImageMagick (`magick`). Run: node scripts/build-trainers.mjs
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OWPACK = process.env.OWPACK_DIR || '/Users/milano/Downloads/OW PACK';
const MEGAPACK =
  process.env.MEGAPACK_DIR ||
  '/Users/milano/Downloads/FRLG Accurate NPC Megapack (Relic Castle Edition)';
const EMERALD_RED =
  process.env.EMERALD_RED_DIR ||
  '/Users/milano/Downloads/Emerald Red Sprites';
const HORIZONTES_DIR =
  process.env.HORIZONTES_DIR ||
  '/Users/milano/Downloads/HORIZONTES';
const LEGENDS_ZA_DIR =
  process.env.LEGENDS_ZA_DIR ||
  '/Users/milano/Downloads/( 11 ) POKÉMON LEYENDA ZA';
const HGSS_SHEET =
  process.env.HGSS_SHEET ||
  join(root, 'assets/hgss-trainer-overworlds.png');
const EMERALD_NPC_DIR =
  process.env.EMERALD_NPC_DIR ||
  '/Users/milano/Downloads/Emerald Characters Set in FRLG style/NPC';
const GEN4_OW_DIR =
  process.env.GEN4_OW_DIR ||
  '/Users/milano/Downloads/Gen 4 OWs v1.5 - Vanilla Sunshine (3)';
const HGSS_SUBCOLS = 24;
const HGSS_ROWS = 9;
// Default down-walk frame indices after splitting a charset block (see buildHgss).
const HGSS_DOWN_STRIP = [3, 2, 3, 2]; // 1×4 vertical: up, side, walk, down
const HGSS_DOWN_GRID2X2 = [1, 3, 1, 3]; // right column stand + walk
const HGSS_DOWN_GRID2X4 = [7, 6, 7, 6]; // bottom-right down stand + walk
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
  ['Anime Gary Oak', 'gary', 'Gary Oak', 'm'],
  ['Anime Lorelei', 'lorelei', 'Lorelei', 'f'],
  ['Anime Brock', 'brock', 'Brock', 'm'],
  ['Anime Misty', 'misty', 'Misty', 'f'],
  ['Anime Sabrina', 'sabrina', 'Sabrina', 'f'],
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

// Emerald-style Red OW rip → Champion cosmetic face (disabled: sprite export is
// buggy). Re-enable alongside specials.ts `red` when fixed.
// [sourceFile (sans .png), key, name, sex, down-facing frame ids (0-based)].
const EMERALD_RED_FACES = [];

// Pokémon Horizons cast (256×256 RMXP 4×4) → famous cameos + roadside variety.
// `special` keys match src/game/specials.ts; `random` folds into the generic
// roadside pool (given names drawn at runtime, `cls` when set).
const HORIZONTES_SPECIAL = [
  ['LIKO', 'liko', 'Liko', 'f'],
  ['URUTO', 'roy', 'Roy', 'm'],
  ['FRIEDE', 'friede', 'Friede', 'm'],
  ['AMETHIO', 'amethio', 'Amethio', 'm'],
  ['CORAL', 'coral', 'Coral', 'f'],
  ['MOLLIE', 'mollie', 'Mollie', 'f'],
  ['MURDOCK', 'murdock', 'Murdock', 'm'],
  ['HAMBER', 'hamber', 'Hamber', 'm'],
  ['ZIR', 'zirc', 'Zirc', 'm'],
];
const HORIZONTES_RANDOM = [
  ['LANDON', 'landon', 'm', 'Sage'],
  ['LANDON SUPER G', 'landon-cool', 'm', 'Ace Trainer'],
  ['ORIA', 'oria', 'f', 'Picnicker'],
  ['ROD', 'rod', 'm', 'Ace Trainer'],
  ['CALCI', 'calci', 'f', 'Bird Keeper'],
  ['CONIA', 'conia', 'f', 'Explorers'],
];

// Legends Z-A cast (256×N RMXP 4×4, 64×64 cells) → cameos + protagonist faces.
// Source files are `<PREFIX> - TobalCrv.png`; prefixes match Spanish sheet names.
const LEGENDS_ZA_SPECIAL = [
  ['LILETTE', 'lilette', 'Jacinthe', 'f'],
  ['NARIA', 'naria', 'Naria', 'f'],
  ['MATIERE', 'emma', 'Emma', 'f'],
  ['BÁRBARA', 'adira', 'Adira', 'f'],
  ['ACRIS', 'naveen', 'Naveen', 'm'],
  ['MUNI', 'taunie', 'Taunie', 'f'],
  ['URBI', 'urbain', 'Urbain', 'm'],
  ['ESTRAGÓN', 'tarragon', 'Tarragon', 'm'],
  ['CÓRAX', 'corax', 'Corax', 'm'],
  ['GISO', 'giso', 'Giso', 'm'],
  ['DELPHIA', 'delphia', 'Delphia', 'f'],
  ['VIONA', 'viona', 'Viona', 'f'],
  ['MELIA', 'mable', 'Mable', 'f'],
  ['GRISEL', 'grisel', 'Grisel', 'm'],
  ['GRISELA', 'grisela', 'Griselle', 'f'],
  ['LYSSON', 'lysandre', 'Lysandre', 'm'],
];
const LEGENDS_ZA_CHAMPION = [
  ['PAXTON', 'paxton', 'Paxton', 'm'],
  ['HARMONY', 'harmony', 'Harmony', 'f'],
];

// Emerald Characters Set in FRLG style (ChromusSama / Poffin_Case) — 4×4 RMXP
// charsets replacing the broken HGSS master-sheet rips. [file (sans .png), key,
// name, sex].
const EMERALD_FAMOUS = [
  ['emNPC-096', 'eusine', 'Eusine', 'm'],
];

// Gen 4 OW Collection (Vanilla Sunshine) — individual 4×4 charsets.
const GEN4_FAMOUS = [['NPC 83', 'looker', 'Looker', 'm']];

// HGSS master sheet rips disabled — sub-column slicing produced broken sprites.
const HGSS_SPECIAL = [];
const HGSS_RANDOM = [];

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
  [otherDir, 'trainer_CYNTHIA', 'cynthia', 'Cynthia', 'f'],
  [rseDir, 'trainer_ARCHIE', 'archie', 'Archie', 'm'],
  [rseDir, 'trainer_MAXIE', 'maxie', 'Maxie', 'm'],
  [rseDir, 'trainer_WALLY', 'wally', 'Wally', 'm'],
  // Silver → HGSS sheet (see HGSS_SPECIAL).
  [animeDir, 'Anime Officer Jenny', 'jenny', 'Officer Jenny', 'f'],
  [animeDir, 'Anime Prof Ivy', 'ivy', 'Prof. Ivy', 'f'],
  [animeDir, 'Anime Brockfather', 'brock-dad', 'Flint', 'm'],
  [otherDir, 'trainer_HILBERT', 'hilbert', 'Hilbert', 'm'],
  [otherDir, 'trainer_HILDA', 'hilda', 'Hilda', 'f'],
  [otherDir, 'trainer_SAGE', 'sage', 'Plasma Sage', 'm'],
  [otherDir, 'NPC Prof Elm', 'elm', 'Prof. Elm', 'm'],
  [animeDir, 'Anime Salesman', 'salesman', 'Salesman', 'm'],
  // Battle Frontier Brains (RSE).
  [rseDir, 'trainer_ARENATYCOON_Greta', 'greta', 'Greta', 'f'],
  [rseDir, 'trainer_DOMEACE_Tucker', 'tucker', 'Tucker', 'm'],
  [rseDir, 'trainer_FACTORYHEAD_Noland', 'noland', 'Noland', 'm'],
  [rseDir, 'trainer_PALACEMAVEN_Spencer', 'spencer', 'Spencer', 'm'],
  [rseDir, 'trainer_PIKEQUEEN_Lucy', 'lucy', 'Lucy', 'f'],
  [rseDir, 'trainer_PYRAMIDKING_Brandon', 'brandon', 'Brandon', 'm'],
  [rseDir, 'trainer_SALONMAIDEN_Anabel', 'anabel', 'Anabel', 'f'],
  [hgssDir, 'NPC_Kurt', 'kurt', 'Kurt', 'm'],
  [hgssDir, 'NPC_Earl', 'earl', 'Earl', 'm'],
];

// Nameless background NPCs (anime townsfolk + HGSS civilians) folded into the
// roadside "random" pool purely for crowd variety. They have no canonical
// trainer class, so the game shows them as a plain "Trainer"; `sex` is eyeballed
// from each sprite so the paired given name still agrees ('x' = ambiguous, any
// name is fine). [sourceDir, sourceFile (sans .png), sex].
const a = (n, sex) => [animeDir, `Anime NPC ${String(n).padStart(2, '0')}`, sex];
const GENERIC = [
  a(1, 'm'), a(2, 'm'), a(3, 'x'), a(4, 'm'), a(5, 'm'), a(6, 'm'), a(7, 'f'), a(8, 'm'),
  a(9, 'm'), a(10, 'f'), a(11, 'f'), a(12, 'm'), a(13, 'm'), a(14, 'm'), a(15, 'f'), a(16, 'm'),
  a(17, 'm'), a(18, 'm'), a(19, 'f'), a(20, 'm'), a(21, 'm'), a(22, 'f'), a(23, 'x'), a(24, 'm'),
  a(25, 'm'), a(26, 'm'), a(27, 'f'), a(28, 'm'), a(29, 'f'), a(30, 'x'), a(31, 'f'), a(32, 'm'),
  a(33, 'm'), a(34, 'm'), a(35, 'm'), a(36, 'x'), a(37, 'm'), a(38, 'm'), a(39, 'f'), a(40, 'm'),
  a(41, 'm'), a(42, 'm'), a(43, 'f'), a(44, 'm'), a(45, 'm'), a(46, 'x'), a(47, 'f'),
  [hgssDir, 'NPC_Shopkeeper', 'm'],
  [hgssDir, 'NPC_Shopkeeper2', 'm'],
  [hgssDir, 'NPC_MidageMan', 'm'],
  [hgssDir, 'NPC_MidageWoman', 'f'],
  [hgssDir, 'NPC_YoungMan', 'm'],
  [hgssDir, 'NPC_YoungWoman', 'f'],
  [hgssDir, 'NPC_Schoolboy', 'm'],
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

function imageSize(file) {
  const out = execFileSync('magick', ['identify', '-format', '%w %h', file], {
    encoding: 'utf8',
  });
  return out.trim().split(/\s+/).map(Number);
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

  if (key.endsWith('zirc')) patchZircFrames(tmp);

  emitTrainerSprite(key, cw, ch, ['f_00', 'f_01', 'f_02', 'f_03']);
}

// ZIR rip leaves purple matte pixels on walk frames 0 and 2 (chest flickers pink).
function patchZircFrames(dir) {
  const drawChest = (file, color) =>
    magick([
      join(dir, file),
      '-fill', color,
      '-draw', 'point 26,22', '-draw', 'point 27,22',
      '-draw', 'point 26,23', '-draw', 'point 27,23',
      join(dir, file),
    ]);
  drawChest('f_00.png', '#F6CEB7');
  drawChest('f_02.png', '#F8D0B8');
}

// Repo-local 4×4 charsets on a black matte. [filename under assets/, key, name, sex].
const LOCAL_CHARSETS = [
  ['whitney-overworld.png', 'whitney', 'Whitney', 'f'],
  ['blaine-overworld.png', 'blaine', 'Blaine', 'm'],
  ['falkner-overworld.png', 'falkner', 'Falkner', 'm'],
  ['chuck-overworld.png', 'chuck', 'Chuck', 'm'],
  ['pryce-overworld.png', 'pryce', 'Pryce', 'm'],
  ['surge-overworld.png', 'surge', 'Lt. Surge', 'm'],
  ['erika-overworld.png', 'erika', 'Erika', 'f'],
  ['janine-overworld.png', 'janine', 'Janine', 'f'],
  ['bruno-overworld.png', 'bruno', 'Bruno', 'm'],
  ['lance-overworld.png', 'lance', 'Lance', 'm'],
  ['will-overworld.png', 'will', 'Will', 'm'],
  ['steven-overworld.png', 'steven', 'Steven', 'm'],
  ['silver-overworld.png', 'silver', 'Silver', 'm'],
  ['petrel-overworld.png', 'petrel', 'Petrel', 'm'],
  ['proton-overworld.png', 'proton', 'Proton', 'm'],
  ['koga-overworld.png', 'koga', 'Koga', 'm'],
  ['agatha-overworld.png', 'agatha', 'Agatha', 'f'],
  ['pikachu-overworld.png', 'pikachu', 'Pikachu', 'm'],
  ['giovanni-overworld.png', 'giovanni', 'Giovanni', 'm'],
];

// Repo-local 4×4 charsets for roadside trainers (HGSS sheet rips are unreliable).
// [filename under assets/, key suffix, gender, trainer class].
const LOCAL_RANDOM_CHARSETS = [
  ['rocket-grunt-m-overworld.png', 'rocket-grunt-m', 'm', 'Team Rocket'],
  ['rocket-grunt-f-overworld.png', 'rocket-grunt-f', 'f', 'Team Rocket'],
];

// Pre-built static PNG + animated GIF pairs (HGSS rips supplied as finished assets).
// [static file, anim file, key, name, sex]
const LOCAL_PREBUILT = [
  ['blaine-disguise-static.png', 'blaine-disguise-animated.gif', 'blaine-disguise', 'Blaine', 'm'],
];

function buildLocalCharset(srcFile, key) {
  const [cw, ch] = cellSize(srcFile);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  magick([
    srcFile, '-crop', `${cw}x${ch}`, '+repage',
    '-background', 'none', join(tmp, 'f_%02d.png'),
  ]);

  for (let i = 0; i < 16; i++) {
    const frame = join(tmp, `f_${String(i).padStart(2, '0')}.png`);
    magick([frame, '-fuzz', '12%', '-transparent', 'black', frame]);
  }

  emitTrainerSprite(key, cw, ch, ['f_00', 'f_01', 'f_02', 'f_03']);
}

// Static icon + multi-frame GIF already exported at the correct cell size.
function buildPrebuiltPair(staticSrc, animSrc, outKey) {
  const [cw, ch] = imageSize(staticSrc);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  magick([
    staticSrc, '-fuzz', '12%', '-transparent', 'black',
    '-background', 'none', '-gravity', 'south',
    '-extent', `${cw}x${ch}`, join(outDir, `${outKey}.png`),
  ]);

  magick([animSrc, '+adjoin', '-background', 'none', join(tmp, 'f_%02d.png')]);

  const frames = readdirSync(tmp)
    .filter((f) => /^f_\d+\.png$/.test(f))
    .sort();

  for (const f of frames) {
    const frame = join(tmp, f);
    magick([frame, '-fuzz', '12%', '-transparent', 'black', frame]);
  }

  const frameTags = frames.map((f) => f.replace('.png', ''));

  const KEY = '#FF00FF';
  const keyed = frameTags.map((tag) => {
    const dst = join(tmp, `k_${tag}.png`);
    magick([
      join(tmp, `${tag}.png`), '-background', KEY,
      '-alpha', 'remove', '-alpha', 'off', dst,
    ]);
    return dst;
  });
  magick([
    '-dispose', 'background', '-delay', '18', '-loop', '0',
    ...keyed, '-fuzz', '5%', '-transparent', KEY, join(outDir, `${outKey}.gif`),
  ]);
}

// Gen-3 Emerald OW charsets (128×128, 4×4) often leave the top row blank and
// park the down-facing walk cycle on row 2 — so we pass explicit frame ids.
function buildEmeraldOw(srcFile, key, frames) {
  const [cw, ch] = cellSize(srcFile);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  magick([
    srcFile, '-crop', `${cw}x${ch}`, '+repage',
    '-background', 'none', join(tmp, 'f_%02d.png'),
  ]);

  const tags = frames.map((i) => `f_${String(i).padStart(2, '0')}`);
  emitTrainerSprite(key, cw, ch, tags);
}

// Legends Z-A sheets share 64×64 cells but vary in height (256, 384, 512 px).
function buildZa(srcFile, key) {
  const cw = 64;
  const ch = 64;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  magick([
    srcFile, '-crop', `${cw}x${ch}`, '+repage',
    '-background', 'none', join(tmp, 'f_%02d.png'),
  ]);

  emitTrainerSprite(key, cw, ch, ['f_00', 'f_01', 'f_02', 'f_03']);
}

function zaSrc(prefix) {
  if (!existsSync(LEGENDS_ZA_DIR)) return null;
  const want = prefix.normalize('NFC');
  const hit = readdirSync(LEGENDS_ZA_DIR).find((f) => {
    if (!f.endsWith('.png')) return false;
    const base = f.split(' - ')[0];
    return base.normalize('NFC') === want;
  });
  return hit ? join(LEGENDS_ZA_DIR, hit) : null;
}

let hgssMetricsCache;
function hgssMetrics() {
  if (hgssMetricsCache) return hgssMetricsCache;
  const out = execFileSync('magick', ['identify', '-format', '%w %h', HGSS_SHEET], {
    encoding: 'utf8',
  });
  const [w, h] = out.trim().split(/\s+/).map(Number);
  hgssMetricsCache = { w, h };
  return hgssMetricsCache;
}

function hgssSubcolRect(subcol, row, band = 'full', span = 1) {
  const { w, h } = hgssMetrics();
  const x0 = Math.floor((subcol * w) / HGSS_SUBCOLS);
  const x1 = Math.floor(((subcol + span) * w) / HGSS_SUBCOLS);
  let y0 = Math.floor((row * h) / HGSS_ROWS);
  let y1 = Math.floor(((row + 1) * h) / HGSS_ROWS);
  const bh = y1 - y0;
  if (band === 'top') y1 = y0 + Math.floor(bh / 2);
  else if (band === 'bottom') y0 = y0 + Math.floor(bh / 2);
  else if (band === 'third') y1 = y0 + Math.floor(bh / 3);
  const bw = x1 - x0;
  const sliceH = y1 - y0;
  return {
    crop: `${bw}x${sliceH}+${x0}+${y0}`,
    bw,
    bh: sliceH,
  };
}

function hgssSplit(layout, bw, bh) {
  switch (layout) {
    case 'strip':
      return { cols: 1, rows: 4, fw: bw, fh: bh / 4 };
    case 'grid2x2':
      return { cols: 2, rows: 2, fw: bw / 2, fh: bh / 2 };
    case 'grid2x4':
      return { cols: 2, rows: 4, fw: bw / 2, fh: bh / 4 };
    case 'dual-strip': {
      const halfW = Math.floor(bw / 2);
      return { cols: 2, rows: 4, fw: halfW, fh: bh / 4, dualStrip: true, halfW };
    }
    case 'band-h2':
      return { cols: 2, rows: 1, fw: bw / 2, fh: bh };
    case 'band-h3':
      return { cols: 3, rows: 1, fw: bw / 3, fh: bh };
    case 'band-single':
      return { cols: 1, rows: 1, fw: bw, fh: bh };
    default:
      throw new Error(`unknown HGSS layout: ${layout}`);
  }
}

function hgssDownFrames(layout, override) {
  if (override) return override;
  switch (layout) {
    case 'strip':
      return HGSS_DOWN_STRIP;
    case 'grid2x2':
      return HGSS_DOWN_GRID2X2;
    case 'grid2x4':
      return HGSS_DOWN_GRID2X4;
    case 'dual-strip':
      return [7, 6, 7, 6];
    case 'band-h2':
      return [1, 1, 1, 1];
    case 'band-h3':
      return [2, 2, 2, 2];
    case 'band-single':
      return [0, 0, 0, 0];
    default:
      return HGSS_DOWN_STRIP;
  }
}

// Rip one sub-column from the HGSS master sheet (Dragoons/TSR rip).
function buildHgss(subcol, row, key, layout, band = 'full', downOverride, span = 1) {
  const { crop, bw, bh } = hgssSubcolRect(subcol, row, band, span);
  const { cols, rows, fw, fh } = hgssSplit(layout, bw, bh);
  const downFrames = hgssDownFrames(layout, downOverride);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const block = join(tmp, 'block.png');
  magick([HGSS_SHEET, '-crop', crop, '+repage', block]);

  const bgRaw = execFileSync('magick', [block, '-format', '%[hex:p{0,0}]', 'info:'], {
    encoding: 'utf8',
  }).trim();
  const bg = bgRaw.startsWith('#') ? bgRaw : `#${bgRaw}`;

  if (layout === 'band-single') {
    magick([block, '-background', 'none', join(tmp, 'raw_00.png')]);
  } else if (layout === 'dual-strip') {
    const halfW = Math.floor(bw / 2);
    const left = join(tmp, 'left.png');
    const right = join(tmp, 'right.png');
    magick([block, '-crop', `${halfW}x${bh}+0+0`, '+repage', left]);
    magick([block, '-crop', `${bw - halfW}x${bh}+${halfW}+0`, '+repage', right]);
    // Row 3 packs the previous row's feet into the top quarter — skip that bleed.
    const stripInset = row === 3 ? Math.floor(bh / 4) : 0;
    const stripH = bh - stripInset;
    for (const [side, src] of [['L', left], ['R', right]]) {
      for (let r = 0; r < 4; r++) {
        const y0 = stripInset + Math.floor((r * stripH) / 4);
        const y1 = stripInset + Math.floor(((r + 1) * stripH) / 4);
        const idx = r * 2 + (side === 'L' ? 0 : 1);
        magick([
          src, '-crop', `${halfW}x${y1 - y0}+0+${y0}`, '+repage',
          '-background', 'none', join(tmp, `raw_${String(idx).padStart(2, '0')}.png`),
        ]);
      }
    }
  } else {
    magick([
      block, '-crop', `${cols}x${rows}@`, '+repage', '-background', 'none',
      join(tmp, 'raw_%02d.png'),
    ]);
  }

  const tags = [];
  for (let i = 0; i < downFrames.length; i++) {
    const idx = downFrames[i];
    const tag = `f_${String(i).padStart(2, '0')}`;
    tags.push(tag);
    magick([
      join(tmp, `raw_${String(idx).padStart(2, '0')}.png`),
      '-fuzz', '18%', '-transparent', bg,
      '-filter', 'point', '-resize', '300%',
      '-background', 'none', join(tmp, `${tag}.png`),
    ]);
  }

  const cw = Math.round(fw * 3);
  const ch = Math.round(fh * 3);
  emitTrainerSprite(key, cw, ch, tags);
}

function emitTrainerSprite(key, cw, ch, frameTags, opts = {}) {
  const iconTag = frameTags[0];
  const iconSrc = join(tmp, `${iconTag}.png`);
  if (opts.skipTrim) {
    magick([
      iconSrc, '-background', 'none',
      '-gravity', 'south', '-extent', `${cw}x${ch}`, join(outDir, `${key}.png`),
    ]);
  } else {
    // Static icon: trim transparent padding, then re-center on a square canvas so
    // every trainer lines up regardless of how tall their sprite sits in-cell.
    magick([
      iconSrc, '-trim', '+repage', '-background', 'none',
      '-gravity', 'south', '-extent', `${cw}x${ch}`, join(outDir, `${key}.png`),
    ]);
  }

  // Idle gif: the four front-facing frames, looping. GIF has no alpha channel,
  // and these rips hide a blue matte color *underneath* their transparent
  // pixels, which a naive export re-exposes as an ugly blue background. So we
  // composite each frame onto a magenta key (using its alpha, which neutralizes
  // whatever matte is hidden), drop the alpha, then flag that key transparent.
  // A small fuzz catches near-key edge pixels that ImageMagick quantizes away
  // from exact #FF00FF (notably on some Horizons rips). `-dispose background`
  // keeps frames from smearing into one another.
  const KEY = '#FF00FF';
  const keyed = frameTags.map((tag) => {
    const dst = join(tmp, `k_${tag}.png`);
    magick([
      join(tmp, `${tag}.png`), '-background', KEY,
      '-alpha', 'remove', '-alpha', 'off', dst,
    ]);
    return dst;
  });
  magick([
    '-dispose', 'background', '-delay', '18', '-loop', '0',
    ...keyed, '-fuzz', '5%', '-transparent', KEY, join(outDir, `${key}.gif`),
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

/** Famous-trainer ladder slots from src/game/specials.ts (source of truth). */
function loadFamousSlots() {
  const src = readFileSync(join(root, 'src/game/specials.ts'), 'utf8');
  /** @type {Record<string, string>} */
  const slots = {};
  for (const m of src.matchAll(/\bid:\s*'([^']+)'[\s\S]*?\bslot:\s*'([^']+)'/g)) {
    slots[m[1]] = m[2];
  }
  return slots;
}

const famousSlots = loadFamousSlots();

/** Which manifest bucket a famous sprite belongs in (sprite keys stay special-*). */
function manifestCategoryFor(key, override) {
  if (override) return override;
  const slot = famousSlots[key];
  if (slot === 'gym' || slot === 'elite' || slot === 'champion') return slot;
  return 'special';
}

/** Build a famous face and file it under gym / elite / champion / special. */
function addFamous(key, name, g, buildOut, catOverride) {
  const outKey = `special-${key}`;
  buildOut(outKey);
  const cat = manifestCategoryFor(key, catOverride);
  manifest[cat].push({ key: outKey, gender: g, name });
}

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

// --- Nameless background NPCs (anime townsfolk + civilians) → random pool. ----
for (const [dir, file, g] of GENERIC) {
  const src = join(dir, `${file}.png`);
  if (!existsSync(src)) {
    console.warn(`skip missing ${src}`);
    continue;
  }
  const key = `random-${file.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  build(src, key);
  manifest.random.push({ key, gender: g });
}

// --- Anime "special" trainers (Megapack): bound to a canonical character. -----
if (existsSync(animeDir)) {
  for (const [file, key, name, g] of SPECIAL) {
    const src = join(animeDir, `${file}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    addFamous(key, name, g, (outKey) => build(src, outKey));
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
    addFamous(key, name, g, (outKey) => build(src, outKey));
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
    addFamous(key, name, g, (outKey) => build(src, outKey));
  }
} else {
  console.warn(`Megapack RSE NPCs not found at ${rseDir} — skipping.`);
}

// --- Emerald Red OW (custom rips): Champion cosmetic face. ------------------
if (existsSync(EMERALD_RED)) {
  for (const [file, key, name, g, frames] of EMERALD_RED_FACES) {
    const src = join(EMERALD_RED, `${file}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    addFamous(key, name, g, (outKey) => buildEmeraldOw(src, outKey, frames));
  }
} else {
  console.warn(`Emerald Red sprites not found at ${EMERALD_RED} — skipping.`);
}

// --- Pokémon Horizons (Tobal_Crv rips): cast cameos + crowd variety. ---------
if (existsSync(HORIZONTES_DIR)) {
  for (const [file, key, name, g] of HORIZONTES_SPECIAL) {
    const src = join(HORIZONTES_DIR, `${file} - Tobal_Crv.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    addFamous(key, name, g, (outKey) => build(src, outKey));
  }
  for (const [file, key, g, cls] of HORIZONTES_RANDOM) {
    const src = join(HORIZONTES_DIR, `${file} - Tobal_Crv.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    const outKey = `random-horizons-${key}`;
    build(src, outKey);
    manifest.random.push({ key: outKey, gender: g, cls });
  }
} else {
  console.warn(`Horizons sprites not found at ${HORIZONTES_DIR} — skipping.`);
}

// --- Legends Z-A (TobalCrv rips): Lumiose cast + protagonist faces. ---------
if (existsSync(LEGENDS_ZA_DIR)) {
  for (const [prefix, key, name, g] of LEGENDS_ZA_SPECIAL) {
    const src = zaSrc(prefix);
    if (!src) {
      console.warn(`skip missing ${prefix} in ${LEGENDS_ZA_DIR}`);
      continue;
    }
    addFamous(key, name, g, (outKey) => buildZa(src, outKey));
  }
  for (const [prefix, key, name, g] of LEGENDS_ZA_CHAMPION) {
    const src = zaSrc(prefix);
    if (!src) {
      console.warn(`skip missing ${prefix} in ${LEGENDS_ZA_DIR}`);
      continue;
    }
    addFamous(key, name, g, (outKey) => buildZa(src, outKey));
  }
} else {
  console.warn(`Legends Z-A sprites not found at ${LEGENDS_ZA_DIR} — skipping.`);
}

// --- Misc famous faces (Champions, team bosses, rivals, anime cameos). --------
for (const [dir, file, key, name, g] of EXTRA_FAMOUS) {
  const src = join(dir, `${file}.png`);
  if (!existsSync(src)) {
    console.warn(`skip missing ${src}`);
    continue;
  }
  addFamous(key, name, g, (outKey) => build(src, outKey));
}

// --- Repo-local charsets (override HGSS rips when present). -----------------
for (const [file, key, name, g] of LOCAL_CHARSETS) {
  const src = join(root, 'assets', file);
  if (!existsSync(src)) {
    console.warn(`skip missing ${src}`);
    continue;
  }
  addFamous(key, name, g, (outKey) => buildLocalCharset(src, outKey));
}

for (const [file, key, g, cls] of LOCAL_RANDOM_CHARSETS) {
  const src = join(root, 'assets', file);
  if (!existsSync(src)) {
    console.warn(`skip missing ${src}`);
    continue;
  }
  const outKey = `random-hgss-${key}`;
  buildLocalCharset(src, outKey);
  manifest.random.push({ key: outKey, gender: g, cls });
}

for (const [staticFile, animFile, key, name, g] of LOCAL_PREBUILT) {
  const staticSrc = join(root, 'assets', staticFile);
  const animSrc = join(root, 'assets', animFile);
  if (!existsSync(staticSrc) || !existsSync(animSrc)) {
    console.warn(`skip missing ${staticSrc} or ${animSrc}`);
    continue;
  }
  addFamous(key, name, g, (outKey) => buildPrebuiltPair(staticSrc, animSrc, outKey));
}

// --- Emerald FRLG-style NPC rips (ChromusSama / Poffin_Case). --------------
if (existsSync(EMERALD_NPC_DIR)) {
  for (const [file, key, name, g] of EMERALD_FAMOUS) {
    const src = join(EMERALD_NPC_DIR, `${file}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    addFamous(key, name, g, (outKey) => build(src, outKey));
  }
} else {
  console.warn(`Emerald NPC sprites not found at ${EMERALD_NPC_DIR} — skipping.`);
}

// --- Gen 4 OW collection (Vanilla Sunshine). --------------------------------
if (existsSync(GEN4_OW_DIR)) {
  for (const [file, key, name, g] of GEN4_FAMOUS) {
    const src = join(GEN4_OW_DIR, `${file}.png`);
    if (!existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    addFamous(key, name, g, (outKey) => build(src, outKey));
  }
} else {
  console.warn(`Gen 4 OW sprites not found at ${GEN4_OW_DIR} — skipping.`);
}

// --- HGSS trainer overworld sheet (24×9 Dragoons/TSR rip). -----------------
if (existsSync(HGSS_SHEET)) {
  for (const entry of HGSS_SPECIAL) {
    const [subcol, row, key, name, g, layout, band = 'full', downFrames, span = 1] = entry;
    addFamous(key, name, g, (outKey) =>
      buildHgss(subcol, row, outKey, layout, band, downFrames, span));
  }
  for (const entry of HGSS_RANDOM) {
    const [subcol, row, key, g, cls, layout, band = 'full', downFrames, span = 1] = entry;
    const outKey = `random-hgss-${key}`;
    buildHgss(subcol, row, outKey, layout, band, downFrames, span);
    manifest.random.push({ key: outKey, gender: g, cls });
  }
} else {
  console.warn(`HGSS trainer sheet not found at ${HGSS_SHEET} — skipping.`);
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
