import type { PokemonType } from './types.js';
import { MAX_LEVEL } from './levels.js';

// Catch runs happen in fixed level ZONES. Each zone is a level band [min,max];
// a mon may only join the party if its level falls strictly inside that band, so
// a maxed-out team can't steamroll the beginner zone (that keeps a fair,
// seasonal-ready playing field). Clearing a zone mints a reward mon near the
// zone's floor level and grants EXP to the party.

export type ZoneId = 'tutorial' | 'z1' | 'z2' | 'z3' | 'z4' | 'z5';

export interface CatchZone {
  id: ZoneId;
  name: string;
  blurb: string;
  /** Inclusive level band a party mon must fall within to enter. */
  min: number;
  max: number;
  /** Level the caught reward arrives at (near the floor, so it must be raised). */
  rewardLevel: number;
  /** EXP each participating owned mon earns on a clear. */
  expReward: number;
  /** How many auto-battles the mission runs; all must be won to clear. */
  battles: number;
  /** Level the zone's wild foes fight at. */
  foeLevel: number;
  /** Chance a cleared reward rolls a "special" (legendary/mythical) species. */
  legendaryChance: number;
  /** Optional single-type theme for the zone's foes (else mixed). */
  foeType?: PokemonType;
  /** Zones unlock in order; the tutorial gates z1. */
  order: number;
}

export const CATCH_ZONES: readonly CatchZone[] = [
  {
    id: 'tutorial',
    name: 'First Steps',
    blurb: 'Meet your very first partner in the tall grass.',
    min: 1,
    max: 5,
    rewardLevel: 3,
    expReward: 0,
    battles: 0, // the tutorial is a guided catch, not a fight
    foeLevel: 3,
    legendaryChance: 0,
    order: 0,
  },
  {
    id: 'z1',
    name: 'Meadow Outskirts',
    blurb: 'Gentle grass where rookie trainers find their footing.',
    min: 1,
    max: 6,
    rewardLevel: 2,
    expReward: 22,
    battles: 2,
    foeLevel: 4,
    legendaryChance: 0,
    order: 1,
  },
  {
    id: 'z2',
    name: 'Whispering Woods',
    blurb: 'Shaded trails alive with skittish wild mons.',
    min: 5,
    max: 13,
    rewardLevel: 6,
    expReward: 34,
    battles: 2,
    foeLevel: 10,
    legendaryChance: 0,
    order: 2,
  },
  {
    id: 'z3',
    name: 'Craggy Pass',
    blurb: 'A rugged climb that tests a growing team.',
    min: 13,
    max: 23,
    rewardLevel: 14,
    expReward: 50,
    battles: 3,
    foeLevel: 18,
    legendaryChance: 0.01,
    order: 3,
  },
  {
    id: 'z4',
    name: 'Stormpeak Ridge',
    blurb: 'Wind-lashed heights prowled by seasoned wilds.',
    min: 23,
    max: 37,
    rewardLevel: 24,
    expReward: 72,
    battles: 3,
    foeLevel: 30,
    legendaryChance: 0.03,
    order: 4,
  },
  {
    id: 'z5',
    name: 'Ancient Ruins',
    blurb: 'Forgotten halls where the rarest mons still linger.',
    min: 37,
    max: MAX_LEVEL,
    rewardLevel: 34,
    expReward: 96,
    battles: 3,
    foeLevel: 46,
    legendaryChance: 0.06,
    order: 5,
  },
] as const;

const ZONE_BY_ID: Record<string, CatchZone> = Object.fromEntries(
  CATCH_ZONES.map((z) => [z.id, z]),
);

export function zoneById(id: unknown): CatchZone | null {
  return typeof id === 'string' && id in ZONE_BY_ID ? ZONE_BY_ID[id] : null;
}

export function isZoneId(v: unknown): v is ZoneId {
  return typeof v === 'string' && v in ZONE_BY_ID;
}

/** The battleable zones (everything but the tutorial), in unlock order. */
export const BATTLE_ZONES: readonly CatchZone[] = CATCH_ZONES.filter(
  (z) => z.id !== 'tutorial',
);

/** Whether a single level is legal for a zone (strictly in-band). */
export function isLevelInZone(level: number, zone: CatchZone): boolean {
  return level >= zone.min && level <= zone.max;
}

/**
 * Whether a whole party is legal for a zone: non-empty, at most 6, and every
 * member in-band. The tutorial is the one exception — it takes no party.
 */
export function isPartyEligible(levels: readonly number[], zone: CatchZone): boolean {
  if (zone.id === 'tutorial') return levels.length === 0;
  if (levels.length < 1 || levels.length > 6) return false;
  return levels.every((l) => isLevelInZone(l, zone));
}
