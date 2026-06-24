import type { AttackAnim, Side } from './types';
import { PMD_SPRITES, type PmdAnim, type PmdEntry } from './pmdSprites.gen';

// Runtime access to the bundled PMD-style animated battle sprites (from
// PMDCollab's SpriteCollab; downloaded locally by scripts/fetch-battle-sprites.mjs
// — the app never hits an external endpoint at runtime). Sheets are served from
// public/sprites/pmd/<id>/<sheet>-Anim.png. See src/components/PmdSprite.tsx.
const ASSET = import.meta.env?.BASE_URL ?? '/';

// Logical battle animations, mapped to whatever the species actually ships. The
// `AttackAnim` styles (strike/shoot/special/swing/charge) let a move drive a
// fitting motion; `attack` is the generic lunge used when a move has no style.
export type PmdAnimKind = 'idle' | 'walk' | 'attack' | 'hurt' | 'faint' | AttackAnim;

// Fallback chains, in preference order. Every name here must be one the importer
// downloads (see WANTED in fetch-battle-sprites.mjs) so the lookup can't dangle.
// The resting loop uses Walk (legs cycling in place) rather than the much more
// static Idle, so combatants look lively and "ready" while waiting their turn.
// The attack styles each prefer their dedicated sheet, then degrade gracefully
// to the generic Attack lunge for species that don't ship the richer anim.
const FALLBACKS: Record<PmdAnimKind, string[]> = {
  idle: ['Walk', 'Idle'],
  walk: ['Walk', 'Idle'],
  attack: ['Attack', 'Swing', 'Strike', 'Walk', 'Idle'],
  strike: ['Strike', 'Attack', 'Swing', 'Walk', 'Idle'],
  shoot: ['Shoot', 'SpAttack', 'Attack', 'Walk', 'Idle'],
  special: ['SpAttack', 'Shoot', 'Charge', 'Attack', 'Walk', 'Idle'],
  swing: ['Swing', 'Strike', 'Attack', 'Walk', 'Idle'],
  charge: ['Charge', 'Attack', 'Walk', 'Idle'],
  hurt: ['Hurt', 'Idle', 'Walk'],
  faint: ['Sleep', 'Hurt', 'Idle'],
};

// Per-species resting overrides. A few Pokémon "walk" by burrowing/diving, so
// their Walk sheet is mostly empty (the mon vanishes underground) and the
// default resting loop would render a blank frame. Rest those on Idle instead.
// Keyed by National Dex id; applies to the resting kinds (idle/walk) only.
const RESTING_OVERRIDE: Record<number, string[]> = {
  51: ['Idle', 'Walk'], // Dugtrio — Walk burrows underground, leaving it invisible
};

// Sheet rows are facing directions in SpriteCollab's standard order (counter-
// clockwise from Down). The combatants face across the arena: the player (lower
// left) looks up-right, the foe (upper right) looks down-left. Sheets with fewer
// rows (e.g. single-direction Sleep) clamp to row 0 (Down).
const DIR_ROW: Record<Side, number> = { player: 3 /* UpRight */, foe: 7 /* DownLeft */ };

export function hasPmdSprite(dexId: number): boolean {
  return PMD_SPRITES[dexId] !== undefined;
}

export function pmdSheetUrl(dexId: number, sheet: string): string {
  return `${ASSET}sprites/pmd/${dexId}/${sheet}-Anim.png`;
}

/**
 * Every distinct sheet URL a species can render. Used to preload (decode) sheets
 * up front so switching animations mid-battle never flashes a blank frame while
 * the browser fetches the not-yet-seen sheet.
 */
export function pmdSheetUrls(dexId: number): string[] {
  const entry: PmdEntry | undefined = PMD_SPRITES[dexId];
  if (!entry) return [];
  const sheets = new Set<string>();
  for (const anim of Object.values(entry)) sheets.add(anim.sheet);
  return [...sheets].map((sheet) => pmdSheetUrl(dexId, sheet));
}

export interface ResolvedPmdAnim extends PmdAnim {
  /** Resting-frame height for this species, so scale stays constant across anims. */
  refHeight: number;
}

/** Resolve a logical anim to a concrete sheet for a species, or null if unbundled. */
export function resolvePmdAnim(
  dexId: number,
  kind: PmdAnimKind,
): ResolvedPmdAnim | null {
  const entry: PmdEntry | undefined = PMD_SPRITES[dexId];
  if (!entry) return null;
  const override =
    (kind === 'idle' || kind === 'walk') && RESTING_OVERRIDE[dexId];
  const chain = override || FALLBACKS[kind];
  for (const name of chain) {
    const anim = entry[name];
    if (anim) {
      const refHeight = entry.Idle?.fh ?? entry.Walk?.fh ?? anim.fh;
      return { ...anim, refHeight };
    }
  }
  return null;
}

/** Direction row for a side, clamped to the rows a given sheet actually has. */
export function dirRow(side: Side, rows: number): number {
  const row = DIR_ROW[side];
  return row < rows ? row : 0;
}

// One PMD "duration unit" in milliseconds. The sheets are authored against a
// 60 fps tick, so a unit ≈ 1/60 s; tuned slightly to read well in the arena.
export const PMD_FRAME_MS = 1000 / 60;
