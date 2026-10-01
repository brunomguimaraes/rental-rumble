import { randomBytes, randomUUID } from 'node:crypto';
import {
  openWriteTx,
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
  insertEncounterRows,
  readOwnedByIds,
  readOwnedByUser,
  readProfile,
  updateProfileParty,
  isUniqueViolation,
  type ActivityRow,
  type Db,
  type DiscoveryRow,
  type Executor,
  type NewActivity,
  type ProgressRow,
} from './_db.js';
import {
  ROUTES,
  EMPTY_PROGRESS,
  WORLD_RULES_VERSION,
  expSharePct,
  isPlayableId,
  isUnlocked,
  newlyUnlocked,
  placeState,
  routeById,
  scaleExp,
  trainingBattleCount,
  type ChoiceId,
  type LevelRange,
  type LocationId,
  type PlaceProgress,
  type RoutePlace,
} from '../src/game/world.js';
import {
  configFor,
  normaliseSnapshot,
  parseConfig,
  parseResult,
  partyCreatures,
  planGrowth,
  type ActivityConfig,
  type ActivityMode,
  type ActivityResult,
  type BattleSummary,
  type ExpeditionView,
  type Outcome,
  type PlaceView,
  type PublicActivity,
  type StartInput,
  type StepEvent,
  type StepInput,
  type TrainingStatus,
  type WorldState,
} from '../src/game/activity.js';
import {
  checkpointView,
  initialExpedition,
  parseExpeditionState,
  replayBattle,
  resolveStep,
  type ExpeditionState,
  type StepResolution,
  type TrailEntry,
} from '../src/game/expedition.js';
import { simulateTraining, type TrainingRun } from '../src/game/training.js';
import { parsePartyInput, resolveParty, sameParty } from '../src/game/party.js';
import type { BattleEvent } from '../src/game/battle.js';
import type { OwnedMon } from '../src/game/box.js';

// The world's domain layer, free of HTTP so it can be tested against a real
// database with an injected clock. The server owns everything here: the seed,
// the time, every battle, discovery and unlock, and the one settlement that
// pays an activity out. Settlement runs in a single write transaction whose
// conditional close is the gate, so a retried or concurrent request can never
// pay twice; it gets the stored result instead.

/** An open or settled activity with its frozen rules and party, ready to simulate. */
interface Live {
  row: ActivityRow;
  mode: ActivityMode;
  route: RoutePlace;
  cfg: ActivityConfig;
  snapshot: OwnedMon[];
  legacy: boolean;
  state: ExpeditionState | null;
}

const unique = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];

/**
 * Rebuild an activity from its row, or null when it cannot be played on (an
 * unknown route, a broken config or snapshot). Rows from the paused idle
 * routes have no rules version: they become training on their route under the
 * current rules, with the listed party's current rows as the snapshot.
 */
async function hydrate(db: Executor, uid: string, row: ActivityRow): Promise<Live | null> {
  const route = routeById(row.routeId);
  if (!route) return null;
  const legacy = row.rulesVersion === null;
  const cfg = legacy ? configFor(route) : parseConfig(row.config);
  if (!cfg) return null;
  const mode: ActivityMode = row.mode === 'explore' ? 'explore' : 'train';
  let snapshot: OwnedMon[] | null;
  if (legacy) {
    const rows = await readOwnedByIds(db, uid, row.partyIds);
    const byId = new Map(rows.map((m) => [m.id, m]));
    snapshot = row.partyIds.map((id) => byId.get(id)).filter((m): m is OwnedMon => m !== undefined);
  } else {
    snapshot = normaliseSnapshot(row.partySnapshot);
  }
  if (!snapshot || snapshot.length === 0) return null;
  const state = mode === 'explore' ? parseExpeditionState(row.state) : null;
  if (mode === 'explore' && !state) return null;
  return { row, mode, route, cfg, snapshot, legacy, state };
}

