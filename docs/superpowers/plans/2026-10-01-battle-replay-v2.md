# Battle Replay v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sunny Meadow battles replay the server's event log with the old Rental Rumble choreography — PMD animated sprites, attack/hurt/faint, ball toss, damage pop, shake, effectiveness banner, status/volatile/sign pills — in the Night-styled `BattleReplay`.

**Architecture:** A pure reducer (`src/game/battle-board.ts`) folds events `0..at` into the on-screen board, so Skip is "jump to the last event". `BattleReplay` derives each side's animation and FX from `events[at]` alone. `PmdSprite` gains a `wholeScale` mode for crisp pixels. `WildView` gains an optional `sign` so the foe card can show it.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4 Night tokens, `tsx` test scripts.

**Spec:** `docs/superpowers/specs/2026-10-01-battle-replay-v2-design.md`

## Global Constraints

- Runtime relative imports in `src/game/` end in `.js` (`'./battle.js'`); `import type` may omit it; components may omit it.
- No battle-outcome, catch, growth, EXP, allowance, inventory, or API status change. `simulateBattle` is not touched.
- Night tokens only (`bg-window`, `border-window-frame`, `text-ink`, `text-ink-dim`, `bg-slot`, `bg-edge`, `font-pixel`, `font-label`, `text-accent`, `text-caught-shiny`). No hex in components except `TYPE_COLORS`. No glass, `backdrop-blur`, `rounded-full`, or soft `shadow-*`.
- Pixel sprites render at whole multiples with `[image-rendering:pixelated]`.
- Every animation is off under `prefers-reduced-motion`.
- No speed toggle, no Guide button. Next / Skip and the finish button (`Continue` / `See what happened`) stay.
- `BattleReplay`'s props stay `{ events, party, foe, backdrop, trainerName?, onDone }`, so `RouteScreen.tsx` needs no change.
- A new test file only runs once appended to `package.json`'s `test` script.
- Commits: no `Co-Authored-By` trailer (owner preference). Work on `development`.

## Review Focus

1. A party member switches in after a faint: the player card, sprite, and pips must follow `sendout.index`, with status and volatiles cleared — covered in Task 2 (`switch-in` checks).
2. Skip mid-battle: the final board must show final HP, faints, and the winner line, and no ball toss / damage pop may replay — reducer side covered in Task 2 (seeded final-board checks); FX suppression is the `jumped` flag in Task 4, verified in Task 5's browser check.
3. An event stored before this change (foe without `sign`): the foe card must render with no sign icon and no crash — covered in Task 2 (`wildCombatant` without sign).
4. A species without a PMD sheet: falls back to the 96px front/back sprite — Task 4 `Combatant` fallback, verified in Task 5.
5. Very small or very large PMD frames: whole-number scale, never below 1× — covered in Task 3 (`pmdScale` checks for 24px, 48px, 104px).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/game/wilds.ts` | modify | `WildView.sign?: Sign` |
| `src/game/route-rules.ts` | modify | `mintFoe` fills `view.sign` |
| `scripts/route-rules.test.ts` | modify | foe view carries the frozen sign |
| `src/game/battle-board.ts` | create | `CombatantView`, `combatantFromCreature`, `wildCombatant`, `lineFor`, `boardAt` |
| `scripts/battle-board.test.ts` | create | reducer + `pmdScale` checks |
| `package.json` | modify | append the new test |
| `src/game/pmd.ts` | modify | `pmdScale` (moved from `PmdSprite`, plus whole-scale rounding) |
| `src/components/PmdSprite.tsx` | modify | `wholeScale` prop, uses `pmdScale` |
| `src/game/battle-labels.ts` | create | status/volatile labels and icon URLs, shared by both battle screens |
| `src/components/BattleScreen.tsx` | modify | import the labels instead of declaring them |
| `src/components/world/BattleReplay.tsx` | rewrite | board-driven arena with PMD combatants, FX, cards |
| `src/index.css` | modify | `.animate-shake`, `.animate-damage-pop` off under reduced motion |
| `CHANGELOG.md` | modify | `[Unreleased]` → Changed line |

---

### Task 1: Foe sign on `WildView`

**Files:**
- Modify: `src/game/wilds.ts:14-21`
- Modify: `src/game/route-rules.ts:118-129` (`mintFoe`)
- Test: `scripts/route-rules.test.ts` (after the `seeded wild retains a complete individual` check, ~line 43)

**Interfaces:**
- Produces: `WildView.sign?: Sign` — set on every route foe from `mintFoe`; absent on historical expedition/training views and on events stored before this change.

- [ ] **Step 1: Write the failing test**

In `scripts/route-rules.test.ts`, directly after the `check('seeded wild retains a complete individual…', …)` call that pins `sign: 'cancer'`, add:

```ts
check('the public foe view carries the frozen sign', wild.foe?.view.sign === 'cancer');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/route-rules.test.ts`
Expected: `FAIL: the public foe view carries the frozen sign` (TypeScript does not block `tsx`; the property is just `undefined`).

- [ ] **Step 3: Implement**

`src/game/wilds.ts` — add the import and the field:

```ts
import type { Sign } from './types.js';
```
(merge into the existing `./types.js` type import if there is one)

```ts
export interface WildView {
  dexId: number;
  level: number;
  shiny: boolean;
  altColor: boolean;
  rare: boolean;
  guardian: boolean;
  /** The foe's sign, for its battle card. Absent on events stored before it was sent. */
  sign?: Sign;
}
```

`src/game/route-rules.ts` in `mintFoe`, change the view line to:

```ts
    view: { dexId, level, shiny: mint.shiny, altColor: mint.altColor, rare, guardian: false, sign: mint.sign },
