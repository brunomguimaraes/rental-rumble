import type { Build, Creature, Move, Sign } from './types.js';
import type { BracketId } from './gens.js';
import { inBracket } from './gens.js';
import { RAW_DEX } from './pokedex.gen.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import {
  movesFor,
  canRollBuild,
  redistributeForBuild,
  applyMoveOverrides,
} from './moves.js';
import { abilitiesForDex, defaultAbilityForDex, isAbilityOption } from './abilities.js';
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
 * Return a copy of the creature wearing an emotion portrait. Pass `prefer` to
 * keep a specific face when the species ships it (used to carry an emotion theme
 * through evolution); otherwise — or when `prefer` isn't available — the face is
 * a seeded random pick, so a given run stays reproducible while rentals get
 * visual variety. The pick is colour-aware: a shiny / alt-colour creature draws
 * from its own recoloured emotion set, so the face always lands on a portrait
 * that exists. Falls back to the creature unchanged (Normal portrait) when no
 * portraits exist for the species.
 */
export function withRandomPortrait(
  creature: Creature,
  rng: RNG,
  prefer?: string,
): Creature {
  const [emotions, url] = creature.shiny
    ? [shinyPortraitEmotions(creature.dexId), shinyPortraitUrl]
    : creature.altColor
      ? [altColorPortraitEmotions(creature.dexId), altColorPortraitUrl]
      : [portraitEmotions(creature.dexId), portraitUrl];
  if (emotions.length === 0) return creature;
  const emotion = prefer && emotions.includes(prefer) ? prefer : rng.pick(emotions);
  return { ...creature, portrait: url(creature.dexId, emotion) };
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

/**
 * Held-item / relic icon, served locally from public/sprites/items. The `icon`
 * is the lowercased item-art filename (e.g. `leftovers`), drawn from the Gen 9
 * Essentials item pack. Used by the team-passive "relic" system (see relics.ts).
 */
export function itemUrl(icon: string): string {
  return `${ASSET}sprites/items/${icon}.png`;
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
    moves: movesFor(e.types, e.stats, sign, abilitiesForDex(e.id), e.id),
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

/**
 * Re-derive a creature's move pool from its current stats + sign, then re-apply
 * any player move tweaks on top. Centralised so every transform that changes the
 * moveset (sign reroll, build roll) keeps earned move overrides stuck in place.
 */
function deriveMoves(creature: Creature, sign = creature.sign): Move[] {
  const base = movesFor(
    creature.types,
    creature.stats,
    sign,
    abilitiesForDex(creature.dexId),
    creature.dexId,
  );
  return applyMoveOverrides(base, creature.moveOverrides);
}

/** Return a copy of the creature born under a different zodiac sign. */
export function withSign(creature: Creature, sign: Sign): Creature {
  if (creature.sign === sign) return creature;
  return { ...creature, sign, moves: deriveMoves(creature, sign) };
}

/**
 * Return a copy of the creature drafted with a specific offensive build, but
 * ONLY for genuinely mixed-attacker species (see canRollBuild) — on anything
 * else it's a no-op, so a lopsided mon can never have its stats reshaped. The
 * build redistributes the two attack stats around the *canonical* base spread
 * (so it's idempotent — re-applying never compounds), then rebuilds the moveset
 * (now biased to the chosen side by the category floor) and re-lays any move
 * tweaks. Round-trips through the leaderboard payload like sign/ability.
 */
export function withBuild(creature: Creature, build: Build): Creature {
  const baseStats = (CREATURES_BY_ID[creature.id] ?? creature).stats;
  if (!canRollBuild(baseStats)) return creature;
  const stats = redistributeForBuild(baseStats, build);
  const next: Creature = { ...creature, build, stats };
  return { ...next, moves: deriveMoves(next) };
}

/**
 * Return a copy of the creature with one move slot swapped for `move` — the
 * post-battle "tweak a move" reward. The override is recorded on the creature so
 * it survives later moveset re-derivations (a sign reroll, an evolution build
 * re-roll), and the live `moves` array is updated to match. Callers are expected
 * to pass a `move` from candidateMovesFor(creature) (the UI and the server-side
 * validator both gate on that legal pool).
 */
export function withMoveOverride(
  creature: Creature,
  slot: number,
  move: Move,
): Creature {
  if (slot < 0 || slot >= creature.moves.length) return creature;
  const moveOverrides = { ...(creature.moveOverrides ?? {}), [slot]: move };
  const moves = creature.moves.slice();
  moves[slot] = move;
  return { ...creature, moveOverrides, moves };
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
 * Species-lock framework — which dex ids can't share a team slot.
 *
 * Default rule: a team can't hold an ancestor and its descendant (Bulbasaur +
 * Venusaur, Eevee + Flareon, Gloom + Vileplume). Branched lines are the
 * exception: sibling evolutions from the same fork *can* coexist (Vaporeon +
 * Umbreon, Vileplume + Bellossom, Hitmonlee + Hitmontop). Derived entirely
 * from EVOLUTIONS — no hand-maintained exception list.
 */
const EVOLUTION_PARENT = (() => {
  const parent = new Map<number, number>();
  for (const [fromId, targets] of Object.entries(EVOLUTIONS)) {
    for (const to of targets) parent.set(to, Number(fromId));
  }
  return parent;
})();

/** Whether `ancestor` is the same species as, or evolves into, `descendant`. */
export function isEvolutionAncestor(ancestor: number, descendant: number): boolean {
  if (ancestor === descendant) return true;
  let current = descendant;
  while (EVOLUTION_PARENT.has(current)) {
    current = EVOLUTION_PARENT.get(current)!;
    if (current === ancestor) return true;
  }
  return false;
}

/**
 * Whether two species conflict under the team species lock. True for duplicates
 * and for any ancestor/descendant pair; false for branch siblings (different
 * Eevee evolutions, Vileplume vs Bellossom, etc.).
 */
export function speciesLockConflict(a: number, b: number): boolean {
  return isEvolutionAncestor(a, b) || isEvolutionAncestor(b, a);
}

/** Whether `dexId` conflicts with any species already on the team. */
export function speciesLockConflictsWithAny(dexId: number, teamDexIds: number[]): boolean {
  return teamDexIds.some((id) => speciesLockConflict(dexId, id));
}

/** @deprecated Use {@link speciesLockConflict} — kept for call-site clarity. */
export function sameFamily(a: number, b: number): boolean {
  return speciesLockConflict(a, b);
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
  // Carry the rolled Physical/Energy build across when the evolved species is
  // also a mixed attacker; otherwise it simply takes its own (lopsided) stats.
  // Earned per-move tweaks do NOT carry — the evolved species' kit is different,
  // so its moveset starts fresh (withBuild here works off the override-free base).
  if (creature.build) evolved = withBuild(evolved, creature.build);
  // A special colouring carries over through evolution (shiny stays shiny, an
  // alt colour stays an alt colour) — falling back to the base palette if the
  // evolved species has no matching recolour.
  if (creature.shiny) evolved = asShiny(evolved);
  else if (creature.altColor) evolved = asAltColor(evolved);
  // Carry the emotion theme across: keep the same face when the evolved species
  // ships it, else fall back to a random one (withRandomPortrait). The RNG is
  // seeded purely from the evolution + carried emotion so this stays a pure
  // function — the evolve preview and the committed result always match.
  const emotion = portraitEmotionFromUrl(creature.portrait);
  const rng = new RNG(`evolve:${creature.dexId}->${targetDexId}:${emotion ?? ''}`);
  return withRandomPortrait(evolved, rng, emotion);
}
