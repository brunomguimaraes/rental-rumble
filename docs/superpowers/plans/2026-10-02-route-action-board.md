# Route Action Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Sunny Meadow page into a six-card action board (Wild Pokémon, Trainer, Puzzle, Quest, Explore,
Forage) under route rules v4. The board includes sliding puzzles that the server verifies, quests played one step at
a time, and the secret Honey Tree.

**Architecture:**
- Every card is a search kind on the existing `search` and `choose` commands. They share the action meter, the
  idempotent receipts and the rule of one open encounter.
- Pure rules live in `src/game/`: `route-rules.ts`, a new `sliding-puzzle.ts` and a new `route-quests.ts`. The server
  runs those same rules.
- Per-card writes move into a new `api/_route-finds.ts`.
- The screen replaces `SunnyMeadow.tsx` with `RouteBoard.tsx` and adds a `PuzzleView.tsx`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (Night tokens), Vercel functions with Turso (libSQL), plain `tsx`
test scripts with a `check()` harness.

**Spec:** `docs/superpowers/specs/2026-10-02-route-action-board-design.md`

## Global Constraints

- Route rules v4:
  - Every card costs 1 action (`ROUTE_RULES.costs`). The survey claim is free. Spread Honey also costs 1 Honey.
  - Wild wins pay 30 EXP and ₽0. Trainer wins pay 50 EXP and ₽200.
  - Events stored under rules v2 and v3 keep their frozen rules; a v3 wild win still pays ₽100.
- Server authority:
  - The server derives every quest step and every outcome. The client never decides one.
  - The puzzle seed never leaves the server; the board and the reward are public.
- No schema change: do not edit `db/schema.sql` or `COLUMN_ADDS`, and run no `db:setup`.
- Runtime relative imports in `src/game/` and `api/` end in `.js`. Components import without an extension.
- Night tokens only, with no hex values in components. Captions use `font-label uppercase`.
- Controls are real buttons or inputs, with touch targets of at least 44px and `ui-focus` rings.
- Pixel sprites use `[image-rendering:pixelated]`; the meadow art stays smooth.
- No numeric levels on any screen.
- Tests are `tsx scripts/*.test.ts` files using `check()`. A new test file runs only once it is appended to the `test`
  script in `package.json`.
- Verification commands:
  - focused: the named test scripts, plus `npx tsc -b` for `src/` and `npx tsc -p tsconfig.api.json` for `api/`;
  - full gate: `npm run lint && npm test && npm run build`.
- Commits:
  - Plain descriptive sentences with no Conventional Commit prefix, and **no `Co-Authored-By` trailer** (the owner's
    rule).
  - Stage explicit paths only. Never stage `src/components/world/CatchSequence.css` or `CatchSequence.tsx`, whose
    uncommitted edits belong to someone else.

## Review Focus

1. **A tab opened before the update** retries a pending Find NPC search. It must get a 400 with "Sunny Meadow has new
   actions. Refresh to see them.", spend nothing, and drop the pending command instead of retrying it forever.
   Tested in Task 2 (API) and Task 5 (client).
2. **A double tap on the last panel**, or a resubmit after a slow reply, sends two solves. The reward is paid once:
   the same request ID replays, and a new request ID gets 409. Tested in Task 3.
3. **One Honey and two uses at once** (Spread Honey and a market sale). Exactly one succeeds and the Bag never goes
   negative. Tested in Task 4.
4. **A quest step changes underneath the player**, for example the survey becomes ready or the Honey is sold
   elsewhere. The search gets 409 with the current state and spends nothing, and the board then shows the new step.
   Tested in Task 4 (database and API).
5. **Reopening a puzzle** must start from the board the server stored, never from stale local moves. The public board
   must equal the stored board, and `PuzzleView` is keyed by the encounter ID. Tested in Task 3 and checked in the
   Task 8 browser check.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/game/sliding-puzzle.ts` (new) | Pure 3×3 panel puzzle: generate from a seed, legal moves, replay, solved check. |
| `src/game/route-quests.ts` (new) | Pure quest views and steps from stored rows, and whether the Bag covers a step. |
| `src/game/route-actions.ts` | Shared types: v4 search kinds, rules v4, puzzle and quest shapes. |
| `src/game/route-rules.ts` | `ROUTE_RULES` v4 and the seeded finds for every card. |
| `src/game/route-actions-client.ts` | Client validator that accepts `quests`. |
| `api/_route-error.ts` (new) | `RouteError` and `fail`, shared by the command shell and the finds module. |
| `api/_route-finds.ts` (new) | Per-card search writes: discoveries, items, ₽, quest rows, the event. |
| `api/_route-actions.ts` | Command shell: parsing, validation, receipts, choose (adds solve), state (adds quests). |
| `api/_db.ts` | `readRouteQuests` (one read of a trainer's quest rows). |
| `api/world/[action].ts` | Refresh sentence for retired `npc` searches. |
| `src/components/world/route-board.ts` (new) | Pure board logic: cards, CTA label, cost, enabled state and reason, quest pick. |
| `src/components/world/puzzle-art.ts` (new) | Scene crops and panel backgrounds over the meadow art. |
| `src/components/world/RouteBoard.tsx` (new) | The board screen; replaces `SunnyMeadow.tsx`, which is deleted. |
| `src/components/world/PuzzleView.tsx` (new) | The puzzle screen. |
| `src/components/world/RouteScreen.tsx` | Wires the board and puzzle; hides the trainer bar on the board. |
| `src/components/world/RouteResultView.tsx`, `route-copy.ts`, `place-highlights.ts`, `MeadowEncounter.tsx`, `MeadowScene.tsx`, `src/components/HubActivity.tsx` | Results, copy, highlights and the wide scene. |
| `scripts/route-balance.ts` | Balance gate over every Route 1 opponent. |
| `scripts/sliding-puzzle.test.ts` (new) and `scripts/route-{rules,db,api,client}.test.ts` | Tests. |
| `scripts/build-night-icon-sizes.py`, `public/sprites/ui/night/96/field-journal.png` | Quest card icon. |
| `CHANGELOG.md`, `src/guide/pages/overview.mdx` | Docs. |

## Before Task 1

- Cut a branch `route-action-board` from `development` at or after `74c3697c4`, the spec commit.
- Work in an isolated worktree, because the main checkout holds someone else's uncommitted `CatchSequence` edits.
  Follow superpowers:using-git-worktrees, or the lead's sparse-worktree recipe: no `public/sprites` except `world` and
  `ui`, with per-package `node_modules` symlinks.
- Tasks 1–7 need no sprites. Task 8's browser check runs after the merge, from a full checkout.

---

### Task 1: Sliding-panel puzzle engine

**Files:**
- Create: `src/game/sliding-puzzle.ts`
- Create: `scripts/sliding-puzzle.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: `RNG` from `src/game/rng.ts`, with `new RNG(seed)` and `rng.pick(array)`.
- Produces:
  - `type PuzzleBoard = readonly number[]` and `interface PuzzleRules { size; slides; minDistance }`;
  - `solvedBoard(size): number[]`, `isSolved(board): boolean`, `neighbours(index, size): number[]`,
    `manhattan(board): number`;
  - `applyMove(board, index): number[] | null` and `applyMoves(board, moves): number[] | null`;
  - `generatePuzzle(seed: string, rules: PuzzleRules): number[]` and `MAX_PUZZLE_MOVES = 500`.

- [ ] **Step 1: Write the failing test**

Create `scripts/sliding-puzzle.test.ts`:

```ts
/** Sliding-panel puzzles: seeded scrambles that are always solvable, legal moves only, and a solved check. */
import {
  applyMove, applyMoves, generatePuzzle, isSolved, manhattan, neighbours, solvedBoard,
} from '../src/game/sliding-puzzle.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rules = { size: 3, slides: 40, minDistance: 10 };

/** For an odd width, a board is reachable from solved exactly when its panels have an even number of inversions. */
function inversions(board: readonly number[]): number {
  const panels = board.filter((v) => v !== 0);
  let n = 0;
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) if (panels[i] > panels[j]) n++;
  return n;
}

check('the solved 3×3 board reads 1–8 with the gap last', same(solvedBoard(3), [1, 2, 3, 4, 5, 6, 7, 8, 0]) && isSolved(solvedBoard(3)));
check('a corner has two neighbours and the centre four', same(neighbours(0, 3).sort(), [1, 3]) && same(neighbours(4, 3).sort(), [1, 3, 5, 7]));
const nearlySolved = [1, 2, 3, 4, 5, 6, 7, 0, 8];
check('a panel next to the gap slides into it', same(applyMove(nearlySolved, 8), solvedBoard(3)));
check('a panel away from the gap cannot move', applyMove(nearlySolved, 0) === null);
check('the gap itself is not a move', applyMove(nearlySolved, 7) === null);
check('out-of-range and fractional indexes are not moves', [-1, 9, 1.5, Number.NaN].every((m) => applyMove(nearlySolved, m) === null));
check('a move leaves its input board unchanged', same(nearlySolved, [1, 2, 3, 4, 5, 6, 7, 0, 8]));
const twoAway = [1, 2, 3, 4, 0, 6, 7, 5, 8];
check('a legal move list replays to solved', isSolved(applyMoves(twoAway, [7, 8]) ?? []));
check('one illegal move voids the whole list', applyMoves(twoAway, [7, 0, 8]) === null);
check('a list that stops short is not solved', !isSolved(applyMoves(twoAway, [7]) ?? solvedBoard(3)));
check('Manhattan distance sums each panel’s rows and columns from home',
  manhattan(solvedBoard(3)) === 0 && manhattan(twoAway) === 2 && manhattan([8, 2, 3, 4, 5, 6, 7, 1, 0]) === 6);

const boards = Array.from({ length: 500 }, (_, i) => generatePuzzle(`seed-${i}`, rules));
check('the same seed scrambles the same board', same(generatePuzzle('seed-7', rules), boards[7]));
check('every scramble holds each panel and the gap once', boards.every((b) => same([...b].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7, 8])));
check('every scramble is solvable', boards.every((b) => inversions(b) % 2 === 0));
check('every scramble is at least distance 10 from solved', boards.every((b) => manhattan(b) >= 10 && !isSolved(b)));
check('scrambles vary from seed to seed', new Set(boards.map((b) => b.join())).size > 450);

console.log(`Sliding puzzle: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx tsx scripts/sliding-puzzle.test.ts`
Expected: FAIL, with `ERR_MODULE_NOT_FOUND` for `src/game/sliding-puzzle.js`.

- [ ] **Step 3: Implement the engine**

Create `src/game/sliding-puzzle.ts`:

```ts
import { RNG } from './rng.js';

// Sliding-panel puzzles: a board is generated from a seed and played one slide at a time.
// Pure: the server generates and verifies, the Puzzle screen plays.

/** Panels in reading order, 1..size²-1, with 0 for the gap. */
export type PuzzleBoard = readonly number[];
export interface PuzzleRules {
  size: number;
  /** Random slides away from the solved board. */
  slides: number;
  /** The scramble keeps sliding until it is at least this far from solved. */
  minDistance: number;
}

/** The longest move list a solve may send. */
export const MAX_PUZZLE_MOVES = 500;
// A bound on the extra slides that push a scramble out to its minimum distance.
const EXTRA_SLIDES = 400;

export function solvedBoard(size: number): number[] {
  return Array.from({ length: size * size }, (_, i) => (i === size * size - 1 ? 0 : i + 1));
}

export function isSolved(board: PuzzleBoard): boolean {
  return board.every((value, i) => value === (i === board.length - 1 ? 0 : i + 1));
}

const widthOf = (board: PuzzleBoard): number => Math.round(Math.sqrt(board.length));

/** Board indexes next to `index`: up, down, left, right. */
export function neighbours(index: number, size: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const out: number[] = [];
  if (row > 0) out.push(index - size);
  if (row < size - 1) out.push(index + size);
  if (col > 0) out.push(index - 1);
  if (col < size - 1) out.push(index + 1);
  return out;
}

/** Each panel's row and column distance from its solved place, summed. */
export function manhattan(board: PuzzleBoard): number {
  const size = widthOf(board);
  let total = 0;
  board.forEach((value, i) => {
    if (value === 0) return;
    const home = value - 1;
    total += Math.abs(Math.floor(i / size) - Math.floor(home / size)) + Math.abs((i % size) - (home % size));
  });
  return total;
}

/** Slide the panel at `index` into the gap; null when it isn't next to the gap. */
export function applyMove(board: PuzzleBoard, index: number): number[] | null {
  const gap = board.indexOf(0);
  if (!neighbours(gap, widthOf(board)).includes(index)) return null;
  const next = [...board];
  next[gap] = next[index];
  next[index] = 0;
  return next;
}

/** Every move in order; null as soon as one is illegal. */
export function applyMoves(board: PuzzleBoard, moves: readonly number[]): number[] | null {
  let current: number[] | null = [...board];
  for (const move of moves) {
    current = applyMove(current, move);
    if (!current) return null;
  }
  return current;
}

/** A solvable scramble: legal slides from the solved board, never undoing the slide before. */
export function generatePuzzle(seed: string, rules: PuzzleRules): number[] {
  const rng = new RNG(seed);
  let board = solvedBoard(rules.size);
  let previousGap = -1;
  const slide = () => {
    const gap = board.indexOf(0);
    // The panel that just moved now sits where the gap was; sliding it back would undo that move.
    const index = rng.pick(neighbours(gap, rules.size).filter((i) => i !== previousGap));
    board = applyMove(board, index)!;
    previousGap = gap;
  };
  for (let i = 0; i < rules.slides; i++) slide();
  for (let i = 0; i < EXTRA_SLIDES && manhattan(board) < rules.minDistance; i++) slide();
  return board;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx tsx scripts/sliding-puzzle.test.ts`
Expected: `Sliding puzzle: 17 passed, 0 failed.` A prototype of this exact code gave 497 distinct boards in 500 seeds,
a minimum distance of 10, and an average of 13.7.

- [ ] **Step 5: Register the test and type-check**

In `package.json`, in the `test` script, replace `tsx scripts/battle-board.test.ts"` with
`tsx scripts/battle-board.test.ts && tsx scripts/sliding-puzzle.test.ts"`.

Run: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/sliding-puzzle.ts scripts/sliding-puzzle.test.ts package.json
git commit -m "Add a seeded sliding-panel puzzle engine that only deals solvable boards"
```

---

### Task 2: Route rules v4 for Wild, Trainer, Explore and Forage, end to end on the server

**Files:**
- Modify: `src/game/route-actions.ts` (types)
- Modify: `src/game/route-rules.ts` (full replacement below)
- Create: `api/_route-error.ts`, `api/_route-finds.ts`
- Modify: `api/_route-actions.ts`, `api/_db.ts`, `api/world/[action].ts`
- Modify: `scripts/route-balance.ts` (full replacement below)
- Modify: `scripts/route-rules.test.ts`, `scripts/route-db.test.ts`, `scripts/route-api.test.ts`
- Modify: `src/components/world/SunnyMeadow.tsx` and `RouteResultView.tsx` (compile fixes only)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - Types:
    - `SearchKind = 'wild' | 'trainer' | 'puzzle' | 'quest' | 'explore' | 'forage'`, `LegacySearchKind = 'npc'`;
    - `QuestId`, `PuzzleScene`, `FoeEntry`, `FoePool`, `ExploreFind`;
    - `RouteRules` (`version: 4`), with the old shape kept as `RouteRulesV3`;
    - `RouteFind.kind` now includes `'nothing'` and `'secret'`, and `RouteFind.questId?`;
    - `RouteEvent.questId?`; `RouteOutcome` now includes `'nothing'`.
  - `rollRouteFind({ seed, kind, honeyTreeFound?, inventory, rules? }): RouteFind` handles `wild`, `trainer`,
    `explore` and `forage`, and throws for the others.
  - `spendAllowance(record, now, rules?, cost = 1)`.
  - `wildAreas(dexId)` lists the wild pool, the Explore rares and the honey-tree species.
  - Server:
    - `commitFind(tx, { uid, kind, party, inventory, now }): Promise<RouteEvent>` in `api/_route-finds.ts`;
    - `RouteError` and `fail` in `api/_route-error.ts`;
    - `readRouteQuests(db, uid): Promise<{ questId: string; acceptedAt: number; claimedAt: number | null }[]>` in
      `api/_db.ts`.
  - Balance:
    - `routeOpponents(): Opponent[]`;
    - `measureRouteBalance(samples, opponents): BalanceRow[]`, where `BalanceRow = { dexId; name; wins: Record<string, number> }`;
    - `balanceFailures(rows, opponents): string[]`.

- [ ] **Step 1: Rewrite the rules tests for v4 (failing)**

In `scripts/route-rules.test.ts`:

(a) Replace the items import with
`import { ballCount, formatMoney, isCaptureBallId, isItemId, itemById, itemQuantity, tradeTotal } from '../src/game/items.js';`.
`VALUABLE_ITEMS` was used only by the v3 Explore block that (d) deletes. Then replace the route-rules imports with:

```ts
import {
  allowanceView, battlePrize, captureChance, guaranteesSupplies, legalChoices, projectAllowance, rollCapture,
  rollRouteFind, ROUTE_RULES, simulateRouteBattle, spendAllowance, wildAreas,
} from '../src/game/route-rules.js';
import type { CaptureBallId, InventoryState, RouteRules, RouteRulesV2, RouteRulesV3 } from '../src/game/route-actions.js';
import { balanceFailures, measureRouteBalance, routeOpponents } from './route-balance.js';
```

(b) Replace the whole `legacyRulesV2()` function with:

```ts
/** The rules frozen into encounters started under the market (v3), before the action board. */
function legacyRulesV3(): RouteRulesV3 {
  return {
    version: 3, capacity: 48, initialActions: 12, refillEveryMs: 600_000, starterBalls: 20,
    wild: { min: 2, max: 5, statMult: 0.6, pool: [...ROUTE_RULES.wild.pool, { dexId: 133, weight: 1, rare: true }] },
    recommended: { min: 3, max: 8 }, wildExp: 30, trainerExp: 50, trainerLevel: 5, trainerStatMult: 0.6,
    npcTrainerChance: 0.7, exploreWildChance: 0.45, exploreNpcChance: 0.3, landmarkChance: 0.5,
    pokeBundleQuantity: 3, greatBundleQuantity: 1, questGreatBalls: 3,
    basicCatchChance: 0.6, rareCatchChance: 0.35, battleCatchBonus: 0.2, greatCatchBonus: 0.2, maxCatchChance: 0.95,
    itemFinds: { poke: 50, great: 15, harvest: 20, pouch: 15 },
    harvest: [{ itemId: 'honey', weight: 6 }, { itemId: 'tiny-mushroom', weight: 3 }, { itemId: 'big-mushroom', weight: 1 }],
    pouchMoney: 300, wildMoney: 100, trainerMoney: 200, questMoney: 500,
  };
}
/** A rules value frozen before the market: the v3 fields are absent. */
function legacyRulesV2(): RouteRulesV2 {
  const rest: Partial<RouteRulesV3> = legacyRulesV3();
  delete rest.itemFinds; delete rest.harvest; delete rest.pouchMoney;
  delete rest.wildMoney; delete rest.trainerMoney; delete rest.questMoney;
  return { ...(rest as Omit<RouteRulesV3, 'itemFinds' | 'harvest' | 'pouchMoney' | 'wildMoney' | 'trainerMoney' | 'questMoney' | 'version'>), version: 2, pokeBundleChance: 0.75 };
}
```

(c) After the line `check('projection and spend leave their input unchanged', ...);`, add:

```ts
check('a spend can cost more than one action', same(spendAllowance({ available: 3, refilledAt: 1_000 }, 2_000, ROUTE_RULES, 2), { available: 1, refilledAt: 1_000 }));
```

(d) Delete everything from the line `const stocked: InventoryState = { revision: 1, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }] };`
through the line `check('shiny identity is frozen in the view and mint', shiny.foe?.view.shiny === true && shiny.foe.mint.shiny && !shiny.foe.mint.altColor);`,
both lines included. Put this block in its place:

```ts
const stocked: InventoryState = { revision: 1, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }] };
const findBase = { inventory: stocked };
const wild = rollRouteFind({ ...findBase, seed: 'test-0', kind: 'wild' });
check('seeded wild retains a complete individual, including emotion and unhandicapped stats', same(wild.foe?.mint, {
  dexId: 401, level: 2, sign: 'cancer', ability: 'swarm', shiny: false, altColor: false, emotion: 'Normal',
  stats: { hp: 3, atk: 2, eatk: 2, def: 3, edef: 4, spd: 2 },
}));
check('the public foe view carries the frozen sign', wild.foe?.view.sign === 'cancer');
check('same search seed replays exactly', same(wild, rollRouteFind({ ...findBase, seed: 'test-0', kind: 'wild' })));
check('rules v4 keep wild rolls on the version 2 stream', wild.foe?.mint.dexId === 401 && wild.foe.mint.level === 2);
const wilds = Array.from({ length: 2000 }, (_, i) => rollRouteFind({ ...findBase, seed: `wild-${i}`, kind: 'wild' }));
check('wild searches meet only the common pool, without Eevee', wilds.every((f) => f.kind === 'wild'
  && ROUTE_RULES.wild.pool.some((e) => e.dexId === f.foe?.mint.dexId) && f.foe?.mint.dexId !== 133 && f.foe?.view.rare !== true));

