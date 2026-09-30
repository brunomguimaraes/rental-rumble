import type { BattleEvent } from './battle.js';
import type { CatchOrigin, OwnedMon } from './box.js';
import type { AbilityId, Build, Creature, Sign } from './types.js';
import type { WildView } from './wilds.js';
import type { CheckpointView, TrailEntry, TrailOutcome } from './expedition.js';
import { ownedMonToCreature } from './box.js';
import { applyGrowthWithEvolution } from './evolution.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { RNG } from './rng.js';
import {
  TRAINING_CAP_MS,
  expSharePct,
  isPlayableId,
  scaleExp,
  type ChoiceId,
  type ExpeditionTemplate,
  type ExploreRules,
  type GuardianSpec,
  type LevelRange,
  type LocationId,
  type NodeKind,
  type PlaceProgress,
  type PlaceState,
  type PlayableId,
  type RoutePlace,
  type TrainingRules,
  type WildRules,
} from './world.js';

// The contract between the activity rules, the server, and the screens: the
// frozen per-activity config, the snapshot normaliser, the growth seam, and the
// shapes the API returns. Training and exploration are two modes of one
// activity; a trainer has at most one at a time.

export type ActivityMode = 'train' | 'explore';

/** A route's rules frozen into the activity row at start, so rebalancing never moves a live activity. */
export interface ActivityConfig {
  v: 1;
  locationId: PlayableId;
  recommended: LevelRange;
  wild: WildRules;
  training: TrainingRules;
  explore: ExploreRules;
  guardian: GuardianSpec;
  expedition: ExpeditionTemplate;
  capMs: number;
}

