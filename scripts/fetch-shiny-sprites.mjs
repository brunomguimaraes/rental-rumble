// Downloads the *shiny* recolours of the PMD-style sprites & portraits we already
// bundle, from PMDCollab's SpriteCollab repo. In SpriteCollab a species' shiny
// variant lives one level deeper under the form-0 "0000/0001" subgroup:
//
//   normal sprite sheet   : sprite/<pad>/<Sheet>-Anim.png
//   shiny  sprite sheet   : sprite/<pad>/0000/0001/<Sheet>-Anim.png
//   normal portrait       : portrait/<pad>/<Emotion>.png
//   shiny  portrait       : portrait/<pad>/0000/0001/<Emotion>.png
//
// The shiny variant shares the *exact* animation geometry/timing of the base
// form (same AnimData), so we don't re-emit a geometry manifest — the runtime
// reuses PMD_SPRITES (from fetch-battle-sprites.mjs). We only need to know which
// species actually have a shiny contributed, and which emotions exist. We use
// what's already on disk as the source of truth for what to attempt: for every
// base-form sheet/portrait we ship, we try its shiny twin and keep what 200s.
//
//   Output:   public/sprites/pmd-shiny/<id>/<Sheet>-Anim.png
//             public/sprites/portrait-shiny/<id>/<Emotion>.png
//   Manifest: src/game/shiny.gen.ts  (which dex ids have shiny sprites/portraits)
//
// Run: node scripts/fetch-shiny-sprites.mjs              (full download)
//      node scripts/fetch-shiny-sprites.mjs --resume     (skip files already saved)
//      node scripts/fetch-shiny-sprites.mjs --manifest-only  (rebuild manifest from disk)
//      node scripts/fetch-shiny-sprites.mjs --ids=1,4,6  (only these dex ids)
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
const pmdShinyDir = join(root, 'public/sprites/pmd-shiny');
const portraitShinyDir = join(root, 'public/sprites/portrait-shiny');
const manifestPath = join(root, 'src/game/shiny.gen.ts');

const BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
// The form-0 shiny subgroup. Everything below it mirrors the base-form layout.
const SHINY = '0000/0001';
const CONCURRENCY = 24;

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

// List the dex-id subdirectories of a base-form sprite/portrait folder.
function dexDirs(base) {
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && Number.isInteger(Number(d.name)))
    .map((d) => Number(d.name))
    .filter((id) => !ONLY_IDS || ONLY_IDS.has(id))
    .sort((a, b) => a - b);
}

if (!MANIFEST_ONLY) {
  // Build the work list straight from disk: each base-form file we ship gets a
  // shiny twin attempted at the same relative path under 0000/0001.
  const spriteTasks = [];
  for (const id of dexDirs(pmdDir)) {
    const sheets = readdirSync(join(pmdDir, String(id))).filter((f) =>
      f.endsWith('-Anim.png'),
    );
    for (const file of sheets) {
      spriteTasks.push({
        kind: 'sprite',
        id,
        url: `${BASE}/sprite/${pad(id)}/${SHINY}/${file}`,
        out: join(pmdShinyDir, String(id), file),
      });
    }
  }

  const portraitTasks = [];
  for (const id of dexDirs(portraitDir)) {
    const files = readdirSync(join(portraitDir, String(id))).filter(
      (f) => f.endsWith('.png') && !f.includes('^'),
    );
    for (const file of files) {
      portraitTasks.push({
        kind: 'portrait',
        id,
        url: `${BASE}/portrait/${pad(id)}/${SHINY}/${encodeURIComponent(file)}`,
        out: join(portraitShinyDir, String(id), file),
      });
    }
  }

  const tasks = [...spriteTasks, ...portraitTasks];
  console.log(
    `Attempting ${spriteTasks.length} shiny sheets + ${portraitTasks.length} shiny portraits ` +
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
          `  … ${done}/${tasks.length} (${ok} ok, ${missing} no-shiny, ${failed} failed)`,
        );
    }
  }

  const queue = [...tasks].reverse();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log(
    `\nshiny: ${ok} files saved, ${missing} not-contributed, ${failed} failed`,
  );
  if (failedList.length) {
    console.log('failures (first 40):');
    console.log('  ' + failedList.slice(0, 40).join('\n  '));
  }
}

// --- build the manifest from disk -----------------------------------------
//
// A species counts as having a shiny *sprite* only when every base-form sheet it
// ships also exists in shiny form — otherwise the battle animator could fall
// through to a sheet that's missing for shiny and flash a blank frame. Shiny
// *portraits* are tracked per-emotion so the card can pick one that exists.

const spriteIds = [];
for (const id of dexDirs(pmdDir)) {
  const baseSheets = readdirSync(join(pmdDir, String(id))).filter((f) =>
    f.endsWith('-Anim.png'),
  );
  const shinyIdDir = join(pmdShinyDir, String(id));
  if (baseSheets.length === 0 || !existsSync(shinyIdDir)) continue;
  const haveAll = baseSheets.every((f) => existsSync(join(shinyIdDir, f)));
  if (haveAll) spriteIds.push(id);
}

const portraitsById = {};
if (existsSync(portraitShinyDir)) {
  for (const name of readdirSync(portraitShinyDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const id = Number(name.name);
    if (!Number.isInteger(id)) continue;
    const emotions = readdirSync(join(portraitShinyDir, name.name))
      .filter((f) => f.endsWith('.png') && !f.includes('^'))
      .map((f) => f.slice(0, -4))
      .sort();
    if (emotions.length) portraitsById[id] = emotions;
  }
}

writeManifest(spriteIds.sort((a, b) => a - b), portraitsById);

const portraitCount = Object.keys(portraitsById).length;
console.log(
  `Manifest: ${spriteIds.length} species with shiny sprites, ${portraitCount} with shiny portraits ` +
    `→ ${manifestPath.replace(root + '/', '')}`,
);

function writeManifest(ids, portraits) {
  const portraitLines = Object.entries(portraits)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(
      ([id, emotions]) =>
        `  ${id}: [${emotions.map((e) => JSON.stringify(e)).join(', ')}],`,
    );
  const body = `// AUTO-GENERATED by scripts/fetch-shiny-sprites.mjs — do not edit by hand.
// Which National Dex ids have a shiny recolour bundled (from PMDCollab's
// SpriteCollab). Shiny sprites share the base form's animation geometry, so they
// reuse PMD_SPRITES (see pmdSprites.gen.ts) for timing — only their existence is
// tracked here. Files live at:
//   public/sprites/pmd-shiny/<id>/<Sheet>-Anim.png   (battle animation)
//   public/sprites/portrait-shiny/<id>/<Emotion>.png (card portrait)

/** Dex ids whose full set of battle animation sheets exists in shiny form. */
export const SHINY_SPRITE_IDS: ReadonlySet<number> = new Set([
${chunk(ids)}
]);

/** Dex id -> shiny emotion portraits available (mirrors the base-form set). */
export const SHINY_PORTRAITS: Record<number, string[]> = {
${portraitLines.join('\n')}
};
`;
  writeFileSync(manifestPath, body);
}

// Pretty-print a number array as wrapped, indented rows.
function chunk(ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 16) {
    rows.push('  ' + ids.slice(i, i + 16).join(', ') + ',');
  }
  return rows.join('\n');
}