```

- [ ] **Step 4: Run tests**

Run: `npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/route-db.test.ts && npx tsx scripts/route-client.test.ts && npx tsc -b && npx tsc -p tsconfig.api.json`
Expected: all pass. (`route-api.test.ts` asserts the public event has no `mint`; `sign` alone is fine.)

- [ ] **Step 5: Commit**

```bash
git add src/game/wilds.ts src/game/route-rules.ts scripts/route-rules.test.ts
git commit -m "Send the route foe's sign with its public view"
```

---

### Task 2: Board reducer

**Files:**
- Create: `src/game/battle-board.ts`
- Create: `scripts/battle-board.test.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `WildView.sign?` (Task 1); `BattleEvent` from `src/game/battle.ts`; `effectivenessLabel` from `src/game/typechart.ts`; `CREATURES_BY_ID`, `asShiny`, `asAltColor` from `src/game/pokemon.ts`.
- Produces (used by Task 4):
  ```ts
  export interface CombatantView { dexId: number; name: string; types: PokemonType[]; sign: Sign | null; shiny: boolean; altColor: boolean; ball: string; sprite: string; back: string }
  export interface SideBoard { view: CombatantView | null; index: number; hp: number; maxHp: number; status: StatusKind; volatiles: VolatileKind[]; faints: number; spawnAt: number }
  export interface Board { player: SideBoard; foe: SideBoard; line: string; banner: string; bannerType: PokemonType | null }
  export interface Narration { foeName: string; guardian: boolean; trainerName?: string }
  export function combatantFromCreature(c: Creature, sign?: Sign | null): CombatantView
  export function wildCombatant(view: WildView): CombatantView | null
  export function lineFor(e: BattleEvent, n: Narration): string | null
  export function boardAt(input: { events: readonly BattleEvent[]; upTo: number; player: readonly CombatantView[]; foe: readonly CombatantView[]; narration: Narration }): Board
  ```

- [ ] **Step 1: Write the failing test**

Create `scripts/battle-board.test.ts`:

