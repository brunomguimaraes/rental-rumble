import type { ActivityResult, MemberGrowth, PlaceView } from './activity.js';
import type { BattleEvent } from './battle.js';
import type { MintSpec, OwnedMon } from './box.js';
import type { LevelRange, WildRules } from './world.js';
import type { WildView } from './wilds.js';
import type { MeterView } from './meter.js';
import type { TravelPlace, TravelQuote } from './travel.js';

/** The active Route 1 contract. Historical expedition contracts remain separate. */
export type CaptureBallId = 'poke' | 'great';
/** The six cards on the Sunny Meadow board. */
export type SearchKind = 'wild' | 'trainer' | 'puzzle' | 'quest' | 'explore' | 'forage';
/** Find NPC, retired by rules v4: only events stored under rules v2 and v3 carry it. */
export type LegacySearchKind = 'npc';
export type QuestId = 'meadow-survey' | 'honey-tree';
export type PuzzleScene = 'tall-grass' | 'sunflowers' | 'signpost' | 'hilltop-oak';
export type RoutePhase = 'wild' | 'catch' | 'trainer' | 'researcher' | 'resolved';
export type RouteChoice = 'battle' | 'catch' | 'leave' | 'accept' | 'decline' | 'talk';
export type RouteOutcome = 'caught' | 'escaped' | 'won' | 'lost' | 'left' | 'talked' | 'accepted' | 'found' | 'nothing';

export type ValuableId = 'honey' | 'tiny-mushroom' | 'big-mushroom';
export type ItemId = CaptureBallId | ValuableId;
export type TradeSide = 'buy' | 'sell';

