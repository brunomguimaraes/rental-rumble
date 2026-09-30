# Slice 1 — Trainer onboarding + idle auto-battle (and Rental removal)

Status: draft for review. Source of truth for the overall game is the living
Game Design Document (Claude Doc `47af7c97-2c60-401a-be74-42f3ff3cfb3a`); this
spec covers only slice 1 of its roadmap and must not contradict it.

## Goal

After this slice a brand-new player can: log in, pick the Trainer profession,
pick one of four professors, receive that professor's fixed weak starter, play a
guided tutorial battle and a guided first catch, send their trainer out on
Route 1 for up to 8 hours of idle auto-battles, come back, read the log, and
watch their party level up and evolve. Everything Rental (draft gauntlet, relics,
daily Champion board, Throne, Hall of Shame, My Runs) is deleted in the same
slice so the codebase contains one game.

Out of scope (later slices): throwing balls at met Pokémon (slice 2), affection
and affection-gated evolution (slice 3), milestones and Route 2 unlock (slice 3),
Hall of Fame (slice 4), guide rewrite and hub art (slice 5), professions other
than Trainer.

## Locked decisions (from the GDD, 2026-09-30)

- Rental, relics, Throne, Hall of Shame are removed now, not kept as a side mode.
- Idle cap is 8 hours of real time, 1x speed, no speed-ups.
- A lost idle battle ends the session.
- Four professors: Oak (Caterpie line), Elm (Hoppip line), Birch (Wurmple line,
  branch is a luck roll), Rowan (Starly line). Each starter line has 3 stages.
- Every Pokémon is a unique individual (existing `owned_pokemon` row model).
- Server is authoritative for every outcome; the client renders.

## Part A — Remove Rental

**Delete** the following. Sprites that only Rental used stay in `public/` for
now; pruning them is a slice 5 item.

- API: `api/start-run.ts`, `api/submit-win.ts`, `api/submit-loss.ts`,
  `api/leaderboard.ts`, `api/challenge-king.ts`, `api/hall-of-shame.ts`,
  `api/_token.ts` run-token parts that are Rental-only (keep `getTokenSecret`,
  `newSeed`, `newNonce`, `NONCE_TTL_SECONDS`; move them to `api/_secret.ts` if
  the rest of the file goes).
- `api/me/[action]`: remove `record-run` and `runs` actions.
- Game modules: `leaderboard.ts`, `opponents.ts`, `relics.ts` (see engine note),
  `specials.ts`, `hallOfShame.ts`, `gagName.ts`, `shareCard.ts`,
  `progression.ts`, `run.ts` (see constants note).
- Components: `TitleScreen`, `DraftScreen`, `MapScreen`, `ItemEventScreen`,
  `RecruitScreen`, `ResultScreen`, `ThroneResultScreen`, `LadderScreen`,
  `ShameScreen`, `HistoryScreen`, `HallOfShame`, `Leaderboard`,
  `ChampionSpotlight`, `DailyCountdown`, `RelicStrip`, `MyRunsScreen`, and any
  helper only they used (`CupIcon`, `TeamPortrait` if unreferenced after).
- Tests: `throne.test.ts`, `relics.test.ts`, `progression.test.ts`.
  `species-lock.test.ts` stays (it covers `pokemon.ts`). `sim-check.ts`,
  `tank-check.ts`, and `balance-audit.ts` (gauntlet simulators) go;
  `audit-trainers.ts` stays (sprite roster audit).
- Guide: `src/guide/pages/runs.mdx` and Rental references in `overview.mdx`.
  Full rewrite is slice 5.
- `AccountScreen`: remove the runs/wins/losses stats and My Runs link.

**Engine note.** `battle.ts` imports `relics.ts` (mods on every Battler),
`run.ts` (`Difficulty` for foe move focus), and `specials.ts`
(`buildFamousTeam`). Changes:

- Delete `buildFamousTeam` and `buildChampionTeam`, `championFoeStatMult`,
  `CHAMPION_DIFFICULTY_MULT`, `TIER_STAT_MULT`, `PLAYER_STAT_MULT`.
