# Slice 1 — Trainer Onboarding + Idle Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new player logs in, picks Trainer and a professor, gets a weak three-stage starter, plays a tutorial battle and first catch, sends the trainer out on Route 1 for up to 8 hours of idle auto-battles, claims the log, and watches the party level up and evolve. Rental and everything attached to it is deleted.

**Architecture:** Additive first, delete last, so every commit builds. New pure game modules (`identity`, `professions`, `evolution`, `routes`, `idle`) are shared by client and server. Two Vercel functions carry the new API: `api/me/[action]` gains `profile`/`onboard`/`nickname`; a new `api/idle/[action]` replaces `api/catch/[action]` with `start`/`current`/`claim`/`tutorial-catch`. The `idle_sessions` row is the authorisation; the server simulates on claim and is the only writer of growth. Then `App.tsx` is rebuilt around the new phases and the Rental files are removed.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind 4, Vercel serverless (`@vercel/node`), Turso/libSQL (`@libsql/client`), Upstash Redis (rate limits), tsx assert-style tests run by `npm test`.

**Spec:** `docs/superpowers/specs/2026-09-30-slice-1-trainer-onboarding-idle-design.md`

## Global Constraints

- Work on branch `development`. Commit messages have no Co-Authored-By trailer (project rule).
- Every commit must pass `npm run lint`, `npm test`, and `npm run build` (which runs `tsc -b`, `tsc -p tsconfig.api.json`, and `vite build`).
- Game modules under `src/game/` are DOM-free and import each other with `.js` extensions (`import { x } from './rng.js'`). API files import them as `../../src/game/x.js`. Components import without extension (`'../game/box'`).
- Tests are `scripts/<name>.test.ts`, tsx assert style: a `check(label, ok)` helper counting pass/fail, `console.log('[n] …')` sections, and a final `process.exit(failed ? 1 : 0)`. Every new test is added to the `test` script in `package.json`.
- Determinism is a hard invariant: same inputs and seed produce the same output on client and server.
- `IDLE_CAP_MS = 8 * 60 * 60 * 1000`. Route 1: band 1–12, foeLevel 4, pace 3 minutes, max 100 encounters, 6 EXP per win. Starter level 5. Starter evolutions at levels 8 and 16; other species at 16 and 32.
- Nicknames: 1–12 characters after trim.
- Vercel Hobby function cap is 12; after this slice the count is 3 (`auth`, `me`, `idle`).
- Schema changes are additive (`create table if not exists`, wrapped `alter table`). No table is dropped.

## Review Focus

Inputs the spec implies but no task's tests would otherwise exercise. Each has a test pinned to the owning task below.

1. **A claim exactly at the cap plus a late claim.** Elapsed is clamped to 8 hours; a 20-hour absence yields the same encounters as 8 hours. (Task 4 test on `encountersFor`.)
2. **A party mon that levelled out of the route band between start and claim.** Claim must still resolve the session (the party was legal at start) rather than 400. (Task 8: claim re-checks ownership only, not band; test in the curl smoke.)
3. **Evolution crossing two thresholds in one claim.** A level 7 starter gaining enough EXP to reach 17 must evolve twice and end on stage 3. (Task 3 test.)
4. **A branched line at evolution time (Wurmple).** Branch pick must be deterministic for the same mon id and must land on a real dex id. (Task 3 test.)
5. **Nickname edge input.** Empty, whitespace-only, and 13-character names are rejected; a 12-character name after trim is accepted. (Task 7 test on `cleanNickname`.)

---

### Task 1: Shared identity roll and odds module

**Files:**
- Create: `src/game/odds.ts`
- Create: `src/game/identity.ts`
- Modify: `src/game/catch.ts` (use `rollIdentity`; import odds from `odds.ts`)
- Test: `scripts/identity.test.ts`

**Interfaces:**
- Produces: `SHINY_CHANCE`, `ALT_COLOR_CHANCE` (from `odds.ts`); `rollIdentity(species: Creature, rng: RNG): RolledIdentity` where `RolledIdentity = { sign: Sign; ability?: AbilityId; build?: Build; shiny: boolean; altColor: boolean; emotion?: string }`.
- Consumed by Tasks 2 and 5.

- [ ] **Step 1: Write the failing test**

`scripts/identity.test.ts`:

```ts
/**
 * Identity roll — the one roll shared by starters, tutorial gifts, wild
 * encounters and catches. Must be deterministic per seed and legal per species.
 *
 *   npx --yes tsx scripts/identity.test.ts
 */
import { rollIdentity } from '../src/game/identity.js';
import { SHINY_CHANCE, ALT_COLOR_CHANCE } from '../src/game/odds.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { RNG } from '../src/game/rng.js';
import { isAbilityOption } from '../src/game/abilities.js';
import { ALL_SIGNS } from '../src/game/zodiac.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] odds are sane');
check('shiny is rarer than alt colour', SHINY_CHANCE < ALT_COLOR_CHANCE);
check('both are probabilities', SHINY_CHANCE > 0 && ALT_COLOR_CHANCE < 1);

console.log('\n[2] roll is deterministic and legal');
const caterpie = CREATURES_BY_ID['10'];
const a = rollIdentity(caterpie, new RNG('id-test'));
const b = rollIdentity(caterpie, new RNG('id-test'));
check('same seed → same sign', a.sign === b.sign);
check('same seed → same ability', a.ability === b.ability);
check('same seed → same shiny/alt', a.shiny === b.shiny && a.altColor === b.altColor);
check('sign is a real sign', ALL_SIGNS.includes(a.sign));
check('ability is legal for the species', !a.ability || isAbilityOption(10, a.ability));
check('shiny and alt colour are exclusive', !(a.shiny && a.altColor));

console.log('\n[3] different seeds vary');
let differ = false;
for (let i = 0; i < 20 && !differ; i++) {
  const r = rollIdentity(caterpie, new RNG(`vary-${i}`));
  if (r.sign !== a.sign) differ = true;
}
check('sign varies across seeds', differ);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/identity.test.ts`
Expected: FAIL with "Cannot find module '../src/game/identity.js'"

- [ ] **Step 3: Create `src/game/odds.ts`**

```ts
// Rarity odds shared by every roll that can produce a special colouring.
// Moved out of run.ts (Rental) so the engine and idle game share one source.

/** Chance a rolled mon is shiny. */
export const SHINY_CHANCE = 1 / 500;

/** Chance a non-shiny rolled mon wears a fan-made alternate colour. */
export const ALT_COLOR_CHANCE = 1 / 20;
```

Copy the exact values from `src/game/run.ts` lines 25 and 32 if they differ from the above.

- [ ] **Step 4: Create `src/game/identity.ts`**

```ts
import type { AbilityId, Build, Creature, Sign } from './types.js';
import type { RNG } from './rng.js';
import {
  portraitEmotions,
  shinyPortraitEmotions,
  altColorPortraitEmotions,
  canBeShiny,
  canBeAltColor,
} from './pokemon.js';
import { rollAbility } from './abilities.js';
import { rollSign } from './zodiac.js';
import { canRollBuild } from './moves.js';
import { SHINY_CHANCE, ALT_COLOR_CHANCE } from './odds.js';

// The rolled identity of an individual Pokémon: its sign, ability, build,
// colouring and portrait face. Starters, tutorial gifts, wild encounters and
// catches all use this one roll so "every Pokémon is a unique individual"
// means the same thing everywhere. Pure: the caller owns the RNG.

export interface RolledIdentity {
  sign: Sign;
  ability?: AbilityId;
  build?: Build;
  shiny: boolean;
  altColor: boolean;
  emotion?: string;
}

function pickEmotion(dexId: number, shiny: boolean, altColor: boolean, rng: RNG): string | undefined {
  const emotions = shiny
    ? shinyPortraitEmotions(dexId)
    : altColor
      ? altColorPortraitEmotions(dexId)
      : portraitEmotions(dexId);
  return emotions.length > 0 ? rng.pick(emotions) : undefined;
}

export function rollIdentity(species: Creature, rng: RNG): RolledIdentity {
  const sign = rollSign(species.stats, rng);
  const ability = rollAbility(species.dexId, rng);
  const build = canRollBuild(species.stats)
    ? (rng.next() < 0.5 ? 'physical' : 'energy')
    : undefined;
  const shiny = rng.chance(SHINY_CHANCE) && canBeShiny(species.dexId);
  const altColor = !shiny && rng.chance(ALT_COLOR_CHANCE) && canBeAltColor(species.dexId);
  const emotion = pickEmotion(species.dexId, shiny, altColor, rng);
  return {
    sign,
    ...(ability ? { ability } : {}),
    ...(build ? { build } : {}),
    shiny,
    altColor,
    ...(emotion ? { emotion } : {}),
  };
}
```

- [ ] **Step 5: Make `catch.ts` use it**

In `src/game/catch.ts`: replace the import `import { SHINY_CHANCE, ALT_COLOR_CHANCE } from './run.js';` with `import { rollIdentity } from './identity.js';`, delete the local `pickEmotion` function and the now-unused imports (`rollAbility`, `rollSign`, `canRollBuild`, the five portrait/colour helpers from `pokemon.js`), and rewrite the body of `rollCatchReward` after `const species = rng.pick(pool);` to:

```ts
  return {
    dexId: species.dexId,
    level: clampLevel(zone.rewardLevel),
    ...rollIdentity(species, rng),
  };
```

- [ ] **Step 6: Run the tests**

Run: `npx --yes tsx scripts/identity.test.ts && npx --yes tsx scripts/catch.test.ts && npx tsc -b`
Expected: both test files print `N passed, 0 failed`; tsc prints nothing.

- [ ] **Step 7: Register the test and commit**

In `package.json`, append ` && tsx scripts/identity.test.ts` to the `test` script.

```bash
git add src/game/odds.ts src/game/identity.ts src/game/catch.ts scripts/identity.test.ts package.json
git commit -m "Extract the shared identity roll and rarity odds"
```

---

### Task 2: Professions and professors

**Files:**
- Create: `src/game/professions.ts`
- Test: `scripts/professions.test.ts`

**Interfaces:**
- Consumes: `rollIdentity` (Task 1), `MintSpec` from `box.ts`, `EVOLUTIONS` from `evolutions.gen.ts`.
- Produces: `ProfessionId`, `PROFESSIONS`, `isProfessionId`, `ProfessorId`, `Professor`, `PROFESSORS`, `professorById`, `isProfessorId`, `STARTER_LEVEL`, `starterLine(p): number[]`, `rollStarter(seed, p): MintSpec`, `professorArtUrl(p): string`.

- [ ] **Step 1: Write the failing test**

`scripts/professions.test.ts`:

```ts
/**
 * Professions + professors — the trainer route's fixed, weak, three-stage
 * starters. Each line must really be three stages in the dex, and the starter
 * roll must be deterministic per seed.
 *
 *   npx --yes tsx scripts/professions.test.ts
 */
import {
  PROFESSIONS,
  PROFESSORS,
  STARTER_LEVEL,
  isProfessionId,
  professorById,
  starterLine,
  rollStarter,
} from '../src/game/professions.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] professions');
check('four professions', PROFESSIONS.length === 4);
check('only trainer is unlocked', PROFESSIONS.filter((p) => !p.locked).map((p) => p.id).join() === 'trainer');
check('isProfessionId accepts trainer', isProfessionId('trainer'));
check('isProfessionId rejects junk', !isProfessionId('wizard'));

console.log('\n[2] professors and starter lines');
check('four professors', PROFESSORS.length === 4);
for (const p of PROFESSORS) {
  const line = starterLine(p);
  check(`${p.name}: line has three stages`, line.length === 3);
  check(`${p.name}: every stage is a real species`, line.every((id) => Boolean(CREATURES_BY_ID[String(id)])));
  check(`${p.name}: line starts at the starter`, line[0] === p.starterDexId);
}
check('oak gives Caterpie', professorById('oak')?.starterDexId === 10);
check('birch gives Wurmple', professorById('birch')?.starterDexId === 265);
check('unknown professor is null', professorById('nope') === null);

console.log('\n[3] starter roll');
const oak = professorById('oak')!;
const s1 = rollStarter('starter:user-1', oak);
const s2 = rollStarter('starter:user-1', oak);
check('starter is the professor’s species', s1.dexId === 10);
check(`starter is level ${STARTER_LEVEL}`, s1.level === STARTER_LEVEL);
check('same seed → same sign', s1.sign === s2.sign);
check('same seed → same ability', s1.ability === s2.ability);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/professions.test.ts`
Expected: FAIL with "Cannot find module '../src/game/professions.js'"

- [ ] **Step 3: Create `src/game/professions.ts`**

```ts
import type { MintSpec } from './box.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { RNG } from './rng.js';
import { rollIdentity } from './identity.js';

// The role-play frame. A profession is the lens the game is played through;
// only the trainer route ships in slice 1, the rest are locked teasers so the
// data model reserves room for them. A professor hands the trainer a fixed,
// weak, three-stage starter — the choice is about story, not stats.

const ASSET = import.meta.env?.BASE_URL ?? '/';

export type ProfessionId = 'trainer' | 'breeder' | 'ranger' | 'researcher';

export interface Profession {
  id: ProfessionId;
  name: string;
  blurb: string;
  locked: boolean;
}

export const PROFESSIONS: readonly Profession[] = [
  { id: 'trainer', name: 'Trainer', blurb: 'Battle wild Pokémon on the road and catch the ones you beat.', locked: false },
  { id: 'breeder', name: 'Breeder', blurb: 'Raise eggs and affection; hatch instead of catch.', locked: true },
  { id: 'ranger', name: 'Ranger', blurb: 'Patrol routes and befriend the rare and the shy.', locked: true },
  { id: 'researcher', name: 'Researcher', blurb: 'Survey zones for dex entries and rare colours.', locked: true },
];

export function isProfessionId(v: unknown): v is ProfessionId {
  return typeof v === 'string' && PROFESSIONS.some((p) => p.id === v);
}

export type ProfessorId = 'oak' | 'elm' | 'birch' | 'rowan';

export interface Professor {
  id: ProfessorId;
  name: string;
  blurb: string;
  /** One line on what this mentor's route feels like. Flavour only in slice 1. */
  bias: string;
  starterDexId: number;
  /** Key under public/sprites/trainers, or null for the generic fallback. */
  spriteKey: string | null;
}

export const PROFESSORS: readonly Professor[] = [
  {
    id: 'oak',
    name: 'Professor Oak',
    blurb: 'The Kanto classic. Hands you a Caterpie and a pat on the back.',
    bias: 'Classic routes; balanced encounters',
    starterDexId: 10,
    spriteKey: 'special-oak',
  },
  {
    id: 'elm',
    name: 'Professor Elm',
    blurb: 'Nervous, brilliant, and convinced Hoppip is underrated.',
    bias: 'Grass and Flying lean; gentler affection curve later',
    starterDexId: 187,
    spriteKey: 'special-elm',
  },
  {
    id: 'birch',
    name: 'Professor Birch',
    blurb: 'Field researcher. Your Wurmple’s final form is a roll of the dice.',
    bias: 'Branching evolution; the branch is luck',
    starterDexId: 265,
    spriteKey: null,
  },
  {
    id: 'rowan',
    name: 'Professor Rowan',
    blurb: 'Stern, precise. Starly grows into the strongest of the four.',
    bias: 'Faster early battles; strongest final form',
    starterDexId: 396,
    spriteKey: null,
  },
];

export const STARTER_LEVEL = 5;

export function isProfessorId(v: unknown): v is ProfessorId {
  return typeof v === 'string' && PROFESSORS.some((p) => p.id === v);
}

export function professorById(id: unknown): Professor | null {
  return PROFESSORS.find((p) => p.id === id) ?? null;
}

/** The three dex ids of a professor's starter line, first branch on a fork. */
export function starterLine(p: Professor): number[] {
  const line = [p.starterDexId];
  let cur = p.starterDexId;
  for (let i = 0; i < 2; i++) {
    const next = (EVOLUTIONS[cur] ?? []).find((id) => Boolean(CREATURES_BY_ID[String(id)]));
    if (next === undefined) break;
    line.push(next);
    cur = next;
  }
  return line;
}

/** Front-facing art for the professor card (generic professor when no sprite). */
export function professorArtUrl(p: Professor): string {
  return `${ASSET}sprites/trainers/${p.spriteKey ?? 'special-oak'}.png`;
}

/**
 * The starter a professor hands over. Deterministic for a seed (use
 * `starter:${uid}` so a retried onboarding mints the same individual).
 */
export function rollStarter(seed: string, p: Professor): MintSpec {
  const species = CREATURES_BY_ID[String(p.starterDexId)];
  const rng = new RNG(`starter:${seed}:${p.id}`);
  return { dexId: species.dexId, level: STARTER_LEVEL, ...rollIdentity(species, rng) };
}
```

