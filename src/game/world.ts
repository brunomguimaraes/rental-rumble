import { PLACES } from './world-places.js';

// Hearthvale, the one region: its places, how they open up, and the pure rules
// the server and the screens share. The content itself lives in
// world-places.ts; nothing here reads a clock or a database.

export type PlayableId = 'r1' | 'r2' | 'lake' | 'quarry' | 'trail' | 'ruins';
export type LocationId = 'home' | PlayableId;
export type Biome = 'town' | 'meadow' | 'forest' | 'lakeside' | 'quarry' | 'mountain' | 'ruins';

export interface LevelRange {
  min: number;
  max: number;
}

export interface PoolEntry {
  dexId: number;
  weight: number;
  rare?: boolean;
}

/** Which wild Pokémon live on a route, how strong they are, and their stat handicap. */
export interface WildRules extends LevelRange {
  statMult: number;
  pool: readonly PoolEntry[];
}

export interface TrainingRules {
  paceMs: number;
  maxEncounters: number;
  expPerWin: number;
}

export interface ExploreRules {
  expPerWin: number;
  clearBonus: number;
}

/** The route's final challenge: beating it once clears the route. */
export interface GuardianSpec {
  dexId: number;
  level: number;
  statMult: number;
  title: string;
}

export interface Landmark {
  id: string;
  name: string;
  blurb: string;
}

// --- Expedition templates ------------------------------------------------------

export type NodeKind = 'battle' | 'sighting' | 'landmark' | 'fork' | 'guardian';
export type ChoiceId = 'fight' | 'observe' | 'challenge' | 'investigate' | 'press-on' | 'a' | 'b' | 'retreat';

export interface BattleNode {
  kind: 'battle';
  id: string;
  title: string;
  text: string;
  next: string;
  levelBonus?: number;
  rareBoost?: number;
}

export interface SightingNode {
  kind: 'sighting';
  id: string;
  title: string;
  text: string;
  next: string;
  levelBonus?: number;
  rareBoost?: number;
}

export interface LandmarkNode {
  kind: 'landmark';
  id: string;
  title: string;
  text: string;
  next: string;
  landmark: string;
  /** Chance that investigating rouses a wild Pokémon first. */
  guardedChance: number;
  levelBonus?: number;
}

export interface ForkOption {
  id: 'a' | 'b';
  label: string;
  hint: string;
  next: string;
}

export interface ForkNode {
  kind: 'fork';
  id: string;
  title: string;
  text: string;
  options: readonly [ForkOption, ForkOption];
}

export interface GuardianNode {
  kind: 'guardian';
  id: string;
  title: string;
  text: string;
}

export type ExpeditionNode = BattleNode | SightingNode | LandmarkNode | ForkNode | GuardianNode;

export interface ExpeditionTemplate {
  start: string;
  nodes: Readonly<Record<string, ExpeditionNode>>;
}

// --- Places ----------------------------------------------------------------------

export interface HomePlace {
  kind: 'home';
  id: 'home';
  name: string;
  biome: Biome;
  blurb: string;
  map: { x: number; y: number };
  neighbours: readonly LocationId[];
}

export interface RoutePlace {
  kind: 'route';
  id: PlayableId;
  routeLabel?: string;
  name: string;
  biome: Biome;
  blurb: string;
  /** Pixel position on the 1× map (MAP_SIZE). */
  map: { x: number; y: number };
  neighbours: readonly LocationId[];
  /** Routes whose guardian must be beaten first; empty = open from the start. */
  unlock: readonly PlayableId[];
  recommended: LevelRange;
  wild: WildRules;
  training: TrainingRules;
  explore: ExploreRules;
  guardian: GuardianSpec;
  landmarks: readonly Landmark[];
  expedition: ExpeditionTemplate;
  /** Battle backdrop key under public/sprites/backgrounds (time-of-day suffix added unless `cave-*`). */
  backdrop: string;
}

export type Place = HomePlace | RoutePlace;

export const WORLD_RULES_VERSION = 1;
export const TRAINING_CAP_MS = 8 * 60 * 60 * 1000;
export const MAP_SIZE = { width: 384, height: 576 } as const;

/** Every place on the map, home first. */
export const PLACE_LIST: readonly Place[] = PLACES;
export const ROUTES: readonly RoutePlace[] = PLACES.filter((p): p is RoutePlace => p.kind === 'route');
const PLACE_BY_ID = new Map<string, Place>(PLACES.map((p) => [p.id, p]));

export function placeById(id: unknown): Place | null {
  return typeof id === 'string' ? (PLACE_BY_ID.get(id) ?? null) : null;
}

export function routeById(id: unknown): RoutePlace | null {
  const p = placeById(id);
  return p?.kind === 'route' ? p : null;
}

export function isPlayableId(v: unknown): v is PlayableId {
  return routeById(v) !== null;
}

/** "Route 1 · Sunny Meadow", or just the name for a place without a route number. */
export function placeTitle(p: Place): string {
  return p.kind === 'route' && p.routeLabel ? `${p.routeLabel} · ${p.name}` : p.name;
}

