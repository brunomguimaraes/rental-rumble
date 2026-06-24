import type { Creature } from './types.js';
import { CREATURES } from './pokemon.js';

/** A National Dex generation (1 = Kanto … 9 = Paldea). */
export type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const GENERATIONS: Generation[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Inclusive National Dex id ranges per generation, plus the region each one is
 * known for. Used to bucket every species into a generation by its dex id (the
 * generated dex carries no explicit gen field).
 */
export const GEN_INFO: Record<
  Generation,
  { label: string; region: string; range: [number, number] }
> = {
  1: { label: 'Gen I', region: 'Kanto', range: [1, 151] },
  2: { label: 'Gen II', region: 'Johto', range: [152, 251] },
  3: { label: 'Gen III', region: 'Hoenn', range: [252, 386] },
  4: { label: 'Gen IV', region: 'Sinnoh', range: [387, 493] },
  5: { label: 'Gen V', region: 'Unova', range: [494, 649] },
  6: { label: 'Gen VI', region: 'Kalos', range: [650, 721] },
  7: { label: 'Gen VII', region: 'Alola', range: [722, 809] },
  8: { label: 'Gen VIII', region: 'Galar', range: [810, 905] },
  9: { label: 'Gen IX', region: 'Paldea', range: [906, 1025] },
};

/** Which generation a National Dex id belongs to (defaults to Gen IX for any
 *  id beyond the known ranges). */
export function genOf(dexId: number): Generation {
  for (const g of GENERATIONS) {
    const [lo, hi] = GEN_INFO[g].range;
    if (dexId >= lo && dexId <= hi) return g;
  }
  return 9;
}

/**
 * The species available for a set of selected generations. An empty selection
 * (or one covering every gen) returns the full dex unchanged.
 */
export function creaturesForGens(gens: Generation[]): Creature[] {
  if (gens.length === 0 || gens.length === GENERATIONS.length) return CREATURES;
  const allowed = new Set(gens);
  return CREATURES.filter((c) => allowed.has(genOf(c.dexId)));
}

/** How many species each generation contributes to the playable dex. */
export function genCount(gen: Generation): number {
  return CREATURES.reduce((n, c) => (genOf(c.dexId) === gen ? n + 1 : n), 0);
}

/* -------------------------------------------------------------------------- */
/* Generation brackets                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The five playable "era" brackets. Each is cumulative (a superset of the one
 * before it) and maps to the console era / childhood cohort a player grew up
 * with — the strongest predictor of a fan's favourite generation. Picking a
 * bracket locks the *entire* run (draft pool and every foe, Champion included)
 * to that era's dex, and each bracket keeps its own daily Champion and board.
 * `all` is the standard, full-dex main mode.
 */
export type BracketId = 'kanto' | 'gb' | 'ds' | '3ds' | 'all';

/** Ribbon Cup sprite (in `public/sprites/ui/cup-*.png`) used as each era's
 *  emblem, replacing the old crown/trophy emojis. */
export type CupId = 'cool' | 'beauty' | 'cute' | 'clever' | 'tough';

export interface GenBracket {
  id: BracketId;
  /** Headline name shown on the picker tile. */
  label: string;
  /** One-line era hook shown under the label. */
  tag: string;
  /** Short label for compact leaderboard tabs. */
  tab: string;
  /** Generations included in this bracket. */
  gens: Generation[];
  /** The era's trophy emblem — a Ribbon Cup sprite. Full Dex gets the Cool Cup. */
  cup: CupId;
}

export const GEN_BRACKETS: GenBracket[] = [
  { id: 'kanto', label: 'The Original 151', tag: 'Game Boy · Kanto', tab: '151', gens: [1], cup: 'tough' },
  { id: 'gb', label: 'Game Boy Era', tag: 'Kanto + Johto', tab: 'I–II', gens: [1, 2], cup: 'cute' },
  { id: 'ds', label: 'DS Golden Age', tag: 'through Sinnoh', tab: 'I–IV', gens: [1, 2, 3, 4], cup: 'clever' },
  { id: '3ds', label: '3DS Era', tag: 'through Kalos', tab: 'I–VI', gens: [1, 2, 3, 4, 5, 6], cup: 'beauty' },
  { id: 'all', label: 'Full Dex', tag: 'Every region · main mode', tab: 'All', gens: GENERATIONS, cup: 'cool' },
];

/** Path to a cup sprite for use in `<img src>` (respects Vite's base URL). */
export function cupSrc(cup: CupId): string {
  return `${import.meta.env?.BASE_URL ?? '/'}sprites/ui/cup-${cup}.png`;
}

/** The cup emblem for a bracket id (falls back to the full-dex Cool Cup). */
export function bracketCup(id: BracketId): CupId {
  return (BRACKET_BY_ID[id] ?? BRACKET_BY_ID[DEFAULT_BRACKET]).cup;
}

/** The standard, full-dex main mode — the default selection. */
export const DEFAULT_BRACKET: BracketId = 'all';

const BRACKET_BY_ID: Record<BracketId, GenBracket> = Object.fromEntries(
  GEN_BRACKETS.map((b) => [b.id, b]),
) as Record<BracketId, GenBracket>;

export function isBracketId(x: unknown): x is BracketId {
  return typeof x === 'string' && x in BRACKET_BY_ID;
}

/** Resolve a bracket by id, falling back to the full-dex main mode. */
export function bracketById(id: string): GenBracket {
  return BRACKET_BY_ID[id as BracketId] ?? BRACKET_BY_ID[DEFAULT_BRACKET];
}

/** The playable species pool for a bracket (its era's dex). */
export function bracketDex(id: BracketId): Creature[] {
  return creaturesForGens(bracketById(id).gens);
}

/** Whether a National Dex id belongs to a bracket's era. */
export function inBracket(dexId: number, id: BracketId): boolean {
  return bracketById(id).gens.includes(genOf(dexId));
}
