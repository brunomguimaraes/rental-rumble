# Dev workflow

`AGENTS.md` owns scope and permissions. These steps apply to authorized implementation work.

## Before editing

1. Inspect the branch, HEAD, status, and diff. Preserve unrelated local changes; do not switch a dirty checkout
   to another task.
2. Work on `development` (or a short-lived branch off it for a large slice). Never commit to `main` directly.
3. Scratch plans and specs go in `docs/superpowers/plans/` and `docs/superpowers/specs/`, dated `YYYY-MM-DD-<slug>.md`.

## Verify

- Run focused checks first: the test scripts that cover what changed (`npx tsx scripts/<name>.test.ts`), plus
  `npx tsc -b` for `src/` or `npx tsc -p tsconfig.api.json` for `api/`.
- Before calling the work done, run the full gate: `npm run lint && npm test && npm run build`.
- Record the tested HEAD or local diff, the commands, and the results. Separate pre-existing failures from
  regressions. If a check cannot run, say why; do not call it passed.
- Label evidence accurately: static review, unit/integration scripts, and a browser check under
  `npm run dev:local` are different things. UI changes need the browser check, or say it was not done.
- For a large or sensitive diff (auth, sessions, claim/growth, schema), run the `reviewer` subagent and fix its
  P0 and P1 findings before committing.

## Completion

- Report what changed, what passed, and what remains unresolved.
- A local commit, a push to `development` (Vercel preview), and a release on `main` (production) are different
  states. Claim only the state you verified.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` (Added / Changed / Fixed / Removed) for player-visible changes.
