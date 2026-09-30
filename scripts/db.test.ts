/**
 * Database helpers against an in-memory libSQL — schema applies cleanly and
 * the slice 1 helpers round-trip.
 *
 *   npx --yes tsx scripts/db.test.ts
 */
import { createClient } from '@libsql/client';
import {
  insertProfileWithStarter,
  applySchema,
  insertOwned,
  readOwnedByIds,
  updateOwnedNickname,
  updateOwnedEvolution,
  readProfile,
  readOwnedByUser,
  insertOwnedOnce,
  insertSession,
  readOpenSession,
  readSessionById,
  claimSession,
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
const u1Starter = await insertProfileWithStarter(
  db,
  { userId: 'u1', profession: 'trainer', mentor: 'oak', currentRoute: 'r1', createdAt: 2 },
  { dexId: 1, level: 5, sign: 'aries', shiny: false, altColor: false },
  2,
);
const p = await readProfile(db, 'u1');
check('profile round-trips', p?.mentor === 'oak' && p?.starterId === u1Starter.id);

console.log('\n[3] idle sessions');
check('no open session', (await readOpenSession(db, 'u1')) === null);
await insertSession(db, { id: 's1', userId: 'u1', routeId: 'r1', partyIds: [mon.id], seed: 'abc', startedAt: 10 });
let dupThrew = false;
try {
  await insertSession(db, { id: 's1b', userId: 'u1', routeId: 'r1', partyIds: [mon.id], seed: 'def', startedAt: 11 });
} catch {
  dupThrew = true;
}
check('second open session rejected', dupThrew);
const open = await readOpenSession(db, 'u1');
check('open session found', open?.id === 's1' && open.partyIds[0] === mon.id && open.claimedAt === null);
await insertEncounters(db, 's1', [{ slot: 0, dexId: 16, level: 4, won: true, turns: 9 }]);
check('first claim wins', await claimSession(db, 's1', 'u1', { claimedAt: 20, stoppedBy: 'early', encounters: 1, log: '{"x":1}' }));
check('second claim loses', !(await claimSession(db, 's1', 'u1', { claimedAt: 99, stoppedBy: 'loss', encounters: 5, log: '{}' })));
check('closed session no longer open', (await readOpenSession(db, 'u1')) === null);
const closed = await readSessionById(db, 'u1', 's1');
check('closed fields stored', closed?.claimedAt === 20 && closed.stoppedBy === 'early' && closed.encounters === 1);
check('wrong user gets null', (await readSessionById(db, 'u2', 's1')) === null);

console.log('\n[4] atomic onboarding');
const spec = { dexId: 1, level: 5, sign: 'aries', shiny: false, altColor: false } as const;
const base3 = { userId: 'u3', profession: 'trainer', mentor: 'oak', currentRoute: 'r1', createdAt: 5 };
await insertProfileWithStarter(db, base3, spec, 5);
const p3 = await readProfile(db, 'u3');
const owned3 = await readOwnedByUser(db, 'u3');
check('u3 profile readable', p3?.mentor === 'oak');
check('u3 one starter matching profile', owned3.length === 1 && owned3[0].origin === 'starter' && owned3[0].id === p3?.starterId);
let threw = false;
try {
  await insertProfileWithStarter(db, base3, spec, 6);
} catch {
  threw = true;
}
check('second onboard rejected', threw);
check('no orphan starter', (await readOwnedByUser(db, 'u3')).length === 1);

console.log('\n[5] once-per-origin mint (tutorial gift)');
const giftSpec = { dexId: 16, level: 3, sign: 'leo', shiny: false, altColor: false } as const;
await insertOwned(db, 'u4', spec, 'starter', 7);
const gift1 = await insertOwnedOnce(db, 'u4', giftSpec, 'tutorial', 8);
const gift2 = await insertOwnedOnce(db, 'u4', giftSpec, 'tutorial', 9);
check('first gated mint returns a row', gift1 !== null && gift1.origin === 'tutorial' && gift1.dexId === 16);
check('second gated mint returns null', gift2 === null);
check('user still has exactly two rows', (await readOwnedByUser(db, 'u4')).length === 2);

console.log('\n[6] legacy account: prior catches do not block the tutorial gift');
await insertOwned(db, 'u5', { dexId: 25, level: 20, sign: 'leo', shiny: false, altColor: false }, 'catch', 1);
await insertOwned(db, 'u5', { dexId: 133, level: 18, sign: 'leo', shiny: false, altColor: false }, 'catch', 2);
await insertOwned(db, 'u5', spec, 'starter', 3);
const legacyGift = await insertOwnedOnce(db, 'u5', giftSpec, 'tutorial', 4);
check('legacy user with three rows still gets the gift', legacyGift !== null && legacyGift.origin === 'tutorial');
check('legacy user second gift refused', (await insertOwnedOnce(db, 'u5', giftSpec, 'tutorial', 5)) === null);
const legacyRows = await readOwnedByUser(db, 'u5');
check('legacy user owns four rows, one tutorial', legacyRows.length === 4 && legacyRows.filter((m) => m.origin === 'tutorial').length === 1);

console.log('\n[7] parallel gift requests mint once');
await insertOwned(db, 'u6', spec, 'starter', 1);
const racers = await Promise.all(Array.from({ length: 5 }, (_, i) => insertOwnedOnce(db, 'u6', giftSpec, 'tutorial', 10 + i)));
check('exactly one parallel mint succeeds', racers.filter((r) => r !== null).length === 1);
check('u6 owns exactly one tutorial row', (await readOwnedByUser(db, 'u6')).filter((m) => m.origin === 'tutorial').length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