// --- Progress, unlocks, and map states --------------------------------------------

export interface PlaceProgress {
  clearedAt: number | null;
  explores: number;
  clears: number;
  trainings: number;
  trainingWins: number;
  landmarks: readonly string[];
  seen: readonly number[];
}

export const EMPTY_PROGRESS: PlaceProgress = {
  clearedAt: null,
  explores: 0,
  clears: 0,
  trainings: 0,
  trainingWins: 0,
  landmarks: [],
  seen: [],
};

export function isUnlocked(route: RoutePlace, cleared: ReadonlySet<string>): boolean {
  return route.unlock.every((id) => cleared.has(id));
}

export type PlaceState = 'undiscovered' | 'locked' | 'available' | 'discovered' | 'completed';

/**
 * How a route shows on the map. Open routes are available until visited, then
 * discovered until their guardian falls. A closed route is only visible (locked)
 * from open ground next to it; anything further away is undiscovered.
 */
export function placeState(route: RoutePlace, progress: PlaceProgress, cleared: ReadonlySet<string>): PlaceState {
  if (isUnlocked(route, cleared)) {
    if (cleared.has(route.id)) return 'completed';
    return progress.explores + progress.trainings > 0 ? 'discovered' : 'available';
  }
  const visible = route.neighbours.some((n) => {
    if (n === 'home') return true;
    const r = routeById(n);
    return r !== null && isUnlocked(r, cleared);
  });
  return visible ? 'locked' : 'undiscovered';
}

/** Routes that `after` opens and `before` kept closed, in region order. */
export function newlyUnlocked(before: ReadonlySet<string>, after: ReadonlySet<string>): PlayableId[] {
  return ROUTES.filter((r) => !isUnlocked(r, before) && isUnlocked(r, after)).map((r) => r.id);
}

/** What opens a route, for its details panel. */
export function unlockText(route: RoutePlace): string {
  const names = route.unlock.map((id) => routeById(id)?.name ?? id);
  if (names.length === 0) return 'Open from the start.';
  if (names.length === 1) return `Beat the guardian of ${names[0]}.`;
  return `Beat the guardians of ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}

// --- Rewards ------------------------------------------------------------------------

export const FALLOFF_PER_LEVEL_PCT = 15;
export const FALLOFF_FLOOR_PCT = 25;

/**
 * Share of a route's EXP (percent) a Pokémon earns there: all of it up to the
 * top of the recommended range, 15% less per level above, never below 25%.
 */
export function expSharePct(level: number, rec: LevelRange): number {
  const over = Math.floor(level) - rec.max;
  return over <= 0 ? 100 : Math.max(FALLOFF_FLOOR_PCT, 100 - FALLOFF_PER_LEVEL_PCT * over);
}

export function scaleExp(raw: number, pct: number): number {
  return Math.floor((Math.max(0, Math.floor(raw)) * pct) / 100);
}

export type Rating = 'comfortable' | 'even' | 'risky';

/** Guidance for the start panel, from the party's strongest member. */
export function rateParty(levels: readonly number[], rec: LevelRange): Rating {
  const top = levels.length > 0 ? Math.max(...levels) : 0;
  if (top > rec.max) return 'comfortable';
  return top >= rec.min ? 'even' : 'risky';
}

/** Battles a training session has reached after `elapsedMs`: one per pace, capped by time and count. */
export function trainingBattleCount(
  elapsedMs: number,
  rules: Pick<TrainingRules, 'paceMs' | 'maxEncounters'>,
  capMs: number = TRAINING_CAP_MS,
): number {
  if (!(rules.paceMs > 0)) return 0;
  const elapsed = Math.max(0, Math.min(elapsedMs, capMs));
  return Math.min(Math.floor(elapsed / rules.paceMs), rules.maxEncounters);
}

// --- Mastery ------------------------------------------------------------------------

export interface Mastery {
  cleared: boolean;
  surveyed: boolean;
  catalogued: boolean;
  landmarksFound: number;
  landmarksTotal: number;
  seenCount: number;
  speciesTotal: number;
}

export function masteryOf(route: RoutePlace, progress: PlaceProgress): Mastery {
  const landmarksFound = route.landmarks.filter((l) => progress.landmarks.includes(l.id)).length;
  const species = route.wild.pool.map((e) => e.dexId);
  const seenCount = species.filter((d) => progress.seen.includes(d)).length;
  return {
    cleared: progress.clearedAt !== null,
    surveyed: landmarksFound === route.landmarks.length,
    catalogued: seenCount === species.length,
    landmarksFound,
    landmarksTotal: route.landmarks.length,
    seenCount,
    speciesTotal: species.length,
  };
}

// --- Display seams --------------------------------------------------------------------
// Levels reach the screen only through these two, so hiding them (the growth
// overhaul) is a two-function change.

export function formatLevel(mon: { level: number }): string {
  return `Lv ${mon.level}`;
}

export function formatRecommended(route: RoutePlace): string {
  return `Lv ${route.recommended.min}–${route.recommended.max}`;
}
