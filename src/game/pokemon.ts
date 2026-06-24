import type { Creature, Sign } from './types.js';
import type { BracketId } from './gens.js';
import { inBracket } from './gens.js';
import { RAW_DEX } from './pokedex.gen.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { movesFor } from './moves.js';
import { defaultSign, signsByFit } from './zodiac.js';
import { PORTRAIT_EMOTIONS } from './portraits.gen.js';
import { DEFAULT_BALL } from './balls.js';
import { RNG } from './rng.js';

// All sprites are served locally from public/sprites, keyed by National Dex id.
// (Front/Back/Icons come from a local Gen 9 Essentials pack; portraits are the
// fan-made PMD-style portraits from PMDCollab. See scripts/import-sprites.mjs
// and scripts/fetch-portraits.mjs.) BASE_URL keeps paths valid under sub-paths.
const ASSET = import.meta.env?.BASE_URL ?? '/';

/** Front battle sprite (used for the opponent's active Pokémon). */
export function spriteUrl(dexId: number): string {
  return `${ASSET}sprites/front/${dexId}.png`;
}

/** Back battle sprite (used for the player's active Pokémon). */
export function backUrl(dexId: number): string {
  return `${ASSET}sprites/back/${dexId}.png`;
}

/**
 * Fan-made, non-commercial PMD-style portrait (square; rounded in the UI).
 * Each species ships a set of emotion portraits (Normal, Happy, Sad, …); the
 * default is the neutral "Normal" face. See scripts/fetch-portraits.mjs.
 */
export function portraitUrl(dexId: number, emotion = 'Normal'): string {
  return `${ASSET}sprites/portrait/${dexId}/${emotion}.png`;
}

/** Emotion portraits available for a species (empty if none contributed). */
export function portraitEmotions(dexId: number): string[] {
  return PORTRAIT_EMOTIONS[dexId] ?? [];
}

/**
 * Return a copy of the creature wearing a random emotion portrait, chosen from
 * the seeded RNG so a given run is reproducible. Adds visual variety to each
 * rolled rental Pokémon. Falls back to the creature unchanged (Normal portrait)
 * when no portraits exist for the species.
 */
export function withRandomPortrait(creature: Creature, rng: RNG): Creature {
  const emotions = portraitEmotions(creature.dexId);
  if (emotions.length === 0) return creature;
  const emotion = rng.pick(emotions);
  return { ...creature, portrait: portraitUrl(creature.dexId, emotion) };
}

/** Box/icon mini sprite (2-frame sheet; the UI shows the first frame). */
export function miniUrl(dexId: number): string {
  return `${ASSET}sprites/icons/${dexId}.png`;
}

export const CREATURES: Creature[] = RAW_DEX.map((e) => {
  const sign = defaultSign(e.stats);
  return {
    id: String(e.id),
    dexId: e.id,
    name: e.name,
    sprite: spriteUrl(e.id),
    back: backUrl(e.id),
    portrait: portraitUrl(e.id),
    mini: miniUrl(e.id),
    types: e.types,
    tier: e.tier,
    sign,
    eligibleSigns: signsByFit(e.stats),
    stats: e.stats,
    moves: movesFor(e.types, e.stats, sign),
    pokeball: DEFAULT_BALL,
  };
});

export const CREATURES_BY_ID: Record<string, Creature> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
);

export function getCreature(id: string): Creature {
  const c = CREATURES_BY_ID[id];
  if (!c) throw new Error(`Unknown creature: ${id}`);
  return c;
}

/** Return a copy of the creature born under a different zodiac sign. */
export function withSign(creature: Creature, sign: Sign): Creature {
  if (creature.sign === sign) return creature;
  return {
    ...creature,
    sign,
    moves: movesFor(creature.types, creature.stats, sign),
  };
}

/** Return a copy of the creature sent out in a different (cosmetic) ball. */
export function withBall(creature: Creature, pokeball: string): Creature {
  if (creature.pokeball === pokeball) return creature;
  return { ...creature, pokeball };
}

/**
 * Dex ids this species can evolve INTO (already restricted to species we ship).
 * Most return a single id; branched lines (Eevee, Tyrogue, …) return several.
 * Empty when the species is already fully evolved / has no next stage.
 *
 * When a `bracket` is given, targets are also restricted to that era's dex — a
 * gen-locked run must stay in-era, so e.g. a Kanto Chansey (#113) can't ticket
 * up into Blissey (#242, Gen II) and smuggle an out-of-bracket mon into the run.
 */
export function evolutionTargets(dexId: number, bracket?: BracketId): number[] {
  return (EVOLUTIONS[dexId] ?? []).filter(
    (id) =>
      Boolean(CREATURES_BY_ID[String(id)]) && (bracket === undefined || inBracket(id, bracket)),
  );
}

/** Whether a creature has at least one evolution available (within `bracket`). */
export function canEvolve(creature: Creature, bracket?: BracketId): boolean {
  return evolutionTargets(creature.dexId, bracket).length > 0;
}

/**
 * Evolve a creature into one of its next stages, carrying over its hard-won
 * identity: the same zodiac sign (so its stat tilt & move flavour persist) and
 * the same cosmetic ball. Stats, types, tier and moves become the new species'.
 * `targetDexId` must be one of `evolutionTargets(creature.dexId)`.
 */
export function evolveCreature(creature: Creature, targetDexId: number): Creature {
  const base = getCreature(String(targetDexId));
  return withBall(withSign(base, creature.sign), creature.pokeball);
}
