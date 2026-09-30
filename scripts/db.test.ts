/**
 * Database helpers against an in-memory libSQL — schema applies cleanly and
 * the slice 1 helpers round-trip.
 *
 *   npx --yes tsx scripts/db.test.ts
 */
import { createClient } from '@libsql/client';
import {
  applySchema,
  insertOwned,
  readOwnedByIds,
  updateOwnedNickname,
  updateOwnedEvolution,
  readProfile,
  insertProfile,
  insertSession,
  readOpenSession,
  readSessionById,
  closeSession,
  insertEncounters,
} from '../api/_db.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const db = createClient({ url: ':memory:' });
await applySchema(db);
await applySchema(db); // idempotent

console.log('[1] owned + nickname + evolution');
const mon = await insertOwned(db, 'u1', { dexId: 10, level: 5, sign: 'aries', shiny: false, altColor: false }, 'starter', 1);
await updateOwnedNickname(db, 'u1', mon.id, 'Cat');
let [row] = await readOwnedByIds(db, 'u1', [mon.id]);
check('nickname stored', row.nickname === 'Cat');
check('origin starter', row.origin === 'starter');
await updateOwnedEvolution(db, 'u1', { ...row, dexId: 11, level: 8, exp: 3 });
[row] = await readOwnedByIds(db, 'u1', [mon.id]);
check('evolution written', row.dexId === 11 && row.level === 8 && row.exp === 3);
check('other user cannot read it', (await readOwnedByIds(db, 'u2', [mon.id])).length === 0);

console.log('\n[2] profile');
check('no profile yet', (await readProfile(db, 'u1')) === null);
await insertProfile(db, { userId: 'u1', profession: 'trainer', mentor: 'oak', starterId: mon.id, currentRoute: 'r1', createdAt: 2 });
const p = await readProfile(db, 'u1');
check('profile round-trips', p?.mentor === 'oak' && p?.starterId === mon.id);

console.log('\n[3] idle sessions');
check('no open session', (await readOpenSession(db, 'u1')) === null);
await insertSession(db, { id: 's1', userId: 'u1', routeId: 'r1', partyIds: [mon.id], seed: 'abc', startedAt: 10 });
const open = await readOpenSession(db, 'u1');
check('open session found', open?.id === 's1' && open.partyIds[0] === mon.id && open.claimedAt === null);
await insertEncounters(db, 's1', [{ slot: 0, dexId: 16, level: 4, won: true, turns: 9 }]);
await closeSession(db, 's1', { claimedAt: 20, stoppedBy: 'early', encounters: 1, log: '{"x":1}' });
check('closed session no longer open', (await readOpenSession(db, 'u1')) === null);
const closed = await readSessionById(db, 'u1', 's1');
check('closed fields stored', closed?.claimedAt === 20 && closed.stoppedBy === 'early' && closed.encounters === 1);
check('wrong user gets null', (await readSessionById(db, 'u2', 's1')) === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