/** Close an activity nobody can play on, so it stops blocking new starts. */
async function retire(db: Db, uid: string, row: ActivityRow, now: number): Promise<void> {
  console.error(`[world] retiring unplayable activity ${row.id} (route ${row.routeId})`);
  await closeActivity(db, { id: row.id, uid, claimedAt: now, stoppedBy: 'retired', encounters: 0, step: row.step, state: null, result: null });
}

// --- Views ----------------------------------------------------------------------------

function pendingExp(snapshot: readonly OwnedMon[], rawExp: number, rec: LevelRange): { id: string; exp: number }[] {
  return snapshot.map((m) => ({ id: m.id, exp: scaleExp(rawExp, expSharePct(m.level, rec)) }));
}

function trainingRun(live: Live, now: number): { elapsedMs: number; count: number; run: TrainingRun; capped: boolean } {
  const elapsedMs = Math.max(0, Math.min(now - live.row.startedAt, live.cfg.capMs));
  const count = trainingBattleCount(elapsedMs, live.cfg.training, live.cfg.capMs);
  const run = simulateTraining(partyCreatures(live.snapshot), live.row.seed, live.cfg, count);
  const capped = elapsedMs >= live.cfg.capMs || count >= live.cfg.training.maxEncounters;
  return { elapsedMs, count, run, capped };
}

/** What training has done so far, resolved read-only from the seed. Nothing is written. */
function trainingStatus(live: Live, now: number): TrainingStatus {
  const { elapsedMs, count, run, capped } = trainingRun(live, now);
  const t = live.cfg.training;
  const nextAt = (count + 1) * t.paceMs;
  return {
    paceMs: t.paceMs,
    capMs: live.cfg.capMs,
    maxEncounters: t.maxEncounters,
    expPerWin: t.expPerWin,
    elapsedMs,
    nextBattleInMs: run.fell || capped || nextAt > live.cfg.capMs ? null : nextAt - elapsedMs,
    battles: run.battles.length,
    wins: run.wins,
    fell: run.fell,
    capped,
    pendingExp: pendingExp(live.snapshot, run.wins * t.expPerWin, live.cfg.recommended),
    recent: run.battles.slice(-5).map(({ foe, won, turns }) => ({ foe, won, turns })),
  };
}

function expeditionView(live: Live, known: ReadonlySet<string>): ExpeditionView | null {
  const st = live.state;
  if (!st) return null;
  return {
    step: st.trail.length,
    checkpoint: live.row.claimedAt === null ? checkpointView(live.row.seed, live.cfg, st, live.route, known) : null,
    trail: st.trail,
    wins: st.wins,
    expUnits: st.expUnits,
    pendingExp: pendingExp(live.snapshot, st.expUnits, live.cfg.recommended),
  };
}

function publicActivity(live: Live, now: number, known: ReadonlySet<string>): PublicActivity {
  return {
    id: live.row.id,
    mode: live.mode,
    locationId: live.route.id,
    startedAt: live.row.startedAt,
    party: live.snapshot,
    legacy: live.legacy,
    training: live.mode === 'train' ? trainingStatus(live, now) : null,
    expedition: live.mode === 'explore' ? expeditionView(live, known) : null,
  };
}

function progressMap(rows: readonly ProgressRow[], discoveries: readonly DiscoveryRow[]): Map<string, PlaceProgress> {
  const out = new Map<string, PlaceProgress>();
  const get = (id: string) => out.get(id) ?? { ...EMPTY_PROGRESS, landmarks: [], seen: [] };
  for (const r of rows) {
    out.set(r.locationId, { ...get(r.locationId), clearedAt: r.clearedAt, explores: r.explores, clears: r.clears, trainings: r.trainings, trainingWins: r.trainingWins });
  }
  for (const d of discoveries) {
    const p = get(d.locationId);
    out.set(
      d.locationId,
      d.kind === 'seen' ? { ...p, seen: [...p.seen, Number(d.ref)] } : { ...p, landmarks: [...p.landmarks, d.ref] },
    );
  }
  return out;
}

