# Hearth Town market

Status: design approved by the owner in conversation on 2026-10-01; this written spec awaits review. Balance
numbers are first-pass defaults, not measured. Production `db:setup` and release remain separate approvals.

The Village market (town destination 02) becomes a working shop. Players earn Pokédollars (₽) in Sunny Meadow,
buy Poké Balls and Great Balls with them, and sell balls and new harvest goods back. The server owns money,
prices, and every trade.

## Acceptance criteria

1. Every account has a ₽ balance, a non-negative integer stored server-side, shown in the Bag and the market.
2. Battle wins, Explore coin pouches, and the Meadow survey pay ₽ exactly once each, including on retries.
3. Explore can find three sell-only harvest goods.
4. The market card in Hearth Town opens a Market screen with Buy and Sell tabs.
5. A trade debits and credits money and items in one transaction; it never leaves a negative balance or stack,
   and a retried request never trades twice.
6. Selling every ball cannot be turned into a free-supply loop.
7. Encounters started under the current rules (version 2) still load and settle.

## Out of scope

Daily or limited stock, other town services (bakery, lab, square), new usable items or ball types, healing,
player-to-player trading, discarding items, and backfilling ₽ for wins or quest claims made before this ships.

## Economy

### Currency

Pokédollars, shown as `₽1,200`. Stored as `route_accounts.money`, an integer from 0 to
`Number.MAX_SAFE_INTEGER`. Every change goes through one conditional helper and bumps `inventory_revision`.
There is no starting purse.

### Income

| Source | Amount | When it is paid |
| --- | ---: | --- |
| Wild battle win | ₽100 | In the battle's settle transaction |
| Trainer battle win | ₽200 | In the battle's settle transaction |
| Explore coin pouch | ₽300 | With the search's commit, like an item grant |
| Meadow survey claim | ₽500 | In `claimRouteQuest`, alongside the existing 3 Great Balls |

Lost battles, leaving, talking, throws, replays, and dismissing results pay nothing. Claims made before this
ships are not paid retroactively.

### Catalog and prices

Prices live on each `ItemDefinition` in `src/game/items.ts` as `price: { buy?: number; sell?: number }`. An item
can be bought only with a `buy` price and sold only with a `sell` price. The server never reads a price from the
client.

| Item ID | Item | Category | Buy | Sell |
| --- | --- | --- | ---: | ---: |
| `poke` | Poké Ball | capture | ₽200 | ₽100 |
| `great` | Great Ball | capture | ₽600 | ₽300 |
| `honey` | Honey | valuable | — | ₽150 |
| `tiny-mushroom` | Tiny Mushroom | valuable | — | ₽250 |
| `big-mushroom` | Big Mushroom | valuable | — | ₽1,000 |

Valuables have no use context: the Bag describes them and only the market consumes them. `CaptureBallId` stays
`'poke' | 'great'`; a wider `ItemId` type covers all five, and catch logic keeps accepting capture balls only.
Unknown item IDs are rejected everywhere, as today.

### Explore item finds (route rules version 3)

Explore's category split stays 45% wild, 30% NPC, 25% item. Within an item find:

| Find | Chance |
| --- | ---: |
| 3 Poké Balls | 50% |
| 1 Great Ball | 15% |
| 1 harvest good: Honey 6, Tiny Mushroom 3, Big Mushroom 1 (weights) | 20% |
| Coin pouch, ₽300 | 15% |

This changes item-find outcomes, so `ROUTE_RULES.version` becomes 3. The RNG stream names stay `route:2:…`, so wild, NPC, landmark, and catch rolls replay identically across versions. Stored events and receipts with
`rulesVersion: 2` and their frozen `config` must still parse and settle; the reader accepts 2 and 3.
The landmark side roll is unchanged.

### Supply guard

Today Explore guarantees 3 Poké Balls when the account owns no capture balls. It now also requires the balance
to be below one Poké Ball's buy price (₽200). The route panel's pre-search copy states the rule that applies. This
bounds the "sell everything, Explore, sell again" loop: once the balance can buy a ball, the guarantee stops.

## Trading

### Rules

- Available whenever the route account is activated. An unresolved encounter is untouched by a trade, and a trade
  costs no actions, so the player can return to town, buy balls, and resume a catch.
- One trade is `{ itemId, side: 'buy' | 'sell', quantity }` with an integer quantity from 1 to 99.
- `total = unit price × quantity`; it must stay a safe integer.
- Selling the last ball is allowed; the supply guard covers it.

### API: `POST /api/world/market-trade`

Body: `{ requestId, itemId, side, quantity }`. Follows `.agents/rules/api.md`: `requirePost`, `gate`, the
existing `rl:world:m` and `rl:world:d` limits, then validation of the body as `unknown`.

