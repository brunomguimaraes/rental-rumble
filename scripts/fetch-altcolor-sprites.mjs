// Downloads the *alternate colour* recolours from PMDCollab's SpriteCollab — the
// fan-made "Altcolor" / "Alternate" base-form palettes some species ship beyond
// the canonical shiny. These are purely cosmetic: a different-looking colour of
// the very same Pokémon (no stat or card change), surfaced as a rare draft flavour.
//
// In SpriteCollab each form is a numbered subgroup under the dex id, with its
// files at sprite/<pad>/<form>/<Sheet>-Anim.png and portrait/<pad>/<form>/<Emotion>.png
// (the base form's *normal* colour is flattened to the root instead). We read
// tracker.json to find each species' base recolour form — preferring "Altcolor",
// then "Alternate"/"Alternate2" — and pull exactly one alt palette per species,
// keeping the runtime as simple as the shiny set (one variant, no form keys).
//
// Like the shiny fetcher, an alt colour reuses the base form's animation geometry
// (PMD_SPRITES), so we only record which species actually have one. We attempt
// the same sheets/emotions we already ship for the base form and keep what 200s.
//
//   Output:   public/sprites/pmd-alt/<id>/<Sheet>-Anim.png       (battle animation)
//             public/sprites/portrait-alt/<id>/<Emotion>.png     (card portrait)
//   Manifest: src/game/altcolor.gen.ts  (which dex ids have an alt colour)
//
// Run: node scripts/fetch-altcolor-sprites.mjs            (full download)
//      node scripts/fetch-altcolor-sprites.mjs --resume   (skip files already saved)
//      node scripts/fetch-altcolor-sprites.mjs --manifest-only  (rebuild from disk)
//      node scripts/fetch-altcolor-sprites.mjs --ids=6,386      (only these dex ids)
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pmdDir = join(root, 'public/sprites/pmd');
const portraitDir = join(root, 'public/sprites/portrait');
const pmdAltDir = join(root, 'public/sprites/pmd-alt');
const portraitAltDir = join(root, 'public/sprites/portrait-alt');
const manifestPath = join(root, 'src/game/altcolor.gen.ts');

const BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const TRACKER = `${BASE}/tracker.json`;
const CONCURRENCY = 24;
// Form names (case-insensitive) that mean "same base Pokémon, different palette".
// Ordered by preference, so a species with several keeps the most canonical one.
const ALT_NAMES = ['altcolor', 'alternate', 'alternate2'];

const SKIP_EXISTING = process.argv.includes('--resume');
const MANIFEST_ONLY = process.argv.includes('--manifest-only');
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const ONLY_IDS = idsArg
  ? new Set(idsArg.slice('--ids='.length).split(',').map(Number))
  : null;

const pad = (id) => String(id).padStart(4, '0');

async function fetchBuf(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Pick the preferred base-recolour form key for a species from its tracker node,
// or null when it has none. Only top-level (base-form) subgroups are considered,
// so Mega/regional/costume recolours never sneak in.
function altFormKey(node) {
  const sub = node?.subgroups ?? {};
  let best = null;
  let bestRank = Infinity;
  for (const [key, v] of Object.entries(sub)) {
    if (key === '0000') continue; // base form's normal palette lives at the root
    const name = (v?.name ?? '').trim().toLowerCase();
    const rank = ALT_NAMES.indexOf(name);
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
      best = key;
    }
  }
  return best;
}

// Dex-id subdirectories of a base-form folder (filtered by --ids).
function dexDirs(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && Number.isInteger(Number(d.name)))
    .map((d) => Number(d.name))
    .filter((id) => !ONLY_IDS || ONLY_IDS.has(id))
    .sort((a, b) => a - b);
}

