# Releasing Rental Rumble

Day-to-day work happens on **`development`**; tagged releases are promoted to
**`main`**, which Vercel deploys to production.

## Branch & deploy model

| Branch        | Role                   | Vercel     |
| ------------- | ---------------------- | ---------- |
| `development` | integration / everyday | Preview    |
| `main`        | release / stable       | Production |

`main` is only ever moved by the release script, fast-forwarded to a release
commit on `development`. Tags are `vX.Y.Z`.

> **One-time (Vercel dashboard):** set the project's **Production Branch** to
> `main` so `main` pushes deploy to production and `development` / PRs get preview
> URLs.

## Versioning (SemVer)

| Bump      | When                                                          |
| --------- | ------------------------------------------------------------ |
| **patch** | balance tweaks, data/sprite fixes, bug fixes (no new feature) |
| **minor** | new features or systems (mode, mechanic, content rollout)     |
| **major** | breaking save/seed-format changes or sweeping redesigns       |

We stay on `0.x` until the save/seed format is considered stable.

## Changelog

Keep a running list under `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md)
as you work (Added / Changed / Fixed / Removed). The release script stamps it as
the new version. If you forget, it seeds the section from `git log` since the last
tag so nothing is lost — but a curated entry reads better.

## Cutting a release

From a clean `development` that's up to date with origin:

```bash
npm run release:dry minor   # rehearse: gates + bump + changelog, then revert
npm run release minor       # for real — patch | minor | major (default: patch)
```

The script will:

1. Verify you're on `development`, clean, and not behind origin.
2. Run the gates: `npm run lint`, `npm test`, `npm run build`.
3. Bump the version in `package.json` / `package-lock.json`.
4. Stamp `CHANGELOG.md` and refresh its compare links.
5. Show the diff + notes and ask to confirm (your chance to edit the changelog).
6. Commit `Release vX.Y.Z`, tag it, push `development`, fast-forward `main`, and
   push the tag.
7. Create the GitHub Release from the changelog section.

Flags: `--dry-run` (no commit/tag/push), `--skip-gates` (skip lint/test/build —
handy when iterating on changelog wording). You can also pass an explicit
version: `npm run release 1.0.0`.

## CI

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs lint + test + build
on every push to `development` / `main` and on PRs into `main`, so broken code
can't land or ship.

## Release checklist

### Active Sunny Meadow and inventory rollout

This feature is a sweeping gameplay redesign; use the **major** release path
when the owner requests the release. Keep schema application, feature activation,
and production release as separate, explicitly approved operations.

1. Review the additive tables: `route_accounts`, `inventory_items`, `route_events`,
   `route_receipts`, and `route_quests`. Existing owned Pokémon, progress, and idle
   activity tables remain. If a deployment already has a prototype `route_events`
   table, pre-check `select user_id, count(*) from route_events where active = 1
   group by user_id having count(*) > 1` before creating `route_one_active_idx`.
   Resolve duplicates deliberately; do not discard saves.
   The Village market adds a `money` column to `route_accounts` through `COLUMN_ADDS`
   (idempotent). Run `db:setup` before the deploy that ships the market: on a database
   without the column, battle wins, coin pouches, survey claims and market trades
   return 503 "The world map isn't ready yet." until it does.
2. After the owner's confirmation, apply the schema to the target database before
   switching traffic to the new handlers. Without those tables the world returns
   an unavailable state while the Hub, Box, and Pokédex remain usable.
3. Choose and record one immutable `ROUTE_ACTIONS_CUTOVER_AT` value in epoch
   milliseconds. Configure the same value on every deployment that serves this
   database. It bounds old training rewards; never substitute the request time or
   change it on later releases. Disable legacy gameplay writers when switching
   traffic, including older deployments that still share the production database.
4. First activation settles an account's open legacy activity and initializes its
   12 actions and 20 Poké Balls atomically. Training only pays through the cutoff;
   expeditions pay their banked EXP without another checkpoint/clear. No bulk save
   rewrite or scheduled job is required. Missing cutoff configuration prevents a
   legacy transition rather than extending rewards.
5. Verify a fresh account, an account with an open old activity, an existing
   collection, a lost-response retry, and Bag/catch consumption on the preview.
   Use temporary file databases locally; do not overwrite `local.db`.
6. Do not restore old gameplay writers after accounts start using the new route
   flow: they would bypass the action bank and restart offline growth. Prefer a
   forward fix, or a maintenance response for world mutations while correcting
   the new handlers. Keep all additive tables and historical records intact.

### Historical schema checklist

Before running `npm run db:setup` against the production database:

1. Confirm no account has more than one open idle session, since the unique
   index below can't be created while duplicates exist. Count the open sessions
   per user, e.g. in the Turso shell:

   ```sql
   select user_id, count(*) from idle_sessions where claimed_at is null
   group by user_id having count(*) > 1;
   ```

   The result must be empty. Claim or close any duplicates first.
2. Know what `db:setup` changes, all idempotent and safe to re-run: the
   `nickname` column on `owned_pokemon`; the `stats` column on `owned_pokemon`
   (each Pokémon's six current stats; rows without it read as an average
   individual); the `party` column on `profiles`; the
   activity columns on `idle_sessions` (`mode`, `rules_version`,
   `party_snapshot`, `config`, `state`, `step`, `request_id`, `result`,
   `seen_at`); the tables `world_progress` and `world_discoveries`; and the
   partial unique index `idle_one_open_idx` (one open activity per user).
3. Run `db:setup` strictly BEFORE the deploy that ships the growth system:
   until it runs, onboarding a new player fails (the starter insert writes
   `stats`). Run it before (or together with) the deploy that ships the world
   map. Until it runs, `/api/world/*` answers 503 "The world map isn't ready
   yet." while the hub, box and Pokédex keep working. Open idle sessions left
   from the paused idle routes show up as training on their route and settle
   under the new rules.