function clearedSet(rows: readonly ProgressRow[]): Set<string> {
  return new Set(rows.filter((r) => r.clearedAt !== null).map((r) => r.locationId));
}

function knownLandmarks(discoveries: readonly DiscoveryRow[], locationId: string): Set<string> {
  return new Set(discoveries.filter((d) => d.kind === 'landmark' && d.locationId === locationId).map((d) => d.ref));
}

async function boxOrNull(db: Db, uid: string): Promise<OwnedMon[] | null> {
  // The activity is committed; a failed box read must not turn it into an error.
  try {
    return await readOwnedByUser(db, uid);
  } catch (err) {
    console.error('[world] box read after commit failed:', err);
    return null;
  }
}

// --- State ------------------------------------------------------------------------------

export async function loadWorldState(db: Db, uid: string, now: number): Promise<WorldState> {
  const [open, unseen, progressRows, discoveries, lastRoute] = await Promise.all([
    readOpenActivity(db, uid),
    readUnseenResult(db, uid),
    readProgress(db, uid),
    readDiscoveries(db, uid),
    readLastRouteId(db, uid),
  ]);
  const progress = progressMap(progressRows, discoveries);
  const cleared = clearedSet(progressRows);
  const live = open ? await hydrate(db, uid, open) : null;
  const places: PlaceView[] = ROUTES.map((r) => {
    const p = progress.get(r.id) ?? EMPTY_PROGRESS;
    return { id: r.id, state: placeState(r, p, cleared), progress: p };
  });
  const activity = live ? publicActivity(live, now, knownLandmarks(discoveries, live.route.id)) : null;
  const result = !activity && unseen ? parseResult(unseen.result) : null;
  const trainerAt: LocationId = live ? live.route.id : (routeById(lastRoute)?.id ?? 'home');
  return { serverNow: now, places, activity, result, trainerAt };
}

// --- Start ------------------------------------------------------------------------------

export function parseStartInput(body: Record<string, unknown>): StartInput | null {
  const { mode, locationId, partyIds, requestId } = body;
  if (mode !== 'train' && mode !== 'explore') return null;
  if (!isPlayableId(locationId)) return null;
  const ids = parsePartyInput(partyIds);
  if (!ids) return null;
  if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 64) return null;
  return { mode, locationId, partyIds: ids, requestId };
}

export type StartOutcome =
  | { status: 'ok'; activity: PublicActivity }
  | { status: 'busy'; activity: PublicActivity }
  | { status: 'party_changed'; party: string[] }
  | { status: 'locked' }
  | { status: 'no_profile' }
  | { status: 'no_party' };

/** Answer a start while another activity is open: the same request gets it back, any other is busy. */
async function adoptOpen(db: Db, uid: string, open: ActivityRow, requestId: string, now: number): Promise<StartOutcome | null> {
  const live = await hydrate(db, uid, open);
  if (!live) {
    await retire(db, uid, open, now);
    return null;
  }
  const known = knownLandmarks(await readDiscoveries(db, uid), live.route.id);
  const activity = publicActivity(live, now, known);
  return open.requestId === requestId ? { status: 'ok', activity } : { status: 'busy', activity };
}

