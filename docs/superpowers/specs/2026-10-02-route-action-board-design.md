# Route action board: Sunny Meadow MVP

Status: design approved by the owner in conversation on 2026-10-02 (gameplay first, then screen and server).
This written spec awaits the owner's review before the implementation plan. Production database operations and
the release remain separate approvals.

Sunny Meadow's page becomes an action board modelled on the owner's concept screen ("Mossy Woods", 2026-10-01):
one illustration, a grid of option cards, and one call to action that states its cost. Route 1 gets six cards
(Wild Pokémon, Trainer, Puzzle, Quest, Explore, Forage), built on the existing route-event engine under route
rules v4. No other route becomes playable.

## Decisions

| Topic | Decision |
| --- | --- |
| Layout | Illustration on top, a 3×2 card grid, a one-line description, one gold CTA reading "VERB (N ACTION)". Selecting a card is free. |
| Navigation | Route page only. Keep today's Back and Bag header. The concept's bottom tab bar (Map, Party, Bag, Profile) is a later slice. |
| Costs | Every card costs 1 action. Claiming a quest reward is free. Spread Honey also costs 1 Honey. |
| Puzzle | 3×3 sliding panels showing a piece of the meadow art, generated from the event seed and verified by replaying the player's moves on the server. |
| Quest | One step per action: the Meadow survey (meet, survey each landmark, claim) plus the secret Honey Tree, uncovered by Explore. |
| Forage | Today's meadow goods (Honey, Tiny Mushroom, Big Mushroom) move from Explore to Forage. No new items and no healing. |
| Explore | A gamble: nothing, a rare item, a rare Pokémon, or the secret quest. Its landmark roll is retired. |
| Money | From rules v4, wild wins pay ₽0 and trainer wins pay ₽200. |
| Art | Existing sprites and Night icons only. |
| Storage | No schema change and no `db:setup`. |

## Gameplay: route rules v4

### Cards

| Card | Cost | Result |
| --- | --- | --- |
| Wild Pokémon | 1 action | One common wild Pokémon: Sentret, Zigzagoon, Pidgey and Rattata (weight 3 each); Hoppip, Sunkern, Kricketot and Bidoof (2 each). Hidden level 2–5, stat multiplier 0.6. A win pays 30 EXP and ₽0. Catching works before or after a win, with today's odds. |
| Trainer | 1 action | One of four trainers, chosen evenly, each with one Pokémon at hidden level 5, multiplier 0.6: Meadow Scout (Pidgey), Youngster (Zigzagoon), Lass (Sunkern) and Bug Catcher (Kricketot). A win pays 50 EXP and ₽200. Trainer Pokémon can't be caught. |
| Puzzle | 1 action | A sliding-panel puzzle (see Puzzle). Solving it pays its reward; giving up pays nothing. |
| Quest | 1 action per step | The chosen quest's next step (see Quests). Claiming is free. |
| Explore | 1 action | Weights: nothing 35, rare item 35, rare Pokémon 20, secret quest 10. |
| Forage | 1 action | One meadow good. Weights: Honey 6, Tiny Mushroom 3, Big Mushroom 1. |

Every search still requires all of the following, and a search that fails any of them spends nothing:

- an activated route account;
- the trainer standing in Sunny Meadow;
- no open encounter;
- the saved party matching the request, with at least one Pokémon standing;
- an available action.

### Explore

- Weights: nothing 35, rare item 35, rare Pokémon 20, secret 10. Once the Honey Tree is found, the secret's weight
  joins rare Pokémon (30).
- Rare items (weights): 2 Great Balls 5, 1 Big Mushroom 3, a ₽500 coin pouch 2.
- Rare Pokémon (weights): Eevee 2, Pikachu 2, Ralts 1. Hidden level 2–5, multiplier 0.6, marked rare, so they use
  the rare catch odds (35% base, +20 after a win, +20 with a Great Ball, capped at 95%).
