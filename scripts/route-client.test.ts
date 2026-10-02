/** Client recovery boundaries: failed loads, exact retries, and out-of-order inventory snapshots. */
import {
  chooseRoute, clearPendingRouteCommand, fetchRouteState, healAtCenter, readPendingRouteCommand, reconcileRouteState,
  runRouteCommand, savePendingRouteCommand, searchRoute, shouldApplyHydratedBox, tradeMarket, travelRoute, type RouteCommand,
} from '../src/game/route-actions-client.js';
import type { RouteEvent, RouteQuestView, RouteState } from '../src/game/route-actions.js';
import { inventoryChangeText, moneyChangeText, resultFind, tradeText, travelBlock } from '../src/components/world/route-copy.js';
import { placeHighlights } from '../src/components/world/place-highlights.js';
import { boardCta, cardDescription, pickQuest } from '../src/components/world/route-board.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const state: RouteState = {
  serverNow: 1_000, revision: 1, activated: true,
  allowance: { available: 12, capacity: 48, refillEveryMs: 600_000, nextRefillAt: 601_000 },
  inventory: { revision: 1, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }, { itemId: 'great', quantity: 0 }] },
  quest: { id: 'meadow-survey', status: 'not-accepted', landmarks: [], required: ['signpost', 'sunflowers', 'hilltop-oak'] },
  quests: [{ id: 'meadow-survey', status: 'not-accepted', next: { step: 'meet', actions: 1, items: [] }, progress: { done: 0, total: 3 } }],
  places: [], trainerAt: 'home',
  travel: { available: 12, capacity: 12, refillEveryMs: 900_000, nextRefillAt: null },
  quotes: [{ to: 'r1', walk: 4, cost: 4, mode: 'walk', via: null }], ownedCount: 1, activeEvent: null, result: null,
  legacy: { pending: false, notice: null, result: null },
};
let reply: () => Promise<Response> = () => Promise.reject(new Error('Offline'));
let lastUrl = '';
let lastInit: RequestInit | undefined;
globalThis.fetch = (async (url, init) => { lastUrl = String(url); lastInit = init; return reply(); }) as typeof fetch;
const json = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const command: RouteCommand = { operation: 'search', input: { requestId: 'search-one', locationId: 'r1', kind: 'wild', partyIds: ['starter'] } };

reply = json(200, { ok: true, state });
const loaded = await fetchRouteState();
check('state load keeps owned quantities and allowance', loaded.ok && loaded.state.inventory.stacks[0].quantity === 20 && loaded.state.allowance.available === 12);
check('state GET includes session credentials and forbids caching', lastUrl === '/api/world/state' && lastInit?.credentials === 'include' && lastInit.cache === 'no-store' && lastInit.method === undefined);
reply = json(503, { ok: false, error: 'The route tables are not ready yet.' });
const unavailable = await fetchRouteState();
check('an unavailable Bag is an error, not zero inventory', !unavailable.ok && unavailable.error === 'The route tables are not ready yet.' && unavailable.state === undefined);
reply = json(401, { ok: false, error: 'Sign in again to explore.' });
const expired = await fetchRouteState();
check('expired login preserves the server sentence and signals sign-in', !expired.ok && expired.expired === true && expired.error === 'Sign in again to explore.');
reply = json(200, { ok: true, state: { ...state, inventory: { revision: 1, money: 0, stacks: [{ itemId: 'poke', quantity: -1 }] } } });
check('invalid owned quantity is rejected instead of displayed', !(await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...state, inventory: null } });
check('missing inventory is not a successful empty Bag', !(await fetchRouteState()).ok);

