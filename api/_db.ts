import { createClient, type Client, type InStatement, type Transaction } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AbilityId, BaseStats, Build, Sign } from '../src/game/types.js';
import type { CatchOrigin, MintSpec, OwnedMon } from '../src/game/box.js';
import { expectedStats, isBaseStats } from '../src/game/growth.js';

// Turso (libSQL / SQLite) holds the optional account layer (users, Pokédex,
// run history, single-use auth tokens). It's fast, has no autosuspend
// cold-start, and the same client also points at a local `file:...` SQLite file
// for offline dev. Initialised lazily (like getRedis) so a missing
// TURSO_DATABASE_URL degrades to a clean 503 instead of crashing at import.

export type Db = Client;
// Anything that can run statements: the client or an open transaction.
export type Executor = Pick<Db, 'execute' | 'batch'>;

let db: Db | null = null;
let initialized = false;

export function getDb(): Db | null {
  if (initialized) return db;
  initialized = true;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error(
      '[accounts] TURSO_DATABASE_URL is not set — the account layer is disabled. ' +
        'Set it in the Vercel project (Settings → Environment Variables) or in ' +
        '.env.local for `vercel dev` (a libsql:// URL, or file:local.db for offline dev).',
    );
    return null;
  }
  const authToken = process.env.TURSO_AUTH_TOKEN;
  try {
    db = createClient(authToken ? { url, authToken } : { url });
  } catch (err) {
    console.error('[accounts] Failed to initialize the libSQL client:', err);
    db = null;
  }
  return db;
}

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql');

/** Statements that add columns to existing tables; each is a no-op on re-run. */
const COLUMN_ADDS = [
  'alter table owned_pokemon add column nickname text',
  // The six current stats on the growth model's scale, JSON text. Null on rows
  // minted before the growth system; rowToOwned backfills those on read.
  'alter table owned_pokemon add column stats text',
  // The saved party (JSON array of owned ids, lead first).
  'alter table profiles add column party text',
  // idle_sessions now holds every activity: training and exploration.
  'alter table idle_sessions add column mode text',
  'alter table idle_sessions add column rules_version integer',
  'alter table idle_sessions add column party_snapshot text',
  'alter table idle_sessions add column config text',
  'alter table idle_sessions add column state text',
  'alter table idle_sessions add column step integer not null default 0',
  'alter table idle_sessions add column request_id text',
  'alter table idle_sessions add column result text',
  'alter table idle_sessions add column seen_at integer',
  // Pokédollars for the Village market; always changed through changeMoney.
  'alter table route_accounts add column money integer not null default 0 check (money >= 0)',
];

/** Apply db/schema.sql (idempotent) plus the additive column changes. */
export async function applySchema(db: Db): Promise<void> {
  await db.executeMultiple(readFileSync(SCHEMA_PATH, 'utf8'));
  for (const sql of COLUMN_ADDS) {
    try {
      await db.execute(sql);
    } catch (err) {
      if (!String(err).includes('duplicate column')) throw err;
    }
  }
}

/** A fresh app-generated id for a new account row. */
export const newId = (): string => randomUUID();

function errorText(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown; cause?: unknown };
  return `${String(e?.code ?? '')} ${String(e?.message ?? err)} ${String((e?.cause as { message?: unknown })?.message ?? '')}`;
}

/** A write that lost to a unique index (e.g. a second open activity). */
export function isUniqueViolation(err: unknown): boolean {
  const t = errorText(err);
  return t.includes('UNIQUE constraint failed') || t.includes('SQLITE_CONSTRAINT');
}

/** A query against columns or tables that `db:setup` has not added yet. */
export function isMissingSchema(err: unknown): boolean {
  const t = errorText(err);
  return t.includes('no such column') || t.includes('no such table');
}

/**
 * Open a write transaction, waiting briefly while another writer holds the
 * lock. A local SQLite file refuses a second concurrent writer outright
 * (SQLITE_BUSY) rather than queueing it; the retry lets the other write commit
 * first, after which this one sees its result.
 */
export async function openWriteTx(db: Db): Promise<Transaction> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction('write');
    } catch (err) {
      if (!errorText(err).includes('SQLITE_BUSY') || attempt >= 8) throw err;
      // libsql's local driver retains the failed BEGIN statement on its idle
      // connection. Reopen only that connection before retrying; successful
      // transactions own separate connections and remain untouched.
      if (db.protocol === 'file') await db.reconnect();
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
}

