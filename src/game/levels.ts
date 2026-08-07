import type { BaseStats, Creature } from './types.js';

// Owned Pokémon carry a level (1..MAX_LEVEL) that scales how strong they are in
// a Catch run. Rental play is unchanged — it fights at full base stats (the
// equivalent of a level-MAX_LEVEL mon). A freshly caught mon is deliberately
// weak and grows toward that ceiling as it earns EXP across runs.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 50;

// A level-1 mon fights at 35% of its base stats; a level-MAX_LEVEL mon at 100%
// (so a fully grown owned mon is exactly a rental-equivalent). Linear in
// between, keeping the growth curve easy to read on a card.
const MIN_STAT_MULT = 0.35;

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.floor(level)));
}

/** Multiplier applied to every base stat for a mon at `level`. Monotonic. */
export function levelStatMult(level: number): number {
  const l = clampLevel(level);
  const t = (l - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
  return MIN_STAT_MULT + (1 - MIN_STAT_MULT) * t;
}

/** A copy of the creature with every base stat scaled to `level` (min 1 each). */
export function scaleCreatureToLevel(creature: Creature, level: number): Creature {
  const mult = levelStatMult(level);
  const s = creature.stats;
  const scaled: BaseStats = {
    hp: Math.max(1, Math.round(s.hp * mult)),
    atk: Math.max(1, Math.round(s.atk * mult)),
    eatk: Math.max(1, Math.round(s.eatk * mult)),
    def: Math.max(1, Math.round(s.def * mult)),
    edef: Math.max(1, Math.round(s.edef * mult)),
    spd: Math.max(1, Math.round(s.spd * mult)),
  };
  return { ...creature, stats: scaled };
}

// --- EXP curve ---------------------------------------------------------------

/** EXP needed to advance FROM `level` to `level + 1`. Grows with level. */
export function expToNext(level: number): number {
  const l = clampLevel(level);
  if (l >= MAX_LEVEL) return Infinity;
  return 20 * l;
}

export interface Growth {
  level: number;
  exp: number; // progress toward the next level (0..expToNext(level))
}

/**
 * Apply earned EXP to a (level, exp) pair, rolling over as many levels as the
 * gain covers and clamping at MAX_LEVEL. Pure. Returns the new growth plus how
 * many levels were gained (for the "leveled up!" UI).
 */
export function applyExp(level: number, exp: number, gained: number): Growth & { levelsGained: number } {
  let lvl = clampLevel(level);
  let cur = Math.max(0, Math.floor(exp)) + Math.max(0, Math.floor(gained));
  const startLevel = lvl;
  while (lvl < MAX_LEVEL && cur >= expToNext(lvl)) {
    cur -= expToNext(lvl);
    lvl += 1;
  }
  if (lvl >= MAX_LEVEL) cur = 0;
  return { level: lvl, exp: cur, levelsGained: lvl - startLevel };
}
