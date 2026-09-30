/**
 * Shared harness for the Hearthvale balance gates (scripts/world.test.ts [14])
 * and the tuning report (scripts/world-balance.ts). Not a test by itself.
 *
 * A gate member is a starter line at a given level, at the stage that line has
 * reached (starters evolve at 8 and 16), with a pinned rolled identity. All
 * seeds are fixed, so every rate is exact and repeatable.
 */
import type { OwnedMon } from '../src/game/box.js';
import type { ActivityConfig } from '../src/game/activity.js';
import type { RoutePlace } from '../src/game/world.js';
import { ownedMonToCreature } from '../src/game/box.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { rollIdentity } from '../src/game/identity.js';
import { RNG } from '../src/game/rng.js';
import { starterLine } from '../src/game/professions.js';
import { simulateBattle } from '../src/game/battle.js';
import { trainingFoe } from '../src/game/training.js';
import { rollGuardian } from '../src/game/wilds.js';

/** Metapod and Kakuna: the cocoon stages, held to a lower training bar. */
export const COCOONS: ReadonlySet<number> = new Set([11, 14]);

/** The species a starter line has become by `level`. */
export function stageDex(base: number, level: number): number {
  const line = starterLine(base);
  const stage = level >= 16 ? 2 : level >= 8 ? 1 : 0;
  return line[Math.min(stage, line.length - 1)];
}

export function gateMember(base: number, level: number, i: number): OwnedMon {
  const dexId = stageDex(base, level);
  const species = CREATURES_BY_ID[String(dexId)];
  const identity = rollIdentity(species, new RNG(`gate:${base}:${i % 20}`));
  return { id: `gate:${base}:${i % 20}`, dexId, level, exp: 0, ...identity, origin: 'starter', caughtAt: 0 };
}

export function midLevel(route: RoutePlace): number {
  return Math.floor((route.recommended.min + route.recommended.max) / 2);
}

/** Percent of `n` training battles a lone member of `base`'s line wins at `level`. */
export function trainingWinRate(base: number, level: number, cfg: ActivityConfig, n: number): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const me = ownedMonToCreature(gateMember(base, level, i));
    if (!me) continue;
    const foe = trainingFoe(`gate-${i}`, cfg, 0);
    if (simulateBattle([me], [foe.creature], `gate:${base}:${i}`, { foeStatMult: foe.statMult }).winner === 'player') wins++;
  }
  return Math.round((100 * wins) / n);
}

/** Percent of `n` guardian fights a lone member of `base`'s line wins at `level`. */
export function guardianWinRate(base: number, level: number, cfg: ActivityConfig, n: number): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const me = ownedMonToCreature(gateMember(base, level, i));
    if (!me) continue;
    const g = rollGuardian(cfg.guardian, new RNG(`g:${i}`));
    if (simulateBattle([me], [g.creature], `guard:${base}:${i}`, { foeStatMult: g.statMult }).winner === 'player') wins++;
  }
  return Math.round((100 * wins) / n);
}
