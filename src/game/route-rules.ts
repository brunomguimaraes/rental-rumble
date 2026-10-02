import type { OwnedMon } from './box.js';
import type {
  ActionAllowance, AllowanceRecord, CaptureBallId, FoePool, FrozenRouteFoe, InventoryState,
  RouteBattle, RouteChoice, RouteFind, RouteNpc, RoutePhase, RouteRules, SearchKind, StoredRouteRules,
} from './route-actions.js';
import { partyCreatures } from './activity.js';
import { simulateBattle } from './battle.js';
import { ownedMonToCreature } from './box.js';
import { currentHp, isFainted, ownedMaxHp } from './health.js';
import { mintStats } from './growth.js';
import { rollIdentity } from './identity.js';
import { ballCount, isCaptureBallId, itemById } from './items.js';
import { meterView, projectMeter, spendMeter, type MeterRules } from './meter.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { RNG } from './rng.js';
import { generatePuzzle } from './sliding-puzzle.js';
import { placeById, placeTitle } from './world.js';

/** Live route rules: the action board. Encounters keep the rules they were created under. */
export const ROUTE_RULES: RouteRules = {
  version: 4,
  capacity: 48,
  initialActions: 12,
  refillEveryMs: 600_000,
  starterBalls: 20,
  costs: { wild: 1, trainer: 1, puzzle: 1, quest: 1, explore: 1, forage: 1 },
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
    ],
  },
  recommended: { min: 3, max: 8 },
  wildExp: 30,
  trainerExp: 50,
  trainerLevel: 5,
  trainerStatMult: 0.6,
  wildMoney: 0,
  trainerMoney: 200,
  explore: { nothing: 35, item: 35, rare: 20, secret: 10 },
  exploreItems: [
    { items: [{ itemId: 'great', quantity: 2 }], money: 0, weight: 5 },
    { items: [{ itemId: 'big-mushroom', quantity: 1 }], money: 0, weight: 3 },
    { items: [], money: 500, weight: 2 },
  ],
  exploreRares: {
    min: 2, max: 5, statMult: 0.6,
    pool: [
      { dexId: 133, weight: 2, rare: true },
      { dexId: 25, weight: 2, rare: true },
      { dexId: 280, weight: 1, rare: true },
    ],
  },
  honeyTree: {
    min: 2, max: 5, statMult: 0.6,
    pool: [
      { dexId: 415, weight: 5 },
      { dexId: 412, weight: 3 },
      // At ×0.6 a lone Lotad beat Heracross in under a third of fights; at ×0.45 every starter wins 72% or more.
      { dexId: 214, weight: 1, rare: true, statMult: 0.45 },
      { dexId: 446, weight: 1, rare: true },
    ],
  },
  forage: [
    { itemId: 'honey', weight: 6 },
    { itemId: 'tiny-mushroom', weight: 3 },
    { itemId: 'big-mushroom', weight: 1 },
  ],
  puzzle: {
    size: 3, slides: 40, minDistance: 10,
    scenes: ['tall-grass', 'sunflowers', 'signpost', 'hilltop-oak'],
    rewards: [
      { items: [{ itemId: 'great', quantity: 1 }], weight: 40 },
      { items: [{ itemId: 'poke', quantity: 3 }], weight: 30 },
      { items: [{ itemId: 'tiny-mushroom', quantity: 1 }], weight: 20 },
      { items: [{ itemId: 'big-mushroom', quantity: 1 }], weight: 10 },
    ],
  },
  pokeBundleQuantity: 3,
  questGreatBalls: 3,
  questMoney: 500,
  basicCatchChance: 0.6,
  rareCatchChance: 0.35,
  battleCatchBonus: 0.2,
  greatCatchBonus: itemById('great')!.catchBonus,
  maxCatchChance: 0.95,
};

// Wild and trainer finds stay on the version 2 stream: a wild search rolls as it did under v2 and v3.
const STREAM = 'route:2';
// Finds new in rules v4 (Explore's outcomes, Forage, puzzles, the Honey Tree) roll on their own stream.
const STREAM_V4 = 'route:4';

/** Weighted pick over entries in their listed order. */
function pickWeighted<T extends { weight: number }>(entries: readonly T[], rng: RNG): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