export function configFor(route: RoutePlace): ActivityConfig {
  return {
    v: 1,
    locationId: route.id,
    recommended: route.recommended,
    wild: route.wild,
    training: route.training,
    explore: route.explore,
    guardian: route.guardian,
    expedition: route.expedition,
    capMs: TRAINING_CAP_MS,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** A stored config, or null when it is not a v1 config. */
export function parseConfig(raw: unknown): ActivityConfig | null {
  if (!isObj(raw) || raw.v !== 1 || !isPlayableId(raw.locationId) || !isNum(raw.capMs)) return null;
  const { recommended: rec, wild, training: tr, explore: ex, guardian: g, expedition: exp } = raw;
  if (!isObj(rec) || !isNum(rec.min) || !isNum(rec.max)) return null;
  if (!isObj(wild) || !isNum(wild.min) || !isNum(wild.max) || !isNum(wild.statMult) || !Array.isArray(wild.pool)) return null;
  if (wild.pool.length === 0 || !wild.pool.every((e) => isObj(e) && isInt(e.dexId) && isNum(e.weight))) return null;
  if (!isObj(tr) || !isNum(tr.paceMs) || !isNum(tr.maxEncounters) || !isNum(tr.expPerWin)) return null;
  if (!isObj(ex) || !isNum(ex.expPerWin) || !isNum(ex.clearBonus)) return null;
  if (!isObj(g) || !isInt(g.dexId) || !isNum(g.level) || !isNum(g.statMult) || !isStr(g.title)) return null;
  if (!isObj(exp) || !isStr(exp.start) || !isObj(exp.nodes) || !isObj(exp.nodes[exp.start])) return null;
  return raw as unknown as ActivityConfig;
}

const ORIGINS: readonly CatchOrigin[] = ['starter', 'tutorial', 'catch'];

/**
 * The party frozen at start, read back from storage: 1–6 owned rows with the
 * fields a battle creature needs. Anything else is null. This is the one place
 * a stored snapshot is trusted, so a new owned field (per-individual stats in
 * the growth overhaul) is added and backfilled here.
 */
export function normaliseSnapshot(raw: unknown): OwnedMon[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 6) return null;
  const out: OwnedMon[] = [];
  for (const m of raw) {
    if (!isObj(m) || !isStr(m.id) || m.id.length === 0) return null;
    if (!isInt(m.dexId) || !CREATURES_BY_ID[String(m.dexId)]) return null;
    if (!isInt(m.level) || m.level < 1 || m.level > 50 || !isInt(m.exp) || m.exp < 0) return null;
    if (!isStr(m.sign) || typeof m.shiny !== 'boolean' || typeof m.altColor !== 'boolean') return null;
    if (!ORIGINS.includes(m.origin as CatchOrigin)) return null;
    out.push({
      id: m.id,
      dexId: m.dexId,
      level: m.level,
      exp: m.exp,
      sign: m.sign as Sign,
      ...(isStr(m.ability) ? { ability: m.ability as AbilityId } : {}),
      ...(m.build === 'physical' || m.build === 'energy' ? { build: m.build as Build } : {}),
      shiny: m.shiny,
      altColor: m.altColor,
      ...(isStr(m.emotion) ? { emotion: m.emotion } : {}),
      ...(isStr(m.nickname) ? { nickname: m.nickname } : {}),
      origin: m.origin as CatchOrigin,
      caughtAt: isNum(m.caughtAt) ? m.caughtAt : 0,
    });
  }
  return out;
}

/** Battle creatures for a snapshot, in party order (unknown species dropped). */
export function partyCreatures(snapshot: readonly OwnedMon[]): Creature[] {
  return snapshot.map(ownedMonToCreature).filter((c): c is Creature => c !== null);
}

// --- Growth seam ---------------------------------------------------------------------

export interface MemberGrowth {
  id: string;
  /** Percent of the activity's EXP this member earned (over-level falloff). */
  sharePct: number;
  expGained: number;
  before: { dexId: number; level: number; exp: number };
  after: { dexId: number; level: number; exp: number };
  evolutions: { fromDexId: number; toDexId: number }[];
}

/** The one place activity EXP becomes growth. The growth overhaul replaces this body. */
export function growMember(mon: OwnedMon, exp: number, rng: RNG): { mon: OwnedMon; evolutions: MemberGrowth['evolutions'] } {
  const grown = applyGrowthWithEvolution(mon, exp, rng);
  return { mon: grown.mon, evolutions: grown.evolutions };
}

/**
 * Apply an activity's EXP to its party. The falloff share comes from each
 * member's level when the activity started (the snapshot); the growth lands on
 * the member's current row, so a nickname or anything else changed since is
 * kept. Members no longer owned are skipped. Returns only rows that changed.
 */
export function planGrowth(
  current: readonly OwnedMon[],
  snapshot: readonly OwnedMon[],
  rawExp: number,
  rec: LevelRange,
  activityId: string,
): { changed: OwnedMon[]; members: MemberGrowth[] } {
  const byId = new Map(current.map((m) => [m.id, m]));
  const changed: OwnedMon[] = [];
  const members: MemberGrowth[] = [];
  for (const snap of snapshot) {
    const row = byId.get(snap.id);
    if (!row) continue;
    const sharePct = expSharePct(snap.level, rec);
    const expGained = scaleExp(rawExp, sharePct);
    const grown = expGained > 0 ? growMember(row, expGained, new RNG(`evolve:${row.id}:${activityId}`)) : { mon: row, evolutions: [] };
    members.push({
      id: row.id,
      sharePct,
      expGained,
      before: { dexId: row.dexId, level: row.level, exp: row.exp },
      after: { dexId: grown.mon.dexId, level: grown.mon.level, exp: grown.mon.exp },
      evolutions: grown.evolutions,
    });
    if (grown.mon.dexId !== row.dexId || grown.mon.level !== row.level || grown.mon.exp !== row.exp) changed.push(grown.mon);
  }
  return { changed, members };
}

// --- Results and views ---------------------------------------------------------------

export type Outcome = 'cap' | 'early' | 'loss' | 'complete' | 'retreat' | 'defeat';

export interface BattleSummary {
  foe: WildView;
  won: boolean;
  turns: number;
}

/** What an activity paid out, stored on its row when it settles. */
export interface ActivityResult {
  id: string;
  mode: ActivityMode;
  locationId: PlayableId;
  outcome: Outcome;
  startedAt: number;
  endedAt: number;
  elapsedMs: number;
  battles: BattleSummary[];
  wins: number;
  rawExp: number;
  members: MemberGrowth[];
  seen: number[];
  newSeen: number[];
  landmarks: string[];
  newLandmarks: string[];
  cleared: boolean;
  firstClear: boolean;
  unlocked: PlayableId[];
  legacy: boolean;
}

const OUTCOMES: readonly Outcome[] = ['cap', 'early', 'loss', 'complete', 'retreat', 'defeat'];

export function parseResult(raw: unknown): ActivityResult | null {
  if (!isObj(raw) || !isStr(raw.id) || (raw.mode !== 'train' && raw.mode !== 'explore')) return null;
  if (!isPlayableId(raw.locationId) || !OUTCOMES.includes(raw.outcome as Outcome)) return null;
  if (!isNum(raw.startedAt) || !isNum(raw.endedAt) || !isNum(raw.elapsedMs) || !isNum(raw.wins) || !isNum(raw.rawExp)) return null;
  const arrays = [raw.battles, raw.members, raw.seen, raw.newSeen, raw.landmarks, raw.newLandmarks, raw.unlocked];
  if (!arrays.every(Array.isArray)) return null;
  if (typeof raw.cleared !== 'boolean' || typeof raw.firstClear !== 'boolean' || typeof raw.legacy !== 'boolean') return null;
  return raw as unknown as ActivityResult;
}

export interface TrainingStatus {
  paceMs: number;
  capMs: number;
  maxEncounters: number;
  expPerWin: number;
  elapsedMs: number;
  /** Time until the next battle, or null once the party fell or the cap is reached. */
  nextBattleInMs: number | null;
  battles: number;
  wins: number;
  fell: boolean;
  capped: boolean;
  /** EXP each member will receive for the battles so far (applied when the trainer returns). */
  pendingExp: { id: string; exp: number }[];
  recent: BattleSummary[];
}

export interface ExpeditionView {
  step: number;
  checkpoint: CheckpointView | null;
  trail: TrailEntry[];
  wins: number;
  expUnits: number;
  pendingExp: { id: string; exp: number }[];
}

/** An activity as the client sees it: never the seed or checkpoints still ahead. */
export interface PublicActivity {
  id: string;
  mode: ActivityMode;
  locationId: PlayableId;
  startedAt: number;
  party: OwnedMon[];
  legacy: boolean;
  training: TrainingStatus | null;
  expedition: ExpeditionView | null;
}

export interface PlaceView {
  id: PlayableId;
  state: PlaceState;
  progress: PlaceProgress;
}

export interface WorldState {
  serverNow: number;
  places: PlaceView[];
  activity: PublicActivity | null;
  result: ActivityResult | null;
  trainerAt: LocationId;
}

/** One resolved checkpoint, as returned by a step (the battle's event log included). */
export interface StepEvent {
  step: number;
  kind: NodeKind;
  choice: ChoiceId;
  outcome: TrailOutcome;
  foe: WildView | null;
  landmark: string | null;
  newLandmark: boolean;
  newSeen: boolean;
  battle: { won: boolean; turns: number; events: BattleEvent[] } | null;
  expUnits: number;
}

export interface StartInput {
  mode: ActivityMode;
  locationId: PlayableId;
  partyIds: string[];
  requestId: string;
}

export interface StepInput {
  activityId: string;
  step: number;
  choice: ChoiceId;
}
