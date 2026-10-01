import { isDeepStrictEqual } from 'node:util';
import { ownedMonToCreature, type OwnedMon } from '../src/game/box.js';
import { ballCount, formatMoney, isCaptureBallId, isItemId, itemById, itemQuantity, tradeTotal, VALUABLE_ITEMS } from '../src/game/items.js';
import { starterFromOffer } from '../src/game/professions.js';
import {
  allowanceView, battlePrize, captureChance, guaranteesSupplies, legalChoices, projectAllowance, rollCapture,
  rollRouteFind, ROUTE_RULES, simulateRouteBattle, spendAllowance, wildAreas,
} from '../src/game/route-rules.js';
import type { CaptureBallId, InventoryState, RouteRules, RouteRulesV2 } from '../src/game/route-actions.js';
import { measureRouteBalance } from './route-balance.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b);

/** A rules value frozen before the market: the v3 fields are absent. */
function legacyRulesV2(): RouteRulesV2 {
  const rest: Partial<RouteRules> = { ...ROUTE_RULES };
  delete rest.itemFinds; delete rest.harvest; delete rest.pouchMoney;
  delete rest.wildMoney; delete rest.trainerMoney; delete rest.questMoney;
  return { ...(rest as Omit<RouteRules, 'itemFinds' | 'harvest' | 'pouchMoney' | 'wildMoney' | 'trainerMoney' | 'questMoney' | 'version'>), version: 2, pokeBundleChance: 0.75 };
}

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

const stocked: InventoryState = { revision: 1, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }] };
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
const itemsOnly = (finds: RouteRules['itemFinds']): RouteRules => ({ ...ROUTE_RULES, exploreWildChance: 0, exploreNpcChance: 0, itemFinds: finds });
const zero = { poke: 0, great: 0, harvest: 0, pouch: 0 };
const pokes = rollRouteFind({ ...findBase, seed: 'test-0', kind: 'explore', rules: itemsOnly({ ...zero, poke: 1 }) });
check('a Poké Ball find grants three Poké Balls and no money', pokes.kind === 'item' && same(pokes.items, [{ itemId: 'poke', quantity: 3 }]) && pokes.money === 0 && pokes.foe === null);
const great = rollRouteFind({ ...findBase, seed: 'test-23', kind: 'explore', rules: itemsOnly({ ...zero, great: 1 }) });
check('a Great Ball find includes its independent landmark discovery', great.kind === 'item' && same(great.items, [{ itemId: 'great', quantity: 1 }]) && same(great.landmarks, ['sunflowers']));
const pouch = rollRouteFind({ ...findBase, seed: 'test-5', kind: 'explore', rules: itemsOnly({ ...zero, pouch: 1 }) });
check('a coin pouch pays ₽300 and grants no item', pouch.kind === 'item' && same(pouch.items, []) && pouch.money === 300);
const mushroom = rollRouteFind({ ...findBase, seed: 'test-5', kind: 'explore', rules: { ...itemsOnly({ ...zero, harvest: 1 }), harvest: [{ itemId: 'big-mushroom', weight: 1 }] } });
check('a harvest find grants one valuable from the harvest table', same(mushroom.items, [{ itemId: 'big-mushroom', quantity: 1 }]) && mushroom.money === 0);
const finds = Array.from({ length: 2000 }, (_, i) => rollRouteFind({ ...findBase, seed: `items-${i}`, kind: 'explore', rules: itemsOnly(ROUTE_RULES.itemFinds) }));
const share = (test: (f: (typeof finds)[number]) => boolean) => finds.filter(test).length / finds.length;
check('item finds follow 50/15/20/15 within 3 points', Math.abs(share((f) => f.items[0]?.itemId === 'poke') - 0.5) < 0.03
  && Math.abs(share((f) => f.items[0]?.itemId === 'great') - 0.15) < 0.03
  && Math.abs(share((f) => f.money === 300) - 0.15) < 0.03
  && Math.abs(share((f) => VALUABLE_ITEMS.some((v) => v.id === f.items[0]?.itemId)) - 0.2) < 0.03);
