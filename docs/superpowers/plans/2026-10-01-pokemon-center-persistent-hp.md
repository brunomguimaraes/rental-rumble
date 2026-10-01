# Pokémon Center and Persistent HP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pokémon keep their HP between Sunny Meadow battles, fainted Pokémon sit out, a lost battle whites the trainer out to Hearth Town, and the Pokémon Center heals every owned Pokémon instantly and for free.

**Architecture:** The battle engine learns to start player creatures at a given HP and to report their final HP. A small pure module (`src/game/health.ts`) derives max/current HP from the engine so screens and battles agree. The server stores damage as `owned_pokemon.hp_lost` and the trainer's position as `route_accounts.trainer_at`, writes both inside the existing route write transactions, and adds one `heal` command behind `api/world/[action].ts`. The town's Center card opens a new Center view inside `RouteScreen`.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4 Night tokens, Vercel functions, Turso/libSQL, `tsx` test scripts.

**Spec:** `docs/superpowers/specs/2026-10-01-pokemon-center-persistent-hp-design.md` — read it before starting any task.

## Global Constraints

- Runtime relative imports in `src/game/` and `api/` end in `.js`; `import type` may omit it; components may omit it.
- Battle-engine HP units everywhere. `hpLost` absent or ≤ 0 means full health. Fainted = `hpLost ≥ maxHp`.
- Full-health battles must keep their exact pinned outcomes (existing tests such as `expGained === 7` must keep passing unchanged).
- Schema change is additive only: two `COLUMN_ADDS` lines, no new tables, no unique index. `rulesVersion` stays `2`.
- Healing: instant, free, no action spent, every owned Pokémon of the account (party and Box), refused with 409 while a route encounter is unresolved.
- Search with no non-fainted party member → 400 `Your party needs care. Visit the Pokémon Center in Hearth Town.` before any action is spent.
- EXP after a win only to fielded members that end the battle above 0 HP.
- Whiteout copy: `Your party is out of strength. You hurried back to Hearth Town.`
- Levels stay hidden. HP numbers may be shown.
- Night UI tokens only, no hex in components; controls are real buttons with `ui-focus`, ≥44 px touch targets, layouts work at 320–430 px.
- Never point a test at `local.db` or a Turso URL; never run `db:setup` without a `file:` URL (see Task 5 Step 9).
- Commits: no `Co-Authored-By` trailer (owner preference). Work on `development`.

## Review Focus

1. **A won battle in which every fielded member faints (double KO).** Expect no EXP for anyone and a whiteout to Hearth Town. The whiteout rule is "no party member standing after the battle", not "outcome is lost". Task 3 Step 1 pins this with a direct check of the shared helper.
2. **Growth on a damaged Pokémon.** Growth raises max HP but must not erase `hp_lost`, so current HP rises by the max-HP increase. `hp_lost` is computed from the pre-growth snapshot max HP. Task 3's won-battle test asserts `hp_lost` equals that value even after EXP was applied.
3. **A reload with a pending heal command.** The tab-stored pending command must survive a reload for `heal` and retry with the same request ID. Task 4's client test covers `readPendingRouteCommand` for `heal`.
4. **Old stored battles without `fielded`.** A replay or result for an event resolved before this change must not crash and must use the full party. `RouteBattle.fielded` is optional, so TypeScript forces every reader to guard it (Task 2). Task 5 uses `?.` and falls back to the full party.
5. **A party edited to include healthy Box Pokémon around a fainted lead.** The search must be allowed and the lead must sit out. Task 3's survivors test fields a party whose fainted member comes first.

---

### Task 1: Battle engine start HP and final HP

**Files:**
- Modify: `src/game/battle.ts` (`BattleResult` ~line 127, `makeBattler` ~line 145, `simulateBattle` opts ~line 1150 and sides setup ~line 1176, return ~line 2949)
- Test: `scripts/route-rules.test.ts`

**Interfaces:**
- Produces: `export function creatureMaxHp(creature: Creature, statMult?: number): number`; `simulateBattle(..., opts: { ...; playerStartHp?: readonly number[] })`; `BattleResult.playerHp: number[]` (final HP per player creature, input order, never negative).

- [ ] **Step 1: Write the failing tests**

In `scripts/route-rules.test.ts`, change the battle import line to also bring in the engine, and add the checks directly after the existing `check('battle leaves the frozen mint and party unchanged', ...)` line (so `mon` and `wild` exist):

```ts
import { creatureMaxHp, simulateBattle, type BattleResult } from '../src/game/battle.js';
```

```ts
// Persistent HP: the engine starts a player creature at a given HP and reports where it ended.
const hero = ownedMonToCreature(mon)!;
const foeCreature = ownedMonToCreature({ ...wild.foe.mint, id: 'route-foe', exp: 0, origin: 'catch', caughtAt: 0 })!;
const playerSendout = (r: { events: BattleResult['events'] }) => r.events.find((e) => e.kind === 'sendout' && e.affected === 'player');
const fullBattle = simulateBattle([hero], [foeCreature], 'hp-engine', { foeStatMult: wild.foe.statMult });
check('explicit full start HP replays the default battle exactly', same(fullBattle, simulateBattle([hero], [foeCreature], 'hp-engine', { foeStatMult: wild.foe.statMult, playerStartHp: [creatureMaxHp(hero)] })));
check('send-out max HP is creatureMaxHp', playerSendout(fullBattle)?.maxHp === creatureMaxHp(hero));
check('a player creature sends out at its start HP', playerSendout(simulateBattle([hero], [foeCreature], 'hp-engine', { foeStatMult: wild.foe.statMult, playerStartHp: [3] }))?.hp === 3);
check('final HP is reported per player creature', fullBattle.playerHp.length === 1 && fullBattle.playerHp[0] >= 0 && fullBattle.playerHp[0] <= creatureMaxHp(hero) && (fullBattle.winner === 'foe') === (fullBattle.playerHp[0] === 0));
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/route-rules.test.ts`
Expected: FAIL. tsx does not type-check, so the import of `creatureMaxHp` throws `SyntaxError`/`does not provide an export named 'creatureMaxHp'`. That is the expected reason.

- [ ] **Step 3: Implement**

In `src/game/battle.ts`:

1. Next to `hpStat` (keep the arithmetic order exactly, so floats round the same):

```ts
/** A creature's battle max HP: sign spread, shiny factor and side multiplier included. */
export function creatureMaxHp(creature: Creature, statMult = 1): number {
  const spread = SIGN_SPREAD[creature.sign];
  return Math.floor(hpStat(creature.stats.hp) * spread.hp * (statMult * shinyMult(creature)));
}
```

