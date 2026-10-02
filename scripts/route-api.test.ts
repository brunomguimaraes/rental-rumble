/** HTTP boundary of active route commands: auth, validation, privacy, recovery and retirement. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signSession } from '../api/_session.js';
import { applySchema, readRouteAccount, readRouteEvent } from '../api/_db.js';
import type { RouteReply, RouteState, StoredRouteEvent } from '../src/game/route-actions.js';
import { check, finish, onboardUser, tempDb } from './world-test-kit.js';

const t = await tempDb('route-http');
process.env.TURSO_DATABASE_URL = t.url;
process.env.AUTH_SECRET = 'route-test-session-secret-long-enough';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const { default: handler } = await import('../api/world/[action].js');
type Reply = { status: number; headers: Record<string, string>; body: Record<string, unknown> };
async function call(action: string, body?: unknown, uid: string | null = 'route-user', method = action === 'state' ? 'GET' : 'POST'): Promise<Reply> {
  const token = uid ? signSession(uid, process.env.AUTH_SECRET!) : null;
  const req = { method, query: { action }, body, headers: token ? { cookie: `rr_session=${token}` } : {}, cookies: token ? { rr_session: token } : {} } as unknown as VercelRequest;
  const out: Reply = { status: 200, headers: {}, body: {} };
  const res = {
    status(n: number) { out.status = n; return res; },
    setHeader(k: string, v: unknown) { out.headers[k.toLowerCase()] = String(v); return res; },
    json(b: unknown) { out.body = b as Record<string, unknown>; return res; },
    end() { return res; },
  };
  await handler(req, res as unknown as VercelResponse);
  return out;
}
try {
  const s = await onboardUser(t.db, 'route-user', 1);
  await onboardUser(t.db, 'other', 4);
  for (const action of ['state', 'activate', 'search', 'choose', 'quest-claim', 'result-dismiss', 'heal', 'market-trade', 'travel']) {
    check(`${action} requires login`, (await call(action, {}, null)).status === 401);
    if (action !== 'state') {
      const r = await call(action, {}, 'route-user', 'GET');
      check(`${action} requires POST before session work`, r.status === 405 && r.headers.allow === 'POST');
    }
  }
  check('state GET never initializes rewards', (await call('state')).body.ok === true && await readRouteAccount(t.db, 'route-user') === null);
  check('state rejects write methods', (await call('state', {}, 'route-user', 'POST')).status === 405);
  check('activation validates malformed JSON safely', (await call('activate', '{invalid')).status === 400);
  const activation = await call('activate', { requestId: 'activate' });
  const activated = activation.body as unknown as RouteReply;
  check('activation contract contains authoritative Bag and allowance', activation.status === 200 && activated.state.activated && activated.state.allowance.available === 12 && activated.state.inventory.stacks[0]?.quantity === 20 && activation.headers['cache-control'] === 'no-store');
  await call('activate', { requestId: 'activate' }, 'other');
  const walkedHome = await call('travel', { requestId: 'home', to: 'home', partyIds: [s.id] });
  check('a trainer activated in Sunny Meadow can walk to town', walkedHome.status === 200 && (walkedHome.body as unknown as RouteReply).state.trainerAt === 'home');
  check('a search from town is refused before spending', (await call('search', { requestId: 'from-town', locationId: 'r1', kind: 'wild', partyIds: [s.id] })).status === 400);
  check('a travel body without a known place is rejected', (await call('travel', { requestId: 'nowhere', to: 'r2', partyIds: [s.id] })).status === 400);
  const trip = await call('travel', { requestId: 'trip', to: 'r1', partyIds: [s.id], cost: 0, mode: 'flyer' });
  const tripState = (trip.body as unknown as RouteReply).state;
  check('a trip ignores a client-named cost and charges the walk', trip.status === 200 && tripState.trainerAt === 'r1' && tripState.travel.available === 4 && tripState.allowance.available === 12);
  const again = await call('travel', { requestId: 'again', to: 'r1', partyIds: [s.id] });
  const againState = again.body.state as RouteState | undefined;
  check('travelling to where you stand is a 400 with recovery state', again.status === 400 && again.body.error === 'You’re already here.' && againState?.trainerAt === 'r1' && againState.travel.available === 4);
  check('unsupported locations are rejected before spending', (await call('search', { requestId: 'bad-route', locationId: 'r2', kind: 'wild', partyIds: [s.id] })).status === 400);
  check('array search kind is rejected instead of string-coerced', (await call('search', { requestId: 'array-kind', locationId: 'r1', kind: ['wild'], partyIds: [s.id] })).status === 400);
  const retiredSearch = await call('search', { requestId: 'old-npc', locationId: 'r1', kind: 'npc', partyIds: [s.id] });
  check('a Find NPC search from an old tab is refused with a refresh sentence', retiredSearch.status === 400 && retiredSearch.body.error === 'Sunny Meadow has new actions. Refresh to see them.');
  check('duplicate party members are rejected', (await call('search', { requestId: 'dup', locationId: 'r1', kind: 'wild', partyIds: [s.id, s.id] })).status === 400);
  const stale = await call('search', { requestId: 'stale', locationId: 'r1', kind: 'wild', partyIds: ['foreign'] });
  check('stale party response supplies current state and party', stale.status === 409 && (stale.body.party as string[])[0] === s.id && (stale.body.state as RouteState).allowance.available === 12);
  const searched = await call('search', { requestId: 'search', locationId: 'r1', kind: 'wild', partyIds: [s.id] });
  const reply = searched.body as unknown as RouteReply;
  const e = reply.event!;
  const stored = (await readRouteEvent(t.db, 'route-user', e.id))!.data as StoredRouteEvent;
  check('HTTP search publishes one persisted event without private seed or mint', searched.status === 200 && reply.state.activeEvent?.id === e.id && !JSON.stringify(searched.body).includes(stored.seed) && !('mint' in (e.foe ?? {})));
  for (const ballId of ['master', 'ultra', '', 1, null]) {
    check(`unsupported ball ${String(ballId)} rejected`, (await call('choose', { requestId: 'ball', eventId: e.id, expectedRevision: 0, choice: 'catch', ballId })).status === 400);
  }
  check('array encounter choice is rejected instead of string-coerced', (await call('choose', { requestId: 'array-choice', eventId: e.id, expectedRevision: 0, choice: ['battle'] })).status === 400);
  check('ball cannot be attached to unrelated action', (await call('choose', { requestId: 'wrong', eventId: e.id, expectedRevision: 0, choice: 'leave', ballId: 'poke' })).status === 400);
  check('missing catch ball is rejected', (await call('choose', { requestId: 'missing', eventId: e.id, expectedRevision: 0, choice: 'catch' })).status === 400);
  for (const [label, moves] of [['an empty list', []], ['501 moves', Array(501).fill(1)], ['a fractional index', [1.5]], ['an index off the board', [9]], ['a string', '1,2']] as const) {
    check(`solve rejects ${label}`, (await call('choose', { requestId: `solve-${label}`, eventId: e.id, expectedRevision: 0, choice: 'solve', moves })).status === 400);
  }
  check('moves cannot ride on another choice', (await call('choose', { requestId: 'moves-leave', eventId: e.id, expectedRevision: 0, choice: 'leave', moves: [1] })).status === 400);
  check('other user cannot choose encounter', (await call('choose', { requestId: 'foreign', eventId: e.id, expectedRevision: 0, choice: 'leave' }, 'other')).status === 404);
  const choice = { requestId: 'leave', eventId: e.id, expectedRevision: 0, choice: 'leave' };
  const done = await call('choose', choice);
  const replay = await call('choose', choice);
  check('lost HTTP reply returns same command receipt', done.status === 200 && replay.status === 200 && replay.body.replayed === true && (replay.body.event as { id: string }).id === e.id);
  check('changed same-ID payload conflicts with recovery state', (await call('choose', { ...choice, choice: 'battle' })).status === 409);
  check('result dismissal accepts only owned settled events', (await call('result-dismiss', { eventId: e.id }, 'other')).status === 404);
  const dismissed = await call('result-dismiss', { eventId: e.id });
  const dismissedAgain = await call('result-dismiss', { eventId: e.id });
  check('result dismissal is idempotent and does not alter actions', dismissed.status === 200 && dismissedAgain.status === 200 && (dismissedAgain.body.state as RouteState).allowance.available === 11 && (dismissedAgain.body.state as RouteState).revision === (dismissed.body.state as RouteState).revision);
  check('unaccepted quest does not grant rewards', (await call('quest-claim', { requestId: 'quest', questId: 'meadow-survey' })).status === 400);
  for (const [label, body] of [
    ['unknown item', { requestId: 'm1', itemId: 'master', side: 'buy', quantity: 1 }],
    ['buying a valuable', { requestId: 'm2', itemId: 'honey', side: 'buy', quantity: 1 }],
    ['quantity 0', { requestId: 'm3', itemId: 'poke', side: 'sell', quantity: 0 }],
    ['quantity 100', { requestId: 'm4', itemId: 'poke', side: 'sell', quantity: 100 }],
    ['fractional quantity', { requestId: 'm5', itemId: 'poke', side: 'sell', quantity: 1.5 }],
    ['string quantity', { requestId: 'm6', itemId: 'poke', side: 'sell', quantity: '3' }],
    ['unknown side', { requestId: 'm7', itemId: 'poke', side: 'steal', quantity: 1 }],
    ['missing request ID', { itemId: 'poke', side: 'sell', quantity: 1 }],
  ] as const) {
    const r = await call('market-trade', body);
    check(`market rejects ${label} with a sentence`, r.status === 400 && r.body.ok === false && typeof r.body.error === 'string');
  }
  const sale = await call('market-trade', { requestId: 'sell-one', itemId: 'poke', side: 'sell', quantity: 1 });
  const saleReply = sale.body as unknown as RouteReply;
  check('a market sale returns the trade and the new balance', sale.status === 200 && JSON.stringify(saleReply.trade) === JSON.stringify({ itemId: 'poke', side: 'sell', quantity: 1, total: 100 }) && saleReply.state.inventory.money === 100 && sale.headers['cache-control'] === 'no-store');
  const short = await call('market-trade', { requestId: 'buy-great', itemId: 'great', side: 'buy', quantity: 1 });
  check('a short purchase is a 409 with recovery state', short.status === 409 && short.body.error === 'You need ₽500 more.' && (short.body.state as RouteState).inventory.money === 100);
  for (const action of ['start', 'step']) {
    const retired = await call(action, { mode: 'train', locationId: 'r1' });
    check(`legacy ${action} has a refresh response`, retired.status === 409 && retired.body.retired === true);
  }
  check('heal requires a request ID', (await call('heal', {})).status === 400);
  const away = await call('heal', { requestId: 'heal-away' });
  check('heal from Sunny Meadow is a 409 with recovery state', away.status === 409 && away.body.error === 'Walk back to Hearth Town to visit the Pokémon Center.' && (away.body.state as RouteState).trainerAt === 'r1');
  await call('travel', { requestId: 'home-to-heal', to: 'home', partyIds: [s.id] });
  const heal = await call('heal', { requestId: 'heal' });
  check('heal in Hearth Town returns state and Box rows', heal.status === 200 && heal.body.ok === true && Array.isArray(heal.body.box) && (heal.body.state as RouteState).trainerAt === 'home' && heal.headers['cache-control'] === 'no-store');
  // Actual missing-new-schema case: legacy account/Box tables still function.
  await t.db.execute('drop table route_receipts');
  const unavailable = await call('activate', { requestId: 'missing-schema' });
  check('missing route schema returns 503 without resetting initialized balance', unavailable.status === 503 && unavailable.body.error === 'The world map isn’t ready yet.' && (await readRouteAccount(t.db, 'route-user'))?.actions === 11);
  await applySchema(t.db);
} finally { t.cleanup(); }
finish();