if (!MANIFEST_ONLY) {
  console.log('Fetching tracker.json …');
  const trackerRes = await fetch(TRACKER);
  if (!trackerRes.ok) throw new Error(`tracker.json HTTP ${trackerRes.status}`);
  const tracker = await trackerRes.json();

  // Build the work list from disk: for every base sheet/portrait we ship, try
  // its twin in the species' chosen alt-colour form folder.
  const tasks = [];
  let withForm = 0;

  for (const id of dexDirs(pmdDir)) {
    const form = altFormKey(tracker[pad(id)]);
    if (!form) continue;
    withForm++;
    for (const file of readdirSync(join(pmdDir, String(id))).filter((f) =>
      f.endsWith('-Anim.png'),
    )) {
      tasks.push({
        kind: 'sprite',
        id,
        url: `${BASE}/sprite/${pad(id)}/${form}/${file}`,
        out: join(pmdAltDir, String(id), file),
      });
    }
  }

  for (const id of dexDirs(portraitDir)) {
    const form = altFormKey(tracker[pad(id)]);
    if (!form) continue;
    for (const file of readdirSync(join(portraitDir, String(id))).filter(
      (f) => f.endsWith('.png') && !f.includes('^'),
    )) {
      tasks.push({
        kind: 'portrait',
        id,
        url: `${BASE}/portrait/${pad(id)}/${form}/${encodeURIComponent(file)}`,
        out: join(portraitAltDir, String(id), file),
      });
    }
  }

  console.log(
    `${withForm} species have a base alt-colour form. Attempting ${tasks.length} files ` +
      `(concurrency ${CONCURRENCY}) …`,
  );

  let ok = 0;
  let missing = 0;
  let failed = 0;
  let done = 0;
  const failedList = [];

  async function fetchOne(task) {
    if (SKIP_EXISTING && existsSync(task.out)) {
      ok++;
      return;
    }
    try {
      const buf = await fetchBuf(task.url);
      if (buf === null) {
        missing++;
        return;
      }
      mkdirSync(dirname(task.out), { recursive: true });
      writeFileSync(task.out, buf);
      ok++;
    } catch (err) {
      failed++;
      failedList.push(`${task.kind} ${task.id}: ${err.message}`);
    }
  }

  async function worker(queue) {
    let task;
    while ((task = queue.pop()) !== undefined) {
      await fetchOne(task);
      if (++done % 500 === 0)
        console.log(
          `  … ${done}/${tasks.length} (${ok} ok, ${missing} missing, ${failed} failed)`,
        );
    }
  }

  const queue = [...tasks].reverse();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log(
    `\nalt-colour: ${ok} files saved, ${missing} not-present, ${failed} failed`,
  );
  if (failedList.length) {
    console.log('failures (first 40):');
    console.log('  ' + failedList.slice(0, 40).join('\n  '));
  }
}

// --- build the manifest from disk -----------------------------------------
//
// As with shiny, a species counts as having an alt-colour *sprite* only when its
// full base sheet set exists in alt form (else the animator could fall through
// to a missing sheet). Portraits are tracked per-emotion.

const spriteIds = [];
for (const id of dexDirs(pmdDir)) {
  const baseSheets = readdirSync(join(pmdDir, String(id))).filter((f) =>
    f.endsWith('-Anim.png'),
  );
  const altIdDir = join(pmdAltDir, String(id));
  if (baseSheets.length === 0 || !existsSync(altIdDir)) continue;
  if (baseSheets.every((f) => existsSync(join(altIdDir, f)))) spriteIds.push(id);
}

const portraitsById = {};
if (existsSync(portraitAltDir)) {
  for (const name of readdirSync(portraitAltDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const id = Number(name.name);
    if (!Number.isInteger(id)) continue;
    const emotions = readdirSync(join(portraitAltDir, name.name))
      .filter((f) => f.endsWith('.png') && !f.includes('^'))
      .map((f) => f.slice(0, -4))
      .sort();
    if (emotions.length) portraitsById[id] = emotions;
  }
}

writeManifest(spriteIds.sort((a, b) => a - b), portraitsById);

const portraitCount = Object.keys(portraitsById).length;
console.log(
  `Manifest: ${spriteIds.length} species with alt-colour sprites, ${portraitCount} with alt-colour portraits ` +
    `→ ${manifestPath.replace(root + '/', '')}`,
);

function writeManifest(ids, portraits) {
  const portraitLines = Object.entries(portraits)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(
      ([id, emotions]) =>
        `  ${id}: [${emotions.map((e) => JSON.stringify(e)).join(', ')}],`,
    );
  const body = `// AUTO-GENERATED by scripts/fetch-altcolor-sprites.mjs — do not edit by hand.
// Which National Dex ids have a fan-made *alternate colour* (non-shiny) recolour
// bundled, from PMDCollab's SpriteCollab. Purely cosmetic — same species, same
// stats, just a different palette. Alt colours reuse the base form's animation
// geometry (see pmdSprites.gen.ts), so only their existence is tracked. Files:
//   public/sprites/pmd-alt/<id>/<Sheet>-Anim.png   (battle animation)
//   public/sprites/portrait-alt/<id>/<Emotion>.png (card portrait)

/** Dex ids whose full set of battle animation sheets exists in alt colour. */
export const ALT_COLOR_SPRITE_IDS: ReadonlySet<number> = new Set([
${chunk(ids)}
]);

/** Dex id -> alt-colour emotion portraits available (mirrors the base-form set). */
export const ALT_COLOR_PORTRAITS: Record<number, string[]> = {
${portraitLines.join('\n')}
};
`;
  writeFileSync(manifestPath, body);
}

function chunk(ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 16) {
    rows.push('  ' + ids.slice(i, i + 16).join(', ') + ',');
  }
  return rows.join('\n');
}
