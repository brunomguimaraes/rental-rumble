import { isDeepStrictEqual } from 'node:util';
import { ownedMonToCreature, type OwnedMon } from '../src/game/box.js';
import { creatureMaxHp, simulateBattle, type BattleResult } from '../src/game/battle.js';
import { ballCount, formatMoney, isCaptureBallId, isItemId, itemById, itemQuantity, tradeTotal } from '../src/game/items.js';
import { currentHp, hpTone, isFainted, ownedMaxHp, partyStanding } from '../src/game/health.js';
import { starterFromOffer } from '../src/game/professions.js';
import {
  allowanceView, battlePrize, captureChance, guaranteesSupplies, legalChoices, projectAllowance, rollCapture,
  rollRouteFind, ROUTE_RULES, simulateRouteBattle, spendAllowance, wildAreas,
} from '../src/game/route-rules.js';
import type { CaptureBallId, InventoryState, RouteRules, RouteRulesV2, RouteRulesV3 } from '../src/game/route-actions.js';
import { isSolved } from '../src/game/sliding-puzzle.js';
import { balanceFailures, measureRouteBalance, routeOpponents } from './route-balance.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b);

/** The rules frozen into encounters started under the market (v3), before the action board. */
function legacyRulesV3(): RouteRulesV3 {
  return {
    version: 3, capacity: 48, initialActions: 12, refillEveryMs: 600_000, starterBalls: 20,
    wild: { min: 2, max: 5, statMult: 0.6, pool: [...ROUTE_RULES.wild.pool, { dexId: 133, weight: 1, rare: true }] },
    recommended: { min: 3, max: 8 }, wildExp: 30, trainerExp: 50, trainerLevel: 5, trainerStatMult: 0.6,
    npcTrainerChance: 0.7, exploreWildChance: 0.45, exploreNpcChance: 0.3, landmarkChance: 0.5,
    pokeBundleQuantity: 3, greatBundleQuantity: 1, questGreatBalls: 3,
    basicCatchChance: 0.6, rareCatchChance: 0.35, battleCatchBonus: 0.2, greatCatchBonus: 0.2, maxCatchChance: 0.95,
    itemFinds: { poke: 50, great: 15, harvest: 20, pouch: 15 },
    harvest: [{ itemId: 'honey', weight: 6 }, { itemId: 'tiny-mushroom', weight: 3 }, { itemId: 'big-mushroom', weight: 1 }],
    pouchMoney: 300, wildMoney: 100, trainerMoney: 200, questMoney: 500,
  };
}
/** A rules value frozen before the market: the v3 fields are absent. */
function legacyRulesV2(): RouteRulesV2 {
  const rest: Partial<RouteRulesV3> = legacyRulesV3();
  delete rest.itemFinds; delete rest.harvest; delete rest.pouchMoney;
  delete rest.wildMoney; delete rest.trainerMoney; delete rest.questMoney;
  return { ...(rest as Omit<RouteRulesV3, 'itemFinds' | 'harvest' | 'pouchMoney' | 'wildMoney' | 'trainerMoney' | 'questMoney' | 'version'>), version: 2, pokeBundleChance: 0.75 };
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
check('a spend can cost more than one action', same(spendAllowance({ available: 3, refilledAt: 1_000 }, 2_000, ROUTE_RULES, 2), { available: 1, refilledAt: 1_000 }));

const stocked: InventoryState = { revision: 1, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }] };
const findBase = { inventory: stocked };
const wild = rollRouteFind({ ...findBase, seed: 'test-0', kind: 'wild' });
check('seeded wild retains a complete individual, including emotion and unhandicapped stats', same(wild.foe?.mint, {
  dexId: 401, level: 2, sign: 'cancer', ability: 'swarm', shiny: false, altColor: false, emotion: 'Normal',
  stats: { hp: 3, atk: 2, eatk: 2, def: 3, edef: 4, spd: 2 },
}));
check('the public foe view carries the frozen sign', wild.foe?.view.sign === 'cancer');
check('same search seed replays exactly', same(wild, rollRouteFind({ ...findBase, seed: 'test-0', kind: 'wild' })));
check('rules v4 keep wild rolls on the version 2 stream', wild.foe?.mint.dexId === 401 && wild.foe.mint.level === 2);
const wilds = Array.from({ length: 2000 }, (_, i) => rollRouteFind({ ...findBase, seed: `wild-${i}`, kind: 'wild' }));
check('wild searches meet only the common pool, without Eevee', wilds.every((f) => f.kind === 'wild'
  && ROUTE_RULES.wild.pool.some((e) => e.dexId === f.foe?.mint.dexId) && f.foe?.mint.dexId !== 133 && f.foe?.view.rare !== true));

