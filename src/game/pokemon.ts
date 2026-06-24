import type { Creature, Sign } from './types.js';
import type { BracketId } from './gens.js';
import { inBracket } from './gens.js';
import { RAW_DEX } from './pokedex.gen.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { movesFor } from './moves.js';
import { defaultAbilityForDex, isAbilityOption } from './abilities.js';
import { defaultSign, signsByFit } from './zodiac.js';
import { PORTRAIT_EMOTIONS } from './portraits.gen.js';
import { SHINY_PORTRAITS, SHINY_SPRITE_IDS } from './shiny.gen.js';
import { ALT_COLOR_PORTRAITS, ALT_COLOR_SPRITE_IDS } from './altcolor.gen.js';
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
 * The gentle, flat blessing a shiny carries on every stat. Kept small (a 25%
 * nudge — well under the swing of a celestial sign) so a shiny is a pleasant
 * upgrade that never warps battle balance. Applied multiplicatively on top of
 * the zodiac sign's spread, both in battle (see battle.ts) and on the card.
 */
export const SHINY_STAT_MULT = 1.25;

/** Shiny recolour of the PMD-style portrait (mirrors the base-form emotions). */
export function shinyPortraitUrl(dexId: number, emotion = 'Normal'): string {
  return `${ASSET}sprites/portrait-shiny/${dexId}/${emotion}.png`;
}

/** Shiny emotion portraits bundled for a species (empty if none contributed). */
export function shinyPortraitEmotions(dexId: number): string[] {
  return SHINY_PORTRAITS[dexId] ?? [];
}

/**
 * Whether a species has a shiny variant we can actually show — either an
 * animated battle sprite or at least one portrait. Species without one never
 * roll shiny, so a "shiny" is always visibly different.
 */
export function canBeShiny(dexId: number): boolean {
  return SHINY_SPRITE_IDS.has(dexId) || shinyPortraitEmotions(dexId).length > 0;
}

/** Whether a species ships a full set of shiny battle-animation sheets. */
export function hasShinySprite(dexId: number): boolean {
  return SHINY_SPRITE_IDS.has(dexId);
}

/** Alternate-colour (non-shiny) recolour of the PMD-style portrait. */
export function altColorPortraitUrl(dexId: number, emotion = 'Normal'): string {
  return `${ASSET}sprites/portrait-alt/${dexId}/${emotion}.png`;
}

/** Alt-colour emotion portraits bundled for a species (empty if none). */
export function altColorPortraitEmotions(dexId: number): string[] {
  return ALT_COLOR_PORTRAITS[dexId] ?? [];
}

/**
 * Pull the emotion name out of a portrait URL (e.g. `…/portrait/25/Happy.png`
 * → `"Happy"`). Lets a finished run record the *exact* face it fielded from the
 * creature's `portrait` URL, so the leaderboard can later show that same face
 * instead of falling back to the neutral default. Returns undefined when the
 * URL isn't a portrait path (e.g. a front-sprite fallback).
 */
