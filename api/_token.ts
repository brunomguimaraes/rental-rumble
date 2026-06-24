import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isBracketId, type BracketId } from '../src/game/gens.js';
import { isDifficulty, type Difficulty } from '../src/game/run.js';

// A run token is the keystone of leaderboard integrity. The server — not the
// client — picks the run seed, stamps it with the date/bracket/difficulty plus
// a single-use nonce, and signs the whole thing with a secret that never ships
// to the browser. `submit-win` then only trusts a win whose seed came from a
// token it issued. That defeats the two cheap attacks the deterministic, fully
// client-side game otherwise allows:
//   1. Seed brute-forcing — searching offline for a seed whose battle RNG lets
//      an arbitrary team beat the boss (impossible once the seed is ours).
//   2. Naked `curl` submissions — there's no valid token without first calling
//      `start-run`, and the signature can't be forged without the secret.

// Generous enough for a slow, distracted run; bounded so a token can't be
// stockpiled forever and replayed weeks later.
export const RUN_TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

// A real run (draft six, then clear the whole ladder with battle animations)
// physically can't finish this fast. Conservative on purpose so we never reject
// a genuine speed-runner — it only blocks instant scripted submits.
export const MIN_RUN_MS = 8_000;

// How long a spent nonce is remembered (> token TTL, so a token can't outlive
// the record that it was already used).
export const NONCE_TTL_SECONDS = 60 * 60 * 24;

export interface RunTokenClaims {
  seed: string;
  date: string;
  bracket: BracketId;
  difficulty: Difficulty;
  n: string; // single-use nonce
  iat: number; // issued-at, epoch ms
}

/** The signing secret, or null when unconfigured (enforcement is then off). */
export function getTokenSecret(): string | null {
  const s = process.env.LEADERBOARD_SECRET;
  return typeof s === 'string' && s.length >= 16 ? s : null;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function signRunToken(claims: RunTokenClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export type TokenResult =
  | { ok: true; claims: RunTokenClaims }
  | { ok: false; reason: string };

export function verifyRunToken(token: unknown, secret: string): TokenResult {
  if (typeof token !== 'string' || token.length === 0 || token.length > 1024) {
    return { ok: false, reason: 'missing run token' };
  }
  const dot = token.indexOf('.');
  if (dot <= 0 || dot >= token.length - 1) {
    return { ok: false, reason: 'malformed run token' };
  }
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Constant-time signature check — equal-length buffers are required, so a
  // length mismatch is treated as a (fast) failure before comparing.
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad run token signature' };
  }

  let claims: RunTokenClaims;
  try {
    claims = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as RunTokenClaims;
  } catch {
    return { ok: false, reason: 'unreadable run token' };
  }
  if (
    !claims ||
    typeof claims.seed !== 'string' ||
    typeof claims.date !== 'string' ||
    typeof claims.n !== 'string' ||
    typeof claims.iat !== 'number' ||
    !isBracketId(claims.bracket) ||
    !isDifficulty(claims.difficulty)
  ) {
    return { ok: false, reason: 'invalid run token claims' };
  }
  return { ok: true, claims };
}

/** Server-side run seed — opaque and unguessable, unlike the old client seed. */
export function newSeed(): string {
  return randomBytes(12).toString('base64url');
}

export function newNonce(): string {
  return randomBytes(12).toString('base64url');
}
