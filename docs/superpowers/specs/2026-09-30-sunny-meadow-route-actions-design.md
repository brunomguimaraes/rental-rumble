# Sunny Meadow active route gameplay

Status: approved for implementation by the owner after adding the inventory/item requirement. The owner requested parallel implementation and local commits without co-author trailers. The defaults below are the initial implementation balance; production database operations and release remain separate approvals.

Replace idle training and guardian expeditions with short, player-started encounters in Sunny Meadow. Keep the Hearthvale map, its design and controls, the saved party, collection, and existing growth system. The first playable world contains Hearth Town and Route 1 only.

## Confirmed direction

- Remove idle gameplay: no sending a party away, elapsed-time battles, offline EXP, or return-to-claim loop.
- Preserve the map behavior and visual design.
- Feature Hearth Town (`home`) and Route 1 · Sunny Meadow (`r1`). Town services will be designed separately.
- Keep Sunny Meadow's current possible wild encounters and landmarks.
- Remove the guardian and guardian-based access requirements. Future progression gates are undecided.
- Sunny Meadow offers **Find wild Pokémon**, **Find NPC**, and **Explore**.
- Wild encounters support catching and battles against a single wild Pokémon. NPC encounters can offer trainer battles or quests. Explore can find wild Pokémon, NPCs, or items.
- Implement the inventory/item system in this same slice as a dependency of catching: persistent owned item quantities, acquisition, a Bag UI, and server-validated consumption.
- Route searches have an hourly action allowance. The balance should support satisfying visits without requiring constant check-ins.

## Proposed defaults to review

These defaults define the approved first implementation without designing the whole game. Balance numbers can be revisited using the evidence described below.

| Decision | Proposed first version |
| --- | --- |
| Action pacing | Recover 1 action every 10 minutes, up to 48; start new and returning accounts with 12 on their first activation. |
| Cost | Each of the three searches costs 1 action. All choices within that encounter are free. |
| Battles | Keep automatic, server-resolved battles and a skippable replay. The player chooses whether to fight, not moves each turn. |
| Catching | Every wild encounter permits one throw, either immediately or after winning its battle. A failed throw ends the encounter. |
| Inventory and supplies | Both Poké Balls and Great Balls are owned consumables. Proposed starter supply: 20 Poké Balls once per account; replenish through Explore and quest rewards. No shop or currency yet. |
| NPCs | Two authored trainer encounters and one researcher with one playable, non-repeatable landmark quest. |
| Training | Earn EXP by winning battles. No separate Train action or timer. |
| Existing activities | Honor rewards earned before a fixed feature cutover, close existing sessions once, and preserve saved Pokémon and discoveries. |

The owner added the inventory/item requirement after the first draft. It replaces the earlier included-basic-attempt proposal. Starting quantities and replenishment numbers below are initial balance defaults. Turn-by-turn commands, repeatable quests, and a different action pace are separate product changes, not implementation details to silently add.

## Scope and preserved behavior

Keep login, onboarding, Professor Andre's current starter offers, saved party editing, the Box, Pokédex, Pokémon identities, nicknames, six-stat growth, hidden levels, evolution, and existing battle mechanics. Catching adds a new owned individual; it does not replace a party member automatically. Levels remain hidden in every new screen.

Keep `home` and `r1` IDs and map coordinates. Preserve drag-to-pan, zoom, recenter, keyboard controls, list navigation, trainer marker, selected place, and restoration of map position on return. Reuse the current Hearthvale image and Night UI. Other locations can remain scenery in that image, but have no interactive marker, list entry, route detail, unlock condition, or playable API action. Historical location IDs remain readable for migration.

Hearth Town is selectable and shows its description and the way to Sunny Meadow. Do not implement shops, healing, daycare, breeding, town quests, or a currency economy. The inventory and item acquisition/consumption loop are in scope. Preserve the existing town art pack and preview. Integrating its separate close-up scene is outside this slice; its service proposals are not approved mechanics.

Sunny Meadow is available after the existing onboarding, regardless of party strength, guardian history, landmarks, catches, or quest progress. Remove the Cleared mastery pip, guardian challenge, clear bonus, and guardian unlock copy. Keep sightings and landmark completion as collection progress without an access effect.

