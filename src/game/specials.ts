import type { Creature, PokemonType } from './types';
import { CREATURES_BY_ID } from './pokemon';
import { RNG } from './rng';

/**
 * "Famous" trainers: recognizable faces lifted straight out of the anime/manga
 * who field a fixed, hand-picked team instead of the randomly-generated squads
 * the procedural ladder uses. Their overworld sprites come from the FRLG
 * Megapack's "Anime NPCs" set (see scripts/build-trainers.mjs); each `id` here
 * matches a `special-<id>` sprite key in trainers.gen.ts.
 *
 * Crucially, a famous trainer slots into the tier they actually belong to:
 *   • `gym`     — anime Gym Leaders (Brock, Misty, Sabrina, Blaine), who blend
 *                 into the Gym rung with their real type + team.
 *   • `elite`   — anime Elite Four (Lorelei, Bruno).
 *   • `special` — villains & gag cameos (Team Rocket, Ash's mom, …) that drop in
 *                 as mid-ladder mini-bosses; this is the "for fun" rung.
 *   • `bonus`   — a very rare, *optional* challenge (Prof. Oak) the player may
 *                 choose to skip; folded in just before the Champion when its
 *                 `rarity` roll hits.
 *   • `champion`— the rival (Gary), reserved for the Champion rung.
 *
 * A famous trainer fields one of two kinds of roster:
 *   • `team` — a fixed list of National Dex ids in send-out order: the exact
 *     squad the character is best known for (or a gag set). Used by the `special`
 *     villain/cameo rung, where the joke *is* the specific line-up.
 *   • `pool` — a larger thematic species pool (~25) the run draws a random subset
 *     from (`draw`, default 6). Used by the known Gym Leaders & Elite Four so they
 *     keep their type identity and signature 'mons in rotation without fielding
 *     the same six every single run.
 * `type` is the thematic accent (badge, backdrop, map glow). `rarity` (0..1) is
 * the per-run chance a trainer appears at all — `undefined` means always
 * eligible; the lone `bonus` challenger (Prof. Oak) is a genuinely rare,
 * skippable surprise. Signs and cosmetic balls are assigned at battle-build
 * time, just like every other foe.
 */
export type FamousSlot = 'gym' | 'elite' | 'champion' | 'special' | 'bonus';

export interface FamousTrainer {
  id: string;
  name: string;
  title: string;
  slot: FamousSlot;
  type: PokemonType;
  quote: string;
  /**
   * Fixed roster: National Dex ids in send-out order. Used by `special` cameos
   * (the gag is the exact line-up). Omitted for `champion` faces, which are purely
   * cosmetic — the shared daily boss keeps its procedural, leaderboard-verified
   * team (see buildChampion). Mutually exclusive with `pool`.
   */
  team?: number[];
  /**
   * Species pool (National Dex ids) the run draws a random subset from, so a known
   * leader's team varies run-to-run while staying on-theme. Mutually exclusive
   * with `team`. See `famousTeamCreatures`.
   */
  pool?: number[];
  /** How many to draw from `pool` each run (default 6). Ignored when using `team`. */
  draw?: number;
  rarity?: number; // 0..1 per-run appearance chance (default: always eligible)
}

