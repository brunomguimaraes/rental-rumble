/**
 * Build 64px nearest-neighbor sprites and indexed material maps from the
 * generated masters. Requires sharp (NODE_PATH may point to a bundled runtime).
 * Red stores skin shading; green stores hair shading. Masks never change alpha.
 * Artist overrides live in docs/art/trainer-portraits/materials.json.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = root + 'public/sprites/trainer-portraits/v1/';
const configs = JSON.parse(readFileSync(root + 'docs/art/trainer-portraits/materials.json', 'utf8'));
const luminance = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114;
function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}
function hsv([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 * 60 : max === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
  return [hue, max ? delta / max : 0, max];
}
const defaultFace = [[28, 21], [42, 25], [52, 33], [51, 43], [39, 52], [29, 48], [22, 40], [17, 39], [17, 31], [26, 30]];
const defaultNeck = [[29, 46], [41, 49], [40, 54], [46, 56], [38, 59], [29, 57], [25, 54]];
const files = readdirSync(directory + 'source/').filter((file) => /^[mf]\d\d\.png$/.test(file)).sort();
const stats = [];
for (const file of files) {
  const id = file.slice(0, -4), config = configs[id] ?? {};
  const rgba = await sharp(directory + 'source/' + file).resize(64, 64, { kernel: 'nearest', fit: 'fill' }).ensureAlpha().raw().toBuffer();
  // Remove faint generation residue outside the portrait; keep hard pixel edges.
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] < 128 ? 0 : 255;
  const mask = Buffer.alloc(rgba.length);
  const at = (x, y) => [...rgba.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3)];
  const skinColor = config.skinColor ?? at(...(config.skinSample ?? [35, 42]));
  const hairColor = config.hairColor ?? at(...(config.hairSample ?? [30, 15]));
  const skinHsv = hsv(skinColor), hairHsv = hsv(hairColor);
  const skinValues = [], hairValues = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const offset = (y * 64 + x) * 4;
    if (!rgba[offset + 3]) continue;
    const color = at(x, y), [hue, saturation, value] = hsv(color), light = luminance(color);
    const skinZone = (config.skinPolygons ?? [defaultFace, defaultNeck]).some((polygon) => inside(x + 0.5, y + 0.5, polygon));
    const exclude = (config.exclude ?? []).some((polygon) => inside(x + 0.5, y + 0.5, polygon));
    if (exclude || value < (config.minSourceValue ?? 35)) continue;
    const skinHueDistance = Math.min(Math.abs(hue - skinHsv[0]), 360 - Math.abs(hue - skinHsv[0]));
    const hairHueDistance = Math.min(Math.abs(hue - hairHsv[0]), 360 - Math.abs(hue - hairHsv[0]));
    const skinDistance = skinHueDistance / 8 + Math.abs(saturation - skinHsv[1]) * 3 + Math.abs(value - skinHsv[2]) / 400;
    const hairDistance = hairHueDistance / 8 + Math.abs(saturation - hairHsv[1]) * 3 + Math.abs(value - hairHsv[2]) / 400;
    const isSkin = skinZone && skinHueDistance < (config.skinHueTolerance ?? 18) && saturation > 0.12
      && value > skinHsv[2] * (config.skinMinValueRatio ?? 0.6) && (config.skinPriority || config.noHair || skinDistance < hairDistance);
    const hairZone = (config.hairPolygons ?? [[[0, 0], [64, 0], [64, 51], [48, 51], [48, 61], [12, 61], [12, 51], [0, 51]]]).some((polygon) => inside(x + 0.5, y + 0.5, polygon));
    const eyeZone = (config.eyeZones ?? []).some((polygon) => inside(x + 0.5, y + 0.5, polygon));
    const isHair = !isSkin && !eyeZone && hairZone && (hairHueDistance < (config.hairHueTolerance ?? 25) || (hairHsv[1] < 0.25 && saturation < 0.25) || (config.darkHair && !skinZone && saturation < 0.25))
      && saturation > (config.hairMinSaturation ?? 0.08) && Math.abs(saturation - hairHsv[1]) < 0.4
      && value > (config.hairMinValue ?? 30) && value < Math.max(160, hairHsv[2] * 1.7);
    if (isSkin) skinValues.push({ offset, light });
    else if (isHair && !config.noHair) hairValues.push({ offset, light });
  }
  for (const [channel, values] of [[0, skinValues], [1, hairValues]]) {
    if (!values.length) continue;
    const lights = values.map((p) => p.light).sort((a, b) => a - b);
    const middle = lights[Math.floor(lights.length * 0.6)];
    for (const { offset, light } of values) {
      const shade = light < middle ? 128 + (light - middle) / Math.max(middle, 1) * 145 : 128 + (light - middle) / Math.max(255 - middle, 1) * 160;
      mask[offset + channel] = Math.max(1, Math.min(255, Math.round(shade)));
      mask[offset + 3] = 255;
    }
  }
  await sharp(rgba, { raw: { width: 64, height: 64, channels: 4 } }).png().toFile(directory + file);
  await sharp(mask, { raw: { width: 64, height: 64, channels: 4 } }).png().toFile(directory + id + '-mask.png');
  stats.push({ id, skin: skinValues.length, hair: hairValues.length });
}
writeFileSync(root + 'docs/art/trainer-portraits/material-coverage.json', JSON.stringify(stats, null, 2) + '\n');
console.log('Built', files.length, 'portraits and material masks.');
