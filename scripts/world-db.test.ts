/**
 * The world's persistence and domain rules against real temp file databases:
 * schema upgrades and SQL helpers, then (from [2]) the activity lifecycle in
 * api/_world.ts with an injected clock.
 *
 *   npx --yes tsx scripts/world-db.test.ts
 */
import {
  applySchema,
  readProfile,
  readOwnedByIds,
  updateOwnedNickname,
  readOpenActivity,
  readActivity,
  readUnseenResult,
  readLastRouteId,
  insertActivityStatement,
  markResultsSeenStatement,
  progressStartStatement,
  updateActivityState,
  closeActivity,
  markResultSeen,
  readProgress,
  applyProgressSettlement,
  readDiscoveries,
  insertDiscovery,
  updateOwnedGrowth,
  updateProfileParty,
  isUniqueViolation,
  isMissingSchema,
  type NewActivity,
} from '../api/_db.js';
import { readOwnedByUser, type Db } from '../api/_db.js';
import {
  loadWorldState,
  startActivity,
  stepExpedition,
  finishActivity,
  dismissResult,
  savePartyIds,
  type StepOutcome,
} from '../api/_world.js';
import { routeById, trainingBattleCount, type ChoiceId, type PlayableId } from '../src/game/world.js';
import { resolveParty } from '../src/game/party.js';
import { tempDb, legacyDb, mintMon, onboardUser, check, finish } from './world-test-kit.js';

const activity = (over: Partial<NewActivity> & { id: string; userId: string }): NewActivity => ({
  routeId: 'r1',
  partyIds: ['m1'],
  seed: 'seed',
  startedAt: 1000,
  mode: 'train',
  rulesVersion: 1,
  partySnapshot: [],
  config: {},
  state: null,
  requestId: 'req',
  ...over,
});

