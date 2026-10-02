import {
  acceptRouteQuest, advanceRouteRevision, BOX_LIMIT, changeInventory, changeMoney, countOwned,
  dismissRouteEvent, healAllOwned, hasRouteEvents, insertOwned, insertRouteAccount,
  insertRouteReceipt, markRouteQuestClaimed, openWriteTx, readActiveRouteEvent, readActivity,
  readDiscoveries, readInventoryRows, readLastRouteId, readOpenActivity, readOwnedByIds, readOwnedByUser,
  readProfile, readProgress, readRouteAccount, readRouteEvent, readRouteQuest, readRouteQuests, readRouteReceipt,
  readUnseenResult, readUnseenRouteEvent, recordCaughtDex, updateOwnedGrowth, updateProfileParty, updateRouteEvent, writeOwnedHp, writeRouteAllowance, writeTravel,
  type Db, type Executor, type RouteAccountRow, type RouteEventRow,
} from './_db.js';
import { fail, RouteError } from './_route-error.js';
import { commitFind } from './_route-finds.js';
import { isTravelPlace, quoteTravel, spendTravel, TRAVEL_RULES, travelQuotes, travelView, type TravelPlace } from '../src/game/travel.js';
import type { MeterRecord } from '../src/game/meter.js';
import { retireLegacyActivity } from './_world.js';
import { parseResult, planGrowth } from '../src/game/activity.js';
import { isFainted, partyStanding } from '../src/game/health.js';
import { PARTY_MAX, parsePartyInput, partyMembers, resolveParty, sameParty } from '../src/game/party.js';
import { EMPTY_PROGRESS } from '../src/game/world.js';
import { formatMoney, isCaptureBallId, isItemId, itemById, tradeTotal } from '../src/game/items.js';
import {
  allowanceView, battlePrize, captureChance, legalChoices, MEADOW_LANDMARKS, rollCapture,
  ROUTE_RULES, simulateRouteBattle, spendAllowance,
} from '../src/game/route-rules.js';
import { isQuestId, questRecords, questViews } from '../src/game/route-quests.js';
import { applyMoves, isSolved, MAX_PUZZLE_MOVES } from '../src/game/sliding-puzzle.js';
import type {
  InventoryState, MarketTradeInput, QuestId, RouteChoice, RouteChooseInput, RouteQuestInput, RouteReply, RouteSearchInput,
  RouteState, RouteTravelInput, SearchKind, StoredRouteEvent,
} from '../src/game/route-actions.js';

export { RouteError };

const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
export const validRouteRequestId = validId;

/** The cards whose searches the server runs. */
const SEARCH_KINDS: readonly SearchKind[] = ['wild', 'trainer', 'puzzle', 'quest', 'explore', 'forage'];
export function parseRouteSearch(body: Record<string, unknown>): RouteSearchInput | null {
  const partyIds = parsePartyInput(body.partyIds);
  if (!validId(body.requestId) || body.locationId !== 'r1' || !SEARCH_KINDS.includes(body.kind as SearchKind) || !partyIds) return null;
  const kind = body.kind as SearchKind;
  // Only a quest search names its quest, and it must.
  if (kind === 'quest' ? !isQuestId(body.questId) : body.questId !== undefined) return null;
  return { requestId: body.requestId, locationId: 'r1', kind, partyIds, ...(kind === 'quest' ? { questId: body.questId as QuestId } : {}) };
}
const CHOICES: readonly RouteChoice[] = ['battle', 'catch', 'leave', 'accept', 'decline', 'talk', 'solve'];
/** A solve's move list: 1 to MAX_PUZZLE_MOVES board indexes. */
const validMoves = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 1 && v.length <= MAX_PUZZLE_MOVES
  && v.every((m) => Number.isInteger(m) && m >= 0 && m < ROUTE_RULES.puzzle.size ** 2);