export async function startActivity(db: Db, uid: string, input: StartInput, now: number): Promise<StartOutcome> {
  const route = routeById(input.locationId);
  if (!route) return { status: 'locked' };
  const [profile, owned, open, progressRows, discoveries] = await Promise.all([
    readProfile(db, uid),
    readOwnedByUser(db, uid),
    readOpenActivity(db, uid),
    readProgress(db, uid),
    readDiscoveries(db, uid),
  ]);
  if (!profile) return { status: 'no_profile' };
  if (open) {
    const adopted = await adoptOpen(db, uid, open, input.requestId, now);
    if (adopted) return adopted;
  }
  if (!isUnlocked(route, clearedSet(progressRows))) return { status: 'locked' };
  const party = resolveParty(profile.party, owned, profile.starterId);
  if (party.length === 0) return { status: 'no_party' };
  if (!sameParty(party, input.partyIds)) return { status: 'party_changed', party };

  const byId = new Map(owned.map((m) => [m.id, m]));
  const snapshot = party.map((id) => byId.get(id)).filter((m): m is OwnedMon => m !== undefined);
  const cfg = configFor(route);
  const state = input.mode === 'explore' ? initialExpedition(cfg) : null;
  const row: NewActivity = {
    id: randomUUID(),
    userId: uid,
    routeId: route.id,
    partyIds: party,
    seed: randomBytes(12).toString('hex'),
    startedAt: now,
    mode: input.mode,
    rulesVersion: WORLD_RULES_VERSION,
    partySnapshot: snapshot,
    config: cfg,
    state,
    requestId: input.requestId,
  };
  try {
    await db.batch([markResultsSeenStatement(uid, now), insertActivityStatement(row), progressStartStatement(uid, route.id, input.mode)], 'write');
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Another start won the race for the one open slot.
    const again = await readOpenActivity(db, uid);
    const adopted = again ? await adoptOpen(db, uid, again, input.requestId, now) : null;
    if (adopted) return adopted;
    throw err;
  }
  const live: Live = {
    row: {
      ...row,
      claimedAt: null,
      stoppedBy: null,
      encounters: 0,
      step: 0,
      result: null,
      seenAt: null,
    },
    mode: input.mode,
    route,
    cfg,
    snapshot,
    legacy: false,
    state,
  };
  return { status: 'ok', activity: publicActivity(live, now, knownLandmarks(discoveries, route.id)) };
}

// --- Settlement -------------------------------------------------------------------------

/** What an activity pays, computed from its seed before the transaction opens. */
interface Payout {
  outcome: Outcome;
  battles: BattleSummary[];
  wins: number;
  rawExp: number;
  elapsedMs: number;
  cleared: boolean;
  /** Discoveries this settlement records. */
  seenNow: number[];
  landmarksNow: string[];
  /** The whole trip's discoveries, for the result. */
  tripSeen: number[];
  tripLandmarks: string[];
  priorNewSeen: number[];
  priorNewLandmarks: string[];
  /** Expedition only: the final state, and the step the row must still be at. */
  finalState: ExpeditionState | null;
  step: number;
  fromStep: number | null;
}

interface Flags {
  newSeen: number[];
  newLandmarks: string[];
}

async function recordDiscoveries(
  tx: Executor,
  uid: string,
  locationId: string,
  seen: readonly number[],
  landmarks: readonly string[],
  now: number,
): Promise<Flags> {
  const flags: Flags = { newSeen: [], newLandmarks: [] };
  for (const d of unique(seen)) {
    if (await insertDiscovery(tx, { uid, locationId, kind: 'seen', ref: String(d), foundAt: now })) flags.newSeen.push(d);
  }
  for (const l of unique(landmarks)) {
    if (await insertDiscovery(tx, { uid, locationId, kind: 'landmark', ref: l, foundAt: now })) flags.newLandmarks.push(l);
  }
  return flags;
}

/** Mark the last trail entry's firsts and fold them into the trip's lists. */
function withFlags(state: ExpeditionState, flags: Flags): ExpeditionState {
  const trail = [...state.trail];
  const last = trail[trail.length - 1];
  if (last) {
    trail[trail.length - 1] = {
      ...last,
      ...(last.foe && flags.newSeen.includes(last.foe.dexId) ? { newSeen: true } : {}),
      ...(last.landmark && flags.newLandmarks.includes(last.landmark) ? { newLandmark: true } : {}),
    };
  }
  return {
    ...state,
    trail,
    newSeen: unique([...state.newSeen, ...flags.newSeen]),
    newLandmarks: unique([...state.newLandmarks, ...flags.newLandmarks]),
  };
}

