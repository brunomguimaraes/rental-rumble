// Downloads the non-commercial, fan-made PMD-style *animated* sprite sheets from
// PMDCollab's SpriteCollab repo (the same project we get the portraits from).
// Each species ships an AnimData.xml plus a set of animation sheets
// (Idle, Walk, Attack, Hurt, Sleep, …). A sheet is a grid: one column per
// animation frame and one row per facing direction (8 dirs, in the standard
// order Down, Down-Right, Right, Up-Right, Up, Up-Left, Left, Down-Left).
//
// We grab a curated set of anims for the base form (form=0) so the battle UI
// can animate Pokémon (idle bob, attack lunge, hurt flinch, faint), and emit:
//
//   Sheets:    public/sprites/pmd/<id>/<Anim>-Anim.png  (+ AnimData.xml)
//   Manifest:  src/game/pmdSprites.gen.ts   (per-species anim geometry/timing)
//   Credits:   src/game/spriteCredits.gen.ts (artist attribution, CC BY-NC 4.0)
//
// Like fetch-portraits.mjs, the manifest is rebuilt from what actually landed on
// disk (the reliable source of truth): we re-parse the saved AnimData.xml and
// read each PNG's header for its real dimensions.
//
// Run: node scripts/fetch-battle-sprites.mjs              (full download)
//      node scripts/fetch-battle-sprites.mjs --resume     (skip files already saved)
//      node scripts/fetch-battle-sprites.mjs --manifest-only       (rebuild manifests from disk)
//      node scripts/fetch-battle-sprites.mjs --ids=1,4,6  (only these dex ids; great for testing)
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/sprites/pmd');
const manifestPath = join(root, 'src/game/pmdSprites.gen.ts');
const creditsPath = join(root, 'src/game/spriteCredits.gen.ts');

const BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const SPRITE = `${BASE}/sprite`;
const TRACKER = `${BASE}/tracker.json`;
const CREDIT_NAMES = `${BASE}/credit_names.txt`;
const COUNT = 1025;
const CONCURRENCY = 16;

// The animations we care about for battle. Keep this lean — every extra anim is
// another sheet per species to download and ship. Runtime fallbacks (see
// src/game/pmd.ts) only ever reference anims in this set.
//
// Beyond the base states (Idle/Walk/Hurt/Sleep) we grab the family of attack
// anims so a move can play a fitting motion: Strike (melee contact), Shoot
// (projectile/beam), SpAttack (special burst), Swing (heavy slam) and Charge
// (status/heal wind-up). Attack stays the universal fallback. CopyOf aliases
// (e.g. SpAttack -> Shoot) are resolved at download time, so duplicates collapse
// to a single sheet on disk.
const WANTED = [
  'Idle',
  'Walk',
  'Attack',
  'Strike',
  'Shoot',
  'SpAttack',
  'Swing',
  'Charge',
  'Hurt',
  'Sleep',
];

const SKIP_EXISTING = process.argv.includes('--resume');
const MANIFEST_ONLY = process.argv.includes('--manifest-only');
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const ONLY_IDS = idsArg
  ? new Set(idsArg.slice('--ids='.length).split(',').map(Number))
  : null;

const pad = (id) => String(id).padStart(4, '0');

// --- tiny helpers ---------------------------------------------------------

// Read width/height from a PNG's IHDR (big-endian uint32 at byte 16 and 20).
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Parse AnimData.xml into { Name -> { copyOf? , fw, fh, durs[] } }. The format
// is simple and consistent, so a regex pass is enough (no XML dep needed).
function parseAnimData(xml) {
  const anims = {};
  for (const m of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
    const block = m[1];
    const name = block.match(/<Name>([^<]+)<\/Name>/)?.[1];
    if (!name) continue;
    const copyOf = block.match(/<CopyOf>([^<]+)<\/CopyOf>/)?.[1];
    if (copyOf) {
      anims[name] = { copyOf };
      continue;
    }
    const fw = Number(block.match(/<FrameWidth>(\d+)<\/FrameWidth>/)?.[1]);
    const fh = Number(block.match(/<FrameHeight>(\d+)<\/FrameHeight>/)?.[1]);
    const durs = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((d) =>
      Number(d[1]),
    );
    if (!fw || !fh || durs.length === 0) continue;
    anims[name] = { fw, fh, durs };
  }
  return anims;
}

