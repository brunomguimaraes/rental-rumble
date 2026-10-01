import type { OwnedMon } from './box.js';
import type { GrowthEvent } from './growth.js';
import type { BaseStats } from './types.js';

// Dev-only cheats. Everything here is gated behind `import.meta.env.DEV`, so the
// toggles never render — and the flags always read false — in a production build.
// The optional chaining keeps this safe in non-Vite contexts (e.g. the server
// re-sim), where `import.meta.env` is undefined.

export const DEV = import.meta.env?.DEV ?? false;

const AUTOWIN_KEY = 'dev-autowin';

function flag(key: string): boolean {
  if (!DEV) return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setFlag(key: string, on: boolean): boolean {
  if (!DEV) return false;
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* ignore storage failures */
  }
  return on;
}

/** True when the "auto-win every match" dev cheat is currently enabled. */
export function autoWinEnabled(): boolean {
  return flag(AUTOWIN_KEY);
}

/** Persist the auto-win cheat. No-op outside dev. Returns the new state. */
export function setAutoWin(on: boolean): boolean {
  return setFlag(AUTOWIN_KEY, on);
}

export interface DevGrowResult {
  ok: boolean;
  mon?: OwnedMon;
  growths?: GrowthEvent[];
  evolutions?: { fromDexId: number; toDexId: number; deltas: BaseStats }[];
  error?: string;
}

/**
 * Fill one owned Pokémon's EXP bar through the local-dev-only `grow` action.
 * No-op outside dev. Never throws; `ok: false` carries a player-facing error.
 */
export async function devGrowOnce(id: string): Promise<DevGrowResult> {
  if (!DEV) return { ok: false, error: 'dev only' };
  try {
    const res = await fetch('/api/me/grow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });
    const data = (await res.json().catch(() => ({}))) as DevGrowResult;
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'could not grow' };
    return data;
  } catch {
    return { ok: false, error: 'network error — please try again' };
  }
}
