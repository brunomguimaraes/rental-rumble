import type { AbilityId, Build, Creature, Sign } from './types.js';
import { CREATURES_BY_ID } from './pokemon.js';
import {
  withSign,
  withAbility,
  withBuild,
  asShiny,
  asAltColor,
  canBeShiny,
  canBeAltColor,
  portraitUrl,
  shinyPortraitUrl,
  altColorPortraitUrl,
} from './pokemon.js';
import { isAbilityOption } from './abilities.js';
import { canRollBuild } from './moves.js';
import { ALL_SIGNS } from './zodiac.js';
import { clampLevel, scaleCreatureToLevel } from './levels.js';
import type { ZoneId } from './zones.js';

export type CatchOrigin = 'tutorial' | 'catch';

/** A permanently-owned, unique Pokémon (one row of the player's box). */
export interface OwnedMon {
  id: string;
  dexId: number;
  level: number;
  exp: number;
  sign: Sign;
  ability?: AbilityId;
  build?: Build;
  shiny: boolean;
  altColor: boolean;
  emotion?: string;
  origin: CatchOrigin;
  caughtAt: number;
}

/** The rolled identity of a fresh catch, before the server assigns id/caughtAt. */
export interface MintSpec {
  dexId: number;
  level: number;
  sign: Sign;
  ability?: AbilityId;
  build?: Build;
  shiny: boolean;
  altColor: boolean;
  emotion?: string;
}

/**
 * Rebuild a battle-ready Creature from an owned row: re-apply the rolled
 * identity (sign / ability / build / colour / portrait) exactly as the draft
 * would, then scale its base stats to the mon's level. Pure and DOM-free, so the
 * server re-simulation reconstructs the identical creature the client fields.
 * Returns null for an unknown dex id.
 */
export function ownedMonToCreature(mon: OwnedMon): Creature | null {
  const base = CREATURES_BY_ID[String(mon.dexId)];
  if (!base) return null;

  let c = withSign(base, ALL_SIGNS.includes(mon.sign) ? mon.sign : base.sign);
  if (mon.ability && isAbilityOption(base.dexId, mon.ability)) {
    c = withAbility(c, mon.ability);
  }
  if (mon.build && canRollBuild(base.stats)) {
    c = withBuild(c, mon.build);
  }
  if (mon.shiny && canBeShiny(base.dexId)) {
    c = asShiny(c);
  } else if (mon.altColor && canBeAltColor(base.dexId)) {
    c = asAltColor(c);
  }
  if (mon.emotion) {
    const url = c.shiny ? shinyPortraitUrl : c.altColor ? altColorPortraitUrl : portraitUrl;
    c = { ...c, portrait: url(base.dexId, mon.emotion) };
  }
  return scaleCreatureToLevel(c, clampLevel(mon.level));
}

/** Sum of a creature's base stats — a quick "how strong" proxy for the box UI. */
export function ownedPower(mon: OwnedMon): number {
  const c = CREATURES_BY_ID[String(mon.dexId)];
  if (!c) return 0;
  const s = c.stats;
  return Math.round((s.hp + s.atk + s.eatk + s.def + s.edef + s.spd) * (mon.level / 50));
}

// --- Client wrappers (same-origin; session cookie rides along) ---------------

export interface CatchStart {
  seed: string;
  token: string;
  zone: ZoneId;
}

/** One entry describing a mon that leveled up during a catch run. */
export interface LevelUp {
  id: string;
  fromLevel: number;
  toLevel: number;
}

export interface CatchResult {
  ok: boolean;
  cleared: boolean;
  caught?: OwnedMon;
  levelUps?: LevelUp[];
  box?: OwnedMon[];
  error?: string;
}

function coerceOwned(v: unknown): OwnedMon[] {
  if (!Array.isArray(v)) return [];
  return v as OwnedMon[];
}

/** The signed-in player's box (newest first), or [] when anonymous/unavailable. */
export async function fetchBox(): Promise<OwnedMon[]> {
  try {
    const res = await fetch('/api/me/box', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; box?: unknown };
    return data.ok ? coerceOwned(data.box) : [];
  } catch {
    return [];
  }
}

/**
 * Ask the server to authorise a catch run: it validates the party + zone and
 * returns a seed and a signed token the client echoes back on complete. Returns
 * null on any failure.
 */
export async function startCatch(input: {
  zone: ZoneId;
  party: string[];
}): Promise<CatchStart | null> {
  try {
    const res = await fetch('/api/catch/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<CatchStart> & { ok?: boolean };
    if (!data.ok || typeof data.seed !== 'string' || typeof data.token !== 'string') {
      return null;
    }
    return { seed: data.seed, token: data.token, zone: input.zone };
  } catch {
    return null;
  }
}

/**
 * Finish a catch run. The server re-simulates the mission from the token's seed,
 * and — only on a genuine clear — mints the reward and grants EXP. The returned
 * `caught` / `levelUps` / `box` all come from the server, never the client.
 */
export async function completeCatch(token: string): Promise<CatchResult> {
  try {
    const res = await fetch('/api/catch/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<CatchResult>;
    if (!res.ok) return { ok: false, cleared: false, error: data.error ?? 'catch failed' };
    return {
      ok: true,
      cleared: Boolean(data.cleared),
      caught: data.caught,
      levelUps: data.levelUps ?? [],
      box: data.box ?? [],
    };
  } catch {
    return { ok: false, cleared: false, error: 'network error — please try again' };
  }
}
