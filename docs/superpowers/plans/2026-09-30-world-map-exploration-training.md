# World Map, Exploration, and Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable loop: a saved party, an illustrated Hearthvale map, resumable expeditions, and idle training, with server-authoritative, exactly-once rewards and persistent progression.

**Architecture:** Pure, seeded rules in `src/game/` (region data, wilds, training, expeditions, growth seam) run on the server; `api/_world.ts` orchestrates them over `api/_db.ts` SQL inside write transactions; `api/world/[action].ts` is a thin dispatcher; Night-styled React screens render server views through `src/game/world-client.ts`. Both modes live in `idle_sessions`, whose partial unique index already allows one open activity per user.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind v4 (Night tokens), Vercel functions, libSQL/Turso, Upstash rate limits, tsx test scripts.

**Spec:** `docs/superpowers/specs/2026-09-30-world-map-exploration-training-design.md`

## Global Constraints

- Runtime relative imports in `src/game/` and `api/` end in `.js`; `import type` may omit it.
- No new runtime dependency. The PNG generator uses Node `zlib` only.
- Never hand-edit generated output (`*.gen.ts`, `public/sprites/world/*.png` come from `scripts/build-world-map.ts`).
- API order per `.agents/rules/api.md`: `requirePost` → `gate` → `rateLimit` → validate `unknown` → work. JSON `{ ok: true, ... }` / `{ ok: false, error }`; `error` is a short player-facing sentence; log `[world/<action>] failed:`.
- SQL only in `api/_db.ts`, parameterised, scoped by `user_id`; the only interpolation is a generated placeholder list.
- Schema changes are additive: new tables in `db/schema.sql`, new columns in `COLUMN_ADDS`; no index on a new column in `schema.sql`.
- Do not edit `src/game/levels.ts`, `src/game/evolution.ts`, or `ownedMonToCreature` (growth overhaul seams).
- Levels reach the screen only through `formatLevel` and `formatRecommended` (`src/game/world.ts`).
- Night styling per `.agents/rules/styling.md`: tokens only, `ui-window`, `ui-button ui-focus`, `font-pixel` ≥ 12 px, `font-label` 8–11 px uppercase, pixel art at native size or whole multiples, animations off under `prefers-reduced-motion`, tap targets ≥ 44 px.
- Layout: centred column `max-w-[430px]`, 16 px gutters, no horizontal scroll 320–430 px, `env(safe-area-inset-bottom)` padding on bottom panels.
- Tests: `tsx` scripts with the `check(label, ok)` harness, temp **file** databases under `os.tmpdir()`, appended to `npm test`.
- Git: work on `development`; **no commits or pushes** until the owner asks (commit steps below are checkpoints: run the focused checks instead). Another session edits this checkout: re-run `git status` before touching `CHANGELOG.md`, `App.tsx`, `HubScreen.tsx`, `package.json`, `README.md`, `AGENTS.md`; never stage or revert its files.
- Local runs: `.env` is production. Browser checks use `TURSO_DATABASE_URL=file:<scratchpad>/verify.db`; never touch `local.db` or production.

## Review Focus

1. A training session started long ago whose party member was renamed mid-session: settlement must keep the new nickname and apply EXP to the current row (test in Task 6).
2. A legacy open `idle_sessions` row (no `mode`, no snapshot) blocking every new start: `state` must surface it and `finish` must settle it (test in Task 6).
3. Two tabs answering the same checkpoint with different choices at the same time: exactly one resolves; the other gets 409 with the resolved state, never a second battle (test in Task 6).
4. A response lost after a terminal step commits: the retry must return the stored result and event, and EXP must be applied once (test in Task 6).
5. A database that has not run `db:setup`: `world/state` returns 503 with a player sentence; `me/profile` and `me/box` keep working (test in Task 7).

---

## File map

| File | Responsibility |
|---|---|
| `src/game/world.ts` | Region types, lookups, unlock/state rules, falloff, rating, battle counts, mastery, level display seams |
| `src/game/world-places.ts` | Authored Hearthvale content (places, pools, landmarks, expedition templates, guardians, map positions) |
| `src/game/wilds.ts` | Wild seam: `buildWild`, pool picks, guardian rolls, `WildView` |
| `src/game/training.ts` | Training simulation over a frozen config |
| `src/game/expedition.ts` | Expedition state machine: checkpoints, choices, resolution, replay |
| `src/game/activity.ts` | Frozen config, snapshot normaliser, growth seam, result and public view types |
| `src/game/party.ts` | Party input parsing, resolution, client `saveParty` |
| `src/game/world-client.ts` | Fetch helpers for `/api/world/*` |
| `api/_db.ts` | Column adds, activity/progress/discovery/party SQL, `openWriteTx` |
| `api/_world.ts` | Domain: state, start, step, finish, dismiss, party save, views, settlement |
| `api/world/[action].ts` | Dispatcher |
| `api/me/[action].ts` | `party` action, `profile.party`, box status codes |
| `db/schema.sql` | `world_progress`, `world_discoveries`, comments |
| `scripts/dev-api.ts` | Route `world` |
| `scripts/build-world-map.ts` | Region art generator → `public/sprites/world/hearthvale.png` |
| `scripts/world.test.ts` | Pure rules + balance gates |
| `scripts/world-db.test.ts` | Domain over a temp file DB |
| `scripts/world-api.test.ts` | Handlers through a req/res shim |
| `scripts/world-test-kit.ts` | Temp DB, fake req/res, session cookie helpers (not a test) |
| `scripts/world-balance.ts` | Win-rate report for tuning (not in `npm test`) |
| `src/components/PartyScreen.tsx` | Party editor |
| `src/components/HubParty.tsx` | Saved party window (modify) |
| `src/components/HubActivity.tsx` | Hub activity card + World map entry |
| `src/components/world/WorldScreen.tsx` | Map screen shell: map, list, panel, start flows |
| `src/components/world/WorldMap.tsx` | Pan/zoom viewport with markers |
| `src/components/world/PlacePanel.tsx` | Place details and start confirmation |
| `src/components/world/ExpeditionScreen.tsx` | Checkpoints, choices, trail |
| `src/components/world/BattleReplay.tsx` | Compact Night battle view over a server event log |
| `src/components/world/TrainingScreen.tsx` | Training scene and status |
| `src/components/world/ResultsScreen.tsx` | Settlement results |
| `src/components/world/scene.ts` | Backdrop URL, place icons/labels, copy formatters for growth |
| `src/App.tsx`, `src/game/box.ts`, `src/game/profile.ts` | Phases, hydration, expired sessions, `fetchBox` result |

---

## Slice 1 — Shared contract

### Task 1: Region data and rules (`world.ts`, `world-places.ts`)

**Files:**
- Create: `src/game/world.ts`, `src/game/world-places.ts`, `scripts/world.test.ts`
- Modify: `package.json` (append `&& tsx scripts/world.test.ts` to `test`)

**Interfaces:**
- Produces (exact):

```ts
export type PlayableId = 'r1' | 'r2' | 'lake' | 'quarry' | 'trail' | 'ruins';
export type LocationId = 'home' | PlayableId;
export type Biome = 'town' | 'meadow' | 'forest' | 'lakeside' | 'quarry' | 'mountain' | 'ruins';
export interface LevelRange { min: number; max: number }
export interface PoolEntry { dexId: number; weight: number; rare?: boolean }
export interface WildRules extends LevelRange { statMult: number; pool: readonly PoolEntry[] }
export interface TrainingRules { paceMs: number; maxEncounters: number; expPerWin: number }
export interface ExploreRules { expPerWin: number; clearBonus: number }
export interface GuardianSpec { dexId: number; level: number; statMult: number; title: string }
export interface Landmark { id: string; name: string; blurb: string }
export type NodeKind = 'battle' | 'sighting' | 'landmark' | 'fork' | 'guardian';
export type ChoiceId = 'fight' | 'observe' | 'challenge' | 'investigate' | 'press-on' | 'a' | 'b' | 'retreat';
export interface BattleNode { kind: 'battle'; id: string; title: string; text: string; next: string; levelBonus?: number; rareBoost?: number }
export interface SightingNode { kind: 'sighting'; id: string; title: string; text: string; next: string; levelBonus?: number; rareBoost?: number }
export interface LandmarkNode { kind: 'landmark'; id: string; title: string; text: string; next: string; landmark: string; guardedChance: number; levelBonus?: number }
export interface ForkOption { id: 'a' | 'b'; label: string; hint: string; next: string }
export interface ForkNode { kind: 'fork'; id: string; title: string; text: string; options: readonly [ForkOption, ForkOption] }
export interface GuardianNode { kind: 'guardian'; id: string; title: string; text: string }
export type ExpeditionNode = BattleNode | SightingNode | LandmarkNode | ForkNode | GuardianNode;
export interface ExpeditionTemplate { start: string; nodes: Readonly<Record<string, ExpeditionNode>> }
export interface HomePlace { kind: 'home'; id: 'home'; name: string; biome: Biome; blurb: string; map: { x: number; y: number }; neighbours: readonly LocationId[] }
export interface RoutePlace { kind: 'route'; id: PlayableId; routeLabel?: string; name: string; biome: Biome; blurb: string; map: { x: number; y: number }; neighbours: readonly LocationId[]; unlock: readonly PlayableId[]; recommended: LevelRange; wild: WildRules; training: TrainingRules; explore: ExploreRules; guardian: GuardianSpec; landmarks: readonly Landmark[]; expedition: ExpeditionTemplate; backdrop: string }
export type Place = HomePlace | RoutePlace;
export const WORLD_RULES_VERSION = 1;
export const TRAINING_CAP_MS = 8 * 60 * 60 * 1000;
export const MAP_SIZE = { width: 384, height: 576 } as const;
export const ROUTES: readonly RoutePlace[];
export function placeById(id: unknown): Place | null;
export function routeById(id: unknown): RoutePlace | null;
export function isPlayableId(v: unknown): v is PlayableId;
export function placeTitle(p: Place): string;              // "Route 1 · Sunny Meadow"
export interface PlaceProgress { clearedAt: number | null; explores: number; clears: number; trainings: number; trainingWins: number; landmarks: readonly string[]; seen: readonly number[] }
export const EMPTY_PROGRESS: PlaceProgress;
export function isUnlocked(route: RoutePlace, cleared: ReadonlySet<string>): boolean;
export type PlaceState = 'undiscovered' | 'locked' | 'available' | 'discovered' | 'completed';
export function placeState(route: RoutePlace, progress: PlaceProgress, cleared: ReadonlySet<string>): PlaceState;
export function newlyUnlocked(before: ReadonlySet<string>, after: ReadonlySet<string>): PlayableId[];
export function unlockText(route: RoutePlace): string;
export function expSharePct(level: number, rec: LevelRange): number;   // 100 … 25
export function scaleExp(raw: number, pct: number): number;            // floor(raw * pct / 100)
export type Rating = 'comfortable' | 'even' | 'risky';
export function rateParty(levels: readonly number[], rec: LevelRange): Rating;
export function trainingBattleCount(elapsedMs: number, rules: Pick<TrainingRules, 'paceMs' | 'maxEncounters'>, capMs?: number): number;
export interface Mastery { cleared: boolean; surveyed: boolean; catalogued: boolean; landmarksFound: number; landmarksTotal: number; seenCount: number; speciesTotal: number }
export function masteryOf(route: RoutePlace, progress: PlaceProgress): Mastery;
export function formatLevel(mon: { level: number }): string;         // "Lv 12"
export function formatRecommended(route: RoutePlace): string;        // "Lv 3–8"
```

