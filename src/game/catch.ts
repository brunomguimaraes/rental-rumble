import type { Creature, PokemonType, SpecialTier } from './types.js';
import type { BattleResult } from './battle.js';
import type { CatchZone } from './zones.js';
import type { MintSpec } from './box.js';
import { RNG } from './rng.js';
import { CREATURES } from './pokemon.js';
import { buildOpponentTeam, simulateBattle } from './battle.js';
import { scaleCreatureToLevel, clampLevel } from './levels.js';
import { rollIdentity } from './identity.js';

const ALL_TYPES: readonly PokemonType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark',
  'steel', 'fairy',
];

function bst(c: Creature): number {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
}

function isSpecial(tier: SpecialTier): boolean {
  return tier !== 'normal';
}

/** How many wild foes a battle fields, scaled to (but capped below) party size. */
export function catchFoeCount(partySize: number): number {
  return Math.max(1, Math.min(partySize, 4));
}

/**
 * Deterministically build the ordered sequence of wild foe teams for a zone's
 * mission. Each team is type-themed (or the zone's fixed type), scaled to the
 * zone's foe level. Reproducible from (seed, zone, partySize).
 */
export function buildCatchMission(
  seed: string,
  zone: CatchZone,
  partySize: number,
  dex: Creature[] = CREATURES,
): Creature[][] {
  const rng = new RNG(`catch-mission:${seed}:${zone.id}`);
  const size = catchFoeCount(partySize);
  const teams: Creature[][] = [];
  for (let i = 0; i < zone.battles; i++) {
    const type = zone.foeType ?? rng.pick(ALL_TYPES);
    const team = buildOpponentTeam(type, size, 'trainer', `${seed}:${zone.id}:${i}`, dex);
    teams.push(team.map((c) => scaleCreatureToLevel(c, zone.foeLevel)));
  }
  return teams;
}

export interface CatchBattle {
  foeTeam: Creature[];
  result: BattleResult;
}

export interface MissionOutcome {
  cleared: boolean;
  battles: CatchBattle[];
}

/**
 * Simulate a whole catch mission with the given (already level-scaled) party.
 * Battles run in order at neutral stat multipliers — difficulty comes from
 * levels, not the Rental hero edge — and the run clears only if every one is
 * won. Deterministic given (party, seed, zone).
 */
export function simulateCatchMission(
  party: Creature[],
  seed: string,
  zone: CatchZone,
  dex: Creature[] = CREATURES,
): MissionOutcome {
  const mission = buildCatchMission(seed, zone, party.length, dex);
  const battles: CatchBattle[] = [];
  let cleared = true;
  for (let i = 0; i < mission.length; i++) {
    const foeTeam = mission[i];
    const result = simulateBattle(party, foeTeam, `${seed}#catch#${zone.id}#${i}`, {});
    battles.push({ foeTeam, result });
    if (result.winner !== 'player') {
      cleared = false;
      break;
    }
  }
  return { cleared, battles };
}

/** The candidate species pool for a zone's reward, biased weaker for low zones. */
function rewardPool(zone: CatchZone, dex: Creature[]): Creature[] {
  const normals = dex.filter((c) => !isSpecial(c.tier)).sort((a, b) => bst(a) - bst(b));
  if (normals.length === 0) return dex.slice();
  // Widen the window as zones climb: the beginner meadow yields the weakest
  // quarter, the ruins can roll anything.
  const frac = Math.min(1, 0.25 + 0.15 * zone.order);
  const cutoff = Math.max(1, Math.floor(normals.length * frac));
  return normals.slice(0, cutoff);
}

/**
 * Deterministically roll the reward for clearing a zone: a species (rarely a
 * "special" at higher zones), its rolled identity, and the zone's reward level.
 * Pure — the server rolls the authoritative reward, the client mirrors it.
 */
export function rollCatchReward(
  seed: string,
  zone: CatchZone,
  dex: Creature[] = CREATURES,
): MintSpec {
  const rng = new RNG(`catch-reward:${seed}:${zone.id}`);
  const specials = dex.filter((c) => isSpecial(c.tier));
  const rollSpecial = zone.legendaryChance > 0 && specials.length > 0 && rng.chance(zone.legendaryChance);
  const pool = rollSpecial ? specials : rewardPool(zone, dex);
  const species = rng.pick(pool);

  return {
    dexId: species.dexId,
    level: clampLevel(zone.rewardLevel),
    ...rollIdentity(species, rng),
  };
}

/**
 * The weak-pool reward for the one-time tutorial catch: a low-tier mon at the
 * tutorial's reward level. Deterministic from the user's seed.
 */
export function rollTutorialReward(
  seed: string,
  zone: CatchZone,
  dex: Creature[] = CREATURES,
): MintSpec {
  return rollCatchReward(seed, zone, dex);
}