- Nothing: the action is spent and the result says so plainly.
- Unchanged safety net: when the Bag holds no capture balls and the trainer has under ₽200 (one Poké Ball's price),
  Explore grants 3 Poké Balls instead of rolling.
- Retired for new searches: the landmark side roll and the v3 item table (Poké Balls, Great Ball, harvest goods, ₽300
  pouch). Events saved under v3 keep theirs.

### Forage

Every forage finds exactly one good: Honey (weight 6), Tiny Mushroom (3) or Big Mushroom (1). The Village market
buys them at today's prices. Honey also baits the Honey Tree.

### Puzzle

- **Board:** 3×3, with panels 1–8 and one gap. Solved means 1–8 in reading order with the gap at bottom right.
- **Picture:** one of four scenes of the meadow art (tall grass, sunflowers, signpost, hilltop oak), rolled for each
  puzzle. Each panel shows its number in a corner.
- **Generation (pure, seeded):**
  - Start from the solved board and make 40 slides. Each slide picks uniformly among the panels next to the gap,
    except the panel moved by the slide before.
  - If the Manhattan distance from solved is then under 10, keep sliding (up to a fixed bound) until it reaches 10.
  - Every generated board is solvable, because it is reached by legal slides.
- **Reward:** rolled together with the puzzle and shown before the first move. Weights: 1 Great Ball 40,
  3 Poké Balls 30, 1 Tiny Mushroom 20, 1 Big Mushroom 10.
- **Play:** tap a panel next to the gap, or press Enter on it, to slide it. A counter shows the moves made. There is
  no timer and no move limit.
- **Finish:** when the board is solved locally, the client submits the full move list. The server replays it from the
  board it stored and pays only when every move is legal and the board ends solved.
- **Give up:** Leave ends the puzzle with no reward. The action stays spent.
- **Leaving the page:** the puzzle stays open as the active encounter (Resume encounter). It restarts from its stored
  scramble; partial progress is not saved.

### Quests

Selecting Quest lists every available quest with its next step, the survey first. The first quest that has a step is
preselected and the player can pick another; the CTA performs the chosen step.

**Meadow survey** keeps its current reward.

| Status | Next step | Cost | Effect |
| --- | --- | --- | --- |
| Not accepted | Meet the researcher | 1 action | Opens today's researcher dialogue: Accept, Maybe another time, or Finish conversation. |
| Active, a landmark missing | Survey a landmark | 1 action | Records the first missing landmark in list order: Old Signpost, Sunflower Patch, Hilltop Oak. |
| Ready | Claim reward | Free | Pays 3 Great Balls and ₽500 through the existing `quest-claim`. |
| Claimed | None | None | Listed as complete. |

Landmarks found before this change count, as they do today.

**The Honey Tree** is a new secret quest.

- It stays hidden until an Explore roll finds it ("Bees hum around an old tree by the path…"). Finding it records the
  quest.
- Its next step is always **Spread Honey**, for 1 action and 1 Honey. This draws one honey-tree Pokémon, which plays
  as a wild encounter: battle (30 EXP, ₽0) and catch.
  - Weights: Combee 5, Burmy 3, Heracross 1 (rare), Munchlax 1 (rare).
  - Hidden level 2–5 and multiplier 0.6, unless the balance gate needs a lower value for a species.
- The first Spread Honey completes the quest. The step stays available while the player has Honey.
- With no Honey, the step reads "Forage for Honey first" and the server refuses it.

When no quest has a step (the survey is claimed and the Honey Tree is still hidden), the Quest card says so and points
to Explore.

### Balance

All numbers are a first pass and live in `ROUTE_RULES`. The balance gate covers every new opponent. Over 200 fixed
seeds per fresh starter in `STARTER_POOL`:

- every starter must win at least 75% of battles against the weighted wild pool;
- every starter must win at least 60% of battles against each trainer, each Explore rare and each honey-tree species.

A species that fails is tuned through its level range or stat multiplier (a per-entry override is allowed), never by
changing growth.

Pre-plan measurement (2026-10-02, 200 seeds, the real battle engine):

- At ×0.6, Heracross fails: a lone Lotad wins 29% of fights and Caterpie 58%. Heracross therefore fights at ×0.45,
  where the weakest starter wins 72%.
- Lass first had Hoppip, against which Geodude won only 61%. She now has Sunkern, against which every starter wins
  at least 93%.
- Every other new opponent passes at ×0.6.

## Screen

### Route page

The `r1` page replaces the meadow hotspots with a board inside one Night window, top to bottom:

1. **Stamina chips:** Travel `4/12` and Actions `12/48`, plus `+1 in 6m` while Actions is below its cap. The large
   trainer bar is hidden on this page only.
2. **Illustration:** the existing Sunny Meadow art, cropped to about 4:3. It is decorative, and carries a
   "Resume encounter ›" overlay while an encounter is open.
3. **Card grid**, three columns by two rows: Wild Pokémon, Trainer, Puzzle, then Quest, Explore, Forage.
   - Each card is a `<button aria-pressed>` with art and a `font-label` caption. The selected card gets the gold frame
     and caption.
   - Art: the Sentret box icon, the Youngster sprite, a mini 3×3 meadow panel, the field-journal icon, the explore
     compass, and the Honey and Tiny Mushroom sprites.
   - Wild Pokémon is selected when the page opens. The Hub's quest highlights open the page with Quest selected.
   - Quest shows a `!` badge while a quest reward is ready to claim.
4. **Description:** one sentence about the selected card. For Quest it is the quest pick list with progress.
5. **CTA:** one full-width `ui-button-primary`.

| Card | CTA |
| --- | --- |
| Wild Pokémon | SEARCH THE GRASS (1 ACTION) |
| Trainer | FIND A TRAINER (1 ACTION) |
| Puzzle | SOLVE A PUZZLE (1 ACTION) |
| Quest | MEET THE RESEARCHER (1 ACTION), SURVEY A LANDMARK (1 ACTION), CLAIM REWARD (FREE) or SPREAD HONEY (1 ACTION · 1 HONEY) |
| Explore | EXPLORE (1 ACTION) |
| Forage | FORAGE (1 ACTION) |

When a search can't run, the CTA changes and the description gives the reason:

| State | CTA |
| --- | --- |
| Route not activated, or a previous journey pending | BEGIN EXPLORING (today's activation) |
| Encounter open | RESUME ENCOUNTER; the cards are disabled |
| No party | CHOOSE YOUR PARTY |
| Every party member fainted | TRAVEL TO HEARTH TOWN, opening the Center page and its trip |
| No actions | Disabled, "Next action in 6 min", with Check refill once it is due |
| Quest with no step | Disabled, "No quests right now. Explore to find secrets." |
| Spread Honey without Honey | Disabled, "Forage for Honey first" |
| Request in flight | Disabled, "Searching…" |

Below the board sit three things:

- a compact party strip (portraits, HP, Edit party);
- "View your last encounter" while a result is unseen;
- the previous-journey notice when present.

The trail-energy panel, field guide and survey panel are removed; the chips and the Quest card replace them.
`RouteScreen`'s loading, world-unavailable, retry-last-action and expired-session states are unchanged.

### Encounters and results

- **Reused:** `MeadowEncounter`, `BattleReplay`, `CatchSequence` and `RouteResultView` serve wild, trainer,
  Explore-rare and honey-tree Pokémon, and the researcher dialogue.
- **New Puzzle screen** (the `encounter` page):
  - It shows the board, the move counter, the reward chip and Give up.
  - Panels are buttons, and only panels next to the gap are enabled. Each has an accessible name with its cell, such
    as "Panel 6, row 2, column 3, slide left". The move counter is not a live region; a hidden status line announces
    "Solved! Checking your solution." once, and a result takes focus on its title.
  - Slides animate briefly; under `prefers-reduced-motion` they jump.
- **New result copy:**
  - forage: "You foraged 1 Honey";
  - Explore nothing: one short line;
  - a rare item;
  - a landmark surveyed: "2 of 3 landmarks recorded";
  - the Honey Tree found;
  - a puzzle solved, with its reward.
- **Hub:** the meadow highlights follow the new state: an open puzzle, a survey step or reward, and the Honey Tree
  once found.

### Layout and accessibility

- The board works from 320 px to 430 px wide with no horizontal scroll. On a 375×667 screen the CTA is visible without
  scrolling; the illustration may crop shorter on short screens to keep it there.
- As built (2026-10-02 browser check): the reason and the CTA form a bar that sticks to the bottom of the screen while
  the board is in view. The chips drop the "Route 01" label so they stay on one line from 375 px. With both, the CTA
  was fully visible in every measured state at 320×568, 375×667, 375×812 and 430×932.
- Touch targets are at least 44 px, with visible `ui-focus` rings.
- Night tokens only. Pixel sprites use `[image-rendering:pixelated]`; the meadow art stays smooth (the existing
  exception).
- No numeric levels anywhere.

## Contract and server

### Shared types (`src/game/route-actions.ts`)

- `SearchKind` is `'wild' | 'trainer' | 'puzzle' | 'quest' | 'explore' | 'forage'`. `RouteEvent.searchKind` also
  admits `'npc'` for events stored under v2 and v3.
- `QuestId` is `'meadow-survey' | 'honey-tree'`.
- The unions grow:

  | Type | Adds |
  | --- | --- |
  | `RouteFind.kind` | `'puzzle'`, `'landmark'`, `'secret'`, `'nothing'` |
  | `RoutePhase` | `'puzzle'` |
  | `RouteChoice` | `'solve'` |
  | `RouteOutcome` | `'solved'`, `'nothing'` |

- `PublicPuzzle` is `{ size: 3; board: number[]; scene: PuzzleScene; reward: ItemGrant[] }`. `RouteEvent` gains
  optional `puzzle` and `questId` fields, and `rulesVersion` admits `4`.
- `RouteSearchInput` gains `questId`, required exactly when `kind` is `'quest'`.
- `RouteChooseInput` gains `moves: number[]`, required exactly when `choice` is `'solve'`: 1–500 board indexes from
  0 to 8.
- `RouteQuestView` is `{ id; status; next: QuestStep | null; progress }`.
  - `QuestStep` is `{ step: 'meet' | 'survey' | 'claim' | 'spread-honey'; actions: number; items: ItemGrant[] }`.
  - `progress` is `{ done, total }` for the survey and `null` for the Honey Tree.
  - The Honey Tree's status reads `active` until its first completion, then `claimed`. It stays repeatable either way.
- `RouteState.quests` always lists the survey, and lists the Honey Tree once found. `RouteState.quest` stays as it is
  for tabs left open across the deploy.
- `RouteRules` becomes version 4. The v3 shape is kept as `RouteRulesV3` for stored events.

### Pure rules (`src/game/`)

- **`sliding-puzzle.ts`:** `generatePuzzle`, `applyMove`, `applyMoves` (null on any illegal move), `isSolved` and
  `manhattan`. The server uses them to generate and verify; the Puzzle screen uses them to play.
- **`route-quests.ts`:**
  - `nextQuestStep` and the quest views, built from accepted and claimed state, landmarks, and the Honey count.
  - `canAfford(step, inventory)`, shared so that the CTA and the server agree.
  - The client renders the server's quest views and never decides a step on its own.
- **`route-rules.ts`:**
  - `rollRouteFind` handles every v4 kind on new seeded streams.
  - `battlePrize` reads v4, so wild wins pay ₽0.
  - `wildAreas` lists the wild pool, the Explore rares and the honey-tree species with their rarity.
  - `legalChoices('puzzle')` is `['solve', 'leave']`.
  - v2 and v3 events never re-roll.

### Server (`api/world/[action].ts`, `api/_route-actions.ts`)

- `search` keeps one write transaction with its receipt. It validates, spends the card's action cost, rolls the find,
  and writes the event, discoveries, items, ₽ and quest rows together. Per kind:
  - **`quest`:** the server derives the step from stored quest rows, landmarks and inventory, never from the request.
    - Meet creates the researcher dialogue.
    - Survey inserts the next landmark discovery, or returns 409 when none is missing.
    - Spread Honey debits 1 Honey (409 "You have no Honey. Forage for some first." when there is none) and creates the
      honey-tree wild encounter. The first time, it also sets the quest's `claimed_at`.
    - Claim is not a search: it stays the free `quest-claim` command, unchanged.
    - A step that isn't available returns 409 with the current state.
  - **`explore`:** a secret roll inserts the `honey-tree` quest row, with `accepted_at` recording when it was found.
  - **`puzzle`:** the event's stored data keeps the generated board, scene and reward. The public event carries
    `puzzle` but never the seed.
  - **`forage`:** an item find that resolves immediately.
- `choose 'solve'` is valid only in the `puzzle` phase.
  - The server replays `moves` from the stored board.
  - When every move is legal and the board ends solved, it grants the reward items and resolves the event as `'solved'`.
  - Otherwise it returns 400 "That doesn't solve the puzzle yet." and changes nothing.
  - `leave` ends the puzzle with no reward.
- Per-card search writes move to a sibling module, `api/_route-finds.ts`. `_route-actions.ts` stays the command shell
  for receipts, validation and transactions.
- **Compatibility:**
  - v2 and v3 events resolve under their frozen rules, so a v3 wild win still pays ₽100.
  - A search with `kind: 'npc'` gets 400 "Sunny Meadow has new actions. Refresh to see them."
  - An unknown `questId` gets 400.
- **No schema change:** puzzle data lives in `route_events.data` and the Honey Tree uses `route_quests`. `api/_db.ts`
  gains `readRouteQuests`, which reads all of a trainer's rows in one query. Deploying needs no `db:setup`.

## Acceptance and evidence

| Area | Evidence |
| --- | --- |
| Puzzle engine | The same seed gives the same board. Every generated board is solvable (replaying the scramble in reverse solves it) and at least distance 10 from solved. Illegal, non-adjacent, out-of-range and over-long move lists are rejected. |
| Rules v4 | Pinned seeds reach every outcome of every card: nothing, each rare item, each rare Pokémon, the secret, and the empty-Bag guarantee. The secret's weight moves to rare Pokémon once the tree is found. Wild wins pay ₽0 and trainer wins ₽200. |
| Quests | Steps follow status and landmarks, and known landmarks are skipped. The claim stays free and pays once. The Honey Tree appears only after it is found, needs Honey, and stays repeatable. |
| Persistence and recovery | Each card spends exactly one action and saves one event. A retry with the same request ID replays its receipt, and a changed payload gets 409. Spread Honey debits once under retries and races. A puzzle pays once, wrong moves change nothing, and `leave` pays nothing. |
| Compatibility | A v3 wild, NPC or Explore event created before the change still resolves, with ₽100 for a wild win. `npc` searches are refused. `RouteState` readers in tabs open across the deploy still parse it. |
| Pokédex | The Area tab lists Pikachu, Ralts, Eevee and the honey-tree species under Sunny Meadow, with their rarity. |
| Balance | The gate passes for every starter: wild at least 75%; each trainer, Explore rare and honey-tree species at least 60%. |
| Screen | A browser check under `npm run dev:local` at 320, 375 and 430 px covers the six cards, the CTA labels and every disabled state, the quest pick list, a puzzle solved by touch and by keyboard, Give up and reduced motion, with no horizontal scroll. |
| Gate | `npm run lint && npm test && npm run build`. |

## Out of scope

- The bottom tab bar.
- New illustrations or card art.
- Berries, or any healing outside the Pokémon Center.
- More quests, repeatable request boards, other puzzle types and puzzle timers.
- Saving partial puzzle progress.
- Cards for other routes (forest forage, quarry mining, lake fishing).
- Changes to growth, catching odds or the action meter.
- Any schema change or production data operation.

## Docs

- `CHANGELOG.md` `[Unreleased]`: rewrite the Sunny Meadow encounters entry for the six cards, and correct the Village
  market line, since wild wins no longer pay ₽.
- Update `src/guide/pages/overview.mdx`, which still names Find NPC.
- Add a row to the v2 design doc's decisions log that links to this spec.

## Repository evidence

Reviewed on `development` at `2520e4e78` on 2026-10-02. The uncommitted `CatchSequence` edits in the checkout are
not part of this work. Files reviewed:

- `src/game/`: `route-actions.ts`, `route-rules.ts`, `items.ts`, `travel.ts`;
- `api/`: `_route-actions.ts`, `world/[action].ts`, `_db.ts`, and `db/schema.sql`;
- `src/components/world/`: `RouteScreen.tsx`, `SunnyMeadow.tsx`, `MeadowEncounter.tsx`, `RouteResultView.tsx`,
  `place-highlights.ts`;
- `scripts/`: `route-rules.test.ts`, `route-db.test.ts`, `route-balance.ts`;
- `public/sprites/ui/night/`.

For Route 1's searches, this spec supersedes the search table, the Explore rules and the NPC selection in
`2026-09-30-sunny-meadow-route-actions-design.md`, and the Explore item table and wild prize in
`2026-10-01-hearth-town-market-design.md`.
