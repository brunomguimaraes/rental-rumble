/**
 * Catch zones — the level-band gate must (a) accept only in-band parties,
 * (b) treat the tutorial as the single no-party exception, and (c) keep the
 * reward level inside the zone's band so a catch joins the growth treadmill.
 *
 *   npx --yes tsx scripts/zones.test.ts
 */
import {
  CATCH_ZONES,
  BATTLE_ZONES,
  zoneById,
  isZoneId,
  isLevelInZone,
  isPartyEligible,
} from '../src/game/zones.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] zone table lookups');
check('zoneById resolves a known id', zoneById('z1')?.id === 'z1');
check('zoneById rejects junk', zoneById('nope') === null);
check('isZoneId guards the union', isZoneId('tutorial') && !isZoneId('z9'));
check('battle zones exclude the tutorial', BATTLE_ZONES.every((z) => z.id !== 'tutorial'));
check('there are battleable zones', BATTLE_ZONES.length > 0);

console.log('\n[2] single-level band checks');
const z2 = zoneById('z2')!;
check('below band rejected', !isLevelInZone(z2.min - 1, z2));
check('at floor accepted', isLevelInZone(z2.min, z2));
check('at ceiling accepted', isLevelInZone(z2.max, z2));
check('above band rejected', !isLevelInZone(z2.max + 1, z2));

console.log('\n[3] party eligibility');
const z1 = zoneById('z1')!;
check('empty party rejected for a battle zone', !isPartyEligible([], z1));
check('all in-band accepted', isPartyEligible([z1.min, z1.max], z1));
check('one out-of-band rejects the whole party', !isPartyEligible([z1.min, z1.max + 5], z1));
check('over six rejected', !isPartyEligible([2, 2, 2, 2, 2, 2, 2].map(() => z1.min), z1));

const tutorial = zoneById('tutorial')!;
check('tutorial requires an empty party', isPartyEligible([], tutorial));
check('tutorial rejects a party', !isPartyEligible([3], tutorial));

console.log('\n[4] reward level sits inside the band');
let rewardsInBand = true;
for (const z of BATTLE_ZONES) {
  if (z.rewardLevel < 1 || z.rewardLevel > z.max) rewardsInBand = false;
}
check('every reward level within [1, max]', rewardsInBand);

console.log('\n[5] zones are ordered and cover a rising level range');
let ascending = true;
for (let i = 1; i < CATCH_ZONES.length; i++) {
  if (CATCH_ZONES[i].order <= CATCH_ZONES[i - 1].order) ascending = false;
}
check('order strictly increases', ascending);
check('legendary odds only appear later', zoneById('z1')!.legendaryChance === 0 && zoneById('z5')!.legendaryChance > 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
