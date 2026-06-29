// Client-side wrappers for the optional account API (api/auth/*). All requests
// are same-origin, so the HTTP-only session cookie rides along automatically
// (`credentials: 'include'` is set for clarity). Everything degrades
// gracefully — a failed or absent backend just leaves the player signed out and
// the game fully playable.

import type { SubmissionMon } from './leaderboard';
import type { BracketId } from './gens';
import type { Difficulty } from './run';

export type OAuthProvider = 'discord' | 'google';

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  providers: OAuthProvider[];
  stats: { runs: number; wins: number; losses: number };
}

export interface AuthResult {
  ok: boolean;
  user?: AccountUser;
  error?: string;
}

async function postJson(url: string, body: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<AuthResult>;
    if (!res.ok) return { ok: false, error: data.error || 'something went wrong' };
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, error: 'network error — please try again' };
  }
}

export function signup(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthResult> {
  return postJson('/api/auth/signup', input);
}

export function login(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  return postJson('/api/auth/login', input);
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* a failed logout still drops the in-memory user; ignore */
  }
}

/** The currently signed-in user, or null. Never throws. */
export async function fetchMe(): Promise<AccountUser | null> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: AccountUser | null };
    return data.user ?? null;
  } catch {
    return null;
  }
}

/** Ask for a password-reset email. Always resolves ok (no account enumeration). */
export async function requestReset(email: string): Promise<{ ok: boolean }> {
  try {
    await fetch('/api/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    /* ignore — we always tell the user to check their inbox */
  }
  return { ok: true };
}

/** Complete a password reset with the token from the emailed link. */
export function resetPassword(token: string, password: string): Promise<AuthResult> {
  return postJson('/api/auth/reset-password', { token, password });
}

/** Where to send the browser to begin an OAuth sign-in. */
export function oauthUrl(provider: OAuthProvider): string {
  return `/api/auth/oauth-start?provider=${provider}`;
}

// --- Personal Pokédex progress ----------------------------------------------

/** The player's owned dex, as three bitmaps (one per variant layer) + counts. */
export interface OwnedDex {
  n: Uint8Array; // normal layer
  a: Uint8Array; // alt-colour layer
  s: Uint8Array; // shiny layer
  counts: { n: number; a: number; s: number };
  total: number; // total trackable species
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Test whether a bit (indexed by dex id) is set in a layer bitmap. */
export function hasForm(bytes: Uint8Array, dexId: number): boolean {
  const byte = dexId >> 3;
  const bit = dexId & 7;
  return byte < bytes.length ? (bytes[byte] & (1 << bit)) !== 0 : false;
}

// --- Personal run history ----------------------------------------------------

export type RunOutcome = 'win' | 'loss' | 'ragequit';

/** One row of the player's personal run history (the "My Runs" archive). */
export interface MyRun {
  runId: string;
  date: string;
  bracket: BracketId;
  difficulty: Difficulty;
  outcome: RunOutcome;
  clearedStages: number;
  team: SubmissionMon[];
  fellTo?: string;
  formsGained: number;
  at: number; // epoch ms
}

/** The signed-in player's recent runs (newest first), or [] when anonymous. */
export async function fetchMyRuns(): Promise<MyRun[]> {
  try {
    const res = await fetch('/api/me/runs', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; runs?: MyRun[] };
    return Array.isArray(data.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

/** The signed-in player's owned dex, or null when anonymous / unavailable. */
export async function fetchPokedex(): Promise<OwnedDex | null> {
  try {
    const res = await fetch('/api/me/pokedex', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      owned?: { n: string; a: string; s: string } | null;
      counts?: { n: number; a: number; s: number };
      total?: number;
    };
    if (!data.ok || !data.owned) return null;
    return {
      n: b64ToBytes(data.owned.n),
      a: b64ToBytes(data.owned.a),
      s: b64ToBytes(data.owned.s),
      counts: data.counts ?? { n: 0, a: 0, s: 0 },
      total: data.total ?? 1025,
    };
  } catch {
    return null;
  }
}