- [ ] **Step 4: Run the test**

Run: `npx --yes tsx scripts/professions.test.ts && npx tsc -b`
Expected: all checks pass.

- [ ] **Step 5: Register and commit**

Append ` && tsx scripts/professions.test.ts` to the `test` script.

```bash
git add src/game/professions.ts scripts/professions.test.ts package.json
git commit -m "Add professions and professors with fixed three-stage starters"
```

---

### Task 3: Owned-mon extensions and level-based evolution

**Files:**
- Modify: `src/game/box.ts` (`CatchOrigin` gains `'starter'`; `OwnedMon` gains `nickname?: string`; `ownedMonToCreature` applies the nickname as `name`)
- Create: `src/game/evolution.ts`
- Test: `scripts/evolution.test.ts`

**Interfaces:**
- Consumes: `OwnedMon`, `applyExp` from `levels.ts`, `EVOLUTIONS`, `rollAbility`, `RNG`.
- Produces: `evolutionLevel(dexId, origin): number | null`, `evolveOwned(mon, rng): OwnedMon`, `applyGrowthWithEvolution(mon, gained, rng): GrowthResult` where `GrowthResult = { mon: OwnedMon; levelUp: { fromLevel; toLevel } | null; evolutions: { fromDexId; toDexId }[] }`, `stageOf(dexId): number`.

- [ ] **Step 1: Write the failing test**

`scripts/evolution.test.ts`:

```ts
/**
 * Level-based evolution for owned mons (affection gating arrives in slice 3).
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
  return {
    id: 'm1', dexId: 10, level: 5, exp: 0, sign: 'aries', shiny: false, altColor: false,
    origin: 'starter', caughtAt: 0, ...over,
  };
}

console.log('[1] stages and thresholds');
check('Caterpie is stage 0', stageOf(10) === 0);
check('Metapod is stage 1', stageOf(11) === 1);
check('Butterfree is stage 2', stageOf(12) === 2);
check('starter Caterpie evolves at 8', evolutionLevel(10, 'starter') === 8);
check('starter Metapod evolves at 16', evolutionLevel(11, 'starter') === 16);
check('caught Caterpie evolves at 16', evolutionLevel(10, 'catch') === 16);
check('caught Metapod evolves at 32', evolutionLevel(11, 'catch') === 32);
check('Butterfree never evolves', evolutionLevel(12, 'starter') === null);

console.log('\n[2] evolveOwned keeps identity');
const c = mon({ level: 8, ability: undefined });
const e = evolveOwned(c, new RNG('evo'));
check('became Metapod', e.dexId === 11);
check('kept sign', e.sign === c.sign);
check('kept level', e.level === 8);
check('ability is legal for Metapod', !e.ability || isAbilityOption(11, e.ability));

console.log('\n[3] branched line is deterministic and real');
const w = mon({ id: 'wurm', dexId: 265, level: 8 });
const b1 = evolveOwned(w, new RNG(`evolve:${w.id}`));
const b2 = evolveOwned(w, new RNG(`evolve:${w.id}`));
check('Wurmple branch lands on Silcoon or Cascoon', b1.dexId === 266 || b1.dexId === 268);
check('same seed → same branch', b1.dexId === b2.dexId);

console.log('\n[4] growth crossing two thresholds evolves twice');
// EXP from level 7 to 17 = sum of expToNext(7..16)
let need = 0;
for (let l = 7; l < 17; l++) need += expToNext(l);
const g = applyGrowthWithEvolution(mon({ level: 7 }), need, new RNG('grow'));
check('reached level 17', g.mon.level === 17);
check('evolved twice', g.evolutions.length === 2);
check('ended as Butterfree', g.mon.dexId === 12);
check('levelUp reports 7 → 17', g.levelUp?.fromLevel === 7 && g.levelUp?.toLevel === 17);

console.log('\n[5] no gain, no change');
const z = applyGrowthWithEvolution(mon({ level: 5 }), 0, new RNG('zero'));
check('no level up', z.levelUp === null && z.evolutions.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/evolution.test.ts`
Expected: FAIL with "Cannot find module '../src/game/evolution.js'"

- [ ] **Step 3: Extend `box.ts`**

In `src/game/box.ts`:

```ts
export type CatchOrigin = 'starter' | 'tutorial' | 'catch';
```

Add to `OwnedMon` after `emotion?: string;`:

```ts
  /** Player-given name (1–12 chars); the species name when absent. */
  nickname?: string;
```

In `ownedMonToCreature`, before the final `return scaleCreatureToLevel(...)`, add:

```ts
  if (mon.nickname) c = { ...c, name: mon.nickname };
```

- [ ] **Step 4: Create `src/game/evolution.ts`**

```ts
import type { OwnedMon, CatchOrigin } from './box.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { rollAbility } from './abilities.js';
import { applyExp } from './levels.js';
import type { RNG } from './rng.js';

// Owned mons evolve when they reach a level threshold. Slice 1 is level-only;
// slice 3 adds the affection gate on top. Thresholds are by STAGE, not by
// species, so every line grows on the same clock: a starter (origin
// 'starter') at 8 and 16, everything else at 16 and 32.

export const STARTER_EVOLUTION_LEVELS: readonly number[] = [8, 16];
export const DEFAULT_EVOLUTION_LEVELS: readonly number[] = [16, 32];

// child → parent, derived once from the forward table.
const PRE_EVOLUTION: Record<number, number> = {};
for (const [parent, children] of Object.entries(EVOLUTIONS)) {
  for (const child of children) PRE_EVOLUTION[child] = Number(parent);
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

/** Real, in-dex evolution targets for a species. */
function targets(dexId: number): number[] {
  return (EVOLUTIONS[dexId] ?? []).filter((id) => Boolean(CREATURES_BY_ID[String(id)]));
}

/** Level at which this species evolves, or null when it is a final form. */
export function evolutionLevel(dexId: number, origin: CatchOrigin): number | null {
  if (targets(dexId).length === 0) return null;
  const table = origin === 'starter' ? STARTER_EVOLUTION_LEVELS : DEFAULT_EVOLUTION_LEVELS;
  const stage = stageOf(dexId);
  return table[Math.min(stage, table.length - 1)] ?? null;
}

/**
 * Evolve an owned mon one stage. Branched lines pick with `rng` (seed it from
 * the mon id so the pick is stable). Keeps sign, build, colouring, emotion,
 * nickname, level and exp; re-rolls the ability for the new species so it
 * always carries a legal one. Pure.
 */
export function evolveOwned(mon: OwnedMon, rng: RNG): OwnedMon {
  const next = targets(mon.dexId);
  if (next.length === 0) return mon;
  const toDexId = next.length === 1 ? next[0] : rng.pick(next);
  const ability = rollAbility(toDexId, rng);
  const { ability: _old, ...rest } = mon;
  void _old;
  return { ...rest, dexId: toDexId, ...(ability ? { ability } : {}) };
}

export interface GrowthResult {
  mon: OwnedMon;
  levelUp: { fromLevel: number; toLevel: number } | null;
  evolutions: { fromDexId: number; toDexId: number }[];
}

/** Apply EXP, then evolve once per threshold crossed. Pure. */
export function applyGrowthWithEvolution(mon: OwnedMon, gained: number, rng: RNG): GrowthResult {
  const grown = applyExp(mon.level, mon.exp, gained);
  let cur: OwnedMon = { ...mon, level: grown.level, exp: grown.exp };
  const evolutions: GrowthResult['evolutions'] = [];
  for (let guard = 0; guard < 4; guard++) {
    const at = evolutionLevel(cur.dexId, cur.origin);
    if (at === null || cur.level < at) break;
    const evolved = evolveOwned(cur, rng);
    if (evolved.dexId === cur.dexId) break;
    evolutions.push({ fromDexId: cur.dexId, toDexId: evolved.dexId });
    cur = evolved;
  }
  const levelUp = grown.levelsGained > 0 ? { fromLevel: mon.level, toLevel: grown.level } : null;
  return { mon: cur, levelUp, evolutions };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx --yes tsx scripts/evolution.test.ts && npx tsc -b`
Expected: all checks pass. If `noUnusedLocals` complains about `_old`, replace the destructure with `const rest = { ...mon }; delete rest.ability;` and return `{ ...rest, dexId: toDexId, ...(ability ? { ability } : {}) }`.

- [ ] **Step 6: Register and commit**

Append ` && tsx scripts/evolution.test.ts` to the `test` script.

```bash
git add src/game/box.ts src/game/evolution.ts scripts/evolution.test.ts package.json
git commit -m "Add level-based evolution for owned mons; nickname and starter origin"
```

---

### Task 4: Routes

**Files:**
- Create: `src/game/routes.ts`
- Test: `scripts/routes.test.ts`

**Interfaces:**
- Produces: `RouteId`, `Route`, `ROUTES`, `routeById`, `isRouteId`, `isLevelInRoute`, `isPartyEligible(levels, route)`, `isRouteUnlocked(route, clearedMilestones: readonly string[])`, `IDLE_CAP_MS`, `encountersFor(elapsedMs, route)`.

- [ ] **Step 1: Write the failing test**

`scripts/routes.test.ts`:

```ts
/**
 * Routes — level bands, unlock rules and the elapsed-time → encounter count
 * that drives idle claims (capped at 8 hours and at the route's max).
 *
 *   npx --yes tsx scripts/routes.test.ts
 */
import {
  ROUTES,
  IDLE_CAP_MS,
  routeById,
  isPartyEligible,
  isRouteUnlocked,
  encountersFor,
} from '../src/game/routes.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const r1 = routeById('r1')!;
const r2 = routeById('r2')!;

console.log('[1] route table');
check('two routes defined', ROUTES.length === 2);
check('r1 is unlocked from the start', isRouteUnlocked(r1, []));
check('r2 is locked until its milestone', !isRouteUnlocked(r2, []));
check('r2 unlocks with milestone:r1', isRouteUnlocked(r2, ['r1']));
check('unknown route is null', routeById('r9') === null);

console.log('\n[2] band eligibility');
check('level 5 starter may enter r1', isPartyEligible([5], r1));
check('level 13 may not enter r1', !isPartyEligible([13], r1));
check('empty party rejected', !isPartyEligible([], r1));
check('seven mons rejected', !isPartyEligible([5, 5, 5, 5, 5, 5, 5], r1));

console.log('\n[3] encounters from elapsed time');
const min = 60_000;
check('zero elapsed → 0', encountersFor(0, r1) === 0);
check('2 minutes → 0 on a 3-minute pace', encountersFor(2 * min, r1) === 0);
check('3 minutes → 1', encountersFor(3 * min, r1) === 1);
check('30 minutes → 10', encountersFor(30 * min, r1) === 10);
const atCap = encountersFor(IDLE_CAP_MS, r1);
check('8 hours hits the route max', atCap === r1.maxEncounters);
check('20 hours is clamped to the same as 8', encountersFor(20 * 60 * min, r1) === atCap);
check('negative elapsed → 0', encountersFor(-5000, r1) === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/routes.test.ts`
Expected: FAIL with "Cannot find module '../src/game/routes.js'"

- [ ] **Step 3: Create `src/game/routes.ts`**

```ts
// Idle routes replace the old catch zones. The trainer walks a route and
// fights one wild Pokémon per `paceMs` of real time, up to the session cap.
// Levels are banded so a grown party can't farm the beginner road.

export type RouteId = 'r1' | 'r2';

export interface Route {
  id: RouteId;
  name: string;
  blurb: string;
  /** Inclusive level band a party mon must fall within to enter. */
  min: number;
  max: number;
  /** Wild level, jittered ±1 from the seed. */
  foeLevel: number;
  /** Real time per encounter. */
  paceMs: number;
  /** Hard cap on encounters per session. */
  maxEncounters: number;
  /** EXP to every party member per won battle. */
  expPerWin: number;
  /** Wild species pool: the weakest quarter of the dex, or the weakest half. */
  pool: 'weak' | 'early';
  /** 'start' or the milestone id that unlocks this route. */
  unlock: 'start' | `milestone:${string}`;
}

export const IDLE_CAP_MS = 8 * 60 * 60 * 1000;

export const ROUTES: readonly Route[] = [
  {
    id: 'r1',
    name: 'Route 1',
    blurb: 'Tall grass and a dirt path. Where every trainer starts.',
    min: 1,
    max: 12,
    foeLevel: 4,
    paceMs: 3 * 60 * 1000,
    maxEncounters: 100,
    expPerWin: 6,
    pool: 'weak',
    unlock: 'start',
  },
  {
    id: 'r2',
    name: 'Route 2',
    blurb: 'A forest trail. Locked until you clear Route 1’s milestone.',
    min: 8,
    max: 20,
    foeLevel: 12,
    paceMs: 4 * 60 * 1000,
    maxEncounters: 100,
    expPerWin: 10,
    pool: 'early',
    unlock: 'milestone:r1',
  },
];

const BY_ID: Record<string, Route> = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

export function routeById(id: unknown): Route | null {
  return typeof id === 'string' && id in BY_ID ? BY_ID[id] : null;
}

export function isRouteId(v: unknown): v is RouteId {
  return typeof v === 'string' && v in BY_ID;
}

export function isLevelInRoute(level: number, route: Route): boolean {
  return level >= route.min && level <= route.max;
}

/** Non-empty, at most 6, every member in band. */
export function isPartyEligible(levels: readonly number[], route: Route): boolean {
  if (levels.length < 1 || levels.length > 6) return false;
  return levels.every((l) => isLevelInRoute(l, route));
}

/** `clearedMilestones` holds milestone ids (e.g. 'r1'). Slice 3 writes them. */
export function isRouteUnlocked(route: Route, clearedMilestones: readonly string[]): boolean {
  if (route.unlock === 'start') return true;
  return clearedMilestones.includes(route.unlock.slice('milestone:'.length));
}

/** Encounters a session earns for `elapsedMs`, clamped to the cap and the route max. */
export function encountersFor(elapsedMs: number, route: Route): number {
  const elapsed = Math.max(0, Math.min(elapsedMs, IDLE_CAP_MS));
  return Math.min(Math.floor(elapsed / route.paceMs), route.maxEncounters);
}
```

