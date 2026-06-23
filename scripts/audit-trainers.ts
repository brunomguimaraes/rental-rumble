// Audits the trainer-sprite roster emitted by build-trainers.mjs: sanity-checks
// the metadata (every famous-tier sprite has a canonical name, roadside sprites
// have a class + both sexes are represented) and writes trainer-audit.html — a
// labelled contact sheet you can open in a browser to verify each sprite's
// sex/identity actually matches its art.
//
// Run: node scripts/audit-trainers.ts   (then open the printed HTML path)
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRAINER_SPRITES,
  type TrainerCategory,
} from '../src/game/trainers.gen.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATS: TrainerCategory[] = ['champion', 'elite', 'gym', 'random'];
const NAMED: TrainerCategory[] = ['champion', 'elite', 'gym'];

const problems: string[] = [];

for (const cat of CATS) {
  const sprites = TRAINER_SPRITES[cat];
  const counts = { m: 0, f: 0, x: 0 };
  for (const s of sprites) {
    counts[s.gender]++;
    if (NAMED.includes(cat) && !s.name) {
      problems.push(`${s.key}: famous-tier sprite has no canonical name`);
    }
    if (cat === 'random' && !s.cls) {
      problems.push(`${s.key}: roadside sprite has no class title`);
    }
  }
  console.log(
    `${cat.padEnd(9)} ${String(sprites.length).padStart(2)} sprites` +
      `  (m ${counts.m}, f ${counts.f}, x ${counts.x})`,
  );
  if (cat === 'random' && (counts.m === 0 || counts.f === 0)) {
    problems.push('random: pool lacks one sex — gender matching has no choices');
  }
}

console.log(
  problems.length
    ? `\n${problems.length} issue(s):\n  ${problems.join('\n  ')}`
    : '\nAll sprites carry valid metadata. ✔',
);

// --- Visual contact sheet ----------------------------------------------------
const cell = (cat: TrainerCategory, s: (typeof TRAINER_SPRITES)[TrainerCategory][number]) => {
  const label = s.name ?? s.cls ?? '<i>—</i>';
  return `<figure class="cell">
    <img src="public/sprites/trainers/${s.key}.png"
         onmouseover="this.src='public/sprites/trainers/${s.key}.gif'"
         onmouseout="this.src='public/sprites/trainers/${s.key}.png'" />
    <figcaption><b>${label}</b><span class="meta">${s.key} · ${s.gender}</span></figcaption>
  </figure>`;
};

const section = (cat: TrainerCategory) => `<h2>${cat} (${TRAINER_SPRITES[cat].length})</h2>
  <div class="grid">${TRAINER_SPRITES[cat].map((s) => cell(cat, s)).join('')}</div>`;

const html = `<!doctype html><meta charset="utf-8"><title>Trainer sprite audit</title>
<style>
  body { background:#1b1b1f; color:#eee; font:14px system-ui, sans-serif; margin:24px; }
  h1 { font-size:18px; } h2 { text-transform:capitalize; margin-top:28px; }
  .grid { display:flex; flex-wrap:wrap; gap:10px; }
  .cell { margin:0; width:96px; text-align:center; background:#26262c;
          border-radius:8px; padding:8px 4px; }
  .cell img { width:64px; height:64px; image-rendering:pixelated; }
  figcaption { font-size:12px; line-height:1.3; }
  .meta { display:block; color:#8a8a93; font-size:10px; }
</style>
<h1>Trainer sprite audit — hover a sprite to play its idle GIF</h1>
${CATS.map(section).join('\n')}`;

const out = join(root, 'trainer-audit.html');
writeFileSync(out, html);
console.log(`\ncontact sheet → ${out}`);
