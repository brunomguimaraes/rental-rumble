/**
 * Idle simulation — deterministic per seed, stops on the first loss, and a
 * level-5 starter wins most Route 1 fights (the tutorial promise).
 *
 *   npx --yes tsx scripts/idle.test.ts
 */
import { buildEncounter, simulateIdle, wildPool } from '../src/game/idle.js';
import { routeById } from '../src/game/routes.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { scaleCreatureToLevel } from '../src/game/levels.js';

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
const starter = [scaleCreatureToLevel(CREATURES_BY_ID['10'], 5)]; // Caterpie Lv5

console.log('[1] wild pool and encounters');
const pool = wildPool(r1);
check('weak pool is non-empty and small', pool.length > 20 && pool.length < 400);
check('weak pool has no legendaries', pool.every((c) => c.tier === 'normal'));
const w1 = buildEncounter('seed-a', r1, 0);
const w2 = buildEncounter('seed-a', r1, 0);
check('same seed+slot → same species', w1.dexId === w2.dexId);
check('wild level within ±1 of foeLevel', Math.abs(w1.stats.hp - scaleCreatureToLevel(CREATURES_BY_ID[String(w1.dexId)], r1.foeLevel).stats.hp) <= 4);
check('different slot can differ', buildEncounter('seed-a', r1, 1).dexId !== w1.dexId || buildEncounter('seed-a', r1, 2).dexId !== w1.dexId);

console.log('\n[2] simulation is deterministic and stops on loss');
const a = simulateIdle(starter, 'seed-b', r1, 20);
const b = simulateIdle(starter, 'seed-b', r1, 20);
check('same log length', a.encounters.length === b.encounters.length);
check('same outcomes', a.encounters.every((e, i) => e.won === b.encounters[i].won && e.dexId === b.encounters[i].dexId));
check('wins counted', a.wins === a.encounters.filter((e) => e.won).length);
const lostAt = a.encounters.findIndex((e) => !e.won);
check('nothing after the first loss', lostAt === -1 || a.encounters.length === lostAt + 1);
check('stoppedBy matches', (lostAt === -1 && a.stoppedBy === 'count') || (lostAt >= 0 && a.stoppedBy === 'loss'));
check('zero count → empty log', simulateIdle(starter, 'x', r1, 0).encounters.length === 0);

console.log('\n[3] a level-5 starter wins most Route 1 fights');
let wins = 0;
let fights = 0;
for (let i = 0; i < 100; i++) {
  const o = simulateIdle(starter, `sanity-${i}`, r1, 1);
  fights++;
  if (o.encounters[0]?.won) wins++;
}
console.log(`   starter win rate: ${wins}/${fights}`);
check('win rate ≥ 60%', wins / fights >= 0.6);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
