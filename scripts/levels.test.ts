/**
 * The hidden level: EXP applies with correct multi-level rollover, clamps at
 * the ceiling, and the EXP bar reads it as a percentage.
 *
 *   npx --yes tsx scripts/levels.test.ts
 */
import { MIN_LEVEL, MAX_LEVEL, clampLevel, expToNext, applyExp, expPercent } from '../src/game/levels.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] clampLevel');
check('clamps below MIN_LEVEL', clampLevel(-5) === MIN_LEVEL);
check('clamps above MAX_LEVEL', clampLevel(999) === MAX_LEVEL);
check('floors fractions', clampLevel(7.9) === 7);
check('NaN is MIN_LEVEL', clampLevel(Number.NaN) === MIN_LEVEL);

console.log('\n[2] expToNext grows with level and is Infinity at the cap');
check('needs more exp at higher levels', expToNext(10) > expToNext(1));
check('no exp needed past the cap', expToNext(MAX_LEVEL) === Infinity);

console.log('\n[3] applyExp rolls over levels and clamps');
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

console.log('\n[4] expPercent');
check('empty bar', expPercent(1, 0) === 0);
check('half way at level 1', expPercent(1, expToNext(1) / 2) === 50);
check('never over 100', expPercent(1, 999) === 100);
check('MAX at the cap', expPercent(MAX_LEVEL, 0) === 100);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
