import type { AbilityId } from './types.js';
import type { RNG } from './rng.js';

/**
 * The abilities framework — scaffolding for species-level passives that bend the
 * battle engine (as opposed to zodiac signs, which only tilt stats, or moves,
 * which are chosen each turn).
 *
 * Two layers:
 *   1. ABILITIES          — display metadata (name + description) per ability.
 *   2. SPECIES_ABILITIES  — which ability *options* each National Dex id can be
 *                           born with. Most listed species have a single fixed
 *                           ability; some have two, and a freshly-rolled mon
 *                           picks one of them at random (seeded), the same way
 *                           its zodiac sign and shiny luck are rolled.
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
  moxie: {
    id: 'moxie',
    name: 'Moxie',
    description:
      'Each knockout stokes its confidence, raising its Attack — a sweeper that snowballs through a team.',
  },
  'speed-boost': {
    id: 'speed-boost',
    name: 'Speed Boost',
    description: 'Its Speed climbs a stage at the end of every turn.',
  },
  guts: {
    id: 'guts',
    name: 'Guts',
    description:
      'Powers through a status condition, hitting 1.5× harder while burned, poisoned or paralyzed.',
  },
  adaptability: {
    id: 'adaptability',
    name: 'Adaptability',
    description: 'Its same-type attacks hit even harder — STAB is doubled to 2×.',
  },
};

/**
 * National Dex id → the ability options that species can be born with. A
 * single-entry list is a fixed ability; a two-entry list rolls one at random
 * per freshly-rolled mon (see rollAbility). Only species with at least one
 * implemented ability appear here; every other species has none.
 *
 * Mirrors canon for the Slaking line (Slakoth/Slaking loaf with Truant, the
 * hyperactive Vigoroth is too wired to sleep) and gives a few species their two
 * real ability slots where both are implemented — e.g. Heracross is famously
 * either Guts or Moxie.
 */
export const SPECIES_ABILITIES: Record<number, AbilityId[]> = {
  // --- Truant / Vital Spirit (the Slaking line) ---------------------------
  287: ['truant'], // Slakoth
  288: ['vital-spirit'], // Vigoroth
  289: ['truant'], // Slaking

  // --- Moxie: KO-snowball sweepers ---------------------------------------
  198: ['moxie'], // Murkrow
  214: ['guts', 'moxie'], // Heracross — Guts or Moxie
  262: ['moxie'], // Mightyena
  373: ['moxie'], // Salamence
  430: ['moxie'], // Honchkrow
  551: ['moxie'], // Sandile
  552: ['moxie'], // Krokorok
  553: ['moxie'], // Krookodile
  559: ['moxie'], // Scraggy
  560: ['moxie'], // Scrafty

  // --- Speed Boost: fast, frail accelerators -----------------------------
  193: ['speed-boost'], // Yanma
  255: ['speed-boost'], // Torchic
  256: ['speed-boost'], // Combusken
  257: ['speed-boost'], // Blaziken
  291: ['speed-boost'], // Ninjask
  318: ['guts', 'speed-boost'], // Carvanha — Guts or Speed Boost
  319: ['guts', 'speed-boost'], // Sharpedo — Guts or Speed Boost
  469: ['speed-boost'], // Yanmega

  // --- Guts: status-loving brawlers --------------------------------------
  66: ['guts'], // Machop
  67: ['guts'], // Machoke
  68: ['guts'], // Machamp
  136: ['guts'], // Flareon
  217: ['guts'], // Ursaring
  276: ['guts'], // Taillow
  277: ['guts'], // Swellow
  296: ['guts'], // Makuhita
  297: ['guts'], // Hariyama
  532: ['guts'], // Timburr
  533: ['guts'], // Gurdurr
  534: ['guts'], // Conkeldurr

  // --- Adaptability: doubled-STAB nukes ----------------------------------
  341: ['adaptability'], // Corphish
  342: ['adaptability'], // Crawdaunt
  474: ['adaptability'], // Porygon-Z
  550: ['adaptability'], // Basculin
  690: ['adaptability'], // Skrelp
  691: ['adaptability'], // Dragalge
};

/** Every ability a species could be born with (empty when it has none). */
export function abilitiesForDex(dexId: number): AbilityId[] {
  return SPECIES_ABILITIES[dexId] ?? [];
}

/**
 * The species' default ability — the first option. Used as the base value on
 * the canonical CREATURES list and as the server's fallback when a submission
 * carries no explicit ability (legacy payloads).
 */
export function defaultAbilityForDex(dexId: number): AbilityId | undefined {
  return abilitiesForDex(dexId)[0];
}

/**
 * Pick the ability a freshly-rolled mon is born with, seeded so a run stays
 * reproducible. Single-option species don't draw from the RNG (keeping the
 * stream stable for everything else); two-option species roll one at random.
 */
export function rollAbility(dexId: number, rng: RNG): AbilityId | undefined {
  const options = abilitiesForDex(dexId);
  if (options.length <= 1) return options[0];
  return rng.pick(options);
}

/** Whether `id` is a legal ability option for this species. */
export function isAbilityOption(dexId: number, id: AbilityId): boolean {
  return abilitiesForDex(dexId).includes(id);
}

/** Display metadata for an ability id. */
export function abilityInfo(id: AbilityId): AbilityDef {
  return ABILITIES[id];
}