- [ ] **Step 4: Run the test**

Run: `npx --yes tsx scripts/routes.test.ts && npx tsc -b`
Expected: all checks pass.

- [ ] **Step 5: Register and commit**

Append ` && tsx scripts/routes.test.ts` to the `test` script.

```bash
git add src/game/routes.ts scripts/routes.test.ts package.json
git commit -m "Add idle routes with bands, pace and the 8-hour cap"
```

---

### Task 5: Idle simulation

**Files:**
- Create: `src/game/idle.ts`
- Test: `scripts/idle.test.ts`

**Interfaces:**
- Consumes: `Route` (Task 4), `rollIdentity` (Task 1), `simulateBattle`, `scaleCreatureToLevel`, `withSign`/`withAbility`/`withBuild`/`asShiny`/`asAltColor` from `pokemon.ts`.
- Produces: `EncounterRecord = { slot: number; dexId: number; level: number; won: boolean; turns: number }`, `IdleOutcome = { encounters: EncounterRecord[]; wins: number; stoppedBy: 'loss' | 'count' }`, `buildEncounter(seed, route, slot, dex?): Creature`, `simulateIdle(party, seed, route, count, dex?): IdleOutcome`, `wildPool(route, dex?)`.

- [ ] **Step 1: Write the failing test**

`scripts/idle.test.ts`:

```ts
/**
 * Idle simulation — deterministic per seed, stops on the first loss, and a
 * level-5 starter wins most Route 1 fights (the tutorial promise).
 *
 *   npx --yes tsx scripts/idle.test.ts
 */
import { buildEncounter, simulateIdle, wildPool } from '../src/game/idle.js';
import { routeById } from '../src/game/routes.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { scaleCreatureToLevel } from '../src/game/levels.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const r1 = routeById('r1')!;
const starter = [scaleCreatureToLevel(CREATURES_BY_ID['10'], 5)]; // Caterpie Lv5

console.log('[1] wild pool and encounters');
const pool = wildPool(r1);
check('weak pool is non-empty and small', pool.length > 20 && pool.length < 400);
check('weak pool has no legendaries', pool.every((c) => c.tier === 'normal'));
const w1 = buildEncounter('seed-a', r1, 0);
const w2 = buildEncounter('seed-a', r1, 0);
check('same seed+slot → same species', w1.dexId === w2.dexId);
check('wild level within ±1 of foeLevel', Math.abs(w1.stats.hp - scaleCreatureToLevel(CREATURES_BY_ID[String(w1.dexId)], r1.foeLevel).stats.hp) <= 4);
check('different slot can differ', buildEncounter('seed-a', r1, 1).dexId !== w1.dexId || buildEncounter('seed-a', r1, 2).dexId !== w1.dexId);

console.log('\n[2] simulation is deterministic and stops on loss');
const a = simulateIdle(starter, 'seed-b', r1, 20);
const b = simulateIdle(starter, 'seed-b', r1, 20);
check('same log length', a.encounters.length === b.encounters.length);
check('same outcomes', a.encounters.every((e, i) => e.won === b.encounters[i].won && e.dexId === b.encounters[i].dexId));
check('wins counted', a.wins === a.encounters.filter((e) => e.won).length);
const lostAt = a.encounters.findIndex((e) => !e.won);
check('nothing after the first loss', lostAt === -1 || a.encounters.length === lostAt + 1);
check('stoppedBy matches', (lostAt === -1 && a.stoppedBy === 'count') || (lostAt >= 0 && a.stoppedBy === 'loss'));
check('zero count → empty log', simulateIdle(starter, 'x', r1, 0).encounters.length === 0);

console.log('\n[3] a level-5 starter wins most Route 1 fights');
let wins = 0;
let fights = 0;
for (let i = 0; i < 100; i++) {
  const o = simulateIdle(starter, `sanity-${i}`, r1, 1);
  fights++;
  if (o.encounters[0]?.won) wins++;
}
console.log(`   starter win rate: ${wins}/${fights}`);
check('win rate ≥ 60%', wins / fights >= 0.6);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/idle.test.ts`
Expected: FAIL with "Cannot find module '../src/game/idle.js'"

- [ ] **Step 3: Create `src/game/idle.ts`**

```ts
import type { Creature } from './types.js';
import type { Route } from './routes.js';
import { RNG } from './rng.js';
import {
  CREATURES,
  withSign,
  withAbility,
  withBuild,
  asShiny,
  asAltColor,
} from './pokemon.js';
import { rollIdentity } from './identity.js';
import { simulateBattle } from './battle.js';
import { scaleCreatureToLevel, clampLevel } from './levels.js';

// The idle loop's pure core: build the wild the trainer meets at each slot and
// run the party against it. Deterministic from (party, seed, route, count), so
// the server can simulate on claim and the client only renders the log.

export interface EncounterRecord {
  slot: number;
  dexId: number;
  level: number;
  won: boolean;
  turns: number;
}

export interface IdleOutcome {
  encounters: EncounterRecord[];
  wins: number;
  /** 'loss' = the party fell; 'count' = every requested encounter was fought. */
  stoppedBy: 'loss' | 'count';
}

function bst(c: Creature): number {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
}

/** The species that can appear on a route: the weakest quarter or half of the non-special dex. */
export function wildPool(route: Route, dex: Creature[] = CREATURES): Creature[] {
  const normals = dex.filter((c) => c.tier === 'normal').sort((a, b) => bst(a) - bst(b));
  const frac = route.pool === 'weak' ? 0.25 : 0.5;
  return normals.slice(0, Math.max(1, Math.floor(normals.length * frac)));
}

/** Apply a rolled identity to a base species for battle. */
export function creatureWithIdentity(
  base: Creature,
  id: ReturnType<typeof rollIdentity>,
): Creature {
  let c = withSign(base, id.sign);
  if (id.ability) c = withAbility(c, id.ability);
  if (id.build) c = withBuild(c, id.build);
  if (id.shiny) c = asShiny(c);
  else if (id.altColor) c = asAltColor(c);
  return c;
}

/** The wild met at `slot` on a route, level-scaled. Deterministic. */
export function buildEncounter(
  seed: string,
  route: Route,
  slot: number,
  dex: Creature[] = CREATURES,
): Creature {
  const rng = new RNG(`idle-wild:${seed}:${route.id}:${slot}`);
  const species = rng.pick(wildPool(route, dex));
  const level = clampLevel(route.foeLevel + rng.int(-1, 1));
  return scaleCreatureToLevel(creatureWithIdentity(species, rollIdentity(species, rng)), level);
}

/** Level the `buildEncounter` wild was scaled to (re-derived, same RNG order). */
export function encounterLevel(seed: string, route: Route, slot: number): number {
  const rng = new RNG(`idle-wild:${seed}:${route.id}:${slot}`);
  rng.next(); // species pick
  return clampLevel(route.foeLevel + rng.int(-1, 1));
}

/**
 * Fight `count` wilds in order with an already level-scaled party. Stops at the
 * first loss. HP resets each battle (engine invariant), so a chain of wins is
 * the party being stronger, not luckier.
 */
export function simulateIdle(
  party: Creature[],
  seed: string,
  route: Route,
  count: number,
  dex: Creature[] = CREATURES,
): IdleOutcome {
  const encounters: EncounterRecord[] = [];
  let wins = 0;
  for (let slot = 0; slot < count; slot++) {
    const wild = buildEncounter(seed, route, slot, dex);
    const result = simulateBattle(party, [wild], `${seed}#idle#${route.id}#${slot}`, {});
    const won = result.winner === 'player';
    encounters.push({ slot, dexId: wild.dexId, level: encounterLevel(seed, route, slot), won, turns: result.turns });
    if (!won) return { encounters, wins, stoppedBy: 'loss' };
    wins++;
  }
  return { encounters, wins, stoppedBy: 'count' };
}
```

- [ ] **Step 4: Run the test**

Run: `npx --yes tsx scripts/idle.test.ts && npx tsc -b`
Expected: all checks pass. If the win-rate check fails (below 60%), raise Route 1's `foeLevel` to 3 in `routes.ts` and re-run; record the rate in the commit message.

- [ ] **Step 5: Register and commit**

Append ` && tsx scripts/idle.test.ts` to the `test` script.

```bash
git add src/game/idle.ts scripts/idle.test.ts package.json src/game/routes.ts
git commit -m "Add the idle encounter simulation"
```

---

### Task 6: Schema and database helpers

**Files:**
- Modify: `db/schema.sql` (append new tables and the nickname column)
- Modify: `api/_db.ts` (nickname in `rowToOwned`; new helpers)
- Modify: `scripts/db-setup.ts` (tolerate the duplicate-column error on the `alter table`)
- Test: `scripts/db.test.ts` (in-memory libSQL)

**Interfaces:**
- Produces in `api/_db.ts`: `ProfileRow`, `readProfile(db, uid)`, `insertProfile(db, row)`, `updateOwnedNickname(db, uid, id, nickname)`, `updateOwnedEvolution(db, uid, mon: OwnedMon)` (writes dex_id, ability, level, exp), `IdleSessionRow`, `readOpenSession(db, uid)`, `readSessionById(db, uid, id)`, `insertSession(db, row)`, `closeSession(db, id, patch)`, `insertEncounters(db, sessionId, records)`, `applySchema(db)`.

- [ ] **Step 1: Write the failing test**

`scripts/db.test.ts`:

```ts
/**
 * Database helpers against an in-memory libSQL — schema applies cleanly and
 * the slice 1 helpers round-trip.
 *
 *   npx --yes tsx scripts/db.test.ts
 */
import { createClient } from '@libsql/client';
import {
  applySchema,
  insertOwned,
  readOwnedByIds,
  updateOwnedNickname,
  updateOwnedEvolution,
  readProfile,
  insertProfile,
  insertSession,
  readOpenSession,
  readSessionById,
  closeSession,
  insertEncounters,
} from '../api/_db.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const db = createClient({ url: ':memory:' });
await applySchema(db);
await applySchema(db); // idempotent

console.log('[1] owned + nickname + evolution');
const mon = await insertOwned(db, 'u1', { dexId: 10, level: 5, sign: 'aries', shiny: false, altColor: false }, 'starter', 1);
await updateOwnedNickname(db, 'u1', mon.id, 'Cat');
let [row] = await readOwnedByIds(db, 'u1', [mon.id]);
check('nickname stored', row.nickname === 'Cat');
check('origin starter', row.origin === 'starter');
await updateOwnedEvolution(db, 'u1', { ...row, dexId: 11, level: 8, exp: 3 });
[row] = await readOwnedByIds(db, 'u1', [mon.id]);
check('evolution written', row.dexId === 11 && row.level === 8 && row.exp === 3);
check('other user cannot read it', (await readOwnedByIds(db, 'u2', [mon.id])).length === 0);

console.log('\n[2] profile');
check('no profile yet', (await readProfile(db, 'u1')) === null);
await insertProfile(db, { userId: 'u1', profession: 'trainer', mentor: 'oak', starterId: mon.id, currentRoute: 'r1', createdAt: 2 });
const p = await readProfile(db, 'u1');
check('profile round-trips', p?.mentor === 'oak' && p?.starterId === mon.id);