function parseJson(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

const nullableNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// --- Shared constants --------------------------------------------------------

/** The three independent Pokédex completion layers. */
export const DEX_LAYERS = ['n', 'a', 's'] as const;
export type DexLayer = (typeof DEX_LAYERS)[number];

/** Highest National Dex id we track (mirrors RAW_DEX length). */
export const DEX_MAX_ID = 1025;

// Single-use token lifetimes (seconds).
export const VERIFY_TTL_SECONDS = 60 * 60 * 24; // 24h
export const RESET_TTL_SECONDS = 60 * 60; // 1h
export const OAUTH_STATE_TTL_SECONDS = 60 * 10; // 10m

export type OAuthProvider = 'discord' | 'google';

// --- Types -------------------------------------------------------------------

/** A stored account. `passwordHash` never leaves the server. */
export interface StoredUser {
  id: string;
  email: string;
  emailLower: string;
  displayName: string;
  emailVerified: boolean;
  passwordHash?: string;
  discordId?: string;
  googleSub?: string;
  createdAt: number;
  runs: number;
  wins: number;
  losses: number;
}

/** The public-safe view of a user the client may see (no secrets). */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  providers: OAuthProvider[];
  stats: { runs: number; wins: number; losses: number };
}

/** Build a StoredUser from a raw SQLite row (snake_case columns, 0/1 booleans). */
export function rowToUser(r: Record<string, unknown>): StoredUser {
  return {
    id: String(r.id),
    email: String(r.email ?? ''),
    emailLower: String(r.email_lower ?? ''),
    displayName: String(r.display_name ?? ''),
    emailVerified: Number(r.email_verified) === 1,
    ...(r.password_hash ? { passwordHash: String(r.password_hash) } : {}),
    ...(r.discord_id ? { discordId: String(r.discord_id) } : {}),
    ...(r.google_sub ? { googleSub: String(r.google_sub) } : {}),
    createdAt: Number(r.created_at) || 0,
    runs: Number(r.runs) || 0,
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
  };
}

export function toPublicUser(u: StoredUser): PublicUser {
  const providers: OAuthProvider[] = [];
  if (u.discordId) providers.push('discord');
  if (u.googleSub) providers.push('google');
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
    providers,
    stats: { runs: u.runs, wins: u.wins, losses: u.losses },
  };
}

// --- Common reads ------------------------------------------------------------

export async function readUserById(
  db: Db,
  uid: string,
): Promise<StoredUser | null> {
  const rs = await db.execute({
    sql: 'select * from users where id = ? limit 1',
    args: [uid],
  });
  return rs.rows.length > 0
    ? rowToUser(rs.rows[0] as unknown as Record<string, unknown>)
    : null;
}

export async function readUserByEmail(
  db: Db,
  emailLower: string,
): Promise<StoredUser | null> {
  const rs = await db.execute({
    sql: 'select * from users where email_lower = ? limit 1',
    args: [emailLower],
  });
  return rs.rows.length > 0
    ? rowToUser(rs.rows[0] as unknown as Record<string, unknown>)
    : null;
}

// --- Owned Pokémon (the "box") ----------------------------------------------

/** How many owned mons one account may hold (guards a runaway box). */
export const BOX_LIMIT = 600;

