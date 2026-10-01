# Hearth Town Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Village market in Hearth Town a working shop. Players earn Pokédollars (₽) in Sunny Meadow, buy
balls with them, and sell balls and new harvest goods.

**Architecture:**
- The shared catalog and rules in `src/game/` gain prices, three valuables, money, and route rules version 3.
- The server stores money as a new `route_accounts.money` column. It pays income inside the existing route
  transactions and runs trades as a new `market-trade` action on the `api/world` dispatcher, through the
  existing receipt-backed `writeCommand`.
- The client adds a `market-trade` route command. A Market screen inside `RouteScreen` reuses its
  pending-command recovery.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4, Vercel functions, libSQL/Turso, and plain `tsx` test
scripts.

**Spec:** `docs/superpowers/specs/2026-10-01-hearth-town-market-design.md`

## Global Constraints

- Runtime relative imports in `src/game/` and `api/` end in `.js`. `import type` may omit it.
- Item IDs: `poke`, `great`, `honey`, `tiny-mushroom`, `big-mushroom`. `CaptureBallId` stays `'poke' | 'great'`.
- Prices:

  | Item | Buy | Sell |
  |---|---:|---:|
  | Poké Ball | ₽200 | ₽100 |
  | Great Ball | ₽600 | ₽300 |
  | Honey | — | ₽150 |
  | Tiny Mushroom | — | ₽250 |
  | Big Mushroom | — | ₽1,000 |

- Income:

  | Source | Amount |
  |---|---:|
  | Wild win | ₽100 |
  | Trainer win | ₽200 |
  | Coin pouch | ₽300 |
  | Meadow survey | ₽500 |

- Explore item finds use weights Poké ×3 50, Great ×1 15, harvest 20, pouch 15. Harvest weights are Honey 6, Tiny
  Mushroom 3, Big Mushroom 1.
- The supply guarantee needs zero capture balls **and** money below one Poké Ball's buy price (₽200).
- Trade quantity is an integer from 1 to 99. A total must be a safe integer.
- `ROUTE_RULES.version` is 3. Stored events with config version 2 must still parse and settle; a v2 battle pays
  ₽0. RNG stream names stay `route:2:…` for every version.
- Money is a non-negative safe integer. Every change goes through `changeMoney`, which bumps
  `inventory_revision`.
- Responses are `{ ok: true, ... }` or `{ ok: false, error }`, and `error` is a player-facing sentence. Status
  codes follow `.agents/rules/api.md`; an unactivated route returns 409 (the existing `requireActivated`).
- UI uses Night tokens only, with no hex values. Controls are real `<button>`s with `ui-focus`. Pixel icons
  render at native size or a whole multiple, with `[image-rendering:pixelated]`. Layouts work at 320px.
- Commits carry no `Co-Authored-By` trailer (owner rule). Work on branch `market`, created off `development`.
- Never touch `local.db`, `.env`, or production. Tests use `tempDb`.

## Review Focus

1. **Lost reply on a trade.** Retrying with the same `requestId` must return the same receipt and never charge
   twice. Covered by the Task 3 DB test plus the Task 4 pending-command test.
2. **Two tabs buying at once with funds for one purchase.** Exactly one trade succeeds and the balance ends at
   ₽0. Covered by the Task 3 race test.
3. **Buying a ball mid-encounter, then throwing it.** The active encounter is unchanged by the trade, and the
   catch consumes the bought ball. Covered by the Task 3 DB test.
4. **Hostile or odd trade input over HTTP:** quantity 0, 100, 1.5, `"3"`, `side: 'steal'`, `itemId: 'master'`,
   or buying Honey. All return 400 before any DB work. Covered by the Task 3 API test.
5. **A late reply after a trade.** It must not rewind the shown balance. Money changes bump
   `inventory_revision`, so `reconcileRouteState` keeps the newer state. Covered by the Task 4 client test.

## Shared checkout warning

Another session edits this checkout concurrently. When this plan was written, it had uncommitted route-UI work
(`RouteBagDialog.tsx`, `MeadowScene.tsx`) and a committed Pokémon Center / persistent-HP spec that will also edit
`chooseRoute` and `RouteScreen`.

- Do all work in an isolated worktree on branch `market` (Task 0).
- Before Task 6, merge `development` into `market` and adapt the UI tasks to the Bag and route components that
  exist then. The behavior those tasks describe is the contract; the file shapes may move.

---

### Task 0: Isolated worktree

**Files:** none in the repo.

- [ ] **Step 1: Create a sparse worktree on a new branch.** Run these from the repo root. `SCRATCH` is this
  session's scratchpad.

```bash
git worktree add --no-checkout -b market "$SCRATCH/market" development
cd "$SCRATCH/market"
git sparse-checkout init --cone
git sparse-checkout set src api db scripts docs public/sprites/world public/sprites/ui public/sprites/balls public/sprites/items .agents .github
git checkout market
```

- [ ] **Step 2: Link dependencies per package, not the whole folder.** `tsc -b` writes
  `node_modules/.tmp/*.tsbuildinfo`, which must stay out of the shared checkout.

```bash
mkdir node_modules
for p in /Users/milano/Documents/Projects/Repos/pokemon-team/node_modules/* /Users/milano/Documents/Projects/Repos/pokemon-team/node_modules/.bin; do ln -s "$p" "node_modules/$(basename "$p")"; done
```

- [ ] **Step 3: Confirm a green baseline.**

```bash
npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/route-client.test.ts && npx tsx scripts/town.test.ts
```

Expected: every script ends with 0 failed. If one fails before any change, record it as pre-existing.

---

### Task 1: Shared contract (catalog, types, rules v3)

**Files:**
- Modify: `src/game/route-actions.ts` (types)
- Modify: `src/game/items.ts` (catalog, prices, helpers)
- Modify: `src/game/route-rules.ts` (rules v3, finds, prize, guard)
- Modify for compile only: `api/_route-actions.ts:56-64`, `scripts/route-balance.ts`,
  `src/components/BagScreen.tsx`, `src/components/world/RouteScreen.tsx`, `src/components/world/route-copy.ts`
- Test: `scripts/route-rules.test.ts`

**Interfaces:**
- Produces in `route-actions.ts`:
  - `type ValuableId = 'honey' | 'tiny-mushroom' | 'big-mushroom'`
  - `type ItemId = CaptureBallId | ValuableId`
  - `type TradeSide = 'buy' | 'sell'`
  - `InventoryStack { itemId: ItemId; quantity }` and `InventoryState { revision; money: number; stacks }`
  - `ItemGrant { itemId: ItemId; quantity }`
  - `RouteRulesV2` (the old shape, `version: 2`), `RouteRules` (`version: 3`), and
    `StoredRouteRules = RouteRules | RouteRulesV2`
  - `RouteFind.money: number`
  - `RouteEvent.rulesVersion: 2 | 3` and `RouteEvent.money?: number`
  - `StoredRouteEvent.config: StoredRouteRules`
  - `MarketTradeInput { requestId; itemId: ItemId; side: TradeSide; quantity: number }`
  - `MarketTrade { itemId: ItemId; side: TradeSide; quantity: number; total: number }`
  - `RouteReply.trade?: MarketTrade`
- Produces in `items.ts`:
  - `ITEMS`, `CAPTURE_ITEMS`, and `VALUABLE_ITEMS`
  - `isItemId(v: unknown): v is ItemId`
  - `itemById(id: unknown): ItemDefinition | null`
  - `itemQuantity(inv, id: ItemId)`
  - `ballCount(inv)`
  - `MAX_TRADE_QUANTITY = 99`
  - `tradeTotal(itemId: unknown, side: unknown, quantity: unknown): number | null`
  - `formatMoney(n: number): string` (`'₽1,200'`)
- Produces in `route-rules.ts`:
  - `ROUTE_RULES: RouteRules`
  - `guaranteesSupplies(inventory: InventoryState): boolean`
  - `battlePrize(kind: RouteFind['kind'], rules: StoredRouteRules): number`
  - `captureChance` and `rollCapture`, which accept `rules?: StoredRouteRules`
  - `rollRouteFind`, whose `rules?: RouteRules` and returned `RouteFind` include `money`

- [ ] **Step 1: Write the failing tests.**

In `scripts/route-rules.test.ts`:
- Add `money: 0` to every `InventoryState` literal (`stocked`, every `{ revision: N, stacks: [...] }`).
- Change the imports to the following:

