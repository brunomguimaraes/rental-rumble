# Pokémon Center and persistent HP

Status: design approved in chat by the owner on 2026-10-01; this written spec awaits review. Production
`db:setup` and release remain separate approvals.

Pokémon keep the HP they end a battle with. A Pokémon at 0 HP is fainted and sits out battles. Losing a
battle sends the trainer back to Hearth Town (whiteout). The Pokémon Center in Hearth Town heals every owned
Pokémon to full, instantly and for free. This gives Sunny Meadow a reason to come home.

## Confirmed direction

| Decision | Ruling |
| --- | --- |
| HP between battles | Persists per owned Pokémon. Replaces "keep current HP reset behavior" from the Sunny Meadow spec. |
| Healing | Instant and free at the Pokémon Center. No action cost, no timer. |
| Party wipe | Whiteout: the trainer returns to Hearth Town. No other penalty (there is no currency). |
| Other recovery | Center only. No passive regen; the Box does not heal. Potions come in a later slice. |
| Heal scope | Every owned Pokémon, party and Box. |
| EXP after a win | Only members still standing at the end of the battle earn EXP. |
| Heal during an encounter | Refused until the encounter is finished or left. |

## Rules

- **Current HP.** Each owned Pokémon stores `hpLost`, the damage it carries in battle-engine HP units. Its
  max HP is the engine's value for that individual at the player's stat multiplier (1): sign spread, shiny
  factor, and growth-scale stats included. Current HP = `max(0, maxHp − hpLost)`. Absent `hpLost` means 0
  (full health).
- **Fainted.** A Pokémon is fainted when `hpLost ≥ maxHp`. A fainted Pokémon earns no EXP, so its max HP
  cannot change while it is fainted.
- **Battles.** A route battle fields only the party members that are not fainted, in party order, each
  starting at its current HP. After the battle, every fielded member's `hpLost` becomes `maxHp − finalHp`.
  Members that did not fight are unchanged. The wild or trainer foe always starts at full HP.
- **Searching.** A Sunny Meadow search needs at least one party member that is not fainted. Otherwise it
  is rejected with 400 before any action is spent: "Your party needs care. Visit the Pokémon Center in
  Hearth Town." Editing the party to bring in healthy Box Pokémon is allowed.
- **Winning.** EXP goes, under the existing growth seam and falloff, to fielded members that end the
  battle above 0 HP. Members that fainted mid-battle and members that sat out get no EXP. A win still
  opens the catch phase for wild encounters, as today.
- **Losing (whiteout).** A loss means every fielded member has fainted, so the whole party is fainted. The
  encounter resolves as `lost`, as today, and the trainer's position becomes Hearth Town (`home`). The
  result reads: "Your party is out of strength. You hurried back to Hearth Town." Nothing else is taken.
  Following the travel-stamina spec, that position is travel's `location`; its whiteout walking debit
  arrives with travel slice 2.
