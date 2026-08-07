# Login Hub + Catch Collection (Slice A+B)

Status: approved design, ready for implementation.

## Goal

Turn Rental Rumble into a **login-required** collection game. After sign-in the
player lands on a **Hub** (their box of owned Pokemon + one big "start a run"
CTA). A new **Catch** run is a short, level-banded mission that mints a
**permanent, unique** Pokemon into the player's box and grants EXP to the owned
mons that fought. Classic **Rental** (draft pool -> Champion gauntlet) stays as a
second mode. Server/DB is authoritative for the box, EXP and catches.

Out of scope for this slice: week/season ladders, eternal vs seasonal boxes,
item/stat run modes, any auth-library swap (the existing custom auth stays).

## Locked product decisions

- Auth required; no guest play. Keep existing custom auth (`api/auth`, email +
  Discord/Google).
- Home = mixed Hub: collection strip + primary Start CTA -> Catch or Rental.
- Owned mons are **unique individuals** (each catch is its own row with its own
  level/exp/identity). Duplicates are separate pets.
- Catch run = short mission (a few auto-battles), ends in a rarity-weighted
  catch.
- Catch party = **owned mons only**, flexible size 1-6.
- Level = **fixed zone bands**, strict in-band eligibility (a mon's level must
  fall inside the zone's `[min,max]`).
- Onboarding = a one-time **tutorial catch** that always succeeds and grants a
  weak-pool mon (not a canonical starter).
- EXP is granted **only on a cleared run** in v1.
- A catch arrives near the zone floor level, so it joins the growth treadmill.
- Additive architecture: do **not** rewrite Rental into a unified run framework
  yet.

## Architecture

```
client (Vite/React)
  |-- api/auth/*            (unchanged; login required to reach the hub)
  |-- api/me/box            (new: list the signed-in player's owned mons)
  |-- api/catch/start       (new: validate party+zone, issue signed catch token)
  |-- api/catch/complete    (new: re-simulate, mint reward, grant EXP)
  '-- api/start-run + submit (unchanged Rental path)

Turso (libSQL): users (+ tutorial flag), owned_pokemon (new), pokedex_cells,
runs, auth_tokens.
Redis: rate limits + daily boards (unchanged).
```

Server authority mirrors the existing run-token design (`api/_token.ts`):

1. `POST /api/catch/start { zone, party }` — requires a session. Server loads the
   claimed owned ids, checks they belong to the user and that every level is in
   the zone band. It returns a server-chosen `seed` plus a signed **catch token**
   binding `{ uid, zone, partyIds, seed, nonce, iat }`.
2. Client plays the mission locally (short auto-battle sequence) for UX.
3. `POST /api/catch/complete { token }` — server verifies the token, re-loads the
   party, rebuilds the exact creatures (level-scaled), **re-simulates** the
   deterministic mission from the seed, and decides win/loss itself. On a clear it
   mints one `owned_pokemon` from the deterministic reward roll, grants EXP to the
   party mons, ORs the caught form into `pokedex_cells`, and returns the updated
   rows. The client cannot invent a reward or a win.

Because battles are deterministic given (teams, seed), the client's local
playthrough and the server's re-simulation agree. The shared, DOM-free logic
lives in game modules imported by both sides.

## Data model

Extend `db/schema.sql` (idempotent, additive):

```sql
create table if not exists owned_pokemon (
  id         text primary key,        -- app-generated uuid
  user_id    text not null,
  dex_id     integer not null,
  level      integer not null default 1,
  exp        integer not null default 0,
  sign       text not null,           -- zodiac sign (rolled at mint)
  ability    text,                    -- AbilityId or null
  build      text,                    -- 'physical' | 'energy' | null
  shiny      integer not null default 0,
  alt_color  integer not null default 0,
  emotion    text,                    -- portrait emotion name (cosmetic)
  origin     text not null default 'catch', -- 'tutorial' | 'catch'
  caught_at  integer not null default 0
);
create index if not exists owned_user_idx on owned_pokemon (user_id, caught_at desc);

-- tutorial completion flag
alter table users add column tutorial_catch_done integer not null default 0;
```

(The `alter table` is wrapped so a re-run that already has the column is a no-op;
`db-setup.ts` tolerates the duplicate-column error.)

## Shared game logic (client + server)

- `src/game/levels.ts` — level constants, `levelStatMult(level)`,
  `scaleCreatureToLevel(creature, level)`, EXP curve
  (`expToNext`, `applyExp`), and `levelFromExpTotal` helpers.
- `src/game/zones.ts` — the fixed zone table (`CATCH_ZONES`), `zoneById`,
  `isPartyEligible(levels, zone)`, and the per-zone rarity + reward-level config.
- `src/game/catch.ts` — deterministic mission + reward:
  `buildCatchMission(seed, zone, dex)` (foe teams),
  `simulateCatchMission(party, seed, zone)` (uses `simulateBattle`),
  `rollCatchReward(seed, zone, dex)` (dex id + variant + sign + level), and
  `mintCreatureFromReward` to turn a reward into a `Creature` for display.
- `src/game/box.ts` — the `OwnedMon` type, `ownedMonToCreature(mon)` (build a
  battle-ready `Creature` scaled to the mon's level), and client fetch/start/
  complete wrappers (like `src/game/account.ts`).

## Server modules

- `api/_catchtoken.ts` — `signCatchToken` / `verifyCatchToken` (same HMAC
  construction as `_token.ts`), reusing `getTokenSecret()`.
- `api/_db.ts` — add `OwnedMonRow` mapping + `readOwnedByUser`,
  `readOwnedByIds`, `insertOwned`, `applyExpToOwned` helpers.
- `api/catch/[action].ts` — `start` and `complete` behind one dynamic function
  (Hobby 12-function cap), rate-limited like `start-run` / `record-run`.
- `api/me/[action].ts` — add a `box` action returning the owned list.

## Client surfaces

- `src/App.tsx`: on load `fetchMe()`; if signed out, render the new
  `LoginScreen` (no other phase reachable). If signed in, `hub` is the home
  phase. Add phases: `hub`, `catchSetup`, `catchBattle`, `catchResult`.
- `LoginScreen` — full-bleed branded front door (email/OAuth), reusing the
  existing `account.ts` `login`/`signup`/`oauthUrl`.
- `HubScreen` — brand hero, owned-box strip (recent/strongest), and the primary
  run CTA (Catch / Rental) plus secondary links (Ladder, Dex, Guide, Account).
- `CatchSetupScreen` — pick a zone (locked bands) then pick a legal 1-6 party
  from the box; first-ever visit routes through the tutorial mission.
- Catch battles reuse `BattleScreen`; `CatchResultScreen` shows the minted mon
  and any level-ups, then returns to the Hub.
- Rental keeps Draft -> Map -> Battle -> Recruit -> Result, launched from the
  Hub and returning to it.

## Level / battle integration

`simulateBattle` takes a single `playerStatMult`/`foeStatMult`, so per-mon levels
are baked into the creature's `stats` before simulation via
`scaleCreatureToLevel` (a pure copy). This leaves `battle.ts` untouched. Zone foe
teams are built with `buildOpponentTeam` and scaled to the zone's mid level the
same way. Catch fights run at neutral multipliers (1x) so difficulty comes from
levels and zone scaling, not the Rental hero edge.

## Testing

Add `scripts/*.test.ts` (run by `npm test`, tsx assert style like the existing
tests):

- `zones.test.ts` — band eligibility (in-band accepted, out-of-band rejected),
  reward level within band, rarity table sums to ~1.
- `levels.test.ts` — EXP curve monotonic, `applyExp` rolls over levels correctly
  and clamps at max, `levelStatMult` monotonic.
- `catch.test.ts` — `rollCatchReward` deterministic for a seed; mission is
  deterministic; a strong party clears an early zone.

## Anti-cheat summary

- No catch or EXP without a session cookie.
- No catch without first calling `/start` (signed token; no valid token via raw
  curl).
- Party ownership + level band validated server-side at `/start` and re-checked
  at `/complete`.
- Reward identity and win/loss are re-derived/re-simulated server-side from the
  seed; the client outcome is never trusted.
- Rate limits mirror `start-run` / `record-run`; a `MIN_CATCH_MS` floor blocks
  instant scripted completes.

## Non-goals (restated)

Week/season leaderboards, eternal/seasonal box split, item/stat/battle mission
modes beyond Catch + Rental, Better Auth / guest mode, unified RunMode rewrite.