- Move `Difficulty` into `battle.ts` as an internal type with the same four
  values; `simulateBattle` keeps the `difficulty` option (default `'normal'`).
- Relics: the player-facing feature is gone. To avoid a risky edit through the
  damage formula in this slice, `relics.ts` is reduced to `identityMods()`,
  `RelicMods`, and `relicDamageMult()`, and `simulateBattle` drops its
  `playerRelics`/`foeRelics` options. Removing the mods plumbing entirely is a
  slice 5 cleanup item.
- `catch.ts` imports `SHINY_CHANCE` and `ALT_COLOR_CHANCE` from `run.ts`; they
  move to a new `src/game/odds.ts`. `gens.ts` stays (dex metadata used by
  `pokemon.ts`).

**Database.** No drops. The `runs` table and `users.runs/wins/losses` columns
stop being written and are ignored. `pokedex_cells` stays.

**Redis.** Kept for rate limits only. The daily-board keys are simply no longer
written.

**Function count after this slice:** `auth`, `me`, `idle` = 3 (from 8).

## Part B — Trainer onboarding

### Data

New table (additive, in `db/schema.sql`):

```sql
create table if not exists profiles (
  user_id       text primary key,
  profession    text not null,               -- 'trainer' (others later)
  mentor        text not null,               -- 'oak' | 'elm' | 'birch' | 'rowan'
  starter_id    text not null,               -- owned_pokemon.id of the starter
  current_route text not null default 'r1',
  created_at    integer not null default 0
);
```

`owned_pokemon` additions (wrapped `alter table`, like the earlier tutorial flag):

```sql
alter table owned_pokemon add column nickname text;
```

`origin` gains the value `'starter'` (existing values `'tutorial'`, `'catch'`).

### Shared game logic

`src/game/professions.ts`:

- `PROFESSIONS`: `trainer` (live) plus `breeder`, `ranger`, `researcher` as
  `locked: true` entries with a one-line teaser. Only `trainer` is accepted by
  the API.
- `PROFESSORS`: `oak` → base dex 10 (Caterpie), `elm` → 187 (Hoppip),
  `birch` → 265 (Wurmple), `rowan` → 396 (Starly). Each has `name`, `blurb`,
  `bias` text, and `spriteKey` (Oak and Elm exist in `trainers.gen.ts`; Birch
  and Rowan use the generic professor fallback until sprites are added).
- `STARTER_LEVEL = 5`.
- `rollStarter(seed, professor): MintSpec` — reuses the identity roll from
  `catch.ts` (extract `rollIdentity(species, rng): Omit<MintSpec, 'dexId' | 'level'>`
  so starter, tutorial, and catch all share one roll). Seed is
  `starter:${uid}` so a retry mints the same starter.

`src/game/evolution.ts` (new, wraps `evolutions.gen.ts`):

- `evolutionLevel(dexId): number | null` — the level at which this species
  evolves. Starters override: stage 1 → 2 at level 8, stage 2 → 3 at level 16.
  Every other species: first evolution at 16, second at 32, none for final forms.
- `evolveOwned(mon, rng): OwnedMon` — picks the target (branch chosen by `rng`
  for branched lines), swaps `dexId`, re-rolls `ability` for the new species
  with `rollAbility`, keeps sign, build, shiny/alt, emotion, nickname, level,
  exp. Pure.
- `applyGrowthWithEvolution(mon, gained, rng): { mon, levelUps, evolutions }` —
  `applyExp` then evolve as many times as thresholds were crossed.

Affection gating is added in slice 3; in this slice evolution is level-only.

### API (`api/me/[action]`, new actions)

- `GET /api/me/profile` → `{ ok, profile | null }`. `null` means "needs
  onboarding".
- `POST /api/me/onboard { profession: 'trainer', mentor }` → creates the
  profile row and mints the starter (`origin: 'starter'`, level 5) in one
  transaction. Rejects if a profile already exists. Returns `{ profile, starter, box }`.
- `POST /api/me/nickname { id, nickname }` → 1–12 chars, trimmed; only the
  owner's rows.
