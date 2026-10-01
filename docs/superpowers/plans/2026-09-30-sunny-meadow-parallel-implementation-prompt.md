# Sunny Meadow parallel implementation prompt

Review the companion spec first. The prompt below explicitly approves its proposed defaults when you run it. If you want a different battle system, action pace, catch economy, quest scope, or legacy-session treatment, edit those choices in the spec before running this prompt.

Use one coordinating coding agent with up to three concurrent workers. The coordinator owns integration and the final result. This prompt requests parallel subagents within one implementation task, not separate user-owned chats. It does not require a particular model name; use the coding model configured for your session. Correct ownership and shared contracts matter more than starting many agents at once.

Copy everything inside the following block into a new implementation session in this repository:

```text
Implement the approved Sunny Meadow active route gameplay spec in:
docs/superpowers/specs/2026-09-30-sunny-meadow-route-actions-design.md

For this implementation, I approve that spec's proposed defaults, including:
- 6 route actions per hour, capacity 48, and a one-time initial balance of 12;
- one action per search and no additional action charge to finish its encounter;
- existing automatic server battles and replay, with active EXP rewards;
- a persistent inventory/item system and Bag UI in this same slice; both
  Poké Balls and Great Balls are owned consumables, and every throw uses one;
- one throw per wild, the documented before/after-battle probabilities,
  a one-time 20-Poké-Ball starter pack, Explore supply bundles, and the
  guaranteed Explore resupply when no capture balls remain;
- two trainer NPCs, one playable landmark quest, and both capture-ball items;
- additive storage and the documented cutoff-based legacy retirement.
This is approval of the result, acceptance criteria, exclusions, growth/claim
changes, and additive schema changes described in the spec. It is not approval
to operate on production or to change auth/session behavior or HTTP abuse limits.

Use parallel subagents. Keep no more than four agents active in total: you as
coordinator and at most three workers. Finish the implementation and verify it.
Do not stop after writing a plan or ask again about choices approved above.
If the spec has since changed materially, identify that difference before
changing sensitive behavior. Resolve routine implementation details yourself.

Start by reading AGENTS.md, .agents/rules/dev-workflow.md, and the rules relevant
to each owned area. Inspect branch, HEAD, status, and diff. Work on development,
or a short-lived codex/ branch off development if isolation is necessary.
Preserve unrelated work and both canonical-file symlinks. The spec's baseline
was 7e572725; re-read the actual code rather than assuming it is unchanged.
If no subagent tool is available, state that limitation and implement the same
slices sequentially; do not claim parallel execution.

First establish the shared contract yourself, before any implementation worker:
1. Trace the App phase switch, world dispatcher, client helpers, map props and
   callers, developer API router, current growth seam, and existing tests.
2. Define the route configuration, public/private event types, event phases,
   legal transitions, allowance semantics, result/error shapes, request receipt
   behavior, item catalog/inventory revision and grant/consume contracts,
   legacy compatibility boundary, and planned persistence interfaces.
3. Make an explicit ownership list of files, exports, signatures, and fixtures.
   Share the same frozen contract with all workers. Get focused type checks
   passing for this slice. Do not have workers invent separate response shapes.

Then run these three implementation workstreams concurrently:

Worker A — Pure gameplay and route content
- Own new pure route-rule modules and their tests, live route content changes,
  reusable wild mint identity, capture odds, encounter selection, allowance math,
  NPC/quest/item definitions, and seeded battle-balance evidence.
- Own item catalog rules, ball use contexts/effects, and Explore resupply rules.
  Cosmetic ball choices are not proof of ownership or supported item behavior.
- Preserve existing growth formulas and combat engine. Remove live guardian
  coupling while retaining only what the legacy adapter needs.
- Keep the approved species pool and landmarks. Validate every starter from
  the actual STARTER_POOL, not a stale list in an old design document.
- Do not edit API/SQL, React integration, or coordinator-owned contract files.

Worker B — Persistence, server, and legacy transition
- Own api/_db.ts, db/schema.sql, the world dispatcher/domain integration, new
  route domain persistence, command receipts, and database/API tests.
- Enforce ownership, frozen identities, exactly-once action spending, growth,
  catches, items and quest claims, revision conflicts, one active encounter,
  Box capacity, and retry behavior using real transactions and constraints.
- Implement persistent inventory stacks, one-time starter supplies, shared
  item grant/consume helpers, inventory revisions, and authoritative receipts.
  Capture atomically debits either ball on success or failure; no free fallback.
- Implement the legacy cutoff/retirement path and disable old mutation routes.
  Missing schema/config must degrade safely. Keep state GETs read-only.
- Use temporary file databases only. Never modify local.db, run production SQL,
  change HTTP abuse limits, or deploy. Supply migration/release notes to me.
- Consume Worker A's frozen interfaces; report a contract gap to me before
  changing a shared type. Do not edit frontend files or package.json.

Worker C — Route interface and client behavior
- Own the new route/encounter/result and Bag components, changes inside the world UI,
  and fetch-only helpers defined by the contract, plus client helper tests.
- Preserve existing map art and interactions, Night styling, hidden levels,
  small-screen layout, keyboard access, reduced motion, and server event replay.
- Deliver working wild/battle/catch/NPC/quest/item flows with loading, conflict,
  retry, empty, full-Box, exhausted-action, expired-session, and resume states.
- Show item descriptions/counts, inventory-backed ball selection, consumption
  results, empty-Bag resupply guidance, and stale-inventory recovery. Send Hub
  Bag-entry integration requirements to me; inventory is a required deliverable.
- Do not invent town services, additional routes, moves-per-turn, timers, or
  client-authoritative rewards. Do not edit App.tsx, Hub files, SQL, or shared
  contract files; send required integration changes to me.

I as coordinator own App.tsx, Hub/Bag navigation integration, package.json/test registration,
shared contract files, Guide/current documentation, CHANGELOG.md, RELEASING.md,
and any shared legacy type refactor. Assign every existing test file to one
owner before parallel editing; split new tests by behavior when necessary.
Keep workers in non-overlapping file sets. If a tool uses isolated worktrees,
integrate their work in dependency order. If it shares a working directory,
do not cherry-pick or overwrite the same edits. Workers must not commit, push,
revert someone else's changes, release, or run broad formatters.

While the workers run, integrate the Hub and App against the frozen contract,
remove obsolete polling/navigation/copy, register new tests, and prepare the
rollout checklist. A release operator will set the immutable production cutoff;
implement and test that requirement without inventing a production timestamp.
Do not start dependent work against guessed interfaces. Route any necessary
contract amendment through one coordinated update before workers continue.

Integrate in verifiable slices:
1. Pure rules, item catalog, and seeded content.
2. Persistence/API and inventory, including safe initialization and legacy compatibility.
3. Bag/catching/route screens and Hub/App wiring. Catching cannot be marked
   complete before its inventory dependency works end to end.
4. Idle/guardian entry-point cleanup, docs, and complete verification.
Check dynamic entry points before removing code. Keep historical readers only
where compatibility needs them. Do not drop old tables or corrupt old seeds.

Verification requirements:
- Map each changed behavior/failure mode to existing or new observable tests.
  Add only coverage gaps; regression tests for found bugs must fail before fixes.
- Use meaningful seeded tests and real temporary-file DB tests for concurrent
  spending, lost responses, replayed request IDs, conflicting choices, reward
  duplication, stale parties, catch identity, Box capacity, quest/item races,
  one-time starter supplies, both ball debits, empty-Bag resupply, inventory
  persistence/revisions, invalid item use, missing schema, and every legacy
  transition shape in the spec.
- Run focused checks per slice. Register all new test files in npm test.
- Run npm run lint, npm test, and npm run build on the integrated changes.
- Use npm run dev:local for browser checks against a disposable test database,
  not production and not an unapproved migration of local.db. Verify both 320 px
  and 430 px, the preserved map controls, all encounter types, zero actions,
  resuming after reload, Bag access from Hub/route/encounter, item rewards and
  consumption, no-ball recovery, battle win before catch, reduced motion,
  and failures.
- Review the integrated diff with the read-only reviewer instructions in
  .agents/agents/reviewer.md, using the starting HEAD as the review base and
  including untracked files. Reuse a freed worker slot. Fix all P0/P1 findings
  and run checks affected by the fixes; report any remaining P2 findings.

Do not run production migrations, modify/delete local.db, release, tag, push,
or rewrite Git history. After verification and review, create local commits
for the inventory and route feature. Do not add Co-authored-by trailers or
other co-author credits. No generated .gen.ts file may be hand-edited.
Runtime relative imports in game/API end in .js.

Finish with the implemented player behavior, checks actually run and results,
browser evidence, balance measurements, reviewer verdict, any unresolved risks,
and the exact remaining release/migration steps. Distinguish implementation
complete from rollout complete. Do not claim a deploy or a test you did not run.
```
