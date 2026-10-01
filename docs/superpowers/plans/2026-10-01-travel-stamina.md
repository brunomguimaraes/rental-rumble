# Travel Stamina (slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trips between Hearth Town and Sunny Meadow cost server-owned travel stamina (cheaper with a ride Pokémon in the party), searches require being at the route, and a persistent trainer bar shows Travel and Actions meters.

**Architecture:** A shared refilling-meter module in `src/game/meter.ts` backs both the existing action allowance and the new travel meter. `src/game/travel.ts` holds the pure travel rules (costs, ride species, quotes). The server stores the meter and location on `route_accounts`, adds a `travel` command to the existing `api/world` dispatcher through `writeCommand`, and returns `travel`, `trainerAt` and `quotes` in `RouteState`. The client renders those; it never computes cost.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vercel functions, libSQL. Tests are `tsx` scripts with a `check()` harness.

**Spec:** `docs/superpowers/specs/2026-10-01-travel-stamina-design.md` (slice 1 only: no whiteout debt, no Bike).

## Global Constraints

- **Prerequisite:** the trainer-identity work currently uncommitted on `development` (`HubScreen.tsx`, `App.tsx`, `RouteScreen.tsx`, `api/_db.ts`, `db/schema.sql`, `package.json`, …) must be committed before Task 1. Do not start on a dirty checkout; do not stash or discard someone else's changes.
- Work on `development`. Commit messages have **no** `Co-Authored-By` trailer.
- Runtime relative imports in `src/game/` and `api/` end in `.js`; `import type` may omit it; components may omit it.
- Travel meter: capacity **12**, refill **+1 every 15 minutes** (`900_000` ms), floor **−12**, start **12**.
- Walking cost for every open link (Hearth Town ↔ Sunny Meadow): **4**. Land mount `ceil(walk / 2)`, flyer `ceil(walk / 4)`, minimum **1**. Cheapest wins; ties prefer flyer, then land, then walk; equal mounts go by party order.
- Actions stay as they are: capacity 48, +1 every 10 minutes, 1 per search.
- Player-facing errors, verbatim:
  - `Not enough travel stamina — next point in {n} min.` (400)
  - `Finish or leave your encounter before you travel.` (409)
  - `You can only search Sunny Meadow while you’re there.` (400)
  - `You’re already here.` (400)
  - `You can’t get there from here.` (400)
- New `route_accounts` columns go in `COLUMN_ADDS`, nullable; null means "backfill on read": full meter at `now`, location derived as today (`r1` if the account has route events or its last idle route was `r1`, else `home`).
- No hex values in components; new colours are tokens in `src/index.css`.
- Full gate before done: `npm run lint && npm test && npm run build`.

## Review Focus

1. **Double tap / two tabs:** a second travel request with a new request ID after the first already moved the trainer must be rejected (`You’re already here.`) with no second debit. → Task 3 test.
2. **Party edited after the quote was shown:** the mount left the party between render and tap. The server recomputes from the saved party; a mismatched `partyIds` is a 409 with the current party and nothing spent. → Task 3 test.
3. **Database before `db:setup`:** the three columns are missing. State GET must still load (backfilled values); a travel write must fail as a 503 "world map isn't ready", not crash. → Task 3 test (drop the columns) and Task 4 relies on the existing `isMissingSchema` mapping.
4. **Deep link into a place the trainer is not at** (Hub "Meadow survey" or a town destination while at the other place): the screen must show the travel panel, never search buttons or town services. → Task 7 guard + browser check.
5. **A body that names its own cost or mode** (`cost: 0`, `mode: 'flyer'`): ignored; the server's quote is debited. → Task 4 test.

---

### Task 1: Shared meter math and travel rules

**Files:**
- Create: `src/game/meter.ts`
- Create: `src/game/travel.ts`
- Modify: `src/game/route-rules.ts:87-116` (allowance functions delegate to the meter)
- Create: `scripts/travel.test.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Produces:
  - `meter.ts`: `MeterRules { capacity; refillEveryMs; floor }`, `MeterRecord { available; refilledAt }`, `MeterView { available; capacity; refillEveryMs; nextRefillAt: number | null }`, `projectMeter(record, now, rules): MeterRecord`, `meterView(record, now, rules): MeterView`, `spendMeter(record, now, cost, rules): MeterRecord | null`.
  - `travel.ts`: `TravelPlace = 'home' | 'r1'`, `TravelMode = 'walk' | 'land' | 'flyer'`, `TravelQuote { to: TravelPlace; walk: number; cost: number; mode: TravelMode; via: string | null }`, `TRAVEL_RULES: MeterRules & { walkCost: number }`, `RIDE_SPECIES: Readonly<Record<number, 'land' | 'flyer'>>`, `isTravelPlace(v: unknown): v is TravelPlace`, `quoteTravel({ from, to, party }): TravelQuote | null`, `travelQuotes(from, party): TravelQuote[]`, `travelView(record, now): MeterView`, `spendTravel(record, now, cost): MeterRecord | null`.
  - `projectAllowance`, `allowanceView`, `spendAllowance` keep their exact signatures and behaviour.

- [ ] **Step 1: Write the failing test** — `scripts/travel.test.ts`

```ts
/** Travel rules: mode costs, the cheapest mount, open links, and the refilling meter with debt. */
import { isDeepStrictEqual } from 'node:util';
import type { OwnedMon } from '../src/game/box.js';
import { quoteTravel, spendTravel, travelQuotes, travelView } from '../src/game/travel.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b);
// quoteTravel reads only the species; a full OwnedMon is not needed to price a trip.
const mon = (dexId: number): OwnedMon => ({ id: `m${dexId}`, dexId } as OwnedMon);
const CATERPIE = 10, PONYTA = 77, RAPIDASH = 78, PIDGEOT = 18;
const MIN = 60_000;
const STEP = 15 * MIN;

check('walking to Sunny Meadow costs 4', same(quoteTravel({ from: 'home', to: 'r1', party: [mon(CATERPIE)] }), { to: 'r1', walk: 4, cost: 4, mode: 'walk', via: null }));
check('walking home costs the same', quoteTravel({ from: 'r1', to: 'home', party: [] })?.cost === 4);
check('no trip to where you already are', quoteTravel({ from: 'home', to: 'home', party: [] }) === null);
check('a land mount halves the trip', same(quoteTravel({ from: 'home', to: 'r1', party: [mon(CATERPIE), mon(RAPIDASH)] }), { to: 'r1', walk: 4, cost: 2, mode: 'land', via: 'Rapidash' }));
check('a flyer quarters the trip', same(quoteTravel({ from: 'home', to: 'r1', party: [mon(PIDGEOT)] }), { to: 'r1', walk: 4, cost: 1, mode: 'flyer', via: 'Pidgeot' }));
check('the cheapest mount wins regardless of order', quoteTravel({ from: 'home', to: 'r1', party: [mon(RAPIDASH), mon(PIDGEOT)] })?.mode === 'flyer');
check('equal mounts go by party order', quoteTravel({ from: 'home', to: 'r1', party: [mon(PONYTA), mon(RAPIDASH)] })?.via === 'Ponyta');
check('town links only to the open route', same(travelQuotes('home', []).map((q) => q.to), ['r1']));
check('the meadow links only to open places, not Route 2', same(travelQuotes('r1', []).map((q) => q.to), ['home']));