const trainerDex: Record<string, number> = { 'meadow-scout': 16, youngster: 263, lass: 191, 'bug-catcher': 401 };
const trainers = Array.from({ length: 200 }, (_, i) => rollRouteFind({ ...findBase, seed: `trainer-${i}`, kind: 'trainer' }));
check('a trainer search always meets a trainer with their own Pokémon at hidden level 5, ×0.6', trainers.every((f) => f.kind === 'trainer'
  && f.npc !== null && f.foe?.mint.dexId === trainerDex[f.npc.id] && f.foe?.mint.level === 5 && f.foe?.statMult === 0.6 && f.foe?.view.rare === false));
check('all four trainers turn up', new Set(trainers.map((f) => f.npc?.id)).size === 4);

const forage = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `forage-${i}`, kind: 'forage' }));
const forageShare = (itemId: string) => forage.filter((f) => f.items[0]?.itemId === itemId).length / forage.length;
check('forage always finds exactly one meadow good and no ₽', forage.every((f) => f.kind === 'item' && f.items.length === 1 && f.items[0].quantity === 1 && f.money === 0 && f.foe === null));
check('forage finds Honey 60%, Tiny Mushroom 30%, Big Mushroom 10% within 3 points',
  Math.abs(forageShare('honey') - 0.6) < 0.03 && Math.abs(forageShare('tiny-mushroom') - 0.3) < 0.03 && Math.abs(forageShare('big-mushroom') - 0.1) < 0.03);

const exploreOnly = (weights: Partial<RouteRules['explore']>): RouteRules => ({ ...ROUTE_RULES, explore: { nothing: 0, item: 0, rare: 0, secret: 0, ...weights } });
const nothing = rollRouteFind({ ...findBase, seed: 'quiet', kind: 'explore', rules: exploreOnly({ nothing: 1 }) });
check('Explore can find nothing at all', nothing.kind === 'nothing' && nothing.items.length === 0 && nothing.money === 0 && nothing.foe === null && nothing.npc === null);
const secret = rollRouteFind({ ...findBase, seed: 'secret', kind: 'explore', rules: exploreOnly({ secret: 1 }) });
check('Explore can uncover the Honey Tree', secret.kind === 'secret' && secret.questId === 'honey-tree' && secret.foe === null);
const afterTree = rollRouteFind({ ...findBase, seed: 'secret', kind: 'explore', honeyTreeFound: true, rules: exploreOnly({ secret: 1 }) });
check('once the Honey Tree is found its share goes to rare Pokémon', afterTree.kind === 'wild' && afterTree.foe?.view.rare === true);
const rares = Array.from({ length: 300 }, (_, i) => rollRouteFind({ ...findBase, seed: `rare-${i}`, kind: 'explore', rules: exploreOnly({ rare: 1 }) }));
check('Explore rares are Eevee, Pikachu or Ralts, marked rare, hidden level 2–5 at ×0.6', rares.every((f) => f.kind === 'wild'
  && [133, 25, 280].includes(f.foe?.mint.dexId ?? 0) && f.foe?.view.rare === true && (f.foe?.mint.level ?? 0) >= 2 && (f.foe?.mint.level ?? 9) <= 5 && f.foe?.statMult === 0.6));
check('every Explore rare turns up', new Set(rares.map((f) => f.foe?.mint.dexId)).size === 3);
const finds = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `items-${i}`, kind: 'explore', rules: exploreOnly({ item: 1 }) }));
const findShare = (test: (f: (typeof finds)[number]) => boolean) => finds.filter(test).length / finds.length;
check('rare items are 2 Great Balls 50%, a Big Mushroom 30%, a ₽500 pouch 20% within 3 points',
  Math.abs(findShare((f) => same(f.items, [{ itemId: 'great', quantity: 2 }]) && f.money === 0) - 0.5) < 0.03
  && Math.abs(findShare((f) => same(f.items, [{ itemId: 'big-mushroom', quantity: 1 }]) && f.money === 0) - 0.3) < 0.03
  && Math.abs(findShare((f) => f.items.length === 0 && f.money === 500) - 0.2) < 0.03);
const explores = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `explore-${i}`, kind: 'explore' }));
const exploreShare = (kind: string) => explores.filter((f) => f.kind === kind).length / explores.length;
check('Explore finds nothing 35%, an item 35%, a rare 20%, the secret 10% within 3 points',
  Math.abs(exploreShare('nothing') - 0.35) < 0.03 && Math.abs(exploreShare('item') - 0.35) < 0.03
  && Math.abs(exploreShare('wild') - 0.2) < 0.03 && Math.abs(exploreShare('secret') - 0.1) < 0.03);