reply = json(200, { ok: true, state });
await runRouteCommand(command);
check('search sends the frozen party and request ID as JSON', lastUrl === '/api/world/search' && lastInit?.method === 'POST' && lastInit.credentials === 'include' && lastInit.body === JSON.stringify(command.input));
await healAtCenter({ requestId: 'heal-1' });
check('heal posts its request ID to the heal action', lastUrl === '/api/world/heal' && lastInit?.method === 'POST' && lastInit.body === JSON.stringify({ requestId: 'heal-1' }));
reply = () => Promise.reject(new TypeError('Lost connection'));
const uncertain = await runRouteCommand(command);
check('lost write response is uncertain so its request ID survives', !uncertain.ok && uncertain.uncertain === true);
reply = () => Promise.resolve(new Response('<broken response>', { status: 200 }));
const malformed = await runRouteCommand(command);
check('malformed success remains uncertain; retry cannot spend a second action', !malformed.ok && malformed.uncertain === true);
reply = json(200, { ok: true });
const incomplete = await runRouteCommand(command);
check('a receipt without usable state stays recoverable', !incomplete.ok && incomplete.uncertain === true);
reply = json(409, { ok: false, error: 'That encounter already changed.', state });
const conflict = await chooseRoute({ requestId: 'choice-one', eventId: 'event-one', expectedRevision: 1, choice: 'catch', ballId: 'great' });
check('conflicting catch exposes authoritative inventory and does not imply consumption', !conflict.ok && conflict.status === 409 && conflict.state?.inventory.stacks[0].quantity === 20 && !conflict.uncertain);
reply = json(200, { ok: true, state, party: ['starter', 'caught', 7] });
const joined = await chooseRoute({ requestId: 'choice-two', eventId: 'event-one', expectedRevision: 1, choice: 'catch', ballId: 'poke' });
check('a catch that joined the party returns the saved party IDs', joined.ok && JSON.stringify(joined.party) === JSON.stringify(['starter', 'caught']));
reply = json(409, { ok: false, error: 'Your party changed.', party: ['new-party'] });
const partyConflict = await searchRoute(command.input);
check('party conflict provides saved party IDs for the next search', !partyConflict.ok && partyConflict.party?.[0] === 'new-party');

const newer: RouteState = { ...state, revision: 4, serverNow: 4_000, inventory: { revision: 3, money: 0, stacks: [{ itemId: 'poke', quantity: 18 }, { itemId: 'great', quantity: 3 }] } };
check('old receipt never overwrites newer item quantities', reconcileRouteState(newer, state) === newer);
check('out-of-order same-revision read cannot rewind allowance clock', reconcileRouteState(newer, { ...newer, serverNow: 2_000 }) === newer);
check('inconsistent older inventory is rejected even with a later route revision', reconcileRouteState(newer, { ...state, revision: 5, serverNow: 5_000 }) === newer);
check('a fresh inventory snapshot replaces the previous display', reconcileRouteState(state, newer) === newer);
check('a delayed hydration cannot replace a newer battle/catch Box', !shouldApplyHydratedBox({ startedAtRevision: state.revision, current: newer, incoming: state }));
check('a mutation during hydration protects its Box even if the later world GET sees that mutation', !shouldApplyHydratedBox({ startedAtRevision: state.revision, current: newer, incoming: newer }));
check('an older world snapshot cannot authorize an older Box at an unchanged current revision', !shouldApplyHydratedBox({ startedAtRevision: newer.revision, current: newer, incoming: state }));
check('normal initial hydration still loads the owned Box', shouldApplyHydratedBox({ startedAtRevision: null, current: null, incoming: state }));
check('a quiet background hydration still refreshes Box changes', shouldApplyHydratedBox({ startedAtRevision: state.revision, current: state, incoming: newer }));
check('an unavailable optional world does not block a successful ordinary Box hydration', shouldApplyHydratedBox({ startedAtRevision: state.revision, current: state, incoming: null }));
check('a newer mutation is protected even if the hydration world request fails', !shouldApplyHydratedBox({ startedAtRevision: state.revision, current: newer, incoming: null }));

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
} });
savePendingRouteCommand('trainer-a', command);
const recovered = readPendingRouteCommand('trainer-a');
check('reload recovers the same command and request ID', JSON.stringify(recovered) === JSON.stringify(command));
check('another account cannot inherit a pending command', readPendingRouteCommand('trainer-b') === null);
reply = json(200, { ok: true, state: newer, replayed: true });
const retried = await runRouteCommand(recovered!);
check('replayed command uses the original payload and current server state', retried.ok && retried.replayed === true && retried.state.inventory.revision === 3 && lastInit?.body === JSON.stringify(command.input));
savePendingRouteCommand('acct', { operation: 'heal', input: { requestId: 'heal-pending' } });
check('a pending heal survives a reload', readPendingRouteCommand('acct')?.operation === 'heal');
clearPendingRouteCommand('acct');
clearPendingRouteCommand('trainer-a');
check('settled command is removed before the next action', readPendingRouteCommand('trainer-a') === null);

check('a consumed ball is described as used, not a negative supply find', inventoryChangeText({ itemId: 'poke', quantity: -1 }) === 'Used 1 Poké Ball from your Bag.');
check('a multi-ball supply find uses a positive grant and plural', inventoryChangeText({ itemId: 'great', quantity: 3 }) === '+3 Great Balls added to your Bag.');