One `writeCommand` transaction in `api/_route-actions.ts` (or a new `api/_market.ts` that uses the same
receipt helpers):

- Buy: conditional money debit (`money >= total`), then `changeInventory(+quantity)`.
- Sell: conditional `changeInventory(-quantity)`, then a money credit.
- `inventory_revision` increases on every trade (the money and item writes each bump it).
- The receipt `{ itemId, side, quantity, total }` is stored under `requestId`. A retry with the same body returns
  it unchanged; the same `requestId` with a different body is a 409, as for route commands.

| Status | When |
| ---: | --- |
| 200 | Trade done, or a replayed receipt (`replayed: true`) |
| 400 | Unknown item, item not buyable or sellable on that side, bad quantity |
| 401 | No session |
| 409 | Route not activated (existing `requireActivated`), not enough ₽ ("You need ₽X more."), not enough of the item, reused `requestId` with a different body |
| 429 | Rate limited |
| 503 | Database failure or missing schema |

The reply is the usual `RouteReply` plus `trade: { itemId, side, quantity, total }`. `InventoryState` gains
`money: number`, so the Bag, route panel, and market reconcile from one revision.

### Income writes

A shared `changeMoney(tx, uid, delta)` in `api/_db.ts` does a conditional, bounded update and bumps
`inventory_revision`, like `changeInventory`. `RouteEvent` gains `money: number` (₽ earned by that encounter);
older stored events without it read as 0. Battle settlement and pouch finds write it in their existing
transactions.

## Schema and save format

- `COLUMN_ADDS` gets `alter table route_accounts add column money integer not null default 0`. No new tables or
  indexes; no `RELEASING.md` pre-check is needed.
- Deployed code ignores the column. New code against a database without it fails with the existing
  "world isn't ready" 503 until `db:setup` runs.
- Stored route events gain optional fields only, and version 2 events keep loading: a minor version bump.

## Screens

### Market (`src/components/world/MarketScreen.tsx`, lazy)

- `town.ts`: market gets `link: 'market'`; `TownLink` adds `'market'`; `ACTION_LABEL.market` is
  "Enter market". `TownView` and `RouteScreen` route it like the other services.
- Night style: one `ui-window` with ◀ Back and the ₽ balance, Buy and Sell tabs, rows with icon, name, unit
  price, owned count, a − / quantity / + stepper, and a submit reading "Buy ×3 · ₽600".
- The Sell tab lists owned sellable items and a line on where harvest goods come from; empty shows that line only.
- The stepper clamps to what the player can afford or owns. A disabled submit says why.
- Loading uses the route state the world screen holds and fetches it when absent; a failed load shows the
  error and a Retry, never an empty shop.
- Submit is disabled while a trade is in flight. Success reads "Bought 3 Poké Balls for ₽600". The server's
  error string is shown as is.
- A trade goes through the pending-command path (`savePendingRouteCommand`) so a lost reply retries with the
  same `requestId`.

### Bag, route panel, and results

- Bag: ₽ balance at the top; a Valuables section for harvest goods ("Sell these at the Village market"); ball
  copy mentions the market.
- Route results show "+₽100" and similar for wins, pouches, and the quest.
- The no-balls hint points to the market when the balance can buy a Poké Ball, otherwise to Explore.

### Art

Honey, Tiny Mushroom, and Big Mushroom icons go in `public/sprites/items/` at 48×48, matching the existing item
art, rendered with `PixelSprite` at native or whole-multiple size. A coin pouch icon for the result card follows
the same rule.

## Tests

Extend existing files; add none unless a case has no home.

| File | Covers |
| --- | --- |
| `scripts/route-rules.test.ts` | Pinned seeds give exact v3 item finds, harvest weights, and pouches; the supply guard needs zero balls and under ₽200 |
| `scripts/route-db.test.ts` | Buy and sell move exact money and stacks; not enough ₽ or items is a 409 with nothing changed; a retry trades once; a mismatched body is a 409; each trade increases the revision; a win pays once across retries; a loss or leave pays nothing; the quest pays ₽500 once; a v2 stored event still settles |
| `scripts/route-api.test.ts` | `market-trade` method, session, validation (unknown item, unbuyable valuable, quantity 0, 100, or a non-integer), and response shape |
| `scripts/route-client.test.ts` | The trade helper returns `{ ok: false, error }` on failure and reconciles by revision |
| `scripts/town.test.ts` | Still matches `hotspots.json` with the market link |

Then the full gate (`npm run lint && npm test && npm run build`) and a browser check under `npm run dev:local` at
320, 375, and 430 px. The diff touches money writes, so the `reviewer` subagent runs before commit.

## Changelog

Under `[Unreleased]`: Added: the Village market, Pokédollars, harvest goods. Changed: Explore's item finds and
the empty-Bag supply rule.
