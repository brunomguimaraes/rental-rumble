# World map, exploration, and training — design

Status: approved 2026-09-30 with every default below, plus one condition: stay compatible with the
Fire Emblem-style growth overhaul (Claude Doc `9c3c5a60…`, not yet approved). See "Growth overhaul
compatibility".
Links: v2 design doc (Claude Doc `47af7c97…`), slice 1 spec (`2026-09-30-slice-1-trainer-onboarding-idle-design.md`),
pixel style spec (`2026-09-30-pixel-style-system-pokedex-design.md`).

## Result

A trainer picks a saved party of 1–6 owned Pokémon, opens an illustrated pixel map of one region (Hearthvale:
a home town and six connected places), and either **explores** a place — a short, resumable expedition of
checkpoints with real choices and server-resolved battles — or **trains** there while away, on server time,
up to eight hours. Both modes feed one progression: EXP, levels, and evolution through the existing helpers,
sightings and landmarks per place, and milestones (beating a place's guardian) that unlock the next places.
The server owns every outcome, settles each activity exactly once, and one trainer has at most one activity.

## Verified starting points

- React 19, TypeScript, Vite, Tailwind v4; Vercel functions in `api/`, Turso (libSQL), Upstash (rate limits).
- `owned_pokemon` rows are unique individuals (sign, ability, build, colour, emotion, nickname, origin).
- `simulateBattle` is pure and seeded: 0.02 ms for 1v1, 0.3 ms for 6v6. HP resets every battle. Party order fixes
  only the lead. Float `**` may differ between V8 and Safari, so the client must show the server's event log,
  never re-simulate.
- `levels.ts`: levels 1–50, stats 35%→100%, `expToNext = 20 × level`. `evolution.ts`: level-only, starters at
  8/16, others 16/32, `applyGrowthWithEvolution(mon, exp, rng)`. Nothing grants EXP today.
- `HubParty` shows `box.slice(0, 6)`; there is no saved party anywhere.
- Idle code is only in git history (`810aa848^`); `idle_sessions` (partial unique index `idle_one_open_idx`: one
  row with `claimed_at is null` per user) and `encounters` remain, with possible legacy rows.
- Rental modes stay removed. `api/` has two functions (`auth`, `me`); Hobby allows 12.
- At low levels, level barely matters; the wild stat handicap (`foeStatMult`) is the real difficulty dial.
  A level-5 Caterpie loses every 1v1 to a level-4 Rattata without one.

## Conflicts found, and the proposed ruling

| Source says | Current code / this request | Ruling |
|---|---|---|
| GDD (decided): affection gates every evolution | Level-only evolution; request: reuse existing rules | Level-only. Affection stays out. |
| GDD: every won wild is a catch opportunity; balls | Request: no capture in this slice | Sightings only. No balls, no throws. |
| GDD / old claim: a second claim is rejected (409) | Request: repeat returns the committed result | Repeats return the stored result (200). |
| Slice 1: hard level bands (Route 1: 1–12) | Request: milestone access + recommended levels | Recommended ranges, no bands; EXP falls off when over-levelled. |
| Slice 1 stand-in: Route 2 opens when any mon > 12 | Request: milestones | Beating a place's guardian unlocks its neighbours. |
| GDD: fainted party rests on a real-time cooldown | Not requested | No cooldown. |
| Growth-system spec (unapproved): hide levels, new growth | Request: reuse level curve, show levels | Visible levels; all EXP passes one seam (`applyGrowthWithEvolution`). |
| GDD: a small router replaces the phase switch | `App.tsx` phase switch works | Extend the phase switch. |

## Region: Hearthvale

Content lives in `src/game/world.ts` (shared, pure). Adding a place is a data entry plus a map-art update; screens,
the dispatcher, and the tests iterate the data. `r1` and `r2` keep their historical ids.

| id | Place | Biome | Rec. Lv | Unlocks when | Neighbours |
|---|---|---|---|---|---|
| `home` | Hearth Town | town | — | always | r1 |
| `r1` | Route 1 · Sunny Meadow | meadow | 3–8 | always | home, r2 |
| `r2` | Route 2 · Mossy Woods | forest | 8–15 | r1 cleared | r1, quarry, lake |
| `lake` | Mirror Lake | lakeside | 14–22 | r2 cleared | r2, ruins |
| `quarry` | Flint Quarry | quarry | 16–24 | r2 cleared | r2, trail |
| `trail` | Cloudcap Trail | mountain | 24–34 | quarry cleared | quarry, ruins |
| `ruins` | Starfall Ruins | ruins | 34–50 | trail and lake cleared | trail, lake |

Hearth Town anchors the map and the trainer marker; it has a description and no activities. Each playable
place authors: map position, description, encounter pool (8–10 species with weights plus one rare), wild level range and stat handicap, 2–3 landmarks, an expedition template, a guardian, and training
numbers. Values below are tuned so every balance gate (Acceptance, section 9) passes; `scripts/world-balance.ts` prints the rates.

| id | Wild Lv | Handicap | Train: pace · max · EXP/win | Explore: EXP/win · clear bonus | Guardian (tuned) |
|---|---|---|---|---|---|
| r1 | 2–5 | 0.6 | 4 min · 120 · 6 | 10 · 30 | Furret Lv 7 ×0.55 |
| r2 | 8–12 | 0.7 | 4.5 min · 106 · 10 | 16 · 60 | Parasect Lv 14 ×0.8 |
| lake | 14–20 | 0.65 | 5 min · 96 · 16 | 24 · 100 | Azumarill Lv 21 ×0.75 |
| quarry | 16–22 | 0.65 | 5 min · 96 · 18 | 28 · 110 | Rhyhorn Lv 23 ×0.6 |
| trail | 24–32 | 0.65 | 6 min · 80 · 26 | 40 · 160 | Piloswine Lv 33 ×0.7 |
| ruins | 34–46 | 0.75 | 6 min · 80 · 36 | 55 · 240 | Xatu Lv 47 ×0.8 |

Pools (Gen I–IV, normal tier, rare last): meadow Sentret, Zigzagoon, Pidgey, Rattata, Hoppip, Sunkern, Kricketot,
Bidoof, rare Eevee · woods Caterpie, Weedle, Metapod, Kakuna, Oddish, Paras, Hoothoot, Spinarak, Shroomish, rare
Pikachu · lake Magikarp, Psyduck, Poliwag, Goldeen, Wooper, Marill, Surskit, Wingull, Buizel, rare Dratini ·
quarry Sandshrew, Diglett, Machop, Cubone, Geodude, Phanpy, Makuhita, Trapinch, rare Larvitar · trail Machoke, Swinub,
Snorunt, Primeape, Fearow, Pidgeotto, Meditite, Graveler, rare Bagon · ruins Unown, Natu, Misdreavus, Haunter,
Kadabra, Bronzor, Sableye, Absol, rare Spiritomb. Landmarks: meadow Old Signpost, Sunflower Patch, Hilltop Oak ·
woods Hollow Log, Mossy Shrine · lake Fisher's Dock, Heron Isle · quarry Fossil Wall, Echo Shaft · trail Windy
Ledge, Summit Cairn · ruins Star Gate, Glyph Hall, Fallen Star.

**Why a solo starter never dead-ends.** There is no capture, so most trainers own one Pokémon. Every unlocked
place stays trainable; EXP never drops below 25%; each guardian is balanced to be beatable solo by every starter
line (gate 9.3); and the quarry and lake open together, so a bad matchup has a second road to levels.

**Reward scaling.** Each party member earns the full EXP of every won battle while its level (at the start of
the activity) is at or below the place's recommended maximum; each level above removes 15%, down to 25%. The
detail panel states it ("Pidgeotto Lv 20 earns 55% here"). Old places stay useful for training newer or weaker
members, finding landmarks, and completing sightings.

**Place states** (icon + label, never colour alone): Undiscovered (no open neighbour; "???", details hidden) ·
Locked (open neighbour, requirement unmet; padlock + requirement) · Available (open, never visited; "NEW") ·
Discovered (visited, guardian not beaten) · Completed (guardian beaten; star). Mastery shows three pips:
Cleared, Surveyed (all landmarks), Catalogued (every pool species seen, rare included). Mastery is progress only.

## Saved party

- `profiles.party` (JSON array of owned ids, ordered; index 0 is the lead), additive column.
- `GET /api/me/profile` returns `profile.party`, resolved: saved ids the user still owns, in order; if none,
  the starter; if the starter is gone, the newest owned mon; else empty.
- `POST /api/me/party { ids }`: 1–6 strings, no duplicates, every id owned by the caller (one `readOwnedByIds`),
  else 400 with a player-facing error. Rate-limited `rl:party:m:<uid>` 30/min.
- Starting an activity snapshots the ordered party and every owned field into the activity row. Later edits to
  the party, nicknames, or the box never change an activity in progress.
- Renaming stays a nickname-only update. Settlement writes only `dex_id`, `ability`, `level`, `exp`.

## Activities: one table for both modes

Training and exploration are two modes of one activity, stored in the existing `idle_sessions` table, so the
existing partial unique index enforces **one activity per trainer across both modes**. No competing session
table. Additive columns (`COLUMN_ADDS`):

| Column | Meaning |
|---|---|
| `mode` | `'train'` or `'explore'`; null = legacy idle row (treated as training) |
| `rules_version` | `1` for this slice; null = legacy |
| `party_snapshot` | JSON `OwnedMon[]`, ordered, frozen at start |
| `config` | JSON frozen place rules (pool, levels, handicap, pace, cap, EXP) so rebalancing never moves a live activity |
| `state` | JSON expedition position, trail of resolved checkpoints, banked wins and EXP |
| `step` | integer checkpoint counter; every step write is conditional on it |
| `request_id` | client-generated id; a retried start with the same id returns the same activity |
| `result` | JSON settlement result, written in the settling transaction |
| `seen_at` | when the player dismissed the result |

Existing columns keep their meaning: `seed` (server-only, never sent), `started_at`, `claimed_at` (= settled at;
null = active), `stopped_by` (outcome), `encounters` (count). Settlement also writes each battle to `encounters`
(`resolved` stays 0), as the old claim did.

New tables: `world_progress (user_id, location_id, cleared_at, explores, clears, trainings, training_wins,
primary key (user_id, location_id))` and `world_discoveries (user_id, location_id, kind 'seen'|'landmark', ref,
found_at, primary key (user_id, location_id, kind, ref))`. Unlocks are derived from `cleared_at`, never stored.
Sightings never touch `pokedex_cells`.

**Legacy rows.** An open pre-map `idle_sessions` row appears as unfinished training on its route (`r1`/`r2`).
Finishing it settles under rules v1 with the listed party's current rows as the snapshot (missing or foreign
ids dropped; none left means a zero-reward close). Closed legacy rows are ignored.

