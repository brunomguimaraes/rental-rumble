/** Atomic route commands against a disposable file database, including lost replies and legacy cutover. */
import {
  acceptRouteQuest, applySchema, changeInventory, changeMoney, countOwned, insertDiscovery, insertRouteEvent, readDiscoveries,
  openWriteTx, readActivity, readOpenActivity, readOwnedByUser, readRouteAccount, readRouteEvent,
  updateOwnedNickname, updateRouteEvent, writeRouteAllowance, type Db,
} from '../api/_db.js';
import {
  activateRoute, chooseRoute, claimRouteQuest, dismissRouteResult, finishLegacyRoute,
  loadRouteState, RouteError, searchRoute, tradeMarket,
} from '../api/_route-actions.js';
import { dismissResult, startActivity, stepExpedition } from '../api/_world.js';
import { legalChoices, rollCapture, rollRouteFind } from '../src/game/route-rules.js';
import type { CaptureBallId, RouteEvent, RouteRules, RouteRulesV2, SearchKind, StoredRouteEvent } from '../src/game/route-actions.js';
import { check, finish, onboardUser, tempDb } from './world-test-kit.js';

const T = 1_800_000_000_000;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
let request = 0;
const rid = () => `request-${++request}`;
async function rejects(label: string, work: Promise<unknown>, status: number) {
  try { await work; check(label, false); }
  catch (e) { check(label, e instanceof RouteError && e.status === status); }
}
async function start(db: Db, uid: string, kind: SearchKind = 'wild', now = T) {
  const partyIds = [(await readOwnedByUser(db, uid)).find((m) => m.origin === 'starter')!.id];
  return searchRoute(db, uid, { requestId: rid(), locationId: 'r1', kind, partyIds }, now);
}
async function leave(db: Db, uid: string, event: RouteEvent) {
  return chooseRoute(db, uid, { requestId: rid(), eventId: event.id, expectedRevision: event.revision, choice: event.phase === 'researcher' ? 'decline' : 'leave' }, T);
}
const moneyOf = async (db: Db, uid: string) => (await loadRouteState(db, uid, T)).inventory.money;
/** Controlled persisted fixture uses the real find rules; production gets its seed from crypto. */
async function forceKind(db: Db, uid: string, e: RouteEvent, kind: 'wild' | 'trainer' | 'researcher' | 'item', seedPrefix = 'fixture') {
  const row = (await readRouteEvent(db, uid, e.id))!;
  const data = row.data as StoredRouteEvent;
  for (let i = 0; ; i++) {
    const seed = `${seedPrefix}-${i}`;
    const find = rollRouteFind({ seed, kind: kind === 'wild' ? 'wild' : kind === 'item' ? 'explore' : 'npc', knownLandmarks: [], questClaimed: false, inventory: { revision: 0, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }] } });
    if (find.kind !== kind) continue;
    data.seed = seed; data.foe = find.foe;
    data.event.kind = kind; data.event.foe = find.foe?.view ?? null; data.event.npc = find.npc;
    data.event.phase = kind === 'item' ? 'resolved' : kind;
    data.event.choices = legalChoices(data.event.phase);
    await updateRouteEvent(db, uid, { ...row, data }, row.revision);
    return data;
  }
}
async function forceCatch(db: Db, uid: string, e: RouteEvent, caught: boolean, ballId: CaptureBallId) {
  const row = (await readRouteEvent(db, uid, e.id))!;
  const data = row.data as StoredRouteEvent;
  for (let i = 0; ; i++) {
    const seed = `capture-${i}`;
    if (rollCapture({ seed, rare: data.foe!.view.rare, wonBattle: e.phase === 'catch', ballId }) !== caught) continue;
    data.seed = seed;
    await updateRouteEvent(db, uid, { ...row, data }, row.revision);
    return data.foe!.mint;
  }
}
const t = await tempDb('routes');
try {
  const { db } = t;
  const starter = await onboardUser(db, 'u1', 6, 30);
  await onboardUser(db, 'u2', 6, 30);
  await applySchema(db);
  const before = await loadRouteState(db, 'u1', T);
  check('state GET projects unactivated account without grants', !before.activated && before.inventory.stacks.length === 0 && await readRouteAccount(db, 'u1') === null);
  const a = await activateRoute(db, 'u1', 'activate', T);
  check('activation gives 12 actions and 20 owned Poké Balls', a.state.allowance.available === 12 && a.state.inventory.stacks.find((s) => s.itemId === 'poke')?.quantity === 20);
  const repeated = await activateRoute(db, 'u1', 'activate', T + 1);
  const again = await activateRoute(db, 'u1', 'activate-new-id', T + 1);
  check('activation starts with no money', a.state.inventory.money === 0);
  check('lost and new activation requests do not repeat starter supply', repeated.replayed === true && again.state.inventory.stacks[0].quantity === 20 && again.state.allowance.available === 12);
  await activateRoute(db, 'u2', 'activate', T);
  const input = { requestId: 'find-one', locationId: 'r1' as const, kind: 'wild' as const, partyIds: [starter.id] };
  const first = await searchRoute(db, 'u1', input, T);
  const e = first.event!;
  check('one search freezes an active wild and spends one action', first.state.allowance.available === 11 && first.state.activeEvent?.id === e.id);
  const privateRow = (await readRouteEvent(db, 'u1', e.id))!.data as StoredRouteEvent;
  check('public response does not expose private seed or frozen rules', !JSON.stringify(first).includes(privateRow.seed) && !('config' in e));
  await rejects('changed request payload is conflict before active check', searchRoute(db, 'u1', { ...input, kind: 'npc' }, T), 409);
  await rejects('second active event is rejected', start(db, 'u1'), 409);
  await rejects('foreign event is not found', chooseRoute(db, 'u2', { requestId: rid(), eventId: e.id, expectedRevision: 0, choice: 'leave' }, T), 404);
  await rejects('stale choice spends nothing', chooseRoute(db, 'u1', { requestId: rid(), eventId: e.id, expectedRevision: 9, choice: 'catch', ballId: 'poke' }, T), 409);
  const caughtMint = await forceCatch(db, 'u1', e, true, 'poke');
  const throwInput = { requestId: 'throw-one', eventId: e.id, expectedRevision: 0, choice: 'catch' as const, ballId: 'poke' as const };
  const caught = await chooseRoute(db, 'u1', throwInput, T);
  const caughtAgain = await chooseRoute(db, 'u1', throwInput, T + 1);
  check('catch debit and owned individual are exactly once', caught.event?.catch?.caught === true && caughtAgain.event?.catch?.owned?.id === caught.event.catch.owned?.id && await countOwned(db, 'u1') === 2 && caughtAgain.state.inventory.stacks.find((s) => s.itemId === 'poke')?.quantity === 19);
  const ownedCatch = caught.event!.catch!.owned!;
  check('catch persists complete encountered identity without handicap', Object.entries(caughtMint).every(([k, v]) => eq(ownedCatch[k as keyof typeof ownedCatch], v)) && ownedCatch.exp === 0 && ownedCatch.origin === 'catch');
  check('caught dex layer is recorded once', Number((await db.execute({ sql: 'select count(*) as n from pokedex_cells where user_id = ?', args: ['u1'] })).rows[0].n) === 1);
  await rejects('a second throw cannot consume another ball', chooseRoute(db, 'u1', { ...throwInput, requestId: rid() }, T), 409);
  await dismissRouteResult(db, 'u1', e.id, T);
  check('dismiss does not reward again', (await loadRouteState(db, 'u1', T)).result === null && await countOwned(db, 'u1') === 2);
  const second = (await start(db, 'u1')).event!;
  const replayedOld = await searchRoute(db, 'u1', input, T);
  check('old search receipt keeps original event and newer current state', replayedOld.event?.id === e.id && replayedOld.state.activeEvent?.id === second.id && replayedOld.state.allowance.available === 10);
  await changeInventory(db, 'u1', 'great', 2);
  await forceCatch(db, 'u1', second, false, 'great');
  const failThrow = await chooseRoute(db, 'u1', { requestId: rid(), eventId: second.id, expectedRevision: 0, choice: 'catch', ballId: 'great' }, T);
  check('failed Great Ball attempt consumes one and ends encounter', failThrow.event?.outcome === 'escaped' && failThrow.state.inventory.stacks.find((s) => s.itemId === 'great')?.quantity === 1 && failThrow.state.activeEvent === null);
  const third = (await start(db, 'u1')).event!;
  await updateOwnedNickname(db, 'u1', starter.id, 'Still mine');
  const battleInput = { requestId: rid(), eventId: third.id, expectedRevision: 0, choice: 'battle' as const };
  const won = await chooseRoute(db, 'u1', battleInput, T);
  const wonAgain = await chooseRoute(db, 'u1', battleInput, T);
  check('wild win immediately pays growth and retains catch phase', won.event?.battle?.won === true && won.event.phase === 'catch' && won.event.members[0]?.expGained === 7 && wonAgain.box?.find((m) => m.id === starter.id)?.exp === 7 && wonAgain.box.find((m) => m.id === starter.id)?.nickname === 'Still mine');
  await leave(db, 'u1', won.event!);
  check('leaving after battle does not pay again', (await readOwnedByUser(db, 'u1')).find((m) => m.id === starter.id)?.exp === 7);

  console.log('[all supported throws and initialization races]');
  for (const ballId of ['poke', 'great'] as const) for (const success of [true, false]) {
    const uid = `${ballId}-${success}`;
    await onboardUser(db, uid, 6, 30);
    const activations = await Promise.all([activateRoute(db, uid, 'first-activate', T), activateRoute(db, uid, 'first-activate', T)]);
    check(`${uid} concurrent first activation grants supplies once`, activations.every((r) => r.state.inventory.stacks[0].quantity === 20) && activations.filter((r) => r.replayed).length === 1);
    if (ballId === 'great') await changeInventory(db, uid, 'great', 1);
    const encounter = (await start(db, uid)).event!;
    await forceCatch(db, uid, encounter, success, ballId);
    const command = { requestId: rid(), eventId: encounter.id, expectedRevision: 0, choice: 'catch' as const, ballId };
    const responses = await Promise.all([chooseRoute(db, uid, command, T), chooseRoute(db, uid, command, T)]);
    const state = await loadRouteState(db, uid, T);
    check(`${uid} concurrent same throw debits exactly once`, responses.every((r) => r.event?.catch?.caught === success) && state.inventory.stacks.find((stack) => stack.itemId === ballId)?.quantity === (ballId === 'poke' ? 19 : 0) && await countOwned(db, uid) === (success ? 2 : 1));
  }
  console.log('[races, supplies, capacity and quest]');
  await writeRouteAllowance(db, 'u2', 1, T);
  const race = await Promise.allSettled([start(db, 'u2'), start(db, 'u2')]);
  check('two concurrent searches spend the last action only once', race.filter((r) => r.status === 'fulfilled').length === 1 && (await loadRouteState(db, 'u2', T)).allowance.available === 0);
  const active = (await loadRouteState(db, 'u2', T)).activeEvent!;
  const choices = await Promise.allSettled([
    chooseRoute(db, 'u2', { requestId: rid(), eventId: active.id, expectedRevision: 0, choice: 'leave' }, T),
    chooseRoute(db, 'u2', { requestId: rid(), eventId: active.id, expectedRevision: 0, choice: 'catch', ballId: 'poke' }, T),
  ]);
  check('competing encounter choices commit only one result', choices.filter((r) => r.status === 'fulfilled').length === 1);
  await rejects('exhausted searches are conflict', start(db, 'u2'), 409);
  check('read projection refills without persisting offline rewards', (await loadRouteState(db, 'u2', T + 600000)).allowance.available === 1 && (await readRouteAccount(db, 'u2'))?.actions === 0);
  await writeRouteAllowance(db, 'u1', 48, T);
  const inv = (await loadRouteState(db, 'u1', T)).inventory;
  for (const stack of inv.stacks) if (stack.quantity) await changeInventory(db, 'u1', stack.itemId, -stack.quantity);
  const emptyWild = (await start(db, 'u1')).event!;
  await rejects('empty Bag catch consumes no action and stays unresolved', chooseRoute(db, 'u1', { requestId: rid(), eventId: emptyWild.id, expectedRevision: 0, choice: 'catch', ballId: 'poke' }, T), 409);
  check('failed item check retains encounter and zero inventory', (await loadRouteState(db, 'u1', T)).activeEvent?.id === emptyWild.id && (await loadRouteState(db, 'u1', T)).inventory.stacks.every((s) => s.quantity === 0));
  await leave(db, 'u1', emptyWild);
  await db.execute({ sql: 'update route_accounts set money = 0 where user_id = ?', args: ['u1'] });
  const resupply = await start(db, 'u1', 'explore');
  check('empty Bag Explore guarantees persisted three Poké Balls for one action', resupply.event?.kind === 'item' && resupply.event.items[0]?.itemId === 'poke' && resupply.event.items[0]?.quantity === 3 && resupply.state.allowance.available === 46);
  const fullEvent = (await start(db, 'u1')).event!;
  const slots = 600 - await countOwned(db, 'u1');
  await db.batch(Array.from({ length: slots }, (_, i) => ({ sql: 'insert into owned_pokemon (id, user_id, dex_id, level, exp, sign, origin) values (?, ?, 10, 5, 0, ?, ?)', args: [`filler-${i}`, 'u1', 'aries', 'catch'] })));
  const beforeCapacity = (await loadRouteState(db, 'u1', T)).inventory;
  await rejects('full Box rejects before consuming a ball', chooseRoute(db, 'u1', { requestId: rid(), eventId: fullEvent.id, expectedRevision: 0, choice: 'catch', ballId: 'poke' }, T), 409);
  check('full Box keeps catch decision and item untouched', eq((await loadRouteState(db, 'u1', T)).inventory, beforeCapacity) && (await loadRouteState(db, 'u1', T)).activeEvent?.id === fullEvent.id);
  await leave(db, 'u1', fullEvent);
  const researcher = await forceKind(db, 'u1', (await start(db, 'u1', 'npc')).event!, 'researcher');
  await chooseRoute(db, 'u1', { requestId: rid(), eventId: researcher.event.id, expectedRevision: 0, choice: 'accept' }, T);
  for (const ref of ['signpost', 'sunflowers', 'hilltop-oak']) await insertDiscovery(db, { uid: 'u1', locationId: 'r1', kind: 'landmark', ref, foundAt: T });
  const claim = { requestId: 'claim', questId: 'meadow-survey' as const };
  const moneyBeforeQuest = await moneyOf(db, 'u1');
  const claims = await Promise.all([claimRouteQuest(db, 'u1', claim, T), claimRouteQuest(db, 'u1', claim, T)]);
  check('quest acceptance and existing landmarks yield one raced reward', claims.every((c) => c.state.quest.status === 'claimed') && (await loadRouteState(db, 'u1', T)).inventory.stacks.find((s) => s.itemId === 'great')?.quantity === 3);
  check('the survey pays ₽500 exactly once', await moneyOf(db, 'u1') === moneyBeforeQuest + 500);
  await rejects('new request cannot duplicate quest reward', claimRouteQuest(db, 'u1', { ...claim, requestId: rid() }, T), 409);
  const trainer = await forceKind(db, 'u1', (await start(db, 'u1', 'npc')).event!, 'trainer');
  await rejects('trainer capture is invalid before debit', chooseRoute(db, 'u1', { requestId: rid(), eventId: trainer.event.id, expectedRevision: 0, choice: 'catch', ballId: 'great' }, T), 400);
  const trained = await chooseRoute(db, 'u1', { requestId: 'trainer-battle', eventId: trainer.event.id, expectedRevision: 0, choice: 'battle' }, T);
  const trainedRetry = await chooseRoute(db, 'u1', { requestId: 'trainer-battle', eventId: trainer.event.id, expectedRevision: 0, choice: 'battle' }, T);
  check('trainer battle pays EXP and ₽200 once and closes encounter', trained.event?.outcome === 'won' && trained.state.activeEvent === null && trained.event.members[0].expGained === 12 && trained.event.money === 200 && trained.state.inventory.money === trainedRetry.state.inventory.money);
  const wildWin = await forceKind(db, 'u1', (await start(db, 'u1')).event!, 'wild');
  const beforeWild = await moneyOf(db, 'u1');
  const wildWon = await chooseRoute(db, 'u1', { requestId: 'wild-win', eventId: wildWin.event.id, expectedRevision: 0, choice: 'battle' }, T);
  await chooseRoute(db, 'u1', { requestId: 'wild-win', eventId: wildWin.event.id, expectedRevision: 0, choice: 'battle' }, T);
  check('a wild win pays ₽100 once across retries', wildWon.event?.outcome === 'won' && wildWon.event.money === 100 && await moneyOf(db, 'u1') === beforeWild + 100);
  const beforeLeave = await moneyOf(db, 'u1');
  await chooseRoute(db, 'u1', { requestId: rid(), eventId: wildWon.event!.id, expectedRevision: wildWon.event!.revision, choice: 'leave' }, T);
  check('leaving after a win pays nothing more', await moneyOf(db, 'u1') === beforeLeave);
  const frozen = await forceKind(db, 'u1', (await start(db, 'u1')).event!, 'wild');
  const frozenRow = (await readRouteEvent(db, 'u1', frozen.event.id))!;
  const v2Rules: Partial<RouteRules> = { ...(frozen.config as RouteRules) };
  delete v2Rules.itemFinds; delete v2Rules.harvest; delete v2Rules.pouchMoney;
  delete v2Rules.wildMoney; delete v2Rules.trainerMoney; delete v2Rules.questMoney;
  const frozenEvent: Partial<RouteEvent> = { ...frozen.event, rulesVersion: 2 };
  delete frozenEvent.money;
  const frozenData = { ...frozen, config: { ...v2Rules, version: 2, pokeBundleChance: 0.75 } as unknown as RouteRulesV2, event: frozenEvent as RouteEvent };
  await updateRouteEvent(db, 'u1', { ...frozenRow, data: frozenData }, frozenRow.revision);
  const beforeFrozen = await moneyOf(db, 'u1');
  const frozenWon = await chooseRoute(db, 'u1', { requestId: rid(), eventId: frozen.event.id, expectedRevision: 0, choice: 'battle' }, T);
  check('an encounter frozen under rules v2 still settles and pays no ₽', frozenWon.event?.outcome === 'won' && await moneyOf(db, 'u1') === beforeFrozen);
  if (frozenWon.event?.phase !== 'resolved') await leave(db, 'u1', frozenWon.event!);
  const revisionBeforeRollback = (await loadRouteState(db, 'u1', T)).inventory.revision;
  const aTx = await openWriteTx(db);
  await changeInventory(aTx, 'u1', 'poke', 1);
  await aTx.rollback(); aTx.close();
  check('rolled-back item changes do not alter inventory revision', (await loadRouteState(db, 'u1', T)).inventory.revision === revisionBeforeRollback);

  console.log('[failure and inventory concurrency]');
  await onboardUser(db, 'failure', 6, 30);
  await activateRoute(db, 'failure', 'activate', T);
  const failingEvent = (await start(db, 'failure')).event!;
  await forceCatch(db, 'failure', failingEvent, true, 'poke');
  const beforeFailure = await loadRouteState(db, 'failure', T);
  await db.execute(`create trigger reject_route_receipt before insert on route_receipts when new.user_id = 'failure' begin select raise(abort, 'injected receipt failure'); end`);
  let rolledBack = false;
  try { await chooseRoute(db, 'failure', { requestId: 'failed-write', eventId: failingEvent.id, expectedRevision: 0, choice: 'catch', ballId: 'poke' }, T); } catch { rolledBack = true; }
  const afterFailure = await loadRouteState(db, 'failure', T);
  check('receipt persistence failure rolls back catch, ball, dex and phase', rolledBack && await countOwned(db, 'failure') === 1 && eq(afterFailure.inventory, beforeFailure.inventory) && afterFailure.activeEvent?.revision === 0 && Number((await db.execute({ sql: 'select count(*) as n from pokedex_cells where user_id = ?', args: ['failure'] })).rows[0].n) === 0);
  await db.execute('drop trigger reject_route_receipt');
  check('money cannot go negative', !await changeMoney(db, 'failure', -1) && await moneyOf(db, 'failure') === 0);
  const revBefore = (await loadRouteState(db, 'failure', T)).inventory.revision;
  check('a money credit bumps the inventory revision', await changeMoney(db, 'failure', 50) && (await loadRouteState(db, 'failure', T)).inventory.revision === revBefore + 1 && await moneyOf(db, 'failure') === 50);
  await changeMoney(db, 'failure', -50);
  await acceptRouteQuest(db, 'failure', 'meadow-survey', T);
  for (const ref of ['signpost', 'sunflowers', 'hilltop-oak']) await insertDiscovery(db, { uid: 'failure', locationId: 'r1', kind: 'landmark', ref, foundAt: T });
  await changeInventory(db, 'failure', 'great', 1);
  const grantDebit = await Promise.all([
    claimRouteQuest(db, 'failure', { requestId: 'simultaneous-grant', questId: 'meadow-survey' }, T),
    chooseRoute(db, 'failure', { requestId: 'simultaneous-debit', eventId: failingEvent.id, expectedRevision: 0, choice: 'catch', ballId: 'great' }, T),
  ]);
  const total = (await loadRouteState(db, 'failure', T)).inventory.stacks.find((stack) => stack.itemId === 'great')?.quantity;
  check('quest grant racing capture debit preserves exact inventory total', grantDebit.length === 2 && total === 3);
  const beforeRead = await readRouteAccount(db, 'failure');
  await loadRouteState(db, 'failure', T + 86400000);
  check('long-absence reads cannot mutate allowances, revisions or item balances', eq(beforeRead, await readRouteAccount(db, 'failure')));
  console.log('[market]');
  await onboardUser(db, 'shopper', 6, 30);
  await rejects('an unactivated account cannot trade', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'poke', side: 'sell', quantity: 1 }, T), 409);
  await activateRoute(db, 'shopper', 'activate', T);
  const shop = () => loadRouteState(db, 'shopper', T);
  const have = async (id: string) => (await shop()).inventory.stacks.find((s) => s.itemId === id)?.quantity ?? 0;
  await rejects('buying with too little money is a conflict', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'poke', side: 'buy', quantity: 1 }, T), 409);
  check('a refused purchase changes nothing', (await shop()).inventory.money === 0 && await have('poke') === 20);
  const revisionBeforeSale = (await shop()).inventory.revision;
  const sale = { requestId: 'sell-five', itemId: 'poke' as const, side: 'sell' as const, quantity: 5 };
  const sold = await tradeMarket(db, 'shopper', sale, T);
  check('selling 5 Poké Balls pays ₽500 and removes them', eq(sold.trade, { itemId: 'poke', side: 'sell', quantity: 5, total: 500 }) && sold.state.inventory.money === 500 && await have('poke') === 15);
  check('a trade increases the inventory revision', sold.state.inventory.revision > revisionBeforeSale);
  const resold = await tradeMarket(db, 'shopper', sale, T + 1);
  check('a retried sale replays its receipt without paying twice', resold.replayed === true && eq(resold.trade, sold.trade) && resold.state.inventory.money === 500 && await have('poke') === 15);
  await rejects('a reused request ID with a different trade conflicts', tradeMarket(db, 'shopper', { ...sale, quantity: 4 }, T), 409);
  const bought = await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'poke', side: 'buy', quantity: 2 }, T);
  check('buying 2 Poké Balls costs ₽400', bought.trade?.total === 400 && bought.state.inventory.money === 100 && await have('poke') === 17);
  try { await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'great', side: 'buy', quantity: 1 }, T); check('short purchase names the shortfall', false); }
  catch (err) { check('short purchase names the shortfall', err instanceof RouteError && err.status === 409 && err.message === 'You need ₽500 more.'); }
  await rejects('selling a valuable you lack is a conflict', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'honey', side: 'sell', quantity: 1 }, T), 409);
  await rejects('valuables cannot be bought', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'honey', side: 'buy', quantity: 1 }, T), 400);
  await changeInventory(db, 'shopper', 'big-mushroom', 1);
  const mushroom = await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'big-mushroom', side: 'sell', quantity: 1 }, T);
  check('a Big Mushroom sells for ₽1,000 and leaves an empty stack', mushroom.state.inventory.money === 1100 && await have('big-mushroom') === 0);
  // Review focus 2: two tabs, funds for one purchase.
  await db.execute({ sql: 'update route_accounts set money = 200 where user_id = ?', args: ['shopper'] });
  const raced = await Promise.allSettled([
    tradeMarket(db, 'shopper', { requestId: 'tab-a', itemId: 'poke', side: 'buy', quantity: 1 }, T),
    tradeMarket(db, 'shopper', { requestId: 'tab-b', itemId: 'poke', side: 'buy', quantity: 1 }, T),
  ]);
  check('racing purchases with funds for one buy exactly one ball', raced.filter((r) => r.status === 'fulfilled').length === 1 && (await shop()).inventory.money === 0 && await have('poke') === 18);
  // Review focus 3: buy mid-encounter, then throw the bought ball.
  await db.execute({ sql: 'update route_accounts set money = 600 where user_id = ?', args: ['shopper'] });
  const open = (await start(db, 'shopper')).event!;
  const midTrade = await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'great', side: 'buy', quantity: 1 }, T);
  check('a trade leaves the open encounter untouched', midTrade.state.activeEvent?.id === open.id && midTrade.state.activeEvent.revision === open.revision);
  const greatThrow = await chooseRoute(db, 'shopper', { requestId: rid(), eventId: open.id, expectedRevision: open.revision, choice: 'catch', ballId: 'great' }, T);
  check('the bought Great Ball can be thrown', greatThrow.event?.catch?.ballId === 'great' && await have('great') === 0);
  console.log('[consistent state snapshot]');
  await onboardUser(db, 'snapshot', 6, 30);
  await activateRoute(db, 'snapshot', 'activate', T);
  const snapshotEvent = (await start(db, 'snapshot')).event!;
  let releaseAccount!: () => void;
  const accountGate = new Promise<void>((resolve) => { releaseAccount = resolve; });
  let signalRows!: () => void;
  const rowsStarted = new Promise<void>((resolve) => { signalRows = resolve; });
  function delayAccount<T extends { execute: Db['execute'] }>(executor: T): T {
    return new Proxy(executor, { get(target, property) {
      if (property === 'execute') return async (...args: Parameters<Db['execute']>) => {
        const sql = typeof args[0] === 'string' ? args[0] : args[0].sql;
        if (sql.includes('select * from route_accounts')) await accountGate;
        const result = await target.execute(...args);
        if (sql.includes('select item_id, quantity')) signalRows();
        return result;
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  const delayedDb = new Proxy(delayAccount(db), { get(target, property) {
    if (property === 'transaction') return async (...args: Parameters<Db['transaction']>) => delayAccount(await db.transaction(...args));
    return Reflect.get(target, property);
  } });
  const stateInFlight = loadRouteState(delayedDb, 'snapshot', T + 2);
  await rowsStarted;
  const interleaved = await chooseRoute(db, 'snapshot', { requestId: 'interleaved', eventId: snapshotEvent.id, expectedRevision: 0, choice: 'catch', ballId: 'poke' }, T + 1);
  releaseAccount();
  const snapshotState = await stateInFlight;
  const snapshotQuantity = snapshotState.inventory.stacks.find((stack) => stack.itemId === 'poke')?.quantity;
  check('state revision and inventory quantities share one read snapshot', snapshotState.revision === interleaved.state.revision ? snapshotQuantity === 19 : snapshotQuantity === 20 && snapshotState.inventory.revision < interleaved.state.inventory.revision);
  console.log('[legacy retirement]');
  const legacy = await onboardUser(db, 'legacy', 6, 30);
  const old = await startActivity(db, 'legacy', { mode: 'train', locationId: 'r1', partyIds: [legacy.id], requestId: 'old' }, T);
  const oldId = old.status === 'ok' ? old.activity.id : '';
  delete process.env.ROUTE_ACTIONS_CUTOVER_AT;
  await rejects('missing cutoff rolls back activation and valid activity', activateRoute(db, 'legacy', 'upgrade', T + 86400000), 503);
  check('failed retirement leaves supply uninitialized and legacy open', await readRouteAccount(db, 'legacy') === null && (await readOpenActivity(db, 'legacy'))?.id === oldId);
  process.env.ROUTE_ACTIONS_CUTOVER_AT = String(T + 600000);
  const migrated = await activateRoute(db, 'legacy', 'upgrade', T + 86400000);
  check('training retirement never grants post-cutover elapsed time', migrated.state.legacy.result?.elapsedMs === 600000 && migrated.state.legacy.pending === false && migrated.state.legacy.result?.cleared === false);
  const historical = await finishLegacyRoute(db, 'legacy', oldId, T + 172800000);
  check('old finish shares immutable retirement result', eq(historical.result, migrated.state.legacy.result));
  await dismissResult(db, 'legacy', oldId, T + 172800001);
  const dismissedLegacy = await loadRouteState(db, 'legacy', T + 172800002);
  check('dismissed retirement result stays dismissed while transition notice remains', dismissedLegacy.legacy.result === null && dismissedLegacy.legacy.notice !== null && (await readActivity(db, 'legacy', oldId))?.result !== null);
  const nullStarter = await onboardUser(db, 'nulllegacy', 6, 30);
  await db.execute({ sql: 'insert into idle_sessions (id,user_id,route_id,party_ids,seed,started_at) values (?,?,?,?,?,?)', args: ['null-row', 'nulllegacy', 'r1', JSON.stringify([nullStarter.id]), 'null-seed', T] });
  const nullMigration = await activateRoute(db, 'nulllegacy', 'upgrade', T + 86400000);
  check('null-version historical rows use explicit training fallback', nullMigration.state.legacy.result?.legacy === true && nullMigration.state.legacy.result?.elapsedMs === 600000);
  await onboardUser(db, 'malformed');
  await db.execute({ sql: 'insert into idle_sessions (id,user_id,route_id,party_ids,seed,started_at,state) values (?,?,?,?,?,?,?)', args: ['broken', 'malformed', 'unknown', '[]', 'badseed', T, '{"preserve":true}'] });
  const bad = await activateRoute(db, 'malformed', 'upgrade', T + 1);
  check('malformed historical activity closes with notice and preserved data', !bad.state.legacy.pending && bad.state.legacy.notice?.includes('could not be read') === true && eq((await readActivity(db, 'malformed', 'broken'))?.state, { preserve: true }));
  const exStarter = await onboardUser(db, 'expedition', 6, 30);
  const ex = await startActivity(db, 'expedition', { mode: 'explore', locationId: 'r1', partyIds: [exStarter.id], requestId: 'oldex' }, T);
  const exId = ex.status === 'ok' ? ex.activity.id : '';
  await stepExpedition(db, 'expedition', { activityId: exId, step: 0, choice: 'fight' }, T + 1);
  const prior = (await readActivity(db, 'expedition', exId))!;
  const expUnits = (prior.state as { expUnits: number }).expUnits;
  const exMigration = await activateRoute(db, 'expedition', 'upgrade', T + 86400000);
  check('expedition retirement pays only banked EXP without advancing guardian', exMigration.state.legacy.result?.rawExp === expUnits && exMigration.state.legacy.result.cleared === false && (await readActivity(db, 'expedition', exId))?.step === prior.step);

  // A trainer's Pokémon counts as seen, like a wild one. The seed is random, so search until a trainer shows.
  await onboardUser(db, 'sightings', 6, 30);
  await activateRoute(db, 'sightings', 'activate', T);
  let met: RouteEvent | null = null;
  for (let i = 0; i < 12 && !met; i++) {
    const found = (await start(db, 'sightings', 'npc')).event!;
    if (found.kind === 'trainer') met = found;
    else if (found.phase !== 'resolved') await leave(db, 'sightings', found);
  }
  const metDex = met?.foe?.dexId ?? -1;
  const sightings = await readDiscoveries(db, 'sightings');
  check('a trainer’s Pokémon is recorded as seen on the route', met !== null && eq(met.newSeen, [metDex])
    && sightings.some((d) => d.locationId === 'r1' && d.kind === 'seen' && d.ref === String(metDex)));

  // Schema invariant itself, independent of domain checks.
  const sample = (await readRouteEvent(db, 'u1', trainer.event.id))!;
  const duplicate = { ...sample, id: 'constraint-a', active: true };
  await insertRouteEvent(db, 'constraint', duplicate);
  let constrained = false;
  try { await insertRouteEvent(db, 'constraint', { ...duplicate, id: 'constraint-b' }); } catch { constrained = true; }
  check('database enforces one unresolved event per account', constrained);
  await acceptRouteQuest(db, 'u2', 'meadow-survey', T);

  // Travel stamina: new accounts backfill a full meter in town; existing route players stay in the meadow.
  await onboardUser(db, 'walker', 10, 5);
  await activateRoute(db, 'walker', 'activate', T);
  const fresh = await loadRouteState(db, 'walker', T);
  const freshRow = await readRouteAccount(db, 'walker');
  check('a new account reads a full travel meter in town without writing it', fresh.travel.available === 12 && fresh.travel.nextRefillAt === null && fresh.trainerAt === 'home' && freshRow?.travel === null && freshRow?.location === null);
  check('town quotes a 4-point walk to Sunny Meadow', eq(fresh.quotes, [{ to: 'r1', walk: 4, cost: 4, mode: 'walk', via: null }]));
  await db.execute({ sql: 'update route_accounts set location = null where user_id = ?', args: ['u1'] });
  check('an account with route history backfills into Sunny Meadow', (await loadRouteState(db, 'u1', T)).trainerAt === 'r1');
} finally { t.cleanup(); }
finish();
