// Paints Hearthvale, the world map, as original pixel art and writes two
// generated images:
//
//   public/sprites/world/hearthvale.png  the whole region at 1× (MAP_SIZE, RGBA)
//   public/sprites/world/fog.png         a 32×32 tileable fog overlay for undiscovered areas
//
// Everything is drawn here in code: terrain fields, small procedural and
// hand-placed pixel sprites, and seeded noise from RNG('hearthvale'). The art
// is original, with no third-party source. Places and their connections are
// read from src/game/world-places.ts: each place's scenery is laid out around
// its map position and a dirt path joins every pair of neighbours, so a moved
// place takes its surroundings with it. The PNGs come from the minimal encoder
// below (zlib + CRC32), so the script needs no dependency.
//
// Both PNGs are generated output: never hand-edit them. Change this script and
// rerun it; it writes byte-identical files every time.
//
// Run:  npx tsx scripts/build-world-map.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { RNG } from '../src/game/rng.js';
import { MAP_SIZE, type Biome, type Place } from '../src/game/world.js';
import { PLACES } from '../src/game/world-places.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'world');
const W = MAP_SIZE.width;
const H = MAP_SIZE.height;
const N = W * H;

// ===========================================================================
// Maths, dithering and seeded noise

interface Pt {
  x: number;
  y: number;
}
interface Sample extends Pt {
  /** Half-width of a stroke at this point. */
  hw: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const ellipseD = (x: number, y: number, c: Pt, r: Pt): number => Math.hypot((x - c.x) / r.x, (y - c.y) / r.y);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4×4 ordered-dither threshold for a pixel, in (0, 1). */
const bayer = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

const ROOT = new RNG('hearthvale');
/** A fresh stream per feature, drawn from the root in a fixed order. */
const stream = (): RNG => new RNG(ROOT.int(1, 0x7ffffffe));

/** Smooth value noise on a square lattice; `wrap` makes it tile over width × height. */
class Noise {
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly wrap: boolean;
  private readonly v: Float64Array;

  constructor(rng: RNG, cell: number, width: number, height: number, wrap = false) {
    this.cell = cell;
    this.wrap = wrap;
    this.cols = Math.ceil(width / cell) + (wrap ? 0 : 3);
    this.rows = Math.ceil(height / cell) + (wrap ? 0 : 3);
    this.v = new Float64Array(this.cols * this.rows);
    for (let i = 0; i < this.v.length; i++) this.v[i] = rng.next();
  }

  private lattice(ix: number, iy: number): number {
    const c = this.wrap ? ((ix % this.cols) + this.cols) % this.cols : clamp(ix + 1, 0, this.cols - 1);
    const r = this.wrap ? ((iy % this.rows) + this.rows) % this.rows : clamp(iy + 1, 0, this.rows - 1);
    return this.v[r * this.cols + c];
  }

  at(x: number, y: number): number {
    const fx = x / this.cell;
    const fy = y / this.cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = lerp(this.lattice(ix, iy), this.lattice(ix + 1, iy), sx);
    const bottom = lerp(this.lattice(ix, iy + 1), this.lattice(ix + 1, iy + 1), sx);
    return lerp(top, bottom, sy);
  }
}

/** Piecewise-linear y along points sorted by x. */
function polyY(pts: readonly Pt[], x: number): number {
  if (x <= pts[0].x) return pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) return lerp(pts[i - 1].y, pts[i].y, (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x));
  }
  return pts[pts.length - 1].y;
}

/** Catmull-Rom spline through the control samples, about every `step` px. */
function spline(ctl: readonly Sample[], step = 0.5): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i + 1 < ctl.length; i++) {
    const p0 = ctl[Math.max(0, i - 1)];
    const p1 = ctl[i];
    const p2 = ctl[i + 1];
    const p3 = ctl[Math.min(ctl.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), hw: lerp(p1.hw, p2.hw, t) });
    }
  }
  const last = ctl[ctl.length - 1];
  out.push({ x: last.x, y: last.y, hw: last.hw });
  return out;
}

/** Nudges a stroke sideways with smooth noise, fading out at its ends and near `pins`. */
function wiggle(line: readonly Sample[], rng: RNG, amp: number, pins: readonly Pt[]): Sample[] {
  const noise = new Noise(rng, 18, 4096, 1);
  const out: Sample[] = [];
  let s = 0;
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 3)];
    const b = line[Math.min(line.length - 1, i + 3)];
    if (i > 0) s += dist(line[i - 1], line[i]);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let fade = Math.min(1, dist(line[i], line[0]) / 14, dist(line[i], line[line.length - 1]) / 14);
    for (const p of pins) fade = Math.min(fade, clamp((dist(line[i], p) - 3) / 12, 0, 1));
    const o = (noise.at(s, 0) - 0.5) * 2 * amp * fade;
    out.push({ x: line[i].x - ((b.y - a.y) / len) * o, y: line[i].y + ((b.x - a.x) / len) * o, hw: line[i].hw });
  }
  return out;
}

/** Lowers `sd` to each pixel's signed distance from the stroke's edge (negative inside). */
function strokeSD(line: readonly Sample[], sd: Float32Array): void {
  for (const p of line) {
    const r = Math.ceil(p.hw + 4);
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
        const d = Math.hypot(x - p.x, y - p.y) - p.hw;
        const i = y * W + x;
        if (d < sd[i]) sd[i] = d;
      }
    }
  }
}

// ===========================================================================
// PNG encoder: 8-bit RGBA (colour type 6), filter 0 on every row, one IDAT.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // each row starts with filter byte 0
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

// ===========================================================================
// Palette. Every map colour sits on a light-to-dark ramp, so a cast shadow is
// always "one step down the ramp" and no colour is ever mixed or blended.

const DARKER = new Map<number, number>();
const LIGHTER = new Map<number, number>();
function ramp(...colours: number[]): readonly number[] {
  for (let i = 0; i + 1 < colours.length; i++) {
    if (!DARKER.has(colours[i])) DARKER.set(colours[i], colours[i + 1]);
    if (!LIGHTER.has(colours[i + 1])) LIGHTER.set(colours[i + 1], colours[i]);
  }
  return colours;
}
function darker(c: number, steps = 1): number {
  let out = c;
  for (let i = 0; i < steps; i++) out = DARKER.get(out) ?? out;
  return out;
}
const lighter = (c: number): number => LIGHTER.get(c) ?? c;

const INK = 0x0a0d18; // darkest outline; the map never uses pure black
const GRASS = ramp(0xbfe66c, 0x9fd65a, 0x82c04b, 0x66a53f, 0x4d8937, 0x386c30, 0x28502a, 0x1a3621);
const MEADOW = ramp(0xe6f28a, 0xcde873, 0xb1db61, 0x95c952, 0x78af46, 0x5d933b);
const ALPINE = ramp(0xa9cd88, 0x88b271, 0x6b965f, 0x517a4f, 0x3c5e41, 0x2a4434);
const PLATEAU = ramp(0xdcd992, 0xc1c379, 0xa3aa64, 0x849052, 0x677544, 0x4b5a36);
const TALL = ramp(0xaaea6a, 0x70c64e, 0x4ca341, 0x357f37, 0x245c2c, 0x173d21);
const PATH = ramp(0xf7e3ac, 0xe6c98e, 0xcda86e, 0xa98353, 0x7f603d, 0x57412a);
const BEACH = ramp(0xfdf2c8, 0xf4e0a6, 0xe3c88a, 0xc7a76e, 0x9e8054);
const WATER = ramp(0xf0f9ff, 0xb4e2ff, 0x6abcf6, 0x4598e6, 0x3276cb, 0x2659a8, 0x1c4080, 0x132c5c);
const ROCK = ramp(0xf0edf5, 0xccc6db, 0xa59fbd, 0x7e7999, 0x5b5776, 0x3e3c58, 0x28283f, 0x191a2c);
const SNOW = ramp(0xfbfdff, 0xe6eefb, 0xcad8f0, 0xa8badc, 0x8497c0);
const QUARRY = ramp(0xf7eed8, 0xe5d7b8, 0xcbbb9a, 0xa8977b, 0x80725d, 0x5a4f43);
const PLAZA = ramp(0xf3ead5, 0xddd1b6, 0xc0b397, 0x9b8d71, 0x716652);
const STONE = ramp(0xf1ecdf, 0xd2cbb7, 0xafa894, 0x898273, 0x635e56, 0x413e44);
const WOOD = ramp(0xe5b073, 0xbf854b, 0x945e35, 0x684126, 0x422a19);
const EARTH = ramp(0x9c7a55, 0x76593d, 0x543f2b, 0x35281d);
const LEAF = ramp(0xc0f07f, 0x92d961, 0x6aba4b, 0x4a973f, 0x337434, 0x214f28, 0x13331e);
const OAKLEAF = ramp(0xd8f08a, 0xafd865, 0x84b84d, 0x5f9741, 0x437537, 0x2b532b, 0x1a3720);
const DEEP = ramp(0x7fc07a, 0x55a067, 0x3d8259, 0x2c664b, 0x1f4c3b, 0x13332a, 0x0b2019);
const PINE = ramp(0x94d690, 0x62b277, 0x429063, 0x2e7050, 0x1f513e, 0x11342b);
const BLOSSOM = ramp(0xffe6f3, 0xffbfe0, 0xf596c9, 0xd670a9, 0xa64f83, 0x6c3057);
const AUTUMN = ramp(0xffe38e, 0xf8bb55, 0xe08f3d, 0xba6530, 0x8a4628, 0x572c1d);
const TRUNK = ramp(0xa9764b, 0x7e5435, 0x593a24, 0x382317);
const ROOF_RED = ramp(0xffa07c, 0xf06247, 0xc8403a, 0x952b3b, 0x5e1b2f);
const ROOF_BLUE = ramp(0x9fd5ff, 0x62a8f4, 0x437cd2, 0x2e569e, 0x1d386e);
const WALL = ramp(0xfff9ea, 0xefe3ca, 0xcfbd9c, 0x9c886c);
const GLASS = ramp(0xfff2a6, 0xffd447, 0xe2a232);
const GLOW = ramp(0xeafffa, 0x94f7e4, 0x4cd2d2, 0x2f8f9e);
const MYST = ramp(0xe0d0ff, 0xc3a6ff, 0x8e6af0, 0x4c3a9c, 0x2a2252);
const FLOWERS = [0xff90c8, 0xffe35e, 0xf7f9ff, 0xff6a6a, 0xc39cff] as const;

// ===========================================================================
// Places and the anchors every feature is laid out from

function placeFor(biome: Biome): Pt {
  const p = PLACES.find((q) => q.biome === biome);
  if (!p) throw new Error(`world-places.ts has no ${biome} place to draw`);
  return { x: p.map.x, y: p.map.y };
}

const HOME = placeFor('town');
const MEADOW_AT = placeFor('meadow');
const WOODS_AT = placeFor('forest');
const LAKE_AT = placeFor('lakeside');
const QUARRY_AT = placeFor('quarry');
const TRAIL_AT = placeFor('mountain');
const RUINS_AT = placeFor('ruins');

/** Open ground kept around every place for its UI marker. */
const CLEAR_R = 20;
const CLIFF_H = 12;
/** The plateau's south rim; the river's falls drop over the same cliff line. */
const RIM_Y = RUINS_AT.y + 48;
const GORGE_X = Math.round(lerp(TRAIL_AT.x, RUINS_AT.x, 0.46));
const FALL_TOP = RIM_Y;
const FALL_BOT = RIM_Y + CLIFF_H + 2;
const BRIDGE_A_Y = RIM_Y - 18;
const LAKE_C = { x: LAKE_AT.x + 24, y: LAKE_AT.y - 48 };
const LAKE_R = { x: 44, y: 34 };
const INLET_Y = LAKE_C.y + 18;
const INLET_X = LAKE_C.x - LAKE_R.x * Math.sqrt(1 - ((INLET_Y - LAKE_C.y) / LAKE_R.y) ** 2);
const BRIDGE_B_X = Math.round(INLET_X - 16);
const STAIRS_X = RUINS_AT.x + 8;
const ISLE = { x: LAKE_C.x + 14, y: LAKE_C.y - 8 };
const QPIT = { x: QUARRY_AT.x - 4, y: QUARRY_AT.y + 4 };
const QPIT_R = { x: 46, y: 36 };
const WOODS_C = { x: WOODS_AT.x + 4, y: WOODS_AT.y - 10 };
const WOODS_R = { x: 62, y: 66 };
const OAK = { x: MEADOW_AT.x + 40, y: MEADOW_AT.y - 14 };
const POND_C = { x: QUARRY_AT.x - 22, y: Math.round(lerp(QUARRY_AT.y, HOME.y, 0.5)) };
const POND_R = { x: 17, y: 11 };

// ===========================================================================
// Buffers

const img = new Uint32Array(N);
const kind = new Uint8Array(N);
/** 1 where no tree, rock or prop may stand. */
const blocked = new Uint8Array(N);
/** Cast-shadow marks, applied to the ground before props are drawn. */
const shadow = new Uint8Array(N);

const K = {
  grass: 1,
  meadow: 2,
  forest: 3,
  alpine: 4,
  rock: 5,
  snow: 6,
  plateau: 7,
  cliff: 8,
  quarry: 9,
  water: 10,
  sand: 11,
  path: 12,
  plaza: 13,
  bridge: 14,
  court: 15,
  tall: 16,
  garden: 17,
} as const;
const GRASSY = new Set<number>([K.grass, K.meadow, K.forest, K.alpine, K.plateau]);

