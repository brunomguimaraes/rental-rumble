import type { AttackAnim, Side } from './types.js';
import { PMD_SPRITES, type PmdAnim, type PmdEntry } from './pmdSprites.gen.js';
import { PMD_BODIES, type PmdBody } from './pmdBodies.gen.js';
import { SHINY_SPRITE_IDS } from './shiny.gen.js';
import { ALT_COLOR_SPRITE_IDS } from './altcolor.gen.js';

/** Which colour variant of a species' sheets to render (base when undefined). */
export type PmdVariant = 'shiny' | 'alt' | undefined;

// Runtime access to the bundled PMD-style animated battle sprites (from
// PMDCollab's SpriteCollab; downloaded locally by scripts/fetch-battle-sprites.mjs
// — the app never hits an external endpoint at runtime). Sheets are served from
// public/sprites/pmd/<id>/<sheet>-Anim.png. See src/components/PmdSprite.tsx.
const ASSET = import.meta.env?.BASE_URL ?? '/';

// Logical battle animations, mapped to whatever the species actually ships. The
// `AttackAnim` styles (strike/shoot/special/swing/charge) let a move drive a
// fitting motion; `attack` is the generic lunge used when a move has no style.
export type PmdAnimKind = 'idle' | 'walk' | 'attack' | 'hurt' | 'faint' | AttackAnim;

// scripts/build-pmd-bodies.py mirrors FALLBACKS.idle, RESTING_OVERRIDE and
// DIR_ROW to measure each species' resting feet (pmdBodies.gen.ts): change them
// together and rerun it.
//
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

// Mirrored by scripts/build-pmd-bodies.py (rerun it after a change).
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
// Mirrored by scripts/build-pmd-bodies.py (rerun it after a change).
const DIR_ROW: Record<Side, number> = { player: 3 /* UpRight */, foe: 7 /* DownLeft */ };

export function hasPmdSprite(dexId: number): boolean {
  return PMD_SPRITES[dexId] !== undefined;
}

/** Where a species' resting body stands (ground point, height above it), or null when unmeasured. */
export function pmdBody(dexId: number): PmdBody | null {
  return PMD_BODIES[dexId] ?? null;
}

/** Whether a shiny recolour of the animated battle sprite is bundled. */
export function hasShinyPmdSprite(dexId: number): boolean {
  return SHINY_SPRITE_IDS.has(dexId) && PMD_SPRITES[dexId] !== undefined;
}

/** Whether an alternate-colour (non-shiny) animated battle sprite is bundled. */
export function hasAltColorPmdSprite(dexId: number): boolean {
  return ALT_COLOR_SPRITE_IDS.has(dexId) && PMD_SPRITES[dexId] !== undefined;
}

export function pmdSheetUrl(
  dexId: number,
  sheet: string,
  variant: PmdVariant = undefined,
): string {
  // Recolours mirror the base sheets (and geometry) under sibling folders.
  const dir = variant === 'shiny' ? 'pmd-shiny' : variant === 'alt' ? 'pmd-alt' : 'pmd';
  return `${ASSET}sprites/${dir}/${dexId}/${sheet}-Anim.png`;
}

/**
 * A sheet's ground shadow (scripts/build-pmd-shadows.py): the same frame grid as
 * the sheet, one shadow per frame where SpriteCollab places it. Recolours share
 * the base geometry, so every variant uses the base folder's shadows.
 */
export function pmdShadowUrl(dexId: number, sheet: string): string {
  return `${ASSET}sprites/pmd/${dexId}/${sheet}-Shadow.png`;
}

/**
 * Every distinct sheet and shadow URL a species can render. Used to preload
 * (decode) them up front so switching animations mid-battle never flashes a
 * blank frame while the browser fetches the not-yet-seen sheet.
 */
export function pmdSheetUrls(dexId: number, variant: PmdVariant = undefined): string[] {
  const entry: PmdEntry | undefined = PMD_SPRITES[dexId];
  if (!entry) return [];
  const sheets = new Set<string>();
  for (const anim of Object.values(entry)) sheets.add(anim.sheet);
  return [...sheets].flatMap((sheet) => [pmdSheetUrl(dexId, sheet, variant), pmdShadowUrl(dexId, sheet)]);
}

/** Resolve a logical anim to a concrete sheet for a species, or null if unbundled. */
export function resolvePmdAnim(dexId: number, kind: PmdAnimKind): PmdAnim | null {
  const entry: PmdEntry | undefined = PMD_SPRITES[dexId];
  if (!entry) return null;
  const override =
    (kind === 'idle' || kind === 'walk') && RESTING_OVERRIDE[dexId];
  const chain = override || FALLBACKS[kind];
  for (const name of chain) {
    const anim = entry[name];
    if (anim) return anim;
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

/**
 * Screen pixels per sheet pixel, for every PMD sprite. SpriteCollab draws its
 * art at relative size, so one whole multiple keeps both the pixel grid and the
 * size order (Charmander < Charmeleon < Charizard) intact.
 */
export const PMD_SCALE = 2;

/** SpriteCollab's resting ground point, source px from the canvas centre, for an unmeasured species. */
export const PMD_DEFAULT_GROUND = { x: 0, y: 4 };

/**
 * Where to draw one frame of a species' sheet (and its shadow sheet), in screen
 * px relative to its ground anchor. Every anim of a species shares the canvas
 * centre as its origin, so centring each frame on the same point keeps idle,
 * hurt and attack frames from jumping; `ground` (the side's PMD_BODIES resting
 * shadow centre, source px from that centre) shifts the frame so the resting
 * shadow lands on the anchor and the body stands where SpriteCollab put it.
 */
export function pmdFrameBox({ fw, fh, ground }: { fw: number; fh: number; ground: { x: number; y: number } }): {
  left: number; top: number; width: number; height: number;
} {
  const width = fw * PMD_SCALE;
  const height = fh * PMD_SCALE;
  return { left: -width / 2 - ground.x * PMD_SCALE, top: -height / 2 - ground.y * PMD_SCALE, width, height };
}