console.log('[1] schema and SQL helpers');
{
  const t = await tempDb('schema');
  try {
    const { db } = t;
    await applySchema(db);
    check('applying the schema twice is harmless', true);

    // Legacy rows: an open pre-map idle session survives the upgrade.
    const legacy = await legacyDb('legacy');
    try {
      await legacy.db.execute({
        sql: 'insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at) values (?, ?, ?, ?, ?, ?)',
        args: ['old1', 'u1', 'r1', '["m1"]', 'abc', 1000],
      });
      let missing = false;
      try {
        await readUnseenResult(legacy.db, 'u1');
      } catch (err) {
        missing = isMissingSchema(err);
      }
      check('before db:setup, reading results reports a missing schema', missing);
      await applySchema(legacy.db);
      const old = await readOpenActivity(legacy.db, 'u1');
      check('the old open session reads back after the upgrade', old?.id === 'old1' && old.routeId === 'r1');
      check('it has no mode, no rules version, and step 0', old?.mode === null && old.rulesVersion === null && old.step === 0);
      check('its party ids survive', JSON.stringify(old?.partyIds) === '["m1"]');
    } finally {
      legacy.cleanup();
    }

    // Activities
    await db.batch([insertActivityStatement(activity({ id: 'a1', userId: 'u1', state: { node: 'x' } }))], 'write');
    const a1 = await readOpenActivity(db, 'u1');
    check('an inserted activity is the open one', a1?.id === 'a1' && a1.mode === 'train' && a1.rulesVersion === 1 && a1.requestId === 'req');
    check('JSON columns parse', JSON.stringify(a1?.state) === '{"node":"x"}');
    let dup = false;
    try {
      await db.batch([insertActivityStatement(activity({ id: 'a2', userId: 'u1' }))], 'write');
    } catch (err) {
      dup = isUniqueViolation(err);
    }
    check('a second open activity for the same trainer is a unique violation', dup);
    check('another trainer cannot read it', (await readActivity(db, 'u2', 'a1')) === null && (await readOpenActivity(db, 'u2')) === null);
    check('a stale step does not write', (await updateActivityState(db, { id: 'a1', uid: 'u1', fromStep: 3, state: { node: 'y' } })) === 0);
    check('the current step writes once', (await updateActivityState(db, { id: 'a1', uid: 'u1', fromStep: 0, state: { node: 'y' } })) === 1);
    check('and advances the step', (await readActivity(db, 'u1', 'a1'))?.step === 1);
    check('the old step no longer writes', (await updateActivityState(db, { id: 'a1', uid: 'u1', fromStep: 0, state: { node: 'z' } })) === 0);
    check('another trainer cannot step it', (await updateActivityState(db, { id: 'a1', uid: 'u2', fromStep: 1, state: {} })) === 0);
    check('a result is not dismissable before settling', (await markResultSeen(db, 'u1', 'a1', 5)) === 0);
    const close = { id: 'a1', uid: 'u1', claimedAt: 2000, stoppedBy: 'cap', encounters: 3, step: 1, state: null, result: { ok: 1 } };
    check('closing an open activity writes once', (await closeActivity(db, close)) === 1);
    check('closing it again does nothing', (await closeActivity(db, { ...close, result: { ok: 2 } })) === 0);
    const closed = await readActivity(db, 'u1', 'a1');
    check('the first close is what is stored', JSON.stringify(closed?.result) === '{"ok":1}' && closed?.claimedAt === 2000);
    check('closing keeps the state when none is given', JSON.stringify(closed?.state) === '{"node":"y"}');
    check('the settled result is unseen', (await readUnseenResult(db, 'u1'))?.id === 'a1');
    check('dismissing marks it seen', (await markResultSeen(db, 'u1', 'a1', 3000)) === 1 && (await readUnseenResult(db, 'u1')) === null);
    await markResultSeen(db, 'u1', 'a1', 9999);
    check('dismissing twice keeps the first time', (await readActivity(db, 'u1', 'a1'))?.seenAt === 3000);

    // A closed legacy row with no result is never offered as a result.
    await db.execute({
      sql: 'insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at, claimed_at, stopped_by, log) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: ['old2', 'u1', 'r2', '[]', 's', 500, 600, 'cap', '{"legacy":true}'],
    });
    check('a legacy claimed row is not an unseen result', (await readUnseenResult(db, 'u1')) === null);
    await db.batch([markResultsSeenStatement('u1', 4000), insertActivityStatement(activity({ id: 'a3', userId: 'u1', routeId: 'lake', startedAt: 5000 }))], 'write');
    check('the last route is the newest start', (await readLastRouteId(db, 'u1')) === 'lake');
    await db.execute({ sql: 'update idle_sessions set state = ? where id = ?', args: ['{broken', 'a3'] });
    check('broken JSON reads as null', (await readActivity(db, 'u1', 'a3'))?.state === null);

    // Progress
    await db.batch([progressStartStatement('u1', 'r1', 'explore'), progressStartStatement('u1', 'r1', 'explore'), progressStartStatement('u1', 'r1', 'train')], 'write');
    await applyProgressSettlement(db, { uid: 'u1', locationId: 'r1', clearedAt: 7000, clears: 1, trainingWins: 0 });
    await applyProgressSettlement(db, { uid: 'u1', locationId: 'r1', clearedAt: 8000, clears: 1, trainingWins: 5 });
    await applyProgressSettlement(db, { uid: 'u1', locationId: 'r2', clearedAt: null, clears: 0, trainingWins: 2 });
    const prog = await readProgress(db, 'u1');
    const r1 = prog.find((p) => p.locationId === 'r1');
    check('starts count explores and trainings', r1?.explores === 2 && r1.trainings === 1);
    check('the first clear time sticks', r1?.clearedAt === 7000 && r1.clears === 2);
    check('training wins add up', r1?.trainingWins === 5 && prog.find((p) => p.locationId === 'r2')?.trainingWins === 2);
    check('a route without a clear has no clear time', prog.find((p) => p.locationId === 'r2')?.clearedAt === null);
    check('progress is per trainer', (await readProgress(db, 'u2')).length === 0);

    // Discoveries
    const d1 = await insertDiscovery(db, { uid: 'u1', locationId: 'r1', kind: 'seen', ref: '16', foundAt: 1 });
    const d2 = await insertDiscovery(db, { uid: 'u1', locationId: 'r1', kind: 'seen', ref: '16', foundAt: 2 });
    await insertDiscovery(db, { uid: 'u1', locationId: 'r1', kind: 'landmark', ref: 'signpost', foundAt: 3 });
    check('a first discovery is new, a repeat is not', d1 && !d2);
    const disc = await readDiscoveries(db, 'u1');
    check('discoveries read back with kinds', disc.length === 2 && disc.some((d) => d.kind === 'landmark' && d.ref === 'signpost'));
    check('discoveries are per trainer', (await readDiscoveries(db, 'u2')).length === 0);

    // Owned growth keeps everything else
    const starter = await onboardUser(db, 'u1');
    await updateOwnedNickname(db, 'u1', starter.id, 'Bug');
    await updateOwnedGrowth(db, 'u2', { ...starter, dexId: 12, level: 30, exp: 0 });
    check('another trainer cannot grow it', (await readOwnedByIds(db, 'u1', [starter.id]))[0]?.level === 5);
    await updateOwnedGrowth(db, 'u1', { ...starter, dexId: 11, level: 8, exp: 3, nickname: undefined });
    const [grown] = await readOwnedByIds(db, 'u1', [starter.id]);
    check('growth writes species, level and EXP', grown?.dexId === 11 && grown.level === 8 && grown.exp === 3);
    check('growth keeps nickname, sign, colour and origin', grown?.nickname === 'Bug' && grown.sign === 'aries' && grown.shiny === false && grown.origin === 'starter');

    // Party column
    const other = await mintMon(db, 'u1', { dexId: 16, level: 5 });
    check('a trainer without a saved party reads null', (await readProfile(db, 'u1'))?.party === null);
    check('saving the party updates one profile', (await updateProfileParty(db, 'u1', [other.id, starter.id])) === 1);
    check('the party reads back in order', JSON.stringify((await readProfile(db, 'u1'))?.party) === JSON.stringify([other.id, starter.id]));
    check('a trainer without a profile saves nothing', (await updateProfileParty(db, 'nobody', ['x'])) === 0);
    await db.execute({ sql: 'update profiles set party = ? where user_id = ?', args: ['{nope', 'u1'] });
    check('a broken party reads as null', (await readProfile(db, 'u1'))?.party === null);
  } finally {
    t.cleanup();
  }
}