export function parseRouteChoose(body: Record<string, unknown>): RouteChooseInput | null {
  if (!validId(body.requestId) || !validId(body.eventId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) return null;
  if (!CHOICES.includes(body.choice as RouteChoice)) return null;
  if (body.choice === 'catch' ? !isCaptureBallId(body.ballId) : body.ballId !== undefined) return null;
  if (body.choice === 'solve' ? !validMoves(body.moves) : body.moves !== undefined) return null;
  return {
    requestId: body.requestId, eventId: body.eventId, expectedRevision: Number(body.expectedRevision), choice: body.choice as RouteChoice,
    ...(isCaptureBallId(body.ballId) ? { ballId: body.ballId } : {}),
    ...(body.choice === 'solve' ? { moves: body.moves as number[] } : {}),
  };
}
export function parseRouteQuest(body: Record<string, unknown>): RouteQuestInput | null {
  return validId(body.requestId) && body.questId === 'meadow-survey' ? { requestId: body.requestId, questId: 'meadow-survey' } : null;
}

export function parseRouteTravel(body: Record<string, unknown>): RouteTravelInput | null {
  const partyIds = parsePartyInput(body.partyIds);
  if (!validId(body.requestId) || !isTravelPlace(body.to) || !partyIds) return null;
  return { requestId: body.requestId, to: body.to, partyIds };
}

/** Lazy config, mandatory only when an unsettled historical activity exists. */
function cutoverTime(): number {
  const raw = process.env.ROUTE_ACTIONS_CUTOVER_AT;
  const n = raw ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) return fail(503, 'Your previous activity is waiting for the route update. Please try again later.');
  return n;
}
function stored(row: RouteEventRow): StoredRouteEvent {
  const value = row.data as StoredRouteEvent | null;
  if (!value || ![2, 3, 4].includes(value.config?.version ?? 0) || value.event?.id !== row.id) throw new Error('Unreadable route event');
  return value;
}
async function inventoryState(db: Executor, uid: string): Promise<InventoryState> {
  const [account, rows] = await Promise.all([readRouteAccount(db, uid), readInventoryRows(db, uid)]);
  return { revision: account?.inventoryRevision ?? 0, money: account?.money ?? 0, stacks: rows.filter((r): r is InventoryState['stacks'][number] => isItemId(r.itemId)) };
}

/** State is strictly read-only, including allowance projection and legacy notices. */
export async function loadRouteState(db: Db, uid: string, now: number): Promise<RouteState> {
  const tx = await db.transaction('read');
  try { return await loadRouteStateInTx(tx, uid, now); }
  finally { await tx.rollback(); tx.close(); }
}

/** A row from before travel stamina reads as a full meter starting now. */
function travelRecord(account: RouteAccountRow | null, now: number): MeterRecord {
  return account?.travel == null || account.travelRefilledAt == null
    ? { available: TRAVEL_RULES.capacity, refilledAt: now }
    : { available: account.travel, refilledAt: account.travelRefilledAt };
}
const derivedLocation = (routeVisited: boolean, lastRoute: string | null): TravelPlace => routeVisited || lastRoute === 'r1' ? 'r1' : 'home';
async function currentLocation(tx: Executor, uid: string, account: RouteAccountRow | null): Promise<TravelPlace> {
  if (account?.location) return account.location;
  const [routeVisited, lastRoute] = await Promise.all([hasRouteEvents(tx, uid), readLastRouteId(tx, uid)]);
  return derivedLocation(routeVisited, lastRoute);
}

/** All fields and their revisions are read from the same transaction snapshot. */
async function loadRouteStateInTx(db: Executor, uid: string, now: number): Promise<RouteState> {
  const [account, inventory, active, unseen, discoveries, progress, questRows, open, lastRoute, routeVisited, owned, profile, legacyResult] = await Promise.all([
    readRouteAccount(db, uid), inventoryState(db, uid), readActiveRouteEvent(db, uid), readUnseenRouteEvent(db, uid),
    readDiscoveries(db, uid), readProgress(db, uid), readRouteQuests(db, uid), readOpenActivity(db, uid),
    readLastRouteId(db, uid), hasRouteEvents(db, uid), readOwnedByUser(db, uid), readProfile(db, uid), readUnseenResult(db, uid),
  ]);
  const records = questRecords(questRows);
  const quest = records.find((r) => r.questId === 'meadow-survey');
  const landmarks = discoveries.filter((d) => d.locationId === 'r1' && d.kind === 'landmark').map((d) => d.ref);
  const seen = discoveries.filter((d) => d.locationId === 'r1' && d.kind === 'seen').map((d) => Number(d.ref));
  const p = progress.find((r) => r.locationId === 'r1');
  const required = MEADOW_LANDMARKS.map((l) => l.id);
  const transition = account?.transition as { notice?: string } | null;
  const trainerAt = account?.location ?? derivedLocation(routeVisited, lastRoute);
  const party = profile ? partyMembers(resolveParty(profile.party, owned, profile.starterId), owned) : [];
  return {
    serverNow: now, revision: account?.revision ?? 0, activated: account !== null,
    allowance: allowanceView({ available: account?.actions ?? 0, refilledAt: account?.refilledAt ?? now }, now),
    inventory,
    quest: { id: 'meadow-survey', status: quest?.claimedAt != null ? 'claimed' : !quest ? 'not-accepted' : required.every((id) => landmarks.includes(id)) ? 'ready' : 'active', landmarks, required },
    quests: questViews(records, landmarks),
    places: [{ id: 'r1', state: routeVisited || p ? 'discovered' : 'available', progress: { ...EMPTY_PROGRESS, ...p, clearedAt: null, clears: 0, landmarks, seen } }],
    trainerAt, ownedCount: owned.length,
    travel: travelView(travelRecord(account, now), now),
    quotes: travelQuotes(trainerAt, party),
    activeEvent: active ? stored(active).event : null,
    result: unseen ? stored(unseen).event : null,
    legacy: { pending: open !== null, notice: transition?.notice ?? (parseResult(legacyResult?.result) ? 'Your previous journey rewards were already saved.' : null), result: parseResult(legacyResult?.result) },
  };
}