- The existing `box` action stays.

### Tutorial

Reuses the existing catch endpoints, moved under `idle` (see Part C):

1. **Tutorial battle** — a live, watched battle: the starter vs one level-3 wild
   from a fixed weak pool (Rattata, Pidgey, Sentret, Zigzagoon, Bidoof), seed
   `tutorial:${uid}`. The outcome does not matter; the copy frames a loss as
   "your partner needs training" and continues. Uses `BattleScreen` with a
   `wild` opponent (see Part D).
2. **Guided first catch** — the existing tutorial reward path
   (`rollTutorialReward`, `origin: 'tutorial'`, always succeeds), now called
   `POST /api/idle/tutorial-catch`. Allowed only when the box holds exactly the
   starter.

Onboarding is complete when `profile` exists and the box has 2 rows. The client
derives this; no extra flag.

## Part C — Idle auto-battle

### Data

```sql
create table if not exists idle_sessions (
  id          text primary key,
  user_id     text not null,
  route_id    text not null,
  party_ids   text not null,                 -- JSON array of owned ids, in order
  seed        text not null,
  started_at  integer not null,
  claimed_at  integer,                       -- null while open
  stopped_by  text,                          -- 'cap' | 'loss' | 'early'
  encounters  integer not null default 0,
  log         text                           -- JSON, compact, written on claim
);
create index if not exists idle_user_open_idx on idle_sessions (user_id, claimed_at);

create table if not exists encounters (
  session_id  text not null,
  slot        integer not null,
  dex_id      integer not null,
  level       integer not null,
  won         integer not null default 0,
  resolved    integer not null default 0,    -- slice 2: a throw happened
  primary key (session_id, slot)
);
```

One open session per user (`claimed_at is null`), enforced at `start`.

### Shared game logic

`src/game/routes.ts` replaces `zones.ts`:

```ts
interface Route {
  id: 'r1' | 'r2';
  name: string; blurb: string;
  min: number; max: number;      // party level band, inclusive
  foeLevel: number;              // wild level, ±1 jitter from the seed
  paceMs: number;                // real time per encounter
  maxEncounters: number;         // hard cap per session
  expPerWin: number;             // to every party member per won battle
  pool: 'weak' | 'early';        // wild species pool (bst window, like rewardPool)
  unlock: 'start' | 'milestone:r1'; // r2 stays locked in this slice
}
```

Route 1: band 1–12, foeLevel 4, pace 3 min, max 100, expPerWin 6, pool weak.
Route 2 is defined (band 8–20, foeLevel 12) but `unlock: 'milestone:r1'` keeps
it locked until slice 3.

`IDLE_CAP_MS = 8h`. `encountersFor(elapsedMs, route) = min(floor(elapsed / paceMs), maxEncounters)`.

`src/game/idle.ts` replaces `catch.ts`:

- `buildEncounter(seed, route, i): Creature` — one wild, species from the
  route pool, level `foeLevel + rng.int(-1, 1)`, identity via `rollIdentity`.
- `simulateIdle(party, seed, route, count): IdleOutcome` — runs up to `count`
  battles with `simulateBattle(party, [wild], `${seed}#idle#${i}`, {})`, stops
  at the first foe win. Returns `{ encounters: [{ dexId, level, won, turns }], stoppedBy }`
  where `stoppedBy` is `'loss'` or `'cap'` (count reached). Deterministic.
- EXP: every party member gets `expPerWin` per won encounter, applied once at
  the end through `applyGrowthWithEvolution`.

Cost bound: 100 battles × ~14 turns is well under one function invocation; the
existing balance simulator runs thousands of battles per second.

### API (`api/idle/[action]`, replaces `api/catch/[action]`)

- `POST /api/idle/start { routeId, partyIds }` — session required; profile
  required; no open session; route unlocked; 1–6 owned ids, each in band.
  Inserts the row with a server seed, `started_at = now`. Returns the session.
- `GET /api/idle/current` — the open session or `null`, plus `serverNow` so the
  client's elapsed timer does not depend on the device clock.
