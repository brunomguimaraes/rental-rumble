import type { AbilityId } from './types.js';

/**
 * The abilities framework — scaffolding for species-level passives that bend the
 * battle engine (as opposed to zodiac signs, which only tilt stats, or moves,
 * which are chosen each turn).
 *
 * Two layers:
 *   1. ABILITIES        — display metadata (name + description) for each ability.
 *   2. SPECIES_ABILITY  — which National Dex ids carry which ability.
 *
 * The actual battle behaviour lives in battle.ts (so the client sim and the
 * server re-sim stay byte-identical, the same pattern used for status/move
 * effects). This file is purely data: identity, copy, and the species mapping.
 *
 * Deliberately starting small — only the species that genuinely need one have an
 * ability. We grow the union (see AbilityId in types.ts) and these tables as we
 * implement more.
 */

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** One-line, player-facing explanation (used on cards and in the guide). */
  description: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  truant: {
    id: 'truant',
    name: 'Truant',
    description:
      'Loafs around every other turn, unable to act — the brake on a brute whose raw stats would otherwise be overwhelming.',
  },
  'vital-spirit': {
    id: 'vital-spirit',
    name: 'Vital Spirit',
    description: 'Too wired to doze off — can never be put to sleep.',
  },
};

/**
 * National Dex id → ability. Only species with an implemented ability appear
 * here; every other species has no ability. Mirrors canon for the Slaking line:
 * Slakoth and Slaking loaf with Truant, while the hyperactive middle stage
 * Vigoroth is instead too wired to sleep.
 */
export const SPECIES_ABILITY: Record<number, AbilityId> = {
  287: 'truant', // Slakoth
  288: 'vital-spirit', // Vigoroth
  289: 'truant', // Slaking
};

/** The ability a species is born with, or `undefined` if it has none. */
export function abilityForDex(dexId: number): AbilityId | undefined {
  return SPECIES_ABILITY[dexId];
}

/** Display metadata for an ability id. */
export function abilityInfo(id: AbilityId): AbilityDef {
  return ABILITIES[id];
}
