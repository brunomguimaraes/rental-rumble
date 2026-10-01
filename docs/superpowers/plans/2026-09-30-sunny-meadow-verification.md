# Sunny Meadow implementation verification

Implementation base: `258c3c24` on `development`. The independently committed growth tuning in that base is preserved. This record covers the inventory and active-route feature diff, with no deployment, production SQL, or changes to `local.db`.

## Automated checks

- `npm run lint && npm test && npm run build`: passed. The 19 registered test scripts report 1,128 passing checks. Both frontend and API TypeScript builds pass.
- New coverage: 68 pure-rule checks, 53 route database checks, 37 route API checks, and 29 client checks. Database checks use disposable file databases.
- Coverage includes action refill and concurrent spending, one active encounter, both ball types on success/failure, exact caught identity, retries and receipts, rollback, Box capacity, quest/item races, coherent state snapshots, stale UI responses, and legacy cutoff/retirement/dismissal.
- Regressions discovered during implementation were reproduced before their fixes: malformed successful responses, signed item copy, mixed database snapshots, malformed enum field types, dismissed legacy results reappearing, and delayed hydration overwriting newer Box updates.
- Build emits the existing large-chunk advisory. It does not fail the build.

## Battle balance

`node --import tsx scripts/route-balance.ts` passes all gates. The simulation uses 200 seeded encounters of each category for every one of the 10 actual starter species, alone, with production-minted stats and no growth between battles: 6,000 battles total.

| Category | Lowest starter win rate | Required gate |
| --- | ---: | ---: |
| Wild Pokémon | 95.5% | 75% |
| Meadow Scout | 74.5% | 60% |
| Youngster | 99.5% | 60% |

These measure combat accessibility, not retention or real-player enjoyment. Action pace and item supply remain first-playtest defaults.

## Browser check

Ran `npm run dev:local` on isolated ports against a disposable SQLite file and synthetic account. The user's existing development servers and saved database were left intact.

- Signed in and completed normal onboarding with Lotad; activated 12 actions and 20 Poké Balls.
- Won a wild battle, observed +30 EXP before capture, cancelled ball selection without a debit, and caught Kricketot using exactly one Poké Ball.
- Won a Youngster battle for +50 EXP; explored into another trainer encounter and left without an additional action cost.
- Found and accepted the Meadow Researcher's survey through normal searches.
- Prepared explicit test-only fixtures for empty inventory and all three discovered landmarks. Explore then granted 3 Poké Balls; claiming the completed quest added 3 Great Balls.
- Reloaded an active Sentret encounter with a test-only zero-action fixture. New searches stayed disabled; the same encounter resumed and consumed one Great Ball to catch it.
- Stopped only the isolated test server. The failed request showed a recoverable error and retained the saved result. Restarting and returning to the result recovered it without another reward or debit.
- Checked Bag entry from Hub, route, and encounter; preserved map zoom, keyboard pan, recenter, list navigation, Hearth Town, and Sunny Meadow.
- Checked 320 px and 430 px layouts with no document overflow. Inspected map and Bag screenshots at 430 px.
- Reduced-motion handling was reviewed in source; the browser's system preference was normal motion. No claim of an emulated reduced-motion browser run.

## Review and rollout

The read-only reviewer returned **PASS**, with no unresolved P0/P1/P2 findings, and rechecked the final small copy/signature cleanup.

Local implementation is ready. Before a production release, the owner must approve and run the additive schema migration, set one immutable `ROUTE_ACTIONS_CUTOVER_AT`, and disable older gameplay writers against the same database. Follow the active Sunny Meadow checklist in `RELEASING.md`. No release, tag, or push was performed here.
