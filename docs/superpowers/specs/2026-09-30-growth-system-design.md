# Growth system: Fire Emblem-style stats, hidden levels — design

Date: 2026-09-30 · Status: approved by the owner with every recommended default ("love it").
**Amended 2026-09-30:** `TARGET_LEVELS` 40 → 60 at the owner's request ("a lv 50 should not always be max
stats"). At 40, 98.6% of Pokémon reached every ceiling by hidden level 50; at 60 an average one fills about
87% of the way from floor to ceiling, and under 2% max all six. The potentials, expected stats and
evolution example below are from the original tuning, before this change. The route wild handicaps were
retuned to keep the world balance gates (lake 0.60, quarry 0.60, trail 0.63, ruins 0.68). The living
copy with the matchup chart is the Claude Doc `9c3c5a60-7c5e-478e-be69-69e581a2fd0c`; this file is the
repo's record of the same decisions and is what the implementation plan argues from.

Links: v2 design doc (Claude Doc `47af7c97…`, whose "Progression: Levels" bullet this supersedes), slice 1
spec (`2026-09-30-slice-1-trainer-onboarding-idle-design.md`), world map spec
(`2026-09-30-world-map-exploration-training-design.md`, whose "Growth overhaul compatibility" section
names the seams this design plugs into).

## Result

Levels leave the screen. A Pokémon shows six stats and an EXP bar; when the bar fills it **grows**: every
stat rolls against its growth rate (its **potential**), the winners go up by one, and each stat stops at a
**ceiling** set by the species. Evolution carries every point over, adds a bonus, and raises the ceilings.
A hidden level (1 to 50) still ticks on the server to pace EXP and trigger evolution, but no screen prints
it.

The Caterpie promise: a Caterpie trained to its ceilings beats a freshly caught Butterfree, even into
Butterfree's Flying-type advantage, because a fresh catch starts at a fifth of its ceiling and training
closes the whole gap. A Butterfree trained the same way still beats that Caterpie. Ceilings keep species
identity; training decides between unequal effort.

Every number (floor, potential, ceiling, evolution bonus) derives from the real base stats in
`pokedex.gen.ts` by one formula, so all 1,025 species get the system without hand-authored tables. The
battle engine keeps its damage formula: a fully trained Pokémon fights exactly like today's full-strength
one.

## Acceptance criteria

Seeded scripts in `scripts/growth.test.ts` (and the files each item names), exact numbers where the seed
is pinned.

1. **The Caterpie promise.** A Caterpie at its ceilings beats a freshly minted Butterfree in at least 85
   of 100 seeded one-on-one battles through `simulateBattle`, both with their real kits (measured: 89 of
   100 at 200 seeds, 90 at 100).
2. **Identity.** A Butterfree at its ceilings beats a Caterpie at its ceilings in at least 95 of 100
   (measured: 100).
3. **The engine is untouched.** Ceiling × 2.5 equals the real base stat for every species (within
   rounding), so a fully trained Pokémon is today's full-strength one and the existing balance numbers
   still describe trained Pokémon.
4. **Bounds.** A growth never pushes a stat past its ceiling; an evolution never lowers a stat; a growth
   with nothing to give raises exactly one uncapped stat (the one with the highest potential).
5. **Determinism.** Same seed, same mint, same EXP gains produce identical stats on two runs. Rolls draw
   from the caller's RNG in a fixed order (HP, P.Atk, E.Atk, P.Def, E.Def, Speed), one draw per uncapped
   stat.
6. **Every species.** Floor ≤ ceiling and potential ≥ 10 for all 1,025; a fresh three-stage starter
   still has room in every stat at hidden level 50 in the expected case, and at most 2% of base forms
   levelled 1 → 50 (with evolutions, pinned seeds) reach every ceiling (amended; was "reaches all six").