const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
function put(x: number, y: number, c: number): void {
  if (inside(x, y)) img[y * W + x] = c;
}
const colourAt = (x: number, y: number): number => img[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)];
const kindAt = (x: number, y: number): number => (inside(x, y) ? kind[y * W + x] : 0);
function block(x: number, y: number): void {
  if (inside(x, y)) blocked[y * W + x] = 1;
}
function blockDisc(c: Pt, r: number): void {
  for (let y = Math.floor(c.y - r); y <= Math.ceil(c.y + r); y++) {
    for (let x = Math.floor(c.x - r); x <= Math.ceil(c.x + r); x++) if (Math.hypot(x - c.x, y - c.y) <= r) block(x, y);
  }
}
function blockRect(x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) block(x, y);
}
function shadowEllipse(cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (inside(x, y) && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) shadow[y * W + x] = 1;
    }
  }
}

// ===========================================================================
// Sprites: a colour per pixel (-1 = transparent) and a foot pixel (ax, ay)
// that sits on the ground; props are drawn back to front by their foot.

interface Sprite {
  w: number;
  h: number;
  ax: number;
  ay: number;
  px: Int32Array;
}

function newSprite(w: number, h: number, ax: number, ay: number): Sprite {
  return { w, h, ax, ay, px: new Int32Array(w * h).fill(-1) };
}
function sset(s: Sprite, x: number, y: number, c: number): void {
  if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.px[y * s.w + x] = c;
}

/** Recolours a sprite's own edge: `lit` where it faces up or left, `dark` where it faces down or right. */
function outline(s: Sprite, lit: number, dark: number): void {
  const src = s.px.slice();
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < s.w && y < s.h && src[y * s.w + x] >= 0;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x, y + 1) || !solid(x + 1, y)) s.px[y * s.w + x] = dark;
      else if (!solid(x, y - 1) || !solid(x - 1, y)) s.px[y * s.w + x] = lit;
    }
  }
}

/** Adds a 1-px rim outside the sprite's opaque pixels: `dark` below and right, `lit` above and left. */
function rim(s: Sprite, lit: number, dark: number): void {
  const src = s.px.slice();
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < s.w && y < s.h && src[y * s.w + x] >= 0;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x, y - 1)) s.px[y * s.w + x] = dark;
      else if (solid(x + 1, y) || solid(x, y + 1)) s.px[y * s.w + x] = lit;
    }
  }
}

function blit(s: Sprite, x: number, y: number, flip = false): void {
  for (let sy = 0; sy < s.h; sy++) {
    for (let sx = 0; sx < s.w; sx++) {
      const c = s.px[sy * s.w + sx];
      if (c >= 0) put(x + (flip ? s.ax - sx : sx - s.ax), y + sy - s.ay, c);
    }
  }
}

/** Whether any opaque pixel of the sprite would land on a blocked pixel. */
function hits(s: Sprite, x: number, y: number, flip = false): boolean {
  for (let sy = 0; sy < s.h; sy++) {
    for (let sx = 0; sx < s.w; sx++) {
      if (s.px[sy * s.w + sx] < 0) continue;
      const px = x + (flip ? s.ax - sx : sx - s.ax);
      const py = y + sy - s.ay;
      if (inside(px, py) && blocked[py * W + px]) return true;
    }
  }
  return false;
}

function blockSprite(s: Sprite, x: number, y: number, flip = false, margin = 0): void {
  for (let sy = 0; sy < s.h; sy++) {
    for (let sx = 0; sx < s.w; sx++) {
      if (s.px[sy * s.w + sx] < 0) continue;
      const px = x + (flip ? s.ax - sx : sx - s.ax);
      const py = y + sy - s.ay;
      if (margin > 0) blockRect(px - margin, py - margin, px + margin, py + margin);
      else block(px, py);
    }
  }
}

interface Prop {
  x: number;
  y: number;
  draw: () => void;
}
const props: Prop[] = [];
function addSprite(s: Sprite, x: number, y: number, flip = false): void {
  props.push({ x, y, draw: () => blit(s, x, y, flip) });
}
/** Places a landmark sprite, reserves its ground and casts a soft shadow to the lower right. */
function landmark(s: Sprite, x: number, y: number, margin = 1): void {
  addSprite(s, x, y);
  blockSprite(s, x, y, false, margin);
  shadowEllipse(x + 2, y + 1, Math.max(2, s.w * 0.45), 1.6);
}

// --- Trees, bushes, rocks and peaks ------------------------------------------

/** Draws a lobed crown (lit from the upper left, outlined) into `s` around (cx, cy). */
function crownInto(
  s: Sprite,
  rng: RNG,
  cx: number,
  cy: number,
  r: number,
  pal: readonly number[],
  lobeCount: number,
  lobeScale: number,
  extraAngles: readonly number[] = [],
): void {
  const tmp = newSprite(s.w, s.h, 0, 0);
  const lobes: { x: number; y: number; r: number }[] = [];
  const angles: number[] = [];
  for (let k = 0; k < lobeCount; k++) angles.push(Math.PI * (0.92 + (1.16 * k) / (lobeCount - 1)) + rng.range(-0.12, 0.12));
  for (const a of [...angles, ...extraAngles]) {
    const lr = r * rng.range(lobeScale - 0.05, lobeScale + 0.05);
    const d = r - lr + 0.8;
    lobes.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: lr });
  }
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const inMain = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      let best = -1;
      let local = 0;
      for (const l of lobes) {
        const q = 1 - Math.hypot(x - l.x, y - l.y) / l.r;
        if (q > best) {
          best = q;
          local = -(0.6 * (x - l.x) + 0.8 * (y - l.y)) / l.r;
        }
      }
      if (!inMain && best < 0) continue;
      let b = -(0.6 * (x - cx) + 0.8 * (y - cy)) / r;
      if (best > 0) b = b * 0.55 + local * 0.55 + 0.1;
      b += (bayer(x, y) - 0.5) * 0.3;
      sset(tmp, x, y, pal[b > 0.72 ? 0 : b > 0.28 ? 1 : b > -0.16 ? 2 : b > -0.58 ? 3 : 4]);
    }
  }
  outline(tmp, pal[4], pal[5]);
  for (let i = 0; i < tmp.px.length; i++) if (tmp.px[i] >= 0) s.px[i] = tmp.px[i];
}

/** A round broadleaf tree: lobed crown over a short trunk. */
function makeTree(rng: RNG, r: number, pal: readonly number[], trunk = true): Sprite {
  const cw = Math.round(r * 2) + 3;
  const trunkH = trunk ? Math.max(2, Math.round(r * 0.45)) : 0;
  const s = newSprite(cw, cw + trunkH - 1, Math.floor(cw / 2), cw + trunkH - 2);
  if (trunk) {
    const tw = r >= 5 ? 3 : 2;
    const tx = Math.floor(cw / 2) - (tw === 3 ? 1 : 0);
    for (let y = cw - 5; y < s.h; y++) {
      for (let k = 0; k < tw; k++) {
        const c = y === s.h - 1 ? TRUNK[3] : k === 0 ? TRUNK[1] : k === tw - 1 ? TRUNK[3] : TRUNK[2];
        sset(s, tx + k, y, c);
      }
    }
    sset(s, tx - 1, s.h - 1, TRUNK[3]);
    sset(s, tx + tw, s.h - 1, TRUNK[3]);
  }
  crownInto(s, rng, (cw - 1) / 2, (cw - 1) / 2 + 0.4, r, pal, r >= 5 ? 5 : 4, 0.51);
  return s;
}

/** The Hilltop Oak: a dome of leafy clumps on a thick, root-flared trunk with branches. */
function makeOak(rng: RNG): Sprite {
  const s = newSprite(37, 40, 18, 39);
  for (let y = 22; y <= 39; y++) {
    const half = y >= 36 ? 2 + Math.ceil((y - 35) * 0.75) : 2;
    for (let x = 18 - half; x <= 18 + half; x++) {
      const t = (x - (18 - half)) / (2 * half);
      let c = t < 0.3 ? TRUNK[0] : t < 0.68 ? TRUNK[1] : TRUNK[2];
      if (y === 39 || x === 18 - half || x === 18 + half) c = TRUNK[3];
      else if ((y * 3 + x * 5) % 11 === 0) c = TRUNK[2];
      sset(s, x, y, c);
    }
  }
  for (let k = 0; k < 6; k++) {
    sset(s, 17 - k, 25 - k, k === 0 ? TRUNK[1] : TRUNK[2]);
    sset(s, 19 + k, 24 - k, TRUNK[3]);
  }
  // clumps from the back of the crown to the front, so the front ones overlap
  const clumps: readonly (readonly [number, number, number])[] = [
    [12, 8, 6],
    [24, 8, 6],
    [18, 6, 6.5],
    [7, 15, 6],
    [29, 15, 6],
    [18, 14, 7],
    [11, 21, 6],
    [25, 21, 6],
    [18, 22, 5.5],
  ];
  for (const [cx, cy, r] of clumps) crownInto(s, rng, cx, cy, r, LEAF, 4, 0.52);
  return s;
}

/** A layered conifer: lit left half, shaded right half, dark tier skirts. */
function makePine(rng: RNG, h: number, pal: readonly number[]): Sprite {
  const hw = Math.max(3, Math.round(h * 0.32));
  const s = newSprite(hw * 2 + 1, h + 2, hw, h + 1);
  const tiers = h >= 13 ? 3 : 2;
  for (let k = tiers - 1; k >= 0; k--) {
    const top = Math.round((k * h) / (tiers + 0.7));
    const bot = Math.min(h - 1, Math.round(((k + 1.7) * h) / (tiers + 0.7)));
    const maxW = Math.round(lerp(hw * 0.55, hw, (k + 1) / tiers));
    for (let y = top; y <= bot; y++) {
      const rw = Math.round(lerp(0.4, maxW, (y - top) / Math.max(1, bot - top)));
      for (let x = hw - rw; x <= hw + rw; x++) {
        let c = x < hw - rw / 2 ? pal[1] : x <= hw ? pal[2] : pal[3];
        if (y >= bot) c = x <= hw ? pal[3] : pal[4];
        if (x === hw - rw && y < bot) c = pal[0];
        sset(s, x, y, c);
      }
    }
  }
  if (rng.chance(0.5)) sset(s, hw - 1, 1, pal[0]);
  outline(s, pal[4], pal[5]);
  sset(s, hw, h, TRUNK[2]);
  sset(s, hw, h + 1, TRUNK[3]);
  sset(s, hw - 1, h + 1, TRUNK[3]);
  return s;
}

/** A shaded boulder, flat at the bottom. */
function makeRock(rng: RNG, w: number, h: number, pal: readonly number[] = ROCK): Sprite {
  const s = newSprite(w, h, Math.floor(w / 2), h - 1);
  const cx = (w - 1) / 2;
  const cy = h * 0.62;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / (w / 2);
      const ny = (y - cy) / (y < cy ? h * 0.62 : h * 0.42);
      if (nx * nx + ny * ny > 1.02 + rng.range(-0.08, 0.08)) continue;
      const b = -(0.65 * nx + 0.75 * ny) + (bayer(x, y) - 0.5) * 0.35;
      sset(s, x, y, pal[b > 0.6 ? 1 : b > 0.05 ? 2 : b > -0.5 ? 3 : 4]);
    }
  }
  outline(s, pal[4], pal[5]);
  return s;
}

/** A mountain peak: lit west face, shaded east face, snow cap and long gullies. */
function makePeak(rng: RNG, bwl: number, bwr: number, h: number, snowFrac: number): Sprite {
  const w = bwl + bwr + 1;
  const s = newSprite(w, h + 1, bwl, h);
  const ax = bwl;
  const top: number[] = [];
  let jag = 0;
  for (let x = 0; x < w; x++) {
    const t = x < ax ? (ax - x) / bwl : (x - ax) / bwr;
    if (rng.chance(0.4)) jag = clamp(jag + (rng.chance(0.5) ? 1 : -1), -1, 2);
    top.push(x === ax ? 0 : Math.max(1, Math.round(h * Math.pow(t, 0.88) + (t > 0.15 ? jag : 0))));
  }
  const slope = rng.range(0.04, 0.26);
  const ridge = (y: number): number => ax + 0.5 + y * slope;
  const snowLine = top.map((_, x) => Math.round(h * snowFrac + rng.int(-1, 1) - Math.abs(x - ax) * 0.12));
  // gully lines run from near the ridge down each face, roughly parallel to the slopes
  const gullies: { x0: number; y0: number; dx: number; lit: boolean }[] = [];
  for (let g = 0; g < 4; g++) {
    const lit = g % 2 === 0;
    const y0 = Math.round(h * (0.12 + 0.2 * Math.floor(g / 2)) + rng.int(0, 3));
    const dx = lit ? -(bwl / h) * rng.range(0.45, 0.75) : (bwr / h) * rng.range(0.45, 0.75);
    gullies.push({ x0: ridge(y0) + (lit ? -2 : 2), y0, dx, lit });
  }
  const gullyAt = (x: number, y: number): 0 | 1 | 2 => {
    for (const g of gullies) {
      if (y < g.y0) continue;
      const gx = Math.round(g.x0 + (y - g.y0) * g.dx);
      if (x === gx) return 1;
      if (x === gx + (g.lit ? -1 : 1)) return 2;
    }
    return 0;
  };
  for (let x = 0; x < w; x++) {
    for (let y = top[x]; y <= h; y++) {
      const lit = x < ridge(y);
      const depth = y - top[x];
      const g = gullyAt(x, y);
      const snow = y < snowLine[x] + (g === 1 ? 3 : 0);
      let c: number;
      if (snow) {
        c = lit ? (depth < 2 ? SNOW[0] : g === 1 ? SNOW[2] : SNOW[1]) : x < ridge(y) + 1.5 ? SNOW[3] : g === 1 ? SNOW[2] : SNOW[3];
        if (!lit && x >= ridge(y) + 1.5 && g !== 1) c = SNOW[2];
      } else if (lit) {
        c = depth < 2 ? ROCK[1] : g === 1 ? ROCK[3] : g === 2 ? ROCK[1] : ROCK[2];
      } else {
        c = x < ridge(y) + 1.5 ? ROCK[5] : g === 1 ? ROCK[3] : g === 2 ? ROCK[5] : ROCK[4];
      }
      if (!snow && y > h - 5) c = darker(c, y > h - 2 ? 2 : bayer(x, y) > 0.5 ? 1 : 0);
      sset(s, x, y, c);
    }
  }
  for (let x = 0; x < w; x++) sset(s, x, top[x], x < ridge(top[x]) ? ROCK[4] : ROCK[6]);
  return s;
}

