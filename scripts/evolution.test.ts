/**
 * Evolution for owned mons: thresholds by stage, stats carried through, one
 * growth per hidden level with the evolution check after each one.
 *
 *   npx --yes tsx scripts/evolution.test.ts
 */
import {
  evolutionLevel,
  evolveOwned,
  applyGrowthWithEvolution,
  stageOf,
} from '../src/game/evolution.js';
import type { OwnedMon } from '../src/game/box.js';
import { isAbilityOption } from '../src/game/abilities.js';
import { expToNext } from '../src/game/levels.js';
import { STAT_KEYS, expectedStats, speciesGrowth } from '../src/game/growth.js';
import { RNG } from '../src/game/rng.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

function mon(over: Partial<OwnedMon>): OwnedMon {
  const level = over.level ?? 5;
  const dexId = over.dexId ?? 10;
  return {
    id: 'm1', dexId, level, exp: 0, stats: expectedStats(dexId, level), sign: 'aries', shiny: false, altColor: false,
    origin: 'starter', caughtAt: 0, ...over,
  };
}
const atLeast = (a: OwnedMon['stats'], b: OwnedMon['stats']) => STAT_KEYS.every((k) => a[k] >= b[k]);

console.log('[1] stages and thresholds');
check('Caterpie is stage 0', stageOf(10) === 0);
check('Metapod is stage 1', stageOf(11) === 1);
check('Butterfree is stage 2', stageOf(12) === 2);
check('starter Caterpie evolves at 8', evolutionLevel(10, 'starter') === 8);
check('starter Metapod evolves at 16', evolutionLevel(11, 'starter') === 16);
check('caught Caterpie evolves at 16', evolutionLevel(10, 'catch') === 16);
check('caught Metapod evolves at 32', evolutionLevel(11, 'catch') === 32);
check('Butterfree never evolves', evolutionLevel(12, 'starter') === null);

console.log('\n[2] evolveOwned keeps identity and carries stats');
const c = mon({ level: 8, ability: undefined });
const e = evolveOwned(c, new RNG('evo'));
check('became Metapod', e.dexId === 11);
check('kept sign', e.sign === c.sign);
check('kept level', e.level === 8);
check('ability is legal for Metapod', !e.ability || isAbilityOption(11, e.ability));
check('no stat went down', atLeast(e.stats, c.stats));
check('caught up to an average Metapod of its level', atLeast(e.stats, expectedStats(11, 8)));
const speedy = evolveOwned(mon({ level: 8, stats: speciesGrowth(10)!.ceiling }), new RNG('evo'));
check("a stat above the new ceiling is kept (Caterpie's Speed 18 over Metapod's 12)", speedy.stats.spd === 18);
const stale = evolveOwned({ ...c, stats: undefined as unknown as OwnedMon['stats'] }, new RNG('evo'));
check('a row without stats evolves from the average individual', atLeast(stale.stats, expectedStats(11, 8)));

console.log('\n[3] branched line is deterministic and real');
const w = mon({ id: 'wurm', dexId: 265, level: 8 });
const b1 = evolveOwned(w, new RNG(`evolve:${w.id}`));
const b2 = evolveOwned(w, new RNG(`evolve:${w.id}`));
check('Wurmple branch lands on Silcoon or Cascoon', b1.dexId === 266 || b1.dexId === 268);
check('same seed → same branch', b1.dexId === b2.dexId);

console.log('\n[4] growth crossing two thresholds evolves twice, one growth per level');
// EXP from level 7 to 17 = sum of expToNext(7..16)
let need = 0;
for (let l = 7; l < 17; l++) need += expToNext(l);
const start = mon({ level: 7 });
const g = applyGrowthWithEvolution(start, need, new RNG('grow'));
check('reached level 17', g.mon.level === 17);
check('evolved twice', g.evolutions.length === 2);
check('ended as Butterfree', g.mon.dexId === 12);
check('levelUp reports 7 → 17', g.levelUp?.fromLevel === 7 && g.levelUp?.toLevel === 17);
check('one growth per level, in order', g.growths.length === 10 && g.growths[0].level === 8 && g.growths[9].level === 17);
check('evolution deltas are never negative', g.evolutions.every((ev) => STAT_KEYS.every((k) => ev.deltas[k] >= 0)));
check('the first evolution happened at 8, the second at 16', g.evolutions[0].fromDexId === 10 && g.evolutions[1].fromDexId === 11);
check('at least an average Butterfree of level 16', atLeast(g.mon.stats, expectedStats(12, 16)));
check('never below where it started', atLeast(g.mon.stats, start.stats));
const again = applyGrowthWithEvolution(start, need, new RNG('grow'));
check('same seed → same stats', STAT_KEYS.every((k) => again.mon.stats[k] === g.mon.stats[k]));

console.log('\n[5] no gain, no change');
const z = applyGrowthWithEvolution(mon({ level: 5 }), 0, new RNG('zero'));
check('no level up', z.levelUp === null && z.evolutions.length === 0 && z.growths.length === 0);
check('stats untouched', STAT_KEYS.every((k) => z.mon.stats[k] === mon({ level: 5 }).stats[k]));

console.log('\n[6] a Pokémon already past its threshold evolves on its next growth');
const late = applyGrowthWithEvolution(mon({ level: 20, origin: 'catch' }), 0, new RNG('late'));
check('a level-20 caught Caterpie becomes Metapod with no EXP', late.mon.dexId === 11 && late.evolutions.length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