check('a full meter has no next refill', travelView({ available: 12, refilledAt: 0 }, 5 * STEP).nextRefillAt === null);
check('spending from full starts the refill clock now', same(spendTravel({ available: 12, refilledAt: 0 }, 1_000_000, 4), { available: 8, refilledAt: 1_000_000 }));
check('a trip the meter cannot cover is refused', spendTravel({ available: 3, refilledAt: 0 }, 0, 4) === null);
check('the last points can be spent to zero', spendTravel({ available: 4, refilledAt: 0 }, 0, 4)?.available === 0);
check('one point returns after 15 minutes', travelView({ available: 0, refilledAt: 0 }, STEP).available === 1);
check('debt recovers one point per interval', travelView({ available: -4, refilledAt: 0 }, 8 * STEP).available === 4 && travelView({ available: -4, refilledAt: 0 }, 8 * STEP - 1).available === 3);
check('a long absence caps at 12', travelView({ available: -4, refilledAt: 0 }, 1_000 * STEP).available === 12);
check('a record below the floor reads at the floor', travelView({ available: -50, refilledAt: 0 }, 0).available === -12);

console.log(`travel: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/travel.test.ts`
Expected: FAIL — `Cannot find module '../src/game/travel.js'`.

- [ ] **Step 3: Write `src/game/meter.ts`**

```ts
// A refilling point meter: one point per whole interval, up to capacity, never below its floor.
// Action stamina (floor 0) and travel stamina (floor below 0, for whiteout debt) share it.

export interface MeterRules { capacity: number; refillEveryMs: number; floor: number }
export interface MeterRecord { available: number; refilledAt: number }
export interface MeterView { available: number; capacity: number; refillEveryMs: number; nextRefillAt: number | null }

/** Read-only projection. At capacity there is no banked overflow or partial interval. */
export function projectMeter(record: MeterRecord, now: number, rules: MeterRules): MeterRecord {
  const effectiveNow = Math.max(now, record.refilledAt);
  const available = Math.max(rules.floor, Math.min(rules.capacity, Math.floor(record.available)));
  if (available === rules.capacity) return { available, refilledAt: effectiveNow };
  const elapsedIntervals = Math.floor((effectiveNow - record.refilledAt) / rules.refillEveryMs);
  const replenished = Math.min(rules.capacity, available + elapsedIntervals);
  return {
    available: replenished,
    refilledAt: replenished === rules.capacity
      ? effectiveNow
      : record.refilledAt + elapsedIntervals * rules.refillEveryMs,
  };
}

export function meterView(record: MeterRecord, now: number, rules: MeterRules): MeterView {
  const current = projectMeter(record, now, rules);
  return {
    available: current.available,
    capacity: rules.capacity,
    refillEveryMs: rules.refillEveryMs,
    nextRefillAt: current.available === rules.capacity ? null : current.refilledAt + rules.refillEveryMs,
  };
}

/** The projection minus `cost`, or null when the meter cannot cover it. A transaction persists the result. */
export function spendMeter(record: MeterRecord, now: number, cost: number, rules: MeterRules): MeterRecord | null {
  const current = projectMeter(record, now, rules);
  return current.available >= cost ? { ...current, available: current.available - cost } : null;
}
```

- [ ] **Step 4: Make the allowance delegate** — replace `projectAllowance`, `allowanceView`, `spendAllowance` in `src/game/route-rules.ts` (currently lines 87–116) with:

```ts
const allowanceMeter = (rules: RouteRules): MeterRules => ({ capacity: rules.capacity, refillEveryMs: rules.refillEveryMs, floor: 0 });

/** Read-only projection. At capacity there is no banked overflow or partial interval. */
export function projectAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): AllowanceRecord {
  return projectMeter(record, now, allowanceMeter(rules));
}

export function allowanceView(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): ActionAllowance {
  return meterView(record, now, allowanceMeter(rules));
}

/** A transaction persists this projection together with its new encounter. */
export function spendAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): AllowanceRecord | null {
  return spendMeter(record, now, 1, allowanceMeter(rules));
}
```

and add `import { meterView, projectMeter, spendMeter, type MeterRules } from './meter.js';` to its imports.

- [ ] **Step 5: Write `src/game/travel.ts`**

```ts
import type { OwnedMon } from './box.js';
import { meterView, spendMeter, type MeterRecord, type MeterRules, type MeterView } from './meter.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { placeById } from './world.js';

// Travel stamina: what a trip between open places costs and which ride lowers it.
// Pure; the server re-runs it from owned rows and the client only renders its quotes.

export type TravelPlace = 'home' | 'r1';
export type TravelMode = 'walk' | 'land' | 'flyer';
export interface TravelQuote {
  to: TravelPlace;
  /** The walking cost, shown next to a discount. */
  walk: number;
  cost: number;
  mode: TravelMode;
  /** The species carrying the trainer; null on foot. */
  via: string | null;
}

export const TRAVEL_RULES: MeterRules & { walkCost: number } = {
  capacity: 12,
  refillEveryMs: 900_000,
  floor: -12,
  walkCost: 4,
};

/** Species that can carry a trainer, by national dex ID. Regional forms share their dex ID. */
export const RIDE_SPECIES: Readonly<Record<number, 'land' | 'flyer'>> = {
  77: 'land', 78: 'land', 111: 'land', 112: 'land', 128: 'land', 59: 'land', 234: 'land',
  232: 'land', 750: 'land', 673: 'land', 899: 'land',
  22: 'flyer', 18: 'flyer', 6: 'flyer', 142: 'flyer', 149: 'flyer', 227: 'flyer', 334: 'flyer',
  330: 'flyer', 373: 'flyer', 398: 'flyer', 468: 'flyer', 628: 'flyer', 663: 'flyer', 715: 'flyer', 823: 'flyer',
};

const OPEN_PLACES: readonly TravelPlace[] = ['home', 'r1'];
const MODE_RANK: Record<TravelMode, number> = { flyer: 0, land: 1, walk: 2 };

export const isTravelPlace = (v: unknown): v is TravelPlace => v === 'home' || v === 'r1';

function modeCost(mode: TravelMode, walk: number): number {
  if (mode === 'walk') return walk;
  return Math.max(1, Math.ceil(walk / (mode === 'land' ? 2 : 4)));
}

/** The cheapest way from `from` to a neighbouring open place, or null when there is no such trip. */
export function quoteTravel({ from, to, party }: { from: TravelPlace; to: TravelPlace; party: readonly OwnedMon[] }): TravelQuote | null {
  if (from === to || !OPEN_PLACES.includes(to) || !placeById(from)?.neighbours.includes(to)) return null;
  const walk = TRAVEL_RULES.walkCost;
  let best: TravelQuote = { to, walk, cost: walk, mode: 'walk', via: null };
  for (const mon of party) {
    const mode = RIDE_SPECIES[mon.dexId];
    if (!mode) continue;
    const cost = modeCost(mode, walk);
    if (cost < best.cost || (cost === best.cost && MODE_RANK[mode] < MODE_RANK[best.mode])) {
      best = { to, walk, cost, mode, via: CREATURES_BY_ID[String(mon.dexId)]?.name ?? null };
    }
  }
  return best;
}

export function travelQuotes(from: TravelPlace, party: readonly OwnedMon[]): TravelQuote[] {
  return OPEN_PLACES.flatMap((to) => quoteTravel({ from, to, party }) ?? []);
}

export const travelView = (record: MeterRecord, now: number): MeterView => meterView(record, now, TRAVEL_RULES);
export const spendTravel = (record: MeterRecord, now: number, cost: number): MeterRecord | null => spendMeter(record, now, cost, TRAVEL_RULES);
```

- [ ] **Step 6: Run the new test and the allowance tests**

Run: `npx tsx scripts/travel.test.ts && npx tsx scripts/route-rules.test.ts && npx tsc -b`
Expected: both print `0 failed`; `tsc` exits 0.

- [ ] **Step 7: Register the test** — in `package.json`'s `test` script insert `tsx scripts/travel.test.ts && ` immediately after `tsx scripts/route-rules.test.ts && `.

- [ ] **Step 8: Commit**

```bash
git add src/game/meter.ts src/game/travel.ts src/game/route-rules.ts scripts/travel.test.ts package.json
git commit -m "Add travel stamina rules on a shared refilling meter"
```

---

### Task 2: Store the meter and location; return them in `RouteState`

**Files:**
- Modify: `src/game/route-actions.ts` (`RouteState`, new `RouteTravelInput`)
- Modify: `api/_db.ts` (`COLUMN_ADDS`, `RouteAccountRow`, `readRouteAccount`, new `writeTravel`)
- Modify: `db/schema.sql` (comment only)
- Modify: `api/_route-actions.ts` (`loadRouteStateInTx`, new helpers `travelRecord`, `currentLocation`)
- Modify: `scripts/world-test-kit.ts` (new `placeTrainer`)
- Modify: `scripts/route-client.test.ts:17-24` (fixture gains the new fields)
- Test: `scripts/route-db.test.ts`

**Interfaces:**
- Consumes: `travelView`, `travelQuotes`, `TRAVEL_RULES`, `TravelPlace`, `TravelQuote` (Task 1); `MeterRecord`, `MeterView` (Task 1).
- Produces:
  - `RouteState.travel: MeterView`, `RouteState.quotes: TravelQuote[]`, `RouteState.trainerAt: TravelPlace` (server-stored, backfilled).
  - `RouteTravelInput { requestId: string; to: TravelPlace; partyIds: string[] }`.
  - `RouteAccountRow.travel: number | null`, `.travelRefilledAt: number | null`, `.location: TravelPlace | null`.
  - `writeTravel(db: Executor, uid, travel: number, refilledAt: number, location: TravelPlace): Promise<void>`.
  - In `api/_route-actions.ts`: `travelRecord(account: RouteAccountRow | null, now): MeterRecord`, `currentLocation(tx: Executor, uid, account: RouteAccountRow | null): Promise<TravelPlace>`.
  - Test kit: `placeTrainer(db: Db, uid: string, place: 'home' | 'r1'): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — append to `scripts/route-db.test.ts`, inside the outer `try`, just before `} finally`:

```ts
  // Travel stamina: new accounts backfill a full meter in town; existing route players stay in the meadow.
  await onboardUser(db, 'walker', 10, 5);
  await activateRoute(db, 'walker', 'activate', T);
  const fresh = await loadRouteState(db, 'walker', T);
  const freshRow = await readRouteAccount(db, 'walker');
  check('a new account reads a full travel meter in town without writing it', fresh.travel.available === 12 && fresh.travel.nextRefillAt === null && fresh.trainerAt === 'home' && freshRow?.travel === null && freshRow?.location === null);
  check('town quotes a 4-point walk to Sunny Meadow', eq(fresh.quotes, [{ to: 'r1', walk: 4, cost: 4, mode: 'walk', via: null }]));
  await db.execute({ sql: 'update route_accounts set location = null where user_id = ?', args: ['u1'] });
  check('an account with route history backfills into Sunny Meadow', (await loadRouteState(db, 'u1', T)).trainerAt === 'r1');
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsc -b; npx tsx scripts/route-db.test.ts`
Expected: type errors that `travel`/`quotes` do not exist on `RouteState`; the script fails.

- [ ] **Step 3: Extend the contract** — in `src/game/route-actions.ts` add `import type { MeterView } from './meter.js';` and `import type { TravelPlace, TravelQuote } from './travel.js';`, then in `RouteState` replace `trainerAt: 'home' | 'r1';` with:

```ts
  /** Where the trainer stands; searches need the route, trips leave from here. */
  trainerAt: TravelPlace;
  travel: MeterView;
  /** One quote per place reachable from `trainerAt`. The server prices trips; the client only shows them. */
  quotes: TravelQuote[];