/** Explore's free resupply: no capture balls and not enough ₽ to buy one. */
export function guaranteesSupplies(inventory: InventoryState): boolean {
  return ballCount(inventory) === 0 && inventory.money < (itemById('poke')?.price.buy ?? 0);
}

/** ₽ a won battle pays under the encounter's frozen rules; v2 encounters pay nothing. */
export function battlePrize(kind: RouteFind['kind'], rules: StoredRouteRules): number {
  if (rules.version === 2) return 0;
  return kind === 'wild' ? rules.wildMoney : kind === 'trainer' ? rules.trainerMoney : 0;
}

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
  {
    id: 'lass', name: 'Lass', spriteKey: 'random-lass', dexId: 191,
    text: 'My Sunkern finally woke up in the sunflower patch. Will you battle us before it dozes off again?',
  },
  {
    id: 'bug-catcher', name: 'Bug Catcher', spriteKey: 'random-frlg-bug-catcher', dexId: 401,
    text: 'Kricketot has been practicing its song all morning. Want to hear how it battles?',
  },
];

/** Where a species lives in the wild today: the live route's pools only, never the retired idle routes. */
export function wildAreas(dexId: number, rules: RouteRules = ROUTE_RULES): { name: string; rare: boolean }[] {
  const entries = [rules.wild, rules.exploreRares, rules.honeyTree].flatMap((pool) => pool.pool.filter((entry) => entry.dexId === dexId));
  const place = placeById('r1');
  return entries.length > 0 && place ? [{ name: placeTitle(place), rare: entries.every((entry) => Boolean(entry.rare)) }] : [];
}

const allowanceMeter = (rules: RouteRules): MeterRules => ({ capacity: rules.capacity, refillEveryMs: rules.refillEveryMs, floor: 0 });

/** Read-only projection. At capacity there is no banked overflow or partial interval. */
export function projectAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): AllowanceRecord {
  return projectMeter(record, now, allowanceMeter(rules));
}

export function allowanceView(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): ActionAllowance {
  return meterView(record, now, allowanceMeter(rules));
}