const trainerDex: Record<string, number> = { 'meadow-scout': 16, youngster: 263, lass: 191, 'bug-catcher': 401 };
const trainers = Array.from({ length: 200 }, (_, i) => rollRouteFind({ ...findBase, seed: `trainer-${i}`, kind: 'trainer' }));
check('a trainer search always meets a trainer with their own Pokémon at hidden level 5, ×0.6', trainers.every((f) => f.kind === 'trainer'
  && f.npc !== null && f.foe?.mint.dexId === trainerDex[f.npc.id] && f.foe?.mint.level === 5 && f.foe?.statMult === 0.6 && f.foe?.view.rare === false));
check('all four trainers turn up', new Set(trainers.map((f) => f.npc?.id)).size === 4);

const forage = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `forage-${i}`, kind: 'forage' }));
const forageShare = (itemId: string) => forage.filter((f) => f.items[0]?.itemId === itemId).length / forage.length;
check('forage always finds exactly one meadow good and no ₽', forage.every((f) => f.kind === 'item' && f.items.length === 1 && f.items[0].quantity === 1 && f.money === 0 && f.foe === null));
check('forage finds Honey 60%, Tiny Mushroom 30%, Big Mushroom 10% within 3 points',
  Math.abs(forageShare('honey') - 0.6) < 0.03 && Math.abs(forageShare('tiny-mushroom') - 0.3) < 0.03 && Math.abs(forageShare('big-mushroom') - 0.1) < 0.03);

const exploreOnly = (weights: Partial<RouteRules['explore']>): RouteRules => ({ ...ROUTE_RULES, explore: { nothing: 0, item: 0, rare: 0, secret: 0, ...weights } });
const nothing = rollRouteFind({ ...findBase, seed: 'quiet', kind: 'explore', rules: exploreOnly({ nothing: 1 }) });
check('Explore can find nothing at all', nothing.kind === 'nothing' && nothing.items.length === 0 && nothing.money === 0 && nothing.foe === null && nothing.npc === null);
const secret = rollRouteFind({ ...findBase, seed: 'secret', kind: 'explore', rules: exploreOnly({ secret: 1 }) });
check('Explore can uncover the Honey Tree', secret.kind === 'secret' && secret.questId === 'honey-tree' && secret.foe === null);
const afterTree = rollRouteFind({ ...findBase, seed: 'secret', kind: 'explore', honeyTreeFound: true, rules: exploreOnly({ secret: 1 }) });
check('once the Honey Tree is found its share goes to rare Pokémon', afterTree.kind === 'wild' && afterTree.foe?.view.rare === true);
const rares = Array.from({ length: 300 }, (_, i) => rollRouteFind({ ...findBase, seed: `rare-${i}`, kind: 'explore', rules: exploreOnly({ rare: 1 }) }));
check('Explore rares are Eevee, Pikachu or Ralts, marked rare, hidden level 2–5 at ×0.6', rares.every((f) => f.kind === 'wild'
  && [133, 25, 280].includes(f.foe?.mint.dexId ?? 0) && f.foe?.view.rare === true && (f.foe?.mint.level ?? 0) >= 2 && (f.foe?.mint.level ?? 9) <= 5 && f.foe?.statMult === 0.6));
check('every Explore rare turns up', new Set(rares.map((f) => f.foe?.mint.dexId)).size === 3);
const finds = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `items-${i}`, kind: 'explore', rules: exploreOnly({ item: 1 }) }));
const findShare = (test: (f: (typeof finds)[number]) => boolean) => finds.filter(test).length / finds.length;
check('rare items are 2 Great Balls 50%, a Big Mushroom 30%, a ₽500 pouch 20% within 3 points',
  Math.abs(findShare((f) => same(f.items, [{ itemId: 'great', quantity: 2 }]) && f.money === 0) - 0.5) < 0.03
  && Math.abs(findShare((f) => same(f.items, [{ itemId: 'big-mushroom', quantity: 1 }]) && f.money === 0) - 0.3) < 0.03
  && Math.abs(findShare((f) => f.items.length === 0 && f.money === 500) - 0.2) < 0.03);
const explores = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `explore-${i}`, kind: 'explore' }));
const exploreShare = (kind: string) => explores.filter((f) => f.kind === kind).length / explores.length;
check('Explore finds nothing 35%, an item 35%, a rare 20%, the secret 10% within 3 points',
  Math.abs(exploreShare('nothing') - 0.35) < 0.03 && Math.abs(exploreShare('item') - 0.35) < 0.03
  && Math.abs(exploreShare('wild') - 0.2) < 0.03 && Math.abs(exploreShare('secret') - 0.1) < 0.03);