```ts
import { ballCount, formatMoney, isCaptureBallId, isItemId, itemById, itemQuantity, tradeTotal, VALUABLE_ITEMS } from '../src/game/items.js';
import {
  allowanceView, battlePrize, captureChance, guaranteesSupplies, legalChoices, projectAllowance, rollCapture,
  rollRouteFind, ROUTE_RULES, simulateRouteBattle, spendAllowance,
} from '../src/game/route-rules.js';
import type { CaptureBallId, InventoryState, RouteRules, RouteRulesV2 } from '../src/game/route-actions.js';
```

Replace the two pinned item checks, `seeded supply find grants three Poké Balls` (seed `test-0`) and `seeded Great
Ball supply includes its landmark discovery` (seed `test-23`), with forced-category checks that do not depend
on the item table's seed mapping:

```ts
const itemsOnly = (finds: RouteRules['itemFinds']): RouteRules => ({ ...ROUTE_RULES, exploreWildChance: 0, exploreNpcChance: 0, itemFinds: finds });
const zero = { poke: 0, great: 0, harvest: 0, pouch: 0 };
const pokes = rollRouteFind({ ...findBase, seed: 'test-0', kind: 'explore', rules: itemsOnly({ ...zero, poke: 1 }) });
check('a Poké Ball find grants three Poké Balls and no money', pokes.kind === 'item' && same(pokes.items, [{ itemId: 'poke', quantity: 3 }]) && pokes.money === 0 && pokes.foe === null);
const great = rollRouteFind({ ...findBase, seed: 'test-23', kind: 'explore', rules: itemsOnly({ ...zero, great: 1 }) });
check('a Great Ball find includes its independent landmark discovery', great.kind === 'item' && same(great.items, [{ itemId: 'great', quantity: 1 }]) && same(great.landmarks, ['sunflowers']));
const pouch = rollRouteFind({ ...findBase, seed: 'test-5', kind: 'explore', rules: itemsOnly({ ...zero, pouch: 1 }) });
check('a coin pouch pays ₽300 and grants no item', pouch.kind === 'item' && same(pouch.items, []) && pouch.money === 300);
const mushroom = rollRouteFind({ ...findBase, seed: 'test-5', kind: 'explore', rules: { ...itemsOnly({ ...zero, harvest: 1 }), harvest: [{ itemId: 'big-mushroom', weight: 1 }] } });
check('a harvest find grants one valuable from the harvest table', same(mushroom.items, [{ itemId: 'big-mushroom', quantity: 1 }]) && mushroom.money === 0);
const finds = Array.from({ length: 2000 }, (_, i) => rollRouteFind({ ...findBase, seed: `items-${i}`, kind: 'explore', rules: itemsOnly(ROUTE_RULES.itemFinds) }));
const share = (test: (f: (typeof finds)[number]) => boolean) => finds.filter(test).length / finds.length;
check('item finds follow 50/15/20/15 within 3 points', Math.abs(share((f) => f.items[0]?.itemId === 'poke') - 0.5) < 0.03
  && Math.abs(share((f) => f.items[0]?.itemId === 'great') - 0.15) < 0.03
  && Math.abs(share((f) => f.money === 300) - 0.15) < 0.03
  && Math.abs(share((f) => VALUABLE_ITEMS.some((v) => v.id === f.items[0]?.itemId)) - 0.2) < 0.03);
check('Big Mushroom is the rarest harvest good', share((f) => f.items[0]?.itemId === 'big-mushroom') < share((f) => f.items[0]?.itemId === 'tiny-mushroom') && share((f) => f.items[0]?.itemId === 'tiny-mushroom') < share((f) => f.items[0]?.itemId === 'honey'));
check('rules v3 leave wild rolls on the version 2 stream', wild.foe?.mint.dexId === 401 && wild.foe.mint.level === 2);
```

Replace the existing `empty Bag guarantees three Poké Balls…` check with the guard cases:

```ts
const broke: InventoryState = { revision: 2, money: 199, stacks: [] };
const resupply = rollRouteFind({ ...findBase, inventory: broke, seed: 'test-3', kind: 'explore' });
check('no balls and under ₽200 guarantees three Poké Balls with the normal landmark roll', resupply.kind === 'item' && same(resupply.items, [{ itemId: 'poke', quantity: 3 }]) && same(resupply.landmarks, ['sunflowers']));
check('no balls but ₽200 rolls normal Explore categories', rollRouteFind({ ...findBase, inventory: { ...broke, money: 200 }, seed: 'test-3', kind: 'explore' }).kind === 'wild');
check('guarantee helper needs both no balls and under one ball’s price', guaranteesSupplies(broke) && !guaranteesSupplies({ ...broke, money: 200 }) && !guaranteesSupplies({ ...broke, stacks: [{ itemId: 'poke', quantity: 1 }] }));
check('valuables do not count as capture supplies', ballCount({ revision: 1, money: 0, stacks: [{ itemId: 'honey', quantity: 9 }] }) === 0);
```

Add catalog and prize checks after `cosmetic balls are rejected as usable items`:

```ts
check('all five market items are known; cosmetic balls are not', ['poke', 'great', 'honey', 'tiny-mushroom', 'big-mushroom'].every(isItemId) && !isItemId('master') && !isItemId('money'));
check('valuables are not capture balls', !isCaptureBallId('honey') && itemById('honey')?.category === 'valuable');
for (const [itemId, side, quantity, expected] of [
  ['poke', 'buy', 3, 600], ['poke', 'sell', 5, 500], ['great', 'buy', 1, 600], ['great', 'sell', 2, 600],
  ['honey', 'sell', 1, 150], ['tiny-mushroom', 'sell', 2, 500], ['big-mushroom', 'sell', 99, 99_000],
  ['honey', 'buy', 1, null], ['poke', 'buy', 0, null], ['poke', 'buy', 100, null], ['poke', 'buy', 1.5, null],
  ['poke', 'buy', '3', null], ['poke', 'steal', 1, null], ['master', 'buy', 1, null],
] as const) {
  check(`trade total ${itemId} ${side} ×${String(quantity)} is ${String(expected)}`, tradeTotal(itemId, side, quantity) === expected);
}
check('money formats with a ₽ sign and thousands separator', formatMoney(1200) === '₽1,200' && formatMoney(0) === '₽0');
check('wild and trainer wins pay ₽100 and ₽200 under rules v3', battlePrize('wild', ROUTE_RULES) === 100 && battlePrize('trainer', ROUTE_RULES) === 200 && battlePrize('researcher', ROUTE_RULES) === 0);
const legacyRules: RouteRulesV2 = { ...(({ itemFinds: _f, harvest: _h, pouchMoney: _p, wildMoney: _w, trainerMoney: _t, questMoney: _q, ...rest }) => rest)(ROUTE_RULES), version: 2, pokeBundleChance: 0.75 };
check('encounters frozen under rules v2 pay no prize money', battlePrize('wild', legacyRules) === 0 && battlePrize('trainer', legacyRules) === 0);
check('v2 frozen rules still compute catch chances', captureChance({ rare: false, wonBattle: true, ballId: 'great', rules: legacyRules }) === 0.95);
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx tsx scripts/route-rules.test.ts`
Expected: FAIL. The new imports are missing (`isItemId`, `tradeTotal`, `battlePrize`, and so on), or tsx reports
them as undefined.

- [ ] **Step 3: Update the types in `src/game/route-actions.ts`.** Replace the `ItemDefinition`, `InventoryStack`,
  `InventoryState`, `ItemGrant`, and `RouteRules` declarations, and extend `RouteFind`, `RouteEvent`,
  `StoredRouteEvent`, and `RouteReply` as follows:

```ts
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
```

```ts
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
```

In `RouteFind` add `money: number;`. In `RouteEvent`, change `rulesVersion: 2;` to `rulesVersion: 2 | 3;` and add
`/** ₽ this encounter paid; absent on encounters saved before the market. */ money?: number;`. In
`StoredRouteEvent`, change `config: RouteRules;` to `config: StoredRouteRules;`. Add the following, and
`trade?: MarketTrade;` to `RouteReply`:

```ts
export interface MarketTradeInput { requestId: string; itemId: ItemId; side: TradeSide; quantity: number }
export interface MarketTrade { itemId: ItemId; side: TradeSide; quantity: number; total: number }
```

- [ ] **Step 4: Rewrite `src/game/items.ts`.**

