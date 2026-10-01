/** Onboarding persistence and HTTP validation against a disposable file database. */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signSession } from '../api/_session.js';
import { applySchema, getDb, readProfile, readOwnedByUser, readUserById } from '../api/_db.js';
import { starterOffer } from '../src/game/professions.js';
import type { Profile } from '../src/game/profile.js';
import { check, finish, tempDb } from './world-test-kit.js';

const t = await tempDb('trainer-identity');
process.env.TURSO_DATABASE_URL = t.url;
process.env.AUTH_SECRET = 'trainer-profile-test-secret-long-enough';
const { default: handler } = await import('../api/me/[action].js');
async function call(action: string, body?: unknown, uid: string | null = 'new', method = action === 'profile' ? 'GET' : 'POST') {
  const token = uid ? signSession(uid, process.env.AUTH_SECRET!) : null;
  const req = { method, query: { action }, body, headers: {}, cookies: token ? { rr_session: token } : {} } as unknown as VercelRequest;
  const out = { status: 200, body: {} as Record<string, unknown>, headers: {} as Record<string, string> };
  const res = {
    status(n: number) { out.status = n; return res; },
    setHeader(k: string, v: unknown) { out.headers[k.toLowerCase()] = String(v); return res; },
    json(b: Record<string, unknown>) { out.body = b; return res; },
  };
  await handler(req, res as unknown as VercelResponse);
  return out;
}
const input = (uid: string) => ({ profession: 'trainer', starter: starterOffer(`offer:${uid}`)[0], displayName: '  Nova  ', avatarId: 'f01', colors: { skinTone: 'tan', hairColor: 'blue' } });
async function user(id: string) {
  await t.db.execute({ sql: 'insert into users (id, email, email_lower, display_name) values (?, ?, ?, ?)', args: [id, `${id}@test.invalid`, `${id}@test.invalid`, 'Old name'] });
}
try {
  await applySchema(t.db);
  for (const id of ['new', 'other', 'legacy', 'rollback', 'refresh', 'unmigrated']) await user(id);
  check('onboarding requires a session', (await call('onboard', input('new'), null)).status === 401);
  check('onboarding requires POST', (await call('onboard', input('new'), 'new', 'GET')).status === 405);
  for (const overrides of [
    { displayName: '' }, { displayName: 'a'.repeat(25) }, { displayName: ['Nova'] },
    { avatarId: '../../elsewhere' }, { avatarId: ['f01'] }, { colors: { skinTone: 'invalid', hairColor: 'blue' } },
    { colors: ['tan', 'blue'] }, { starter: 999999 },
  ]) check('bad input rejected before writes', (await call('onboard', { ...input('new'), ...overrides })).status === 400);
  check('invalid requests leave account and box unchanged', await readProfile(t.db, 'new') === null && (await readOwnedByUser(t.db, 'new')).length === 0 && (await readUserById(t.db, 'new'))?.displayName === 'Old name');
  const created = await call('onboard', input('new'));
  const profile = created.body.profile as Profile;
  check('chosen identity returned with starter', created.status === 200 && created.body.displayName === 'Nova' && profile.avatarId === 'f01' && profile.avatarColors?.hairColor === 'blue' && profile.party[0] === profile.starterId);
  const refreshed = (await call('profile')).body.profile as Profile;
  check('identity survives a fresh read', refreshed.avatarId === 'f01' && refreshed.avatarColors?.skinTone === 'tan' && (await readUserById(t.db, 'new'))?.displayName === 'Nova');
  check('another account was not renamed', (await readUserById(t.db, 'other'))?.displayName === 'Old name');
  const duplicate = await call('onboard', { ...input('new'), displayName: 'Overwrite', avatarId: 'm02' });
  check('repeat onboarding cannot rename or mint twice', duplicate.status >= 400 && (await readOwnedByUser(t.db, 'new')).length === 1 && (await readUserById(t.db, 'new'))?.displayName === 'Nova');

  const oldRequest = await call('onboard', { profession: 'trainer', starter: input('legacy').starter }, 'legacy');
  check('older clients still onboard with an unchanged name', oldRequest.status === 200 && (oldRequest.body.profile as Profile).avatarId === null && (await readUserById(t.db, 'legacy'))?.displayName === 'Old name');

  await t.db.execute("create trigger fail_starter before insert on owned_pokemon when new.user_id = 'rollback' begin select raise(abort, 'test failure'); end");
  const rolledBack = await call('onboard', input('rollback'), 'rollback');
  check('failed starter rolls back identity and name', rolledBack.status === 503 && await readProfile(t.db, 'rollback') === null && (await readUserById(t.db, 'rollback'))?.displayName === 'Old name');
  await t.db.execute('drop trigger fail_starter');

  const apiDb = getDb()!;
  const execute = apiDb.execute.bind(apiDb);
  apiDb.execute = async (statement) => {
    const sql = typeof statement === 'string' ? statement : statement.sql;
    if (sql.includes('select * from owned_pokemon where user_id')) throw new Error('test box refresh failure');
    return execute(statement);
  };
  const refreshFailed = await call('onboard', input('refresh'), 'refresh');
  apiDb.execute = execute;
  check('committed onboarding stays successful when optional box read fails', refreshFailed.status === 200 && refreshFailed.body.ok === true && (await readOwnedByUser(t.db, 'refresh')).length === 1);

  await t.db.execute('alter table profiles drop column avatar_id');
  await t.db.execute('alter table profiles drop column avatar_colors');
  const oldProfile = await call('profile', undefined, 'legacy');
  check('existing profiles remain readable without portrait migration', oldProfile.status === 200 && (oldProfile.body.profile as Profile).starterId !== '');
  const unavailable = await call('onboard', input('unmigrated'), 'unmigrated');
  check('missing migration fails clearly without partial onboarding', unavailable.status === 503 && unavailable.body.error === 'Trainer setup is being updated. Please try again shortly.' && await readProfile(t.db, 'unmigrated') === null && (await readUserById(t.db, 'unmigrated'))?.displayName === 'Old name');
} finally {
  getDb()?.close();
  t.cleanup();
}
finish();