type CommandResult = Pick<RouteReply, 'event' | 'trade' | 'party'>;
async function writeCommand(
  db: Db, uid: string, requestId: string, payload: string, now: number,
  work: (tx: Executor) => Promise<CommandResult | void>,
): Promise<RouteReply> {
  const tx = await openWriteTx(db);
  try {
    const existing = await readRouteReceipt(tx, uid, requestId);
    if (existing) {
      if (existing.payload !== payload) fail(409, 'That request was already used for a different action. Refresh and try again.');
      const receipt = existing.receipt as RouteReply;
      const state = await loadRouteStateInTx(tx, uid, now);
      // A receipt contains the original encounter, while the inventory and overall state are current.
      const reply: RouteReply = { ...receipt, state, box: await readOwnedByUser(tx, uid), replayed: true };
      await tx.rollback();
      return reply;
    }
    const result = await work(tx);
    await advanceRouteRevision(tx, uid);
    const reply: RouteReply = { state: await loadRouteStateInTx(tx, uid, now), box: await readOwnedByUser(tx, uid), ...result };
    await insertRouteReceipt(tx, uid, requestId, payload, reply, now);
    await tx.commit();
    return reply;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally { tx.close(); }
}

export async function activateRoute(db: Db, uid: string, requestId: string, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, requestId, JSON.stringify(['activate']), now, async (tx) => {
    if (!await readProfile(tx, uid)) fail(400, 'Finish onboarding first.');
    if (await readRouteAccount(tx, uid)) return;
    const open = await readOpenActivity(tx, uid);
    const transition = open ? await retireLegacyActivity(tx, uid, open, now, cutoverTime()) : null;
    // Begin exploring is pressed in Sunny Meadow, so the trainer starts there.
    await insertRouteAccount(tx, { uid, actions: ROUTE_RULES.initialActions, now, location: 'r1', transition });
    await changeInventory(tx, uid, 'poke', ROUTE_RULES.starterBalls);
  });
}

async function requireActivated(tx: Executor, uid: string) {
  const account = await readRouteAccount(tx, uid);
  if (!account || await readOpenActivity(tx, uid)) return fail(409, 'Open the map to finish the route update first.');
  return account;
}

export async function travelRoute(db: Db, uid: string, input: RouteTravelInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['travel', input.to, input.partyIds]), now, async (tx) => {
    const account = await requireActivated(tx, uid);
    if (await readActiveRouteEvent(tx, uid)) fail(409, 'Finish or leave your encounter before you travel.');
    const profile = await readProfile(tx, uid);
    if (!profile) return fail(400, 'Finish onboarding first.');
    const owned = await readOwnedByUser(tx, uid);
    const partyIds = resolveParty(profile.party, owned, profile.starterId);
    if (!sameParty(partyIds, input.partyIds)) throw new RouteError(409, 'Your party changed. Check it and try again.', partyIds);
    const from = await currentLocation(tx, uid, account);
    if (from === input.to) fail(400, 'You’re already here.');
    // The price comes from the saved party, never from the request.
    const quote = quoteTravel({ from, to: input.to, party: partyMembers(partyIds, owned) });
    if (!quote) return fail(400, 'You can’t get there from here.');
    const record = travelRecord(account, now);
    const spent = spendTravel(record, now, quote.cost);
    if (!spent) {
      const next = travelView(record, now).nextRefillAt ?? now;
      return fail(400, `Not enough travel stamina — next point in ${Math.max(1, Math.ceil((next - now) / 60_000))} min.`);
    }
    await writeTravel(tx, uid, spent.available, spent.refilledAt, input.to);
  });
}