console.log('\n[3] idle sessions');
check('no open session', (await readOpenSession(db, 'u1')) === null);
await insertSession(db, { id: 's1', userId: 'u1', routeId: 'r1', partyIds: [mon.id], seed: 'abc', startedAt: 10 });
const open = await readOpenSession(db, 'u1');
check('open session found', open?.id === 's1' && open.partyIds[0] === mon.id && open.claimedAt === null);
await insertEncounters(db, 's1', [{ slot: 0, dexId: 16, level: 4, won: true, turns: 9 }]);
await closeSession(db, 's1', { claimedAt: 20, stoppedBy: 'early', encounters: 1, log: '{"x":1}' });
check('closed session no longer open', (await readOpenSession(db, 'u1')) === null);
const closed = await readSessionById(db, 'u1', 's1');
check('closed fields stored', closed?.claimedAt === 20 && closed.stoppedBy === 'early' && closed.encounters === 1);
check('wrong user gets null', (await readSessionById(db, 'u2', 's1')) === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/db.test.ts`
Expected: FAIL: `applySchema` is not exported.

- [ ] **Step 3: Append to `db/schema.sql`**

```sql
-- The role-play identity: one row per onboarded user. Written once by
-- api/me/onboard. `mentor` is the professor id; `starter_id` the owned row.
create table if not exists profiles (
  user_id       text primary key,
  profession    text not null,
  mentor        text not null,
  starter_id    text not null,
  current_route text not null default 'r1',
  created_at    integer not null default 0
);

-- One row per idle send-out. `claimed_at` is null while the session is open;
-- one open session per user is enforced in api/idle/start. `log` is compact
-- JSON written on claim; `encounters` the count fought.
create table if not exists idle_sessions (
  id          text primary key,
  user_id     text not null,
  route_id    text not null,
  party_ids   text not null,
  seed        text not null,
  started_at  integer not null,
  claimed_at  integer,
  stopped_by  text,
  encounters  integer not null default 0,
  log         text
);
create index if not exists idle_user_open_idx on idle_sessions (user_id, claimed_at);

-- The wilds met in a session. Slice 2 lets the player throw balls at them
-- (`resolved` flips to 1); slice 1 only records them for the log.
create table if not exists encounters (
  session_id  text not null,
  slot        integer not null,
  dex_id      integer not null,
  level       integer not null,
  won         integer not null default 0,
  resolved    integer not null default 0,
  primary key (session_id, slot)
);
```

- [ ] **Step 4: Make the schema applier shared and tolerant**

In `api/_db.ts` add (near `getDb`):

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql');

/** Statements that add columns to existing tables; each is a no-op on re-run. */
const COLUMN_ADDS = ['alter table owned_pokemon add column nickname text'];

/** Apply db/schema.sql (idempotent) plus the additive column changes. */
export async function applySchema(db: Db): Promise<void> {
  await db.executeMultiple(readFileSync(SCHEMA_PATH, 'utf8'));
  for (const sql of COLUMN_ADDS) {
    try {
      await db.execute(sql);
    } catch (err) {
      if (!String(err).includes('duplicate column')) throw err;
    }
  }
}
```

In `scripts/db-setup.ts` replace the two lines `const schema = …` and `await client.executeMultiple(schema);` with:

```ts
import { applySchema } from '../api/_db.js';
await applySchema(client);
```

(Keep the `readFileSync` import only if still used; remove `join(root,'db','schema.sql')` usage.)

- [ ] **Step 5: Add the helpers to `api/_db.ts`**

Change the `import type { OwnedMon, MintSpec, CatchOrigin }` line to also work with the new origin (it is a string union; no code change). In `rowToOwned`, after the `emotion` spread add:

```ts
    ...(r.nickname ? { nickname: String(r.nickname) } : {}),
```

Append at the end of the file:

```ts
// --- Nickname / evolution ----------------------------------------------------

export async function updateOwnedNickname(db: Db, uid: string, id: string, nickname: string): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set nickname = ? where id = ? and user_id = ?',
    args: [nickname, id, uid],
  });
}

/** Persist an evolved/grown mon: species, ability, level, exp (the claim writer). */
export async function updateOwnedEvolution(db: Db, uid: string, mon: OwnedMon): Promise<void> {
  await db.execute({
    sql: 'update owned_pokemon set dex_id = ?, ability = ?, level = ?, exp = ? where id = ? and user_id = ?',
    args: [mon.dexId, mon.ability ?? null, mon.level, mon.exp, mon.id, uid],
  });
}

// --- Profiles ----------------------------------------------------------------

export interface ProfileRow {
  userId: string;
  profession: string;
  mentor: string;
  starterId: string;
  currentRoute: string;
  createdAt: number;
}

function rowToProfile(r: Record<string, unknown>): ProfileRow {
  return {
    userId: String(r.user_id),
    profession: String(r.profession),
    mentor: String(r.mentor),
    starterId: String(r.starter_id),
    currentRoute: String(r.current_route ?? 'r1'),
    createdAt: Number(r.created_at) || 0,
  };
}

export async function readProfile(db: Db, uid: string): Promise<ProfileRow | null> {
  const rs = await db.execute({ sql: 'select * from profiles where user_id = ?', args: [uid] });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToProfile(r) : null;
}

export async function insertProfile(db: Db, p: ProfileRow): Promise<void> {
  await db.execute({
    sql: 'insert into profiles (user_id, profession, mentor, starter_id, current_route, created_at) values (?, ?, ?, ?, ?, ?)',
    args: [p.userId, p.profession, p.mentor, p.starterId, p.currentRoute, p.createdAt],
  });
}

// --- Idle sessions -----------------------------------------------------------

export interface IdleSessionRow {
  id: string;
  userId: string;
  routeId: string;
  partyIds: string[];
  seed: string;
  startedAt: number;
  claimedAt: number | null;
  stoppedBy: string | null;
  encounters: number;
  log: string | null;
}

function rowToSession(r: Record<string, unknown>): IdleSessionRow {
  let partyIds: string[] = [];
  try {
    const parsed = JSON.parse(String(r.party_ids ?? '[]'));
    if (Array.isArray(parsed)) partyIds = parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    partyIds = [];
  }
  return {
    id: String(r.id),
    userId: String(r.user_id),
    routeId: String(r.route_id),
    partyIds,
    seed: String(r.seed),
    startedAt: Number(r.started_at) || 0,
    claimedAt: r.claimed_at === null || r.claimed_at === undefined ? null : Number(r.claimed_at),
    stoppedBy: r.stopped_by === null || r.stopped_by === undefined ? null : String(r.stopped_by),
    encounters: Number(r.encounters) || 0,
    log: r.log === null || r.log === undefined ? null : String(r.log),
  };
}

export async function readOpenSession(db: Db, uid: string): Promise<IdleSessionRow | null> {
  const rs = await db.execute({
    sql: 'select * from idle_sessions where user_id = ? and claimed_at is null order by started_at desc limit 1',
    args: [uid],
  });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToSession(r) : null;
}

export async function readSessionById(db: Db, uid: string, id: string): Promise<IdleSessionRow | null> {
  const rs = await db.execute({
    sql: 'select * from idle_sessions where id = ? and user_id = ?',
    args: [id, uid],
  });
  const r = rs.rows[0] as unknown as Record<string, unknown> | undefined;
  return r ? rowToSession(r) : null;
}

export async function insertSession(
  db: Db,
  s: { id: string; userId: string; routeId: string; partyIds: string[]; seed: string; startedAt: number },
): Promise<void> {
  await db.execute({
    sql: 'insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at) values (?, ?, ?, ?, ?, ?)',
    args: [s.id, s.userId, s.routeId, JSON.stringify(s.partyIds), s.seed, s.startedAt],
  });
}

export async function closeSession(
  db: Db,
  id: string,
  patch: { claimedAt: number; stoppedBy: string; encounters: number; log: string },
): Promise<void> {
  await db.execute({
    sql: 'update idle_sessions set claimed_at = ?, stopped_by = ?, encounters = ?, log = ? where id = ? and claimed_at is null',
    args: [patch.claimedAt, patch.stoppedBy, patch.encounters, patch.log, id],
  });
}

export async function insertEncounters(
  db: Db,
  sessionId: string,
  records: readonly { slot: number; dexId: number; level: number; won: boolean; turns: number }[],
): Promise<void> {
  if (records.length === 0) return;
  await db.batch(
    records.map((e) => ({
      sql: 'insert or ignore into encounters (session_id, slot, dex_id, level, won) values (?, ?, ?, ?, ?)',
      args: [sessionId, e.slot, e.dexId, e.level, e.won ? 1 : 0],
    })),
    'write',
  );
}
```

- [ ] **Step 6: Run the test and the API typecheck**

Run: `npx --yes tsx scripts/db.test.ts && npx tsc -p tsconfig.api.json`
Expected: all checks pass; tsc prints nothing. If `import.meta.url` is rejected under the api tsconfig, keep `SCHEMA_PATH` as `join(process.cwd(), 'db', 'schema.sql')` instead.

- [ ] **Step 7: Register and commit**

Append ` && tsx scripts/db.test.ts` to the `test` script.

```bash
git add db/schema.sql api/_db.ts scripts/db-setup.ts scripts/db.test.ts package.json
git commit -m "Add profiles, idle_sessions and encounters tables with helpers"
```

---

### Task 7: Profile API (`api/me`) and client wrappers

**Files:**
- Modify: `api/me/[action].ts` (add `profile`, `onboard`, `nickname` actions)
- Create: `src/game/profile.ts` (client wrappers + `cleanNickname`)
- Test: `scripts/profile.test.ts` (pure `cleanNickname`)

**Interfaces:**
- Consumes: Task 2 (`isProfessorId`, `professorById`, `rollStarter`), Task 6 helpers.
- Produces: `Profile = { profession: ProfessionId; mentor: ProfessorId; starterId: string; currentRoute: RouteId; createdAt: number }`, `fetchProfile(): Promise<Profile | null>`, `onboard(mentor): Promise<{ ok; profile?; starter?; box?; error? }>`, `setNickname(id, nickname): Promise<{ ok; error? }>`, `cleanNickname(raw): string | null`.

- [ ] **Step 1: Write the failing test**

`scripts/profile.test.ts`:

```ts
/**
 * Nickname cleaning — the one validation both client and server run.
 *
 *   npx --yes tsx scripts/profile.test.ts
 */
import { cleanNickname } from '../src/game/profile.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] cleanNickname');
check('trims', cleanNickname('  Cat ') === 'Cat');
check('empty rejected', cleanNickname('') === null);
check('whitespace rejected', cleanNickname('   ') === null);
check('12 chars accepted', cleanNickname('abcdefghijkl') === 'abcdefghijkl');
check('13 chars rejected', cleanNickname('abcdefghijklm') === null);
check('non-string rejected', cleanNickname(42) === null);
check('control chars rejected', cleanNickname('a\u0000b') === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/profile.test.ts`
Expected: FAIL with "Cannot find module '../src/game/profile.js'"

- [ ] **Step 3: Create `src/game/profile.ts`**

```ts
import type { OwnedMon } from './box.js';
import type { ProfessionId, ProfessorId } from './professions.js';
import type { RouteId } from './routes.js';

// The player's role-play identity, and the same-origin wrappers for it.

export interface Profile {
  profession: ProfessionId;
  mentor: ProfessorId;
  starterId: string;
  currentRoute: RouteId;
  createdAt: number;
}

export const NICKNAME_MAX = 12;

/** Trimmed 1–12 printable characters, else null. Shared by client and server. */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 1 || s.length > NICKNAME_MAX) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

export async function fetchProfile(): Promise<Profile | null> {
  try {
    const res = await fetch('/api/me/profile', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; profile?: Profile | null };
    return data.ok ? (data.profile ?? null) : null;
  } catch {
    return null;
  }
}

export interface OnboardResult {
  ok: boolean;
  profile?: Profile;
  starter?: OwnedMon;
  box?: OwnedMon[];
  error?: string;
}

export async function onboard(mentor: ProfessorId): Promise<OnboardResult> {
  try {
    const res = await fetch('/api/me/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ profession: 'trainer', mentor }),
    });
    const data = (await res.json().catch(() => ({}))) as OnboardResult;
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'could not start your journey' };
    return data;
  } catch {
    return { ok: false, error: 'network error — please try again' };
  }
}

export async function setNickname(id: string, nickname: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/me/nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id, nickname }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: Boolean(res.ok && data.ok), error: data.error };
  } catch {
    return { ok: false, error: 'network error — please try again' };
  }
}
```

- [ ] **Step 4: Add the three actions to `api/me/[action].ts`**

Add imports at the top:

```ts
import { readProfile, insertProfile, readOwnedByIds, updateOwnedNickname, insertOwned, countOwned } from '../_db.js';
import { isProfessorId, professorById, rollStarter } from '../../src/game/professions.js';
import { cleanNickname } from '../../src/game/profile.js';
```

(Merge with the existing `../_db.js` import list.) Add cases to the switch:

```ts
    case 'profile':
      return profile(req, res);
    case 'onboard':
      return onboard(req, res);
    case 'nickname':
      return nickname(req, res);
```

Append the handlers:

```ts
// --- profile / onboard / nickname -------------------------------------------

function toProfile(p: { profession: string; mentor: string; starterId: string; currentRoute: string; createdAt: number }) {
  return { profession: p.profession, mentor: p.mentor, starterId: p.starterId, currentRoute: p.currentRoute, createdAt: p.createdAt };
}

async function profile(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'sign in first' });
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: 'accounts unavailable' });
  try {
    const p = await readProfile(db, uid);
    return res.status(200).json({ ok: true, profile: p ? toProfile(p) : null });
  } catch (err) {
    console.error('[me/profile] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not load profile' });
  }
}

async function onboard(req: VercelRequest, res: VercelResponse) {
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
  if (body.profession !== 'trainer') {
    return res.status(400).json({ ok: false, error: 'only the Trainer route is open for now' });
  }
  if (!isProfessorId(body.mentor)) return res.status(400).json({ ok: false, error: 'unknown professor' });
  const professor = professorById(body.mentor)!;

  try {
    if (await readProfile(db, uid)) {
      return res.status(400).json({ ok: false, error: 'you already have a profile' });
    }
    if ((await countOwned(db, uid)) > 0) {
      return res.status(400).json({ ok: false, error: 'this account already owns Pokémon' });
    }
    const now = Date.now();
    const starter = await insertOwned(db, uid, rollStarter(`starter:${uid}`, professor), 'starter', now);
    const row = { userId: uid, profession: 'trainer', mentor: professor.id, starterId: starter.id, currentRoute: 'r1', createdAt: now };
    await insertProfile(db, row);
    const box = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, profile: toProfile(row), starter, box });
  } catch (err) {
    console.error('[me/onboard] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not start your journey' });
  }
}

async function nickname(req: VercelRequest, res: VercelResponse) {
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
  const name = cleanNickname(body.nickname);
  if (!id || !name) return res.status(400).json({ ok: false, error: 'nickname must be 1–12 characters' });
  try {
    const [mon] = await readOwnedByIds(db, uid, [id]);
    if (!mon) return res.status(404).json({ ok: false, error: 'not your Pokémon' });
    await updateOwnedNickname(db, uid, id, name);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[me/nickname] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not save nickname' });
  }
}
```

- [ ] **Step 5: Run the test and typecheck**

Run: `npx --yes tsx scripts/profile.test.ts && npx tsc -p tsconfig.api.json && npx tsc -b`
Expected: all pass, no type errors.

- [ ] **Step 6: Register and commit**

Append ` && tsx scripts/profile.test.ts` to the `test` script.

```bash
git add api/me/[action].ts src/game/profile.ts scripts/profile.test.ts package.json
git commit -m "Add profile, onboard and nickname endpoints with client wrappers"
```

---

### Task 8: Idle API (`api/idle`) and client wrappers

**Files:**
- Create: `api/idle/[action].ts`
- Create: `src/game/idle-client.ts`
- Modify: `scripts/dev-api.ts` (route `idle` like `catch`)

**Interfaces:**
- Consumes: Tasks 3–7.
- Produces: `IdleSession = { id; routeId: RouteId; partyIds: string[]; startedAt: number }`, `ClaimResult = { ok; log?: IdleLog; levelUps?; evolutions?; box?; error? }` where `IdleLog = { routeId; encounters: EncounterRecord[]; wins; stoppedBy: 'loss' | 'cap' | 'early'; elapsedMs; expPerWin }`, `LevelUpEntry = { id; fromLevel; toLevel }`, `EvolutionEntry = { id; fromDexId; toDexId }`; wrappers `fetchCurrentSession(): Promise<{ session: IdleSession | null; serverNow: number }>`, `startIdle(routeId, partyIds): Promise<{ ok; session?; error? }>`, `claimIdle(sessionId): Promise<ClaimResult>`, `tutorialCatch(): Promise<{ ok; caught?; box?; error? }>`.

- [ ] **Step 1: Create `src/game/idle-client.ts`**

```ts
import type { OwnedMon } from './box.js';
import type { RouteId } from './routes.js';
import type { EncounterRecord } from './idle.js';

export interface IdleSession {
  id: string;
  routeId: RouteId;
  partyIds: string[];
  startedAt: number;
}

export interface IdleLog {
  routeId: RouteId;
  encounters: EncounterRecord[];
  wins: number;
  stoppedBy: 'loss' | 'cap' | 'early';
  elapsedMs: number;
  expPerWin: number;
}

export interface LevelUpEntry { id: string; fromLevel: number; toLevel: number }
export interface EvolutionEntry { id: string; fromDexId: number; toDexId: number }

export interface ClaimResult {
  ok: boolean;
  log?: IdleLog;
  levelUps?: LevelUpEntry[];
  evolutions?: EvolutionEntry[];
  box?: OwnedMon[];
  error?: string;
}

async function post<T>(path: string, body: unknown): Promise<T & { ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    return { ...data, ok: Boolean(res.ok && data.ok), error: data.error };
  } catch {
    return { ok: false, error: 'network error — please try again' } as T & { ok: boolean; error?: string };
  }
}

export async function fetchCurrentSession(): Promise<{ session: IdleSession | null; serverNow: number }> {
  try {
    const res = await fetch('/api/idle/current', { credentials: 'include', cache: 'no-store' });
    const data = (await res.json()) as { ok?: boolean; session?: IdleSession | null; serverNow?: number };
    return { session: data.ok ? (data.session ?? null) : null, serverNow: data.serverNow ?? Date.now() };
  } catch {
    return { session: null, serverNow: Date.now() };
  }
}

export function startIdle(routeId: RouteId, partyIds: string[]) {
  return post<{ session?: IdleSession }>('/api/idle/start', { routeId, partyIds });
}

export function claimIdle(sessionId: string): Promise<ClaimResult> {
  return post<ClaimResult>('/api/idle/claim', { sessionId });
}

export function tutorialCatch() {
  return post<{ caught?: OwnedMon; box?: OwnedMon[] }>('/api/idle/tutorial-catch', {});
}
```

- [ ] **Step 2: Create `api/idle/[action].ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { getRedis } from '../_redis.js';
import { rateLimit } from '../_ratelimit.js';
import { readSession } from '../_session.js';
import {
  getDb,
  readProfile,
  readOwnedByIds,
  readOwnedByUser,
  countOwned,
  insertOwned,
  updateOwnedEvolution,
  readOpenSession,
  readSessionById,
  insertSession,
  closeSession,
  insertEncounters,
  type Db,
} from '../_db.js';
import { routeById, isPartyEligible, isRouteUnlocked, encountersFor, IDLE_CAP_MS } from '../../src/game/routes.js';
import { simulateIdle } from '../../src/game/idle.js';
import { ownedMonToCreature, type OwnedMon } from '../../src/game/box.js';
import { applyGrowthWithEvolution } from '../../src/game/evolution.js';
import { rollTutorialReward } from '../../src/game/catch.js';
import { zoneById } from '../../src/game/zones.js';
import { RNG } from '../../src/game/rng.js';
import type { Creature } from '../../src/game/types.js';

// The idle loop's server half, behind one dynamic function: start opens a
// session row (the seed is fixed here, so a later claim can't re-roll), current
// reports it, claim simulates the elapsed encounters and is the ONLY writer of
// growth and evolution, and tutorial-catch is the one-time guided gift.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  switch (action) {
    case 'start':
      return start(req, res);
    case 'current':
      return current(req, res);
    case 'claim':
      return claim(req, res);
    case 'tutorial-catch':
      return tutorialCatch(req, res);
    default:
      return res.status(404).json({ ok: false, error: 'not found' });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
}

function requirePost(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return false;
  }
  return true;
}

async function gate(req: VercelRequest, res: VercelResponse): Promise<{ uid: string; db: Db } | null> {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'sign in to play' });
    return null;
  }
  const db = getDb();
  if (!db) {
    res.status(200).json({ ok: false, error: 'idle play unavailable' });
    return null;
  }
  return { uid, db };
}

function publicSession(s: { id: string; routeId: string; partyIds: string[]; startedAt: number }) {
  return { id: s.id, routeId: s.routeId, partyIds: s.partyIds, startedAt: s.startedAt };
}

function newSeed(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

// --- start -------------------------------------------------------------------

async function start(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = await gate(req, res);
  if (!g) return;
  const { uid, db } = g;

  const redis = getRedis();
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:idle:m:${uid}`, 20, 60),
    rateLimit(redis, `rl:idle:d:${uid}`, 300, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) return res.status(429).json({ ok: false, error: 'too many requests, slow down' });

  const body = parseBody(req);
  const route = routeById(body.routeId);
  if (!route) return res.status(400).json({ ok: false, error: 'unknown route' });

  try {
    const profile = await readProfile(db, uid);
    if (!profile) return res.status(400).json({ ok: false, error: 'finish onboarding first' });
    if (!isRouteUnlocked(route, [])) return res.status(400).json({ ok: false, error: 'that route is locked' });
    if (await readOpenSession(db, uid)) {
      return res.status(409).json({ ok: false, error: 'your trainer is already out — claim first' });
    }
    const raw = Array.isArray(body.partyIds) ? body.partyIds : [];
    const partyIds = [...new Set(raw.filter((p): p is string => typeof p === 'string'))];
    if (partyIds.length < 1 || partyIds.length > 6) {
      return res.status(400).json({ ok: false, error: 'pick 1-6 of your Pokémon' });
    }
    const rows = await readOwnedByIds(db, uid, partyIds);
    if (rows.length !== partyIds.length) {
      return res.status(400).json({ ok: false, error: 'that party includes a Pokémon you don’t own' });
    }
    if (!isPartyEligible(rows.map((m) => m.level), route)) {
      return res.status(400).json({ ok: false, error: `every Pokémon must be level ${route.min}-${route.max} for ${route.name}` });
    }
    const session = { id: randomUUID(), userId: uid, routeId: route.id, partyIds, seed: newSeed(), startedAt: Date.now() };
    await insertSession(db, session);
    return res.status(200).json({ ok: true, session: publicSession(session), serverNow: session.startedAt });
  } catch (err) {
    console.error('[idle/start] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not send your trainer out' });
  }
}