// --- The activity lifecycle (api/_world.ts) ---------------------------------------

const T0 = 1_000_000_000;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const r1 = routeById('r1');
if (!r1) throw new Error('missing r1');
const PACE = r1.training.paceMs;

/** Start with whatever party the trainer has saved. */
async function start(db: Db, uid: string, mode: 'train' | 'explore', locationId: PlayableId, now: number, requestId = `req-${Math.random()}`) {
  const profile = await readProfile(db, uid);
  const owned = await readOwnedByUser(db, uid);
  const partyIds = profile ? resolveParty(profile.party, owned, profile.starterId) : [];
  return startActivity(db, uid, { mode, locationId, partyIds, requestId }, now);
}
const openCount = async (db: Db, uid: string) =>
  Number((await db.execute({ sql: 'select count(*) as n from idle_sessions where user_id = ? and claimed_at is null', args: [uid] })).rows[0].n);
const rowOf = async (db: Db, uid: string, id: string) => (await readOwnedByIds(db, uid, [id]))[0];
const unlock = (db: Db, uid: string, locationId: string) => applyProgressSettlement(db, { uid, locationId, clearedAt: 1, clears: 1, trainingWins: 0 });
/** A party that cannot lose on the early routes: the given lead backed by a Lv 50 Machamp. */
async function withChamp(db: Db, uid: string, leadId: string) {
  const champ = await mintMon(db, uid, { dexId: 68, level: 50 });
  await savePartyIds(db, uid, [leadId, champ.id]);
  return champ;
}

console.log('\n[2] party');
{
  const t = await tempDb('party');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    const b = await mintMon(db, 'u1', { dexId: 16, level: 5 });
    const w = await loadWorldState(db, 'u1', T0);
    check('a new trainer sees six routes, Sunny Meadow open', w.places.length === 6 && w.places.find((p) => p.id === 'r1')?.state === 'available');
    check('nothing running, nothing to collect, standing at home', w.activity === null && w.result === null && w.trainerAt === 'home');
    check('an empty party is invalid', (await savePartyIds(db, 'u1', [])).status === 'invalid');
    check('seven members are invalid', (await savePartyIds(db, 'u1', ['a', 'b', 'c', 'd', 'e', 'f', 'g'])).status === 'invalid');
    check('duplicates are invalid', (await savePartyIds(db, 'u1', [s.id, s.id])).status === 'invalid');
    const other = await onboardUser(db, 'u2');
    check('another trainer’s Pokémon is refused', (await savePartyIds(db, 'u1', [s.id, other.id])).status === 'not_owned');
    check('an unknown Pokémon is refused', (await savePartyIds(db, 'u1', ['nope'])).status === 'not_owned');
    const saved = await savePartyIds(db, 'u1', [b.id, s.id]);
    check('a valid party saves in order', saved.status === 'ok' && JSON.stringify((await readProfile(db, 'u1'))?.party) === JSON.stringify([b.id, s.id]));
    const orphan = await mintMon(db, 'np', { dexId: 16, level: 5 });
    check('a trainer without a profile cannot save a party', (await savePartyIds(db, 'np', [orphan.id])).status === 'no_profile');
  } finally {
    t.cleanup();
  }
}

