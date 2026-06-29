import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// The account layer's keystone: a signed, HTTP-only session cookie. It reuses
// the same HMAC construction as the run-token signer (api/_token.ts) — a
// base64url JSON body suffixed with an HMAC-SHA256 over that body — so the
// browser can hold the cookie but never forge or read into it. Sessions are
// stateless: verifying one is pure crypto, no database round-trip.

const COOKIE_NAME = 'rr_session';

// A month of "stay signed in" — convenient, but a leaked cookie still dies on
// its own eventually.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * The session-signing secret. Prefers a dedicated AUTH_SECRET but falls back to
 * the existing LEADERBOARD_SECRET, so a deploy that already signs run tokens
 * gets working sessions for free. Null when neither is set (or is too short to
 * be safe) — auth endpoints then return a clean 503 instead of signing with a
 * weak key.
 */
export function getAuthSecret(): string | null {
  const s = process.env.AUTH_SECRET || process.env.LEADERBOARD_SECRET;
  return typeof s === 'string' && s.length >= 16 ? s : null;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

interface SessionClaims {
  uid: string;
  iat: number; // issued-at, epoch ms
}

export function signSession(uid: string, secret: string): string {
  const claims: SessionClaims = { uid, iat: Date.now() };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(
  token: unknown,
  secret: string,
): { uid: string } | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 1024) {
    return null;
  }
  const dot = token.indexOf('.');
  if (dot <= 0 || dot >= token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Constant-time signature check; a length mismatch fails fast.
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }

  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionClaims;
  } catch {
    return null;
  }
  if (!claims || typeof claims.uid !== 'string' || typeof claims.iat !== 'number') {
    return null;
  }
  const age = Date.now() - claims.iat;
  if (age < 0 || age > SESSION_TTL_MS) return null;
  return { uid: claims.uid };
}

// --- Cookie plumbing ---------------------------------------------------------

function readCookie(req: VercelRequest, name: string): string | null {
  // @vercel/node parses cookies for us, but fall back to the raw header so this
  // works under any runtime quirk.
  const parsed = (req as { cookies?: Record<string, string> }).cookies;
  if (parsed && typeof parsed[name] === 'string') return parsed[name];
  const raw = req.headers.cookie;
  if (typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** The signed-in user's id from the session cookie, or null when absent/invalid. */
export function readSession(req: VercelRequest): string | null {
  const secret = getAuthSecret();
  if (!secret) return null;
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  return verifySession(token, secret)?.uid ?? null;
}

// `Secure` is required in production but blocks the cookie on plain-http local
// dev (`vercel dev` serves over http), so it's dropped only there. Everything
// else (HttpOnly, SameSite=Lax, Path) is always on. SameSite=Lax also covers
// the OAuth redirect back from the provider.
function cookieFlags(): string {
  const secure = process.env.VERCEL_ENV !== 'development';
  return `HttpOnly; SameSite=Lax; Path=/${secure ? '; Secure' : ''}`;
}

export function setSessionCookie(res: VercelResponse, token: string): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; ${cookieFlags()}; Max-Age=${maxAge}`,
  );
}

export function clearSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${cookieFlags()}; Max-Age=0`);
}

/**
 * Absolute base URL for this deployment. Prefers APP_BASE_URL (set it in prod so
 * OAuth redirect URIs and email links are stable), else derives from the request
 * — which is what makes OAuth work on `vercel dev` / preview URLs out of the box.
 */
export function requestBaseUrl(req: VercelRequest): string {
  const envBase = process.env.APP_BASE_URL;
  if (envBase) return envBase.replace(/\/+$/, '');
  const fwd = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(fwd) ? fwd[0] : fwd) || 'https';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

// --- Passwords (Node scrypt, no dependency) ----------------------------------

/** Hash a password as `scrypt$<saltB64url>$<hashB64url>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

/** Constant-time verify against a `hashPassword` digest. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], 'base64url');
    expected = Buffer.from(parts[2], 'base64url');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- Tokens & input hygiene --------------------------------------------------

/** An unguessable, URL-safe one-time token (email verify / reset / OAuth state). */
export function newOpaqueToken(): string {
  return randomBytes(24).toString('base64url');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize + validate an email, or null when it isn't one. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 3 || s.length > 254 || !EMAIL_RE.test(s)) return null;
  return s;
}

/** A display name: trimmed, single-spaced, capped at 24 — matches board names. */
export function cleanDisplayName(raw: unknown): string {
  return (typeof raw === 'string' ? raw : '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 24);
}

/** A password is accepted at 8..200 chars; returns it, or null when invalid. */
export function cleanPassword(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length < 8 || raw.length > 200) return null;
  return raw;
}
