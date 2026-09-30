/**
 * Level-based evolution for owned mons (affection gating arrives in slice 3).
 *
 *   npx --yes tsx scripts/evolution.test.ts
 */
import {
  evolutionLevel,
  evolveOwned,
  applyGrowthWithEvolution,
  stageOf,
} from '../src/game/evolution.js';
import type { OwnedMon } from '../src/game/box.js';
import { isAbilityOption } from '../src/game/abilities.js';
import { expToNext } from '../src/game/levels.js';
import { RNG } from '../src/game/rng.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function mon(over: Partial<OwnedMon>): OwnedMon {
  return {
    id: 'm1', dexId: 10, level: 5, exp: 0, sign: 'aries', shiny: false, altColor: false,
    origin: 'starter', caughtAt: 0, ...over,
  };
}

console.log('[1] stages and thresholds');
check('Caterpie is stage 0', stageOf(10) === 0);
check('Metapod is stage 1', stageOf(11) === 1);
check('Butterfree is stage 2', stageOf(12) === 2);
check('starter Caterpie evolves at 8', evolutionLevel(10, 'starter') === 8);
check('starter Metapod evolves at 16', evolutionLevel(11, 'starter') === 16);
check('caught Caterpie evolves at 16', evolutionLevel(10, 'catch') === 16);
check('caught Metapod evolves at 32', evolutionLevel(11, 'catch') === 32);
check('Butterfree never evolves', evolutionLevel(12, 'starter') === null);

console.log('\n[2] evolveOwned keeps identity');
const c = mon({ level: 8, ability: undefined });
const e = evolveOwned(c, new RNG('evo'));
check('became Metapod', e.dexId === 11);
check('kept sign', e.sign === c.sign);
check('kept level', e.level === 8);
check('ability is legal for Metapod', !e.ability || isAbilityOption(11, e.ability));

console.log('\n[3] branched line is deterministic and real');
const w = mon({ id: 'wurm', dexId: 265, level: 8 });
const b1 = evolveOwned(w, new RNG(`evolve:${w.id}`));
const b2 = evolveOwned(w, new RNG(`evolve:${w.id}`));
check('Wurmple branch lands on Silcoon or Cascoon', b1.dexId === 266 || b1.dexId === 268);
check('same seed → same branch', b1.dexId === b2.dexId);

console.log('\n[4] growth crossing two thresholds evolves twice');
// EXP from level 7 to 17 = sum of expToNext(7..16)
let need = 0;
for (let l = 7; l < 17; l++) need += expToNext(l);
const g = applyGrowthWithEvolution(mon({ level: 7 }), need, new RNG('grow'));
check('reached level 17', g.mon.level === 17);
check('evolved twice', g.evolutions.length === 2);
check('ended as Butterfree', g.mon.dexId === 12);
check('levelUp reports 7 → 17', g.levelUp?.fromLevel === 7 && g.levelUp?.toLevel === 17);

console.log('\n[5] no gain, no change');
const z = applyGrowthWithEvolution(mon({ level: 5 }), 0, new RNG('zero'));
check('no level up', z.levelUp === null && z.evolutions.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