console.log('\n[3] start');
{
  const t = await tempDb('start');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    const first = await start(db, 'u1', 'train', 'r1', T0, 'q1');
    check('a new trainer can train on Sunny Meadow', first.status === 'ok' && first.activity.mode === 'train' && first.activity.party[0]?.id === s.id);
    const firstId = first.status === 'ok' ? first.activity.id : '';
    const busy = await start(db, 'u1', 'explore', 'r1', T0 + 1, 'q2');
    check('a second start is busy and names the running activity', busy.status === 'busy' && busy.activity.id === firstId);
    const retry = await start(db, 'u1', 'train', 'r1', T0 + 2, 'q1');
    check('a retried start returns the same activity', retry.status === 'ok' && retry.activity.id === firstId);

    await onboardUser(db, 'u3');
    check('Mossy Woods starts locked', (await start(db, 'u3', 'train', 'r2', T0)).status === 'locked');
    const s3 = (await readProfile(db, 'u3'))?.starterId ?? '';
    const extra = await mintMon(db, 'u3', { dexId: 16, level: 5 });
    await savePartyIds(db, 'u3', [extra.id, s3]);
    const changed = await startActivity(db, 'u3', { mode: 'train', locationId: 'r1', partyIds: [s3, extra.id], requestId: 'x' }, T0);
    check('a stale party order is refused with the saved one', changed.status === 'party_changed' && JSON.stringify(changed.party) === JSON.stringify([extra.id, s3]));
    check('nobody without a profile can start', (await startActivity(db, 'ghost', { mode: 'train', locationId: 'r1', partyIds: ['x'], requestId: 'x' }, T0)).status === 'no_profile');

    await onboardUser(db, 'u4');
    const [ra, rb] = await Promise.all([start(db, 'u4', 'train', 'r1', T0, 'qa'), start(db, 'u4', 'explore', 'r1', T0, 'qb')]);
    check('two simultaneous starts: one runs, one is busy', JSON.stringify([ra.status, rb.status].sort()) === '["busy","ok"]');
    check('exactly one activity is open', (await openCount(db, 'u4')) === 1);

    await onboardUser(db, 'u5');
    const ex = await start(db, 'u5', 'explore', 'r1', T0);
    check('an expedition opens at the trailhead sighting', ex.status === 'ok' && ex.activity.expedition?.step === 0 && ex.activity.expedition.checkpoint?.kind === 'sighting');
    const seed = ex.status === 'ok' ? (await readActivity(db, 'u5', ex.activity.id))?.seed ?? '' : '';
    const view = await loadWorldState(db, 'u5', T0 + 1);
    check('the seed never reaches the client', seed.length > 0 && !JSON.stringify(ex).includes(seed) && !JSON.stringify(view).includes(seed));
  } finally {
    t.cleanup();
  }
}

console.log('\n[4] training time boundaries');
{
  const t = await tempDb('train');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    const a = await start(db, 'u1', 'train', 'r1', T0);
    const aId = a.status === 'ok' ? a.activity.id : '';
    const early = await finishActivity(db, 'u1', aId, T0 + PACE - 1);
    check('back before the first battle: no battles, no EXP', early.status === 'ok' && early.result.outcome === 'early' && early.result.battles.length === 0 && early.result.members[0]?.expGained === 0);
    check('the starter is unchanged', (await rowOf(db, 'u1', s.id))?.exp === 0 && (await rowOf(db, 'u1', s.id))?.level === 5);
    check('the activity is closed', (await openCount(db, 'u1')) === 0);

    const b = await start(db, 'u1', 'train', 'r1', T0 + HOUR);
    const bId = b.status === 'ok' ? b.activity.id : '';
    const status = await loadWorldState(db, 'u1', T0 + HOUR + PACE);
    check('after one pace the server has resolved one battle', status.activity?.training?.battles === 1);
    const one = await finishActivity(db, 'u1', bId, T0 + HOUR + PACE);
    check('exactly one pace: one battle', one.status === 'ok' && one.result.battles.length === 1);

    const c = await start(db, 'u1', 'train', 'r1', T0 + 2 * HOUR);
    const cId = c.status === 'ok' ? c.activity.id : '';
    const long = await finishActivity(db, 'u1', cId, T0 + 2 * HOUR + 9 * HOUR);
    const cap = trainingBattleCount(8 * HOUR, r1.training);
    const r = long.status === 'ok' ? long.result : null;
    check('nine hours count as eight', r?.elapsedMs === 8 * HOUR);
    check('the battles stop at the cap, or at the first loss',
      r !== null && (r.outcome === 'loss' ? r.battles.length <= cap && r.wins === r.battles.length - 1 : r.outcome === 'cap' && r.battles.length === cap));
    check('EXP is the wins times the route’s EXP per win', r !== null && r.members[0]?.expGained === r.wins * r1.training.expPerWin);
  } finally {
    t.cleanup();
  }
}