check('Explore records no landmarks under rules v4', explores.every((f) => f.landmarks.length === 0));
const broke: InventoryState = { revision: 2, money: 199, stacks: [] };
const resupply = rollRouteFind({ ...findBase, inventory: broke, seed: 'test-3', kind: 'explore' });
check('no balls and under ₽200 guarantees three Poké Balls', resupply.kind === 'item' && same(resupply.items, [{ itemId: 'poke', quantity: 3 }]) && resupply.money === 0);
check('no balls but ₽200 explores as usual', same(rollRouteFind({ ...findBase, inventory: { ...broke, money: 200 }, seed: 'test-3', kind: 'explore' }), rollRouteFind({ ...findBase, seed: 'test-3', kind: 'explore' })));
check('guarantee helper needs both no balls and under one ball’s price', guaranteesSupplies(broke) && !guaranteesSupplies({ ...broke, money: 200 }) && !guaranteesSupplies({ ...broke, stacks: [{ itemId: 'poke', quantity: 1 }] }));
check('valuables do not count as capture supplies', ballCount({ revision: 1, money: 0, stacks: [{ itemId: 'honey', quantity: 9 }] }) === 0);
check('a single Great Ball is enough to explore as usual', same(rollRouteFind({ ...findBase, inventory: { revision: 2, money: 0, stacks: [{ itemId: 'great', quantity: 1 }] }, seed: 'test-3', kind: 'explore' }), rollRouteFind({ ...findBase, seed: 'test-3', kind: 'explore' })));
check('an empty Bag does not turn a wild search into supplies', rollRouteFind({ ...findBase, inventory: { revision: 2, money: 0, stacks: [] }, seed: 'test-3', kind: 'wild' }).kind === 'wild');
const alt = rollRouteFind({ ...findBase, seed: 'test-13', kind: 'wild' });
check('alternate identity is frozen in the view and mint', alt.foe?.view.altColor === true && alt.foe.mint.altColor && !alt.foe.mint.shiny);
const shiny = rollRouteFind({ ...findBase, seed: 'test-1248', kind: 'wild' });
check('shiny identity is frozen in the view and mint', shiny.foe?.view.shiny === true && shiny.foe.mint.shiny && !shiny.foe.mint.altColor);

const dealt = rollRouteFind({ ...findBase, seed: 'panel-0', kind: 'puzzle' });
check('a puzzle search deals a scrambled 3×3 board, a meadow scene and a reward', dealt.kind === 'puzzle' && dealt.puzzle?.size === 3
  && dealt.puzzle.board.length === 9 && !isSolved(dealt.puzzle.board) && ROUTE_RULES.puzzle.scenes.includes(dealt.puzzle.scene) && dealt.puzzle.reward.length === 1 && dealt.foe === null);
check('the same puzzle seed deals the same board, scene and reward', same(dealt, rollRouteFind({ ...findBase, seed: 'panel-0', kind: 'puzzle' })));
const deals = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `panel-${i}`, kind: 'puzzle' }).puzzle!);
const rewardShare = (itemId: string, quantity: number) => deals.filter((p) => same(p.reward, [{ itemId, quantity }])).length / deals.length;
check('puzzle rewards are a Great Ball 40%, 3 Poké Balls 30%, a Tiny Mushroom 20%, a Big Mushroom 10% within 3 points',
  Math.abs(rewardShare('great', 1) - 0.4) < 0.03 && Math.abs(rewardShare('poke', 3) - 0.3) < 0.03
  && Math.abs(rewardShare('tiny-mushroom', 1) - 0.2) < 0.03 && Math.abs(rewardShare('big-mushroom', 1) - 0.1) < 0.03);
check('every meadow scene is dealt', new Set(deals.map((p) => p.scene)).size === 4);
check('a puzzle offers a solve or leaving', same(legalChoices('puzzle'), ['solve', 'leave']));

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
check('rules v4 pay ₽0 for a wild win and ₽200 for a trainer win', battlePrize('wild', ROUTE_RULES) === 0 && battlePrize('trainer', ROUTE_RULES) === 200 && battlePrize('researcher', ROUTE_RULES) === 0);
check('encounters frozen under rules v3 still pay ₽100 and ₽200', battlePrize('wild', legacyRulesV3()) === 100 && battlePrize('trainer', legacyRulesV3()) === 200);
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

