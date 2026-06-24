// Dev-only cheats. Everything here is gated behind `import.meta.env.DEV`, so the
// toggles never render — and the flags always read false — in a production build.
// The optional chaining keeps this safe in non-Vite contexts (e.g. the server
// re-sim), where `import.meta.env` is undefined.

export const DEV = import.meta.env?.DEV ?? false;

const AUTOWIN_KEY = 'dev-autowin';
const ALLRARE_KEY = 'dev-allrare';
const ALLSHINY_KEY = 'dev-allshiny';

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

/**
 * True when the "every Pokémon on the run is rare/mythic" dev cheat is enabled.
 * Read at draft/recruit time, so toggling it takes effect on the next fresh run.
 */
export function allRareEnabled(): boolean {
  return flag(ALLRARE_KEY);
}

/** Persist the all-rare cheat. No-op outside dev. Returns the new state. */
export function setAllRare(on: boolean): boolean {
  return setFlag(ALLRARE_KEY, on);
}

/**
 * True when the "every drafted Pokémon is shiny" dev cheat is enabled. Read at
 * draft time, so toggling it takes effect on the next fresh run.
 */
export function allShinyEnabled(): boolean {
  return flag(ALLSHINY_KEY);
}

/** Persist the all-shiny cheat. No-op outside dev. Returns the new state. */
export function setAllShiny(on: boolean): boolean {
  return setFlag(ALLSHINY_KEY, on);
}