## The route visit

Opening Sunny Meadow is free. Show its meadow scene, description, saved party and Edit party, actions available, refill information, encounters, landmarks, Bag access and capture-ball counts, and three primary search buttons. Explain each button's action cost and possible finds before the player spends an action. Catching costs a ball as well as the action already spent on the search.

| Search | Guaranteed category | Proposed selection within it |
| --- | --- | --- |
| Find wild Pokémon | One wild Pokémon | Existing Sunny Meadow species weights, identity odds, and hidden strength range. |
| Find NPC | One NPC | 70% trainer, 30% researcher while the quest is unclaimed. After its reward is claimed, choose a trainer. |
| Explore | One primary find | 45% wild, 30% NPC, 25% item. NPC finds use the same NPC selection rule. |

These weights are configurable balance proposals, not measured player preferences. When the account has no capture balls at search time, Explore instead guarantees a supply find as described under Inventory and items; state this on the button before spending. There is no empty search in this version. Every search resolves promptly into a persisted encounter or item result; there is no travel countdown or chain of expedition checkpoints.

Explore also has a proposed 50% chance to discover one not-yet-found landmark. Select uniformly among the missing landmarks and record it alongside the primary find. Once all three are known, omit this additional roll; do not substitute a repeatable reward. This keeps the three requested Explore categories while preserving landmark discovery. Reading a known landmark's description is free and cannot reroll a find.

The account can have one unresolved encounter. Navigating to the map, town, Box, or party screen does not abandon it. Show **Resume encounter** until it is finished or explicitly left. Its party, encounter identity, and rules are frozen at search time. Editing the saved party affects the next search. A search with a changed or invalid party is rejected before any action is spent.

## Wild encounters and catching

Preserve the checked-in pool exactly at the start of this slice:

| Species | Weight |
| --- | ---: |
| Sentret, Zigzagoon, Pidgey, Rattata | 3 each |
| Hoppip, Sunkern, Kricketot, Bidoof | 2 each |
| Eevee | 1, marked rare |

The total weight is 21, so Eevee starts at 1 in 21 wild finds. Preserve hidden wild levels 2–5, the current 0.6 battle stat multiplier, and shared shiny/alternate-color rules unless balance evidence justifies a separately documented adjustment. Do not carry the old expedition branch rare boosts into these searches.

Show the Pokémon, variant, and available choices:

- **Battle**: fight this one opponent using the saved party snapshot of 1–6 Pokémon.
- **Try to catch** (only after a battle win, changed 2026-10-03): select an owned Poké Ball or Great Ball from the Bag, see its quantity and catch chance, then throw once. No ball means no throw. A throw before the battle is refused.
- **Leave**: close the encounter without further reward. The search action stays spent.

After a battle win, show the EXP/growth result and offer the catch attempt or Leave. Winning does not require catching. A loss ends the encounter with no new EXP or catch opportunity. After either throw outcome, the encounter ends; a failed throw cannot be followed by a battle or another throw. There is never more than one battle and one throw per wild encounter.

Proposed catch probabilities:

| Situation | Common species | Rare species |
| --- | ---: | ---: |
| Poké Ball after a win | 80% | 55% |
| Great Ball after a win | 95% | 75% |

The before-battle rows (60% / 35%, and 80% / 55% with a Great Ball) were retired on 2026-10-03, when the win became required.

Display the applicable percentage before throwing. Great Ball adds 20 percentage points, capped at 95%. Variant color does not further penalize the chance. This is an explicit early-game rule, not the main-series capture formula. No HP-based catch calculation is introduced.

The server freezes the complete individual at encounter creation: species, hidden level, stats, sign, ability, build, variant, and emotion where applicable. A successful catch persists that exact individual with a new owned ID, `origin: 'catch'`, zero EXP, and the catch time. Never reroll it at capture or mint the temporary battle handicap into its owned stats. Extend the wild-roll result to retain its mint data; the current `WildView` alone is insufficient.

In one transaction, consume exactly one of the selected owned balls, finalize the throw, mint at most one Pokémon, and update the existing Pokédex collection layer. Sightings remain separate from ownership. Both successful and failed throws consume the selected ball. Opening the Bag, selecting a ball, cancelling selection, or a rejected/rolled-back request consumes nothing. A retry returns the same throw receipt without another debit. There is no free or unlimited fallback ball.

