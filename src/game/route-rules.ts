import type { OwnedMon } from './box.js';
import type {
  ActionAllowance, AllowanceRecord, CaptureBallId, FrozenRouteFoe, InventoryState,
  RouteBattle, RouteChoice, RouteFind, RouteNpc, RoutePhase, RouteRules, SearchKind,
} from './route-actions.js';
import { partyCreatures } from './activity.js';
import { simulateBattle } from './battle.js';
import { ownedMonToCreature } from './box.js';
import { mintStats } from './growth.js';
import { rollIdentity } from './identity.js';
import { ballCount, isCaptureBallId, itemById } from './items.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { RNG } from './rng.js';
import { pickFromPool } from './wilds.js';
import { placeById, placeTitle } from './world.js';

/** Live route rules. Legacy activity config and its seeded content stay unchanged. */
export const ROUTE_RULES: RouteRules = {
  version: 2,
  capacity: 48,
  initialActions: 12,
  refillEveryMs: 600_000,
  starterBalls: 20,
  wild: {
    min: 2, max: 5, statMult: 0.6,
    pool: [
      { dexId: 161, weight: 3 },
      { dexId: 263, weight: 3 },
      { dexId: 16, weight: 3 },
      { dexId: 19, weight: 3 },
      { dexId: 187, weight: 2 },
      { dexId: 191, weight: 2 },
      { dexId: 401, weight: 2 },
      { dexId: 399, weight: 2 },
      { dexId: 133, weight: 1, rare: true },
    ],
  },
  recommended: { min: 3, max: 8 },
  wildExp: 30,
  trainerExp: 50,
  trainerLevel: 5,
  trainerStatMult: 0.6,
  npcTrainerChance: 0.7,
  exploreWildChance: 0.45,
  exploreNpcChance: 0.3,
  landmarkChance: 0.5,
  pokeBundleChance: 0.75,
  pokeBundleQuantity: 3,
  greatBundleQuantity: 1,
  questGreatBalls: 3,
  basicCatchChance: 0.6,
  rareCatchChance: 0.35,
  battleCatchBonus: 0.2,
  greatCatchBonus: itemById('great')!.catchBonus,
  maxCatchChance: 0.95,
};

export const MEADOW_LANDMARKS = [
  { id: 'signpost', name: 'Old Signpost', blurb: 'Weathered arrows point to places you haven’t been yet.' },
  { id: 'sunflowers', name: 'Sunflower Patch', blurb: 'Sunkern doze between stalks taller than you.' },
  { id: 'hilltop-oak', name: 'Hilltop Oak', blurb: 'The oldest tree on the route, full of Pidgey nests.' },
] as const;

const TRAINERS: readonly (RouteNpc & { dexId: number })[] = [
  {
    id: 'meadow-scout', name: 'Meadow Scout', spriteKey: 'random-frlg-bird-keeper', dexId: 16,
    text: 'Pidgey and I know every breeze in this meadow. Would you like to practice with us?',
  },
  {
    id: 'youngster', name: 'Youngster', spriteKey: 'random-youngster', dexId: 263,
    text: 'Zigzagoon found another shortcut! We have time for a friendly battle if you do.',
  },
];

const RESEARCHER: RouteNpc = {
  id: 'researcher', name: 'Meadow Researcher', spriteKey: 'random-scientist-f',
  text: 'I’m surveying Sunny Meadow. Explore the Old Signpost, Sunflower Patch and Hilltop Oak, and I’ll share three Great Balls. Places you already found count too.',
};

/** Where a species lives in the wild today: the live route pool only, never the retired idle routes. */
export function wildAreas(dexId: number, rules: RouteRules = ROUTE_RULES): { name: string; rare: boolean }[] {
  const entry = rules.wild.pool.find((e) => e.dexId === dexId);
  const place = placeById('r1');
  return entry && place ? [{ name: placeTitle(place), rare: Boolean(entry.rare) }] : [];
}

/** Read-only projection. At capacity there is no banked overflow or partial interval. */
export function projectAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): AllowanceRecord {
  const effectiveNow = Math.max(now, record.refilledAt);
  const available = Math.max(0, Math.min(rules.capacity, Math.floor(record.available)));
  if (available === rules.capacity) return { available, refilledAt: effectiveNow };
  const elapsedIntervals = Math.floor((effectiveNow - record.refilledAt) / rules.refillEveryMs);
  const replenished = Math.min(rules.capacity, available + elapsedIntervals);
  return {
    available: replenished,
    refilledAt: replenished === rules.capacity
      ? effectiveNow
      : record.refilledAt + elapsedIntervals * rules.refillEveryMs,
  };
}

export function allowanceView(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): ActionAllowance {
  const current = projectAllowance(record, now, rules);
  return {
    available: current.available,
    capacity: rules.capacity,
    refillEveryMs: rules.refillEveryMs,
    nextRefillAt: current.available === rules.capacity ? null : current.refilledAt + rules.refillEveryMs,
  };
}

/** A transaction persists this projection together with its new encounter. */
export function spendAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): AllowanceRecord | null {
  const current = projectAllowance(record, now, rules);
  return current.available > 0 ? { ...current, available: current.available - 1 } : null;
}