export function portraitEmotionFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = /\/portrait(?:-shiny|-alt)?\/\d+\/([^/]+)\.png(?:[?#].*)?$/.exec(url);
  return m ? m[1] : undefined;
}

/**
 * Whether a species has a fan-made alternate-colour variant we can show — either
 * an animated battle sprite or at least one portrait. Species without one never
 * roll an alt colour, so the recolour is always visibly different.
 */
export function canBeAltColor(dexId: number): boolean {
  return (
    ALT_COLOR_SPRITE_IDS.has(dexId) ||
    altColorPortraitEmotions(dexId).length > 0
  );
}

/**
 * Return a copy of the creature wearing a random emotion portrait, chosen from
 * the seeded RNG so a given run is reproducible. Adds visual variety to each
 * rolled rental Pokémon. Falls back to the creature unchanged (Normal portrait)
 * when no portraits exist for the species.
 */
export function withRandomPortrait(creature: Creature, rng: RNG): Creature {
  // A special colouring (shiny / alt colour) draws from its own recoloured
  // emotion set, so the random face still lands on a portrait that exists.
  if (creature.shiny) {
    const shinyEmotions = shinyPortraitEmotions(creature.dexId);
    if (shinyEmotions.length === 0) return creature;
    const emotion = rng.pick(shinyEmotions);
    return { ...creature, portrait: shinyPortraitUrl(creature.dexId, emotion) };
  }
  if (creature.altColor) {
    const altEmotions = altColorPortraitEmotions(creature.dexId);
    if (altEmotions.length === 0) return creature;
    const emotion = rng.pick(altEmotions);
    return { ...creature, portrait: altColorPortraitUrl(creature.dexId, emotion) };
  }
  const emotions = portraitEmotions(creature.dexId);
  if (emotions.length === 0) return creature;
  const emotion = rng.pick(emotions);
  return { ...creature, portrait: portraitUrl(creature.dexId, emotion) };
}

/**
 * Mark a creature shiny: flips the flag and swaps its neutral portrait to the
 * shiny recolour (a random emotion is layered on later by withRandomPortrait).
 * Pure and DOM-free, so the server re-sim can reconstruct a shiny's stats from
 * the submitted flag exactly. No-op if already shiny.
 */
export function asShiny(creature: Creature): Creature {
  if (creature.shiny) return creature;
  const hasPortrait = shinyPortraitEmotions(creature.dexId).length > 0;
  return {
    ...creature,
    shiny: true,
    altColor: false,
    portrait: hasPortrait
      ? shinyPortraitUrl(creature.dexId)
      : creature.portrait,
  };
}

/**
 * Mark a creature with its fan-made alternate colour: flips the flag and swaps
 * to the recoloured portrait (a random emotion is layered on later by
 * withRandomPortrait). Purely cosmetic — never touches stats. No-op if already
 * alt-coloured; clears `shiny` since the two colourings are exclusive.
 */
export function asAltColor(creature: Creature): Creature {
  if (creature.altColor) return creature;
  const hasPortrait = altColorPortraitEmotions(creature.dexId).length > 0;
  return {
    ...creature,
    altColor: true,
    shiny: false,
    portrait: hasPortrait
      ? altColorPortraitUrl(creature.dexId)
      : creature.portrait,
  };
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
    ability: defaultAbilityForDex(e.id),
    pokeball: DEFAULT_BALL,
    shiny: false,
    altColor: false,
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
 * Return a copy of the creature born with a specific ability (or none). Used to
 * stamp the rolled ability onto a freshly-drafted/opponent mon, and to rebuild a
 * submitted team's claimed ability on the server. Doesn't touch moves or stats.
 */
export function withAbility(
  creature: Creature,
  ability: Creature['ability'],
): Creature {
  if (creature.ability === ability) return creature;
  return { ...creature, ability };
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
 * Map every species to a stable "family id" — the lowest National Dex id in its
 * evolutionary line, treating EVOLUTIONS as an undirected graph. Two species
 * share a family when one evolves into the other at any distance, so Bulbasaur,
 * Ivysaur and Venusaur all resolve to 1, and branched lines (Eevee, Wurmple, …)
 * collapse into a single family too. A species with no relatives is its own
 * family. Built once at module load by flood-filling connected components.
 */
const FAMILY_OF: Map<number, number> = (() => {
  const adjacency = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  for (const [fromId, targets] of Object.entries(EVOLUTIONS)) {
    for (const to of targets) link(Number(fromId), to);
  }

  const family = new Map<number, number>();
  const visited = new Set<number>();
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const stack = [start];
    const component: number[] = [];
    visited.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      component.push(node);
      for (const next of adjacency.get(node) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    const root = Math.min(...component);
    for (const node of component) family.set(node, root);
  }
  return family;
})();

/**
 * Stable id shared by every member of a species' evolutionary line. Species with
 * no (shipped) evolutions are their own family, so this is always defined — which
 * makes it a safe key for "one per evolutionary line on a team" rules.
 */
export function familyId(dexId: number): number {
  return FAMILY_OF.get(dexId) ?? dexId;
}

/** Whether two species belong to the same evolutionary line. */
export function sameFamily(a: number, b: number): boolean {
  return familyId(a) === familyId(b);
}

/**
 * Evolve a creature into one of its next stages, carrying over its hard-won
 * identity: the same zodiac sign (so its stat tilt & move flavour persist) and
 * the same cosmetic ball. Stats, types, tier and moves become the new species'.
 * `targetDexId` must be one of `evolutionTargets(creature.dexId)`.
 */
export function evolveCreature(creature: Creature, targetDexId: number): Creature {
  const base = getCreature(String(targetDexId));
  let evolved = withBall(withSign(base, creature.sign), creature.pokeball);
  // Carry the current ability across only when the evolved species can also be
  // born with it (preserving a rolled choice within a same-ability line);
  // otherwise it takes its own species' default, since a line's abilities can
  // genuinely differ (e.g. Slakoth's Truant → Vigoroth's Vital Spirit).
  if (creature.ability && isAbilityOption(targetDexId, creature.ability)) {
    evolved = withAbility(evolved, creature.ability);
  }
  // A special colouring carries over through evolution (shiny stays shiny, an
  // alt colour stays an alt colour) — falling back to the base palette if the
  // evolved species has no matching recolour.
  if (creature.shiny) return asShiny(evolved);
  if (creature.altColor) return asAltColor(evolved);
  return evolved;
}