// --- Buildings and props --------------------------------------------------------

interface HouseSpec {
  w: number;
  roofH: number;
  wallH: number;
  roof: readonly number[];
  door: number;
  doorW: number;
  windows: readonly number[];
  chimney?: number;
  trim?: boolean;
  glassDoor?: boolean;
}

/** A front-facing house: tiled roof with ridge highlight and eave, cream wall, lit windows. */
function makeHouse(o: HouseSpec): Sprite {
  const oy = o.chimney !== undefined ? 3 : 0;
  const h = o.roofH + o.wallH;
  const s = newSprite(o.w, h + oy, Math.floor(o.w / 2), h + oy - 1);
  const R = o.roof;
  for (let y = 0; y < o.roofH; y++) {
    const inset = y === 0 ? 2 : y === 1 ? 1 : 0;
    for (let x = inset; x < o.w - inset; x++) {
      const edge = x === inset || x === o.w - 1 - inset;
      let c: number;
      if (y === 0 || edge) c = INK;
      else if (y === 1) c = R[0];
      else if (y === o.roofH - 1) c = R[3];
      else if (o.trim && y === o.roofH - 3) c = WALL[0];
      else if (o.trim && y === o.roofH - 2) c = WALL[2];
      else if ((y - 1) % 3 === 0) c = x % 4 === 1 ? R[3] : R[2];
      else c = x >= o.w - 2 - inset ? R[2] : x <= 2 && y > 1 ? R[0] : R[1];
      sset(s, x, y + oy, c);
    }
  }
  if (o.chimney !== undefined) {
    const cx = o.chimney;
    for (let y = 0; y < 5; y++) {
      sset(s, cx, y, y === 0 ? INK : STONE[2]);
      sset(s, cx + 1, y, y === 0 ? INK : STONE[4]);
    }
    sset(s, cx - 1, 1, INK);
    sset(s, cx + 2, 1, INK);
    for (let y = 1; y < 4; y++) {
      sset(s, cx - 1, y, INK);
      sset(s, cx + 2, y, INK);
    }
  }
  for (let y = o.roofH; y < h; y++) {
    const wy = y - o.roofH;
    for (let x = 1; x < o.w - 1; x++) {
      let c: number;
      if (x === 1 || x === o.w - 2 || y === h - 1) c = INK;
      else if (wy === 0) c = WALL[2];
      else if (y === h - 2) c = WALL[2];
      else c = x === o.w - 3 ? WALL[2] : WALL[1];
      sset(s, x, y + oy, c);
    }
  }
  for (const wx of o.windows) {
    const wy = o.roofH + 1 + oy;
    sset(s, wx, wy, GLASS[0]);
    sset(s, wx + 1, wy, GLASS[1]);
    sset(s, wx, wy + 1, GLASS[1]);
    sset(s, wx + 1, wy + 1, GLASS[2]);
    sset(s, wx - 1, wy, WALL[3]);
    sset(s, wx - 1, wy + 1, WALL[3]);
    sset(s, wx, wy + 2, WALL[3]);
    sset(s, wx + 1, wy + 2, WALL[3]);
  }
  for (let y = o.roofH + 1; y < h - 1; y++) {
    for (let k = 0; k < o.doorW; k++) {
      const top = y === o.roofH + 1;
      const last = k === o.doorW - 1;
      const c = o.glassDoor ? (top ? WATER[5] : last ? WATER[3] : WATER[1]) : top ? WOOD[4] : last ? WOOD[3] : WOOD[2];
      sset(s, o.door + k, y + oy, c);
    }
  }
  return s;
}

/** A standing column with capital and base, or a broken stump. */
function makePillar(rng: RNG, h: number, broken: boolean): Sprite {
  const s = newSprite(9, h + 2, 4, h + 1);
  for (let y = 1; y <= h; y++) {
    const cap = !broken && y <= 2;
    const base = y >= h - 1;
    const x0 = cap || base ? 1 : 2;
    const x1 = cap || base ? 7 : 6;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      let c = t < 0.2 ? STONE[0] : t < 0.5 ? STONE[1] : t < 0.8 ? STONE[2] : STONE[3];
      if (cap && y === 2) c = darker(c);
      if (!cap && !base && y % 4 === 0) c = darker(c);
      if (base && y === h) c = darker(c);
      sset(s, x, y, c);
    }
  }
  if (broken) {
    for (let x = 2; x <= 6; x++) {
      const cut = rng.int(0, 3);
      for (let y = 1; y <= cut; y++) sset(s, x, y, -1);
      sset(s, x, cut + 1, STONE[1]);
    }
  }
  rim(s, STONE[4], STONE[5]);
  return s;
}

/** A pillar lying on its side, drum joints showing, cut face to the east. */
function makeFallenPillar(len: number): Sprite {
  const s = newSprite(len + 2, 7, Math.floor(len / 2), 6);
  for (let x = 1; x <= len; x++) {
    for (let y = 1; y <= 5; y++) {
      let c = [STONE[0], STONE[1], STONE[2], STONE[3], STONE[4]][y - 1];
      if ((x - 1) % 4 === 3 && x < len) c = darker(c);
      if (x === len) c = y === 1 || y === 5 ? STONE[2] : STONE[1];
      sset(s, x, y, c);
    }
  }
  rim(s, STONE[4], STONE[5]);
  return s;
}

/** The Star Gate: two pillars under a keystoned lintel round a dark, faintly glowing arch. */
function makeArch(): Sprite {
  const w = 25;
  const h = 23;
  const s = newSprite(w, h, 12, h - 1);
  for (let y = 2; y <= 5; y++) {
    for (let x = 1; x <= 23; x++) {
      let c = y === 2 ? STONE[0] : y === 5 ? STONE[3] : STONE[1];
      if (x >= 22) c = darker(c);
      if ((x - 1) % 6 === 5 && y > 2 && y < 5) c = STONE[3];
      sset(s, x, y, c);
    }
  }
  for (let y = 0; y <= 1; y++) for (let x = 10; x <= 14; x++) sset(s, x, y, y === 0 ? STONE[0] : x === 14 ? STONE[2] : STONE[1]);
  for (let y = 6; y <= h - 2; y++) {
    for (const x0 of [2, 16]) {
      for (let x = x0; x <= x0 + 5; x++) {
        const t = (x - x0) / 5;
        let c = t < 0.2 ? STONE[0] : t < 0.55 ? STONE[1] : t < 0.8 ? STONE[2] : STONE[3];
        if (y % 5 === 0) c = darker(c);
        if (y >= h - 3) c = t < 0.5 ? STONE[2] : STONE[3];
        sset(s, x, y, c);
      }
    }
    for (let x = 8; x <= 15; x++) {
      let c = y < 8 ? MYST[4] : y < h - 5 ? MYST[3] : MYST[4];
      if (x === 8) c = MYST[4];
      sset(s, x, y, c);
    }
  }
  for (const [x, y, c] of [
    [11, 11, GLOW[1]],
    [12, 13, GLOW[0]],
    [13, 10, MYST[1]],
    [10, 15, MYST[1]],
    [14, 16, GLOW[1]],
    [12, 18, GLOW[2]],
  ] as const) {
    sset(s, x, y, c);
  }
  rim(s, STONE[4], STONE[5]);
  return s;
}

/** A broken stretch of wall: lit top course, blocky face, crumbled ends. */
function makeWall(rng: RNG, len: number): Sprite {
  const s = newSprite(len + 2, 11, 1, 9);
  for (let x = 1; x <= len; x++) {
    const fromEnd = Math.min(x - 1, len - x);
    const hgt = fromEnd < 3 ? rng.int(3, 7 - (2 - fromEnd)) : rng.chance(0.2) ? 6 : 7;
    const top = 9 - hgt;
    for (let y = top; y <= 8; y++) {
      const face = y >= top + 2;
      let c: number;
      if (!face) c = y === top ? STONE[0] : STONE[1];
      else {
        const row = Math.floor((y - top - 2) / 2);
        const seam = (x + row * 2) % 5 === 0 || (y - top - 2) % 2 === 1;
        c = seam ? STONE[3] : x > len - 2 ? STONE[3] : STONE[2];
      }
      sset(s, x, y, c);
    }
  }
  rim(s, STONE[4], STONE[5]);
  return s;
}

/** A small stone shrine with a mossy roof and a dark niche. */
function makeShrine(): Sprite {
  const rows = ['...kkkkk...', '..kmMmmmk..', '.kmmmmmmmk.', 'kSSSSSSSSSk', '.kPdddddPk.', '.kPdGdddPk.', '.kPdddddPk.', 'kSSSSSSSSSk', 'kssssssssk.'];
  const legend: Record<string, number> = {
    k: STONE[5],
    m: LEAF[3],
    M: LEAF[2],
    S: STONE[1],
    s: STONE[3],
    P: STONE[2],
    d: MYST[4],
    G: GLOW[1],
  };
  return fromRows(rows, legend);
}

/** Sprite from character rows; '.' is transparent. The foot is the bottom-centre pixel. */
function fromRows(rows: readonly string[], legend: Record<string, number>): Sprite {
  const w = Math.max(...rows.map((r) => r.length));
  const s = newSprite(w, rows.length, Math.floor(w / 2), rows.length - 1);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = legend[row[x]];
      if (c !== undefined) sset(s, x, y, c);
    }
  });
  return s;
}

const LOG = fromRows(
  ['..mmm.........', '.TTTTTTTTTTRR.', 'TtttttttttRooR', 'TttttttttRoddR', 'TuuuuuuuuuRooR', '.UUUUUUUUUURR.'],
  { m: LEAF[3], T: TRUNK[0], t: TRUNK[1], u: TRUNK[2], U: TRUNK[3], R: TRUNK[3], o: TRUNK[0], d: INK },
);
const SIGNPOST = fromRows(['kkkkkkkkk', 'kaaaaaaak', 'kbbcbbbbk', 'kbbbbcbbk', 'kdddddddk', 'kkkeekkkk', '...ef....', '...ef....', '...ef....', '..kkkk...'], {
  k: WOOD[4],
  a: WOOD[0],
  b: WOOD[1],
  c: WOOD[2],
  d: WOOD[3],
  e: WOOD[2],
  f: WOOD[3],
});
const SUNFLOWER = fromRows(['.yYy.', 'yYcYy', '.yYy.', '..s..', '.ls..', '..sl.', '..s..'], {
  y: GLASS[1],
  Y: FLOWERS[1],
  c: AUTUMN[4],
  s: LEAF[3],
  l: LEAF[2],
});
const CART = fromRows(['..abab...', '.kaaccak.', 'kRRRRRRrk', 'kRrRRRrrk', 'kRRRRRrrk', '.kkkkkkk.', '..kk.kk..'], {
  a: ROCK[2],
  b: ROCK[1],
  c: ROCK[3],
  k: INK,
  R: AUTUMN[3],
  r: AUTUMN[4],
});
const CAIRN = fromRows(['...kk...', '..kaak..', '..kbbk..', '.kaaabk.', '.kbbbck.', 'kaaaabbk', 'kbbbbcck', '.kkkkkk.'], {
  k: ROCK[6],
  a: ROCK[1],
  b: ROCK[2],
  c: ROCK[3],
});

/** A post-and-rail fence of the given length. */
function makeFence(len: number): Sprite {
  const s = newSprite(len + 2, 8, 1, 6);
  for (let x = 1; x <= len; x++) {
    const post = (x - 1) % 5 === 0 || x === len;
    for (let y = 1; y <= 6; y++) {
      if (post) sset(s, x, y, y === 1 ? WOOD[0] : y === 6 ? WOOD[3] : WOOD[1]);
      else if (y === 2 || y === 4) sset(s, x, y, WOOD[1]);
      else if (y === 3 || y === 5) sset(s, x, y, WOOD[3]);
    }
  }
  rim(s, WOOD[3], WOOD[4]);
  return s;
}

// ===========================================================================
// 1. Water: the Cloudcap river, Mirror Lake with Heron Isle, the lake's
//    outflow stream and a pond west of town. `waterSD` < 0 is open water.

const nShore = new Noise(stream(), 7, W, H);
const riverSD = new Float32Array(N).fill(99);
const outflowSD = new Float32Array(N).fill(99);
const lakeSD = new Float32Array(N).fill(99);
const waterSD = new Float32Array(N).fill(99);

const RIVER = spline([
  { x: GORGE_X + 5, y: -8, hw: 2.8 },
  { x: GORGE_X - 3, y: Math.round(BRIDGE_A_Y * 0.32), hw: 3 },
  { x: GORGE_X + 3, y: Math.round(BRIDGE_A_Y * 0.66), hw: 3 },
  { x: GORGE_X, y: BRIDGE_A_Y - 8, hw: 3 },
  { x: GORGE_X, y: BRIDGE_A_Y + 8, hw: 3 },
  { x: GORGE_X, y: FALL_TOP, hw: 3.2 },
  { x: GORGE_X, y: FALL_BOT, hw: 3.4 },
  { x: GORGE_X + 5, y: FALL_BOT + 22, hw: 4 },
  { x: WOODS_AT.x - 2, y: WOODS_AT.y - 92, hw: 4.3 },
  { x: WOODS_AT.x + 22, y: WOODS_AT.y - 72, hw: 4.5 },
  { x: WOODS_AT.x + 48, y: WOODS_AT.y - 80, hw: 4.5 },
  { x: BRIDGE_B_X - 14, y: INLET_Y + 1, hw: 4.5 },
  { x: BRIDGE_B_X + 10, y: INLET_Y, hw: 4.5 },
  { x: INLET_X + 10, y: INLET_Y, hw: 5 },
]);
strokeSD(RIVER, riverSD);

