import type { Creature } from './types';
import { CREATURES } from './pokemon';

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