```ts
import type { CaptureBallId, InventoryState, ItemDefinition, ItemId, TradeSide, ValuableId } from './route-actions.js';

// Usable inventory is deliberately separate from the cosmetic ball catalog.
// A definition describes an item and its market prices; only a persisted
// inventory stack owns one. The server never reads a price from the client.
export const ITEMS: readonly ItemDefinition[] = [
  {
    id: 'poke', name: 'Poké Ball', plural: 'Poké Balls',
    description: 'One throw at a wild Pokémon. Battle first to improve your chance. Find more in Sunny Meadow or buy them at the Village market.',
    category: 'capture', useContext: 'wild', catchBonus: 0, price: { buy: 200, sell: 100 }, icon: 'sprites/balls/poke.png',
  },
  {
    id: 'great', name: 'Great Ball', plural: 'Great Balls',
    description: 'One throw with a better catch chance. Find these in Sunny Meadow, earn them from the Meadow survey, or buy them at the Village market.',
    category: 'capture', useContext: 'wild', catchBonus: 0.2, price: { buy: 600, sell: 300 }, icon: 'sprites/balls/great.png',
  },
  {
    id: 'honey', name: 'Honey', plural: 'Honey',
    description: 'Sweet honey from the meadow’s wildflowers. The Village market buys it.',
    category: 'valuable', useContext: null, catchBonus: 0, price: { sell: 150 }, icon: 'sprites/items/honey.png',
  },
  {
    id: 'tiny-mushroom', name: 'Tiny Mushroom', plural: 'Tiny Mushrooms',
    description: 'A small, rare mushroom from under the Hilltop Oak. The Village market buys it.',
    category: 'valuable', useContext: null, catchBonus: 0, price: { sell: 250 }, icon: 'sprites/items/tiny-mushroom.png',
  },
  {
    id: 'big-mushroom', name: 'Big Mushroom', plural: 'Big Mushrooms',
    description: 'A large, prized mushroom. The Village market pays well for it.',
    category: 'valuable', useContext: null, catchBonus: 0, price: { sell: 1000 }, icon: 'sprites/items/big-mushroom.png',
  },
];

export const MAX_TRADE_QUANTITY = 99;

export function isCaptureBallId(id: unknown): id is CaptureBallId {
  return id === 'poke' || id === 'great';
}

export function isItemId(id: unknown): id is ItemId {
  return ITEMS.some((item) => item.id === id);
}

export const CAPTURE_ITEMS = ITEMS.filter((item): item is ItemDefinition & { id: CaptureBallId } => isCaptureBallId(item.id));
export const VALUABLE_ITEMS = ITEMS.filter((item): item is ItemDefinition & { id: ValuableId } => item.category === 'valuable');

export function itemById(id: unknown): ItemDefinition | null {
  return ITEMS.find((item) => item.id === id) ?? null;
}

export function itemQuantity(inventory: InventoryState, itemId: ItemId): number {
  const quantity = inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0;
}

/** Only implemented capture items count toward the empty-Bag supply rule. */
export function ballCount(inventory: InventoryState): number {
  return itemQuantity(inventory, 'poke') + itemQuantity(inventory, 'great');
}

/** The ₽ a trade moves, or null when the market does not trade it that way. */
export function tradeTotal(itemId: unknown, side: unknown, quantity: unknown): number | null {
  const item = itemById(itemId);
  if (!item || (side !== 'buy' && side !== 'sell')) return null;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TRADE_QUANTITY) return null;
  const unit = item.price[side as TradeSide];
  if (unit === undefined) return null;
  const total = unit * quantity;
  return Number.isSafeInteger(total) ? total : null;
}

export function formatMoney(amount: number): string {
  return `₽${amount.toLocaleString('en-US')}`;
}
```

- [ ] **Step 5: Update `src/game/route-rules.ts`.**
  - Change the type import to `ActionAllowance, AllowanceRecord, CaptureBallId, FrozenRouteFoe, InventoryState,
    RouteBattle, RouteChoice, RouteFind, RouteNpc, RoutePhase, RouteRules, SearchKind, StoredRouteRules`.
  - Import `ballCount, isCaptureBallId, itemById` as before.
  - Replace the `ROUTE_RULES` fields `version: 2` and `pokeBundleChance: 0.75`, and add the new ones:

```ts
export const ROUTE_RULES: RouteRules = {
  version: 3,
  // ...every existing field except pokeBundleChance, unchanged...
  itemFinds: { poke: 50, great: 15, harvest: 20, pouch: 15 },
  harvest: [
    { itemId: 'honey', weight: 6 },
    { itemId: 'tiny-mushroom', weight: 3 },
    { itemId: 'big-mushroom', weight: 1 },
  ],
  pouchMoney: 300,
  wildMoney: 100,
  trainerMoney: 200,
  questMoney: 500,
};

// Rules version 3 changed only the Explore item table. The stream names stay at
// 2, so wild, NPC, landmark and catch rolls replay identically across versions.
const STREAM = 'route:2';

/** Weighted pick over entries in their listed order. */
function pickWeighted<T extends { weight: number }>(entries: readonly T[], rng: RNG): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

/** Explore's free resupply: no capture balls and not enough ₽ to buy one. */
export function guaranteesSupplies(inventory: InventoryState): boolean {
  return ballCount(inventory) === 0 && inventory.money < (itemById('poke')?.price.buy ?? 0);
}

/** ₽ a won battle pays under the encounter's frozen rules; v2 encounters pay nothing. */
export function battlePrize(kind: RouteFind['kind'], rules: StoredRouteRules): number {
  if (rules.version !== 3) return 0;
  return kind === 'wild' ? rules.wildMoney : kind === 'trainer' ? rules.trainerMoney : 0;
}
```

In `rollRouteFind`:
- Use `` new RNG(`${STREAM}:${seed}:find`) `` and `` new RNG(`${STREAM}:${seed}:landmark`) ``.
- Set `const guaranteedSupplies = kind === 'explore' && guaranteesSupplies(inventory);`.
- Add `money: 0` to the researcher, trainer, and wild returns.
- Replace the `primary === 'item'` branch with this:

```ts
  if (primary === 'item') {
    const found = (items: RouteFind['items'], money = 0): RouteFind => ({ kind: 'item', foe: null, npc: null, landmarks, items, money });
    if (guaranteedSupplies) return found([{ itemId: 'poke', quantity: rules.pokeBundleQuantity }]);
    const { find } = pickWeighted([
      { find: 'poke', weight: rules.itemFinds.poke },
      { find: 'great', weight: rules.itemFinds.great },
      { find: 'harvest', weight: rules.itemFinds.harvest },
      { find: 'pouch', weight: rules.itemFinds.pouch },
    ] as const, rng);
    if (find === 'poke') return found([{ itemId: 'poke', quantity: rules.pokeBundleQuantity }]);
    if (find === 'great') return found([{ itemId: 'great', quantity: rules.greatBundleQuantity }]);
    if (find === 'harvest') return found([{ itemId: pickWeighted(rules.harvest, rng).itemId, quantity: 1 }]);
    return found([], rules.pouchMoney);
  }
```

Change the `captureChance` and `rollCapture` parameters to `rules?: StoredRouteRules` (default `ROUTE_RULES`), and
use `` new RNG(`${STREAM}:${seed}:catch`) `` in `rollCapture`. The `projectAllowance`, `allowanceView`, and
`spendAllowance` signatures stay `RouteRules`.

- [ ] **Step 6: Make the compile-only fixes so `tsc` stays green.**
  - `api/_route-actions.ts`:
    - Change the `stored()` check to
      ``if (!value || (value.config?.version !== 2 && value.config?.version !== 3) || value.event?.id !== row.id)``.
    - Make `inventoryState` return `money: 0` for now, and filter stacks with `isItemId` (import it next to
      `isCaptureBallId`).
    - In `searchRoute`, set `rulesVersion: ROUTE_RULES.version`.
  - `scripts/route-balance.ts`: add `money: 0` to its `inventory` literal.
  - `src/components/BagScreen.tsx`: iterate `CAPTURE_ITEMS` instead of `ITEMS`. Task 7 adds valuables.
  - `src/components/world/route-copy.ts`: build the name with
    `const def = itemById(item.itemId); const name = quantity === 1 ? def?.name ?? item.itemId : def?.plural ?? item.itemId;`.
  - `scripts/route-db.test.ts`: add `money: 0` to the inventory literal in `forceKind`.
  - `scripts/route-client.test.ts`: add `money: 0` to every `inventory` literal.

- [ ] **Step 7: Run the tests and type checks.**

Run: `npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-client.test.ts && npx tsc -b && npx tsc -p tsconfig.api.json`
Expected: 0 failed in both scripts, and no type errors. The route balance gate also passes, because wild and NPC
streams are unchanged.

- [ ] **Step 8: Commit.**

```bash
git add src/game/route-actions.ts src/game/items.ts src/game/route-rules.ts api/_route-actions.ts scripts/route-balance.ts scripts/route-rules.test.ts scripts/route-db.test.ts scripts/route-client.test.ts src/components/BagScreen.tsx src/components/world/route-copy.ts
git commit -m "Add market prices, valuables and route rules v3 to the shared contract"
```

---

### Task 2: Money on the server (column, helper, income)