function trainingPayout(live: Live, now: number): Payout {
  const { elapsedMs, run, capped } = trainingRun(live, now);
  const seen = unique(run.battles.map((b) => b.foe.dexId));
  return {
    outcome: run.fell ? 'loss' : capped ? 'cap' : 'early',
    battles: run.battles.map(({ foe, won, turns }) => ({ foe, won, turns })),
    wins: run.wins,
    rawExp: run.wins * live.cfg.training.expPerWin,
    elapsedMs,
    cleared: false,
    seenNow: seen,
    landmarksNow: [],
    tripSeen: seen,
    tripLandmarks: [],
    priorNewSeen: [],
    priorNewLandmarks: [],
    finalState: null,
    step: live.row.step,
    fromStep: null,
  };
}

function expeditionPayout(live: Live, res: StepResolution, now: number): Payout {
  const st = res.state;
  const complete = res.terminal === 'complete';
  const battles = st.trail
    .filter((e) => e.turns !== undefined && e.foe !== undefined)
    .map((e) => ({ foe: e.foe as BattleSummary['foe'], won: e.outcome !== 'lost', turns: e.turns ?? 0 }));
  return {
    outcome: complete ? 'complete' : res.terminal === 'retreat' ? 'retreat' : 'defeat',
    battles,
    wins: st.wins,
    rawExp: st.expUnits + (complete ? live.cfg.explore.clearBonus : 0),
    elapsedMs: Math.max(0, now - live.row.startedAt),
    cleared: complete,
    seenNow: res.seen !== null ? [res.seen] : [],
    landmarksNow: res.landmark !== null ? [res.landmark] : [],
    tripSeen: st.seen,
    tripLandmarks: st.landmarks,
    priorNewSeen: st.newSeen,
    priorNewLandmarks: st.newLandmarks,
    finalState: st,
    step: res.entry.step + 1,
    fromStep: res.entry.step,
  };
}

/**
 * Pay an activity out, once. Inside one write transaction: re-check the row is
 * still open (and, for an expedition, still at the step being resolved), record
 * discoveries, grow the party's current rows, update progress and unlocks, log
 * the battles, and close the row. 'already' means another request settled it or
 * moved it first; the caller re-reads.
 */
async function settleInTx(tx: Executor, uid: string, live: Live, p: Payout, now: number): Promise<{ result: ActivityResult; flags: Flags } | 'already'> {
  const fresh = await readActivity(tx, uid, live.row.id);
  if (!fresh || fresh.claimedAt !== null || (p.fromStep !== null && fresh.step !== p.fromStep)) {
    return 'already';
  }
  const flags = await recordDiscoveries(tx, uid, live.route.id, p.seenNow, p.landmarksNow, now);
  const current = await readOwnedByIds(tx, uid, live.snapshot.map((m) => m.id));
  const growth = planGrowth(current, live.snapshot, p.rawExp, live.cfg.recommended, live.row.id);
  const before = clearedSet(await readProgress(tx, uid));
  const after = new Set(before);
  if (p.cleared) after.add(live.route.id);
  const result: ActivityResult = {
    id: live.row.id,
    mode: live.mode,
    locationId: live.route.id,
    outcome: p.outcome,
    startedAt: live.row.startedAt,
    endedAt: now,
    elapsedMs: p.elapsedMs,
    battles: p.battles,
    wins: p.wins,
    rawExp: p.rawExp,
    members: growth.members,
    seen: unique(p.tripSeen),
    newSeen: unique([...p.priorNewSeen, ...flags.newSeen]),
    landmarks: unique(p.tripLandmarks),
    newLandmarks: unique([...p.priorNewLandmarks, ...flags.newLandmarks]),
    cleared: p.cleared,
    firstClear: p.cleared && !before.has(live.route.id),
    unlocked: newlyUnlocked(before, after),
    legacy: live.legacy,
  };
  const state = p.finalState ? withFlags(p.finalState, flags) : null;
  const closed = await closeActivity(tx, {
    id: live.row.id,
    uid,
    claimedAt: now,
    stoppedBy: p.outcome,
    encounters: p.battles.length,
    step: p.step,
    state,
    result,
  });
  if (closed !== 1) {
    return 'already';
  }
  for (const m of growth.changed) await updateOwnedGrowth(tx, uid, m);
  await applyProgressSettlement(tx, {
    uid,
    locationId: live.route.id,
    clearedAt: p.cleared ? now : null,
    clears: p.cleared ? 1 : 0,
    trainingWins: live.mode === 'train' ? p.wins : 0,
  });
  await insertEncounterRows(
    tx,
    live.row.id,
    p.battles.map((b, slot) => ({ slot, dexId: b.foe.dexId, level: b.foe.level, won: b.won })),
  );
  return { result, flags };
}

