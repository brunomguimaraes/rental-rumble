// Downloads the Paldea (Scarlet/Violet) Gym Badge icons from Bulbagarden
// Archives into public/sprites/badges/<type>.png, one per type, plus a league
// emblem for the Champion. These are © Nintendo/Game Freak — used here only for
// a private, non-commercial project. Run: node scripts/fetch-badges.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/sprites/badges');
mkdirSync(outDir, { recursive: true });

// type -> Bulbagarden File: title. The 18 SV badges span three storylines but
// together cover every type in a consistent art style.
const BADGES = {
  bug: 'SVbadge VictoryRoad Bug.png',
  electric: 'SVbadge VictoryRoad Electric.png',
  ghost: 'SVbadge VictoryRoad Ghost.png',
  grass: 'SVbadge VictoryRoad Grass.png',
  ice: 'SVbadge VictoryRoad Ice.png',
  normal: 'SVbadge VictoryRoad Normal.png',
  psychic: 'SVbadge VictoryRoad Psychic.png',
  water: 'SVbadge VictoryRoad Water.png',
  dragon: 'SVbadge PathOfLegends Dragon.png',
  flying: 'SVbadge PathOfLegends Flying.png',
  ground: 'SVbadge PathOfLegends Ground.png',
  rock: 'SVbadge PathOfLegends Rock.png',
  steel: 'SVbadge PathOfLegends Steel.png',
  dark: 'SVbadge StarfallStreet Dark.png',
  fairy: 'SVbadge StarfallStreet Fairy.png',
  fighting: 'SVbadge StarfallStreet Fighting.png',
  fire: 'SVbadge StarfallStreet Fire.png',
  poison: 'SVbadge StarfallStreet Poison.png',
  champion: 'SVbadge Uva.png',
};

const API = 'https://archives.bulbagarden.net/w/api.php';

async function directUrl(title) {
  const url = `${API}?action=query&titles=${encodeURIComponent('File:' + title)}&prop=imageinfo&iiprop=url&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'rental-rumble/1.0' } });
  const data = await res.json();
  const pages = data.query.pages;
  const page = pages[Object.keys(pages)[0]];
  return page?.imageinfo?.[0]?.url ?? null;
}

let ok = 0;
const missing = [];
for (const [key, title] of Object.entries(BADGES)) {
  try {
    const src = await directUrl(title);
    if (!src) {
      missing.push(`${key} (${title})`);
      continue;
    }
    const img = await fetch(src, { headers: { 'User-Agent': 'rental-rumble/1.0' } });
    if (!img.ok) throw new Error(`HTTP ${img.status}`);
    writeFileSync(join(outDir, `${key}.png`), Buffer.from(await img.arrayBuffer()));
    ok++;
  } catch (err) {
    missing.push(`${key}: ${err.message}`);
  }
}

console.log(`badges: ${ok} saved, ${missing.length} missing`);
if (missing.length) console.log('  ' + missing.join('\n  '));