**Files:**
- Modify: `api/_db.ts` (`COLUMN_ADDS`, `RouteAccountRow`, `readRouteAccount`, and a new `changeMoney`)
- Modify: `api/_route-actions.ts` (`inventoryState`, `searchRoute`, `chooseRoute`, `claimRouteQuest`)
- Test: `scripts/route-db.test.ts`

**Interfaces:**
- Consumes: `battlePrize`, `ROUTE_RULES.questMoney`, and `RouteFind.money` (Task 1).
- Produces: `changeMoney(db: Executor, uid: string, delta: number): Promise<boolean>`, which is conditional,
  never clamps, and bumps `inventory_revision`. Also `RouteAccountRow.money: number`. `RouteState.inventory.money`
  is now real.

- [ ] **Step 1: Write the failing tests** in `scripts/route-db.test.ts`.
  - Import `changeMoney` from `../api/_db.js`.
  - Add a helper next to `rejects`:

```ts
const moneyOf = async (db: Db, uid: string) => (await loadRouteState(db, uid, T)).inventory.money;
```

  - Right after activation (`activation gives 12 actions…`), add:

```ts
  check('activation starts with no money', a.state.inventory.money === 0);
```

  - Extend the trainer check. Replace `check('trainer battle pays once and closes encounter', …)` with:

```ts
  const trainedRetry = await chooseRoute(db, 'u1', { requestId: 'trainer-battle', eventId: trainer.event.id, expectedRevision: 0, choice: 'battle' }, T);
  check('trainer battle pays EXP and ₽200 once and closes encounter', trained.event?.outcome === 'won' && trained.state.activeEvent === null && trained.event.members[0].expGained === 12 && trained.event.money === 200 && trained.state.inventory.money === trainedRetry.state.inventory.money);
```

  Change the `trained` call's `requestId: rid()` to `requestId: 'trainer-battle'`, so the retry above replays it.

  - Wrap the quest check. Read money before the raced claims, then assert:

```ts
  const moneyBeforeQuest = await moneyOf(db, 'u1');
  // ...existing Promise.all claims...
  check('the survey pays ₽500 exactly once', await moneyOf(db, 'u1') === moneyBeforeQuest + 500);
```

  - Add a wild-win case and a leave case after the trainer case:

```ts
  const wildWin = await forceKind(db, 'u1', (await start(db, 'u1')).event!, 'wild');
  const beforeWild = await moneyOf(db, 'u1');
  const won = await chooseRoute(db, 'u1', { requestId: 'wild-win', eventId: wildWin.event.id, expectedRevision: 0, choice: 'battle' }, T);
  await chooseRoute(db, 'u1', { requestId: 'wild-win', eventId: wildWin.event.id, expectedRevision: 0, choice: 'battle' }, T);
  check('a wild win pays ₽100 once across retries', won.event?.outcome === 'won' && won.event.money === 100 && await moneyOf(db, 'u1') === beforeWild + 100);
  const before = await moneyOf(db, 'u1');
  await chooseRoute(db, 'u1', { requestId: rid(), eventId: won.event!.id, expectedRevision: won.event!.revision, choice: 'leave' }, T);
  check('leaving after a win pays nothing more', await moneyOf(db, 'u1') === before);
  const legacy = await forceKind(db, 'u1', (await start(db, 'u1')).event!, 'wild');
  const legacyRow = (await readRouteEvent(db, 'u1', legacy.event.id))!;
  const { itemFinds: _f, harvest: _h, pouchMoney: _p, wildMoney: _w, trainerMoney: _t, questMoney: _q, ...v2 } = legacy.config as RouteRules;
  const legacyData = { ...legacy, config: { ...v2, version: 2 as const, pokeBundleChance: 0.75 }, event: { ...legacy.event, rulesVersion: 2 as const } };
  delete (legacyData.event as Partial<RouteEvent>).money;
  await updateRouteEvent(db, 'u1', { ...legacyRow, data: legacyData }, legacyRow.revision);
  const beforeLegacy = await moneyOf(db, 'u1');
  const legacyWon = await chooseRoute(db, 'u1', { requestId: rid(), eventId: legacy.event.id, expectedRevision: 0, choice: 'battle' }, T);
  check('an encounter frozen under rules v2 still settles and pays no ₽', legacyWon.event?.outcome === 'won' && await moneyOf(db, 'u1') === beforeLegacy);
  if (legacyWon.event?.phase !== 'resolved') await leave(db, 'u1', legacyWon.event!);
```

  Import the `RouteRules` type. Party `u1` is level 30 (`onboardUser(db, 'u1', 6, 30)`), so it wins against level
  2–5 wilds. If a fixture ever loses, `forceKind` must pick a seed that wins: loop seeds until
  `simulateRouteBattle` reports a win, the same way `forceCatch` loops capture seeds.

  - Add helper checks in the failure section:

```ts
  check('money cannot go negative', !await changeMoney(db, 'failure', -1) && await moneyOf(db, 'failure') === 0);
  const revBefore = (await loadRouteState(db, 'failure', T)).inventory.revision;
  check('a money credit bumps the inventory revision', await changeMoney(db, 'failure', 50) && (await loadRouteState(db, 'failure', T)).inventory.revision === revBefore + 1 && await moneyOf(db, 'failure') === 50);
  await changeMoney(db, 'failure', -50);
```

  - Before the `empty Bag Explore guarantees persisted three Poké Balls` search, add
    `await db.execute({ sql: 'update route_accounts set money = 0 where user_id = ?', args: ['u1'] });` so the
    guard's money condition holds.

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx tsx scripts/route-db.test.ts`
Expected: FAIL. `changeMoney` is not exported, `money` reads 0, and the trainer, wild, and quest money checks fail.

- [ ] **Step 3: Update `api/_db.ts`.**
  - Append to `COLUMN_ADDS`:

```ts
  // Pokédollars for the Village market; always changed through changeMoney.
  'alter table route_accounts add column money integer not null default 0 check (money >= 0)',
```

  - Add `money: number;` to `RouteAccountRow`, and `money: Number(r.money) || 0,` to the `readRouteAccount` mapper.
  - Add after `changeInventory`:

```ts
/** Shared ₽ path. A debit that would go below zero, or a credit past the safe range, changes nothing. */
export async function changeMoney(db: Executor, uid: string, delta: number): Promise<boolean> {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Invalid money change');
  const rs = await db.execute({
    sql: `update route_accounts set money = money + ?, inventory_revision = inventory_revision + 1
          where user_id = ? and money + ? >= 0 and money + ? <= 9007199254740991`,
    args: [delta, uid, delta, delta],
  });
  return rs.rowsAffected === 1;
}
```

- [ ] **Step 4: Update `api/_route-actions.ts`.**
  - Import `changeMoney`, plus `battlePrize` from route-rules.
  - `inventoryState`: `money: account?.money ?? 0`.
  - `searchRoute`: after the item grants loop, add
    `if (find.money > 0) await changeMoney(tx, uid, find.money);`, and add `money: find.money` to the event literal.
  - `chooseRoute`: inside `if (e.battle.won) { ... }` after the growth writes, add:

```ts
        const prize = battlePrize(e.kind, data.config);
        if (prize > 0 && !await changeMoney(tx, uid, prize)) throw new Error('Balance overflow');
        e.money = (e.money ?? 0) + prize;
