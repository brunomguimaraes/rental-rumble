// Idle routes replace the old catch zones. The trainer walks a route and
// fights one wild Pokémon per `paceMs` of real time, up to the session cap.
// Levels are banded so a grown party can't farm the beginner road.

export type RouteId = 'r1' | 'r2';

export interface Route {
  id: RouteId;
  name: string;
  blurb: string;
  /** Inclusive level band a party mon must fall within to enter. */
  min: number;
  max: number;
  /** Wild level, jittered ±1 from the seed. */
  foeLevel: number;
  /** Stat multiplier wilds fight at (untrained). */
  wildStatMult: number;
  /** Real time per encounter. */
  paceMs: number;
  /** Hard cap on encounters per session. */
  maxEncounters: number;
  /** EXP to every party member per won battle. */
  expPerWin: number;
  /** Wild species pool: the weakest quarter of the dex, or the weakest half. */
  pool: 'weak' | 'early';
  /** 'start' or the milestone id that unlocks this route. */
  unlock: 'start' | `milestone:${string}`;
}

export const IDLE_CAP_MS = 8 * 60 * 60 * 1000;

export const ROUTES: readonly Route[] = [
  {
    id: 'r1',
    name: 'Route 1',
    blurb: 'Tall grass and a dirt path. Where every trainer starts.',
    min: 1,
    max: 12,
    foeLevel: 4,
    wildStatMult: 0.7,
    paceMs: 3 * 60 * 1000,
    maxEncounters: 100,
    expPerWin: 6,
    pool: 'weak',
    unlock: 'start',
  },
  {
    id: 'r2',
    name: 'Route 2',
    blurb: "A forest trail. Locked until you clear Route 1's milestone.",
    min: 8,
    max: 20,
    foeLevel: 12,
    wildStatMult: 0.9,
    paceMs: 4 * 60 * 1000,
    maxEncounters: 100,
    expPerWin: 10,
    pool: 'early',
    unlock: 'milestone:r1',
  },
];

const BY_ID: Record<string, Route> = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

export function routeById(id: unknown): Route | null {
  return typeof id === 'string' && Object.hasOwn(BY_ID, id) ? BY_ID[id] : null;
}

export function isRouteId(v: unknown): v is RouteId {
  return typeof v === 'string' && Object.hasOwn(BY_ID, v);
}

export function isLevelInRoute(level: number, route: Route): boolean {
  return level >= route.min && level <= route.max;
}

/** Non-empty, at most 6, every member in band. */
export function isPartyEligible(levels: readonly number[], route: Route): boolean {
  if (levels.length < 1 || levels.length > 6) return false;
  return levels.every((l) => isLevelInRoute(l, route));
}

/** `clearedMilestones` holds milestone ids (e.g. 'r1'). Slice 3 writes them. */
export function isRouteUnlocked(route: Route, clearedMilestones: readonly string[]): boolean {
  if (route.unlock === 'start') return true;
  return clearedMilestones.includes(route.unlock.slice('milestone:'.length));
}

/** Encounters a session earns for `elapsedMs`, clamped to the cap and the route max. */
export function encountersFor(elapsedMs: number, route: Route): number {
  const elapsed = Math.max(0, Math.min(elapsedMs, IDLE_CAP_MS));
  return Math.min(Math.floor(elapsed / route.paceMs), route.maxEncounters);
}
