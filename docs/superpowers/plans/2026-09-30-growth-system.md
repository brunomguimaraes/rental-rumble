# Growth System (hidden levels, Fire Emblem-style stats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible level with per-individual stats that grow one point at a time on every full EXP
bar, bounded by species ceilings, carried through evolution, and rendered without a level anywhere.

**Architecture:** A new pure module `src/game/growth.ts` derives floor / potential / ceiling per stat from the
real base stats and rolls growths from the caller's seeded RNG. `OwnedMon` gains `stats`; `evolution.ts`
grows level by level and evolves with a carry-over; `box.ts` feeds the engine `stats × 2.5` so `battle.ts` is
untouched. The server persists `stats` as JSON on `owned_pokemon` (additive column, backfilled on read) and
exposes a local-dev-only `grow` action so the path can be exercised before the world map grants EXP. The Box,
Hub party strip and starter reveal draw EXP bars and stat bars instead of a level.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4 (Night tokens), Vercel functions, Turso/libSQL,
`tsx` test scripts, oxlint.

**Spec:** `docs/superpowers/specs/2026-09-30-growth-system-design.md` (the Claude Doc
`9c3c5a60-7c5e-478e-be69-69e581a2fd0c` is the same design with the matchup chart)

## Global Constraints

- Work on `development`. Commit only the paths each task names; never `git add -A`. The checkout holds another
  slice's uncommitted work (install guide, Professor Andre, the world-map spec and `src/install.ts`): leave
  every file you did not touch exactly as you found it, and re-read a file right before editing it.
- Commit messages carry no `Co-Authored-By` trailer (owner preference).
- Runtime relative imports in `src/game/` and `api/` end in `.js`; components may omit the extension.
- Knobs, verbatim from the spec: `ENGINE_FACTOR` 2.5, `FLOOR_SHARE` 0.2, `TARGET_LEVELS` 40, stage bonus
  +15 / +8 / +8 / 0, `EVOLUTION_CEILING_SHARE` 0.25, `MIN_POTENTIAL` 10, `MAX_LEVEL` 50, `expToNext` stays
  `20 × level`.
- `src/game/battle.ts` is not edited. A stat at its ceiling × 2.5 is the real base stat.
- Rolls draw from the caller's RNG in the order HP, P.Atk, E.Atk, P.Def, E.Def, Speed, one draw per uncapped
  stat, so the server re-simulation reproduces the client's log.
- No component prints `level`. `level` and `exp` stay in the box payload for the EXP bar; the dev readout in the
  Box detail (under `import.meta.env.DEV`) is the one place the hidden level appears.
- Copy on screen, verbatim: bar labels HP, P.Atk, E.Atk, P.Def, E.Def, Speed; sentence names Physical Attack,
  Energy Attack, Physical Defense, Energy Defense; "grew!", "is trying hard!", "won't go any higher!",
  "Close to evolving", the Judge words Fantastic / Very Good / Pretty Good / Decent / No Good. The words
  "level", "growth rate", "cap" and "stat gain" never appear on screen.
- Schema: `stats text` on `owned_pokemon` goes in `COLUMN_ADDS` only (like `nickname`); the `create table` in
  `db/schema.sql` gets a comment, not a column. Never run `db:setup` or SQL against production; the owner
  runs it before the deploy that ships this (save-format break under `RELEASING.md`).
- Tests are plain `tsx` scripts with the `check(label, ok)` harness; new files are appended to the `test`
  script in `package.json` or they never run. Each regression test fails on the pre-change code for its own
  reason (the assertion), not a setup error.
- If the world-map slice landed first (`src/game/world.ts` exists): `buildWild` replaces
  `scaleCreatureToLevel(creature, level)` with `{ ...creature, stats: toEngineStats(mintStats(dexId, level,
  rng, build)) }`; settlement writes use `updateOwnedGrowth` (so `stats` persists); `formatLevel(mon)` returns
  `''` and its callers render `<ExpBar level exp />`; `growMember` keeps calling `applyGrowthWithEvolution`
  unchanged. Otherwise nothing in this plan touches the world slice.
- Gate before calling any task done: the focused test scripts plus `npx tsc -b` (src) and
  `npx tsc -p tsconfig.api.json` (api); before Task 5's commit, `npm run lint && npm test && npm run build`, a
  browser check under `npm run dev:local`, and the `reviewer` subagent with P0/P1 fixed.

## Review Focus

1. **An `owned_pokemon` row from before this change (no `stats`).** Must read as an average individual of its
   species at its level and keep playing; the next growth persists real stats. Pinned in Task 2, `db.test.ts`
   group [4] (null and malformed JSON both backfill).
2. **A stat above the new form's ceiling after evolution** (Caterpie's Speed 18 over Metapod's 12). Must be
   kept, never rolled, never lowered, and shown as MAX. Pinned in Task 1, `growth.test.ts` group [4], and
   Task 2, `evolution.test.ts` group [2].
3. **One EXP gain that crosses a threshold and keeps going** (level 7 → 17 for a starter). Growths after the
   threshold must roll with the new form, evolution deltas must never be negative, and the result must be at
   least an average individual of the new form. Pinned in Task 2, `evolution.test.ts` group [4].
4. **The dev `grow` action reached in production, or with another user's id.** Must be 404 in both cases
   and must never write. Pinned in Task 3, `grow.test.ts` groups [1] and [2].
5. **A box row arriving without `stats` on the client** (a stale server during a deploy). `ownedMonToCreature`
   must build the creature from the average individual instead of crashing on `stats.hp`. Pinned in Task 2,
   `growth.test.ts` group [7].

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/game/lines.ts` | create | Evolution-line geometry (`stageOf`, `lineLength`, `evolutionTargets`) shared by `evolution.ts` and `growth.ts` |
| `src/game/growth.ts` | create | Floor / potential / ceiling per species, `growOnce`, `mintStats`, `expectedStats`, `evolveStats`, `toEngineStats`, Judge words, toast copy |
| `src/game/levels.ts` | modify | Keep the hidden level and EXP curve; add `expPercent`; drop the stat multiplier |
| `src/game/box.ts` | modify | `OwnedMon.stats`, `MintSpec.stats`; creature from `stats × 2.5`; drop `ownedPower` |
| `src/game/evolution.ts` | modify | Grow one hidden level at a time, evolve with `evolveStats`, return growth events |
| `src/game/professions.ts` | modify | Starters mint stats from the same seed as their identity |
| `src/game/dev.ts` | modify | `devGrowOnce(id)` fetch helper (dev only) |
| `api/_db.ts` | modify | `stats` column, backfill on read, inserts, `updateOwnedGrowth` |
| `api/_dev.ts` | create | `isLocalDev()` |
| `api/me/[action].ts` | modify | Local-dev-only `grow` action |
| `db/schema.sql` | modify | Comment on `owned_pokemon` about the `stats` column |
| `src/components/ui/ExpBar.tsx` | create | EXP bar: percent toward the next hidden level, MAX at the cap, no level |
| `src/components/GrowthStats.tsx` | create | Six stat rows: bar to the ceiling, number, MAX pip, Judge line on tap |
| `src/components/BoxScreen.tsx` | rewrite | Grid EXP lines, detail with EXP bar, stat rows, growth lines, dev readout |
| `src/components/HubParty.tsx` | modify | EXP line instead of `Lv.N` |
| `src/components/OnboardingScreen.tsx` | modify | Starter reveal without the level |
| `src/App.tsx` | modify | `onUpdated` for the Box |
| `scripts/growth.test.ts` | create | Model, bounds, determinism, copy, the promise through the engine |
| `scripts/grow.test.ts` | create | The `grow` action through the real handler |
| `scripts/levels.test.ts` | modify | Drop the stat-multiplier group; add `expPercent` |
| `scripts/evolution.test.ts` | modify | Stats through evolution and per-level growth |
| `scripts/professions.test.ts` | modify | Starters carry four growths of stats |
| `scripts/db.test.ts` | modify | Stats round-trip, legacy backfill, `updateOwnedGrowth` |
| `package.json` | modify | Append the two new test files to `test` |
| `CHANGELOG.md`, `.agents/rules/frontend.md` | modify | Player-facing note; "authoritative for growth" |

---

### Task 1: The growth model and its tests

**Files:**
- Create: `src/game/lines.ts`
- Create: `src/game/growth.ts`
- Modify: `src/game/levels.ts` (append `expPercent` after `applyExp`)
- Create: `scripts/growth.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: `CREATURES_BY_ID` (`src/game/pokemon.ts`), `canRollBuild` / `redistributeForBuild`
  (`src/game/moves.ts`), `EVOLUTIONS` (`src/game/evolutions.gen.ts`), `RNG` (`src/game/rng.ts`),
  `clampLevel` / `expToNext` / `MAX_LEVEL` (`src/game/levels.ts`), `simulateBattle` (`src/game/battle.ts`).
- Produces (later tasks rely on these exact names):
  `STAT_KEYS`, `StatKey`, `STAT_LABELS`, `SpeciesGrowth`, `speciesGrowth(dexId, build?)`, `GrowthEvent`,
  `growOnce(stats, g, rng)`, `mintStats(dexId, level, rng, build?)`, `expectedStats(dexId, level, build?)`,
  `evolveStats(stats, from, to, level, build?)`, `toEngineStats(stats)`, `isBaseStats(v)`,
  `statDeltas(before, after)`, `potentialWord(p)`, `potentialSentence(key, p)`, `growthLines(name, e)`,
  `evolutionLines(fromName, toName, deltas)` from `growth.ts`; `stageOf`, `lineLength`, `evolutionTargets`
  from `lines.ts`; `expPercent(level, exp)` from `levels.ts`.

- [ ] **Step 1: Write the failing test**

Create `scripts/growth.test.ts`:

