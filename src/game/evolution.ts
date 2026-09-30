import type { OwnedMon, CatchOrigin } from './box.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { rollAbility } from './abilities.js';
import { applyExp } from './levels.js';
import type { RNG } from './rng.js';

// Owned mons evolve when they reach a level threshold. Slice 1 is level-only;
// slice 3 adds the affection gate on top. Thresholds are by STAGE, not by
// species, so every line grows on the same clock: a starter (origin
// 'starter') at 8 and 16, everything else at 16 and 32.

export const STARTER_EVOLUTION_LEVELS: readonly number[] = [8, 16];
export const DEFAULT_EVOLUTION_LEVELS: readonly number[] = [16, 32];

// child → parent, derived once from the forward table.
const PRE_EVOLUTION: Record<number, number> = {};
for (const [parent, children] of Object.entries(EVOLUTIONS)) {
  for (const child of children) PRE_EVOLUTION[child] = Number(parent);
}

/** 0 for a base form, 1 for a middle stage, 2 for a final stage (of a 3-line). */
export function stageOf(dexId: number): number {
  let stage = 0;
  let cur = dexId;
  while (PRE_EVOLUTION[cur] !== undefined && stage < 8) {
    cur = PRE_EVOLUTION[cur];
    stage++;
  }
  return stage;
}

/** Real, in-dex evolution targets for a species. */
function targets(dexId: number): number[] {
  return (EVOLUTIONS[dexId] ?? []).filter((id) => Boolean(CREATURES_BY_ID[String(id)]));
}

/** Level at which this species evolves, or null when it is a final form. */
export function evolutionLevel(dexId: number, origin: CatchOrigin): number | null {
  if (targets(dexId).length === 0) return null;
  const table = origin === 'starter' ? STARTER_EVOLUTION_LEVELS : DEFAULT_EVOLUTION_LEVELS;
  const stage = stageOf(dexId);
  return table[Math.min(stage, table.length - 1)] ?? null;
}

/**
 * Evolve an owned mon one stage. Branched lines pick with `rng` (seed it from
 * the mon id so the pick is stable). Keeps sign, build, colouring, emotion,
 * nickname, level and exp; re-rolls the ability for the new species so it
 * always carries a legal one. Pure.
 */
export function evolveOwned(mon: OwnedMon, rng: RNG): OwnedMon {
  const next = targets(mon.dexId);
  if (next.length === 0) return mon;
  const toDexId = next.length === 1 ? next[0] : rng.pick(next);
  const ability = rollAbility(toDexId, rng);
  const rest = { ...mon };
  delete rest.ability;
  return { ...rest, dexId: toDexId, ...(ability ? { ability } : {}) };
}

export interface GrowthResult {
  mon: OwnedMon;
  levelUp: { fromLevel: number; toLevel: number } | null;
  evolutions: { fromDexId: number; toDexId: number }[];
}

/** Apply EXP, then evolve once per threshold crossed. Pure. */
export function applyGrowthWithEvolution(mon: OwnedMon, gained: number, rng: RNG): GrowthResult {
  const grown = applyExp(mon.level, mon.exp, gained);
  let cur: OwnedMon = { ...mon, level: grown.level, exp: grown.exp };
  const evolutions: GrowthResult['evolutions'] = [];
  for (let guard = 0; guard < 4; guard++) {
    const at = evolutionLevel(cur.dexId, cur.origin);
    if (at === null || cur.level < at) break;
    const evolved = evolveOwned(cur, rng);
    if (evolved.dexId === cur.dexId) break;
    evolutions.push({ fromDexId: cur.dexId, toDexId: evolved.dexId });
    cur = evolved;
  }
  const levelUp = grown.levelsGained > 0 ? { fromLevel: mon.level, toLevel: grown.level } : null;
  return { mon: cur, levelUp, evolutions };
}