check('Explore records no landmarks under rules v4', explores.every((f) => f.landmarks.length === 0));
const broke: InventoryState = { revision: 2, money: 199, stacks: [] };
const resupply = rollRouteFind({ ...findBase, inventory: broke, seed: 'test-3', kind: 'explore' });
check('no balls and under ₽200 guarantees three Poké Balls', resupply.kind === 'item' && same(resupply.items, [{ itemId: 'poke', quantity: 3 }]) && resupply.money === 0);
check('no balls but ₽200 explores as usual', same(rollRouteFind({ ...findBase, inventory: { ...broke, money: 200 }, seed: 'test-3', kind: 'explore' }), rollRouteFind({ ...findBase, seed: 'test-3', kind: 'explore' })));
check('guarantee helper needs both no balls and under one ball’s price', guaranteesSupplies(broke) && !guaranteesSupplies({ ...broke, money: 200 }) && !guaranteesSupplies({ ...broke, stacks: [{ itemId: 'poke', quantity: 1 }] }));
check('valuables do not count as capture supplies', ballCount({ revision: 1, money: 0, stacks: [{ itemId: 'honey', quantity: 9 }] }) === 0);
check('a single Great Ball is enough to explore as usual', same(rollRouteFind({ ...findBase, inventory: { revision: 2, money: 0, stacks: [{ itemId: 'great', quantity: 1 }] }, seed: 'test-3', kind: 'explore' }), rollRouteFind({ ...findBase, seed: 'test-3', kind: 'explore' })));
check('an empty Bag does not turn a wild search into supplies', rollRouteFind({ ...findBase, inventory: { revision: 2, money: 0, stacks: [] }, seed: 'test-3', kind: 'wild' }).kind === 'wild');
const alt = rollRouteFind({ ...findBase, seed: 'test-13', kind: 'wild' });
check('alternate identity is frozen in the view and mint', alt.foe?.view.altColor === true && alt.foe.mint.altColor && !alt.foe.mint.shiny);
const shiny = rollRouteFind({ ...findBase, seed: 'test-1248', kind: 'wild' });
check('shiny identity is frozen in the view and mint', shiny.foe?.view.shiny === true && shiny.foe.mint.shiny && !shiny.foe.mint.altColor);
```

(e) Replace the prize checks:

```ts
check('wild and trainer wins pay ₽100 and ₽200 under rules v3', battlePrize('wild', ROUTE_RULES) === 100 && battlePrize('trainer', ROUTE_RULES) === 200 && battlePrize('researcher', ROUTE_RULES) === 0);
```

with:

```ts
check('rules v4 pay ₽0 for a wild win and ₽200 for a trainer win', battlePrize('wild', ROUTE_RULES) === 0 && battlePrize('trainer', ROUTE_RULES) === 200 && battlePrize('researcher', ROUTE_RULES) === 0);
check('encounters frozen under rules v3 still pay ₽100 and ₽200', battlePrize('wild', legacyRulesV3()) === 100 && battlePrize('trainer', legacyRulesV3()) === 200);
```

(f) In the Pokédex-area loop, replace
`rollRouteFind({ seed: \`area-${i}\`, kind: 'wild', knownLandmarks: [], questClaimed: true, inventory: { revision: 0, money: 0, stacks: [{ itemId: 'poke', quantity: 5 }] } })`
with `rollRouteFind({ seed: \`area-${i}\`, kind: 'wild', inventory: { revision: 0, money: 0, stacks: [{ itemId: 'poke', quantity: 5 }] } })`.
Then replace the line `check('a species that never spawns has no wild area', wildAreas(25).length === 0 && !spawned.has(25));` with:

```ts
check('Explore rares and honey-tree species are listed under Sunny Meadow with their rarity',
  ([[133, true], [25, true], [280, true], [415, false], [412, false], [214, true], [446, true]] as const)
    .every(([dexId, rare]) => same(wildAreas(dexId), [{ name: 'Route 1 · Sunny Meadow', rare }])));
check('a species that never spawns has no wild area', wildAreas(150).length === 0);
```

(g) Replace the closing balance loop

```ts
for (const row of measureRouteBalance()) {
  check(`${row.name} fresh starter wins ≥75% weighted wild / ≥60% each trainer over 200 seeds`, row.wild >= 75 && row.scout >= 60 && row.youngster >= 60);
}
```

with:

```ts
const opponents = routeOpponents();
const shortfalls = balanceFailures(measureRouteBalance(200, opponents), opponents);
check(`every fresh starter wins ≥75% against wild Pokémon and ≥60% against every other Route 1 opponent over 200 seeds${shortfalls.length ? `: ${shortfalls.join('; ')}` : ''}`, shortfalls.length === 0);
```

- [ ] **Step 2: Run the rules test and confirm it fails**

Run: `npx tsx scripts/route-rules.test.ts`
Expected: it fails, most likely with a missing export (`routeOpponents` / `balanceFailures`) or with v4 checks failing.

- [ ] **Step 3: Update the shared types**

In `src/game/route-actions.ts`:

(a) Replace

```ts
export type SearchKind = 'wild' | 'npc' | 'explore';
export type RoutePhase = 'wild' | 'catch' | 'trainer' | 'researcher' | 'resolved';
export type RouteChoice = 'battle' | 'catch' | 'leave' | 'accept' | 'decline' | 'talk';
export type RouteOutcome = 'caught' | 'escaped' | 'won' | 'lost' | 'left' | 'talked' | 'accepted' | 'found';
```

with

```ts
/** The six cards on the Sunny Meadow board. */
export type SearchKind = 'wild' | 'trainer' | 'puzzle' | 'quest' | 'explore' | 'forage';
/** Find NPC, retired by rules v4: only events stored under rules v2 and v3 carry it. */
export type LegacySearchKind = 'npc';
export type QuestId = 'meadow-survey' | 'honey-tree';
export type PuzzleScene = 'tall-grass' | 'sunflowers' | 'signpost' | 'hilltop-oak';
export type RoutePhase = 'wild' | 'catch' | 'trainer' | 'researcher' | 'resolved';
export type RouteChoice = 'battle' | 'catch' | 'leave' | 'accept' | 'decline' | 'talk';
export type RouteOutcome = 'caught' | 'escaped' | 'won' | 'lost' | 'left' | 'talked' | 'accepted' | 'found' | 'nothing';
```

(b) In `RouteNpc`, replace `id: 'meadow-scout' | 'youngster' | 'researcher';` with
`id: 'meadow-scout' | 'youngster' | 'lass' | 'bug-catcher' | 'researcher';`.

(c) Replace the whole `export interface RouteRules extends Omit<RouteRulesV2, ...> { ... }` block and the
`export type StoredRouteRules = RouteRules | RouteRulesV2;` line with:

```ts
/** Rules frozen into encounters started under the market, before the action board. Read-only. */
export interface RouteRulesV3 extends Omit<RouteRulesV2, 'version' | 'pokeBundleChance'> {
  version: 3;
  /** Weights inside an Explore item find. */
  itemFinds: { poke: number; great: number; harvest: number; pouch: number };
  /** Ordered weights for one harvest good. */
  harvest: readonly { itemId: ValuableId; weight: number }[];
  pouchMoney: number;
  wildMoney: number;
  trainerMoney: number;
  questMoney: number;
}
/** One species in a foe pool; `statMult` overrides the pool's handicap for that species. */
export interface FoeEntry { dexId: number; weight: number; rare?: boolean; statMult?: number }
/** Weighted species at a hidden level range and battle handicap. */
export interface FoePool { min: number; max: number; statMult: number; pool: readonly FoeEntry[] }
/** One Explore item find, with its weight among them. */
export interface ExploreFind { items: ItemGrant[]; money: number; weight: number }
/** The live rules: the action board. */
export interface RouteRules {
  version: 4;
  capacity: number;
  initialActions: number;
  refillEveryMs: number;
  starterBalls: number;
  /** Actions each card's search spends. */
  costs: Record<SearchKind, number>;
  wild: FoePool;
  recommended: LevelRange;
  wildExp: number;
  trainerExp: number;
  trainerLevel: number;
  trainerStatMult: number;
  wildMoney: number;
  trainerMoney: number;
  /** Weights of Explore's outcomes. Once the Honey Tree is found, `secret` joins `rare`. */
  explore: { nothing: number; item: number; rare: number; secret: number };
  exploreItems: readonly ExploreFind[];
  exploreRares: FoePool;
  honeyTree: FoePool;
  forage: readonly { itemId: ValuableId; weight: number }[];
  puzzle: {
    size: number;
    /** Random slides away from the solved board. */
    slides: number;
    /** Scrambles keep sliding until at least this Manhattan distance from solved. */
    minDistance: number;
    scenes: readonly PuzzleScene[];
    rewards: readonly { items: ItemGrant[]; weight: number }[];
  };
  /** Explore's free Poké Balls when the Bag is empty and the trainer can't buy one. */
  pokeBundleQuantity: number;
  questGreatBalls: number;
  questMoney: number;
  basicCatchChance: number;
  rareCatchChance: number;
  battleCatchBonus: number;
  greatCatchBonus: number;
  maxCatchChance: number;
}
export type StoredRouteRules = RouteRules | RouteRulesV3 | RouteRulesV2;
```

(d) Replace the `RouteFind` interface with:

```ts
export interface RouteFind {
  kind: 'wild' | 'trainer' | 'researcher' | 'item' | 'nothing' | 'secret';
  foe: FrozenRouteFoe | null;
  npc: RouteNpc | null;
  items: ItemGrant[];
  money: number;
  landmarks: string[];
  /** The quest a find belongs to: the survey's steps, or the Honey Tree. */
  questId?: QuestId;
}
```

(e) In `RouteEvent`, replace `searchKind: SearchKind;` with `searchKind: SearchKind | LegacySearchKind;`, and
`rulesVersion: 2 | 3;` with `rulesVersion: 2 | 3 | 4;`. After the line `newLandmarks: string[];`, add:

```ts
  /** The quest this encounter belongs to; absent on encounters saved before quests had steps. */
  questId?: QuestId;
```

- [ ] **Step 4: Replace the rules module**

Replace the whole of `src/game/route-rules.ts` with:

```ts
import type { OwnedMon } from './box.js';
import type {
  ActionAllowance, AllowanceRecord, CaptureBallId, FoePool, FrozenRouteFoe, InventoryState,
  RouteBattle, RouteChoice, RouteFind, RouteNpc, RoutePhase, RouteRules, SearchKind, StoredRouteRules,
} from './route-actions.js';
import { partyCreatures } from './activity.js';
import { simulateBattle } from './battle.js';
import { ownedMonToCreature } from './box.js';
import { currentHp, isFainted, ownedMaxHp } from './health.js';
import { mintStats } from './growth.js';
import { rollIdentity } from './identity.js';
import { ballCount, isCaptureBallId, itemById } from './items.js';
import { meterView, projectMeter, spendMeter, type MeterRules } from './meter.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { RNG } from './rng.js';
import { placeById, placeTitle } from './world.js';

/** Live route rules: the action board. Encounters keep the rules they were created under. */
export const ROUTE_RULES: RouteRules = {
  version: 4,
  capacity: 48,
  initialActions: 12,
  refillEveryMs: 600_000,
  starterBalls: 20,
  costs: { wild: 1, trainer: 1, puzzle: 1, quest: 1, explore: 1, forage: 1 },
  wild: {
    min: 2, max: 5, statMult: 0.6,
    pool: [
      { dexId: 161, weight: 3 },
      { dexId: 263, weight: 3 },
      { dexId: 16, weight: 3 },
      { dexId: 19, weight: 3 },
      { dexId: 187, weight: 2 },
      { dexId: 191, weight: 2 },
      { dexId: 401, weight: 2 },
      { dexId: 399, weight: 2 },
    ],
  },
  recommended: { min: 3, max: 8 },
  wildExp: 30,
  trainerExp: 50,
  trainerLevel: 5,
  trainerStatMult: 0.6,
  wildMoney: 0,
  trainerMoney: 200,
  explore: { nothing: 35, item: 35, rare: 20, secret: 10 },
  exploreItems: [
    { items: [{ itemId: 'great', quantity: 2 }], money: 0, weight: 5 },
    { items: [{ itemId: 'big-mushroom', quantity: 1 }], money: 0, weight: 3 },
    { items: [], money: 500, weight: 2 },
  ],
  exploreRares: {
    min: 2, max: 5, statMult: 0.6,
    pool: [
      { dexId: 133, weight: 2, rare: true },
      { dexId: 25, weight: 2, rare: true },
      { dexId: 280, weight: 1, rare: true },
    ],
  },
  honeyTree: {
    min: 2, max: 5, statMult: 0.6,
    pool: [
      { dexId: 415, weight: 5 },
      { dexId: 412, weight: 3 },
      // At ×0.6 a lone Lotad beat Heracross in under a third of fights; at ×0.45 every starter wins 72% or more.
      { dexId: 214, weight: 1, rare: true, statMult: 0.45 },
      { dexId: 446, weight: 1, rare: true },
    ],
  },
  forage: [
    { itemId: 'honey', weight: 6 },
    { itemId: 'tiny-mushroom', weight: 3 },
    { itemId: 'big-mushroom', weight: 1 },
  ],
  puzzle: {
    size: 3, slides: 40, minDistance: 10,
    scenes: ['tall-grass', 'sunflowers', 'signpost', 'hilltop-oak'],
    rewards: [
      { items: [{ itemId: 'great', quantity: 1 }], weight: 40 },
      { items: [{ itemId: 'poke', quantity: 3 }], weight: 30 },
      { items: [{ itemId: 'tiny-mushroom', quantity: 1 }], weight: 20 },
      { items: [{ itemId: 'big-mushroom', quantity: 1 }], weight: 10 },
    ],
  },
  pokeBundleQuantity: 3,
  questGreatBalls: 3,
  questMoney: 500,
  basicCatchChance: 0.6,
  rareCatchChance: 0.35,
  battleCatchBonus: 0.2,
  greatCatchBonus: itemById('great')!.catchBonus,
  maxCatchChance: 0.95,
};

// Wild and trainer finds stay on the version 2 stream: a wild search rolls as it did under v2 and v3.
const STREAM = 'route:2';
// Finds new in rules v4 (Explore's outcomes, Forage, puzzles, the Honey Tree) roll on their own stream.
const STREAM_V4 = 'route:4';

/** Weighted pick over entries in their listed order. */
function pickWeighted<T extends { weight: number }>(entries: readonly T[], rng: RNG): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

/** Explore's free resupply: no capture balls and not enough ₽ to buy one. */
export function guaranteesSupplies(inventory: InventoryState): boolean {
  return ballCount(inventory) === 0 && inventory.money < (itemById('poke')?.price.buy ?? 0);
}

/** ₽ a won battle pays under the encounter's frozen rules; v2 encounters pay nothing. */
export function battlePrize(kind: RouteFind['kind'], rules: StoredRouteRules): number {
  if (rules.version === 2) return 0;
  return kind === 'wild' ? rules.wildMoney : kind === 'trainer' ? rules.trainerMoney : 0;
}

export const MEADOW_LANDMARKS = [
  { id: 'signpost', name: 'Old Signpost', blurb: 'Weathered arrows point to places you haven’t been yet.' },
  { id: 'sunflowers', name: 'Sunflower Patch', blurb: 'Sunkern doze between stalks taller than you.' },
  { id: 'hilltop-oak', name: 'Hilltop Oak', blurb: 'The oldest tree on the route, full of Pidgey nests.' },
] as const;

const TRAINERS: readonly (RouteNpc & { dexId: number })[] = [
  {
    id: 'meadow-scout', name: 'Meadow Scout', spriteKey: 'random-frlg-bird-keeper', dexId: 16,
    text: 'Pidgey and I know every breeze in this meadow. Would you like to practice with us?',
  },
  {
    id: 'youngster', name: 'Youngster', spriteKey: 'random-youngster', dexId: 263,
    text: 'Zigzagoon found another shortcut! We have time for a friendly battle if you do.',
  },
  {
    id: 'lass', name: 'Lass', spriteKey: 'random-lass', dexId: 191,
    text: 'My Sunkern finally woke up in the sunflower patch. Will you battle us before it dozes off again?',
  },
  {
    id: 'bug-catcher', name: 'Bug Catcher', spriteKey: 'random-frlg-bug-catcher', dexId: 401,
    text: 'Kricketot has been practicing its song all morning. Want to hear how it battles?',
  },
];

/** Where a species lives in the wild today: the live route's pools only, never the retired idle routes. */
export function wildAreas(dexId: number, rules: RouteRules = ROUTE_RULES): { name: string; rare: boolean }[] {
  const entries = [rules.wild, rules.exploreRares, rules.honeyTree].flatMap((pool) => pool.pool.filter((entry) => entry.dexId === dexId));
  const place = placeById('r1');
  return entries.length > 0 && place ? [{ name: placeTitle(place), rare: entries.every((entry) => Boolean(entry.rare)) }] : [];
}

const allowanceMeter = (rules: RouteRules): MeterRules => ({ capacity: rules.capacity, refillEveryMs: rules.refillEveryMs, floor: 0 });

/** Read-only projection. At capacity there is no banked overflow or partial interval. */
export function projectAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): AllowanceRecord {
  return projectMeter(record, now, allowanceMeter(rules));
}

export function allowanceView(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES): ActionAllowance {
  return meterView(record, now, allowanceMeter(rules));
}

/** A transaction persists this projection together with its new encounter. */
export function spendAllowance(record: AllowanceRecord, now: number, rules: RouteRules = ROUTE_RULES, cost = 1): AllowanceRecord | null {
  return spendMeter(record, now, cost, allowanceMeter(rules));
}

function mintFoe({ dexId, level, rare, statMult, rng }: {
  dexId: number; level: number; rare: boolean; statMult: number; rng: RNG;
}): FrozenRouteFoe {
  const species = CREATURES_BY_ID[String(dexId)];
  if (!species) throw new Error(`Unknown route species ${dexId}`);
  const identity = rollIdentity(species, rng);
  const mint = { dexId, level, ...identity, stats: mintStats(dexId, level, rng, identity.build) };
  return {
    mint,
    view: { dexId, level, shiny: mint.shiny, altColor: mint.altColor, rare, guardian: false, sign: mint.sign },
    statMult,
  };
}

/** A weighted species from `pool` at a level in its range, fighting at its own or the pool's handicap. */
function rollFoe(pool: FoePool, rng: RNG): FrozenRouteFoe {
  const entry = pickWeighted(pool.pool, rng);
  const level = rng.int(pool.min, pool.max);
  return mintFoe({ dexId: entry.dexId, level, rare: Boolean(entry.rare), statMult: entry.statMult ?? pool.statMult, rng });
}

const quiet = (kind: RouteFind['kind'], extra: Partial<RouteFind> = {}): RouteFind =>
  ({ kind, foe: null, npc: null, items: [], money: 0, landmarks: [], ...extra });

function rollExplore(rng: RNG, { honeyTreeFound, inventory, rules }: { honeyTreeFound: boolean; inventory: InventoryState; rules: RouteRules }): RouteFind {
  if (guaranteesSupplies(inventory)) return quiet('item', { items: [{ itemId: 'poke', quantity: rules.pokeBundleQuantity }] });
  const outcomes: { outcome: 'nothing' | 'item' | 'rare' | 'secret'; weight: number }[] = [
    { outcome: 'nothing', weight: rules.explore.nothing },
    { outcome: 'item', weight: rules.explore.item },
    { outcome: 'rare', weight: rules.explore.rare + (honeyTreeFound ? rules.explore.secret : 0) },
    { outcome: 'secret', weight: honeyTreeFound ? 0 : rules.explore.secret },
  ];
  const { outcome } = pickWeighted(outcomes.filter((o) => o.weight > 0), rng);
  if (outcome === 'nothing') return quiet('nothing');
  if (outcome === 'secret') return quiet('secret', { questId: 'honey-tree' });
  if (outcome === 'rare') return { ...quiet('wild'), foe: rollFoe(rules.exploreRares, rng) };
  const { items, money } = pickWeighted(rules.exploreItems, rng);
  return quiet('item', { items: items.map((item) => ({ ...item })), money });
}

/** One seeded find for a search. Events stored under rules v2 and v3 are never re-rolled. */
export function rollRouteFind({ seed, kind, honeyTreeFound = false, inventory, rules = ROUTE_RULES }: {
  seed: string;
  kind: SearchKind;
  /** Explore's secret is the Honey Tree until the trainer finds it. */
  honeyTreeFound?: boolean;
  inventory: InventoryState;
  rules?: RouteRules;
}): RouteFind {
  if (kind === 'wild') return { ...quiet('wild'), foe: rollFoe(rules.wild, new RNG(`${STREAM}:${seed}:find`)) };
  if (kind === 'trainer') {
    const rng = new RNG(`${STREAM}:${seed}:find`);
    const { dexId, ...npc } = rng.pick(TRAINERS);
    return { ...quiet('trainer'), npc, foe: mintFoe({ dexId, level: rules.trainerLevel, rare: false, statMult: rules.trainerStatMult, rng }) };
  }
  if (kind === 'forage') {
    const { itemId } = pickWeighted(rules.forage, new RNG(`${STREAM_V4}:${seed}:forage`));
    return quiet('item', { items: [{ itemId, quantity: 1 }] });
  }
  if (kind === 'explore') return rollExplore(new RNG(`${STREAM_V4}:${seed}:explore`), { honeyTreeFound, inventory, rules });
  throw new Error(`Unsupported search kind ${kind}`);
}

export function legalChoices(phase: RoutePhase): RouteChoice[] {
  switch (phase) {
    case 'wild': return ['battle', 'catch', 'leave'];
    case 'catch': return ['catch', 'leave'];
    case 'trainer': return ['battle', 'leave'];
    case 'researcher': return ['accept', 'decline', 'talk'];
    case 'resolved': return [];
  }
}

export function captureChance({ rare, wonBattle, ballId, rules = ROUTE_RULES }: {
  rare: boolean; wonBattle: boolean; ballId: CaptureBallId; rules?: StoredRouteRules;
}): number {
  if (!isCaptureBallId(ballId)) throw new Error('Unsupported capture ball');
  const base = rare ? rules.rareCatchChance : rules.basicCatchChance;
  // Round the displayed probability so 35% + 20% + 20% remains exactly 75%.
  return Math.min(rules.maxCatchChance, Math.round((base + (wonBattle ? rules.battleCatchBonus : 0)
    + (ballId === 'great' ? rules.greatCatchBonus : 0)) * 10_000) / 10_000);
}

export function rollCapture({ seed, rare, wonBattle, ballId, rules = ROUTE_RULES }: {
  seed: string; rare: boolean; wonBattle: boolean; ballId: CaptureBallId; rules?: StoredRouteRules;
}): boolean {
  return new RNG(`${STREAM}:${seed}:catch`).chance(captureChance({ rare, wonBattle, ballId, rules }));
}

export function simulateRouteBattle({ party, foe, seed }: {
  party: readonly OwnedMon[]; foe: FrozenRouteFoe; seed: string;
}): RouteBattle {
  // Fainted members sit out; the rest fight at the HP they carry.
  const fielded = party.filter((m) => !isFainted(m));
  const player = partyCreatures(fielded);
  const opponent = ownedMonToCreature({ ...foe.mint, id: 'route-foe', exp: 0, origin: 'catch', caughtAt: 0 });
  if (!opponent || player.length === 0 || player.length !== fielded.length) throw new Error('Invalid route battle participants');
  const battle = simulateBattle(player, [opponent], `route:${seed}:battle`, { foeStatMult: foe.statMult, playerStartHp: fielded.map(currentHp) });
  return {
    won: battle.winner === 'player', turns: battle.turns, events: battle.events,
    fielded: fielded.map((m, i) => ({ id: m.id, hp: battle.playerHp[i], maxHp: ownedMaxHp(m) })),
  };
}
```

The old `RESEARCHER` constant is gone on purpose. Find NPC was its only caller, and Task 4 brings it back for the
Quest card's first survey step.

- [ ] **Step 5: Replace the balance script**

Replace the whole of `scripts/route-balance.ts` with:

```ts
/** Fixed-seed first-visit balance: every current starter, alone, against every Route 1 opponent. */
import { pathToFileURL } from 'node:url';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { STARTER_POOL, starterFromOffer } from '../src/game/professions.js';
import { rollRouteFind, ROUTE_RULES, simulateRouteBattle } from '../src/game/route-rules.js';
import type { OwnedMon } from '../src/game/box.js';
import type { FrozenRouteFoe, RouteFind, RouteRules } from '../src/game/route-actions.js';

/** One opponent: the win rate each starter must reach, and its foe for each sample. */
export interface Opponent { label: string; gate: number; foe: (sample: number) => FrozenRouteFoe }
/** Win percentage against each opponent label, for one starter. */
export interface BalanceRow { dexId: number; name: string; wins: Record<string, number> }

const inventory = { revision: 1, money: 0, stacks: [{ itemId: 'poke' as const, quantity: 20 }] };
const rareOnly: RouteRules = { ...ROUTE_RULES, explore: { nothing: 0, item: 0, rare: 1, secret: 0 } };
const speciesName = (dexId: number) => CREATURES_BY_ID[String(dexId)].name;

function starter(dexId: number, sample: number): OwnedMon {
  // Use the production starter offer/mint seam, including the full rolled stats.
  for (let attempt = 0; ; attempt++) {
    const id = `route-balance:${dexId}:${sample}:${attempt}`;
    const mint = starterFromOffer(id, dexId);
    if (mint) return { ...mint, id, exp: 0, origin: 'starter', caughtAt: 0 };
  }
}

/** The first foe over successive seeds that `match` accepts, rolled through the real search rules. */
function firstFoe(prefix: string, roll: (seed: string) => RouteFind, match: (find: RouteFind) => boolean): FrozenRouteFoe {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const find = roll(`${prefix}:${attempt}`);
    if (find.foe && match(find)) return find.foe;
  }
  throw new Error(`No ${prefix} foe in 10,000 seeds`);
}

/** Every opponent a fresh starter can meet on Route 1, with the win rate it must reach. */
export function routeOpponents(): Opponent[] {
  return [
    { label: 'wild', gate: 75, foe: (i) => rollRouteFind({ seed: `balance-wild:${i}`, kind: 'wild', inventory }).foe! },
    ...['meadow-scout', 'youngster', 'lass', 'bug-catcher'].map((id): Opponent => ({
      label: id, gate: 60,
      foe: (i) => firstFoe(`balance-trainer:${id}:${i}`, (seed) => rollRouteFind({ seed, kind: 'trainer', inventory }), (find) => find.npc?.id === id),
    })),
    ...ROUTE_RULES.exploreRares.pool.map(({ dexId }): Opponent => ({
      label: speciesName(dexId), gate: 60,
      foe: (i) => firstFoe(`balance-rare:${dexId}:${i}`, (seed) => rollRouteFind({ seed, kind: 'explore', inventory, rules: rareOnly }), (find) => find.foe?.view.dexId === dexId),
    })),
  ];
}

export function measureRouteBalance(samples = 200, opponents: readonly Opponent[] = routeOpponents()): BalanceRow[] {
  const foes = opponents.map((opponent) => Array.from({ length: samples }, (_, i) => opponent.foe(i)));
  return STARTER_POOL.map((dexId) => {
    const mons = Array.from({ length: samples }, (_, i) => starter(dexId, i));
    const wins: Record<string, number> = {};
    opponents.forEach((opponent, k) => {
      let won = 0;
      for (let i = 0; i < samples; i++) {
        if (simulateRouteBattle({ party: [mons[i]], foe: foes[k][i], seed: `balance:${dexId}:${opponent.label}:${i}` }).won) won++;
      }
      wins[opponent.label] = (100 * won) / samples;
    });
    return { dexId, name: speciesName(dexId), wins };
  });
}

/** Each starter and opponent pair below its gate, as "Lotad vs Heracross: 58%". */
export function balanceFailures(rows: readonly BalanceRow[], opponents: readonly Opponent[]): string[] {
  return rows.flatMap((row) => opponents.filter((o) => row.wins[o.label] < o.gate).map((o) => `${row.name} vs ${o.label}: ${row.wins[o.label]}%`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opponents = routeOpponents();
  const rows = measureRouteBalance(200, opponents);
  console.log('200 seeds per fresh starter and opponent; lone starters, actual minted stats, no growth between battles.');
  console.table(rows.map((row) => ({ Starter: row.name, ...row.wins })));
  const failures = balanceFailures(rows, opponents);
  console.log(failures.length ? `Balance gate failed: ${failures.join('; ')}.` : 'Every starter passes: wild ≥75%, every other opponent ≥60%.');
  process.exitCode = failures.length ? 1 : 0;
}
```

- [ ] **Step 6: Run the rules test and the balance table**

Run: `npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-balance.ts`
Expected: `Route rules: N passed, 0 failed.`, then a table ending in `Every starter passes`.

A pre-plan prototype measured minimum wins of: Lass (Sunkern) 93%, Bug Catcher 94%, Eevee 97%, Pikachu 82% and
Ralts 99%. If a pair still fails, lower that species' handicap in `ROUTE_RULES` by 0.05 with a `statMult` override,
rerun, and note the value in the spec's Balance section.

- [ ] **Step 7: Rewrite the database and API tests for the v4 server (failing)**

In `scripts/route-db.test.ts`:

(a) Add `readRouteQuests` to the `../api/_db.js` import list, and `RouteRulesV3` to the
`../src/game/route-actions.js` type import.

(b) Replace the `forceKind` header and its `rollRouteFind` line:

```ts
async function forceKind(db: Db, uid: string, e: RouteEvent, kind: 'wild' | 'trainer' | 'researcher' | 'item', seedPrefix = 'fixture') {
```

```ts
    const find = rollRouteFind({ seed, kind: kind === 'wild' ? 'wild' : kind === 'item' ? 'explore' : 'npc', knownLandmarks: [], questClaimed: false, inventory: { revision: 0, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }] } });
```

with

```ts
async function forceKind(db: Db, uid: string, e: RouteEvent, kind: 'wild' | 'trainer' | 'item', seedPrefix = 'fixture') {
```

```ts
    const find = rollRouteFind({ seed, kind: kind === 'item' ? 'forage' : kind, inventory: { revision: 0, money: 0, stacks: [{ itemId: 'poke', quantity: 20 }] } });
```

(c) After the `leave` helper, add:

```ts
/** Explore until `want` accepts the find. The seed is random, so refill the bank and keep exploring. */
async function exploreUntil(db: Db, uid: string, want: (e: RouteEvent) => boolean, tries = 400): Promise<RouteEvent> {
  for (let i = 0; i < tries; i++) {
    await writeRouteAllowance(db, uid, 48, T);
    const e = (await start(db, uid, 'explore')).event!;
    if (want(e)) return e;
    if (e.phase !== 'resolved') await leave(db, uid, e);
  }
  throw new Error('Explore never produced the wanted find');
}
```

(d) Make these replacements:
- `searchRoute(db, 'u1', { ...input, kind: 'npc' }, T), 409);` becomes `searchRoute(db, 'u1', { ...input, kind: 'trainer' }, T), 409);`
- These two lines:
  ```ts
  const researcher = await forceKind(db, 'u1', (await start(db, 'u1', 'npc')).event!, 'researcher');
  await chooseRoute(db, 'u1', { requestId: rid(), eventId: researcher.event.id, expectedRevision: 0, choice: 'accept' }, T);
  ```
  become the single line `await acceptRouteQuest(db, 'u1', 'meadow-survey', T);`
- `(await start(db, 'u1', 'npc')).event!, 'trainer');` becomes `(await start(db, 'u1', 'trainer')).event!, 'trainer');`
- `check('a wild win pays ₽100 once across retries', wildWon.event?.outcome === 'won' && wildWon.event.money === 100 && await moneyOf(db, 'u1') === beforeWild + 100);`
  becomes
  `check('a wild win pays no ₽ under rules v4, even on a retry', wildWon.event?.outcome === 'won' && wildWon.event.money === 0 && await moneyOf(db, 'u1') === beforeWild);`
- `check('a win with a fainted member still pays the full ₽100 alongside the saved damage', tradeWin.event!.money === 100 && await moneyOf(db, 'hp') === beforeTrade + 100`
  becomes
  `check('a win with a fainted member saves the damage and pays the v4 wild prize of ₽0', tradeWin.event!.money === 0 && await moneyOf(db, 'hp') === beforeTrade`
- These lines:
  ```ts
  // A trainer's Pokémon counts as seen, like a wild one. The seed is random, so search until a trainer shows.
  ```
  ```ts
  let met: RouteEvent | null = null;
  for (let i = 0; i < 12 && !met; i++) {
    const found = (await start(db, 'sightings', 'npc')).event!;
    if (found.kind === 'trainer') met = found;
    else if (found.phase !== 'resolved') await leave(db, 'sightings', found);
  }
  ```
  become
  ```ts
  // A trainer's Pokémon counts as seen, like a wild one.
  ```
  ```ts
  const met: RouteEvent | null = (await start(db, 'sightings', 'trainer')).event ?? null;
  ```

(e) After the existing rules-v2 frozen block, which ends with
`if (frozenWon.event?.phase !== 'resolved') await leave(db, 'u1', frozenWon.event!);`, add:

```ts
  const v3 = await forceKind(db, 'u1', (await start(db, 'u1')).event!, 'wild');
  const v3Row = (await readRouteEvent(db, 'u1', v3.event.id))!;
  await updateRouteEvent(db, 'u1', { ...v3Row, data: { ...v3, config: { ...(v3.config as RouteRules), version: 3, wildMoney: 100 } as unknown as RouteRulesV3, event: { ...v3.event, rulesVersion: 3 } } }, v3Row.revision);
  const beforeV3 = await moneyOf(db, 'u1');
  const v3Won = await chooseRoute(db, 'u1', { requestId: rid(), eventId: v3.event.id, expectedRevision: 0, choice: 'battle' }, T);
  check('an encounter frozen under rules v3 still pays the ₽100 wild prize', v3Won.event?.outcome === 'won' && v3Won.event.money === 100 && await moneyOf(db, 'u1') === beforeV3 + 100);
  if (v3Won.event?.phase !== 'resolved') await leave(db, 'u1', v3Won.event!);
```

(f) Directly above the line `  // Schema invariant itself, independent of domain checks.`, add:

```ts
  console.log('[action board v4: forage, explore, trainers]');
  await onboardUser(db, 'board', 6, 30);
  await activateRoute(db, 'board', 'activate', T);
  const goods = async () => (await loadRouteState(db, 'board', T)).inventory.stacks
    .filter((s) => ['honey', 'tiny-mushroom', 'big-mushroom'].includes(s.itemId)).reduce((sum, s) => sum + s.quantity, 0);
  const foraged = await start(db, 'board', 'forage');
  check('forage spends one action and adds exactly one meadow good, settled at once', foraged.event?.kind === 'item' && foraged.event.searchKind === 'forage'
    && foraged.event.phase === 'resolved' && foraged.event.outcome === 'found' && foraged.state.allowance.available === 11 && await goods() === 1 && foraged.state.inventory.money === 0);
  const quietFind = await exploreUntil(db, 'board', (e) => e.kind === 'nothing');
  const afterQuiet = await loadRouteState(db, 'board', T);
  check('an empty Explore spends its action and grants nothing', quietFind.phase === 'resolved' && quietFind.outcome === 'nothing' && quietFind.items.length === 0 && !quietFind.money
    && afterQuiet.allowance.available === 47 && afterQuiet.activeEvent === null);
  const rareFind = await exploreUntil(db, 'board', (e) => e.kind === 'wild');
  check('an Explore rare is a catchable rare wild Pokémon', rareFind.foe?.rare === true && [133, 25, 280].includes(rareFind.foe.dexId) && rareFind.choices.includes('catch') && rareFind.catchChances?.poke === 0.35);
  await leave(db, 'board', rareFind);
  const treeFind = await exploreUntil(db, 'board', (e) => e.kind === 'secret');
  check('the Honey Tree secret records its quest once, unclaimed', treeFind.questId === 'honey-tree' && treeFind.outcome === 'found'
    && eq((await readRouteQuests(db, 'board')).filter((q) => q.questId === 'honey-tree').map((q) => q.claimedAt), [null]));
  let secretAgain = false;
  for (let i = 0; i < 60; i++) {
    await writeRouteAllowance(db, 'board', 48, T);
    const e = (await start(db, 'board', 'explore')).event!;
    if (e.kind === 'secret') secretAgain = true;
    if (e.phase !== 'resolved') await leave(db, 'board', e);
  }
  check('a found Honey Tree is never found again', !secretAgain);
  const meeting = (await start(db, 'board', 'trainer')).event!;
  check('a trainer search meets a trainer with one Pokémon', meeting.kind === 'trainer' && meeting.phase === 'trainer' && meeting.npc !== null && meeting.foe !== null && meeting.searchKind === 'trainer');
  await leave(db, 'board', meeting);

```

In `scripts/route-api.test.ts`, after the line
`check('array search kind is rejected instead of string-coerced', ...);`, add:

```ts
  const retiredSearch = await call('search', { requestId: 'old-npc', locationId: 'r1', kind: 'npc', partyIds: [s.id] });
  check('a Find NPC search from an old tab is refused with a refresh sentence', retiredSearch.status === 400 && retiredSearch.body.error === 'Sunny Meadow has new actions. Refresh to see them.');
```

Run: `npx tsx scripts/route-db.test.ts; npx tsx scripts/route-api.test.ts`
Expected: FAIL. The server still runs the v3 `rollRouteFind` arguments, and `npc` still gets the generic sentence.

- [ ] **Step 8: Add the shared error module and the finds module**

Create `api/_route-error.ts`:

```ts
/** Known gameplay rejections roll back every part of the command. */
export class RouteError extends Error {
  constructor(public status: number, message: string, public party?: string[]) { super(message); }
}

export const fail = (status: number, message: string): never => { throw new RouteError(status, message); };
```

Create `api/_route-finds.ts`:

```ts
import { randomBytes } from 'node:crypto';
import {
  acceptRouteQuest, changeInventory, changeMoney, dismissPriorRouteEvents, insertDiscovery, insertRouteEvent,
  newId, readRouteQuests, type Executor,
} from './_db.js';
import { fail } from './_route-error.js';
import type { OwnedMon } from '../src/game/box.js';
import { captureChance, legalChoices, rollRouteFind, ROUTE_RULES } from '../src/game/route-rules.js';
import type { InventoryState, RouteEvent, RouteFind, RoutePhase, SearchKind, StoredRouteEvent } from '../src/game/route-actions.js';

/** The phase a find opens in. Finds without a Pokémon or a person settle at once. */
function openingPhase(find: RouteFind): RoutePhase {
  return find.kind === 'wild' || find.kind === 'trainer' || find.kind === 'researcher' ? find.kind : 'resolved';
}

/**
 * One search's find, rolled and persisted with its discoveries, items, ₽ and quest rows inside the search's
 * write transaction. The caller has validated the trainer and party and spent the action.
 */
export async function commitFind(tx: Executor, { uid, kind, party, inventory, now }: {
  uid: string;
  kind: SearchKind;
  party: OwnedMon[];
  inventory: InventoryState;
  now: number;
}): Promise<RouteEvent> {
  const quests = await readRouteQuests(tx, uid);
  const seed = randomBytes(16).toString('hex');
  const find = rollRouteFind({ seed, kind, honeyTreeFound: quests.some((q) => q.questId === 'honey-tree'), inventory, rules: ROUTE_RULES });
  const phase = openingPhase(find);
  const event: RouteEvent = {
    id: newId(), locationId: 'r1', searchKind: kind, kind: find.kind, rulesVersion: ROUTE_RULES.version, revision: 0,
    startedAt: now, resolvedAt: phase === 'resolved' ? now : null, phase, party,
    foe: find.foe?.view ?? null, npc: find.npc, choices: legalChoices(phase),
    catchChances: find.kind === 'wild' && find.foe ? {
      poke: captureChance({ rare: find.foe.view.rare, wonBattle: false, ballId: 'poke', rules: ROUTE_RULES }),
      great: captureChance({ rare: find.foe.view.rare, wonBattle: false, ballId: 'great', rules: ROUTE_RULES }),
    } : null,
    battle: null, members: [], catch: null, items: find.items, newSeen: [], newLandmarks: [],
    outcome: phase !== 'resolved' ? null : find.kind === 'nothing' ? 'nothing' : 'found', money: find.money,
    ...(find.questId ? { questId: find.questId } : {}),
  };
  for (const landmark of find.landmarks) {
    if (await insertDiscovery(tx, { uid, locationId: 'r1', kind: 'landmark', ref: landmark, foundAt: now })) event.newLandmarks.push(landmark);
  }
  // A trainer's Pokémon counts as seen too, as in the games.
  if (find.foe && await insertDiscovery(tx, { uid, locationId: 'r1', kind: 'seen', ref: String(find.foe.view.dexId), foundAt: now })) event.newSeen.push(find.foe.view.dexId);
  for (const item of find.items) {
    if (!await changeInventory(tx, uid, item.itemId, item.quantity)) fail(409, 'Your Bag changed. Check it and try again.');
  }
  if (find.money > 0 && !await changeMoney(tx, uid, find.money)) throw new Error('Balance overflow');
  if (find.kind === 'secret') await acceptRouteQuest(tx, uid, 'honey-tree', now);
  await dismissPriorRouteEvents(tx, uid, now);
  const data: StoredRouteEvent = { event, seed, config: ROUTE_RULES, foe: find.foe };
  await insertRouteEvent(tx, uid, { id: event.id, createdAt: now, revision: 0, active: phase !== 'resolved', seenAt: null, data });
  return event;
}
```

In `api/_db.ts`, directly after the `readRouteQuest` function, add:

```ts
/** Every quest row of one trainer, in one read. */
export async function readRouteQuests(db: Executor, uid: string): Promise<{ questId: string; acceptedAt: number; claimedAt: number | null }[]> {
  const rs = await db.execute({ sql: 'select quest_id, accepted_at, claimed_at from route_quests where user_id = ?', args: [uid] });
  return (rs.rows as unknown as Record<string, unknown>[]).map((r) => ({ questId: String(r.quest_id), acceptedAt: Number(r.accepted_at), claimedAt: nullableNumber(r.claimed_at) }));
}
```

- [ ] **Step 9: Point the command shell at the new modules**

In `api/_route-actions.ts`:

(a) Replace the first import (`import { randomBytes } from 'node:crypto';`) and the whole `./_db.js` import with:

```ts
import {
  acceptRouteQuest, advanceRouteRevision, BOX_LIMIT, changeInventory, changeMoney, countOwned,
  dismissRouteEvent, healAllOwned, hasRouteEvents, insertOwned, insertRouteAccount,
  insertRouteReceipt, markRouteQuestClaimed, openWriteTx, readActiveRouteEvent, readActivity,
  readDiscoveries, readInventoryRows, readLastRouteId, readOpenActivity, readOwnedByIds, readOwnedByUser,
  readProfile, readProgress, readRouteAccount, readRouteEvent, readRouteQuest, readRouteReceipt,
  readUnseenResult, readUnseenRouteEvent, recordCaughtDex, updateOwnedGrowth, updateProfileParty, updateRouteEvent, writeOwnedHp, writeRouteAllowance, writeTravel,
  type Db, type Executor, type RouteAccountRow, type RouteEventRow,
} from './_db.js';
import { fail, RouteError } from './_route-error.js';
import { commitFind } from './_route-finds.js';
```

(b) Replace the route-rules import, the route-actions type import, and the local `RouteError` class and `fail`
constant with:

```ts
import {
  allowanceView, battlePrize, captureChance, legalChoices, MEADOW_LANDMARKS, rollCapture,
  ROUTE_RULES, simulateRouteBattle, spendAllowance,
} from '../src/game/route-rules.js';
import type {
  InventoryState, MarketTradeInput, RouteChooseInput, RouteQuestInput, RouteReply, RouteSearchInput,
  RouteState, RouteTravelInput, SearchKind, StoredRouteEvent,
} from '../src/game/route-actions.js';

export { RouteError };
```

(c) Replace `parseRouteSearch` with:

```ts
/** The cards whose searches the server runs. */
const SEARCH_KINDS: readonly SearchKind[] = ['wild', 'trainer', 'explore', 'forage'];
export function parseRouteSearch(body: Record<string, unknown>): RouteSearchInput | null {
  const partyIds = parsePartyInput(body.partyIds);
  if (!validId(body.requestId) || body.locationId !== 'r1' || !SEARCH_KINDS.includes(body.kind as SearchKind) || !partyIds) return null;
  return { requestId: body.requestId, locationId: 'r1', kind: body.kind as SearchKind, partyIds };
}
```

(d) In `stored()`, replace
`if (!value || (value.config?.version !== 2 && value.config?.version !== 3) || value.event?.id !== row.id)` with
`if (!value || ![2, 3, 4].includes(value.config?.version ?? 0) || value.event?.id !== row.id)`.

(e) Replace the whole `searchRoute` function with:

```ts
export async function searchRoute(db: Db, uid: string, input: RouteSearchInput, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, input.requestId, JSON.stringify(['search', input.locationId, input.kind, input.partyIds]), now, async (tx) => {
    const account = await requireActivated(tx, uid);
    if (input.locationId !== 'r1') fail(400, 'Only Sunny Meadow is available.');
    if (await currentLocation(tx, uid, account) !== input.locationId) fail(400, 'You can only search Sunny Meadow while you’re there.');
    if (await readActiveRouteEvent(tx, uid)) fail(409, 'Finish or leave your current encounter first.');
    const profile = await readProfile(tx, uid);
    if (!profile) return fail(400, 'Finish onboarding first.');
    const owned = await readOwnedByUser(tx, uid);
    const partyIds = resolveParty(profile.party, owned, profile.starterId);
    if (!partyIds.length) fail(400, 'Choose at least one Pokémon for your party.');
    if (!sameParty(partyIds, input.partyIds)) throw new RouteError(409, 'Your party changed. Check it and try again.', partyIds);
    if (partyMembers(partyIds, owned).every(isFainted)) fail(400, 'Your party needs care. Visit the Pokémon Center in Hearth Town.');
    const spent = spendAllowance({ available: account.actions, refilledAt: account.refilledAt }, now, ROUTE_RULES, ROUTE_RULES.costs[input.kind]);
    if (!spent) return fail(409, 'You have no route actions available. Your next action will refill soon.');
    const event = await commitFind(tx, { uid, kind: input.kind, party: partyMembers(partyIds, owned), inventory: await inventoryState(tx, uid), now });
    await writeRouteAllowance(tx, uid, spent.available, spent.refilledAt);
    return { event };
  });
}
```

In `api/world/[action].ts`, replace

```ts
      if (!input) return res.status(400).json({ ok: false, error: 'Choose a Sunny Meadow search and your saved party.' });
```

(the line after `const input = parseRouteSearch(body);`) with

```ts
      // Find NPC left with the action board; a tab opened before that update can still send it.
      if (!input) return res.status(400).json({ ok: false, error: body.kind === 'npc' ? 'Sunny Meadow has new actions. Refresh to see them.' : 'Choose a Sunny Meadow search and your saved party.' });
```

- [ ] **Step 10: Compile fixes on the old meadow screen**

In `src/components/world/SunnyMeadow.tsx`, replace the `npc` entry of `SPOTS` with:

```ts
  { kind: 'trainer', name: 'Meadow path', label: 'Trainer', description: 'Battle a friendly trainer for EXP and ₽200.', action: 'Find a trainer', position: 'left-[62%] top-[33%] h-[30%] w-[34%]' },
```

Replace the Explore entry's description with
`'Anything can happen: a rare Pokémon, a rare item, a secret, or nothing at all.'`, and change
`{entry.kind === 'npc' && <img` to `{entry.kind === 'trainer' && <img`.

In `src/components/world/RouteResultView.tsx`, in `OUTCOME_LABEL`, add `nothing: 'Nothing this time',` after
`found: 'A little discovery!',`.

- [ ] **Step 11: Run the focused checks**

Run:
`npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/route-client.test.ts && npx tsc -b && npx tsc -p tsconfig.api.json && npm run lint`
Expected: every script reports `0 failed`, and tsc and oxlint are clean.

- [ ] **Step 12: Commit**

```bash
git add src/game/route-actions.ts src/game/route-rules.ts api/_route-error.ts api/_route-finds.ts api/_route-actions.ts api/_db.ts "api/world/[action].ts" scripts/route-balance.ts scripts/route-rules.test.ts scripts/route-db.test.ts scripts/route-api.test.ts src/components/world/SunnyMeadow.tsx src/components/world/RouteResultView.tsx
git commit -m "Run Sunny Meadow on route rules v4: trainer, forage and gamble-style Explore searches, and no prize money for wild wins"
```

---

### Task 3: Sliding puzzles on the server

**Files:**
- Modify: `src/game/route-actions.ts`, `src/game/route-rules.ts`
- Modify: `api/_route-finds.ts`, `api/_route-actions.ts`
- Modify: `src/components/world/RouteResultView.tsx` (compile fix)
- Modify: `scripts/route-rules.test.ts`, `scripts/route-db.test.ts`, `scripts/route-api.test.ts`

**Interfaces:**
- Consumes: Task 1's `generatePuzzle`, `applyMoves`, `isSolved`, `MAX_PUZZLE_MOVES`, `applyMove` and `neighbours`, and
  Task 2's `commitFind` and `ROUTE_RULES.puzzle`.
- Produces:
  - `interface PublicPuzzle { size: number; board: number[]; scene: PuzzleScene; reward: ItemGrant[] }`;
  - `RouteEvent.puzzle?` and `RouteFind.puzzle?`;
  - `RoutePhase` now includes `'puzzle'`, `RouteChoice` includes `'solve'`, and `RouteOutcome` includes `'solved'`;
  - `RouteChooseInput.moves?: number[]`;
  - `legalChoices('puzzle')` returns `['solve', 'leave']`.

- [ ] **Step 1: Write the failing puzzle tests**

In `scripts/route-rules.test.ts`, add `import { isSolved } from '../src/game/sliding-puzzle.js';`, and after the
shiny check add:

```ts
const dealt = rollRouteFind({ ...findBase, seed: 'panel-0', kind: 'puzzle' });
check('a puzzle search deals a scrambled 3×3 board, a meadow scene and a reward', dealt.kind === 'puzzle' && dealt.puzzle?.size === 3
  && dealt.puzzle.board.length === 9 && !isSolved(dealt.puzzle.board) && ROUTE_RULES.puzzle.scenes.includes(dealt.puzzle.scene) && dealt.puzzle.reward.length === 1 && dealt.foe === null);
check('the same puzzle seed deals the same board, scene and reward', same(dealt, rollRouteFind({ ...findBase, seed: 'panel-0', kind: 'puzzle' })));
const deals = Array.from({ length: 4000 }, (_, i) => rollRouteFind({ ...findBase, seed: `panel-${i}`, kind: 'puzzle' }).puzzle!);
const rewardShare = (itemId: string, quantity: number) => deals.filter((p) => same(p.reward, [{ itemId, quantity }])).length / deals.length;
check('puzzle rewards are a Great Ball 40%, 3 Poké Balls 30%, a Tiny Mushroom 20%, a Big Mushroom 10% within 3 points',
  Math.abs(rewardShare('great', 1) - 0.4) < 0.03 && Math.abs(rewardShare('poke', 3) - 0.3) < 0.03
  && Math.abs(rewardShare('tiny-mushroom', 1) - 0.2) < 0.03 && Math.abs(rewardShare('big-mushroom', 1) - 0.1) < 0.03);
check('every meadow scene is dealt', new Set(deals.map((p) => p.scene)).size === 4);
check('a puzzle offers a solve or leaving', same(legalChoices('puzzle'), ['solve', 'leave']));
```

In `scripts/route-db.test.ts`, add `import { applyMove, neighbours } from '../src/game/sliding-puzzle.js';`, and
after the `exploreUntil` helper add:

```ts
/** Shortest slides from `board` to solved, by breadth-first search over the 181,440 reachable 3×3 boards. */
function solvePuzzle(board: readonly number[]): number[] {
  const goal = '1,2,3,4,5,6,7,8,0';
  const parent = new Map<string, { from: string; move: number } | null>([[board.join(), null]]);
  const queue = [board.join()];
  for (let head = 0; head < queue.length && !parent.has(goal); head++) {
    const current = queue[head].split(',').map(Number);
    for (const move of neighbours(current.indexOf(0), 3)) {
      const next = applyMove(current, move)!.join();
      if (!parent.has(next)) { parent.set(next, { from: queue[head], move }); queue.push(next); }
    }
  }
  const moves: number[] = [];
  for (let key = goal; parent.get(key); key = parent.get(key)!.from) moves.unshift(parent.get(key)!.move);
  return moves;
}
```

Directly above `  // Schema invariant itself, independent of domain checks.`, add:

```ts
  console.log('[sliding puzzles]');
  await onboardUser(db, 'puzzler', 6, 30);
  await activateRoute(db, 'puzzler', 'activate', T);
  const dealtReply = await start(db, 'puzzler', 'puzzle');
  const panels = dealtReply.event!;
  const storedPanels = (await readRouteEvent(db, 'puzzler', panels.id))!.data as StoredRouteEvent;
  check('a puzzle search opens a puzzle with its board and reward, never its seed', panels.phase === 'puzzle' && eq(panels.choices, ['solve', 'leave'])
    && panels.puzzle?.board.length === 9 && eq(panels.puzzle.board, storedPanels.event.puzzle?.board) && !JSON.stringify(dealtReply).includes(storedPanels.seed) && dealtReply.state.allowance.available === 11);
  const moves = solvePuzzle(panels.puzzle!.board);
  const bagBefore = (await loadRouteState(db, 'puzzler', T)).inventory;
  await rejects('a move list that stops short pays nothing', chooseRoute(db, 'puzzler', { requestId: rid(), eventId: panels.id, expectedRevision: 0, choice: 'solve', moves: moves.slice(0, -1) }, T), 400);
  await rejects('an illegal slide pays nothing', chooseRoute(db, 'puzzler', { requestId: rid(), eventId: panels.id, expectedRevision: 0, choice: 'solve', moves: [panels.puzzle!.board.indexOf(0)] }, T), 400);
  check('refused solves leave the puzzle open and the Bag untouched', eq((await loadRouteState(db, 'puzzler', T)).inventory, bagBefore) && (await loadRouteState(db, 'puzzler', T)).activeEvent?.id === panels.id);
  const solveInput = { requestId: 'solve-one', eventId: panels.id, expectedRevision: 0, choice: 'solve' as const, moves };
  const solvedReply = await chooseRoute(db, 'puzzler', solveInput, T);
  const solvedAgain = await chooseRoute(db, 'puzzler', solveInput, T + 1);
  const prize = panels.puzzle!.reward[0];
  const held = (inventory: typeof bagBefore) => inventory.stacks.find((s) => s.itemId === prize.itemId)?.quantity ?? 0;
  check('a solved puzzle pays its reward once, even on a retry', solvedReply.event?.outcome === 'solved' && solvedReply.state.activeEvent === null && solvedAgain.replayed === true
    && held((await loadRouteState(db, 'puzzler', T)).inventory) === held(bagBefore) + prize.quantity);
  await rejects('a second solve with a new request pays nothing more', chooseRoute(db, 'puzzler', { ...solveInput, requestId: rid() }, T), 409);
  const givenUp = (await start(db, 'puzzler', 'puzzle')).event!;
  const beforeGiveUp = (await loadRouteState(db, 'puzzler', T)).inventory;
  const left = await chooseRoute(db, 'puzzler', { requestId: rid(), eventId: givenUp.id, expectedRevision: 0, choice: 'leave' }, T);
  check('giving up a puzzle pays nothing and keeps the action spent', left.event?.outcome === 'left' && eq(left.state.inventory, beforeGiveUp) && left.state.allowance.available === 10);

```

In `scripts/route-api.test.ts`, after `check('missing catch ball is rejected', ...);`, add:

```ts
  for (const [label, moves] of [['an empty list', []], ['501 moves', Array(501).fill(1)], ['a fractional index', [1.5]], ['an index off the board', [9]], ['a string', '1,2']] as const) {
    check(`solve rejects ${label}`, (await call('choose', { requestId: `solve-${label}`, eventId: e.id, expectedRevision: 0, choice: 'solve', moves })).status === 400);
  }
  check('moves cannot ride on another choice', (await call('choose', { requestId: 'moves-leave', eventId: e.id, expectedRevision: 0, choice: 'leave', moves: [1] })).status === 400);
```

Run: `npx tsx scripts/route-rules.test.ts; npx tsx scripts/route-db.test.ts; npx tsx scripts/route-api.test.ts`
Expected: FAIL (`Unsupported search kind puzzle`, and solve is rejected at parse).

- [ ] **Step 2: Types**

In `src/game/route-actions.ts`:
- `RoutePhase` gains `| 'puzzle'` (before `'resolved'`).
- `RouteChoice` gains `| 'solve'`.
- `RouteOutcome` gains `| 'solved'`.
- After the `ExploreFind` interface, add:
  ```ts
  /** What the player sees of a puzzle: its board, its scene and its reward. The seed stays on the server. */
  export interface PublicPuzzle { size: number; board: number[]; scene: PuzzleScene; reward: ItemGrant[] }
  ```
- In `RouteFind`, the `kind` union gains `| 'puzzle'`, and after `questId?: QuestId;` add
  `/** A puzzle find's board, scene and reward. */ puzzle?: PublicPuzzle;`.
- In `RouteEvent`, after `questId?: QuestId;` add `/** An open or finished puzzle. */ puzzle?: PublicPuzzle;`.
- In `RouteChooseInput`, after `ballId?: CaptureBallId;` add
  `/** A solve's slides: board indexes moved into the gap, in order. */ moves?: number[];`.

- [ ] **Step 3: Deal puzzles in the rules**

In `src/game/route-rules.ts`, add `import { generatePuzzle } from './sliding-puzzle.js';`. In `rollRouteFind`,
before the `throw`, add:

```ts
  if (kind === 'puzzle') {
    const rng = new RNG(`${STREAM_V4}:${seed}:puzzle`);
    const scene = rng.pick(rules.puzzle.scenes);
    const { items } = pickWeighted(rules.puzzle.rewards, rng);
    const board = generatePuzzle(`${STREAM_V4}:${seed}:board`, rules.puzzle);
    return quiet('puzzle', { puzzle: { size: rules.puzzle.size, board, scene, reward: items.map((item) => ({ ...item })) } });
  }
```

In `legalChoices`, add `case 'puzzle': return ['solve', 'leave'];` before `case 'resolved'`.

- [ ] **Step 4: Open and solve puzzles on the server**

In `api/_route-finds.ts`:
- `openingPhase` returns `find.kind` for `'puzzle'` too. Change its condition to
  `find.kind === 'wild' || find.kind === 'trainer' || find.kind === 'researcher' || find.kind === 'puzzle'`.
- In the event literal, after the `questId` spread, add `...(find.puzzle ? { puzzle: find.puzzle } : {}),`.

In `api/_route-actions.ts`:

(a) Add the imports:

```ts
import { applyMoves, isSolved, MAX_PUZZLE_MOVES } from '../src/game/sliding-puzzle.js';
```

Add `RouteChoice` to the route-actions type import.

(b) Change `SEARCH_KINDS` to `['wild', 'trainer', 'puzzle', 'explore', 'forage']`.

(c) Replace `parseRouteChoose` with:

```ts
const CHOICES: readonly RouteChoice[] = ['battle', 'catch', 'leave', 'accept', 'decline', 'talk', 'solve'];
/** A solve's move list: 1 to MAX_PUZZLE_MOVES board indexes. */
const validMoves = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 1 && v.length <= MAX_PUZZLE_MOVES
  && v.every((m) => Number.isInteger(m) && m >= 0 && m < ROUTE_RULES.puzzle.size ** 2);
export function parseRouteChoose(body: Record<string, unknown>): RouteChooseInput | null {
  if (!validId(body.requestId) || !validId(body.eventId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) return null;
  if (!CHOICES.includes(body.choice as RouteChoice)) return null;
  if (body.choice === 'catch' ? !isCaptureBallId(body.ballId) : body.ballId !== undefined) return null;
  if (body.choice === 'solve' ? !validMoves(body.moves) : body.moves !== undefined) return null;
  return {
    requestId: body.requestId, eventId: body.eventId, expectedRevision: Number(body.expectedRevision), choice: body.choice as RouteChoice,
    ...(isCaptureBallId(body.ballId) ? { ballId: body.ballId } : {}),
    ...(body.choice === 'solve' ? { moves: body.moves as number[] } : {}),
  };
}
```

(d) In `chooseRoute`, replace the receipt payload
`JSON.stringify(['choose', input.eventId, input.expectedRevision, input.choice, input.ballId ?? null])` with
`JSON.stringify(['choose', input.eventId, input.expectedRevision, input.choice, input.ballId ?? null, ...(input.moves ? [input.moves] : [])])`.
Old receipts keep the same payload string.

(e) In `chooseRoute`, insert before the final `} else {` branch (the one that handles accept, decline, talk and leave):

```ts
    } else if (input.choice === 'solve') {
      // Replay the player's slides from the board the server stored; only a legal, solved finish pays.
      const finish = e.puzzle && input.moves ? applyMoves(e.puzzle.board, input.moves) : null;
      if (!e.puzzle || !finish || !isSolved(finish)) return fail(400, 'That doesn’t solve the puzzle yet.');
      for (const item of e.puzzle.reward) await changeInventory(tx, uid, item.itemId, item.quantity);
      e.items = [...e.items, ...e.puzzle.reward];
      e.phase = 'resolved'; e.outcome = 'solved';
```

In `src/components/world/RouteResultView.tsx`, add `solved: 'Puzzle solved!',` to `OUTCOME_LABEL`.

- [ ] **Step 5: Run the focused checks**

Run:
`npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsc -b && npx tsc -p tsconfig.api.json && npm run lint`
Expected: `0 failed` everywhere, and tsc and oxlint are clean. A prototype of these rolls gave reward shares of
39.2/30.1/21.0/9.9 and all four scenes.

- [ ] **Step 6: Commit**

```bash
git add src/game/route-actions.ts src/game/route-rules.ts api/_route-finds.ts api/_route-actions.ts src/components/world/RouteResultView.tsx scripts/route-rules.test.ts scripts/route-db.test.ts scripts/route-api.test.ts
git commit -m "Deal sliding-panel puzzles from Sunny Meadow and pay their reward once the server replays a solved board"
```

---

### Task 4: Quests, one step per action

**Files:**
- Create: `src/game/route-quests.ts`
- Modify: `src/game/route-actions.ts`, `src/game/route-rules.ts`
- Modify: `api/_route-finds.ts`, `api/_route-actions.ts`
- Modify: `scripts/route-balance.ts`, `scripts/route-rules.test.ts`, `scripts/route-db.test.ts`, `scripts/route-api.test.ts`

**Interfaces:**
- Consumes: Task 2's `readRouteQuests`, `commitFind` and `rollRouteFind`.
- Produces:
  - `type QuestStepId = 'meet' | 'survey' | 'claim' | 'spread-honey'` and
    `interface QuestStep { step: QuestStepId; actions: number; items: ItemGrant[] }`;
  - `interface RouteQuestView { id: QuestId; status: RouteQuest['status']; next: QuestStep | null; progress: { done: number; total: number } | null }`;
  - `RouteState.quests: RouteQuestView[]`, `RouteSearchInput.questId?: QuestId`, and `RouteFind.kind` now
    includes `'landmark'`;
  - in `src/game/route-quests.ts`:
    - `interface QuestRecord { questId: QuestId; acceptedAt: number; claimedAt: number | null }`;
    - `isQuestId(v): v is QuestId` and `questRecords(rows): QuestRecord[]`;
    - `questViews(records, landmarks, rules?): RouteQuestView[]`;
    - `canAfford(step: QuestStep, inventory: InventoryState): boolean`;
  - `rollRouteFind` also takes `questStep?: 'meet' | 'survey' | 'spread-honey'` and `knownLandmarks?: readonly string[]`.

- [ ] **Step 1: Write the failing quest tests**

In `scripts/route-rules.test.ts`, add
`import { canAfford, questViews, type QuestRecord } from '../src/game/route-quests.js';`, and after the puzzle
checks add:

```ts
const survey = (records: QuestRecord[], landmarks: string[]) => questViews(records, landmarks).find((q) => q.id === 'meadow-survey')!;
const accepted: QuestRecord[] = [{ questId: 'meadow-survey', acceptedAt: 1, claimedAt: null }];
const allLandmarks = ['signpost', 'sunflowers', 'hilltop-oak'];
check('an unaccepted survey starts by meeting the researcher for one action', survey([], []).status === 'not-accepted' && same(survey([], []).next, { step: 'meet', actions: 1, items: [] }));
check('an accepted survey surveys the next landmark for one action', survey(accepted, ['signpost']).status === 'active' && same(survey(accepted, ['signpost']).next, { step: 'survey', actions: 1, items: [] }) && same(survey(accepted, ['signpost']).progress, { done: 1, total: 3 }));
check('every landmark recorded makes the reward claimable for free', survey(accepted, allLandmarks).status === 'ready' && same(survey(accepted, allLandmarks).next, { step: 'claim', actions: 0, items: [] }));
check('a claimed survey has no step left', survey([{ questId: 'meadow-survey', acceptedAt: 1, claimedAt: 2 }], allLandmarks).status === 'claimed' && survey([{ questId: 'meadow-survey', acceptedAt: 1, claimedAt: 2 }], allLandmarks).next === null);
check('landmarks found before accepting count toward progress', same(survey([], ['hilltop-oak', 'unrelated']).progress, { done: 1, total: 3 }));
check('the Honey Tree stays hidden until found', questViews([], []).every((q) => q.id !== 'honey-tree'));
const tree = questViews([{ questId: 'honey-tree', acceptedAt: 1, claimedAt: null }], []).find((q) => q.id === 'honey-tree')!;
check('a found Honey Tree asks for 1 action and 1 Honey, listed after the survey', tree.status === 'active' && same(tree.next, { step: 'spread-honey', actions: 1, items: [{ itemId: 'honey', quantity: 1 }] })
  && questViews([{ questId: 'honey-tree', acceptedAt: 1, claimedAt: null }], [])[0].id === 'meadow-survey');
const worked = questViews([{ questId: 'honey-tree', acceptedAt: 1, claimedAt: 2 }], []).find((q) => q.id === 'honey-tree')!;
check('a completed Honey Tree stays repeatable', worked.status === 'claimed' && worked.next?.step === 'spread-honey');
check('Spread Honey needs Honey in the Bag', !canAfford(tree.next!, stocked) && canAfford(tree.next!, { ...stocked, stacks: [{ itemId: 'honey', quantity: 1 }] }));
const meet = rollRouteFind({ ...findBase, seed: 'q', kind: 'quest', questStep: 'meet' });
check('meeting the researcher opens the survey dialogue', meet.kind === 'researcher' && meet.npc?.id === 'researcher' && meet.questId === 'meadow-survey' && meet.foe === null);
const surveyed = rollRouteFind({ ...findBase, seed: 'q', kind: 'quest', questStep: 'survey', knownLandmarks: ['sunflowers'] });
check('a survey records the first missing landmark in list order', surveyed.kind === 'landmark' && same(surveyed.landmarks, ['signpost']) && surveyed.questId === 'meadow-survey');
check('known landmarks are skipped', same(rollRouteFind({ ...findBase, seed: 'q', kind: 'quest', questStep: 'survey', knownLandmarks: ['signpost', 'sunflowers'] }).landmarks, ['hilltop-oak']));
const honeys = Array.from({ length: 2000 }, (_, i) => rollRouteFind({ ...findBase, seed: `honey-${i}`, kind: 'quest', questStep: 'spread-honey' }));
const honeyShare = (dexId: number) => honeys.filter((f) => f.foe?.mint.dexId === dexId).length / honeys.length;
check('Spread Honey debits one Honey and draws a honey-tree Pokémon', honeys.every((f) => f.kind === 'wild' && f.questId === 'honey-tree' && same(f.items, [{ itemId: 'honey', quantity: -1 }]) && [415, 412, 214, 446].includes(f.foe?.mint.dexId ?? 0)));
check('honey-tree weights are Combee 50%, Burmy 30%, Heracross 10%, Munchlax 10% within 3 points',
  Math.abs(honeyShare(415) - 0.5) < 0.03 && Math.abs(honeyShare(412) - 0.3) < 0.03 && Math.abs(honeyShare(214) - 0.1) < 0.03 && Math.abs(honeyShare(446) - 0.1) < 0.03);
check('Heracross fights at its own ×0.45 and is rare; Combee fights at ×0.6 and is common',
  honeys.filter((f) => f.foe?.mint.dexId === 214).every((f) => f.foe?.statMult === 0.45 && f.foe.view.rare)
  && honeys.filter((f) => f.foe?.mint.dexId === 415).every((f) => f.foe?.statMult === 0.6 && !f.foe.view.rare));
```

In `scripts/route-db.test.ts`, directly above `  // Schema invariant itself, independent of domain checks.`, add:

```ts
  console.log('[quests: survey steps and the Honey Tree]');
  await onboardUser(db, 'quester', 6, 30);
  await activateRoute(db, 'quester', 'activate', T);
  const questerParty = [(await readOwnedByUser(db, 'quester')).find((m) => m.origin === 'starter')!.id];
  const quest = (questId: 'meadow-survey' | 'honey-tree') => searchRoute(db, 'quester', { requestId: rid(), locationId: 'r1', kind: 'quest', questId, partyIds: questerParty }, T);
  const firstLook = await loadRouteState(db, 'quester', T);
  check('state lists the survey and hides the Honey Tree', eq(firstLook.quests.map((q) => q.id), ['meadow-survey']) && firstLook.quests[0].next?.step === 'meet');
  const metResearcher = await quest('meadow-survey');
  check('the first survey step meets the researcher for one action', metResearcher.event?.kind === 'researcher' && metResearcher.event.questId === 'meadow-survey' && metResearcher.state.allowance.available === 11);
  await chooseRoute(db, 'quester', { requestId: rid(), eventId: metResearcher.event!.id, expectedRevision: 0, choice: 'accept' }, T);
  await insertDiscovery(db, { uid: 'quester', locationId: 'r1', kind: 'landmark', ref: 'sunflowers', foundAt: T });
  const surveyOne = await quest('meadow-survey');
  const surveyTwo = await quest('meadow-survey');
  check('survey steps record missing landmarks in order and skip known ones', eq(surveyOne.event?.newLandmarks, ['signpost']) && eq(surveyTwo.event?.newLandmarks, ['hilltop-oak'])
    && surveyOne.event?.phase === 'resolved' && surveyOne.event.kind === 'landmark' && surveyTwo.state.quests[0].status === 'ready');
  await rejects('a ready survey has no search step: its reward is claimed instead', quest('meadow-survey'), 409);
  check('the refused step spent no action', (await loadRouteState(db, 'quester', T)).allowance.available === 9);
  const claimedSurvey = await claimRouteQuest(db, 'quester', { requestId: rid(), questId: 'meadow-survey' }, T);
  check('the survey claim stays free and closes the quest', claimedSurvey.state.quests[0].status === 'claimed' && claimedSurvey.state.quests[0].next === null && claimedSurvey.state.allowance.available === 9);
  await rejects('the Honey Tree cannot be worked before it is found', quest('honey-tree'), 409);
  await acceptRouteQuest(db, 'quester', 'honey-tree', T);
  check('a found Honey Tree joins the quest list after the survey', eq((await loadRouteState(db, 'quester', T)).quests.map((q) => q.id), ['meadow-survey', 'honey-tree']));
  await rejects('Spread Honey without Honey is refused', quest('honey-tree'), 409);
  check('the refused Spread Honey spent nothing', (await loadRouteState(db, 'quester', T)).allowance.available === 9);
  await changeInventory(db, 'quester', 'honey', 2);
  const drawn = await quest('honey-tree');
  check('Spread Honey uses one Honey and draws a catchable honey-tree Pokémon', drawn.event?.kind === 'wild' && drawn.event.questId === 'honey-tree' && [415, 412, 214, 446].includes(drawn.event.foe?.dexId ?? 0)
    && drawn.event.choices.includes('catch') && drawn.state.inventory.stacks.find((s) => s.itemId === 'honey')?.quantity === 1 && drawn.state.allowance.available === 8);
  check('the first honey-tree encounter completes the quest', drawn.state.quests.find((q) => q.id === 'honey-tree')?.status === 'claimed');
  await leave(db, 'quester', drawn.event!);
  const baitedAgain = await quest('honey-tree');
  check('the Honey Tree can be baited again while Honey lasts', baitedAgain.event?.questId === 'honey-tree' && baitedAgain.state.inventory.stacks.find((s) => s.itemId === 'honey')?.quantity === 0);
  await leave(db, 'quester', baitedAgain.event!);
  await changeInventory(db, 'quester', 'honey', 1);
  const honeyRace = await Promise.allSettled([quest('honey-tree'), tradeMarket(db, 'quester', { requestId: rid(), itemId: 'honey', side: 'sell', quantity: 1 }, T)]);
  check('one Honey cannot both bait the tree and be sold', honeyRace.filter((r) => r.status === 'fulfilled').length === 1 && (await loadRouteState(db, 'quester', T)).inventory.stacks.find((s) => s.itemId === 'honey')?.quantity === 0);

```

In `scripts/route-api.test.ts`, after the retired-`npc` check, add:

```ts
  check('a quest search must name a quest', (await call('search', { requestId: 'q-none', locationId: 'r1', kind: 'quest', partyIds: [s.id] })).status === 400);
  check('a quest search rejects an unknown quest', (await call('search', { requestId: 'q-bad', locationId: 'r1', kind: 'quest', questId: 'dragon-hunt', partyIds: [s.id] })).status === 400);
  check('only quest searches name a quest', (await call('search', { requestId: 'q-wild', locationId: 'r1', kind: 'wild', questId: 'meadow-survey', partyIds: [s.id] })).status === 400);
  const hidden = await call('search', { requestId: 'q-tree', locationId: 'r1', kind: 'quest', questId: 'honey-tree', partyIds: [s.id] });
  check('an unfound Honey Tree is a 409 with recovery state and no action spent', hidden.status === 409 && (hidden.body.state as RouteState).allowance.available === 12);
```

Run: `npx tsx scripts/route-rules.test.ts; npx tsx scripts/route-db.test.ts; npx tsx scripts/route-api.test.ts`
Expected: FAIL (`route-quests.js` is missing, and the `quest` kind is not parsed).

- [ ] **Step 2: Types**

In `src/game/route-actions.ts`:
- In `RouteFind`, the `kind` union gains `| 'landmark'`.
- After the `RouteQuest` interface, add:
  ```ts
  export type QuestStepId = 'meet' | 'survey' | 'claim' | 'spread-honey';
  /** A quest's next step and what it costs: actions, and items such as the Honey Tree's Honey. */
  export interface QuestStep { step: QuestStepId; actions: number; items: ItemGrant[] }
  /** One quest as the Quest card shows it. The server builds these; the client never decides a step. */
  export interface RouteQuestView {
    id: QuestId;
    status: RouteQuest['status'];
    next: QuestStep | null;
    /** Landmarks recorded for the survey; null for quests without a count. */
    progress: { done: number; total: number } | null;
  }
  ```
- In `RouteState`, after `quest: RouteQuest;`, add
  `/** Every quest the trainer can see: the survey always, the Honey Tree once found. */ quests: RouteQuestView[];`.
- In `RouteSearchInput`, after `kind: SearchKind;`, add
  `/** Which quest a Quest search works on; only quest searches carry it. */ questId?: QuestId;`.

- [ ] **Step 3: The quest rules**

Create `src/game/route-quests.ts`:

```ts
import { itemQuantity } from './items.js';
import type { InventoryState, ItemGrant, QuestId, QuestStep, RouteQuestView, RouteRules } from './route-actions.js';
import { MEADOW_LANDMARKS, ROUTE_RULES } from './route-rules.js';

// Quests on the Quest card: the Meadow survey and the Honey Tree. Pure: the server derives steps from stored rows
// with these rules, and the board renders the views it returns.

/** One stored quest row: when it was accepted (the Honey Tree: found), and when it was first completed. */
export interface QuestRecord { questId: QuestId; acceptedAt: number; claimedAt: number | null }

export const isQuestId = (v: unknown): v is QuestId => v === 'meadow-survey' || v === 'honey-tree';

/** Stored rows for quests this build knows. */
export function questRecords(rows: readonly { questId: string; acceptedAt: number; claimedAt: number | null }[]): QuestRecord[] {
  return rows.flatMap((row) => (isQuestId(row.questId) ? [{ questId: row.questId, acceptedAt: row.acceptedAt, claimedAt: row.claimedAt }] : []));
}

const step = (id: QuestStep['step'], actions: number, items: ItemGrant[] = []): QuestStep => ({ step: id, actions, items });

function surveyView(record: QuestRecord | undefined, landmarks: readonly string[], rules: RouteRules): RouteQuestView {
  const required = MEADOW_LANDMARKS.map((landmark) => landmark.id as string);
  const progress = { done: required.filter((id) => landmarks.includes(id)).length, total: required.length };
  if (!record) return { id: 'meadow-survey', status: 'not-accepted', next: step('meet', rules.costs.quest), progress };
  if (record.claimedAt !== null) return { id: 'meadow-survey', status: 'claimed', next: null, progress };
  if (progress.done === progress.total) return { id: 'meadow-survey', status: 'ready', next: step('claim', 0), progress };
  return { id: 'meadow-survey', status: 'active', next: step('survey', rules.costs.quest), progress };
}

/** The quests the trainer can see: the survey always, then the Honey Tree once found. */
export function questViews(records: readonly QuestRecord[], landmarks: readonly string[], rules: RouteRules = ROUTE_RULES): RouteQuestView[] {
  const views = [surveyView(records.find((r) => r.questId === 'meadow-survey'), landmarks, rules)];
  const tree = records.find((r) => r.questId === 'honey-tree');
  // The Honey Tree never runs out: its first encounter completes it, and it stays baitable while Honey lasts.
  if (tree) views.push({ id: 'honey-tree', status: tree.claimedAt === null ? 'active' : 'claimed', next: step('spread-honey', rules.costs.quest, [{ itemId: 'honey', quantity: 1 }]), progress: null });
  return views;
}

/** Whether the Bag covers a step's item cost. The action cost is checked against the allowance separately. */
export function canAfford(next: QuestStep, inventory: InventoryState): boolean {
  return next.items.every((item) => itemQuantity(inventory, item.itemId) >= item.quantity);
}
```

- [ ] **Step 4: Quest finds in the rules**

In `src/game/route-rules.ts`:

(a) After the `TRAINERS` array, add the researcher for the survey's first step:

```ts
const RESEARCHER: RouteNpc = {
  id: 'researcher', name: 'Meadow Researcher', spriteKey: 'random-scientist-f',
  text: 'I’m surveying Sunny Meadow. Survey the Old Signpost, Sunflower Patch and Hilltop Oak for me, and I’ll share three Great Balls and ₽500. Places you already found count too.',
};
```

(b) Extend the `rollRouteFind` signature and add the quest branch:

```ts
export function rollRouteFind({ seed, kind, questStep, knownLandmarks = [], honeyTreeFound = false, inventory, rules = ROUTE_RULES }: {
  seed: string;
  kind: SearchKind;
  /** A Quest search's step, derived by the server from stored progress. */
  questStep?: 'meet' | 'survey' | 'spread-honey';
  knownLandmarks?: readonly string[];
  /** Explore's secret is the Honey Tree until the trainer finds it. */
  honeyTreeFound?: boolean;
  inventory: InventoryState;
  rules?: RouteRules;
}): RouteFind {
```

Before the `throw`, add:

```ts
  if (kind === 'quest') {
    if (questStep === 'meet') return quiet('researcher', { npc: { ...RESEARCHER }, questId: 'meadow-survey' });
    if (questStep === 'survey') {
      const next = MEADOW_LANDMARKS.find((landmark) => !knownLandmarks.includes(landmark.id));
      if (!next) throw new Error('No landmark left to survey');
      return quiet('landmark', { landmarks: [next.id], questId: 'meadow-survey' });
    }
    if (questStep === 'spread-honey') {
      return { ...quiet('wild', { items: [{ itemId: 'honey', quantity: -1 }], questId: 'honey-tree' }), foe: rollFoe(rules.honeyTree, new RNG(`${STREAM_V4}:${seed}:honey`)) };
    }
    throw new Error('A quest search needs its step');
  }
```

- [ ] **Step 5: Quests on the server**

In `api/_route-finds.ts`:

(a) Imports: add `markRouteQuestClaimed, readDiscoveries` to the `./_db.js` list, and add:

```ts
import { canAfford, questRecords, questViews } from '../src/game/route-quests.js';
```

Add `QuestId` to the route-actions type import.

(b) Replace the head of `commitFind`, from the signature down to the `rollRouteFind` line, with:

```ts
export async function commitFind(tx: Executor, { uid, kind, questId, party, inventory, now }: {
  uid: string;
  kind: SearchKind;
  questId?: QuestId;
  party: OwnedMon[];
  inventory: InventoryState;
  now: number;
}): Promise<RouteEvent> {
  const [discoveries, rows] = await Promise.all([readDiscoveries(tx, uid), readRouteQuests(tx, uid)]);
  const landmarks = discoveries.filter((d) => d.locationId === 'r1' && d.kind === 'landmark').map((d) => d.ref);
  const records = questRecords(rows);
  let questStep: 'meet' | 'survey' | 'spread-honey' | undefined;
  if (kind === 'quest') {
    // The step comes from stored progress, never from the request.
    const quest = questViews(records, landmarks).find((q) => q.id === questId);
    if (!quest) return fail(409, 'You haven’t found that quest yet.');
    const next = quest.next;
    if (!next) return fail(409, 'That quest is complete.');
    if (next.step === 'claim') return fail(409, 'Your survey is complete. Claim its reward.');
    if (!canAfford(next, inventory)) return fail(409, 'You have no Honey. Forage for some first.');
    questStep = next.step;
  }
  const seed = randomBytes(16).toString('hex');
  const find = rollRouteFind({ seed, kind, questStep, knownLandmarks: landmarks, honeyTreeFound: records.some((q) => q.questId === 'honey-tree'), inventory, rules: ROUTE_RULES });
```

(c) After `if (find.kind === 'secret') await acceptRouteQuest(tx, uid, 'honey-tree', now);`, add:

```ts
  // The first honey-tree encounter completes its quest; later ones leave it complete.
  if (find.questId === 'honey-tree' && find.kind === 'wild') await markRouteQuestClaimed(tx, uid, 'honey-tree', now);
```

In `api/_route-actions.ts`:

(a) Add `readRouteQuests` to the `./_db.js` import, and add:

```ts
import { isQuestId, questRecords, questViews } from '../src/game/route-quests.js';
```

Add `QuestId` to the route-actions type import.

(b) Change `SEARCH_KINDS` to `['wild', 'trainer', 'puzzle', 'quest', 'explore', 'forage']`, and replace the
`parseRouteSearch` body with:

```ts
export function parseRouteSearch(body: Record<string, unknown>): RouteSearchInput | null {
  const partyIds = parsePartyInput(body.partyIds);
  if (!validId(body.requestId) || body.locationId !== 'r1' || !SEARCH_KINDS.includes(body.kind as SearchKind) || !partyIds) return null;
  const kind = body.kind as SearchKind;
  // Only a quest search names its quest, and it must.
  if (kind === 'quest' ? !isQuestId(body.questId) : body.questId !== undefined) return null;
  return { requestId: body.requestId, locationId: 'r1', kind, partyIds, ...(kind === 'quest' ? { questId: body.questId as QuestId } : {}) };
}
```

(c) In `searchRoute`, replace the payload with
`JSON.stringify(['search', input.locationId, input.kind, input.partyIds, ...(input.questId ? [input.questId] : [])])`,
and pass `questId: input.questId` to `commitFind`.

(d) In `loadRouteStateInTx`, replace `quest` with `questRows` in the destructured `Promise.all` result, and
`readRouteQuest(db, uid, 'meadow-survey')` with `readRouteQuests(db, uid)`. Right after the `Promise.all`, add:

```ts
  const records = questRecords(questRows);
  const quest = records.find((r) => r.questId === 'meadow-survey');
```

In the returned object, after the `quest: { ... },` entry, add `quests: questViews(records, landmarks),`.

In `scripts/route-balance.ts`, append to the array returned by `routeOpponents()`:

```ts
    ...ROUTE_RULES.honeyTree.pool.map(({ dexId }): Opponent => ({
      label: speciesName(dexId), gate: 60,
      foe: (i) => firstFoe(`balance-honey:${dexId}:${i}`, (seed) => rollRouteFind({ seed, kind: 'quest', questStep: 'spread-honey', inventory }), (find) => find.foe?.view.dexId === dexId),
    })),
```

- [ ] **Step 6: Run the focused checks**

Run:
`npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-balance.ts && npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/route-client.test.ts && npx tsc -b && npx tsc -p tsconfig.api.json && npm run lint`
Expected: `0 failed`, and the balance table ends with `Every starter passes`. The prototype measured minimum wins of
Combee 96%, Burmy 99%, Heracross 72% (at ×0.45) and Munchlax 74%. tsc and oxlint are clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/route-quests.ts src/game/route-actions.ts src/game/route-rules.ts api/_route-finds.ts api/_route-actions.ts scripts/route-balance.ts scripts/route-rules.test.ts scripts/route-db.test.ts scripts/route-api.test.ts
git commit -m "Play Sunny Meadow quests one step per action: survey landmarks in turn and bait the secret Honey Tree with Honey"
```

---

### Task 5: Client contract and board logic

**Files:**
- Modify: `src/game/route-actions-client.ts`
- Create: `src/components/world/route-board.ts`
- Modify: `scripts/route-client.test.ts`

**Interfaces:**
- Consumes: `RouteQuestView`, `QuestStep`, `canAfford`, `ROUTE_RULES.costs`, `guaranteesSupplies`, `waitText`.
- Produces, from `src/components/world/route-board.ts`:
  - `BOARD_CARDS: readonly BoardCard[]`, where `BoardCard = { kind: SearchKind; label; verb; description }`;
  - `QUEST_NAMES: Record<QuestId, string>`;
  - `costText(actions, items?): string`;
  - `pickQuest(quests, picked): RouteQuestView | null` and `questLine(quest): string`;
  - `type BoardAction` and `interface BoardCta { label; enabled; reason; action }`;
  - `boardCta({ state, card, quest, partySize, partyDown, busy, now }): BoardCta`;
  - `cardDescription(card, inventory): string`.

- [ ] **Step 1: Write the failing client tests**

In `scripts/route-client.test.ts`:

(a) In the `state` fixture, after the `quest: { ... },` line, add:

```ts
  quests: [{ id: 'meadow-survey', status: 'not-accepted', next: { step: 'meet', actions: 1, items: [] }, progress: { done: 0, total: 3 } }],
```

(b) Add the import:

```ts
import { boardCta, cardDescription, pickQuest } from '../src/components/world/route-board.js';
```

Add `RouteQuestView` to the route-actions type import.

(c) Before the closing `console.log(...)`, add:

```ts
reply = json(200, { ok: true, state: { ...state, quests: undefined } });
check('a state without quests is not trusted', !(await fetchRouteState()).ok);
reply = json(400, { ok: false, error: 'Sunny Meadow has new actions. Refresh to see them.' });
const staleSearch = await runRouteCommand({ operation: 'search', input: { requestId: 'old-npc', locationId: 'r1', kind: 'wild', partyIds: ['starter'] } });
check('a refused stale search is final, so its pending command is dropped', !staleSearch.ok && !staleSearch.uncertain && staleSearch.error === 'Sunny Meadow has new actions. Refresh to see them.');

const board = { ...state, trainerAt: 'r1' as const };
const cta = (over: Partial<Parameters<typeof boardCta>[0]>) => boardCta({ state: board, card: 'wild', quest: null, partySize: 1, partyDown: false, busy: false, now: 1_000, ...over });
check('each card names its search and its cost', cta({}).label === 'Search the grass (1 action)' && cta({ card: 'trainer' }).label === 'Find a trainer (1 action)'
  && cta({ card: 'puzzle' }).label === 'Solve a puzzle (1 action)' && cta({ card: 'explore' }).label === 'Explore (1 action)' && cta({ card: 'forage' }).label === 'Forage (1 action)');
check('a ready card runs its search', cta({ card: 'forage' }).enabled && JSON.stringify(cta({ card: 'forage' }).action) === JSON.stringify({ type: 'search', kind: 'forage' }));
check('an unopened route begins exploring first', cta({ state: { ...board, activated: false } }).action.type === 'activate');
check('an open encounter turns the button into Resume', cta({ state: { ...board, activeEvent: wild } }).label === 'Resume encounter' && cta({ state: { ...board, activeEvent: wild } }).action.type === 'resume');
check('no party asks for one', cta({ partySize: 0 }).action.type === 'party');
check('a fainted party is sent to the Pokémon Center', cta({ partyDown: true }).action.type === 'center');
const drained = { ...board, allowance: { ...board.allowance, available: 0, nextRefillAt: 361_000 } };
check('no actions disables the search and names the wait', !cta({ state: drained }).enabled && cta({ state: drained }).reason === 'No actions left. Next action in 6 min.');
check('a refill that is due offers a check instead', cta({ state: { ...drained, allowance: { ...drained.allowance, nextRefillAt: 1_000 } } }).action.type === 'refresh');
const surveyStep: RouteQuestView = { id: 'meadow-survey', status: 'active', next: { step: 'survey', actions: 1, items: [] }, progress: { done: 1, total: 3 } };
const treeStep: RouteQuestView = { id: 'honey-tree', status: 'active', next: { step: 'spread-honey', actions: 1, items: [{ itemId: 'honey', quantity: 1 }] }, progress: null };
check('the Quest card performs the chosen quest’s step', cta({ card: 'quest', quest: surveyStep }).label === 'Survey a landmark (1 action)'
  && JSON.stringify(cta({ card: 'quest', quest: surveyStep }).action) === JSON.stringify({ type: 'search', kind: 'quest', questId: 'meadow-survey' }));
check('a ready survey is claimed for free', cta({ card: 'quest', quest: { ...surveyStep, status: 'ready', next: { step: 'claim', actions: 0, items: [] } } }).label === 'Claim reward (free)'
  && cta({ card: 'quest', quest: { ...surveyStep, status: 'ready', next: { step: 'claim', actions: 0, items: [] } } }).action.type === 'claim');
check('Spread Honey shows its Honey cost and waits for Honey', cta({ card: 'quest', quest: treeStep }).label === 'Spread Honey (1 action · 1 Honey)' && !cta({ card: 'quest', quest: treeStep }).enabled
  && cta({ card: 'quest', quest: treeStep }).reason === 'Forage for Honey first.');
check('with Honey, Spread Honey runs', cta({ card: 'quest', quest: treeStep, state: { ...board, inventory: { ...board.inventory, stacks: [{ itemId: 'honey', quantity: 2 }] } } }).enabled);
check('with no quest step, the Quest card points to Explore', !cta({ card: 'quest', quest: null }).enabled && cta({ card: 'quest', quest: null }).reason === 'No quests right now. Explore to find secrets.');
check('the Quest card keeps a pick that still has a step, else takes the first quest with one', pickQuest([surveyStep, treeStep], 'honey-tree')?.id === 'honey-tree'
  && pickQuest([{ ...surveyStep, status: 'claimed', next: null }, treeStep], 'meadow-survey')?.id === 'honey-tree' && pickQuest([{ ...surveyStep, status: 'claimed', next: null }], null) === null);
check('Explore says when it guarantees supplies', cardDescription('explore', { revision: 1, money: 0, stacks: [] }) === 'You have no balls: exploring now guarantees 3 Poké Balls.');
```

Note: the `wild` fixture is declared further down in the file. Put this block after the existing highlight checks
(which follow `const wild: RouteEvent = ...`) and before the travel checks, or move the `wild` declaration above
it.

Run: `npx tsx scripts/route-client.test.ts`
Expected: FAIL (`route-board.js` is missing).

- [ ] **Step 2: Accept quests in the client validator**

In `src/game/route-actions-client.ts`, after `isQuote`, add:

```ts
const isQuestView = (v: unknown): boolean => isObject(v) && (v.id === 'meadow-survey' || v.id === 'honey-tree') && typeof v.status === 'string'
  && (v.next === null || (isObject(v.next) && typeof v.next.step === 'string' && Number.isSafeInteger(v.next.actions) && Array.isArray(v.next.items)));
```

In `isRouteState`, before the final `return`, add:

```ts
  if (!Array.isArray(v.quests) || !v.quests.every(isQuestView)) return false;
```

- [ ] **Step 3: The board logic**

Create `src/components/world/route-board.ts`:

```ts
import { formatMoney, itemById } from '../../game/items.js';
import type { InventoryState, ItemGrant, QuestId, QuestStep, RouteQuestView, RouteState, SearchKind } from '../../game/route-actions.js';
import { canAfford } from '../../game/route-quests.js';
import { guaranteesSupplies, ROUTE_RULES } from '../../game/route-rules.js';
import { waitText } from './route-copy.js';

// The Sunny Meadow board's words and its one button. Pure, so the CTA's states are tested without a browser.

/** One card on the board: its caption, its search verb, and what it does. */
export interface BoardCard { kind: SearchKind; label: string; verb: string; description: string }

export const BOARD_CARDS: readonly BoardCard[] = [
  { kind: 'wild', label: 'Wild Pokémon', verb: 'Search the grass', description: 'Battle a wild Pokémon for EXP and try to catch it. No prize money.' },
  { kind: 'trainer', label: 'Trainer', verb: 'Find a trainer', description: `Battle a trainer for more EXP and ${formatMoney(ROUTE_RULES.trainerMoney)}. Their Pokémon can’t be caught.` },
  { kind: 'puzzle', label: 'Puzzle', verb: 'Solve a puzzle', description: 'Slide the stone panels back into a meadow picture to win the item it hides.' },
  { kind: 'quest', label: 'Quest', verb: 'Quest', description: 'Work on a Sunny Meadow quest, one step at a time.' },
  { kind: 'explore', label: 'Explore', verb: 'Explore', description: 'Anything can happen: a rare Pokémon, a rare item, a secret, or nothing at all.' },
  { kind: 'forage', label: 'Forage', verb: 'Forage', description: 'Gather Honey and mushrooms to sell at the market.' },
];

export const QUEST_NAMES: Record<QuestId, string> = { 'meadow-survey': 'Meadow survey', 'honey-tree': 'The Honey Tree' };
const STEP_VERBS: Record<QuestStep['step'], string> = {
  meet: 'Meet the researcher', survey: 'Survey a landmark', claim: 'Claim reward', 'spread-honey': 'Spread Honey',
};

/** "1 action", "Free", "1 action · 1 Honey". */
export function costText(actions: number, items: readonly ItemGrant[] = []): string {
  const parts = actions > 0 ? [`${actions} ${actions === 1 ? 'action' : 'actions'}`] : [];
  for (const item of items) {
    const def = itemById(item.itemId);
    parts.push(`${item.quantity} ${item.quantity === 1 ? def?.name ?? item.itemId : def?.plural ?? item.itemId}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Free';
}

/** The quest the Quest card acts on: the player's pick while it has a step, else the first quest that has one. */
export function pickQuest(quests: readonly RouteQuestView[], picked: QuestId | null): RouteQuestView | null {
  return quests.find((q) => q.id === picked && q.next !== null) ?? quests.find((q) => q.next !== null) ?? null;
}

/** One line per quest in the Quest card's pick list. */
export function questLine(quest: RouteQuestView): string {
  if (!quest.next) return 'Complete';
  const verb = STEP_VERBS[quest.next.step];
  return quest.progress ? `${verb} · ${quest.progress.done}/${quest.progress.total} landmarks` : verb;
}

export type BoardAction =
  | { type: 'activate' } | { type: 'resume' } | { type: 'party' } | { type: 'center' } | { type: 'refresh' } | { type: 'claim' } | { type: 'none' }
  | { type: 'search'; kind: SearchKind; questId?: QuestId };

/** The board's one button: its words, whether it can run, why not, and what it does. */
export interface BoardCta { label: string; enabled: boolean; reason: string | null; action: BoardAction }

const idle = (label: string, reason: string | null): BoardCta => ({ label, enabled: false, reason, action: { type: 'none' } });

/** What the button says and does for the selected card. Mirrors the server's refusals; the server still decides. */
export function boardCta({ state, card, quest, partySize, partyDown, busy, now }: {
  state: RouteState;
  card: SearchKind;
  quest: RouteQuestView | null;
  partySize: number;
  partyDown: boolean;
  busy: boolean;
  now: number;
}): BoardCta {
  if (busy) return idle('Searching…', null);
  if (!state.activated || state.legacy.pending) return { label: 'Begin exploring', enabled: true, reason: null, action: { type: 'activate' } };
  if (state.activeEvent) return { label: 'Resume encounter', enabled: true, reason: 'Finish or leave your encounter before you search again.', action: { type: 'resume' } };
  if (partySize === 0) return { label: 'Choose your party', enabled: true, reason: 'Bring at least one Pokémon before you search.', action: { type: 'party' } };
  if (partyDown) return { label: 'Travel to Hearth Town', enabled: true, reason: 'Every Pokémon in your party has fainted. The Pokémon Center heals them for free.', action: { type: 'center' } };
  const def = BOARD_CARDS.find((entry) => entry.kind === card)!;
  let verb = def.verb;
  let items: ItemGrant[] = [];
  let questId: QuestId | undefined;
  if (card === 'quest') {
    if (!quest?.next) return idle('Quest', 'No quests right now. Explore to find secrets.');
    if (quest.next.step === 'claim') return { label: 'Claim reward (free)', enabled: true, reason: null, action: { type: 'claim' } };
    verb = STEP_VERBS[quest.next.step];
    items = quest.next.items;
    questId = quest.id;
    if (!canAfford(quest.next, state.inventory)) return idle(`${verb} (${costText(quest.next.actions, items)})`, 'Forage for Honey first.');
  }
  const actions = ROUTE_RULES.costs[card];
  const label = `${verb} (${costText(actions, items)})`;
  if (state.allowance.available < actions) {
    const next = state.allowance.nextRefillAt;
    if (next !== null && next <= now) return { label: 'Check for an action', enabled: true, reason: 'An action should be ready.', action: { type: 'refresh' } };
    return idle(label, next === null ? 'No actions left.' : `No actions left. Next action in ${waitText(next - now)}.`);
  }
  return { label, enabled: true, reason: null, action: { type: 'search', kind: card, ...(questId ? { questId } : {}) } };
}

/** The selected card's one-line description. Explore names its free supplies when the Bag is out of balls. */
export function cardDescription(card: SearchKind, inventory: InventoryState): string {
  if (card === 'explore' && guaranteesSupplies(inventory)) return `You have no balls: exploring now guarantees ${ROUTE_RULES.pokeBundleQuantity} Poké Balls.`;
  return BOARD_CARDS.find((entry) => entry.kind === card)!.description;
}
```

- [ ] **Step 4: Run the focused checks**

Run: `npx tsx scripts/route-client.test.ts && npx tsc -b && npm run lint`
Expected: `0 failed`, and tsc and oxlint are clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/route-actions-client.ts src/components/world/route-board.ts scripts/route-client.test.ts
git commit -m "Validate quests in route state and add the board's card, cost and button rules"
```

---

### Task 6: The Sunny Meadow board screen

**Files:**
- Create: `src/components/world/RouteBoard.tsx`, `src/components/world/puzzle-art.ts`
- Modify: `src/components/world/MeadowScene.tsx`, `RouteScreen.tsx`, `place-highlights.ts`
- Delete: `src/components/world/SunnyMeadow.tsx` (its only caller is `RouteScreen.tsx`)
- Modify: `scripts/build-night-icon-sizes.py`
- Create: `public/sprites/ui/night/96/field-journal.png` (generated)
- Modify: `scripts/route-client.test.ts` (rename the focus value)

**Interfaces:**
- Consumes: Task 5's `route-board.ts` exports, `useServerClock`, `PixelSprite`, `HpBar`, `ExpBar`, and the `scene.ts`
  helpers.
- Produces:
  - `RouteBoard(props: RouteBoardProps)`;
  - `SCENE_CROPS`, `MEADOW_ART`, `panelStyle(scene, value, size)` and `scenePreviewStyle(scene)` from
    `puzzle-art.ts`;
  - `MeadowScene` gains `wide?: boolean`;
  - `WorldEntry` focus values become `'encounter' | 'result' | 'quest'`;
  - `RouteScreen`'s `search(kind, questId?)`.

- [ ] **Step 1: Generate the Quest icon**

In `scripts/build-night-icon-sizes.py`, add `"field-journal"` to the end of `NAMES`. Then run
`python3 scripts/build-night-icon-sizes.py`.

Expected: `public/sprites/ui/night/96/field-journal.png` exists. Stage only that file and the script. If the run
rewrote other 96px icons byte for byte, `git checkout` them.

- [ ] **Step 2: Puzzle art helpers**

Create `src/components/world/puzzle-art.ts`:

```ts
import type { PuzzleScene } from '../../game/route-actions';

export const MEADOW_ART = `${import.meta.env.BASE_URL}sprites/world/sunny-meadow-v1/meadow.webp`;

/** The square of the meadow art each scene shows, as fractions of the 1254 px image (see its 10% grid). */
export const SCENE_CROPS: Record<PuzzleScene, { x: number; y: number; side: number }> = {
  'tall-grass': { x: 0.08, y: 0.45, side: 0.45 },
  sunflowers: { x: 0, y: 0.24, side: 0.38 },
  signpost: { x: 0.12, y: 0.06, side: 0.38 },
  'hilltop-oak': { x: 0.6, y: 0, side: 0.4 },
};

type Background = { backgroundImage: string; backgroundSize: string; backgroundPosition: string };

/** A background that puts the image point `x`,`y` (fractions of the image) at the box's top-left, at `scale` box widths. */
function crop(x: number, y: number, scale: number): Background {
  // A percentage position p aligns p% of the image with p% of the box: offset = p × (box − image).
  const at = (start: number) => `${(100 * start) / (scale - 1)}%`;
  return { backgroundImage: `url(${MEADOW_ART})`, backgroundSize: `${100 * scale}%`, backgroundPosition: `${at(x * scale)} ${at(y * scale)}` };
}

/** Panel `value`'s piece of the scene: the piece of its solved place, wherever the panel sits now. */
export function panelStyle(scene: PuzzleScene, value: number, size: number): Background {
  const { x, y, side } = SCENE_CROPS[scene];
  const scale = size / side;
  const row = Math.floor((value - 1) / size);
  const col = (value - 1) % size;
  return crop(x + (col * side) / size, y + (row * side) / size, scale);
}

/** The whole scene in one box: the picture to rebuild. */
export function scenePreviewStyle(scene: PuzzleScene): Background {
  const { x, y, side } = SCENE_CROPS[scene];
  return crop(x, y, 1 / side);
}
```

- [ ] **Step 3: A wide meadow scene**

Replace `src/components/world/MeadowScene.tsx` with:

```tsx
import type { ReactNode } from 'react';

/** One coordinate space for the illustration and what sits on it. `wide` crops it to the board's banner. */
export function MeadowScene({ children, label = 'Sunny Meadow', className = '', wide = false }: { children?: ReactNode; label?: string; className?: string; wide?: boolean }) {
  // On short screens the board's banner flattens so its button stays above the fold.
  const shape = wide ? 'aspect-[4/3] [@media(max-height:700px)]:aspect-[16/9]' : 'aspect-square rounded-t-[3px]';
  return <div className={`relative isolate w-full overflow-hidden bg-slot ${shape} ${className}`} aria-label={label}>
    <img src={`${import.meta.env.BASE_URL}sprites/world/sunny-meadow-v1/meadow.webp`} alt="" width={1254} height={1254}
      draggable={false} decoding="async" fetchPriority="high" className={`pointer-events-none absolute inset-0 h-full w-full select-none object-cover [image-rendering:auto] ${wide ? 'object-[center_45%]' : ''}`} />
    {children}
  </div>;
}
```

- [ ] **Step 4: The board**

Create `src/components/world/RouteBoard.tsx`:

```tsx
import { useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { isFainted } from '../../game/health';
import { miniUrl } from '../../game/pokemon';
import type { QuestId, RouteQuestView, RouteState, SearchKind } from '../../game/route-actions';
import { ROUTE_RULES } from '../../game/route-rules';
import { routeById } from '../../game/world';
import { ExpBar } from '../ui/ExpBar';
import { HpBar } from '../ui/HpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { useServerClock } from '../ui/useServerClock';
import { MeadowScene } from './MeadowScene';
import { panelStyle } from './puzzle-art';
import { BOARD_CARDS, boardCta, cardDescription, pickQuest, QUEST_NAMES, questLine, type BoardAction } from './route-board';
import { waitText } from './route-copy';
import { formatDuration, growthLines, monName, POKEBALL, speciesName } from './scene';

const ASSET = import.meta.env.BASE_URL;

export interface RouteBoardProps {
  state: RouteState;
  party: OwnedMon[];
  locked: boolean;
  busy: boolean;
  /** Opened from a Hub quest highlight: start on the Quest card. */
  focusQuest?: boolean;
  onSearch: (kind: SearchKind, questId?: QuestId) => void;
  onClaim: () => void;
  onActivate: () => void;
  onResume: () => void;
  onResult: () => void;
  onEditParty: () => void;
  /** The Pokémon Center page; away from Hearth Town it offers the paid trip there first. */
  onCenter: () => void;
  onRefresh: () => void;
  onDismissLegacy: (id: string) => void;
}

/** Sunny Meadow as a board: the scene, six cards, and one button that states its cost. Choosing a card is free. */
export function RouteBoard({ state, party, locked, busy, focusQuest = false, onSearch, onClaim, onActivate, onResume, onResult, onEditParty, onCenter, onRefresh, onDismissLegacy }: RouteBoardProps) {
  const [card, setCard] = useState<SearchKind>(focusQuest ? 'quest' : 'wild');
  const [picked, setPicked] = useState<QuestId | null>(null);
  const quest = pickQuest(state.quests, picked);
  const starting = !state.activated || state.legacy.pending;
  const active = state.activeEvent;
  const claimable = state.quests.some((q) => q.next?.step === 'claim');
  const run = (action: BoardAction) => {
    switch (action.type) {
      case 'activate': return onActivate();
      case 'resume': return onResume();
      case 'party': return onEditParty();
      case 'center': return onCenter();
      case 'refresh': return onRefresh();
      case 'claim': return onClaim();
      case 'search': return onSearch(action.kind, action.questId);
      case 'none': return;
    }
  };

  return <>
    <section className="ui-window m-2" aria-label="Sunny Meadow" aria-busy={busy}>
      {state.activated && <StaminaChips state={state} />}
      <MeadowScene wide label="Sunny Meadow">
        {busy && <p className="pointer-events-none absolute left-3 top-3 border border-window-rim bg-window px-2 py-1 font-label text-[9px] uppercase text-ink shadow-[2px_2px_0_var(--color-edge)]">Looking around…</p>}
        {active && <button type="button" onClick={onResume} className="ui-focus absolute left-1/2 top-1/2 flex min-h-24 w-44 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-[3px] border-2 border-window-rim bg-window p-2 shadow-[4px_4px_0_var(--color-edge)]">
          {active.foe ? <PixelSprite src={miniUrl(active.foe.dexId)} size={64} sheet alt="" />
            : active.npc ? <img src={`${ASSET}sprites/trainers/${active.npc.spriteKey}.png`} width={64} height={64} alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" />
              : <PanelGlyph />}
          <span className="text-base">{active.npc?.name ?? (active.foe ? speciesName(active.foe.dexId) : 'Stone panels')}</span>
          <span className="text-sm text-accent">Resume encounter ›</span>
        </button>}
      </MeadowScene>
      <div role="group" aria-label="Actions" className="grid grid-cols-3 gap-2 border-t-2 border-window-frame p-2">
        {BOARD_CARDS.map((entry) => {
          const selected = card === entry.kind;
          return <button key={entry.kind} type="button" aria-pressed={selected} disabled={starting || Boolean(active)} onClick={() => setCard(entry.kind)}
            className={`ui-focus relative flex min-h-24 flex-col items-center justify-between gap-1 rounded-[3px] border-2 bg-slot px-1 py-2 disabled:opacity-75 ${selected ? 'border-accent' : 'border-window-frame enabled:hover:border-window-rim'}`}>
            <span className="grid h-16 place-items-center"><CardArt kind={entry.kind} /></span>
            <span className={`text-center font-label text-[9px] uppercase leading-tight ${selected ? 'text-accent' : 'text-ink'}`}>{entry.label}</span>
            {entry.kind === 'quest' && claimable && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-[3px] border border-edge bg-accent font-label text-[10px] text-edge"><span aria-hidden="true">!</span><span className="sr-only">Reward ready</span></span>}
          </button>;
        })}
      </div>
      <div aria-live="polite" className="border-t-2 border-window-frame p-3">
        {starting ? <p className="text-sm text-ink-dim">Begin with {ROUTE_RULES.initialActions} actions and {ROUTE_RULES.starterBalls} Poké Balls.{state.legacy.pending ? ' Your previous journey’s rewards will be saved first.' : ''}</p>
          : card === 'quest' && !active ? <QuestPicker quests={state.quests} picked={quest?.id ?? null} disabled={locked} onPick={setPicked} />
            : <p className="text-sm text-ink-dim">{cardDescription(card, state.inventory)}</p>}
        <BoardButton state={state} card={card} quest={quest} party={party} busy={busy} locked={locked} onRun={run} />
      </div>
    </section>
    <PartyStrip party={party} active={Boolean(active)} onEditParty={onEditParty} />
    {state.result && !active && <div className="mx-2 mt-4"><button type="button" onClick={onResult} className="ui-button ui-focus min-h-11 w-full px-3 text-sm">View your last encounter ›</button></div>}
    <PreviousJourney state={state} locked={locked} onDismiss={onDismissLegacy} />
  </>;
}

/** The concept's Travel and Actions chips, with the wait for the next action below its cap. */
function StaminaChips({ state }: { state: RouteState }) {
  const now = useServerClock(state.serverNow);
  const next = state.allowance.nextRefillAt;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-window-frame px-3 py-2">
    <span className="font-label text-[9px] uppercase text-info">Route 01</span>
    <span className="flex flex-wrap items-center justify-end gap-1 font-label text-[10px] uppercase">
      <span className={`border border-window-rim bg-slot px-2 py-1 ${state.travel.available < 0 ? 'text-danger' : 'text-ink'}`}>Travel {state.travel.available}/{state.travel.capacity}</span>
      <span className="border border-window-rim bg-slot px-2 py-1 text-ink">Actions {state.allowance.available}/{state.allowance.capacity}</span>
      {next !== null && <span className="text-ink-dim">+1 in {waitText(Math.max(0, next - now))}</span>}
    </span>
  </div>;
}

/** The button and its reason, on a clock of their own so the scene doesn't re-render every second. */
function BoardButton({ state, card, quest, party, busy, locked, onRun }: {
  state: RouteState; card: SearchKind; quest: RouteQuestView | null; party: OwnedMon[]; busy: boolean; locked: boolean; onRun: (action: BoardAction) => void;
}) {
  const now = useServerClock(state.serverNow);
  const cta = boardCta({ state, card, quest, partySize: party.length, partyDown: party.length > 0 && party.every(isFainted), busy, now });
  return <>
    {cta.reason && <p className="mt-2 text-sm text-accent">{cta.reason}</p>}
    <button type="button" disabled={!cta.enabled || (locked && cta.action.type !== 'resume')} onClick={() => onRun(cta.action)}
      className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">{cta.label}</button>
  </>;
}

/** Each card's picture, from existing sprites and Night icons. */
function CardArt({ kind }: { kind: SearchKind }) {
  switch (kind) {
    case 'wild': return <PixelSprite src={miniUrl(161)} size={64} sheet alt="" />;
    case 'trainer': return <img src={`${ASSET}sprites/trainers/random-youngster.png`} width={64} height={64} alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" />;
    case 'puzzle': return <PanelGlyph />;
    case 'quest': return <PixelSprite src={`${ASSET}sprites/ui/night/96/field-journal.png`} size={48} alt="" />;
    case 'explore': return <PixelSprite src={`${ASSET}sprites/ui/night/96/explore.png`} size={48} alt="" />;
    case 'forage': return <span className="flex items-end gap-1"><PixelSprite src={`${ASSET}sprites/items/honey.png`} size={30} alt="" /><PixelSprite src={`${ASSET}sprites/items/tiny-mushroom.png`} size={30} alt="" /></span>;
  }
}

/** A tiny panel board, gap last: the Puzzle card's picture. */
function PanelGlyph() {
  return <span aria-hidden="true" className="grid h-12 w-12 grid-cols-3 gap-px border-2 border-edge bg-edge">
    {[1, 2, 3, 4, 5, 6, 7, 8, 0].map((value) => <span key={value} className={value === 0 ? 'bg-slot' : 'bg-no-repeat'} style={value === 0 ? undefined : panelStyle('sunflowers', value, 3)} />)}
  </span>;
}

/** The Quest card's pick list: every quest with its next step. */
function QuestPicker({ quests, picked, disabled, onPick }: { quests: RouteQuestView[]; picked: QuestId | null; disabled: boolean; onPick: (id: QuestId) => void }) {
  return <fieldset disabled={disabled}>
    <legend className="font-label text-[9px] uppercase text-info">Your quests</legend>
    <ul className="mt-2 space-y-2">{quests.map((q) => <li key={q.id}>
      <label className={`flex min-h-11 items-center gap-2 rounded-[3px] border-2 bg-slot px-2 py-1 text-sm ${picked === q.id ? 'border-accent' : 'border-window-frame'} ${q.next ? '' : 'text-ink-dim'}`}>
        <input type="radio" name="board-quest" value={q.id} checked={picked === q.id} disabled={!q.next} onChange={() => onPick(q.id)} className="ui-focus h-4 w-4 shrink-0 accent-accent" />
        <span className="min-w-0 flex-1"><span className="block">{QUEST_NAMES[q.id]}</span><span className="block text-xs text-ink-dim">{questLine(q)}</span></span>
      </label>
    </li>)}</ul>
  </fieldset>;
}

/** The saved party at a glance, with HP. Editing opens the party screen. */
function PartyStrip({ party, active, onEditParty }: { party: OwnedMon[]; active: boolean; onEditParty: () => void }) {
  return <section className="ui-window m-2 mt-4 p-3" aria-label="Your party">
    <div className="flex items-center justify-between gap-2"><h2 className="font-label text-[11px] uppercase text-info">Your party</h2><button type="button" onClick={onEditParty} className="ui-button ui-focus min-h-11 px-3 font-label text-[9px] uppercase">Edit party</button></div>
    {party.length === 0 ? <p className="mt-2 text-sm text-ink-dim">Choose a Pokémon to start exploring.</p>
      : <ol className="mt-3 grid grid-cols-3 gap-2">{party.map((mon) => <li key={mon.id} className="flex min-w-0 flex-col items-center rounded-[3px] bg-slot p-2">
        <PixelSprite src={ownedMonToCreature(mon)?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt="" />
        <span className="mt-1 w-full truncate text-center text-sm">{monName(mon)}</span>
        <div className="mt-1 w-full"><HpBar mon={mon} /></div>
      </li>)}</ol>}
    {active && <p className="mt-3 text-sm text-ink-dim">Your encounter keeps its starting party. Edits apply to your next search.</p>}
  </section>;
}

/** A journey from the retired idle game, saved before the route update. */
function PreviousJourney({ state, locked, onDismiss }: { state: RouteState; locked: boolean; onDismiss: (id: string) => void }) {
  const result = state.legacy.result;
  if (!state.legacy.notice && !result) return null;
  return <details className="ui-window m-2 mt-4 p-3"><summary className="ui-focus min-h-8 rounded-[3px] font-label text-[10px] uppercase text-info">Your previous journey</summary>
    {state.legacy.notice && <p className="mt-2 text-sm">{state.legacy.notice}</p>}
    {result && <>
      <p className="mt-2 text-sm">{result.wins} battles won · {formatDuration(result.elapsedMs)}. Rewards and discoveries are saved.</p>
      {result.members.map((member) => <div key={member.id} className="mt-2 text-sm"><p>{speciesName(member.after.dexId)}: +{member.expGained} EXP</p><ExpBar level={member.after.level} exp={member.after.exp} />{growthLines(member, speciesName(member.after.dexId)).map((line) => <p key={line} className="text-accent">{line}</p>)}</div>)}
      {result.newSeen.length > 0 && <p className="mt-2 text-sm">First seen: {result.newSeen.map(speciesName).join(', ')}.</p>}
      {result.newLandmarks.length > 0 && <p className="mt-2 text-sm">Landmarks: {result.newLandmarks.map((id) => routeById(result.locationId)?.landmarks.find((landmark) => landmark.id === id)?.name ?? id).join(', ')}.</p>}
      <button type="button" disabled={locked} onClick={() => onDismiss(result.id)} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 text-sm">Dismiss previous journey</button>
    </>}
  </details>;
}
```

- [ ] **Step 5: Wire it into RouteScreen**

In `src/components/world/RouteScreen.tsx`:
- Add `QuestId` to the `../../game/route-actions` type import.
- Replace `import { SunnyMeadow } from './SunnyMeadow';` with `import { RouteBoard } from './RouteBoard';`.
- Replace `export type WorldEntry = { place: 'r1'; focus?: 'encounter' | 'result' | 'survey' } | TownEntry;` with
  `export type WorldEntry = { place: 'r1'; focus?: 'encounter' | 'result' | 'quest' } | TownEntry;`.
- Replace the `search` function with:
  ```tsx
  const search = (kind: SearchKind, questId?: QuestId) => {
    if (locked) return;
    void submit({ operation: 'search', input: { requestId: newRouteRequestId(), locationId: 'r1', kind, partyIds, ...(questId ? { questId } : {}) } });
  };
  ```
- Directly before `return <div className="mx-auto min-h-[100dvh] ...`, add
  `const boardShown = page === 'r1' && !awayFrom;`. Then replace
  `{page !== 'encounter' && trainerBar && <div className="m-2">{trainerBar}</div>}` with
  `{page !== 'encounter' && !boardShown && trainerBar && <div className="m-2">{trainerBar}</div>}`.
  The board has its own Travel and Actions chips.
- Replace the whole `{page === 'r1' && !awayFrom && <SunnyMeadow ... />}` element with:
  ```tsx
      {boardShown && <RouteBoard state={state} party={party} locked={locked} busy={busy}
        focusQuest={entry?.place === 'r1' && entry.focus === 'quest'}
        onSearch={search} onActivate={() => void submit({ operation: 'activate', input: { requestId: newRouteRequestId() } })}
        onResume={() => { setResultOnly(false); setPage('encounter'); scrollToTop(); }}
        onResult={() => { setResultOnly(true); setPage('encounter'); scrollToTop(); }}
        onEditParty={onEditParty} onCenter={openCenter} onRefresh={() => void refresh()}
        onClaim={() => void submit({ operation: 'quest-claim', input: { requestId: newRouteRequestId(), questId: 'meadow-survey' } })}
        onDismissLegacy={(id) => void dismissLegacy(id)} />}
  ```

In `src/components/world/place-highlights.ts`, change the `focus` type to `'encounter' | 'result' | 'quest'`, and
every `focus: 'survey'` to `focus: 'quest'`.

In `scripts/route-client.test.ts`, change `h.focus === 'survey'` to `h.focus === 'quest'`, and the
`?.focus === 'survey'` in "earned survey rewards link to the survey" to `?.focus === 'quest'`.

Delete `src/components/world/SunnyMeadow.tsx`. First run `grep -rn "SunnyMeadow" src` and confirm that only
`RouteScreen.tsx` referenced it.

- [ ] **Step 6: Run the focused checks**

Run: `npx tsx scripts/route-client.test.ts && npx tsc -b && npm run lint`
Expected: `0 failed`, and tsc and oxlint are clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/world/RouteBoard.tsx src/components/world/puzzle-art.ts src/components/world/MeadowScene.tsx src/components/world/RouteScreen.tsx src/components/world/place-highlights.ts src/components/world/SunnyMeadow.tsx scripts/route-client.test.ts scripts/build-night-icon-sizes.py public/sprites/ui/night/96/field-journal.png
git commit -m "Show Sunny Meadow as an action board: the meadow scene, six cards and one button that states its cost"
```

---

### Task 7: The puzzle screen, results and Hub highlights

**Files:**
- Create: `src/components/world/PuzzleView.tsx`
- Modify: `src/components/world/RouteScreen.tsx`, `RouteResultView.tsx`, `route-copy.ts`, `place-highlights.ts`, `MeadowEncounter.tsx`
- Modify: `src/components/HubActivity.tsx`
- Modify: `scripts/route-client.test.ts`

**Interfaces:**
- Consumes: `PublicPuzzle`, `applyMove`, `isSolved`, `neighbours`, `panelStyle`, `scenePreviewStyle`, and
  `RouteQuestView['progress']`.
- Produces:
  - `PuzzleView({ puzzle, busy, locked, onSolve(moves), onLeave })`;
  - `nothingLine(eventId): string` in `route-copy.ts`;
  - `RouteResultView` gains a `surveyProgress?` prop;
  - `PlaceHighlight.kind` now includes `'puzzle'`.

- [ ] **Step 1: Write the failing copy and highlight tests**

In `scripts/route-client.test.ts`, add `nothingLine` to the `route-copy.js` import, and add these checks after the
existing highlight checks:

```ts
check('the empty-Explore line is stable for an encounter and varies between encounters', nothingLine('evt-1') === nothingLine('evt-1') && new Set(['a', 'b', 'c', 'd'].map(nothingLine)).size === 4);
const panelsEvent: RouteEvent = { ...wild, id: 'panels', kind: 'puzzle', phase: 'puzzle', foe: null, newSeen: [], choices: ['solve', 'leave'], catchChances: null,
  puzzle: { size: 3, board: [1, 2, 3, 4, 5, 6, 7, 0, 8], scene: 'signpost', reward: [{ itemId: 'great', quantity: 1 }] } };
check('an open puzzle is a highlight that resumes it', placeHighlights({ ...state, activeEvent: panelsEvent })[0]?.kind === 'puzzle' && placeHighlights({ ...state, activeEvent: panelsEvent })[0]?.focus === 'encounter');
const treeFound: RouteState = { ...state, quest: { ...state.quest, status: 'active', landmarks: ['signpost'] },
  quests: [...state.quests, { id: 'honey-tree', status: 'active', next: { step: 'spread-honey', actions: 1, items: [{ itemId: 'honey', quantity: 1 }] }, progress: null }] };
check('a found Honey Tree invites a first Spread Honey', placeHighlights(treeFound).some((h) => h.label === 'The Honey Tree' && h.focus === 'quest'));
check('a Honey Tree that has drawn a Pokémon stops advertising', !placeHighlights({ ...treeFound, quests: treeFound.quests.map((q) => (q.id === 'honey-tree' ? { ...q, status: 'claimed' as const } : q)) }).some((h) => h.label === 'The Honey Tree'));
check('two quest highlights stay distinct for the Hub list', new Set(placeHighlights(treeFound).map((h) => `${h.kind}:${h.label}`)).size === placeHighlights(treeFound).length && placeHighlights(treeFound).filter((h) => h.kind === 'quest').length === 2);
```

Run: `npx tsx scripts/route-client.test.ts`
Expected: FAIL (`nothingLine` is missing, and there is no puzzle or Honey Tree highlight yet).

- [ ] **Step 2: Copy and highlights**

In `src/components/world/route-copy.ts`, append:

```ts
const NOTHING_LINES = [
  'Only the wind in the tall grass.',
  'A Pidgey feather drifts by. Nothing else turns up.',
  'You followed a rustle, but it was just the breeze.',
  'The meadow is quiet for now.',
] as const;

/** Explore's empty result: one line per encounter, the same every time it is shown. */
export function nothingLine(eventId: string): string {
  const sum = [...eventId].reduce((total, ch) => total + ch.charCodeAt(0), 0);
  return NOTHING_LINES[sum % NOTHING_LINES.length];
}
```

In `src/components/world/place-highlights.ts`:
- Change the `kind` type to `'sighting' | 'person' | 'discovery' | 'quest' | 'puzzle'`.
- After the first `if (active?.kind === 'wild' && active.foe) { ... }` block, insert:
  ```ts
  } else if (active?.kind === 'puzzle') {
    highlights.push({ kind: 'puzzle', label: 'Stone panels', detail: 'A sliding puzzle is waiting for you in the meadow.', focus: 'encounter' });
  ```
- Replace the active-survey detail `` `${found} of ${quest.required.length} landmarks recorded. Follow the trail to find more.` `` with
  `` `${found} of ${quest.required.length} landmarks recorded. Survey the rest from the Quest card.` ``.
- Replace `'Look for the Meadow Researcher on the path to start a survey.'` with
  `'Meet the Meadow Researcher from the Quest card to start a survey.'`.
- Before `return highlights;`, add:
  ```ts
  // A found Honey Tree that has never drawn a Pokémon.
  if (state.quests.find((q) => q.id === 'honey-tree')?.status === 'active') {
    highlights.push({ kind: 'quest', label: 'The Honey Tree', detail: 'Spread Honey on the old tree to see who comes.', focus: 'quest' });
  }
  ```

In `src/components/HubActivity.tsx`, change `key={highlight.kind}` to `key={`${highlight.kind}:${highlight.label}`}`.

- [ ] **Step 3: The puzzle screen**

Create `src/components/world/PuzzleView.tsx`:

```tsx
import { useId, useState } from 'react';
import { itemById } from '../../game/items';
import type { PublicPuzzle } from '../../game/route-actions';
import { applyMove, isSolved, neighbours } from '../../game/sliding-puzzle';
import { panelStyle, scenePreviewStyle } from './puzzle-art';

/** Which way a panel next to the gap would slide. */
function direction(index: number, gap: number, size: number): 'up' | 'down' | 'left' | 'right' {
  if (index === gap - size) return 'down';
  if (index === gap + size) return 'up';
  return index === gap - 1 ? 'right' : 'left';
}

const rewardText = (puzzle: PublicPuzzle) => puzzle.reward.map((item) => {
  const def = itemById(item.itemId);
  return `${item.quantity} ${item.quantity === 1 ? def?.name ?? item.itemId : def?.plural ?? item.itemId}`;
}).join(', ');

/**
 * A sliding-panel puzzle. Slides stay on this screen; once the picture is whole the move list goes to the server,
 * which replays it from its own copy of the board. Reopening the puzzle starts from that board again.
 */
export function PuzzleView({ puzzle, busy, locked, onSolve, onLeave }: {
  puzzle: PublicPuzzle;
  busy: boolean;
  locked: boolean;
  onSolve: (moves: number[]) => void;
  onLeave: () => void;
}) {
  const heading = useId();
  const [play, setPlay] = useState(() => ({ board: [...puzzle.board], moves: [] as number[] }));
  const { size } = puzzle;
  const gap = play.board.indexOf(0);
  const movable = neighbours(gap, size);
  const solved = isSolved(play.board);
  const cell = 100 / size;
  const slide = (index: number) => {
    const board = locked || solved ? null : applyMove(play.board, index);
    if (!board) return;
    const moves = [...play.moves, index];
    setPlay({ board, moves });
    if (isSolved(board)) onSolve(moves);
  };

  return <section className="ui-window m-2" aria-labelledby={heading} aria-busy={busy}>
    <div className="flex items-center justify-between gap-2 border-b-2 border-window-frame px-3 py-2">
      <h2 id={heading} className="font-label text-[10px] uppercase text-info">Stone panels</h2>
      <span role="status" className="font-label text-[10px] uppercase text-ink">{solved ? 'Solved!' : `Moves ${play.moves.length}`}</span>
    </div>
    <div className="p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="h-16 w-16 shrink-0 border-2 border-edge bg-no-repeat" style={scenePreviewStyle(puzzle.scene)} />
        <div className="min-w-0 text-sm"><p>Slide the panels back into the picture.</p><p className="mt-1 text-ink-dim">Tap a panel beside the gap. Reward: <span className="text-accent">{rewardText(puzzle)}</span></p></div>
      </div>
      <div role="group" aria-label="Puzzle board" className="relative mx-auto mt-3 aspect-square w-full max-w-[320px] border-2 border-edge bg-slot">
        {play.board.map((value, index) => value === 0 ? null : <button key={value} type="button"
          disabled={locked || solved || !movable.includes(index)} onClick={() => slide(index)}
          aria-label={!solved && movable.includes(index) ? `Panel ${value}, slide ${direction(index, gap, size)}` : `Panel ${value}`}
          className="ui-focus absolute border border-edge bg-no-repeat motion-safe:transition-[left,top] motion-safe:duration-150 motion-safe:ease-[steps(3)]"
          style={{ ...panelStyle(puzzle.scene, value, size), left: `${(index % size) * cell}%`, top: `${Math.floor(index / size) * cell}%`, width: `${cell}%`, height: `${cell}%` }}>
          <span aria-hidden="true" className="absolute left-0 top-0 bg-edge px-1 font-label text-[9px] text-ink">{value}</span>
        </button>)}
      </div>
      {solved && <button type="button" disabled={locked} onClick={() => onSolve(play.moves)} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Checking…' : 'Submit solution'}</button>}
      <button type="button" disabled={locked} onClick={onLeave} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 text-sm">Give up (no reward)</button>
    </div>
  </section>;
}
```

- [ ] **Step 4: Route puzzles and moves through RouteScreen**

In `src/components/world/RouteScreen.tsx`:
- Add `import { PuzzleView } from './PuzzleView';`.
- Replace the `choose` function with:
  ```tsx
  const choose = (choice: RouteChoice, ballId?: CaptureBallId, moves?: number[]) => {
    if (!event || locked) return;
    void submit({ operation: 'choose', input: { requestId: newRouteRequestId(), eventId: event.id, expectedRevision: event.revision, choice, ...(ballId ? { ballId } : {}), ...(moves ? { moves } : {}) } });
  };
  ```
- In the encounter branch, replace
  ```tsx
          ? <RouteResultView event={event} box={box} busy={locked} onDone={() => void dismiss(event.id, event.outcome === 'lost' ? 'center' : 'r1')} onReplay={() => { setReplay(event); scrollToTop(); }} />
          : <MeadowEncounter key={event.id}
  ```
  with
  ```tsx
          ? <RouteResultView event={event} box={box} busy={locked} surveyProgress={state.quests.find((q) => q.id === 'meadow-survey')?.progress ?? null}
              onDone={() => void dismiss(event.id, event.outcome === 'lost' ? 'center' : 'r1')} onReplay={() => { setReplay(event); scrollToTop(); }} />
          : event.phase === 'puzzle' && event.puzzle
            // Keyed by encounter: reopening a puzzle starts again from the board the server stored.
            ? <PuzzleView key={event.id} puzzle={event.puzzle} busy={busy} locked={locked} onSolve={(moves) => choose('solve', undefined, moves)} onLeave={() => choose('leave')} />
            : <MeadowEncounter key={event.id}
  ```

- [ ] **Step 5: Results for the new finds**

In `src/components/world/RouteResultView.tsx`:
- In the `./route-copy` import, add `nothingLine` and drop `type ResultFind`. After this change nothing uses it.
- Replace the `FindArt` function's signature and first line with:
  ```tsx
  function FindArt({ event }: { event: RouteEvent }) {
    const icon = (path: string, size: number) => <PixelSprite src={`${import.meta.env.BASE_URL}${path}`} size={size} alt="" className="mt-8" />;
    if (event.kind === 'nothing') return icon('sprites/ui/night/96/explore.png', 96);
    if (event.kind === 'landmark') return icon('sprites/ui/night/96/field-journal.png', 96);
    if (event.kind === 'secret') return icon('sprites/items/honey.png', 90);
    const find = resultFind(event);
  ```
  Keep the rest of the body as it is. It already reads `find`.
- Change its call site from `<FindArt find={resultFind(event)} />` to `<FindArt event={event} />`.
- Add the prop: `surveyProgress?: { done: number; total: number } | null;` in the props type, and
  `surveyProgress = null` in the destructuring.
- Replace the line `const title = event.outcome ? OUTCOME_LABEL[event.outcome] : 'Battle rewards';` with:
  ```tsx
  const title = event.kind === 'secret' ? 'A secret in the meadow!' : event.kind === 'landmark' ? 'Landmark surveyed' : event.outcome ? OUTCOME_LABEL[event.outcome] : 'Battle rewards';
  ```
- Replace the `accepted` and `talked` copy lines with:
  ```tsx
        {event.outcome === 'accepted' && <p className="text-sm">Survey the three landmarks from the Quest card for {ROUTE_RULES.questGreatBalls} Great Balls and {formatMoney(ROUTE_RULES.questMoney)}. Earlier discoveries count.</p>}
        {event.outcome === 'talked' && <p className="text-sm">Your survey progress is saved on the Quest card.</p>}
        {event.outcome === 'nothing' && <><p className="text-base">{nothingLine(event.id)}</p><p className="mt-1 text-sm text-ink-dim">Your action is spent. Explore again, or try another card.</p></>}
        {event.kind === 'secret' && <p className="text-base">Bees hum around an old tree by the path. The Honey Tree is in your quests now: spread Honey on it to see who comes.</p>}
        {event.kind === 'landmark' && event.newLandmarks.map((id) => { const landmark = MEADOW_LANDMARKS.find((l) => l.id === id); return landmark ? <p key={id} className="text-base">{landmark.name}: {landmark.blurb}</p> : null; })}
        {event.kind === 'landmark' && surveyProgress && <p className="mt-2 text-sm text-ink-dim">{surveyProgress.done} of {surveyProgress.total} landmarks recorded.</p>}
        {event.questId === 'honey-tree' && event.kind === 'wild' && <p className="mt-2 text-sm text-ink-dim">You spread 1 Honey on the Honey Tree.</p>}
  ```

In `src/components/world/MeadowEncounter.tsx`, replace `'You found every landmark. Claim your reward from the route’s survey.'`
with `'You found every landmark. Claim your reward from the Quest card.'`.

- [ ] **Step 6: Run the focused checks**

Run: `npx tsx scripts/route-client.test.ts && npx tsc -b && npm run lint`
Expected: `0 failed`, and tsc and oxlint are clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/world/PuzzleView.tsx src/components/world/RouteScreen.tsx src/components/world/RouteResultView.tsx src/components/world/route-copy.ts src/components/world/place-highlights.ts src/components/world/MeadowEncounter.tsx src/components/HubActivity.tsx scripts/route-client.test.ts
git commit -m "Play stone-panel puzzles, and show results for forage, empty explores, surveys and the Honey Tree"
```

---

### Task 8: Docs, the full gate, the browser check and review

**Files:**
- Modify: `CHANGELOG.md`, `src/guide/pages/overview.mdx`
- The v2 design doc (Claude Doc): add a row to its decisions log

- [ ] **Step 1: Changelog and guide**

In `CHANGELOG.md` under `## [Unreleased]`:

(a) Replace the whole `- **Sunny Meadow encounters** — ...` line with:

```markdown
- **Sunny Meadow action board** — Sunny Meadow's page is a board: the meadow scene, six action cards, and one button that states its cost. **Wild Pokémon** to battle and catch (EXP, no prize money), **Trainer** for more EXP and ₽200, **Puzzle** to slide stone panels back into a meadow picture for the item it hides, **Quest** to work through the Meadow survey one step at a time, **Explore** for a gamble — a rare Pokémon, a rare item, a secret, or nothing — and **Forage** for Honey and mushrooms. Explore can uncover the Honey Tree: spread Honey on it to draw Combee, Burmy, Heracross or Munchlax. Actions recover every ten minutes up to 48; encounters and results resume across visits.
```

(b) In the Village market line, change `Battle wins, coin pouches, and the Meadow survey pay ₽` to
`Trainer wins, coin pouches, and the Meadow survey pay ₽`.

(c) Remove the `- **Explore finds** — now include harvest goods and coin pouches.` line. Harvest goods are now
Forage's.

(d) In the `- **Home and places** — ...` line, delete the clause `, and trail energy is tucked into a detail panel`
(keep the sentence's final period).

In `src/guide/pages/overview.mdx`, replace the paragraph that begins `Open the world map to visit Hearth Town or Route 1 · Sunny Meadow.`
with:

```markdown
Open the world map to visit Hearth Town or Route 1 · Sunny Meadow. The meadow is a board of six actions —
**Wild Pokémon**, **Trainer**, **Puzzle**, **Quest**, **Explore** and **Forage** — and each costs one action.
Your allowance starts at 12, recovers one action every ten minutes, and holds up to 48. Finishing an encounter
costs no additional actions. Time away refills the allowance but never battles or earns rewards for you.

Trainers pay ₽200 when you win; wild Pokémon pay no prize money. A puzzle is a 3×3 board of stone panels: slide
them back into the meadow picture to earn the item shown. Quests advance one step per action, and the Meadow
survey's reward is free to claim. Explore can find a rare Pokémon, a rare item, a secret — or nothing. Forage
always finds Honey or a mushroom to sell at the market.
```

- [ ] **Step 2: The full gate**

Run: `npm run lint && npm test && npm run build`
Expected: every step passes. Record the tested HEAD and the outputs. Separate any pre-existing failures from
regressions.

- [ ] **Step 3: Review**

Run the repository's `reviewer` subagent on the branch diff (`git diff development...route-action-board`). The diff
touches route rules and the save format. Fix its P0 and P1 findings with tests, rerun Step 2, and commit the fixes
separately.

- [ ] **Step 4: Merge locally, then the browser check**

As the lead, fast-forward `development` to `route-action-board` in the main checkout:
`git checkout development && git merge --ff-only route-action-board`. The main checkout's uncommitted
`CatchSequence` edits do not overlap this branch, so the merge is safe.

Run the stack on ports that aren't the owner's: a production build on :3100 and the dev API on :3101. Use a scratch
database (`TURSO_DATABASE_URL=file:<scratchpad>/board.db`) and an explicit `AUTH_SECRET`. First confirm that
`.env.local` holds a `file:` URL, because `.env` points at production. Then check at 320, 375 and 430 px:

- the board shows the chips, the scene, six cards and the CTA, and at 375×667 the CTA is visible without scrolling;
- every CTA label and disabled state appears: no actions, no party, fainted party, an open encounter, no quest step,
  and Spread Honey without Honey;
- a forage, an empty Explore, a trainer battle, and a wild catch;
- a puzzle solved by touch and again by keyboard (Tab and Enter), Give up, reopening mid-puzzle (it restarts from
  the stored board), and the reduced-motion jump;
- the survey: meet, survey, claim. The Honey Tree: found, Spread Honey, and the encounter;
- the Hub highlights open the right page;
- no horizontal scroll, and no numeric levels.

If no browser tool is available, report the browser check as **not done**. Don't call it passed.

- [ ] **Step 5: Changelog commit**

```bash
git add CHANGELOG.md src/guide/pages/overview.mdx
git commit -m "Describe the Sunny Meadow action board in the changelog and the guide"
```

The decisions-log row in the v2 design doc was added during planning (doc revision 30). If the shipped balance
values differ from the spec, amend that row.

- [ ] **Step 6: Report**

Report:
- what changed;
- the gate's results with the HEAD;
- the browser check's evidence, or that it was not done;
- the reviewer's findings and how each was handled;
- the state: committed on `development`, not pushed.

Ask the owner before pushing. No `db:setup` is needed.
