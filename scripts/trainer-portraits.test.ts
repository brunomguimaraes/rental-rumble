/** Checked-in portrait masks: semantic landmarks and recoloring invariants. */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { TRAINER_PORTRAITS } from '../src/game/trainer-identity.js';
import { ORIGINAL_COLORS, recolorTrainerPixels, type TrainerColors } from '../src/game/trainer-colors.js';

// The builder emits non-interlaced 8-bit RGBA PNGs. Decode that small subset so
// CI can check real asset pixels without installing the art toolchain (sharp).
function readRgba(path: string) {
  const png = readFileSync(path);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) throw new Error(`Expected RGBA8 PNG: ${path}`);
  const chunks: Buffer[] = [];
  for (let i = 8; i < png.length;) {
    const length = png.readUInt32BE(i), type = png.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') chunks.push(png.subarray(i + 8, i + 8 + length));
    i += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const data = new Uint8ClampedArray(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error(`Unknown PNG filter: ${filter}`);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const a = x >= 4 ? data[i - 4] : 0, b = y ? data[i - stride] : 0, c = y && x >= 4 ? data[i - stride - 4] : 0;
      const prediction = a + b - c, pa = Math.abs(prediction - a), pb = Math.abs(prediction - b), pc = Math.abs(prediction - c);
      const prior = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      data[i] = (raw[y * (stride + 1) + x + 1] + prior) & 255;
    }
  }
  return { width, height, data };
}
let passed = 0, failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++; else { failed++; console.error(`FAIL: ${label}`); }
}
const version = process.env.TRAINER_PORTRAIT_VERSION ?? 'v4';
const path = (id: string, suffix = '') => `public/sprites/trainer-portraits/${version}/${id}${suffix}.png`;
const maps = new Map<string, Uint8ClampedArray>();
const sources = new Map<string, Uint8ClampedArray>();
const originalRegions = JSON.parse(readFileSync('docs/art/trainer-portraits/materials.json', 'utf8')) as Record<string, {skinSample: [number, number]}>;
const palettes: TrainerColors[] = [ORIGINAL_COLORS, {skinTone:'ebony',hairColor:'original'}, {skinTone:'original',hairColor:'silver'}, {skinTone:'porcelain',hairColor:'black'}];
for (const portrait of TRAINER_PORTRAITS) {
  const source = readRgba(path(portrait.id)), mask = readRgba(path(portrait.id, '-mask'));
  maps.set(portrait.id, mask.data);
  sources.set(portrait.id, source.data);
  check(`${portrait.id} mask aligns with 256px art`, source.width === 256 && source.height === 256 && mask.width === 256 && mask.height === 256);
  check(`${portrait.id} base artwork retained`, Buffer.from(source.data).equals(Buffer.from(readRgba(`public/sprites/trainer-portraits/v2/${portrait.id}.png`).data)));
  const [x,y] = originalRegions[portrait.id].skinSample;
  check(`${portrait.id} cheek follows skin palette`, Boolean(mask.data[(y * 4 * 256 + x * 4) * 4]));
  let materialErrors = 0;
  for (let i = 0; i < mask.data.length; i += 4) if ((mask.data[i] && mask.data[i+1]) || (mask.data[i+3] && !source.data[i+3])) materialErrors++;
  check(`${portrait.id} materials do not overlap or fill transparency`, materialErrors === 0);
  for (const palette of palettes) {
    const result = recolorTrainerPixels(source.data, mask.data, palette);
    let errors = 0;
    for (let i = 0; i < result.length; i += 4) {
      if (result[i+3] !== source.data[i+3]) errors++;
      const unchanged = !mask.data[i+3] || (!mask.data[i] || palette.skinTone === 'original') && (!mask.data[i+1] || palette.hairColor === 'original');
      if (unchanged && (result[i] !== source.data[i] || result[i+1] !== source.data[i+1] || result[i+2] !== source.data[i+2])) errors++;
    }
    check(`${portrait.id} ${palette.skinTone}/${palette.hairColor} preserves other materials and alpha`, errors === 0);
  }
}
// Coordinates are reviewed landmarks in the 64px drawing reference, not values
// derived from the classifier. They catch the actual holes and bleeding found
// during the visual audit; the old v2 masks fail several of these cases.
const landmarks: [string, number, number, number, string][] = [
  ['m01',12,35,0,'lower cap brim remains original'],
  ['f01',31,5,0,'headband crown remains original'],
  ['f01',45,10,0,'headband side remains original'],
  ['f09',17,57,0,'violet shoulder remains original'],
  ['m13',26,19,0,'beanie cuff remains original'],
  ['f16',31,14,0,'lower bandana band remains original'],
  ['m12',28,59,1,'neckline shadow follows skin'],
  ['f08',46.5,35,1,'exposed ear follows skin'],
  ['m07',46,26,2,'blonde hair is not skin'],
  ['f08',51,27,0,'beret remains original'],
  ['f10',17,23,0,'star clip remains original'],
  ['f16',17,24,0,'bandana remains original'],
  ['m16',21,49,0,'jacket remains original'],
  ['f09',32,55,1,'neck follows skin'],
  ['f20',31,54,1,'neck follows skin'],
  ['m19',38,20,1,'hairline follows skin'],
  ['f12',21,24,1,'forehead follows skin'],
  ['m13',30,10,0,'beanie remains original'],
  ['m03',33,13,0,'headband remains original'],
  ['m05',43,24,1,'forehead between curls follows skin'],
  ['m03',47.25,27.5,1,'temple beside the headband follows skin'],
  ['m03',25.75,56.25,1,'left neckline edge follows skin'],
  ['m03',27.75,57,1,'lower neckline edge follows skin'],
  ['m03',49,29,0,'dark curl outline stays ink when hair changes'],
  ['m05',37,23,1,'skin below the central fringe follows skin'],
  ['m05',47,26,1,'skin below the right fringe follows skin'],
];
for (const [id,x,y,expected,label] of landmarks) {
  const mask = maps.get(id)!; const i = (Math.floor(y*4)*256 + Math.floor(x*4))*4;
  const material = mask[i] ? 1 : mask[i+1] ? 2 : 0;
  check(`${id}: ${label}`, material === expected);
}
check('Dune headscarf has no recolorable hair', !maps.get('f14')!.some((value, i) => i % 4 === 1 && value > 0));
// Real painted details must survive the material map, including single-pixel
// freckles. A median over every shade erased these even though the source has them.
function lightAt(data: Uint8ClampedArray, x: number, y: number): number {
  const i = (Math.floor(y * 4) * 256 + Math.floor(x * 4)) * 4;
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}
const copper = recolorTrainerPixels(sources.get('m05')!, maps.get('m05')!, { skinTone: 'deep', hairColor: 'original' });
check('Copper retains the cheek freckle on Deep brown', lightAt(copper, 35, 34) - lightAt(copper, 36, 34) >= 10);
check('Copper retains the nose highlight on Deep brown', lightAt(copper, 42, 37) - lightAt(copper, 40, 35) >= 8);
const cobalt = recolorTrainerPixels(sources.get('m03')!, maps.get('m03')!, { skinTone: 'ebony', hairColor: 'blue' });
check('Cobalt retains inner-ear shading on Ebony', lightAt(cobalt, 33, 40) - lightAt(cobalt, 20, 30) >= 8);
check('Cobalt blue curl highlights stay blue instead of pale cyan', lightAt(cobalt, 32, 16) < 165);
console.log(`Trainer portraits (${version}): ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