// Resolve a (possibly CopyOf) anim to the concrete sheet name + geometry.
function resolveAnim(anims, name, seen = new Set()) {
  const a = anims[name];
  if (!a || seen.has(name)) return null;
  if (a.copyOf) {
    seen.add(name);
    return resolveAnim(anims, a.copyOf, seen);
  }
  return { sheet: name, fw: a.fw, fh: a.fh, durs: a.durs };
}

async function fetchBuf(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchText(url) {
  const buf = await fetchBuf(url);
  return buf ? buf.toString('utf8') : null;
}

// --- download -------------------------------------------------------------

if (!MANIFEST_ONLY) {
  console.log('Downloading PMD battle sprite sheets …');
  const ids = [];
  for (let id = 1; id <= COUNT; id++) {
    if (ONLY_IDS && !ONLY_IDS.has(id)) continue;
    ids.push(id);
  }

  let withSprites = 0;
  let noSprites = 0;
  let sheets = 0;
  let failed = 0;
  let done = 0;
  const failedList = [];

  async function fetchOne(id) {
    const dir = join(outDir, String(id));
    const xmlOut = join(dir, 'AnimData.xml');
    try {
      // AnimData.xml is the gate: 404 means no sprite contributed yet.
      let xml;
      if (SKIP_EXISTING && existsSync(xmlOut)) {
        xml = readFileSync(xmlOut, 'utf8');
      } else {
        xml = await fetchText(`${SPRITE}/${pad(id)}/AnimData.xml`);
        if (xml === null) {
          noSprites++;
          return;
        }
        mkdirSync(dir, { recursive: true });
        writeFileSync(xmlOut, xml);
      }
      withSprites++;

      const anims = parseAnimData(xml);
      const sheetNames = new Set();
      for (const want of WANTED) {
        const r = resolveAnim(anims, want);
        if (r) sheetNames.add(r.sheet);
      }
      for (const sheet of sheetNames) {
        const out = join(dir, `${sheet}-Anim.png`);
        if (SKIP_EXISTING && existsSync(out)) {
          sheets++;
          continue;
        }
        const buf = await fetchBuf(`${SPRITE}/${pad(id)}/${sheet}-Anim.png`);
        if (buf) {
          writeFileSync(out, buf);
          sheets++;
        }
      }
    } catch (err) {
      failed++;
      failedList.push(`${id}: ${err.message}`);
    }
  }

  async function worker(queue) {
    let id;
    while ((id = queue.pop()) !== undefined) {
      await fetchOne(id);
      if (++done % 100 === 0)
        console.log(
          `  … ${done}/${ids.length} (${withSprites} with sprites, ${sheets} sheets, ${failed} failed)`,
        );
    }
  }

  const queue = [...ids].reverse();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log(
    `\nsprites: ${withSprites} species, ${sheets} sheets saved, ${noSprites} not-yet-contributed, ${failed} failed`,
  );
  if (failedList.length) {
    console.log('failures (first 40):');
    console.log('  ' + failedList.slice(0, 40).join('\n  '));
  }
}

// --- build the anim manifest from disk ------------------------------------

const entries = {};
if (existsSync(outDir)) {
  for (const name of readdirSync(outDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const id = Number(name.name);
    if (!Number.isInteger(id)) continue;
    const dir = join(outDir, name.name);
    const xmlPath = join(dir, 'AnimData.xml');
    if (!existsSync(xmlPath)) continue;
    const anims = parseAnimData(readFileSync(xmlPath, 'utf8'));

    const resolved = {};
    for (const want of WANTED) {
      const r = resolveAnim(anims, want);
      if (!r) continue;
      const sheetPath = join(dir, `${r.sheet}-Anim.png`);
      if (!existsSync(sheetPath)) continue;
      const { w, h } = pngSize(readFileSync(sheetPath));
      const frames = Math.max(1, Math.round(w / r.fw));
      const rows = Math.max(1, Math.round(h / r.fh));
      resolved[want] = {
        sheet: r.sheet,
        fw: r.fw,
        fh: r.fh,
        frames,
        rows,
        durs: r.durs.slice(0, frames),
      };
    }
    if (Object.keys(resolved).length) entries[id] = resolved;
  }
}

writeAnimManifest(entries);
const speciesCount = Object.keys(entries).length;
console.log(
  `Anim manifest: ${speciesCount}/${COUNT} species → ${manifestPath.replace(root + '/', '')}`,
);

// --- build the credits manifest -------------------------------------------

await writeCredits(Object.keys(entries).map(Number));

// --- writers --------------------------------------------------------------

function writeAnimManifest(byId) {
  const lines = Object.entries(byId)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([id, anims]) => {
      const inner = Object.entries(anims)
        .map(
          ([key, a]) =>
            `${JSON.stringify(key)}: { sheet: ${JSON.stringify(a.sheet)}, fw: ${a.fw}, fh: ${a.fh}, frames: ${a.frames}, rows: ${a.rows}, durs: [${a.durs.join(', ')}] }`,
        )
        .join(', ');
      return `  ${id}: { ${inner} },`;
    });
  const body = `// AUTO-GENERATED by scripts/fetch-battle-sprites.mjs — do not edit by hand.
// Maps National Dex id -> the PMD-style battle animations available for that
// species (base form). Sheets live at public/sprites/pmd/<id>/<sheet>-Anim.png;
// each sheet is a grid of \`frames\` columns x \`rows\` direction rows, with
// per-frame \`durs\` (in PMD duration units). See src/components/PmdSprite.tsx.
export interface PmdAnim {
  /** Animation whose <sheet>-Anim.png file to load (CopyOf already resolved). */
  sheet: string;
  /** Source frame width / height in pixels. */
  fw: number;
  fh: number;
  /** Number of animation frames (columns) and direction rows. */
  frames: number;
  rows: number;
  /** Per-frame durations in PMD duration units. */
  durs: number[];
}

export type PmdEntry = Record<string, PmdAnim>;

export const PMD_SPRITES: Record<number, PmdEntry> = {
${lines.join('\n')}
};
`;
  writeFileSync(manifestPath, body);
}

async function writeCredits(ids) {
  // Map Discord tag (or bare name) -> display name + contact.
  const nameByKey = new Map();
  const namesTxt = await fetchText(CREDIT_NAMES);
  if (namesTxt) {
    for (const line of namesTxt.split('\n').slice(1)) {
      const [name, discord, contact] = line.split('\t');
      if (!discord) continue;
      nameByKey.set(discord.trim(), {
        name: (name || discord).trim(),
        contact: (contact || '').trim(),
      });
    }
  }

  const tracker = (await fetchText(TRACKER).then((t) => (t ? JSON.parse(t) : null))) ?? {};

  // Aggregate: artist key -> set of dex ids they helped sprite.
  const byArtist = new Map();
  for (const id of ids) {
    const credit = tracker[pad(id)]?.sprite_credit;
    if (!credit) continue;
    const keys = [credit.primary, ...(credit.secondary ?? [])].filter(Boolean);
    for (const key of keys) {
      if (!byArtist.has(key)) byArtist.set(key, new Set());
      byArtist.get(key).add(id);
    }
  }

  const list = [...byArtist.entries()]
    .map(([key, set]) => {
      const resolved = nameByKey.get(key);
      return {
        name: resolved?.name ?? key,
        contact: resolved?.contact ?? '',
        count: set.size,
      };
    })
    // Drop unresolved raw discord-id blobs with no display name, sort by
    // contributions then name.
    .filter((a) => a.name && !/^<@!?\d+>$/.test(a.name))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const rows = list
    .map(
      (a) =>
        `  { name: ${JSON.stringify(a.name)}, contact: ${JSON.stringify(a.contact)}, count: ${a.count} },`,
    )
    .join('\n');

  const body = `// AUTO-GENERATED by scripts/fetch-battle-sprites.mjs — do not edit by hand.
// Attribution for the fan-made PMD-style sprites we bundle, from PMDCollab's
// SpriteCollab project. Sprites are licensed CC BY-NC 4.0 — non-commercial use
// with attribution. \`count\` is how many species each artist helped sprite.
export interface SpriteCredit {
  name: string;
  contact: string;
  count: number;
}

export const SPRITE_CREDIT_SOURCE = {
  project: 'PMDCollab / SpriteCollab',
  site: 'https://sprites.pmdcollab.org/',
  repo: 'https://github.com/PMDCollab/SpriteCollab',
  license: 'CC BY-NC 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
};

export const SPRITE_CREDITS: SpriteCredit[] = [
${rows}
];
`;
  writeFileSync(creditsPath, body);
  console.log(
    `Credits: ${list.length} artists → ${creditsPath.replace(root + '/', '')}`,
  );
}
