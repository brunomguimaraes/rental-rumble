/**
 * Idle claim against a real (temp file) libSQL database — two concurrent
 * claims of one session pay out exactly once, and the growth written matches
 * what the pinned seed predicts.
 *
 *   npx --yes tsx scripts/idle-api.test.ts
 *
 * A file database, not `:memory:`: the libsql local client opens a new
 * connection for each transaction, which would see an empty in-memory db.
 */
import { createClient } from '@libsql/client';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySchema, insertOwned, insertSession, readOwnedByIds, readSessionById } from '../api/_db.js';
import { claimIdleSession } from '../api/_idle.js';
import { simulateIdle } from '../src/game/idle.js';
import { routeById, encountersFor } from '../src/game/routes.js';
import { ownedMonToCreature } from '../src/game/box.js';
import { applyGrowthWithEvolution } from '../src/game/evolution.js';
import { RNG } from '../src/game/rng.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const path = join(tmpdir(), `idle-test-${Date.now()}.db`);
const db = createClient({ url: `file:${path}` });

try {
  await applySchema(db);

  const uid = 'idle-user';
  const now = Date.now();
  const startedAt = now - 2 * 60 * 60 * 1000;
  const starter = await insertOwned(db, uid, { dexId: 10, level: 5, sign: 'aries', shiny: false, altColor: false }, 'starter', startedAt - 1000);
  const seed = 'claim-race-seed';
  await insertSession(db, { id: 'sess-1', userId: uid, routeId: 'r1', partyIds: [starter.id], seed, startedAt });

  console.log('[1] concurrent claims');
  const results = await Promise.all([claimIdleSession(db, uid, 'sess-1', now), claimIdleSession(db, uid, 'sess-1', now)]);
  const statuses = results.map((r) => r.status).sort();
  check(`exactly one ok and one already_claimed (got ${statuses.join(', ')})`, statuses[0] === 'already_claimed' && statuses[1] === 'ok');

  console.log('\n[2] growth matches the seed');
  const route = routeById('r1')!;
  const creature = ownedMonToCreature(starter)!;
  const expected = simulateIdle([creature], seed, route, encountersFor(now - startedAt, route));
  const grown = applyGrowthWithEvolution(starter, expected.wins * route.expPerWin, new RNG(`evolve:${starter.id}:${seed}`));
  const [row] = await readOwnedByIds(db, uid, [starter.id]);
  check('some wins happened', expected.wins > 0);
  check(`level matches (${row.level} vs ${grown.mon.level})`, row.level === grown.mon.level);
  check(`exp matches (${row.exp} vs ${grown.mon.exp})`, row.exp === grown.mon.exp);
  check('species matches', row.dexId === grown.mon.dexId);
  const ok = results.find((r) => r.status === 'ok');
  check('ok result reports the same wins', ok?.status === 'ok' && ok.log.wins === expected.wins);
  const stored = await readSessionById(db, uid, 'sess-1');
  check('session is closed with the claim time', stored?.claimedAt === now);

  console.log('\n[3] retries');
  check('a third claim is already_claimed', (await claimIdleSession(db, uid, 'sess-1', now + 1000)).status === 'already_claimed');
  check('an unknown session is not_found', (await claimIdleSession(db, uid, 'nope', now)).status === 'not_found');
  const [again] = await readOwnedByIds(db, uid, [starter.id]);
  check('no second payout', again.exp === row.exp && again.level === row.level);
} finally {
  db.close();
  for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(path + suffix, { force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
