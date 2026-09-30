import type { OwnedMon, CatchOrigin } from './box.js';
import type { BaseStats } from './types.js';
import { rollAbility } from './abilities.js';
import { applyExp, clampLevel } from './levels.js';
import { evolutionTargets, stageOf } from './lines.js';
import {
  speciesGrowth,
  growOnce,
  evolveStats,
  expectedStats,
  isBaseStats,
  statDeltas,
  type GrowthEvent,
} from './growth.js';
import type { RNG } from './rng.js';

export { stageOf } from './lines.js';

// Owned mons evolve when their hidden level reaches a stage threshold. Slice 1
// is level-only; slice 3 adds the affection gate on top. Thresholds are by
// STAGE, not by species, so every line grows on the same clock: a starter
// (origin 'starter') at 8 and 16, everything else at 16 and 32. Stats carry
// through evolution (see evolveStats in growth.ts).

export const STARTER_EVOLUTION_LEVELS: readonly number[] = [8, 16];
export const DEFAULT_EVOLUTION_LEVELS: readonly number[] = [16, 32];

/** Level at which this species evolves, or null when it is a final form. */
export function evolutionLevel(dexId: number, origin: CatchOrigin): number | null {
  if (evolutionTargets(dexId).length === 0) return null;
  const table = origin === 'starter' ? STARTER_EVOLUTION_LEVELS : DEFAULT_EVOLUTION_LEVELS;
  const stage = stageOf(dexId);
  return table[Math.min(stage, table.length - 1)] ?? null;
}

/** The individual's stats, or an average individual's when a row arrived without them. */
function currentStats(mon: OwnedMon): BaseStats {
  return isBaseStats(mon.stats) ? mon.stats : expectedStats(mon.dexId, clampLevel(mon.level), mon.build);
}

/**
 * Evolve an owned mon one stage. Branched lines pick with `rng` (seed it from
 * the mon id so the pick is stable). Keeps sign, build, colouring, emotion,
 * nickname, level and exp; carries every stat point over (evolveStats); re-rolls
 * the ability for the new species so it always carries a legal one. Pure.
 */
export function evolveOwned(mon: OwnedMon, rng: RNG): OwnedMon {
  const next = evolutionTargets(mon.dexId);
  if (next.length === 0) return mon;
  const toDexId = next.length === 1 ? next[0] : rng.pick(next);
  const ability = rollAbility(toDexId, rng);
  const stats = evolveStats(currentStats(mon), mon.dexId, toDexId, clampLevel(mon.level), mon.build);
  const rest = { ...mon };
  delete rest.ability;
  return { ...rest, dexId: toDexId, stats, ...(ability ? { ability } : {}) };
}

export interface GrowthResult {
  mon: OwnedMon;
  levelUp: { fromLevel: number; toLevel: number } | null;
  /** One entry per hidden level reached, in order. */
  growths: GrowthEvent[];
  evolutions: { fromDexId: number; toDexId: number; deltas: BaseStats }[];
}

/**
 * Apply EXP level by level: each hidden level reached fires one growth for the
 * current species, then evolves if that level crosses the stage threshold, so
 * later growths roll with the new form's potential. A Pokémon already past its
 * threshold (a legacy row) evolves even when no level is gained. Pure; the
 * caller owns the RNG.
 */
export function applyGrowthWithEvolution(mon: OwnedMon, gained: number, rng: RNG): GrowthResult {
  const fromLevel = clampLevel(mon.level);
  const grown = applyExp(fromLevel, mon.exp, gained);
  let cur: OwnedMon = { ...mon, level: fromLevel, stats: currentStats(mon) };
  const growths: GrowthEvent[] = [];
  const evolutions: GrowthResult['evolutions'] = [];

  const evolveIfDue = () => {
    for (let guard = 0; guard < 4; guard++) {
      const at = evolutionLevel(cur.dexId, cur.origin);
      if (at === null || cur.level < at) return;
      const evolved = evolveOwned(cur, rng);
      if (evolved.dexId === cur.dexId) return;
      evolutions.push({ fromDexId: cur.dexId, toDexId: evolved.dexId, deltas: statDeltas(cur.stats, evolved.stats) });
      cur = evolved;
    }
  };

  for (let level = fromLevel + 1; level <= grown.level; level++) {
    const g = speciesGrowth(cur.dexId, cur.build);
    if (g) {
      const r = growOnce(cur.stats, g, rng);
      cur = { ...cur, level, stats: r.stats };
      growths.push({ level, gains: r.gains, capped: r.capped, tryingHard: r.tryingHard });
    } else {
      cur = { ...cur, level };
    }
    evolveIfDue();
  }
  evolveIfDue();
  cur = { ...cur, exp: grown.exp };
  const levelUp = grown.levelsGained > 0 ? { fromLevel, toLevel: grown.level } : null;
  return { mon: cur, levelUp, growths, evolutions };
}
