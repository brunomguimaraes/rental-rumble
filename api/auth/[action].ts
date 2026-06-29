import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedis } from '../_redis.js';
import { rateLimit, clientIp } from '../_ratelimit.js';
import {
  getDb,
  readUserById,
  readUserByEmail,
  rowToUser,
  toPublicUser,
  newId,
  OAUTH_STATE_TTL_SECONDS,
  type Db,
  type OAuthProvider,
} from '../_db.js';
import {
  getAuthSecret,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  readSession,
  requestBaseUrl,
  hashPassword,
  verifyPassword,
  cleanEmail,
  cleanDisplayName,
  cleanPassword,
} from '../_session.js';
import {
  sendVerifyEmail,
  sendResetEmail,
  consumeToken,
  mintToken,
} from '../_email.js';

// All auth endpoints behind one Vercel function (dynamic `[action]` route), so
// `/api/auth/login`, `/api/auth/oauth-callback`, … keep their exact URLs while
// counting as a single Serverless Function — which keeps the whole API under the
// Hobby plan's 12-function cap. Each handler is the same logic it had as its own
// file; only the data layer changed to libSQL.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  switch (action) {
    case 'signup':
      return signup(req, res);
    case 'login':
      return login(req, res);
    case 'logout':
      return logout(req, res);
    case 'me':
      return me(req, res);
    case 'verify-email':
      return verifyEmail(req, res);
    case 'request-reset':
      return requestReset(req, res);
    case 'reset-password':
      return resetPassword(req, res);
    case 'oauth-start':
      return oauthStart(req, res);
    case 'oauth-callback':
      return oauthCallback(req, res);
    default:
      return res.status(404).json({ ok: false, error: 'not found' });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? JSON.parse(req.body || '{}')
    : (req.body ?? {});
}

function redirect(res: VercelResponse, dest: string) {
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 302;
  res.setHeader('Location', dest);
  return res.end();
}

// --- signup ------------------------------------------------------------------

async function signup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const secret = getAuthSecret();
  const db = getDb();
  if (!secret || !db) {
    return res
      .status(503)
      .json({ ok: false, error: 'accounts are temporarily unavailable' });
  }

  const body = parseBody(req);
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.password);
  if (!email) {
    return res.status(400).json({ ok: false, error: 'enter a valid email' });
  }
  if (!password) {
    return res
      .status(400)
      .json({ ok: false, error: 'password must be at least 8 characters' });
  }

  const redis = getRedis();
  const ip = clientIp(req);
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:signup:m:${ip}`, 5, 60),
    rateLimit(redis, `rl:signup:d:${ip}`, 40, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) {
    return res
      .status(429)
      .json({ ok: false, error: 'too many attempts, slow down' });
  }

  const emailLower = email.toLowerCase();
  const displayName =
    cleanDisplayName(body.displayName) || emailLower.split('@')[0].slice(0, 24);
  const passwordHash = hashPassword(password);

  try {
    const rs = await db.execute({
      sql: `insert into users (id, email, email_lower, display_name, password_hash, email_verified, created_at, runs, wins, losses)
            values (?, ?, ?, ?, ?, 0, ?, 0, 0, 0)
            on conflict(email_lower) do nothing
            returning *`,
      args: [newId(), email, emailLower, displayName, passwordHash, Date.now()],
    });
    if (rs.rows.length === 0) {
      return res
        .status(409)
        .json({ ok: false, error: 'an account with that email already exists' });
    }
    const user = rowToUser(rs.rows[0] as unknown as Record<string, unknown>);

    await sendVerifyEmail(db, user).catch((err) =>
      console.error('[signup] verify email failed:', err),
    );

    setSessionCookie(res, signSession(user.id, secret));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    console.error('[signup] failed:', err);
    return res
      .status(503)
      .json({ ok: false, error: 'accounts are temporarily unavailable' });
  }
}

// --- login -------------------------------------------------------------------

async function login(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const secret = getAuthSecret();
  const db = getDb();
  if (!secret || !db) {
    return res
      .status(503)
      .json({ ok: false, error: 'accounts are temporarily unavailable' });
  }

  const body = parseBody(req);
  const email = cleanEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return res
      .status(400)
      .json({ ok: false, error: 'enter your email and password' });
  }

  const redis = getRedis();
  const ip = clientIp(req);
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:login:m:${ip}`, 10, 60),
    rateLimit(redis, `rl:login:d:${ip}`, 100, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) {
    return res
      .status(429)
      .json({ ok: false, error: 'too many attempts, slow down' });
  }

  try {
    const user = await readUserByEmail(db, email.toLowerCase());
    if (user && !user.passwordHash) {
      return res.status(400).json({
        ok: false,
        error: 'this account signs in with Discord or Google',
      });
    }
    if (
      !user ||
      !user.passwordHash ||
      !verifyPassword(password, user.passwordHash)
    ) {
      return res
        .status(401)
        .json({ ok: false, error: 'invalid email or password' });
    }

    setSessionCookie(res, signSession(user.id, secret));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    console.error('[login] failed:', err);
    return res
      .status(503)
      .json({ ok: false, error: 'accounts are temporarily unavailable' });
  }
}