export async function searchRoute(db: Db, uid: string, input: RouteSearchInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['search', input.locationId, input.kind, input.partyIds, ...(input.questId ? [input.questId] : [])]), now, async (tx) => {
    const account = await requireActivated(tx, uid);
    if (input.locationId !== 'r1') fail(400, 'Only Sunny Meadow is available.');
    if (await currentLocation(tx, uid, account) !== input.locationId) fail(400, 'You can only search Sunny Meadow while you’re there.');
    if (await readActiveRouteEvent(tx, uid)) fail(409, 'Finish or leave your current encounter first.');
    const profile = await readProfile(tx, uid);
    if (!profile) return fail(400, 'Finish onboarding first.');
    const owned = await readOwnedByUser(tx, uid);
    const partyIds = resolveParty(profile.party, owned, profile.starterId);
    if (!partyIds.length) fail(400, 'Choose at least one Pokémon for your party.');
    if (!sameParty(partyIds, input.partyIds)) throw new RouteError(409, 'Your party changed. Check it and try again.', partyIds);
    if (partyMembers(partyIds, owned).every(isFainted)) fail(400, 'Your party needs care. Visit the Pokémon Center in Hearth Town.');
    const spent = spendAllowance({ available: account.actions, refilledAt: account.refilledAt }, now, ROUTE_RULES, ROUTE_RULES.costs[input.kind]);
    if (!spent) return fail(409, 'You have no route actions available. Your next action will refill soon.');
    const event = await commitFind(tx, { uid, kind: input.kind, questId: input.questId, party: partyMembers(partyIds, owned), inventory: await inventoryState(tx, uid), now });
    await writeRouteAllowance(tx, uid, spent.available, spent.refilledAt);
    return { event };
  });
}