console.log('\n[5] exactly once');
{
  const t = await tempDb('once');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    const a = await start(db, 'u1', 'train', 'r1', T0);
    const aId = a.status === 'ok' ? a.activity.id : '';
    const f1 = await finishActivity(db, 'u1', aId, T0 + HOUR);
    const afterFirst = await rowOf(db, 'u1', s.id);
    const f2 = await finishActivity(db, 'u1', aId, T0 + 5 * HOUR);
    const afterSecond = await rowOf(db, 'u1', s.id);
    check('a repeated finish returns the stored result', f1.status === 'ok' && f2.status === 'ok' && JSON.stringify(f1.result) === JSON.stringify(f2.result));
    check('EXP was applied once', JSON.stringify(afterFirst) === JSON.stringify(afterSecond));
    check('the stored growth matches the row', f1.status === 'ok' && f1.result.members[0]?.after.level === afterFirst?.level && f1.result.members[0].after.exp === afterFirst?.exp);
    const w = await loadWorldState(db, 'u1', T0 + 6 * HOUR);
    check('the result waits for the player', w.result?.id === aId);
    check('dismissing it clears it', (await dismissResult(db, 'u1', aId, T0)) === 'ok' && (await loadWorldState(db, 'u1', T0)).result === null);

    const b = await start(db, 'u1', 'train', 'r1', T0 + 7 * HOUR);
    const bId = b.status === 'ok' ? b.activity.id : '';
    const before = await rowOf(db, 'u1', s.id);
    const [x, y] = await Promise.all([finishActivity(db, 'u1', bId, T0 + 9 * HOUR), finishActivity(db, 'u1', bId, T0 + 9 * HOUR)]);
    const after = await rowOf(db, 'u1', s.id);
    check('two simultaneous finishes return the same result', x.status === 'ok' && y.status === 'ok' && JSON.stringify(x.result) === JSON.stringify(y.result));
    check('and pay once', x.status === 'ok' && x.result.members[0]?.before.exp === before?.exp && x.result.members[0].after.exp === after?.exp && x.result.members[0].after.level === after?.level);

    const d = await start(db, 'u1', 'train', 'r1', T0 + 10 * HOUR);
    await finishActivity(db, 'u1', d.status === 'ok' ? d.activity.id : '', T0 + 11 * HOUR);
    const unseen = await loadWorldState(db, 'u1', T0 + 11 * HOUR);
    const c = await start(db, 'u1', 'train', 'r1', T0 + 12 * HOUR);
    const running = await loadWorldState(db, 'u1', T0 + 12 * HOUR);
    check('a waiting result is retired by the next start', unseen.result !== null && c.status === 'ok' && running.result === null && running.activity?.id === c.activity.id);
  } finally {
    t.cleanup();
  }
}

console.log('\n[6] defeat');
{
  const t = await tempDb('defeat');
  try {
    const { db } = t;
    await onboardUser(db, 'u1');
    const weak = await mintMon(db, 'u1', { dexId: 10, level: 1 });
    await savePartyIds(db, 'u1', [weak.id]);
    await unlock(db, 'u1', 'r1');
    const a = await start(db, 'u1', 'train', 'r2', T0);
    const aId = a.status === 'ok' ? a.activity.id : '';
    const f = await finishActivity(db, 'u1', aId, T0 + 8 * HOUR);
    const r = f.status === 'ok' ? f.result : null;
    check('a level-1 Caterpie falls in Mossy Woods', r?.outcome === 'loss' && r.battles.at(-1)?.won === false);
    check('training stopped at the loss', r !== null && r.wins === r.battles.length - 1);
    check('the wins before it still pay', r !== null && r.members[0]?.expGained === r.wins * (routeById('r2')?.training.expPerWin ?? 0));
    check('nothing is removed from the box', (await rowOf(db, 'u1', weak.id)) !== undefined);
  } finally {
    t.cleanup();
  }
}

console.log('\n[7] growth through the existing helpers');
{
  const t = await tempDb('growth');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1', 10, 7);
    await withChamp(db, 'u1', s.id);
    const a = await start(db, 'u1', 'train', 'r1', T0);
    const aId = a.status === 'ok' ? a.activity.id : '';
    await updateOwnedNickname(db, 'u1', s.id, 'Bug');
    const f = await finishActivity(db, 'u1', aId, T0 + 8 * HOUR);
    const row = await rowOf(db, 'u1', s.id);
    const r = f.status === 'ok' ? f.result : null;
    // 120 wins × 6 EXP = 720: Lv 7→8 (140), 8→9 (160), 9→10 (180), 10→11 (200) = 680, 40 left over.
    check('120 battles won', r?.wins === 120);
    check('720 EXP takes the starter to Lv 11 with 40 EXP', row?.level === 11 && row.exp === 40);
    check('it evolved into Metapod at 8', row?.dexId === 11 && JSON.stringify(r?.members[0]?.evolutions) === '[{"fromDexId":10,"toDexId":11}]');
    check('the nickname given mid-training survives', row?.nickname === 'Bug');
    check('sign, colour and origin are untouched', row?.sign === 'aries' && row.shiny === false && row.origin === 'starter');
    check('the Lv 50 Machamp earned the 25% floor', r?.members[1]?.sharePct === 25);
  } finally {
    t.cleanup();
  }
}