async function settle(db: Db, uid: string, live: Live, p: Payout, now: number): Promise<{ result: ActivityResult; flags: Flags } | 'already'> {
  const tx = await openWriteTx(db);
  try {
    const result = await settleInTx(tx, uid, live, p, now);
    if (result === 'already') await tx.rollback();
    else await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
}

/** Legacy retirement participates in activation's transaction: no partial grant or payout. */
export async function retireLegacyActivity(
  tx: Executor, uid: string, row: ActivityRow, now: number, cutoverAt: number,
): Promise<{ result: ActivityResult | null; notice: string }> {
  if (row.claimedAt !== null) return { result: parseResult(row.result), notice: 'Your previous activity has already been settled.' };
  const live = await hydrate(tx, uid, row);
  if (!live) {
    const notice = 'Your previous activity could not be read and was closed without changing your Pokémon. Its original records were preserved.';
    await closeActivity(tx, { id: row.id, uid, claimedAt: now, stoppedBy: 'retired', encounters: row.encounters, step: row.step, state: null, result: { notice, originalResult: row.result } });
    return { result: null, notice };
  }
  const earnedThrough = Math.min(now, cutoverAt);
  let payout: Payout;
  if (live.mode === 'explore' && live.state) {
    const st = live.state;
    payout = {
      outcome: 'retreat',
      battles: st.trail.filter((e) => e.turns !== undefined && e.foe !== undefined)
        .map((e) => ({ foe: e.foe as BattleSummary['foe'], won: e.outcome !== 'lost', turns: e.turns ?? 0 })),
      wins: st.wins, rawExp: st.expUnits, elapsedMs: Math.max(0, earnedThrough - row.startedAt), cleared: false,
      seenNow: [], landmarksNow: [], tripSeen: st.seen, tripLandmarks: st.landmarks,
      priorNewSeen: st.newSeen, priorNewLandmarks: st.newLandmarks, finalState: st, step: row.step, fromStep: row.step,
    };
  } else {
    payout = trainingPayout(live, earnedThrough);
  }
  const settled = await settleInTx(tx, uid, live, payout, now);
  return {
    result: settled === 'already' ? parseResult((await readActivity(tx, uid, row.id))?.result) : settled.result,
    notice: 'Your previous activity was closed. Only rewards earned before the route update were applied.',
  };
}

// --- Expedition steps -----------------------------------------------------------------------

export const CHOICE_IDS: readonly ChoiceId[] = ['fight', 'observe', 'challenge', 'investigate', 'press-on', 'a', 'b', 'retreat'];

export function parseStepInput(body: Record<string, unknown>): StepInput | null {
  const { activityId, step, choice } = body;
  if (typeof activityId !== 'string' || activityId.length < 1 || activityId.length > 64) return null;
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > 64) return null;
  if (!CHOICE_IDS.includes(choice as ChoiceId)) return null;
  return { activityId, step, choice: choice as ChoiceId };
}