`shinyMult` is declared below `hpStat`. Place `creatureMaxHp` after `shinyMult`.

2. In `makeBattler`, replace `const maxHp = Math.floor(hpStat(creature.stats.hp) * spread.hp * mult);` with `const maxHp = creatureMaxHp(creature, statMult);`. Leave `spread` and `mult` if they are still used below. Delete them only if `tsc` reports them unused.

3. `BattleResult` gains the field:

```ts
export interface BattleResult {
  winner: Side;
  events: BattleEvent[];
  turns: number;
  /** Final HP of each player creature, in the order they were passed in; 0 when fainted. */
  playerHp: number[];
}
```

4. `simulateBattle` opts gain:

```ts
    /** Per player creature, the HP it starts at (clamped to 1..maxHp); absent = full. */
    playerStartHp?: readonly number[];
```

and directly after the `const sides: Record<Side, SideState> = { ... };` block:

```ts
  opts.playerStartHp?.forEach((hp, i) => {
    const b = sides.player.team[i];
    if (b && Number.isFinite(hp)) b.hp = Math.max(1, Math.min(b.maxHp, Math.floor(hp)));
  });
```

5. The final return becomes:

```ts
  return { winner, events, turns, playerHp: sides.player.team.map((b) => Math.max(0, b.hp)) };
```

Confirm `sides.player.team` still holds the original battlers in input order at that point. Switching changes `active`, not the array. If the engine reorders `team`, map back by the original creature instead.

6. Run `npx tsc -b`. Fix any other place that builds a `BattleResult` literal by adding `playerHp`. Do not make the field optional.

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx scripts/route-rules.test.ts && npx tsx scripts/growth.test.ts && npx tsc -b`
Expected: all checks pass. The balance rows keep their thresholds.

- [ ] **Step 5: Commit**

```bash
git add src/game/battle.ts scripts/route-rules.test.ts
git commit -m "Let battles start player Pokémon at a stored HP and report final HP"
```

---

### Task 2: Health rules and fielding in route battles

**Files:**
- Create: `src/game/health.ts`
- Modify: `src/game/box.ts` (`OwnedMon`), `src/game/route-actions.ts` (`RouteBattle`), `src/game/route-rules.ts` (`simulateRouteBattle`)
- Test: `scripts/route-rules.test.ts`

**Interfaces:**
- Consumes: `creatureMaxHp`, `simulateBattle(..., { playerStartHp })`, `BattleResult.playerHp` (Task 1).
- Produces:
  - `OwnedMon.hpLost?: number`
  - `src/game/health.ts`: `ownedMaxHp(mon: OwnedMon): number`, `hpLost(mon: OwnedMon): number`, `currentHp(mon: OwnedMon): number`, `isFainted(mon: OwnedMon): boolean`, `isHurt(mon: OwnedMon): boolean`, `partyStanding(party: readonly OwnedMon[], fielded: readonly FieldedMember[]): boolean`
  - `route-actions.ts`: `export interface FieldedMember { id: string; hp: number; maxHp: number }`; `RouteBattle.fielded?: FieldedMember[]`
  - `simulateRouteBattle` fields only non-fainted members at their current HP and returns `fielded`.

- [ ] **Step 1: Write the failing tests**

Add to the imports of `scripts/route-rules.test.ts`:

```ts
import { currentHp, isFainted, ownedMaxHp, partyStanding } from '../src/game/health.js';
```

Add after the Task 1 checks:

```ts
check('ownedMaxHp matches the battle send-out', playerSendout(battle)?.maxHp === ownedMaxHp(mon));
const shinyMon: OwnedMon = { ...mon, id: 'shiny-starter', shiny: true };
check('shiny ownedMaxHp matches the battle send-out', playerSendout(simulateRouteBattle({ party: [shinyMon], foe: wild.foe, seed: 'rules-battle' }))?.maxHp === ownedMaxHp(shinyMon) && ownedMaxHp(shinyMon) > ownedMaxHp(mon));
check('rows from before persistent HP are at full health', mon.hpLost === undefined && currentHp(mon) === ownedMaxHp(mon) && !isFainted(mon));
const hurt: OwnedMon = { ...mon, hpLost: ownedMaxHp(mon) - 2 };
const benched: OwnedMon = { ...mon, id: 'benched', hpLost: ownedMaxHp(mon) };
const benchBattle = simulateRouteBattle({ party: [benched, hurt], foe: wild.foe, seed: 'bench' });
check('fainted members sit out; the hurt member fights at its HP', same(benchBattle.fielded?.map((f) => f.id), [hurt.id]) && playerSendout(benchBattle)?.hp === 2);
check('fielded final HP is the battle’s own', benchBattle.fielded?.[0].maxHp === ownedMaxHp(hurt) && (benchBattle.won ? benchBattle.fielded[0].hp > 0 : benchBattle.fielded?.[0].hp === 0));
let allFaintedRejected = false;
try { simulateRouteBattle({ party: [benched], foe: wild.foe, seed: 'all-fainted' }); }
catch { allFaintedRejected = true; }
check('an all-fainted party cannot battle', allFaintedRejected);
check('a party is standing while any fielded member ends above 0 HP', partyStanding([mon, benched], [{ id: mon.id, hp: 1, maxHp: 20 }]));
check('a double KO leaves no one standing even on a win', !partyStanding([mon, benched], [{ id: mon.id, hp: 0, maxHp: 20 }]));
check('a member that sat out still counts by its stored HP', partyStanding([mon, { ...benched, id: 'rested', hpLost: 0 }], [{ id: mon.id, hp: 0, maxHp: 20 }]));
```

The `shinyMon > mon` comparison assumes the shiny factor raises HP (`SHINY_STAT_MULT > 1`). If species 10 cannot be shiny (`canBeShiny`), `ownedMonToCreature` drops the flag. In that case pick the first dex id in `STARTER_POOL` that can be shiny and build `shinyMon` from `starterFromOffer` the same way `mon` is built.

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/route-rules.test.ts`
Expected: FAIL. It cannot import `../src/game/health.js`.

- [ ] **Step 3: Implement**

`src/game/box.ts`, inside `OwnedMon` after `caughtAt`:

```ts
  /** Battle damage carried between battles, in engine HP units; absent = full health. */
  hpLost?: number;
```

`src/game/route-actions.ts`:

```ts
/** A party member that fought, with the HP it ended on. */
export interface FieldedMember { id: string; hp: number; maxHp: number }
export interface RouteBattle {
  won: boolean;
  turns: number;
  events: BattleEvent[];
  /** Fielded members in battle order; absent on battles stored before persistent HP. */
  fielded?: FieldedMember[];
}
```

Create `src/game/health.ts`:

```ts
import { creatureMaxHp } from './battle.js';
import { ownedMonToCreature, type OwnedMon } from './box.js';
import type { FieldedMember } from './route-actions.js';

// Persistent HP between battles. The engine owns max HP; an owned Pokémon only
// stores the damage it carries, so growth raises current HP with max HP. Pure:
// no clock, no I/O, shared by the server and the screens.

/** Max HP exactly as a route battle sees this individual; 0 for an unknown species. */
export function ownedMaxHp(mon: OwnedMon): number {
  const creature = ownedMonToCreature(mon);
  return creature ? creatureMaxHp(creature) : 0;
}

/** Damage carried, never negative; rows from before persistent HP carry none. */
export function hpLost(mon: OwnedMon): number {
  const n = mon.hpLost ?? 0;
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function currentHp(mon: OwnedMon): number {
  return Math.max(0, ownedMaxHp(mon) - hpLost(mon));
}

export function isFainted(mon: OwnedMon): boolean {
  return currentHp(mon) === 0;
}

export function isHurt(mon: OwnedMon): boolean {
  return hpLost(mon) > 0;
}

/** After a battle: does any party member still stand? Fielded members use their final HP. */
export function partyStanding(party: readonly OwnedMon[], fielded: readonly FieldedMember[]): boolean {
  const after = new Map(fielded.map((f) => [f.id, f.hp]));
  return party.some((m) => (after.get(m.id) ?? currentHp(m)) > 0);
}
```

`src/game/route-rules.ts`: import `{ currentHp, isFainted, ownedMaxHp } from './health.js'` and replace `simulateRouteBattle`:

```ts
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

Check for an import cycle. `battle.ts` must not import `health.ts`. Run `npx tsc -b`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx scripts/route-rules.test.ts && npx tsx scripts/route-db.test.ts && npx tsc -b`
Expected: all pass. `route-db` still pins `expGained === 7`, which proves full-health route battles are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/game/health.ts src/game/box.ts src/game/route-actions.ts src/game/route-rules.ts scripts/route-rules.test.ts
git commit -m "Add persistent-HP rules and field only standing Pokémon in route battles"
```

---

### Task 3: Store HP, guard searches, survivors-only EXP, whiteout

**Files:**
- Modify: `api/_db.ts` (`COLUMN_ADDS` ~line 48, `rowToOwned` ~line 256, `RouteAccountRow`/`readRouteAccount` ~line 712, new helpers next to `writeRouteAllowance`), `db/schema.sql` (comments near `owned_pokemon` and `route_accounts`), `api/_route-actions.ts` (`loadRouteStateInTx`, `searchRoute`, `chooseRoute`), `RELEASING.md` (historical schema checklist item 2)
- Test: `scripts/route-db.test.ts`

**Interfaces:**
- Consumes: `isFainted`, `currentHp`, `partyStanding` (Task 2), `RouteBattle.fielded`.
- Produces (in `api/_db.ts`):
  - `writeOwnedHp(db: Executor, uid: string, rows: readonly { id: string; hpLost: number }[]): Promise<void>`
  - `healAllOwned(db: Executor, uid: string): Promise<number>` (rows healed)
  - `writeTrainerAt(db: Executor, uid: string, at: 'home' | 'r1'): Promise<void>`
  - `RouteAccountRow.trainerAt: 'home' | 'r1' | null`
  - `rowToOwned` sets `hpLost` only when `hp_lost > 0`.

- [ ] **Step 1: Write the failing tests**

In `scripts/route-db.test.ts`:
- add `writeOwnedHp`, `updateProfileParty` to the `../api/_db.js` import;
- add `simulateRouteBattle` to the route-rules import;
- add `RouteBattle` to the route-actions type import;
- add `mintMon`, `legacyDb`, `legacyOnboard` to the world-test-kit import;
- add `import { isFainted, ownedMaxHp } from '../src/game/health.js';`.

Add this helper below `forceCatch`:

```ts
/** Pick the event's seed so its battle plays out as wanted; the foe and party stay frozen. */
async function forceBattle(db: Db, uid: string, e: RouteEvent, want: (b: RouteBattle) => boolean) {
  const row = (await readRouteEvent(db, uid, e.id))!;
  const data = row.data as StoredRouteEvent;
  for (let i = 0; i < 2000; i++) {
    const seed = `battle-${i}`;
    if (!want(simulateRouteBattle({ party: data.event.party, foe: data.foe!, seed }))) continue;
    data.seed = seed;
    await updateRouteEvent(db, uid, { ...row, data }, row.revision);
    return;
  }
  throw new Error('No seed produced the wanted battle');
}
```

Insert a new section just before `// Schema invariant itself`:

```ts
  console.log('[persistent HP and whiteout]');
  const hpStarter = await onboardUser(db, 'hp');
  await activateRoute(db, 'hp', 'activate', T);
  const hurtFight = (await start(db, 'hp')).event!;
  await forceBattle(db, 'hp', hurtFight, (b) => b.won && b.fielded![0].hp > 0 && b.fielded![0].hp < b.fielded![0].maxHp);
  const hurtWin = await chooseRoute(db, 'hp', { requestId: rid(), eventId: hurtFight.id, expectedRevision: 0, choice: 'battle' }, T);
  const ended = hurtWin.event!.battle!.fielded![0];
  const afterWin = (await readOwnedByUser(db, 'hp')).find((m) => m.id === hpStarter.id)!;
  check('a won battle saves the damage the starter ended with, through growth', ended.id === hpStarter.id && afterWin.hpLost === ended.maxHp - ended.hp && afterWin.exp > 0);
  await leave(db, 'hp', hurtWin.event!);
  const carried = (await start(db, 'hp')).event!;
  check('the next search freezes the carried damage', carried.party[0].hpLost === afterWin.hpLost);
  await leave(db, 'hp', carried);

  const second = await mintMon(db, 'hp', { dexId: 10, level: 5 });
  await updateProfileParty(db, 'hp', [hpStarter.id, second.id]);
  const starterNow = (await readOwnedByUser(db, 'hp')).find((m) => m.id === hpStarter.id)!;
  await writeOwnedHp(db, 'hp', [{ id: hpStarter.id, hpLost: ownedMaxHp(starterNow) }]);
  const benchFight = (await start(db, 'hp')).event!;
  await forceBattle(db, 'hp', benchFight, (b) => b.won);
  const benchWin = await chooseRoute(db, 'hp', { requestId: rid(), eventId: benchFight.id, expectedRevision: 0, choice: 'battle' }, T);
  check('a fainted lead sits out while the Box recruit fights', JSON.stringify(benchWin.event!.battle!.fielded!.map((f) => f.id)) === JSON.stringify([second.id]));
  check('a fainted member earns no EXP', benchWin.event!.members.every((m) => m.id !== hpStarter.id) && benchWin.box!.find((m) => m.id === hpStarter.id)!.exp === starterNow.exp);
  await leave(db, 'hp', benchWin.event!);

  await writeOwnedHp(db, 'hp', [{ id: hpStarter.id, hpLost: 1 }, { id: second.id, hpLost: ownedMaxHp(second) - 1 }]);
  const tradeFight = (await start(db, 'hp')).event!;
  await forceBattle(db, 'hp', tradeFight, (b) => b.won && b.fielded!.some((f) => f.hp === 0) && b.fielded!.some((f) => f.hp > 0));
  const tradeWin = await chooseRoute(db, 'hp', { requestId: rid(), eventId: tradeFight.id, expectedRevision: 0, choice: 'battle' }, T);
  const standing = tradeWin.event!.battle!.fielded!.filter((f) => f.hp > 0).map((f) => f.id);
  check('only members standing at the end earn EXP', JSON.stringify(tradeWin.event!.members.map((m) => m.id)) === JSON.stringify(standing));
  await leave(db, 'hp', tradeWin.event!);

  const beforeDown = (await loadRouteState(db, 'hp', T)).allowance.available;
  const allMine = await readOwnedByUser(db, 'hp');
  await writeOwnedHp(db, 'hp', allMine.map((m) => ({ id: m.id, hpLost: ownedMaxHp(m) })));
  await rejects('an all-fainted party cannot search', start(db, 'hp'), 400);
  const down = await loadRouteState(db, 'hp', T);
  check('a refused search spends nothing and opens nothing', down.allowance.available === beforeDown && down.activeEvent === null);

  const wo = await onboardUser(db, 'whiteout');
  await activateRoute(db, 'whiteout', 'activate', T);
  await writeOwnedHp(db, 'whiteout', [{ id: wo.id, hpLost: ownedMaxHp(wo) - 1 }]);
  const lostFight = (await start(db, 'whiteout')).event!;
  await forceBattle(db, 'whiteout', lostFight, (b) => !b.won);
  const lost = await chooseRoute(db, 'whiteout', { requestId: rid(), eventId: lostFight.id, expectedRevision: 0, choice: 'battle' }, T);
  const woAfter = (await readOwnedByUser(db, 'whiteout')).find((m) => m.id === wo.id)!;
  check('a loss whites out: party fainted, trainer home, no EXP', lost.event?.outcome === 'lost' && isFainted(woAfter) && lost.state.trainerAt === 'home' && woAfter.exp === wo.exp);

  const old = await legacyDb('hp-legacy');
  try {
    await legacyOnboard(old.db, 'old');
    const [oldMon] = await readOwnedByUser(old.db, 'old');
    check('rows read before db:setup are at full health', oldMon.hpLost === undefined && !isFainted(oldMon));
  } finally { old.cleanup(); }
```

The "double KO on a win" case is pinned by the `partyStanding` checks in Task 2. The server uses that helper for the whiteout below.

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/route-db.test.ts`
Expected: FAIL. `writeOwnedHp` is not exported from `../api/_db.js` (import error).

- [ ] **Step 3: Implement the data layer**

`api/_db.ts`, append to `COLUMN_ADDS`:

```ts
  // Battle damage an owned Pokémon carries between battles; 0 is full health.
  'alter table owned_pokemon add column hp_lost integer not null default 0',
  // Where the trainer stands after a whiteout or a Center visit; null derives it.
  'alter table route_accounts add column trainer_at text',
```

`rowToOwned`, after the `nickname` line:

```ts
    ...(Number(r.hp_lost) > 0 ? { hpLost: Math.floor(Number(r.hp_lost)) } : {}),
```

`RouteAccountRow` gains `trainerAt: 'home' | 'r1' | null;`, and `readRouteAccount` maps it:

```ts
    trainerAt: r.trainer_at === 'home' || r.trainer_at === 'r1' ? r.trainer_at : null,
```

New helpers after `writeRouteAllowance`:

```ts
/** Persistent HP after a battle: one update per fielded member, scoped to the user. */
export async function writeOwnedHp(db: Executor, uid: string, rows: readonly { id: string; hpLost: number }[]): Promise<void> {
  for (const row of rows) {
    await db.execute({ sql: 'update owned_pokemon set hp_lost = ? where id = ? and user_id = ?', args: [Math.max(0, Math.floor(row.hpLost)), row.id, uid] });
  }
}

/** The Pokémon Center: every owned Pokémon back to full health. Returns how many were hurt. */
export async function healAllOwned(db: Executor, uid: string): Promise<number> {
  const rs = await db.execute({ sql: 'update owned_pokemon set hp_lost = 0 where user_id = ? and hp_lost > 0', args: [uid] });
  return rs.rowsAffected;
}

export async function writeTrainerAt(db: Executor, uid: string, at: 'home' | 'r1'): Promise<void> {
  await db.execute({ sql: 'update route_accounts set trainer_at = ? where user_id = ?', args: [at, uid] });
}
```

`db/schema.sql`: under the existing `stats` comment for `owned_pokemon` (~line 85), add:

```sql
-- `hp_lost` (COLUMN_ADDS) is the battle damage a Pokémon carries between
-- battles in engine HP units; 0 is full health. The Pokémon Center resets it.
```

Above `create table if not exists route_accounts`, add:

```sql
-- `trainer_at` (COLUMN_ADDS) is 'home' after a whiteout or a Center visit and
-- 'r1' after a search; null derives the position from route history.
```

`RELEASING.md`, historical schema checklist item 2: after "the `party` column on `profiles`;", insert "the `hp_lost` column on `owned_pokemon` (battle damage carried between battles; existing rows read as full health); the `trainer_at` column on `route_accounts`;". Item 3 gets one sentence at its end: "Run it before the deploy that ships the Pokémon Center: until it runs, Sunny Meadow searches and battles answer 503 while the hub, box and Pokédex keep working."

- [ ] **Step 4: Implement the route rules**

`api/_route-actions.ts`: add `healAllOwned`, `writeOwnedHp`, `writeTrainerAt` to the `./_db.js` import (`healAllOwned` is used in Task 4; add it then if lint flags it unused), and `import { isFainted, partyStanding } from '../src/game/health.js';`.

In `loadRouteStateInTx`, replace the `trainerAt:` expression:

```ts
    trainerAt: account?.trainerAt ?? (routeVisited || lastRoute === 'r1' ? 'r1' : 'home'), ownedCount,