```

and add after `RouteSearchInput`:

```ts
export interface RouteTravelInput {
  requestId: string;
  to: TravelPlace;
  partyIds: string[];
}
```

- [ ] **Step 4: Columns and row mapping** — in `api/_db.ts`:

Append to `COLUMN_ADDS`:

```ts
  // Travel stamina and the trainer's place. Null reads as a full meter and the place derived from history.
  'alter table route_accounts add column travel integer',
  'alter table route_accounts add column travel_refilled_at integer',
  'alter table route_accounts add column location text',
```

Extend `RouteAccountRow` with `travel: number | null; travelRefilledAt: number | null; location: 'home' | 'r1' | null;` and the `readRouteAccount` mapper with:

```ts
    travel: r.travel == null ? null : Number(r.travel),
    travelRefilledAt: r.travel_refilled_at == null ? null : Number(r.travel_refilled_at),
    location: r.location === 'home' || r.location === 'r1' ? r.location : null,
```

(`select *` on a database without the columns yields `undefined`, which maps to `null`.) Add after `writeRouteAllowance`:

```ts
export async function writeTravel(db: Executor, uid: string, travel: number, refilledAt: number, location: 'home' | 'r1'): Promise<void> {
  await db.execute({
    sql: 'update route_accounts set travel = ?, travel_refilled_at = ?, location = ? where user_id = ?',
    args: [travel, refilledAt, location, uid],
  });
}
```

In `db/schema.sql`, add inside the `route_accounts` table comment block (above `create table if not exists route_accounts`): `-- travel, travel_refilled_at and location are added by COLUMN_ADDS; null reads as a full meter at the derived place.`

- [ ] **Step 5: Backfill helpers and state** — in `api/_route-actions.ts`:

Imports: add `writeTravel`, `type RouteAccountRow` to the `./_db.js` import; add `import { TRAVEL_RULES, travelQuotes, travelView, type TravelPlace } from '../src/game/travel.js';` and `import type { MeterRecord } from '../src/game/meter.js';`.

Add above `loadRouteStateInTx`:

```ts
/** A row from before travel stamina reads as a full meter starting now. */
function travelRecord(account: RouteAccountRow | null, now: number): MeterRecord {
  return account?.travel == null || account.travelRefilledAt == null
    ? { available: TRAVEL_RULES.capacity, refilledAt: now }
    : { available: account.travel, refilledAt: account.travelRefilledAt };
}
const derivedLocation = (routeVisited: boolean, lastRoute: string | null): TravelPlace => routeVisited || lastRoute === 'r1' ? 'r1' : 'home';
async function currentLocation(tx: Executor, uid: string, account: RouteAccountRow | null): Promise<TravelPlace> {
  if (account?.location) return account.location;
  const [routeVisited, lastRoute] = await Promise.all([hasRouteEvents(tx, uid), readLastRouteId(tx, uid)]);
  return derivedLocation(routeVisited, lastRoute);
}
```

In `loadRouteStateInTx`, replace `countOwned(db, uid)` in the `Promise.all` with `readOwnedByUser(db, uid), readProfile(db, uid)` (destructure as `owned, profile` in place of `ownedCount`), then compute before `return`:

```ts
  const trainerAt = account?.location ?? derivedLocation(routeVisited, lastRoute);
  const party = profile ? partyMembers(resolveParty(profile.party, owned, profile.starterId), owned) : [];