export const FAMOUS_TRAINERS: FamousTrainer[] = [
  // --- Gym Leaders ----------------------------------------------------------
  // Known leaders field a random draw (default 6) from a deep, on-theme pool, so
  // their signature 'mons stay in rotation without the exact same six every run.
  {
    id: 'brock',
    name: 'Brock',
    title: 'Pewter Gym Leader',
    slot: 'gym',
    type: 'rock',
    quote: 'My rock-hard will never cracks!',
    pool: [
      95, 74, 75, 76, 111, 112, 464, 208, 185, 438, 169, 138, 139, 140, 141,
      142, 246, 247, 248, 299, 476, 304, 305, 306, 213, 369, 525, 526,
    ],
  },
  {
    id: 'misty',
    name: 'Misty',
    title: 'Cerulean Gym Leader',
    slot: 'gym',
    type: 'water',
    quote: 'My Water Pokémon will wash you away!',
    pool: [
      121, 120, 54, 55, 118, 119, 175, 176, 186, 60, 61, 62, 116, 117, 230,
      222, 131, 130, 129, 87, 73, 99, 80, 183, 184, 195, 134,
    ],
  },
  {
    id: 'sabrina',
    name: 'Sabrina',
    title: 'Saffron Gym Leader',
    slot: 'gym',
    type: 'psychic',
    quote: 'I have already foreseen your defeat.',
    pool: [
      65, 64, 63, 122, 439, 49, 196, 199, 97, 96, 103, 124, 202, 177, 178,
      203, 282, 281, 280, 475, 376, 374, 375, 437, 576, 579, 518, 561,
    ],
  },
  {
    id: 'blaine',
    name: 'Blaine',
    title: 'Cinnabar Gym Leader',
    slot: 'gym',
    type: 'fire',
    quote: 'Can you take the heat? Hahaha!',
    pool: [
      59, 58, 38, 37, 78, 77, 126, 467, 240, 6, 4, 5, 136, 229, 228, 323,
      322, 324, 219, 218, 157, 392, 485, 555, 609, 607, 514,
    ],
  },
  // Hoenn Gym Leaders (RSE sprites) — same pool-draw behaviour as the anime four.
  {
    id: 'roxanne',
    name: 'Roxanne',
    title: 'Rustboro Gym Leader',
    slot: 'gym',
    type: 'rock',
    quote: 'I have just begun to learn the ways of Pokémon.',
    pool: [
      74, 75, 76, 95, 111, 112, 464, 138, 139, 140, 141, 142, 213, 246, 247,
      248, 299, 476, 304, 305, 306, 345, 346, 347, 348, 369, 408, 410,
    ],
  },
  {
    id: 'brawly',
    name: 'Brawly',
    title: 'Dewford Gym Leader',
    slot: 'gym',
    type: 'fighting',
    quote: 'My Pokémon and I roll with the punches!',
    pool: [
      66, 67, 68, 56, 57, 106, 107, 237, 236, 296, 297, 307, 308, 447, 448,
      453, 454, 532, 533, 534, 538, 539, 560, 619, 620, 285, 286,
    ],
  },
  {
    id: 'wattson',
    name: 'Wattson',
    title: 'Mauville Gym Leader',
    slot: 'gym',
    type: 'electric',
    quote: 'Wahahaha! Now, that was a shocking experience!',
    pool: [
      25, 26, 100, 101, 125, 135, 170, 171, 179, 180, 181, 309, 310, 311,
      312, 403, 404, 405, 417, 462, 479, 522, 523, 587, 595, 596, 604,
    ],
  },
  {
    id: 'flannery',
    name: 'Flannery',
    title: 'Lavaridge Gym Leader',
    slot: 'gym',
    type: 'fire',
    quote: "I'll show you what I'm made of — full intensity!",
    pool: [
      4, 5, 6, 37, 38, 58, 59, 77, 78, 126, 136, 155, 156, 157, 218, 219,
      228, 229, 240, 322, 323, 324, 392, 467, 555, 607, 608, 609,
    ],
  },
  {
    id: 'norman',
    name: 'Norman',
    title: 'Petalburg Gym Leader',
    slot: 'gym',
    type: 'normal',
    quote: "I'm not going easy just because you're my rival.",
    pool: [
      16, 17, 18, 19, 20, 21, 22, 39, 40, 52, 53, 83, 108, 113, 115, 128,
      132, 133, 143, 161, 162, 164, 206, 234, 241, 287, 288, 289, 327, 335,
    ],
  },
  {
    id: 'winona',
    name: 'Winona',
    title: 'Fortree Gym Leader',
    slot: 'gym',
    type: 'flying',
    quote: 'I have become one with bird Pokémon.',
    pool: [
      21, 22, 41, 42, 84, 85, 142, 177, 178, 198, 227, 276, 277, 278, 279,
      333, 334, 357, 396, 397, 398, 425, 426, 527, 528, 580, 581,
    ],
  },
  {
    id: 'tate',
    name: 'Tate',
    title: 'Mossdeep Gym Leader',
    slot: 'gym',
    type: 'psychic',
    quote: "My twin and I see your every move…",
    pool: [
      63, 64, 65, 96, 97, 102, 103, 122, 124, 177, 178, 196, 199, 202, 203,
      280, 281, 282, 337, 338, 343, 344, 374, 375, 376, 475, 518, 561,
    ],
  },
  {
    id: 'liza',
    name: 'Liza',
    title: 'Mossdeep Gym Leader',
    slot: 'gym',
    type: 'psychic',
    quote: "…and together our power is doubled!",
    pool: [
      63, 64, 65, 96, 97, 102, 103, 122, 124, 177, 178, 196, 199, 202, 203,
      280, 281, 282, 337, 338, 343, 344, 374, 375, 376, 475, 518, 561,
    ],
  },
  {
    id: 'wallace',
    name: 'Wallace',
    title: 'Sootopolis Gym Leader',
    slot: 'gym',
    type: 'water',
    quote: 'A battle is an art — let me show you a masterpiece.',
    pool: [
      54, 55, 60, 61, 62, 72, 73, 86, 87, 90, 91, 98, 99, 116, 117, 118,
      119, 120, 121, 130, 131, 134, 183, 184, 320, 321, 340, 341, 342, 350,
    ],
  },
  {
    id: 'juan',
    name: 'Juan',
    title: 'Sootopolis Gym Leader',
    slot: 'gym',
    type: 'water',
    quote: 'Witness the grand illusion of my water ballet!',
    pool: [
      54, 55, 60, 61, 62, 72, 73, 86, 87, 90, 91, 98, 99, 116, 117, 118,
      119, 120, 121, 130, 131, 134, 183, 184, 230, 320, 321, 340, 350, 370,
    ],
  },

  // --- Elite Four -----------------------------------------------------------
  {
    id: 'lorelei',
    name: 'Lorelei',
    title: 'Elite Four',
    slot: 'elite',
    type: 'ice',
    quote: 'My icy Pokémon will freeze you solid.',
    pool: [
      131, 87, 86, 91, 90, 124, 238, 80, 144, 215, 461, 220, 221, 473, 225,
      361, 362, 478, 363, 364, 365, 471, 459, 460, 584, 613, 614, 615,
    ],
  },
  {
    id: 'bruno',
    name: 'Bruno',
    title: 'Elite Four',
    slot: 'elite',
    type: 'fighting',
    quote: 'We will grind you down with raw power!',
    pool: [
      68, 67, 66, 106, 107, 237, 236, 95, 208, 57, 56, 62, 214, 286, 297,
      296, 308, 307, 448, 447, 475, 454, 453, 534, 532, 538, 539, 560, 620,
    ],
  },
  // Hoenn Elite Four (RSE sprites).
  {
    id: 'sidney',
    name: 'Sidney',
    title: 'Elite Four',
    slot: 'elite',
    type: 'dark',
    quote: "I like that look you're giving me. Let's go!",
    pool: [
      197, 198, 215, 228, 229, 248, 261, 262, 275, 302, 318, 319, 332, 342,
      359, 430, 434, 435, 461, 510, 560, 571, 625,
    ],
  },
  {
    id: 'phoebe',
    name: 'Phoebe',
    title: 'Elite Four',
    slot: 'elite',
    type: 'ghost',
    quote: 'My ghosts will slip right past your guard.',
    pool: [
      92, 93, 94, 200, 302, 353, 354, 355, 356, 425, 426, 429, 442, 477, 478,
      562, 563, 592, 593, 607, 608, 609,
    ],
  },
  {
    id: 'glacia',
    name: 'Glacia',
    title: 'Elite Four',
    slot: 'elite',
    type: 'ice',
    quote: 'Show me you can melt my icy composure.',
    pool: [
      87, 91, 124, 131, 144, 215, 220, 221, 225, 238, 361, 362, 363, 364,
      365, 378, 459, 460, 461, 471, 473, 478, 582, 583, 584, 613, 614, 615,
    ],
  },
  {
    id: 'drake',
    name: 'Drake',
    title: 'Elite Four',
    slot: 'elite',
    type: 'dragon',
    quote: 'Do you have the courage to face a true dragon?',
    pool: [
      147, 148, 149, 230, 328, 329, 330, 334, 371, 372, 373, 443, 444, 445,
      610, 611, 612, 621, 633, 634, 635,
    ],
  },

  // --- Champion faces (cosmetic) --------------------------------------------
  // The Champion rung rotates among these recognizable faces — the rival (Gary)
  // and the playable protagonists who, canonically, grow up to take the crown.
  // These are cosmetic only: the shared daily boss keeps its procedural,
  // leaderboard-verified team, so no `team` is fielded here (see buildChampion).
  { id: 'gary', name: 'Gary Oak', title: 'Champion', slot: 'champion', type: 'normal', quote: 'Smell ya later!' },
  { id: 'brendan', name: 'Brendan', title: 'Champion', slot: 'champion', type: 'normal', quote: "Let's see who the real Champion is!" },
  { id: 'may', name: 'May', title: 'Champion', slot: 'champion', type: 'normal', quote: 'I trained hard for this crown!' },
  { id: 'ethan', name: 'Ethan', title: 'Champion', slot: 'champion', type: 'normal', quote: "I won't lose the title that easily." },
  { id: 'lyra', name: 'Lyra', title: 'Champion', slot: 'champion', type: 'normal', quote: 'Ready? This is for the championship!' },
  { id: 'steven', name: 'Steven', title: 'Champion', slot: 'champion', type: 'normal', quote: 'Show me the power you and your Pokémon share.' },
  { id: 'cynthia', name: 'Cynthia', title: 'Champion', slot: 'champion', type: 'normal', quote: 'There is no shortcut to the Champion title.' },

  // --- Specials: villains & gag cameos (the "for fun" rung) -----------------
  {
    id: 'james',
    name: 'James',
    title: 'Team Rocket',
    slot: 'special',
    type: 'poison',
    quote: 'Prepare for trouble!',
    team: [110, 71, 331, 58], // Weezing, Victreebel, Cacnea, Growlithe
  },
  {
    id: 'jessie',
    name: 'Jessie',
    title: 'Team Rocket',
    slot: 'special',
    type: 'poison',
    quote: '…And make it double!',
    team: [24, 108, 202, 269, 336], // Arbok, Lickitung, Wobbuffet, Dustox, Seviper
  },
  {
    id: 'meowth',
    name: 'Meowth',
    title: 'Team Rocket',
    slot: 'special',
    type: 'normal',
    quote: "Meowth! That's right! Get 'em, me!",
    team: [53, 52, 52, 52], // Persian bossing around a litter of Meowth (gag)
  },
  {
    id: 'cassidy',
    name: 'Cassidy',
    title: 'Team Rocket',
    slot: 'special',
    type: 'normal',
    quote: "It's Cassidy — get the name right!",
    team: [210, 20], // Granbull, Raticate
  },
  {
    id: 'butch',
    name: 'Butch',
    title: 'Team Rocket',
    slot: 'special',
    type: 'fighting',
    quote: "The name's Butch! Not Botch!",
    team: [57, 237], // Primeape, Hitmontop
  },
  // --- Villain team bosses (pool-drawn, like a Gym Leader) ------------------
  {
    id: 'archie',
    name: 'Archie',
    title: 'Team Aqua Leader',
    slot: 'special',
    type: 'water',
    quote: 'The sea shall swallow everything!',
    draw: 5,
    pool: [
      318, 319, 169, 262, 261, 320, 321, 73, 130, 365, 279, 89, 42, 130,
    ],
  },
  {
    id: 'maxie',
    name: 'Maxie',
    title: 'Team Magma Leader',
    slot: 'special',
    type: 'fire',
    quote: 'The land must expand — by my hand!',
    draw: 5,
    pool: [
      323, 322, 169, 262, 261, 229, 228, 219, 218, 324, 76, 112, 110, 89,
    ],
  },
  // --- Rivals --------------------------------------------------------------
  {
    id: 'wally',
    name: 'Wally',
    title: 'Rival',
    slot: 'special',
    type: 'psychic',
    quote: "I've gotten this far — I'm not backing down!",
    draw: 5,
    pool: [334, 82, 315, 282, 301, 475, 281, 280, 333],
  },
  {
    id: 'silver',
    name: 'Silver',
    title: 'Rival',
    slot: 'special',
    type: 'dark',
    quote: "You're in my way. Get lost.",
    draw: 5,
    pool: [160, 159, 215, 461, 169, 42, 94, 93, 198, 130, 82, 65],
  },
  // --- Anime cameos --------------------------------------------------------
  {
    id: 'jenny',
    name: 'Officer Jenny',
    title: 'Police',
    slot: 'special',
    type: 'fire',
    quote: 'Stop right there! This is a Pokémon inspection!',
    team: [59, 58, 310], // Arcanine, Growlithe, Manectric
  },
  {
    id: 'ivy',
    name: 'Prof. Ivy',
    title: 'Valencia Island',
    slot: 'special',
    type: 'grass',
    quote: "Let's see how my research stacks up against you!",
    team: [45, 71, 114], // Vileplume, Victreebel, Tangela
  },
  {
    id: 'flint',
    name: 'Flint',
    title: "Brock's Father",
    slot: 'special',
    type: 'rock',
    quote: 'A father has to test his son\'s rival, right?',
    team: [95, 74, 111], // Onix, Geodude, Rhyhorn
  },
  {
    id: 'delia',
    name: 'Delia',
    title: "Ash's Mom",
    slot: 'special',
    type: 'fairy',
    quote: "Did you change your underwear? Now battle!",
    team: [122, 40, 39, 35], // Mr. Mime (Mimey!), Wigglytuff, Jigglypuff, Clefairy
  },
  {
    id: 'tracey',
    name: 'Tracey',
    title: 'Pokémon Watcher',
    slot: 'special',
    type: 'bug',
    quote: "Hold still — this'll make a great sketch!",
    team: [123, 48, 183], // Scyther, Venonat, Marill
  },
  {
    id: 'samurai',
    name: 'Samurai',
    title: 'Viridian Forest',
    slot: 'special',
    type: 'bug',
    quote: 'Are you the trainer from Pallet Town? En garde!',
    team: [127, 11, 14, 10], // Pinsir, Metapod, Kakuna, Caterpie
  },

  // --- Bonus: a rare, optional, skippable challenge -------------------------
  // Prof. Oak isn't a regular mini-boss — he's a genuine surprise that only
  // turns up on a tiny fraction of runs, slotted in just before the Champion as
  // a "final exam" the player can take on or wave off (see buildGauntlet).
  {
    id: 'oak',
    name: 'Prof. Oak',
    title: 'The Pokémon Professor',
    slot: 'bonus',
    type: 'normal',
    quote: "Now then — let's test what you've learned!",
    rarity: 0.02, // drastically rare: the Professor himself, almost never seen
    team: [149, 6, 9, 3, 143, 65], // Dragonite, Charizard, Blastoise, Venusaur, Snorlax, Alakazam
  },
];

