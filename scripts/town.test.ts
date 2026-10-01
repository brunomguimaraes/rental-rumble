/**
 * Hearth Town's data layer: its destinations line up with the art's
 * hotspots.json, every hit region fits the 1536×1024 artwork, lookups reject
 * anything that is not a destination id, links reach real places, and the web
 * images the screen loads exist at the sizes it scales from.
 *
 *   npx tsx scripts/town.test.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOWN_ART, TOWN_DESTINATIONS, townDestinationById } from '../src/game/town.js';
import { isPlayableId } from '../src/game/world.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ART = join(PUBLIC, 'sprites', 'world', 'hearth-town-v2');

interface Hotspot {
  id: string;
  number: string;
  label: string;
  kind: string;
  targetLocationId?: string;
  bounds: { x: number; y: number; width: number; height: number };
  anchor: { x: number; y: number };
}
const layout = JSON.parse(readFileSync(join(ART, 'hotspots.json'), 'utf8')) as {
  coordinateSystem: { width: number; height: number };
  hotspots: Hotspot[];
};

// --- The code follows the art ------------------------------------------------------
// hotspots.json is where the hit regions were authored. If the art is regenerated
// with new coordinates and town.ts is not updated, the screen's buttons would
// silently sit on the wrong buildings.

console.log('\n[1] art alignment');
check(
  'the coordinate space matches hotspots.json',
  layout.coordinateSystem.width === TOWN_ART.width && layout.coordinateSystem.height === TOWN_ART.height,
);
check('same number of destinations as hotspots.json', TOWN_DESTINATIONS.length === layout.hotspots.length);
layout.hotspots.forEach((h, i) => {
  const d = TOWN_DESTINATIONS[i];
  check(`${h.id}: sits at position ${i} of the list`, d?.id === h.id);
  if (!d) return;
  check(`${h.id}: number, name and kind match`, d.number === h.number && d.name === h.label && d.kind === h.kind);
  check(
    `${h.id}: bounds match`,
    d.bounds.x === h.bounds.x &&
      d.bounds.y === h.bounds.y &&
      d.bounds.width === h.bounds.width &&
      d.bounds.height === h.bounds.height,
  );
  check(`${h.id}: anchor matches`, d.anchor.x === h.anchor.x && d.anchor.y === h.anchor.y);
  check(`${h.id}: link follows the art's target place`, h.targetLocationId === undefined || d.link === h.targetLocationId);
});

// --- Hit regions -------------------------------------------------------------------
// The screen scales x and width by renderedWidth / 1536 and y and height by
// renderedHeight / 1024, so a region outside the art or a marker outside its
// own region would render off the picture or off its building.

console.log('\n[2] hit regions');
for (const d of TOWN_DESTINATIONS) {
  const { x, y, width, height } = d.bounds;
  check(
    `${d.id}: bounds lie inside the ${TOWN_ART.width}×${TOWN_ART.height} art`,
    width > 0 && height > 0 && x >= 0 && y >= 0 && x + width <= TOWN_ART.width && y + height <= TOWN_ART.height,
  );
  check(
    `${d.id}: bounds contain the anchor`,
    d.anchor.x >= x && d.anchor.x <= x + width && d.anchor.y >= y && d.anchor.y <= y + height,
  );
}

// --- Lookups -----------------------------------------------------------------------
// A lookup returns the listed destination itself, and null for an id that is not one.

console.log('\n[3] lookups');
for (const d of TOWN_DESTINATIONS) check(`${d.id}: found by its id`, townDestinationById(d.id) === d);
for (const id of ['', 'nowhere', 'Bakery', ' bakery', 'bakery ']) {
  check(`"${id}" is not a destination`, townDestinationById(id) === null);
}

// --- Cards -------------------------------------------------------------------------
// A card shows a destination's description and role, then opens a screen (party,
// dex, box) or a place. A place link that is not playable would send the player
// to a route the world map does not have.

console.log('\n[4] cards');
const SCREENS = new Set<string>(['party', 'dex', 'box', 'center']);
check('the Pokémon Center opens the Center', townDestinationById('pokemon-center')?.link === 'center');
for (const d of TOWN_DESTINATIONS) {
  check(`${d.id}: has card copy`, d.description.trim() !== '' && d.role.trim() !== '');
  if (d.link !== null && !SCREENS.has(d.link)) check(`${d.id}: link "${d.link}" is a playable place`, isPlayableId(d.link));
  if (d.kind === 'exit') check(`${d.id}: an exit leads to a playable place`, d.link !== null && isPlayableId(d.link));
}

// --- Web images --------------------------------------------------------------------
// The screen loads WebP derivatives, not the multi-megabyte PNG masters. It lays
// markers over the map in the 1536×1024 coordinate space, so the map must keep
// that size; the avatar sits on dark and light surfaces, so it must keep its alpha.

console.log('\n[5] web images');
const AVATAR_PX = 256; // avatar-256.webp
const MAP_BUDGET = 1_000_000; // bytes; the lossy derivative is ~0.6 MB, a lossless one 2.8 MB, the PNG master 3.7 MB

interface Webp {
  width: number;
  height: number;
  alpha: boolean;
}

/** Canvas size and alpha flag from a WebP's first chunk (VP8X, VP8L or VP8); null unless the file is a whole WebP. */
function readWebp(buf: Buffer): Webp | null {
  if (buf.length < 30) return null;
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  if (buf.readUInt32LE(4) + 8 !== buf.length) return null; // truncated, or trailing bytes
  const chunk = buf.toString('latin1', 12, 16);
  const at = 20; // the first chunk's payload
  if (chunk === 'VP8X') {
    // flags, 3 reserved bytes, then canvas width - 1 and height - 1 as 24-bit values
    return {
      alpha: (buf[at] & 0x10) !== 0,
      width: buf.readUIntLE(at + 4, 3) + 1,
      height: buf.readUIntLE(at + 7, 3) + 1,
    };
  }
  if (chunk === 'VP8L') {
    // 0x2f signature, then 14-bit width - 1, 14-bit height - 1 and the alpha flag
    if (buf[at] !== 0x2f) return null;
    const bits = buf.readUInt32LE(at + 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: ((bits >>> 28) & 1) === 1 };
  }
  if (chunk === 'VP8 ') {
    // 3-byte frame tag, start code 9d 01 2a, then 14-bit width and height; plain VP8 has no alpha
    if (buf[at + 3] !== 0x9d || buf[at + 4] !== 0x01 || buf[at + 5] !== 0x2a) return null;
    return { width: buf.readUInt16LE(at + 6) & 0x3fff, height: buf.readUInt16LE(at + 8) & 0x3fff, alpha: false };
  }
  return null;
}