// --- logout ------------------------------------------------------------------

function logout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  clearSessionCookie(res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
}

// --- me ----------------------------------------------------------------------

async function me(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(200).json({ ok: true, user: null });
  const db = getDb();
  if (!db) return res.status(200).json({ ok: true, user: null });
  try {
    const user = await readUserById(db, uid);
    if (!user) {
      clearSessionCookie(res);
      return res.status(200).json({ ok: true, user: null });
    }
    return res.status(200).json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    console.error('[me] failed:', err);
    return res.status(200).json({ ok: true, user: null });
  }
}

// --- verify-email ------------------------------------------------------------

async function verifyEmail(req: VercelRequest, res: VercelResponse) {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let ok = false;
  const db = getDb();
  if (db && token) {
    try {
      const consumed = await consumeToken(db, 'verify', token);
      if (consumed?.userId) {
        await db.execute({
          sql: 'update users set email_verified = 1 where id = ?',
          args: [consumed.userId],
        });
        ok = true;
      }
    } catch (err) {
      console.error('[verify-email] failed:', err);
    }
  }
  const base = (process.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
  return redirect(res, `${base}/?verified=${ok ? '1' : '0'}`);
}

// --- request-reset -----------------------------------------------------------

async function requestReset(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const redis = getRedis();
  const ip = clientIp(req);
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:reset:m:${ip}`, 5, 60),
    rateLimit(redis, `rl:reset:d:${ip}`, 20, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) {
    return res
      .status(429)
      .json({ ok: false, error: 'too many attempts, slow down' });
  }

  const body = parseBody(req);
  const email = cleanEmail(body.email);
  const db = getDb();
  if (db && email) {
    try {
      const user = await readUserByEmail(db, email.toLowerCase());
      if (user && user.passwordHash) {
        await sendResetEmail(db, user).catch((err) =>
          console.error('[request-reset] send failed:', err),
        );
      }
    } catch (err) {
      console.error('[request-reset] failed:', err);
    }
  }
  // Always succeed — never reveal whether the email has an account.
  return res.status(200).json({ ok: true });
}

// --- reset-password ----------------------------------------------------------

async function resetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const secret = getAuthSecret();
  const db = getDb();
  if (!secret || !db) {
    return res
      .status(503)
      .json({ ok: false, error: 'accounts are temporarily unavailable' });
  }

  const body = parseBody(req);
  const password = cleanPassword(body.password);
  if (!password) {
    return res
      .status(400)
      .json({ ok: false, error: 'password must be at least 8 characters' });
  }

  const redis = getRedis();
  const ip = clientIp(req);
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:resetpw:m:${ip}`, 10, 60),
    rateLimit(redis, `rl:resetpw:d:${ip}`, 50, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) {
    return res
      .status(429)
      .json({ ok: false, error: 'too many attempts, slow down' });
  }

  try {
    const consumed = await consumeToken(db, 'reset', body.token);
    if (!consumed?.userId) {
      return res
        .status(400)
        .json({ ok: false, error: 'this reset link is invalid or has expired' });
    }
    const rs = await db.execute({
      sql: 'update users set password_hash = ?, email_verified = 1 where id = ? returning *',
      args: [hashPassword(password), consumed.userId],
    });
    if (rs.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'account not found' });
    }
    const user = rowToUser(rs.rows[0] as unknown as Record<string, unknown>);

    setSessionCookie(res, signSession(user.id, secret));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    console.error('[reset-password] failed:', err);
    return res
      .status(503)
      .json({ ok: false, error: 'accounts are temporarily unavailable' });
  }
}

// --- OAuth -------------------------------------------------------------------

function authorizeUrl(
  provider: OAuthProvider,
  base: string,
  state: string,
): string | null {
  const redirectUri = `${base}/api/auth/oauth-callback`;
  if (provider === 'discord') {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) return null;
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email',
      state,
    });
    return `https://discord.com/oauth2/authorize?${p.toString()}`;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function oauthStart(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const provider =
    typeof req.query.provider === 'string' ? req.query.provider : '';
  if (provider !== 'discord' && provider !== 'google') {
    return redirect(res, '/?oauth=error');
  }
  const db = getDb();
  if (!db) return redirect(res, '/?oauth=unconfigured');

  let url: string | null = null;
  try {
    const state = await mintToken(db, 'oauth', null, OAUTH_STATE_TTL_SECONDS, {
      provider,
    });
    url = authorizeUrl(provider, requestBaseUrl(req), state);
  } catch (err) {
    console.error('[oauth-start] failed:', err);
  }
  return redirect(res, url ?? '/?oauth=unconfigured');
}

interface Profile {
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function exchangeDiscord(
  code: string,
  redirectUri: string,
): Promise<Profile | null> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!tokenRes.ok) {
    console.error('[oauth] discord token', tokenRes.status);
    return null;
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) return null;
  const u = (await meRes.json()) as {
    id: string;
    email?: string | null;
    verified?: boolean;
    username?: string;
    global_name?: string | null;
  };
  return {
    providerId: u.id,
    email: u.email ?? null,
    emailVerified: !!u.verified,
    name: u.global_name || u.username || '',
  };
}