```

In `searchRoute`, directly after the `sameParty` check and before `spendAllowance`:

```ts
    if (partyMembers(partyIds, owned).every(isFainted)) fail(400, 'Your party needs care. Visit the Pokémon Center in Hearth Town.');
```

and directly after `await writeRouteAllowance(tx, uid, spent.available, spent.refilledAt);`:

```ts
    await writeTrainerAt(tx, uid, 'r1');
```

In `chooseRoute`, replace the `if (input.choice === 'battle') { ... }` body with:

```ts
    if (input.choice === 'battle') {
      if (!data.foe) throw new Error('Battle without a foe');
      e.battle = simulateRouteBattle({ party: e.party, foe: data.foe, seed: data.seed });
      const fielded = e.battle.fielded ?? [];
      const current = await readOwnedByIds(tx, uid, e.party.map((m) => m.id));
      const owned = new Set(current.map((m) => m.id));
      // Damage is written before growth; growth keeps it, so current HP rises with max HP.
      await writeOwnedHp(tx, uid, fielded.filter((f) => owned.has(f.id)).map((f) => ({ id: f.id, hpLost: f.maxHp - f.hp })));
      if (e.battle.won) {
        const standing = new Set(fielded.filter((f) => f.hp > 0).map((f) => f.id));
        const growth = planGrowth(current, e.party.filter((m) => standing.has(m.id)), e.kind === 'wild' ? data.config.wildExp : data.config.trainerExp, data.config.recommended, e.id);
        for (const mon of growth.changed) await updateOwnedGrowth(tx, uid, mon);
        e.members = growth.members;
        e.phase = e.kind === 'wild' ? 'catch' : 'resolved';
        e.outcome = 'won';
        if (e.kind === 'wild') e.catchChances = {
          poke: captureChance({ rare: data.foe.view.rare, wonBattle: true, ballId: 'poke', rules: data.config }),
          great: captureChance({ rare: data.foe.view.rare, wonBattle: true, ballId: 'great', rules: data.config }),
        };
      } else { e.phase = 'resolved'; e.outcome = 'lost'; }
      // Whiteout: nobody left standing sends the trainer back to Hearth Town.
      if (!partyStanding(e.party, fielded)) await writeTrainerAt(tx, uid, 'home');
    } else if (input.choice === 'catch') {
```

Keep the rest of `chooseRoute` unchanged.

- [ ] **Step 5: Run to verify it passes**

Run: `npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/world-db.test.ts && npx tsc -p tsconfig.api.json && npx tsc -b`
Expected: all pass. If a `forceBattle` predicate finds no seed in 2000 tries, adjust the setup damage (for example `hpLost` closer to max), not the assertion.

- [ ] **Step 6: Commit**

```bash
git add api/_db.ts api/_route-actions.ts db/schema.sql RELEASING.md scripts/route-db.test.ts
git commit -m "Persist HP after route battles, bench fainted Pokémon, and white out on a wipe"
```

---

### Task 4: The heal command, its API action, and client helper

**Files:**
- Modify: `api/_route-actions.ts` (new `healParty`), `api/world/[action].ts` (`handler` list, `mutate`), `src/game/route-actions-client.ts` (`RouteCommand`, `readPendingRouteCommand`, new export)
- Test: `scripts/route-db.test.ts`, `scripts/route-api.test.ts`, `scripts/route-client.test.ts`

**Interfaces:**
- Consumes: `healAllOwned`, `writeTrainerAt`, `writeOwnedHp` (Task 3); `writeCommand` (existing, module-private).
- Produces:
  - `api/_route-actions.ts`: `healParty(db: Db, uid: string, requestId: string, now: number): Promise<RouteReply>`
  - `POST /api/world/heal` with body `{ requestId }` → `{ ok: true, state, box }`
  - Client: `RouteCommand` adds `{ operation: 'heal'; input: { requestId: string } }`; `export const healAtCenter = (input: { requestId: string }): Promise<RouteClientReply>`

- [ ] **Step 1: Write the failing tests**

`scripts/route-db.test.ts`: add `healParty` to the `../api/_route-actions.js` import. Append to the `[persistent HP and whiteout]` section (after the whiteout check, before the legacy-db block):

```ts
  console.log('[Pokémon Center]');
  const boxPatient = await mintMon(db, 'whiteout', { dexId: 10, level: 5 });
  await writeOwnedHp(db, 'whiteout', [{ id: boxPatient.id, hpLost: 3 }]);
  const strangerMon = (await readOwnedByUser(db, 'u2'))[0];
  await writeOwnedHp(db, 'u2', [{ id: strangerMon.id, hpLost: 3 }]);
  const awayFight = await searchRoute(db, 'whiteout', { requestId: 'whiteout-away', locationId: 'r1', kind: 'wild', partyIds: [wo.id] }, T).catch((e) => e);
  check('a whited-out party cannot search before healing', awayFight instanceof RouteError && awayFight.status === 400);
  const healed = await healParty(db, 'whiteout', 'heal-1', T);
  check('the Center heals party and Box to full and the trainer stands in town', healed.box!.every((m) => !m.hpLost) && healed.state.trainerAt === 'home');
  check('another account’s Pokémon stay hurt', (await readOwnedByUser(db, 'u2')).find((m) => m.id === strangerMon.id)!.hpLost === 3);
  const healedAgain = await healParty(db, 'whiteout', 'heal-1', T + 1);
  check('a retried heal returns its receipt', healedAgain.replayed === true);
  const backOut = await start(db, 'whiteout');
  check('a search after healing puts the trainer back in the meadow', backOut.state.trainerAt === 'r1');
  await rejects('healing waits for the open encounter', healParty(db, 'whiteout', 'heal-2', T), 409);
  // 'activate' is the committed activation receipt from Task 3's setup; a refused search leaves none.
  await rejects('a request ID from another command cannot heal', healParty(db, 'whiteout', 'activate', T), 409);
  await leave(db, 'whiteout', backOut.event!);
```

`scripts/route-api.test.ts`:
- add `'heal'` to the login/POST loop array: `['state', 'activate', 'search', 'choose', 'quest-claim', 'result-dismiss', 'heal']`;
- before the `// Actual missing-new-schema case` comment, add:

```ts
  check('heal requires a request ID', (await call('heal', {})).status === 400);
  const heal = await call('heal', { requestId: 'heal' });
  check('heal returns state and Box rows', heal.status === 200 && heal.body.ok === true && Array.isArray(heal.body.box) && (heal.body.state as RouteState).trainerAt === 'home' && heal.headers['cache-control'] === 'no-store');
```

`scripts/route-client.test.ts`: import `healAtCenter` and `readPendingRouteCommand`/`savePendingRouteCommand` if they are not already imported. Next to the existing search-command check (~line 48), add:

```ts
await healAtCenter({ requestId: 'heal-1' });
check('heal posts its request ID to the heal action', lastUrl === '/api/world/heal' && lastInit?.method === 'POST' && lastInit.body === JSON.stringify({ requestId: 'heal-1' }));
```

If the file already exercises `savePendingRouteCommand`/`readPendingRouteCommand` with a `sessionStorage` stub, add next to it:

```ts
savePendingRouteCommand('acct', { operation: 'heal', input: { requestId: 'heal-pending' } });
check('a pending heal survives a reload', readPendingRouteCommand('acct')?.operation === 'heal');
```

If it has no `sessionStorage` stub, add one first, the same shape as its `fetch` stub: `globalThis.sessionStorage` as a `Map`-backed `{ getItem, setItem, removeItem }`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx tsx scripts/route-db.test.ts; npx tsx scripts/route-api.test.ts; npx tsx scripts/route-client.test.ts`
Expected:
- route-db: fails importing `healParty`.
- route-api: `heal requires login` passes, but `heal requires POST` and the new checks fail (the action 404s).
- route-client: fails importing `healAtCenter`.

- [ ] **Step 3: Implement**

`api/_route-actions.ts`, after `claimRouteQuest`:

```ts
/** The Pokémon Center: instant, free, every owned Pokémon; never during an open encounter. */
export async function healParty(db: Db, uid: string, requestId: string, now: number): Promise<RouteReply> {
  return writeCommand(db, uid, requestId, JSON.stringify(['heal']), now, async (tx) => {
    if (await readActiveRouteEvent(tx, uid)) fail(409, 'Finish or leave your Sunny Meadow encounter first, then come back to heal.');
    await healAllOwned(tx, uid);
    await writeTrainerAt(tx, uid, 'home');
  });
}
```

`api/world/[action].ts`:
- import `healParty`;
- `handler`: `if (['activate', 'search', 'choose', 'quest-claim', 'result-dismiss', 'heal'].includes(action)) return mutate(req, res, action);`
- in `mutate`, add before the final `else`:

```ts
    } else if (action === 'heal') {
      if (!validRouteRequestId(body.requestId)) return res.status(400).json({ ok: false, error: 'A request ID is required.' });
      out = await healParty(g.db, g.uid, body.requestId, now);
```

`src/game/route-actions-client.ts`:
- `RouteCommand` gets `| { operation: 'heal'; input: { requestId: string } }`;
- `readPendingRouteCommand`'s allow-list: `['activate', 'search', 'choose', 'quest-claim', 'heal']`;
- export: `export const healAtCenter = (input: { requestId: string }): Promise<RouteClientReply> => request('heal', input);`

- [ ] **Step 4: Run to verify they pass**

Run: `npx tsx scripts/route-db.test.ts && npx tsx scripts/route-api.test.ts && npx tsx scripts/route-client.test.ts && npx tsc -p tsconfig.api.json && npx tsc -b`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add api/_route-actions.ts "api/world/[action].ts" src/game/route-actions-client.ts scripts/route-db.test.ts scripts/route-api.test.ts scripts/route-client.test.ts
git commit -m "Add the Pokémon Center heal command"
```

---

### Task 5: Center screen, HP on party screens, whiteout copy

**Files:**
- Create: `src/components/ui/HpBar.tsx`, `src/components/world/Panel.tsx`, `src/components/world/CenterView.tsx`
- Modify: `src/game/town.ts` (`TownLink`, Center link), `scripts/town.test.ts` (`SCREENS`), `src/components/world/TownView.tsx`, `src/components/world/RouteScreen.tsx`, `src/components/world/RouteResultView.tsx`, `src/components/PartyScreen.tsx`, `src/components/BoxScreen.tsx`, `src/guide/pages/overview.mdx`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `currentHp`, `isFainted`, `isHurt`, `ownedMaxHp` (Task 2); `RouteCommand` heal (Task 4); `RouteBattle.fielded`; `RouteState.trainerAt`.
- Produces: `TownLink` includes `'center'`; `TownView` prop `onCenter: () => void`; `HpBar({ mon, showNumbers? })`; `Panel({ title, children, aside? })` moved to its own file; `CenterView` props below.

- [ ] **Step 1: Town data (test first)**

`scripts/town.test.ts`: `const SCREENS = new Set<string>(['party', 'dex', 'box', 'center']);` and add:

```ts
check('the Pokémon Center opens the Center', townDestinationById('pokemon-center')?.link === 'center');
```

(Import `townDestinationById` if needed.) Run `npx tsx scripts/town.test.ts`. It FAILS on the new check.

`src/game/town.ts`: `export type TownLink = 'party' | 'dex' | 'box' | 'center' | 'r1';`. Update its doc comment to "a screen (party, dex, box), the Center, or a place". Set the `pokemon-center` entry to `link: 'center'` and its `role` to `'Rest your Pokémon here: the nurse restores every one of them to full health, free of charge.'`. Run the test again: PASS.

- [ ] **Step 2: HpBar and Panel**

`src/components/ui/HpBar.tsx`:

```tsx
import type { OwnedMon } from '../../game/box';
import { currentHp, isFainted, ownedMaxHp } from '../../game/health';
import { StatBar } from './StatBar';

/** Current HP between battles; FNT once a Pokémon has fainted. */
export function HpBar({ mon, showNumbers = false }: { mon: OwnedMon; showNumbers?: boolean }) {
  const max = ownedMaxHp(mon);
  const hp = currentHp(mon);
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <span className="font-label text-[8px] uppercase text-info">HP</span>
      {isFainted(mon) ? (
        <span className="font-label text-[9px] uppercase text-accent">FNT</span>
      ) : (
        <StatBar value={hp} max={max} tone="night" label={`HP ${hp} of ${max}`} segments={8} />
      )}
      {showNumbers && <span className="shrink-0 font-label text-[9px] text-ink-dim">{hp}/{max}</span>}
    </div>
  );
}
```

`src/components/world/Panel.tsx`: move the `Panel` function out of `RouteScreen.tsx` unchanged, exported:

```tsx
import type { ReactNode } from 'react';

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="ui-window m-2 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-label text-[11px] uppercase text-info">{title}</h2>{aside}</div>{children}</section>;
}
```

In `RouteScreen.tsx`, delete the local `Panel` and `import { Panel } from './Panel';`. Drop `ReactNode` from its React import if it is now unused.

- [ ] **Step 3: CenterView**

`src/components/world/CenterView.tsx`:

```tsx
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { isHurt } from '../../game/health';
import { partyMembers } from '../../game/party';
import type { RouteState } from '../../game/route-actions';
import { HpBar } from '../ui/HpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { Panel } from './Panel';
import { monName, POKEBALL } from './scene';

/** Hearth Town's Pokémon Center: see who is hurt, heal everyone for free. */
export function CenterView({ state, box, partyIds, busy, onHeal, onEditParty, onOpenBox }: {
  state: RouteState;
  box: OwnedMon[];
  partyIds: string[];
  busy: boolean;
  onHeal: () => void;
  onEditParty: () => void;
  onOpenBox: () => void;
}) {
  const party = partyMembers(partyIds, box);
  const hurtInBox = box.filter((m) => !partyIds.includes(m.id) && isHurt(m)).length;
  const anyHurt = box.some(isHurt);
  const reason = state.activeEvent ? 'Finish or leave your Sunny Meadow encounter first, then come back to heal.'
    : !anyHurt ? 'Your Pokémon are all in perfect health.' : null;
  return <>
    <Panel title="Pokémon Center">
      <p className="text-sm leading-relaxed">Welcome to the Pokémon Center! I can restore your Pokémon to full health. It’s always free.</p>
    </Panel>
    <Panel title="Your party" aside={<button type="button" onClick={onEditParty} className="ui-button ui-focus min-h-11 px-2 font-label text-[9px] uppercase">Edit party</button>}>
      {party.length === 0 ? <p className="text-sm">Your party is empty. Choose your Pokémon to bring them along.</p>
        : <ul className="flex flex-col gap-2">{party.map((mon) => <li key={mon.id} className="flex items-center gap-2 rounded-[3px] bg-slot p-2">
          <PixelSprite src={ownedMonToCreature(mon)?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt="" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm">{monName(mon)}</p><HpBar mon={mon} showNumbers /></div>
        </li>)}</ul>}
      {hurtInBox > 0 && <p className="mt-2 text-sm text-ink-dim">{hurtInBox} Pokémon in your Box also {hurtInBox === 1 ? 'needs' : 'need'} care. Healing covers them too.</p>}
    </Panel>
    <div className="m-2 flex flex-col gap-2">
      <button type="button" disabled={busy || reason !== null} onClick={onHeal} className="ui-button-primary ui-focus min-h-12 w-full px-3 font-label text-[11px] uppercase">{busy ? 'Healing…' : 'Heal my Pokémon · free'}</button>
      {reason && <p className="text-sm text-ink-dim">{reason}</p>}
      <button type="button" onClick={onOpenBox} className="ui-button ui-focus min-h-11 w-full px-3 font-label text-[10px] uppercase">Open your Box</button>
    </div>
  </>;
}
```

Check that `partyMembers` is exported from `src/game/party.ts` and that `monName`/`POKEBALL` come from `./scene`. RouteScreen imports both, so mirror its import lines.

- [ ] **Step 4: TownView**

In `src/components/world/TownView.tsx`:
- `export type TownService = Exclude<TownLink, PlayableId | 'center'>;`
- `ACTION_LABEL` adds `center: 'Visit the nurse',`
- props add `/** The Pokémon Center: its own view inside the town. */ onCenter: () => void;`
- `act`: `if (to === 'center') onCenter(); else if (to === 'party' || to === 'dex' || to === 'box') onOpen(to); else onWalk(to);`
- update the header comment: "The library and daycare open the Pokédex and box, the Center heals, and the north road leads to Sunny Meadow."

- [ ] **Step 5: RouteScreen wiring**

In `src/components/world/RouteScreen.tsx`:
- imports: `CenterView`, `HpBar`, `isFainted` from `../../game/health`.
- `type Page = 'map' | 'list' | 'home' | 'center' | 'r1' | 'encounter';`
- Add `const openCenter = () => { scrollToTop(); setSelected('home'); setSpot('pokemon-center'); setPage('center'); };`
- In `submit`'s success `else` branch:

```ts
    } else if (command.operation === 'heal') {
      setPage('center');
      setNotice('Your Pokémon are fully healed. We hope to see you again!');
    } else {
      setPage('r1');
      if (command.operation === 'quest-claim') setNotice(`Meadow survey complete. ${ROUTE_RULES.questGreatBalls} Great Balls are saved in your Bag.`);
    }
```

- `dismiss` takes where to go: `const dismiss = async (eventId: string, then: 'r1' | 'center' = 'r1') => { ... adopt(reply.state, reply.box); if (then === 'center') openCenter(); else setPage('r1'); };`
- Header back button: insert `else if (page === 'center') setPage('home');` before the final `else setPage(from)`. The label for center is `'Town'`: extend the ternary so `page === 'center' ? 'Town'`. The title: `page === 'home' || page === 'center' ? (page === 'center' ? 'Pokémon Center' : home.name) : ...`.
- Town page: `<TownView spot={spot} onSpot={setSpot} onOpen={(screen) => onVisit(screen, spot)} onWalk={walkTo} onCenter={openCenter} />`
- Center page, after the town page line:

```tsx
      {page === 'center' && <CenterView state={state} box={box} partyIds={partyIds} busy={locked}
        onHeal={() => void submit({ operation: 'heal', input: { requestId: newRouteRequestId() } })}
        onEditParty={() => onVisit('party', 'pokemon-center')} onOpenBox={() => onVisit('box', 'pokemon-center')} />}
```

- Route page:
  - `const partyDown = party.length > 0 && party.every(isFainted);` next to `const party = ...`.
  - Party strip: under `<ExpBar .../>` add `<HpBar mon={mon} />`.
  - Before the "What will you find?" panel:

```tsx
        {partyDown && <Panel title="Your party needs care"><p className="text-sm">Every Pokémon in your party has fainted. Visit the Pokémon Center in Hearth Town, or bring healthy Pokémon from your Box.</p><button type="button" onClick={openCenter} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Go to the Pokémon Center</button></Panel>}
```

  - Add `|| partyDown` to the search buttons' `disabled`.
- Encounter party line: `Your party for this encounter: {event.party.map((m) => isFainted(m) ? `${monName(m)} (fainted, sits out)` : monName(m)).join(', ')}.`
- Battle replay: pass the fielded members so send-out indexes line up:

```tsx
party={replay.battle.fielded ? replay.party.filter((m) => replay.battle!.fielded!.some((f) => f.id === m.id)) : replay.party}
```

- Result: `onDone={() => void dismiss(event.id, event.outcome === 'lost' ? 'center' : 'r1')}`.

- [ ] **Step 6: Result copy**

`src/components/world/RouteResultView.tsx`:
- `OUTCOME_LABEL.lost`: `'Your party is out of strength'`.
- Replace the `lost` paragraph: `{event.outcome === 'lost' && <p className="mt-2 text-sm text-ink-dim">Your party is out of strength. You hurried back to Hearth Town. No EXP earned; the Pokémon Center will heal everyone for free.</p>}`
- After that line, list members that fainted in a won battle:

```tsx
      {event.outcome !== 'lost' && (event.battle?.fielded ?? []).some((f) => f.hp === 0) && <p className="mt-2 text-sm text-ink-dim">{event.battle!.fielded!.filter((f) => f.hp === 0).map((f) => { const mon = box.find((m) => m.id === f.id); return mon ? monName(mon) : 'A Pokémon'; }).join(', ')} fainted and earned no EXP.</p>}
```

- Final button label: `{event.outcome === 'lost' ? 'Go to the Pokémon Center' : 'Continue to Sunny Meadow'}`.

- [ ] **Step 7: HP on the party and Box screens**

- `src/components/PartyScreen.tsx`: import `HpBar`. In the party list, under `<ExpBar level={mon.level} exp={mon.exp} />` (~line 153), add `<HpBar mon={mon} />` inside the same flex column (change the wrapping `<span className="mt-0.5 flex">` to `<span className="mt-0.5 flex flex-col gap-0.5">`). In the roster grid's non-party branch (~line 217), wrap as `<><ExpBar .../><HpBar mon={mon} /></>`.
- `src/components/BoxScreen.tsx`: import `HpBar`. Tile (~line 124): add `<HpBar mon={m} />` under the `ExpBar`. Detail (~line 139): add `<div className="mt-1"><HpBar mon={open} showNumbers /></div>` under the EXP bar.

- [ ] **Step 8: Guide and changelog**

`src/guide/pages/overview.mdx`, after the paragraph that ends "A failed throw or a lost battle ends that encounter.", add:

```mdx
## Health and the Pokémon Center

Pokémon keep the HP they finish a battle with. A Pokémon at 0 HP has fainted: it
stays in your party but sits out battles and earns no EXP. Only party members
still standing when a battle is won earn its EXP. If your whole party faints, you
hurry back to Hearth Town, and you can't search Sunny Meadow until someone can
fight again. Visit the Pokémon Center in Hearth Town to heal every Pokémon you
own, party and Box, instantly and for free. HP does not recover anywhere else.
```

`CHANGELOG.md` under `## [Unreleased]` → `### Added`, first line:

```md
- **Pokémon Center** — HP now carries over between Sunny Meadow battles. Fainted Pokémon sit out, only Pokémon still standing earn EXP, and losing with your whole party sends you back to Hearth Town. The nurse in the Pokémon Center heals every Pokémon you own, instantly and for free. HP bars appear on the route, party, Box and Center screens.
```

In the existing Hearth Town line, replace "The Pokémon Center, library and daycare open your party, Pokédex and box;" with "The library and daycare open your Pokédex and box, and the Pokémon Center heals your Pokémon;".

- [ ] **Step 9: Full gate and browser check**

Run: `npm run lint && npm test && npm run build`
Expected: all green.

Browser check with a scratch database. **Never `local.db` or production.** `.env` holds the production URL, so the explicit env var below must be set on every command:

```bash
SCRATCH=/private/tmp/claude-501/center-check; mkdir -p $SCRATCH
TURSO_DATABASE_URL=file:$SCRATCH/center.db UPSTASH_REDIS_REST_URL=http://127.0.0.1:9 npx tsx scripts/db-setup.ts
TURSO_DATABASE_URL=file:$SCRATCH/center.db UPSTASH_REDIS_REST_URL=http://127.0.0.1:9 npx tsx scripts/create-test-account.ts   # read its usage line first
TURSO_DATABASE_URL=file:$SCRATCH/center.db UPSTASH_REDIS_REST_URL=http://127.0.0.1:9 npm run dev:local                        # Vite on :3000, API on :3001
```

Before the first command, read `scripts/db-setup.ts` and confirm it does not override an already-set `TURSO_DATABASE_URL`. If it does override, stop and ask the owner. At 320 px and 430 px, check each of these:
1. The town's Center card shows "Visit the nurse" and opens the Center.
2. Heal is disabled with "perfect health" when nothing is hurt.
3. Battle in Sunny Meadow until the starter takes damage. The HP bar drops on the route strip, the party screen and the Box.
4. Heal works, the notice shows, and the bars are full.
5. Force a loss by setting `hp_lost` to max−1 in the scratch DB with `sqlite3 $SCRATCH/center.db`. The result shows the whiteout copy and "Go to the Pokémon Center", the map marker shows the town, the search buttons are disabled, and "Your party needs care" links to the Center.
6. Keyboard focus is visible on every new button.

Record what was checked.

- [ ] **Step 10: Commit**

```bash
git add src/game/town.ts scripts/town.test.ts src/components/ui/HpBar.tsx src/components/world/Panel.tsx src/components/world/CenterView.tsx src/components/world/TownView.tsx src/components/world/RouteScreen.tsx src/components/world/RouteResultView.tsx src/components/PartyScreen.tsx src/components/BoxScreen.tsx src/guide/pages/overview.mdx CHANGELOG.md
git commit -m "Open the Pokémon Center in Hearth Town and show HP across the party screens"
```

---

### Task 6: Review the integrated diff

- [ ] **Step 1:** Run the `reviewer` subagent on `git diff 4f3d8efc..HEAD` (growth path, schema, and route writes are in scope). Fix every P0 and P1 finding. Rerun the focused tests for each fix and commit each fix separately.
- [ ] **Step 2:** Run `npm run lint && npm test && npm run build` once more on the final HEAD. Report the HEAD, the commands and results, the browser-check notes, and anything left open. A local commit is not a push and not a release.