const OUTFLOW = spline([
  { x: LAKE_C.x + 26, y: LAKE_C.y + 20, hw: 3.4 },
  { x: LAKE_C.x + 38, y: LAKE_C.y + 58, hw: 3 },
  { x: LAKE_C.x + 28, y: LAKE_C.y + 110, hw: 3 },
  { x: MEADOW_AT.x + 118, y: MEADOW_AT.y - 70, hw: 3.2 },
  { x: MEADOW_AT.x + 92, y: MEADOW_AT.y - 12, hw: 3.4 },
  { x: MEADOW_AT.x + 88, y: MEADOW_AT.y + 60, hw: 3.4 },
  { x: MEADOW_AT.x + 104, y: H + 10, hw: 3.6 },
]);
strokeSD(OUTFLOW, outflowSD);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const lake = (ellipseD(x, y, LAKE_C, LAKE_R) - 1) * 36 + (nShore.at(x, y) - 0.5) * 6;
    const isle = Math.hypot(x - ISLE.x, (y - ISLE.y) * 1.3) - 6.5 + (nShore.at(x + 90, y) - 0.5) * 3;
    lakeSD[i] = Math.max(lake, -isle);
    const pond = (ellipseD(x, y, POND_C, POND_R) - 1) * 12 + (nShore.at(x, y + 70) - 0.5) * 4;
    waterSD[i] = Math.min(riverSD[i], outflowSD[i], lakeSD[i], pond);
  }
}

/** River centre and half-width per row, down to the foot of the falls. */
const riverX = new Float32Array(FALL_BOT + 1);
const riverHW = new Float32Array(FALL_BOT + 1);
{
  const seen = new Uint8Array(FALL_BOT + 1);
  for (const p of RIVER) {
    const y = Math.round(p.y);
    if (y >= 0 && y <= FALL_BOT && !seen[y]) {
      seen[y] = 1;
      riverX[y] = p.x;
      riverHW[y] = p.hw;
    }
  }
  for (let y = 1; y <= FALL_BOT; y++) {
    if (!seen[y]) {
      riverX[y] = riverX[y - 1];
      riverHW[y] = riverHW[y - 1];
    }
  }
}
const riverXAt = (y: number): number => riverX[clamp(Math.round(y), 0, FALL_BOT)];
const riverHWAt = (y: number): number => riverHW[clamp(Math.round(y), 0, FALL_BOT)];

// ===========================================================================
// 2. Paths: one per pair of neighbours, routed around the terrain (bridges
//    over the river, switchbacks up the range, stairs up the plateau cliff).

const pathSD = new Float32Array(N).fill(99);
const pathDY = new Float32Array(N);

function strokePath(line: readonly Sample[]): void {
  for (const p of line) {
    const r = Math.ceil(p.hw + 3);
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
        const d = Math.hypot(x - p.x, y - p.y) - p.hw;
        const i = y * W + x;
        if (d < pathSD[i]) {
          pathSD[i] = d;
          pathDY[i] = y - p.y;
        }
      }
    }
  }
}

/** Two S-curve waypoints between a and b. */
function bends(a: Pt, b: Pt, rng: RNG, amp: number): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const s = rng.chance(0.5) ? 1 : -1;
  const o1 = amp * rng.range(0.6, 1) * s;
  const o2 = -amp * rng.range(0.6, 1) * s;
  return [
    { x: a.x + dx * 0.33 - (dy / len) * o1, y: a.y + dy * 0.33 + (dx / len) * o1 },
    { x: a.x + dx * 0.67 - (dy / len) * o2, y: a.y + dy * 0.67 + (dx / len) * o2 },
  ];
}

interface Bridge {
  x: number;
  y: number;
  horizontal: boolean;
  len: number;
}
const BRIDGES: Bridge[] = [];

interface Route {
  ways: Pt[];
  pins: Pt[];
  hw: number;
  amp: number;
}

function routeFor(a: Place, b: Place, rng: RNG): Route {
  const pick = (biome: Biome): Pt => (a.biome === biome ? a.map : b.map);
  const key = [a.biome, b.biome].sort().join('+');
  switch (key) {
    case 'meadow+town': {
      const h = pick('town');
      const m = pick('meadow');
      const exit = { x: h.x + 26, y: h.y + 3 };
      return { ways: [h, exit, ...bends(exit, m, rng, 8), m], pins: [], hw: 2.2, amp: 1.4 };
    }
    case 'forest+quarry': {
      const f = pick('forest');
      const q = pick('quarry');
      const rimPt = { x: QPIT.x + QPIT_R.x + 6, y: q.y + 5 };
      return { ways: [f, ...bends(f, rimPt, rng, 9), rimPt, { x: q.x + 18, y: q.y + 2 }, q], pins: [], hw: 2.2, amp: 1.4 };
    }
    case 'mountain+quarry': {
      const q = pick('quarry');
      const t = pick('mountain');
      const zig = (k: number, dx: number): Pt => ({ x: t.x + dx, y: t.y + k });
      return {
        ways: [q, { x: q.x + 3, y: QPIT.y - QPIT_R.y + 4 }, zig(66, -4), zig(52, 13), zig(42, -12), zig(31, 12), zig(20, -6), t],
        pins: [],
        hw: 1.8,
        amp: 0.6,
      };
    }
    case 'mountain+ruins': {
      const t = pick('mountain');
      const r = pick('ruins');
      const w0 = { x: GORGE_X - 10, y: BRIDGE_A_Y };
      const w1 = { x: GORGE_X + 10, y: BRIDGE_A_Y };
      BRIDGES.push({ x: GORGE_X, y: BRIDGE_A_Y, horizontal: true, len: Math.round(riverHWAt(BRIDGE_A_Y) * 2) + 7 });
      return {
        ways: [
          t,
          { x: t.x + 26, y: t.y - 12 },
          { x: GORGE_X - 24, y: BRIDGE_A_Y + 2 },
          w0,
          w1,
          { x: GORGE_X + 28, y: BRIDGE_A_Y - 6 },
          { x: lerp(GORGE_X, r.x, 0.62), y: lerp(BRIDGE_A_Y, r.y, 0.62) + 5 },
          r,
        ],
        pins: [w0, w1],
        hw: 1.8,
        amp: 1,
      };
    }
    case 'lakeside+ruins': {
      const l = pick('lakeside');
      const r = pick('ruins');
      const b0 = { x: BRIDGE_B_X, y: INLET_Y + 11 };
      const b1 = { x: BRIDGE_B_X, y: INLET_Y - 11 };
      const s0 = { x: STAIRS_X, y: RIM_Y + CLIFF_H + 5 };
      const s1 = { x: STAIRS_X, y: RIM_Y + CLIFF_H / 2 };
      const s2 = { x: STAIRS_X, y: RIM_Y - 4 };
      BRIDGES.push({ x: BRIDGE_B_X, y: INLET_Y, horizontal: false, len: Math.round(4.5 * 2) + 7 });
      return {
        ways: [
          l,
          { x: l.x - 16, y: l.y - 9 },
          b0,
          b1,
          { x: lerp(BRIDGE_B_X, STAIRS_X, 0.5) - 2, y: lerp(INLET_Y, RIM_Y + CLIFF_H, 0.5) },
          s0,
          s1,
          s2,
          { x: r.x + 3, y: RIM_Y - 22 },
          r,
        ],
        pins: [b0, b1, s0, s1, s2],
        hw: 2,
        amp: 1,
      };
    }
    default: {
      const p = a.map;
      const q = b.map;
      return { ways: [p, ...bends(p, q, rng, 10), q], pins: [], hw: 2.2, amp: 1.4 };
    }
  }
}

const EDGES: [Place, Place][] = [];
{
  const byId = new Map<string, Place>(PLACES.map((p) => [p.id, p]));
  for (const p of PLACES) {
    for (const id of p.neighbours) {
      const q = byId.get(id);
      if (!q) throw new Error(`${p.id} lists an unknown neighbour ${id}`);
      if (PLACES.indexOf(p) < PLACES.indexOf(q)) EDGES.push([p, q]);
    }
  }
}

const rngPaths = stream();
const PATH_LINES: Sample[][] = [];
for (const [a, b] of EDGES) {
  const route = routeFor(a, b, rngPaths);
  const line = wiggle(
    spline(route.ways.map((p) => ({ x: p.x, y: p.y, hw: route.hw }))),
    rngPaths,
    route.amp,
    route.pins,
  );
  PATH_LINES.push(line);
  strokePath(line);
}

// ===========================================================================
// 3. Ground: biomes from distance to each place plus noise.

const nBig = new Noise(stream(), 56, W, H);
const nMid = new Noise(stream(), 22, W, H);
const nEdge = new Noise(stream(), 9, W, H);
const nEdge2 = new Noise(stream(), 17, W, H);

const MTN_FOOT: Pt[] = [
  { x: -20, y: TRAIL_AT.y + 64 },
  { x: TRAIL_AT.x - 36, y: TRAIL_AT.y + 58 },
  { x: TRAIL_AT.x + 8, y: TRAIL_AT.y + 50 },
  { x: TRAIL_AT.x + 40, y: TRAIL_AT.y + 38 },
  { x: GORGE_X - 8, y: FALL_BOT },
];
const mtnFootY = (x: number): number => polyY(MTN_FOOT, x) + (nEdge2.at(x, 30) - 0.5) * 12;
const rimY = (x: number): number =>
  Math.abs(x - GORGE_X) < 10 ? RIM_Y : RIM_Y + Math.round((nEdge2.at(x, 7) - 0.5) * 8);
const inCliff = (x: number, y: number): boolean => x >= GORGE_X - 12 && y >= rimY(x) && y < rimY(x) + CLIFF_H;
const inPlateau = (x: number, y: number): boolean =>
  y < rimY(x) && x > riverXAt(y) + riverHWAt(y) + 3 + (nEdge.at(x, y) > 0.6 ? 1 : 0);
const inMountains = (x: number, y: number): boolean =>
  y < mtnFootY(x) && (y > FALL_BOT ? x < GORGE_X - 8 : x < riverXAt(y) - riverHWAt(y) - 3);
const inGorge = (x: number, y: number): boolean => y < FALL_TOP + 1 && Math.abs(x - riverXAt(y)) < riverHWAt(y) + 4;
function quarryLevel(x: number, y: number): number {
  const e = ellipseD(x, y, QPIT, QPIT_R) + (nEdge.at(x + 40, y) - 0.5) * 0.1;
  if (e >= 1) return -1;
  return e > 0.78 ? 0 : e > 0.58 ? 1 : e > 0.38 ? 2 : 3;
}
const inWoods = (x: number, y: number): boolean => ellipseD(x, y, WOODS_C, WOODS_R) + (nEdge2.at(x, y) - 0.5) * 0.4 < 1;
const inMeadow = (x: number, y: number): boolean =>
  Math.hypot(x - MEADOW_AT.x, (y - MEADOW_AT.y) * 1.1) + (nEdge2.at(x + 60, y) - 0.5) * 26 < 76;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let k: number;
    if (inCliff(x, y)) k = K.cliff;
    else if (inPlateau(x, y)) k = K.plateau;
    else if (inMountains(x, y)) {
      const snowY = 8 + nMid.at(x, 0) * 16 - (x > GORGE_X - 44 ? 10 : 0);
      const alt = 1 - y / mtnFootY(x) + (nMid.at(x + 90, y) - 0.5) * 0.25;
      k = y < snowY ? K.snow : alt > 0.46 && Math.hypot(x - TRAIL_AT.x, y - TRAIL_AT.y) > CLEAR_R + 6 ? K.rock : K.alpine;
    } else if (inGorge(x, y)) k = K.rock;
    else if (quarryLevel(x, y) >= 0) k = K.quarry;
    else if (inWoods(x, y)) k = K.forest;
    else if (inMeadow(x, y)) k = K.meadow;
    else k = K.grass;
    kind[i] = k;
    const t = nBig.at(x, y) * 0.55 + nMid.at(x, y) * 0.45 + (bayer(x, y) - 0.5) * 0.08;
    let c: number;
    switch (k) {
      case K.meadow:
        c = MEADOW[t > 0.58 ? 0 : t > 0.42 ? 1 : 2];
        break;
      case K.forest:
        c = GRASS[t > 0.5 ? 4 : 5];
        break;
      case K.alpine:
        c = ALPINE[t > 0.56 ? 2 : 3];
        break;
      case K.rock:
        c = inMountains(x, y) ? (t > 0.62 ? ROCK[2] : t > 0.4 ? ROCK[3] : ROCK[4]) : ROCK[t > 0.55 ? 3 : 4];
        break;
      case K.snow:
        c = SNOW[t > 0.5 ? 1 : 2];
        break;
      case K.plateau:
        c = PLATEAU[t > 0.58 ? 1 : t > 0.42 ? 2 : 3];
        break;
      default:
        c = GRASS[t > 0.6 ? 1 : t > 0.42 ? 2 : 3];
    }
    img[i] = c;
  }
}

// Mountain foot: dither the range's ground into the lowland.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < GORGE_X - 6; x++) {
    const i = y * W + x;
    if (kind[i] !== K.grass && kind[i] !== K.forest) continue;
    const foot = mtnFootY(x);
    if (y >= foot && y < foot + 4 && bayer(x, y) > (y - foot) / 4) img[i] = ALPINE[3];
  }
}

