// Release driver for Rental Rumble — promotes `development` to `main` as a
// tagged, documented SemVer release, then publishes a GitHub Release. Run from a
// clean `development`:
//
//   npm run release [patch|minor|major|X.Y.Z]   # default: patch
//   npm run release:dry [type]                   # rehearse, then revert
//
// Flags:
//   --dry-run     do everything up to the confirm, then revert — no commit/push
//   --skip-gates  skip lint/test/build (handy for changelog dry-runs)
//
// What it does, aborting loudly on any failure:
//   1. Preconditions — on `development`, clean tree, not behind origin.
//   2. Gates — npm run lint && npm test && npm run build.
//   3. Bump — npm version <type> --no-git-tag-version.
//   4. CHANGELOG — stamp [Unreleased] as the new version (seed from git log if
//      it's empty), open a fresh [Unreleased], refresh the compare links.
//   5. Confirm — show the diff + notes before doing anything irreversible.
//   6. Commit `Release vX.Y.Z`, tag, push development, fast-forward main, push tag.
//   7. Create the GitHub Release from the changelog section.
//
// Promotion is branchless: it never checks out `main`, so a running dev server /
// working tree is never disturbed. Zero dependencies — Node built-ins only.
import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const REPO = 'https://github.com/brunomguimaraes/rental-rumble'
const DEV_BRANCH = 'development'
const PROD_BRANCH = 'main'
const CHANGELOG = 'CHANGELOG.md'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipGates = args.includes('--skip-gates')
const bump = args.find((a) => !a.startsWith('-')) ?? 'patch'

if (!/^(patch|minor|major)$|^\d+\.\d+\.\d+$/.test(bump)) {
  fail(`Invalid version argument "${bump}". Use patch | minor | major | X.Y.Z.`)
}

// ---- helpers ---------------------------------------------------------------
function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}
function git(...a) {
  return execFileSync('git', a, { encoding: 'utf8' }).trim()
}
function gitTry(...a) {
  try {
    return git(...a)
  } catch {
    return null
  }
}
function gate(cmd) {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}
function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(q, (a) => (rl.close(), res(a.trim()))))
}
const today = () => new Date().toISOString().slice(0, 10)
const pkgVersion = () => JSON.parse(readFileSync('package.json', 'utf8')).version

// ---- changelog -------------------------------------------------------------
// Move the [Unreleased] body into a dated version section, open a fresh empty
// [Unreleased], and regenerate the compare/tag link references at the bottom.
// Returns the release-notes body (used for the GitHub Release).
function updateChangelog(version, date) {
  // Drop existing link-reference definitions; we regenerate them at the end.
  let content =
    readFileSync(CHANGELOG, 'utf8').replace(/^\[[^\]]+\]:\s+http\S*.*$/gm, '').replace(/\s+$/, '') + '\n'

  const HEAD = '## [Unreleased]'
  const i = content.indexOf(HEAD)
  if (i < 0) fail(`No "${HEAD}" heading in ${CHANGELOG}.`)
  const afterHead = i + HEAD.length
  const next = content.indexOf('\n## ', afterHead)
  let body = content.slice(afterHead, next < 0 ? undefined : next).trim()

  // If nobody jotted anything under Unreleased, seed it from the commit log so
  // the release isn't silently undocumented.
  if (!/^[-*] /m.test(body)) {
    const prevTag = gitTry('describe', '--tags', '--abbrev=0')
    const range = prevTag ? `${prevTag}..HEAD` : 'HEAD'
    const log = gitTry('log', range, '--no-merges', '--pretty=format:- %s')
    body = (log && log.trim()) || '- _No changes recorded._'
    console.log(`\nℹ Unreleased was empty — seeded ${body.split('\n').length} entr(ies) from git log.`)
  }

  const preamble = content.slice(0, i).trimEnd()
  const rest = next < 0 ? '' : content.slice(next).trim()

  let out = `${preamble}\n\n## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n`
  if (rest) out += `\n${rest}\n`

  const versions = [...out.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1])
  const links = [`[Unreleased]: ${REPO}/compare/v${versions[0]}...HEAD`]
  versions.forEach((v, idx) => {
    const prev = versions[idx + 1]
    links.push(prev ? `[${v}]: ${REPO}/compare/v${prev}...v${v}` : `[${v}]: ${REPO}/releases/tag/v${v}`)
  })
  out = `${out.trimEnd()}\n\n${links.join('\n')}\n`

  writeFileSync(CHANGELOG, out)
  return body
}