const bold = (kind: string): ChoiceId =>
  kind === 'fork' ? 'a' : kind === 'sighting' ? 'challenge' : kind === 'landmark' ? 'investigate' : kind === 'battle' ? 'fight' : 'challenge';

/** Answer checkpoints boldly until the trip ends; returns every step outcome. */
async function explore(db: Db, uid: string, id: string, now: number) {
  const outs: StepOutcome[] = [];
  for (let i = 0; i < 10; i++) {
    const w = await loadWorldState(db, uid, now);
    const cp = w.activity?.expedition?.checkpoint;
    if (!cp || w.activity?.id !== id) break;
    const out = await stepExpedition(db, uid, { activityId: id, step: cp.step, choice: bold(cp.kind) }, now);
    outs.push(out);
    if (out.status !== 'ok' || out.result) break;
  }
  return outs;
}

console.log('\n[8] expedition resume and races');
{
  const t = await tempDb('races');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    await withChamp(db, 'u1', s.id);
    const a = await start(db, 'u1', 'explore', 'r1', T0);
    const id = a.status === 'ok' ? a.activity.id : '';
    const s0 = await stepExpedition(db, 'u1', { activityId: id, step: 0, choice: 'observe' }, T0);
    const s1 = await stepExpedition(db, 'u1', { activityId: id, step: 1, choice: 'a' }, T0);
    check('two checkpoints resolve in order', s0.status === 'ok' && s0.event.outcome === 'observed' && s1.status === 'ok' && s1.event.outcome === 'took-a');
    const w = await loadWorldState(db, 'u1', T0 + HOUR);
    check('a reload resumes at the same checkpoint', w.activity?.expedition?.step === 2 && w.activity.expedition.checkpoint?.node === 'a1');
    const again = await stepExpedition(db, 'u1', { activityId: id, step: 1, choice: 'a' }, T0 + HOUR);
    check('repeating a step returns the same outcome', again.status === 'ok' && s1.status === 'ok' && JSON.stringify(again.event) === JSON.stringify(s1.event));
    const other = await stepExpedition(db, 'u1', { activityId: id, step: 1, choice: 'b' }, T0 + HOUR);
    check('a different choice for a decided step conflicts', other.status === 'conflict' && other.activity?.expedition?.step === 2);
    check('a step from the future conflicts', (await stepExpedition(db, 'u1', { activityId: id, step: 5, choice: 'fight' }, T0)).status === 'conflict');
    check('a choice the checkpoint doesn’t offer is invalid', (await stepExpedition(db, 'u1', { activityId: id, step: 2, choice: 'observe' }, T0)).status === 'invalid_choice');

    const [p, q] = await Promise.all([
      stepExpedition(db, 'u1', { activityId: id, step: 2, choice: 'fight' }, T0),
      stepExpedition(db, 'u1', { activityId: id, step: 2, choice: 'fight' }, T0),
    ]);
    check('two tabs sending the same choice both see one outcome',
      p.status === 'ok' && q.status === 'ok' && JSON.stringify(p.event) === JSON.stringify(q.event) && p.event.battle !== null);
    const banked = (await loadWorldState(db, 'u1', T0)).activity?.expedition;
    check('the battle banked its EXP once', banked?.step === 3 && banked.expUnits === (routeById('r1')?.explore.expPerWin ?? 0));

    const [m, n] = await Promise.all([
      stepExpedition(db, 'u1', { activityId: id, step: 3, choice: 'investigate' }, T0),
      stepExpedition(db, 'u1', { activityId: id, step: 3, choice: 'retreat' }, T0),
    ]);
    const statuses = [m.status, n.status].sort();
    check('two tabs sending different choices: one wins, one conflicts', JSON.stringify(statuses) === '["conflict","ok"]');
  } finally {
    t.cleanup();
  }
}

