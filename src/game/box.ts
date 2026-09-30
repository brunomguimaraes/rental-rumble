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

export type CatchOrigin = 'starter' | 'tutorial' | 'catch';

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
  /** Player-given name (1–12 chars); the species name when absent. */
  nickname?: string;
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
  if (mon.nickname) c = { ...c, name: mon.nickname };
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

function coerceOwned(v: unknown): OwnedMon[] {
  if (!Array.isArray(v)) return [];
  return v as OwnedMon[];
}

/**
 * The signed-in player's box (newest first). `ok: false` means the request
 * failed and says nothing about what the box holds; `expired` that the
 * session ended.
 */
export async function fetchBox(): Promise<{ ok: boolean; box: OwnedMon[]; expired?: boolean }> {
  try {
    const res = await fetch('/api/me/box', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.status === 401) return { ok: false, box: [], expired: true };
    if (!res.ok) return { ok: false, box: [] };
    const data = (await res.json()) as { ok?: boolean; box?: unknown };
    return data.ok ? { ok: true, box: coerceOwned(data.box) } : { ok: false, box: [] };
  } catch {
    return { ok: false, box: [] };
  }
}