```

  - `claimRouteQuest`: after `changeInventory(... questGreatBalls)`, add
    `if (!await changeMoney(tx, uid, ROUTE_RULES.questMoney)) throw new Error('Balance overflow');`.

- [ ] **Step 5: Run the tests and type checks.**

Run: `npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsc -p tsconfig.api.json`
Expected: 0 failed, and no type errors.

- [ ] **Step 6: Commit.**

```bash
git add api/_db.ts api/_route-actions.ts scripts/route-db.test.ts
git commit -m "Pay Pokédollars for battle wins, coin pouches and the Meadow survey"
```

---

### Task 3: Market trades on the server

**Files:**
- Modify: `api/_route-actions.ts` (`writeCommand` return shape, `parseMarketTrade`, `tradeMarket`)
- Modify: `api/world/[action].ts` (dispatch `market-trade`)
- Test: `scripts/route-db.test.ts`, `scripts/route-api.test.ts`

**Interfaces:**
- Consumes: `tradeTotal`, `isItemId`, `formatMoney`, `itemById`, `changeMoney`, `changeInventory`, and
  `requireActivated`.
- Produces:
  - `parseMarketTrade(body: Record<string, unknown>): MarketTradeInput | null`
  - `tradeMarket(db: Db, uid: string, input: MarketTradeInput, now: number): Promise<RouteReply>`, whose
    `reply.trade` is the `MarketTrade`
  - `POST /api/world/market-trade`

- [ ] **Step 1: Write the failing DB tests.** Append a `[market]` section before the `[consistent state snapshot]`
  section of `scripts/route-db.test.ts`, and import `tradeMarket`.

```ts
  console.log('[market]');
  await onboardUser(db, 'shopper', 6, 30);
  await rejects('an unactivated account cannot trade', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'poke', side: 'sell', quantity: 1 }, T), 409);
  await activateRoute(db, 'shopper', 'activate', T);
  const shop = () => loadRouteState(db, 'shopper', T);
  const have = async (id: string) => (await shop()).inventory.stacks.find((s) => s.itemId === id)?.quantity ?? 0;
  await rejects('buying with too little money is a conflict', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'poke', side: 'buy', quantity: 1 }, T), 409);
  check('a refused purchase changes nothing', (await shop()).inventory.money === 0 && await have('poke') === 20);
  const revisionBeforeSale = (await shop()).inventory.revision;
  const sale = { requestId: 'sell-five', itemId: 'poke' as const, side: 'sell' as const, quantity: 5 };
  const sold = await tradeMarket(db, 'shopper', sale, T);
  check('selling 5 Poké Balls pays ₽500 and removes them', eq(sold.trade, { itemId: 'poke', side: 'sell', quantity: 5, total: 500 }) && sold.state.inventory.money === 500 && await have('poke') === 15);
  check('a trade increases the inventory revision', sold.state.inventory.revision > revisionBeforeSale);
  const resold = await tradeMarket(db, 'shopper', sale, T + 1);
  check('a retried sale replays its receipt without paying twice', resold.replayed === true && eq(resold.trade, sold.trade) && resold.state.inventory.money === 500 && await have('poke') === 15);
  await rejects('a reused request ID with a different trade conflicts', tradeMarket(db, 'shopper', { ...sale, quantity: 4 }, T), 409);
  const bought = await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'poke', side: 'buy', quantity: 2 }, T);
  check('buying 2 Poké Balls costs ₽400', bought.trade?.total === 400 && bought.state.inventory.money === 100 && await have('poke') === 17);
  try { await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'great', side: 'buy', quantity: 1 }, T); check('short purchase names the shortfall', false); }
  catch (err) { check('short purchase names the shortfall', err instanceof RouteError && err.status === 409 && err.message === 'You need ₽500 more.'); }
  await rejects('selling a valuable you lack is a conflict', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'honey', side: 'sell', quantity: 1 }, T), 409);
  await rejects('valuables cannot be bought', tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'honey', side: 'buy', quantity: 1 }, T), 400);
  await changeInventory(db, 'shopper', 'big-mushroom', 1);
  const mushroom = await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'big-mushroom', side: 'sell', quantity: 1 }, T);
  check('a Big Mushroom sells for ₽1,000 and leaves an empty stack', mushroom.state.inventory.money === 1100 && await have('big-mushroom') === 0);
  // Review focus 2: two tabs, funds for one purchase.
  await db.execute({ sql: 'update route_accounts set money = 200 where user_id = ?', args: ['shopper'] });
  const raced = await Promise.allSettled([
    tradeMarket(db, 'shopper', { requestId: 'tab-a', itemId: 'poke', side: 'buy', quantity: 1 }, T),
    tradeMarket(db, 'shopper', { requestId: 'tab-b', itemId: 'poke', side: 'buy', quantity: 1 }, T),
  ]);
  check('racing purchases with funds for one buy exactly one ball', raced.filter((r) => r.status === 'fulfilled').length === 1 && (await shop()).inventory.money === 0 && await have('poke') === 18);
  // Review focus 3: buy mid-encounter, then throw the bought ball.
  await db.execute({ sql: 'update route_accounts set money = 600 where user_id = ?', args: ['shopper'] });
  const open = (await start(db, 'shopper')).event!;
  const midTrade = await tradeMarket(db, 'shopper', { requestId: rid(), itemId: 'great', side: 'buy', quantity: 1 }, T);
  check('a trade leaves the open encounter untouched', midTrade.state.activeEvent?.id === open.id && midTrade.state.activeEvent.revision === open.revision);
  const greatThrow = await chooseRoute(db, 'shopper', { requestId: rid(), eventId: open.id, expectedRevision: open.revision, choice: 'catch', ballId: 'great' }, T);
  check('the bought Great Ball can be thrown', greatThrow.event?.catch?.ballId === 'great' && await have('great') === 0);
```

If `start()` hits the trainer check or Box limit for `shopper`, use `forceKind(..., 'wild')` on the started event
first. `shopper` has 20 balls and an empty Box, so a plain wild search works.

- [ ] **Step 2: Write the failing API tests** in `scripts/route-api.test.ts`.
  - Add `'market-trade'` to the login/method loop array.
  - After the `unaccepted quest does not grant rewards` check, add:

```ts
  for (const [label, body] of [
    ['unknown item', { requestId: 'm1', itemId: 'master', side: 'buy', quantity: 1 }],
    ['buying a valuable', { requestId: 'm2', itemId: 'honey', side: 'buy', quantity: 1 }],
    ['quantity 0', { requestId: 'm3', itemId: 'poke', side: 'sell', quantity: 0 }],
    ['quantity 100', { requestId: 'm4', itemId: 'poke', side: 'sell', quantity: 100 }],
    ['fractional quantity', { requestId: 'm5', itemId: 'poke', side: 'sell', quantity: 1.5 }],
    ['string quantity', { requestId: 'm6', itemId: 'poke', side: 'sell', quantity: '3' }],
    ['unknown side', { requestId: 'm7', itemId: 'poke', side: 'steal', quantity: 1 }],
    ['missing request ID', { itemId: 'poke', side: 'sell', quantity: 1 }],
  ] as const) {
    const r = await call('market-trade', body);
    check(`market rejects ${label} with a sentence`, r.status === 400 && r.body.ok === false && typeof r.body.error === 'string');
  }
  const sale = await call('market-trade', { requestId: 'sell-one', itemId: 'poke', side: 'sell', quantity: 1 });
  const saleReply = sale.body as unknown as RouteReply;
  check('a market sale returns the trade and the new balance', sale.status === 200 && JSON.stringify(saleReply.trade) === JSON.stringify({ itemId: 'poke', side: 'sell', quantity: 1, total: 100 }) && saleReply.state.inventory.money === 100 && sale.headers['cache-control'] === 'no-store');
  const short = await call('market-trade', { requestId: 'buy-great', itemId: 'great', side: 'buy', quantity: 1 });
  check('a short purchase is a 409 with recovery state', short.status === 409 && short.body.error === 'You need ₽500 more.' && (short.body.state as RouteState).inventory.money === 100);
```

- [ ] **Step 3: Run the tests to verify they fail.**

Run: `npx tsx scripts/route-db.test.ts; npx tsx scripts/route-api.test.ts`
Expected: FAIL. `tradeMarket` is not exported, and `market-trade` returns 404.

- [ ] **Step 4: Change `writeCommand`'s work result** in `api/_route-actions.ts` so a command can return an event or a
  trade:

```ts
type CommandResult = Pick<RouteReply, 'event' | 'trade'>;
async function writeCommand(
  db: Db, uid: string, requestId: string, payload: string, now: number,
  work: (tx: Executor) => Promise<CommandResult | void>,
): Promise<RouteReply> {
  // ...unchanged replay branch...
    const result = await work(tx);
    await advanceRouteRevision(tx, uid);
    const reply: RouteReply = { state: await loadRouteStateInTx(tx, uid, now), box: await readOwnedByUser(tx, uid), ...result };
  // ...unchanged...
}
```

Update the callers: `searchRoute` ends `return { event };`, and `chooseRoute` ends `return { event: e };`.
`activateRoute` and `claimRouteQuest` return nothing, as before.

- [ ] **Step 5: Add parsing and the trade** to `api/_route-actions.ts`. Import `formatMoney, isItemId, itemById, tradeTotal`
  from items, and the `MarketTradeInput` type.

```ts
export function parseMarketTrade(body: Record<string, unknown>): MarketTradeInput | null {
  if (!validId(body.requestId) || !isItemId(body.itemId) || (body.side !== 'buy' && body.side !== 'sell')) return null;
  if (tradeTotal(body.itemId, body.side, body.quantity) === null) return null;
  return { requestId: body.requestId, itemId: body.itemId, side: body.side, quantity: body.quantity as number };
}

