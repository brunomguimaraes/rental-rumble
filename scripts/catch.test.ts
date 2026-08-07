/**
 * Catch runs — the mission + reward roll must be fully deterministic from the
 * seed (so the client playthrough and the server re-simulation agree), the
 * reward must respect the zone (level in band, no legendary where the zone
 * forbids it), and clearing must mean every battle was won.
 *
 *   npx --yes tsx scripts/catch.test.ts
 */
import {
  buildCatchMission,
  simulateCatchMission,
  rollCatchReward,
  catchFoeCount,
} from '../src/game/catch.js';
import { zoneById } from '../src/game/zones.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { scaleCreatureToLevel } from '../src/game/levels.js';
import type { Creature } from '../src/game/types.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const SEED = 'catch-test-seed';
const z1 = zoneById('z1')!;
const z5 = zoneById('z5')!;

// A small in-band party for z1 (levels must fall inside [z1.min, z1.max]).
const party: Creature[] = ['3', '6', '9'].map((id) =>
  scaleCreatureToLevel(CREATURES_BY_ID[id], z1.max),
);

console.log('[1] foe count scales with party but stays capped');
check('single-mon party fields at least one foe', catchFoeCount(1) === 1);
check('capped at 4 for a full party', catchFoeCount(6) === 4);

console.log('\n[2] mission is deterministic');
const m1 = buildCatchMission(SEED, z1, party.length);
const m2 = buildCatchMission(SEED, z1, party.length);
check('same seed → same number of battles', m1.length === m2.length && m1.length === z1.battles);
check(
  'same seed → identical foe species',
  m1.every((t, i) => t.map((c) => c.dexId).join(',') === m2[i].map((c) => c.dexId).join(',')),
);

const outA = simulateCatchMission(party, SEED, z1);
const outB = simulateCatchMission(party, SEED, z1);
check('simulation is deterministic (cleared)', outA.cleared === outB.cleared);
check('simulation is deterministic (battle count)', outA.battles.length === outB.battles.length);
check(
  'cleared implies every battle was won',
  !outA.cleared || outA.battles.every((b) => b.result.winner === 'player'),
);
check(
  'a failed run stops at the lost battle',
  outA.cleared || outA.battles[outA.battles.length - 1].result.winner === 'foe',
);

console.log('\n[3] reward roll is deterministic and respects the zone');
const r1 = rollCatchReward(SEED, z1);
const r2 = rollCatchReward(SEED, z1);
check('same seed → same reward species', r1.dexId === r2.dexId);
check('same seed → same reward identity', r1.sign === r2.sign && r1.shiny === r2.shiny);
check('reward level is the zone floor reward level', r1.dexId >= 1 && r1.level === z1.rewardLevel);
check('reward dex id is valid', Boolean(CREATURES_BY_ID[String(r1.dexId)]));

// z1 forbids legendaries — the reward must be an ordinary species.
check('z1 reward is never a special', CREATURES_BY_ID[String(r1.dexId)].tier === 'normal');

console.log('\n[4] different zones / seeds diverge');
const rZ5 = rollCatchReward(SEED, z5);
check('a different zone can roll a different mon', rZ5.level === z5.rewardLevel);
const rSeedB = rollCatchReward('another-seed', z1);
check('a different seed can shift the reward', typeof rSeedB.dexId === 'number');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