const stocked: RouteState = { ...state, inventory: { revision: 4, money: 1100, stacks: [{ itemId: 'honey', quantity: 2 }, { itemId: 'poke', quantity: 20 }] } };
reply = json(200, { ok: true, state: stocked, trade: { itemId: 'poke', side: 'buy', quantity: 3, total: 600 } });
const trade = { requestId: 'trade-one', itemId: 'poke' as const, side: 'buy' as const, quantity: 3 };
const traded = await tradeMarket(trade);
check('a trade posts to market-trade with credentials', lastUrl === '/api/world/market-trade' && lastInit?.method === 'POST' && lastInit.credentials === 'include' && lastInit.body === JSON.stringify(trade));
check('a trade reply carries the receipt, valuables and balance', traded.ok && traded.trade?.total === 600 && traded.state.inventory.money === 1100 && traded.state.inventory.stacks[0].itemId === 'honey');
reply = json(200, { ok: true, state: { ...stocked, inventory: { ...stocked.inventory, money: -5 } } });
check('a negative balance is an incomplete reply, not a state', !(await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...stocked, inventory: { ...stocked.inventory, stacks: [{ itemId: 'master', quantity: 1 }] } } });
check('an unknown item stack is an incomplete reply', !(await fetchRouteState()).ok);
const afterTrade = { ...stocked, revision: 6, inventory: { ...stocked.inventory, revision: 6, money: 500 } };
check('a late reply cannot rewind the balance after a trade', reconcileRouteState(afterTrade, stocked) === afterTrade);
const tradeCommand: RouteCommand = { operation: 'market-trade', input: trade };
savePendingRouteCommand('trainer-m', tradeCommand);
check('a pending trade survives a reload with its request ID', JSON.stringify(readPendingRouteCommand('trainer-m')) === JSON.stringify(tradeCommand));
clearPendingRouteCommand('trainer-m');
check('valuables use their plural', inventoryChangeText({ itemId: 'tiny-mushroom', quantity: 2 }) === '+2 Tiny Mushrooms added to your Bag.' && inventoryChangeText({ itemId: 'honey', quantity: 1 }) === '+1 Honey added to your Bag.');
check('battle and pouch money read as earnings', moneyChangeText({ kind: 'wild', money: 100 }) === '+₽100 prize money.' && moneyChangeText({ kind: 'item', money: 300 }) === 'Found a coin pouch: +₽300.' && moneyChangeText({ kind: 'wild', money: 0 }) === null && moneyChangeText({ kind: 'wild' }) === null);
const honeyFind = resultFind({ items: [{ itemId: 'honey', quantity: 2 }], money: 0 });
check('an Explore find of Honey is shown as Honey, not capture supplies', honeyFind?.kind === 'item' && honeyFind.item.id === 'honey');
const ballFind = resultFind({ items: [{ itemId: 'poke', quantity: -1 }, { itemId: 'great', quantity: 3 }] });
check('a ball find is shown by the ball it granted, skipping used balls', ballFind?.kind === 'item' && ballFind.item.id === 'great');
const pouch = resultFind({ items: [], money: 300 });
check('a coin pouch with no items is shown as money', pouch?.kind === 'money' && pouch.amount === 300);
check('a find with no grant and no money has nothing to show', resultFind({ items: [] }) === null);
check("trade receipts read in the player's words", tradeText({ itemId: 'poke', side: 'buy', quantity: 3, total: 600 }) === 'Bought 3 Poké Balls for ₽600.' && tradeText({ itemId: 'honey', side: 'sell', quantity: 1, total: 150 }) === 'Sold 1 Honey for ₽150.');
// Home must not advertise made-up quests or label previously seen Pokémon as new.
const wild: RouteEvent = {
  id: 'wild', locationId: 'r1', searchKind: 'wild', kind: 'wild', rulesVersion: 2, revision: 0,
  startedAt: 1_000, resolvedAt: null, phase: 'wild', party: [],
  foe: { dexId: 16, level: 5, shiny: false, altColor: false, rare: false, guardian: false },
  npc: null, choices: ['battle', 'catch', 'leave'], catchChances: { poke: 0.5, great: 0.7 },
  battle: null, members: [], catch: null, items: [], newSeen: [16], newLandmarks: [], outcome: null,
};
check('without a researcher Home offers a survey hint, not a new quest', placeHighlights(state).every((h) => h.label !== 'New quest' && h.focus === 'survey'));
const newSighting = placeHighlights({ ...state, activeEvent: wild });
check('first sighting opens the saved encounter and identifies its Pokémon', newSighting[0]?.label === 'New sighting' && newSighting[0]?.focus === 'encounter' && newSighting[0]?.dexId === 16);
check('repeat wild visits do not claim a new sighting', placeHighlights({ ...state, activeEvent: { ...wild, newSeen: [] } })[0]?.label === 'In the tall grass');
const researcher: RouteEvent = { ...wild, kind: 'researcher', phase: 'researcher', foe: null, newSeen: [], npc: { id: 'researcher', name: 'Meadow Researcher', spriteKey: 'random-scientist-f', text: 'Help with my survey.' } };
check('a waiting researcher offers the actual quest interaction', placeHighlights({ ...state, activeEvent: researcher })[0]?.label === 'New quest' && placeHighlights({ ...state, activeEvent: researcher })[0]?.focus === 'encounter');
for (const status of ['active', 'ready', 'claimed'] as const) {
  check(`a saved researcher conversation remains reachable when its survey is ${status}`, placeHighlights({ ...state, activeEvent: researcher, quest: { ...state.quest, status } }).some((h) => h.focus === 'encounter'));
}
check('earned survey rewards link to the survey, not another encounter', placeHighlights({ ...state, quest: { ...state.quest, status: 'ready' } })[0]?.focus === 'survey' && placeHighlights({ ...state, quest: { ...state.quest, status: 'ready' } })[0]?.label === 'Reward ready');
check('claimed surveys do not keep advertising a quest or reward', placeHighlights({ ...state, quest: { ...state.quest, status: 'claimed' } }).length === 0);
check('resolved sightings open results instead of reviving an encounter', placeHighlights({ ...state, result: { ...wild, phase: 'resolved', choices: [], outcome: 'left' } })[0]?.focus === 'result');
check('survey progress counts only its required unique landmarks', placeHighlights({ ...state, quest: { ...state.quest, status: 'active', landmarks: ['signpost', 'signpost', 'unrelated'] } })[0]?.detail.startsWith('1 of 3'));

