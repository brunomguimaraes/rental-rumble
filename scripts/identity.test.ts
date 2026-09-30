/**
 * Identity roll — the one roll shared by starters, tutorial gifts, wild
 * encounters and catches. Must be deterministic per seed and legal per species.
 *
 *   npx --yes tsx scripts/identity.test.ts
 */
import { rollIdentity } from '../src/game/identity.js';
import { SHINY_CHANCE, ALT_COLOR_CHANCE } from '../src/game/odds.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { RNG } from '../src/game/rng.js';
import { isAbilityOption } from '../src/game/abilities.js';
import { ALL_SIGNS } from '../src/game/zodiac.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] odds are sane');
check('shiny is rarer than alt colour', SHINY_CHANCE < ALT_COLOR_CHANCE);
check('both are probabilities', SHINY_CHANCE > 0 && ALT_COLOR_CHANCE < 1);

console.log('\n[2] roll is deterministic and legal');
const caterpie = CREATURES_BY_ID['10'];
const a = rollIdentity(caterpie, new RNG('id-test'));
const b = rollIdentity(caterpie, new RNG('id-test'));
check('same seed → same sign', a.sign === b.sign);
check('same seed → same ability', a.ability === b.ability);
check('same seed → same shiny/alt', a.shiny === b.shiny && a.altColor === b.altColor);
check('sign is a real sign', ALL_SIGNS.includes(a.sign));
check('ability is legal for the species', !a.ability || isAbilityOption(10, a.ability));
check('shiny and alt colour are exclusive', !(a.shiny && a.altColor));

console.log('\n[3] different seeds vary');
let differ = false;
for (let i = 0; i < 20 && !differ; i++) {
  const r = rollIdentity(caterpie, new RNG(`vary-${i}`));
  if (r.sign !== a.sign) differ = true;
}
check('sign varies across seeds', differ);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
