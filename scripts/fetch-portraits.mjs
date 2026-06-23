// Downloads the non-commercial, fan-made PMD-style portraits from PMDCollab's
// SpriteCollab repo. Unlike a single mugshot per Pokémon, each species ships a
// set of emotion portraits (Normal, Happy, Sad, Angry, Inspired, ...). We grab
// every emotion for the base form (form=0) so the app can pick a random one per
// rolled Pokémon, and emit a manifest the game reads at runtime.
//
//   Output:   public/sprites/portrait/<id>/<Emotion>.png
//   Manifest: src/game/portraits.gen.ts  (dex id -> available emotions)
//
// The repo's tracker.json lists the *intended* emotions per species, but for
// some Pokémon those files don't actually exist at the base form yet, so we
// treat the download (HTTP 200) as the source of truth and build the manifest
// from what really landed on disk. Horizontally-flipped "^" variants are
// skipped — we only want forward-facing portraits.
//
// Run: node scripts/fetch-portraits.mjs            (full download)
//      node scripts/fetch-portraits.mjs --resume   (skip files already saved)
//      node scripts/fetch-portraits.mjs --manifest-only  (rebuild manifest from disk)
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/sprites/portrait');
const manifestPath = join(root, 'src/game/portraits.gen.ts');

const RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait';
const TRACKER = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json';
const COUNT = 1025;
const CONCURRENCY = 32;
const SKIP_EXISTING = process.argv.includes('--resume');
const MANIFEST_ONLY = process.argv.includes('--manifest-only');

const pad = (id) => String(id).padStart(4, '0');

if (!MANIFEST_ONLY) {
  console.log('Fetching tracker.json …');
  const trackerRes = await fetch(TRACKER);
  if (!trackerRes.ok) throw new Error(`tracker.json HTTP ${trackerRes.status}`);
  const tracker = await trackerRes.json();

  // Candidate emotions to attempt per species (base form, no flipped "^").
  const tasks = [];
  for (let id = 1; id <= COUNT; id++) {
    const files = tracker[pad(id)]?.portrait_files;
    if (!files) continue;
    for (const emotion of Object.keys(files)) {
      if (emotion.includes('^')) continue;
      tasks.push({ id, emotion });
    }
  }
  console.log(`Attempting ${tasks.length} portrait downloads (concurrency ${CONCURRENCY}) …`);

  let ok = 0;
  let missing = 0;
  let failed = 0;
  let done = 0;
  const failedList = [];

  async function fetchOne({ id, emotion }) {
    const dir = join(outDir, String(id));
    const out = join(dir, `${emotion}.png`);
    if (SKIP_EXISTING && existsSync(out)) {
      ok++;
      return;
    }
    const url = `${RAW}/${pad(id)}/${encodeURIComponent(emotion)}.png`;
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        // tracker lists an emotion that isn't actually contributed yet — fine.
        missing++;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      ok++;
    } catch (err) {
      failed++;
      failedList.push(`${id}/${emotion}: ${err.message}`);
    }
  }

  async function worker(queue) {
    let task;
    while ((task = queue.pop()) !== undefined) {
      await fetchOne(task);
      if (++done % 500 === 0)
        console.log(`  … ${done}/${tasks.length} (${ok} ok, ${missing} missing, ${failed} failed)`);
    }
  }

  const queue = [...tasks].reverse();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log(`\nportraits: ${ok} saved, ${missing} not-yet-contributed, ${failed} failed`);
  if (failedList.length) {
    console.log('failures (first 40):');
    console.log('  ' + failedList.slice(0, 40).join('\n  '));
  }
}

// Build the manifest from what's actually on disk — the reliable source of
// truth. Each species folder contains <Emotion>.png files; flipped "^" variants
// are ignored.
const emotionsById = {};
if (existsSync(outDir)) {
  for (const name of readdirSync(outDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const id = Number(name.name);
    if (!Number.isInteger(id)) continue;
    const emotions = readdirSync(join(outDir, name.name))
      .filter((f) => f.endsWith('.png') && !f.includes('^'))
      .map((f) => f.slice(0, -4))
      .sort();
    if (emotions.length) emotionsById[id] = emotions;
  }
}

writeManifest(emotionsById);

const speciesCount = Object.keys(emotionsById).length;
const emotionCount = Object.values(emotionsById).reduce((n, e) => n + e.length, 0);
console.log(
  `Manifest: ${speciesCount}/${COUNT} species, ${emotionCount} emotion portraits → ${manifestPath.replace(root + '/', '')}`,
);

function writeManifest(byId) {
  const lines = Object.entries(byId)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([id, emotions]) => `  ${id}: [${emotions.map((e) => JSON.stringify(e)).join(', ')}],`);
  const body = `// AUTO-GENERATED by scripts/fetch-portraits.mjs — do not edit by hand.
// Maps National Dex id -> the PMD-style emotion portraits available for that
// species (base form). Files live at public/sprites/portrait/<id>/<Emotion>.png.
export const PORTRAIT_EMOTIONS: Record<number, string[]> = {
${lines.join('\n')}
};
`;
  writeFileSync(manifestPath, body);
}
