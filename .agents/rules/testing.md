# Testing

Tests are plain `tsx` scripts in `scripts/*.test.ts`, each with a small `check(label, ok)` harness that prints
failures and ends with `process.exit(failed ? 1 : 0)`. There is no Jest or Vitest.

## Running

- One file: `npx tsx scripts/<name>.test.ts`. All: `npm test`.
- A new file only runs once it is appended to the `test` script in `package.json`.
- Database tests create a temp **file** database under `os.tmpdir()`, run `applySchema`, and delete it in
  `finally`. Not `:memory:`: the libSQL local client opens a new connection per transaction. Never point a test
  at `local.db` or a Turso URL.
- Seeded logic is deterministic: pin the seed and assert exact outcomes rather than ranges when you can.

## Before adding a test

Answer all four, or do not add it yet:

1. What observable behavior, invariant, or contract does it protect: a response shape and status, persisted
   rows, a battle or idle outcome for a seed, a level/evolution result?
2. What credible regression makes it fail?
3. Why does existing coverage not already catch it? Extend an existing file or table of cases before adding a
   near-duplicate.
4. Does it need an export or branch that only the test uses? Then test through the real entry point instead.

A bug's regression test must fail on the pre-fix code for the intended reason (the assertion, not a setup error).
If you cannot name the source change that turns a test red, make one, watch it fail, and revert.

## Rejected patterns

- assertions that cannot fail, or no assertion;
- expected values computed by the function under test;
- constants, tables, or config asserted back verbatim;
- source or string greps where a behavior check is possible;
- mocks that echo what the test told them to return;
- exports kept alive only for a test;
- names that promise more than the assertions check.

## Keep

Tests that guard a contract something else depends on: auth and session handling, ownership checks, claim
idempotency and races, growth/evolution math, seed determinism, schema invariants, and response shapes the
client reads. Slow or static is not a reason to delete one.