// Persistent HP: the engine starts a player creature at a given HP and reports where it ended.
const hero = ownedMonToCreature(mon)!;
const foeCreature = ownedMonToCreature({ ...wild.foe.mint, id: 'route-foe', exp: 0, origin: 'catch', caughtAt: 0 })!;
const playerSendout = (r: { events: BattleResult['events'] }) => r.events.find((e) => e.kind === 'sendout' && e.affected === 'player');
const fullBattle = simulateBattle([hero], [foeCreature], 'hp-engine', { foeStatMult: wild.foe.statMult });
check('explicit full start HP replays the default battle exactly', same(fullBattle, simulateBattle([hero], [foeCreature], 'hp-engine', { foeStatMult: wild.foe.statMult, playerStartHp: [creatureMaxHp(hero)] })));
check('send-out max HP is creatureMaxHp', playerSendout(fullBattle)?.maxHp === creatureMaxHp(hero));
check('a player creature sends out at its start HP', playerSendout(simulateBattle([hero], [foeCreature], 'hp-engine', { foeStatMult: wild.foe.statMult, playerStartHp: [3] }))?.hp === 3);
check('final HP is reported per player creature', fullBattle.playerHp.length === 1 && fullBattle.playerHp[0] >= 0 && fullBattle.playerHp[0] <= creatureMaxHp(hero) && (fullBattle.winner === 'foe') === (fullBattle.playerHp[0] === 0));
check('ownedMaxHp matches the battle send-out', playerSendout(battle)?.maxHp === ownedMaxHp(mon));
const shinyMon: OwnedMon = { ...mon, id: 'shiny-starter', shiny: true };
check('shiny ownedMaxHp matches the battle send-out', playerSendout(simulateRouteBattle({ party: [shinyMon], foe: wild.foe, seed: 'rules-battle' }))?.maxHp === ownedMaxHp(shinyMon) && ownedMaxHp(shinyMon) > ownedMaxHp(mon));
check('rows from before persistent HP are at full health', mon.hpLost === undefined && currentHp(mon) === ownedMaxHp(mon) && !isFainted(mon));
check('HP reads healthy above half of max', hpTone(51, 100) === 'healthy' && hpTone(100, 100) === 'healthy' && hpTone(37, 73) === 'healthy');
check('HP reads low at half of max and down to above a fifth', hpTone(50, 100) === 'low' && hpTone(36, 73) === 'low' && hpTone(21, 100) === 'low');
check('HP reads critical at a fifth of max and below, while standing', hpTone(20, 100) === 'critical' && hpTone(14, 73) === 'critical' && hpTone(1, 100) === 'critical');
check('0 HP, or no known max, reads fainted', hpTone(0, 100) === 'fainted' && hpTone(0, 0) === 'fainted');
const hurt: OwnedMon = { ...mon, hpLost: ownedMaxHp(mon) - 2 };
const benched: OwnedMon = { ...mon, id: 'benched', hpLost: ownedMaxHp(mon) };
const benchBattle = simulateRouteBattle({ party: [benched, hurt], foe: wild.foe, seed: 'bench' });
check('fainted members sit out; the hurt member fights at its HP', same(benchBattle.fielded?.map((f) => f.id), [hurt.id]) && playerSendout(benchBattle)?.hp === 2);
check('fielded final HP is the battle’s own', benchBattle.fielded?.[0].maxHp === ownedMaxHp(hurt) && (benchBattle.won ? benchBattle.fielded[0].hp > 0 : benchBattle.fielded?.[0].hp === 0));
let allFaintedRejected = false;
try { simulateRouteBattle({ party: [benched], foe: wild.foe, seed: 'all-fainted' }); }
catch { allFaintedRejected = true; }
check('an all-fainted party cannot battle', allFaintedRejected);
check('a party is standing while any fielded member ends above 0 HP', partyStanding([mon, benched], [{ id: mon.id, hp: 1, maxHp: 20 }]));
check('a double KO leaves no one standing even on a win', !partyStanding([mon, benched], [{ id: mon.id, hp: 0, maxHp: 20 }]));
check('a member that sat out still counts by its stored HP', partyStanding([mon, { ...benched, id: 'rested', hpLost: 0 }], [{ id: mon.id, hp: 0, maxHp: 20 }]));
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
  const find = rollRouteFind({ seed: `area-${i}`, kind: 'wild', inventory: { revision: 0, money: 0, stacks: [{ itemId: 'poke', quantity: 5 }] } });
  if (find.foe) spawned.set(find.foe.view.dexId, find.foe.view.rare);
}
check('every wild spawn is listed in the Pokédex with its rarity', spawned.size > 0
  && [...spawned].every(([dexId, rare]) => same(wildAreas(dexId), [{ name: 'Route 1 · Sunny Meadow', rare }])));
check('Explore rares and honey-tree species are listed under Sunny Meadow with their rarity',
  ([[133, true], [25, true], [280, true], [415, false], [412, false], [214, true], [446, true]] as const)
    .every(([dexId, rare]) => same(wildAreas(dexId), [{ name: 'Route 1 · Sunny Meadow', rare }])));
check('a species that never spawns has no wild area', wildAreas(150).length === 0);

const opponents = routeOpponents();
const shortfalls = balanceFailures(measureRouteBalance(200, opponents), opponents);
check(`every fresh starter wins ≥75% against wild Pokémon and ≥60% against every other Route 1 opponent over 200 seeds${shortfalls.length ? `: ${shortfalls.join('; ')}` : ''}`, shortfalls.length === 0);
console.log(`Route rules: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
