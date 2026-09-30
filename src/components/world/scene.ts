import { timeOfDay } from '../../game/backgrounds';
import { CREATURES_BY_ID } from '../../game/pokemon';
import type { OwnedMon } from '../../game/box';
import type { ActivityResult, MemberGrowth, Outcome, PublicActivity } from '../../game/activity';
import { formatLevel, type Biome, type PlaceState, type RoutePlace } from '../../game/world';
import type { GlyphName } from './PixelIcon';

// Shared bits for the world screens: backdrops, the trainer sprite, labels,
// durations, and the one place growth turns into words (the growth overhaul
// changes that copy here, nowhere else).

const ASSET = import.meta.env.BASE_URL;

/** What an activity screen hands back to App after a step or a settlement. */
export interface ActivityPatch {
  activity?: PublicActivity | null;
  result?: ActivityResult | null;
  box?: OwnedMon[] | null;
}

/** The route's scene (a battle backdrop; see Backdrop for how it is drawn). */
export function backdropUrl(route: RoutePlace, date = new Date()): string {
  const key = route.backdrop.startsWith('cave-') ? route.backdrop : `${route.backdrop}-${timeOfDay(date)}`;
  return `${ASSET}sprites/backgrounds/${key}.png`;
}

/** The player's trainer (32×48 art): a still frame, and a four-frame walk. */
export const TRAINER = {
  still: `${ASSET}sprites/trainers/special-ethan.png`,
  walk: `${ASSET}sprites/trainers/special-ethan.gif`,
};

export const POKEBALL = `${ASSET}sprites/ui/pokeball.png`;

export const STATE_LABEL: Record<PlaceState, string> = {
  undiscovered: 'Undiscovered',
  locked: 'Locked',
  available: 'New',
  discovered: 'Discovered',
  completed: 'Cleared',
};

/** The map glyph for each place state (always shown with its label). */
export const STATE_GLYPH: Record<PlaceState, GlyphName> = {
  undiscovered: 'question',
  locked: 'lock',
  available: 'sparkle',
  discovered: 'flag',
  completed: 'star',
};

export const BIOME_LABEL: Record<Biome, string> = {
  town: 'Town',
  meadow: 'Meadow',
  forest: 'Forest',
  lakeside: 'Lakeside',
  quarry: 'Quarry',
  mountain: 'Mountain',
  ruins: 'Ruins',
};

export function speciesName(dexId: number): string {
  return CREATURES_BY_ID[String(dexId)]?.name ?? 'Pokémon';
}

export function monName(mon: Pick<OwnedMon, 'dexId' | 'nickname'>): string {
  return mon.nickname || speciesName(mon.dexId);
}

/** "2h 05m", "12m 30s", "45s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** What one member's growth reads as: "Grew to Lv 9", "Evolved into Metapod". */
export function growthLines(member: MemberGrowth): string[] {
  const lines: string[] = [];
  if (member.after.level > member.before.level) lines.push(`Grew to ${formatLevel(member.after)}`);
  for (const e of member.evolutions) lines.push(`Evolved into ${speciesName(e.toDexId)}`);
  return lines;
}

export const OUTCOME_TITLE: Record<Outcome, string> = {
  cap: 'Training complete',
  early: 'Back from training',
  loss: 'Your party fell',
  complete: 'Route cleared',
  retreat: 'Back safely',
  defeat: 'Defeated',
};