/** One market trade: money and stock move together or not at all; a retry replays the receipt. */
export async function tradeMarket(db: Db, uid: string, input: MarketTradeInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['market-trade', input.itemId, input.side, input.quantity]), now, async (tx) => {
    const account = await requireActivated(tx, uid);
    const total = tradeTotal(input.itemId, input.side, input.quantity);
    const item = itemById(input.itemId);
    if (total === null || !item) return fail(400, 'The market doesn’t trade that item that way.');
    if (input.side === 'buy') {
      if (!await changeMoney(tx, uid, -total)) fail(409, `You need ${formatMoney(total - account.money)} more.`);
      await changeInventory(tx, uid, input.itemId, input.quantity);
    } else {
      if (!await changeInventory(tx, uid, input.itemId, -input.quantity)) fail(409, `You don’t have ${input.quantity} ${input.quantity === 1 ? item.name : item.plural} to sell.`);
      if (!await changeMoney(tx, uid, total)) throw new Error('Balance overflow');
    }
    return { trade: { itemId: input.itemId, side: input.side, quantity: input.quantity, total } };
  });
}
```

- [ ] **Step 6: Dispatch the action** in `api/world/[action].ts`.
  - Import `parseMarketTrade` and `tradeMarket`.
  - Add `'market-trade'` to the `mutate` action list.
  - Add this branch before the final `else`:

```ts
    } else if (action === 'market-trade') {
      const input = parseMarketTrade(body);
      if (!input) return res.status(400).json({ ok: false, error: 'Choose an item the market trades and a quantity from 1 to 99.' });
      out = await tradeMarket(g.db, g.uid, input, now);
```

  `scripts/dev-api.ts` needs no change, because `world` is already a routed area.

- [ ] **Step 7: Run the tests and type checks.**

Run: `npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/world-api.test.ts && npx tsc -p tsconfig.api.json`
Expected: 0 failed, and no type errors.

- [ ] **Step 8: Commit.**

```bash
git add api/_route-actions.ts api/world/[action].ts scripts/route-db.test.ts scripts/route-api.test.ts
git commit -m "Add the market-trade action with receipts and atomic money and stock moves"
```

---

### Task 4: Client contract (fetch helper, validation, copy)

**Files:**
- Modify: `src/game/route-actions-client.ts`
- Modify: `src/components/world/route-copy.ts`
- Test: `scripts/route-client.test.ts`

**Interfaces:**
- Consumes: `MarketTradeInput`, `MarketTrade`, `isItemId`, and `formatMoney`.
- Produces:
  - A `RouteCommand` member `{ operation: 'market-trade'; input: MarketTradeInput }`
  - `tradeMarket(input: MarketTradeInput): Promise<RouteClientReply>`
  - `RouteClientReply` success carries `trade?: MarketTrade`
  - In `route-copy.ts`: `moneyChangeText(event: Pick<RouteEvent, 'kind' | 'money'>): string | null` and
    `tradeText(trade: MarketTrade): string`

- [ ] **Step 1: Write the failing tests** in `scripts/route-client.test.ts`.
  - Import `tradeMarket` from the client, and `moneyChangeText, tradeText` from route-copy.
  - Append:

```ts
const stocked: RouteState = { ...state, inventory: { revision: 4, money: 1100, stacks: [{ itemId: 'honey', quantity: 2 }, { itemId: 'poke', quantity: 20 }] } };
reply = json(200, { ok: true, state: stocked, trade: { itemId: 'poke', side: 'buy', quantity: 3, total: 600 } });
const trade = { requestId: 'trade-one', itemId: 'poke' as const, side: 'buy' as const, quantity: 3 };
const traded = await tradeMarket(trade);
check('a trade posts to market-trade with credentials', lastUrl === '/api/world/market-trade' && lastInit?.method === 'POST' && lastInit.credentials === 'include' && lastInit.body === JSON.stringify(trade));
check('a trade reply carries the receipt, valuables and balance', traded.ok && traded.trade?.total === 600 && traded.state.inventory.money === 1100 && traded.state.inventory.stacks[0].itemId === 'honey');
reply = json(200, { ok: true, state: { ...stocked, inventory: { ...stocked.inventory, money: -5 } } });
check('a negative balance is an incomplete reply, not a state', !(await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...stocked, inventory: { ...stocked.inventory, stacks: [{ itemId: 'master', quantity: 1 }] } } });
check('an unknown item stack is an incomplete reply', !(await fetchRouteState()).ok);
const afterTrade = { ...stocked, revision: 6, inventory: { ...stocked.inventory, revision: 6, money: 500 } };
check('a late reply cannot rewind the balance after a trade', reconcileRouteState(afterTrade, stocked) === afterTrade);
const tradeCommand: RouteCommand = { operation: 'market-trade', input: trade };
savePendingRouteCommand('trainer-m', tradeCommand);
check('a pending trade survives a reload with its request ID', JSON.stringify(readPendingRouteCommand('trainer-m')) === JSON.stringify(tradeCommand));
clearPendingRouteCommand('trainer-m');
check('valuables use their plural', inventoryChangeText({ itemId: 'tiny-mushroom', quantity: 2 }) === '+2 Tiny Mushrooms added to your Bag.' && inventoryChangeText({ itemId: 'honey', quantity: 1 }) === '+1 Honey added to your Bag.');
check('battle and pouch money read as earnings', moneyChangeText({ kind: 'wild', money: 100 }) === '+₽100 prize money.' && moneyChangeText({ kind: 'item', money: 300 }) === 'Found a coin pouch: +₽300.' && moneyChangeText({ kind: 'wild', money: 0 }) === null && moneyChangeText({ kind: 'wild' }) === null);
check('trade receipts read in the player’s words', tradeText({ itemId: 'poke', side: 'buy', quantity: 3, total: 600 }) === 'Bought 3 Poké Balls for ₽600.' && tradeText({ itemId: 'honey', side: 'sell', quantity: 1, total: 150 }) === 'Sold 1 Honey for ₽150.');
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx tsx scripts/route-client.test.ts`
Expected: FAIL. `tradeMarket` is not exported, and stacks of `honey` are rejected by `isRouteState`.

- [ ] **Step 3: Update `src/game/route-actions-client.ts`.**
  - Import `isItemId` from `./items.js`, and the `MarketTrade` and `MarketTradeInput` types.
  - In `isRouteState`, replace the stacks check with:

```ts
  if (!Number.isSafeInteger(v.inventory.money) || Number(v.inventory.money) < 0) return false;
  if (!v.inventory.stacks.every((stack) => isObject(stack) && isItemId(stack.itemId) && Number.isSafeInteger(stack.quantity) && Number(stack.quantity) >= 0)) return false;
```

  - Add `| { operation: 'market-trade'; input: MarketTradeInput }` to `RouteCommand`.
  - Change `RouteClientReply` to `({ ok: true } & RouteReply) | RouteClientError`; `RouteReply` already has
    `trade?`.
  - In `request`'s success object, add
    `...(isObject(data.trade) ? { trade: data.trade as unknown as MarketTrade } : {}),`.
  - Add `export const tradeMarket = (input: MarketTradeInput): Promise<RouteClientReply> => request('market-trade', input);`.
  - Add `'market-trade'` to the operation list in `readPendingRouteCommand`.

- [ ] **Step 4: Add the copy helpers** to `src/components/world/route-copy.ts`.

```ts
import { formatMoney, itemById } from '../../game/items.js';
import type { ItemGrant, MarketTrade, RouteEvent } from '../../game/route-actions.js';

/** ₽ an encounter paid, or null when it paid nothing. */
export function moneyChangeText(event: Pick<RouteEvent, 'kind' | 'money'>): string | null {
  const amount = event.money ?? 0;
  if (amount <= 0) return null;
  return event.kind === 'item' ? `Found a coin pouch: +${formatMoney(amount)}.` : `+${formatMoney(amount)} prize money.`;
}