/** Stored `stats` JSON → BaseStats, or null when absent or malformed. */
function parseStats(raw: unknown): BaseStats | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isBaseStats(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Build an OwnedMon from a raw SQLite row (snake_case columns, 0/1 booleans).
 * A row without usable `stats` (minted before the growth system) reads as an
 * average individual of its species at its level; the next growth persists it.
 */
export function rowToOwned(r: Record<string, unknown>): OwnedMon {
  const dexId = Number(r.dex_id) || 0;
  const level = Number(r.level) || 1;
  const build = r.build ? (String(r.build) as Build) : undefined;
  return {
    id: String(r.id),
    dexId,
    level,
    exp: Number(r.exp) || 0,
    stats: parseStats(r.stats) ?? expectedStats(dexId, level, build),
    sign: String(r.sign ?? '') as Sign,
    ...(r.ability ? { ability: String(r.ability) as AbilityId } : {}),
    ...(build ? { build } : {}),
    shiny: Number(r.shiny) === 1,
    altColor: Number(r.alt_color) === 1,
    ...(r.emotion ? { emotion: String(r.emotion) } : {}),
    ...(r.nickname ? { nickname: String(r.nickname) } : {}),
    origin: (String(r.origin ?? 'catch') as CatchOrigin),
    caughtAt: Number(r.caught_at) || 0,
  };
}

/** Every mon a user owns, newest first. */
export async function readOwnedByUser(db: Executor, uid: string): Promise<OwnedMon[]> {
  const rs = await db.execute({
    sql: 'select * from owned_pokemon where user_id = ? order by caught_at desc',
    args: [uid],
  });
  return (rs.rows as unknown as Record<string, unknown>[]).map(rowToOwned);
}

/**
 * Load the specified owned ids, but ONLY those that belong to `uid`. The caller
 * can compare the returned length against the requested ids to reject a party
 * that claims a mon the user doesn't own.
 */
export async function readOwnedByIds(
  db: Executor,
  uid: string,
  ids: string[],
): Promise<OwnedMon[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rs = await db.execute({
    sql: `select * from owned_pokemon where user_id = ? and id in (${placeholders})`,
    args: [uid, ...ids],
  });
  return (rs.rows as unknown as Record<string, unknown>[]).map(rowToOwned);
}

function ownedFromSpec(id: string, spec: MintSpec, origin: CatchOrigin, now: number): OwnedMon {
  return {
    id,
    dexId: spec.dexId,
    level: spec.level,
    exp: 0,
    stats: spec.stats,
    sign: spec.sign,
    ...(spec.ability ? { ability: spec.ability } : {}),
    ...(spec.build ? { build: spec.build } : {}),
    shiny: spec.shiny,
    altColor: spec.altColor,
    ...(spec.emotion ? { emotion: spec.emotion } : {}),
    origin,
    caughtAt: now,
  };
}

/** Mint a new owned mon from a rolled spec. Returns the stored row. */
export async function insertOwned(
  db: Executor,
  uid: string,
  spec: MintSpec,
  origin: CatchOrigin,
  now: number,
): Promise<OwnedMon> {
  const id = newId();
  await db.execute({
    sql: `insert into owned_pokemon
          (id, user_id, dex_id, level, exp, stats, sign, ability, build, shiny, alt_color, emotion, origin, caught_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      uid,
      spec.dexId,
      spec.level,
      0,
      JSON.stringify(spec.stats),
      spec.sign,
      spec.ability ?? null,
      spec.build ?? null,
      spec.shiny ? 1 : 0,
      spec.altColor ? 1 : 0,
      spec.emotion ?? null,
      origin,
      now,
    ],
  });
  return ownedFromSpec(id, spec, origin, now);
}

// --- Nickname ----------------------------------------------------

export async function updateOwnedNickname(db: Db, uid: string, id: string, nickname: string): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set nickname = ? where id = ? and user_id = ?',
    args: [nickname, id, uid],
  });
}

// --- Profiles ----------------------------------------------------------------

export interface ProfileRow {
  userId: string;
  profession: string;
  mentor: string;
  starterId: string;
  currentRoute: string;
  createdAt: number;
  /** The saved party as stored (owned ids, lead first), or null when never saved or unreadable. */
  party: string[] | null;
}

function rowToProfile(r: Record<string, unknown>): ProfileRow {
  const party = parseJson(r.party);
  return {
    userId: String(r.user_id),
    profession: String(r.profession),
    mentor: String(r.mentor),
    starterId: String(r.starter_id),
    currentRoute: String(r.current_route ?? 'r1'),
    createdAt: Number(r.created_at) || 0,
    party: Array.isArray(party) && party.every((id) => typeof id === 'string') ? (party as string[]) : null,
  };
}

export async function readProfile(db: Executor, uid: string): Promise<ProfileRow | null> {
  const rs = await db.execute({ sql: 'select * from profiles where user_id = ?', args: [uid] });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToProfile(r) : null;
}

export async function updateProfileParty(db: Executor, uid: string, ids: string[]): Promise<number> {
  const rs = await db.execute({ sql: 'update profiles set party = ? where user_id = ?', args: [JSON.stringify(ids), uid] });
  return rs.rowsAffected;
}

/**
 * Create the profile and mint its starter atomically. The profiles primary key
 * is the gate: a second onboarding attempt fails the whole batch, so no orphan
 * starter can be left behind. Returns the stored starter row.
 */
export async function insertProfileWithStarter(
  db: Db,
  p: Omit<ProfileRow, 'starterId' | 'party'>,
  spec: MintSpec,
  now: number,
): Promise<OwnedMon> {
  const id = newId();
  await db.batch(
    [
      {
        sql: 'insert into profiles (user_id, profession, mentor, starter_id, current_route, created_at) values (?, ?, ?, ?, ?, ?)',
        args: [p.userId, p.profession, p.mentor, id, p.currentRoute, p.createdAt],
      },
      {
        sql: `insert into owned_pokemon
              (id, user_id, dex_id, level, exp, stats, sign, ability, build, shiny, alt_color, emotion, origin, caught_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, p.userId, spec.dexId, spec.level, 0, JSON.stringify(spec.stats), spec.sign, spec.ability ?? null, spec.build ?? null, spec.shiny ? 1 : 0, spec.altColor ? 1 : 0, spec.emotion ?? null, 'starter', now],
      },
    ],
    'write',
  );
  return ownedFromSpec(id, spec, 'starter', now);
}

