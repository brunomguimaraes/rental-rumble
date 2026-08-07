import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import type { BracketId } from '../src/game/gens.js';
import type { Difficulty } from '../src/game/run.js';
import type { SubmissionMon } from '../src/game/leaderboard.js';
import type { AbilityId, Build, Sign } from '../src/game/types.js';
import type { CatchOrigin, MintSpec, OwnedMon } from '../src/game/box.js';

// Turso (libSQL / SQLite) holds the optional account layer (users, Pokédex,
// run history, single-use auth tokens). It's fast, has no autosuspend
// cold-start, and the same client also points at a local `file:...` SQLite file
// for offline dev. Initialised lazily (like getRedis) so a missing
// TURSO_DATABASE_URL degrades to a clean 503 instead of crashing at import.

export type Db = Client;

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

/** A fresh app-generated id for a new account row. */
export const newId = (): string => randomUUID();

// --- Shared constants --------------------------------------------------------

/** The three independent Pokédex completion layers. */
export const DEX_LAYERS = ['n', 'a', 's'] as const;
export type DexLayer = (typeof DEX_LAYERS)[number];

/** Highest National Dex id we track (mirrors RAW_DEX length). */
export const DEX_MAX_ID = 1025;

/** How many recent runs the personal history keeps/returns. */
export const RUNS_LIMIT = 100;

// Single-use token lifetimes (seconds).
export const VERIFY_TTL_SECONDS = 60 * 60 * 24; // 24h
export const RESET_TTL_SECONDS = 60 * 60; // 1h
export const OAUTH_STATE_TTL_SECONDS = 60 * 10; // 10m

export type OAuthProvider = 'discord' | 'google';
export type RunOutcome = 'win' | 'loss' | 'ragequit';

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

/** A single personal-history row — reuses the board's tamper-proof mon record. */
export interface RunRecord {
  runId: string;
  date: string;
  bracket: BracketId;
  difficulty: Difficulty;
  outcome: RunOutcome;
  clearedStages: number;
  team: SubmissionMon[];
  fellTo?: string;
  at: number;
  formsGained: number;
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
    origin: (String(r.origin ?? 'catch') as CatchOrigin),
    caughtAt: Number(r.caught_at) || 0,
  };
}

/** Every mon a user owns, newest first. */
export async function readOwnedByUser(db: Db, uid: string): Promise<OwnedMon[]> {
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
  db: Db,
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

/** Persist a mon's new level/exp after a run (the sole EXP writer). */
export async function updateOwnedGrowth(
  db: Db,
  uid: string,
  id: string,
  level: number,
  exp: number,
): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set level = ?, exp = ? where id = ? and user_id = ?',
    args: [level, exp, id, uid],
  });
}
