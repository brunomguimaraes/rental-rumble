import type { Creature } from './types.js';
import type { GuardianSpec, PoolEntry, WildRules } from './world.js';
import type { RNG } from './rng.js';
import { CREATURES_BY_ID, withSign, withAbility, withBuild, asShiny, asAltColor } from './pokemon.js';
import { rollIdentity } from './identity.js';
import { clampLevel, scaleCreatureToLevel } from './levels.js';

// Wild Pokémon for training and expeditions. Every wild and guardian becomes a
// battle creature in buildWild, the one place the growth overhaul will change
// (it mints per-individual stats instead of scaling the species by level).

/** What the player may see of a wild: never its seed or rolled sign. */
export interface WildView {
  dexId: number;
  level: number;
  shiny: boolean;
  altColor: boolean;
  rare: boolean;
  guardian: boolean;
}

export interface RolledWild {
  view: WildView;
  creature: Creature;
  /** The stat handicap it fights at (`foeStatMult`). */
  statMult: number;
}

/** A rolled individual of `dexId` at `level`, ready for battle; null for an unknown species. */
export function buildWild(
  dexId: number,
  level: number,
  rng: RNG,
): { creature: Creature; shiny: boolean; altColor: boolean } | null {
  const species = CREATURES_BY_ID[String(dexId)];
  if (!species) return null;
  const id = rollIdentity(species, rng);
  let c = withSign(species, id.sign);
  if (id.ability) c = withAbility(c, id.ability);
  if (id.build) c = withBuild(c, id.build);
  if (id.shiny) c = asShiny(c);
  else if (id.altColor) c = asAltColor(c);
  return { creature: scaleCreatureToLevel(c, clampLevel(level)), shiny: c.shiny, altColor: c.altColor };
}

/** Weighted pick; `rareBoost` multiplies the weight of rare entries. */
export function pickFromPool(pool: readonly PoolEntry[], rng: RNG, rareBoost = 1): PoolEntry {
  const weights = pool.map((e) => e.weight * (e.rare ? rareBoost : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** A wild from the route's pool: species, then level (plus any bonus), then identity. */
export function rollPoolWild(
  wild: WildRules,
  rng: RNG,
  opts: { levelBonus?: number; rareBoost?: number } = {},
): RolledWild {
  const entry = pickFromPool(wild.pool, rng, opts.rareBoost ?? 1);
  const level = clampLevel(rng.int(wild.min, wild.max) + (opts.levelBonus ?? 0));
  const built = buildWild(entry.dexId, level, rng);
  if (!built) throw new Error(`unknown pool species ${entry.dexId}`);
  return {
    view: { dexId: entry.dexId, level, shiny: built.shiny, altColor: built.altColor, rare: Boolean(entry.rare), guardian: false },
    creature: built.creature,
    statMult: wild.statMult,
  };
}

/** The route's guardian: fixed species and level, a freshly rolled individual. */
export function rollGuardian(g: GuardianSpec, rng: RNG): RolledWild {
  const level = clampLevel(g.level);
  const built = buildWild(g.dexId, level, rng);
  if (!built) throw new Error(`unknown guardian species ${g.dexId}`);
  return {
    view: { dexId: g.dexId, level, shiny: built.shiny, altColor: built.altColor, rare: false, guardian: true },
    creature: built.creature,
    statMult: g.statMult,
  };
}
