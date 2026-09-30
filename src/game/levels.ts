// Owned Pokémon carry a hidden level (1..MAX_LEVEL) that paces EXP and triggers
// evolution. Stats no longer scale with it: growth.ts rolls them one hidden
// level at a time. No screen prints the level; the EXP bar (expPercent) is what
// the player sees.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 50;

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.floor(level)));
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
 * many levels were gained (evolution.ts fires one growth per level gained).
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

/** EXP bar progress, 0..100, toward the next hidden level; 100 at the cap. */
export function expPercent(level: number, exp: number): number {
  if (clampLevel(level) >= MAX_LEVEL) return 100;
  return Math.min(100, Math.floor((100 * Math.max(0, exp)) / expToNext(level)));
}