reply = json(200, { ok: true, state: { ...state, quests: undefined } });
check('a state without quests is not trusted', !(await fetchRouteState()).ok);
reply = json(400, { ok: false, error: 'Sunny Meadow has new actions. Refresh to see them.' });
const staleSearch = await runRouteCommand({ operation: 'search', input: { requestId: 'old-npc', locationId: 'r1', kind: 'wild', partyIds: ['starter'] } });
check('a refused stale search is final, so its pending command is dropped', !staleSearch.ok && !staleSearch.uncertain && staleSearch.error === 'Sunny Meadow has new actions. Refresh to see them.');

const board = { ...state, trainerAt: 'r1' as const };
const cta = (over: Partial<Parameters<typeof boardCta>[0]>) => boardCta({ state: board, card: 'wild', quest: null, partySize: 1, partyDown: false, busy: false, now: 1_000, ...over });
check('each card names its search and its cost', cta({}).label === 'Search the grass (1 action)' && cta({ card: 'trainer' }).label === 'Find a trainer (1 action)'
  && cta({ card: 'puzzle' }).label === 'Solve a puzzle (1 action)' && cta({ card: 'explore' }).label === 'Explore (1 action)' && cta({ card: 'forage' }).label === 'Forage (1 action)');
check('a ready card runs its search', cta({ card: 'forage' }).enabled && JSON.stringify(cta({ card: 'forage' }).action) === JSON.stringify({ type: 'search', kind: 'forage' }));
check('an unopened route begins exploring first', cta({ state: { ...board, activated: false } }).action.type === 'activate');
check('an open encounter turns the button into Resume', cta({ state: { ...board, activeEvent: wild } }).label === 'Resume encounter' && cta({ state: { ...board, activeEvent: wild } }).action.type === 'resume');
check('no party asks for one', cta({ partySize: 0 }).action.type === 'party');
check('a fainted party is sent to the Pokémon Center', cta({ partyDown: true }).action.type === 'center');
const drained = { ...board, allowance: { ...board.allowance, available: 0, nextRefillAt: 361_000 } };
check('no actions disables the search and names the wait', !cta({ state: drained }).enabled && cta({ state: drained }).reason === 'No actions left. Next action in 6 min.');
check('a refill that is due offers a check instead', cta({ state: { ...drained, allowance: { ...drained.allowance, nextRefillAt: 1_000 } } }).action.type === 'refresh');
const surveyStep: RouteQuestView = { id: 'meadow-survey', status: 'active', next: { step: 'survey', actions: 1, items: [] }, progress: { done: 1, total: 3 } };
const treeStep: RouteQuestView = { id: 'honey-tree', status: 'active', next: { step: 'spread-honey', actions: 1, items: [{ itemId: 'honey', quantity: 1 }] }, progress: null };
check('the Quest card performs the chosen quest’s step', cta({ card: 'quest', quest: surveyStep }).label === 'Survey a landmark (1 action)'
  && JSON.stringify(cta({ card: 'quest', quest: surveyStep }).action) === JSON.stringify({ type: 'search', kind: 'quest', questId: 'meadow-survey' }));