// --- current -----------------------------------------------------------------

async function current(req: VercelRequest, res: VercelResponse) {
  const g = await gate(req, res);
  if (!g) return;
  try {
    const s = await readOpenSession(g.db, g.uid);
    return res.status(200).json({ ok: true, session: s ? publicSession(s) : null, serverNow: Date.now() });
  } catch (err) {
    console.error('[idle/current] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not load session' });
  }
}

// --- claim -------------------------------------------------------------------

async function claim(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = await gate(req, res);
  if (!g) return;
  const { uid, db } = g;

  const redis = getRedis();
  if (!(await rateLimit(redis, `rl:idleclaim:m:${uid}`, 20, 60))) {
    return res.status(429).json({ ok: false, error: 'slow down' });
  }

  const body = parseBody(req);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) return res.status(400).json({ ok: false, error: 'missing session' });

  try {
    const s = await readSessionById(db, uid, sessionId);
    if (!s) return res.status(404).json({ ok: false, error: 'no such session' });
    if (s.claimedAt !== null) return res.status(409).json({ ok: false, error: 'this session was already claimed' });
    const route = routeById(s.routeId);
    if (!route) return res.status(400).json({ ok: false, error: 'unknown route' });

    const now = Date.now();
    const elapsedMs = Math.max(0, Math.min(now - s.startedAt, IDLE_CAP_MS));
    const count = encountersFor(elapsedMs, route);

    // Rebuild the exact party the session pinned. Ownership is re-checked; the
    // level band is NOT (it was legal at start, and a mon may have grown since).
    const rows = await readOwnedByIds(db, uid, s.partyIds);
    const byId = new Map<string, OwnedMon>(rows.map((m) => [m.id, m]));
    const party: OwnedMon[] = s.partyIds.map((id) => byId.get(id)).filter((m): m is OwnedMon => Boolean(m));
    if (party.length !== s.partyIds.length) {
      return res.status(400).json({ ok: false, error: 'that party is no longer valid' });
    }
    const creatures: Creature[] = [];
    for (const m of party) {
      const c = ownedMonToCreature(m);
      if (!c) return res.status(400).json({ ok: false, error: 'could not rebuild your party' });
      creatures.push(c);
    }

    const outcome = simulateIdle(creatures, s.seed, route, count);
    const stoppedBy: 'loss' | 'cap' | 'early' =
      outcome.stoppedBy === 'loss' ? 'loss' : elapsedMs >= IDLE_CAP_MS ? 'cap' : 'early';

    const gained = outcome.wins * route.expPerWin;
    const levelUps: { id: string; fromLevel: number; toLevel: number }[] = [];
    const evolutions: { id: string; fromDexId: number; toDexId: number }[] = [];
    for (const m of party) {
      const grown = applyGrowthWithEvolution(m, gained, new RNG(`evolve:${m.id}:${s.seed}`));
      if (grown.levelUp) levelUps.push({ id: m.id, ...grown.levelUp });
      for (const e of grown.evolutions) evolutions.push({ id: m.id, ...e });
      if (grown.mon.level !== m.level || grown.mon.exp !== m.exp || grown.mon.dexId !== m.dexId) {
        await updateOwnedEvolution(db, uid, grown.mon);
      }
    }

    const log = { routeId: route.id, encounters: outcome.encounters, wins: outcome.wins, stoppedBy, elapsedMs, expPerWin: route.expPerWin };
    await insertEncounters(db, s.id, outcome.encounters);
    await closeSession(db, s.id, { claimedAt: now, stoppedBy, encounters: outcome.encounters.length, log: JSON.stringify(log) });

    const box = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, log, levelUps, evolutions, box });
  } catch (err) {
    console.error('[idle/claim] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not claim the session' });
  }
}

// --- tutorial-catch ----------------------------------------------------------

async function tutorialCatch(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = await gate(req, res);
  if (!g) return;
  const { uid, db } = g;
  try {
    const profile = await readProfile(db, uid);
    if (!profile) return res.status(400).json({ ok: false, error: 'finish onboarding first' });
    if ((await countOwned(db, uid)) !== 1) {
      return res.status(400).json({ ok: false, error: 'tutorial already complete' });
    }
    const zone = zoneById('tutorial')!;
    const now = Date.now();
    const caught = await insertOwned(db, uid, rollTutorialReward(`tutorial:${uid}`, zone), 'tutorial', now);
    await db.execute({
      sql: 'insert or ignore into pokedex_cells (user_id, dex_id, layer, caught_at) values (?, ?, ?, ?)',
      args: [uid, caught.dexId, caught.shiny ? 's' : caught.altColor ? 'a' : 'n', now],
    });
    const box = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, caught, box });
  } catch (err) {
    console.error('[idle/tutorial-catch] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not complete the tutorial' });
  }
}
```

Note: `zones.ts` and `catch.ts` are still present at this point; Task 13 folds the tutorial reward into `idle.ts` when they are deleted (see Task 13 Step 4).

- [ ] **Step 3: Route `idle` in the dev server**

In `scripts/dev-api.ts` `resolveRoute`, change the dispatcher list to:

```ts
    (parts[0] === 'auth' || parts[0] === 'me' || parts[0] === 'idle' || parts[0] === 'catch')