```ts
/**
 * Battle replay board: the pure fold from a server event log to what the
 * battle screen shows (who is out, HP, status, volatiles, faints, lines).
 *
 *   npx --yes tsx scripts/battle-board.test.ts
 */
import type { BattleEvent } from '../src/game/battle.js';
import { boardAt, combatantFromCreature, wildCombatant, type CombatantView, type Narration } from '../src/game/battle-board.js';
import { type OwnedMon } from '../src/game/box.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { starterFromOffer } from '../src/game/professions.js';
import { rollRouteFind, simulateRouteBattle } from '../src/game/route-rules.js';
import type { InventoryState } from '../src/game/route-actions.js';
import type { Side } from '../src/game/types.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const view = (dexId: number): CombatantView => {
  const c = CREATURES_BY_ID[String(dexId)];
  if (!c) throw new Error(`fixture species ${dexId} missing`);
  return combatantFromCreature(c);
};
const bulbasaur = view(1);
const charmander = view(4);
const squirtle = view(7);
const wild: Narration = { foeName: 'Squirtle', guardian: false };

// A hand-built log: lead out, foe out, burn, poison + volatile on, lead faints,
// second member switches in, foe transforms, burn clears.
const log: BattleEvent[] = [
  { kind: 'sendout', text: 'Go! Bulbasaur!', affected: 'player', index: 0, hp: 45, maxHp: 45 },
  { kind: 'sendout', text: '', affected: 'foe', index: 0, hp: 44, maxHp: 44, name: 'Squirtle' },
  { kind: 'status', text: 'Foe Squirtle was burned!', affected: 'foe', status: 'burn' },
  { kind: 'status', text: 'Bulbasaur was poisoned and weighed down!', affected: 'player', status: 'poison', volatile: 'weight', volatileOn: true },
  { kind: 'hit', text: '', actor: 'foe', affected: 'player', damage: 45, hp: 0, maxHp: 45, mult: 2, moveType: 'fire' },
  { kind: 'faint', text: 'Bulbasaur fainted!', affected: 'player' },
  { kind: 'sendout', text: 'Go! Charmander!', affected: 'player', index: 1, hp: 39, maxHp: 39 },
  { kind: 'transform', text: 'Foe Squirtle transformed!', actor: 'foe', transform: { dexId: 4, name: 'Charmander', types: ['fire'], sign: 'leo', sprite: 's', back: 'b' } },
  { kind: 'statusTick', text: 'Foe Squirtle’s burn faded.', affected: 'foe', status: null },
  { kind: 'status', text: 'Charmander is no longer weighed down.', affected: 'player', volatile: 'weight', volatileOn: false },
  { kind: 'sendout', text: '', affected: 'player', index: 9, hp: 1, maxHp: 1 },
];
const at = (upTo: number) => boardAt({ events: log, upTo, player: [bulbasaur, charmander], foe: [squirtle], narration: wild });

check('nothing is out before the first send-out', at(-1).player.view === null && at(-1).foe.view === null);
check('send-out puts the indexed member out with its HP', at(0).player.view?.dexId === 1 && at(0).player.hp === 45 && at(0).player.spawnAt === 0);
check('a status event sets the main status', at(2).foe.status === 'burn');
check('a volatile toggles on', at(3).player.volatiles.includes('weight'));
check('the same event can set the player\'s main status', at(3).player.status === 'poison');
check('a super-effective hit raises the banner with its type', at(4).banner === 'Super effective!' && at(4).bannerType === 'fire');
check('faint zeroes HP and counts the faint', at(5).player.hp === 0 && at(5).player.faints === 1);
check('switch-in follows sendout.index, clears status and volatiles, and re-keys the spawn', at(6).player.view?.dexId === 4 && at(6).player.index === 1 && at(6).player.volatiles.length === 0 && at(6).player.status === null && at(6).player.spawnAt === 6);
check('switch-in keeps the faint count', at(6).player.faints === 1);
check('transform swaps species, types and sign in place', at(7).foe.view?.dexId === 4 && at(7).foe.view?.types.join() === 'fire' && at(7).foe.view?.sign === 'leo' && at(7).foe.spawnAt === 1);
check('status: null clears the main status', at(8).foe.status === null);
check('a volatile toggles off', at(9).player.volatiles.length === 0);
check('an out-of-range send-out index keeps the current member', at(10).player.view?.dexId === 4);
check('earlier boards are not mutated by later events', at(3).player.volatiles.includes('weight') && at(10).player.volatiles.length === 0);

check('a wild foe announces itself', at(1).line === 'A wild Squirtle appeared!');
check('a trainer foe is sent out by name', boardAt({ events: log, upTo: 1, player: [bulbasaur], foe: [squirtle], narration: { foeName: 'Squirtle', guardian: false, trainerName: 'Youngster Joey' } }).line === 'Youngster Joey sends out Squirtle!');

// Foe views from the public WildView, with and without the sign.
const withSign = wildCombatant({ dexId: 7, level: 3, shiny: true, altColor: false, rare: false, guardian: false, sign: 'pisces' });
const legacy = wildCombatant({ dexId: 7, level: 3, shiny: false, altColor: false, rare: false, guardian: false });
check('a wild foe view carries its sign and shiny identity', withSign?.sign === 'pisces' && withSign.shiny === true);
check('a stored foe without a sign renders with no sign', legacy !== null && legacy.sign === null);
check('an unknown species has no foe view', wildCombatant({ dexId: 99_999, level: 1, shiny: false, altColor: false, rare: false, guardian: false }) === null);

// A real seeded route battle: the final board agrees with the log.
const stocked: InventoryState = { revision: 1, stacks: [{ itemId: 'poke', quantity: 20 }] };
const find = rollRouteFind({ knownLandmarks: [], questClaimed: false, inventory: stocked, seed: 'test-0', kind: 'wild' });
const starterMint = starterFromOffer('route-balance:10:0:4', 10);
if (!starterMint || !find.foe) throw new Error('Pinned battle fixture is unavailable');
const mon: OwnedMon = { ...starterMint, id: 'starter', exp: 0, origin: 'starter', caughtAt: 0 };
const battle = simulateRouteBattle({ party: [mon], foe: find.foe, seed: 'rules-battle' });
const foeView = wildCombatant(find.foe.view);
const starterView = view(mon.dexId);
if (!foeView) throw new Error('Pinned foe view is unavailable');
const last = battle.events.length - 1;
const final = boardAt({ events: battle.events, upTo: last, player: [starterView], foe: [foeView], narration: { foeName: foeView.name, guardian: false } });
const lastHp = (side: Side): number => {
  for (let i = last; i >= 0; i--) {
    const e = battle.events[i];
    if (e.affected === side && e.kind === 'faint') return 0;
    if (e.affected === side && typeof e.hp === 'number') return e.hp;
  }
  return -1;
};
check('seeded final board shows the last HP the log reported for each side', final.player.hp === lastHp('player') && final.foe.hp === lastHp('foe'));
check('seeded final board names the winner', final.line === (battle.won ? 'You won the battle!' : 'Your party was defeated.'));
check('seeded final board counts the loser’s faint', (battle.won ? final.foe.faints : final.player.faints) === 1);
check('seeded battle shows the foe’s sign from the view', final.foe.view?.sign === find.foe.mint.sign);

console.log(`Battle board: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
```

Append ` && tsx scripts/battle-board.test.ts` to the end of `package.json`'s `test` script (after `tsx scripts/town.test.ts`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/battle-board.test.ts`
Expected: fails to start with `Cannot find module '../src/game/battle-board.js'`.

- [ ] **Step 3: Implement `src/game/battle-board.ts`**