Honor the existing Box limit of 600. At capacity, disable Catch with a clear reason and allow Battle or Leave. Recheck capacity inside the catch transaction. A capacity or insufficient-item rejection spends no item and leaves the encounter unresolved so the player can choose another valid action. Do not add a release-Pokémon feature in this slice.

## Trainers, quests, and found items

Use existing trainer sprites and authored dialogue. Proposed trainer content is Meadow Scout with one Pidgey and Youngster with one Zigzagoon; select them equally. Start with hidden level 5 and a 0.6 foe stat multiplier. These are ordinary optional battles, never guardians or route gates. Adjust their combat knobs only against the balance checks below.

Trainer encounters show the trainer and opponent before **Battle** or **Leave**. Trainer Pokémon cannot be caught. A completed trainer battle settles once and ends the encounter; later searches can find that trainer again.

The researcher offers **Meadow survey**: discover Old Signpost (`signpost`), Sunflower Patch (`sunflowers`), and Hilltop Oak (`hilltop-oak`). Accepting, declining, or reading the dialogue finishes this NPC encounter. Already recorded landmarks count toward the quest, including discoveries from before the feature change.

Quest states are not accepted, active, ready, and claimed. Accepted quest progress is visible in the route panel. When all landmarks are known, the player can claim **3 Great Balls** there, without spending an action or searching for the researcher again. A claim is permanent and idempotent. Repeated dialogue cannot restart the quest or grant another reward. A repeat researcher visit before completion shows remaining landmarks and has no reward. The quest has no deadline and unlocks no location.

Explore item finds and quest rewards use the same inventory grant system described below. Persist each grant with its source receipt; Collect/Continue only dismisses that receipt and never grants it again.

## Inventory and items

Inventory is required for this release, not a later placeholder or a Great Ball counter bolted onto catching. Implement a shared item catalog, persistent per-account item stacks, server-owned grants and consumption, and a Bag accessible from the Hub, route panel, and wild encounter. Keep the initial content small:

| Item ID | Item | Use |
| --- | --- | --- |
| `poke` | Poké Ball | Consumed for one basic catch attempt. |
| `great` | Great Ball | Consumed for one catch attempt with the documented chance bonus. |

The catalog defines stable IDs, names, descriptions, icons, category, allowed use context, and capture effect. Reuse existing ball icons. An item definition describes what an item does; only the server's inventory records prove ownership. The existing cosmetic ball selector must never grant usable inventory or unlock unimplemented ball types. Reject unknown IDs and balls that exist only in the cosmetic catalog.

Proposed supply defaults:

- On first feature activation, grant **20 Poké Balls** exactly once to new and returning accounts. Record the starter-pack grant with initialization; retries, relogins, or later emptying the Bag cannot repeat it. Preserve any existing inventory quantities.
- A normal Explore item find grants **3 Poké Balls (75%)** or **1 Great Ball (25%)**. Choose and persist the bundle once with the search result.
- If the account owns zero total usable capture balls when an Explore search commits, that search guarantees **3 Poké Balls** as its primary find instead of rolling the primary category. It still costs one action and retains the normal landmark side roll. This provides a clear recovery path without requiring a town shop or a successful catch. Show the guaranteed supply behavior before the search.
- The landmark quest grants its specified **3 Great Balls** once. Grants and debits use the same transactional inventory helpers, including when requests race.

The Bag shows each supported item with icon, name, description, and owned quantity; distinguish an empty Bag from a failed load. Include zero-count ball types with disabled selection and explain how to find more. Items stack by ID; this slice has no Bag slot limit, selling, trading, discarding, equipment, healing items, or currency. Quantities must be non-negative integers and additions must not overflow the supported numeric range.

Inside a wild encounter, selecting a usable ball opens/updates the catch confirmation with the server-provided chance and quantity. A confirmed throw uses the encounter choice endpoint; do not expose an arbitrary inventory mutation endpoint to the client. Outside a wild catch phase, the Bag can describe a ball but cannot consume it. Opening or closing the Bag preserves the encounter and costs no action.