check('Big Mushroom is the rarest harvest good', share((f) => f.items[0]?.itemId === 'big-mushroom') < share((f) => f.items[0]?.itemId === 'tiny-mushroom') && share((f) => f.items[0]?.itemId === 'tiny-mushroom') < share((f) => f.items[0]?.itemId === 'honey'));
check('rules v3 leave wild rolls on the version 2 stream', wild.foe?.mint.dexId === 401 && wild.foe.mint.level === 2);
const broke: InventoryState = { revision: 2, money: 199, stacks: [] };
const resupply = rollRouteFind({ ...findBase, inventory: broke, seed: 'test-3', kind: 'explore' });
check('no balls and under ₽200 guarantees three Poké Balls with the normal landmark roll', resupply.kind === 'item' && same(resupply.items, [{ itemId: 'poke', quantity: 3 }]) && same(resupply.landmarks, ['sunflowers']));
check('no balls but ₽200 rolls normal Explore categories', rollRouteFind({ ...findBase, inventory: { ...broke, money: 200 }, seed: 'test-3', kind: 'explore' }).kind === 'wild');
check('guarantee helper needs both no balls and under one ball’s price', guaranteesSupplies(broke) && !guaranteesSupplies({ ...broke, money: 200 }) && !guaranteesSupplies({ ...broke, stacks: [{ itemId: 'poke', quantity: 1 }] }));
check('valuables do not count as capture supplies', ballCount({ revision: 1, money: 0, stacks: [{ itemId: 'honey', quantity: 9 }] }) === 0);
check('having only a Great Ball is enough to use normal Explore categories', rollRouteFind({ ...findBase, inventory: { revision: 2, money: 0, stacks: [{ itemId: 'great', quantity: 1 }] }, seed: 'test-3', kind: 'explore' }).kind === 'wild');
check('empty Bag does not convert a wild search to supplies', rollRouteFind({ ...findBase, inventory: { revision: 2, money: 0, stacks: [] }, seed: 'test-3', kind: 'wild' }).kind === 'wild');
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
check('all five market items are known; cosmetic balls are not', ['poke', 'great', 'honey', 'tiny-mushroom', 'big-mushroom'].every(isItemId) && !isItemId('master') && !isItemId('money'));
check('valuables are not capture balls', !isCaptureBallId('honey') && itemById('honey')?.category === 'valuable');
for (const [itemId, side, quantity, expected] of [
  ['poke', 'buy', 3, 600], ['poke', 'sell', 5, 500], ['great', 'buy', 1, 600], ['great', 'sell', 2, 600],
  ['honey', 'sell', 1, 150], ['tiny-mushroom', 'sell', 2, 500], ['big-mushroom', 'sell', 99, 99_000],
  ['honey', 'buy', 1, null], ['poke', 'buy', 0, null], ['poke', 'buy', 100, null], ['poke', 'buy', 1.5, null],
  ['poke', 'buy', '3', null], ['poke', 'steal', 1, null], ['master', 'buy', 1, null],
] as const) {
  check(`trade total ${itemId} ${side} ×${String(quantity)} is ${String(expected)}`, tradeTotal(itemId, side, quantity) === expected);
}
check('money formats with a ₽ sign and thousands separator', formatMoney(1200) === '₽1,200' && formatMoney(0) === '₽0');
check('wild and trainer wins pay ₽100 and ₽200 under rules v3', battlePrize('wild', ROUTE_RULES) === 100 && battlePrize('trainer', ROUTE_RULES) === 200 && battlePrize('researcher', ROUTE_RULES) === 0);
const legacyRules = legacyRulesV2();
check('encounters frozen under rules v2 pay no prize money', battlePrize('wild', legacyRules) === 0 && battlePrize('trainer', legacyRules) === 0);
check('v2 frozen rules still compute catch chances', captureChance({ rare: false, wonBattle: true, ballId: 'great', rules: legacyRules }) === 0.95);
check('inventory only counts supported persisted stacks', itemQuantity(stocked, 'poke') === 20 && itemQuantity(stocked, 'great') === 0 && ballCount(stocked) === 20);
check('zero-count stacks do not count as capture supplies', ballCount({ revision: 2, money: 0, stacks: [{ itemId: 'poke', quantity: 0 }, { itemId: 'great', quantity: 0 }] }) === 0);
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
  ...findBase, inventory: { revision: 3, money: 0, stacks: [] }, seed: 'frozen-supplies', kind: 'explore',
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

// The Pokédex's Area tab must list exactly what the route can spawn, with the same rarity.
const spawned = new Map<number, boolean>();
for (let i = 0; i < 400; i++) {
  const find = rollRouteFind({ seed: `area-${i}`, kind: 'wild', knownLandmarks: [], questClaimed: true, inventory: { revision: 0, money: 0, stacks: [{ itemId: 'poke', quantity: 5 }] } });
  if (find.foe) spawned.set(find.foe.view.dexId, find.foe.view.rare);
}
check('every wild spawn is listed in the Pokédex with its rarity', spawned.size > 0
  && [...spawned].every(([dexId, rare]) => same(wildAreas(dexId), [{ name: 'Route 1 · Sunny Meadow', rare }])));
check('a species that never spawns has no wild area', wildAreas(25).length === 0 && !spawned.has(25));

for (const row of measureRouteBalance()) {
  check(`${row.name} fresh starter wins ≥75% weighted wild / ≥60% each trainer over 200 seeds`, row.wild >= 75 && row.scout >= 60 && row.youngster >= 60);
}
console.log(`Route rules: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
