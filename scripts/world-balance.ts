/**
 * Hearthvale balance report: how every starter line, alone, fares on each
 * route — training battles at Lv 5 on Sunny Meadow, training battles at each
 * route's recommended mid level, and the guardian at the route's recommended
 * maximum. Tuning aid for src/game/world-places.ts; the pass/fail gates live
 * in scripts/world.test.ts ([14]).
 *
 *   npx --yes tsx scripts/world-balance.ts
 */
import { ROUTES, routeById } from '../src/game/world.js';
import { configFor } from '../src/game/activity.js';
import { gateMember, trainingWinRate, guardianWinRate, midLevel } from './world-gates.js';
import { STARTER_POOL } from '../src/game/professions.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';

const name = (dexId: number) => CREATURES_BY_ID[String(dexId)]?.name.slice(0, 9) ?? String(dexId);
const pad = (s: string, n: number) => s.padEnd(n);

const r1 = routeById('r1');
if (r1) {
  const row = STARTER_POOL.map((base) => `${name(gateMember(base, 5, 0).dexId)} ${trainingWinRate(base, 5, configFor(r1), 300)}%`);
  console.log(`Lv 5 on Sunny Meadow (gate ≥ 95%):\n  ${row.join(' · ')}\n`);
}

console.log('Training at the recommended mid level (gate ≥ 90%, cocoons ≥ 85%):');
for (const r of ROUTES) {
  const L = midLevel(r);
  const row = STARTER_POOL.map((base) => `${name(gateMember(base, L, 0).dexId)} ${trainingWinRate(base, L, configFor(r), 200)}%`);
  console.log(`  ${pad(r.id, 7)} Lv ${L}: ${row.join(' · ')}`);
}

console.log('\nGuardian at the recommended max (gate ≥ 50%):');
for (const r of ROUTES) {
  const L = r.recommended.max;
  const row = STARTER_POOL.map((base) => `${name(gateMember(base, L, 0).dexId)} ${guardianWinRate(base, L, configFor(r), 100)}%`);
  console.log(`  ${pad(r.id, 7)} Lv ${L} vs ${name(r.guardian.dexId)} L${r.guardian.level}: ${row.join(' · ')}`);
}