With no balls, Catch is disabled, while Battle or Leave remain available. The route panel directs the player to Explore for supplies; at zero actions, it also shows the next refill. An unresolved encounter still follows the one-active-encounter rule: leave or finish it before starting a supply search. No automatic ball refill, offline item gain, or daily supply claim is introduced.

Return authoritative inventory updates with every grant and throw receipt, and reconcile them with fresh state on reload or stale/conflicting responses. The UI must not infer item ownership from local storage, optimistic catch animations, or a cosmetic selection. A replayed old receipt must not overwrite a newer inventory snapshot; include a monotonic inventory revision or refresh current state before replacing displayed quantities.

## Active training and rewards

Proposed rewards are **30 EXP per wild win** and **50 EXP per trainer win**, to each member of the starting party still owned at resolution. Preserve the current per-member over-strength falloff through the existing growth seam, including its 25% minimum. Apply the snapshot's hidden level for reward scaling and the current owned row for the actual update, preserving nickname changes. Do not grant EXP for elapsed time, failed battles, throws, dialogue, leaving, replaying, or dismissing results.

Apply battle rewards atomically when the battle resolves, even when the wild encounter remains open for a catch decision. Closing the browser after winning cannot lose EXP; finishing or catching later cannot grant it again. The newly caught Pokémon receives no retroactive EXP from its own battle. Keep current HP reset behavior between battles and introduce no injury/rest timer.

Show EXP bars, stat gains, and evolutions using the existing growth presentation. Do not resurrect numeric levels or redesign growth formulas. As a pacing illustration, a fresh hidden-level-5 starter needs 100 EXP for its next growth: four unscaled wild wins at 30 EXP cross that threshold. It needs 360 EXP to reach the first starter evolution threshold at 8: twelve such wins. These are arithmetic examples, not predicted session lengths or guaranteed win rates.

## Action allowance and healthy pacing

The proposed bank is account-owned and shared by the three Route 1 searches. How multiple future routes share an allowance remains undecided. No actions are spent on navigation, Bag access, party edits, reading progress, completing an encounter, quest claims, or replaying results. Free encounter completion refers to action cost; a throw still consumes its selected inventory ball.

- Refill continuously on server time: 1 action each 600,000 ms, with a cap of 48. No top-of-hour or midnight reset.
- First activation gives 12 actions exactly once to both new and existing accounts. Unopened accounts do not accrue a pre-activation backlog. Activation is an authenticated, idempotent POST, not a write hidden in a GET.
- At zero, disable only new searches. Show the next refill time; existing encounters can still finish.
- At the cap, no overflow or hidden fractional progress is banked. After spending from a full bank, the next action arrives 10 minutes later.
- Below the cap, preserve elapsed partial intervals when spending. Clamp backward clock movement to zero; never award negative elapsed time.
- Refreshing, changing device clock, signing in elsewhere, or sending concurrent requests cannot increase the bank or spend its last action twice.
- Returning after hours away replenishes permission to play only. It never performs encounters, creates items, grants EXP, or catches Pokémon.

The server returns `available`, `capacity`, `refillEveryMs`, `nextRefillAt`, and `serverNow`. A client countdown is presentation only. Compute refill read-only for state responses; serialize refill materialization, decrement, and encounter insertion in the search transaction. A failed validation or rolled-back transaction spends nothing. A committed search with a lost response still exists and costs exactly one action; retry/resume returns it without another charge.

The bank provides eight hours of refill capacity from empty. It still caps accrual during longer absences; it is not a promise that players must spend everything or return every eight hours. Use neutral copy, no urgency badges, streaks, refill notifications, paid refills, or rewards for emptying the bank. A player may stop after one encounter and resume another day.

Balance hypotheses to evaluate in playtests: a short visit should support several meaningful choices; the first visit should show visible progress; common catches should be attainable; finding a rare should be memorable; and neither hourly check-ins nor exhausting 48 actions should feel necessary. Measure encounter duration, action use per visit, return intervals, catch attempts, and growth per action with an approved measurement approach. No new tracking vendor or automated retention campaign belongs in this implementation. Keep refill, cap, rewards, probabilities, and content weights in versioned shared configuration. Revisit 6/hour and 48 capacity using playtest evidence.