```

and in the returned object replace `trainerAt: routeVisited || lastRoute === 'r1' ? 'r1' : 'home', ownedCount,` with:

```ts
    trainerAt, ownedCount: owned.length,
    travel: travelView(travelRecord(account, now), now),
    quotes: travelQuotes(trainerAt, party),
```

Remove `countOwned` from the `_db.js` import if nothing else in the file uses it.

- [ ] **Step 6: Test kit helper** — append to `scripts/world-test-kit.ts`:

```ts
/** Stand the trainer at a place directly, for tests about something other than travel. */
export async function placeTrainer(db: Db, uid: string, place: 'home' | 'r1'): Promise<void> {
  await db.execute({ sql: 'update route_accounts set location = ? where user_id = ?', args: [place, uid] });
}
```

- [ ] **Step 7: Client fixture** — in `scripts/route-client.test.ts`, add to the `state` fixture after `trainerAt: 'home',`:

```ts
  travel: { available: 12, capacity: 12, refillEveryMs: 900_000, nextRefillAt: null },
  quotes: [{ to: 'r1', walk: 4, cost: 4, mode: 'walk', via: null }],
```

- [ ] **Step 8: Run**

Run: `npx tsc -b && npx tsc -p tsconfig.api.json && npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/route-client.test.ts`
Expected: all `0 failed`. (Searches are not gated yet, so existing tests still pass.)

- [ ] **Step 9: Commit**

```bash
git add src/game/route-actions.ts api/_db.ts db/schema.sql api/_route-actions.ts scripts/world-test-kit.ts scripts/route-db.test.ts scripts/route-client.test.ts
git commit -m "Store travel stamina and the trainer's place on route accounts"
```

---

### Task 3: The travel command and the search location gate

**Files:**
- Modify: `api/_route-actions.ts` (new `parseRouteTravel`, `travelRoute`; gate in `searchRoute`)
- Test: `scripts/route-db.test.ts`

**Interfaces:**
- Consumes: `travelRecord`, `currentLocation`, `writeTravel` (Task 2); `quoteTravel`, `spendTravel`, `travelView`, `isTravelPlace` (Task 1); `RouteTravelInput` (Task 2).
- Produces: `parseRouteTravel(body: Record<string, unknown>): RouteTravelInput | null`, `travelRoute(db: Db, uid: string, input: RouteTravelInput, now: number): Promise<RouteReply>`.

- [ ] **Step 1: Write the failing tests** — append to `scripts/route-db.test.ts` after Task 2's block. Add `travelRoute` to the `../api/_route-actions.js` import, `updateProfileParty` to the `../api/_db.js` import, and `mintMon` to the test-kit import.

```ts
  const walkerParty = async () => [(await readOwnedByUser(db, 'walker')).find((m) => m.origin === 'starter')!.id];
  const go = async (to: 'home' | 'r1', now = T, requestId = rid()) => travelRoute(db, 'walker', { requestId, to, partyIds: await walkerParty() }, now);
  await rejects('a search away from Sunny Meadow is refused', searchRoute(db, 'walker', { requestId: rid(), locationId: 'r1', kind: 'wild', partyIds: await walkerParty() }, T), 400);
  check('the refused search spent no action', (await loadRouteState(db, 'walker', T)).allowance.available === 12);
  const arrived = await go('r1', T, 'walk-out');
  check('walking out costs 4 and moves the trainer', arrived.state.travel.available === 8 && arrived.state.trainerAt === 'r1' && eq(arrived.state.quotes.map((q) => q.to), ['home']));
  const arrivedAgain = await go('r1', T + 1, 'walk-out');
  check('a retried trip replays without a second debit', arrivedAgain.replayed === true && arrivedAgain.state.travel.available === 8);
  await rejects('a second tap after arriving is refused', go('r1', T + 1), 400);
  check('the refused second tap spent nothing', (await loadRouteState(db, 'walker', T + 1)).travel.available === 8);
  const wild = await searchRoute(db, 'walker', { requestId: rid(), locationId: 'r1', kind: 'wild', partyIds: await walkerParty() }, T);
  await rejects('an open encounter keeps the trainer on the route', go('home'), 409);
  await leave(db, 'walker', wild.event!);
  await go('home');
  await go('r1');
  try { await go('home'); check('an empty meter refuses the trip', false); }
  catch (e) { check('an empty meter refuses the trip with the wait', e instanceof RouteError && e.status === 400 && e.message === 'Not enough travel stamina — next point in 15 min.'); }
  check('the stranded trainer stays put with nothing spent', (await loadRouteState(db, 'walker', T)).trainerAt === 'r1' && (await loadRouteState(db, 'walker', T)).travel.available === 0);
  check('four refills later the walk home is affordable', (await go('home', T + 4 * 900_000)).state.travel.available === 0);

  // Mounts come from the saved party, re-read on the server.
  const starterId = (await walkerParty())[0];
  const rapidash = await mintMon(db, 'walker', { dexId: 78, level: 30 });
  await updateProfileParty(db, 'walker', [starterId, rapidash.id]);
  const mounted = await loadRouteState(db, 'walker', T + 40 * 900_000);
  check('Rapidash in the party halves the quote', eq(mounted.quotes, [{ to: 'r1', walk: 4, cost: 2, mode: 'land', via: 'Rapidash' }]));
  await rejects('a stale party is refused before any debit', travelRoute(db, 'walker', { requestId: rid(), to: 'r1', partyIds: [starterId] }, T + 40 * 900_000), 409);
  const rode = await travelRoute(db, 'walker', { requestId: rid(), to: 'r1', partyIds: [starterId, rapidash.id] }, T + 40 * 900_000);
  check('riding debits the server quote', rode.state.travel.available === 10 && rode.state.trainerAt === 'r1');

  // Before db:setup adds the columns: state still loads; a trip fails as missing schema.
  const old = await tempDb('routes-pre-travel');
  try {
    await onboardUser(old.db, 'early', 10, 5);
    await activateRoute(old.db, 'early', 'activate', T);
    for (const col of ['travel', 'travel_refilled_at', 'location']) await old.db.execute(`alter table route_accounts drop column ${col}`);
    const early = await loadRouteState(old.db, 'early', T);
    check('state loads before db:setup with backfilled travel', early.travel.available === 12 && early.trainerAt === 'home');
    const earlyParty = [(await readOwnedByUser(old.db, 'early'))[0].id];
    try { await travelRoute(old.db, 'early', { requestId: 'early-trip', to: 'r1', partyIds: earlyParty }, T); check('a trip before db:setup is a schema failure', false); }
    catch (e) { check('a trip before db:setup is a schema failure', isMissingSchema(e)); }
  } finally { old.cleanup(); }