// Snowfields between the high peaks: wind-drift strokes and bare rock specks.
{
  const rng = stream();
  for (let n = 0; n < 500; n++) {
    const x = rng.int(0, GORGE_X);
    const y = rng.int(0, 40);
    if (kindAt(x, y) !== K.snow) continue;
    const len = rng.int(2, 5);
    for (let k = 0; k < len; k++) if (kindAt(x + k, y) === K.snow) put(x + k, y, k === 0 ? SNOW[3] : SNOW[2]);
    if (rng.chance(0.2) && kindAt(x, y + 1) === K.snow) put(x, y + 1, ROCK[4]);
  }
}

// Hilltop Oak's hill: a lit crown, a shaded south-east slope and a ledge at its foot.
{
  const c = { x: OAK.x, y: OAK.y - 4 };
  const r = { x: 22, y: 13 };
  for (let y = c.y - r.y - 2; y <= c.y + r.y + 3; y++) {
    for (let x = c.x - r.x - 2; x <= c.x + r.x + 2; x++) {
      if (!inside(x, y) || !GRASSY.has(kind[y * W + x])) continue;
      const e = ellipseD(x, y, c, r) + (nEdge.at(x * 2, y * 2) - 0.5) * 0.12;
      const i = y * W + x;
      const facing = ((x - c.x) / r.x) * 0.6 + ((y - c.y) / r.y) * 0.8;
      if (e <= 1) {
        const tone = e < 0.55 ? 0 : facing < -0.25 ? 0 : facing < 0.35 ? 1 : 2;
        img[i] = MEADOW[tone + (e > 0.8 && facing > 0.35 && bayer(x, y) > 0.5 ? 1 : 0)];
        if (e > 0.9 && y > c.y + 2) img[i] = GRASS[3];
      } else if (e < 1.16 && y > c.y + 2) img[i] = darker(img[i], e < 1.08 ? 2 : 1);
    }
  }
}

// --- The plateau's south cliff: basalt-like columns with a lit lip. ---------
{
  const rng = stream();
  const colStart = new Int16Array(W);
  const colEnd = new Int16Array(W);
  const colPhase = new Uint8Array(W);
  for (let x = 0; x < W; ) {
    const w = rng.int(3, 6);
    const ph = rng.int(0, 4);
    for (let k = 0; k < w && x + k < W; k++) {
      colStart[x + k] = x;
      colEnd[x + k] = Math.min(W - 1, x + w - 1);
      colPhase[x + k] = ph;
    }
    x += w;
  }
  for (let x = 0; x < W; x++) {
    const top = rimY(x);
    for (let y = top; y < top + CLIFF_H; y++) {
      if (!inside(x, y) || kind[y * W + x] !== K.cliff) continue;
      const t = y - top;
      let c: number;
      if (t === 0) c = ROCK[1];
      else if (t === CLIFF_H - 1) c = ROCK[6];
      else if (x === colEnd[x]) c = ROCK[6];
      else if (x === colStart[x]) c = t < CLIFF_H / 2 ? ROCK[2] : ROCK[3];
      else if ((t + colPhase[x]) % 5 === 0 && x !== colStart[x] + 1) c = ROCK[5];
      else c = t < 4 ? ROCK[3] : ROCK[4];
      img[y * W + x] = c;
      block(x, y);
    }
    if (inside(x, top - 1) && kind[(top - 1) * W + x] === K.plateau) img[(top - 1) * W + x] = PLATEAU[4];
    for (let k = 0; k < 2; k++) {
      const y = top + CLIFF_H + k;
      if (inside(x, y) && kind[y * W + x] !== K.cliff && x >= GORGE_X - 12) img[y * W + x] = darker(img[y * W + x], 2 - k);
    }
  }
}

// --- Flint Quarry: terraces stepping down to the pit floor. --------------------
{
  const rng = stream();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const L = quarryLevel(x, y);
      if (L < 0) continue;
      const i = y * W + x;
      const up = (k: number): number => quarryLevel(x, y - k);
      let c = L === 0 ? QUARRY[0] : L === 1 ? QUARRY[1] : QUARRY[2];
      if (L === 3) c = rng.chance(0.1) ? QUARRY[3] : rng.chance(0.04) ? QUARRY[4] : rng.chance(0.05) ? QUARRY[1] : QUARRY[2];
      if (up(1) < L) c = QUARRY[3];
      else if (up(2) < L) c = QUARRY[3];
      else if (up(3) < L) c = QUARRY[4];
      else if (up(4) < L) c = QUARRY[5];
      else if (quarryLevel(x, y + 1) < L) c = QUARRY[4];
      else if (quarryLevel(x - 1, y) < L || quarryLevel(x + 1, y) < L) c = QUARRY[3];
      if (quarryLevel(x, y - 1) === L && quarryLevel(x, y + 1) > L) c = QUARRY[0];
      img[i] = c;
    }
  }
  // cart rails round the south side of the middle terrace, with a minecart
  const railR = { x: QPIT_R.x * 0.68, y: QPIT_R.y * 0.68 };
  let lastTie = -99;
  let cartSpot: Pt | null = null;
  for (let a = 0.12 * Math.PI; a < 0.88 * Math.PI; a += 0.004) {
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    for (const [k, off] of [
      [0, 0],
      [1, -2.4],
    ] as const) {
      const x = Math.round(QPIT.x + ox * (railR.x + off));
      const y = Math.round(QPIT.y + oy * (railR.y + off));
      if (quarryLevel(x, y) >= 1 && kindAt(x, y) === K.quarry) put(x, y, k === 0 ? ROCK[4] : ROCK[3]);
    }
    const arc = a * railR.x;
    if (arc - lastTie >= 3.5) {
      lastTie = arc;
      for (let off = 0.8; off >= -3.2; off -= 0.8) {
        const x = Math.round(QPIT.x + ox * (railR.x + off));
        const y = Math.round(QPIT.y + oy * (railR.y + off));
        if (kindAt(x, y) === K.quarry && colourAt(x, y) !== ROCK[4] && colourAt(x, y) !== ROCK[3]) put(x, y, WOOD[3]);
      }
    }
    if (!cartSpot && a > 0.66 * Math.PI) cartSpot = { x: Math.round(QPIT.x + ox * railR.x), y: Math.round(QPIT.y + oy * railR.y) };
  }
  if (cartSpot) landmark(CART, cartSpot.x, cartSpot.y + 1, 0);
  // the Echo Shaft: a timbered hole on the west terrace
  const shaft = { x: QPIT.x - Math.round(QPIT_R.x * 0.52), y: QPIT.y + 1 };
  for (let y = shaft.y - 3; y <= shaft.y + 3; y++) {
    for (let x = shaft.x - 4; x <= shaft.x + 4; x++) {
      const e = ellipseD(x, y, shaft, { x: 3.4, y: 2.2 });
      if (e <= 1) put(x, y, y < shaft.y ? INK : ROCK[7]);
      else if (e <= 1.45) put(x, y, y < shaft.y ? QUARRY[4] : QUARRY[0]);
    }
  }
  for (const dx of [-4, 4]) {
    put(shaft.x + dx, shaft.y - 3, WOOD[1]);
    put(shaft.x + dx, shaft.y - 2, WOOD[2]);
    put(shaft.x + dx, shaft.y - 1, WOOD[3]);
  }
  for (let x = shaft.x - 4; x <= shaft.x + 4; x++) put(x, shaft.y - 4, x === shaft.x + 4 ? WOOD[3] : WOOD[1]);
  blockDisc(shaft, 6);
}

// ===========================================================================
// 4. Water, shores and the falls.

{
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (waterSD[i] >= 0) continue;
      kind[i] = K.water;
      block(x, y);
      const depth = -waterSD[i];
      const flowing = riverSD[i] < 0 || outflowSD[i] < 0;
      let c = WATER[3];
      if (!flowing) {
        const t = depth / 9 + (bayer(x, y) - 0.5) * 0.3;
        c = t > 0.95 ? WATER[5] : t > 0.4 ? WATER[4] : WATER[3];
      } else if (depth > 2.2 && bayer(x, y) < 0.3 && y >= FALL_TOP) c = WATER[4];
      if (y < FALL_TOP) c = WATER[2];
      const landN = y > 0 && waterSD[i - W] >= 0;
      const landS = y < H - 1 && waterSD[i + W] >= 0;
      if (depth < 1.1) c = landN ? WATER[5] : landS ? WATER[1] : WATER[2];
      img[i] = c;
    }
  }
  // Ripples follow each stream's flow; the gorge churns with foam.
  const rng = stream();
  const ripple = (line: readonly Sample[], every: number): void => {
    for (let k = 4; k + 4 < line.length; k += every + rng.int(0, every)) {
      const p = line[k];
      const q = line[k + 4];
      const tx = q.x - p.x;
      const ty = q.y - p.y;
      const tl = Math.hypot(tx, ty) || 1;
      const off = rng.range(-p.hw + 1.4, p.hw - 1.4);
      const sx = p.x - (ty / tl) * off;
      const sy = p.y + (tx / tl) * off;
      const gorge = p.y < FALL_TOP;
      const len = gorge ? rng.int(2, 3) : rng.int(2, 4);
      for (let s = 0; s < len; s++) {
        const x = Math.round(sx + (tx / tl) * s);
        const y = Math.round(sy + (ty / tl) * s);
        if (inside(x, y) && waterSD[y * W + x] < -1) put(x, y, gorge ? (s === 0 ? WATER[0] : WATER[1]) : s === 0 ? WATER[1] : WATER[2]);
      }
    }
  };
  ripple(RIVER, 10);
  ripple(OUTFLOW, 12);
  for (let gy = 0; gy < H; gy += 5) {
    for (let gx = (gy / 5) % 2 === 0 ? 0 : 4; gx < W; gx += 9) {
      const x = gx + rng.int(0, 5);
      const y = gy + rng.int(0, 3);
      if (!inside(x, y)) continue;
      const i = y * W + x;
      if (waterSD[i] > -2.2 || riverSD[i] < 0 || outflowSD[i] < 0 || !rng.chance(0.5)) continue;
      const len = rng.int(2, 5);
      for (let s = 0; s < len; s++) if (waterSD[i + s] < -1.5) put(x + s, y, s === 1 ? WATER[1] : WATER[2]);
      if (rng.chance(0.2)) put(x + 1, y - 2, WATER[0]);
    }
  }
}

// Banks: a dark earth lip where land drops to water; beaches around the lake's
// south-west shore, where the lake's place is.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (waterSD[i] < 0) continue;
    const lk = lakeSD[i];
    if (lk >= 0 && lk < 7) {
      const th = Math.atan2(y - LAKE_C.y, x - LAKE_C.x);
      const wgt = clamp(0.35 + 0.8 * Math.sin(th) - 0.55 * Math.cos(th), 0, 1);
      const near = dist({ x, y }, LAKE_AT) < 34 ? 1 : 0;
      const width = 1 + 5 * Math.max(wgt, near) + (nShore.at(x, y) - 0.5) * 2;
      const isleRing = Math.hypot(x - ISLE.x, (y - ISLE.y) * 1.3) < 9;
      if (lk < width || (isleRing && lk < 2.2)) {
        kind[i] = K.sand;
        img[i] = BEACH[lk < 1.2 ? 2 : bayer(x, y) > 0.75 ? 2 : 1];
        continue;
      }
    }
    if (kind[i] === K.cliff) continue;
    if (y + 1 < H && waterSD[i + W] < 0) img[i] = kind[i] === K.sand ? BEACH[3] : EARTH[1];
    else if (y + 2 < H && waterSD[i + 2 * W] < 0 && kind[i] !== K.sand) img[i] = darker(img[i]);
    else if ((x > 0 && waterSD[i - 1] < 0) || (x + 1 < W && waterSD[i + 1] < 0)) {
      if (kind[i] !== K.sand) img[i] = darker(img[i]);
    }
  }
}

// Surf: a broken line of foam where the lake laps its beaches.
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (lakeSD[i] >= 0 || waterSD[i] >= 0) continue;
    const sandy = kind[i - 1] === K.sand || kind[i + 1] === K.sand || kind[i - W] === K.sand || kind[i + W] === K.sand;
    if (sandy && bayer(x, y) > 0.3) img[i] = bayer(x, y) > 0.7 ? WATER[1] : WATER[0];
  }
}

// The falls: streaks down the cliff, a bright brink, foam at the foot.
{
  const rng = stream();
  const hw = Math.round(riverHWAt(FALL_TOP));
  for (let y = FALL_TOP; y < FALL_BOT; y++) {
    for (let x = GORGE_X - hw; x <= GORGE_X + hw; x++) {
      const col = x - (GORGE_X - hw);
      const edge = x === GORGE_X - hw || x === GORGE_X + hw;
      let c = [WATER[1], WATER[0], WATER[2], WATER[1], WATER[0], WATER[2], WATER[1], WATER[2]][(col + (y >> 2)) % 8];
      if (edge) c = WATER[3];
      if (y === FALL_TOP) c = WATER[0];
      put(x, y, c);
      kind[y * W + x] = K.water;
      block(x, y);
    }
    put(GORGE_X - hw - 1, y, ROCK[6]);
    put(GORGE_X + hw + 1, y, ROCK[6]);
  }
  for (let k = 0; k < 40; k++) {
    const x = GORGE_X + rng.int(-hw - 3, hw + 3);
    const y = FALL_BOT + rng.int(-1, 4);
    if (inside(x, y) && waterSD[y * W + x] < 0 && Math.abs(x - GORGE_X) <= hw + 3 - Math.max(0, y - FALL_BOT)) {
      put(x, y, rng.chance(0.6) ? WATER[0] : WATER[1]);
    }
  }
}

// ===========================================================================
// 5. Paths, stairs, clearings, bridges and the dock.