## Screens and state transitions

The normal flow is Map → Sunny Meadow → search → encounter/find → result → Sunny Meadow. A wild win may pass through a catch decision before its final result. Browser reload and sign-in restore the latest committed state; tab visibility and replay speed cannot decide outcomes.

Keep UI responsibilities small: route detail/actions, Bag/item details, wild encounter/catch choice, NPC dialogue, server battle replay, and a reusable result summary. Reuse `BattleReplay`, `Backdrop`, `GrowthStats`, `ExpBar`, and sprite primitives where their contracts fit. No new route-map illustration or map-engine replacement is needed.

Replace the Hub's timed-training/checkpoint card with action availability, Resume encounter when applicable, and the newest unseen result. Results show the actual find, catch outcome, EXP/growth, item changes, landmark discovery, and quest progress relevant to that encounter. Do not label every result a win or imply a claim is needed for already committed rewards.

Handle loading, unavailable world/inventory, empty party, exhausted actions, pending request, active encounter, empty Bag, unavailable selected ball, full Box, stale choice, lost response, missing schema, and expired login explicitly. Keep the same request ID while retrying an uncertain write, including after reload. If that local ID is lost, fetch current server state before allowing another search. Never show failed loads as an empty collection/Bag or reset balance.

Layout works at 320–430 px with no page overflow, safe-area padding, visible keyboard focus, and touch targets at least 44 px. Use Night tokens, pixel rendering, and reduced-motion behavior. Replay skip/advance and result dismissal never trigger another reward write. Preserve map view and focus on return.

## Shared contract and server authority

Land the shared contract before separate implementation agents touch the server and screens. Proposed modules are `src/game/route-actions.ts` for types/configuration and pure allowance/event rules, and `src/game/route-actions-client.ts` for fetch-only helpers. Exact filenames may change at that contract step; behavior may not.

Use the existing `api/world/[action].ts` dispatcher with a dedicated domain helper such as `api/_route-actions.ts`. Keep SQL in `api/_db.ts` and pure seeded rules in `src/game/`. Do not alter auth/session behavior or the existing Redis abuse limits. The durable action allowance is a game rule in Turso, separate from HTTP rate limiting.

Minimum public model:

- `SearchKind`: wild, npc, explore.
- `ItemDefinition` and `InventoryStack`: catalog metadata/effect and an owned item ID with integer quantity. `InventoryState` includes stacks and a revision for reconciliation. Separate these from cosmetic ball choices.
- `RouteEvent`: ID, location, source search, rules version, revision, public party snapshot, current phase, legal choices, already committed discoveries/rewards, and relevant wild/NPC/item details.
- Phases distinguish wild decision, wild catch after a win, trainer decision, researcher dialogue, and resolved. Legal transitions are explicit; the client cannot choose arbitrary outcomes.
- `RouteState`: server time, active locations/progress, trainer position, allowance, inventory state, quest status, active event, latest unseen result, and any legacy-transition notice.
- `RouteResult`: event ID, outcome, committed battle log when applicable, member growth, catch/owned ID, items, discoveries, and quest updates. Seeds and future random outcomes stay private.

| API operation | Contract |
| --- | --- |
| GET world state | Read only; include action-game state, inventory, and initialization/legacy status. This also supplies the Hub/route/Bag with current inventory. No accrual payout or migration side effect. |
| POST activate | Initialize allowance and grant the starter item pack once; retire this account's legacy activity, if necessary, atomically or through an explicitly resumable transition. Repeats return committed state. |
| POST search | `{ requestId, locationId: 'r1', kind, partyIds }`; validate party, active encounter, and allowance, then commit one find and its action cost together. |
| POST choose | `{ requestId, eventId, expectedRevision, choice, ballId? }`; a throw requires a supported `ballId` with positive owned quantity. Validate legal choice, item use context, and ownership, resolve on server, and atomically commit item debit, phase, and rewards. |
| POST quest claim | `{ requestId, questId }`; check stored completion and grant the one-time reward. |
| POST result dismiss | `{ eventId }`; acknowledge an already settled result. Never settle gameplay here. |