- [ ] **Step 1: Write the failing test** — `scripts/world.test.ts` sections:
  - `[1] region integrity`: `ROUTES.length === 6`; ids unique; every neighbour exists and the relation is symmetric; every pool `dexId` and guardian `dexId` is in `CREATURES_BY_ID` with `tier === 'normal'`; every pool has exactly one `rare` entry; `wild.min <= wild.max`; `recommended.min < recommended.max`; recommended minimums strictly increase along `r1 → r2 → lake/quarry → trail → ruins`; every expedition node's `next`/option `next` exists; every path from `start` reaches `guardian` in 4–6 checkpoints (walk both fork options); every landmark node's `landmark` is in `route.landmarks`; every landmark appears on some path; map positions lie inside `MAP_SIZE`.
  - `[2] unlocks and states`: with `cleared = ∅`: `r1` available, `r2` locked, `lake`/`quarry`/`trail`/`ruins` undiscovered; after `{r1}`: `r2` available, `lake`/`quarry` locked; `r1` with `explores: 1` is `discovered`; `{r1,r2,quarry,trail}` leaves `ruins` locked with `unlockText` naming Mirror Lake; `newlyUnlocked({r1}, {r1,r2})` equals `['lake','quarry']` in `ROUTES` order (`lake` before `quarry`).
  - `[3] rewards`: `expSharePct(8, {min:3,max:8}) === 100`; `(9) === 85`; `(13) === 25`; `(40) === 25`; `scaleExp(10, 85) === 8`; `rateParty([5], r1.recommended) === 'even'`, `([2]) === 'risky'`, `([9]) === 'comfortable'`, `([]) === 'risky'`.
  - `[4] battle counts`: pace 240000, max 120: `0 → 0`, `239999 → 0`, `240000 → 1`, `8 h → 120`, `9 h → 120`, `-5 → 0`; pace 300000, max 96: `8 h → 96`; with `maxEncounters: 10`, `8 h → 10`.
  - `[5] display seams`: `formatLevel({level: 12}) === 'Lv 12'`; `formatRecommended(r1) === 'Lv 3–8'`; `placeTitle(r1) === 'Route 1 · Sunny Meadow'`.
  - `[6] prototype keys`: `routeById('constructor') === null`, `routeById('__proto__') === null`, `isPlayableId('home') === false`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx scripts/world.test.ts`
Expected: FAIL — `Cannot find module '../src/game/world.js'`.

- [ ] **Step 3: Implement `src/game/world.ts`**

```ts
import { PLACES } from './world-places.js';

// Hearthvale, the one region: its places, how they open up, and the pure rules
// the server and the screens share. The content lives in world-places.ts;
// nothing here reads a clock or a database.

// (type declarations exactly as in Interfaces above)

export const WORLD_RULES_VERSION = 1;
export const TRAINING_CAP_MS = 8 * 60 * 60 * 1000;
export const MAP_SIZE = { width: 384, height: 576 } as const;

export const ROUTES: readonly RoutePlace[] = PLACES.filter((p): p is RoutePlace => p.kind === 'route');
const PLACE_BY_ID = new Map<string, Place>(PLACES.map((p) => [p.id, p]));

export function placeById(id: unknown): Place | null {
  return typeof id === 'string' ? (PLACE_BY_ID.get(id) ?? null) : null;
}

export function routeById(id: unknown): RoutePlace | null {
  const p = placeById(id);
  return p?.kind === 'route' ? p : null;
}

export function isPlayableId(v: unknown): v is PlayableId {
  return routeById(v) !== null;
}

export function placeTitle(p: Place): string {
  return p.kind === 'route' && p.routeLabel ? `${p.routeLabel} · ${p.name}` : p.name;
}

export const EMPTY_PROGRESS: PlaceProgress = { clearedAt: null, explores: 0, clears: 0, trainings: 0, trainingWins: 0, landmarks: [], seen: [] };

export function isUnlocked(route: RoutePlace, cleared: ReadonlySet<string>): boolean {
  return route.unlock.every((id) => cleared.has(id));
}

export function placeState(route: RoutePlace, progress: PlaceProgress, cleared: ReadonlySet<string>): PlaceState {
  if (isUnlocked(route, cleared)) {
    if (cleared.has(route.id)) return 'completed';
    return progress.explores + progress.trainings > 0 ? 'discovered' : 'available';
  }
  const visible = route.neighbours.some((n) => {
    if (n === 'home') return true;
    const r = routeById(n);
    return r !== null && isUnlocked(r, cleared);
  });
  return visible ? 'locked' : 'undiscovered';
}

export function newlyUnlocked(before: ReadonlySet<string>, after: ReadonlySet<string>): PlayableId[] {
  return ROUTES.filter((r) => !isUnlocked(r, before) && isUnlocked(r, after)).map((r) => r.id);
}

