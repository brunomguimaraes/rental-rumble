import type { PokemonType } from './types.js';

// Canonical Gen 6+ type chart. For each attacking type we list only the
// defending types where the multiplier is not 1×.
const SUPER: Record<PokemonType, PokemonType[]> = {
  normal: [],
  fire: ['grass', 'ice', 'bug', 'steel'],
  water: ['fire', 'ground', 'rock'],
  electric: ['water', 'flying'],
  grass: ['water', 'ground', 'rock'],
  ice: ['grass', 'ground', 'flying', 'dragon'],
  fighting: ['normal', 'ice', 'rock', 'dark', 'steel'],
  poison: ['grass', 'fairy'],
  ground: ['fire', 'electric', 'poison', 'rock', 'steel'],
  flying: ['grass', 'fighting', 'bug'],
  psychic: ['fighting', 'poison'],
  bug: ['grass', 'psychic', 'dark'],
  rock: ['fire', 'ice', 'flying', 'bug'],
  ghost: ['psychic', 'ghost'],
  dragon: ['dragon'],
  dark: ['psychic', 'ghost'],
  steel: ['ice', 'rock', 'fairy'],
  fairy: ['fighting', 'dragon', 'dark'],
};

const NOT_VERY: Record<PokemonType, PokemonType[]> = {
  normal: ['rock', 'steel'],
  fire: ['fire', 'water', 'rock', 'dragon'],
  water: ['water', 'grass', 'dragon'],
  electric: ['electric', 'grass', 'dragon'],
  grass: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  ice: ['fire', 'water', 'ice', 'steel'],
  fighting: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
  poison: ['poison', 'ground', 'rock', 'ghost'],
  ground: ['grass', 'bug'],
  flying: ['electric', 'rock', 'steel'],
  psychic: ['psychic', 'steel'],
  bug: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  rock: ['fighting', 'ground', 'steel'],
  ghost: ['dark'],
  dragon: ['steel'],
  dark: ['fighting', 'dark', 'fairy'],
  steel: ['fire', 'water', 'electric', 'steel'],
  fairy: ['fire', 'poison', 'steel'],
};

const NO_EFFECT: Record<PokemonType, PokemonType[]> = {
  normal: ['ghost'],
  fire: [],
  water: [],
  electric: ['ground'],
  grass: [],
  ice: [],
  fighting: ['ghost'],
  poison: ['steel'],
  ground: ['flying'],
  flying: [],
  psychic: ['dark'],
  bug: [],
  rock: [],
  ghost: ['normal'],
  dragon: [],
  dark: [],
  steel: [],
  fairy: [],
};

/** Multiplier of an attack type against a single defending type. */
export function typeMultiplier(
  attacker: PokemonType,
  defender: PokemonType,
): number {
  if (NO_EFFECT[attacker].includes(defender)) return 0;
  if (SUPER[attacker].includes(defender)) return 2;
  if (NOT_VERY[attacker].includes(defender)) return 0.5;
  return 1;
}

/** Combined multiplier of an attack type against a (dual-)typed defender. */
export function effectiveness(
  attacker: PokemonType,
  defenderTypes: PokemonType[],
): number {
  return defenderTypes.reduce(
    (mult, t) => mult * typeMultiplier(attacker, t),
    1,
  );
}

export function effectivenessLabel(mult: number): string {
  if (mult === 0) return 'It had no effect…';
  if (mult >= 2) return 'Super effective!';
  if (mult < 1) return 'Not very effective…';
  return '';
}

export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: '#9fa19f',
  fire: '#ff6b3d',
  water: '#4f90d6',
  electric: '#f4d23c',
  grass: '#63bb5b',
  ice: '#74cec5',
  fighting: '#ce4069',
  poison: '#ab5ac8',
  ground: '#d97746',
  flying: '#8fa8dd',
  psychic: '#f97278',
  bug: '#90c12c',
  rock: '#c7b78b',
  ghost: '#5269ac',
  dragon: '#0a6dc4',
  dark: '#5a5366',
  steel: '#5a8ea1',
  fairy: '#ec8fe6',
};

export function typeLabel(t: PokemonType): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** All 18 types, in chart order. */
export const ALL_TYPES = Object.keys(TYPE_COLORS) as PokemonType[];

/** Local type icon (Pokémon Masters battle icons; see scripts/crop). */
const ASSET = import.meta.env?.BASE_URL ?? '/';
export function typeIconUrl(t: PokemonType): string {
  return `${ASSET}sprites/types/${t}.png`;
}