check('a ready survey is claimed for free', cta({ card: 'quest', quest: { ...surveyStep, status: 'ready', next: { step: 'claim', actions: 0, items: [] } } }).label === 'Claim reward (free)'
  && cta({ card: 'quest', quest: { ...surveyStep, status: 'ready', next: { step: 'claim', actions: 0, items: [] } } }).action.type === 'claim');
check('Spread Honey shows its Honey cost and waits for Honey', cta({ card: 'quest', quest: treeStep }).label === 'Spread Honey (1 action · 1 Honey)' && !cta({ card: 'quest', quest: treeStep }).enabled
  && cta({ card: 'quest', quest: treeStep }).reason === 'Forage for Honey first.');
check('with Honey, Spread Honey runs', cta({ card: 'quest', quest: treeStep, state: { ...board, inventory: { ...board.inventory, stacks: [{ itemId: 'honey', quantity: 2 }] } } }).enabled);
check('with no quest step, the Quest card points to Explore', !cta({ card: 'quest', quest: null }).enabled && cta({ card: 'quest', quest: null }).reason === 'No quests right now. Explore to find secrets.');
check('the Quest card keeps a pick that still has a step, else takes the first quest with one', pickQuest([surveyStep, treeStep], 'honey-tree')?.id === 'honey-tree'
  && pickQuest([{ ...surveyStep, status: 'claimed', next: null }, treeStep], 'meadow-survey')?.id === 'honey-tree' && pickQuest([{ ...surveyStep, status: 'claimed', next: null }], null) === null);
check('Explore says when it guarantees supplies', cardDescription('explore', { revision: 1, money: 0, stacks: [] }) === 'You have no balls: exploring now guarantees 3 Poké Balls.');

reply = json(200, { ok: true, state: { ...state, travel: undefined } });
check('a state without a travel meter is not trusted', !(await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...state, quotes: [{ to: 'r1', walk: 4, cost: -1, mode: 'walk', via: null }] } });
check('a negative trip cost is rejected', !(await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...state, travel: { ...state.travel, available: -4, nextRefillAt: 900_000 } } });
check('travel debt is a valid meter', (await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...state, trainerAt: 'r1' } });
const moved = await travelRoute({ requestId: 'trip-one', to: 'r1', partyIds: ['starter'] });
check('travel posts to its action with the request body', moved.ok && lastUrl === '/api/world/travel' && lastInit?.method === 'POST' && JSON.parse(String(lastInit.body)).to === 'r1');
const tripCommand: RouteCommand = { operation: 'travel', input: { requestId: 'trip-two', to: 'home', partyIds: ['starter'] } };
savePendingRouteCommand('acct', tripCommand);
check('an uncertain trip survives a reload for an exact retry', readPendingRouteCommand('acct')?.input.requestId === 'trip-two');
clearPendingRouteCommand('acct');

const walk = { to: 'r1' as const, walk: 4, cost: 4, mode: 'walk' as const, via: null };
const meter = (available: number, nextRefillAt: number | null) => ({ available, capacity: 12, refillEveryMs: 900_000, nextRefillAt });
check('an affordable trip has no block', travelBlock({ quote: walk, travel: meter(4, 0), encounterOpen: false, now: 0 }) === null);
check('an open encounter blocks travel first', travelBlock({ quote: walk, travel: meter(12, null), encounterOpen: true, now: 0 }) === 'Finish or leave your encounter before you travel.');
check('a short meter names the wait for enough points', travelBlock({ quote: walk, travel: meter(1, 600_000), encounterOpen: false, now: 0 }) === 'Not enough travel stamina. Enough to travel in 40 min.');
check('debt counts every missing point', travelBlock({ quote: walk, travel: meter(-4, 900_000), encounterOpen: false, now: 0 }) === 'Not enough travel stamina. Enough to travel in 2 h.');
check('a wait over an hour names hours and minutes', travelBlock({ quote: walk, travel: meter(-2, 900_000), encounterOpen: false, now: 0 }) === 'Not enough travel stamina. Enough to travel in 1 h 30 min.');
check('no route there is its own reason', travelBlock({ quote: null, travel: meter(12, null), encounterOpen: false, now: 0 }) === 'You can’t get there from here.');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
