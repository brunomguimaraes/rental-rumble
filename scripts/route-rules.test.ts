import { isDeepStrictEqual } from 'node:util';
import { ownedMonToCreature, type OwnedMon } from '../src/game/box.js';
import { ballCount, isCaptureBallId, itemById, itemQuantity } from '../src/game/items.js';
import { starterFromOffer } from '../src/game/professions.js';
import {
  allowanceView, captureChance, legalChoices, projectAllowance, rollCapture,
  rollRouteFind, ROUTE_RULES, simulateRouteBattle, spendAllowance,
} from '../src/game/route-rules.js';
import type { CaptureBallId, InventoryState } from '../src/game/route-actions.js';
import { measureRouteBalance } from './route-balance.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b);

// The new allowance is permission to search, independent of legacy elapsed-time rewards.
const empty = { available: 0, refilledAt: 1_000 };
check('9:59 has no action and preserves the cursor', same(projectAllowance(empty, 600_000), empty));
check('10:00 replenishes one action', same(projectAllowance(empty, 601_000), { available: 1, refilledAt: 601_000 }));
check('a partial interval survives spending', same(spendAllowance({ available: 3, refilledAt: 1_000 }, 1_501_000), { available: 4, refilledAt: 1_201_000 }));
check('next refill reflects the preserved partial interval', allowanceView({ available: 4, refilledAt: 1_201_000 }, 1_501_000).nextRefillAt === 1_801_000);
check('empty bank refuses a spend before refill', spendAllowance(empty, 600_000) === null);
check('a replenished final action can be spent', same(spendAllowance(empty, 601_000), { available: 0, refilledAt: 601_000 }));
check('long absence caps accrual without overflow', same(projectAllowance(empty, 100_001_000), { available: 48, refilledAt: 100_001_000 }));
check('spending from full discards partial and overflow time', same(spendAllowance({ available: 48, refilledAt: 1_000 }, 900_001), { available: 47, refilledAt: 900_001 }));
check('spending after newly reaching capacity also discards partial time', same(spendAllowance({ available: 47, refilledAt: 1_000 }, 900_001), { available: 47, refilledAt: 900_001 }));
check('after spending a full bank the next refill takes ten minutes', allowanceView({ available: 47, refilledAt: 900_001 }, 900_001).nextRefillAt === 1_500_001);
check('full allowance has no next refill countdown', allowanceView({ available: 48, refilledAt: 1_000 }, 2_000).nextRefillAt === null);
check('backward clock cannot create actions or move a partial cursor backward', same(projectAllowance({ available: 3, refilledAt: 5_000 }, 2_000), { available: 3, refilledAt: 5_000 }));
check('backward clock while full cannot move the spend cursor backward', same(spendAllowance({ available: 48, refilledAt: 5_000 }, 2_000), { available: 47, refilledAt: 5_000 }));
check('projection and spend leave their input unchanged', same(empty, { available: 0, refilledAt: 1_000 }));