{
  const rng = stream();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = pathSD[i];
      if (d > 1) continue;
      if (kind[i] === K.water) continue;
      if (kind[i] === K.cliff) {
        // stairs cut into the cliff: lit treads, dark risers, stone cheeks
        if (d <= 0.4) {
          const t = y - rimY(x);
          img[i] = d > -0.6 ? STONE[4] : t % 3 === 0 ? STONE[3] : t % 3 === 1 ? STONE[1] : STONE[2];
        } else img[i] = STONE[5];
        continue;
      }
      block(x, y);
      if (d > 0) {
        img[i] = pathDY[i] < 0 ? PATH[4] : PATH[3];
        continue;
      }
      kind[i] = K.path;
      let c = PATH[1];
      if (d > -1 && pathDY[i] < 0) c = PATH[2];
      else if (rng.chance(0.035)) c = PATH[3];
      else if (rng.chance(0.05)) c = PATH[0];
      // steps where a path climbs the quarry's terraces
      const L = quarryLevel(x, y);
      if (L >= 0) {
        if (quarryLevel(x, y - 1) < L || quarryLevel(x - 1, y) < L || quarryLevel(x + 1, y) < L) c = PATH[4];
        else if (quarryLevel(x, y - 2) < L) c = PATH[2];
      }
      img[i] = c;
    }
  }
  for (const line of PATH_LINES) for (const p of line) blockDisc(p, p.hw + 2);
}

type ClearingStyle = 'dirt' | 'sun' | 'sand' | 'alpine' | 'court';
function clearing(c: Pt, r: number, style: ClearingStyle): void {
  const rng = stream();
  for (let y = Math.floor(c.y - r - 2); y <= c.y + r + 2; y++) {
    for (let x = Math.floor(c.x - r - 2); x <= c.x + r + 2; x++) {
      if (!inside(x, y)) continue;
      const i = y * W + x;
      if (kind[i] === K.water || kind[i] === K.cliff) continue;
      const d = Math.hypot(x - c.x, (y - c.y) * 1.15) + (nEdge.at(x, y) - 0.5) * 3;
      if (d > r + 1) continue;
      const edge = d > r;
      switch (style) {
        case 'dirt':
          if (pathSD[i] > 0 && (!edge || bayer(x, y) > 0.5)) img[i] = edge ? PATH[2] : PATH[1];
          if (!edge) kind[i] = K.path;
          break;
        case 'sun':
          if (pathSD[i] > 1) img[i] = edge ? (bayer(x, y) > 0.5 ? GRASS[2] : img[i]) : d < r * 0.6 ? MEADOW[1] : MEADOW[2];
          break;
        case 'sand':
          if (pathSD[i] > 0) img[i] = edge ? (bayer(x, y) > 0.5 ? BEACH[2] : img[i]) : BEACH[1];
          kind[i] = K.sand;
          break;
        case 'alpine':
          if (pathSD[i] > 1) img[i] = edge ? ALPINE[2] : d < r * 0.55 ? ALPINE[0] : ALPINE[1];
          kind[i] = K.alpine;
          break;
        case 'court': {
          if (pathSD[i] <= -1.5 && d < r - 4) break;
          const row = Math.floor((y - c.y + 64) / 3);
          const col = Math.floor((x - c.x + 64 + (row % 2) * 2) / 4);
          const seam = (x - c.x + 64 + (row % 2) * 2) % 4 === 0 || (y - c.y + 64) % 3 === 0;
          const missing = (col * 7 + row * 13) % 11 === 0 || edge;
          img[i] = missing ? (bayer(x, y) > 0.5 ? PLATEAU[3] : STONE[3]) : seam ? STONE[3] : (col + row) % 3 === 0 ? STONE[1] : STONE[2];
          if (!missing && !seam && rng.chance(0.03)) img[i] = STONE[4];
          kind[i] = K.court;
          break;
        }
      }
    }
  }
}

clearing(MEADOW_AT, 9, 'dirt');
clearing(WOODS_AT, 16, 'sun');
clearing(LAKE_AT, 12, 'sand');
clearing(TRAIL_AT, 14, 'alpine');
clearing(RUINS_AT, 17, 'court');
for (const p of PLACES) blockDisc(p.map, CLEAR_R);

// Bridges: plank decks with rails and posts, casting a shadow on the water.
for (const b of BRIDGES) {
  const half = Math.floor(b.len / 2);
  for (let a = -half; a <= half; a++) {
    for (let c = -3; c <= 3; c++) {
      const x = b.horizontal ? b.x + a : b.x + c;
      const y = b.horizontal ? b.y + c : b.y + a;
      const railing = Math.abs(c) === 3;
      const end = Math.abs(a) === half;
      let col: number;
      if (railing) col = end || Math.abs(a) === half - 4 ? WOOD[4] : c < 0 ? WOOD[2] : WOOD[3];
      else if (end) col = WOOD[3];
      else col = Math.abs(a) % 3 === 0 ? WOOD[3] : c === -2 ? WOOD[0] : WOOD[1];
      put(x, y, col);
      block(x, y);
      if (inside(x, y)) kind[y * W + x] = K.bridge;
    }
    const sx = b.horizontal ? b.x + a : b.x + 4;
    const sy = b.horizontal ? b.y + 4 : b.y + a;
    if (inside(sx, sy) && waterSD[sy * W + sx] < 0) put(sx, sy, darker(colourAt(sx, sy), 2));
  }
}

// A path over open water means a route needs rerouting or another bridge.
{
  let gaps = 0;
  for (let i = 0; i < N; i++) if (pathSD[i] <= 0 && kind[i] === K.water) gaps++;
  if (gaps > 0) console.warn(`warning: ${gaps} path pixels cross water without a bridge`);
}

// Fisher's Dock: planks out from the beach into the lake, posts at the end.
{
  const dx = LAKE_AT.x + 19;
  let shore = LAKE_AT.y;
  while (shore > LAKE_C.y && lakeSD[shore * W + dx] >= 0) shore--;
  const y0 = shore - 11;
  const y1 = shore + 3;
  for (let y = y0; y <= y1; y++) {
    for (let x = dx - 2; x <= dx + 2; x++) {
      const edge = x === dx - 2 || x === dx + 2;
      const c = edge ? WOOD[3] : (y - y0) % 3 === 2 ? WOOD[3] : x === dx - 1 ? WOOD[0] : WOOD[1];
      put(x, y, c);
      block(x, y);
    }
    if (lakeSD[y * W + dx + 3] < 0) put(dx + 3, y, darker(colourAt(dx + 3, y), 2));
  }
  for (const px of [dx - 3, dx + 3]) {
    put(px, y0, WOOD[4]);
    put(px, y0 + 1, WOOD[4]);
  }
  for (let x = dx - 2; x <= dx + 2; x++) put(x, y0 - 1, WOOD[4]);
  blockRect(dx - 4, y0 - 2, dx + 4, y1 + 1);
}

// ===========================================================================
// 6. Ground detail: tall grass, tufts, flowers, reeds, lily pads.

/** Encounter grass: staggered clumps of upright blades, light tips over dark roots. */
const CLUMPS: readonly string[][] = [
  ['.0.0.', '01010', '12121', '23232'],
  ['0..0.', '10.10', '21121', '32232'],
  ['.0..0', '0101.', '12121', '23232'],
];
function tallGrass(c: Pt, rx: number, ry: number, rng: RNG): void {
  const inPatch = (x: number, y: number): boolean => {
    if (!inside(x, y)) return false;
    const i = y * W + x;
    if (!GRASSY.has(kind[i]) && kind[i] !== K.tall) return false;
    if (pathSD[i] < 1.5) return false;
    return ellipseD(x, y, c, { x: rx, y: ry }) + (nEdge.at(x * 2, y * 2) - 0.5) * 0.35 <= 1;
  };
  for (let y = Math.floor(c.y - ry - 2); y <= c.y + ry + 2; y++) {
    for (let x = Math.floor(c.x - rx - 2); x <= c.x + rx + 2; x++) {
      if (!inPatch(x, y)) continue;
      img[y * W + x] = TALL[3];
      kind[y * W + x] = K.tall;
    }
  }
  for (let gy = Math.floor(c.y - ry - 1), row = 0; gy <= c.y + ry; gy += 3, row++) {
    for (let gx = Math.floor(c.x - rx - 2) + (row % 2) * 2; gx <= c.x + rx; gx += 4) {
      const clump = rng.pick(CLUMPS);
      const ox = gx + rng.int(0, 1);
      for (let r = 0; r < clump.length; r++) {
        for (let q = 0; q < clump[r].length; q++) {
          const ch = clump[r][q];
          const x = ox + q;
          const y = gy + r;
          if (ch === '.' || !inside(x, y)) continue;
          if (kind[y * W + x] !== K.tall && !(r === 0 && kindAt(x, y + 1) === K.tall)) continue;
          img[y * W + x] = TALL[Number(ch)];
        }
      }
    }
  }
  for (let y = Math.floor(c.y - ry - 2); y <= c.y + ry + 3; y++) {
    for (let x = Math.floor(c.x - rx - 2); x <= c.x + rx + 2; x++) {
      if (kindAt(x, y) === K.tall && kindAt(x, y + 1) !== K.tall && inside(x, y + 1)) img[(y + 1) * W + x] = darker(img[(y + 1) * W + x], 2);
    }
  }
}

const rngDecor = stream();
{
  const m = MEADOW_AT;
  tallGrass({ x: m.x - 46, y: m.y - 22 }, 16, 10, rngDecor);
  tallGrass({ x: m.x + 34, y: m.y + 30 }, 17, 9, rngDecor);
  tallGrass({ x: m.x - 50, y: m.y + 26 }, 11, 7, rngDecor);
  tallGrass({ x: m.x + 8, y: m.y - 58 }, 12, 7, rngDecor);
  tallGrass({ x: m.x - 12, y: m.y + 52 }, 10, 6, rngDecor);
  tallGrass({ x: WOODS_AT.x + 50, y: WOODS_AT.y + 44 }, 9, 6, rngDecor);
}

const TUFTS: readonly string[][] = [
  ['l.l', '.d.'],
  ['l..l', '.dd.'],
  ['.l.', 'd.d'],
  ['l.l.l', '.d.d.'],
];
for (let gy = 0; gy < H; gy += 5) {
  for (let gx = (gy / 5) % 2 === 0 ? 0 : 3; gx < W; gx += 6) {
    const x = gx + rngDecor.int(0, 4);
    const y = gy + rngDecor.int(0, 3);
    if (!inside(x, y)) continue;
    const k = kind[y * W + x];
    if (!GRASSY.has(k)) continue;
    const p = k === K.meadow ? 0.7 : k === K.forest ? 0.35 : k === K.plateau ? 0.35 : 0.5;
    if (!rngDecor.chance(p)) continue;
    const t = rngDecor.pick(TUFTS);
    for (let r = 0; r < t.length; r++) {
      for (let q = 0; q < t[r].length; q++) {
        const ch = t[r][q];
        const px = x + q;
        const py = y + r;
        if (ch === '.' || !inside(px, py) || kind[py * W + px] !== k) continue;
        const base = img[py * W + px];
        put(px, py, ch === 'l' ? lighter(base) : darker(base));
      }
    }
  }
}

function flowerDot(x: number, y: number, c: number, big: boolean): void {
  if (!inside(x, y) || !GRASSY.has(kind[y * W + x])) return;
  if (big) {
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      if (inside(x + dx, y + dy) && GRASSY.has(kind[(y + dy) * W + x + dx])) put(x + dx, y + dy, c);
    }
    put(x, y, c === FLOWERS[1] ? AUTUMN[3] : GLASS[1]);
  } else {
    put(x, y, c);
    if (inside(x, y + 1) && GRASSY.has(kind[(y + 1) * W + x])) put(x, y + 1, darker(colourAt(x, y + 1)));
  }
}

for (let n = 0; n < 1100; n++) {
  const x = rngDecor.int(0, W - 1);
  const y = rngDecor.int(0, H - 1);
  const k = kind[y * W + x];
  if (!GRASSY.has(k) || k === K.forest) continue;
  const inMeadowArea = k === K.meadow;
  if (!inMeadowArea && !rngDecor.chance(0.35)) continue;
  const c = rngDecor.pick(FLOWERS);
  const count = rngDecor.int(2, inMeadowArea ? 6 : 4);
  for (let f = 0; f < count; f++) flowerDot(x + rngDecor.int(-3, 3), y + rngDecor.int(-2, 2), c, inMeadowArea && rngDecor.chance(0.3));
}

// The outflow runs flower-lined past the meadow.
for (let k = 0; k < OUTFLOW.length; k += 7) {
  const p = OUTFLOW[k];
  if (Math.abs(p.y - MEADOW_AT.y) > 90 || !rngDecor.chance(0.7)) continue;
  const side = rngDecor.chance(0.5) ? -1 : 1;
  const x = Math.round(p.x + side * (p.hw + rngDecor.int(2, 4)));
  const y = Math.round(p.y);
  const c = rngDecor.pick(FLOWERS);
  for (let f = 0; f < 3; f++) flowerDot(x + rngDecor.int(-1, 1) * side, y + rngDecor.int(-2, 2), c, rngDecor.chance(0.4));
}

// Reeds at the lake's north and east shores, on Heron Isle and round the pond.
function reeds(x: number, y: number): void {
  for (let k = 0; k < 3; k++) put(x, y + k, k === 0 ? EARTH[0] : k === 1 ? ALPINE[2] : ALPINE[3]);
}
for (let n = 0; n < 700; n++) {
  const x = rngDecor.int(0, W - 1);
  const y = rngDecor.int(0, H - 1);
  const i = y * W + x;
  const sd = waterSD[i];
  if (sd < -1.5 || sd > 1.5 || riverSD[i] < 2 || outflowSD[i] < 2 || blocked[i] && kind[i] !== K.water) continue;
  const lk = lakeSD[i];
  const th = Math.atan2(y - LAKE_C.y, x - LAKE_C.x);
  const isle = Math.hypot(x - ISLE.x, y - ISLE.y) < 12;
  const northEast = lk < 3 && (th < -0.2 || th > 2.6) && !isle;
  const pond = ellipseD(x, y, POND_C, POND_R) < 1.4;
  if (!isle && !northEast && !pond) continue;
  if (kind[i] === K.sand && !isle) continue;
  for (let r = 0; r < 3; r++) reeds(x + r * 2 - 2 + rngDecor.int(0, 1), y - rngDecor.int(0, 1));
}

