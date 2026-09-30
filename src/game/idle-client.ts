import type { OwnedMon } from './box.js';
import type { RouteId } from './routes.js';
import type { EncounterRecord } from './idle.js';

export interface IdleSession {
  id: string;
  routeId: RouteId;
  partyIds: string[];
  startedAt: number;
}

export interface IdleLog {
  routeId: RouteId;
  encounters: EncounterRecord[];
  wins: number;
  stoppedBy: 'loss' | 'cap' | 'early';
  elapsedMs: number;
  expPerWin: number;
}

export interface LevelUpEntry { id: string; fromLevel: number; toLevel: number }
export interface EvolutionEntry { id: string; fromDexId: number; toDexId: number }

export interface ClaimResult {
  ok: boolean;
  log?: IdleLog;
  levelUps?: LevelUpEntry[];
  evolutions?: EvolutionEntry[];
  box?: OwnedMon[];
  error?: string;
}

async function post<T>(path: string, body: unknown): Promise<T & { ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    return { ...data, ok: Boolean(res.ok && data.ok), error: data.error };
  } catch {
    return { ok: false, error: 'network error — please try again' } as T & { ok: boolean; error?: string };
  }
}

export async function fetchCurrentSession(): Promise<{ session: IdleSession | null; serverNow: number }> {
  try {
    const res = await fetch('/api/idle/current', { credentials: 'include', cache: 'no-store' });
    const data = (await res.json()) as { ok?: boolean; session?: IdleSession | null; serverNow?: number };
    return { session: data.ok ? (data.session ?? null) : null, serverNow: data.serverNow ?? Date.now() };
  } catch {
    return { session: null, serverNow: Date.now() };
  }
}

export function startIdle(routeId: RouteId, partyIds: string[]) {
  return post<{ session?: IdleSession }>('/api/idle/start', { routeId, partyIds });
}

export function claimIdle(sessionId: string): Promise<ClaimResult> {
  return post<ClaimResult>('/api/idle/claim', { sessionId });
}

export function tutorialCatch() {
  return post<{ caught?: OwnedMon; box?: OwnedMon[] }>('/api/idle/tutorial-catch', {});
}