```

Add `isMissingSchema` to the `../api/_db.js` import, and `placeTrainer` and `tempDb` (if not already imported) to the `./world-test-kit.js` import; `placeTrainer` is used in Step 4.

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/route-db.test.ts`
Expected: FAIL — `travelRoute` is not exported (type error under tsx is not fatal; the call throws `travelRoute is not a function`).

- [ ] **Step 3: Implement** — in `api/_route-actions.ts`:

Add to the travel import: `isTravelPlace, quoteTravel, spendTravel`. Add `RouteTravelInput` to the `route-actions.js` type import. Add after `parseRouteQuest`:

```ts
export function parseRouteTravel(body: Record<string, unknown>): RouteTravelInput | null {
  const partyIds = parsePartyInput(body.partyIds);
  if (!validId(body.requestId) || !isTravelPlace(body.to) || !partyIds) return null;
  return { requestId: body.requestId, to: body.to, partyIds };
}
```

Add after `searchRoute`:

```ts
export async function travelRoute(db: Db, uid: string, input: RouteTravelInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['travel', input.to, input.partyIds]), now, async (tx) => {
    const account = await requireActivated(tx, uid);
    if (await readActiveRouteEvent(tx, uid)) fail(409, 'Finish or leave your encounter before you travel.');
    const profile = await readProfile(tx, uid);
    if (!profile) return fail(400, 'Finish onboarding first.');
    const owned = await readOwnedByUser(tx, uid);
    const partyIds = resolveParty(profile.party, owned, profile.starterId);
    if (!sameParty(partyIds, input.partyIds)) throw new RouteError(409, 'Your party changed. Check it and try again.', partyIds);
    const from = await currentLocation(tx, uid, account);
    if (from === input.to) fail(400, 'You’re already here.');
    // The price comes from the saved party, never from the request.
    const quote = quoteTravel({ from, to: input.to, party: partyMembers(partyIds, owned) });
    if (!quote) return fail(400, 'You can’t get there from here.');
    const record = travelRecord(account, now);
    const spent = spendTravel(record, now, quote.cost);
    if (!spent) {
      const next = travelView(record, now).nextRefillAt ?? now;
      return fail(400, `Not enough travel stamina — next point in ${Math.max(1, Math.ceil((next - now) / 60_000))} min.`);
    }
    await writeTravel(tx, uid, spent.available, spent.refilledAt, input.to);
  });
}
```

In `searchRoute`, directly after the line `if (input.locationId !== 'r1') fail(400, 'Only Sunny Meadow is available.');` add:

```ts
    if (await currentLocation(tx, uid, account) !== input.locationId) fail(400, 'You can only search Sunny Meadow while you’re there.');
```

