import type { BaseStats, Build } from './types.js';
import type { RNG } from './rng.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { canRollBuild, redistributeForBuild } from './moves.js';
import { lineLength, stageOf } from './lines.js';
import { clampLevel } from './levels.js';

// Fire Emblem-style growth in Pokémon words
// (docs/superpowers/specs/2026-09-30-growth-system-design.md). Every species
// gets a floor, a potential and a ceiling per stat, all derived from its real
// base stats; an individual carries six current stats between its floor and its
// ceiling and rolls each of them once per hidden level. The battle engine sees
// stat × ENGINE_FACTOR, so a stat at its ceiling is the real base stat and
// battle.ts is untouched.

export const STAT_KEYS = ['hp', 'atk', 'eatk', 'def', 'edef', 'spd'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Short labels for bars and toasts; long names for sentences. */
export const STAT_LABELS: Record<StatKey, { short: string; long: string }> = {
  hp: { short: 'HP', long: 'HP' },
  atk: { short: 'P.Atk', long: 'Physical Attack' },
  eatk: { short: 'E.Atk', long: 'Energy Attack' },
  def: { short: 'P.Def', long: 'Physical Defense' },
  edef: { short: 'E.Def', long: 'Energy Defense' },
  spd: { short: 'Speed', long: 'Speed' },
};

// --- Knobs (the spec's last section) ----------------------------------------

/** Engine base stat = current stat × ENGINE_FACTOR; a ceiling maps back to the real base stat. */
export const ENGINE_FACTOR = 2.5;
/** A fresh individual starts at this share of its ceiling. */
export const FLOOR_SHARE = 0.2;
/** Hidden level at which an average individual would reach its ceilings; past the level-50 cap on purpose, so levelling alone rarely maxes every stat. */
export const TARGET_LEVELS = 60;
/** The slowest any stat can grow, in percent per growth. */
export const MIN_POTENTIAL = 10;
/** Share of the ceiling gap granted on evolution, on top of the floor gap. */
export const EVOLUTION_CEILING_SHARE = 0.25;

const ONES: BaseStats = { hp: 1, atk: 1, eatk: 1, def: 1, edef: 1, spd: 1 };

export interface SpeciesGrowth {
  floor: BaseStats;
  potential: BaseStats;
  ceiling: BaseStats;
}

/**
 * Young Pokémon grow fast: +15 for the base form of a three-stage line, +8 for
 * its middle form and for the base form of a two-stage line, 0 for final forms
 * and single-stage species.
 */
export function stageBonus(dexId: number): number {
  const stage = stageOf(dexId);
  const length = lineLength(dexId);
  if (length === 3) return stage === 0 ? 15 : stage === 1 ? 8 : 0;
  if (length === 2) return stage === 0 ? 8 : 0;
  return 0;
}

const cache = new Map<string, SpeciesGrowth>();

/**
 * Floor, potential and ceiling per stat for a species, after the build's
 * attack redistribution when the individual has one. Null for an unknown dex id.
 */
export function speciesGrowth(dexId: number, build?: Build): SpeciesGrowth | null {
  const species = CREATURES_BY_ID[String(dexId)];
  if (!species) return null;
  const effective = build && canRollBuild(species.stats) ? build : undefined;
  const key = `${dexId}:${effective ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = effective ? redistributeForBuild(species.stats, effective) : species.stats;
  const bonus = stageBonus(dexId);
  const floor = { ...ONES };
  const potential = { ...ONES };
  const ceiling = { ...ONES };
  for (const k of STAT_KEYS) {
    ceiling[k] = Math.max(2, Math.round(base[k] / ENGINE_FACTOR));
    floor[k] = Math.max(1, Math.round(ceiling[k] * FLOOR_SHARE));
    const room = ceiling[k] - floor[k];
    potential[k] = Math.max(MIN_POTENTIAL, Math.round((100 * room) / TARGET_LEVELS)) + bonus;
  }
  const g = { floor, potential, ceiling };
  cache.set(key, g);
  return g;
}

/** One growth's outcome; `level` is the hidden level it reached. */
export interface GrowthEvent {
  level: number;
  gains: Partial<Record<StatKey, number>>;
  /** Stats that reached their ceiling on this growth. */
  capped: StatKey[];
  tryingHard: boolean;
}

/**
 * One growth: each uncapped stat rolls once against its potential, in STAT_KEYS
 * order (one draw per uncapped stat, so a re-simulation matches); potential over
 * 100 pays its guaranteed points first; a growth with no lucky roll still raises
 * the uncapped stat with the highest potential (first in order on a tie). Pure.
 */
export function growOnce(
  stats: BaseStats,
  g: SpeciesGrowth,
  rng: RNG,
): { stats: BaseStats; gains: Partial<Record<StatKey, number>>; capped: StatKey[]; tryingHard: boolean } {
  const next = { ...stats };
  const gains: Partial<Record<StatKey, number>> = {};
  const capped: StatKey[] = [];
  for (const k of STAT_KEYS) {
    const room = g.ceiling[k] - next[k];
    if (room <= 0) continue;
    const p = g.potential[k];
    let inc = Math.floor(p / 100);
    if (rng.chance((p % 100) / 100)) inc += 1;
    inc = Math.min(inc, room);
    if (inc > 0) {
      next[k] += inc;
      gains[k] = inc;
      if (next[k] >= g.ceiling[k]) capped.push(k);
    }
  }
  let tryingHard = false;
  if (Object.keys(gains).length === 0) {
    const open = STAT_KEYS.filter((k) => next[k] < g.ceiling[k]);
    if (open.length > 0) {
      const best = open.reduce((a, b) => (g.potential[b] > g.potential[a] ? b : a));
      next[best] += 1;
      gains[best] = 1;
      if (next[best] >= g.ceiling[best]) capped.push(best);
      tryingHard = true;
    }
  }
  return { stats: next, gains, capped, tryingHard };
}

/** A fresh individual's stats at hidden `level`: the floor, rolled forward one growth per level above 1. */
export function mintStats(dexId: number, level: number, rng: RNG, build?: Build): BaseStats {
  const g = speciesGrowth(dexId, build);
  if (!g) return { ...ONES };
  let stats = { ...g.floor };
  const top = clampLevel(level);
  for (let l = 1; l < top; l++) stats = growOnce(stats, g, rng).stats;
  return stats;
}

/** What an average individual has at hidden `level`: floor plus (level − 1) growths at the potential, no dice. */
export function expectedStats(dexId: number, level: number, build?: Build): BaseStats {
  const g = speciesGrowth(dexId, build);
  if (!g) return { ...ONES };
  const n = clampLevel(level) - 1;
  const out = { ...ONES };
  for (const k of STAT_KEYS) out[k] = Math.min(g.ceiling[k], g.floor[k] + Math.round((n * g.potential[k]) / 100));
  return out;
}

/**
 * Stats after evolving `from` → `to` at hidden `level`: every point carries
 * over plus the floor gap and a quarter of the ceiling gap (each at least 0),
 * and never below an average individual of the new form at this level. A stat
 * above the new ceiling keeps its value. Pure.
 */
export function evolveStats(stats: BaseStats, from: number, to: number, level: number, build?: Build): BaseStats {
  const a = speciesGrowth(from, build);
  const b = speciesGrowth(to, build);
  if (!a || !b) return stats;
  const average = expectedStats(to, level, build);
  const next = { ...ONES };
  for (const k of STAT_KEYS) {
    const floorGap = Math.max(0, b.floor[k] - a.floor[k]);
    const ceilingGap = Math.max(0, Math.round((b.ceiling[k] - a.ceiling[k]) * EVOLUTION_CEILING_SHARE));
    next[k] = Math.max(stats[k] + floorGap + ceilingGap, average[k]);
  }
  return next;
}

/** The base stats the battle engine expects: current stat × ENGINE_FACTOR, never below 1. */
export function toEngineStats(stats: BaseStats): BaseStats {
  const out = { ...ONES };
  for (const k of STAT_KEYS) out[k] = Math.max(1, Math.round(stats[k] * ENGINE_FACTOR));
  return out;
}

/** Six finite numbers under the six stat keys (what a stored `stats` JSON must be). */
export function isBaseStats(v: unknown): v is BaseStats {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return STAT_KEYS.every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]));
}

/** `after − before`, per stat. */
export function statDeltas(before: BaseStats, after: BaseStats): BaseStats {
  const out = { ...ONES };
  for (const k of STAT_KEYS) out[k] = after[k] - before[k];
  return out;
}

// --- Words on screen ---------------------------------------------------------

export type PotentialWord = 'Fantastic' | 'Very Good' | 'Pretty Good' | 'Decent' | 'No Good';

/** The Judge's word for a potential; the Box never prints the number. */
export function potentialWord(p: number): PotentialWord {
  if (p >= 75) return 'Fantastic';
  if (p >= 55) return 'Very Good';
  if (p >= 40) return 'Pretty Good';
  if (p >= 25) return 'Decent';
  return 'No Good';
}

/** "Its Speed shows fantastic potential." */
export function potentialSentence(key: StatKey, p: number): string {
  return `Its ${STAT_LABELS[key].long} shows ${potentialWord(p).toLowerCase()} potential.`;
}

/** Toast lines for one growth: "Caterpie grew!", the gains, then one line per stat that just capped. */
export function growthLines(name: string, e: GrowthEvent): string[] {
  const gains = STAT_KEYS.filter((k) => e.gains[k]).map((k) => `${STAT_LABELS[k].short} +${e.gains[k]}`);
  const lines = [e.tryingHard ? `${name} is trying hard!` : `${name} grew!`];
  if (gains.length > 0) lines.push(gains.join(' · '));
  for (const k of e.capped) lines.push(`${name}'s ${STAT_LABELS[k].long} won't go any higher!`);
  return lines;
}

/** Toast lines for an evolution: "Metapod evolved into Butterfree!" then the positive deltas. */
export function evolutionLines(fromName: string, toName: string, deltas: BaseStats): string[] {
  const parts = STAT_KEYS.filter((k) => deltas[k] > 0).map((k) => `${STAT_LABELS[k].short} +${deltas[k]}`);
  const lines = [`${fromName} evolved into ${toName}!`];
  if (parts.length > 0) lines.push(parts.join(' · '));
  return lines;
}
