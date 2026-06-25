/**
 * Species-lock rules — branch siblings may coexist; ancestor/descendant pairs may not.
 *
 *   npx --yes tsx scripts/species-lock.test.ts
 */
import {
  speciesLockConflict,
  isEvolutionAncestor,
} from '../src/game/pokemon.js';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] Linear lines block ancestor and descendant');
check('Bulbasaur + Venusaur', speciesLockConflict(1, 3));
check('Ivysaur + Venusaur', speciesLockConflict(2, 3));
check('duplicate dex id', speciesLockConflict(25, 25));

console.log('\n[2] Branch siblings do not conflict');
check('Vaporeon + Jolteon', !speciesLockConflict(134, 135));
check('Vaporeon + Umbreon', !speciesLockConflict(134, 197));
check('Vileplume + Bellossom', !speciesLockConflict(45, 182));
check('Hitmonlee + Hitmontop', !speciesLockConflict(106, 237));
check('Slowbro + Slowking', !speciesLockConflict(80, 199));
check('Beautifly + Dustox', !speciesLockConflict(267, 269));

console.log('\n[3] Pre-evolution still blocks its branch children');
check('Eevee + Flareon', speciesLockConflict(133, 136));
check('Gloom + Vileplume', speciesLockConflict(44, 45));
check('Gloom + Bellossom', speciesLockConflict(44, 182));
check('Tyrogue + Hitmonlee', speciesLockConflict(236, 106));

console.log('\n[4] Unrelated species never conflict');
check('Pikachu + Charizard', !speciesLockConflict(25, 6));
check('Nidorina + Nidorino', !speciesLockConflict(30, 33));

console.log('\n[5] isEvolutionAncestor sanity');
check('Eevee is ancestor of Espeon', isEvolutionAncestor(133, 196));
check('Espeon is not ancestor of Jolteon', !isEvolutionAncestor(196, 135));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