// --- Owned growth --------------------------------------------------------------

/**
 * Persist what a growth changed: species, ability (evolution re-rolls it),
 * hidden level, EXP and stats. Nothing else on the row is touched, so a
 * nickname set while the party was out survives. Scoped to the owner.
 */
export async function updateOwnedGrowth(db: Executor, uid: string, mon: OwnedMon): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set dex_id = ?, ability = ?, level = ?, exp = ?, stats = ? where id = ? and user_id = ?',
    args: [mon.dexId, mon.ability ?? null, mon.level, mon.exp, JSON.stringify(mon.stats), mon.id, uid],
  });
}

// --- Activities (training and exploration) ---------------------------------------
// Both modes live in idle_sessions, so its partial unique index
// (idle_one_open_idx: one row with claimed_at null per user) is the one-activity
// rule. Rows from the paused idle routes have no mode or rules version.

export interface ActivityRow {
  id: string;
  userId: string;
  routeId: string;
  partyIds: string[];
  seed: string;
  startedAt: number;
  /** Settled at; null while the activity is open. */
  claimedAt: number | null;
  stoppedBy: string | null;
  encounters: number;
  mode: 'train' | 'explore' | null;
  rulesVersion: number | null;
  partySnapshot: unknown;
  config: unknown;
  state: unknown;
  step: number;
  requestId: string | null;
  result: unknown;
  seenAt: number | null;
}

export function rowToActivity(r: Record<string, unknown>): ActivityRow {
  const ids = parseJson(r.party_ids);
  return {
    id: String(r.id),
    userId: String(r.user_id),
    routeId: String(r.route_id),
    partyIds: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
    seed: String(r.seed),
    startedAt: Number(r.started_at) || 0,
    claimedAt: nullableNumber(r.claimed_at),
    stoppedBy: r.stopped_by === null || r.stopped_by === undefined ? null : String(r.stopped_by),
    encounters: Number(r.encounters) || 0,
    mode: r.mode === 'train' || r.mode === 'explore' ? r.mode : null,
    rulesVersion: nullableNumber(r.rules_version),
    partySnapshot: parseJson(r.party_snapshot),
    config: parseJson(r.config),
    state: parseJson(r.state),
    step: Number(r.step) || 0,
    requestId: r.request_id === null || r.request_id === undefined ? null : String(r.request_id),
    result: parseJson(r.result),
    seenAt: nullableNumber(r.seen_at),
  };
}

async function oneActivity(db: Executor, sql: string, args: string[]): Promise<ActivityRow | null> {
  const rs = await db.execute({ sql, args });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToActivity(r) : null;
}

export function readOpenActivity(db: Executor, uid: string): Promise<ActivityRow | null> {
  return oneActivity(db, 'select * from idle_sessions where user_id = ? and claimed_at is null order by started_at desc limit 1', [uid]);
}

export function readActivity(db: Executor, uid: string, id: string): Promise<ActivityRow | null> {
  return oneActivity(db, 'select * from idle_sessions where id = ? and user_id = ? limit 1', [id, uid]);
}

/** The newest settled activity whose result the player has not dismissed. */
export function readUnseenResult(db: Executor, uid: string): Promise<ActivityRow | null> {
  return oneActivity(
    db,
    'select * from idle_sessions where user_id = ? and claimed_at is not null and result is not null and seen_at is null order by claimed_at desc limit 1',
    [uid],
  );
}