- **Growth and evolution.** `hpLost` is kept through growth, so current HP rises by the max-HP increase.
- **New Pokémon.** Caught, gifted, and starter Pokémon start at full HP (`hpLost` 0).
- **Healing.** The Center sets `hpLost` to 0 on every owned Pokémon of the account in one statement. It
  costs no action and no item. It is refused (409) while a route encounter is unresolved. Healing when
  nothing is hurt succeeds and changes nothing. Following the travel-stamina spec (home is never free), the
  trainer must already stand in Hearth Town: elsewhere it is refused (409, "Walk back to Hearth Town to
  visit the Pokémon Center.") and healing never moves the trainer.

### Out of scope

Potions and other healing items, status conditions (poison, burn, …) that persist after a battle, any
whiteout penalty, healing timers, passive regen, and Box healing outside the Center. Keep the heal path a
single server helper so a later Potion can reuse it for one Pokémon.

## Server and data

### Schema (additive)

`COLUMN_ADDS` in `api/_db.ts`:

- `alter table owned_pokemon add column hp_lost integer not null default 0`. Existing rows read as full
  health. There is no backfill.
- No position column of its own: where the trainer stands is travel stamina's `route_accounts.location`
  (`docs/superpowers/specs/2026-10-01-travel-stamina-design.md`), the one trainer position.

Reads use `select *`, so code running before `db:setup` sees no `hp_lost` and treats every Pokémon as
healthy. Writes that set `hp_lost` fail with the usual 503 until `db:setup` runs, and
login, Hub, Box, and Pokédex stay usable. The release checklist runs `db:setup` before the deploy that
ships this. No unique index is added. The change is additive and does not break the save format (minor
version).

`rowToOwned` maps `hp_lost` to `hpLost` (`Number(...) || 0`, never negative). Write `hp_lost` only through
one `api/_db.ts` helper that updates a set of the user's owned rows by id, scoped by `user_id`, plus one
`healAllOwned(tx, uid)` statement.

### Shared rules (`src/game/`)

- `OwnedMon.hpLost?: number` in `box.ts`.
- A pure `ownedMaxHp(mon)` (and `currentHp`, `isFainted`) built on the engine's own `makeBattler` maxHp,
  so the bar the player sees and the battle can never disagree.
- `simulateBattle` gains an optional `playerStartHp?: number[]` (per player creature, clamped to
  `1..maxHp`), and `BattleResult` gains `playerHp: number[]`, the final HP of each player creature in input
  order. All existing callers pass nothing and behave exactly as today. Pinned-seed outcomes for
  full-health battles must not change.
- `simulateRouteBattle` fields the non-fainted snapshot members with their start HP and returns each
  fielded member's final HP with the battle.

### Route actions (`api/_route-actions.ts`)

- **search:** after the party check, reject an all-fainted party (400, nothing spent). The frozen party
  snapshot includes each member's `hpLost`.
- **choose → battle:** battle with the snapshot's HP. In the same transaction as growth, write each
  fielded member's new `hpLost` to the current owned row, if it is still owned, and pass only survivors to
  `planGrowth`. On a whiteout, set `location = 'home'` through the travel write, with no travel
  debit until travel slice 2 adds it. The snapshot HP equals current HP because healing is
  refused during an encounter and there is only one active encounter.
- **heal (new):** `healParty(db, uid, requestId, now)` through `writeCommand`, so it gets receipts,
  revision, and the same-payload retry behavior. Refuse with 409 when an encounter is active, then with
  409 when `location` is not `home` (travel-stamina spec), writing nothing. Otherwise run `healAllOwned`
  and return `{ state, box }`; the trainer's place is unchanged.
- **state:** `trainerAt` is travel's `location`. Searches never move the trainer; trips do (travel-stamina spec).
- Old stored events with a party snapshot that lacks `hpLost` battle at full health. `rulesVersion` stays 2.

### API (`api/world/[action].ts`)

Add `heal` to the mutating actions, following the existing order: `requirePost`, gate, per-user rate
limit, `{ requestId }` validated through `validRouteRequestId`, then `healParty`. Use existing codes: 400
invalid input, 401 no session, 409 encounter active or request id reused with another payload, 429 rate
limited, 503 database failure. `scripts/dev-api.ts` already routes the `world` area.

## Screens

- **Hearth Town:** the Pokémon Center card opens a Center view inside the town page instead of the party
  screen. Other cards are unchanged.
- **Center view (Night UI):** a short nurse greeting, the party list with an HP bar and current/max
  numbers, a FNT mark on fainted members, and a count of hurt Pokémon in the Box. Include a **Heal my
  Pokémon** button (disabled while in flight, when nothing is hurt, or when an encounter is active, with
  the reason shown), a confirmation line after healing, and links to Party and Box. Handle loading,
  error, and the server's `error` string. It works at 320–430 px.
- **HP everywhere the party is shown:** the Sunny Meadow party strip, the party editor, the encounter's
  party panel, and Box details show the HP bar and FNT. HP numbers are shown; levels stay hidden.
- **Sunny Meadow:** with an all-fainted party, the search buttons are disabled with the reason and a link
  back to Hearth Town's Center.
- **Battle replay:** players send out at their stored HP, which the engine's send-out snapshots already
  carry.
- **Result:** a loss shows the whiteout line and a way to Hearth Town. A win lists members that fainted
  mid-battle as fainted, with no EXP line.
- **Guide copy** explains HP carry-over, fainting, whiteout, and the Center. Add a line to `CHANGELOG.md`
  `[Unreleased]`.

## Testing

Extend the existing scripts; add a file only for new behavior, registered in `package.json`.

| Contract | Evidence |
| --- | --- |
| Engine start/final HP | A pinned seed with `playerStartHp` starts the battler at that HP and reports final HP; full-health battles keep their exact pinned outcomes. |
| Max HP agreement | `ownedMaxHp` equals the battle's send-out `maxHp` for a shiny and a non-shiny individual. |
| HP persists | After a route win, fielded members' `hp_lost` matches the battle's final HP; non-fielded members are untouched. |
| Fainted members sit out | A party with one fainted member fields only the others. |
| All-fainted search | Rejected with 400, no action spent, no event created. |
| Whiteout | A loss leaves every party member fainted and `trainerAt` `home`; no EXP. |
| EXP survivors only | A win where one fielded member fainted grows only the survivors. |
| Heal | Heals party and Box rows to full and sets `home`; a same-id retry returns the receipt; reused id with a different payload → 409; refused with an active encounter; scoped to the user (another account's hurt Pokémon stay hurt). |
| Old rows | A row without `hp_lost` and an old event snapshot without `hpLost` read and battle at full health. |
| Response shape | `heal` returns `{ ok: true, state, box }` with `hpLost` on box rows. |

The existing world balance gate (single battles from full health) must still pass. Persistent damage makes
long sessions harder by design; note win streaks before whiteout as a playtest metric, and change no foe
strength in this slice.

Run focused scripts, then `npm run lint && npm test && npm run build`, a browser check under
`npm run dev:local` at 320 and 430 px, and the `reviewer` subagent on the integrated diff (growth path and
schema) before committing.

## Repository evidence

Reviewed against `development` at `71ea9098`: `src/game/town.ts` (Center links to party),
`src/game/battle.ts` (`makeBattler` sets `hp = maxHp`), `src/game/route-rules.ts` (`simulateRouteBattle`),
`api/_route-actions.ts` (search, choose, `writeCommand`, derived `trainerAt`), `api/_db.ts`
(`COLUMN_ADDS`, `rowToOwned`, `select *`), and `db/schema.sql`. This spec supersedes the Sunny Meadow
spec's "Keep current HP reset behavior between battles" line and the art README's statement that the
Center does not heal.
