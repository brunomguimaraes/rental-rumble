import type { Creature, PokemonType } from './types';
import { CREATURES_BY_ID } from './pokemon';

/**
 * "Special" trainers: famous faces lifted straight out of the anime/manga, who
 * field a hand-picked, canonical team instead of the randomly-generated squads
 * the rest of the ladder uses. Their overworld sprites come from the FRLG
 * Megapack's "Anime NPCs" set (see scripts/build-trainers.mjs); each `id` here
 * matches a `special-<id>` sprite key in trainers.gen.ts.
 *
 * `team` is a list of National Dex ids in send-out order — the exact roster the
 * character is best known for. `type` is only a thematic accent (badge, backdrop,
 * map glow); the team itself is fixed and may be mono- or mixed-type. Roles and
 * cosmetic balls are assigned at battle-build time, just like every other foe.
 */
export interface SpecialTrainer {
  id: string;
  name: string;
  title: string;
  type: PokemonType;
  quote: string;
  team: number[]; // National Dex ids, in send-out order
}

export const SPECIAL_TRAINERS: SpecialTrainer[] = [
  {
    id: 'james',
    name: 'James',
    title: 'Team Rocket',
    type: 'poison',
    quote: 'Prepare for trouble!',
    team: [110, 71, 331, 58], // Weezing, Victreebel, Cacnea, Growlithe
  },
  {
    id: 'jessie',
    name: 'Jessie',
    title: 'Team Rocket',
    type: 'poison',
    quote: '…And make it double!',
    team: [24, 108, 202, 269, 336], // Arbok, Lickitung, Wobbuffet, Dustox, Seviper
  },
  {
    id: 'meowth',
    name: 'Meowth',
    title: 'Team Rocket',
    type: 'normal',
    quote: "Meowth! That's right!",
    team: [53, 110, 24, 52], // Persian, Weezing, Arbok, Meowth
  },
  {
    id: 'brock',
    name: 'Brock',
    title: 'Pewter Gym Leader',
    type: 'rock',
    quote: 'My rock-hard will never cracks!',
    team: [95, 74, 169, 208, 185], // Onix, Geodude, Crobat, Steelix, Sudowoodo
  },
  {
    id: 'misty',
    name: 'Misty',
    title: 'Cerulean Gym Leader',
    type: 'water',
    quote: 'My Water Pokémon will wash you away!',
    team: [121, 120, 54, 118, 176], // Starmie, Staryu, Psyduck, Goldeen, Togetic
  },
  {
    id: 'gary',
    name: 'Gary Oak',
    title: 'Rival',
    type: 'water',
    quote: 'Smell ya later!',
    team: [9, 197, 31, 59, 34], // Blastoise, Umbreon, Nidoqueen, Arcanine, Nidoking
  },
  {
    id: 'sabrina',
    name: 'Sabrina',
    title: 'Saffron Gym Leader',
    type: 'psychic',
    quote: 'I have already foreseen your defeat.',
    team: [65, 122, 93, 49], // Alakazam, Mr. Mime, Haunter, Venomoth
  },
  {
    id: 'blaine',
    name: 'Blaine',
    title: 'Cinnabar Gym Leader',
    type: 'fire',
    quote: 'Can you take the heat? Hahaha!',
    team: [59, 38, 78, 126], // Arcanine, Ninetales, Rapidash, Magmar
  },
  {
    id: 'lorelei',
    name: 'Lorelei',
    title: 'Elite Four',
    type: 'ice',
    quote: 'My icy Pokémon will freeze you solid.',
    team: [131, 87, 91, 124, 80], // Lapras, Dewgong, Cloyster, Jynx, Slowbro
  },
  {
    id: 'bruno',
    name: 'Bruno',
    title: 'Elite Four',
    type: 'fighting',
    quote: 'We will grind you down with raw power!',
    team: [68, 106, 107, 95], // Machamp, Hitmonlee, Hitmonchan, Onix
  },
  {
    id: 'cassidy',
    name: 'Cassidy',
    title: 'Team Rocket',
    type: 'normal',
    quote: "It's Cassidy — get the name right!",
    team: [210, 20], // Granbull, Raticate
  },
  {
    id: 'butch',
    name: 'Butch',
    title: 'Team Rocket',
    type: 'fighting',
    quote: "The name's Butch! Not Botch!",
    team: [57, 237], // Primeape, Hitmontop
  },
  {
    id: 'samurai',
    name: 'Samurai',
    title: 'Bug Catcher',
    type: 'bug',
    quote: 'Our duel of honor begins now!',
    team: [127, 12, 15], // Pinsir, Butterfree, Beedrill
  },
  {
    id: 'tracey',
    name: 'Tracey',
    title: 'Pokémon Watcher',
    type: 'bug',
    quote: 'Let me sketch the moment you lose!',
    team: [123, 183, 48], // Scyther, Marill, Venonat
  },
  {
    id: 'oak',
    name: 'Prof. Oak',
    title: 'The Professor',
    type: 'normal',
    quote: "Now then — let's test what you've learned!",
    team: [149, 6, 9, 3, 143, 65], // Dragonite, Charizard, Blastoise, Venusaur, Snorlax, Alakazam
  },
];

export const SPECIAL_BY_ID: Record<string, SpecialTrainer> = Object.fromEntries(
  SPECIAL_TRAINERS.map((s) => [s.id, s]),
);

/** The overworld sprite key for a special trainer (see trainers.gen.ts). */
export function specialSpriteKey(id: string): string {
  return `special-${id}`;
}

/**
 * Resolve a special trainer's canonical team to live Creatures, restricted to
 * the run's available species (`dex`). Out-of-pool members (e.g. on a gen-locked
 * run) are dropped; if that empties the roster, the caller should fall back to a
 * generated team. Returns base creatures — the battle builder assigns roles/balls.
 */
export function specialTeamCreatures(id: string, dex: Creature[]): Creature[] {
  const spec = SPECIAL_BY_ID[id];
  if (!spec) return [];
  const allowed = new Set(dex.map((c) => c.dexId));
  const team: Creature[] = [];
  for (const dexId of spec.team) {
    if (!allowed.has(dexId)) continue;
    const base = CREATURES_BY_ID[String(dexId)];
    if (base) team.push(base);
  }
  return team;
}