## Exploration

- An expedition is 4–6 checkpoints from the place's authored template plus the server seed: a trailhead
  sighting, a fork, two or three branch checkpoints, and the guardian. Retreat is offered at every checkpoint.
- Checkpoint kinds and choices:
  - **Battle**: Fight (server simulates; the response carries the event log) or Retreat.
  - **Sighting**: Observe (records the species, safe) or Challenge (battle it for EXP; risk of defeat).
  - **Landmark**: Investigate (records the landmark; may rouse a guardian-lite battle) or Press on.
  - **Fork**: two authored paths with different next checkpoints, foe levels, rare odds, and landmarks
    ("Tall grass: tougher wild Pokémon, better odds of a rare sighting" / "Riverside path: calmer, passes the
    Fisher's Dock"). Some landmarks sit on only one branch.
  - **Guardian**: Challenge or Retreat. Winning ends the expedition as Complete.
- Content for step *n* (species, level, identity) comes from the seed and *n*; the client sees only the current
  checkpoint and the ones already resolved. Discoveries are written as they happen, in the step's transaction.
  EXP is banked in `state` and applied at settlement.
- Outcomes: **Complete**: banked EXP + clear bonus; the first clear sets `cleared_at` and unlocks neighbours.
  **Retreat**: banked EXP, no bonus. **Defeat** (a lost battle): banked EXP from earlier wins, no bonus.
  Nothing is ever removed from the box. Every result screen names the next action (train here, try again, map).
- Races and retries: `POST /api/world/step { activityId, step, choice }` resolves only when `step` matches the
  row, inside a write transaction whose update is `... where step = ? and claimed_at is null`. A repeat of the
  same step and choice returns the stored outcome (the battle's event log is recomputed on the server). A
  different choice for a resolved step, or a stale step, gets 409 with the current activity.

## Training

- Start: an unlocked place, the saved party (the client echoes the ids it reviewed; a mismatch is a 409 with the
  current party), a server seed, the frozen config. The start panel shows party levels against the recommended
  range, pace, cap, EXP per win, and the over-level falloff per member. The rating uses the party's highest
  level: above the range is Comfortable, inside it is Even, below its minimum is Risky ("training stops at the
  first defeat"). It is guidance, not a prediction.
- Battles happen at `started_at + k × pace`, k = 1…`maxEncounters`, until the eight-hour cap. The count for an
  elapsed time is `min(floor(min(elapsed, 8 h) / pace), maxEncounters)`. The first lost battle ends training.
  Returning after the cap adds nothing.
- Status: `GET /api/world/state` returns `serverNow`, elapsed time, the next battle time, and the battles the
  server has resolved so far (wins, whether the party fell, pending EXP per member), computed read-only from the
  seed (under 40 ms). Nothing is written until the player returns. The client ticks its clock from `serverNow`;
  it never invents wins. EXP is labelled "applied when you return".
- Return (`POST /api/world/finish`) at any time: resolves the battles up to now, applies EXP and evolution,
  records sightings and progress, and stores the result. Zero elapsed battles is a clean zero-reward result.

## Settlement (both modes)

One function in `api/_world.ts`, inside one write transaction (retrying `SQLITE_BUSY` like the old claim):

1. Conditional close: `update idle_sessions set claimed_at, stopped_by, encounters, result, state, step
   where id = ? and user_id = ? and claimed_at is null`. Zero rows means someone else settled it: roll back and
   return the stored result.
2. Read the party's current rows inside the transaction; for each snapshot member still owned, apply
   `applyGrowthWithEvolution(row, exp × falloff, new RNG('evolve:<monId>:<activityId>'))` and write
   `dex_id, ability, level, exp` only.
3. Upsert `world_progress`; insert-or-ignore `world_discoveries`; insert `encounters`.
4. Commit. The response carries the result and the fresh box. A failed box read after commit still returns the
   result (api.md). `POST /api/world/finish` or `step` on a settled activity returns that stored result.

`POST /api/world/dismiss { activityId }` sets `seen_at`; `state` returns the newest settled, unseen result until
then (or until a new activity starts), so results survive a closed tab or a lost response.

## API

New dispatcher `api/world/[action].ts` (added to `scripts/dev-api.ts`), thin actions over `api/_world.ts`
(domain) and `api/_db.ts` (SQL). Order per `api.md`: `requirePost` → `gate` (no-store, 401, `ok:false` when the
database is unset) → `rateLimit` (`rl:world:m:<uid>` 60/min and `rl:world:d:<uid>` 2000/day on writes) →
validate `unknown` body → work.

| Action | Body | Success | Errors |
|---|---|---|---|
| `GET state` | — | `{ ok, serverNow, places, activity, result }` | 401, 503 |
| `POST start` | `{ mode, locationId, partyIds, requestId }` | `{ ok, activity }` | 400 locked/invalid, 409 busy (+activity) or party changed |
| `POST step` | `{ activityId, step, choice }` | `{ ok, activity, event, result?, box? }` | 400, 404, 409 (+activity) |
| `POST finish` | `{ activityId }` | `{ ok, result, box? }` | 404 |
| `POST dismiss` | `{ activityId }` | `{ ok }` | 404 |

`places[]` carries each place's computed state, counts, found landmarks and seen species. `activity` is the
public view: id, mode, place, ordered party summary, `startedAt`, and either training status or the current
checkpoint with the resolved trail. The seed, future checkpoints, and the frozen pool order never leave the
server. Missing columns (no `db:setup` yet) log and return 503 "The world map isn't ready yet"; hub, box, and
Pokédex keep working.

Client helper `src/game/world-client.ts` (fetch only, never throws, `{ ok, error?, expired? }`); `401` sets
`expired` so App returns to the login screen with "Your session expired — sign in again." `fetchBox` becomes
`{ ok, box }` so screens can tell a failed load from an empty box.

## Screens (Night system)

- **Hub**: the party window shows the saved party (lead marked, names, levels, variant marks, empty slots) with
  Edit; a World map button; an activity card (Training at Sunny Meadow · 2h 13m · 12 wins so far / Expedition
  at Mossy Woods · checkpoint 3 / Results ready). Header and nav keep their current style (Hub migration slice).
- **Party** (new): six ordered slots with Move up / Move down / Remove, lead badge, the box below to add from,
  Save (disabled while saving or unchanged), loading / empty / error / retry states. A notice explains that an
  activity in progress keeps its own party.
- **World map** (new): a 384×576 px pixel-art region (generated, see Art) at 1×/2×/3× with drag-to-pan,
  zoom and recenter buttons, keyboard pan and zoom, tap targets ≥ 44 px, and a trainer marker at the active or
  last place (Hearth Town at first). A List toggle shows every place as a button. Tapping opens a bottom
  detail panel: name, biome, description, recommended levels, sightings (seen sprites, unseen silhouettes),
  landmark and mastery progress, training pace and EXP, state and unlock requirement, Explore / Train with
  disabled reasons. Pan and zoom are kept while the panel is open and after returning from an activity.
- **Expedition** (new): the place's backdrop, the current checkpoint and its choices, a trail of resolved
  checkpoints, banked EXP, Retreat. Battles play in a compact Night battle view that steps through the
  server's event log (static sprites, segmented HP, text), with Skip; keyboard Enter / Space advances.
- **Training** (new): the place's backdrop with the trainer and party walking (two-frame icon sheets; still
  under reduced motion), elapsed / cap bar, next battle time, server-resolved tally, Return early (confirm).
- **Results** (new): outcome headline, battles (species, level, won/lost), EXP per member, level-ups,
  evolutions (from → to), new sightings and landmarks, milestone and unlocks, next actions.

Layout: centred phone column (`max-w-[430px]`), 16 px gutters, works from 320 to 430 px, no horizontal page
scroll, bottom panels and fixed controls pad `env(safe-area-inset-bottom)`. Every animation stops under
`prefers-reduced-motion`. Screens off the first path are `lazy()`.

## Art

No image-generation tool is available in this session and the repo has no terrain art. The region is drawn by a
checked-in generator, `scripts/build-world-map.ts` (TypeScript, Node `zlib` PNG writer, no new dependency):
an authored ASCII layout of 8 px tiles (meadow, forest canopy, river and lake with shorelines, quarry terraces,
a snow-capped range, the ruins plateau, dirt paths, and the town), painted with hand-coded pixel tiles in a dusk
palette that sits on the navy field. Place and landmark positions come from `world.ts`. Output:
`public/sprites/world/hearthvale.png`, drawn only at whole multiples with `[image-rendering:pixelated]`. The
trainer marker reuses `public/sprites/trainers/special-ethan` (GIF while walking, PNG under reduced motion).
Backdrops reuse `public/sprites/backgrounds` (meadow, woodland, pier, cave-sand, mountain, autumn).

## Growth overhaul compatibility

The growth spec keeps a hidden level 1–50, `level`, `exp`, `MAX_LEVEL`, `expToNext`, and the 8/16 and
16/32 thresholds, and changes three things: owned stats become per-individual (`OwnedMon.stats`),
`applyGrowth` replaces `applyExp` on the growth path, and no screen prints a level. This slice ships with
visible levels and must make that switch a local change:

- **One growth seam.** Settlement calls one function, `growMember(row, exp, rng)` in `src/game/world.ts`,
  which today wraps `applyGrowthWithEvolution`. The overhaul swaps its body for `applyGrowth`.
- **Structured growth results.** Results store numbers per member (`expGained`, before and after `level`,
  `exp`, `dexId`, evolutions), never sentences. One client formatter turns them into copy, so "grew to
  Lv 8" can become "grew! HP +1" without touching storage. Member entries are open objects, so stat gains
  can be added later.
- **One wild seam.** Every wild and guardian is built by `buildWild(spec)` in `src/game/world.ts` (today
  `scaleCreatureToLevel` over a rolled identity). The overhaul mints wild stats there.
- **Snapshots are `OwnedMon` JSON** read through one normaliser, so a future `stats` field rides along and
  the growth spec's null-stats backfill applies in one place. Combat creatures always come from
  `ownedMonToCreature`.
- **Rules key on the hidden level, display does not leak it.** Falloff, the difficulty rating, and
  recommended ranges are pure functions in `world.ts` that read `level`, which the server keeps under both
  systems. Screens print levels only through two helpers, `formatLevel(mon)` and `formatRecommended(place)`,
  so hiding them is a two-function change. Screens also show an EXP bar (progress to the next level), which
  both systems keep.
- **Balance gates re-run.** The gates in `npm test` fail if a growth change breaks the solo-starter path;
  the handicaps are the tuning knobs in both systems.
- **Files.** This slice does not edit `levels.ts`, `evolution.ts`, or `ownedMonToCreature`, so the two
  efforts do not collide.

## Out of scope

Capture, balls, and a capture economy; affection; items, berries, healing, or cooldowns; NPC trainer battles
(guardians are wild); Hall of Fame; EXP-curve or growth-model changes; a Pokédex "seen" layer or crediting
evolutions to `pokedex_cells`; the full Hub, Box, or Battle Night migrations; breeding, trading, multiplayer,
habitats, professions, monetization; push notifications; any change to auth or sessions.

## Acceptance criteria

1. **Party**: 1–6 owned ids, reorder, remove, lead first; persists across reloads and devices; new and
   legacy accounts default to the starter; the server rejects empty, 7+, duplicates, unknown, and other users'
   ids with 400.
2. **Map**: region art with home and six places; drag, zoom, recenter, keyboard, and list all work; five states
   with icon + label; details panel complete; position kept; 320/375/430 px without horizontal overflow.
3. **Unlocks**: only `r1` open at first; beating a guardian unlocks per the table; starting a locked place is
   400; state is computed on the server.
4. **Exploration**: choices change the next checkpoints, foes, or rewards (tested per seed); reload, box
   round-trip, or a second device resumes the same checkpoint; a repeated step returns the same outcome; two
   simultaneous different steps resolve once (the other gets 409); Complete / Retreat / Defeat pay per the rules.
5. **Training**: encounter count boundaries (just under one pace = 0; exactly one pace = 1; past 8 h = capped;
   `maxEncounters` cap); first loss stops it; return early works; zero-battle settlement closes cleanly; after
   the cap nothing more accrues.
6. **One activity**: concurrent starts (either mode) leave exactly one open row; the loser gets 409 with it; a
   retried start with the same `requestId` returns the same activity.
7. **Exactly once**: repeated or concurrent `finish` / terminal `step` apply EXP once and return the same
   stored result; a lost response is recovered from `state`.
8. **Growth**: EXP, level-ups, and evolutions come from `applyGrowthWithEvolution` (a Lv 7 starter crossing 8
   evolves); nickname, sign, ability-on-no-evolution, colour, and origin are untouched; hub and box update.
9. **Balance gates** (pinned seeds, in `npm test`):
   1. every starter line solo at Lv 5 wins ≥ 95% of Sunny Meadow training battles;
   2. every starter line's stage at each place's recommended mid level wins ≥ 90% (cocoon stages ≥ 85%) there;
   3. every starter line solo at each place's recommended max beats that guardian in ≥ 50% of seeds.
10. **Isolation**: another user's activity id is 404 on every action; responses never contain the seed.
11. **Compatibility**: accounts without `party` or progress rows work; a legacy open idle row surfaces and settles;
    closed legacy rows are ignored; missing columns give a clean 503 while hub and box keep working.
12. **Gate**: `npm run lint`, `npm test` (new files appended), `npm run build` pass; the `reviewer` subagent
    passes with P0/P1 fixed; a browser check under `npm run dev:local` at 320, 375, 430 px with screenshots.

## Tests

- `scripts/world.test.ts` (pure): region integrity (ids, neighbours symmetric, pools valid, levels ascending,
  every place reachable), unlock and state derivation, falloff, encounter-count boundaries, expedition
  determinism and choice effects, balance gates 9.1–9.3.
- `scripts/world-db.test.ts` (temp file DB, `api/_world.ts` with injected `now`): party validation and
  ownership, start/step/finish/dismiss, concurrency via `Promise.all`, lost-response retries, cap and defeat,
  zero-battle settlement, growth through the helpers, nickname preserved, legacy rows, user isolation.
- `scripts/world-api.test.ts` (handlers through a small req/res shim and a signed session cookie): 401, 405 with
  `Allow`, 400 bodies, 404 foreign ids, 409 shapes, no seed in any response, 503 when columns are missing.
- A report script `scripts/world-balance.ts` (not in `npm test`) prints win rates per place and line for tuning.

## Delivery slices

1. Shared contract: `world.ts` data and rules, activity/result types, falloff, expedition generator. Tests.
2. Persistence and API: schema additions, `_db.ts` queries, `_world.ts` settlement, `api/world`, `me/party`,
   dev-api route. Tests.
3. Saved party and hub integration (party screen, hub party window, activity card, `fetchBox` fix).
4. Map art generator, world map, details panel, list view.
5. Expedition screen and Night battle view.
6. Training screen and results.
7. Balance tuning, docs (CHANGELOG, README, RELEASING checklist, schema comments, AGENTS.md idle note, GDD
   decisions log), reviewer pass, browser verification and screenshots.

The seed/save format change is additive (new columns and tables; legacy rows still read), so it is a **minor**
release under `RELEASING.md`. `db:setup` must run before the world works in any environment; production needs the
owner's confirmation and the checklist.