export const FAMOUS_BY_ID: Record<string, FamousTrainer> = Object.fromEntries(
  FAMOUS_TRAINERS.map((s) => [s.id, s]),
);

/** All famous trainers that belong in a given ladder rung. */
export function famousForSlot(slot: FamousSlot): FamousTrainer[] {
  return FAMOUS_TRAINERS.filter((t) => t.slot === slot);
}

/** The overworld sprite key for a famous trainer (see trainers.gen.ts). */
export function famousSpriteKey(id: string): string {
  return `special-${id}`;
}

/**
 * Pick the famous `special` cameos for one run: the always-eligible villains in
 * random order, with any rarity-gated cameo folded in only when its `rarity`
 * roll hits. (Prof. Oak now lives in the `bonus` slot, so this is just the
 * villain/gag rotation.)
 */
export function rollSpecialPool(rng: RNG): FamousTrainer[] {
  const specials = famousForSlot('special');
  const common = rng.shuffle(specials.filter((t) => t.rarity === undefined));
  for (const rare of specials.filter((t) => t.rarity !== undefined)) {
    if (rng.chance(rare.rarity ?? 1)) common.unshift(rare); // surfaced this run
  }
  return common;
}

/**
 * Roll the rare, optional `bonus` challenger for one run (e.g. Prof. Oak).
 * Returns the trainer only when its (tiny) `rarity` roll hits, otherwise null —
 * so on the vast majority of runs no bonus fight appears at all.
 */