console.log('\n[9] a lost response on the final step');
console.log('[10] unlocks');
{
  const t = await tempDb('final');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    await withChamp(db, 'u1', s.id);
    const a = await start(db, 'u1', 'explore', 'r1', T0);
    const id = a.status === 'ok' ? a.activity.id : '';
    const outs = await explore(db, 'u1', id, T0);
    const last = outs.at(-1);
    const result = last?.status === 'ok' ? last.result : null;
    check('the guardian falls and the trip completes', result?.outcome === 'complete' && result.cleared);
    const rowAfter = await rowOf(db, 'u1', s.id);
    check('the starter grew by what the result says', result?.members[0]?.after.exp === rowAfter?.exp && result.members[0].after.level === rowAfter?.level);
    const lastStep = last?.status === 'ok' ? last.event.step : -1;
    const replay = await stepExpedition(db, 'u1', { activityId: id, step: lastStep, choice: 'challenge' }, T0 + HOUR);
    check('repeating the final step returns the same result and event',
      replay.status === 'ok' && last?.status === 'ok' && JSON.stringify(replay.result) === JSON.stringify(last.result) && JSON.stringify(replay.event) === JSON.stringify(last.event));
    check('and pays nothing more', JSON.stringify(await rowOf(db, 'u1', s.id)) === JSON.stringify(rowAfter));
    const fin = await finishActivity(db, 'u1', id, T0 + HOUR);
    check('finishing a settled trip returns its result', fin.status === 'ok' && JSON.stringify(fin.result) === JSON.stringify(result));

    check('the first clear is flagged and opens Mossy Woods', result?.firstClear === true && JSON.stringify(result.unlocked) === '["r2"]');
    const w = await loadWorldState(db, 'u1', T0 + HOUR);
    check('the map shows Sunny Meadow completed and Mossy Woods available',
      w.places.find((p) => p.id === 'r1')?.state === 'completed' && w.places.find((p) => p.id === 'r2')?.state === 'available');
    const b = await start(db, 'u1', 'explore', 'r1', T0 + 2 * HOUR);
    const bOuts = await explore(db, 'u1', b.status === 'ok' ? b.activity.id : '', T0 + 2 * HOUR);
    const again = bOuts.at(-1)?.status === 'ok' ? (bOuts.at(-1) as Extract<StepOutcome, { status: 'ok' }>).result : null;
    check('a second clear opens nothing new', again?.outcome === 'complete' && again.firstClear === false && again.unlocked.length === 0);
    check('the trainer stands where they last went', w.trainerAt === 'r1');
  } finally {
    t.cleanup();
  }
}

console.log('\n[10b] retreat and defeat on an expedition');
{
  const t = await tempDb('retreat');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    await withChamp(db, 'u1', s.id);
    const a = await start(db, 'u1', 'explore', 'r1', T0);
    const id = a.status === 'ok' ? a.activity.id : '';
    const won = await stepExpedition(db, 'u1', { activityId: id, step: 0, choice: 'challenge' }, T0);
    check('a won battle banks EXP', won.status === 'ok' && won.event.outcome === 'won' && won.event.expUnits === r1.explore.expPerWin);
    const home = await finishActivity(db, 'u1', id, T0 + MIN);
    const r = home.status === 'ok' ? home.result : null;
    check('heading home settles as a retreat', r?.outcome === 'retreat' && r.cleared === false && r.unlocked.length === 0);
    check('a retreat pays the banked EXP and no clear bonus', r?.rawExp === r1.explore.expPerWin && r.members[0]?.expGained === r1.explore.expPerWin);
    check('a retreat opens nothing', (await loadWorldState(db, 'u1', T0 + MIN)).places.find((p) => p.id === 'r2')?.state === 'locked');

    await onboardUser(db, 'u2');
    const weak = await mintMon(db, 'u2', { dexId: 10, level: 1 });
    await savePartyIds(db, 'u2', [weak.id]);
    await unlock(db, 'u2', 'r1');
    const b = await start(db, 'u2', 'explore', 'r2', T0);
    const outs = await explore(db, 'u2', b.status === 'ok' ? b.activity.id : '', T0);
    const last = outs.at(-1);
    const d = last?.status === 'ok' ? last.result : null;
    // Every won battle counts, including a landmark's guard (recorded as 'found').
    const wonBefore = outs.filter((o) => o.status === 'ok' && o.event.battle?.won === true).length;
    check('a level-1 Caterpie is defeated in Mossy Woods', d?.outcome === 'defeat' && d.cleared === false);
    check('the defeat keeps what earlier wins banked, nothing for the loss', d?.rawExp === wonBefore * (routeById('r2')?.explore.expPerWin ?? 0));
    check('the defeated Pokémon is still in the box', (await rowOf(db, 'u2', weak.id)) !== undefined);
  } finally {
    t.cleanup();
  }
}