```

(`catch` is removed again in Task 13.)

- [ ] **Step 4: Typecheck and smoke test end to end**

Run: `npx tsc -p tsconfig.api.json && npx tsc -b`
Expected: no errors.

Smoke (needs `.env.local` with `TURSO_DATABASE_URL=file:local.db`; run `npm run db:setup` first):

```bash
npx --yes tsx scripts/create-test-account.ts idle@test.local hunter22 "Idle Tester"
npm run dev:local   # in another terminal, leave running
# sign in and keep the cookie
curl -s -c /tmp/c.txt -H 'Content-Type: application/json' -d '{"email":"idle@test.local","password":"hunter22"}' http://localhost:3001/api/auth/login
curl -s -b /tmp/c.txt http://localhost:3001/api/me/profile          # → {"ok":true,"profile":null}
curl -s -b /tmp/c.txt -H 'Content-Type: application/json' -d '{"profession":"trainer","mentor":"oak"}' http://localhost:3001/api/me/onboard
curl -s -b /tmp/c.txt -H 'Content-Type: application/json' -d '{}' http://localhost:3001/api/idle/tutorial-catch
curl -s -b /tmp/c.txt http://localhost:3001/api/me/box               # note the starter id
curl -s -b /tmp/c.txt -H 'Content-Type: application/json' -d '{"routeId":"r1","partyIds":["<starter id>"]}' http://localhost:3001/api/idle/start
curl -s -b /tmp/c.txt http://localhost:3001/api/idle/current
curl -s -b /tmp/c.txt -H 'Content-Type: application/json' -d '{"sessionId":"<id>"}' http://localhost:3001/api/idle/claim   # 0 encounters, closes
```

Expected: onboard returns a level-5 Caterpie; tutorial-catch a second mon; a second tutorial-catch returns "tutorial already complete"; start then current shows the session; claim returns `stoppedBy: 'early'` with an empty encounters list; a second claim returns 409. To test a real log without waiting, temporarily set `started_at` back in the DB (`sqlite3 local.db "update idle_sessions set started_at = started_at - 3600000"`) before claiming, then confirm encounters, wins and EXP appear and the starter's level rose. Review Focus item 2: after a claim raised a mon above level 12, start a new session with it on r1 is rejected (band), but the claim of the session it grew in succeeded.

- [ ] **Step 5: Commit**

```bash
git add api/idle/[action].ts src/game/idle-client.ts scripts/dev-api.ts
git commit -m "Add the idle API: start, current, claim, tutorial-catch"
```

---

### Task 9: Onboarding screen

**Files:**
- Create: `src/components/OnboardingScreen.tsx`

**Interfaces:**
- Consumes: `PROFESSIONS`, `PROFESSORS`, `starterLine`, `professorArtUrl` (Task 2); `onboard`, `setNickname`, `cleanNickname` (Task 7); `tutorialCatch` (Task 8); `ownedMonToCreature`; `MiniSprite`; `BattleScreen`; `simulateBattle`; `scaleCreatureToLevel`; `CREATURES_BY_ID`.
- Produces: `<OnboardingScreen me onDone={(box: OwnedMon[], profile: Profile) => void} />`.

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useState } from 'react';
import type { AccountUser } from '../game/account';
import { PROFESSIONS, PROFESSORS, professorArtUrl, starterLine, type Professor } from '../game/professions';
import { onboard, setNickname, cleanNickname, type Profile } from '../game/profile';
import { tutorialCatch } from '../game/idle-client';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { CREATURES_BY_ID } from '../game/pokemon';
import { scaleCreatureToLevel } from '../game/levels';
import { simulateBattle } from '../game/battle';
import type { Creature, Opponent } from '../game/types';
import { MiniSprite } from './MiniSprite';
import { BattleScreen } from './BattleScreen';

// First five minutes: profession → professor → starter reveal + nickname →
// tutorial battle (outcome doesn't matter) → guided first catch. The server
// mints the starter and the gift; this screen only walks the story.

type Step = 'profession' | 'professor' | 'starter' | 'battle' | 'catch' | 'done';

const TUTORIAL_WILDS = [19, 16, 161, 263, 399]; // Rattata, Pidgey, Sentret, Zigzagoon, Bidoof

export function wildOpponent(name: string, title: string, type: Creature['types'][number]): Opponent {
  return { id: `wild-${name}`, name, title, sprite: '🌿', badge: '', art: '', artGif: '', type, teamSize: 1, tier: 'trainer', quote: '' };
}

export function OnboardingScreen({
  me,
  onDone,
}: {
  me: AccountUser;
  onDone: (box: OwnedMon[], profile: Profile) => void;
}) {
  const [step, setStep] = useState<Step>('profession');
  const [professor, setProfessor] = useState<Professor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [starter, setStarter] = useState<OwnedMon | null>(null);
  const [box, setBox] = useState<OwnedMon[]>([]);
  const [nick, setNick] = useState('');
  const [caught, setCaught] = useState<OwnedMon | null>(null);

  const starterCreature = useMemo(() => (starter ? ownedMonToCreature(starter) : null), [starter]);

  const tutorialBattle = useMemo(() => {
    if (!starterCreature) return null;
    const seed = `tutorial:${me.id}`;
    const pick = TUTORIAL_WILDS[Math.abs(hash(seed)) % TUTORIAL_WILDS.length];
    const wild = scaleCreatureToLevel(CREATURES_BY_ID[String(pick)], 3);
    return { wild, result: simulateBattle([starterCreature], [wild], seed, {}) };
  }, [starterCreature, me.id]);

  const chooseProfessor = async (p: Professor) => {
    setBusy(true);
    setError(null);
    const r = await onboard(p.id);
    setBusy(false);
    if (!r.ok || !r.profile || !r.starter) {
      setError(r.error ?? 'Could not start your journey.');
      return;
    }
    setProfessor(p);
    setProfile(r.profile);
    setStarter(r.starter);
    setBox(r.box ?? [r.starter]);
    setStep('starter');
  };

  const confirmStarter = async () => {
    if (!starter) return;
    const clean = cleanNickname(nick);
    if (nick.trim() && !clean) {
      setError('Nicknames are 1–12 characters.');
      return;
    }
    if (clean) {
      setBusy(true);
      const r = await setNickname(starter.id, clean);
      setBusy(false);
      if (!r.ok) {
        setError(r.error ?? 'Could not save that name.');
        return;
      }
      const named = { ...starter, nickname: clean };
      setStarter(named);
      setBox((b) => b.map((m) => (m.id === named.id ? named : m)));
    }
    setError(null);
    setStep('battle');
  };

  const doCatch = async () => {
    setBusy(true);
    const r = await tutorialCatch();
    setBusy(false);
    if (!r.ok || !r.caught) {
      setError(r.error ?? 'The catch slipped away — try again.');
      return;
    }
    setCaught(r.caught);
    setBox(r.box ?? []);
    setStep('done');
  };

  if (step === 'battle' && tutorialBattle && starterCreature) {
    return (
      <BattleScreen
        opponent={wildOpponent('Wild ' + tutorialBattle.wild.name, 'Route 1 · Your first battle', tutorialBattle.wild.types[0])}
        playerTeam={[starterCreature]}
        foeTeam={[tutorialBattle.wild]}
        result={tutorialBattle.result}
        onComplete={() => setStep('catch')}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      {step === 'profession' && (
        <>
          <h1 className="text-2xl font-black text-white">Who are you, {me.displayName || 'friend'}?</h1>
          <p className="mt-2 text-sm text-white/60">Pick a profession. Only the Trainer road is open for now.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROFESSIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={p.locked}
                onClick={() => setStep('professor')}
                className={`rounded-3xl border px-5 py-4 text-left transition ${
                  p.locked ? 'cursor-not-allowed border-white/5 bg-white/[0.01] opacity-50' : 'border-emerald-400/60 bg-emerald-400/10 hover:bg-emerald-400/20'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-black text-white">{p.name}</span>
                  {p.locked && <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Locked</span>}
                </div>
                <div className="mt-1 text-xs text-white/60">{p.blurb}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'professor' && (
        <>
          <h1 className="text-2xl font-black text-white">Choose your professor</h1>
          <p className="mt-2 text-sm text-white/60">Each one hands you a different partner. They all start weak. That’s the point.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROFESSORS.map((p) => {
              const line = starterLine(p).map((id) => CREATURES_BY_ID[String(id)]).filter(Boolean);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseProfessor(p)}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.08] disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <img src={professorArtUrl(p)} alt="" className="h-12 w-12 object-contain [image-rendering:pixelated]" />
                    <div>
                      <div className="font-black text-white">{p.name}</div>
                      <div className="text-xs text-white/50">{p.bias}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-white/60">{p.blurb}</div>
                  <div className="mt-3 flex items-center gap-2">
                    {line.map((c, i) => (
                      <span key={c.dexId} className="flex items-center gap-1 text-[10px] text-white/60">
                        {i > 0 && <span className="text-white/30">→</span>}
                        <MiniSprite creature={c} className="h-6 w-6" />
                        {c.name}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </>
      )}

      {step === 'starter' && starter && starterCreature && professor && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">{professor.name} hands you…</div>
          <img src={starterCreature.portrait} alt={starterCreature.name} className="mt-4 h-40 w-40 rounded-3xl border border-white/10 bg-white/[0.03] object-contain [image-rendering:pixelated]" />
          <h1 className="mt-4 text-2xl font-black text-white">{CREATURES_BY_ID[String(starter.dexId)].name}</h1>
          <div className="mt-1 text-sm text-white/60">Lv {starter.level} · born under {starter.sign}</div>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="Give it a nickname (optional)"
            className="mt-6 w-full max-w-xs rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-center text-sm text-white outline-none focus:border-emerald-400/60"
          />
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={confirmStarter} className="mt-6 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60">
            {busy ? '…' : 'Let’s go'}
          </button>
        </div>
      )}

      {step === 'catch' && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="text-5xl">🌿</span>
          <h1 className="mt-4 text-2xl font-black text-white">Something rustles in the grass</h1>
          <p className="mt-2 max-w-sm text-white/60">
            {tutorialBattle?.result.winner === 'player' ? 'That was a win. ' : 'Your partner needs training, but that’s what the road is for. '}
            Throw your first ball — this one always sticks.
          </p>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={doCatch} className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60">
            {busy ? '…' : 'Throw a Poké Ball'}
          </button>
        </div>
      )}

      {step === 'done' && caught && profile && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Gotcha!</div>
          <h1 className="mt-2 text-2xl font-black text-white">{CREATURES_BY_ID[String(caught.dexId)].name} joined you</h1>
          <p className="mt-2 max-w-sm text-white/60">
            Your trainer will keep walking Route 1 and battling while you’re away, for up to 8 hours. Come back to see what happened.
          </p>
          <button type="button" onClick={() => onDone(box, profile)} className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95">
            To the hub
          </button>
        </div>
      )}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b && npm run lint`
Expected: no errors (the component is not yet mounted; that is Task 12).

- [ ] **Step 3: Commit**

```bash
git add src/components/OnboardingScreen.tsx
git commit -m "Add the onboarding screen: profession, professor, starter, tutorial"
```

---

### Task 10: Route and claim screens

**Files:**
- Create: `src/components/RouteScreen.tsx`
- Create: `src/components/ClaimScreen.tsx`

**Interfaces:**
- Consumes: `ROUTES`, `isLevelInRoute`, `isPartyEligible`, `isRouteUnlocked`, `IDLE_CAP_MS`, `encountersFor` (Task 4); `IdleSession`, `ClaimResult` (Task 8); `ownedMonToCreature`; `MiniSprite`; `CREATURES_BY_ID`.
- Produces: `<RouteScreen box session serverOffsetMs busy onStart={(routeId, partyIds) => void} onClaim={(sessionId) => void} onBack />` and `<ClaimScreen result box onDone onAgain />`.

- [ ] **Step 1: Create `src/components/RouteScreen.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  ROUTES,
  IDLE_CAP_MS,
  encountersFor,
  isLevelInRoute,
  isPartyEligible,
  isRouteUnlocked,
  routeById,
  type Route,
  type RouteId,
} from '../game/routes';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import type { IdleSession } from '../game/idle-client';
import { MiniSprite } from './MiniSprite';

// Send the trainer out (pick a route + party), or, while a session is open,
// watch the clock and claim. Elapsed time uses the server clock offset the
// caller measured so a wrong device clock can't show more than was earned.

