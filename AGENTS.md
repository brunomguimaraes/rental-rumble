# Rental Rumble

A login-based idle collecting game with real Pokémon. React 19 · TypeScript · Vite · Tailwind CSS v4 on the
front; Vercel serverless functions in `api/` backed by Turso (libSQL/SQLite) and Upstash Redis on the back.

`CLAUDE.md` points to `AGENTS.md`; `.claude/` points to `.agents/`. Edit the canonical files and keep both symlinks.

One-way layering: `src/components` → `src/game/*-client.ts` (fetch) → `api/<area>/[action].ts` → `api/_*.ts`
(db, session, rate limit) → Turso/Redis. Pure game rules live in `src/game/` and run on both sides; the server
re-runs them from a fixed seed and is the only writer of growth, evolution, and owned Pokémon.

## Load only what the task needs

| Task | Read |
|---|---|
| Edit, verify, or ship a change | `.agents/rules/dev-workflow.md` |
| React screens, components, client fetch helpers | `.agents/rules/frontend.md` |
| Serverless handlers in `api/` | `.agents/rules/api.md` |
| `db/schema.sql`, `api/_db.ts`, queries, `db:setup` | `.agents/rules/database.md` |
| Writing, changing, or auditing tests | `.agents/rules/testing.md` |
| Cutting a release | `RELEASING.md` |
| v2 game design | the Claude Doc at https://claude.ai/code/artifact/47af7c97-2c60-401a-be74-42f3ff3cfb3a, then `docs/superpowers/specs/` |

## Verification

`npm run lint`, `npm test`, `npm run build` — the whole gate, matching CI (`.github/workflows/ci.yml`) and the
release script. `build` type-checks `src/` (`tsc -b`) and `api/` (`tsc -p tsconfig.api.json`) separately; Vercel
compiles `api/` without type-checking, so skipping `build` ships API type errors.

## Gotchas

- **Runtime relative imports in `src/game/` and `api/` end in `.js`** (`'./box.js'`, `'../../src/game/routes.js'`).
  Node ESM (tsx, Vercel) resolves them literally. `import type` is erased and may omit it; components may too.
- **`*.gen.ts` files are generated** (`scripts/gen-*.ts`, `scripts/fetch-*.mjs`, `scripts/build-*.mjs`). Change the
  generator and rerun it; never hand-edit the output.
- `npm test` is an explicit chain of `tsx scripts/*.test.ts`. A new test file is dead until it is appended there.
- `vercel dev` EMFILEs on the ~50k sprite PNGs. Run the full stack with `npm run dev:local` (Vite on 5173 proxies
  `/api` to `scripts/dev-api.ts` on 3001). A new `api/<area>/[action].ts` area must be added to its route list.
- Local dev uses `TURSO_DATABASE_URL=file:local.db`. Missing env degrades to a clean `ok: false`, not a crash.
- The seed/save format is versioned by SemVer: breaking it is a **major** bump (`RELEASING.md`).

## Task and communication

- Lead with the result or current state. Short sentences, active voice, the game's domain terms.
- Read-only questions and reviews stay read-only.
- Clarify the intended outcome before adopting a proposed solution. Separate observed facts from assumptions.
  Look up discoverable facts before asking; group open decisions with a recommended default.
- Agree a short spec (result, acceptance criteria, exclusions) before changing auth or sessions, the idle
  claim/growth path, rate limits, `db/schema.sql`, or the seed/save format. Other changes need no separate plan.

## Implementation

- Reproduce a bug and find its cause before fixing it. A new regression test must fail before the fix.
- Map changed behavior and failure modes to existing coverage. Add only the tests that close gaps, at the
  lowest-cost reliable layer, asserting observable behavior (`.agents/rules/testing.md`).
- Before replacing a component, account for its props, callers, and loading/empty/error states.
- Trace callers and dynamic entry points (the `[action]` dispatchers, `scripts/dev-api.ts`, lazy screens) before
  declaring code unused.
- Split large changes into verifiable slices; land the shared contract (types in `src/game/`, response shapes)
  before the screens that depend on it.
- Update only the docs and config the change affects. Keep `CHANGELOG.md`'s `[Unreleased]` section current.

## Git and permissions

Work on `development`; `main` moves only through `npm run release`. No history rewrites or force-pushes.
Read-only checks, local tests, and reversible edits within the request may proceed. These need explicit confirmation:

| Action | Rule |
|---|---|
| Destructive git (reset, branch deletion, discarding changes) | Explain the target and impact first. |
| `npm run db:setup` or any SQL against the Turso production database | Follow `RELEASING.md`'s checklist; confirm first. |
| Deleting or rewriting `local.db` | Confirm first. Tests use their own temp file database. |
| Release, tag, or push to `main` | Only on the owner's request, via `npm run release`. |

Never commit `.env`, `.env.local`, tokens, or `local.db`.
