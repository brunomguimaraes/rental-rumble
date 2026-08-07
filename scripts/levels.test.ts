/**
 * Level curve — the owned-mon growth system must (a) scale stats monotonically
 * from a weak level 1 to a rental-equivalent MAX_LEVEL, (b) apply EXP with
 * correct multi-level rollover, and (c) clamp cleanly at the ceiling.
 *
 *   npx --yes tsx scripts/levels.test.ts
 */
import {
  MIN_LEVEL,
  MAX_LEVEL,
  levelStatMult,
  scaleCreatureToLevel,
  expToNext,
  applyExp,
} from '../src/game/levels.js';
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

console.log('[1] levelStatMult is monotonic and pinned at the ends');
check('level 1 is weak (<0.5)', levelStatMult(MIN_LEVEL) < 0.5);
check('max level is full strength (=1)', Math.abs(levelStatMult(MAX_LEVEL) - 1) < 1e-9);
let monotonic = true;
for (let l = MIN_LEVEL; l < MAX_LEVEL; l++) {
  if (levelStatMult(l + 1) <= levelStatMult(l)) monotonic = false;
}
check('strictly increasing across the band', monotonic);
check('clamps below MIN_LEVEL', levelStatMult(-5) === levelStatMult(MIN_LEVEL));
check('clamps above MAX_LEVEL', levelStatMult(999) === levelStatMult(MAX_LEVEL));

console.log('\n[2] scaleCreatureToLevel shrinks stats but never below 1');
const pikachu = CREATURES_BY_ID['25'];
const lowest = scaleCreatureToLevel(pikachu, MIN_LEVEL);
const maxed = scaleCreatureToLevel(pikachu, MAX_LEVEL);
check('level 1 hp < base hp', lowest.stats.hp < pikachu.stats.hp);
check('every scaled stat >= 1', Object.values(lowest.stats).every((v) => v >= 1));
check('max level restores base stats', maxed.stats.hp === pikachu.stats.hp && maxed.stats.spd === pikachu.stats.spd);
check('scaling leaves identity intact', maxed.dexId === pikachu.dexId && maxed.moves.length === pikachu.moves.length);

console.log('\n[3] expToNext grows with level and is Infinity at the cap');
check('needs more exp at higher levels', expToNext(10) > expToNext(1));
check('no exp needed past the cap', expToNext(MAX_LEVEL) === Infinity);

console.log('\n[4] applyExp rolls over levels and clamps');
const one = applyExp(1, 0, expToNext(1));
check('exact requirement levels up once', one.level === 2 && one.levelsGained === 1);
check('leftover exp carries as 0 here', one.exp === 0);

const partial = applyExp(1, 0, expToNext(1) - 1);
check('short of requirement stays level 1', partial.level === 1 && partial.levelsGained === 0);

const big = applyExp(1, 0, expToNext(1) + expToNext(2) + 3);
check('overflow spans two levels', big.level === 3 && big.levelsGained === 2);
check('remainder kept after multi-level', big.exp === 3);

const capped = applyExp(MAX_LEVEL, 0, 999999);
check('caps at MAX_LEVEL', capped.level === MAX_LEVEL && capped.exp === 0 && capped.levelsGained === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
