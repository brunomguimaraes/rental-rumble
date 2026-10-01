# Battle Replay v2 — the old Rental Rumble choreography on route battles

Date: 2026-10-01 · Status: approved design, awaiting spec review

## Result

Sunny Meadow battles (wild, guardian, trainer) play with the old Rental Rumble battle presentation: animated
PMD sprites, attack / hurt / faint animations, a Poké Ball toss on send-out, damage pop-ups, hit shake, and
status / sign pills. The server still decides every battle with `simulateBattle` and sends the event log; the
client only replays it. The screen stays Night-styled and keeps **Next** / **Skip**.

## Acceptance criteria

1. Every route battle the client receives (`RouteEvent.battle.events`) renders in `BattleReplay` with:
   - PMD animated sprites for both sides (player faces away, foe faces the camera), falling back to the 96px
     front/back `PixelSprite` for species without a PMD sheet;
   - `move` → actor plays `moveAnim ?? 'attack'`; `hit` → target plays `hurt`, shakes, and shows `-<damage>`
     (with a CRIT tag on crits); `faint` → target loops `faint`; `sendout` → ball toss, materialize, HP fill;
     one-shot animations settle back to `idle` when they end;
   - an info card per side with name, shiny mark, sign icon, type badges, main-status icon, volatile icons,
     HP bar, and HP number; the player card also shows faint pips for the party;
   - an effectiveness banner on `hit` (super / not very effective) and `noeffect`.
2. Event pacing uses the old per-event delay table (`sendout 450 … faint 1150 ms`), not a flat step.
3. **Skip** jumps to the final board (correct HP, statuses, faints, winner line) without playing animations.
   **Next** advances one event. The finish button behaves as today (`Continue` / `See what happened`).
4. Under `prefers-reduced-motion`: no autoplay (Next/Skip only, as today), PMD sprites hold frame 0, no ball
   toss, shake, or damage pop.
5. PMD sprites render at a whole-number multiple of their native frame size, `[image-rendering:pixelated]`.
6. The foe's sign shows on its card when the event carries it; events stored before this change (no `sign`)
   render without the foe's sign icon and nothing else changes.
7. No change to battle outcomes, catch, growth, EXP, allowance, inventory, or any API status code.

## Exclusions

Speed toggle, the Guide button, the old run / `Opponent` / trainer-header model, balance or stat tuning, and
deleting the now-unrendered `src/components/BattleScreen.tsx` (separate cleanup once callers are re-traced).

## Design

### 1. Board reducer — `src/game/battle-board.ts` (new, pure)

`boardAt({ events, upTo, player, foe })` folds events `0..upTo` into what the screen shows. `player` is the
party as `Creature[]` (via `ownedMonToCreature`), `foe` is the foe `Creature` (built from `WildView`). Returns,
per side:

| Field | Source |
|---|---|
| active creature view (dexId, name, types, sign, shiny, altColor) | `sendout.index` into the team; `transform` swaps dexId/name/types/sign in place |
| `hp`, `maxHp` | any event with `affected`, `hp`, `maxHp`; `faint` → 0 |
| `status` | `e.status !== undefined` on `affected` (`null` clears it); reset on `sendout` |
| `volatiles` | `volatile` + `volatileOn` add/remove; reset on `sendout` |
| `faints` | count of `faint` on that side |
| `visible` | true once that side's first `sendout` is reached |

Plus the board-level `line` (today's `lineFor` text) and `banner` (`effectivenessLabel(mult)` on `hit`,
"It had no effect…" on `noeffect`, cleared on `move`). The existing `lineFor` moves with it unchanged.

It is the component's real state source, not a test-only export. Skip is `setAt(last)`.

### 2. Choreography — `src/components/world/BattleReplay.tsx`

- `at` (event index) stays the only playback state. A `Combatant` component at module scope (stable identity,
  so the sprite never remounts mid-battle) takes the side's board view plus the *current* event.
- Animation for a side is derived from `events[at]` and keyed by `at` (`PmdSprite.playToken = at`). A small
  per-side `settledAt` state records `onAnimEnd`, so a finished one-shot falls back to `idle` (or stays on
  `faint`, which loops).
- Spawn FX (`BallFx` + `animate-materialize`) are keyed by the index of that side's latest `sendout`, so they
  replay only on a fresh send-out. The HP bar starts at 0 on the `sendout` beat and fills after 620 ms.
- Damage pop and shake are keyed by `at` on a `hit` event. When the board is reached through Skip (`at`
  jumped by more than one), no FX play.
- Autoplay timer: `DELAY[events[at + 1].kind]`, the old table copied as-is.
- `BallFx`, damage pop, shake, materialize reuse the existing keyframes in `src/index.css`.

### 3. Sprites — `src/components/PmdSprite.tsx`

Add an optional `wholeScale` prop. When set, the computed relative scale (`displayed / refHeight`) is rounded
to the nearest integer, minimum 1, and the soft `drop-shadow-lg` is dropped. Default off, so the old
`BattleScreen` is unchanged. Route battles pass `heightPx={84}` and `wholeScale`.

### 4. Info cards

Night surfaces only: `ui-window`-style card (`border-window-frame bg-window/90`), `font-pixel` name,
`TypeBadges`, `signIconUrl` (with `signLabel` alt), status icons from `public/sprites/status/` with the old
`STATUS_LABEL` / `VOLATILE_LABEL` alts, `StatBar` (night tone), `font-label` HP number, and party faint pips
(`bg-ink` / `bg-ink-dim`-style tokens, ≥ 3:1). No glass, blur, or `rounded-full`. The labels move to a small
shared module so both battle screens read the same text.

### 5. Contract: foe sign on `WildView`

`src/game/wilds.ts` `WildView` gains `sign?: Sign`. `mintFoe` in `src/game/route-rules.ts` (the active route's
only foe builder) fills it from `mint.sign`. The historical expedition/training builders (`rollPoolWild`,
`rollGuardian`) leave it unset. Optional and additive:
stored events without it still parse, and it is not a seed/save format break (no version bump). The server
already holds the value; nothing new is computed.

## Failure modes

| Case | Behavior |
|---|---|
| Species without a PMD sheet | 96px `PixelSprite` front/back, shake and pop still apply |
| PMD sheet fails to load | `PmdSprite` already falls back on missing anim; a 404 sheet shows blank — accepted, same as old screen |
| `sendout.index` out of range | keep the previous active view (no crash) |
| Event log without an `end` | finish button appears at the last event, as today |
| Old stored event without `sign` | foe card omits the sign icon |

## Tests

`scripts/battle-board.test.ts` (appended to `npm test`). Builds a pinned-seed route battle with
`simulateRouteBattle` and hand-built event lists, and asserts the reducer's observable board:

- status set by a `status` event and cleared by `status: null`; reset on `sendout`;
- volatile badge added and removed;
- `transform` swaps species/types/sign;
- faint counts and `hp: 0` on faint; player active index after a switch-in;
- the final board for the seeded battle matches the log's last HP per side and the winner line.

Each must fail if its reducer branch is removed. Then the full gate (`npm run lint && npm test && npm run build`)
and a browser check under `npm run dev:local` at 375px: a wild battle, a trainer battle, Skip, and reduced
motion.
