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
  readProfile,
  readOwnedByUser,
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

console.log('[1] owned + nickname');
const mon = await insertOwned(db, 'u1', { dexId: 10, level: 5, sign: 'aries', shiny: false, altColor: false }, 'starter', 1);
await updateOwnedNickname(db, 'u1', mon.id, 'Cat');
const [row] = await readOwnedByIds(db, 'u1', [mon.id]);
check('nickname stored', row.nickname === 'Cat');
check('origin starter', row.origin === 'starter');
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

console.log('\n[3] atomic onboarding');
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
