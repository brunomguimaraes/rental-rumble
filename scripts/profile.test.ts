/**
 * Nickname cleaning — the one validation both client and server run.
 *
 *   npx --yes tsx scripts/profile.test.ts
 */
import { cleanNickname } from '../src/game/profile.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] cleanNickname');
check('trims', cleanNickname('  Cat ') === 'Cat');
check('empty rejected', cleanNickname('') === null);
check('whitespace rejected', cleanNickname('   ') === null);
check('12 chars accepted', cleanNickname('abcdefghijkl') === 'abcdefghijkl');
check('13 chars rejected', cleanNickname('abcdefghijklm') === null);
check('non-string rejected', cleanNickname(42) === null);
check('control chars rejected', cleanNickname('a\u0000b') === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