```ts
/**
 * Growth: floor / potential / ceiling per species, growths, minting, evolution
 * carry-over, the engine mapping, copy — and the Caterpie promise through the
 * real battle engine.
 *
 *   npx --yes tsx scripts/growth.test.ts
 */
import {
  STAT_KEYS,
  ENGINE_FACTOR,
  speciesGrowth,
  growOnce,
  mintStats,
  expectedStats,
  evolveStats,
  toEngineStats,
  isBaseStats,
  statDeltas,
  potentialWord,
  potentialSentence,
  growthLines,
  evolutionLines,
} from '../src/game/growth.js';
import { lineLength, stageOf } from '../src/game/lines.js';
import { expPercent, MAX_LEVEL } from '../src/game/levels.js';
import { RAW_DEX } from '../src/game/pokedex.gen.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { simulateBattle } from '../src/game/battle.js';
import { RNG } from '../src/game/rng.js';
import type { BaseStats, Creature } from '../src/game/types.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const CATERPIE = 10;
const METAPOD = 11;
const BUTTERFREE = 12;
const MEWTWO = 150;
const MEW = 151;
const g = (id: number) => {
  const sg = speciesGrowth(id);
  if (!sg) throw new Error(`no growth for ${id}`);
  return sg;
};
const S = (hp: number, atk: number, eatk: number, def: number, edef: number, spd: number): BaseStats => ({ hp, atk, eatk, def, edef, spd });
const eq = (a: BaseStats, b: BaseStats) => STAT_KEYS.every((k) => a[k] === b[k]);

console.log('[1] species tables are derived from base stats');
check('Caterpie floor', eq(g(CATERPIE).floor, S(4, 2, 2, 3, 2, 4)));
check('Caterpie potential (+15 young bonus)', eq(g(CATERPIE).potential, S(50, 40, 30, 43, 30, 50)));
check('Caterpie ceiling', eq(g(CATERPIE).ceiling, S(18, 12, 8, 14, 8, 18)));
check('Metapod potential (+8 middle bonus)', eq(g(METAPOD).potential, S(48, 23, 28, 53, 28, 33)));
check('Butterfree potential (no bonus)', eq(g(BUTTERFREE).potential, S(48, 35, 73, 40, 65, 55)));
check('Butterfree ceiling', eq(g(BUTTERFREE).ceiling, S(24, 18, 36, 20, 32, 28)));
check('Mewtwo potential passes 100 on Energy Attack', g(MEWTWO).potential.eatk === 125);
check('line geometry', lineLength(CATERPIE) === 3 && lineLength(MEWTWO) === 1 && stageOf(BUTTERFREE) === 2);
check('unknown species is null', speciesGrowth(99999) === null);
{
  const plain = g(MEW);
  const physical = speciesGrowth(MEW, 'physical');
  const energy = speciesGrowth(MEW, 'energy');
  check('a physical build raises the P.Atk ceiling and lowers E.Atk', physical !== null && physical.ceiling.atk > plain.ceiling.atk && physical.ceiling.eatk < plain.ceiling.eatk);
  check('an energy build does the opposite', energy !== null && energy.ceiling.eatk > plain.ceiling.eatk);
  check('a build on a lopsided species changes nothing', speciesGrowth(CATERPIE, 'physical') === speciesGrowth(CATERPIE));
}
{
  let sane = true;
  for (const e of RAW_DEX) {
    const sg = speciesGrowth(e.id);
    if (!sg) {
      sane = false;
      continue;
    }
    for (const k of STAT_KEYS) {
      if (sg.floor[k] > sg.ceiling[k] || sg.potential[k] < 10) sane = false;
      if (e.stats[k] >= 5 && Math.abs(sg.ceiling[k] * ENGINE_FACTOR - e.stats[k]) > ENGINE_FACTOR / 2) sane = false;
    }
  }
  check('every species: floor ≤ ceiling, potential ≥ 10, ceiling × factor within rounding of the base stat', sane);
}

console.log('\n[2] a growth never passes the ceiling and never comes up empty');
{
  const sg = g(CATERPIE);
  let stats = { ...sg.floor };
  const rng = new RNG('grow-caterpie');
  let overflow = false;
  let empty = false;
  for (let i = 0; i < 60; i++) {
    const r = growOnce(stats, sg, rng);
    if (STAT_KEYS.some((k) => r.stats[k] > sg.ceiling[k])) overflow = true;
    const grew = STAT_KEYS.some((k) => r.stats[k] > stats[k]);
    if (!grew && STAT_KEYS.some((k) => stats[k] < sg.ceiling[k])) empty = true;
    stats = r.stats;
  }
  check('60 growths never pass a ceiling', !overflow);
  check('no growth is empty while a stat has room', !empty);
  check('60 growths reach every Caterpie ceiling', eq(stats, sg.ceiling));
  const r = growOnce(sg.ceiling, sg, new RNG('capped'));
  check('at the ceilings nothing changes and nothing is trying hard', eq(r.stats, sg.ceiling) && !r.tryingHard && r.capped.length === 0);
}
{
  const sg = g(CATERPIE);
  let found: ReturnType<typeof growOnce> | null = null;
  for (let i = 0; i < 2000 && !found; i++) {
    const r = growOnce(sg.floor, sg, new RNG(`trying-${i}`));
    if (r.tryingHard) found = r;
  }
  check('a trying-hard growth exists', found !== null);
  check('it raises exactly one stat: the highest potential, HP on the tie with Speed', found !== null && found.gains.hp === 1 && Object.keys(found.gains).length === 1);
}
{
  const sg = g(MEWTWO);
  let stats = { ...sg.floor };
  const rng = new RNG('mewtwo');
  for (let i = 0; i < 10; i++) stats = growOnce(stats, sg, rng).stats;
  check('potential over 100 gains at least one point every growth', stats.eatk >= sg.floor.eatk + 10);
}
{
  const sg = g(CATERPIE);
  const a = growOnce(sg.floor, sg, new RNG('order'));
  const b = growOnce(sg.floor, sg, new RNG('order'));
  check('same seed, same growth', eq(a.stats, b.stats));
  // Draw-order contract: one draw per uncapped stat. With HP capped, a growth
  // consumes exactly five draws, so the RNG's next value is a fresh stream's sixth.
  const spent = new RNG('order');
  const capped = growOnce({ ...sg.floor, hp: sg.ceiling.hp }, sg, spent).stats;
  const fresh = new RNG('order');
  for (let i = 0; i < 5; i++) fresh.next();
  check('a capped stat consumes no draw', spent.next() === fresh.next());
  check('a capped HP stays put', capped.hp === sg.ceiling.hp);
}

console.log('\n[3] minting and the average individual');
check('level 1 is the floor', eq(mintStats(BUTTERFREE, 1, new RNG('x')), g(BUTTERFREE).floor));
{
  const a = mintStats(CATERPIE, 5, new RNG('starter:u:10'));
  const b = mintStats(CATERPIE, 5, new RNG('starter:u:10'));
  check('same seed mints the same stats', eq(a, b));
  check('a level-5 mint carries four growths', STAT_KEYS.reduce((n, k) => n + a[k] - g(CATERPIE).floor[k], 0) >= 4);
}
check('expected at level 1 is the floor', eq(expectedStats(BUTTERFREE, 1), g(BUTTERFREE).floor));
check('expected Butterfree at 32', eq(expectedStats(BUTTERFREE, 32), S(20, 15, 30, 16, 26, 23)));
check('expected at level 50 reaches every ceiling', eq(expectedStats(BUTTERFREE, 50), g(BUTTERFREE).ceiling));
check('unknown species mints ones', eq(mintStats(99999, 5, new RNG('x')), S(1, 1, 1, 1, 1, 1)));

console.log('\n[4] evolution carries every point and catches up');
{
  const metapod32 = S(20, 9, 10, 21, 10, 12);
  check('Metapod → Butterfree at 32 matches the spec example', eq(evolveStats(metapod32, METAPOD, BUTTERFREE, 32), S(22, 15, 30, 21, 26, 23)));
  check('deltas are per stat', eq(statDeltas(metapod32, S(22, 15, 30, 21, 26, 23)), S(2, 6, 20, 0, 16, 11)));
  const capCat = evolveStats(g(CATERPIE).ceiling, CATERPIE, METAPOD, 16);
  check("a stat above the new ceiling is kept (Speed 18 over Metapod's 12)", capCat.spd === 18);
  check('never below the average of the new form', STAT_KEYS.every((k) => capCat[k] >= expectedStats(METAPOD, 16)[k]));
  check('never below what it had', STAT_KEYS.every((k) => capCat[k] >= g(CATERPIE).ceiling[k]));
  const kept = growOnce(capCat, g(METAPOD), new RNG('kept'));
  check('and it is not rolled afterwards', kept.stats.spd === 18);
  check('unknown species leaves stats alone', eq(evolveStats(metapod32, METAPOD, 99999, 32), metapod32));
}

console.log('\n[5] engine mapping and words');
check('Caterpie ceilings map to its real base stats', eq(toEngineStats(g(CATERPIE).ceiling), CREATURES_BY_ID[String(CATERPIE)].stats));
check('Butterfree ceilings map to its real base stats', eq(toEngineStats(g(BUTTERFREE).ceiling), CREATURES_BY_ID[String(BUTTERFREE)].stats));
check('never below 1', toEngineStats(S(0, 0, 0, 0, 0, 0)).hp === 1);
check('Judge words', potentialWord(80) === 'Fantastic' && potentialWord(73) === 'Very Good' && potentialWord(50) === 'Pretty Good' && potentialWord(30) === 'Decent' && potentialWord(23) === 'No Good');
check('Judge sentence', potentialSentence('spd', 80) === 'Its Speed shows fantastic potential.');
check('growth toast', growthLines('Caterpie', { level: 6, gains: { hp: 1, spd: 1 }, capped: ['spd'], tryingHard: false }).join(' | ') === "Caterpie grew! | HP +1 · Speed +1 | Caterpie's Speed won't go any higher!");
check('trying-hard toast', growthLines('Caterpie', { level: 6, gains: { hp: 1 }, capped: [], tryingHard: true }).join(' | ') === 'Caterpie is trying hard! | HP +1');
check('evolution toast', evolutionLines('Metapod', 'Butterfree', S(2, 6, 20, 0, 16, 11)).join(' | ') === 'Metapod evolved into Butterfree! | HP +2 · P.Atk +6 · E.Atk +20 · E.Def +16 · Speed +11');
check('isBaseStats accepts six finite numbers only', isBaseStats(S(1, 2, 3, 4, 5, 6)) && !isBaseStats({ hp: 1 }) && !isBaseStats(null) && !isBaseStats({ ...S(1, 2, 3, 4, 5, 6), hp: 'x' }));
check('expPercent reads the bar', expPercent(1, 0) === 0 && expPercent(1, 10) === 50 && expPercent(1, 999) === 100 && expPercent(MAX_LEVEL, 0) === 100);

console.log('\n[6] the Caterpie promise through the engine (100 seeds)');
{
  const at = (id: number, stats: BaseStats): Creature => ({ ...CREATURES_BY_ID[String(id)], stats: toEngineStats(stats) });
  const wins = (a: Creature, b: Creature): number => {
    let n = 0;
    for (let i = 0; i < 100; i++) if (simulateBattle([a], [b], `promise#${i}`).winner === 'player') n++;
    return n;
  };
  const promise = wins(at(CATERPIE, g(CATERPIE).ceiling), at(BUTTERFREE, g(BUTTERFREE).floor));
  check(`a Caterpie at its ceilings beats a fresh Butterfree at least 85 of 100 (got ${promise})`, promise >= 85);
  const identity = wins(at(BUTTERFREE, g(BUTTERFREE).ceiling), at(CATERPIE, g(CATERPIE).ceiling));
  check(`a Butterfree at its ceilings beats a Caterpie at its ceilings at least 95 of 100 (got ${identity})`, identity >= 95);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/growth.test.ts`
Expected: FAIL at import time with `Cannot find module '.../src/game/growth.js'`.

- [ ] **Step 3: Create `src/game/lines.ts`**

```ts
import { EVOLUTIONS } from './evolutions.gen.js';
import { CREATURES_BY_ID } from './pokemon.js';

// Evolution-line geometry shared by evolution.ts and growth.ts. It lives apart
// from evolution.ts so growth.ts can read it without an import cycle.

// child → parent, derived once from the forward table.
const PRE_EVOLUTION: Record<number, number> = {};
for (const [parent, children] of Object.entries(EVOLUTIONS)) {
  for (const child of children) PRE_EVOLUTION[child] = Number(parent);
}