// The pond gets its own ring of reeds and pads.
for (let y = POND_C.y - POND_R.y - 3; y <= POND_C.y + POND_R.y + 3; y++) {
  for (let x = POND_C.x - POND_R.x - 3; x <= POND_C.x + POND_R.x + 3; x++) {
    if (!inside(x, y) || ellipseD(x, y, POND_C, POND_R) > 1.4) continue;
    const sd = waterSD[y * W + x];
    if (sd > -4 && sd < -1.5 && x % 3 === 0 && rngDecor.chance(0.12)) {
      put(x, y, LEAF[3]);
      put(x + 1, y, LEAF[2]);
      put(x, y + 1, LEAF[4]);
      if (rngDecor.chance(0.3)) put(x + 1, y, FLOWERS[0]);
    } else if (sd >= 0 && sd < 1.5 && y < POND_C.y + 2 && rngDecor.chance(0.14)) reeds(x, y - 2);
  }
}

// Lily pads near the lake's calm east shore.
for (let n = 0; n < 400; n++) {
  const x = rngDecor.int(0, W - 1);
  const y = rngDecor.int(0, H - 1);
  const i = y * W + x;
  if (waterSD[i] > -2 || waterSD[i] < -6 || riverSD[i] < 3 || outflowSD[i] < 3) continue;
  if (lakeSD[i] < 0 && x < LAKE_C.x + 8) continue;
  if (!rngDecor.chance(0.35)) continue;
  put(x, y, LEAF[3]);
  put(x + 1, y, LEAF[2]);
  put(x, y + 1, LEAF[4]);
  put(x + 1, y + 1, LEAF[3]);
  if (rngDecor.chance(0.25)) put(x + 1, y, FLOWERS[0]);
}

// ===========================================================================
// 7. Places' scenery.

// --- Hearth Town: a cobbled square, lanes to each door, six buildings. -----------
{
  const h = HOME;
  const rng = stream();
  const cobble = (x: number, y: number, edge: boolean): void => {
    if (!inside(x, y)) return;
    const i = y * W + x;
    if (kind[i] === K.water) return;
    const row = y >> 1;
    const seam = (x + (row % 2) * 2) % 4 === 0 || y % 2 === 0;
    img[i] = edge ? PLAZA[3] : seam ? PLAZA[2] : (x * 3 + row * 5) % 7 === 0 ? PLAZA[0] : PLAZA[1];
    kind[i] = K.plaza;
    block(x, y);
  };
  for (let y = h.y - 16; y <= h.y + 16; y++) {
    for (let x = h.x - 18; x <= h.x + 18; x++) {
      const d = Math.hypot(x - h.x, (y - h.y) * 1.12);
      if (d <= 16) cobble(x, y, d > 15);
    }
  }
  const lane = (x0: number, y0: number, x1: number, y1: number): void => {
    const horizontal = y0 === y1;
    const [lo, hi] = horizontal ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(y0, y1), Math.max(y0, y1)];
    for (let t = lo; t <= hi; t++) {
      for (let w = -2; w <= 2; w++) {
        const x = horizontal ? t : x0 + w;
        const y = horizontal ? y0 + w : t;
        if (kindAt(x, y) === K.plaza && Math.abs(w) === 2) continue;
        cobble(x, y, Math.abs(w) === 2);
      }
    }
  };
  interface Lot {
    dx: number;
    dy: number;
    spec: HouseSpec;
    walk: readonly (readonly [number, number])[];
  }
  const red = (w: number, chimney: number, door: number, windows: number[]): HouseSpec => ({
    w,
    roofH: 9,
    wallH: 7,
    roof: ROOF_RED,
    door,
    doorW: 2,
    windows,
    chimney,
  });
  const lots: Lot[] = [
    {
      dx: 17,
      dy: -24,
      spec: { w: 25, roofH: 9, wallH: 8, roof: ROOF_RED, door: 11, doorW: 3, windows: [4, 19], trim: true, glassDoor: true },
      walk: [[0, 10]],
    },
    {
      dx: -31,
      dy: -22,
      spec: { w: 27, roofH: 10, wallH: 8, roof: ROOF_BLUE, door: 12, doorW: 3, windows: [4, 8, 18, 22], chimney: 21 },
      walk: [
        [0, 14],
        [15, 14],
      ],
    },
    { dx: -58, dy: 8, spec: red(19, 13, 8, [4, 13]), walk: [[0, 5], [40, 5]] },
    { dx: -24, dy: 42, spec: red(19, 4, 8, [4, 13]), walk: [[0, 5], [23, 5]] },
    { dx: 26, dy: 40, spec: red(19, 13, 8, [4, 13]), walk: [[0, 7], [-27, 7]] },
    { dx: -68, dy: -28, spec: red(17, 11, 7, [3, 11]), walk: [[0, 20], [37, 20]] },
  ];
  // lanes first, so the houses sit on top of them
  for (const lot of lots) {
    let x = h.x + lot.dx;
    let y = h.y + lot.dy + 1;
    for (const [ax, ay] of lot.walk) {
      if (ax === 0) {
        lane(x, y, x, y + ay);
        y += ay;
      } else {
        lane(x, y, x + ax, y);
        x += ax;
      }
    }
  }
  lane(h.x, h.y + 14, h.x, h.y + 47);
  for (const lot of lots) {
    const s = makeHouse(lot.spec);
    const fx = h.x + lot.dx;
    const fy = h.y + lot.dy;
    addSprite(s, fx, fy);
    blockSprite(s, fx, fy, false, 1);
    for (let y = fy - s.ay + 4; y <= fy + 1; y++) if (inside(fx - s.ax + s.w, y)) shadow[y * W + fx - s.ax + s.w] = 1;
    for (let x = fx - s.ax + 2; x <= fx - s.ax + s.w; x++) if (inside(x, fy + 1) && kind[(fy + 1) * W + x] !== K.plaza) shadow[(fy + 1) * W + x] = 1;
    // a flower bed under the front windows
    for (const wx of lot.spec.windows) {
      for (const k of [0, 1]) {
        const x = fx - s.ax + wx + k;
        const y = fy + 1;
        if (inside(x, y) && GRASSY.has(kind[y * W + x])) put(x, y, FLOWERS[(wx + k) % 2 === 0 ? 0 : 3]);
      }
    }
  }
  // a fenced vegetable garden south-west of the square
  const gx = h.x - 64;
  const gy = h.y + 24;
  for (let y = gy; y < gy + 10; y++) {
    for (let x = gx; x < gx + 16; x++) {
      if (!inside(x, y)) continue;
      const row = (y - gy) % 3;
      const sprout = (x - gx) % 3 !== 2;
      img[y * W + x] = row === 2 ? EARTH[2] : !sprout ? EARTH[1] : row === 0 ? LEAF[1] : LEAF[3];
      kind[y * W + x] = K.garden;
    }
  }
  const fenceTop = makeFence(18);
  landmark(fenceTop, gx + 8, gy - 1, 0);
  const fenceBottom = makeFence(18);
  landmark(fenceBottom, gx + 8, gy + 11, 0);
  blockRect(gx - 2, gy - 8, gx + 18, gy + 12);
  // blossom and shade trees between the houses, hedges along the lanes
  const trees = [makeTree(rng, 5.5, BLOSSOM), makeTree(rng, 4.5, BLOSSOM), makeTree(rng, 5, LEAF), makeTree(rng, 4.5, OAKLEAF)];
  const hedge = [makeTree(rng, 2.5, LEAF, false), makeTree(rng, 3, OAKLEAF, false)];
  for (const [dx, dy, k] of [
    [-44, -2, 0],
    [48, 14, 1],
    [6, 64, 0],
    [-4, -46, 2],
    [44, -40, 3],
    [-50, 38, 2],
    [52, 52, 3],
    [-84, 6, 3],
    [-40, 62, 1],
  ] as const) {
    const s = trees[k];
    if (!hits(s, h.x + dx, h.y + dy)) landmark(s, h.x + dx, h.y + dy, 0);
  }
  for (let k = 0; k < 90; k++) {
    const x = h.x + rng.int(-84, 70);
    const y = h.y + rng.int(-50, 66);
    const s = rng.pick(hedge);
    if (!GRASSY.has(kindAt(x, y)) || hits(s, x, y)) continue;
    const nearLane = [1, 2, 3].some((d) => kindAt(x + d, y) === K.plaza || kindAt(x - d, y) === K.plaza || kindAt(x, y + d) === K.plaza);
    if (!nearLane && !rng.chance(0.25)) continue;
    landmark(s, x, y, 0);
  }
  for (let k = 0; k < 40; k++) {
    const x = h.x + rng.int(-80, 70);
    const y = h.y + rng.int(-50, 66);
    if (GRASSY.has(kindAt(x, y)) && !blocked[y * W + x]) flowerDot(x, y, rng.pick(FLOWERS), rng.chance(0.3));
  }
}

// --- Sunny Meadow: the Hilltop Oak, a fence, the Old Signpost, sunflowers. ------
{
  const rng = stream();
  const oak = makeOak(rng);
  landmark(oak, OAK.x, OAK.y, 1);
  shadowEllipse(OAK.x + 6, OAK.y + 1, 12, 3);
  const m = MEADOW_AT;
  const tryPlace = (s: Sprite, x: number, y: number, margin = 1): boolean => {
    if (hits(s, x, y)) return false;
    landmark(s, x, y, margin);
    return true;
  };
  tryPlace(SIGNPOST, m.x - 24, m.y - 16);
  const fence = makeFence(26);
  for (let k = 0; k < 8; k++) if (tryPlace(fence, m.x + 26 + k * 2, m.y + 12 + k)) break;
  const fence2 = makeFence(16);
  for (let k = 0; k < 8; k++) if (tryPlace(fence2, m.x - 34 - k * 2, m.y - 2 - k)) break;
  const sun = { x: m.x - 36, y: m.y + 8 };
  for (let r = 0; r < 3; r++) {
    for (let q = 0; q < 4; q++) tryPlace(SUNFLOWER, sun.x + q * 5 + (r % 2) * 2, sun.y + r * 4, 0);
  }
}

// --- Mossy Woods: the shrine in its own glade, the hollow log by the stream. ----
{
  const shrine = { x: WOODS_AT.x - 38, y: WOODS_AT.y + 26 };
  clearing(shrine, 7, 'sun');
  landmark(makeShrine(), shrine.x, shrine.y + 3, 2);
  blockDisc(shrine, 9);
  const log = { x: WOODS_AT.x + 36, y: WOODS_AT.y - 56 };
  if (!hits(LOG, log.x, log.y)) landmark(LOG, log.x, log.y, 1);
}

// --- Cloudcap Trail: a cairn by the clearing. ----------------------------------------
if (!hits(CAIRN, TRAIL_AT.x - 22, TRAIL_AT.y - 12)) landmark(CAIRN, TRAIL_AT.x - 22, TRAIL_AT.y - 12, 1);

// --- Starfall Ruins: the Star Gate, a ring of pillars, broken walls, the crater. ----
{
  const rng = stream();
  const r = RUINS_AT;
  const arch = makeArch();
  landmark(arch, r.x, r.y - 22, 1);
  const ring: { a: number; d: number }[] = [];
  for (let k = 0; k < 12; k++) ring.push({ a: (k / 12) * Math.PI * 2 + rng.range(-0.12, 0.12), d: rng.range(25, 33) });
  for (const { a, d } of ring) {
    const x = Math.round(r.x + Math.cos(a) * d);
    const y = Math.round(r.y + Math.sin(a) * d * 0.8);
    const s = makePillar(rng, rng.int(10, 17), rng.chance(0.45));
    if (!hits(s, x, y)) landmark(s, x, y, 1);
  }
  for (const [dx, dy, len] of [
    [-46, -18, 20],
    [36, -34, 16],
    [-30, 30, 14],
  ] as const) {
    const s = makeWall(rng, len);
    if (!hits(s, r.x + dx, r.y + dy)) landmark(s, r.x + dx, r.y + dy, 1);
  }
  for (const [dx, dy, len] of [
    [22, 26, 12],
    [-54, 6, 10],
  ] as const) {
    const s = makeFallenPillar(len);
    if (!hits(s, r.x + dx, r.y + dy)) landmark(s, r.x + dx, r.y + dy, 1);
  }
  // the Fallen Star: a glassy crater glowing teal and violet
  const c = { x: r.x + 46, y: r.y + 8 };
  for (let y = c.y - 9; y <= c.y + 9; y++) {
    for (let x = c.x - 12; x <= c.x + 12; x++) {
      const e = ellipseD(x, y, c, { x: 8, y: 5.5 });
      if (e > 1.3) continue;
      let col: number;
      if (e > 1.0) col = y < c.y ? STONE[1] : STONE[3];
      else if (e > 0.72) col = y < c.y ? MYST[4] : MYST[3];
      else col = bayer(x, y) > 0.55 ? MYST[3] : GLOW[3];
      put(x, y, col);
    }
  }
  for (const [dx, dy, col] of [
    [0, 0, GLOW[0]],
    [-1, 0, GLOW[1]],
    [1, 0, GLOW[1]],
    [0, -1, GLOW[1]],
    [0, 1, GLOW[1]],
    [-2, 0, GLOW[2]],
    [2, 0, GLOW[2]],
    [-1, -1, MYST[1]],
    [1, 1, MYST[1]],
    [1, -1, MYST[2]],
    [-1, 1, MYST[2]],
  ] as const) {
    put(c.x + dx, c.y + dy, col);
  }
  for (let k = 0; k < 16; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(11, 20);
    const x = Math.round(c.x + Math.cos(a) * d);
    const y = Math.round(c.y + Math.sin(a) * d * 0.7);
    if (GRASSY.has(kindAt(x, y))) put(x, y, rng.pick([GLOW[1], GLOW[2], MYST[1], MYST[2]]));
  }
  blockDisc(c, 13);
}