```ts
import type { BattleEvent } from './battle.js';
import { asAltColor, asShiny, CREATURES_BY_ID } from './pokemon.js';
import { effectivenessLabel } from './typechart.js';
import type { Creature, PokemonType, Side, Sign, StatusKind, VolatileKind } from './types.js';
import type { WildView } from './wilds.js';

// The battle screen's state, folded from the server's event log. Pure: the
// screen replays events 0..upTo through it, so Skip is a jump to the end.

/** What the screen draws for one Pokémon on the field. */
export interface CombatantView {
  dexId: number;
  name: string;
  types: PokemonType[];
  /** Null when the server did not send it (events stored before the foe's sign was public). */
  sign: Sign | null;
  shiny: boolean;
  altColor: boolean;
  /** Cosmetic ball id for the send-out toss. */
  ball: string;
  /** Front and back battle sprites, the fallback when a species has no PMD sheet. */
  sprite: string;
  back: string;
}

export interface SideBoard {
  /** Null until the side's first send-out. */
  view: CombatantView | null;
  index: number;
  hp: number;
  maxHp: number;
  status: StatusKind;
  volatiles: VolatileKind[];
  faints: number;
  /** Event index of the side's latest send-out, -1 before the first; keys the spawn effects. */
  spawnAt: number;
}

export interface Board {
  player: SideBoard;
  foe: SideBoard;
  line: string;
  banner: string;
  bannerType: PokemonType | null;
}

export interface Narration {
  foeName: string;
  guardian: boolean;
  trainerName?: string;
}

export function combatantFromCreature(c: Creature, sign: Sign | null = c.sign): CombatantView {
  return {
    dexId: c.dexId,
    name: c.name,
    types: c.types,
    sign,
    shiny: c.shiny,
    altColor: c.altColor,
    ball: c.pokeball,
    sprite: c.sprite,
    back: c.back,
  };
}

/** The foe as the client knows it: the public view, never the server's mint. */
export function wildCombatant(view: WildView): CombatantView | null {
  const base = CREATURES_BY_ID[String(view.dexId)];
  if (!base) return null;
  const c = view.shiny ? asShiny(base) : view.altColor ? asAltColor(base) : base;
  return combatantFromCreature(c, view.sign ?? null);
}

/** The line to show for an event, or null for a beat with nothing to say. */
export function lineFor(e: BattleEvent, n: Narration): string | null {
  const prefix = n.trainerName ? `${n.trainerName}’s ` : n.guardian ? 'The guardian ' : 'The wild ';
  switch (e.kind) {
    case 'sendout':
      if (e.affected === 'foe') {
        const name = e.name ?? n.foeName;
        if (n.trainerName) return `${n.trainerName} sends out ${name}!`;
        return n.guardian ? `The guardian ${name} appears!` : `A wild ${name} appeared!`;
      }
      return e.text || null;
    case 'hit':
      if (e.crit) return 'A critical hit!';
      if (e.mult !== undefined && e.mult > 1) return 'It’s super effective!';
      if (e.mult !== undefined && e.mult > 0 && e.mult < 1) return 'It’s not very effective…';
      return null;
    case 'faint':
      return e.affected === 'foe' ? (e.text || '').replace(/^Foe /, prefix) : e.text || null;
    case 'end':
      return e.winner === 'player' ? 'You won the battle!' : 'Your party was defeated.';
    default:
      return e.text ? e.text.replace(/^Foe /, prefix) : null;
  }
}

const emptySide = (): SideBoard => ({
  view: null, index: 0, hp: 0, maxHp: 1, status: null, volatiles: [], faints: 0, spawnAt: -1,
});

/** Replay the log up to `upTo` (inclusive) into what the screen shows. */
export function boardAt({ events, upTo, player, foe, narration }: {
  events: readonly BattleEvent[];
  upTo: number;
  player: readonly CombatantView[];
  foe: readonly CombatantView[];
  narration: Narration;
}): Board {
  const sides: Record<Side, SideBoard> = { player: emptySide(), foe: emptySide() };
  const teams: Record<Side, readonly CombatantView[]> = { player, foe };
  const board: Board = { player: sides.player, foe: sides.foe, line: '', banner: '', bannerType: null };
  for (let i = 0; i <= upTo && i < events.length; i++) {
    const e = events[i];
    const s = e.affected ? sides[e.affected] : null;
    if (e.kind === 'sendout' && e.affected && s) {
      const next = typeof e.index === 'number' ? teams[e.affected][e.index] : undefined;
      if (next && typeof e.index === 'number') {
        s.view = next;
        s.index = e.index;
      }
      s.status = null;
      s.volatiles = [];
      s.spawnAt = i;
    } else if (s && e.status !== undefined) {
      s.status = e.status ?? null;
    }
    if (s && typeof e.hp === 'number' && typeof e.maxHp === 'number') {
      s.hp = e.hp;
      s.maxHp = e.maxHp;
    }
    if (s && e.volatile) {
      const vol = e.volatile;
      if (e.volatileOn && !s.volatiles.includes(vol)) s.volatiles = [...s.volatiles, vol];
      if (!e.volatileOn) s.volatiles = s.volatiles.filter((v) => v !== vol);
    }
    if (e.kind === 'transform' && e.actor && e.transform) {
      const a = sides[e.actor];
      const t = e.transform;
      if (a.view) a.view = { ...a.view, dexId: t.dexId, name: t.name, types: t.types, sign: t.sign, sprite: t.sprite, back: t.back };
    }
    if (e.kind === 'faint' && s) {
      s.hp = 0;
      s.faints += 1;
    }
    if (e.kind === 'move') {
      board.banner = '';
      board.bannerType = null;
    }
    if (e.kind === 'hit' && e.mult) {
      const label = effectivenessLabel(e.mult);
      if (label) {
        board.banner = label;
        board.bannerType = e.moveType ?? null;
      }
    }
    if (e.kind === 'noeffect') {
      board.banner = 'It had no effect…';
      board.bannerType = e.moveType ?? null;
    }
    const line = lineFor(e, narration);
    if (line) board.line = line;
  }
  return board;
}
```

Note: `volatiles` is only ever replaced, never pushed into, so a board returned for an earlier `upTo` is never mutated by a later call (each call starts from `emptySide()` anyway).

- [ ] **Step 4: Run tests**

Run: `npx tsx scripts/battle-board.test.ts && npx tsc -b`
Expected: `Battle board: 23 passed, 0 failed.` and a clean type-check.

Mutation check (required by `.agents/rules/testing.md`): temporarily delete the `s.status = null;` line in the sendout branch, rerun — the `switch-in … clears status` check must fail (Bulbasaur is poisoned at event 3). Restore the line.

- [ ] **Step 5: Commit**