export type StepOutcome =
  | { status: 'ok'; activity: PublicActivity | null; event: StepEvent; result: ActivityResult | null; box: OwnedMon[] | null }
  | { status: 'not_found' }
  | { status: 'not_expedition' }
  | { status: 'invalid_choice' }
  | { status: 'conflict'; activity: PublicActivity | null; result: ActivityResult | null };

/** One resolved checkpoint as the client sees it. The same entry always gives the same event. */
function eventFromEntry(entry: TrailEntry, events: BattleEvent[] | null): StepEvent {
  return {
    step: entry.step,
    kind: entry.kind,
    choice: entry.choice,
    outcome: entry.outcome,
    foe: entry.foe ?? null,
    landmark: entry.landmark ?? null,
    newLandmark: entry.newLandmark === true,
    newSeen: entry.newSeen === true,
    battle: events ? { won: entry.outcome !== 'lost', turns: entry.turns ?? 0, events } : null,
    expUnits: entry.expUnits ?? 0,
  };
}

async function currentView(db: Db, uid: string, live: Live, now: number): Promise<{ activity: PublicActivity | null; result: ActivityResult | null }> {
  if (live.row.claimedAt !== null) return { activity: null, result: parseResult(live.row.result) };
  const known = knownLandmarks(await readDiscoveries(db, uid), live.route.id);
  return { activity: publicActivity(live, now, known), result: null };
}

/**
 * Commit a checkpoint that does not end the trip. 'raced' when another request
 * moved the trip first. Everything the reply needs is read before the commit,
 * so nothing after it can turn a saved step into an error.
 */
async function commitStep(db: Db, uid: string, live: Live, res: StepResolution, now: number): Promise<StepOutcome | 'raced'> {
  const known = knownLandmarks(await readDiscoveries(db, uid), live.route.id);
  const tx = await openWriteTx(db);
  let state: ExpeditionState;
  try {
    const flags = await recordDiscoveries(tx, uid, live.route.id, res.seen !== null ? [res.seen] : [], res.landmark !== null ? [res.landmark] : [], now);
    state = withFlags(res.state, flags);
    const moved = await updateActivityState(tx, { id: live.row.id, uid, fromStep: res.entry.step, state });
    if (moved !== 1) {
      await tx.rollback();
      return 'raced';
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
  const next: Live = { ...live, row: { ...live.row, state, step: res.entry.step + 1 }, state };
  if (res.landmark !== null) known.add(res.landmark);
  const entry = state.trail[state.trail.length - 1];
  return {
    status: 'ok',
    activity: publicActivity(next, now, known),
    event: eventFromEntry(entry, res.battle?.events ?? null),
    result: null,
    box: null,
  };
}

export async function stepExpedition(db: Db, uid: string, input: StepInput, now: number): Promise<StepOutcome> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readActivity(db, uid, input.activityId);
    if (!row) return { status: 'not_found' };
    if (row.mode !== 'explore') return { status: 'not_expedition' };
    const live = await hydrate(db, uid, row);
    if (!live || !live.state) return { status: 'not_expedition' };
    const state = live.state;

    if (input.step < state.trail.length) {
      // Already decided: a retry after a lost response, or a second tab.
      const entry = state.trail[input.step];
      const view = await currentView(db, uid, live, now);
      if (entry.choice !== input.choice) return { status: 'conflict', ...view };
      const events = replayBattle(partyCreatures(live.snapshot), row.seed, live.cfg, entry);
      const box = row.claimedAt !== null ? await boxOrNull(db, uid) : null;
      return { status: 'ok', activity: view.activity, event: eventFromEntry(entry, events), result: view.result, box };
    }
    if (row.claimedAt !== null || input.step !== state.trail.length) {
      return { status: 'conflict', ...(await currentView(db, uid, live, now)) };
    }

    const res = resolveStep(partyCreatures(live.snapshot), row.seed, live.cfg, state, input.choice);
    if (!res) return { status: 'invalid_choice' };
    if (!res.terminal) {
      const out = await commitStep(db, uid, live, res, now);
      if (out !== 'raced') return out;
      continue;
    }
    const settled = await settle(db, uid, live, expeditionPayout(live, res, now), now);
    if (settled === 'already') continue;
    const entry = withFlags(res.state, settled.flags).trail[res.state.trail.length - 1];
    return {
      status: 'ok',
      activity: null,
      event: eventFromEntry(entry, res.battle?.events ?? null),
      result: settled.result,
      box: await boxOrNull(db, uid),
    };
  }
  // Still losing races after several tries: report where things stand.
  const row = await readActivity(db, uid, input.activityId);
  const live = row ? await hydrate(db, uid, row) : null;
  return live ? { status: 'conflict', ...(await currentView(db, uid, live, now)) } : { status: 'not_found' };
}

