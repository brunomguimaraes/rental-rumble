import type { OwnedMon } from './box.js';

// The trainer's saved party: 1–6 owned Pokémon in order, the first one leads.
// The server resolves what is saved against what the trainer still owns, and
// every activity freezes the party it started with.

export const PARTY_MAX = 6;
const ID_MAX = 64;

/** A party request body: 1–6 distinct, non-empty ids, else null. */
export function parsePartyInput(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > PARTY_MAX) return null;
  if (!raw.every((id) => typeof id === 'string' && id.length > 0 && id.length <= ID_MAX)) return null;
  const ids = raw as string[];
  return new Set(ids).size === ids.length ? [...ids] : null;
}

/**
 * The party in effect: the saved ids still owned, in order; with none left,
 * the starter; without a starter, the newest Pokémon (`owned` is newest first).
 */
export function resolveParty(saved: readonly string[] | null, owned: readonly OwnedMon[], starterId: string): string[] {
  const ownedIds = new Set(owned.map((m) => m.id));
  const kept = [...new Set((saved ?? []).filter((id) => ownedIds.has(id)))].slice(0, PARTY_MAX);
  if (kept.length > 0) return kept;
  if (ownedIds.has(starterId)) return [starterId];
  return owned.length > 0 ? [owned[0].id] : [];
}

/** The party's rows from the box, in party order. */
export function partyMembers(ids: readonly string[], box: readonly OwnedMon[]): OwnedMon[] {
  const byId = new Map(box.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter((m): m is OwnedMon => m !== undefined);
}

export function sameParty(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Save the party (same-origin; the session cookie rides along). Never throws. */
export async function saveParty(ids: string[]): Promise<{ ok: boolean; party?: string[]; error?: string; expired?: boolean }> {
  try {
    const res = await fetch('/api/me/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ids }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; party?: unknown; error?: string };
    if (res.status === 401) return { ok: false, expired: true, error: 'Your session expired — sign in again.' };
    if (!res.ok || !data.ok || !Array.isArray(data.party)) return { ok: false, error: data.error ?? 'Couldn’t save your party.' };
    return { ok: true, party: data.party.filter((id): id is string => typeof id === 'string') };
  } catch {
    return { ok: false, error: 'Network error — please try again.' };
  }
}