```bash
git add src/game/battle-board.ts scripts/battle-board.test.ts package.json
git commit -m "Fold battle logs into a replay board"
```

---

### Task 3: Whole-number PMD scale

**Files:**
- Modify: `src/game/pmd.ts` (add `pmdScale`)
- Modify: `src/components/PmdSprite.tsx:136-142` (use it; add `wholeScale`)
- Test: `scripts/battle-board.test.ts` (append before the final `console.log`)

**Interfaces:**
- Produces: `export function pmdScale({ refHeight, heightPx, wholeScale }: { refHeight: number; heightPx: number; wholeScale: boolean }): number` in `src/game/pmd.ts`; `PmdSprite` prop `wholeScale?: boolean` (default `false`).

- [ ] **Step 1: Write the failing test**

Add `import { pmdScale } from '../src/game/pmd.js';` to the imports of `scripts/battle-board.test.ts`, and before the final `console.log`:

```ts
// PMD frames scale by whole numbers on route battles (styling.md), never below 1×.
check('a small 24px frame doubles', pmdScale({ refHeight: 24, heightPx: 84, wholeScale: true }) === 2);
check('a mid 48px frame doubles', pmdScale({ refHeight: 48, heightPx: 84, wholeScale: true }) === 2);
check('a large 104px frame stays native', pmdScale({ refHeight: 104, heightPx: 84, wholeScale: true }) === 1);
check('a huge 200px frame never drops below 1×', pmdScale({ refHeight: 200, heightPx: 84, wholeScale: true }) === 1);
check('the old battle screen keeps its relative scale', Math.abs(pmdScale({ refHeight: 48, heightPx: 84, wholeScale: false }) - 1.75) < 1e-9);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/battle-board.test.ts`
Expected: `SyntaxError: The requested module '../src/game/pmd.js' does not provide an export named 'pmdScale'`.

- [ ] **Step 3: Implement**

In `src/game/pmd.ts`, append:

```ts
/**
 * Pixels per sheet pixel for a species. Draws it near its relative native size
 * (a frame's height is a decent proxy: Onix ~104px, Geodude ~24px), compressed
 * with a power curve and clamped so tiny mons aren't dwarfed and huge ones don't
 * overflow; `heightPx` is the size at a 48px reference frame. `wholeScale`
 * rounds to a whole multiple (min 1×) so the pixel art stays crisp.
 */
export function pmdScale({ refHeight, heightPx, wholeScale }: {
  refHeight: number; heightPx: number; wholeScale: boolean;
}): number {
  const REF = 48;
  const target = heightPx * Math.pow(refHeight / REF, 0.6);
  const displayed = Math.max(heightPx * 0.62, Math.min(heightPx * 1.45, target));
  const scale = displayed / refHeight;
  return wholeScale ? Math.max(1, Math.round(scale)) : scale;
}
```

In `src/components/PmdSprite.tsx`:
- import `pmdScale` alongside the other `../game/pmd` imports;
- add the prop to the destructure (`wholeScale = false,`) and type (`/** Round to a whole multiple of the sheet's pixels (Night screens). */ wholeScale?: boolean;`);
- replace the block from `const REF = 48;` through `const scale = displayed / anim.refHeight;` (and its comment) with:

```ts
  const scale = pmdScale({ refHeight: anim.refHeight, heightPx, wholeScale });
```

- change the root `className` to drop the soft shadow when whole-scaled:

```tsx
      className={`pointer-events-none ${wholeScale ? '' : 'drop-shadow-lg'}`}
```

- [ ] **Step 4: Run tests**

Run: `npx tsx scripts/battle-board.test.ts && npx tsc -b && npm run lint`
Expected: `Battle board: 28 passed, 0 failed.`; clean type-check and lint.

- [ ] **Step 5: Commit**

```bash
git add src/game/pmd.ts src/components/PmdSprite.tsx scripts/battle-board.test.ts
git commit -m "Let PMD sprites scale by whole pixels"
```

---

### Task 4: Choreographed `BattleReplay`

**Files:**
- Create: `src/game/battle-labels.ts`
- Modify: `src/components/BattleScreen.tsx:53-68` (use the shared labels)
- Rewrite: `src/components/world/BattleReplay.tsx`
- Modify: `src/index.css:397-407` (reduced-motion block)
- Modify: `CHANGELOG.md` (`[Unreleased]`)

**Interfaces:**
- Consumes: Task 2's `boardAt`, `combatantFromCreature`, `wildCombatant`, `CombatantView`, `SideBoard`, `Narration`; Task 3's `PmdSprite` `wholeScale`; `hasPmdSprite`, `PmdAnimKind` from `src/game/pmd.ts`; `partyCreatures` from `src/game/activity.ts`.
- Produces: `BattleReplay` with unchanged props `{ events, party, foe, backdrop, trainerName?, onDone }`; `battle-labels.ts` exports `STATUS_LABEL`, `VOLATILE_LABEL`, `statusIconUrl`, `volatileIconUrl`.

No new unit test: the component is presentation over the Task 2 reducer (already covered). Task 5's browser check is its verification.

- [ ] **Step 1: Shared labels**

Create `src/game/battle-labels.ts` (move the four definitions verbatim from `BattleScreen.tsx:53-68`):

