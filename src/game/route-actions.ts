import type { ActivityResult, MemberGrowth, PlaceView } from './activity.js';
import type { BattleEvent } from './battle.js';
import type { MintSpec, OwnedMon } from './box.js';
import type { LevelRange, WildRules } from './world.js';
import type { WildView } from './wilds.js';
import type { MeterView } from './meter.js';
import type { TravelPlace, TravelQuote } from './travel.js';

/** The active Route 1 contract. Historical expedition contracts remain separate. */
export type CaptureBallId = 'poke' | 'great';
export type SearchKind = 'wild' | 'npc' | 'explore';
export type RoutePhase = 'wild' | 'catch' | 'trainer' | 'researcher' | 'resolved';
export type RouteChoice = 'battle' | 'catch' | 'leave' | 'accept' | 'decline' | 'talk';
export type RouteOutcome = 'caught' | 'escaped' | 'won' | 'lost' | 'left' | 'talked' | 'accepted' | 'found';

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
export interface RouteRules extends Omit<RouteRulesV2, 'version' | 'pokeBundleChance'> {
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
export type StoredRouteRules = RouteRules | RouteRulesV2;
/** Private: retain the exact individual which may later become owned. */
export interface FrozenRouteFoe { mint: MintSpec; view: WildView; statMult: number }
export interface RouteFind {
  kind: 'wild' | 'trainer' | 'researcher' | 'item';
  foe: FrozenRouteFoe | null;
  npc: RouteNpc | null;
  items: ItemGrant[];
  money: number;
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
  /** The catch joined the saved party; false when it went to the Box. Absent on catches saved before. */
  joinedParty?: boolean;
}
export interface RouteEvent {
  id: string;
  locationId: 'r1';
  searchKind: SearchKind;
  kind: RouteFind['kind'];
  rulesVersion: 2 | 3;
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
