import type { Creature } from './types.js';
import type { Route } from './routes.js';
import type { MintSpec } from './box.js';
import { RNG } from './rng.js';
import {
  CREATURES,
  withSign,
  withAbility,
  withBuild,
  asShiny,
  asAltColor,
} from './pokemon.js';
import { rollIdentity } from './identity.js';
import { simulateBattle } from './battle.js';
import { scaleCreatureToLevel, clampLevel } from './levels.js';

// The idle loop's pure core: build the wild the trainer meets at each slot and
// run the party against it. Deterministic from (party, seed, route, count), so
// the server can simulate on claim and the client only renders the log.

export interface EncounterRecord {
  slot: number;
  dexId: number;
  level: number;
  won: boolean;
  turns: number;
}

export interface IdleOutcome {
  encounters: EncounterRecord[];
  wins: number;
  /** 'loss' = the party fell; 'count' = every requested encounter was fought. */
  stoppedBy: 'loss' | 'count';
}

function bst(c: Creature): number {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
}

/** The species that can appear on a route: the weakest quarter or half of the non-special dex. */
export function wildPool(route: Route, dex: Creature[] = CREATURES): Creature[] {
  const normals = dex.filter((c) => c.tier === 'normal').sort((a, b) => bst(a) - bst(b));
  const frac = route.pool === 'weak' ? 0.25 : 0.5;
  return normals.slice(0, Math.max(1, Math.floor(normals.length * frac)));
}

/** Apply a rolled identity to a base species for battle. */
export function creatureWithIdentity(
  base: Creature,
  id: ReturnType<typeof rollIdentity>,
): Creature {
  let c = withSign(base, id.sign);
  if (id.ability) c = withAbility(c, id.ability);
  if (id.build) c = withBuild(c, id.build);
  if (id.shiny) c = asShiny(c);
  else if (id.altColor) c = asAltColor(c);
  return c;
}

/** Single RNG walk: species pick, level jitter, then identity. */
function rollEncounter(
  seed: string,
  route: Route,
  slot: number,
  dex: Creature[],
): { creature: Creature; level: number } {
  const rng = new RNG(`idle-wild:${seed}:${route.id}:${slot}`);
  const species = rng.pick(wildPool(route, dex));
  const level = clampLevel(route.foeLevel + rng.int(-1, 1));
  const creature = scaleCreatureToLevel(
    creatureWithIdentity(species, rollIdentity(species, rng)),
    level,
  );
  return { creature, level };
}

/** The wild met at `slot` on a route, level-scaled. Deterministic. */
export function buildEncounter(
  seed: string,
  route: Route,
  slot: number,
  dex: Creature[] = CREATURES,
): Creature {
  return rollEncounter(seed, route, slot, dex).creature;
}

/** Level the `buildEncounter` wild was scaled to. */
export function encounterLevel(
  seed: string,
  route: Route,
  slot: number,
  dex: Creature[] = CREATURES,
): number {
  return rollEncounter(seed, route, slot, dex).level;
}

/**
 * Fight `count` wilds in order with an already level-scaled party. Stops at the
 * first loss. HP resets each battle (engine invariant), so a chain of wins is
 * the party being stronger, not luckier.
 */
export function simulateIdle(
  party: Creature[],
  seed: string,
  route: Route,
  count: number,
  dex: Creature[] = CREATURES,
): IdleOutcome {
  const encounters: EncounterRecord[] = [];
  let wins = 0;
  for (let slot = 0; slot < count; slot++) {
    const { creature: wild, level } = rollEncounter(seed, route, slot, dex);
    const result = simulateBattle(party, [wild], `${seed}#idle#${route.id}#${slot}`, {
      foeStatMult: route.wildStatMult,
    });
    const won = result.winner === 'player';
    encounters.push({ slot, dexId: wild.dexId, level, won, turns: result.turns });
    if (!won) return { encounters, wins, stoppedBy: 'loss' };
    wins++;
  }
  return { encounters, wins, stoppedBy: 'count' };
}

/** The one-time tutorial gift: a weak-pool species at level 3. Deterministic per seed. */
export function rollTutorialGift(seed: string, dex: Creature[] = CREATURES): MintSpec {
  const rng = new RNG(`tutorial-gift:${seed}`);
  const normals = dex.filter((c) => c.tier === 'normal').sort((a, b) => bst(a) - bst(b));
  const pool = normals.slice(0, Math.max(1, Math.floor(normals.length * 0.25)));
  const species = rng.pick(pool);
  return { dexId: species.dexId, level: 3, ...rollIdentity(species, rng) };
}