```ts
import type { StatusKind, VolatileKind } from './types.js';

const ASSET = import.meta.env?.BASE_URL ?? '/';

export const statusIconUrl = (s: Exclude<StatusKind, null>): string => `${ASSET}sprites/status/${s}.png`;
export const STATUS_LABEL: Record<Exclude<StatusKind, null>, string> = {
  burn: 'Burned',
  stun: 'Paralyzed',
  poison: 'Badly poisoned',
  sleep: 'Asleep',
  frostbite: 'Frostbitten',
};
// Volatile afflictions render their own pill alongside the primary status badge.
export const volatileIconUrl = (v: VolatileKind): string => `${ASSET}sprites/status/${v}.png`;
export const VOLATILE_LABEL: Record<VolatileKind, string> = {
  weight: 'Weighed down — Speed cut',
  blind: 'Blinded — accuracy down',
  disarm: 'Disarmed — strongest move sealed',
};
```

In `src/components/BattleScreen.tsx`, delete those four declarations (`statusIconUrl`, `STATUS_LABEL`, the volatile comment, `volatileIconUrl`, `VOLATILE_LABEL`) and add:

```ts
import { STATUS_LABEL, VOLATILE_LABEL, statusIconUrl, volatileIconUrl } from '../game/battle-labels';
```

Keep `ASSET` in `BattleScreen.tsx` only if something else there still reads it (`grep -n ASSET src/components/BattleScreen.tsx`); otherwise remove it so lint passes.

Run: `npx tsc -b && npm run lint` — expected clean.

- [ ] **Step 2: Reduced motion for shake and damage pop**