export interface ItemDefinition {
  id: ItemId;
  name: string;
  /** Used for counts other than one: "3 Poké Balls", "2 Honey". */
  plural: string;
  description: string;
  category: 'capture' | 'valuable';
  /** Where the item can be used; valuables are only sold. */
  useContext: 'wild' | null;
  catchBonus: number;
  /** Market prices in ₽; a missing side cannot be traded that way. */
  price: { buy?: number; sell?: number };
  /** Icon path relative to the site's BASE_URL. */
  icon: string;
}
export interface InventoryStack { itemId: ItemId; quantity: number }
export interface InventoryState { revision: number; money: number; stacks: InventoryStack[] }
export interface ItemGrant { itemId: ItemId; quantity: number }
export interface AllowanceRecord { available: number; refilledAt: number }
export interface ActionAllowance {
  available: number;
  capacity: number;
  refillEveryMs: number;
  nextRefillAt: number | null;
}
export interface RouteNpc {
  id: 'meadow-scout' | 'youngster' | 'lass' | 'bug-catcher' | 'researcher';
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
/** Rules frozen into encounters started before the market. Read-only: new searches use RouteRules. */
export interface RouteRulesV2 {
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
/** Rules frozen into encounters started under the market, before the action board. Read-only. */
export interface RouteRulesV3 extends Omit<RouteRulesV2, 'version' | 'pokeBundleChance'> {
  version: 3;
  /** Weights inside an Explore item find. */
  itemFinds: { poke: number; great: number; harvest: number; pouch: number };
  /** Ordered weights for one harvest good. */
  harvest: readonly { itemId: ValuableId; weight: number }[];
  pouchMoney: number;
  wildMoney: number;
  trainerMoney: number;
  questMoney: number;
}
/** One species in a foe pool; `statMult` overrides the pool's handicap for that species. */
export interface FoeEntry { dexId: number; weight: number; rare?: boolean; statMult?: number }
/** Weighted species at a hidden level range and battle handicap. */
export interface FoePool { min: number; max: number; statMult: number; pool: readonly FoeEntry[] }
/** One Explore item find, with its weight among them. */
export interface ExploreFind { items: ItemGrant[]; money: number; weight: number }
/** The live rules: the action board. */
export interface RouteRules {
  version: 4;
  capacity: number;
  initialActions: number;
  refillEveryMs: number;
  starterBalls: number;
  /** Actions each card's search spends. */
  costs: Record<SearchKind, number>;
  wild: FoePool;
  recommended: LevelRange;
  wildExp: number;
  trainerExp: number;
  trainerLevel: number;
  trainerStatMult: number;
  wildMoney: number;
  trainerMoney: number;
  /** Weights of Explore's outcomes. Once the Honey Tree is found, `secret` joins `rare`. */
  explore: { nothing: number; item: number; rare: number; secret: number };
  exploreItems: readonly ExploreFind[];
  exploreRares: FoePool;
  honeyTree: FoePool;
  forage: readonly { itemId: ValuableId; weight: number }[];
  puzzle: {
    size: number;
    /** Random slides away from the solved board. */
    slides: number;
    /** Scrambles keep sliding until at least this Manhattan distance from solved. */
    minDistance: number;
    scenes: readonly PuzzleScene[];
    rewards: readonly { items: ItemGrant[]; weight: number }[];
  };
  /** Explore's free Poké Balls when the Bag is empty and the trainer can't buy one. */
  pokeBundleQuantity: number;
  questGreatBalls: number;
  questMoney: number;
  basicCatchChance: number;
  rareCatchChance: number;
  battleCatchBonus: number;
  greatCatchBonus: number;
  maxCatchChance: number;
}
export type StoredRouteRules = RouteRules | RouteRulesV3 | RouteRulesV2;
/** Private: retain the exact individual which may later become owned. */
export interface FrozenRouteFoe { mint: MintSpec; view: WildView; statMult: number }
export interface RouteFind {
  kind: 'wild' | 'trainer' | 'researcher' | 'item' | 'nothing' | 'secret';
  foe: FrozenRouteFoe | null;
  npc: RouteNpc | null;
  items: ItemGrant[];
  money: number;
  landmarks: string[];
  /** The quest a find belongs to: the survey's steps, or the Honey Tree. */
  questId?: QuestId;
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
  /** The catch joined the saved party; false when it went to the Box. Absent on catches saved before. */
  joinedParty?: boolean;
}
export interface RouteEvent {
  id: string;
  locationId: 'r1';
  searchKind: SearchKind | LegacySearchKind;
  kind: RouteFind['kind'];
  rulesVersion: 2 | 3 | 4;
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
  /** ₽ this encounter paid; absent on encounters saved before the market. */
  money?: number;
  newSeen: number[];
  newLandmarks: string[];
  /** The quest this encounter belongs to; absent on encounters saved before quests had steps. */
  questId?: QuestId;
  outcome: RouteOutcome | null;
}
/** Only persisted server-side; never spread this object into a response. */
export interface StoredRouteEvent {
  event: RouteEvent;
  seed: string;
  config: StoredRouteRules;
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
  /** Where the trainer stands; searches need the route, trips leave from here. */
  trainerAt: TravelPlace;
  travel: MeterView;
  /** One quote per place reachable from `trainerAt`. The server prices trips; the client only shows them. */
  quotes: TravelQuote[];
  ownedCount: number;
  activeEvent: RouteEvent | null;
  result: RouteEvent | null;
  legacy: { pending: boolean; notice: string | null; result: ActivityResult | null };
}
export interface RouteTravelInput {
  requestId: string;
  to: TravelPlace;
  partyIds: string[];
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
export interface MarketTradeInput { requestId: string; itemId: ItemId; side: TradeSide; quantity: number }
export interface MarketTrade { itemId: ItemId; side: TradeSide; quantity: number; total: number }
export interface RouteReply {
  state: RouteState;
  box?: OwnedMon[];
  /** Original command result, including on a retry; state reflects current state. */
  event?: RouteEvent;
  replayed?: boolean;
  trade?: MarketTrade;
  /** The saved party, when the command changed it (a catch that joined the party). */
  party?: string[];
}