7. **No level on screen.** Hub, Box, party strip, onboarding, and every growth message print no level.
   `level` and `exp` stay in the box payload so the client can draw the EXP bar. The dev-only readout in
   the Box (under `import.meta.env.DEV`) is the one place the hidden level appears.
8. **Legacy rows.** An `owned_pokemon` row without `stats` reads as an average individual of its species
   at its level and keeps playing; the next growth persists real stats.
9. **Gate.** `npm run lint && npm test && npm run build` passes; a browser check under `npm run dev:local`
   covers the Box (grid, detail, a growth, an evolution), the Hub party strip, and the starter reveal at
   phone and desktop width; the `reviewer` subagent passes with P0/P1 fixed.

## Exclusions

- New stats. The six stay: HP, Physical Attack, Energy Attack, Physical Defense, Energy Defense, Speed.
  No Skill or Luck, no weapon triangle, no doubling, no permadeath, no class change.
- Any change to the damage formula, type chart, moves, abilities, signs, shiny bonus, or builds. Signs
  still tilt battle stats by their spread; shiny still multiplies by 1.25; builds still redistribute the
  two attacks (the growth tables follow the build).
- An item economy (vitamins, candies). The model leaves room: a vitamin is +1 to a stat up to the ceiling.
- What earns EXP and how much. Nothing grants EXP today; the world map slice does, through
  `applyGrowthWithEvolution`. The EXP curve (`expToNext = 20 × level`) is a routes-slice knob.
- An Everstone-style hold on evolution (evolving early or late costs nothing, so a hold is flavour).
- Hand-tuned species tables; `growth.ts` may keep an empty override map for later flavour.
- A visible stat total ("Power") in the Box.
- Affection, catch rate, route bands (when they return, key them to the stat total as a share of the
  ceiling total, never to the hidden level).

## 1. What we borrow from Fire Emblem, in Pokémon words

| Fire Emblem | Here it is called | How it works |
|---|---|---|
| Base stats | A fresh Pokémon's stats (the **floor**) | What a newly minted individual has. A fifth of the ceiling. |
| Growth rates | **Potential**, read out in Judge words | Per stat, per species: the chance that stat goes up by one on a growth. Shown as words, never as a percentage. |
| Stat caps | The **ceiling** ("won't go any higher") | Per stat, per species; equals today's full-strength base stat. A capped stat shows MAX on its bar. |
| Level | Hidden level | 1 to 50, server only. Paces EXP and triggers evolution. Never printed. |
| Level up | "Caterpie grew!" | The EXP bar reaches 100%, resets, and the growth toast lists the stats that rose. |
| Empty level-up reroll | "Caterpie is trying hard!" | If no stat rolls a gain, the uncapped stat with the best potential gains one anyway. |
| Promotion | Evolution | Carries every point over, adds a bonus, raises the ceilings, never lowers a stat. |
| Promotion bonus | Evolution bonus | The floor gap plus a quarter of the ceiling gap, and never less than an average specimen of the new form at this level. |
| Trainee classes | Base forms of three-stage lines | Low floors, low ceilings, the fastest potential in the game. |
| Pre-promotes | Wild evolved forms and legendaries | High floors, big ceilings, no evolution to look forward to. |
| Auto-levelling a late recruit | Minting at a hidden level | A fresh individual is rolled forward from its floor, one growth per hidden level above 1, with its mint seed. |
| Stat boosters | Vitamins (later) | +1 to a stat, up to the ceiling. |
| Level cap 20 per class | Hidden level 50 per individual | One budget for the whole life, not per stage (see 2). |

## 2. Bounding growth: one hidden level, 1 to 50