In `src/index.css`, extend the first `@media (prefers-reduced-motion: reduce)` selector list (line ~397) with `.animate-shake,` and `.animate-damage-pop,` so it reads:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-marquee,
  .animate-spotlight-in,
  .animate-ball-toss-player,
  .animate-ball-toss-foe,
  .animate-ball-burst,
  .animate-materialize,
  .animate-card-in,
  .animate-shake,
  .animate-damage-pop {
    animation: none;
  }
}
```

- [ ] **Step 3: Rewrite `src/components/world/BattleReplay.tsx`**

Replace the whole file with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { partyCreatures } from '../../game/activity';
import type { BattleEvent } from '../../game/battle';
import { boardAt, combatantFromCreature, wildCombatant, type SideBoard } from '../../game/battle-board';
import { STATUS_LABEL, VOLATILE_LABEL, statusIconUrl, volatileIconUrl } from '../../game/battle-labels';
import type { OwnedMon } from '../../game/box';
import { ballUrl } from '../../game/balls';
import { hasPmdSprite, type PmdAnimKind } from '../../game/pmd';
import { TYPE_COLORS } from '../../game/typechart';
import type { Side } from '../../game/types';
import type { WildView } from '../../game/wilds';
import { signIconUrl, signLabel } from '../../game/zodiac';
import { PmdSprite } from '../PmdSprite';
import { TypeBadges } from '../TypeBadge';
import { PixelSprite } from '../ui/PixelSprite';
import { StatBar } from '../ui/StatBar';
import { Backdrop } from './Backdrop';
import { POKEBALL, speciesName } from './scene';

// Plays the server's event log with the old Rental Rumble choreography. It
// never simulates: the server decided the battle and sent what happened. The
// board comes from boardAt; animations come only from the current event.

// Pause before showing each kind of event (ms), tuned so attacks read.
const DELAY: Record<BattleEvent['kind'], number> = {
  sendout: 450,
  withdraw: 700,
  move: 900,
  miss: 850,
  hit: 820,
  noeffect: 850,
  status: 850,
  stat: 800,
  heal: 850,
  statusTick: 800,
  stunned: 800,
  ability: 900,
  transform: 950,
  faint: 1150,
  end: 650,
};
// Resting height (px) of a reference PMD frame; whole-scaled per species.
const PMD_HEIGHT = 84;
// When the send-out flash opens, matching the ball-burst beat in index.css.
const FILL_MS = 620;

interface Anim {
  kind: PmdAnimKind;
  loop: boolean;
  token: number;
}

/** What a side is doing on the current beat. One-shots settle to idle once they end. */
function animFor({ side, board, event, at, settled, live }: {
  side: Side; board: SideBoard; event: BattleEvent | undefined; at: number; settled: number; live: boolean;
}): Anim {
  if (board.hp <= 0 && board.faints > 0) return { kind: 'faint', loop: true, token: -2 };
  if (live && event && settled !== at) {
    if (event.kind === 'move' && event.actor === side) return { kind: event.moveAnim ?? 'attack', loop: false, token: at };
    if (event.kind === 'hit' && event.affected === side) return { kind: 'hurt', loop: false, token: at };
  }
  return { kind: 'idle', loop: true, token: -1 };
}

function BallFx({ side, ball }: { side: Side; ball: string }) {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
      <span className="animate-ball-burst absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 bg-ink/80" />
      <img
        src={ballUrl(ball)}
        alt=""
        className={`relative h-6 w-6 object-contain [image-rendering:pixelated] ${side === 'player' ? 'animate-ball-toss-player' : 'animate-ball-toss-foe'}`}
      />
    </div>
  );
}

// Module scope so it keeps its identity across beats: the PMD frame animator
// stays mounted between events and only remounts on a fresh send-out.
function Combatant({ side, board, anim, live, hit, shake, onAnimEnd }: {
  side: Side;
  board: SideBoard;
  anim: Anim;
  /** Play spawn effects (false after Skip and under reduced motion). */
  live: boolean;
  hit: { amount: number; crit: boolean; key: number } | null;
  shake: boolean;
  onAnimEnd: (side: Side) => void;
}) {
  const view = board.view;
  if (!view) return null;
  const pos = side === 'foe' ? 'right-[14%] bottom-[46%]' : 'left-[10%] bottom-4';
  const fallback = (
    <PixelSprite src={side === 'player' ? view.back : view.sprite} fallback={POKEBALL} size={96} alt="" />
  );
  return (
    <div className={`absolute z-0 flex flex-col items-center ${pos}`}>
      <div className="relative flex items-end justify-center">
        {hit && (
          <span key={hit.key} className={`dmg-number animate-damage-pop pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 whitespace-nowrap leading-none ${hit.crit ? 'text-sm' : 'text-xs'}`}>
            -{hit.amount}
            {hit.crit && <span className="ml-1 font-label text-[8px] uppercase text-accent">Crit</span>}
          </span>
        )}
        {live && <BallFx key={`ball-${board.spawnAt}`} side={side} ball={view.ball} />}
        <div key={`${view.dexId}-${board.spawnAt}`} className={live ? 'animate-materialize' : ''}>
          <div className={`flex items-end justify-center ${shake ? 'animate-shake' : ''}`}>
            {hasPmdSprite(view.dexId) ? (
              <PmdSprite
                dexId={view.dexId}
                side={side}
                kind={anim.kind}
                loop={anim.loop}
                playToken={anim.token}
                shiny={view.shiny}
                altColor={view.altColor}
                heightPx={PMD_HEIGHT}
                wholeScale
                onAnimEnd={() => onAnimEnd(side)}
                fallback={fallback}
              />
            ) : (
              fallback
            )}
          </div>
        </div>
      </div>
      <div className="mt-0.5 h-2 w-16 bg-edge/60" />
    </div>
  );
}

function InfoCard({ board, hp, pips, className }: {
  board: SideBoard;
  /** The HP to draw (0 while a fresh send-out's bar is filling). */
  hp: number;
  /** Party size for faint pips, or null for no pips. */
  pips: number | null;
  className: string;
}) {
  const view = board.view;
  if (!view) return null;
  return (
    <div className={`animate-card-in absolute z-10 flex w-[48%] flex-col gap-1 rounded-[3px] border-2 border-window-frame bg-window/90 px-1.5 py-1 ${className}`}>
      <div className="flex items-center gap-1 font-pixel text-xs">
        <span className="truncate">{view.name}</span>
        {view.shiny && <span className="text-caught-shiny" aria-label="Shiny">✦</span>}
        {view.sign && <img src={signIconUrl(view.sign)} alt={signLabel(view.sign)} title={signLabel(view.sign)} className="h-4 w-4 shrink-0 object-contain" />}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <TypeBadges types={view.types} />
        {board.status && (
          <img src={statusIconUrl(board.status)} alt={STATUS_LABEL[board.status]} title={STATUS_LABEL[board.status]} className="h-3.5 shrink-0 object-contain [image-rendering:pixelated]" />
        )}
        {board.volatiles.map((v) => (
          <img key={v} src={volatileIconUrl(v)} alt={VOLATILE_LABEL[v]} title={VOLATILE_LABEL[v]} className="h-3.5 shrink-0 object-contain [image-rendering:pixelated]" />
        ))}
      </div>
      <StatBar value={hp} max={board.maxHp} tone="night" label={`${view.name} HP`} segments={12} />
      <div className="flex items-center justify-between gap-1">
        <span className="font-label text-[10px] tabular-nums text-ink-dim">
          {Math.max(0, Math.ceil(hp))} / {board.maxHp}
        </span>
        {pips !== null && (
          <span className="flex gap-0.5" aria-label={`${pips - board.faints} of ${pips} able to battle`}>
            {Array.from({ length: pips }, (_, i) => (
              <span key={i} className={`h-2 w-2 ${i < pips - board.faints ? 'bg-ink' : 'border border-ink-dim'}`} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export function BattleReplay({
  events,
  party,
  foe,
  backdrop,
  trainerName,
  onDone,
}: {
  events: readonly BattleEvent[];
  party: readonly OwnedMon[];
  foe: WildView;
  /** The route's scene behind the arena. */
  backdrop: string;
  trainerName?: string;
  onDone: () => void;
}) {
  const [at, setAt] = useState(0);
  // True once Skip is used: the board jumps and no effect replays.
  const [jumped, setJumped] = useState(false);
  // The event index each side's one-shot animation finished on.
  const [settled, setSettled] = useState<Record<Side, number>>({ player: -1, foe: -1 });
  // The send-out index whose HP bar has finished filling.
  const [filled, setFilled] = useState(-1);
  const last = events.length - 1;
  const done = at >= last;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const live = !jumped && !reduced;

  // Building creatures derives movesets; do it once per battle, not per beat.
  const rosters = useMemo(() => {
    const foeView = wildCombatant(foe);
    return {
      player: partyCreatures(party).map((c) => combatantFromCreature(c)),
      foe: foeView ? [foeView] : [],
    };
  }, [party, foe]);
  const board = boardAt({
    events,
    upTo: at,
    player: rosters.player,
    foe: rosters.foe,
    narration: { foeName: speciesName(foe.dexId), guardian: foe.guardian, trainerName },
  });
  const event = events[at];

  useEffect(() => {
    if (done || reduced) return;
    const next = events[at + 1];
    const t = window.setTimeout(() => setAt((i) => Math.min(last, i + 1)), next ? DELAY[next.kind] : DELAY.end);
    return () => window.clearTimeout(t);
  }, [at, done, events, last, reduced]);

  useEffect(() => {
    if (!live || event?.kind !== 'sendout') return;
    const t = window.setTimeout(() => setFilled(at), FILL_MS);
    return () => window.clearTimeout(t);
  }, [at, event, live]);

  const hpFor = (side: Side): number =>
    live && event?.kind === 'sendout' && event.affected === side && filled !== at ? 0 : board[side].hp;
  const hitOn = (side: Side) =>
    live && event?.kind === 'hit' && event.affected === side
      ? { amount: event.damage ?? 0, crit: Boolean(event.crit), key: at }
      : null;
  const settle = (side: Side) => setSettled((s) => ({ ...s, [side]: at }));
  const won = events[last]?.winner === 'player';

  return (
    <section aria-label="Battle" className="ui-window m-2 p-2">
      <div className="relative h-64 overflow-hidden rounded-[3px] bg-slot">
        <Backdrop src={backdrop} anchor={0.6} />
        <InfoCard board={board.foe} hp={hpFor('foe')} pips={null} className="left-2 top-2" />
        {(['foe', 'player'] as const).map((side) => (
          <Combatant
            key={side}
            side={side}
            board={board[side]}
            anim={animFor({ side, board: board[side], event, at, settled: settled[side], live })}
            live={live && board[side].spawnAt >= 0}
            hit={hitOn(side)}
            shake={hitOn(side) !== null}
            onAnimEnd={settle}
          />
        ))}
        <InfoCard board={board.player} hp={hpFor('player')} pips={rosters.player.length} className="bottom-2 right-2" />
        {board.banner && (
          <span
            className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[3px] border-2 bg-window px-2 py-0.5 font-label text-[10px] uppercase"
            style={board.bannerType ? { borderColor: TYPE_COLORS[board.bannerType] } : undefined}
          >
            {board.banner}
          </span>
        )}
      </div>

      <p aria-live="polite" className="mt-2 min-h-12 rounded-[3px] border-2 border-window-frame bg-edge px-2 py-1.5 text-sm">
        {board.line || '…'}
      </p>

      <div className="mt-2 flex justify-end gap-2">
        {done ? (
          <button type="button" onClick={onDone} autoFocus className="ui-button-primary ui-focus min-h-11 px-4 font-label text-[10px] uppercase">
            {won ? 'Continue' : 'See what happened'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setAt((i) => Math.min(last, i + 1))} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
              Next
            </button>
            <button
              type="button"
              onClick={() => {
                setJumped(true);
                setAt(last);
              }}
              className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </section>
  );
}
```