export function unlockText(route: RoutePlace): string {
  const names = route.unlock.map((id) => routeById(id)?.name ?? id);
  if (names.length === 0) return 'Open from the start.';
  if (names.length === 1) return `Beat the guardian of ${names[0]}.`;
  return `Beat the guardians of ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}

export const FALLOFF_PER_LEVEL_PCT = 15;
export const FALLOFF_FLOOR_PCT = 25;

export function expSharePct(level: number, rec: LevelRange): number {
  const over = Math.floor(level) - rec.max;
  return over <= 0 ? 100 : Math.max(FALLOFF_FLOOR_PCT, 100 - FALLOFF_PER_LEVEL_PCT * over);
}

export function scaleExp(raw: number, pct: number): number {
  return Math.floor((Math.max(0, Math.floor(raw)) * pct) / 100);
}

export function rateParty(levels: readonly number[], rec: LevelRange): Rating {
  const top = levels.length > 0 ? Math.max(...levels) : 0;
  if (top > rec.max) return 'comfortable';
  return top >= rec.min ? 'even' : 'risky';
}

export function trainingBattleCount(
  elapsedMs: number,
  rules: Pick<TrainingRules, 'paceMs' | 'maxEncounters'>,
  capMs: number = TRAINING_CAP_MS,
): number {
  if (!(rules.paceMs > 0)) return 0;
  const elapsed = Math.max(0, Math.min(elapsedMs, capMs));
  return Math.min(Math.floor(elapsed / rules.paceMs), rules.maxEncounters);
}

export function masteryOf(route: RoutePlace, progress: PlaceProgress): Mastery {
  const landmarksFound = route.landmarks.filter((l) => progress.landmarks.includes(l.id)).length;
  const species = route.wild.pool.map((e) => e.dexId);
  const seenCount = species.filter((d) => progress.seen.includes(d)).length;
  return {
    cleared: progress.clearedAt !== null,
    surveyed: landmarksFound === route.landmarks.length,
    catalogued: seenCount === species.length,
    landmarksFound,
    landmarksTotal: route.landmarks.length,
    seenCount,
    speciesTotal: species.length,
  };
}

// Levels reach the screen only through these two (the growth overhaul hides them here).
export function formatLevel(mon: { level: number }): string {
  return `Lv ${mon.level}`;
}

export function formatRecommended(route: RoutePlace): string {
  return `Lv ${route.recommended.min}–${route.recommended.max}`;
}
```

- [ ] **Step 4: Implement `src/game/world-places.ts`** — the content table from the spec, built with one helper:

```ts
import type { ExpeditionNode, ExpeditionTemplate, Place } from './world.js';

// Hearthvale's authored content. Adding a place is one entry here plus the map
// art (scripts/build-world-map.ts); screens and the API iterate this list.

const MIN = 60 * 1000;

type Step =
  | { kind: 'battle'; title: string; text: string; levelBonus?: number; rareBoost?: number }
  | { kind: 'sighting'; title: string; text: string; levelBonus?: number; rareBoost?: number }
  | { kind: 'landmark'; title: string; text: string; landmark: string; guardedChance: number; levelBonus?: number };
interface Branch { label: string; hint: string; steps: Step[] }

/** Trailhead sighting → fork → branch a or b → guardian. Ids: trailhead, fork, a1…, b1…, guardian. */
function expedition(spec: {
  trailhead: { title: string; text: string };
  fork: { title: string; text: string; a: Branch; b: Branch };
  guardian: { title: string; text: string };
}): ExpeditionTemplate {
  const nodes: Record<string, ExpeditionNode> = {};
  const chain = (prefix: 'a' | 'b', steps: Step[]): string => {
    steps.forEach((s, i) => {
      const id = `${prefix}${i + 1}`;
      nodes[id] = { ...s, id, next: i + 1 < steps.length ? `${prefix}${i + 2}` : 'guardian' };
    });
    return `${prefix}1`;
  };
  nodes.trailhead = { kind: 'sighting', id: 'trailhead', next: 'fork', ...spec.trailhead };
  nodes.fork = {
    kind: 'fork', id: 'fork', title: spec.fork.title, text: spec.fork.text,
    options: [
      { id: 'a', label: spec.fork.a.label, hint: spec.fork.a.hint, next: chain('a', spec.fork.a.steps) },
      { id: 'b', label: spec.fork.b.label, hint: spec.fork.b.hint, next: chain('b', spec.fork.b.steps) },
    ],
  };
  nodes.guardian = { kind: 'guardian', id: 'guardian', ...spec.guardian };
  return { start: 'trailhead', nodes };
}

export const PLACES: readonly Place[] = [ /* home + six routes */ ];
```

Content (initial values; Task 4 tunes numbers only):

| id | map (x,y) | neighbours | unlock | rec | wild min–max ×mult | pool (weight; rare last) | training pace/max/exp | explore exp/bonus | guardian | backdrop |
|---|---|---|---|---|---|---|---|---|---|---|
| home | 196,522 | r1 | — | — | — | — | — | — | — | — |
| r1 | 196,440 | home, r2 | [] | 3–8 | 2–5 ×0.6 | 161·3, 263·3, 16·3, 19·3, 187·2, 191·2, 401·2, 399·2, **133·1** | 4 min/120/6 | 10/30 | Furret 162 L7 ×0.65 | meadow |
| r2 | 196,330 | r1, quarry, lake | [r1] | 8–15 | 8–12 ×0.7 | 10·3, 13·3, 11·2, 14·2, 43·3, 46·2, 163·2, 167·2, 285·2, **25·1** | 4.5 min/106/10 | 16/60 | Parasect 47 L14 ×0.7 | woodland |
| lake | 300,214 | r2, ruins | [r2] | 14–22 | 14–20 ×0.8 | 129·3, 54·3, 60·2, 118·3, 194·2, 183·2, 283·2, 278·2, 418·2, **147·1** | 5 min/96/16 | 24/100 | Azumarill 184 L21 ×0.75 | pier |
| quarry | 92,300 | r2, trail | [r2] | 16–24 | 16–22 ×0.8 | 74·3, 27·3, 50·2, 66·3, 104·2, 95·1, 304·2, 299·2, **246·1** | 5 min/96/18 | 28/110 | Rhyhorn 111 L23 ×0.75 | cave-sand |
| trail | 84,170 | quarry, ruins | [quarry] | 24–34 | 24–32 ×0.85 | 75·3, 67·2, 22·3, 220·3, 361·2, 17·3, 57·2, 227·1, **371·1** | 6 min/80/26 | 40/160 | Piloswine 221 L33 ×0.8 | mountain |
| ruins | 196,72 | trail, lake | [trail, lake] | 34–50 | 34–46 ×0.9 | 201·3, 177·3, 200·2, 93·2, 64·2, 436·3, 302·2, 359·1, **442·1** | 6 min/80/36 | 55/240 | Xatu 178 L47 ×0.85 | autumn |

Route labels: `r1` "Route 1", `r2` "Route 2". Names: Hearth Town, Sunny Meadow, Mossy Woods, Mirror Lake, Flint Quarry, Cloudcap Trail, Starfall Ruins. Landmarks (id · name): r1 `signpost` Old Signpost, `sunflowers` Sunflower Patch, `hilltop-oak` Hilltop Oak · r2 `hollow-log` Hollow Log, `mossy-shrine` Mossy Shrine, `sunbeam` Sunbeam Clearing · lake `dock` Fisher's Dock, `heron-isle` Heron Isle, `shallows` Mirror Shallows · quarry `fossil-wall` Fossil Wall, `minecart` Rusty Minecart, `echo-shaft` Echo Shaft · trail `windy-ledge` Windy Ledge, `summit-cairn` Summit Cairn, `frozen-falls` Frozen Falls · ruins `star-gate` Star Gate, `glyph-hall` Glyph Hall, `fallen-star` Fallen Star.

Expedition branches (a = risky: `levelBonus` 1 on r1, 2 elsewhere, `rareBoost` 3; b = calm): r1 a [battle, landmark hilltop-oak 0.5] b [landmark signpost 0, landmark sunflowers 0.35] · r2 a [battle, landmark mossy-shrine 0.6, sighting] b [landmark hollow-log 0.2, sighting, landmark sunbeam 0] · lake a [battle, landmark heron-isle 0.5] b [landmark dock 0.2, sighting, landmark shallows 0.3] · quarry a [battle, landmark echo-shaft 0.6, battle] b [landmark minecart 0.2, landmark fossil-wall 0.4] · trail a [battle, landmark summit-cairn 0.6, battle] b [landmark windy-ledge 0.3, sighting, landmark frozen-falls 0.4] · ruins a [landmark star-gate 0.5, battle, landmark fallen-star 0.7] b [sighting, landmark glyph-hall 0.4, battle]. Every fork `a` hint says "Tougher Pokémon, better odds of a rare sighting" plus its landmark; every `b` hint says "Calmer" plus its landmarks. Texts are one or two short sentences each.

- [ ] **Step 5: Run the test to see it pass**

Run: `npx tsx scripts/world.test.ts` → `N passed, 0 failed`.

- [ ] **Step 6: Checkpoint** — `npx tsc -b` passes. Append the test to `npm test` after re-reading `package.json` (another session edits it).

### Task 2: Wilds, training, expeditions, activity contract

**Files:**
- Create: `src/game/wilds.ts`, `src/game/training.ts`, `src/game/expedition.ts`, `src/game/activity.ts`
- Test: `scripts/world.test.ts` (sections `[7]`–`[12]`)

**Interfaces:**
- Consumes: Task 1 types; `rollIdentity` (`identity.ts`), `withSign/withAbility/withBuild/asShiny/asAltColor/CREATURES_BY_ID` (`pokemon.ts`), `scaleCreatureToLevel/clampLevel` (`levels.ts`), `simulateBattle/BattleEvent` (`battle.ts`), `applyGrowthWithEvolution` (`evolution.ts`), `ownedMonToCreature/OwnedMon` (`box.ts`), `RNG` (`rng.ts`).
- Produces (exact):

```ts
// wilds.ts
export interface WildView { dexId: number; level: number; shiny: boolean; altColor: boolean; rare: boolean; guardian: boolean }
export interface RolledWild { view: WildView; creature: Creature; statMult: number }
export function buildWild(dexId: number, level: number, rng: RNG): { creature: Creature; shiny: boolean; altColor: boolean } | null;
export function pickFromPool(pool: readonly PoolEntry[], rng: RNG, rareBoost?: number): PoolEntry;
export function rollPoolWild(wild: WildRules, rng: RNG, opts?: { levelBonus?: number; rareBoost?: number }): RolledWild;
export function rollGuardian(g: GuardianSpec, rng: RNG): RolledWild;

// activity.ts
export type ActivityMode = 'train' | 'explore';
export interface ActivityConfig { v: 1; locationId: PlayableId; recommended: LevelRange; wild: WildRules; training: TrainingRules; explore: ExploreRules; guardian: GuardianSpec; expedition: ExpeditionTemplate; capMs: number }
export function configFor(route: RoutePlace): ActivityConfig;
export function parseConfig(raw: unknown): ActivityConfig | null;
export function normaliseSnapshot(raw: unknown): OwnedMon[] | null;
export function partyCreatures(snapshot: readonly OwnedMon[]): Creature[];
export interface MemberGrowth { id: string; sharePct: number; expGained: number; before: { dexId: number; level: number; exp: number }; after: { dexId: number; level: number; exp: number }; evolutions: { fromDexId: number; toDexId: number }[] }
export function growMember(mon: OwnedMon, exp: number, rng: RNG): { mon: OwnedMon; evolutions: MemberGrowth['evolutions'] };
export function planGrowth(current: readonly OwnedMon[], snapshot: readonly OwnedMon[], rawExp: number, rec: LevelRange, activityId: string): { changed: OwnedMon[]; members: MemberGrowth[] };
export type Outcome = 'cap' | 'early' | 'loss' | 'complete' | 'retreat' | 'defeat';
export interface BattleSummary { foe: WildView; won: boolean; turns: number }
export interface ActivityResult { id: string; mode: ActivityMode; locationId: PlayableId; outcome: Outcome; startedAt: number; endedAt: number; elapsedMs: number; battles: BattleSummary[]; wins: number; rawExp: number; members: MemberGrowth[]; seen: number[]; newSeen: number[]; landmarks: string[]; newLandmarks: string[]; cleared: boolean; firstClear: boolean; unlocked: PlayableId[]; legacy: boolean }
export function parseResult(raw: unknown): ActivityResult | null;
export interface TrainingStatus { paceMs: number; capMs: number; maxEncounters: number; expPerWin: number; elapsedMs: number; nextBattleInMs: number | null; battles: number; wins: number; fell: boolean; capped: boolean; pendingExp: { id: string; exp: number }[]; recent: BattleSummary[] }
export interface ExpeditionView { step: number; checkpoint: CheckpointView | null; trail: TrailEntry[]; wins: number; expUnits: number; pendingExp: { id: string; exp: number }[] }
export interface PublicActivity { id: string; mode: ActivityMode; locationId: PlayableId; startedAt: number; party: OwnedMon[]; legacy: boolean; training: TrainingStatus | null; expedition: ExpeditionView | null }
export interface PlaceView { id: PlayableId; state: PlaceState; progress: PlaceProgress }
export interface WorldState { serverNow: number; places: PlaceView[]; activity: PublicActivity | null; result: ActivityResult | null; trainerAt: LocationId }
export interface StepEvent { step: number; kind: NodeKind; choice: ChoiceId; outcome: TrailOutcome; foe: WildView | null; landmark: string | null; newLandmark: boolean; newSeen: boolean; battle: { won: boolean; turns: number; events: BattleEvent[] } | null; expUnits: number }
export interface StartInput { mode: ActivityMode; locationId: PlayableId; partyIds: string[]; requestId: string }
export interface StepInput { activityId: string; step: number; choice: ChoiceId }

// training.ts
export interface TrainingBattle { slot: number; foe: WildView; won: boolean; turns: number }
export interface TrainingRun { battles: TrainingBattle[]; wins: number; fell: boolean }
export function trainingFoe(seed: string, cfg: ActivityConfig, slot: number): RolledWild;
export function simulateTraining(party: Creature[], seed: string, cfg: ActivityConfig, count: number): TrainingRun;

// expedition.ts
export type TrailOutcome = 'observed' | 'won' | 'lost' | 'found' | 'passed' | 'took-a' | 'took-b' | 'retreated';
export interface TrailEntry { step: number; node: string; kind: NodeKind; choice: ChoiceId; outcome: TrailOutcome; foe?: WildView; landmark?: string; turns?: number; expUnits?: number }
export interface ExpeditionState { node: string; trail: TrailEntry[]; wins: number; expUnits: number; seen: number[]; landmarks: string[]; newSeen: number[]; newLandmarks: string[] }
export interface CheckpointView { step: number; node: string; kind: NodeKind; title: string; text: string; foe: WildView | null; landmark: { id: string; name: string; known: boolean } | null; options: { id: ChoiceId; label: string; hint: string }[] }
export interface StepResolution { entry: TrailEntry; state: ExpeditionState; terminal: 'complete' | 'retreat' | 'defeat' | null; battle: { won: boolean; turns: number; events: BattleEvent[] } | null; seen: number | null; landmark: string | null }
export function initialExpedition(cfg: ActivityConfig): ExpeditionState;
export function parseExpeditionState(raw: unknown): ExpeditionState | null;
export function currentNode(cfg: ActivityConfig, state: ExpeditionState): ExpeditionNode | null;
export function choicesFor(node: ExpeditionNode): ChoiceId[];
export function battleSeed(seed: string, step: number): string;                 // `${seed}#x#${step}` — server only
export function checkpointFoe(seed: string, cfg: ActivityConfig, step: number, node: ExpeditionNode): RolledWild | null;
export function landmarkGuard(seed: string, cfg: ActivityConfig, step: number, node: LandmarkNode): RolledWild | null;
export function checkpointView(seed: string, cfg: ActivityConfig, state: ExpeditionState, route: RoutePlace, known: ReadonlySet<string>): CheckpointView | null;
export function resolveStep(party: Creature[], seed: string, cfg: ActivityConfig, state: ExpeditionState, choice: ChoiceId): StepResolution | null;
export function replayBattle(party: Creature[], seed: string, cfg: ActivityConfig, entry: TrailEntry): BattleEvent[] | null;
```

Rules the implementation must follow:
- RNG streams: training slot `k` uses `new RNG(\`${seed}:t:${k}\`)` for the foe and battle seed `\`${seed}#t#${k}\``; expedition step `n` at node `N` uses `new RNG(\`${seed}:x:${n}:${N}:foe\`)` for its foe and `…:guard` for a landmark guard, battle seed `battleSeed(seed, n)`.
- `pickFromPool`: weight × `rareBoost` for `rare` entries; cumulative walk over `rng.next() * total`.
- `rollPoolWild`: pick, then `level = clampLevel(rng.int(min, max) + levelBonus)`, then `buildWild(dexId, level, rng)`; `statMult = wild.statMult`.
- `resolveStep`: invalid choice → `null`. `retreat` → `terminal: 'retreat'`, entry keeps the foe if the node has one. Fork → `took-a|took-b`, `state.node = option.next`. Sighting `observe` → `observed`. Sighting `challenge`, `battle` `fight`, guardian `challenge` → battle: won → `won`, `expUnits = cfg.explore.expPerWin`, next node (guardian win → `terminal: 'complete'`); lost → `lost`, `terminal: 'defeat'`. Landmark `investigate` → guard? battle first (lost → defeat, no landmark); else/won → `found` + landmark (+ `expUnits` when a guard was beaten); `press-on` → `passed`. Every step whose node has a foe records it in `state.seen` (once) and returns `seen`. `state.wins/expUnits` accumulate. `newSeen/newLandmarks` are never set here (the domain layer sets them from the database).
- `checkpointView` option copy: battle `fight` "Battle" / "Win: +{expPerWin} EXP each. Lose: the trip ends."; sighting `observe` "Watch quietly" / "Note it as seen. No battle.", `challenge` "Challenge it" / "Win: +{expPerWin} EXP each. Lose: the trip ends."; landmark `investigate` "Investigate" / "{name}. Something may guard it." (or "{name}." when `guardedChance === 0`), `press-on` "Press on" / "Skip it and keep going."; fork options from the template; guardian `challenge` "Challenge" / "Win: clear {place} and +{clearBonus} EXP each."; `retreat` "Head home" / "End the trip and keep what you earned." Landmark `known` = in `known`.
- `growMember` wraps `applyGrowthWithEvolution` and nothing else. `planGrowth` skips snapshot members no longer in `current`, uses the **snapshot** level for `expSharePct`, grows the **current** row with `new RNG(\`evolve:${row.id}:${activityId}\`)`, and returns in `changed` only rows whose `dexId`, `level`, or `exp` changed.
- `normaliseSnapshot`: array of objects each with string `id`, integer `dexId` known to `CREATURES_BY_ID`, integer `level` 1–50, integer `exp` ≥ 0, string `sign`, boolean `shiny`/`altColor`, `origin` in `starter|tutorial|catch`; otherwise `null`. Optional fields copied when their type is right.
- `parseConfig`/`parseResult`/`parseExpeditionState`: shape checks on the fields used; `null` on mismatch.

- [ ] **Step 1: Write failing tests** (append to `scripts/world.test.ts`):
  - `[7] wild seam`: `buildWild(10, 5, new RNG('w'))` level-scales (its `stats.hp` equals `scaleCreatureToLevel(…,5).stats.hp` for the same identity) and is deterministic (two calls, same seed → identical JSON); `buildWild(99999, 5, …) === null`; `pickFromPool` with `rareBoost: 1000` on the r1 pool returns the rare entry in ≥ 90 of 100 seeds and with `1` in ≤ 15 of 100.
  - `[8] training`: for a pinned Lv 20 Butterfree snapshot on r1, `simulateTraining(party, 'seed-a', cfg, 30)` twice gives identical JSON; `count 0` → `{battles: [], wins: 0, fell: false}`; a run that ends `fell: true` has `wins === battles.length - 1` and stops at the loss (find a seed with a Lv 2 Caterpie vs r2 config); empty party → no battles.
  - `[9] expedition determinism and choices`: for each route, `seed 'x1'`, walk `fork a` and `fork b` with `observe`/`investigate`/`fight`/`challenge` choices; same seed and choices → identical state JSON; the node after `fork` differs between `a` and `b`; `checkpointView` never contains the seed string; invalid choice (`'fight'` on a fork) → `null`; `retreat` at step 0 → terminal `retreat` with no battle.
  - `[10] expedition outcomes`: a Lv 50 Machamp snapshot completes r1 (`terminal === 'complete'` on the guardian step, `state.wins ≥ 1`, `expUnits` equals wins × 10); a Lv 2 Caterpie on r1 path `a` eventually hits `terminal 'defeat'` with `state.expUnits` unchanged by the lost battle; `replayBattle` for a won entry returns events whose last `kind === 'end'` and `winner === 'player'`.
  - `[11] growth seam`: `planGrowth` on a starter Caterpie Lv 7 exp 0 with `rawExp 140` evolves it to Metapod (dex 11) at Lv 8; a renamed current row (`nickname: 'Bug'`) keeps its nickname; a snapshot member missing from `current` is skipped; a Lv 12 member on r1 (`max 8`) gets `sharePct 40` and `expGained = floor(raw × 40 / 100)`; `changed` excludes members with `rawExp 0`.
  - `[12] parsers`: `normaliseSnapshot([{ id: 'a' }]) === null`; a valid `OwnedMon` round-trips; `parseConfig(configFor(r1))` round-trips through `JSON.parse(JSON.stringify(...))`; `parseConfig({ v: 2 }) === null`.
- [ ] **Step 2:** `npx tsx scripts/world.test.ts` → fails (modules missing).
- [ ] **Step 3:** Implement the four modules to the interfaces and rules above. `training.ts` stops at the first loss and returns early for an empty party; `activity.ts` holds only types, parsers, `configFor`, `partyCreatures`, `growMember`, `planGrowth`.
- [ ] **Step 4:** `npx tsx scripts/world.test.ts` → all pass; `npx tsc -b` passes.

### Task 3: Party rules

**Files:**
- Create: `src/game/party.ts`
- Test: `scripts/world.test.ts` section `[13]`

**Interfaces:**
- Produces:

```ts
export const PARTY_MAX = 6;
export function parsePartyInput(raw: unknown): string[] | null;   // 1–6 unique non-empty strings ≤ 64 chars, else null
export function resolveParty(saved: readonly string[] | null, owned: readonly OwnedMon[], starterId: string): string[];
export function partyMembers(ids: readonly string[], box: readonly OwnedMon[]): OwnedMon[];
export function sameParty(a: readonly string[], b: readonly string[]): boolean;
export async function saveParty(ids: string[]): Promise<{ ok: boolean; party?: string[]; error?: string; expired?: boolean }>;
```

`resolveParty`: keep saved ids that are owned, in order, deduped, first 6; if that is empty → `[starterId]` when owned; else the first `owned` id (owned is newest first); else `[]`. `saveParty` POSTs `/api/me/party` with `credentials: 'include'`, never throws, maps 401 to `expired: true`.

- [ ] **Step 1:** Tests `[13] party`: `parsePartyInput([])`, `(['a','a'])`, `(['a',1])`, 7 ids, `'a'`, a 65-char id → `null`; `(['a','b'])` → `['a','b']`; `resolveParty(null, [x(starter)], starter) → [starter]`; `resolveParty(['gone','b'], [b, s], s) → ['b']`; `resolveParty(['gone'], [b, s], s) → [s]`; `resolveParty(null, [b], 'missing') → [b]`; `resolveParty(null, [], s) → []`; `sameParty(['a','b'], ['b','a']) === false`.
- [ ] **Step 2:** fail → implement → pass.

### Task 4: Balance gates and tuning

**Files:**
- Create: `scripts/world-balance.ts`
- Modify: `src/game/world-places.ts` (numbers only), `scripts/world.test.ts` (section `[14]`)

**Interfaces:**
- Consumes: `simulateTraining`, `trainingFoe`, `rollGuardian`, `configFor`, `STARTER_POOL`, `starterLine`, `rollIdentity`, `ownedMonToCreature`.

Gate harness (in the test): a starter line's member at level `L` is the line's stage at `L` using starter thresholds (stage 0 below 8, stage 1 from 8, stage 2 from 16), minted as `OwnedMon` with identity `rollIdentity(species, new RNG(\`gate:${base}:${i % 20}\`))`, origin `'starter'`. Battles use `trainingFoe(\`gate-${i}\`, cfg, 0)` and `simulateBattle([me], [foe.creature], \`gate:${base}:${i}\`, { foeStatMult: foe.statMult })`.

- [ ] **Step 1:** Write gates `[14]` (N = 300 for 9.1, 200 for 9.2, 100 for 9.3):
  1. every line at Lv 5 on r1 wins ≥ 95%;
  2. every line at each route's `floor((min + max) / 2)` wins ≥ 90% there, Metapod (11) and Kakuna (14) ≥ 85%;
  3. every line at each route's `recommended.max` beats that guardian (`rollGuardian(cfg.guardian, new RNG(\`g:${i}\`))`) in ≥ 50% of seeds.
- [ ] **Step 2:** `scripts/world-balance.ts` prints the three tables (route × line win %) for tuning.
- [ ] **Step 3:** Run the gates, tune only `wild.min/max`, `wild.statMult`, pool weights/species, and guardian `level/statMult` until all pass. Record the final numbers in the spec's content table.
- [ ] **Step 4:** `npx tsx scripts/world.test.ts` passes in under 10 s.

---

## Slice 2 — Persistence and API

### Task 5: Schema and SQL helpers

**Files:**
- Modify: `db/schema.sql`, `api/_db.ts`
- Create: `scripts/world-db.test.ts` (section `[1]`), `scripts/world-test-kit.ts`

**Interfaces:**
- Produces in `api/_db.ts` (all take `Executor` unless noted; every query scoped by `user_id`):

```ts
// COLUMN_ADDS gains, in order:
'alter table profiles add column party text',
'alter table idle_sessions add column mode text',
'alter table idle_sessions add column rules_version integer',
'alter table idle_sessions add column party_snapshot text',
'alter table idle_sessions add column config text',
'alter table idle_sessions add column state text',
'alter table idle_sessions add column step integer not null default 0',
'alter table idle_sessions add column request_id text',
'alter table idle_sessions add column result text',
'alter table idle_sessions add column seen_at integer',

export interface ProfileRow { /* existing */ party: string[] | null }
export async function updateProfileParty(db: Executor, uid: string, ids: string[]): Promise<number>;
export interface ActivityRow { id: string; userId: string; routeId: string; partyIds: string[]; seed: string; startedAt: number; claimedAt: number | null; stoppedBy: string | null; encounters: number; mode: 'train' | 'explore' | null; rulesVersion: number | null; partySnapshot: unknown; config: unknown; state: unknown; step: number; requestId: string | null; result: unknown; seenAt: number | null }
export function rowToActivity(r: Record<string, unknown>): ActivityRow;   // JSON columns parsed, bad JSON → null
export async function readOpenActivity(db: Executor, uid: string): Promise<ActivityRow | null>;
export async function readActivity(db: Executor, uid: string, id: string): Promise<ActivityRow | null>;
export async function readUnseenResult(db: Executor, uid: string): Promise<ActivityRow | null>;
export async function readLastRouteId(db: Executor, uid: string): Promise<string | null>;
export interface NewActivity { id: string; userId: string; routeId: string; partyIds: string[]; seed: string; startedAt: number; mode: 'train' | 'explore'; rulesVersion: number; partySnapshot: unknown; config: unknown; state: unknown; requestId: string }
export function insertActivityStatement(a: NewActivity): InStatement;
export function markResultsSeenStatement(uid: string, now: number): InStatement;
export function progressStartStatement(uid: string, locationId: string, mode: 'train' | 'explore'): InStatement;
export async function updateActivityState(db: Executor, p: { id: string; uid: string; fromStep: number; state: unknown }): Promise<number>;
export async function closeActivity(db: Executor, p: { id: string; uid: string; claimedAt: number; stoppedBy: string; encounters: number; step: number; state: unknown | null; result: unknown }): Promise<number>;
export async function markResultSeen(db: Executor, uid: string, id: string, now: number): Promise<number>;
export interface ProgressRow { locationId: string; clearedAt: number | null; explores: number; clears: number; trainings: number; trainingWins: number }
export async function readProgress(db: Executor, uid: string): Promise<ProgressRow[]>;
export async function applyProgressSettlement(db: Executor, p: { uid: string; locationId: string; clearedAt: number | null; clears: number; trainingWins: number }): Promise<void>;
export interface DiscoveryRow { locationId: string; kind: 'seen' | 'landmark'; ref: string; foundAt: number }
export async function readDiscoveries(db: Executor, uid: string): Promise<DiscoveryRow[]>;
export async function insertDiscovery(db: Executor, p: { uid: string; locationId: string; kind: 'seen' | 'landmark'; ref: string; foundAt: number }): Promise<boolean>;   // true = new
export async function updateOwnedGrowth(db: Executor, uid: string, mon: OwnedMon): Promise<void>;           // dex_id, ability, level, exp only
export async function insertEncounterRows(db: Executor, sessionId: string, rows: { slot: number; dexId: number; level: number; won: boolean }[]): Promise<void>;
export async function openWriteTx(db: Db): Promise<Transaction>;   // SQLITE_BUSY retry ×8, 25 ms × attempt
export function isUniqueViolation(err: unknown): boolean;
export function isMissingSchema(err: unknown): boolean;            // 'no such column' | 'no such table'
```

SQL (exact):
- open: `select * from idle_sessions where user_id = ? and claimed_at is null order by started_at desc limit 1`
- by id: `select * from idle_sessions where id = ? and user_id = ? limit 1`
- unseen: `select * from idle_sessions where user_id = ? and claimed_at is not null and result is not null and seen_at is null order by claimed_at desc limit 1`
- last route: `select route_id from idle_sessions where user_id = ? order by started_at desc limit 1`
- insert: `insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at, mode, rules_version, party_snapshot, config, state, step, request_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
- mark all seen: `update idle_sessions set seen_at = ? where user_id = ? and claimed_at is not null and seen_at is null`
- progress start (two constant strings): `insert into world_progress (user_id, location_id, explores) values (?, ?, 1) on conflict (user_id, location_id) do update set explores = explores + 1` and the same for `trainings`
- step: `update idle_sessions set state = ?, step = ? where id = ? and user_id = ? and step = ? and claimed_at is null`
- close: `update idle_sessions set claimed_at = ?, stopped_by = ?, encounters = ?, step = ?, state = coalesce(?, state), result = ? where id = ? and user_id = ? and claimed_at is null`
- seen one: `update idle_sessions set seen_at = coalesce(seen_at, ?) where id = ? and user_id = ? and claimed_at is not null`
- progress settle: `insert into world_progress (user_id, location_id, cleared_at, clears, training_wins) values (?, ?, ?, ?, ?) on conflict (user_id, location_id) do update set cleared_at = coalesce(world_progress.cleared_at, excluded.cleared_at), clears = world_progress.clears + excluded.clears, training_wins = world_progress.training_wins + excluded.training_wins`
- discovery: `insert or ignore into world_discoveries (user_id, location_id, kind, ref, found_at) values (?, ?, ?, ?, ?)`
- growth: `update owned_pokemon set dex_id = ?, ability = ?, level = ?, exp = ? where id = ? and user_id = ?`
- encounters: `insert or ignore into encounters (session_id, slot, dex_id, level, won) values (?, ?, ?, ?, ?)`
- party: `update profiles set party = ? where user_id = ?`

`db/schema.sql` adds `world_progress` and `world_discoveries` exactly as in the spec, and updates the `profiles`/`idle_sessions` comments (activities for both modes; new columns listed; legacy rows).

`scripts/world-test-kit.ts` exports `tempDb(name): { db: Db; url: string; cleanup(): void }` (file DB under `os.tmpdir()`, `applySchema` applied, cleanup removes `-wal/-shm/-journal`), `legacyDb(name)` (applies the `810aa848^` era schema: `db/schema.sql` without `COLUMN_ADDS`), `mintMon(db, uid, over)`, `onboardTestUser(db, uid, dexId?)`.

- [ ] **Step 1:** `[1] schema`: `applySchema` twice is idempotent; a legacy DB (schema without the new columns) accepts a pre-map open row `insert into idle_sessions (id, user_id, route_id, party_ids, seed, started_at) values (…)`, then `applySchema` upgrades it and `readOpenActivity` returns it with `mode === null`, `rulesVersion === null`, `step === 0`; `rowToActivity` with a bad JSON `state` gives `state === null`; `insertDiscovery` returns `true` then `false`; `updateOwnedGrowth` leaves `nickname`, `sign`, `shiny`, `origin` unchanged; `closeActivity` returns 1 then 0; `updateActivityState` with a stale `fromStep` returns 0; user `u2` reads nothing of `u1`.
- [ ] **Step 2:** fail → implement → pass. Append `&& tsx scripts/world-db.test.ts` to `npm test`.

### Task 6: Domain module `api/_world.ts`

**Files:**
- Create: `api/_world.ts`
- Test: `scripts/world-db.test.ts` sections `[2]`–`[12]`

**Interfaces:**
- Produces:

```ts
export function loadWorldState(db: Db, uid: string, now: number): Promise<WorldState>;
// StartInput and StepInput come from src/game/activity.ts (shared with the client).
export function parseStartInput(body: Record<string, unknown>): StartInput | null;
export type StartOutcome =
  | { status: 'ok'; activity: PublicActivity }
  | { status: 'busy'; activity: PublicActivity }
  | { status: 'party_changed'; party: string[] }
  | { status: 'locked' } | { status: 'no_profile' } | { status: 'no_party' };
export function startActivity(db: Db, uid: string, input: StartInput, now: number): Promise<StartOutcome>;
export function parseStepInput(body: Record<string, unknown>): StepInput | null;
export type StepOutcome =
  | { status: 'ok'; activity: PublicActivity | null; event: StepEvent; result: ActivityResult | null; box: OwnedMon[] | null }
  | { status: 'not_found' } | { status: 'not_expedition' } | { status: 'invalid_choice' }
  | { status: 'conflict'; activity: PublicActivity | null; result: ActivityResult | null };
export function stepExpedition(db: Db, uid: string, input: StepInput, now: number): Promise<StepOutcome>;
export type FinishOutcome = { status: 'ok'; result: ActivityResult; box: OwnedMon[] | null } | { status: 'not_found' };
export function finishActivity(db: Db, uid: string, activityId: string, now: number): Promise<FinishOutcome>;
export function dismissResult(db: Db, uid: string, activityId: string, now: number): Promise<'ok' | 'not_found'>;
export type PartyOutcome = { status: 'ok'; party: string[] } | { status: 'invalid' } | { status: 'not_owned' } | { status: 'no_profile' };
export function savePartyIds(db: Db, uid: string, raw: unknown): Promise<PartyOutcome>;
```

Algorithm (normative):

1. **hydrate(row)** → `{ row, mode, route, cfg, snapshot, legacy }`: `legacy = rulesVersion === null`; `mode = row.mode ?? 'train'`; `route = routeById(row.routeId)`; `cfg = legacy ? (route && configFor(route)) : parseConfig(row.config)`; `snapshot = legacy ? current owned rows of row.partyIds in that order : normaliseSnapshot(row.partySnapshot)`.
2. **Training status** (`now`): `elapsed = clamp(now − startedAt, 0, cfg.capMs)`; `count = trainingBattleCount(elapsed, cfg.training, cfg.capMs)`; `run = simulateTraining(partyCreatures(snapshot), seed, cfg, count)`; `capped = elapsed >= capMs || count >= maxEncounters`; `nextBattleInMs = run.fell || capped ? null : (count + 1) × paceMs − elapsed`; `pendingExp[i] = scaleExp(run.wins × expPerWin, expSharePct(snapshot[i].level, cfg.recommended))`; `recent` = last 5 battles. Read-only.
3. **loadWorldState**: in parallel read open activity, unseen result, progress, discoveries, last route id. Build `PlaceProgress` per route (discoveries → `landmarks`, `seen` as numbers). `cleared` = routes with `clearedAt`. `places` = every route with `placeState`. `activity` = view of the open row. `result` = parsed unseen result when there is no open activity. `trainerAt` = open activity's route, else last route id if playable, else `'home'`.
4. **startActivity**: read profile, box, open activity, progress in parallel. No profile → `no_profile`. Open activity → same `requestId` ? `ok` : `busy` (with its view). Route not unlocked → `locked`. `party = resolveParty(profile.party, box, profile.starterId)`; empty → `no_party`; `!sameParty(party, input.partyIds)` → `party_changed`. Snapshot = party rows in order. `db.batch([markResultsSeenStatement, insertActivityStatement, progressStartStatement], 'write')`; a unique violation re-reads the open row and returns `ok`/`busy` by `requestId`. Seed = `randomBytes(12).toString('hex')`; id = `randomUUID()`.
5. **stepExpedition** (up to 3 attempts): read row by id (none → `not_found`); hydrate; not explore / no cfg / no snapshot / unparsable state → `not_expedition`.
   - `input.step < trail.length`: the entry's `choice` differs → `conflict`; else **replay**: rebuild `StepEvent` from the entry (`battle.events` from `replayBattle`), `newSeen/newLandmark` from `state.newSeen/newLandmarks`, return `ok` with the current view (and the stored `result` if settled).
   - settled or `input.step !== trail.length` → `conflict` (with view or result).
   - `resolveStep` → `null` → `invalid_choice`.
   - Non-terminal → `openWriteTx`: `insertDiscovery` for the seen species and found landmark (new ones appended to `state.newSeen/newLandmarks`), `updateActivityState(fromStep = trail.length)`; 0 rows → rollback, next attempt; else commit and return `ok`.
   - Terminal → **settle** with plan `{ outcome: complete|retreat|defeat, battles: trail battles, wins, rawExp: state.expUnits + (complete ? cfg.explore.clearBonus : 0), seen: [the step's species], landmarks: [the step's landmark], cleared: complete, state: final state, step: trail.length + 1, fromStep: trail.length }`.
6. **finishActivity** (up to 3 attempts): row missing → `not_found`; settled → stored result (`not_found` if none) with a fresh box; explore → run `resolveStep(…, 'retreat')` and settle; train → plan from the training status at `now`: `outcome = fell ? 'loss' : capped ? 'cap' : 'early'`, `rawExp = wins × expPerWin`, `seen = unique foe species`, encounter rows from battles. Legacy with no cfg or no snapshot → zero plan (`outcome 'early'`).
7. **settle** (one write transaction): re-read the row (settled, or `step !== fromStep` for explore → rollback, `'already'`); `insertDiscovery` for plan species/landmarks; read current party rows; `planGrowth(current, snapshot, rawExp, cfg.recommended, row.id)`; read progress → `clearedBefore`; `firstClear`; `unlocked = newlyUnlocked(before, after)`; build `ActivityResult` (trip-wide `seen/landmarks/newSeen/newLandmarks` for explore); `closeActivity` (0 rows → rollback, `'already'`); `updateOwnedGrowth` for each changed row; `applyProgressSettlement` (`clearedAt: complete ? now : null`, `clears`, `trainingWins` for training); `insertEncounterRows`; commit. After commit, read the box best-effort.
8. **dismissResult**: `markResultSeen` → 1 row `ok`, else `not_found`.
9. **savePartyIds**: `parsePartyInput` → `invalid`; `readOwnedByIds` length mismatch → `not_owned`; `updateProfileParty` 0 rows → `no_profile`.

- [ ] **Step 1: Write the failing tests** (`scripts/world-db.test.ts`, one temp DB per section, `now` injected):
  - `[2] party`: onboarded user → `loadWorldState` works; `savePartyIds` rejects `[]`, 7 ids, duplicates, another user's id, unknown id; accepts 2 owned ids and `readProfile` shows them in order; user without profile → `no_profile`.
  - `[3] start`: new user can start `train` on `r1` with `[starterId]`; `r2` → `locked`; wrong party order → `party_changed` with the saved order; second start (different `requestId`) → `busy` with the first activity; same `requestId` → `ok`, same id; `Promise.all` of two starts with different ids → exactly one row with `claimed_at is null`, statuses `{ok, busy}`; `explore` start on `r1` returns a checkpoint of kind `sighting` at step 0; the view JSON never contains the row's seed.
  - `[4] training boundaries`: start at `t0`; `finish` at `t0 + pace − 1` → `outcome 'early'`, 0 battles, no EXP, starter row unchanged, activity closed; new start; `finish` at `t0 + pace` → 1 battle; new start; `finish` at `t0 + 9 h` → battles `≤ maxEncounters` and equal to `trainingBattleCount(8 h)` unless the party fell (then `outcome 'loss'`), `elapsedMs === 8 h`.
  - `[5] exactly once`: finish twice sequentially → identical results, starter EXP applied once (compare `level/exp` to `planGrowth` expectation computed from the first result's `rawExp`); `Promise.all` of two finishes → same result JSON, EXP once; after finish `loadWorldState` returns the result until `dismissResult`, then `null`; a new start marks older unseen results seen.
  - `[6] defeat`: a Lv 2 Caterpie party (minted directly) trains on `r2` (unlock by writing `world_progress.cleared_at` for `r1`) at `t0 + 8 h` → `outcome 'loss'`, `wins === battles − 1`, EXP equals `wins × expPerWin × share`.
  - `[7] growth through helpers`: a party `[starter Lv 7 with 0 EXP, Machamp Lv 50]` explores `r1` until `complete`; starter evolves to Metapod when its EXP crosses Lv 8; nickname set mid-activity (`updateOwnedNickname`) survives; `sign/shiny/origin` unchanged.
  - `[8] expedition resume and races`: after two steps, re-reading via `loadWorldState` shows `expedition.step === 2` and the same checkpoint node; repeating step 1 with its original choice returns the same event (`JSON.stringify` equal, battle events included); step 1 with a different choice → `conflict`; `Promise.all` of step 2 with `'retreat'` and step 2 with another valid choice → exactly one `ok`, the other `conflict` or `ok`-replay only if the choices match; EXP is applied at most once.
  - `[9] lost response on a terminal step`: complete an expedition, then repeat the final step → `ok` with the same `result` and `event`; box level/EXP unchanged by the repeat.
  - `[10] unlocks`: completing `r1` sets `firstClear`, `unlocked` equals `['r2']`, `loadWorldState` shows `r2` `available`; completing `r1` again → `firstClear false`, `unlocked []`.
  - `[11] legacy rows`: on a legacy-schema DB insert a pre-map open row for `r1` with the starter's id, then `applySchema`; `loadWorldState` shows a `train` activity with `legacy: true` and a party of the starter; `startActivity` → `busy`; `finishActivity` at `started_at + 3 h` → settles with EXP, `legacy: true`; a closed legacy row with a `log` is never returned as a result; a legacy open row for an unknown route settles with zero reward.
  - `[12] isolation`: user `u2` gets `not_found` for `u1`'s activity on `stepExpedition`, `finishActivity`, `dismissResult`; `u2`'s `loadWorldState` has no activity.
- [ ] **Step 2:** `npx tsx scripts/world-db.test.ts` → fails.
- [ ] **Step 3:** Implement `api/_world.ts` per the algorithm.
- [ ] **Step 4:** Tests pass; `npx tsc -p tsconfig.api.json` passes.

### Task 7: Dispatcher, `me` changes, dev route

**Files:**
- Create: `api/world/[action].ts`, `scripts/world-api.test.ts`
- Modify: `api/me/[action].ts`, `scripts/dev-api.ts`, `package.json`

**Interfaces:**
- HTTP contract (exact):

| Route | Method | Success | Errors |
|---|---|---|---|
| `/api/world/state` | GET | `200 { ok, serverNow, places, activity, result, trainerAt }` | 401 `sign in to play`; 200 `{ ok:false }` no DB; 503 `The world map isn't ready yet.` (missing schema) / `Couldn't load the world.` |
| `/api/world/start` | POST | `200 { ok, activity }` | 405; 400 `Pick a place, a mode, and your party.` / `That place is still locked.` / `Finish onboarding first.` / `Choose at least one Pokémon for your party.`; 409 `Your trainer is already out.` + `activity` / `Your party changed. Check it and try again.` + `party`; 429; 503 |
| `/api/world/step` | POST | `200 { ok, activity, event, result, box }` | 400 `That choice isn't available here.` / `That isn't an expedition.`; 404 `No such expedition.`; 409 `That checkpoint was already decided.` + `activity`, `result`; 429; 503 |
| `/api/world/finish` | POST | `200 { ok, result, box }` | 404 `Nothing to collect.`; 429; 503 |
| `/api/world/dismiss` | POST | `200 { ok: true }` | 404 `Nothing to dismiss.` |
| `/api/me/party` | POST | `200 { ok, party }` | 400 `Pick 1–6 different Pokémon.` / `That party includes a Pokémon you don't own.` / `Finish onboarding first.`; 429 |
| `/api/me/profile` | GET | `profile.party` added (resolved) | unchanged |
| `/api/me/box` | GET | unchanged | 401 without session; 503 `Couldn't load your box.` on failure |

Rate limits: world writes `rateLimit(redis, \`rl:world:m:${uid}\`, 60, 60)` and `\`rl:world:d:${uid}\`, 2000, 86400`; party `\`rl:party:m:${uid}\`, 30, 60`. `parseBody` never throws (bad JSON → `{}`).

- [ ] **Step 1: Failing tests** `scripts/world-api.test.ts` (kit: temp DB via `TURSO_DATABASE_URL` set before the first handler call, `AUTH_SECRET` set, `signSession` cookie, req/res shim like `dev-api.ts`):
  - no cookie → 401 on every world action; `GET /api/world/start` → 405 with `Allow: POST`; `start` with `{}` → 400; `step` on another user's id → 404; busy start → 409 with `activity.id`; party save of a foreign id → 400; responses' JSON never includes the activity seed (read it from the DB); `state` on a DB whose `idle_sessions` lacks the new columns (legacy schema, no `COLUMN_ADDS`) → 503 with `The world map isn't ready yet.` while `me/profile` → 200 and `me/box` → 200.
- [ ] **Step 2:** fail → implement dispatcher and `me` changes; add `parts[0] === 'world'` to `resolveRoute`.
- [ ] **Step 3:** pass; append `&& tsx scripts/world-api.test.ts` to `npm test`; `npx tsc -p tsconfig.api.json` passes.

---

## Slice 3 — Saved party and hub

### Task 8: Client helpers and App data flow

**Files:**
- Create: `src/game/world-client.ts`
- Modify: `src/game/box.ts` (`fetchBox`), `src/game/profile.ts` (`Profile.party`, `expired`), `src/App.tsx`

**Interfaces:**

```ts
// world-client.ts — never throws; 401 → expired: true
export interface ClientError { ok: false; error: string; expired?: boolean; status?: number }
export function fetchWorldState(): Promise<{ ok: true; state: WorldState } | ClientError>;
export function startActivity(input: StartInput): Promise<{ ok: true; activity: PublicActivity } | (ClientError & { activity?: PublicActivity; party?: string[] })>;
export function stepExpedition(input: StepInput): Promise<{ ok: true; activity: PublicActivity | null; event: StepEvent; result: ActivityResult | null; box: OwnedMon[] | null } | (ClientError & { activity?: PublicActivity | null; result?: ActivityResult | null })>;
export function finishActivity(activityId: string): Promise<{ ok: true; result: ActivityResult; box: OwnedMon[] | null } | ClientError>;
export function dismissResult(activityId: string): Promise<{ ok: true } | ClientError>;
export function newRequestId(): string;   // crypto.randomUUID()
// box.ts
export function fetchBox(): Promise<{ ok: boolean; box: OwnedMon[]; expired?: boolean }>;
// profile.ts
export interface Profile { /* existing */ party: string[] }
export function fetchProfile(): Promise<{ ok: boolean; profile: Profile | null; expired?: boolean }>;
```

App changes: phases add `'party' | 'world' | 'activity'`; state adds `world: WorldState | null`, `worldError: string | null`, `serverOffsetMs`, `mapView: { zoom: 1 | 2 | 3; x: number; y: number } | null`; `hydrate` loads profile, box, world in parallel; any `expired` → sign out locally and show `Your session expired — sign in again.`; `applyWorld(state)` sets world and offset; `applyBox(box)` after settlements; a 60 s poll while an activity is training and the tab is visible; the existing visibility refresh stays. Lazy-load `PartyScreen`, `WorldScreen`, `ExpeditionScreen`, `TrainingScreen`, `ResultsScreen`.

- [ ] **Step 1:** Implement helpers; update the one `fetchBox` caller; `npx tsc -b`.
- [ ] **Step 2:** Implement App wiring with placeholder-free screens stubbed by lazy imports created in Tasks 9–13 (land this task together with Task 9 so the build stays green).

### Task 9: Party screen and hub integration

**Files:**
- Create: `src/components/PartyScreen.tsx`, `src/components/HubActivity.tsx`
- Modify: `src/components/HubParty.tsx`, `src/components/HubScreen.tsx`, `src/components/BoxScreen.tsx` (party badge only)
- Assets: `public/sprites/ui/night/64/world-map.png` and `party.png` (64 px Lanczos derivatives of the masters, per `docs/art/night/README.md`, via `scripts/build-night-icon-sizes.py` with a list of names)

**Interfaces:**
- `PartyScreen({ box, party, activity, onSaved(party: string[]), onBack, onExpired })`: local draft of ids; slots 1–6 in order (lead badge on slot 1: `LEAD`), each with portrait (`PixelSprite` 40), name, `formatLevel`, variant marks (✦ shiny, ◆ alt), and buttons `Move up` / `Move down` / `Remove` (≥ 44 px, `aria-label` with the name); empty slots say `Empty`; below, the box (newest first) as buttons `Add {name}` (disabled when full or already in party, with the reason in the label); Save disabled while saving, while unchanged, or while empty; server `error` shown; success calls `onSaved`; `activity` present → notice `Your trainer is out with the old party; changes apply to the next trip.` Empty box → `No Pokémon yet.`
- `HubParty({ party, onEdit })`: saved party members (resolved by `partyMembers(profile.party, box)`), `LEAD` on the first, `formatLevel`, EXP bar per slot (`StatBar` night tone, `value = exp`, `max = expToNext(level)`), `Edit` button.
- `HubActivity({ world, serverOffsetMs, onOpenMap, onOpenActivity })`: `World map` button (icon + label) always; an activity card: training → `Training at {place} · {elapsed} · {wins} wins so far` (+ `Party fell — return to collect` / `Done — 8 h reached`), exploring → `Exploring {place} · checkpoint {step + 1}`, result → `Results ready at {place}`; `worldError` → a one-line error with Retry.
- BoxScreen: members of the saved party show a `PARTY` tag (lead `LEAD`).

- [ ] **Step 1:** Build the three components; wire into Hub (re-read `HubScreen.tsx` first; keep the other session's `InstallGuide`).
- [ ] **Step 2:** `npx tsc -b`, `npm run lint`.

---

## Slice 4 — World map

### Task 10: Region art generator

**Files:**
- Create: `scripts/build-world-map.ts`, `public/sprites/world/hearthvale.png`

Requirements: output 384 × 576 RGBA PNG (8 px tiles, 48 × 72 grid) written with a minimal PNG encoder (`zlib.deflateSync`, CRC32 table, filter 0). An authored ASCII layout (in the script) places: Hearth Town (houses with red and blue roofs, lit windows) in the south; meadow grass with flower dither around Route 1; a dense canopy forest for Mossy Woods; a river from the northern range into Mirror Lake (east) with lighter shoreline and ripple highlights and Heron Isle; Flint Quarry terraces (west) with pale rock steps; the Cloudcap range (north-west) with shaded faces and snow caps; the Starfall plateau (north) with broken pillars and a star crater; dirt paths linking the places exactly along the `neighbours` graph; sand beaches at the lake. Dusk palette harmonised with the Night navy (no pure black; darkest `#0a0d18` edge). Deterministic noise from `RNG('hearthvale')`. Place positions come from `src/game/world-places.ts` (import it), and each place's surroundings are drawn around its coordinate. Header comment: purpose, output, "original art, no third-party source", how to rerun (`npx tsx scripts/build-world-map.ts`).

- [ ] **Step 1:** Write the generator; run it; view the PNG (Read tool) at 1× and a 3× nearest-neighbour upscale; iterate until paths, forest, water, mountains, quarry, ruins, and town read at a glance.
- [ ] **Step 2:** Add a `world.test.ts` check that the PNG exists with the `MAP_SIZE` dimensions (read the IHDR bytes).

### Task 11: World screen

**Files:**
- Create: `src/components/world/WorldScreen.tsx`, `WorldMap.tsx`, `PlacePanel.tsx`, `scene.ts`

**Interfaces:**
- `WorldScreen({ world, box, profile, mapView, onMapView, onStarted(activity), onOpenActivity, onBack, onRefresh, onExpired })`.
- `WorldMap({ places, trainerAt, selected, view, onView, onSelect })`: viewport `relative overflow-hidden touch-none` sized `h-[min(62dvh,560px)] w-full`; inner layer `absolute left-0 top-0` with `transform: translate3d(x, y, 0)`, image at `MAP_SIZE × zoom` with `[image-rendering:pixelated]`; markers are `<button>`s (44 × 44) at `map × zoom` showing the state icon (`?`, padlock, `NEW`, flag, star) and a label plate (`font-label` 9 px) for visible places; the trainer marker (`special-ethan` sprite, GIF unless reduced motion) sits at `trainerAt`. Pointer drag with pointer capture; a drag over 6 px cancels the marker click. Pan clamps so at least 64 px of map stays visible. Zoom buttons (`+`, `−`) step 1 ↔ 2 ↔ 3 around the viewport centre; `Recenter` centres the trainer marker. Viewport `tabIndex=0`, `aria-label="Hearthvale map. Arrow keys pan, plus and minus zoom."`; arrows pan 48 px; `+`/`-` zoom. Initial view centres the trainer marker at zoom 1 (2 when the viewport is ≥ 400 px wide is not used — keep 1).
- List toggle: `Map` / `List` tabs; the list shows every route as a button with title, state label, recommended range, and mastery pips.
- `PlacePanel({ route, view, world, party, box, onClose, onStart })`: a bottom sheet (`fixed inset-x-0 bottom-0`, centred `max-w-[430px]`, `pb-[max(16px,env(safe-area-inset-bottom))]`, max height `70dvh`, scrollable) with name, route label, biome, blurb, state line (icon + label), recommended levels (`formatRecommended`), unlock requirement or `Explore nearby to find it.`, sightings grid (seen → icon sprite; unseen → silhouette; undiscovered place → hidden), landmarks (found names, others `???`), mastery pips (Cleared, Surveyed, Catalogued), training pace (`1 battle / 4 min`, `up to 8 h`, `{exp} EXP per win`), per-member EXP share when below 100%, and actions `Explore` / `Train`. Disabled reasons: locked (`unlockText`), another activity (`Your trainer is out at {place}.` + `Resume` button), empty party (`Choose your party first.` + `Edit party`). Starting shows a confirm step (party strip, rating label, what happens, `Start`) and disables while the request runs; 409 adopts the returned activity; errors show the server sentence. Esc closes; focus moves into the panel and back to the marker.
- `scene.ts`: `backdropUrl(route, date)` (`cave-*` keys untimed, others `${key}-${timeOfDay(date)}`), `STATE_LABEL`, `STATE_ICON`, `formatDuration(ms)` (`2h 05m`, `12m`, `45s`), `growthLines(member, name)` → `['Grew to Lv 9', 'Evolved into Metapod']` (the one copy seam).

- [ ] **Step 1:** Implement; `npx tsc -b`; lint.
- [ ] **Step 2:** Browser smoke at 375 px (pan, zoom, recenter, list, panel, keyboard).

---

## Slice 5 — Exploration

### Task 12: Expedition screen and battle replay

**Files:**
- Create: `src/components/world/ExpeditionScreen.tsx`, `src/components/world/BattleReplay.tsx`

**Interfaces:**
- `ExpeditionScreen({ activity, box, onUpdate(activity, result, box), onBack, onExpired })`: header (place title, step `n / ~6`, banked EXP, wins); backdrop window (`backdropUrl`); checkpoint card (title, text, foe sprite via `spriteUrl`/shiny path at 96 px with name, `formatLevel`, `RARE` / `GUARDIAN` tags; landmark name with `NEW` when unknown); options as buttons (label + hint), disabled while a step is in flight; a trail list of resolved checkpoints (icon + one line each). A step sends `{ activityId, step: expedition.step, choice }`; on `ok` with `event.battle` → show `BattleReplay`, then the new checkpoint (or results when `result`); on 409 adopt `activity`/`result`; errors show the sentence and keep the choices.
- `BattleReplay({ party, foe, events, onDone })`: two sprites (player lead from `sendout` index via `backUrl` at 96 px; foe front at 96 px), `StatBar`-style HP (20 segments, night tone) driven by `hp/maxHp`, a text line per event (foe `sendout` rewritten to `A wild {name} appeared!` / `The guardian {name} appears!`; `hit` → `It's super effective!`/`Not very effective…`/`A critical hit!` from `mult`/`crit`, else skipped), auto-advance every 700 ms, `Next` (Enter/Space) and `Skip` buttons, `aria-live="polite"` on the text; reduced motion: no shake or HP easing.

- [ ] **Step 1:** Implement; `npx tsc -b`; lint.
- [ ] **Step 2:** Browser: start on r1, take both fork branches across two trips, win and lose battles, reload mid-trip (same checkpoint), open the box and return (same checkpoint), retreat.

---

## Slice 6 — Training and results

### Task 13: Training and results screens

**Files:**
- Create: `src/components/world/TrainingScreen.tsx`, `src/components/world/ResultsScreen.tsx`

**Interfaces:**
- `TrainingScreen({ activity, serverOffsetMs, onFinish(result, box), onBack, onRefresh, onExpired })`: backdrop scene with the trainer sprite and party icon sheets walking (`steps(2)` frame swap; still under reduced motion); elapsed (`formatDuration`, ticking every second from `Date.now() + serverOffsetMs − startedAt`, clamped to the cap) over `8h`, a segmented bar; `Next battle in 2m 10s` (from `nextBattleInMs` minus time since the last refresh) or `Your party fell at battle {n}.` / `8 hours reached.`; server tally `Battles {n} · Wins {w}` labelled `So far (resolved by the server)`; pending EXP per member `+{exp} EXP when you return`; `Return now` (confirm when not capped/fell: `Your trainer comes home. Battles so far are kept.`), disabled while finishing.
- `ResultsScreen({ result, box, onDismiss, onTrainAgain, onExploreAgain, onMap })`: headline by outcome (`Training complete` / `Back early` / `Your party fell` / `Route cleared!` / `Back safely` / `Defeated`), a summary line (`{wins} wins · {battles} battles · {duration}`), members (sprite before → after, `+{exp} EXP`, `growthLines`), evolutions highlighted, new sightings (icons) and landmarks, milestone banner (`{place} cleared! New places: {names}`), battle list (collapsed after 10), and actions. Dismiss calls `dismissResult` then `onDismiss`.

- [ ] **Step 1:** Implement; `npx tsc -b`; lint.
- [ ] **Step 2:** Browser: start training, reload, return early, see results, dismiss; backdated training (scratch DB `started_at − 9 h`) shows `8 hours reached` and capped results.

---

## Slice 7 — Integration

### Task 14: Docs, review, fixes

- [ ] Re-run balance gates; update the spec's content table with the tuned numbers.
- [ ] `CHANGELOG.md` `[Unreleased]` (re-read first): Added — World map (Hearthvale), Expeditions, Training, Saved party; Changed — Hub party shows your saved party; `me/box` errors now distinguish failures.
- [ ] `README.md`: replace "The idle routes are paused while the core loop is reworked." with the new loop sentence.
- [ ] `AGENTS.md` line 3: "(idle routes are paused; git history has them)" → "(world map, expeditions and training live in `src/game/world*.ts` and `api/world`)". `scripts/dev-api.ts` header comment lists `world`.
- [ ] `RELEASING.md` checklist: `db:setup` now also adds `profiles.party`, nine `idle_sessions` columns, `world_progress`, `world_discoveries`; still run the duplicate-open-session check first.
- [ ] GDD decisions log (Claude Doc `47af7c97…`): add 2026-09-30 rows for the approved defaults.
- [ ] Run the `reviewer` subagent on the diff (base `origin/development`); fix every P0/P1.

### Task 15: Verification

- [ ] `npm run lint && npm test && npm run build` — all green; record results.
- [ ] Browser (`npm run dev:local` with `TURSO_DATABASE_URL=file:<scratchpad>/verify.db` and `UPSTASH_REDIS_REST_URL=http://127.0.0.1:9`, `db:setup` against that file, test accounts created by a scratch script): at 320, 375, 430 px — new trainer with one starter; full party and 40-mon box; locked/unlocked routes; expedition choices and battles; training, reload, early return, results; level-up/evolution in hub and box; loading, empty, error, retry, expired session (clear cookie); keyboard only; `prefers-reduced-motion`; no horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`); controls clear of the bottom safe area. Save screenshots under the scratchpad and publish them in a private Artifact gallery.