export function rollBonusChallenge(rng: RNG): FamousTrainer | null {
  for (const bonus of famousForSlot('bonus')) {
    if (rng.chance(bonus.rarity ?? 1)) return bonus;
  }
  return null;
}

/**
 * Resolve a famous trainer's roster to live Creatures, restricted to the run's
 * available species (`dex`). Species outside the dex (e.g. on a gen-locked run)
 * are dropped; if that empties the roster, the caller should fall back to a
 * generated team. Returns base creatures — the battle builder assigns signs/balls.
 *
 * A `team` trainer yields its fixed roster in authored send-out order. A `pool`
 * trainer draws a random, distinct subset of size `size` (default the trainer's
 * `draw`, then 6) — requires `rng`; without one, the pool order is used as-is.
 */
export function famousTeamCreatures(
  id: string,
  dex: Creature[],
  rng?: RNG,
  size?: number,
): Creature[] {
  const spec = FAMOUS_BY_ID[id];
  if (!spec) return [];
  const allowed = new Set(dex.map((c) => c.dexId));
  const resolve = (ids: number[]): Creature[] => {
    const out: Creature[] = [];
    for (const dexId of ids) {
      if (!allowed.has(dexId)) continue;
      const base = CREATURES_BY_ID[String(dexId)];
      if (base) out.push(base);
    }
    return out;
  };

  if (spec.pool) {
    const available = resolve(spec.pool);
    const n = Math.min(size ?? spec.draw ?? 6, available.length);
    const ordered = rng ? rng.shuffle(available) : available;
    return ordered.slice(0, n);
  }
  if (spec.team) return resolve(spec.team);
  return [];
}