Notes for the implementer:
- `bg-ink/80` on the burst replaces the old radial gradient (no hex, no gradient on Night screens).
- Fainted pips are hollow (`border-ink-dim`, ≥ 3:1 on `bg-window`), live pips solid `bg-ink`.
- `rounded-[3px]` on the banner is the Night corner (≤ 6px), not a pill.
- `BallFx` keyed by `spawnAt` only mounts while `live`, so Skip never replays a toss.
- `animFor` gives idle and faint fixed tokens (`-1`, `-2`) so they do not restart every beat; one-shots use `at` and settle via `onAnimEnd`.

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc -b && npm run lint`
Expected: clean.

- [ ] **Step 5: CHANGELOG**

Under `## [Unreleased]` in `CHANGELOG.md`, add a `### Changed` subsection if missing (after `### Added`'s list), with:

```markdown
- **Battles come alive** — Sunny Meadow battles play like the original Rental Rumble: animated Pokémon that attack, flinch and faint, a Poké Ball toss on send-out, damage numbers, effectiveness banners, and status and sign badges on each Pokémon's card. Next and Skip work as before.
```

- [ ] **Step 6: Commit**

```bash
git add src/game/battle-labels.ts src/components/BattleScreen.tsx src/components/world/BattleReplay.tsx src/index.css CHANGELOG.md
git commit -m "Replay route battles with the old animated choreography"
```

---

### Task 5: Full gate and browser check

**Files:** none (verification only; fix-ups go in a follow-up commit on the task they belong to).

- [ ] **Step 1: Full gate**

Run: `npm run lint && npm test && npm run build`
Expected: all pass. Record the HEAD (`git rev-parse --short HEAD`) and each command's result. Separate any pre-existing failure (reproduce it on `07508aac`) from a regression.

- [ ] **Step 2: Confirm local env points at a file database**

Run: `grep -n '^TURSO_DATABASE_URL=file:' .env.local`
Expected: one match. If missing, stop and ask the owner — `.env` is production.

- [ ] **Step 3: Browser check under `npm run dev:local`**

Start `npm run dev:local` (Vite prints its port; it is :3000 on this machine). At 375px wide, signed in with a test account that has a party:
1. Sunny Meadow → Find wild → Battle. Watch: ball toss and materialize on each send-out, HP bar fills, attacker plays its move animation, target flinches + shakes + shows `-N`, effectiveness banner, faint loop, cards show types / sign / status icons, player pips drop on a faint.
2. Find NPC → a trainer battle: line reads `<Trainer> sends out <Species>!`; foe card shows its sign.
3. Start another battle and press Skip mid-way: final HP, faints, and winner line are correct, and no ball toss or damage number replays.
4. Enable reduced motion (DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`): no autoplay, sprites hold still, no toss/shake/pop; Next steps through.
5. A party member without a PMD sheet (check `hasPmdSprite`; any species missing from `public/sprites/pmd/`) shows the 96px back sprite.

Take screenshots of steps 1–3 for the report. If any check cannot be run, say which and why; do not call it passed.

- [ ] **Step 4: Review**

Run the `reviewer` subagent over `git diff 07508aac..HEAD`; fix P0/P1 findings in a follow-up commit and rerun Step 1.