export async function chooseRoute(db: Db, uid: string, input: RouteChooseInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['choose', input.eventId, input.expectedRevision, input.choice, input.ballId ?? null, ...(input.moves ? [input.moves] : [])]), now, async (tx) => {
    const account = await requireActivated(tx, uid);
    let joined: string[] | null = null;
    const row = await readRouteEvent(tx, uid, input.eventId);
    if (!row) return fail(404, 'No such encounter.');
    const data = stored(row);
    const e = data.event;
    if (!row.active || row.revision !== input.expectedRevision) fail(409, 'That encounter changed. Check the current result.');
    if (!legalChoices(e.phase).includes(input.choice)) fail(400, 'That choice is not available in this encounter.');
    if (input.choice !== 'catch' && input.ballId !== undefined) fail(400, 'Capture balls can only be used for a catch attempt.');
    if (input.choice === 'battle') {
      if (!data.foe) throw new Error('Battle without a foe');
      e.battle = simulateRouteBattle({ party: e.party, foe: data.foe, seed: data.seed });
      const fielded = e.battle.fielded ?? [];
      const current = await readOwnedByIds(tx, uid, e.party.map((m) => m.id));
      const owned = new Set(current.map((m) => m.id));
      // Damage is written before growth; growth keeps it, so current HP rises with max HP.
      await writeOwnedHp(tx, uid, fielded.filter((f) => owned.has(f.id)).map((f) => ({ id: f.id, hpLost: f.maxHp - f.hp })));
      if (e.battle.won) {
        const standing = new Set(fielded.filter((f) => f.hp > 0).map((f) => f.id));
        const growth = planGrowth(current, e.party.filter((m) => standing.has(m.id)), e.kind === 'wild' ? data.config.wildExp : data.config.trainerExp, data.config.recommended, e.id);
        for (const mon of growth.changed) await updateOwnedGrowth(tx, uid, mon);
        e.members = growth.members;
        const prize = battlePrize(e.kind, data.config);
        if (prize > 0 && !await changeMoney(tx, uid, prize)) throw new Error('Balance overflow');
        e.money = (e.money ?? 0) + prize;
        e.phase = e.kind === 'wild' ? 'catch' : 'resolved';
        e.outcome = 'won';
        if (e.kind === 'wild') e.catchChances = {
          poke: captureChance({ rare: data.foe.view.rare, wonBattle: true, ballId: 'poke', rules: data.config }),
          great: captureChance({ rare: data.foe.view.rare, wonBattle: true, ballId: 'great', rules: data.config }),
        };
      } else { e.phase = 'resolved'; e.outcome = 'lost'; }
      // Whiteout: nobody left standing sends the trainer back to Hearth Town.
      if (!partyStanding(e.party, fielded)) {
        // The travel meter is written back unchanged: the whiteout's walking debit is travel slice 2.
        const meter = travelRecord(account, now);
        await writeTravel(tx, uid, meter.available, meter.refilledAt, 'home');
      }
    } else if (input.choice === 'catch') {
      if (!isCaptureBallId(input.ballId) || !data.foe || e.kind !== 'wild') return fail(400, 'Choose an owned capture ball for a wild Pokémon.');
      if (await countOwned(tx, uid) >= BOX_LIMIT) fail(409, 'Your Box is full. You can still battle or leave.');
      if (!await changeInventory(tx, uid, input.ballId, -1)) fail(409, 'You do not have that ball. Check your Bag.');
      const chance = captureChance({ rare: data.foe.view.rare, wonBattle: e.phase === 'catch', ballId: input.ballId, rules: data.config });
      const caught = rollCapture({ seed: data.seed, rare: data.foe.view.rare, wonBattle: e.phase === 'catch', ballId: input.ballId, rules: data.config });
      const owned = caught ? await insertOwned(tx, uid, data.foe.mint, 'catch', now) : null;
      if (owned) await recordCaughtDex(tx, uid, owned, now);
      // A catch joins the party behind its saved members while there is room; otherwise it waits in the Box.
      if (owned) joined = await joinParty(tx, uid, owned.id);
      e.catch = { ballId: input.ballId, chance, caught, owned, ...(owned ? { joinedParty: joined !== null } : {}) };
      e.items.push({ itemId: input.ballId, quantity: -1 });
      e.phase = 'resolved'; e.outcome = caught ? 'caught' : 'escaped';
    } else if (input.choice === 'solve') {
      // Replay the player's slides from the board the server stored; only a legal, solved finish pays.
      const finish = e.puzzle && input.moves ? applyMoves(e.puzzle.board, input.moves) : null;
      if (!e.puzzle || !finish || !isSolved(finish)) return fail(400, 'That doesn’t solve the puzzle yet.');
      for (const item of e.puzzle.reward) await changeInventory(tx, uid, item.itemId, item.quantity);
      e.items = [...e.items, ...e.puzzle.reward];
      e.phase = 'resolved'; e.outcome = 'solved';
    } else {
      if (input.choice === 'accept') await acceptRouteQuest(tx, uid, 'meadow-survey', now);
      e.phase = 'resolved';
      e.outcome = input.choice === 'accept' ? 'accepted' : input.choice === 'talk' ? 'talked' : e.battle?.won ? 'won' : 'left';
    }
    e.revision++;
    e.choices = legalChoices(e.phase);
    if (e.phase === 'resolved') { e.resolvedAt = now; e.catchChances = null; }
    const changed = await updateRouteEvent(tx, uid, { ...row, revision: e.revision, active: e.phase !== 'resolved', data }, input.expectedRevision);
    if (!changed) fail(409, 'That encounter changed. Check the current result.');
    return { event: e, ...(joined ? { party: joined } : {}) };
  });
}

/** Append a new Pokémon to the saved party when it has room; returns the saved party, or null when it is full. */
async function joinParty(tx: Executor, uid: string, ownedId: string): Promise<string[] | null> {
  const profile = await readProfile(tx, uid);
  if (!profile) return null;
  const current = resolveParty(profile.party, await readOwnedByUser(tx, uid), profile.starterId).filter((id) => id !== ownedId);
  if (current.length >= PARTY_MAX) return null;
  const party = [...current, ownedId];
  await updateProfileParty(tx, uid, party);
  return party;
}