Bind each write request ID to its user and canonical request payload. Same ID and same payload returns the original committed receipt even after later events; same ID and different payload returns a conflict. Process a known valid retry before rejecting it for a changed balance/party or a newer active event. Persist command receipts, not just the latest mutable phase. A stale revision or competing choice returns 409 with current state and makes no additional change.

Use existing response conventions: 400 for invalid input, 401 for expired/no session, 404 for another user's or absent resource, 409 for gameplay conflicts (including exhausted allowance, with allowance details), 429 for HTTP abuse limits, and 503 for unavailable infrastructure/schema. Preserve the existing unconfigured-database `ok: false` behavior. Return player-facing errors. Missing new tables must leave login, Hub, Box, and Pokédex usable. A failed optional read after commit must not turn a successful write into an error.

Persist additive records for the allowance/activation, route events with frozen rules and complete encounter identity, command receipts, item quantities, and quest acceptance/claim. Enforce at most one unresolved event per account, unique `(user_id, request_id)` receipts, unique `(user_id, item_id)` inventory, and unique `(user_id, quest_id)` quest state with database constraints/conditional writes. Choose transaction boundaries to prevent duplicate EXP, duplicate catches, negative actions/items, lost inventory updates, double quest rewards, and race-based Box overflow.

## Removing idle gameplay and preserving saves

Disable old start/step entry points on the server as well as removing their UI. Old tabs must receive a refresh/retired-feature response; they cannot start training, advance a guardian, or visit later routes. Audit `App.tsx`, Hub cards, Guide copy, fetch helpers, `[action]` dispatchers, developer tools, and tests, not only `TrainingView`.

Do not drop `idle_sessions`, `encounters`, historical progress, owned Pokémon, or saved party fields. New route events use new storage so historical activity rows are not reinterpreted as the new event format. Retain only legacy parsers/rules needed to settle or display old data, clearly separated from live content.

Proposed transition:

1. Use one immutable, server-configured cutover timestamp for this rollout, recorded in the release checklist. All deployments serving the new feature must agree on it. Tests use a fixed timestamp. No implementation agent invents a production date or writes production data.
2. Disable legacy gameplay mutations at cutover. On the account's first authenticated activation POST, close its open legacy activity exactly once. Do not do this from a GET.
3. For training, calculate only the earned battles through `min(serverNow, cutoverAt)`, honoring the old cap, defeat rule, frozen config, and growth rules. Never grant post-cutover idle EXP. For an expedition, settle its already banked EXP only; do not simulate another checkpoint or grant a guardian/clear reward.
4. Commit the close, any eligible growth, and a readable transition receipt together. Old finish requests must use the same retirement path and cannot use current time to extend the payout. Already settled activities return their stored result without paying again.
5. Preserve sightings and landmarks, including historical places. Ignore guardian clear flags for current access. A historical last location outside `home`/`r1` displays the trainer at Hearth Town.
6. Unknown/malformed old activities close without fabricated rewards and with a notice; retain the original stored data for diagnosis. A missing cutover value when legacy retirement is needed fails safely with a transition-unavailable state, rather than silently paying current-time rewards or zeroing a valid session.

Test both versioned map activities and older rows with null mode/config. Preserve an explicit legacy fallback for those older shapes. A normal account must never be permanently blocked by a retired open activity. Initialization and retirement must finish before new route events can start; no current request may leave a partially initialized balance or duplicate payout.

Schema changes are additive and idempotent, including `COLUMN_ADDS` when needed. Verify old owned/save data remains readable. The new rules version must not reinterpret historical seeds. Record release-version implications in `RELEASING.md`: repository policy treats sweeping redesigns as major changes even when storage compatibility is preserved. Do not bump a version, tag, or release during implementation unless requested. Local DB files are not migration test fixtures; use temporary file databases.

## Acceptance and evidence