/** Real, in-dex evolution targets for a species. */
export function evolutionTargets(dexId: number): number[] {
  return (EVOLUTIONS[dexId] ?? []).filter((id) => Boolean(CREATURES_BY_ID[String(id)]));
}

/** 0 for a base form, 1 for a middle stage, 2 for a final stage (of a 3-line). */
export function stageOf(dexId: number): number {
  let stage = 0;
  let cur = dexId;
  while (PRE_EVOLUTION[cur] !== undefined && stage < 8) {
    cur = PRE_EVOLUTION[cur];
    stage++;
  }
  return stage;
}

/**
 * Stages in this species' line: 1 for a single-stage species, 3 for Caterpie's.
 * Walks to the root, then forward along the first branch.
 */
export function lineLength(dexId: number): number {
  let root = dexId;
  for (let guard = 0; PRE_EVOLUTION[root] !== undefined && guard < 8; guard++) root = PRE_EVOLUTION[root];
  let length = 1;
  let cur = root;
  for (let guard = 0; guard < 8; guard++) {
    const next = evolutionTargets(cur)[0];
    if (next === undefined) break;
    length++;
    cur = next;
  }
  return length;
}
```

- [ ] **Step 4: Create `src/game/growth.ts`**

```ts
import type { BaseStats, Build } from './types.js';
import type { RNG } from './rng.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { canRollBuild, redistributeForBuild } from './moves.js';
import { lineLength, stageOf } from './lines.js';
import { clampLevel } from './levels.js';

// Fire Emblem-style growth in Pokémon words
// (docs/superpowers/specs/2026-09-30-growth-system-design.md). Every species
// gets a floor, a potential and a ceiling per stat, all derived from its real
// base stats; an individual carries six current stats between its floor and its
// ceiling and rolls each of them once per hidden level. The battle engine sees
// stat × ENGINE_FACTOR, so a stat at its ceiling is the real base stat and
// battle.ts is untouched.