export function tradeText(trade: MarketTrade): string {
  const item = itemById(trade.itemId);
  const name = trade.quantity === 1 ? item?.name ?? trade.itemId : item?.plural ?? trade.itemId;
  return `${trade.side === 'buy' ? 'Bought' : 'Sold'} ${trade.quantity} ${name} for ${formatMoney(trade.total)}.`;
}
```

- [ ] **Step 5: Run the tests and type checks.**

Run: `npx tsx scripts/route-client.test.ts && npx tsc -b`
Expected: 0 failed, and no type errors.

- [ ] **Step 6: Commit.**

```bash
git add src/game/route-actions-client.ts src/components/world/route-copy.ts scripts/route-client.test.ts
git commit -m "Add the market trade command, money validation and receipt copy to the client"
```

---

### Task 5: Art and the town link

**Files:**
- Create: `public/sprites/items/honey.png`, `public/sprites/items/tiny-mushroom.png`, `public/sprites/items/big-mushroom.png`
- Modify: `src/game/town.ts` (the `TownLink` type and the market's `link`)
- Modify: `src/components/world/TownView.tsx` (`ACTION_LABEL`, `TownService`, `act`, and a new `onMarket` prop)
- Modify: `src/components/world/RouteScreen.tsx` (pass `onMarket`; Task 6 adds the page)
- Test: `scripts/town.test.ts`

**Interfaces:**
- Produces: `TownLink` includes `'market'`, and `TownView` gains a prop `onMarket: () => void`.
  `TownService` stays `'party' | 'dex' | 'box'`, so `App.openScreen` is untouched.

- [ ] **Step 1: Write the failing test.** In `scripts/town.test.ts`:
  - Change `SCREENS` to `new Set<string>(['party', 'dex', 'box', 'market'])`.
  - Add:

```ts
check('the Village market opens the market', townDestinationById('market')?.link === 'market');
```

  Import `townDestinationById` if it isn't imported yet.

- [ ] **Step 2: Run it to verify it fails.**

Run: `npx tsx scripts/town.test.ts`
Expected: FAIL on `the Village market opens the market`.

- [ ] **Step 3: Fetch the icons.** They are PokeAPI item art, 30×30 PNG, the same family the game already ships for
  items.

```bash
for n in honey tiny-mushroom big-mushroom; do curl -fsSL -o public/sprites/items/$n.png https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/$n.png; done
file public/sprites/items/honey.png public/sprites/items/tiny-mushroom.png public/sprites/items/big-mushroom.png
```

Expected: each file reports `PNG image data, 30 x 30`.

- [ ] **Step 4: Update the town data and view.**
  - `src/game/town.ts`: `export type TownLink = 'party' | 'dex' | 'box' | 'market' | 'r1';`. Set the market's
    `link: 'market'`. Update the `link` doc comment to name the market.
  - `src/components/world/TownView.tsx`:
    - `export type TownService = Exclude<TownLink, PlayableId | 'market'>;`
    - `export type TownRoad = Exclude<TownLink, TownService | 'market'>;`
    - Add `market: 'Enter the market',` to `ACTION_LABEL`.
    - Add the prop `onMarket: () => void;`, documented as "The Village market: the shop screen."
    - Make `act` handle `if (to === 'market') onMarket(); else if (to === 'party' || to === 'dex' || to === 'box') onOpen(to); else onWalk(to);`.
  - `src/components/world/RouteScreen.tsx`: pass `onMarket={() => {}}` to `TownView` for now. Task 6 wires it.

- [ ] **Step 5: Run the test and the type check.**

Run: `npx tsx scripts/town.test.ts && npx tsc -b`
Expected: 0 failed, and no type errors.

- [ ] **Step 6: Commit.**

```bash
git add public/sprites/items/honey.png public/sprites/items/tiny-mushroom.png public/sprites/items/big-mushroom.png src/game/town.ts src/components/world/TownView.tsx src/components/world/RouteScreen.tsx scripts/town.test.ts
git commit -m "Link the Village market and add harvest item art"
```

---

### Task 6: Market screen

**Sync point first:** run `git merge development` on branch `market`. Resolve conflicts in favor of
`development`'s structure, then re-run Tasks 1–5's test commands. If the Bag or route UI moved (for example into
`RouteBagDialog.tsx`), apply Tasks 6–7's behavior to the components that exist then.

**Files:**
- Create: `src/components/world/MarketScreen.tsx`
- Modify: `src/components/world/RouteScreen.tsx` (`Page` gains `'market'`, plus the header, the `submit`
  success branch, and rendering)

**Interfaces:**
- Consumes: `CAPTURE_ITEMS`, `VALUABLE_ITEMS`, `ITEMS`, `itemQuantity`, `formatMoney`, `MAX_TRADE_QUANTITY`,
  `tradeText`, and `RouteCommand` (`market-trade`).
- Produces:
  `MarketScreen({ state, busy, onTrade }: { state: RouteState; busy: boolean; onTrade: (trade: Omit<MarketTradeInput, 'requestId'>) => void })`

- [ ] **Step 1: Create `src/components/world/MarketScreen.tsx`.**

```tsx
import { useState } from 'react';
import { formatMoney, ITEMS, itemQuantity, MAX_TRADE_QUANTITY } from '../../game/items';
import type { ItemDefinition, MarketTradeInput, RouteState, TradeSide } from '../../game/route-actions';
import { PixelSprite } from '../ui/PixelSprite';

// The Village market: buy capture balls, sell balls and harvest goods. Prices
// come from the shared catalog; the server re-prices every trade and owns the
// balance, so this screen only proposes a trade and renders the reply.

const ASSET = import.meta.env.BASE_URL;

function TradeRow({ item, side, state, busy, onTrade }: {
  item: ItemDefinition; side: TradeSide; state: RouteState; busy: boolean;
  onTrade: (trade: Omit<MarketTradeInput, 'requestId'>) => void;
}) {
  const unit = item.price[side] ?? 0;
  const owned = itemQuantity(state.inventory, item.id);
  const max = Math.min(MAX_TRADE_QUANTITY, side === 'buy' ? Math.floor(state.inventory.money / unit) : owned);
  const [wanted, setWanted] = useState(1);
  const quantity = Math.max(1, Math.min(wanted, Math.max(max, 1)));
  const reason = max > 0 ? null : side === 'buy' ? `You need ${formatMoney(unit - state.inventory.money)} more` : 'None to sell';
  return <li className="rounded-[3px] bg-slot p-3">
    <div className="flex items-center gap-3">
      <PixelSprite src={`${ASSET}${item.icon}`} size={item.category === 'capture' ? 48 : 30} alt="" />
      <div className="min-w-0 flex-1">
        <h3 className="text-base">{item.name}</h3>
        <p className="text-sm text-ink-dim">{formatMoney(unit)} each · {owned} owned</p>
      </div>
    </div>
    <div className="mt-3 flex items-center gap-2">
      <button type="button" aria-label={`One fewer ${item.name}`} disabled={busy || quantity <= 1} onClick={() => setWanted(quantity - 1)} className="ui-button ui-focus min-h-11 min-w-11 font-label text-[11px]">−</button>
      <output aria-live="polite" aria-label={`Quantity of ${item.name}`} className="min-w-8 text-center font-label text-[11px]">{quantity}</output>
      <button type="button" aria-label={`One more ${item.name}`} disabled={busy || quantity >= max} onClick={() => setWanted(quantity + 1)} className="ui-button ui-focus min-h-11 min-w-11 font-label text-[11px]">+</button>
      <button type="button" disabled={busy || reason !== null} onClick={() => onTrade({ itemId: item.id, side, quantity })} className="ui-button-primary ui-focus min-h-11 flex-1 px-2 font-label text-[10px] uppercase">
        {reason ?? `${side === 'buy' ? 'Buy' : 'Sell'} ×${quantity} · ${formatMoney(unit * quantity)}`}
      </button>
    </div>
  </li>;
}

