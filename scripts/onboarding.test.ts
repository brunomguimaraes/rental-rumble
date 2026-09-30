/**
 * Onboarding gate — a profile is finished only once the tutorial gift exists,
 * whatever else the box holds (legacy accounts own earlier catches).
 *
 *   npx --yes tsx scripts/onboarding.test.ts
 */
import { needsOnboarding, resumeStarterOf } from '../src/game/onboarding';
import type { OwnedMon } from '../src/game/box';
import type { Profile } from '../src/game/profile';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const profile = { mentor: 'oak' } as unknown as Profile;
const mon = (id: string, origin: OwnedMon['origin']): OwnedMon => ({
  id, dexId: 1, level: 5, exp: 0, sign: 'leo', shiny: false, altColor: false, origin, caughtAt: 0,
} as OwnedMon);

const starter = mon('s', 'starter');
const legacyA = mon('a', 'catch');
const legacyB = mon('b', 'catch');
const gift = mon('g', 'tutorial');

check('no profile needs onboarding', needsOnboarding(null, [legacyA]));
check('starter only resumes the tutorial', needsOnboarding(profile, [starter]));
check('legacy catches plus starter still resume the tutorial', needsOnboarding(profile, [legacyA, starter, legacyB]));
check('starter plus gift is done', !needsOnboarding(profile, [gift, starter]));
check('legacy box with gift is done', !needsOnboarding(profile, [legacyA, gift, starter, legacyB]));
check('resume picks the starter, not the newest row', resumeStarterOf([legacyA, starter, legacyB])?.id === 's');
check('resume is undefined without a starter', resumeStarterOf([legacyA]) === undefined);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