// --- Finish and dismiss -----------------------------------------------------------------------

export type FinishOutcome = { status: 'ok'; result: ActivityResult; box: OwnedMon[] | null } | { status: 'not_found' };

/**
 * Bring the trainer home: training resolves the battles up to now; an
 * expedition retreats from its current checkpoint. A settled activity returns
 * its stored result, so a retry after a lost response is safe.
 */
export async function finishActivity(db: Db, uid: string, activityId: string, now: number): Promise<FinishOutcome> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readActivity(db, uid, activityId);
    if (!row) return { status: 'not_found' };
    if (row.claimedAt !== null) {
      const stored = parseResult(row.result);
      return stored ? { status: 'ok', result: stored, box: await boxOrNull(db, uid) } : { status: 'not_found' };
    }
    const live = await hydrate(db, uid, row);
    if (!live) {
      await retire(db, uid, row, now);
      return { status: 'not_found' };
    }
    let payout: Payout;
    if (live.mode === 'explore' && live.state) {
      const res = resolveStep(partyCreatures(live.snapshot), row.seed, live.cfg, live.state, 'retreat');
      if (!res) {
        await retire(db, uid, row, now);
        return { status: 'not_found' };
      }
      payout = expeditionPayout(live, res, now);
    } else {
      payout = trainingPayout(live, now);
    }
    const settled = await settle(db, uid, live, payout, now);
    if (settled === 'already') continue;
    return { status: 'ok', result: settled.result, box: await boxOrNull(db, uid) };
  }
  const row = await readActivity(db, uid, activityId);
  const stored = row ? parseResult(row.result) : null;
  return stored ? { status: 'ok', result: stored, box: await boxOrNull(db, uid) } : { status: 'not_found' };
}

export async function dismissResult(db: Db, uid: string, activityId: string, now: number): Promise<'ok' | 'not_found'> {
  return (await markResultSeen(db, uid, activityId, now)) === 1 ? 'ok' : 'not_found';
}

// --- Party ----------------------------------------------------------------------------------

export type PartyOutcome = { status: 'ok'; party: string[] } | { status: 'invalid' } | { status: 'not_owned' } | { status: 'no_profile' };

export async function savePartyIds(db: Db, uid: string, raw: unknown): Promise<PartyOutcome> {
  const ids = parsePartyInput(raw);
  if (!ids) return { status: 'invalid' };
  const owned = await readOwnedByIds(db, uid, ids);
  if (owned.length !== ids.length) return { status: 'not_owned' };
  if ((await updateProfileParty(db, uid, ids)) !== 1) return { status: 'no_profile' };
  return { status: 'ok', party: ids };
}

/** The party in effect for a trainer (saved, else the starter), for the profile response. */
export async function resolvedParty(db: Db, uid: string, saved: string[] | null, starterId: string): Promise<string[]> {
  return resolveParty(saved, await readOwnedByUser(db, uid), starterId);
}