- `POST /api/idle/claim { sessionId }` — must be the caller's open session.
  `elapsed = min(now - started_at, IDLE_CAP_MS)`. Rebuilds the party from the
  pinned ids (ownership re-checked), simulates `encountersFor(elapsed)`
  battles, writes growth and evolutions for each party mon, inserts `encounters`
  rows, stores the compact log, sets `claimed_at` and `stopped_by`
  (`'early'` when elapsed < cap and no loss). Returns
  `{ log, levelUps, evolutions, box }`. A second claim of the same session is a
  409. A claim with zero encounters is valid and simply closes the session.
- `POST /api/idle/tutorial-catch` — Part B step 2.

Rate limits mirror the old catch endpoints (20/min, 300/day per user).

### Anti-cheat

- No token needed: the `idle_sessions` row is the authorisation. Its seed is
  chosen at start, so claiming later cannot re-roll encounters.
- Elapsed time uses the server clock only.
- Party ownership and band are checked at start and again at claim.
- Growth and evolution are only ever written by `claim`.

## Part D — Client

`App.tsx` is rewritten around a smaller phase set:

`login` → `onboarding` (profession → professor → starter reveal + nickname →
tutorial battle → first catch) → `hub` ⇄ `route` (pick route + party, send
out; or, when a session is open, the trainer-walking view with elapsed time and
a Claim button) → `claim` (log: encounters, EXP, level-ups, evolutions, met
list with the note "catching arrives in the next update") → `hub`. Secondary:
`box` (list + detail + nickname), `dex`, `guide`, `account`.

Screens:

- `OnboardingScreen` (new): profession cards (three locked), professor cards
  with the three-stage line preview, starter reveal card, nickname input.
- `RouteScreen` (new, replaces `CatchSetupScreen`): route list (r2 locked),
  party picker reusing the existing eligibility card, open-session view.
- `ClaimScreen` (new, replaces `CatchResultScreen`).
- `BoxScreen` (new): grid of owned mons, detail drawer with stats at level,
  sign, ability, nickname edit.
- `HubScreen` (edit): trainer card (profession, professor, starter), box
  strip, one primary CTA that reads "Send out" or "Claim (2h 14m)" depending on
  the open session. Remove `onRental` and `onViewLadder`.
- `BattleScreen` (edit): accept a lighter `opponent` shape for wild fights
  (`{ name, art, type }`) instead of the Rental `Opponent`.

The client shows the open session's elapsed time by polling `current` every
60 s and interpolating locally with `serverNow`.

## Testing (`scripts/*.test.ts`, tsx assert style, run by `npm test`)

- `professions.test.ts` — four professors, each line is exactly three stages
  via `EVOLUTIONS`, `rollStarter` is deterministic for a seed, starter level 5.
- `evolution.test.ts` — thresholds (starter 8/16, default 16/32, final forms
  null), `evolveOwned` keeps identity and re-rolls a legal ability, branch
  choice is deterministic for a seed, growth crossing two thresholds evolves twice.
- `routes.test.ts` — `encountersFor` respects pace and cap, band eligibility,
  r2 locked.
- `idle.test.ts` — `simulateIdle` deterministic, stops on first loss, a level-5
  starter wins most Route 1 encounters (sanity, ≥ 60% over 100 seeds), EXP
  applied once per won encounter.
- Existing `levels.test.ts` stays; `zones.test.ts` and `catch.test.ts` are
  replaced by the above.
- Determinism check: same party + seed → identical log on two runs.

## Release

- CHANGELOG under Unreleased: Removed (Rental and friends), Added (trainer
  onboarding, idle routes). Release as `0.2.0` via `npm run release minor`.
- Production: apply `db/schema.sql` with `npm run db:setup` before deploy.
- Slice 0 (merging the current `development` to `main`) happens before this
  slice starts.

## Open items carried to later slices

- Ball economy and the throw phase (slice 2) read from `encounters`.
- Affection column and gating (slice 3).
- Route 2 unlock milestone (slice 3).
- Relic mods plumbing removal from `battle.ts` (slice 5).