// ---- main ------------------------------------------------------------------
async function main() {
  // 1. Preconditions
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  if (branch !== DEV_BRANCH) fail(`Releases are cut from "${DEV_BRANCH}", but you're on "${branch}".`)
  if (git('status', '--porcelain')) fail('Working tree is dirty — commit or stash first.')

  console.log('▶ git fetch origin --tags')
  execSync('git fetch origin --tags', { stdio: 'inherit' })
  if (gitTry('rev-parse', '--verify', `origin/${DEV_BRANCH}`)) {
    const behind = git('rev-list', '--count', `${DEV_BRANCH}..origin/${DEV_BRANCH}`)
    if (behind !== '0') fail(`Local "${DEV_BRANCH}" is ${behind} commit(s) behind origin — pull first.`)
  }

  // 2. Gates
  if (skipGates) console.log('\n⚠ Skipping gates (--skip-gates).')
  else {
    gate('npm run lint')
    gate('npm test')
    gate('npm run build')
  }

  // 3. Bump
  const prev = pkgVersion()
  execSync(`npm version ${bump} --no-git-tag-version`, { stdio: 'inherit' })
  const version = pkgVersion()
  console.log(`\n  ${prev} → ${version}`)

  // 4. Changelog
  const notes = updateChangelog(version, today())

  // 5. Confirm (this is the edit window — abort, hand-edit CHANGELOG, re-run)
  console.log('\n──────── staged for release ────────')
  console.log(git('--no-pager', 'diff', '--stat'))
  console.log('\n──────── release notes ─────────────')
  console.log(notes)
  console.log('────────────────────────────────────')

  const revert = () => execSync(`git checkout -- package.json package-lock.json ${CHANGELOG}`)

  if (dryRun) {
    revert()
    console.log('\n✓ Dry run complete — working tree reverted. Nothing committed or pushed.')
    return
  }
  if (!/^y(es)?$/i.test(await ask(`\nProceed with release v${version}? (y/N) `))) {
    revert()
    fail('Aborted — working tree reverted.')
  }

  // 6. Commit + tag
  const tag = `v${version}`
  git('commit', '-am', `Release ${tag}`)
  git('tag', tag)

  // 7. Push + promote main (fast-forward; fails loudly if main has diverged)
  console.log('\n▶ pushing…')
  execSync(`git push origin ${DEV_BRANCH}`, { stdio: 'inherit' })
  execSync(`git push origin ${DEV_BRANCH}:${PROD_BRANCH}`, { stdio: 'inherit' })
  execSync(`git push origin ${tag}`, { stdio: 'inherit' })
  git('branch', '-f', PROD_BRANCH, 'HEAD') // keep local main in sync

  // 8. GitHub Release (recoverable — the tag is already pushed)
  try {
    execFileSync('gh', ['release', 'create', tag, '--target', PROD_BRANCH, '--title', tag, '--notes', notes], {
      stdio: 'inherit',
    })
  } catch {
    console.error(
      `\n⚠ Tag ${tag} pushed, but "gh release create" failed. Re-run e.g.:\n` +
        `  gh release create ${tag} --target ${PROD_BRANCH} --title ${tag} --notes "see CHANGELOG.md"`,
    )
  }

  console.log(`\n✓ Released ${tag}. main → production (Vercel); GitHub Release published.`)
}

export { updateChangelog }

// Run only when invoked directly, so the helpers can be imported for testing.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => fail(e?.message || String(e)))
}