export const STAT_KEYS = ['hp', 'atk', 'eatk', 'def', 'edef', 'spd'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Short labels for bars and toasts; long names for sentences. */
export const STAT_LABELS: Record<StatKey, { short: string; long: string }> = {
  hp: { short: 'HP', long: 'HP' },
  atk: { short: 'P.Atk', long: 'Physical Attack' },
  eatk: { short: 'E.Atk', long: 'Energy Attack' },
  def: { short: 'P.Def', long: 'Physical Defense' },
  edef: { short: 'E.Def', long: 'Energy Defense' },
  spd: { short: 'Speed', long: 'Speed' },
};

// --- Knobs (the spec's last section) ----------------------------------------

/** Engine base stat = current stat × ENGINE_FACTOR; a ceiling maps back to the real base stat. */
export const ENGINE_FACTOR = 2.5;
/** A fresh individual starts at this share of its ceiling. */
export const FLOOR_SHARE = 0.2;
/** Hidden level at which an average individual reaches its ceilings. */
export const TARGET_LEVELS = 40;
/** The slowest any stat can grow, in percent per growth. */
export const MIN_POTENTIAL = 10;
/** Share of the ceiling gap granted on evolution, on top of the floor gap. */
export const EVOLUTION_CEILING_SHARE = 0.25;

const ONES: BaseStats = { hp: 1, atk: 1, eatk: 1, def: 1, edef: 1, spd: 1 };

export interface SpeciesGrowth {
  floor: BaseStats;
  potential: BaseStats;
  ceiling: BaseStats;
}

/**
 * Young Pokémon grow fast: +15 for the base form of a three-stage line, +8 for
 * its middle form and for the base form of a two-stage line, 0 for final forms
 * and single-stage species.
 */
export function stageBonus(dexId: number): number {
  const stage = stageOf(dexId);
  const length = lineLength(dexId);
  if (length === 3) return stage === 0 ? 15 : stage === 1 ? 8 : 0;
  if (length === 2) return stage === 0 ? 8 : 0;
  return 0;
}

const cache = new Map<string, SpeciesGrowth>();

/**
 * Floor, potential and ceiling per stat for a species, after the build's
 * attack redistribution when the individual has one. Null for an unknown dex id.
 */
export function speciesGrowth(dexId: number, build?: Build): SpeciesGrowth | null {
  const species = CREATURES_BY_ID[String(dexId)];
  if (!species) return null;
  const effective = build && canRollBuild(species.stats) ? build : undefined;
  const key = `${dexId}:${effective ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = effective ? redistributeForBuild(species.stats, effective) : species.stats;
  const bonus = stageBonus(dexId);
  const floor = { ...ONES };
  const potential = { ...ONES };
  const ceiling = { ...ONES };
  for (const k of STAT_KEYS) {
    ceiling[k] = Math.max(2, Math.round(base[k] / ENGINE_FACTOR));
    floor[k] = Math.max(1, Math.round(ceiling[k] * FLOOR_SHARE));
    const room = ceiling[k] - floor[k];
    potential[k] = Math.max(MIN_POTENTIAL, Math.round((100 * room) / TARGET_LEVELS)) + bonus;
  }
  const g = { floor, potential, ceiling };
  cache.set(key, g);
  return g;
}

/** One growth's outcome; `level` is the hidden level it reached. */
export interface GrowthEvent {
  level: number;
  gains: Partial<Record<StatKey, number>>;
  /** Stats that reached their ceiling on this growth. */
  capped: StatKey[];
  tryingHard: boolean;
}

/**
 * One growth: each uncapped stat rolls once against its potential, in STAT_KEYS
 * order (one draw per uncapped stat, so a re-simulation matches); potential over
 * 100 pays its guaranteed points first; a growth with no lucky roll still raises
 * the uncapped stat with the highest potential (first in order on a tie). Pure.
 */
export function growOnce(
  stats: BaseStats,
  g: SpeciesGrowth,
  rng: RNG,
): { stats: BaseStats; gains: Partial<Record<StatKey, number>>; capped: StatKey[]; tryingHard: boolean } {
  const next = { ...stats };
  const gains: Partial<Record<StatKey, number>> = {};
  const capped: StatKey[] = [];
  for (const k of STAT_KEYS) {
    const room = g.ceiling[k] - next[k];
    if (room <= 0) continue;
    const p = g.potential[k];
    let inc = Math.floor(p / 100);
    if (rng.chance((p % 100) / 100)) inc += 1;
    inc = Math.min(inc, room);
    if (inc > 0) {
      next[k] += inc;
      gains[k] = inc;
      if (next[k] >= g.ceiling[k]) capped.push(k);
    }
  }
  let tryingHard = false;
  if (Object.keys(gains).length === 0) {
    const open = STAT_KEYS.filter((k) => next[k] < g.ceiling[k]);
    if (open.length > 0) {
      const best = open.reduce((a, b) => (g.potential[b] > g.potential[a] ? b : a));
      next[best] += 1;
      gains[best] = 1;
      if (next[best] >= g.ceiling[best]) capped.push(best);
      tryingHard = true;
    }
  }
  return { stats: next, gains, capped, tryingHard };
}

/** A fresh individual's stats at hidden `level`: the floor, rolled forward one growth per level above 1. */
export function mintStats(dexId: number, level: number, rng: RNG, build?: Build): BaseStats {
  const g = speciesGrowth(dexId, build);
  if (!g) return { ...ONES };
  let stats = { ...g.floor };
  const top = clampLevel(level);
  for (let l = 1; l < top; l++) stats = growOnce(stats, g, rng).stats;
  return stats;
}

/** What an average individual has at hidden `level`: floor plus (level − 1) growths at the potential, no dice. */
export function expectedStats(dexId: number, level: number, build?: Build): BaseStats {
  const g = speciesGrowth(dexId, build);
  if (!g) return { ...ONES };
  const n = clampLevel(level) - 1;
  const out = { ...ONES };
  for (const k of STAT_KEYS) out[k] = Math.min(g.ceiling[k], g.floor[k] + Math.round((n * g.potential[k]) / 100));
  return out;
}

/**
 * Stats after evolving `from` → `to` at hidden `level`: every point carries
 * over plus the floor gap and a quarter of the ceiling gap (each at least 0),
 * and never below an average individual of the new form at this level. A stat
 * above the new ceiling keeps its value. Pure.
 */
export function evolveStats(stats: BaseStats, from: number, to: number, level: number, build?: Build): BaseStats {
  const a = speciesGrowth(from, build);
  const b = speciesGrowth(to, build);
  if (!a || !b) return stats;
  const average = expectedStats(to, level, build);
  const next = { ...ONES };
  for (const k of STAT_KEYS) {
    const floorGap = Math.max(0, b.floor[k] - a.floor[k]);
    const ceilingGap = Math.max(0, Math.round((b.ceiling[k] - a.ceiling[k]) * EVOLUTION_CEILING_SHARE));
    next[k] = Math.max(stats[k] + floorGap + ceilingGap, average[k]);
  }
  return next;
}

/** The base stats the battle engine expects: current stat × ENGINE_FACTOR, never below 1. */
export function toEngineStats(stats: BaseStats): BaseStats {
  const out = { ...ONES };
  for (const k of STAT_KEYS) out[k] = Math.max(1, Math.round(stats[k] * ENGINE_FACTOR));
  return out;
}

/** Six finite numbers under the six stat keys (what a stored `stats` JSON must be). */
export function isBaseStats(v: unknown): v is BaseStats {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return STAT_KEYS.every((k) => typeof o[k] === 'number' && Number.isFinite(o[k]));
}

/** `after − before`, per stat. */
export function statDeltas(before: BaseStats, after: BaseStats): BaseStats {
  const out = { ...ONES };
  for (const k of STAT_KEYS) out[k] = after[k] - before[k];
  return out;
}

// --- Words on screen ---------------------------------------------------------

export type PotentialWord = 'Fantastic' | 'Very Good' | 'Pretty Good' | 'Decent' | 'No Good';

/** The Judge's word for a potential; the Box never prints the number. */
export function potentialWord(p: number): PotentialWord {
  if (p >= 75) return 'Fantastic';
  if (p >= 55) return 'Very Good';
  if (p >= 40) return 'Pretty Good';
  if (p >= 25) return 'Decent';
  return 'No Good';
}

/** "Its Speed shows fantastic potential." */
export function potentialSentence(key: StatKey, p: number): string {
  return `Its ${STAT_LABELS[key].long} shows ${potentialWord(p).toLowerCase()} potential.`;
}

/** Toast lines for one growth: "Caterpie grew!", the gains, then one line per stat that just capped. */
export function growthLines(name: string, e: GrowthEvent): string[] {
  const gains = STAT_KEYS.filter((k) => e.gains[k]).map((k) => `${STAT_LABELS[k].short} +${e.gains[k]}`);
  const lines = [e.tryingHard ? `${name} is trying hard!` : `${name} grew!`];
  if (gains.length > 0) lines.push(gains.join(' · '));
  for (const k of e.capped) lines.push(`${name}'s ${STAT_LABELS[k].long} won't go any higher!`);
  return lines;
}

/** Toast lines for an evolution: "Metapod evolved into Butterfree!" then the positive deltas. */
export function evolutionLines(fromName: string, toName: string, deltas: BaseStats): string[] {
  const parts = STAT_KEYS.filter((k) => deltas[k] > 0).map((k) => `${STAT_LABELS[k].short} +${deltas[k]}`);
  const lines = [`${fromName} evolved into ${toName}!`];
  if (parts.length > 0) lines.push(parts.join(' · '));
  return lines;
}
```

- [ ] **Step 5: Add `expPercent` to `src/game/levels.ts`**

Append after `applyExp` (leave everything else as it is for now; Task 2 trims the file):

```ts
/** EXP bar progress, 0..100, toward the next hidden level; 100 at the cap. */
export function expPercent(level: number, exp: number): number {
  if (clampLevel(level) >= MAX_LEVEL) return 100;
  return Math.min(100, Math.floor((100 * Math.max(0, exp)) / expToNext(level)));
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx tsx scripts/growth.test.ts`
Expected: every group passes; the last line reads `N passed, 0 failed` and the promise line prints a number
of at least 85 (90 when this plan was written).

- [ ] **Step 7: Append the file to the test chain and type-check**

In `package.json`, append `&& tsx scripts/growth.test.ts` to the end of the `"test"` script (keep the
existing chain in its order; another slice may have edited this line, so edit the current text, don't paste
an old copy).

Run: `npx tsc -b`
Expected: no output (no errors).

- [ ] **Step 8: Commit**

```bash
git add src/game/lines.ts src/game/growth.ts src/game/levels.ts scripts/growth.test.ts package.json
git commit -m "Add the growth model: floors, potential and ceilings per species"
```

---

### Task 2: Stats on every owned Pokémon, through evolution and into the database

**Files:**
- Modify: `src/game/box.ts`
- Modify: `src/game/evolution.ts` (rewrite the file)
- Modify: `src/game/professions.ts` (`starterFromOffer`, near line 125)
- Modify: `src/game/levels.ts` (rewrite: drop the stat multiplier)
- Modify: `api/_db.ts` (`COLUMN_ADDS`, `rowToOwned`, `ownedFromSpec`, both inserts, new `updateOwnedGrowth`)
- Modify: `db/schema.sql` (comment above `create table if not exists owned_pokemon`)
- Modify: `scripts/evolution.test.ts` (rewrite), `scripts/levels.test.ts` (rewrite), `scripts/professions.test.ts`
  (group [5]), `scripts/db.test.ts` (imports, specs, new group [4]), `scripts/growth.test.ts` (new group [7])

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces: `OwnedMon.stats: BaseStats` and `MintSpec.stats: BaseStats` (`box.ts`);
  `applyGrowthWithEvolution(mon, gained, rng): GrowthResult` where `GrowthResult = { mon, levelUp, growths:
  GrowthEvent[], evolutions: { fromDexId, toDexId, deltas: BaseStats }[] }` (`evolution.ts`);
  `updateOwnedGrowth(db, uid, mon)` (`api/_db.ts`). `scaleCreatureToLevel`, `levelStatMult` and `ownedPower`
  no longer exist.

- [ ] **Step 1: Write the failing tests**

Rewrite `scripts/evolution.test.ts`:

```ts
/**
 * Evolution for owned mons: thresholds by stage, stats carried through, one
 * growth per hidden level with the evolution check after each one.
 *
 *   npx --yes tsx scripts/evolution.test.ts
 */
import {
  evolutionLevel,
  evolveOwned,
  applyGrowthWithEvolution,
  stageOf,
} from '../src/game/evolution.js';
import type { OwnedMon } from '../src/game/box.js';
import { isAbilityOption } from '../src/game/abilities.js';
import { expToNext } from '../src/game/levels.js';
import { STAT_KEYS, expectedStats, speciesGrowth } from '../src/game/growth.js';
import { RNG } from '../src/game/rng.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function mon(over: Partial<OwnedMon>): OwnedMon {
  const level = over.level ?? 5;
  const dexId = over.dexId ?? 10;
  return {
    id: 'm1', dexId, level, exp: 0, stats: expectedStats(dexId, level), sign: 'aries', shiny: false, altColor: false,
    origin: 'starter', caughtAt: 0, ...over,
  };
}
const atLeast = (a: OwnedMon['stats'], b: OwnedMon['stats']) => STAT_KEYS.every((k) => a[k] >= b[k]);

console.log('[1] stages and thresholds');
check('Caterpie is stage 0', stageOf(10) === 0);
check('Metapod is stage 1', stageOf(11) === 1);
check('Butterfree is stage 2', stageOf(12) === 2);
check('starter Caterpie evolves at 8', evolutionLevel(10, 'starter') === 8);
check('starter Metapod evolves at 16', evolutionLevel(11, 'starter') === 16);
check('caught Caterpie evolves at 16', evolutionLevel(10, 'catch') === 16);
check('caught Metapod evolves at 32', evolutionLevel(11, 'catch') === 32);
check('Butterfree never evolves', evolutionLevel(12, 'starter') === null);

console.log('\n[2] evolveOwned keeps identity and carries stats');
const c = mon({ level: 8, ability: undefined });
const e = evolveOwned(c, new RNG('evo'));
check('became Metapod', e.dexId === 11);
check('kept sign', e.sign === c.sign);
check('kept level', e.level === 8);
check('ability is legal for Metapod', !e.ability || isAbilityOption(11, e.ability));
check('no stat went down', atLeast(e.stats, c.stats));
check('caught up to an average Metapod of its level', atLeast(e.stats, expectedStats(11, 8)));
const speedy = evolveOwned(mon({ level: 8, stats: speciesGrowth(10)!.ceiling }), new RNG('evo'));
check("a stat above the new ceiling is kept (Caterpie's Speed 18 over Metapod's 12)", speedy.stats.spd === 18);
const stale = evolveOwned({ ...c, stats: undefined as unknown as OwnedMon['stats'] }, new RNG('evo'));
check('a row without stats evolves from the average individual', atLeast(stale.stats, expectedStats(11, 8)));

console.log('\n[3] branched line is deterministic and real');
const w = mon({ id: 'wurm', dexId: 265, level: 8 });
const b1 = evolveOwned(w, new RNG(`evolve:${w.id}`));
const b2 = evolveOwned(w, new RNG(`evolve:${w.id}`));
check('Wurmple branch lands on Silcoon or Cascoon', b1.dexId === 266 || b1.dexId === 268);
check('same seed → same branch', b1.dexId === b2.dexId);

console.log('\n[4] growth crossing two thresholds evolves twice, one growth per level');
// EXP from level 7 to 17 = sum of expToNext(7..16)
let need = 0;
for (let l = 7; l < 17; l++) need += expToNext(l);
const start = mon({ level: 7 });
const g = applyGrowthWithEvolution(start, need, new RNG('grow'));
check('reached level 17', g.mon.level === 17);
check('evolved twice', g.evolutions.length === 2);
check('ended as Butterfree', g.mon.dexId === 12);
check('levelUp reports 7 → 17', g.levelUp?.fromLevel === 7 && g.levelUp?.toLevel === 17);
check('one growth per level, in order', g.growths.length === 10 && g.growths[0].level === 8 && g.growths[9].level === 17);
check('evolution deltas are never negative', g.evolutions.every((ev) => STAT_KEYS.every((k) => ev.deltas[k] >= 0)));
check('the first evolution happened at 8, the second at 16', g.evolutions[0].fromDexId === 10 && g.evolutions[1].fromDexId === 11);
check('at least an average Butterfree of level 16', atLeast(g.mon.stats, expectedStats(12, 16)));
check('never below where it started', atLeast(g.mon.stats, start.stats));
const again = applyGrowthWithEvolution(start, need, new RNG('grow'));
check('same seed → same stats', STAT_KEYS.every((k) => again.mon.stats[k] === g.mon.stats[k]));

console.log('\n[5] no gain, no change');
const z = applyGrowthWithEvolution(mon({ level: 5 }), 0, new RNG('zero'));
check('no level up', z.levelUp === null && z.evolutions.length === 0 && z.growths.length === 0);
check('stats untouched', STAT_KEYS.every((k) => z.mon.stats[k] === mon({ level: 5 }).stats[k]));

console.log('\n[6] a Pokémon already past its threshold evolves on its next growth');
const late = applyGrowthWithEvolution(mon({ level: 20, origin: 'catch' }), 0, new RNG('late'));
check('a level-20 caught Caterpie becomes Metapod with no EXP', late.mon.dexId === 11 && late.evolutions.length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

Rewrite `scripts/levels.test.ts`:

```ts
/**
 * The hidden level: EXP applies with correct multi-level rollover, clamps at
 * the ceiling, and the EXP bar reads it as a percentage.
 *
 *   npx --yes tsx scripts/levels.test.ts
 */
import { MIN_LEVEL, MAX_LEVEL, clampLevel, expToNext, applyExp, expPercent } from '../src/game/levels.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] clampLevel');
check('clamps below MIN_LEVEL', clampLevel(-5) === MIN_LEVEL);
check('clamps above MAX_LEVEL', clampLevel(999) === MAX_LEVEL);
check('floors fractions', clampLevel(7.9) === 7);
check('NaN is MIN_LEVEL', clampLevel(Number.NaN) === MIN_LEVEL);

console.log('\n[2] expToNext grows with level and is Infinity at the cap');
check('needs more exp at higher levels', expToNext(10) > expToNext(1));
check('no exp needed past the cap', expToNext(MAX_LEVEL) === Infinity);

console.log('\n[3] applyExp rolls over levels and clamps');
const one = applyExp(1, 0, expToNext(1));
check('exact requirement levels up once', one.level === 2 && one.levelsGained === 1);
check('leftover exp carries as 0 here', one.exp === 0);

const partial = applyExp(1, 0, expToNext(1) - 1);
check('short of requirement stays level 1', partial.level === 1 && partial.levelsGained === 0);

const big = applyExp(1, 0, expToNext(1) + expToNext(2) + 3);
check('overflow spans two levels', big.level === 3 && big.levelsGained === 2);
check('remainder kept after multi-level', big.exp === 3);

const capped = applyExp(MAX_LEVEL, 0, 999999);
check('caps at MAX_LEVEL', capped.level === MAX_LEVEL && capped.exp === 0 && capped.levelsGained === 0);

console.log('\n[4] expPercent');
check('empty bar', expPercent(1, 0) === 0);
check('half way at level 1', expPercent(1, expToNext(1) / 2) === 50);
check('never over 100', expPercent(1, 999) === 100);
check('MAX at the cap', expPercent(MAX_LEVEL, 0) === 100);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

In `scripts/professions.test.ts`, add to the imports:

```ts
import { STAT_KEYS, speciesGrowth } from '../src/game/growth.js';
```

and, in group [5], after the line `check('same account + pick -> same individual', …);`, add:

```ts
check('carries four growths of stats', pick !== null && STAT_KEYS.reduce((n, k) => n + pick.stats[k] - speciesGrowth(pick.dexId, pick.build)!.floor[k], 0) >= 4);
check('stats are deterministic too', pick !== null && again !== null && STAT_KEYS.every((k) => pick.stats[k] === again.stats[k]));
```

In `scripts/db.test.ts`:

- add `updateOwnedGrowth,` to the `../api/_db.js` import list and add
  `import { STAT_KEYS, expectedStats } from '../src/game/growth.js';` and
  `import type { BaseStats } from '../src/game/types.js';`;
- give every inline spec a `stats` field: in group [1] `{ dexId: 10, level: 5, stats: expectedStats(10, 5), sign: 'aries', shiny: false, altColor: false }`;
  in group [2] and the `spec` constant of group [3] `{ dexId: 1, level: 5, stats: expectedStats(1, 5), sign: 'aries', shiny: false, altColor: false }`;
- before the final `console.log(\`\n${passed} passed…\`)`, add:

```ts
console.log('\n[4] stats round-trip and legacy rows backfill');
const eqStats = (a: BaseStats, b: BaseStats) => STAT_KEYS.every((k) => a[k] === b[k]);
const S4 = { hp: 9, atk: 8, eatk: 7, def: 6, edef: 5, spd: 4 };
const withStats = await insertOwned(db, 'u4', { dexId: 12, level: 9, stats: S4, sign: 'aries', shiny: false, altColor: false }, 'catch', 7);
const [back] = await readOwnedByIds(db, 'u4', [withStats.id]);
check('stats stored and read back', eqStats(back.stats, S4));
await db.execute({
  sql: `insert into owned_pokemon (id, user_id, dex_id, level, exp, sign, shiny, alt_color, origin, caught_at)
        values ('legacy', 'u4', 10, 12, 3, 'aries', 0, 0, 'catch', 8)`,
  args: [],
});
const [legacy] = await readOwnedByIds(db, 'u4', ['legacy']);
check('a legacy row without stats reads as an average individual of its level', eqStats(legacy.stats, expectedStats(10, 12)));
await db.execute({ sql: `update owned_pokemon set stats = ? where id = 'legacy'`, args: ['{"hp":"bad"}'] });
const [junk] = await readOwnedByIds(db, 'u4', ['legacy']);
check('malformed stats fall back the same way', eqStats(junk.stats, expectedStats(10, 12)));
const grown = { ...legacy, level: 13, exp: 1, stats: { ...legacy.stats, hp: legacy.stats.hp + 1 } };
await updateOwnedGrowth(db, 'u4', grown);
const [after] = await readOwnedByIds(db, 'u4', ['legacy']);
check('updateOwnedGrowth persists level, exp and stats', after.level === 13 && after.exp === 1 && after.stats.hp === legacy.stats.hp + 1);
await updateOwnedGrowth(db, 'u5', { ...grown, level: 40 });
const [notMine] = await readOwnedByIds(db, 'u4', ['legacy']);
check('another user cannot write it', notMine.level === 13);
```

In `scripts/growth.test.ts`, add `import { ownedMonToCreature } from '../src/game/box.js';` to the imports and,
before the final `console.log`, add:

```ts
console.log('\n[7] the creature the engine fights with');
{
  const base = { id: 'o1', dexId: BUTTERFREE, level: 32, exp: 0, sign: 'aries' as const, shiny: false, altColor: false, origin: 'catch' as const, caughtAt: 0 };
  const trained = ownedMonToCreature({ ...base, stats: g(BUTTERFREE).ceiling });
  check('a Butterfree at its ceilings fights with its real base stats', trained !== null && eq(trained.stats, CREATURES_BY_ID[String(BUTTERFREE)].stats));
  const fresh = ownedMonToCreature({ ...base, level: 1, stats: g(BUTTERFREE).floor });
  check('a fresh one fights at a fifth of that', fresh !== null && fresh.stats.eatk === toEngineStats(g(BUTTERFREE).floor).eatk);
  const stale = ownedMonToCreature({ ...base, stats: undefined as unknown as BaseStats });
  check('a row without stats fights as the average individual of its level', stale !== null && eq(stale.stats, toEngineStats(expectedStats(BUTTERFREE, 32))));
  check('an unknown species is null', ownedMonToCreature({ ...base, dexId: 99999, stats: g(BUTTERFREE).floor }) === null);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx scripts/evolution.test.ts`
Expected: FAIL — the script dies in group [2] with `Cannot read properties of undefined` because
`evolveOwned` returns no `stats` yet (and `g.growths` would be undefined in group [4]).

Run: `npx tsx scripts/db.test.ts`
Expected: FAIL — the script dies in group [4] with `Cannot read properties of undefined` because the rows
read back have no `stats` yet, and `updateOwnedGrowth` is not exported.

Run: `npx tsx scripts/growth.test.ts`
Expected: group [7] FAIL ("a Butterfree at its ceilings fights with its real base stats"), because the creature
is still scaled by level.

- [ ] **Step 3: `src/game/box.ts` — stats on the owned Pokémon**

Change the imports at the top of the file to:

```ts
import type { AbilityId, BaseStats, Build, Creature, Sign } from './types.js';
import { CREATURES_BY_ID } from './pokemon.js';
import {
  withSign,
  withAbility,
  withBuild,
  asShiny,
  asAltColor,
  canBeShiny,
  canBeAltColor,
  portraitUrl,
  shinyPortraitUrl,
  altColorPortraitUrl,
} from './pokemon.js';
import { isAbilityOption } from './abilities.js';
import { canRollBuild } from './moves.js';
import { ALL_SIGNS } from './zodiac.js';
import { clampLevel } from './levels.js';
import { expectedStats, isBaseStats, toEngineStats } from './growth.js';
```

Add `stats` to both interfaces:

```ts
/** A permanently-owned, unique Pokémon (one row of the player's box). */
export interface OwnedMon {
  id: string;
  dexId: number;
  /** Hidden: paces EXP and evolution; no screen prints it. */
  level: number;
  exp: number;
  /** The six current stats on the growth model's scale (growth.ts); × 2.5 is what the engine sees. */
  stats: BaseStats;
  sign: Sign;
  ability?: AbilityId;
  build?: Build;
  shiny: boolean;
  altColor: boolean;
  emotion?: string;
  /** Player-given name (1–12 chars); the species name when absent. */
  nickname?: string;
  origin: CatchOrigin;
  caughtAt: number;
}

/** The rolled identity of a fresh catch, before the server assigns id/caughtAt. */
export interface MintSpec {
  dexId: number;
  level: number;
  stats: BaseStats;
  sign: Sign;
  ability?: AbilityId;
  build?: Build;
  shiny: boolean;
  altColor: boolean;
  emotion?: string;
}
```

Replace the last two lines of `ownedMonToCreature` (`if (mon.nickname) …` and `return scaleCreatureToLevel(…)`)
with:

```ts
  if (mon.nickname) c = { ...c, name: mon.nickname };
  // A row that arrived without stats (an older server mid-deploy) fights as the
  // average individual of its level; the server backfills the same way.
  const stats = isBaseStats(mon.stats) ? mon.stats : expectedStats(base.dexId, clampLevel(mon.level), mon.build);
  return { ...c, stats: toEngineStats(stats) };
```

Update its doc comment: "then scale its base stats to the mon's level" becomes "then hand the engine the
individual's current stats (× 2.5)". Delete `ownedPower` and its comment entirely (it has no callers; confirm
with `grep -rn ownedPower src api scripts`).