/** A transaction persists this projection together with its new encounter. */
export function spendAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES, cost = 1): AllowanceRecord | null {
  return spendMeter(record, now, cost, allowanceMeter(rules));
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

/** A weighted species from `pool` at a level in its range, fighting at its own or the pool's handicap. */
function rollFoe(pool: FoePool, rng: RNG): FrozenRouteFoe {
  const entry = pickWeighted(pool.pool, rng);
  const level = rng.int(pool.min, pool.max);
  return mintFoe({ dexId: entry.dexId, level, rare: Boolean(entry.rare), statMult: entry.statMult ?? pool.statMult, rng });
}

const quiet = (kind: RouteFind['kind'], extra: Partial<RouteFind> = {}): RouteFind =>
  ({ kind, foe: null, npc: null, items: [], money: 0, landmarks: [], ...extra });

function rollExplore(rng: RNG, { honeyTreeFound, inventory, rules }: { honeyTreeFound: boolean; inventory: InventoryState; rules: RouteRules }): RouteFind {
  if (guaranteesSupplies(inventory)) return quiet('item', { items: [{ itemId: 'poke', quantity: rules.pokeBundleQuantity }] });
  const outcomes: { outcome: 'nothing' | 'item' | 'rare' | 'secret'; weight: number }[] = [
    { outcome: 'nothing', weight: rules.explore.nothing },
    { outcome: 'item', weight: rules.explore.item },
    { outcome: 'rare', weight: rules.explore.rare + (honeyTreeFound ? rules.explore.secret : 0) },
    { outcome: 'secret', weight: honeyTreeFound ? 0 : rules.explore.secret },
  ];
  const { outcome } = pickWeighted(outcomes.filter((o) => o.weight > 0), rng);
  if (outcome === 'nothing') return quiet('nothing');
  if (outcome === 'secret') return quiet('secret', { questId: 'honey-tree' });
  if (outcome === 'rare') return { ...quiet('wild'), foe: rollFoe(rules.exploreRares, rng) };
  const { items, money } = pickWeighted(rules.exploreItems, rng);
  return quiet('item', { items: items.map((item) => ({ ...item })), money });
}

/** One seeded find for a search. Events stored under rules v2 and v3 are never re-rolled. */
export function rollRouteFind({ seed, kind, honeyTreeFound = false, inventory, rules = ROUTE_RULES }: {
  seed: string;
  kind: SearchKind;
  /** Explore's secret is the Honey Tree until the trainer finds it. */
  honeyTreeFound?: boolean;
  inventory: InventoryState;
  rules?: RouteRules;
}): RouteFind {
  if (kind === 'wild') return { ...quiet('wild'), foe: rollFoe(rules.wild, new RNG(`${STREAM}:${seed}:find`)) };
  if (kind === 'trainer') {
    const rng = new RNG(`${STREAM}:${seed}:find`);
    const { dexId, ...npc } = rng.pick(TRAINERS);
    return { ...quiet('trainer'), npc, foe: mintFoe({ dexId, level: rules.trainerLevel, rare: false, statMult: rules.trainerStatMult, rng }) };
  }
  if (kind === 'forage') {
    const { itemId } = pickWeighted(rules.forage, new RNG(`${STREAM_V4}:${seed}:forage`));
    return quiet('item', { items: [{ itemId, quantity: 1 }] });
  }
  if (kind === 'explore') return rollExplore(new RNG(`${STREAM_V4}:${seed}:explore`), { honeyTreeFound, inventory, rules });
  if (kind === 'puzzle') {
    const rng = new RNG(`${STREAM_V4}:${seed}:puzzle`);
    const scene = rng.pick(rules.puzzle.scenes);
    const { items } = pickWeighted(rules.puzzle.rewards, rng);
    const board = generatePuzzle(`${STREAM_V4}:${seed}:board`, rules.puzzle);
    return quiet('puzzle', { puzzle: { size: rules.puzzle.size, board, scene, reward: items.map((item) => ({ ...item })) } });
  }
  throw new Error(`Unsupported search kind ${kind}`);
}

export function legalChoices(phase: RoutePhase): RouteChoice[] {
  switch (phase) {
    case 'wild': return ['battle', 'catch', 'leave'];
    case 'catch': return ['catch', 'leave'];
    case 'trainer': return ['battle', 'leave'];
    case 'researcher': return ['accept', 'decline', 'talk'];
    case 'puzzle': return ['solve', 'leave'];
    case 'resolved': return [];
  }
}

export function captureChance({ rare, wonBattle, ballId, rules = ROUTE_RULES }: {
  rare: boolean; wonBattle: boolean; ballId: CaptureBallId; rules?: StoredRouteRules;
}): number {
  if (!isCaptureBallId(ballId)) throw new Error('Unsupported capture ball');
  const base = rare ? rules.rareCatchChance : rules.basicCatchChance;
  // Round the displayed probability so 35% + 20% + 20% remains exactly 75%.
  return Math.min(rules.maxCatchChance, Math.round((base + (wonBattle ? rules.battleCatchBonus : 0)
    + (ballId === 'great' ? rules.greatCatchBonus : 0)) * 10_000) / 10_000);
}

export function rollCapture({ seed, rare, wonBattle, ballId, rules = ROUTE_RULES }: {
  seed: string; rare: boolean; wonBattle: boolean; ballId: CaptureBallId; rules?: StoredRouteRules;
}): boolean {
  return new RNG(`${STREAM}:${seed}:catch`).chance(captureChance({ rare, wonBattle, ballId, rules }));
}

export function simulateRouteBattle({ party, foe, seed }: {
  party: readonly OwnedMon[]; foe: FrozenRouteFoe; seed: string;
}): RouteBattle {
  // Fainted members sit out; the rest fight at the HP they carry.
  const fielded = party.filter((m) => !isFainted(m));
  const player = partyCreatures(fielded);
  const opponent = ownedMonToCreature({ ...foe.mint, id: 'route-foe', exp: 0, origin: 'catch', caughtAt: 0 });
  if (!opponent || player.length === 0 || player.length !== fielded.length) throw new Error('Invalid route battle participants');
  const battle = simulateBattle(player, [opponent], `route:${seed}:battle`, { foeStatMult: foe.statMult, playerStartHp: fielded.map(currentHp) });
  return {
    won: battle.winner === 'player', turns: battle.turns, events: battle.events,
    fielded: fielded.map((m, i) => ({ id: m.id, hp: battle.playerHp[i], maxHp: ownedMaxHp(m) })),
  };
}