const stocked: InventoryState = { revision: 1, stacks: [{ itemId: 'poke', quantity: 20 }] };
const findBase = { knownLandmarks: [], questClaimed: false, inventory: stocked };
const wild = rollRouteFind({ ...findBase, seed: 'test-0', kind: 'wild' });
check('seeded wild retains a complete individual, including emotion and unhandicapped stats', same(wild.foe?.mint, {
  dexId: 401, level: 2, sign: 'cancer', ability: 'swarm', shiny: false, altColor: false, emotion: 'Normal',
  stats: { hp: 3, atk: 2, eatk: 2, def: 3, edef: 4, spd: 2 },
}));
check('same search seed replays exactly', same(wild, rollRouteFind({ ...findBase, seed: 'test-0', kind: 'wild' })));
const meadow = rollRouteFind({ ...findBase, seed: 'test-3', kind: 'explore' });
check('Explore can find a wild and a new landmark together', meadow.kind === 'wild' && meadow.foe?.mint.dexId === 187 && same(meadow.landmarks, ['sunflowers']));
const youngster = rollRouteFind({ ...findBase, seed: 'test-4', kind: 'explore' });
check('Explore can find Youngster and their single Zigzagoon', youngster.kind === 'trainer' && youngster.npc?.id === 'youngster' && youngster.foe?.mint.dexId === 263);
const scout = rollRouteFind({ ...findBase, seed: 'test-4', kind: 'npc' });
check('Find NPC can find Meadow Scout and their single Pidgey', scout.kind === 'trainer' && scout.npc?.id === 'meadow-scout' && scout.foe?.mint.dexId === 16);
const researcher = rollRouteFind({ ...findBase, seed: 'test-6', kind: 'explore' });
check('Explore can find the researcher with no battle foe', researcher.kind === 'researcher' && researcher.npc?.id === 'researcher' && researcher.foe === null);
const pokes = rollRouteFind({ ...findBase, seed: 'test-0', kind: 'explore' });
check('seeded supply find grants three Poké Balls', pokes.kind === 'item' && same(pokes.items, [{ itemId: 'poke', quantity: 3 }]) && pokes.foe === null);
const great = rollRouteFind({ ...findBase, seed: 'test-23', kind: 'explore' });
check('seeded Great Ball supply includes its landmark discovery', great.kind === 'item' && same(great.items, [{ itemId: 'great', quantity: 1 }]) && same(great.landmarks, ['sunflowers']));
const resupply = rollRouteFind({ ...findBase, inventory: { revision: 2, stacks: [] }, seed: 'test-3', kind: 'explore' });
check('empty Bag guarantees three Poké Balls while keeping the normal landmark roll', resupply.kind === 'item' && same(resupply.items, [{ itemId: 'poke', quantity: 3 }]) && same(resupply.landmarks, ['sunflowers']));
check('having only a Great Ball is enough to use normal Explore categories', rollRouteFind({ ...findBase, inventory: { revision: 2, stacks: [{ itemId: 'great', quantity: 1 }] }, seed: 'test-3', kind: 'explore' }).kind === 'wild');
check('empty Bag does not convert a wild search to supplies', rollRouteFind({ ...findBase, inventory: { revision: 2, stacks: [] }, seed: 'test-3', kind: 'wild' }).kind === 'wild');
check('known landmarks are never rediscovered', !rollRouteFind({ ...findBase, knownLandmarks: ['sunflowers'], seed: 'test-3', kind: 'explore' }).landmarks.includes('sunflowers'));
check('fully surveyed route grants no repeat landmark rewards', same(rollRouteFind({ ...findBase, knownLandmarks: ['signpost', 'sunflowers', 'hilltop-oak'], seed: 'test-3', kind: 'explore' }).landmarks, []));
check('claiming the survey leaves Find NPC selecting trainers only', Array.from({ length: 100 }, (_, i) => rollRouteFind({ ...findBase, questClaimed: true, seed: `npc-${i}`, kind: 'npc' })).every((find) => find.kind === 'trainer'));
const rare = rollRouteFind({ ...findBase, seed: 'test-12', kind: 'wild' });
check('seeded Eevee remains a rare encounter', rare.foe?.view.rare === true && rare.foe.mint.dexId === 133 && rare.foe.mint.level === 4);
const alt = rollRouteFind({ ...findBase, seed: 'test-13', kind: 'wild' });
check('alternate identity is frozen in the view and mint', alt.foe?.view.altColor === true && alt.foe.mint.altColor && !alt.foe.mint.shiny);
const shiny = rollRouteFind({ ...findBase, seed: 'test-1248', kind: 'wild' });
check('shiny identity is frozen in the view and mint', shiny.foe?.view.shiny === true && shiny.foe.mint.shiny && !shiny.foe.mint.altColor);