- [ ] **Step 4: `src/game/evolution.ts` — grow one level at a time, evolve with a carry-over**

Replace the whole file with:

```ts
import type { OwnedMon, CatchOrigin } from './box.js';
import type { BaseStats } from './types.js';
import { rollAbility } from './abilities.js';
import { applyExp, clampLevel } from './levels.js';
import { evolutionTargets, stageOf } from './lines.js';
import {
  speciesGrowth,
  growOnce,
  evolveStats,
  expectedStats,
  isBaseStats,
  statDeltas,
  type GrowthEvent,
} from './growth.js';
import type { RNG } from './rng.js';

export { stageOf } from './lines.js';

// Owned mons evolve when their hidden level reaches a stage threshold. Slice 1
// is level-only; slice 3 adds the affection gate on top. Thresholds are by
// STAGE, not by species, so every line grows on the same clock: a starter
// (origin 'starter') at 8 and 16, everything else at 16 and 32. Stats carry
// through evolution (see evolveStats in growth.ts).

export const STARTER_EVOLUTION_LEVELS: readonly number[] = [8, 16];
export const DEFAULT_EVOLUTION_LEVELS: readonly number[] = [16, 32];

/** Level at which this species evolves, or null when it is a final form. */
export function evolutionLevel(dexId: number, origin: CatchOrigin): number | null {
  if (evolutionTargets(dexId).length === 0) return null;
  const table = origin === 'starter' ? STARTER_EVOLUTION_LEVELS : DEFAULT_EVOLUTION_LEVELS;
  const stage = stageOf(dexId);
  return table[Math.min(stage, table.length - 1)] ?? null;
}

/** The individual's stats, or an average individual's when a row arrived without them. */
function currentStats(mon: OwnedMon): BaseStats {
  return isBaseStats(mon.stats) ? mon.stats : expectedStats(mon.dexId, clampLevel(mon.level), mon.build);
}

/**
 * Evolve an owned mon one stage. Branched lines pick with `rng` (seed it from
 * the mon id so the pick is stable). Keeps sign, build, colouring, emotion,
 * nickname, level and exp; carries every stat point over (evolveStats); re-rolls
 * the ability for the new species so it always carries a legal one. Pure.
 */
export function evolveOwned(mon: OwnedMon, rng: RNG): OwnedMon {
  const next = evolutionTargets(mon.dexId);
  if (next.length === 0) return mon;
  const toDexId = next.length === 1 ? next[0] : rng.pick(next);
  const ability = rollAbility(toDexId, rng);
  const stats = evolveStats(currentStats(mon), mon.dexId, toDexId, clampLevel(mon.level), mon.build);
  const rest = { ...mon };
  delete rest.ability;
  return { ...rest, dexId: toDexId, stats, ...(ability ? { ability } : {}) };
}

export interface GrowthResult {
  mon: OwnedMon;
  levelUp: { fromLevel: number; toLevel: number } | null;
  /** One entry per hidden level reached, in order. */
  growths: GrowthEvent[];
  evolutions: { fromDexId: number; toDexId: number; deltas: BaseStats }[];
}

/**
 * Apply EXP level by level: each hidden level reached fires one growth for the
 * current species, then evolves if that level crosses the stage threshold, so
 * later growths roll with the new form's potential. A Pokémon already past its
 * threshold (a legacy row) evolves even when no level is gained. Pure; the
 * caller owns the RNG.
 */
export function applyGrowthWithEvolution(mon: OwnedMon, gained: number, rng: RNG): GrowthResult {
  const fromLevel = clampLevel(mon.level);
  const grown = applyExp(fromLevel, mon.exp, gained);
  let cur: OwnedMon = { ...mon, level: fromLevel, stats: currentStats(mon) };
  const growths: GrowthEvent[] = [];
  const evolutions: GrowthResult['evolutions'] = [];

  const evolveIfDue = () => {
    for (let guard = 0; guard < 4; guard++) {
      const at = evolutionLevel(cur.dexId, cur.origin);
      if (at === null || cur.level < at) return;
      const evolved = evolveOwned(cur, rng);
      if (evolved.dexId === cur.dexId) return;
      evolutions.push({ fromDexId: cur.dexId, toDexId: evolved.dexId, deltas: statDeltas(cur.stats, evolved.stats) });
      cur = evolved;
    }
  };

  for (let level = fromLevel + 1; level <= grown.level; level++) {
    const g = speciesGrowth(cur.dexId, cur.build);
    if (g) {
      const r = growOnce(cur.stats, g, rng);
      cur = { ...cur, level, stats: r.stats };
      growths.push({ level, gains: r.gains, capped: r.capped, tryingHard: r.tryingHard });
    } else {
      cur = { ...cur, level };
    }
    evolveIfDue();
  }
  evolveIfDue();
  cur = { ...cur, exp: grown.exp };
  const levelUp = grown.levelsGained > 0 ? { fromLevel, toLevel: grown.level } : null;
  return { mon: cur, levelUp, growths, evolutions };
}
```

