import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import type { BracketId } from '../src/game/gens.js';
import type { Difficulty } from '../src/game/run.js';
import type { SubmissionMon } from '../src/game/leaderboard.js';

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
