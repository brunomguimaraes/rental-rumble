# Travel and action stamina

Status: design approved by the owner in conversation on 2026-10-01; this written spec awaits review. Balance
numbers are first-pass defaults, not measured. Production `db:setup` and release remain separate approvals.

The trainer has two stamina meters, shown in a persistent trainer bar. **Actions** is the existing Sunny Meadow
search allowance, unchanged except for its name and display. **Travel** is new: every trip between map places
costs travel stamina, including the trip home. Ride-capable Pokémon in the party and vehicles in the Bag make
trips cheaper. A whiteout carries the trainer home at full walking cost and can push the meter into debt, so a
careless run costs real recovery time. The server owns both meters, the trainer's location, and every trip.

## Acceptance criteria

1. Every activated account has a travel meter (capacity 12, +1 every 15 minutes) and a server-stored location
   (`home` or `r1`), both returned in `RouteState`.
2. A trip moves the trainer to a neighbouring place and debits the cheapest available mode's cost exactly once,
   including on retries and concurrent requests.
3. A trip is rejected, with nothing spent, when the meter is below the cost, the destination is not a neighbour,
   or an encounter is unresolved.
4. A Sunny Meadow search is rejected, with nothing spent, unless the trainer is at `r1`.
5. A whiteout moves the trainer to `home` and debits the full walking cost, ignoring mounts and vehicles, even
   below zero.
6. The trainer bar shows Travel and Actions, each with its next-refill time, on the Hub, world map, Hearth Town,
   and Sunny Meadow. A negative travel meter reads as debt.
7. The map's travel button shows the cost and the mode that sets it, and explains why it is disabled.
8. Accounts created before this ships keep their location and start with a full travel meter.

## Out of scope

Travel between non-adjacent places, multi-hop routing, flying shortcuts, water routes and swimming mounts,
travel time or countdowns, stamina items or purchasable refills, an explicit mount selector, action-stamina
penalties, and changes to the action allowance's numbers.

## Rules

### Travel meter

| Rule | Value |
| --- | --- |
| Capacity | 12 |
| Refill | +1 every 15 minutes (empty to full in 3 hours) |
| Starting value | 12, for new accounts and on backfill |
| Floor | `-capacity` (only a whiteout can go below 0) |

The meter projects like the action allowance: at capacity there is no banked overflow; below capacity it gains
one point per whole elapsed interval since `refilledAt`. A negative meter refills the same way. The refill math is
shared with the action allowance in `src/game/`, not copied.

### Trips

A trip goes from the trainer's location to one of its `neighbours`. It is instant: pay, and the trainer is there.
Each map link has a walking cost; Hearth Town ↔ Sunny Meadow is **4**. Cost is symmetric.

| Mode | Cost | Requires |
| --- | --- | --- |
| Walk | walking cost | nothing |
| Bike | `ceil(walk / 2)` | a Bike in the Bag (slice 3) |
| Land mount | `ceil(walk / 2)` | a land ride species in the saved party, not fainted |
| Flyer | `ceil(walk / 4)` | a flying ride species in the saved party, not fainted |

Every mode costs at least 1. The cheapest available mode is used automatically; discounts do not stack. Ties
prefer flyer, then land mount, then Bike, so the displayed mode is stable. The quote names the mode and the mount's
species, or the item.

"Not fainted" uses `isFainted` from the persistent-HP work once it is merged; until then every party member counts
as able to carry.

### Ride species

Species-level, by national dex ID, in `RIDE_SPECIES`. Regional forms follow their dex ID.

- **Land:** Ponyta (77), Rapidash (78), Rhyhorn (111), Rhydon (112), Tauros (128), Arcanine (59), Stantler (234),
  Donphan (232), Mudsdale (750), Gogoat (673), Wyrdeer (899).
- **Flyer:** Fearow (22), Pidgeot (18), Charizard (6), Aerodactyl (142), Dragonite (149), Skarmory (227),
  Altaria (334), Flygon (330), Salamence (373), Staraptor (398), Togekiss (468), Braviary (628),
  Talonflame (663), Noivern (715), Corviknight (823).

### Out of stamina

With too little travel stamina for any mode, the trainer stays put. Route searches still work there if Actions
allow. No stamina is ever borrowed for a voluntary trip.

### Whiteout

When a loss wipes the party, the trainer is carried to `home` and charged the full **walking** cost from where
they fainted, with no mount or Bike discount, clamped at the floor. From Sunny Meadow with an empty meter this
leaves −4: eight refills, two hours, before walking out again. Action stamina is untouched. This replaces the
persistent-HP spec's "no other penalty" whiteout.

### Actions

The existing allowance (capacity 48, +1 every 10 minutes, 1 per search) is unchanged and renamed **Actions** in
the UI. New rule: a search requires the trainer to be at the searched route.

### Encounters and travel

An unresolved encounter keeps the trainer on its route. Finish or leave it before travelling. Viewing the map,
Box, or party remains free and does not abandon it.

## Data

