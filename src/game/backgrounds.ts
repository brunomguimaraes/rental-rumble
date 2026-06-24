import type { Opponent, PokemonType } from './types.js';

// Picks the battle backdrop for an opponent. Two ideas drive the choice:
//
//   1. Biome follows the opponent's specialty type — a Water leader fights over
//      surf, an Ice specialist on snow, a Ghost in a cave, and so on. The ramp
//      escalates by tier: roadside trainers and Gym Leaders get a natural biome,
//      the Elite Four get the dramatic one-off Sinnoh arenas, and the Champion
//      stands on Cynthia's stage.
//   2. Time of day follows the player's real local clock, so day/afternoon/night
//      backdrops match when you're actually playing.
//
// Keys map to files at public/sprites/backgrounds/<key>.png (see
// scripts/build-backgrounds.mjs and backgrounds.gen.ts).

const ASSET = import.meta.env?.BASE_URL ?? '/';
const url = (key: string) => `${ASSET}sprites/backgrounds/${key}.png`;

export type TimeOfDay = 'day' | 'afternoon' | 'night';

/** Local clock → coarse time band used to pick a backdrop variant. */
export function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours();
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'afternoon';
  return 'night';
}

// Each type's home turf. `field`/`surf`/`dirt`/`forest`/`rocky`/`snow` carry
// day/afternoon/night variants; `indoor`/`cave` carry three numbered moods that
// we map onto the same time bands (1 = day … 3 = night).
const TYPE_BIOME: Record<PokemonType, string> = {
  normal: 'field',
  flying: 'field',
  electric: 'field',
  water: 'surf',
  grass: 'forest',
  bug: 'forest',
  fairy: 'forest',
  ice: 'snow',
  rock: 'rocky',
  fire: 'rocky',
  dragon: 'rocky',
  ground: 'dirt',
  fighting: 'dirt',
  steel: 'cave',
  ghost: 'cave',
  dark: 'cave',
  poison: 'cave',
  psychic: 'indoor',
};

const TIMED_BIOMES = new Set(['field', 'surf', 'dirt', 'forest', 'rocky', 'snow']);

// The Sinnoh Elite Four arenas line up neatly with their specialties.
const ELITE_ARENA: Partial<Record<PokemonType, string>> = {
  bug: 'aaron',
  ground: 'bertha',
  fire: 'flint',
  psychic: 'lucian',
};

// Battle Frontier stages, used when an Elite's type has no signature arena.
const FACILITY_ARENAS = [
  'battle-tower',
  'battle-factory',
  'battle-arcade',
  'battle-castle',
  'battle-hall',
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function biomeKey(base: string, tod: TimeOfDay): string {
  if (TIMED_BIOMES.has(base)) return `${base}-${tod}`;
  const idx = tod === 'day' ? '1' : tod === 'afternoon' ? '2' : '3';
  return `${base}-${idx}`;
}

/** The backdrop image URL for a battle against `opp`. */
export function backdropFor(opp: Opponent, d = new Date()): string {
  if (opp.tier === 'champion') {
    // The "challenge a saved team" exhibition is an other-dimensional duel.
    return url(opp.id.startsWith('challenge:') ? 'distortion' : 'cynthia');
  }
  if (opp.tier === 'elite') {
    return url(
      ELITE_ARENA[opp.type] ??
        FACILITY_ARENAS[hash(opp.id) % FACILITY_ARENAS.length],
    );
  }
  return url(biomeKey(TYPE_BIOME[opp.type], timeOfDay(d)));
}