console.log('\n[11] rows from the paused idle routes');
{
  const t = await legacyDb('legacy-rows');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    await db.execute({
      sql: 'insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at, claimed_at, stopped_by, log) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: ['closed-old', 'u1', 'r1', JSON.stringify([s.id]), 'x', T0 - 5 * HOUR, T0 - 4 * HOUR, 'cap', '{"wins":3}'],
    });
    await applySchema(db);
    check('a closed idle row is never shown as a result', (await loadWorldState(db, 'u1', T0)).result === null);
    await db.execute({
      sql: 'insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at) values (?, ?, ?, ?, ?, ?)',
      args: ['open-old', 'u1', 'r1', JSON.stringify([s.id]), 'legacyseed', T0],
    });
    const w = await loadWorldState(db, 'u1', T0 + 3 * HOUR);
    check('an open idle row shows as training on its route', w.activity?.id === 'open-old' && w.activity.mode === 'train' && w.activity.legacy && w.activity.locationId === 'r1');
    check('with the listed party', w.activity?.party[0]?.id === s.id);
    check('it blocks a new start until finished', (await start(db, 'u1', 'explore', 'r1', T0 + 3 * HOUR)).status === 'busy');
    const f = await finishActivity(db, 'u1', 'open-old', T0 + 3 * HOUR);
    check('it settles under the new rules', f.status === 'ok' && f.result.legacy && f.result.members.length === 1 && f.result.battles.length > 0);
    check('then a new start works', (await start(db, 'u1', 'train', 'r1', T0 + 4 * HOUR)).status === 'ok');

    await onboardUser(db, 'u2');
    await db.execute({
      sql: 'insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at) values (?, ?, ?, ?, ?, ?)',
      args: ['lost-route', 'u2', 'r9', '[]', 'x', T0],
    });
    check('an idle row for a route that no longer exists is not shown', (await loadWorldState(db, 'u2', T0)).activity === null);
    check('and does not block a new start', (await start(db, 'u2', 'train', 'r1', T0 + 1)).status === 'ok');
  } finally {
    t.cleanup();
  }
}

console.log('\n[11b] a failed read never follows a committed step');
{
  const t = await tempDb('post-commit');
  try {
    const { db } = t;
    const s = await onboardUser(db, 'u1');
    await withChamp(db, 'u1', s.id);
    const a = await start(db, 'u1', 'explore', 'r1', T0);
    const id = a.status === 'ok' ? a.activity.id : '';
    // Every discoveries read through this handle fails, as a flaky database would.
    const flaky = new Proxy(db, {
      get(target, prop) {
        if (prop === 'execute') {
          return (stmt: Parameters<Db['execute']>[0]) => {
            const sql = typeof stmt === 'string' ? stmt : stmt.sql;
            if (/from world_discoveries/.test(sql)) return Promise.reject(new Error('discoveries read failed'));
            return target.execute(stmt);
          };
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as Db;
    let threw = false;
    let out: StepOutcome | null = null;
    try {
      out = await stepExpedition(flaky, 'u1', { activityId: id, step: 0, choice: 'observe' }, T0);
    } catch {
      threw = true;
    }
    const row = await readActivity(db, 'u1', id);
    check('a step that errors leaves the checkpoint unresolved', !threw || row?.step === 0);
    check('a step that answers ok was committed', threw || (out?.status === 'ok' && row?.step === 1));
  } finally {
    t.cleanup();
  }
}

console.log('\n[12] isolation');
{
  const t = await tempDb('isolation');
  try {
    const { db } = t;
    await onboardUser(db, 'u1');
    await onboardUser(db, 'u2');
    const a = await start(db, 'u1', 'explore', 'r1', T0);
    const id = a.status === 'ok' ? a.activity.id : '';
    check('another trainer cannot step it', (await stepExpedition(db, 'u2', { activityId: id, step: 0, choice: 'observe' }, T0)).status === 'not_found');
    check('another trainer cannot finish it', (await finishActivity(db, 'u2', id, T0)).status === 'not_found');
    check('another trainer cannot dismiss it', (await dismissResult(db, 'u2', id, T0)) === 'not_found');
    check('another trainer sees nothing running', (await loadWorldState(db, 'u2', T0)).activity === null);
    check('a training activity cannot be stepped', (await (async () => {
      await onboardUser(db, 'u3');
      const tr = await start(db, 'u3', 'train', 'r1', T0);
      return tr.status === 'ok' ? (await stepExpedition(db, 'u3', { activityId: tr.activity.id, step: 0, choice: 'fight' }, T0)).status : 'none';
    })()) === 'not_expedition');
  } finally {
    t.cleanup();
  }
}

finish();