| Area | Required evidence |
| --- | --- |
| Removed features | UI and API cannot start idle training, earn new offline rewards, advance a guardian, or play another route. Old endpoint requests are exercised, not only source-searched. |
| Map preservation | Browser checks demonstrate pan/zoom/recenter/list/keyboard behavior and restored view after encounters; only town and meadow are interactive. |
| Search categories | Seeded cases reach every primary find and the landmark side discovery; each paid search produces exactly one persisted primary find. |
| Allowance | Fake-clock cases at 9:59/10:00, partial refill, cap/overflow, long absence, and backward time; initial grant once; concurrent final-action spends produce only one event. |
| Recovery | Lost responses, reloads, same-ID retries after settlement, changed-payload reuse, conflicting choices, and cross-account reads/writes leave state consistent. |
| Catch | One throw; valid pre/post-battle probabilities; exact encountered identity retained; no trainer capture; one owned row/dex update; either ball is debited once on success or failure; no-ball/unsupported-ball/wrong-context requests rejected; full Box and competing capacity writes cannot overfill. |
| Growth | Win pays once even if catch is pending; loss/catch/replay/time pays no EXP; snapshot scaling and current-row updates preserve nicknames, hidden-level growth, stats, and evolution. |
| NPC and quest | Both trainers playable; optional researcher dialogue; existing landmarks count; free route-panel claim works once and survives retries/races. |
| Inventory | Starter pack once; both Explore supply bundles and quest grants persist across reload/login; Bag and catch selection agree; success/failure debits once, cancellation/rejection debits nothing; grant/debit races preserve totals; stale receipts cannot rewind quantities; cosmetic balls grant no items. |
| Empty Bag recovery | Zero usable balls disables Catch but permits Battle/Leave; next Explore guarantees the documented Poké Ball supply for one action, including retry and last-ball race cases. |
| Legacy saves | Pre-cutover training payout, banked expedition payout, no new guardian clear, null-version and malformed rows, repeat retirement, unseen results, and old tabs all tested. |
| Failure states | Missing schema/env, expired login, empty party, exhausted actions, concurrent writes, and post-commit read failure get correct recovery paths. |
| Combat balance | Fixed-seed simulations over the current `STARTER_POOL` at fresh starter strength report wild and each trainer win rates. Proposed gate: every starter wins at least 75% of weighted wild battles and 60% against each trainer over 200 seeds; tune foe strength before changing the growth engine or pool. |
| Player presentation | 320 px and 430 px browser checks, keyboard operation, reduced motion, no numeric levels, no overflow, and useful results/next action. |

Extend existing world/game/API/client test scripts where they cover the same contract. Add files only for meaningful new behavior and register each in `package.json`. Retain growth, ownership, session, seed-determinism, and idempotency coverage. A reported bug needs a regression that fails before its fix. Do not replace behavior tests with string/config assertions or build a new test framework.

Run focused checks during each slice, then `npm run lint`, `npm test`, and `npm run build`. Check UI with `npm run dev:local`; production is not a test target. Run the repository's read-only reviewer on the integrated sensitive diff and fix P0/P1 findings. Update player-facing Guide text and `[Unreleased]` when behavior is implemented, not merely when this draft is written.

## Repository evidence and precedence

Reviewed against clean `development` at `7e572725` on 2026-09-30. Current implementation takes precedence over older specs when describing the starting point:

- `src/game/world.ts`, `world-places.ts`, `activity.ts`, `expedition.ts`, `training.ts`, `wilds.ts`: places, old activity contract, and seeded simulation.
- `src/game/professions.ts`, `growth.ts`, `evolution.ts`, `levels.ts`, `box.ts`, `balls.ts`: actual onboarding, growth, owned identity, and cosmetic balls.
- `src/components/world/`, `src/components/HubActivity.tsx`, `src/App.tsx`: map, activity UI, polling, and integration.
- `api/world/[action].ts`, `api/_world.ts`, `api/_db.ts`, `db/schema.sql`: handlers, settlement, and persisted activity/progress.
- `docs/art/night/hearth-town-v2/README.md`: town art and intentionally undefined service interactions.
- `docs/superpowers/specs/2026-09-30-growth-system-design.md`: approved growth model preserved here.

On approval, this spec supersedes the idle loop, expedition structure, guardian gating, and multi-route playable scope in `2026-09-30-world-map-exploration-training-design.md` and the idle portions of `2026-09-30-slice-1-trainer-onboarding-idle-design.md`. It does not revive the older Rental/catch-run design. The linked Claude v2 document could not be retrieved during drafting; no unseen content is claimed as evidence. This request's direction governs the proposed replacement.