async function exchangeGoogle(
  code: string,
  redirectUri: string,
): Promise<Profile | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!tokenRes.ok) {
    console.error('[oauth] google token', tokenRes.status);
    return null;
  }
  const token = (await tokenRes.json()) as { id_token?: string };
  if (!token.id_token) return null;
  const payload = decodeJwtPayload(token.id_token);
  if (!payload || typeof payload.sub !== 'string') return null;
  return {
    providerId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified:
      payload.email_verified === true || payload.email_verified === 'true',
    name: typeof payload.name === 'string' ? payload.name : '',
  };
}

async function findByProvider(
  db: Db,
  provider: OAuthProvider,
  providerId: string,
): Promise<string | null> {
  const col = provider === 'discord' ? 'discord_id' : 'google_sub';
  const rs = await db.execute({
    sql: `select id from users where ${col} = ? limit 1`,
    args: [providerId],
  });
  return rs.rows.length ? String((rs.rows[0] as unknown as { id: string }).id) : null;
}

async function findByEmail(db: Db, emailLower: string): Promise<string | null> {
  const rs = await db.execute({
    sql: 'select id from users where email_lower = ? limit 1',
    args: [emailLower],
  });
  return rs.rows.length ? String((rs.rows[0] as unknown as { id: string }).id) : null;
}

async function linkProvider(
  db: Db,
  provider: OAuthProvider,
  userId: string,
  providerId: string,
): Promise<void> {
  const col = provider === 'discord' ? 'discord_id' : 'google_sub';
  await db.execute({
    sql: `update users set ${col} = ? where id = ?`,
    args: [providerId, userId],
  });
}

async function createWithProvider(
  db: Db,
  provider: OAuthProvider,
  profile: Profile,
): Promise<string | null> {
  if (!profile.email) return null; // our scopes always return an email
  const emailLower = profile.email.toLowerCase();
  const displayName =
    cleanDisplayName(profile.name) || emailLower.split('@')[0].slice(0, 24);
  const col = provider === 'discord' ? 'discord_id' : 'google_sub';
  const id = newId();
  const rs = await db.execute({
    sql: `insert into users (id, email, email_lower, display_name, email_verified, created_at, ${col})
          values (?, ?, ?, ?, ?, ?, ?)
          on conflict(email_lower) do nothing
          returning id`,
    args: [
      id,
      profile.email,
      emailLower,
      displayName,
      profile.emailVerified ? 1 : 0,
      Date.now(),
      profile.providerId,
    ],
  });
  return rs.rows.length ? String((rs.rows[0] as unknown as { id: string }).id) : null;
}

/** Resolve a profile to a user id: link an existing account or create one. */
async function resolveUser(
  db: Db,
  provider: OAuthProvider,
  profile: Profile,
): Promise<{ userId: string } | { error: string }> {
  const linked = await findByProvider(db, provider, profile.providerId);
  if (linked) return { userId: linked };

  const emailLower = profile.email ? profile.email.toLowerCase() : null;

  if (emailLower && profile.emailVerified) {
    const byEmail = await findByEmail(db, emailLower);
    if (byEmail) {
      await linkProvider(db, provider, byEmail, profile.providerId);
      return { userId: byEmail };
    }
  }
  if (emailLower && !profile.emailVerified) {
    const byEmail = await findByEmail(db, emailLower);
    if (byEmail) return { error: 'email_taken' };
  }

  const created = await createWithProvider(db, provider, profile);
  if (created) return { userId: created };

  // Lost a create race against a verified email → fall back to linking.
  if (emailLower && profile.emailVerified) {
    const byEmail = await findByEmail(db, emailLower);
    if (byEmail) {
      await linkProvider(db, provider, byEmail, profile.providerId);
      return { userId: byEmail };
    }
  }
  return { error: 'error' };
}

async function oauthCallback(req: VercelRequest, res: VercelResponse) {
  const secret = getAuthSecret();
  const db = getDb();
  if (!secret || !db) return redirect(res, '/?oauth=unconfigured');

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) return redirect(res, '/?oauth=error');

  try {
    const consumed = await consumeToken(db, 'oauth', state);
    const data = (consumed?.data ?? null) as { provider?: string } | null;
    const provider = data?.provider;
    if (!consumed || (provider !== 'discord' && provider !== 'google')) {
      return redirect(res, '/?oauth=error');
    }

    const redirectUri = `${requestBaseUrl(req)}/api/auth/oauth-callback`;
    const profile =
      provider === 'discord'
        ? await exchangeDiscord(code, redirectUri)
        : await exchangeGoogle(code, redirectUri);
    if (!profile) return redirect(res, '/?oauth=error');

    const resolved = await resolveUser(db, provider, profile);
    if ('error' in resolved) return redirect(res, `/?oauth=${resolved.error}`);

    setSessionCookie(res, signSession(resolved.userId, secret));
    return redirect(res, '/?oauth=ok');
  } catch (err) {
    console.error('[oauth-callback] failed:', err);
    return redirect(res, '/?oauth=error');
  }
}