export async function claimRouteQuest(db: Db, uid: string, input: RouteQuestInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['quest-claim', input.questId]), now, async (tx) => {
    await requireActivated(tx, uid);
    if (input.questId !== 'meadow-survey') fail(404, 'No such quest.');
    const quest = await readRouteQuest(tx, uid, input.questId);
    if (!quest) fail(400, 'Speak to the researcher to accept this quest first.');
    if (quest?.claimedAt != null) fail(409, 'You have already received this quest reward.');
    const found = (await readDiscoveries(tx, uid)).filter((d) => d.locationId === 'r1' && d.kind === 'landmark').map((d) => d.ref);
    if (!MEADOW_LANDMARKS.every((l) => found.includes(l.id))) fail(400, 'Find every Sunny Meadow landmark to finish the survey.');
    if (!await markRouteQuestClaimed(tx, uid, input.questId, now)) fail(409, 'You have already received this quest reward.');
    await changeInventory(tx, uid, 'great', ROUTE_RULES.questGreatBalls);
    if (!await changeMoney(tx, uid, ROUTE_RULES.questMoney)) throw new Error('Balance overflow');
  });
}

export function parseMarketTrade(body: Record<string, unknown>): MarketTradeInput | null {
  if (!validId(body.requestId) || !isItemId(body.itemId) || (body.side !== 'buy' && body.side !== 'sell')) return null;
  if (tradeTotal(body.itemId, body.side, body.quantity) === null) return null;
  return { requestId: body.requestId, itemId: body.itemId, side: body.side, quantity: body.quantity as number };
}

/** One market trade: money and stock move together or not at all; a retry replays the receipt. */
export async function tradeMarket(db: Db, uid: string, input: MarketTradeInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['market-trade', input.itemId, input.side, input.quantity]), now, async (tx) => {
    const account = await requireActivated(tx, uid);
    const total = tradeTotal(input.itemId, input.side, input.quantity);
    const item = itemById(input.itemId);
    if (total === null || !item) return fail(400, 'The market doesn’t trade that item that way.');
    if (input.side === 'buy') {
      if (!await changeMoney(tx, uid, -total)) fail(409, `You need ${formatMoney(total - account.money)} more.`);
      await changeInventory(tx, uid, input.itemId, input.quantity);
    } else {
      if (!await changeInventory(tx, uid, input.itemId, -input.quantity)) fail(409, `You don’t have ${input.quantity} ${input.quantity === 1 ? item.name : item.plural} to sell.`);
      if (!await changeMoney(tx, uid, total)) throw new Error('Balance overflow');
    }
    return { trade: { itemId: input.itemId, side: input.side, quantity: input.quantity, total } };
  });
}

/**
 * The Pokémon Center: instant, free, every owned Pokémon. It is in Hearth Town, so the trainer must stand
 * there (trips are paid travel), and never during an open encounter. Healing never moves the trainer.
 */
export async function healParty(db: Db, uid: string, requestId: string, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, requestId, JSON.stringify(['heal']), now, async (tx) => {
    if (await readActiveRouteEvent(tx, uid)) fail(409, 'Finish or leave your Sunny Meadow encounter first, then come back to heal.');
    if (await currentLocation(tx, uid, await readRouteAccount(tx, uid)) !== 'home') fail(409, 'Walk back to Hearth Town to visit the Pokémon Center.');
    await healAllOwned(tx, uid);
  });
}

export async function dismissRouteResult(db: Db, uid: string, eventId: string, now: number): Promise<RouteReply> {
  const tx = await openWriteTx(db);
  try {
    const row = await readRouteEvent(tx, uid, eventId);
    if (!row || row.active) fail(404, 'No settled result to dismiss.');
    if (row && row.seenAt === null) {
      await dismissRouteEvent(tx, uid, eventId, now);
      await advanceRouteRevision(tx, uid);
    }
    const reply = { state: await loadRouteStateInTx(tx, uid, now) };
    if (row?.seenAt === null) await tx.commit();
    else await tx.rollback();
    return reply;
  } catch (err) { await tx.rollback().catch(() => {}); throw err; }
  finally { tx.close(); }
}

/** Old tabs share activation's fixed-cutover retirement; never extend idle rewards. */
export async function finishLegacyRoute(db: Db, uid: string, activityId: string, now: number) {
  const tx = await openWriteTx(db);
  try {
    const row = await readActivity(tx, uid, activityId);
    if (!row) fail(404, 'Nothing to collect.');
    const retirement = row ? await retireLegacyActivity(tx, uid, row, now, row.claimedAt === null ? cutoverTime() : now) : null;
    const box = await readOwnedByUser(tx, uid);
    if (row?.claimedAt === null) await tx.commit();
    else await tx.rollback();
    return { ...retirement, box };
  } catch (err) { await tx.rollback().catch(() => {}); throw err; }
  finally { tx.close(); }
}