function loadWebp(label: string, path: string): { info: Webp; bytes: number } | null {
  const file = join(PUBLIC, path);
  const found = existsSync(file);
  check(`${label} exists at public/${path}`, found);
  if (!found) return null;
  const buf = readFileSync(file);
  const info = readWebp(buf);
  check(`${label} is a whole WebP file`, info !== null);
  return info ? { info, bytes: buf.length } : null;
}

check('art paths are relative to BASE_URL (no leading slash)', !TOWN_ART.map.startsWith('/') && !TOWN_ART.avatar.startsWith('/'));
const master = readFileSync(join(ART, 'exploration-map.png'));
check(
  `the map master is the ${TOWN_ART.width}×${TOWN_ART.height} the hit regions were authored on`,
  master.readUInt32BE(16) === TOWN_ART.width && master.readUInt32BE(20) === TOWN_ART.height,
);

const map = loadWebp('the map', TOWN_ART.map);
if (map) {
  check(
    `the map is ${TOWN_ART.width}×${TOWN_ART.height}, so hit regions scale 3:2 without cropping`,
    map.info.width === TOWN_ART.width && map.info.height === TOWN_ART.height,
  );
  check(`the map is web-sized (${map.bytes} B, under ${MAP_BUDGET} B)`, map.bytes < MAP_BUDGET);
}
const avatar = loadWebp('the avatar', TOWN_ART.avatar);
if (avatar) {
  check(`the avatar is ${AVATAR_PX}×${AVATAR_PX}`, avatar.info.width === AVATAR_PX && avatar.info.height === AVATAR_PX);
  check('the avatar keeps its alpha', avatar.info.alpha);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
