import type { ActivityResult, MemberGrowth, PlaceView } from './activity.js';
import type { BattleEvent } from './battle.js';
import type { MintSpec, OwnedMon } from './box.js';
import type { LevelRange, WildRules } from './world.js';
import type { WildView } from './wilds.js';

/** The active Route 1 contract. Historical expedition contracts remain separate. */
export type CaptureBallId = 'poke' | 'great';
export type SearchKind = 'wild' | 'npc' | 'explore';
export type RoutePhase = 'wild' | 'catch' | 'trainer' | 'researcher' | 'resolved';
export type RouteChoice = 'battle' | 'catch' | 'leave' | 'accept' | 'decline' | 'talk';
export type RouteOutcome = 'caught' | 'escaped' | 'won' | 'lost' | 'left' | 'talked' | 'accepted' | 'found';

export interface ItemDefinition {
  id: CaptureBallId;
  name: string;
  description: string;
  category: 'capture';
  useContext: 'wild';
  catchBonus: number;
}
export interface InventoryStack { itemId: CaptureBallId; quantity: number }
export interface InventoryState { revision: number; stacks: InventoryStack[] }
export interface ItemGrant { itemId: CaptureBallId; quantity: number }
export interface AllowanceRecord { available: number; refilledAt: number }
export interface ActionAllowance {
  available: number;
  capacity: number;
  refillEveryMs: number;
  nextRefillAt: number | null;
}
export interface RouteNpc {
  id: 'meadow-scout' | 'youngster' | 'researcher';
  name: string;
  spriteKey: string;
  text: string;
}
export interface RouteQuest {
  id: 'meadow-survey';
  status: 'not-accepted' | 'active' | 'ready' | 'claimed';
  landmarks: string[];
  required: string[];
}
export interface RouteRules {
  version: 2;
  capacity: number;
  initialActions: number;
  refillEveryMs: number;
  starterBalls: number;
  wild: WildRules;
  recommended: LevelRange;
  wildExp: number;
  trainerExp: number;
  trainerLevel: number;
  trainerStatMult: number;
  npcTrainerChance: number;
  exploreWildChance: number;
  exploreNpcChance: number;
  landmarkChance: number;
  pokeBundleChance: number;
  pokeBundleQuantity: number;
  greatBundleQuantity: number;
  questGreatBalls: number;
  basicCatchChance: number;
  rareCatchChance: number;
  battleCatchBonus: number;
  greatCatchBonus: number;
  maxCatchChance: number;
}
/** Private: retain the exact individual which may later become owned. */
export interface FrozenRouteFoe { mint: MintSpec; view: WildView; statMult: number }
export interface RouteFind {
  kind: 'wild' | 'trainer' | 'researcher' | 'item';
  foe: FrozenRouteFoe | null;
  npc: RouteNpc | null;
  items: ItemGrant[];
  landmarks: string[];
}
/** A party member that fought, with the HP it ended on. */
export interface FieldedMember { id: string; hp: number; maxHp: number }
export interface RouteBattle {
  won: boolean;
  turns: number;
  events: BattleEvent[];
  /** Fielded members in battle order; absent on battles stored before persistent HP. */
  fielded?: FieldedMember[];
}
export interface RouteCatch {
  ballId: CaptureBallId;
  chance: number;
  caught: boolean;
  owned: OwnedMon | null;
}
export interface RouteEvent {
  id: string;
  locationId: 'r1';
  searchKind: SearchKind;
  kind: RouteFind['kind'];
  rulesVersion: 2;
  revision: number;
  startedAt: number;
  resolvedAt: number | null;
  phase: RoutePhase;
  party: OwnedMon[];
  foe: WildView | null;
  npc: RouteNpc | null;
  choices: RouteChoice[];
  catchChances: Record<CaptureBallId, number> | null;
  battle: RouteBattle | null;
  members: MemberGrowth[];
  catch: RouteCatch | null;
  items: ItemGrant[];
  newSeen: number[];
  newLandmarks: string[];
  outcome: RouteOutcome | null;
}
/** Only persisted server-side; never spread this object into a response. */
export interface StoredRouteEvent {
  event: RouteEvent;
  seed: string;
  config: RouteRules;
  foe: FrozenRouteFoe | null;
}
export interface RouteState {
  serverNow: number;
  /** Increases on every committed route mutation, guards out-of-order replies. */
  revision: number;
  activated: boolean;
  allowance: ActionAllowance;
  inventory: InventoryState;
  quest: RouteQuest;
  places: PlaceView[];
  trainerAt: 'home' | 'r1';
  ownedCount: number;
  activeEvent: RouteEvent | null;
  result: RouteEvent | null;
  legacy: { pending: boolean; notice: string | null; result: ActivityResult | null };
}
export interface RouteSearchInput {
  requestId: string;
  locationId: 'r1';
  kind: SearchKind;
  partyIds: string[];
}
export interface RouteChooseInput {
  requestId: string;
  eventId: string;
  expectedRevision: number;
  choice: RouteChoice;
  ballId?: CaptureBallId;
}
export interface RouteQuestInput { requestId: string; questId: 'meadow-survey' }
export interface RouteReply {
  state: RouteState;
  box?: OwnedMon[];
  /** Original command result, including on a retry; state reflects current state. */
  event?: RouteEvent;
  replayed?: boolean;
}
