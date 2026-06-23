// Audits the trainer-sprite roster: cross-checks the auto-generated sprite pools
// (trainers.gen.ts) against the curated metadata (trainers.meta.ts) and reports
//   - sprite keys with no metadata entry,
//   - famous-tier sprites (gym/elite/champion) missing a canonical `name`,
//   - the sex balance of the roadside pool (matching needs both to work),
// then writes trainer-audit.html — a labelled contact sheet you can open in a
// browser to eyeball that each sprite's sex/identity is actually correct.
//
// Run: node scripts/audit-trainers.ts   (then open the printed HTML path)
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRAINER_SPRITES,
  type TrainerCategory,
} from '../src/game/trainers.gen.ts';
import { TRAINER_ART } from '../src/game/trainers.meta.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATS: TrainerCategory[] = ['champion', 'elite', 'gym', 'random'];
const NAMED: TrainerCategory[] = ['champion', 'elite', 'gym']; // need a `name`

const problems: string[] = [];

for (const cat of CATS) {
  const keys = TRAINER_SPRITES[cat];
  const counts = { m: 0, f: 0, x: 0 };
  for (const key of keys) {
    const meta = TRAINER_ART[key];
    if (!meta) {
      problems.push(`${key}: no metadata entry in trainers.meta.ts`);
      counts.x++;
      continue;
    }
    counts[meta.gender]++;
    if (NAMED.includes(cat) && !meta.name) {
      problems.push(`${key}: famous-tier sprite has no canonical name`);
    }
  }
  const line =
    `${cat.padEnd(9)} ${String(keys.length).padStart(2)} sprites` +
    `  (m ${counts.m}, f ${counts.f}, x ${counts.x})`;
  console.log(line);
  if (cat === 'random' && (counts.m === 0 || counts.f === 0)) {
    problems.push('random: pool lacks one sex — gender matching has no choices');
  }
}

console.log(
  problems.length
    ? `\n${problems.length} issue(s):\n  ${problems.join('\n  ')}`
    : '\nAll sprites accounted for. ✔',
);

// --- Visual contact sheet ----------------------------------------------------
const cell = (cat: TrainerCategory, key: string) => {
  const meta = TRAINER_ART[key];
  const bad = !meta || (NAMED.includes(cat) && !meta.name);
  const label = meta?.name ? `<b>${meta.name}</b>` : '<i>—</i>';
  const sex = meta?.gender ?? '?';
  return `<figure class="cell${bad ? ' bad' : ''}">
    <img src="public/sprites/trainers/${key}.png"
         onmouseover="this.src='public/sprites/trainers/${key}.gif'"
         onmouseout="this.src='public/sprites/trainers/${key}.png'" />
    <figcaption>${label}<span class="meta">${key} · ${sex}</span></figcaption>
  </figure>`;
};

const section = (cat: TrainerCategory) => `<h2>${cat}</h2>
  <div class="grid">${TRAINER_SPRITES[cat].map((k) => cell(cat, k)).join('')}</div>`;

const html = `<!doctype html><meta charset="utf-8"><title>Trainer sprite audit</title>
<style>
  body { background:#1b1b1f; color:#eee; font:14px system-ui, sans-serif; margin:24px; }
  h1 { font-size:18px; } h2 { text-transform:capitalize; margin-top:28px; }
  .grid { display:flex; flex-wrap:wrap; gap:10px; }
  .cell { margin:0; width:88px; text-align:center; background:#26262c;
          border-radius:8px; padding:8px 4px; border:2px solid transparent; }
  .cell.bad { border-color:#e0533d; }
  .cell img { width:64px; height:64px; image-rendering:pixelated; }
  figcaption { font-size:12px; line-height:1.3; }
  .meta { display:block; color:#8a8a93; font-size:10px; }
</style>
<h1>Trainer sprite audit — hover a sprite to play its idle GIF</h1>
${CATS.map(section).join('\n')}`;

const out = join(root, 'trainer-audit.html');
writeFileSync(out, html);
console.log(`\ncontact sheet → ${out}`);
