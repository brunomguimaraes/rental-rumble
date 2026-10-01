/**
 * The dev-only `grow` action through the real dispatcher: refused outside local
 * dev, owner-scoped, and it writes exactly one growth.
 *
 *   npx --yes tsx scripts/grow.test.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'rr-grow-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'grow.db')}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.AUTH_SECRET = 'grow-test-secret-0123456789abcdef';
process.env.VERCEL_ENV = 'production';

const { default: handler } = await import('../api/me/[action].js');
const { getDb, applySchema, insertOwned, readOwnedByIds } = await import('../api/_db.js');
const { signSession } = await import('../api/_session.js');
const { mintStats } = await import('../src/game/growth.js');
const { MAX_LEVEL } = await import('../src/game/levels.js');
const { RNG } = await import('../src/game/rng.js');

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

type Json = Record<string, unknown>;
/** Drive the dispatcher the way scripts/dev-api.ts does: query.action, a JSON body, a cookie header. */
function call(action: string, opts: { method?: string; body?: unknown; uid?: string } = {}): Promise<{ status: number; json: Json; allow?: string }> {
  return new Promise((resolve) => {
    const cookie = opts.uid ? `rr_session=${signSession(opts.uid, process.env.AUTH_SECRET as string)}` : '';
    const req = {
      method: opts.method ?? 'POST',
      query: { action },
      body: opts.body ?? {},
      headers: cookie ? { cookie } : {},
      cookies: {},
    };
    let status = 200;
    const headers: Record<string, string> = {};
    const res = {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
      status(c: number) {
        status = c;
        return res;
      },
      json(j: Json) {
        resolve({ status, json: j, allow: headers.Allow });
        return res;
      },
    };
    void handler(req as never, res as never);
  });
}

try {
  console.log('[1] refused outside local dev');
  const prod = await call('grow', { uid: 'u1', body: { id: 'x' } });
  check('404 in production', prod.status === 404);

  process.env.VERCEL_ENV = 'development';
  const db = getDb();
  if (!db) throw new Error('no db');
  await applySchema(db);
  const mon = await insertOwned(db, 'u1', { dexId: 10, level: 5, stats: mintStats(10, 5, new RNG('t')), sign: 'aries', shiny: false, altColor: false }, 'starter', 1);

  console.log('\n[2] gate, ownership, and one growth');
  check('401 without a session', (await call('grow', { body: { id: mon.id } })).status === 401);
  const get = await call('grow', { uid: 'u1', method: 'GET', body: { id: mon.id } });
  check('405 with Allow on GET', get.status === 405 && get.allow === 'POST');
  check('400 without an id', (await call('grow', { uid: 'u1', body: {} })).status === 400);
  check("404 for another user's Pokémon", (await call('grow', { uid: 'u2', body: { id: mon.id } })).status === 404);
  const [untouched] = await readOwnedByIds(db, 'u1', [mon.id]);
  check('nothing was written by the refused calls', untouched.level === 5);

  const grown = await call('grow', { uid: 'u1', body: { id: mon.id } });
  const gm = grown.json.mon as { level: number; exp: number; stats: Record<string, number> };
  const growths = grown.json.growths as unknown[];
  check('200 and one hidden level up', grown.status === 200 && grown.json.ok === true && gm.level === 6);
  check('exactly one growth event', growths.length === 1);
  check('the bar starts over', gm.exp === 0);
  const [row] = await readOwnedByIds(db, 'u1', [mon.id]);
  check('the row persisted level and stats', row.level === 6 && JSON.stringify(row.stats) === JSON.stringify(gm.stats));

  console.log('\n[3] nothing past the cap');
  const capped = await insertOwned(db, 'u1', { dexId: 10, level: MAX_LEVEL, stats: mintStats(10, MAX_LEVEL, new RNG('c')), sign: 'aries', shiny: false, altColor: false }, 'catch', 2);
  check('400 at the cap', (await call('grow', { uid: 'u1', body: { id: capped.id } })).status === 400);

  db.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
