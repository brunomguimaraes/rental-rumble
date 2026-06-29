import type { Db, StoredUser } from './_db.js';
import { VERIFY_TTL_SECONDS, RESET_TTL_SECONDS } from './_db.js';
import { newOpaqueToken } from './_session.js';

// Transactional email via Resend (https://resend.com), plus the single-use
// token rows that the verify/reset links carry. Everything is best-effort: when
// RESEND_API_KEY / EMAIL_FROM / APP_BASE_URL aren't configured, sends are simply
// skipped (logged) and the caller carries on — a missing mail setup must never
// break signup or the game.

interface ResendConfig {
  apiKey: string;
  from: string;
}

function getResendConfig(): ResendConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/** Absolute base URL for links in emails (and OAuth redirects), no trailing slash. */
export function appBaseUrl(): string | null {
  const raw = process.env.APP_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Send one transactional email. Returns false (never throws) when email isn't
 * configured or the provider rejects it, so callers stay best-effort.
 */
export async function sendEmail(mail: MailInput): Promise<boolean> {
  const cfg = getResendConfig();
  if (!cfg) {
    console.warn(
      '[email] RESEND_API_KEY / EMAIL_FROM not set — skipping email to',
      mail.to,
    );
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      console.error(
        '[email] Resend rejected the send:',
        res.status,
        await res.text().catch(() => ''),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send failed:', err);
    return false;
  }
}

export type AuthTokenKind = 'verify' | 'reset' | 'oauth';

/** Mint a single-use token row and return the opaque token string. */
export async function mintToken(
  db: Db,
  kind: AuthTokenKind,
  userId: string | null,
  ttlSeconds: number,
  data?: unknown,
): Promise<string> {
  const token = newOpaqueToken();
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const dataJson = data === undefined ? null : JSON.stringify(data);
  await db.execute({
    sql: 'insert into auth_tokens (token, kind, user_id, data, expires_at) values (?, ?, ?, ?, ?)',
    args: [token, kind, userId, dataJson, expiresAt],
  });
  return token;
}

export interface ConsumedToken {
  userId: string | null;
  data: unknown;
}

/** Atomically validate + burn a token. Returns null when missing or expired. */
export async function consumeToken(
  db: Db,
  kind: AuthTokenKind,
  token: unknown,
): Promise<ConsumedToken | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) {
    return null;
  }
  const rs = await db.execute({
    sql: 'delete from auth_tokens where token = ? and kind = ? and expires_at > ? returning user_id, data',
    args: [token, kind, Date.now()],
  });
  if (rs.rows.length === 0) return null;
  const row = rs.rows[0] as unknown as {
    user_id: string | null;
    data: string | null;
  };
  let data: unknown = null;
  if (row.data) {
    try {
      data = JSON.parse(row.data);
    } catch {
      data = null;
    }
  }
  return { userId: row.user_id ?? null, data };
}

// --- Specific emails ---------------------------------------------------------

export async function sendVerifyEmail(
  db: Db,
  user: StoredUser,
): Promise<boolean> {
  const base = appBaseUrl();
  if (!base || !getResendConfig()) return false; // don't mint a link we can't send
  const token = await mintToken(db, 'verify', user.id, VERIFY_TTL_SECONDS);
  const link = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to: user.email,
    subject: 'Verify your Rental Rumble account',
    text: `Welcome to Rental Rumble! Confirm your email to finish setting up your account:\n\n${link}\n\nIf you didn't create an account, you can ignore this email.`,
    html: emailShell(
      `Welcome, ${escapeHtml(user.displayName || 'trainer')}!`,
      'Confirm your email to finish setting up your Rental Rumble account.',
      'Verify email',
      link,
    ),
  });
}

export async function sendResetEmail(
  db: Db,
  user: StoredUser,
): Promise<boolean> {
  const base = appBaseUrl();
  if (!base || !getResendConfig()) return false;
  const token = await mintToken(db, 'reset', user.id, RESET_TTL_SECONDS);
  const link = `${base}/?reset=${encodeURIComponent(token)}`;
  return sendEmail({
    to: user.email,
    subject: 'Reset your Rental Rumble password',
    text: `Reset your Rental Rumble password (this link expires in 1 hour):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    html: emailShell(
      'Password reset',
      'Click below to choose a new password. This link expires in 1 hour.',
      'Reset password',
      link,
    ),
  });
}

// --- Tiny HTML helpers -------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailShell(
  heading: string,
  body: string,
  cta: string,
  link: string,
): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>
  <p style="font-size:15px;line-height:1.5;color:#333;margin:0 0 20px">${escapeHtml(body)}</p>
  <a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9999px">${escapeHtml(cta)}</a>
  <p style="font-size:12px;color:#888;margin:24px 0 0">If the button doesn't work, paste this link into your browser:<br>${link}</p>
</div>`;
}
