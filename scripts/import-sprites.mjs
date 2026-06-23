// Copies battle/icon sprites from a local Pokémon Essentials "Generation 9 Pack"
// into public/sprites, renamed by National Dex id so the app can look them up
// with just the id. Run: node scripts/import-sprites.mjs "<pack Pokemon dir>"
//
// Source layout: <pack>/Front, <pack>/Back, <pack>/Icons  (files like CHARIZARD.png)
// Output:        public/sprites/{front,back,icons}/<id>.png
import { readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pack =
  process.argv[2] ||
  '/Users/milano/Downloads/Generation 9 Pack v3.3.6/Graphics/Pokemon';

// Essentials internal names differ from PokeAPI for a couple of species.
// Keys are alphanumeric-uppercase lookup keys (see `keyOf`).
const OVERRIDES = {
  'Nidoran F': 'NIDORANFE',
  'Nidoran M': 'NIDORANMA',
};

function keyOf(s) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Index a sprite folder by alnum-uppercase basename -> actual filename, so the
// match is case-insensitive on both letters and the .png/.PNG extension. Only
// base forms (no `_suffix`) become single-word keys we can hit.
function indexDir(srcDir) {
  const byKey = new Map();
  for (const f of readdirSync(srcDir)) {
    const m = f.match(/^(.*)\.png$/i);
    if (!m || m[1].includes('_')) continue;
    byKey.set(keyOf(m[1]), f);
  }
  return byKey;
}

// Resolve a dex name to a file. PokeAPI tacks the default form onto a species
// name ("Deoxys Normal"), but the pack ships the base species ("DEOXYS"), so
// trim trailing words until something matches.
function fileFor(name, byKey) {
  if (OVERRIDES[name]) return byKey.get(OVERRIDES[name]) ?? null;
  const words = name.split(' ');
  for (let k = words.length; k >= 1; k--) {
    const hit = byKey.get(keyOf(words.slice(0, k).join('')));
    if (hit) return hit;
  }
  return null;
}

// Parse id + name straight out of the generated dex.
const dexSrc = readFileSync(join(root, 'src/game/pokedex.gen.ts'), 'utf8');
const entries = [...dexSrc.matchAll(/\{ id: (\d+), name: "([^"]+)"/g)].map(
  (m) => ({ id: Number(m[1]), name: m[2] }),
);
console.log(`Dex entries: ${entries.length}`);

const SETS = [
  { src: 'Front', out: 'front' },
  { src: 'Back', out: 'back' },
  { src: 'Icons', out: 'icons' },
];

for (const set of SETS) {
  const srcDir = join(pack, set.src);
  const byKey = indexDir(srcDir);
  const outDir = join(root, 'public/sprites', set.out);
  mkdirSync(outDir, { recursive: true });

  let copied = 0;
  const missing = [];
  for (const e of entries) {
    const file = fileFor(e.name, byKey);
    if (file) {
      copyFileSync(join(srcDir, file), join(outDir, `${e.id}.png`));
      copied++;
    } else {
      missing.push(`${e.id} ${e.name}`);
    }
  }
  console.log(`\n[${set.src}] copied ${copied}, missing ${missing.length}`);
  if (missing.length) console.log('  ' + missing.slice(0, 60).join('\n  '));
}