- [ ] **Step 5: `src/game/professions.ts` — starters mint stats**

Add `import { mintStats } from './growth.js';` next to the other imports, and replace the last two lines of
`starterFromOffer`:

```ts
  const rng = new RNG(`starter:${uid}:${dexId}`);
  const identity = rollIdentity(species, rng);
  // Same stream, after the identity draws: an existing account's starter keeps
  // its sign, ability, build and colour, and now gets its four growths too.
  const stats = mintStats(species.dexId, STARTER_LEVEL, rng, identity.build);
  return { dexId: species.dexId, level: STARTER_LEVEL, ...identity, stats };
```

- [ ] **Step 6: `src/game/levels.ts` — the hidden level only**

Replace the whole file with:

```ts
// Owned Pokémon carry a hidden level (1..MAX_LEVEL) that paces EXP and triggers
// evolution. Stats no longer scale with it: growth.ts rolls them one hidden
// level at a time. No screen prints the level; the EXP bar (expPercent) is what
// the player sees.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 50;

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.floor(level)));
}

// --- EXP curve ---------------------------------------------------------------

/** EXP needed to advance FROM `level` to `level + 1`. Grows with level. */
export function expToNext(level: number): number {
  const l = clampLevel(level);
  if (l >= MAX_LEVEL) return Infinity;
  return 20 * l;
}

export interface Growth {
  level: number;
  exp: number; // progress toward the next level (0..expToNext(level))
}

/**
 * Apply earned EXP to a (level, exp) pair, rolling over as many levels as the
 * gain covers and clamping at MAX_LEVEL. Pure. Returns the new growth plus how
 * many levels were gained (evolution.ts fires one growth per level gained).
 */
export function applyExp(level: number, exp: number, gained: number): Growth & { levelsGained: number } {
  let lvl = clampLevel(level);
  let cur = Math.max(0, Math.floor(exp)) + Math.max(0, Math.floor(gained));
  const startLevel = lvl;
  while (lvl < MAX_LEVEL && cur >= expToNext(lvl)) {
    cur -= expToNext(lvl);
    lvl += 1;
  }
  if (lvl >= MAX_LEVEL) cur = 0;
  return { level: lvl, exp: cur, levelsGained: lvl - startLevel };
}

/** EXP bar progress, 0..100, toward the next hidden level; 100 at the cap. */
export function expPercent(level: number, exp: number): number {
  if (clampLevel(level) >= MAX_LEVEL) return 100;
  return Math.min(100, Math.floor((100 * Math.max(0, exp)) / expToNext(level)));
}
```

Then run `grep -rn "scaleCreatureToLevel\|levelStatMult\|ownedPower" src api scripts`. Expected: no matches.
If `src/game/world.ts` matches, apply the world-slice note from Global Constraints.

- [ ] **Step 7: `api/_db.ts` — persist stats, backfill legacy rows**

Change the `COLUMN_ADDS` constant to:

```ts
/** Statements that add columns to existing tables; each is a no-op on re-run. */
const COLUMN_ADDS = [
  'alter table owned_pokemon add column nickname text',
  // The six current stats on the growth model's scale, JSON text. Null on rows
  // minted before the growth system; rowToOwned backfills those on read.
  'alter table owned_pokemon add column stats text',
];
```

Extend the existing type import to `import type { AbilityId, BaseStats, Build, Sign } from '../src/game/types.js';`
and add `import { expectedStats, isBaseStats } from '../src/game/growth.js';` next to the `../src/game/box.js`
import (same relative root: `api/_db.ts` lives in `api/`).

Replace `rowToOwned` with:

```ts
/** Stored `stats` JSON → BaseStats, or null when absent or malformed. */
function parseStats(raw: unknown): BaseStats | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isBaseStats(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Build an OwnedMon from a raw SQLite row (snake_case columns, 0/1 booleans).
 * A row without usable `stats` (minted before the growth system) reads as an
 * average individual of its species at its level; the next growth persists it.
 */
export function rowToOwned(r: Record<string, unknown>): OwnedMon {
  const dexId = Number(r.dex_id) || 0;
  const level = Number(r.level) || 1;
  const build = r.build ? (String(r.build) as Build) : undefined;
  return {
    id: String(r.id),
    dexId,
    level,
    exp: Number(r.exp) || 0,
    stats: parseStats(r.stats) ?? expectedStats(dexId, level, build),
    sign: String(r.sign ?? '') as Sign,
    ...(r.ability ? { ability: String(r.ability) as AbilityId } : {}),
    ...(build ? { build } : {}),
    shiny: Number(r.shiny) === 1,
    altColor: Number(r.alt_color) === 1,
    ...(r.emotion ? { emotion: String(r.emotion) } : {}),
    ...(r.nickname ? { nickname: String(r.nickname) } : {}),
    origin: (String(r.origin ?? 'catch') as CatchOrigin),
    caughtAt: Number(r.caught_at) || 0,
  };
}
```

In `ownedFromSpec`, add `stats: spec.stats,` right after `exp: 0,`.

In `insertOwned`, change the SQL and args to:

```ts
    sql: `insert into owned_pokemon
          (id, user_id, dex_id, level, exp, stats, sign, ability, build, shiny, alt_color, emotion, origin, caught_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      uid,
      spec.dexId,
      spec.level,
      0,
      JSON.stringify(spec.stats),
      spec.sign,
      spec.ability ?? null,
      spec.build ?? null,
      spec.shiny ? 1 : 0,
      spec.altColor ? 1 : 0,
      spec.emotion ?? null,
      origin,
      now,
    ],