function PartyMon({ mon, selected, eligible, onToggle }: { mon: OwnedMon; selected: boolean; eligible: boolean; onToggle: () => void }) {
  const creature = useMemo(() => ownedMonToCreature(mon), [mon]);
  if (!creature) return null;
  return (
    <button
      type="button"
      disabled={!eligible}
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl border px-1.5 py-2 transition ${
        selected ? 'border-emerald-400/70 bg-emerald-400/10' : eligible ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]' : 'border-white/5 bg-white/[0.01] opacity-40'
      }`}
    >
      <MiniSprite creature={creature} className="h-9 w-9" />
      <span className="w-full truncate text-center text-[10px] text-white/70" title={creature.name}>{creature.name}</span>
      <span className="text-[10px] font-bold text-white/50">Lv {mon.level}</span>
    </button>
  );
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

export function RouteScreen({
  box,
  session,
  serverOffsetMs,
  busy = false,
  onStart,
  onClaim,
  onBack,
}: {
  box: OwnedMon[];
  session: IdleSession | null;
  /** serverNow - Date.now() at the last sync. */
  serverOffsetMs: number;
  busy?: boolean;
  onStart: (routeId: RouteId, partyIds: string[]) => void;
  onClaim: (sessionId: string) => void;
  onBack: () => void;
}) {
  const [routeId, setRouteId] = useState<RouteId>('r1');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [session]);

  const route = routeById(routeId) ?? ROUTES[0];
  const partyIds = [...selected];
  const partyLevels = box.filter((m) => selected.has(m.id)).map((m) => m.level);
  const canStart = !busy && isPartyEligible(partyLevels, route);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      return next;
    });

  const pickRoute = (r: Route) => {
    setRouteId(r.id);
    setSelected((prev) => new Set([...prev].filter((id) => {
      const m = box.find((x) => x.id === id);
      return m ? isLevelInRoute(m.level, r) : false;
    })));
  };

  if (session) {
    const r = routeById(session.routeId) ?? ROUTES[0];
    const elapsed = Math.min(Date.now() + serverOffsetMs - session.startedAt, IDLE_CAP_MS);
    const atCap = elapsed >= IDLE_CAP_MS;
    const party = session.partyIds.map((id) => box.find((m) => m.id === id)).filter((m): m is OwnedMon => Boolean(m));
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <span className="text-5xl">{atCap ? '🏕️' : '🚶'}</span>
        <h1 className="mt-4 text-2xl font-black text-white">{atCap ? 'Your trainer is resting' : `Walking ${r.name}`}</h1>
        <p className="mt-2 text-white/60">
          {atCap ? 'The 8-hour cap is reached. Claim to see what happened.' : `Out for ${formatElapsed(elapsed)} · about ${encountersFor(elapsed, r)} encounters so far`}
        </p>
        <div className="mt-6 flex gap-2">
          {party.map((m) => {
            const c = ownedMonToCreature(m);
            return c ? <MiniSprite key={m.id} creature={c} className="h-8 w-8" /> : null;
          })}
        </div>
        <button type="button" disabled={busy} onClick={() => onClaim(session.id)} className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60">
          {busy ? '…' : 'Claim'}
        </button>
        <button type="button" onClick={onBack} className="mt-4 text-sm text-white/50 hover:text-white">Back to hub</button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Send out</h1>
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">Back</button>
      </header>

      <section className="mt-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Choose a route</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROUTES.map((r) => {
            const unlocked = isRouteUnlocked(r, []);
            const active = r.id === routeId;
            return (
              <button
                key={r.id}
                type="button"
                disabled={!unlocked}
                onClick={() => pickRoute(r)}
                aria-pressed={active}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  !unlocked ? 'cursor-not-allowed border-white/5 opacity-40' : active ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-white">{r.name}</span>
                  <span className="text-xs font-semibold text-white/50">Lv {r.min}-{r.max}</span>
                </div>
                <div className="mt-1 text-xs text-white/50">{unlocked ? r.blurb : 'Locked'}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-xs font-bold uppercase tracking-widest text-white/40">Your party ({partyIds.length}/6)</div>
          <div className="text-xs text-white/40">{route.name} · Lv {route.min}-{route.max}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {box.map((m) => (
            <PartyMon key={m.id} mon={m} selected={selected.has(m.id)} eligible={isLevelInRoute(m.level, route)} onToggle={() => toggle(m.id)} />
          ))}
        </div>
      </section>

      <div className="mt-auto pt-8">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => onStart(route.id, partyIds)}
          className="w-full rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '…' : partyIds.length === 0 ? 'Pick at least one Pokémon' : `Walk ${route.name}`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/ClaimScreen.tsx`**

```tsx
import { useMemo } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import type { ClaimResult } from '../game/idle-client';
import { CREATURES_BY_ID } from '../game/pokemon';
import { MiniSprite } from './MiniSprite';
import { formatElapsed } from './RouteScreen';

// What happened while you were away: the encounter log, EXP, level-ups and
// evolutions (all server-authoritative), plus the met list that slice 2 turns
// into the throw phase.

export function ClaimScreen({ result, onDone, onAgain }: { result: ClaimResult; onDone: () => void; onAgain: () => void }) {
  const boxById = useMemo(() => new Map((result.box ?? []).map((m) => [m.id, m] as [string, OwnedMon])), [result.box]);
  const log = result.log;

  if (!result.ok || !log) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <span className="text-5xl">💫</span>
        <h1 className="mt-4 text-2xl font-black text-white">Nothing to claim</h1>
        <p className="mt-2 max-w-sm text-white/60">{result.error ?? 'Try again in a moment.'}</p>
        <button type="button" onClick={onDone} className="mt-8 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black">Back to hub</button>
      </div>
    );
  }

  const title = log.encounters.length === 0 ? 'Back so soon?' : log.stoppedBy === 'loss' ? 'Your party fainted' : log.stoppedBy === 'cap' ? 'A full day on the road' : 'Welcome back';
  const name = (m: OwnedMon | undefined, dexId: number) => m?.nickname ?? CREATURES_BY_ID[String(m?.dexId ?? dexId)]?.name ?? 'Pokémon';

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      <h1 className="text-2xl font-black text-white">{title}</h1>
      <p className="mt-1 text-sm text-white/60">
        Out for {formatElapsed(log.elapsedMs)} · {log.encounters.length} encounters · {log.wins} wins · {log.wins * log.expPerWin} EXP each
      </p>

      {(result.levelUps?.length || result.evolutions?.length) ? (
        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">Growth</div>
          <ul className="space-y-2">
            {result.levelUps?.map((lu) => {
              const m = boxById.get(lu.id);
              const c = m ? ownedMonToCreature(m) : null;
              return (
                <li key={lu.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/80">{c && <MiniSprite creature={c} className="h-6 w-6" />}{name(m, 0)}</span>
                  <span className="font-bold text-emerald-300">Lv {lu.fromLevel} → {lu.toLevel}</span>
                </li>
              );
            })}
            {result.evolutions?.map((ev, i) => (
              <li key={`${ev.id}-${i}`} className="flex items-center justify-between text-sm">
                <span className="text-white/80">{CREATURES_BY_ID[String(ev.fromDexId)]?.name} evolved!</span>
                <span className="font-bold text-amber-300">→ {CREATURES_BY_ID[String(ev.toDexId)]?.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Met on the road</div>
        {log.encounters.length === 0 ? (
          <p className="text-sm text-white/50">Nobody yet. Encounters happen every few minutes; give it time.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {log.encounters.map((e) => {
              const c = CREATURES_BY_ID[String(e.dexId)];
              return (
                <li key={e.slot} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2 text-white/80">{c && <MiniSprite creature={c} className="h-6 w-6" />}{c?.name ?? 'Wild'} <span className="text-white/40">Lv {e.level}</span></span>
                  <span className={e.won ? 'text-emerald-300' : 'text-rose-300'}>{e.won ? 'won' : 'lost'} · {e.turns}t</span>
                </li>
              );
            })}
          </ul>
        )}
        {log.encounters.length > 0 && <p className="mt-2 text-xs text-white/40">Catching the Pokémon you meet arrives in the next update.</p>}
      </section>

      <div className="mt-auto flex gap-3 pt-8">
        <button type="button" onClick={onAgain} className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-bold text-white hover:bg-white/[0.08]">Send out again</button>
        <button type="button" onClick={onDone} className="flex-1 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black">Back to hub</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc -b && npm run lint`

```bash
git add src/components/RouteScreen.tsx src/components/ClaimScreen.tsx
git commit -m "Add the route (send out / waiting) and claim screens"
```

---

### Task 11: Box screen

**Files:**
- Create: `src/components/BoxScreen.tsx`

**Interfaces:**
- Consumes: `OwnedMon`, `ownedMonToCreature`, `setNickname`, `cleanNickname`, `evolutionLevel` (Task 3), `MiniSprite`, `signLabel` from `zodiac.ts`.
- Produces: `<BoxScreen box onBack onRenamed={(id, nickname) => void} />`.

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { setNickname, cleanNickname, NICKNAME_MAX } from '../game/profile';
import { evolutionLevel } from '../game/evolution';
import { CREATURES_BY_ID } from '../game/pokemon';
import { signLabel } from '../game/zodiac';
import { MiniSprite } from './MiniSprite';

// The box: every owned individual, newest first, with a detail drawer.

export function BoxScreen({ box, onBack, onRenamed }: { box: OwnedMon[]; onBack: () => void; onRenamed: (id: string, nickname: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = useMemo(() => box.find((m) => m.id === openId) ?? null, [box, openId]);
  const creature = useMemo(() => (open ? ownedMonToCreature(open) : null), [open]);

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
            <button key={m.id} type="button" onClick={() => { setOpenId(m.id); setNick(''); setError(null); }} className={`flex flex-col items-center gap-1 rounded-2xl border p-2 ${m.id === openId ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <MiniSprite creature={c} className="h-9 w-9" />
              <span className="w-full truncate text-[10px] text-white/70">{c.name}</span>
              <span className="text-[10px] font-bold text-white/50">Lv {m.level}</span>
            </button>
          );
        })}
      </div>

      {open && creature && (
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-4">
            <img src={creature.portrait} alt={creature.name} className="h-20 w-20 rounded-2xl object-contain [image-rendering:pixelated]" />
            <div>
              <div className="text-lg font-black text-white">{creature.name}</div>
              <div className="text-xs text-white/50">{CREATURES_BY_ID[String(open.dexId)].name} · Lv {open.level} · {signLabel(open.sign)}{open.shiny ? ' · Shiny' : ''}</div>
              <div className="text-xs text-white/50">{open.origin === 'starter' ? 'Your starter' : open.origin === 'tutorial' ? 'First catch' : 'Caught'}</div>
              {(() => { const at = evolutionLevel(open.dexId, open.origin); return at ? <div className="text-xs text-emerald-300/80">Evolves at Lv {at}</div> : null; })()}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            {(['hp', 'atk', 'eatk', 'def', 'edef', 'spd'] as const).map((k) => (
              <div key={k} className="rounded-xl bg-white/[0.04] py-1.5"><div className="text-white/40 uppercase">{k}</div><div className="font-bold text-white">{creature.stats[k]}</div></div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={NICKNAME_MAX} placeholder="Nickname" className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
            <button type="button" disabled={busy} onClick={save} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black disabled:opacity-60">{busy ? '…' : 'Save'}</button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc -b && npm run lint`

```bash
git add src/components/BoxScreen.tsx
git commit -m "Add the box screen with nickname editing"
```

---

### Task 12: Hub and App rewrite

**Files:**
- Modify: `src/components/HubScreen.tsx` (trainer card, send-out/claim CTA, remove Rental and Ladder)
- Rewrite: `src/App.tsx`
- Modify: `src/components/AccountScreen.tsx` (drop `onViewMyRuns` prop and the runs/wins/losses stat tiles)

**Interfaces:**
- Consumes: Tasks 7–11.
- Produces: the app wired end to end; `HubScreen` props become `{ me, box, profile, session, serverOffsetMs, onSendOut, onClaim, onViewBox, onViewDex, onViewGuide, onViewAccount }`.

- [ ] **Step 1: Rewrite `HubScreen.tsx`**

Replace the file with:

```tsx
import { useMemo } from 'react';
import type { AccountUser } from '../game/account';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import type { Profile } from '../game/profile';
import { professorById } from '../game/professions';
import type { IdleSession } from '../game/idle-client';
import { IDLE_CAP_MS, routeById } from '../game/routes';
import { MAX_LEVEL } from '../game/levels';
import { MiniSprite } from './MiniSprite';
import { formatElapsed } from './RouteScreen';

function BoxMon({ mon }: { mon: OwnedMon }) {
  const creature = useMemo(() => ownedMonToCreature(mon), [mon]);
  if (!creature) return null;
  const maxed = mon.level >= MAX_LEVEL;
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <MiniSprite creature={creature} className="h-10 w-10" />
      </div>
      <div className="w-full truncate text-center text-[10px] text-white/60" title={creature.name}>{creature.name}</div>
      <div className={`text-[10px] font-bold ${maxed ? 'text-amber-300' : 'text-white/50'}`}>Lv {mon.level}</div>
    </div>
  );
}

export function HubScreen({
  me, box, profile, session, serverOffsetMs,
  onSendOut, onClaim, onViewBox, onViewDex, onViewGuide, onViewAccount,
}: {
  me: AccountUser;
  box: OwnedMon[];
  profile: Profile;
  session: IdleSession | null;
  serverOffsetMs: number;
  onSendOut: () => void;
  onClaim: () => void;
  onViewBox: () => void;
  onViewDex: () => void;
  onViewGuide: () => void;
  onViewAccount: () => void;
}) {
  const recent = box.slice(0, 12);
  const professor = professorById(profile.mentor);
  const starter = box.find((m) => m.id === profile.starterId);
  const starterCreature = starter ? ownedMonToCreature(starter) : null;
  const elapsed = session ? Math.min(Date.now() + serverOffsetMs - session.startedAt, IDLE_CAP_MS) : 0;
  const route = session ? routeById(session.routeId) : null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="" className="h-9 w-9 object-contain [image-rendering:pixelated]" />
          <div>
            <div className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-xl font-black tracking-tight text-transparent">TRAINER {me.displayName?.toUpperCase() || ''}</div>
            <div className="text-xs text-white/50">{professor?.name ?? 'Professor'}’s protégé{starterCreature ? ` · partner: ${starterCreature.name}` : ''}</div>
          </div>
        </div>
        <button type="button" onClick={onViewAccount} className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.08]">Account</button>
      </header>

      <section className="mt-8">
        {session ? (
          <button type="button" onClick={onClaim} className="flex w-full flex-col items-start gap-1 rounded-3xl bg-gradient-to-br from-amber-300/90 to-orange-400/90 px-6 py-5 text-left text-black shadow-lg transition hover:scale-[1.01] active:scale-[0.99]">
            <span className="text-lg font-black">Claim ({formatElapsed(elapsed)})</span>
            <span className="text-sm font-medium text-black/70">Your trainer is out on {route?.name ?? 'the road'}. See what happened.</span>
          </button>
        ) : (
          <button type="button" onClick={onSendOut} className="flex w-full flex-col items-start gap-1 rounded-3xl bg-gradient-to-br from-emerald-400/90 to-teal-500/90 px-6 py-5 text-left text-black shadow-lg transition hover:scale-[1.01] active:scale-[0.99]">
            <span className="text-lg font-black">Send out</span>
            <span className="text-sm font-medium text-black/70">Pick a route and a party. Your trainer battles while you’re away.</span>
          </button>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">Your box</h2>
          <button type="button" onClick={onViewBox} className="text-xs text-white/40 hover:text-white">{box.length} Pokémon · open</button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">{recent.map((m) => <BoxMon key={m.id} mon={m} />)}</div>
      </section>

      <nav className="mt-auto flex flex-wrap justify-center gap-2 pt-10 text-xs">
        {[{ label: 'Pokédex', on: onViewDex }, { label: 'Guide', on: onViewGuide }].map((l) => (
          <button key={l.label} type="button" onClick={l.on} className="rounded-full border border-white/10 bg-white/[0.02] px-4 py-1.5 font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white">{l.label}</button>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Trim `AccountScreen.tsx`**

Remove the `onViewMyRuns` prop (both the destructure and the type), the block that renders the `['Runs', me.stats.runs]`, `['Wins', …]`, `['Losses', …]` tiles, and the `{onViewMyRuns && (…)}` button. Keep everything else.

- [ ] **Step 3: Rewrite `src/App.tsx`**

Replace the whole file with:

```tsx
import { lazy, Suspense, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { fetchMe, type AccountUser } from './game/account';
import { fetchBox, type OwnedMon } from './game/box';
import { fetchProfile, type Profile } from './game/profile';
import { fetchCurrentSession, startIdle, claimIdle, type IdleSession, type ClaimResult } from './game/idle-client';
import type { RouteId } from './game/routes';
import { hashIsGuide } from './guide/hash';
import { DevPanel } from './components/DevPanel';
import { LoginScreen } from './components/LoginScreen';
import { HubScreen } from './components/HubScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { RouteScreen } from './components/RouteScreen';
import { ClaimScreen } from './components/ClaimScreen';
import { BoxScreen } from './components/BoxScreen';

const GuideScreen = lazy(() => import('./components/Guide').then((m) => ({ default: m.GuideScreen })));
const PokedexScreen = lazy(() => import('./components/PokedexScreen').then((m) => ({ default: m.PokedexScreen })));
const AccountScreen = lazy(() => import('./components/AccountScreen').then((m) => ({ default: m.AccountScreen })));
const TrainerSpritesScreen = import.meta.env.DEV
  ? lazy(() => import('./components/TrainerSpritesScreen').then((m) => ({ default: m.TrainerSpritesScreen })))
  : null;

function ScreenFallback() {
  return (
    <div className="grid min-h-[100dvh] place-items-center">
      <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="Loading" className="h-12 w-12 animate-spin object-contain [image-rendering:pixelated] opacity-70" />
    </div>
  );
}

type Phase = 'hub' | 'onboarding' | 'route' | 'claim' | 'box' | 'dex' | 'guide' | 'account' | 'trainerSprites';

export default function App() {
  const [phase, setPhase] = useState<Phase>(() => (typeof window !== 'undefined' && hashIsGuide() ? 'guide' : 'hub'));
  const [me, setMe] = useState<AccountUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [box, setBox] = useState<OwnedMon[]>([]);
  const [session, setSession] = useState<IdleSession | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [accountResetToken, setAccountResetToken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Load everything a signed-in player needs: profile (null → onboarding), box, open session.
  const hydrate = async () => {
    const [p, b, s] = await Promise.all([fetchProfile(), fetchBox(), fetchCurrentSession()]);
    setProfile(p);
    setBox(b);
    setSession(s.session);
    setServerOffsetMs(s.serverNow - Date.now());
    setProfileChecked(true);
    if (!p) setPhase('onboarding');
  };

  useEffect(() => {
    fetchMe().then((u) => {
      setMe(u);
      setAuthChecked(true);
      if (u) hydrate();
    });
    const params = new URLSearchParams(window.location.search);
    const reset = params.get('reset');
    const verified = params.get('verified');
    const oauth = params.get('oauth');
    if (reset) {
      setAccountResetToken(reset);
      setPhase('account');
    }
    if (verified) setNote(verified === '1' ? 'Email verified — thanks!' : 'That verification link was invalid or expired.');
    if (oauth) {
      const notes: Record<string, string> = {
        ok: 'Signed in — welcome!',
        error: 'Sign-in failed. Please try again.',
        email_taken: 'That email already has an account — sign in with your password first.',
        unconfigured: 'That sign-in option isn’t set up yet.',
      };
      if (notes[oauth]) setNote(notes[oauth]);
    }
    if (reset || verified || oauth) {
      params.delete('reset');
      params.delete('verified');
      params.delete('oauth');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the open session's clock honest while it is showing.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(async () => {
      const s = await fetchCurrentSession();
      setServerOffsetMs(s.serverNow - Date.now());
      setSession(s.session);
    }, 60_000);
    return () => clearInterval(t);
  }, [session]);

  const handleAuthed = (user: AccountUser) => {
    setMe(user);
    if (user.displayName) localStorage.setItem('lb-name', user.displayName);
    setAccountResetToken(null);
    setProfileChecked(false);
    hydrate();
    setPhase(hashIsGuide() ? 'guide' : 'hub');
  };

  const sendOut = async (routeId: RouteId, partyIds: string[]) => {
    if (busy) return;
    setBusy(true);
    const r = await startIdle(routeId, partyIds);
    setBusy(false);
    if (!r.ok || !r.session) {
      setNote(r.error ?? 'Could not send your trainer out.');
      return;
    }
    setSession(r.session);
  };

  const claim = async (sessionId: string) => {
    if (busy) return;
    setBusy(true);
    const r = await claimIdle(sessionId);
    setBusy(false);
    setClaimResult(r);
    if (r.box) setBox(r.box);
    if (r.ok) setSession(null);
    setPhase('claim');
  };

  const renderScreen = () => {
    if (!me) return null;
    if (!profileChecked) return <ScreenFallback />;
    if (!profile || phase === 'onboarding') {
      return (
        <OnboardingScreen
          me={me}
          onDone={(b, p) => {
            setBox(b);
            setProfile(p);
            setPhase('hub');
          }}
        />
      );
    }
    switch (phase) {
      case 'hub':
        return (
          <HubScreen
            me={me}
            box={box}
            profile={profile}
            session={session}
            serverOffsetMs={serverOffsetMs}
            onSendOut={() => setPhase('route')}
            onClaim={() => setPhase('route')}
            onViewBox={() => setPhase('box')}
            onViewDex={() => setPhase('dex')}
            onViewGuide={() => setPhase('guide')}
            onViewAccount={() => setPhase('account')}
          />
        );
      case 'route':
        return <RouteScreen box={box} session={session} serverOffsetMs={serverOffsetMs} busy={busy} onStart={sendOut} onClaim={claim} onBack={() => setPhase('hub')} />;
      case 'claim':
        if (!claimResult) return null;
        return <ClaimScreen result={claimResult} box={box} onDone={() => setPhase('hub')} onAgain={() => setPhase('route')} />;
      case 'box':
        return <BoxScreen box={box} onBack={() => setPhase('hub')} onRenamed={(id, nickname) => setBox((b) => b.map((m) => (m.id === id ? { ...m, nickname } : m)))} />;
      case 'dex':
        return <PokedexScreen onBack={() => setPhase('hub')} me={me} />;
      case 'guide':
        return <GuideScreen onBack={() => setPhase('hub')} />;
      case 'account':
        return (
          <AccountScreen
            key={`${me.id}:${accountResetToken ?? ''}`}
            me={me}
            resetToken={accountResetToken}
            onBack={() => setPhase('hub')}
            onAuthed={handleAuthed}
            onSignedOut={() => {
              setMe(null);
              setBox([]);
              setProfile(null);
              setSession(null);
            }}
          />
        );
      case 'trainerSprites':
        return TrainerSpritesScreen ? <TrainerSpritesScreen onBack={() => setPhase('hub')} /> : null;
      default:
        return null;
    }
  };

  const gated = !authChecked ? <ScreenFallback /> : !me ? <LoginScreen resetToken={accountResetToken} onAuthed={handleAuthed} /> : renderScreen();

  return (
    <>
      <Suspense fallback={<ScreenFallback />}>{gated}</Suspense>
      {note && (
        <div className="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[90vw]">
          <button type="button" onClick={() => setNote(null)} className="rounded-full border border-white/15 bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-black/90">
            {note} <span className="ml-2 text-white/40">✕</span>
          </button>
        </div>
      )}
      {import.meta.env.DEV && <DevPanel onViewTrainerSprites={() => setPhase('trainerSprites')} />}
      <Analytics />
    </>
  );
}
```

`ClaimScreen` takes a `box` prop in this call but its Task 10 signature does not: add `box: OwnedMon[]` to `ClaimScreen`'s props (unused beyond `result.box`; keep it for parity, or drop the prop from both — pick one and make them agree).

- [ ] **Step 4: Check `DevPanel` compiles**

`DevPanel` may import Rental helpers (check `src/components/DevPanel.tsx` imports). Remove any Rental-only controls from it now so it compiles after Task 13; keep `onViewTrainerSprites`.

- [ ] **Step 5: Typecheck, lint, build**

Run: `npm run lint && npx tsc -b && npm run build`
Expected: green. The Rental components still exist on disk and still compile against the modules they import.

- [ ] **Step 6: Manual play-through**

Run `npm run dev:local`, sign in with the test account from Task 8 (or a fresh one), and walk: profession → Oak → nickname → tutorial battle → catch → hub → Send out (Route 1, starter + gift) → hub shows "Claim (0m)" → Claim → "Back so soon?" with zero encounters → Send out again. Back-date the session in `local.db` by an hour and claim: encounters and EXP appear; after enough claims the starter shows "evolved!" at level 8.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/HubScreen.tsx src/components/AccountScreen.tsx src/components/ClaimScreen.tsx src/components/DevPanel.tsx
git commit -m "Rebuild the app around onboarding, hub, route, claim and box"
```

---

### Task 13: Remove Rental

**Files:**
- Delete: `api/start-run.ts`, `api/submit-win.ts`, `api/submit-loss.ts`, `api/leaderboard.ts`, `api/challenge-king.ts`, `api/hall-of-shame.ts`, `api/_token.ts`, `api/_catchtoken.ts`, `api/catch/[action].ts`
- Delete: `src/game/leaderboard.ts`, `opponents.ts`, `specials.ts`, `hallOfShame.ts`, `gagName.ts`, `shareCard.ts`, `progression.ts`, `run.ts`, `zones.ts`, `catch.ts`
- Delete components: `TitleScreen`, `DraftScreen`, `MapScreen`, `ItemEventScreen`, `RecruitScreen`, `ResultScreen`, `ThroneResultScreen`, `LadderScreen`, `ShameScreen`, `HistoryScreen`, `HallOfShame`, `Leaderboard`, `ChampionSpotlight`, `DailyCountdown`, `RelicStrip`, `MyRunsScreen`, `CatchSetupScreen`, `CatchResultScreen`, and `CupIcon`/`TeamPortrait` if nothing else imports them
- Delete tests/scripts: `scripts/throne.test.ts`, `relics.test.ts`, `progression.test.ts`, `zones.test.ts`, `catch.test.ts`, `sim-check.ts`, `tank-check.ts`, `balance-audit.ts`
- Delete: `src/guide/pages/runs.mdx`
- Modify: `src/game/battle.ts`, `src/game/relics.ts`, `src/game/account.ts`, `api/me/[action].ts`, `src/game/idle.ts` (tutorial reward), `api/idle/[action].ts`, `scripts/dev-api.ts`, `src/guide/pages/overview.mdx`, `package.json`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Delete the files**

```bash
git rm -q api/start-run.ts api/submit-win.ts api/submit-loss.ts api/leaderboard.ts api/challenge-king.ts api/hall-of-shame.ts api/_token.ts api/_catchtoken.ts 'api/catch/[action].ts'
git rm -q src/game/leaderboard.ts src/game/opponents.ts src/game/specials.ts src/game/hallOfShame.ts src/game/gagName.ts src/game/shareCard.ts src/game/progression.ts
git rm -q src/components/{TitleScreen,DraftScreen,MapScreen,ItemEventScreen,RecruitScreen,ResultScreen,ThroneResultScreen,LadderScreen,ShameScreen,HistoryScreen,HallOfShame,Leaderboard,ChampionSpotlight,DailyCountdown,RelicStrip,MyRunsScreen,CatchSetupScreen,CatchResultScreen}.tsx
git rm -q scripts/{throne,relics,progression,zones,catch}.test.ts scripts/sim-check.ts scripts/tank-check.ts scripts/balance-audit.ts
git rm -q src/guide/pages/runs.mdx
```

Then: `grep -rl "CupIcon\|TeamPortrait" src` — if only the deleted files referenced them, `git rm` those too.

- [ ] **Step 2: Slim the engine**

In `src/game/battle.ts`:
- Replace `import type { Difficulty } from './run.js';` with a local `type Difficulty = 'easy' | 'normal' | 'hard' | 'master';` near the top.
- Remove `import { famousTeamCreatures } from './specials.js';` and delete `buildFamousTeam`, `buildChampionTeam`, `championFoeStatMult`, `CHAMPION_DIFFICULTY_MULT`, `TIER_STAT_MULT`, `PLAYER_STAT_MULT`. Delete `trainerPool`/`assignSigns`/`signOptsForTier`/`bestRareSign` only if nothing left uses them (`buildOpponentTeam` does; keep it and its helpers).
- In `simulateBattle`'s options, delete `playerRelics` and `foeRelics`; replace `const playerMods = relicMods(opts.playerRelics); const foeMods = relicMods(opts.foeRelics);` with `const playerMods = identityMods(); const foeMods = identityMods();`. Change the import from `./relics.js` to `import { identityMods, relicDamageMult } from './relics.js';`.
- Delete any other `RelicId` imports left unused.

In `src/game/relics.ts`: keep only `RelicMods`-related code: `identityMods()`, `relicDamageMult()`, and the `RelicMods` type import. Delete `RELICS`, `ALL_RELICS`, `isRelicId`, `relicMods`, `relicRelevant`, `rollRelicOffer`, `ITEM_EVENTS`, `itemEventStages`, `MAX_RELICS`, `sanitizeRelics`, `RELIC_OFFER_COUNT`, the `STAT_BOOST`/`TYPE_BOOST`/`typeRelic` helpers and the `RelicDef`/`RelicRarity` types. Leave a header comment: "Reduced to the mods hook the engine still reads; full removal is a slice 5 item."

In `src/game/types.ts`: leave `RelicId`/`RelicMods`/`Opponent`/`OpponentTier` in place (still referenced by the engine and `BattleScreen`).

- [ ] **Step 3: Fold the tutorial gift into `idle.ts` and delete `zones.ts`/`catch.ts`**

Append to `src/game/idle.ts`:

```ts
/** The one-time tutorial gift: a weak-pool species at level 3. Deterministic per seed. */
export function rollTutorialGift(seed: string, dex: Creature[] = CREATURES): MintSpec {
  const rng = new RNG(`tutorial-gift:${seed}`);
  const normals = dex.filter((c) => c.tier === 'normal').sort((a, b) => bst(a) - bst(b));
  const pool = normals.slice(0, Math.max(1, Math.floor(normals.length * 0.25)));
  const species = rng.pick(pool);
  return { dexId: species.dexId, level: 3, ...rollIdentity(species, rng) };
}
```

with `import type { MintSpec } from './box.js';` added. In `api/idle/[action].ts` replace the `rollTutorialReward`/`zoneById` imports and call with `rollTutorialGift(\`tutorial:${uid}\`)` from `../../src/game/idle.js`. In `src/game/box.ts` remove `import type { ZoneId } from './zones.js';` and delete the `CatchStart`, `LevelUp`, `CatchResult` interfaces and the `startCatch`/`completeCatch` wrappers (keep `fetchBox`, `OwnedMon`, `MintSpec`, `ownedMonToCreature`, `ownedPower`, `coerceOwned`). Then:

```bash
git rm -q src/game/zones.ts src/game/catch.ts
```

- [ ] **Step 4: Trim `api/me/[action].ts` and `account.ts`**

In `api/me/[action].ts` delete the `record-run` and `runs` cases and their handlers, `parseForm`, `MAX_FORMS`, `layerSet`, and the imports from `../_token.js`, `leaderboard.js`, `progression.js`, `run.js`, and `RelicId`. Keep `pokedex`, `box`, `profile`, `onboard`, `nickname`.

In `src/game/account.ts` delete `MyRun`, `fetchMyRuns`, `RunOutcome`, and the imports from `./leaderboard.js` / `./gens.js` / `./run.js` if now unused. Keep auth functions, `AccountUser`, `OwnedDex`, `hasForm`, `fetchPokedex`.

- [ ] **Step 5: Dev server, guide, package.json**

`scripts/dev-api.ts`: dispatcher list becomes `(parts[0] === 'auth' || parts[0] === 'me' || parts[0] === 'idle')`.

`src/guide/pages/overview.mdx`: rewrite the intro line and the page list to describe idle routes instead of drafting; remove the `Runs` bullet. One paragraph is enough; the full rewrite is slice 5.

`package.json` `test` script becomes:

```
tsx scripts/moves.test.ts && tsx scripts/species-lock.test.ts && tsx scripts/levels.test.ts && tsx scripts/identity.test.ts && tsx scripts/professions.test.ts && tsx scripts/evolution.test.ts && tsx scripts/routes.test.ts && tsx scripts/idle.test.ts && tsx scripts/db.test.ts && tsx scripts/profile.test.ts
```

- [ ] **Step 6: Build until green**

Run: `npm run lint && npx tsc -b && npx tsc -p tsconfig.api.json && npm test && npm run build`

Fix every dangling import the compiler reports by deleting the dead reference (never by restoring a deleted file). Common leftovers: `moves.test.ts` importing from `run.ts` (switch to `odds.ts` or drop the check), `DevPanel` Rental toggles, `PokedexScreen` importing `gens.ts` (fine, `gens.ts` stays), `TrainerSprite` (keep; it types on `Opponent`, which stays).

- [ ] **Step 7: README and CHANGELOG**

`README.md`: replace the "How it plays" and "Core systems" sections with a short description of the trainer route (profession → professor → weak starter → idle routes → claim), keep the sprite credits and "Run it" sections, and correct "Pure frontend, no backend" to describe the Vercel functions, Turso, and Redis. Remove `sim-check` instructions.

`CHANGELOG.md` under `[Unreleased]`:

```markdown
### Added
- **Trainer route** — pick the Trainer profession and one of four professors (Oak, Elm, Birch, Rowan); receive a fixed, weak, three-stage starter; a guided first battle and first catch.
- **Idle routes** — send your trainer out on Route 1 for up to 8 hours of real-time auto-battles; claim the encounter log, EXP, level-ups and evolutions. Server-simulated from a fixed seed.
- **Box** — nickname your Pokémon; starters evolve at 8 and 16, others at 16 and 32.

### Removed
- The Rental draft gauntlet, relics, the daily Champion board, the Throne, the Hall of Shame and My Runs.
```

- [ ] **Step 8: Final verification and commit**

Run: `npm run lint && npm test && npm run build`
Expected: all green. `ls api` shows `_db.ts _email.ts _ratelimit.ts _redis.ts _session.ts auth idle me` (3 functions).

```bash
git add -A
git commit -m "Remove Rental: gauntlet, relics, boards, Throne, Hall of Shame"
```

- [ ] **Step 9: Play-through after removal**

Repeat Task 12 Step 6 on `npm run dev:local`. Confirm the login → onboarding → hub → route → claim → box loop, the guide opens, the Pokédex opens, and no console errors mention a deleted module.

---

## Self-review notes

- **Spec coverage:** Part A (Task 13 + engine slimming), Part B data/logic/API/tutorial (Tasks 2, 3, 6, 7, 9), Part C data/logic/API (Tasks 4, 5, 6, 8), Part D client (Tasks 9–12), Testing section (Tasks 1–7 tests; `zones`/`catch` tests removed in 13), Release section (Task 13 Step 7; the `0.2.0` release and production `db:setup` happen after review, via `npm run release minor`).
- **Deviations from spec, on purpose:** the tutorial gift keeps the existing weak-pool roll (moved to `rollTutorialGift`) instead of reusing `zones.ts`, so `zones.ts` can go; `BattleScreen` keeps taking the `Opponent` type (which stays in `types.ts`) rather than a new lighter shape, built via `wildOpponent()` in `OnboardingScreen`.
- **Type consistency:** `EncounterRecord` (Task 5) is what `insertEncounters` (Task 6), the claim log (Task 8) and `ClaimScreen` (Task 10) all use. `Profile.currentRoute` is typed `RouteId`; the API returns the string from the row, which is `'r1'` today.
- **Review Focus pins:** 1 → Task 4 test ("20 hours is clamped"); 2 → Task 8 smoke; 3 and 4 → Task 3 tests [4] and [3]; 5 → Task 7 test.
