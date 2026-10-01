/**
 * Derive v4 portraits and semantic material masks from the preserved masters.
 * Regions in materials-v4.json follow each portrait in 64px reference coordinates.
 * Red = skin shade, green = hair shade; 128 is the palette's middle tone.
 * Requires sharp only when rebuilding; the app consumes the checked-in PNGs.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const sharp = createRequire(import.meta.url)('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = root + 'public/sprites/trainer-portraits/v4/';
const masters = root + 'public/sprites/trainer-portraits/v1/source/';
const configs = JSON.parse(readFileSync(root + 'docs/art/trainer-portraits/materials-v4.json', 'utf8'));
const size = 256, referenceSize = 64;
mkdirSync(directory, { recursive: true });
const luminance = (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114;
function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
  }
  return result;
}
const within = (x, y, polygons) => polygons.some((polygon) => inside(x, y, polygon));
const ellipse = (x, y, [cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function hue(r, g, b) {
  const max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
  return !delta ? 0 : max === r ? ((g - b) / delta + 6) % 6 * 60 : max === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
}
const files = readdirSync(masters).filter((file) => /^[mf]\d\d\.png$/.test(file)).sort();
const stats = [];
for (const file of files) {
  const id = file.slice(0, -4), config = configs[id];
  if (!config) throw new Error(`Missing reviewed material regions: ${id}`);
  if (config.eyeEllipses.some((eye) => eye.length !== 4 || eye.some((value) => typeof value !== 'number'))) throw new Error(`Invalid eye region: ${id}`);
  const master = masters + file;
  const rgba = await sharp(master).resize(size, size, { kernel: 'nearest', fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const reference = await sharp(master).resize(referenceSize, referenceSize, { kernel: 'nearest', fit: 'fill' }).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] < 128 ? 0 : 255;
  const labels = new Uint8Array(size * size), lights = new Float32Array(size * size);
  const regions = new Uint8Array(size * size), protectedPixels = new Uint8Array(size * size);
  const [sx, sy] = config.skinSample;
  const skinReference = [...reference.subarray((sy * referenceSize + sx) * 4, (sy * referenceSize + sx) * 4 + 3)];
  const skinHue = hue(...skinReference), skinValue = Math.max(...skinReference);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const pixel = y * size + x, offset = pixel * 4;
    const regionX = (x + 0.5) * referenceSize / size, regionY = (y + 0.5) * referenceSize / size;
    if (!rgba[offset + 3]) continue;
    const [r, g, b] = rgba.subarray(offset, offset + 3), value = Math.max(r, g, b);
    lights[pixel] = luminance(r, g, b);
    if (within(regionX, regionY, config.protect) || within(regionX, regionY, config.mouthPolygons)) { protectedPixels[pixel] = 1; continue; }
    const skinZone = within(regionX, regionY, config.skinPolygons);
    const inEye = config.eyeEllipses.some((eye) => ellipse(regionX, regionY, eye));
    const saturation = value ? (value - Math.min(r, g, b)) / value : 0;
    const eyeDetail = inEye && (value < skinValue * 0.76 || saturation < 0.09 || Math.abs(hue(r, g, b) - skinHue) > 12);
    if (eyeDetail) { protectedPixels[pixel] = 1; continue; }
    regions[pixel] = skinZone ? 1 : !config.noHair && within(regionX, regionY, config.hairPolygons) ? 2 : 0;
    if (within(regionX, regionY, config.hairDetails ?? []) && value < skinValue * 0.7) regions[pixel] = 2;
  }
  // A color overwhelmingly owned by one region should not switch materials at
  // the edge of a path. This also closes single-pixel gaps in curls and skin.
  const bucket = (r, g, b) => (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
  const colorVotes = new Map();
  for (let i = 0; i < regions.length; i++) {
    const o = i * 4;
    if (!rgba[o + 3] || protectedPixels[i] || Math.max(rgba[o], rgba[o + 1], rgba[o + 2]) <= 45) continue;
    const key = bucket(rgba[o], rgba[o + 1], rgba[o + 2]);
    const votes = colorVotes.get(key) ?? [0, 0, 0];
    votes[regions[i]]++; colorVotes.set(key, votes);
  }
  // The artist paths indicate ownership, but their coarse reference coordinates
  // must not cut straight through a forehead or leave a light rim at the jaw.
  // Snap a six-source-pixel boundary band to nearby colors from trusted interiors.
  const distance = new Uint8Array(size * size).fill(255), queue = [];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x;
    if (!rgba[i * 4 + 3] || protectedPixels[i]) continue;
    for (const n of [i - 1, i + 1, i - size, i + size]) {
      if (rgba[n * 4 + 3] && !protectedPixels[n] && regions[n] !== regions[i]) { distance[i] = 0; queue.push(i); break; }
    }
  }
  const band = 6;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const i = queue[cursor];
    if (distance[i] >= band) continue;
    for (const n of [i - 1, i + 1, i - size, i + size]) {
      if (n < 0 || n >= distance.length || Math.abs(n % size - i % size) > 1 || distance[n] <= distance[i] + 1) continue;
      distance[n] = distance[i] + 1; queue.push(n);
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, offset = i * 4;
    if (!rgba[offset + 3] || protectedPixels[i]) continue;
    const [r, g, b] = rgba.subarray(offset, offset + 3);
    let material = regions[i];
    if (distance[i] <= band) {
      let best = Infinity;
      for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const n = ny * size + nx, o = n * 4;
        if (distance[n] <= band || protectedPixels[n] || !rgba[o + 3]) continue;
        const score = (r - rgba[o]) ** 2 + (g - rgba[o + 1]) ** 2 + (b - rgba[o + 2]) ** 2 + (dx * dx + dy * dy) * 2;
        if (score < best) { best = score; material = regions[n]; }
      }
    }
    if (regions[i] || distance[i] <= band) {
      const votes = [0, 0, 0];
      for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
        const rr = (r >> 3) + dr, gg = (g >> 3) + dg, bb = (b >> 3) + db;
        if (rr < 0 || rr > 31 || gg < 0 || gg > 31 || bb < 0 || bb > 31) continue;
        const nearby = colorVotes.get(rr * 1024 + gg * 32 + bb);
        if (nearby) for (let c = 0; c < 3; c++) votes[c] += nearby[c] / (1 + dr * dr + dg * dg + db * db);
      }
      const total = votes[0] + votes[1] + votes[2];
      // Only repair skin ownership this way. Hair must stay in its reviewed
      // regions; a matching brown must never dye lips, freckles or eyebrows.
      if (total >= 20 && votes[1] / total >= 0.8) material = 1;
    }
    // Some warm hair shares the skin's hue. At these reviewed hairlines, match
    // the actual source palette instead of letting noisy neighbouring pixels
    // alternate between two materials. These small regions exclude the eyes.
    const palette = config.boundaryPalette;
    if (palette && inside((x + 0.5) * referenceSize / size, (y + 0.5) * referenceSize / size, palette.polygon)) {
      let best = Infinity;
      for (const [label, colors] of [[1, palette.skin], [2, palette.hair]]) {
        for (const [rr, gg, bb] of colors) {
          const score = (r - rr) ** 2 + (g - gg) ** 2 + (b - bb) ** 2;
          if (score < best) { best = score; material = label; }
        }
      }
    }
    // Reviewed slivers at a neckline can share mixed colors with the adjacent
    // shirt. Keep those inside skin; the warm-color check below still spares ink.
    if (within((x + 0.5) * referenceSize / size, (y + 0.5) * referenceSize / size, config.skinDetails ?? [])) material = 1;
    // Keep neutral linework/eye whites exact; warm skin shadows and freckles
    // belong to skin, rather than becoming holes or accidental facial hair.
    if (material === 1 && r > g + 3 && g > b - 8 && r > b + 8 && Math.max(r, g, b) > 45) labels[i] = 1;
    if (material === 2) {
      let silhouette = false;
      if (Math.max(r, g, b) < 70) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size || !rgba[(ny * size + nx) * 4 + 3]) silhouette = true;
      }
      // Dark ink between curls is linework too, not just the outer silhouette.
      if (!silhouette && Math.max(r, g, b) > 28) labels[i] = 2;
    }
  }
  // Remove isolated ownership speckles at material boundaries. Only an opaque,
  // unprotected pixel surrounded on six sides by the other material changes;
  // this leaves eyes, accessories, silhouettes and larger detail shapes intact.
  const cleanedLabels = labels.slice();
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const pixel = y * size + x;
    if (!labels[pixel] || protectedPixels[pixel]) continue;
    const other = labels[pixel] === 1 ? 2 : 1;
    let neighbours = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (labels[(y + dy) * size + x + dx] === other) neighbours++;
    }
    if (neighbours >= 6) cleanedLabels[pixel] = other;
  }
  labels.set(cleanedLabels);
  const mask = Buffer.alloc(rgba.length);
  const counts = [];
  for (const material of [1, 2]) {
    const values = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const pixel = y * size + x;
      if (labels[pixel] !== material) continue;
      // Smooth only small source noise. A real freckle, nose line or ear shadow
      // can be just one pixel wide: replacing every pixel with the median erased it.
      const neighbours = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size && labels[ny * size + nx] === material) neighbours.push(lights[ny * size + nx]);
      }
      neighbours.sort((a, b) => a - b);
      const median = neighbours[Math.floor(neighbours.length / 2)];
      const light = Math.abs(lights[pixel] - median) <= 6 ? median : lights[pixel];
      values.push({ pixel, light });
    }
    counts.push(values.length);
    if (!values.length) continue;
    const sorted = values.map((p) => p.light).sort((a, b) => a - b);
    const middle = sorted[Math.floor(sorted.length * 0.65)];
    const low = sorted[Math.floor(sorted.length * 0.04)], high = sorted[Math.floor(sorted.length * 0.98)];
    for (const { pixel, light } of values) {
      // Skin is usually broad, flat color with a few painted details. Stretching
      // its narrow percentile range crushes shadows and exaggerates tiny flecks.
      // Encode brightness relative to the base tone instead. Hair still needs a
      // wider range so a naturally black style can take a lighter color.
      const shade = material === 1
        ? 128 + (light - middle) / Math.max(middle, 24) * (light < middle ? 192 : 384)
        : light < middle ? 128 - (middle - light) / Math.max(middle - low, 24) * 88
          : 128 + (light - middle) / Math.max(high - middle, 24) * 72;
      mask[pixel * 4 + material - 1] = Math.max(1, Math.min(224, Math.round(shade / 4) * 4));
      mask[pixel * 4 + 3] = 255;
    }
  }
  await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toFile(directory + file);
  await sharp(mask, { raw: { width: size, height: size, channels: 4 } }).png().toFile(directory + id + '-mask.png');
  stats.push({ id, skin: counts[0], hair: counts[1] });
}
writeFileSync(root + 'docs/art/trainer-portraits/material-coverage-v4.json', JSON.stringify(stats, null, 2) + '\n');
console.log('Built', files.length, 'v4 portraits and material masks.');
