/**
 * Routes — level bands, unlock rules and the elapsed-time → encounter count
 * that drives idle claims (capped at 8 hours and at the route's max).
 *
 *   npx --yes tsx scripts/routes.test.ts
 */
import {
  ROUTES,
  IDLE_CAP_MS,
  routeById,
  isRouteId,
  isPartyEligible,
  isRouteUnlocked,
  encountersFor,
} from '../src/game/routes.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const r1 = routeById('r1')!;
const r2 = routeById('r2')!;

console.log('[1] route table');
check('r1 wilds are handicapped', r1.wildStatMult > 0 && r1.wildStatMult < 1);
check('two routes defined', ROUTES.length === 2);
check('r1 is unlocked from the start', isRouteUnlocked(r1, []));
check('r2 is locked until its milestone', !isRouteUnlocked(r2, []));
check('r2 unlocks with milestone:r1', isRouteUnlocked(r2, ['r1']));
check('unknown route is null', routeById('r9') === null);
check('prototype keys are not routes', routeById('constructor') === null && !isRouteId('__proto__'));

console.log('\n[2] band eligibility');
check('level 5 starter may enter r1', isPartyEligible([5], r1));
check('level 13 may not enter r1', !isPartyEligible([13], r1));
check('empty party rejected', !isPartyEligible([], r1));
check('seven mons rejected', !isPartyEligible([5, 5, 5, 5, 5, 5, 5], r1));

console.log('\n[3] encounters from elapsed time');
const min = 60_000;
check('zero elapsed → 0', encountersFor(0, r1) === 0);
check('2 minutes → 0 on a 3-minute pace', encountersFor(2 * min, r1) === 0);
check('3 minutes → 1', encountersFor(3 * min, r1) === 1);
check('30 minutes → 10', encountersFor(30 * min, r1) === 10);
const atCap = encountersFor(IDLE_CAP_MS, r1);
check('8 hours hits the route max', atCap === r1.maxEncounters);
check('20 hours is clamped to the same as 8', encountersFor(20 * 60 * min, r1) === atCap);
check('negative elapsed → 0', encountersFor(-5000, r1) === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