```

In `insertProfileWithStarter`, change the owned insert the same way:

```ts
      {
        sql: `insert into owned_pokemon
              (id, user_id, dex_id, level, exp, stats, sign, ability, build, shiny, alt_color, emotion, origin, caught_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, p.userId, spec.dexId, spec.level, 0, JSON.stringify(spec.stats), spec.sign, spec.ability ?? null, spec.build ?? null, spec.shiny ? 1 : 0, spec.altColor ? 1 : 0, spec.emotion ?? null, 'starter', now],
      },
```

After `updateOwnedNickname`, add:

```ts
// --- Growth ------------------------------------------------------------------

/**
 * Persist what a growth changed: the hidden level, EXP, stats and, after an
 * evolution, the species and ability. Scoped to the owner; a foreign id is a
 * no-op.
 */
export async function updateOwnedGrowth(db: Executor, uid: string, mon: OwnedMon): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set dex_id = ?, level = ?, exp = ?, stats = ?, ability = ? where id = ? and user_id = ?',
    args: [mon.dexId, mon.level, mon.exp, JSON.stringify(mon.stats), mon.ability ?? null, mon.id, uid],
  });
}
```

In `db/schema.sql`, extend the comment block above `create table if not exists owned_pokemon` with:

```sql
--
-- `stats` (added through COLUMN_ADDS in api/_db.ts, like `nickname`) is JSON
-- text: the six current stats on the growth model's scale (src/game/growth.ts).
-- Null on rows minted before the growth system; api/_db.ts backfills those on
-- read as an average individual of the species at that level.
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx tsx scripts/growth.test.ts && npx tsx scripts/evolution.test.ts && npx tsx scripts/levels.test.ts && npx tsx scripts/professions.test.ts && npx tsx scripts/db.test.ts`
Expected: every file ends with `0 failed`.

Run: `npx tsc -b && npx tsc -p tsconfig.api.json`
Expected: no errors. (`HubParty.tsx` still imports `MAX_LEVEL`, which stays; `BoxScreen.tsx` still compiles
because it reads `creature.stats` and `open.level`; both change in Task 4.)

- [ ] **Step 9: Commit**

```bash
git add src/game/box.ts src/game/evolution.ts src/game/professions.ts src/game/levels.ts api/_db.ts db/schema.sql scripts/evolution.test.ts scripts/levels.test.ts scripts/professions.test.ts scripts/db.test.ts scripts/growth.test.ts
git commit -m "Grow owned Pokémon one hidden level at a time and carry stats through evolution"
```

---

### Task 3: The local-dev `grow` action

**Files:**
- Create: `api/_dev.ts`
- Modify: `api/me/[action].ts` (imports, the `switch`, a new `grow` function at the end)
- Modify: `src/game/dev.ts` (append `devGrowOnce`)
- Create: `scripts/grow.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: `applyGrowthWithEvolution`, `updateOwnedGrowth`, `readOwnedByIds`, `expToNext`, `MAX_LEVEL`, `RNG`.
- Produces: `POST /api/me/grow { id }` → `{ ok: true, mon: OwnedMon, growths: GrowthEvent[], evolutions:
  { fromDexId, toDexId, deltas }[] }`, 404 unless `VERCEL_ENV === 'development'`; `isLocalDev()`
  (`api/_dev.ts`); `devGrowOnce(id): Promise<DevGrowResult>` (`src/game/dev.ts`).

- [ ] **Step 1: Write the failing test**

Create `scripts/grow.test.ts`:

```ts
/**
 * The dev-only `grow` action through the real dispatcher: refused outside local
 * dev, owner-scoped, and it writes exactly one growth.
 *
 *   npx --yes tsx scripts/grow.test.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'rr-grow-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'grow.db')}`;
delete process.env.TURSO_AUTH_TOKEN;
process.env.AUTH_SECRET = 'grow-test-secret-0123456789abcdef';
process.env.VERCEL_ENV = 'production';

const { default: handler } = await import('../api/me/[action].js');
const { getDb, applySchema, insertOwned, readOwnedByIds } = await import('../api/_db.js');
const { signSession } = await import('../api/_session.js');
const { mintStats } = await import('../src/game/growth.js');
const { MAX_LEVEL } = await import('../src/game/levels.js');
const { RNG } = await import('../src/game/rng.js');

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

type Json = Record<string, unknown>;
/** Drive the dispatcher the way scripts/dev-api.ts does: query.action, a JSON body, a cookie header. */
function call(action: string, opts: { method?: string; body?: unknown; uid?: string } = {}): Promise<{ status: number; json: Json; allow?: string }> {
  return new Promise((resolve) => {
    const cookie = opts.uid ? `rr_session=${signSession(opts.uid, process.env.AUTH_SECRET as string)}` : '';
    const req = {
      method: opts.method ?? 'POST',
      query: { action },
      body: opts.body ?? {},
      headers: cookie ? { cookie } : {},
      cookies: {},
    };
    let status = 200;
    const headers: Record<string, string> = {};
    const res = {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
      status(c: number) {
        status = c;
        return res;
      },
      json(j: Json) {
        resolve({ status, json: j, allow: headers.Allow });
        return res;
      },
    };
    void handler(req as never, res as never);
  });
}

try {
  console.log('[1] refused outside local dev');
  const prod = await call('grow', { uid: 'u1', body: { id: 'x' } });
  check('404 in production', prod.status === 404);

  process.env.VERCEL_ENV = 'development';
  const db = getDb();
  if (!db) throw new Error('no db');
  await applySchema(db);
  const mon = await insertOwned(db, 'u1', { dexId: 10, level: 5, stats: mintStats(10, 5, new RNG('t')), sign: 'aries', shiny: false, altColor: false }, 'starter', 1);

  console.log('\n[2] gate, ownership, and one growth');
  check('401 without a session', (await call('grow', { body: { id: mon.id } })).status === 401);
  const get = await call('grow', { uid: 'u1', method: 'GET', body: { id: mon.id } });
  check('405 with Allow on GET', get.status === 405 && get.allow === 'POST');
  check('400 without an id', (await call('grow', { uid: 'u1', body: {} })).status === 400);
  check("404 for another user's Pokémon", (await call('grow', { uid: 'u2', body: { id: mon.id } })).status === 404);
  const [untouched] = await readOwnedByIds(db, 'u1', [mon.id]);
  check('nothing was written by the refused calls', untouched.level === 5);

  const grown = await call('grow', { uid: 'u1', body: { id: mon.id } });
  const gm = grown.json.mon as { level: number; exp: number; stats: Record<string, number> };
  const growths = grown.json.growths as unknown[];
  check('200 and one hidden level up', grown.status === 200 && grown.json.ok === true && gm.level === 6);
  check('exactly one growth event', growths.length === 1);
  check('the bar starts over', gm.exp === 0);
  const [row] = await readOwnedByIds(db, 'u1', [mon.id]);
  check('the row persisted level and stats', row.level === 6 && JSON.stringify(row.stats) === JSON.stringify(gm.stats));

  console.log('\n[3] nothing past the cap');
  const capped = await insertOwned(db, 'u1', { dexId: 10, level: MAX_LEVEL, stats: mintStats(10, MAX_LEVEL, new RNG('c')), sign: 'aries', shiny: false, altColor: false }, 'catch', 2);
  check('400 at the cap', (await call('grow', { uid: 'u1', body: { id: capped.id } })).status === 400);

  db.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/grow.test.ts`
Expected: FAIL — "404 in production" passes by accident (unknown action), then "401 without a session" fails
because the dispatcher answers 404 for `grow`.

- [ ] **Step 3: Create `api/_dev.ts`**

```ts
// Local-dev-only switches. scripts/dev-api.ts sets VERCEL_ENV=development (so
// does `vercel dev`); Vercel's own builds set production or preview. Read
// lazily so a missing value is simply false.

/** True only under local dev; dev-only actions answer 404 everywhere else. */
export function isLocalDev(): boolean {
  return process.env.VERCEL_ENV === 'development';
}
```

- [ ] **Step 4: Add the action to `api/me/[action].ts`**

Add to the imports:

```ts
import { isLocalDev } from '../_dev.js';
import { applyGrowthWithEvolution } from '../../src/game/evolution.js';
import { expToNext, MAX_LEVEL } from '../../src/game/levels.js';
import { RNG } from '../../src/game/rng.js';
```

and add `updateOwnedGrowth,` to the `../_db.js` import list. In the `switch`, before `default:`, add:

```ts
    case 'grow':
      return grow(req, res);
```

Append at the end of the file:

```ts
// --- grow (local dev only) ---------------------------------------------------

/**
 * Fill the EXP bar of one owned Pokémon and apply the growth, so the whole path
 * (rolls, ceilings, evolution, persistence, the Box) can be exercised before the
 * world map grants EXP. 404 outside local dev, so it never exists in production.
 */
async function grow(req: VercelRequest, res: VercelResponse) {
  if (!isLocalDev()) return res.status(404).json({ ok: false, error: 'not found' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'sign in first' });
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: 'accounts unavailable' });

  const body = parseBody(req);
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return res.status(400).json({ ok: false, error: 'which Pokémon?' });
  try {
    const [mon] = await readOwnedByIds(db, uid, [id]);
    if (!mon) return res.status(404).json({ ok: false, error: 'not your Pokémon' });
    if (mon.level >= MAX_LEVEL) return res.status(400).json({ ok: false, error: 'it has grown all it can' });
    const gained = Math.max(1, expToNext(mon.level) - mon.exp);
    const result = applyGrowthWithEvolution(mon, gained, new RNG(`grow:${mon.id}:${mon.level}`));
    await updateOwnedGrowth(db, uid, result.mon);
    return res.status(200).json({ ok: true, mon: result.mon, growths: result.growths, evolutions: result.evolutions });
  } catch (err) {
    console.error('[me/grow] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not grow' });
  }
}
```

- [ ] **Step 5: Add the client helper to `src/game/dev.ts`**

Add these three imports at the top of the file, above the module comment (imports precede code):

```ts
import type { OwnedMon } from './box.js';
import type { GrowthEvent } from './growth.js';
import type { BaseStats } from './types.js';
```

Then append at the end of the file:

```ts
export interface DevGrowResult {
  ok: boolean;
  mon?: OwnedMon;
  growths?: GrowthEvent[];
  evolutions?: { fromDexId: number; toDexId: number; deltas: BaseStats }[];
  error?: string;
}

/**
 * Fill one owned Pokémon's EXP bar through the local-dev-only `grow` action.
 * No-op outside dev. Never throws; `ok: false` carries a player-facing error.
 */