check('cosmetic balls are rejected as usable items', itemById('master') === null && itemById('ultra') === null && !isCaptureBallId('master'));
check('inventory only counts supported persisted stacks', itemQuantity(stocked, 'poke') === 20 && itemQuantity(stocked, 'great') === 0 && ballCount(stocked) === 20);
check('zero-count stacks do not count as capture supplies', ballCount({ revision: 2, stacks: [{ itemId: 'poke', quantity: 0 }, { itemId: 'great', quantity: 0 }] }) === 0);
for (const [rareSpecies, wonBattle, ballId, expected] of [
  [false, false, 'poke', 0.6], [false, true, 'poke', 0.8], [true, false, 'poke', 0.35], [true, true, 'poke', 0.55],
  [false, false, 'great', 0.8], [false, true, 'great', 0.95], [true, false, 'great', 0.55], [true, true, 'great', 0.75],
] as const) {
  check(`${ballId} ${rareSpecies ? 'rare' : 'common'} ${wonBattle ? 'after win' : 'before battle'} chance`, captureChance({ rare: rareSpecies, wonBattle, ballId }) === expected);
}
check('seeded throw succeeds', rollCapture({ seed: 'test-0', rare: false, wonBattle: false, ballId: 'poke' }));
check('seeded throw fails', !rollCapture({ seed: 'test-3', rare: false, wonBattle: false, ballId: 'poke' }));
let unsupportedBallRejected = false;
try { captureChance({ rare: false, wonBattle: false, ballId: 'master' as CaptureBallId }); }
catch { unsupportedBallRejected = true; }
check('capture rule does not turn an unsupported cosmetic ball into a basic throw', unsupportedBallRejected);
check('wild choices allow exactly one initial battle or catch decision', same(legalChoices('wild'), ['battle', 'catch', 'leave']));
check('post-win catch phase cannot battle again', same(legalChoices('catch'), ['catch', 'leave']));
check('trainers cannot be caught', same(legalChoices('trainer'), ['battle', 'leave']));
check('researcher has dialogue choices only', same(legalChoices('researcher'), ['accept', 'decline', 'talk']));
check('settled encounter accepts no further choice', same(legalChoices('resolved'), []));

// Events use their persisted configuration even if the live defaults are rebalanced later.
const frozenRules = { ...ROUTE_RULES, capacity: 5, refillEveryMs: 1_000, basicCatchChance: 0.1, greatCatchBonus: 0.3 };
check('allowance projection respects its explicit configuration', same(projectAllowance({ available: 1, refilledAt: 1_000 }, 4_000, frozenRules), { available: 4, refilledAt: 4_000 }));
check('capture respects frozen bonuses and probabilities', captureChance({ rare: false, wonBattle: true, ballId: 'great', rules: frozenRules }) === 0.6);
check('supply quantity comes from the frozen search rules', same(rollRouteFind({
  ...findBase, inventory: { revision: 3, stacks: [] }, seed: 'frozen-supplies', kind: 'explore',
  rules: { ...ROUTE_RULES, pokeBundleQuantity: 7 },
}).items, [{ itemId: 'poke', quantity: 7 }]));

const starterMint = starterFromOffer('route-balance:10:0:4', 10);
if (!starterMint || !wild.foe) throw new Error('Pinned battle fixture is unavailable');
const mon: OwnedMon = { ...starterMint, id: 'starter', exp: 0, origin: 'starter', caughtAt: 0 };
const beforeBattle = JSON.stringify({ mon, foe: wild.foe });
const battle = simulateRouteBattle({ party: [mon], foe: wild.foe, seed: 'rules-battle' });
check('server battle emits a deterministic replay', same(battle, simulateRouteBattle({ party: [mon], foe: wild.foe, seed: 'rules-battle' })) && battle.events.length > 0);
check('battle leaves the frozen mint and party unchanged', beforeBattle === JSON.stringify({ mon, foe: wild.foe }));
const caught: OwnedMon = { ...wild.foe.mint, id: 'new-catch', exp: 0, origin: 'catch', caughtAt: 2_000 };
check('minting keeps the battle handicap out of owned stats', same(caught.stats, { hp: 3, atk: 2, eatk: 2, def: 3, edef: 4, spd: 2 }) && ownedMonToCreature(caught)?.stats.hp === 8);
check('minting keeps the encountered emotion portrait', ownedMonToCreature(caught)?.portrait.includes('Normal') === true);
let emptyPartyRejected = false;
try { simulateRouteBattle({ party: [], foe: wild.foe, seed: 'empty-party' }); }
catch { emptyPartyRejected = true; }
check('an empty party cannot resolve a battle', emptyPartyRejected);

for (const row of measureRouteBalance()) {
  check(`${row.name} fresh starter wins ≥75% weighted wild / ≥60% each trainer over 200 seeds`, row.wild >= 75 && row.scout >= 60 && row.youngster >= 60);
}
console.log(`Route rules: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