- [ ] **Step 4: Run, then fix fixtures** — Run: `npx tsx scripts/route-db.test.ts`.
New travel checks pass. Existing checks for accounts with no route history now fail because their first search is refused (400). For each such account, add `await placeTrainer(db, '<uid>', 'r1');` on the line after its `activateRoute(...)` call: `u1` and `u2` (after line 71's `activateRoute(db, 'u2', …)`), the accounts activated near lines 113, 169, 193 and 257, and any legacy-migration account (lines 231, 240, 252) that searches afterwards. Do not add it for `walker`. Re-run until `0 failed`.

- [ ] **Step 5: Verify the new gate is what turns tests red** — temporarily comment out the search gate line from Step 3, run `npx tsx scripts/route-db.test.ts`, confirm `a search away from Sunny Meadow is refused` fails; restore the line and re-run to `0 failed`.

- [ ] **Step 6: Commit**

```bash
git add api/_route-actions.ts scripts/route-db.test.ts
git commit -m "Charge travel stamina for trips and search only where the trainer stands"
```

---

### Task 4: `travel` over HTTP

**Files:**
- Modify: `api/world/[action].ts`
- Test: `scripts/route-api.test.ts`

**Interfaces:**
- Consumes: `parseRouteTravel`, `travelRoute` (Task 3).
- Produces: `POST /api/world/travel` → `{ ok: true, state, box }` or `{ ok: false, error, state? , party? }`.

- [ ] **Step 1: Write the failing tests** — in `scripts/route-api.test.ts`:

Add `'travel'` to the action list in the first `for` loop (line 32). After line 44 (`await call('activate', { requestId: 'activate' }, 'other');`) insert:

```ts
  check('a search from town is refused before spending', (await call('search', { requestId: 'from-town', locationId: 'r1', kind: 'wild', partyIds: [s.id] })).status === 400);
  check('a travel body without a known place is rejected', (await call('travel', { requestId: 'nowhere', to: 'r2', partyIds: [s.id] })).status === 400);
  const trip = await call('travel', { requestId: 'trip', to: 'r1', partyIds: [s.id], cost: 0, mode: 'flyer' });
  const tripState = (trip.body as unknown as RouteReply).state;
  check('a trip ignores a client-named cost and charges the walk', trip.status === 200 && tripState.trainerAt === 'r1' && tripState.travel.available === 8 && tripState.allowance.available === 12);
  check('travelling to where you stand is a 400 with recovery state', (await call('travel', { requestId: 'again', to: 'r1', partyIds: [s.id] })).status === 400);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/route-api.test.ts`
Expected: FAIL — `travel requires login`/`POST` checks fail (404), and the trip check fails.

- [ ] **Step 3: Implement** — in `api/world/[action].ts`: add `parseRouteTravel, travelRoute` to the `_route-actions.js` import; add `'travel'` to the mutate list on line 20; add a branch in `mutate` before the final `else`:

```ts
    } else if (action === 'travel') {
      const input = parseRouteTravel(body);
      if (!input) return res.status(400).json({ ok: false, error: 'Choose a place to travel to and your saved party.' });
      out = await travelRoute(g.db, g.uid, input, now);
```

- [ ] **Step 4: Run**

Run: `npx tsx scripts/route-api.test.ts && npx tsc -p tsconfig.api.json`
Expected: `0 failed`, exit 0. (`scripts/dev-api.ts` needs no change: `world` is an existing area.)

- [ ] **Step 5: Commit**

```bash
git add "api/world/[action].ts" scripts/route-api.test.ts
git commit -m "Expose the travel command on the world API"
```

---

### Task 5: Client contract for travel

**Files:**
- Modify: `src/game/route-actions-client.ts`
- Modify: `src/components/world/route-copy.ts` (new `travelBlock`)
- Test: `scripts/route-client.test.ts`

**Interfaces:**
- Consumes: `RouteState.travel`, `.quotes` (Task 2); `RouteTravelInput`.
- Produces:
  - `RouteCommand` gains `{ operation: 'travel'; input: RouteTravelInput }`; `readPendingRouteCommand` accepts it.
  - `travelRoute(input: RouteTravelInput): Promise<RouteClientReply>`.
  - `travelBlock({ quote, travel, encounterOpen, now }: { quote: TravelQuote | null; travel: MeterView; encounterOpen: boolean; now: number }): string | null` — the reason a trip is unavailable, or null.

- [ ] **Step 1: Write the failing tests** — append to `scripts/route-client.test.ts` before its final summary lines. Add `travelRoute` to the client import and `travelBlock` to the `route-copy.js` import.

```ts
reply = json(200, { ok: true, state: { ...state, travel: undefined } });
check('a state without a travel meter is not trusted', !(await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...state, quotes: [{ to: 'r1', walk: 4, cost: -1, mode: 'walk', via: null }] } });
check('a negative trip cost is rejected', !(await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...state, travel: { ...state.travel, available: -4, nextRefillAt: 900_000 } } });
check('travel debt is a valid meter', (await fetchRouteState()).ok);
reply = json(200, { ok: true, state: { ...state, trainerAt: 'r1' } });
const moved = await travelRoute({ requestId: 'trip-one', to: 'r1', partyIds: ['starter'] });
check('travel posts to its action with the request body', moved.ok && lastUrl === '/api/world/travel' && lastInit?.method === 'POST' && JSON.parse(String(lastInit.body)).to === 'r1');
const tripCommand: RouteCommand = { operation: 'travel', input: { requestId: 'trip-two', to: 'home', partyIds: ['starter'] } };
savePendingRouteCommand('acct', tripCommand);
check('an uncertain trip survives a reload for an exact retry', readPendingRouteCommand('acct')?.input.requestId === 'trip-two');
clearPendingRouteCommand('acct');

const walk = { to: 'r1' as const, walk: 4, cost: 4, mode: 'walk' as const, via: null };
const meter = (available: number, nextRefillAt: number | null) => ({ available, capacity: 12, refillEveryMs: 900_000, nextRefillAt });
check('an affordable trip has no block', travelBlock({ quote: walk, travel: meter(4, 0), encounterOpen: false, now: 0 }) === null);
check('an open encounter blocks travel first', travelBlock({ quote: walk, travel: meter(12, null), encounterOpen: true, now: 0 }) === 'Finish or leave your encounter before you travel.');
check('a short meter names the wait for enough points', travelBlock({ quote: walk, travel: meter(1, 600_000), encounterOpen: false, now: 0 }) === 'Not enough travel stamina. Enough to travel in 40 min.');
check('debt counts every missing point', travelBlock({ quote: walk, travel: meter(-4, 900_000), encounterOpen: false, now: 0 }) === 'Not enough travel stamina. Enough to travel in 2 h.');
check('no route there is its own reason', travelBlock({ quote: null, travel: meter(12, null), encounterOpen: false, now: 0 }) === 'You can’t get there from here.');
```

(If `route-client.test.ts` has no `sessionStorage`, it already stubs one for the existing pending-command tests; reuse that stub.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/route-client.test.ts`
Expected: FAIL — `travelRoute`/`travelBlock` not exported.

- [ ] **Step 3: Implement the client** — in `src/game/route-actions-client.ts`:

Add `RouteTravelInput` to the type import. Extend the union: `| { operation: 'travel'; input: RouteTravelInput }`. Replace the allowance check in `isRouteState` with a shared meter check and add the travel fields:

```ts
const isMeter = (v: unknown): boolean => isObject(v) && isNumber(v.available) && isNumber(v.capacity) && isNumber(v.refillEveryMs)
  && (v.nextRefillAt === null || isNumber(v.nextRefillAt));
const isQuote = (v: unknown): boolean => isObject(v) && (v.to === 'home' || v.to === 'r1') && Number.isSafeInteger(v.walk)
  && Number.isSafeInteger(v.cost) && Number(v.cost) > 0 && (v.mode === 'walk' || v.mode === 'land' || v.mode === 'flyer')
  && (v.via === null || typeof v.via === 'string');
```

In `isRouteState`, replace the two `v.allowance` lines with `if (!isMeter(v.allowance) || !isMeter(v.travel) || !Array.isArray(v.quotes) || !v.quotes.every(isQuote)) return false;`.

Add `export const travelRoute = (input: RouteTravelInput): Promise<RouteClientReply> => request('travel', input);` next to `searchRoute`, and add `'travel'` to the operation list in `readPendingRouteCommand`.

- [ ] **Step 4: Implement `travelBlock`** — append to `src/components/world/route-copy.ts`:

```ts
import type { MeterView } from '../../game/meter';
import type { TravelQuote } from '../../game/travel';

function waitText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Why a trip cannot start right now, or null. Mirrors the server's checks for a disabled button. */
export function travelBlock({ quote, travel, encounterOpen, now }: { quote: TravelQuote | null; travel: MeterView; encounterOpen: boolean; now: number }): string | null {
  if (encounterOpen) return 'Finish or leave your encounter before you travel.';
  if (!quote) return 'You can’t get there from here.';
  const missing = quote.cost - travel.available;
  if (missing <= 0) return null;
  const firstAt = travel.nextRefillAt ?? now;
  const readyAt = firstAt + (missing - 1) * travel.refillEveryMs;
  return `Not enough travel stamina. Enough to travel in ${waitText(readyAt - now)}.`;
}
```

(Move the imports to the top of the file with the existing ones.) Export `waitText` as well; Task 6 uses it.

- [ ] **Step 5: Run**

Run: `npx tsx scripts/route-client.test.ts && npx tsc -b`
Expected: `0 failed`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/route-actions-client.ts src/components/world/route-copy.ts scripts/route-client.test.ts
git commit -m "Validate travel state and send trips from the client"
```

---

### Task 6: Stamina meters in a persistent trainer bar

**Files:**
- Modify: `src/index.css` (new `--color-danger` token)
- Modify: `.agents/rules/styling.md` (token table row)
- Create: `src/components/ui/useServerClock.ts`
- Create: `src/components/ui/StaminaMeter.tsx`
- Rename: `src/components/HubTrainerBar.tsx` → `src/components/TrainerBar.tsx` (component `TrainerBar`, new optional `stamina` prop)
- Modify: `src/components/HubScreen.tsx` (takes a `trainerBar: ReactNode` prop instead of building one)
- Modify: `src/App.tsx` (builds the bar once; passes it to Hub and world)
- Modify: `src/components/world/RouteScreen.tsx` (renders `trainerBar` outside encounters)

**Interfaces:**
- Consumes: `RouteState.travel`, `.allowance`, `.serverNow`; `waitText` (Task 5).
- Produces: `TrainerBar` props `{ portrait; displayName; mentorName; balls?; stamina?: { travel: MeterView; actions: MeterView; serverNow: number }; onOpenSettings }`; `RouteScreenProps.trainerBar?: ReactNode`; `HubScreen` prop `trainerBar: ReactNode`.

- [ ] **Step 1: Token** — in `src/index.css`, after `--color-exp`, add `--color-danger: #ff7a7a;` (≥ 4.5:1 on `window` `#1e2740`). In `.agents/rules/styling.md`'s token table add the row `| \`danger\` | Debt and over-limit readouts (travel stamina below zero) |`.

- [ ] **Step 2: Clock hook** — `src/components/ui/useServerClock.ts`:

```ts
import { useEffect, useState } from 'react';

/** The server's clock now, advanced locally each second from the last `serverNow` received. */
export function useServerClock(serverNow: number): number {
  const [clock, setClock] = useState(() => ({ serverNow, elapsed: 0 }));
  useEffect(() => {
    const at = performance.now();
    const timer = window.setInterval(() => setClock({ serverNow, elapsed: performance.now() - at }), 1000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  return serverNow + (clock.serverNow === serverNow ? clock.elapsed : 0);
}
```

- [ ] **Step 3: Meter** — `src/components/ui/StaminaMeter.tsx`:

```tsx
import type { MeterView } from '../../game/meter';
import { waitText } from '../world/route-copy';

const SEGMENTS = 12;

/** One stamina meter: segmented fill, count, and time to the next point. Below zero reads as debt. */
export function StaminaMeter({ label, meter, now, fill }: { label: 'Travel' | 'Actions'; meter: MeterView; now: number; fill: 'bg-info' | 'bg-exp' }) {
  const debt = meter.available < 0;
  const lit = debt ? 0 : Math.ceil((Math.min(meter.available, meter.capacity) / meter.capacity) * SEGMENTS);
  const owed = debt ? Math.ceil((-meter.available / meter.capacity) * SEGMENTS) : 0;
  const wait = meter.nextRefillAt === null ? null : waitText(Math.max(0, meter.nextRefillAt - now));
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-2">
      <span className="font-label text-[9px] uppercase text-info">{label}</span>
      <div role="meter" aria-label={`${label} ${meter.available} of ${meter.capacity}${wait ? `, next in ${wait}` : ', full'}`}
        aria-valuenow={meter.available} aria-valuemin={debt ? meter.available : 0} aria-valuemax={meter.capacity} className="flex min-w-0 gap-px">
        {Array.from({ length: SEGMENTS }, (_, i) => <span key={i} className={`h-2 flex-1 ${i < lit ? fill : i < owed ? 'bg-danger' : 'bg-edge'}`} />)}
      </div>
      <span className={`font-label text-[10px] ${debt ? 'text-danger' : 'text-ink'}`}>{meter.available}/{meter.capacity}</span>
      <span aria-hidden="true" className="col-start-2 col-end-4 text-right font-label text-[9px] uppercase text-ink-dim">{wait ? `+1 in ${wait}` : 'Full'}</span>
    </div>
  );
}
```

- [ ] **Step 4: TrainerBar** — `git mv src/components/HubTrainerBar.tsx src/components/TrainerBar.tsx`; rename the export to `TrainerBar`; update its doc comment to "The trainer bar on the Hub and in the world: …, and both stamina meters once the world is activated."; add the prop `stamina?: { travel: MeterView; actions: MeterView; serverNow: number };` and render, as the last child of the `<header>` grid:

```tsx
      {stamina && <StaminaRows stamina={stamina} />}
```

with, in the same file (outside `TrainerBar`):

```tsx
function StaminaRows({ stamina }: { stamina: { travel: MeterView; actions: MeterView; serverNow: number } }) {
  const now = useServerClock(stamina.serverNow);
  return (
    <div className="col-span-3 flex flex-col gap-1 border-t-2 border-window-frame pt-1">
      <StaminaMeter label="Travel" meter={stamina.travel} now={now} fill="bg-info" />
      <StaminaMeter label="Actions" meter={stamina.actions} now={now} fill="bg-exp" />
    </div>
  );
}
```

(Import `MeterView` as a type, `useServerClock`, `StaminaMeter`.)

- [ ] **Step 5: Build the bar once in App** — in `src/App.tsx`, where `partyIds` is computed (just before `switch (phase)`), add:

```tsx
    const trainerBar = (
      <TrainerBar
        displayName={me.displayName || ''}
        mentorName={professorById(profile.mentor)?.name ?? 'Professor'}
        portrait={<TrainerPortrait avatarId={profile.avatarId} colors={profile.avatarColors} />}
        balls={world?.activated ? ballCount(world.inventory) : undefined}
        stamina={world?.activated ? { travel: world.travel, actions: world.allowance, serverNow: world.serverNow } : undefined}
        onOpenSettings={() => setPhase('account')}
      />
    );
```

Import `TrainerBar` (`./components/TrainerBar`), `TrainerPortrait`, `professorById` (`./game/professions`) and `ballCount` (`./game/items`) in `App.tsx` if not already imported. Pass `trainerBar={trainerBar}` to `HubScreen` and `RouteScreen`. In `HubScreen.tsx`, replace the `<HubTrainerBar … />` element with `{trainerBar}`, add `trainerBar: ReactNode` to its props, and drop imports that become unused (`HubTrainerBar`, `TrainerPortrait`, `professorById`, `ballCount` if unused elsewhere in the file). Keep the `onViewAccount` prop if anything else uses it; otherwise remove it from both sides.

- [ ] **Step 6: Render in the world** — in `RouteScreen.tsx` add `trainerBar?: ReactNode` to `RouteScreenProps` and destructuring; render `{page !== 'encounter' && trainerBar && <div className="m-2">{trainerBar}</div>}` directly after the `</header>` element.

- [ ] **Step 7: Verify**

Run: `npx tsc -b && npm run lint`
Expected: exit 0. Then `npm run dev:local`, sign in with a local account, and check the Hub, world map, Hearth Town and Sunny Meadow at 320, 375 and 430 px: both meters visible, no horizontal scroll, countdown ticks, "Full" at capacity. Set a debt to check its rendering: `sqlite3 local.db "update route_accounts set travel = -4, travel_refilled_at = $(date +%s000)"` (local file only, never `.env`'s Turso URL) and confirm red segments and `-4/12`; then restore with `update route_accounts set travel = null, travel_refilled_at = null`.

- [ ] **Step 8: Commit**

```bash
git add src/index.css .agents/rules/styling.md src/components/ui/useServerClock.ts src/components/ui/StaminaMeter.tsx src/components/TrainerBar.tsx src/components/HubScreen.tsx src/App.tsx src/components/world/RouteScreen.tsx
git commit -m "Show travel and action stamina in a trainer bar across the world"
```

---

### Task 7: Travel on the map; the server decides where the trainer is

**Files:**
- Create: `src/components/world/TravelPanel.tsx`
- Modify: `src/components/world/RouteScreen.tsx`
- Modify: `src/App.tsx` (remove `visitedPlace`)

**Interfaces:**
- Consumes: `travelBlock` (Task 5); `RouteCommand` `travel` (Task 5); `state.trainerAt`, `state.quotes`, `state.travel`.
- Produces: `TravelPanel` props `{ to: 'home' | 'r1'; state: RouteState; busy: boolean; onTravel: (to: 'home' | 'r1') => void }`. `RouteScreenProps` loses `location` and `onLocation`.

- [ ] **Step 1: TravelPanel** — `src/components/world/TravelPanel.tsx`:

```tsx
import type { RouteState } from '../../game/route-actions';
import { placeById, placeTitle } from '../../game/world';
import { useServerClock } from '../ui/useServerClock';
import { travelBlock } from './route-copy';

/** A place the trainer is not at: what it is, what the trip costs, and why it can't start yet. */
export function TravelPanel({ to, state, busy, onTravel }: { to: 'home' | 'r1'; state: RouteState; busy: boolean; onTravel: (to: 'home' | 'r1') => void }) {
  const now = useServerClock(state.serverNow);
  const place = placeById(to);
  const quote = state.quotes.find((q) => q.to === to) ?? null;
  const blocked = travelBlock({ quote, travel: state.travel, encounterOpen: state.activeEvent !== null, now });
  if (!place) return null;
  return (
    <section className="ui-window m-2 p-3">
      <h2 className="mb-2 font-label text-[11px] uppercase text-info">{placeTitle(place)}</h2>
      <p className="text-sm text-ink-dim">{place.blurb}</p>
      {quote && <p className="mt-2 text-sm">{quote.via ? `Riding ${quote.via}: ${quote.cost} travel (walking is ${quote.walk}).` : `Walking: ${quote.cost} travel.`}</p>}
      <button type="button" disabled={busy || blocked !== null} onClick={() => onTravel(to)} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">
        {quote ? `Travel · ${quote.cost}${quote.via ? ` (${quote.via})` : ''}` : 'Travel'}
      </button>
      {blocked && <p className="mt-2 text-sm text-ink-dim">{blocked}</p>}
    </section>
  );
}
```

- [ ] **Step 2: RouteScreen** — in `src/components/world/RouteScreen.tsx`:
  - Remove `location` and `onLocation` from `RouteScreenProps` and the destructuring. Add `const here = state?.trainerAt ?? 'home';` near the top of the component body and initialise `selected` with `entry?.place ?? here`.
  - Add the trip sender next to `search`:

    ```tsx
    const travel = (to: 'home' | 'r1') => {
      if (locked) return;
      void submit({ operation: 'travel', input: { requestId: newRouteRequestId(), to, partyIds } });
    };
    ```

  - In `submit`'s success path, before `if (command.operation === 'search' || …)`, add:

    ```tsx
    if (command.operation === 'travel') { setSelected(command.input.to); setPage(command.input.to); scrollToTop(); return; }
    ```

  - Opening a place only enters where the trainer stands; elsewhere it selects the place on the map:

    ```tsx
    const openPlace = (id: 'home' | 'r1', source: 'map' | 'list') => {
      scrollToTop(); setSelected(id); setFrom(source);
      setPage(id === here ? id : 'map');
    };
    // The town's road shows the trip and its cost on the map; it never spends on a tap.
    const walkTo = (id: 'r1') => { scrollToTop(); setSelected(id); setPage('map'); };
    ```

  - `WorldMap` gets `trainerAt={here}`.
  - On the map page, when `selected !== here`, render `<TravelPanel to={selected} state={state} busy={locked} onTravel={travel} />` instead of `TownSummary`/the Visit panel.
  - Guard the place pages (covers deep links from the Hub): `const awayFrom = (page === 'home' || page === 'r1') && page !== here ? page : null;`. When `awayFrom` is set, render `<TravelPanel to={awayFrom} state={state} busy={locked} onTravel={travel} />` in place of `TownView` / `SunnyMeadow`.

- [ ] **Step 3: App** — in `src/App.tsx` remove the `visitedPlace` state and its comment; pass `location={world?.trainerAt ?? 'home'}` to `HubScreen`; remove `onLocation` and `location` from `RouteScreen`.

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint`
Expected: exit 0. Browser check under `npm run dev:local` at 320/375/430 px:
1. New local account in town: Sunny Meadow on the map shows `Travel · 4`; tapping it lands in the meadow and Travel drops to 8.
2. The Hub's Sunny Meadow entries while in town open the travel panel, not search buttons.
3. Town's road to Sunny Meadow opens the map with the trip priced, spending nothing.
4. With an open encounter, the Hearth Town panel shows the encounter reason and a disabled button.
5. Put a Rapidash in the party (dev panel or Box) and confirm `Travel · 2 (Rapidash)`.
6. Spend to 0 in the meadow: the button is disabled with the wait; searches still work.

- [ ] **Step 5: Commit**

```bash
git add src/components/world/TravelPanel.tsx src/components/world/RouteScreen.tsx src/App.tsx
git commit -m "Travel between Hearth Town and Sunny Meadow from the map"
```

---

### Task 8: Copy, changelog, full gate, review

**Files:**
- Modify: `src/components/Guide.tsx`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Guide** — in `src/components/Guide.tsx`, in the section that explains Sunny Meadow actions (search the file for `action`), add a paragraph in the surrounding markup's style:

> **Travel.** Every trip between places costs travel stamina: 4 on foot. A Pokémon in your party that can carry you makes it cheaper — 2 on a land mount like Rapidash, 1 on a flyer like Pidgeot. Travel refills one point every 15 minutes, up to 12. Run out away from town and you stay where you are until it refills. Searching needs actions, and you can only search Sunny Meadow while you're there.

- [ ] **Step 2: Changelog** — under `## [Unreleased]` → `### Added` in `CHANGELOG.md`:

`- Travel stamina: trips between Hearth Town and Sunny Meadow cost travel points that refill over time, cheaper with a ride Pokémon in your party. The trainer bar shows Travel and Actions on the Hub and across the world.`

and under `### Changed`:

`- Sunny Meadow searches need you to be there; travel from the map first.`

- [ ] **Step 3: Full gate**

Run: `npm run lint && npm test && npm run build`
Expected: all exit 0. Record HEAD and results.

- [ ] **Step 4: Review** — this touches the claim path and schema, so run the `reviewer` subagent on `git diff <commit before Task 1>..HEAD`; fix every P0/P1 and re-run the gate.

- [ ] **Step 5: Commit**

```bash
git add src/components/Guide.tsx CHANGELOG.md
git commit -m "Explain travel stamina in the Guide and changelog"
```

Production `db:setup` (adds the three columns) and any push or release remain separate owner approvals.