function mintFoe({ dexId, level, rare, statMult, rng }: {
  dexId: number; level: number; rare: boolean; statMult: number; rng: RNG;
}): FrozenRouteFoe {
  const species = CREATURES_BY_ID[String(dexId)];
  if (!species) throw new Error(`Unknown route species ${dexId}`);
  const identity = rollIdentity(species, rng);
  const mint = { dexId, level, ...identity, stats: mintStats(dexId, level, rng, identity.build) };
  return {
    mint,
    view: { dexId, level, shiny: mint.shiny, altColor: mint.altColor, rare, guardian: false, sign: mint.sign },
    statMult,
  };
}

/** One seeded primary find, plus an independent optional landmark discovery. */
export function rollRouteFind({ seed, kind, knownLandmarks, questClaimed, inventory, rules = ROUTE_RULES }: {
  seed: string;
  kind: SearchKind;
  knownLandmarks: readonly string[];
  questClaimed: boolean;
  inventory: InventoryState;
  rules?: RouteRules;
}): RouteFind {
  const rng = new RNG(`route:${rules.version}:${seed}:find`);
  let primary: SearchKind | 'item' = kind;
  const guaranteedSupplies = kind === 'explore' && ballCount(inventory) === 0;
  if (guaranteedSupplies) primary = 'item';
  else if (kind === 'explore') {
    const category = rng.next();
    primary = category < rules.exploreWildChance ? 'wild'
      : category < rules.exploreWildChance + rules.exploreNpcChance ? 'npc' : 'item';
  }

  const landmarks: string[] = [];
  if (kind === 'explore') {
    const missing = MEADOW_LANDMARKS.filter((landmark) => !knownLandmarks.includes(landmark.id));
    const landmarkRng = new RNG(`route:${rules.version}:${seed}:landmark`);
    if (missing.length > 0 && landmarkRng.chance(rules.landmarkChance)) landmarks.push(landmarkRng.pick(missing).id);
  }

  if (primary === 'item') {
    const basic = guaranteedSupplies || rng.chance(rules.pokeBundleChance);
    return {
      kind: 'item', foe: null, npc: null, landmarks,
      items: [{ itemId: basic ? 'poke' : 'great', quantity: basic ? rules.pokeBundleQuantity : rules.greatBundleQuantity }],
    };
  }
  if (primary === 'npc') {
    if (!questClaimed && !rng.chance(rules.npcTrainerChance)) {
      return { kind: 'researcher', foe: null, npc: { ...RESEARCHER }, items: [], landmarks };
    }
    const { dexId, ...npc } = rng.pick(TRAINERS);
    const foe = mintFoe({ dexId, level: rules.trainerLevel, rare: false, statMult: rules.trainerStatMult, rng });
    return { kind: 'trainer', foe, npc, items: [], landmarks };
  }
  const entry = pickFromPool(rules.wild.pool, rng);
  const level = rng.int(rules.wild.min, rules.wild.max);
  const foe = mintFoe({ dexId: entry.dexId, level, rare: Boolean(entry.rare), statMult: rules.wild.statMult, rng });
  return { kind: 'wild', foe, npc: null, items: [], landmarks };
}

export function legalChoices(phase: RoutePhase): RouteChoice[] {
  switch (phase) {
    case 'wild': return ['battle', 'catch', 'leave'];
    case 'catch': return ['catch', 'leave'];
    case 'trainer': return ['battle', 'leave'];
    case 'researcher': return ['accept', 'decline', 'talk'];
    case 'resolved': return [];
  }
}

export function captureChance({ rare, wonBattle, ballId, rules = ROUTE_RULES }: {
  rare: boolean; wonBattle: boolean; ballId: CaptureBallId; rules?: RouteRules;
}): number {
  if (!isCaptureBallId(ballId)) throw new Error('Unsupported capture ball');
  const base = rare ? rules.rareCatchChance : rules.basicCatchChance;
  // Round the displayed probability so 35% + 20% + 20% remains exactly 75%.
  return Math.min(rules.maxCatchChance, Math.round((base + (wonBattle ? rules.battleCatchBonus : 0)
    + (ballId === 'great' ? rules.greatCatchBonus : 0)) * 10_000) / 10_000);
}

export function rollCapture({ seed, rare, wonBattle, ballId, rules = ROUTE_RULES }: {
  seed: string; rare: boolean; wonBattle: boolean; ballId: CaptureBallId; rules?: RouteRules;
}): boolean {
  return new RNG(`route:${rules.version}:${seed}:catch`).chance(captureChance({ rare, wonBattle, ballId, rules }));
}

export function simulateRouteBattle({ party, foe, seed }: {
  party: readonly OwnedMon[]; foe: FrozenRouteFoe; seed: string;
}): RouteBattle {
  const player = partyCreatures(party);
  const opponent = ownedMonToCreature({ ...foe.mint, id: 'route-foe', exp: 0, origin: 'catch', caughtAt: 0 });
  if (!opponent || player.length === 0 || player.length !== party.length) throw new Error('Invalid route battle participants');
  const battle = simulateBattle(player, [opponent], `route:${seed}:battle`, { foeStatMult: foe.statMult });
  return { won: battle.winner === 'player', turns: battle.turns, events: battle.events };
}
