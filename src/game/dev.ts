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