export function MarketScreen({ state, busy, onTrade }: {
  state: RouteState; busy: boolean; onTrade: (trade: Omit<MarketTradeInput, 'requestId'>) => void;
}) {
  const [side, setSide] = useState<TradeSide>('buy');
  const forSale = ITEMS.filter((item) => item.price.buy !== undefined);
  const sellable = ITEMS.filter((item) => item.price.sell !== undefined && itemQuantity(state.inventory, item.id) > 0);
  const rows = side === 'buy' ? forSale : sellable;
  return <section className="ui-window m-2 p-3" aria-label="Village market">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-label text-[11px] uppercase text-info">Village market</h2>
      <p className="font-label text-[11px] uppercase text-accent" aria-label={`Your money: ${formatMoney(state.inventory.money)}`}>{formatMoney(state.inventory.money)}</p>
    </div>
    <div role="tablist" aria-label="Market" className="mt-3 grid grid-cols-2 gap-2">
      {(['buy', 'sell'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={side === tab} onClick={() => setSide(tab)} className={`ui-button ui-focus min-h-11 font-label text-[10px] uppercase ${side === tab ? 'text-accent' : ''}`}>{side === tab ? '▶ ' : ''}{tab === 'buy' ? 'Buy' : 'Sell'}</button>)}
    </div>
    <p className="mt-3 text-sm text-ink-dim">{side === 'buy' ? 'Capture balls for your next trip to Sunny Meadow.' : 'The market buys balls at half price, and Honey and mushrooms you find while exploring.'}</p>
    {rows.length === 0
      ? <p className="mt-3 text-sm">Nothing to sell yet. Explore Sunny Meadow to find Honey and mushrooms.</p>
      : <ul className="mt-3 flex flex-col gap-3">{rows.map((item) => <TradeRow key={`${side}:${item.id}`} item={item} side={side} state={state} busy={busy} onTrade={onTrade} />)}</ul>}
  </section>;
}
```

If `PixelSprite`'s props differ (for example, no `size` for a 48px ball), read
`src/components/ui/PixelSprite.tsx` and match it. Keep native-size rendering: 48 for balls and 30 for harvest art.

- [ ] **Step 2: Wire the screen into `RouteScreen.tsx`.**
  - `type Page = 'map' | 'list' | 'home' | 'r1' | 'encounter' | 'market';`
  - Import `MarketScreen` and `tradeText`.
  - `TownView`: `onMarket={() => { scrollToTop(); setPage('market'); }}`.
  - Header back button: when `page === 'market'`, show `◀ Town` and go to `setPage('home')`. Title: when
    `page === 'market'`, use `'Village market'`. The Bag button stays.
  - In `submit`'s success path, before the `else { setPage('r1'); … }` branch, add:

```tsx
    } else if (command.operation === 'market-trade') {
      if (reply.trade) setNotice(tradeText(reply.trade));
```

  - Render, next to the `page === 'home'` line:

```tsx
      {page === 'market' && (state.activated && !state.legacy.pending
        ? <MarketScreen state={state} busy={locked} onTrade={(trade) => void submit({ operation: 'market-trade', input: { requestId: newRouteRequestId(), ...trade } })} />
        : <Panel title="Village market"><p className="text-sm">Begin exploring Sunny Meadow to open your account at the market.</p><button type="button" onClick={() => walkTo('r1')} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Walk to Sunny Meadow</button></Panel>)}
```

  The existing error alert, `notice` status, and "Recover your last action" panel render above every page, so the
  market inherits the error, success, and lost-reply states.

- [ ] **Step 3: Type-check and lint.**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add src/components/world/MarketScreen.tsx src/components/world/RouteScreen.tsx
git commit -m "Add the Village market screen with buy and sell tabs"
```

---

### Task 7: Bag, route panel, and results show money

**Files:**
- Modify: `src/components/BagScreen.tsx`
- Modify: `src/components/world/RouteScreen.tsx` (supply panel, Explore hint, quest copy and notice)
- Modify: `src/components/world/RouteResultView.tsx`

**Interfaces:**
- Consumes: `VALUABLE_ITEMS`, `formatMoney`, `guaranteesSupplies`, `moneyChangeText`, and `ROUTE_RULES.questMoney`.

- [ ] **Step 1: Bag.** In `BagScreen.tsx`:
  - Under the header, when `inventory` is present, render:

```tsx
        {inventory && <section className="ui-window m-2 flex items-center justify-between p-3" aria-label="Money"><h2 className="font-label text-[11px] uppercase text-info">Money</h2><p className="font-label text-[11px] uppercase text-accent">{formatMoney(inventory.money)}</p></section>}
```

  - Change the capture copy to "Each throw uses one owned ball, whether the Pokémon stays or escapes. Find more in
    Sunny Meadow or buy them at the Village market."
  - After the capture section, add a Valuables window:

```tsx
      {inventory && <section className="ui-window m-2 p-3" aria-label="Valuables">
        <h2 className="font-label text-[11px] uppercase text-info">Valuables</h2>
        <p className="mt-2 text-sm text-ink-dim">Sell these at the Village market in Hearth Town.</p>
        {VALUABLE_ITEMS.every((item) => itemQuantity(inventory, item.id) === 0)
          ? <p className="mt-3 text-sm">None yet. Explore Sunny Meadow to find Honey and mushrooms.</p>
          : <ul className="mt-3 flex flex-col gap-3">{VALUABLE_ITEMS.filter((item) => itemQuantity(inventory, item.id) > 0).map((item) => <li key={item.id} className="flex items-center gap-3 rounded-[3px] bg-slot p-3"><img src={`${import.meta.env.BASE_URL}${item.icon}`} alt="" width={30} height={30} className="shrink-0 [image-rendering:pixelated]" /><span className="min-w-0 flex-1 text-base">{item.name}</span><span className="font-label text-[11px] uppercase" aria-label={`${itemQuantity(inventory, item.id)} owned`}>×{itemQuantity(inventory, item.id)}</span></li>)}</ul>}
      </section>}
```

  - Keep `empty` meaning "no capture balls", computed with `ballCount(inventory) === 0`. Its copy becomes "No
    capture balls. Buy Poké Balls at the Village market, or after finishing any current encounter, Explore
    Sunny Meadow." When `guaranteesSupplies(inventory)` is true, append "Explore guarantees 3 Poké Balls for 1
    action."

- [ ] **Step 2: Route panel.** In `RouteScreen.tsx`:
  - Supply panel: show `Money: {formatMoney(state.inventory.money)}` on a line after the ball counts.
  - Replace the `balls === 0` line with:
    - when `guaranteesSupplies(state.inventory)`, the existing guarantee text;
    - otherwise, "No balls left. Buy Poké Balls at the Village market in Hearth Town."
  - Explore hint: use `guaranteesSupplies(state.inventory)` instead of `balls === 0` for the guaranteed copy. The
    normal copy becomes "Find a wild Pokémon, an NPC, items, Honey and mushrooms, or a coin pouch. You may also
    discover a landmark."
  - In the encounter view, change the `balls === 0` warning to "Your Bag has no capture balls. Battle or leave,
    then buy balls at the Village market or Explore for supplies."
  - Battle button: "Battle · earn EXP and ₽ on a win".
  - Quest copy: "Discover all three to receive {questGreatBalls} Great Balls and {formatMoney(ROUTE_RULES.questMoney)}."
    Claim button: "Claim reward · free". Notice after a claim: "Meadow survey complete. 3 Great Balls and ₽500
    are saved in your Bag."

- [ ] **Step 3: Result card.** In `RouteResultView.tsx`, below the items list, add:

```tsx
      {moneyChangeText(event) && <p className="mt-2 text-sm text-accent">{moneyChangeText(event)}</p>}
```

- [ ] **Step 4: Type-check, lint, and run the client tests.**

Run: `npx tsc -b && npm run lint && npx tsx scripts/route-client.test.ts`
Expected: no errors, and 0 failed.

- [ ] **Step 5: Commit.**

```bash
git add src/components/BagScreen.tsx src/components/world/RouteScreen.tsx src/components/world/RouteResultView.tsx
git commit -m "Show money and valuables in the Bag, route panel and results"
```

---

### Task 8: Docs, full gate, browser check, review

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]`)
- Modify: `RELEASING.md`, only if its checklist lists `COLUMN_ADDS` changes. A new column needs `db:setup`, not a
  duplicate pre-check.

- [ ] **Step 1: Update the changelog.** Under `## [Unreleased]`:
  - In `### Added`:
    - "**Village market** — buy Poké Balls and Great Balls with Pokédollars (₽) in Hearth Town, and sell balls,
      Honey, and mushrooms. Battle wins, coin pouches, and the Meadow survey pay ₽; retries never pay or charge
      twice."
  - In `### Changed`:
    - "Explore item finds now include harvest goods and coin pouches."
    - "Explore's guaranteed Poké Balls apply only when you have no balls and under ₽200."

- [ ] **Step 2: Run the full gate.**

Run: `npm run lint && npm test && npm run build`
Expected: every step exits 0. Record the HEAD SHA and the result lines. Report a pre-existing failure separately
from regressions.

- [ ] **Step 3: Browser check.** Run it against a scratch database, never `local.db`.
  - Serve the production build on :3100 and the dev API on :3101, with an explicit `AUTH_SECRET` and
    `TURSO_DATABASE_URL=file:<scratchpad>/market.db`.
  - Check at 320, 375, and 430px:
    - The town card for 02 reads "Enter the market" and opens the market.
    - The Buy tab disables with "You need ₽… more" at ₽0.
    - The Sell tab sells a Poké Ball and shows "Sold 1 Poké Ball for ₽100."
    - The balance updates in the Bag.
    - The stepper clamps to what you own.
    - Nothing scrolls horizontally.
  - Save screenshots in the scratchpad.

- [ ] **Step 4: Review.** Run the `reviewer` subagent on `git diff development...market`, because the diff touches
  money writes and the save format. Fix P0 and P1 findings, re-run the gate, and commit the fixes.

- [ ] **Step 5: Commit the docs.**

```bash
git add CHANGELOG.md
git commit -m "Note the Village market in the changelog"
```

- [ ] **Step 6: Hand off.**
  - Report the branch, commits, gate results, and browser evidence.
  - Merging `market` into `development`, pushing, removing the worktree
    (`git worktree remove`, `git config --unset extensions.worktreeConfig`), and production `db:setup` each need
    the owner's go-ahead.