/** Where the trainer last went (the map marker when nothing is running). */
export async function readLastRouteId(db: Executor, uid: string): Promise<string | null> {
  const rs = await db.execute({ sql: 'select route_id from idle_sessions where user_id = ? order by started_at desc limit 1', args: [uid] });
  const r = rs.rows[0] as unknown as { route_id?: unknown } | undefined;
  return r?.route_id === undefined || r.route_id === null ? null : String(r.route_id);
}

export interface NewActivity {
  id: string;
  userId: string;
  routeId: string;
  partyIds: string[];
  seed: string;
  startedAt: number;
  mode: 'train' | 'explore';
  rulesVersion: number;
  partySnapshot: unknown;
  config: unknown;
  state: unknown;
  requestId: string;
}

export function insertActivityStatement(a: NewActivity): InStatement {
  return {
    sql: `insert into idle_sessions
          (id, user_id, route_id, party_ids, seed, started_at, mode, rules_version, party_snapshot, config, state, step, request_id)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    args: [
      a.id,
      a.userId,
      a.routeId,
      JSON.stringify(a.partyIds),
      a.seed,
      a.startedAt,
      a.mode,
      a.rulesVersion,
      JSON.stringify(a.partySnapshot),
      JSON.stringify(a.config),
      a.state === null ? null : JSON.stringify(a.state),
      a.requestId,
    ],
  };
}

/** Starting something new retires every result still on screen. */
export function markResultsSeenStatement(uid: string, now: number): InStatement {
  return {
    sql: 'update idle_sessions set seen_at = ? where user_id = ? and claimed_at is not null and seen_at is null',
    args: [now, uid],
  };
}

/** Advance an expedition one checkpoint, only if nobody else already did. */
export async function updateActivityState(
  db: Executor,
  p: { id: string; uid: string; fromStep: number; state: unknown },
): Promise<number> {
  const rs = await db.execute({
    sql: 'update idle_sessions set state = ?, step = ? where id = ? and user_id = ? and step = ? and claimed_at is null',
    args: [JSON.stringify(p.state), p.fromStep + 1, p.id, p.uid, p.fromStep],
  });
  return rs.rowsAffected;
}

/** Settle an activity, only if it is still open; 1 means this caller settled it. */
export async function closeActivity(
  db: Executor,
  p: { id: string; uid: string; claimedAt: number; stoppedBy: string; encounters: number; step: number; state: unknown | null; result: unknown },
): Promise<number> {
  const rs = await db.execute({
    sql: `update idle_sessions set claimed_at = ?, stopped_by = ?, encounters = ?, step = ?, state = coalesce(?, state), result = ?
          where id = ? and user_id = ? and claimed_at is null`,
    args: [
      p.claimedAt,
      p.stoppedBy,
      p.encounters,
      p.step,
      p.state === null ? null : JSON.stringify(p.state),
      p.result === null ? null : JSON.stringify(p.result),
      p.id,
      p.uid,
    ],
  });
  return rs.rowsAffected;
}

/** Dismiss a settled activity's result; keeps the first dismissal time. */
export async function markResultSeen(db: Executor, uid: string, id: string, now: number): Promise<number> {
  const rs = await db.execute({
    sql: 'update idle_sessions set seen_at = coalesce(seen_at, ?) where id = ? and user_id = ? and claimed_at is not null',
    args: [now, id, uid],
  });
  return rs.rowsAffected;
}

// --- World progress and discoveries --------------------------------------------------

export interface ProgressRow {
  locationId: string;
  clearedAt: number | null;
  explores: number;
  clears: number;
  trainings: number;
  trainingWins: number;
}

export async function readProgress(db: Executor, uid: string): Promise<ProgressRow[]> {
  const rs = await db.execute({ sql: 'select * from world_progress where user_id = ?', args: [uid] });
  return (rs.rows as unknown as Record<string, unknown>[]).map((r) => ({
    locationId: String(r.location_id),
    clearedAt: nullableNumber(r.cleared_at),
    explores: Number(r.explores) || 0,
    clears: Number(r.clears) || 0,
    trainings: Number(r.trainings) || 0,
    trainingWins: Number(r.training_wins) || 0,
  }));
}

/** Count a start at a route (explores or trainings). */
export function progressStartStatement(uid: string, locationId: string, mode: 'train' | 'explore'): InStatement {
  const sql =
    mode === 'explore'
      ? 'insert into world_progress (user_id, location_id, explores) values (?, ?, 1) on conflict (user_id, location_id) do update set explores = explores + 1'
      : 'insert into world_progress (user_id, location_id, trainings) values (?, ?, 1) on conflict (user_id, location_id) do update set trainings = trainings + 1';
  return { sql, args: [uid, locationId] };
}

/** Record a settlement: the first clear time sticks; clears and training wins add up. */
export async function applyProgressSettlement(
  db: Executor,
  p: { uid: string; locationId: string; clearedAt: number | null; clears: number; trainingWins: number },
): Promise<void> {
  await db.execute({
    sql: `insert into world_progress (user_id, location_id, cleared_at, clears, training_wins) values (?, ?, ?, ?, ?)
          on conflict (user_id, location_id) do update set
            cleared_at = coalesce(world_progress.cleared_at, excluded.cleared_at),
            clears = world_progress.clears + excluded.clears,
            training_wins = world_progress.training_wins + excluded.training_wins`,
    args: [p.uid, p.locationId, p.clearedAt, p.clears, p.trainingWins],
  });
}

export interface DiscoveryRow {
  locationId: string;
  kind: 'seen' | 'landmark';
  ref: string;
  foundAt: number;
}

export async function readDiscoveries(db: Executor, uid: string): Promise<DiscoveryRow[]> {
  const rs = await db.execute({ sql: 'select * from world_discoveries where user_id = ?', args: [uid] });
  return (rs.rows as unknown as Record<string, unknown>[])
    .filter((r) => r.kind === 'seen' || r.kind === 'landmark')
    .map((r) => ({
      locationId: String(r.location_id),
      kind: r.kind as 'seen' | 'landmark',
      ref: String(r.ref),
      foundAt: Number(r.found_at) || 0,
    }));
}

/** Every species this trainer has seen on any route, once each. */
export async function readSeenDexIds(db: Executor, uid: string): Promise<number[]> {
  const rs = await db.execute({
    sql: "select distinct ref from world_discoveries where user_id = ? and kind = 'seen'",
    args: [uid],
  });
  return (rs.rows as unknown as { ref: unknown }[]).map((r) => Number(r.ref)).filter(Number.isInteger);
}

/** Record a sighting or landmark; true when it is new for this trainer and place. */
export async function insertDiscovery(
  db: Executor,
  p: { uid: string; locationId: string; kind: 'seen' | 'landmark'; ref: string; foundAt: number },
): Promise<boolean> {
  const rs = await db.execute({
    sql: 'insert or ignore into world_discoveries (user_id, location_id, kind, ref, found_at) values (?, ?, ?, ?, ?)',
    args: [p.uid, p.locationId, p.kind, p.ref, p.foundAt],
  });
  return rs.rowsAffected === 1;
}

/** Log the battles an activity fought, as the paused idle claim did (no capture reads them yet). */
export async function insertEncounterRows(
  db: Executor,
  sessionId: string,
  rows: readonly { slot: number; dexId: number; level: number; won: boolean }[],
): Promise<void> {
  if (rows.length === 0) return;
  // One round trip: inside a remote transaction every execute is a request.
  await db.batch(
    rows.map((e) => ({
      sql: 'insert or ignore into encounters (session_id, slot, dex_id, level, won) values (?, ?, ?, ?, ?)',
      args: [sessionId, e.slot, e.dexId, e.level, e.won ? 1 : 0],
    })),
  );
}

// --- Active routes and Bag ---------------------------------------------------
// Multi-step writes below are called inside the route domain's write transaction.

export interface RouteAccountRow {
  activatedAt: number;
  actions: number;
  refilledAt: number;
  inventoryRevision: number;
  money: number;
  revision: number;
  transition: unknown;
}

export async function readRouteAccount(db: Executor, uid: string): Promise<RouteAccountRow | null> {
  const rs = await db.execute({ sql: 'select * from route_accounts where user_id = ?', args: [uid] });
  const r = rs.rows[0];
  return r ? {
    activatedAt: Number(r.activated_at), actions: Number(r.actions), refilledAt: Number(r.refilled_at),
    inventoryRevision: Number(r.inventory_revision), money: Number(r.money) || 0, revision: Number(r.revision), transition: parseJson(r.transition),
  } : null;
}

export async function insertRouteAccount(db: Executor, uid: string, actions: number, now: number, transition: unknown): Promise<void> {
  await db.execute({
    sql: 'insert into route_accounts (user_id, activated_at, actions, refilled_at, transition) values (?, ?, ?, ?, ?)',
    args: [uid, now, actions, now, transition === null ? null : JSON.stringify(transition)],
  });
}

export async function writeRouteAllowance(db: Executor, uid: string, actions: number, refilledAt: number): Promise<void> {
  await db.execute({ sql: 'update route_accounts set actions = ?, refilled_at = ? where user_id = ?', args: [actions, refilledAt, uid] });
}

export async function readInventoryRows(db: Executor, uid: string): Promise<{ itemId: string; quantity: number }[]> {
  const rs = await db.execute({ sql: 'select item_id, quantity from inventory_items where user_id = ? order by item_id', args: [uid] });
  return rs.rows.map((r) => ({ itemId: String(r.item_id), quantity: Number(r.quantity) }));
}

/** Shared acquisition/consumption path. Negative changes are conditional, never clamped. */
export async function changeInventory(db: Executor, uid: string, itemId: string, quantity: number): Promise<boolean> {
  if (!Number.isSafeInteger(quantity) || quantity === 0) throw new Error('Invalid inventory change');
  if (quantity < 0) {
    const rs = await db.execute({
      sql: 'update inventory_items set quantity = quantity + ? where user_id = ? and item_id = ? and quantity >= ?',
      args: [quantity, uid, itemId, -quantity],
    });
    if (rs.rowsAffected !== 1) return false;
  } else {
    await db.execute({
      sql: `insert into inventory_items (user_id, item_id, quantity) values (?, ?, ?)
            on conflict (user_id, item_id) do update set quantity = inventory_items.quantity + excluded.quantity`,
      args: [uid, itemId, quantity],
    });
  }
  await db.execute({ sql: 'update route_accounts set inventory_revision = inventory_revision + 1 where user_id = ?', args: [uid] });
  return true;
}

/** Shared ₽ path. A debit that would go below zero, or a credit past the safe range, changes nothing. */
export async function changeMoney(db: Executor, uid: string, delta: number): Promise<boolean> {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Invalid money change');
  const rs = await db.execute({
    sql: `update route_accounts set money = money + ?, inventory_revision = inventory_revision + 1
          where user_id = ? and money + ? >= 0 and money + ? <= 9007199254740991`,
    args: [delta, uid, delta, delta],
  });
  return rs.rowsAffected === 1;
}

export interface RouteEventRow {
  id: string;
  createdAt: number;
  revision: number;
  active: boolean;
  seenAt: number | null;
  data: unknown;
}
function rowToRouteEvent(r: Record<string, unknown>): RouteEventRow {
  return { id: String(r.id), createdAt: Number(r.created_at), revision: Number(r.revision), active: Number(r.active) === 1, seenAt: nullableNumber(r.seen_at), data: parseJson(r.data) };
}
export async function readRouteEvent(db: Executor, uid: string, eventId: string): Promise<RouteEventRow | null> {
  const rs = await db.execute({ sql: 'select * from route_events where user_id = ? and id = ?', args: [uid, eventId] });
  return rs.rows[0] ? rowToRouteEvent(rs.rows[0] as unknown as Record<string, unknown>) : null;
}
export async function readActiveRouteEvent(db: Executor, uid: string): Promise<RouteEventRow | null> {
  const rs = await db.execute({ sql: 'select * from route_events where user_id = ? and active = 1 limit 1', args: [uid] });
  return rs.rows[0] ? rowToRouteEvent(rs.rows[0] as unknown as Record<string, unknown>) : null;
}
export async function readUnseenRouteEvent(db: Executor, uid: string): Promise<RouteEventRow | null> {
  const rs = await db.execute({ sql: 'select * from route_events where user_id = ? and active = 0 and seen_at is null order by created_at desc, rowid desc limit 1', args: [uid] });
  return rs.rows[0] ? rowToRouteEvent(rs.rows[0] as unknown as Record<string, unknown>) : null;
}
export async function hasRouteEvents(db: Executor, uid: string): Promise<boolean> {
  const rs = await db.execute({ sql: 'select id from route_events where user_id = ? limit 1', args: [uid] });
  return rs.rows.length > 0;
}
export async function insertRouteEvent(db: Executor, uid: string, row: RouteEventRow): Promise<void> {
  await db.execute({
    sql: 'insert into route_events (id, user_id, created_at, revision, active, seen_at, data) values (?, ?, ?, ?, ?, ?, ?)',
    args: [row.id, uid, row.createdAt, row.revision, row.active ? 1 : 0, row.seenAt, JSON.stringify(row.data)],
  });
}
export async function updateRouteEvent(db: Executor, uid: string, row: RouteEventRow, expectedRevision: number): Promise<boolean> {
  const rs = await db.execute({
    sql: 'update route_events set revision = ?, active = ?, data = ? where user_id = ? and id = ? and revision = ?',
    args: [row.revision, row.active ? 1 : 0, JSON.stringify(row.data), uid, row.id, expectedRevision],
  });
  return rs.rowsAffected === 1;
}
export async function dismissRouteEvent(db: Executor, uid: string, eventId: string, now: number): Promise<boolean> {
  const rs = await db.execute({ sql: 'update route_events set seen_at = coalesce(seen_at, ?) where user_id = ? and id = ? and active = 0', args: [now, uid, eventId] });
  return rs.rowsAffected === 1;
}
export async function dismissPriorRouteEvents(db: Executor, uid: string, now: number): Promise<void> {
  await db.execute({ sql: 'update route_events set seen_at = coalesce(seen_at, ?) where user_id = ? and active = 0', args: [now, uid] });
}
export async function readRouteReceipt(db: Executor, uid: string, requestId: string): Promise<{ payload: string; receipt: unknown } | null> {
  const rs = await db.execute({ sql: 'select payload, receipt from route_receipts where user_id = ? and request_id = ?', args: [uid, requestId] });
  return rs.rows[0] ? { payload: String(rs.rows[0].payload), receipt: parseJson(rs.rows[0].receipt) } : null;
}
export async function insertRouteReceipt(db: Executor, uid: string, requestId: string, payload: string, receipt: unknown, now: number): Promise<void> {
  await db.execute({ sql: 'insert into route_receipts (user_id, request_id, payload, receipt, created_at) values (?, ?, ?, ?, ?)', args: [uid, requestId, payload, JSON.stringify(receipt), now] });
}
export async function readRouteQuest(db: Executor, uid: string, questId: string): Promise<{ acceptedAt: number; claimedAt: number | null } | null> {
  const rs = await db.execute({ sql: 'select accepted_at, claimed_at from route_quests where user_id = ? and quest_id = ?', args: [uid, questId] });
  return rs.rows[0] ? { acceptedAt: Number(rs.rows[0].accepted_at), claimedAt: nullableNumber(rs.rows[0].claimed_at) } : null;
}
export async function acceptRouteQuest(db: Executor, uid: string, questId: string, now: number): Promise<void> {
  await db.execute({ sql: 'insert or ignore into route_quests (user_id, quest_id, accepted_at) values (?, ?, ?)', args: [uid, questId, now] });
}
export async function markRouteQuestClaimed(db: Executor, uid: string, questId: string, now: number): Promise<boolean> {
  const rs = await db.execute({ sql: 'update route_quests set claimed_at = ? where user_id = ? and quest_id = ? and claimed_at is null', args: [now, uid, questId] });
  return rs.rowsAffected === 1;
}
export async function countOwned(db: Executor, uid: string): Promise<number> {
  const rs = await db.execute({ sql: 'select count(*) as total from owned_pokemon where user_id = ?', args: [uid] });
  return Number(rs.rows[0]?.total) || 0;
}
/** The Pokédex layer an individual fills: shiny wins over alt colour. */
function dexLayerOf(shiny: boolean, altColor: boolean): DexLayer {
  return shiny ? 's' : altColor ? 'a' : 'n';
}
/** Species and layer of every Pokémon the trainer owns now, for the Pokédex. */
export async function readOwnedForms(db: Executor, uid: string): Promise<{ dexId: number; layer: DexLayer }[]> {
  const rs = await db.execute({ sql: 'select dex_id, shiny, alt_color from owned_pokemon where user_id = ?', args: [uid] });
  return rs.rows.map((r) => ({ dexId: Number(r.dex_id), layer: dexLayerOf(Number(r.shiny) === 1, Number(r.alt_color) === 1) }));
}
export async function recordCaughtDex(db: Executor, uid: string, mon: OwnedMon, now: number): Promise<void> {
  await db.execute({ sql: 'insert or ignore into pokedex_cells (user_id, dex_id, layer, caught_at) values (?, ?, ?, ?)', args: [uid, mon.dexId, dexLayerOf(mon.shiny, mon.altColor), now] });
}

export async function advanceRouteRevision(db: Executor, uid: string): Promise<void> {
  await db.execute({ sql: 'update route_accounts set revision = revision + 1 where user_id = ?', args: [uid] });
}
