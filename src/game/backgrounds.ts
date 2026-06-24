import type { Opponent, PokemonType } from './types.js';

// Picks the battle backdrop for an opponent. The biome follows the opponent's
// specialty type — a Water leader fights over surf, an Ice specialist in a
// glacier, a Ghost in the deep, and so on — and the tier escalates the drama:
// roadside trainers and Gym Leaders get a natural biome, the Elite Four get the
// moodier set-pieces, and the Champion stands in the volcano arena.
//
// Keys map to files at public/sprites/backgrounds/<key>.png (see
// scripts/build-backgrounds.mjs and backgrounds.gen.ts).

const ASSET = import.meta.env?.BASE_URL ?? '/';
const url = (key: string) => `${ASSET}sprites/backgrounds/${key}.png`;

// Each type's home turf, drawn from the 15 hand-drawn battle scenes.
const TYPE_BIOME: Record<PokemonType, string> = {
  normal: 'meadow',
  flying: 'savanna',
  electric: 'route',
  water: 'shore',
  grass: 'forest',
  bug: 'forest',
  fairy: 'meadow',
  ice: 'glacier',
  rock: 'canyon',
  fire: 'volcano',
  dragon: 'cavern',
  ground: 'desert',
  fighting: 'canyon',
  steel: 'cave',
  ghost: 'abyss',
  dark: 'cave',
  poison: 'abyss',
  psychic: 'gym',
};

// Water has three flavours of shoreline; vary them by opponent so two surfers
// don't always land on the same beach.
const WATER_SCENES = ['shore', 'beach', 'seafloor'];

// The moodier scenes reserved for the Elite Four — a notch more dramatic than
// the roadside biomes.
const ELITE_SCENES = ['volcano', 'abyss', 'glacier', 'seafloor', 'cavern', 'canyon'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The backdrop image URL for a battle against `opp`. */
export function backdropFor(opp: Opponent): string {
  if (opp.tier === 'champion') {
    // The "challenge a saved team" exhibition is an eerie, otherworldly duel.
    return url(opp.id.startsWith('challenge:') ? 'abyss' : 'volcano');
  }
  if (opp.tier === 'elite') {
    return url(ELITE_SCENES[hash(opp.id) % ELITE_SCENES.length]);
  }
  if (opp.type === 'water') {
    return url(WATER_SCENES[hash(opp.id) % WATER_SCENES.length]);
  }
  return url(TYPE_BIOME[opp.type]);
}