New `route_accounts` columns, added through `COLUMN_ADDS` in `api/_db.ts`:

| Column | Type | Meaning |
| --- | --- | --- |
| `travel` | integer, nullable | travel meter; may be negative down to `-capacity` |
| `travel_refilled_at` | integer, nullable | epoch ms of the meter's last projection |
| `location` | text, nullable | `home` or `r1` |

Null means "not backfilled": read it as a full meter at `now` and the location `RouteState` derives today
(`r1` if the account has route events or its last route was `r1`, else `home`). The first write that touches the
row persists the backfilled values. The change is additive: deployed code ignores the new columns. New code
reads them as null when absent and treats that as the backfill; a write that needs them before `db:setup` has
run fails into the action's 503, never a crash. `RELEASING.md`'s checklist runs `db:setup` before deploy. A
range check on `travel` lives in the write path: the shared spend function never produces a value outside
`[-capacity, capacity]`.

## Server

- **`travel` action** in `api/world/[action].ts`, routed through `mutate` and `writeCommand` like `search`:
  POST, gate, per-user rate limit, request receipt. Body `{ requestId, to, partyIds }`, validated as `unknown`.
  `partyIds` must match the saved party, as for a search.
- Inside the transaction: read the account, party, inventory, and active encounter; reject an unresolved
  encounter (409), a non-neighbour `to` (400), or too little stamina (400); compute the quote from owned rows,
  never from the body; persist the new meter and `location`; return the fresh `RouteState`.
- A replayed `requestId` returns the original reply without another debit.
- **`search`** rejects with 400 unless `location` matches `locationId`, before spending an action.
- **Whiteout**, in the route battle settlement from the persistent-HP work, applies the forced walk debit and
  sets `location = 'home'` in the same transaction as the HP write.
- **`RouteState`** gains:
  - `travel: { available, capacity, refillEveryMs, nextRefillAt }`
  - `trainerAt` read from `location`
  - `quotes: { to, walk, cost, mode, via } []` for each neighbour, so the client never computes cost.

Error strings are player-facing: "Not enough travel stamina — next point in 12 min.", "Finish or leave your
encounter before you travel.", "You can only search Sunny Meadow while you're there."

## Client

- **`TrainerBar`** (from `HubTrainerBar`) renders on the Hub, world map, Hearth Town, and Sunny Meadow; Battle,
  Pokédex, and Box stay full-screen without it. Two meters, Travel and Actions, as segmented Night bars
  (`StatBar`-style, `exp` fill for Actions, `info` fill for Travel) with `font-label` counts and a next-refill
  countdown. Debt renders the overdrawn segments in a danger state with the count shown negative. Each meter has
  an accessible label: "Travel 9 of 12, next in 6 min".
- **Map panel:** the travel button reads `Travel · 2 (Rapidash)` from the server quote. Disabled states give the
  reason and the refill time. Travel calls a new `travel` helper in `route-actions-client.ts` (never throws,
  returns `{ ok, error? }`) and renders the returned state.
- **`App.tsx`** stops using `visitedPlace` as location truth; it renders `trainerAt` from the server and keeps only
  UI selection locally.
- Countdowns tick from `serverNow` offset, as the action allowance does today.

## Delivery slices

1. **Travel core:** shared rules, columns and backfill, `travel` action, search location check, `RouteState`
   fields, trainer bar meters, map travel button. Ride Pokémon only.
2. **Whiteout debt:** after `pokemon-center` merges into `development`; adds the forced walk and debt rendering.
3. **Bike:** after `market` merges; a `bike` key item (not consumable, quantity 0 or 1) sold in the market, and
   the Bike mode in quotes.

Each slice updates `CHANGELOG.md`'s `[Unreleased]` section and the Guide copy for what it adds.

## Tests

| Layer | Case |
| --- | --- |
| Rules (`scripts/travel.test.ts`) | Each mode's cost and rounding; minimum 1; cheapest wins with the tie order. |
| Rules | A fainted mount gives no discount; a non-ride species gives none. |
| Rules | Refill to cap, no overflow; recovery from −4 takes 8 intervals; spend never exceeds the floor. |
| Database | A trip debits once and moves the trainer; a retried `requestId` returns the same reply with no debit. |
| Database | Rejected for low stamina, non-neighbour, and unresolved encounter, with nothing written. |
| Database | A search away from `r1` is rejected with no action spent. |
| Database | A null-column account backfills to a full meter at its derived location. |
| Database | A body that names a cheaper mode or cost changes nothing; the server's quote applies. |
| Database (slice 2) | A wipe leaves `location = 'home'` and the meter debited by the walk cost, below zero. |
| Browser | Trainer bar and travel button at 320, 375, and 430 px, including debt and disabled states. |

## Risks

- Two hours of debt after a wipe is the point, but may feel harsh once routes are further apart. Track wipes and
  time-to-next-trip as playtest signals before changing the floor.
- Requiring presence to search changes an existing flow; the map must make "travel there first" obvious.