// ===========================================================================
// 8. Props: peaks, trees and rocks fill whatever the landmarks left open.

// --- Cloudcap peaks: massifs banded from the back of the range to its foot. --------
{
  const rng = stream();
  const peakBlock = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (pathSD[i] < 4 || waterSD[i] < 3 || kind[i] === K.cliff || kind[i] === K.plateau || blocked[i] && kind[i] !== K.alpine && kind[i] !== K.rock && kind[i] !== K.snow && kind[i] !== K.grass) peakBlock[i] = 1;
  }
  const span = TRAIL_AT.y + 10;
  const tryPeak = (ax: number, baseY: number, h: number, bwl: number, bwr: number, snow: number): boolean => {
    const s = makePeak(rng, bwl, bwr, h, snow);
    for (let sy = 0; sy < s.h; sy += 2) {
      for (let sx = 0; sx < s.w; sx += 2) {
        if (s.px[sy * s.w + sx] < 0) continue;
        const px = ax - s.ax + sx;
        const py = baseY - s.ay + sy;
        if (!inside(px, py)) continue;
        if (peakBlock[py * W + px]) return false;
        if (Math.hypot(px - TRAIL_AT.x, py - TRAIL_AT.y) < CLEAR_R + 3) return false;
        if (!inMountains(px, Math.min(py, mtnFootY(px) - 1))) return false;
      }
    }
    addSprite(s, ax, baseY);
    for (let sy = Math.floor(s.h * 0.3); sy < s.h; sy++) {
      for (let sx = 0; sx < s.w; sx++) if (s.px[sy * s.w + sx] >= 0) block(ax - s.ax + sx, baseY - s.ay + sy);
    }
    return true;
  };
  const bands = [
    { f0: 0.0, f1: 0.04, h0: 60, h1: 72, g0: 44, g1: 56, snow: 0.42 },
    { f0: 0.16, f1: 0.3, h0: 44, h1: 56, g0: 34, g1: 46, snow: 0.3 },
    { f0: 0.38, f1: 0.52, h0: 32, h1: 42, g0: 28, g1: 38, snow: 0.18 },
    { f0: 0.62, f1: 0.8, h0: 24, h1: 32, g0: 24, g1: 32, snow: 0.08 },
  ];
  // After the bands, smaller peaks fill whatever high scree is still bare.
  const fill = (): void => {
    for (let n = 0; n < 160; n++) {
      const x = rng.int(0, GORGE_X - 8);
      const baseY = rng.int(20, Math.round(TRAIL_AT.y));
      if (kindAt(x, baseY - 4) !== K.rock || blocked[(baseY - 4) * W + x]) continue;
      const h = rng.int(20, 40);
      tryPeak(x, baseY, h, Math.round(h * rng.range(0.6, 0.85)), Math.round(h * rng.range(0.55, 0.8)), baseY < 60 ? 0.35 : 0.15);
    }
  };
  for (const b of bands) {
    for (let x = -rng.int(4, 20); x < GORGE_X; x += rng.int(b.g0, b.g1)) {
      const h = rng.int(b.h0, b.h1);
      const ay = Math.max(2, Math.round(span * rng.range(b.f0, b.f1)));
      const bwl = Math.round(h * rng.range(0.62, 0.95));
      const bwr = Math.round(h * rng.range(0.62, 0.95));
      tryPeak(x, ay + h, h, bwl, bwr, b.snow);
      if (rng.chance(0.5)) {
        const sh = Math.round(h * rng.range(0.52, 0.7));
        const side = rng.chance(0.5) ? -1 : 1;
        tryPeak(x + side * Math.round(h * rng.range(0.45, 0.7)), ay + h + rng.int(4, 10), sh, Math.round(sh * rng.range(0.65, 0.9)), Math.round(sh * rng.range(0.65, 0.9)), b.snow * 0.5);
      }
    }
  }
  fill();
}

// --- Trees -----------------------------------------------------------------------------
const rngTrees = stream();
const TREE_KITS = {
  leaf: [4.5, 5.5, 6.5].flatMap((r) => [0, 1, 2].map(() => makeTree(rngTrees, r, LEAF))),
  oak: [4.5, 5.5, 6.5].flatMap((r) => [0, 1].map(() => makeTree(rngTrees, r, OAKLEAF))),
  deep: [5, 6, 7].flatMap((r) => [0, 1, 2].map(() => makeTree(rngTrees, r, DEEP))),
  pine: [11, 13, 15, 17].flatMap((h) => [0, 1].map(() => makePine(rngTrees, h, PINE))),
  blossom: [4.5, 5.5].map((r) => makeTree(rngTrees, r, BLOSSOM)),
  autumn: [4.5, 5.5, 6].map((r) => makeTree(rngTrees, r, AUTUMN)),
  bush: [2.5, 3, 3.5].flatMap((r) => [0, 1].map(() => makeTree(rngTrees, r, LEAF, false))),
};

function plantTree(s: Sprite, x: number, y: number, flip: boolean): boolean {
  if (hits(s, x, y, flip)) return false;
  addSprite(s, x, y, flip);
  shadowEllipse(x + 2, y, Math.max(3, s.w * 0.4), 2);
  return true;
}

{
  const rng = rngTrees;
  const nForest = new Noise(stream(), 30, W, H);
  const nGrove = new Noise(stream(), 26, W, H);
  for (let gy = -4, row = 0; gy < H + 14; gy += 6, row++) {
    for (let gx = -6 + (row % 2) * 4; gx < W + 8; gx += 8) {
      const x = gx + rng.int(-2, 2);
      const y = gy + rng.int(-2, 1);
      const cx = clamp(x, 0, W - 1);
      const cy = clamp(y, 0, H - 1);
      const k = kind[cy * W + cx];
      const edgeDist = Math.min(x, W - 1 - x, H - 1 - y);
      const nearPlace = Math.min(...PLACES.map((p) => dist(p.map, { x, y })));
      let density: number;
      let kit: readonly Sprite[] = rng.chance(0.3) ? TREE_KITS.oak : TREE_KITS.leaf;
      if (k === K.forest) {
        density = 1;
        kit = rng.chance(0.22) ? TREE_KITS.pine : TREE_KITS.deep;
      } else if (k === K.alpine || k === K.rock || k === K.snow) {
        const foot = mtnFootY(x);
        density = k === K.snow ? 0 : k === K.rock ? 0.05 : y > foot - 24 ? 0.6 : 0.3;
        kit = TREE_KITS.pine;
      } else if (k === K.plateau) {
        const g = nGrove.at(x, y);
        density = g > 0.6 ? 0.85 : g > 0.52 ? 0.25 : 0.02;
        if (dist({ x, y }, RUINS_AT) < 48) density *= 0.15;
        kit = g > 0.56 ? TREE_KITS.autumn : TREE_KITS.pine;
      } else if (k === K.meadow) {
        density = 0.01;
      } else if (k === K.grass) {
        const f = nForest.at(x, y);
        density = f > 0.55 ? 0.95 : f > 0.47 ? 0.3 : 0.03;
        if (edgeDist < 14) density = 1;
        if (nearPlace < 44) density *= 0.2;
        if (dist({ x, y }, HOME) < 76) density = Math.min(density, dist({ x, y }, HOME) < 60 ? 0 : 0.5);
        if (rng.chance(0.08)) kit = TREE_KITS.pine;
      } else continue;
      if (!rng.chance(density)) continue;
      plantTree(rng.pick(kit), x, y, rng.chance(0.5));
    }
  }
  // bushes along forest edges and hedging the town
  for (let n = 0; n < 500; n++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    const k = kind[y * W + x];
    if (k !== K.grass && k !== K.meadow) continue;
    if (!rng.chance(dist({ x, y }, HOME) < 70 ? 0.6 : 0.3)) continue;
    plantTree(rng.pick(TREE_KITS.bush), x, y, rng.chance(0.5));
  }
}

// --- Rocks -------------------------------------------------------------------------------
{
  const rng = stream();
  const kits = [makeRock(rng, 5, 4), makeRock(rng, 6, 5), makeRock(rng, 8, 6), makeRock(rng, 10, 7), makeRock(rng, 7, 5)];
  const quarryKits = [makeRock(rng, 6, 5, QUARRY), makeRock(rng, 8, 6, QUARRY), makeRock(rng, 5, 4, QUARRY)];
  const place = (s: Sprite, x: number, y: number): boolean => {
    const flip = rng.chance(0.5);
    if (hits(s, x, y, flip)) return false;
    addSprite(s, x, y, flip);
    blockSprite(s, x, y, flip);
    shadowEllipse(x + 1, y + 1, s.w * 0.5, 1.5);
    return true;
  };
  // outcrops: tight clusters of big and small boulders
  const outcrops: Pt[] = [
    { x: W - 16, y: LAKE_AT.y + 70 },
    { x: W - 22, y: MEADOW_AT.y - 10 },
    { x: QUARRY_AT.x - 50, y: QUARRY_AT.y + 70 },
    { x: MEADOW_AT.x + 64, y: MEADOW_AT.y + 64 },
    { x: TRAIL_AT.x - 70, y: TRAIL_AT.y + 50 },
  ];
  const boulders = [makeRock(rng, 13, 9), makeRock(rng, 15, 11), makeRock(rng, 11, 8)];
  for (const o of outcrops) {
    for (let k = 0; k < 10; k++) place(rng.pick(k < 3 ? boulders : kits), o.x + rng.int(-10, 10), o.y + rng.int(-7, 7));
  }
  for (let n = 0; n < 1400; n++) {
    const x = rng.int(0, W - 1);
    const y = rng.int(0, H - 1);
    const k = kind[y * W + x];
    let p = 0;
    let kit = kits;
    if (k === K.alpine || k === K.rock) p = 0.3;
    else if (k === K.plateau) p = 0.1;
    else if (k === K.quarry) {
      p = 0.2;
      kit = quarryKits;
    } else if (k === K.grass && x > W - 60) p = 0.06;
    else if (k === K.grass || k === K.meadow) p = 0.012;
    if (rng.chance(p)) place(rng.pick(kit), x, y);
  }
}

// ===========================================================================
// 9. Shade the ground under props, then draw props back to front.

for (let i = 0; i < N; i++) {
  if (shadow[i] && kind[i] !== K.water) img[i] = darker(img[i]);
}
props.sort((a, b) => a.y - b.y || a.x - b.x);
for (const p of props) p.draw();

// ===========================================================================
// Fog: soft cloud puffs, dithered between pale blue-white and navy holes.

function buildFog(): Uint8Array {
  const S = 32;
  const rng = stream();
  // Cloud puffs merged into one soft field (metaballs); offsets wrap at the
  // tile edge so the tile repeats seamlessly.
  const layout = [
    [8, 9, 12],
    [25, 5, 9],
    [21, 21, 11],
    [4, 25, 8],
    [13, 29, 6],
    [30, 15, 6],
  ];
  const puffs = layout.map(([x, y, r]) => ({ x: x + rng.range(-1, 1), y: y + rng.range(-1, 1), r: r + rng.range(-0.5, 0.5) }));
  const wrap = (d: number): number => {
    const m = ((d % S) + S) % S;
    return m > S / 2 ? m - S : m;
  };
  const field = (x: number, y: number): number => {
    let f = 0;
    for (const p of puffs) {
      const q = (wrap(x - p.x) ** 2 + wrap(y - p.y) ** 2) / (p.r * p.r);
      if (q < 1) f += (1 - q) * (1 - q);
    }
    return f;
  };
  // [colour, alpha]: lit crest, body, underside, navy gap
  const tones: readonly (readonly [number, number])[] = [
    [0xf4f7fd, 192],
    [0xd3ddef, 180],
    [0x9aabcf, 168],
    [0x27314f, 150],
  ];
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const f = field(px, py);
      // a height field lit from the upper left: slopes rising toward the light are bright
      const light = ((field(px + 0.5, py) - field(px - 0.5, py)) * 0.55 + (field(px, py + 0.5) - field(px, py - 0.5)) * 0.75) * 4;
      const t = bayer(x, y) - 0.5;
      const tone = f + t * 0.14 < 0.14 ? 3 : light + t * 0.45 > 0.3 ? 0 : light + t * 0.45 > -0.28 ? 1 : 2;
      const [c, a] = tones[tone];
      const o = (y * S + x) * 4;
      out[o] = c >> 16;
      out[o + 1] = (c >> 8) & 0xff;
      out[o + 2] = c & 0xff;
      out[o + 3] = a;
    }
  }
  return out;
}

// ===========================================================================
// Write

function toRgba(src: Uint32Array): Uint8Array {
  const out = new Uint8Array(src.length * 4);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    out[i * 4] = c >> 16;
    out[i * 4 + 1] = (c >> 8) & 0xff;
    out[i * 4 + 2] = c & 0xff;
    out[i * 4 + 3] = 255;
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
const mapPng = encodePng(W, H, toRgba(img));
const fogPng = encodePng(32, 32, buildFog());
writeFileSync(join(OUT_DIR, 'hearthvale.png'), mapPng);
writeFileSync(join(OUT_DIR, 'fog.png'), fogPng);
console.log(`hearthvale.png ${W}×${H}, ${new Set(img).size} colours, ${mapPng.length} bytes`);
console.log(`fog.png 32×32, ${fogPng.length} bytes`);
