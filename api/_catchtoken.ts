import { createHmac, timingSafeEqual } from 'node:crypto';
import { isZoneId, type ZoneId } from '../src/game/zones.js';

// A catch token is the run token's cousin for Catch runs. When /catch/start
// validates a party + zone, it mints one: the server picks the mission seed,
// pins it to the signed-in user, the chosen zone and the exact party of owned
// ids, and signs the whole thing with the same secret run tokens use. /catch/
// complete then trusts only a mission whose seed came from a token it issued —
// so a reward can't be curl'd without first passing the ownership/level checks,
// and the seed can't be brute-forced offline for a winning RNG.

// Generous enough for a few short battles with animations; bounded so a token
// can't be stockpiled and replayed much later.
export const CATCH_TOKEN_TTL_MS = 1000 * 60 * 30;

// A real catch run plays at least a couple of animated battles; nothing honest
// finishes faster than this, so it only blocks instant scripted completes.
export const MIN_CATCH_MS = 3_000;

export interface CatchTokenClaims {
  uid: string;
  zone: ZoneId;
  party: string[]; // owned ids, validated at /start
  seed: string;
  n: string; // single-use nonce
  iat: number; // issued-at, epoch ms
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function signCatchToken(claims: CatchTokenClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export type CatchTokenResult =
  | { ok: true; claims: CatchTokenClaims }
  | { ok: false; reason: string };

export function verifyCatchToken(token: unknown, secret: string): CatchTokenResult {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: 'missing catch token' };
  }
  const dot = token.indexOf('.');
  if (dot <= 0 || dot >= token.length - 1) {
    return { ok: false, reason: 'malformed catch token' };
  }
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad catch token signature' };
  }

  let claims: CatchTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CatchTokenClaims;
  } catch {
    return { ok: false, reason: 'unreadable catch token' };
  }
  if (
    !claims ||
    typeof claims.uid !== 'string' ||
    typeof claims.seed !== 'string' ||
    typeof claims.n !== 'string' ||
    typeof claims.iat !== 'number' ||
    !isZoneId(claims.zone) ||
    !Array.isArray(claims.party) ||
    !claims.party.every((p) => typeof p === 'string')
  ) {
    return { ok: false, reason: 'invalid catch token claims' };
  }
  return { ok: true, claims };
}
