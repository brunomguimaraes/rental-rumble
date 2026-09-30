import type { OwnedMon } from './box.js';
import type { ProfessionId, ProfessorId } from './professions.js';
import type { RouteId } from './routes.js';

// The player's role-play identity, and the same-origin wrappers for it.

export interface Profile {
  profession: ProfessionId;
  mentor: ProfessorId;
  starterId: string;
  currentRoute: RouteId;
  createdAt: number;
}

export const NICKNAME_MAX = 12;

/** Trimmed 1–12 printable characters, else null. Shared by client and server. */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 1 || s.length > NICKNAME_MAX) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

export async function fetchProfile(): Promise<Profile | null> {
  try {
    const res = await fetch('/api/me/profile', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; profile?: Profile | null };
    return data.ok ? (data.profile ?? null) : null;
  } catch {
    return null;
  }
}

export interface OnboardResult {
  ok: boolean;
  profile?: Profile;
  starter?: OwnedMon;
  box?: OwnedMon[];
  error?: string;
}

export async function onboard(mentor: ProfessorId): Promise<OnboardResult> {
  try {
    const res = await fetch('/api/me/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ profession: 'trainer', mentor }),
    });
    const data = (await res.json().catch(() => ({}))) as OnboardResult;
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'could not start your journey' };
    return data;
  } catch {
    return { ok: false, error: 'network error — please try again' };
  }
}

export async function setNickname(id: string, nickname: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/me/nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, nickname }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: Boolean(res.ok && data.ok), error: data.error };
  } catch {
    return { ok: false, error: 'network error — please try again' };
  }
}
