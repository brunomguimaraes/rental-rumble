/**
 * The world and party endpoints through their real handlers: status codes,
 * response shapes, session and method gates, and the seed staying private.
 * Handlers run against a temp file database through a minimal req/res shim
 * (the same surface scripts/dev-api.ts provides).
 *
 *   npx --yes tsx scripts/world-api.test.ts
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySchema, insertDiscovery, readActivity, readOwnedByUser } from '../api/_db.js';
import { startActivity } from '../api/_world.js';
import { signSession } from '../api/_session.js';
import { legacyDb, legacyOnboard, mintMon, check, finish } from './world-test-kit.js';

const SECRET = 'world-api-test-secret-0123456789';
process.env.AUTH_SECRET = SECRET;
process.env.ROUTE_ACTIONS_CUTOVER_AT = String(Date.now());
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// The database must be chosen before any handler calls getDb() (it caches).
const t = await legacyDb('api');
process.env.TURSO_DATABASE_URL = t.url;
const { default: world } = await import('../api/world/[action].js');
const { default: me } = await import('../api/me/[action].js');

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;
interface Reply {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

async function call(handler: Handler, method: string, action: string, uid: string | null, body?: unknown): Promise<Reply> {
  const cookie = uid ? signSession(uid, SECRET) : null;
  const req = {
    method,
    query: { action },
    body,
    headers: cookie ? { cookie: `rr_session=${cookie}` } : {},
    cookies: cookie ? { rr_session: cookie } : {},
  } as unknown as VercelRequest;
  const out: Reply = { status: 200, headers: {}, body: {} };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(b: unknown) {
      out.body = (b ?? {}) as Record<string, unknown>;
      return res;
    },
    setHeader(k: string, v: unknown) {
      out.headers[k.toLowerCase()] = String(v);
      return res;
    },
    end() {
      return res;
    },
  };
  await handler(req, res as unknown as VercelResponse);
  return out;
}

try {
  const { db } = t;
  const starter = await legacyOnboard(db, 'u1');
  await legacyOnboard(db, 'u2');

  console.log('[1] before db:setup');
  const early = await call(world, 'GET', 'state', 'u1');
  check('the world answers 503 with a player sentence', early.status === 503 && early.body.error === 'The world map isn’t ready yet.');
  const profile0 = await call(me, 'GET', 'profile', 'u1');
  check('the profile still loads', profile0.status === 200 && profile0.body.ok === true);
  const box0 = await call(me, 'GET', 'box', 'u1');
  check('the box still loads', box0.status === 200 && Array.isArray(box0.body.box) && (box0.body.box as unknown[]).length === 1);
  await applySchema(db);

  console.log('\n[2] gates');
  for (const action of ['state', 'start', 'step', 'finish', 'dismiss']) {
    const r = await call(world, action === 'state' ? 'GET' : 'POST', action, null, {});
    check(`${action} without a session is 401`, r.status === 401 && r.body.ok === false);
  }
  const wrongMethod = await call(world, 'GET', 'start', 'u1');
  check('GET on a write is 405 with Allow: POST', wrongMethod.status === 405 && wrongMethod.headers.allow === 'POST');
  check('an unknown action is 404', (await call(world, 'GET', 'nope', 'u1')).status === 404);
  check('an old empty start is retired', (await call(world, 'POST', 'start', 'u1', {})).status === 409);
  check('a broken old request is retired without crashing', (await call(world, 'POST', 'start', 'u1', '{nope')).status === 409);
  check('the box needs a session', (await call(me, 'GET', 'box', null)).status === 401);

  console.log('\n[3] state, start, finish, dismiss');
  const state = await call(world, 'GET', 'state', 'u1');
  check('state has the map, the clock, and the trainer’s spot',
    state.status === 200 && Array.isArray((state.body.state as { places: unknown[] }).places) && typeof (state.body.state as { serverNow: number }).serverNow === 'number' && (state.body.state as { trainerAt: string }).trainerAt === 'home');
  const profile = await call(me, 'GET', 'profile', 'u1');
  const party = (profile.body.profile as { party?: string[] } | undefined)?.party;
  check('the profile carries the resolved party (the starter)', JSON.stringify(party) === JSON.stringify([starter.id]));
  const retired = await call(world, 'POST', 'start', 'u1', { mode: 'train', locationId: 'r1', partyIds: [starter.id], requestId: 'r-1' });
  check('old start requests receive a refresh response', retired.status === 409 && retired.body.retired === true);
  const started = await startActivity(db, 'u1', { mode: 'train', locationId: 'r1', partyIds: [starter.id], requestId: 'legacy-fixture' }, Date.now() - 10000);
  const activity = started.status === 'ok' ? started.activity : undefined;
  const seed = activity ? ((await readActivity(db, 'u1', activity.id))?.seed ?? '') : '';
  check('old steps cannot advance expeditions', (await call(world, 'POST', 'step', 'u1', { activityId: activity?.id, step: 0, choice: 'fight' })).status === 409);
  const later = await call(world, 'POST', 'start', 'u2', { mode: 'explore', locationId: 'r2', requestId: 'later' });
  check('later routes cannot start through legacy HTTP', later.status === 409 && later.body.retired === true);
  check('another trainer’s activity is 404', (await call(world, 'POST', 'finish', 'u2', { activityId: activity?.id })).status === 404);
  const done = await call(world, 'POST', 'finish', 'u1', { activityId: activity?.id });
  check('finishing returns the result and the box', done.status === 200 && typeof done.body.result === 'object' && Array.isArray(done.body.box));
  const again = await call(world, 'POST', 'finish', 'u1', { activityId: activity?.id });
  check('finishing again returns the same result', again.status === 200 && JSON.stringify(again.body.result) === JSON.stringify(done.body.result));
  check('the settled result is not a seed leak', !JSON.stringify(done.body).includes(seed));
  check('dismissing works', (await call(world, 'POST', 'dismiss', 'u1', { activityId: activity?.id })).status === 200);
  check('dismissing nothing is 404', (await call(world, 'POST', 'dismiss', 'u1', { activityId: 'nope' })).status === 404);

  console.log('\n[4] party');
  const extra = await mintMon(db, 'u1', { dexId: 16, level: 5 });
  const foreign = (await readOwnedByUser(db, 'u2'))[0]?.id;
  const bad = await call(me, 'POST', 'party', 'u1', { ids: [starter.id, foreign] });
  check('a foreign Pokémon is 400', bad.status === 400 && bad.body.error === 'That party includes a Pokémon you don’t own.');
  check('an invalid party is 400', (await call(me, 'POST', 'party', 'u1', { ids: [] })).status === 400);
  check('GET on the party save is 405', (await call(me, 'GET', 'party', 'u1')).status === 405);
  const saved = await call(me, 'POST', 'party', 'u1', { ids: [extra.id, starter.id] });
  check('a valid party saves', saved.status === 200 && JSON.stringify(saved.body.party) === JSON.stringify([extra.id, starter.id]));
  const after = await call(me, 'GET', 'profile', 'u1');
  check('the profile shows it', JSON.stringify((after.body.profile as { party?: string[] }).party) === JSON.stringify([extra.id, starter.id]));
  const stale = await call(world, 'POST', 'start', 'u1', { mode: 'train', locationId: 'r1', partyIds: [starter.id], requestId: 'r-4' });
  check('old starts stay retired after party changes', stale.status === 409 && stale.body.retired === true);

  console.log('\n[5] Pokédex seen and caught');
  await insertDiscovery(db, { uid: 'u1', locationId: 'r1', kind: 'seen', ref: '133', foundAt: 1 });
  await insertDiscovery(db, { uid: 'u2', locationId: 'r1', kind: 'seen', ref: '19', foundAt: 1 });
  await db.execute({ sql: 'insert into pokedex_cells (user_id, dex_id, layer, caught_at) values (?, ?, ?, ?)', args: ['u1', 16, 's', 1] });
  const dex = await call(me, 'GET', 'pokedex', 'u1');
  const seenB64 = (dex.body as { seen?: unknown }).seen;
  const seenBits = typeof seenB64 === 'string' ? Buffer.from(seenB64, 'base64') : Buffer.alloc(0);
  const seenBit = (d: number) => ((seenBits[d >> 3] ?? 0) & (1 << (d & 7))) !== 0;
  check('the Pokédex marks route sightings as seen', dex.status === 200 && seenBit(133));
  check('a caught species also counts as seen', seenBit(16));
  check('another player’s sightings stay theirs', !seenBit(19));
} finally {
  t.cleanup();
}

finish();
