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
