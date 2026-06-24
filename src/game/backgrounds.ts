import type { Opponent, PokemonType } from './types.js';

// Picks the battle backdrop for an opponent. The biome follows the opponent's
// specialty type — a Water leader fights on a pier, a Rock specialist in the
// mountains, a Ghost in an autumn wood — and most biomes carry a day/afternoon/
// night variant chosen from the player's real local clock, so the backdrop
// matches when you're actually playing. The cave biomes are colour variants
// (one per elemental flavour) rather than time-of-day, so they're picked
// directly.
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

// Types whose home turf is a colour-variant cave (no time-of-day). Checked
// before the time-of-day biomes below.
const CAVE_BIOME: Partial<Record<PokemonType, string>> = {
  fire: 'cave-lava',
  ice: 'cave-snow',
  steel: 'cave-blue',
  poison: 'cave-sand',
};

// Each remaining type's home turf. These all ship `<biome>-day/afternoon/night`
// variants, so the time band is appended at lookup.
const TYPE_BIOME: Record<PokemonType, string> = {
  normal: 'plains',
  flying: 'mountain',
  rock: 'mountain',
  ground: 'mountain',
  grass: 'woodland',
  bug: 'woodland',
  fairy: 'meadow',
  fighting: 'court',
  electric: 'court',
  psychic: 'town',
  dragon: 'cliff',
  water: 'pier',
  dark: 'autumn',
  ghost: 'autumn',
  // Cave-biome types (see CAVE_BIOME); listed for exhaustiveness.
  fire: 'cave-lava',
  ice: 'cave-snow',
  steel: 'cave-blue',
  poison: 'cave-sand',
};

/** The backdrop image URL for a battle against `opp`. */
export function backdropFor(opp: Opponent, d = new Date()): string {
  const cave = CAVE_BIOME[opp.type];
  if (cave) return url(cave);
  return url(`${TYPE_BIOME[opp.type]}-${timeOfDay(d)}`);
}