Considered: (A) stage levels that reset on evolution (Fire Emblem's 20/20), (B) one hidden level 1–50 for
the whole life, (C) ceilings only with no level budget. **B** is the pick: it is the clock the code has
(`MAX_LEVEL`, `expToNext`, thresholds 8/16 and 16/32), it treats every line length alike, the ceilings do
the real bounding, and endpoint variance stays real but small (a stat or two a point or three under its
ceiling). A rejected on friction (two clocks, evolve-early regret, single-stage species special-cased); C
rejected because the hidden level is still needed for evolution and pacing, and it deletes the one thing
that makes two Caterpies differ at the end.

## 3. The stat model

Every species gets three numbers per stat, derived from its real base stat (after the build's
redistribution, when the individual has one). An individual carries six current stats between its floor
and its ceiling.

```
ceiling[s]   = max(2, round(base[s] / 2.5))
floor[s]     = max(1, round(0.2 × ceiling[s]))
potential[s] = max(10, round(100 × (ceiling[s] − floor[s]) / 60)) + stageBonus   (was / 40)
```

- **Stage bonus** (young Pokémon grow fast): +15 for the base form of a three-stage line, +8 for its
  middle form, +8 for the base form of a two-stage line, 0 for final forms and single-stage species.
- **Into the engine**: the battle engine receives stat × 2.5 (rounded, never below 1) as the base stat it
  already expects. A stat at its ceiling is exactly the real base stat.
- **Potential above 100** means one guaranteed point per growth plus the remainder as a chance: Mewtwo's
  Energy Attack (125) always gains one and gains a second a quarter of the time.

Why these constants: dividing by 2.5 puts ceilings between 8 (Caterpie's Energy Attack) and 102
(Blissey's HP), where one point is visible on a bar. A fifth of the ceiling is the lowest floor the engine
tolerates: its flat terms (HP + 60, others + 5 at level 50) shrink small differences, and at a 30% floor
the promise falls from 89 to 78 of 100. Dividing the room by 40 makes an average individual reach every
ceiling around hidden level 40, leaving nine growths to pull unlucky stats up.

**Potential in Judge words** (the Box never prints a percentage):

| Potential | Word |
|---|---|
| 75 and up | Fantastic |
| 55 to 74 | Very Good |
| 40 to 54 | Pretty Good |
| 25 to 39 | Decent |
| Under 25 | No Good |

Sentence form: "Its Speed shows fantastic potential."

## 4. Growth events

1. **The bar** shows EXP toward the next hidden level as a percentage of `expToNext(level)`. At hidden
   level 50 it reads MAX.
2. **Reaching 100%.** The hidden level goes up by one, leftover EXP carries into the new bar (`applyExp`),
   and one growth fires. A gain that crosses several levels fires one growth per level, in order, each
   followed by the evolution check (so growths after a threshold roll with the new form's potential).
3. **The rolls.** Each uncapped stat rolls once against its potential, in the fixed order. A win is +1.
   Potential over 100 gives its guaranteed points first. A stat at its ceiling is not rolled.
4. **Trying hard.** If no stat gained, the uncapped stat with the highest potential (first in order on a
   tie) gains one.
5. **The toast.** "Caterpie grew!" then the gains: "HP +1 · Speed +1". The first time a stat reaches its
   ceiling: "Caterpie's Speed won't go any higher!". A trying-hard growth: "Caterpie is trying hard!" then
   "Speed +1". An evolution: "Metapod evolved into Butterfree!" then "E.Atk +20 · E.Def +16 · Speed +11".
6. **Where it runs.** On the server, through `applyGrowthWithEvolution(mon, gainedExp, rng)` (the one
   seam the world map slice calls). The caller owns the seeded RNG.
7. **Minting.** A fresh individual starts at its floor and is rolled forward one growth per hidden level
   above 1, with its mint seed. A starter at hidden level 5 has four growths.

## 5. Evolution

Triggers exactly as today (starters at 8 and 16, everything else at 16 and 32; affection later). For each
stat the evolved value is the larger of:

- the current value + the floor gap + a quarter of the ceiling gap (each gap floored at zero), and
- what an average individual of the new form has at this hidden level.

Example (seeded run): Metapod at 32 with (HP 20, P.Atk 9, E.Atk 10, P.Def 21, E.Def 10, Speed 12) becomes
Butterfree (22, 15, 30, 21, 26, 23).

**Evolution never takes away.** A stat above the new form's ceiling keeps its value and stops growing:
Metapod's Physical Defense ceiling (22) is above Butterfree's (20), so a Butterfree raised through Metapod
can carry 21 or 22 Defense. That is the one lasting mark of raising from the base form, on purpose.

**No hold, no cancel.** Evolution stays automatic on the growth path. A Pokémon already past its threshold
(a legacy row) evolves on its next growth even when no level is gained, as today.

## 6. Worked numbers (floor / potential / ceiling)

| Species | | HP | P.Atk | E.Atk | P.Def | E.Def | Speed |
|---|---|---|---|---|---|---|---|
| Caterpie | floor | 4 | 2 | 2 | 3 | 2 | 4 |
| | potential | 50 | 40 | 30 | 43 | 30 | 50 |
| | ceiling | 18 | 12 | 8 | 14 | 8 | 18 |
| Metapod | floor | 4 | 2 | 2 | 4 | 2 | 2 |
| | potential | 48 | 23 | 28 | 53 | 28 | 33 |
| | ceiling | 20 | 8 | 10 | 22 | 10 | 12 |
| Butterfree | floor | 5 | 4 | 7 | 4 | 6 | 6 |
| | potential | 48 | 35 | 73 | 40 | 65 | 55 |
| | ceiling | 24 | 18 | 36 | 20 | 32 | 28 |
| Rattata | floor | 2 | 4 | 2 | 3 | 3 | 6 |
| | potential | 33 | 53 | 28 | 36 | 36 | 66 |
| | ceiling | 12 | 22 | 10 | 14 | 14 | 29 |
| Mewtwo | floor | 8 | 9 | 12 | 7 | 7 | 10 |
| | potential | 85 | 88 | 125 | 73 | 73 | 105 |
| | ceiling | 42 | 44 | 62 | 36 | 36 | 52 |

Average caught Butterfree by hidden level: 1 → (5, 4, 7, 4, 6, 6); 16 → (12, 9, 18, 10, 16, 14); 32 →
(20, 15, 30, 16, 26, 23); 50 → the ceilings.

Matchups through the real engine (wins per 100 for the first-named side, 200 seeds, floor share 0.20):
Caterpie at ceilings vs fresh Butterfree 89; vs fresh Pidgeotto 100; Butterfree at ceilings vs fresh
Mewtwo 100; Caterpie with 15 growths vs Rattata with 3 growths 100; Butterfree at ceilings vs Caterpie at
ceilings 100; Mewtwo at ceilings vs Butterfree at ceilings 90; Butterfree with 15 growths vs Caterpie at
ceilings 92; raised vs caught Butterfree with 31 growths each 49 (a coin flip).

Fresh-against-fresh fights hinge on kits, not stats: a starter Caterpie with four growths loses 100 of
100 to a Rattata with three growths, and wins 100 of 100 with the existing 0.7 wild handicap. The same
Caterpie with fifteen growths wins 100 of 100 with no handicap. The handicap stays a route knob.

## 7. Battle impact

- `ownedMonToCreature` sets the creature's stats to the individual's current stats × 2.5 instead of
  scaling species base stats by level. `scaleCreatureToLevel` and `levelStatMult` go once nothing calls
  them; `expToNext`, `applyExp`, `MAX_LEVEL` stay for the hidden level.
- `battle.ts` is not edited: `LEVEL` 50, `hpStat`, `otherStat`, the damage formula,
  `GLOBAL_DAMAGE_MULT` 0.9, stat stages, sign spreads, the shiny multiplier and every ability rule stay.
- Wild Pokémon (when the world map lands) are minted at the place's hidden level with the encounter seed,
  exactly like a starter, through `mintStats`; the per-place handicap stays.
- Kits are not level-based; nothing changes for moves and abilities.

## 8. What the player sees

| Screen | Today | After |
|---|---|---|
| Box detail | Six numbers at level, "Lv 12", "Evolves at Lv 16" | Six rows, each a `StatBar` filled to the ceiling with the number beside it and a MAX pip when capped; a Judge line per stat on tap; an EXP bar ("EXP 64%", MAX at hidden 50); "Close to evolving" within three hidden levels of the threshold, nothing before |
| Box grid and Hub party strip | "Lv 12", accent at max level | A one-line EXP bar under the sprite; accent MAX at hidden 50 |
| Onboarding starter reveal | "Lv 5 · born under Aries" | "Born under Aries" |
| Growth messages (Box today; claim logs later) | "Caterpie grew to Lv 8!" | The toasts in section 4 |
| Battle screen, Pokédex | No level shown / species base stats | No change |
| Dev readout (Box detail, `import.meta.env.DEV` only) | None | Hidden level, exact potential and ceilings, a "Grow once" button that calls the local-dev-only `grow` action |

**Copy rules.** Stat names on bars: HP, P.Atk, E.Atk, P.Def, E.Def, Speed; in sentences: Physical Attack,
Energy Attack, Physical Defense, Energy Defense. "Grew", "won't go any higher", "trying hard",
"potential" and the Judge words are the whole vocabulary; "level", "growth rate", "cap" and "stat gain"
never appear on screen.

## 9. Data and implementation notes

- `OwnedMon` and `MintSpec` gain `stats: BaseStats` (the six current stats on the model scale). `level`
  and `exp` stay and are hidden.
- New `src/game/growth.ts` (species tables, `growOnce`, `mintStats`, `expectedStats`, `evolveStats`,
  `toEngineStats`, Judge words, toast copy) and `src/game/lines.ts` (line geometry shared with
  `evolution.ts`). `evolution.ts` grows level by level and evolves with `evolveStats`; `box.ts` builds the
  creature from `mon.stats`; `levels.ts` keeps only the EXP curve plus `expPercent`.
- `owned_pokemon` gains `stats text` (JSON, six integers) through `COLUMN_ADDS`; no index. Expand then
  contract: a null or malformed `stats` reads as `expectedStats(dexId, level, build)` and the next write
  persists it. Minting stores `mintStats` from the same seed that rolls the identity.
- No new player-facing endpoint. `box` returns `stats`. A dev-only `grow` action on `api/me` (404 unless
  `VERCEL_ENV=development`, which `scripts/dev-api.ts` sets) exercises the path end to end.
- Save format: a breaking change under `RELEASING.md`'s rule (the owner picks how that reads on 0.x).
  Production runs `npm run db:setup` before the deploy that ships this.
- The v2 design doc's "Progression: Levels" bullet is superseded; its "Luck surface" line gains growth
  rolls, seeded like everything else. `.agents/rules/frontend.md`: "authoritative for levels, EXP,
  evolutions" becomes "growth (stats, hidden level, EXP), evolutions".

## 10. Decisions taken (all recommended defaults)

Floor share 0.20; Judge words only on screen; no Everstone-style hold; signs keep tilting battle stats
only; no hand-tuned species; a one-line EXP bar in the Hub party strip; no visible stat total; route bands
and catch rate (when they return) key to the stat total as a share of the ceiling total; the wild handicap
stays 0.7 / 0.9 until real sessions say otherwise.

| Knob | Default |
|---|---|
| `ENGINE_FACTOR` | 2.5 |
| `FLOOR_SHARE` | 0.20 |
| `TARGET_LEVELS` | 60 (was 40) |
| Stage bonus | +15, +8, +8, 0 |
| `EVOLUTION_CEILING_SHARE` | 0.25 |
| `MIN_POTENTIAL` | 10 |
| `MAX_LEVEL` | 50 (49 growths) |
| `expToNext` | 20 × level (unchanged) |
