import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AbilityId, Build, Sign } from '../src/game/types.js';
import type { CatchOrigin, MintSpec, OwnedMon } from '../src/game/box.js';

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
const COLUMN_ADDS = ['alter table owned_pokemon add column nickname text'];

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

/** Build an OwnedMon from a raw SQLite row (snake_case columns, 0/1 booleans). */
export function rowToOwned(r: Record<string, unknown>): OwnedMon {
  return {
    id: String(r.id),
    dexId: Number(r.dex_id) || 0,
    level: Number(r.level) || 1,
    exp: Number(r.exp) || 0,
    sign: String(r.sign ?? '') as Sign,
    ...(r.ability ? { ability: String(r.ability) as AbilityId } : {}),
    ...(r.build ? { build: String(r.build) as Build } : {}),
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

/** Count a user's owned mons (used both for the box cap and tutorial gating). */
export async function countOwned(db: Db, uid: string): Promise<number> {
  const rs = await db.execute({
    sql: 'select count(*) as n from owned_pokemon where user_id = ?',
    args: [uid],
  });
  return Number((rs.rows[0] as unknown as { n: number })?.n) || 0;
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
  db: Db,
  uid: string,
  spec: MintSpec,
  origin: CatchOrigin,
  now: number,
): Promise<OwnedMon> {
  const id = newId();
  await db.execute({
    sql: `insert into owned_pokemon
          (id, user_id, dex_id, level, exp, sign, ability, build, shiny, alt_color, emotion, origin, caught_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      uid,
      spec.dexId,
      spec.level,
      0,
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

/**
 * Mint a mon only while the user owns exactly `expectedCount` rows. The count
 * check and the insert are one statement, so concurrent callers can't both
 * pass the check. Returns the stored row, or null when the count didn't match.
 */
export async function insertOwnedIfCount(
  db: Db,
  uid: string,
  spec: MintSpec,
  origin: CatchOrigin,
  now: number,
  expectedCount: number,
): Promise<OwnedMon | null> {
  const id = newId();
  const rs = await db.execute({
    sql: `insert into owned_pokemon
          (id, user_id, dex_id, level, exp, sign, ability, build, shiny, alt_color, emotion, origin, caught_at)
          select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          where (select count(*) from owned_pokemon where user_id = ?) = ?`,
    args: [
      id,
      uid,
      spec.dexId,
      spec.level,
      0,
      spec.sign,
      spec.ability ?? null,
      spec.build ?? null,
      spec.shiny ? 1 : 0,
      spec.altColor ? 1 : 0,
      spec.emotion ?? null,
      origin,
      now,
      uid,
      expectedCount,
    ],
  });
  return rs.rowsAffected === 1 ? ownedFromSpec(id, spec, origin, now) : null;
}

// --- Nickname / evolution ----------------------------------------------------

export async function updateOwnedNickname(db: Db, uid: string, id: string, nickname: string): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set nickname = ? where id = ? and user_id = ?',
    args: [nickname, id, uid],
  });
}

/** Persist an evolved/grown mon: species, ability, level, exp (the claim writer). */
export async function updateOwnedEvolution(db: Executor, uid: string, mon: OwnedMon): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set dex_id = ?, ability = ?, level = ?, exp = ? where id = ? and user_id = ?',
    args: [mon.dexId, mon.ability ?? null, mon.level, mon.exp, mon.id, uid],
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
}

function rowToProfile(r: Record<string, unknown>): ProfileRow {
  return {
    userId: String(r.user_id),
    profession: String(r.profession),
    mentor: String(r.mentor),
    starterId: String(r.starter_id),
    currentRoute: String(r.current_route ?? 'r1'),
    createdAt: Number(r.created_at) || 0,
  };
}

export async function readProfile(db: Db, uid: string): Promise<ProfileRow | null> {
  const rs = await db.execute({ sql: 'select * from profiles where user_id = ?', args: [uid] });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToProfile(r) : null;
}

/**
 * Create the profile and mint its starter atomically. The profiles primary key
 * is the gate: a second onboarding attempt fails the whole batch, so no orphan
 * starter can be left behind. Returns the stored starter row.
 */
export async function insertProfileWithStarter(
  db: Db,
  p: Omit<ProfileRow, 'starterId'>,
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
              (id, user_id, dex_id, level, exp, sign, ability, build, shiny, alt_color, emotion, origin, caught_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, p.userId, spec.dexId, spec.level, 0, spec.sign, spec.ability ?? null, spec.build ?? null, spec.shiny ? 1 : 0, spec.altColor ? 1 : 0, spec.emotion ?? null, 'starter', now],
      },
    ],
    'write',
  );
  return ownedFromSpec(id, spec, 'starter', now);
}

// --- Idle sessions -----------------------------------------------------------

export interface IdleSessionRow {
  id: string;
  userId: string;
  routeId: string;
  partyIds: string[];
  seed: string;
  startedAt: number;
  claimedAt: number | null;
  stoppedBy: string | null;
  encounters: number;
  log: string | null;
}

function rowToSession(r: Record<string, unknown>): IdleSessionRow {
  let partyIds: string[] = [];
  try {
    const parsed = JSON.parse(String(r.party_ids ?? '[]'));
    if (Array.isArray(parsed)) partyIds = parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    partyIds = [];
  }
  return {
    id: String(r.id),
    userId: String(r.user_id),
    routeId: String(r.route_id),
    partyIds,
    seed: String(r.seed),
    startedAt: Number(r.started_at) || 0,
    claimedAt: r.claimed_at === null || r.claimed_at === undefined ? null : Number(r.claimed_at),
    stoppedBy: r.stopped_by === null || r.stopped_by === undefined ? null : String(r.stopped_by),
    encounters: Number(r.encounters) || 0,
    log: r.log === null || r.log === undefined ? null : String(r.log),
  };
}

export async function readOpenSession(db: Db, uid: string): Promise<IdleSessionRow | null> {
  const rs = await db.execute({
    sql: 'select * from idle_sessions where user_id = ? and claimed_at is null order by started_at desc limit 1',
    args: [uid],
  });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToSession(r) : null;
}

export async function readSessionById(db: Executor, uid: string, id: string): Promise<IdleSessionRow | null> {
  const rs = await db.execute({
    sql: 'select * from idle_sessions where id = ? and user_id = ?',
    args: [id, uid],
  });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToSession(r) : null;
}

export async function insertSession(
  db: Db,
  s: { id: string; userId: string; routeId: string; partyIds: string[]; seed: string; startedAt: number },
): Promise<void> {
  await db.execute({
    sql: 'insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at) values (?, ?, ?, ?, ?, ?)',
    args: [s.id, s.userId, s.routeId, JSON.stringify(s.partyIds), s.seed, s.startedAt],
  });
}

/** Close a session only if it is still open; true means this caller won the claim. */
export async function claimSession(
  db: Executor,
  id: string,
  uid: string,
  patch: { claimedAt: number; stoppedBy: string; encounters: number; log: string },
): Promise<boolean> {
  const rs = await db.execute({
    sql: 'update idle_sessions set claimed_at = ?, stopped_by = ?, encounters = ?, log = ? where id = ? and user_id = ? and claimed_at is null',
    args: [patch.claimedAt, patch.stoppedBy, patch.encounters, patch.log, id, uid],
  });
  return rs.rowsAffected === 1;
}

export async function insertEncounters(
  db: Executor,
  sessionId: string,
  records: readonly { slot: number; dexId: number; level: number; won: boolean; turns: number }[],
): Promise<void> {
  if (records.length === 0) return;
  await db.batch(
    records.map((e) => ({
      sql: 'insert or ignore into encounters (session_id, slot, dex_id, level, won) values (?, ?, ?, ?, ?)',
      args: [sessionId, e.slot, e.dexId, e.level, e.won ? 1 : 0],
    })),
    'write',
  );
}
