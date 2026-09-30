/**
 * Professions + professors — the trainer route's fixed, weak, three-stage
 * starters. Each line must really be three stages in the dex, and the starter
 * roll must be deterministic per seed.
 *
 *   npx --yes tsx scripts/professions.test.ts
 */
import {
  PROFESSIONS,
  PROFESSORS,
  STARTER_LEVEL,
  isProfessionId,
  professorById,
  starterLine,
  rollStarter,
} from '../src/game/professions.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] professions');
check('four professions', PROFESSIONS.length === 4);
check('only trainer is unlocked', PROFESSIONS.filter((p) => !p.locked).map((p) => p.id).join() === 'trainer');
check('isProfessionId accepts trainer', isProfessionId('trainer'));
check('isProfessionId rejects junk', !isProfessionId('wizard'));

console.log('\n[2] professors and starter lines');
check('four professors', PROFESSORS.length === 4);
for (const p of PROFESSORS) {
  const line = starterLine(p);
  check(`${p.name}: line has three stages`, line.length === 3);
  check(`${p.name}: every stage is a real species`, line.every((id) => Boolean(CREATURES_BY_ID[String(id)])));
  check(`${p.name}: line starts at the starter`, line[0] === p.starterDexId);
}
check('oak gives Caterpie', professorById('oak')?.starterDexId === 10);
check('birch gives Wurmple', professorById('birch')?.starterDexId === 265);
check('unknown professor is null', professorById('nope') === null);

console.log('\n[3] starter roll');
const oak = professorById('oak')!;
const s1 = rollStarter('starter:user-1', oak);
const s2 = rollStarter('starter:user-1', oak);
check('starter is the professors species', s1.dexId === 10);
check(`starter is level ${STARTER_LEVEL}`, s1.level === STARTER_LEVEL);
check('same seed -> same sign', s1.sign === s2.sign);
check('same seed -> same ability', s1.ability === s2.ability);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