export async function devGrowOnce(id: string): Promise<DevGrowResult> {
  if (!DEV) return { ok: false, error: 'dev only' };
  try {
    const res = await fetch('/api/me/grow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });
    const data = (await res.json().catch(() => ({}))) as DevGrowResult;
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'could not grow' };
    return data;
  } catch {
    return { ok: false, error: 'network error — please try again' };
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx tsx scripts/grow.test.ts`
Expected: `N passed, 0 failed`.

Run: `npx tsc -p tsconfig.api.json && npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Append the file to the test chain**

In `package.json`, append `&& tsx scripts/grow.test.ts` to the end of the `"test"` script.

- [ ] **Step 8: Commit**

```bash
git add api/_dev.ts "api/me/[action].ts" src/game/dev.ts scripts/grow.test.ts package.json
git commit -m "Add a local-dev grow action to exercise growth end to end"
```

---

### Task 4: The Box, the Hub party strip and the starter reveal without a level

**Files:**
- Create: `src/components/ui/ExpBar.tsx`
- Create: `src/components/GrowthStats.tsx`
- Rewrite: `src/components/BoxScreen.tsx`
- Modify: `src/components/HubParty.tsx` (imports; the level `<div>` near the end of each `<li>`)
- Modify: `src/components/OnboardingScreen.tsx` (imports; the "Lv … born under" line, near line 154)
- Modify: `src/App.tsx` (the `<BoxScreen …/>` element, near line 156)

**Interfaces:**
- Consumes: `expPercent`, `clampLevel`, `MAX_LEVEL` (`levels.ts`); `STAT_KEYS`, `STAT_LABELS`, `speciesGrowth`,
  `potentialSentence`, `growthLines`, `evolutionLines` (`growth.ts`); `evolutionLevel` (`evolution.ts`);
  `DEV`, `devGrowOnce` (`dev.ts`); `StatBar` (`ui/StatBar.tsx`); `signLabel` (`zodiac.ts`).
- Produces: `ExpBar({ level, exp, showPercent? })`, `GrowthStats({ mon })`, `BoxScreen` prop
  `onUpdated(mon: OwnedMon)`.

No unit tests: the rows and bars are presentational over tested helpers, and nothing new meets
`.agents/rules/testing.md`'s four questions. Evidence is the type-check plus the browser check in Task 5.

- [ ] **Step 1: Create `src/components/ui/ExpBar.tsx`**

```tsx
import { clampLevel, expPercent, MAX_LEVEL } from '../../game/levels';
import { StatBar } from './StatBar';

/**
 * The EXP bar: progress toward the next hidden level, MAX at the cap. It never
 * prints the level; that number stays on the server side of the screen.
 */
export function ExpBar({ level, exp, showPercent = false }: { level: number; exp: number; showPercent?: boolean }) {
  const maxed = clampLevel(level) >= MAX_LEVEL;
  const pct = expPercent(level, exp);
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <span className="font-label text-[8px] uppercase text-info">EXP</span>
      {maxed ? (
        <span className="font-label text-[9px] uppercase text-accent">MAX</span>
      ) : (
        <StatBar value={pct} max={100} tone="night" label={`EXP ${pct}%`} segments={8} />
      )}
      {showPercent && !maxed && <span className="font-label text-[9px] text-ink-dim">{pct}%</span>}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/GrowthStats.tsx`**

```tsx
import { useState } from 'react';
import type { OwnedMon } from '../game/box';
import { STAT_KEYS, STAT_LABELS, potentialSentence, speciesGrowth, type StatKey } from '../game/growth';
import { StatBar } from './ui/StatBar';

/**
 * Six stat rows: a bar filled to the species' ceiling, the number, a MAX pip
 * when the stat won't go any higher, and the Judge line on tap. No level here.
 */
export function GrowthStats({ mon }: { mon: OwnedMon }) {
  const [openKey, setOpenKey] = useState<StatKey | null>(null);
  const g = speciesGrowth(mon.dexId, mon.build);
  if (!g) return null;
  return (
    <ul className="mt-4 flex flex-col gap-1.5">
      {STAT_KEYS.map((k) => {
        const value = mon.stats[k];
        const capped = value >= g.ceiling[k];
        const open = openKey === k;
        return (
          <li key={k}>
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : k)}
              aria-expanded={open}
              className="ui-focus flex w-full items-center gap-2 text-left"
            >
              <span className="w-12 shrink-0 font-label text-[9px] uppercase text-info">{STAT_LABELS[k].short}</span>
              <StatBar value={value} max={g.ceiling[k]} tone="night" label={`${STAT_LABELS[k].long} ${value}`} />
              <span className="w-8 shrink-0 text-right font-label text-[10px] text-white">{value}</span>
              <span className="w-7 shrink-0 font-label text-[8px] uppercase text-accent">{capped ? 'MAX' : ''}</span>
            </button>
            {open && <p className="mt-1 pl-14 text-xs text-white/60">{potentialSentence(k, g.potential[k])}</p>}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Rewrite `src/components/BoxScreen.tsx`**

Read the current file first (another slice may have touched it); keep any prop or import it gained that
this plan does not mention. Then replace it with:

```tsx
import { useMemo, useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { setNickname, cleanNickname, NICKNAME_MAX } from '../game/profile';
import { evolutionLevel } from '../game/evolution';
import { STAT_KEYS, STAT_LABELS, evolutionLines, growthLines, speciesGrowth } from '../game/growth';
import { DEV, devGrowOnce } from '../game/dev';
import { CREATURES_BY_ID } from '../game/pokemon';
import { signLabel } from '../game/zodiac';
import { MiniSprite } from './MiniSprite';
import { ExpBar } from './ui/ExpBar';
import { GrowthStats } from './GrowthStats';

// The box: every owned individual, newest first, with a detail drawer. No level
// is printed anywhere here: the EXP bar and the six stat bars carry growth.

/** "Close to evolving" from this many hidden levels out; nothing before. */
const EVOLUTION_HINT_LEVELS = 3;

function closeToEvolving(mon: OwnedMon): boolean {
  const at = evolutionLevel(mon.dexId, mon.origin);
  return at !== null && mon.level >= at - EVOLUTION_HINT_LEVELS;
}

function originLabel(mon: OwnedMon): string {
  return mon.origin === 'starter' ? 'Your starter' : mon.origin === 'tutorial' ? 'First catch' : 'Caught';
}

/** Dev-only readout of what the player never sees: the hidden level, exact potential and ceilings, and a Grow once button. */
function DevGrowth({ mon, busy, onGrow }: { mon: OwnedMon; busy: boolean; onGrow: () => void }) {
  const g = speciesGrowth(mon.dexId, mon.build);
  return (
    <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-[11px] text-amber-100/80">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold uppercase tracking-widest text-amber-200/70">Dev · hidden level {mon.level} · EXP {mon.exp}</span>
        <button type="button" disabled={busy} onClick={onGrow} className="rounded-full border border-amber-300/40 px-3 py-1 font-semibold text-amber-200 disabled:opacity-60">
          {busy ? '…' : 'Grow once'}
        </button>
      </div>
      {g && (
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-amber-200/50"><th>Stat</th><th>Now</th><th>Potential</th><th>Ceiling</th></tr>
          </thead>
          <tbody>
            {STAT_KEYS.map((k) => (
              <tr key={k}><td>{STAT_LABELS[k].short}</td><td>{mon.stats[k]}</td><td>{g.potential[k]}%</td><td>{g.ceiling[k]}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function BoxScreen({ box, onBack, onRenamed, onUpdated }: {
  box: OwnedMon[];
  onBack: () => void;
  onRenamed: (id: string, nickname: string) => void;
  onUpdated: (mon: OwnedMon) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [growing, setGrowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGrowth, setLastGrowth] = useState<string[]>([]);
  const open = useMemo(() => box.find((m) => m.id === openId) ?? null, [box, openId]);
  const creature = useMemo(() => (open ? ownedMonToCreature(open) : null), [open]);

  const select = (id: string) => {
    setOpenId(id);
    setNick('');
    setError(null);
    setLastGrowth([]);
  };

  const save = async () => {
    if (!open) return;
    const clean = cleanNickname(nick);
    if (!clean) {
      setError(`Nicknames are 1–${NICKNAME_MAX} characters.`);
      return;
    }
    setBusy(true);
    const r = await setNickname(open.id, clean);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'Could not save.');
    setError(null);
    setNick('');
    onRenamed(open.id, clean);
  };

  const grow = async () => {
    if (!open || !creature) return;
    setGrowing(true);
    const r = await devGrowOnce(open.id);
    setGrowing(false);
    if (!r.ok || !r.mon) return setError(r.error ?? 'Could not grow.');
    const lines: string[] = [];
    for (const e of r.growths ?? []) lines.push(...growthLines(creature.name, e));
    for (const ev of r.evolutions ?? []) lines.push(...evolutionLines(creature.name, CREATURES_BY_ID[String(ev.toDexId)].name, ev.deltas));
    setLastGrowth(lines);
    setError(null);
    onUpdated(r.mon);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Box <span className="text-sm font-semibold text-white/40">{box.length}</span></h1>
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">Back</button>
      </header>

      <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {box.map((m) => {
          const c = ownedMonToCreature(m);
          if (!c) return null;
          return (
            <button key={m.id} type="button" onClick={() => select(m.id)} className={`flex flex-col items-center gap-1 rounded-2xl border p-2 ${m.id === openId ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <MiniSprite creature={c} className="h-9 w-9" />
              <span className="w-full truncate text-[10px] text-white/70">{c.name}</span>
              <ExpBar level={m.level} exp={m.exp} />
            </button>
          );
        })}
      </div>

      {open && creature && (
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-4">
            <img src={creature.portrait} alt={creature.name} className="h-20 w-20 rounded-2xl object-contain [image-rendering:pixelated]" />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black text-white">{creature.name}</div>
              <div className="text-xs text-white/50">{CREATURES_BY_ID[String(open.dexId)].name} · {signLabel(open.sign)}{open.shiny ? ' · Shiny' : ''}</div>
              <div className="text-xs text-white/50">{originLabel(open)}</div>
              {closeToEvolving(open) && <div className="text-xs text-emerald-300/80">Close to evolving</div>}
              <div className="mt-2"><ExpBar level={open.level} exp={open.exp} showPercent /></div>
            </div>
          </div>
          <GrowthStats mon={open} />
          {lastGrowth.length > 0 && (
            <ul className="mt-4 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/80" aria-live="polite">
              {lastGrowth.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={NICKNAME_MAX} placeholder="Nickname" className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
            <button type="button" disabled={busy} onClick={save} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black disabled:opacity-60">{busy ? '…' : 'Save'}</button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
          {DEV && <DevGrowth mon={open} busy={growing} onGrow={grow} />}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `src/components/HubParty.tsx` — an EXP line instead of `Lv.N`**

Replace `import { MAX_LEVEL } from '../game/levels';` with `import { ExpBar } from './ui/ExpBar';`, and replace
the level `<div>` (the one whose text is `` `Lv.${entry.mon.level}` ``) with:

```tsx
              <div className="mt-1.5 min-h-[14px]">
                {entry && creature ? (
                  <ExpBar level={entry.mon.level} exp={entry.mon.exp} />
                ) : (
                  <span aria-hidden="true" className="font-label text-[9px] text-ink">—</span>
                )}
              </div>
```

- [ ] **Step 5: `src/components/OnboardingScreen.tsx` — no level on the reveal**

Add `import { signLabel } from '../game/zodiac';` and replace the line

```tsx
          <div className="mt-1 text-sm text-white/60">Lv {starter.level} · born under {starter.sign}</div>
```

with

```tsx
          <div className="mt-1 text-sm text-white/60">Born under {signLabel(starter.sign)}</div>
```

- [ ] **Step 6: `src/App.tsx` — pass `onUpdated`**

Change the `<BoxScreen …/>` element to:

```tsx
        return (
          <BoxScreen
            box={box}
            onBack={() => setPhase('hub')}
            onRenamed={(id, nickname) => setBox((b) => b.map((m) => (m.id === id ? { ...m, nickname } : m)))}
            onUpdated={(mon) => setBox((b) => b.map((m) => (m.id === mon.id ? mon : m)))}
          />
        );
```

- [ ] **Step 7: Type-check, lint, and confirm no level is printed**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

Run: `grep -rnE "Lv\b|Lv\.|\.level\b" src/components src/App.tsx`
Expected: matches only inside `BoxScreen.tsx`'s `DevGrowth` and `closeToEvolving`, and inside
`ExpBar`/`HubParty`/`BoxScreen` where `level` is passed to `ExpBar` (never rendered as text).

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/ExpBar.tsx src/components/GrowthStats.tsx src/components/BoxScreen.tsx src/components/HubParty.tsx src/components/OnboardingScreen.tsx src/App.tsx
git commit -m "Hide levels: EXP bars and stat bars in the Box, Hub and starter reveal"
```

---

### Task 5: Docs, the browser check, the full gate, and review

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]`)
- Modify: `.agents/rules/frontend.md` (the "authoritative" bullet, line 15)

- [ ] **Step 1: Changelog and rules**

In `CHANGELOG.md` under `## [Unreleased]`:

- under `### Changed`, add as the first line:
  `- **Growth** — levels are hidden. A Pokémon shows an EXP bar and six stats; when the bar fills it grows: each stat rolls against its potential (read out in Judge words) and rises by one, up to the species' ceiling. Evolution carries every point over and adds a bonus. A fully trained Pokémon fights exactly as strong as before.`
- change the existing `**Hub party preview**` line so "their levels" reads "their EXP";
- change the existing `**Box** — nickname your Pokémon; starters evolve at 8 and 16, others at 16 and 32.` line
  to `- **Box** — nickname your Pokémon; starters evolve twice, early, caught Pokémon later.`;
- under `### Removed` (create the heading if the section lacks it), add:
  `- Level numbers on the Hub, in the Box and on the starter reveal.`

In `.agents/rules/frontend.md`, change the bullet

`- The server is authoritative for levels, EXP, evolutions, and the box. Render what a response returns; never`

to

`- The server is authoritative for growth (stats, the hidden level, EXP), evolutions, and the box. Render what a response returns; never`

- [ ] **Step 2: The full gate**

Run: `npm run lint && npm test && npm run build`
Expected: lint clean; every test script ends with `0 failed` (including `growth.test.ts` and `grow.test.ts`);
`tsc -b`, `tsc -p tsconfig.api.json` and `vite build` succeed. Record the HEAD and the output in the task
report; separate any pre-existing failure from this slice's.

- [ ] **Step 3: Browser check under `npm run dev:local`**

Start `npm run dev:local` (Vite on 5173, `TURSO_DATABASE_URL=file:local.db` from `.env.local`), sign in with a
local account (`scripts/create-test-account.ts` if none), and check at 375 px and desktop width:

1. Hub: the party strip shows an EXP line under each sprite and no `Lv`; an empty slot shows the dash.
2. Box grid: every tile shows an EXP line, no level.
3. Box detail: species · sign line without a level; the EXP bar with its percentage; six stat rows with the
   number, a MAX pip only on capped stats, and the Judge sentence toggling on tap; the dev block shows the
   hidden level, potential and ceilings.
4. Press "Grow once": the growth lines appear ("<name> grew!" and the gains, or "is trying hard!"), the bar
   and stat rows update without a reload, the Hub strip agrees after Back.
5. Grow a starter past its threshold (8 for a starter): "Close to evolving" appears from three levels out,
   then the evolution lines appear with per-stat deltas, the sprite and species change, and no stat went
   down.
6. Onboarding (a fresh local account): the reveal reads "Born under <Sign>", no level.
7. Nothing on any screen prints the word "level" outside the amber dev block.

Record what was checked and where. If a check cannot run, say so; do not call it passed.

- [ ] **Step 4: Reviewer pass**

Run the `reviewer` subagent on the whole branch diff (`git diff main...development` scoped to the files this
plan names). This slice changes the growth path, the save format and the schema. Fix every P0 and P1 before
committing; list P2s in the report.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md .agents/rules/frontend.md
git commit -m "Document the growth system"
```

- [ ] **Step 6: Hand-off notes for the owner (not code)**

Report:

- the tested HEAD, the gate output, and the browser checks done;
- that production must run `npm run db:setup` before the deploy that ships this (the `stats` column), and
  that this is a save-format break under `RELEASING.md` (the owner picks how that reads on 0.x);
- that the v2 design doc (Claude Doc `47af7c97…`) still says "Levels. Keep 1 to 50 and the linear stat
  multiplier" under Progression and lists the luck surface without growth rolls; both lines are for the
  owner to update in the doc (this slice does not edit it);
- whether `src/game/world.ts` existed and, if so, which of the Global Constraints' compatibility edits were made.
