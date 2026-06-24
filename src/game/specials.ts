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
 *   • `champion`— the rival (Gary), reserved for the Champion rung.
 *
 * `team` is a list of National Dex ids in send-out order — the exact roster the
 * character is best known for (or a gag set). `type` is the thematic accent
 * (badge, backdrop, map glow). `rarity` (0..1) is the chance a `special` cameo is
 * eligible to appear at all — `undefined` means always eligible; Prof. Oak is a
 * rare surprise. Signs and cosmetic balls are assigned at battle-build time, just
 * like every other foe.
 */
export type FamousSlot = 'gym' | 'elite' | 'champion' | 'special';

export interface FamousTrainer {
  id: string;
  name: string;
  title: string;
  slot: FamousSlot;
  type: PokemonType;
  quote: string;
  /**
   * National Dex ids in send-out order. Required for gym/elite/special trainers
   * (they field this exact roster). Omitted for `champion` faces, which are purely
   * cosmetic — the shared daily boss keeps its procedural, leaderboard-verified
   * team (see buildChampion).
   */
  team?: number[];
  rarity?: number; // 0..1 eligibility chance for `special` cameos (default: always)
}

export const FAMOUS_TRAINERS: FamousTrainer[] = [
  // --- Gym Leaders ----------------------------------------------------------
  {
    id: 'brock',
    name: 'Brock',
    title: 'Pewter Gym Leader',
    slot: 'gym',
    type: 'rock',
    quote: 'My rock-hard will never cracks!',
    team: [95, 74, 169, 208, 185], // Onix, Geodude, Crobat, Steelix, Sudowoodo
  },
  {
    id: 'misty',
    name: 'Misty',
    title: 'Cerulean Gym Leader',
    slot: 'gym',
    type: 'water',
    quote: 'My Water Pokémon will wash you away!',
    team: [121, 120, 54, 118, 176], // Starmie, Staryu, Psyduck, Goldeen, Togetic
  },
  {
    id: 'sabrina',
    name: 'Sabrina',
    title: 'Saffron Gym Leader',
    slot: 'gym',
    type: 'psychic',
    quote: 'I have already foreseen your defeat.',
    team: [65, 122, 93, 49], // Alakazam, Mr. Mime, Haunter, Venomoth
  },
  {
    id: 'blaine',
    name: 'Blaine',
    title: 'Cinnabar Gym Leader',
    slot: 'gym',
    type: 'fire',
    quote: 'Can you take the heat? Hahaha!',
    team: [59, 38, 78, 126], // Arcanine, Ninetales, Rapidash, Magmar
  },

  // --- Elite Four -----------------------------------------------------------
  {
    id: 'lorelei',
    name: 'Lorelei',
    title: 'Elite Four',
    slot: 'elite',
    type: 'ice',
    quote: 'My icy Pokémon will freeze you solid.',
    team: [131, 87, 91, 124, 80], // Lapras, Dewgong, Cloyster, Jynx, Slowbro
  },
  {
    id: 'bruno',
    name: 'Bruno',
    title: 'Elite Four',
    slot: 'elite',
    type: 'fighting',
    quote: 'We will grind you down with raw power!',
    team: [68, 106, 107, 95], // Machamp, Hitmonlee, Hitmonchan, Onix
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
    id: 'oak',
    name: 'Prof. Oak',
    title: 'The Pokémon Professor',
    slot: 'special',
    type: 'normal',
    quote: "Now then — let's test what you've learned!",
    rarity: 0.08, // a rare surprise: the Professor himself
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
 * random order, with each rare cameo (e.g. Prof. Oak) folded in only when its
 * `rarity` roll hits — so the Professor is a genuine surprise, never expected.
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
 * Resolve a famous trainer's team to live Creatures, restricted to the run's
 * available species (`dex`). Out-of-pool members (e.g. on a gen-locked run) are
 * dropped; if that empties the roster, the caller should fall back to a generated
 * team. Returns base creatures — the battle builder assigns signs/balls.
 */
export function famousTeamCreatures(id: string, dex: Creature[]): Creature[] {
  const spec = FAMOUS_BY_ID[id];
  if (!spec || !spec.team) return [];
  const allowed = new Set(dex.map((c) => c.dexId));
  const team: Creature[] = [];
  for (const dexId of spec.team) {
    if (!allowed.has(dexId)) continue;
    const base = CREATURES_BY_ID[String(dexId)];
    if (base) team.push(base);
  }
  return team;
}
