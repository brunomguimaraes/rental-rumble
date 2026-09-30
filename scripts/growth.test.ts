/**
 * Growth: floor / potential / ceiling per species, growths, minting, evolution
 * carry-over, the engine mapping, copy — and the Caterpie promise through the
 * real battle engine.
 *
 *   npx --yes tsx scripts/growth.test.ts
 */
import {
  STAT_KEYS,
  ENGINE_FACTOR,
  speciesGrowth,
  growOnce,
  mintStats,
  expectedStats,
  evolveStats,
  toEngineStats,
  isBaseStats,
  statDeltas,
  potentialWord,
  potentialSentence,
  growthLines,
  evolutionLines,
} from '../src/game/growth.js';
import { lineLength, stageOf } from '../src/game/lines.js';
import { expPercent, MAX_LEVEL } from '../src/game/levels.js';
import { RAW_DEX } from '../src/game/pokedex.gen.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { ownedMonToCreature } from '../src/game/box.js';
import { simulateBattle } from '../src/game/battle.js';
import { RNG } from '../src/game/rng.js';
import type { BaseStats, Creature } from '../src/game/types.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const CATERPIE = 10;
const METAPOD = 11;
const BUTTERFREE = 12;
const MEWTWO = 150;
const MEW = 151;
const g = (id: number) => {
  const sg = speciesGrowth(id);
  if (!sg) throw new Error(`no growth for ${id}`);
  return sg;
};
const S = (hp: number, atk: number, eatk: number, def: number, edef: number, spd: number): BaseStats => ({ hp, atk, eatk, def, edef, spd });
const eq = (a: BaseStats, b: BaseStats) => STAT_KEYS.every((k) => a[k] === b[k]);

console.log('[1] species tables are derived from base stats');
check('Caterpie floor', eq(g(CATERPIE).floor, S(4, 2, 2, 3, 2, 4)));
check('Caterpie potential (+15 young bonus)', eq(g(CATERPIE).potential, S(50, 40, 30, 43, 30, 50)));
check('Caterpie ceiling', eq(g(CATERPIE).ceiling, S(18, 12, 8, 14, 8, 18)));
check('Metapod potential (+8 middle bonus)', eq(g(METAPOD).potential, S(48, 23, 28, 53, 28, 33)));
check('Butterfree potential (no bonus)', eq(g(BUTTERFREE).potential, S(48, 35, 73, 40, 65, 55)));
check('Butterfree ceiling', eq(g(BUTTERFREE).ceiling, S(24, 18, 36, 20, 32, 28)));
check('Mewtwo potential passes 100 on Energy Attack', g(MEWTWO).potential.eatk === 125);
check('line geometry', lineLength(CATERPIE) === 3 && lineLength(MEWTWO) === 1 && stageOf(BUTTERFREE) === 2);
check('unknown species is null', speciesGrowth(99999) === null);
{
  const plain = g(MEW);
  const physical = speciesGrowth(MEW, 'physical');
  const energy = speciesGrowth(MEW, 'energy');
  check('a physical build raises the P.Atk ceiling and lowers E.Atk', physical !== null && physical.ceiling.atk > plain.ceiling.atk && physical.ceiling.eatk < plain.ceiling.eatk);
  check('an energy build does the opposite', energy !== null && energy.ceiling.eatk > plain.ceiling.eatk);
  check('a build on a lopsided species changes nothing', speciesGrowth(CATERPIE, 'physical') === speciesGrowth(CATERPIE));
}
{
  let sane = true;
  for (const e of RAW_DEX) {
    const sg = speciesGrowth(e.id);
    if (!sg) {
      sane = false;
      continue;
    }
    for (const k of STAT_KEYS) {
      if (sg.floor[k] > sg.ceiling[k] || sg.potential[k] < 10) sane = false;
      if (e.stats[k] >= 5 && Math.abs(sg.ceiling[k] * ENGINE_FACTOR - e.stats[k]) > ENGINE_FACTOR / 2) sane = false;
    }
  }
  check('every species: floor ≤ ceiling, potential ≥ 10, ceiling × factor within rounding of the base stat', sane);
}

console.log('\n[2] a growth never passes the ceiling and never comes up empty');
{
  const sg = g(CATERPIE);
  let stats = { ...sg.floor };
  const rng = new RNG('grow-caterpie');
  let overflow = false;
  let empty = false;
  for (let i = 0; i < 60; i++) {
    const r = growOnce(stats, sg, rng);
    if (STAT_KEYS.some((k) => r.stats[k] > sg.ceiling[k])) overflow = true;
    const grew = STAT_KEYS.some((k) => r.stats[k] > stats[k]);
    if (!grew && STAT_KEYS.some((k) => stats[k] < sg.ceiling[k])) empty = true;
    stats = r.stats;
  }
  check('60 growths never pass a ceiling', !overflow);
  check('no growth is empty while a stat has room', !empty);
  check('60 growths reach every Caterpie ceiling', eq(stats, sg.ceiling));
  const r = growOnce(sg.ceiling, sg, new RNG('capped'));
  check('at the ceilings nothing changes and nothing is trying hard', eq(r.stats, sg.ceiling) && !r.tryingHard && r.capped.length === 0);
}
{
  const sg = g(CATERPIE);
  let found: ReturnType<typeof growOnce> | null = null;
  for (let i = 0; i < 2000 && !found; i++) {
    const r = growOnce(sg.floor, sg, new RNG(`trying-${i}`));
    if (r.tryingHard) found = r;
  }
  check('a trying-hard growth exists', found !== null);
  check('it raises exactly one stat: the highest potential, HP on the tie with Speed', found !== null && found.gains.hp === 1 && Object.keys(found.gains).length === 1);
}
{
  const sg = g(MEWTWO);
  let stats = { ...sg.floor };
  const rng = new RNG('mewtwo');
  for (let i = 0; i < 10; i++) stats = growOnce(stats, sg, rng).stats;
  check('potential over 100 gains at least one point every growth', stats.eatk >= sg.floor.eatk + 10);
}
{
  const sg = g(CATERPIE);
  const a = growOnce(sg.floor, sg, new RNG('order'));
  const b = growOnce(sg.floor, sg, new RNG('order'));
  check('same seed, same growth', eq(a.stats, b.stats));
  // Draw-order contract: one draw per uncapped stat. With HP capped, a growth
  // consumes exactly five draws, so the RNG's next value is a fresh stream's sixth.
  const spent = new RNG('order');
  const capped = growOnce({ ...sg.floor, hp: sg.ceiling.hp }, sg, spent).stats;
  const fresh = new RNG('order');
  for (let i = 0; i < 5; i++) fresh.next();
  check('a capped stat consumes no draw', spent.next() === fresh.next());
  check('a capped HP stays put', capped.hp === sg.ceiling.hp);
}

console.log('\n[3] minting and the average individual');
check('level 1 is the floor', eq(mintStats(BUTTERFREE, 1, new RNG('x')), g(BUTTERFREE).floor));
{
  const a = mintStats(CATERPIE, 5, new RNG('starter:u:10'));
  const b = mintStats(CATERPIE, 5, new RNG('starter:u:10'));
  check('same seed mints the same stats', eq(a, b));
  check('a level-5 mint carries four growths', STAT_KEYS.reduce((n, k) => n + a[k] - g(CATERPIE).floor[k], 0) >= 4);
}
check('expected at level 1 is the floor', eq(expectedStats(BUTTERFREE, 1), g(BUTTERFREE).floor));
check('expected Butterfree at 32', eq(expectedStats(BUTTERFREE, 32), S(20, 15, 30, 16, 26, 23)));
check('expected at level 50 reaches every ceiling', eq(expectedStats(BUTTERFREE, 50), g(BUTTERFREE).ceiling));
check('unknown species mints ones', eq(mintStats(99999, 5, new RNG('x')), S(1, 1, 1, 1, 1, 1)));

console.log('\n[4] evolution carries every point and catches up');
{
  const metapod32 = S(20, 9, 10, 21, 10, 12);
  check('Metapod → Butterfree at 32 matches the spec example', eq(evolveStats(metapod32, METAPOD, BUTTERFREE, 32), S(22, 15, 30, 21, 26, 23)));
  check('deltas are per stat', eq(statDeltas(metapod32, S(22, 15, 30, 21, 26, 23)), S(2, 6, 20, 0, 16, 11)));
  const capCat = evolveStats(g(CATERPIE).ceiling, CATERPIE, METAPOD, 16);
  check("a stat above the new ceiling is kept (Speed 18 over Metapod's 12)", capCat.spd === 18);
  check('never below the average of the new form', STAT_KEYS.every((k) => capCat[k] >= expectedStats(METAPOD, 16)[k]));
  check('never below what it had', STAT_KEYS.every((k) => capCat[k] >= g(CATERPIE).ceiling[k]));
  const kept = growOnce(capCat, g(METAPOD), new RNG('kept'));
  check('and it is not rolled afterwards', kept.stats.spd === 18);
  check('unknown species leaves stats alone', eq(evolveStats(metapod32, METAPOD, 99999, 32), metapod32));
}

console.log('\n[5] engine mapping and words');
check('Caterpie ceilings map to its real base stats', eq(toEngineStats(g(CATERPIE).ceiling), CREATURES_BY_ID[String(CATERPIE)].stats));
check('Butterfree ceilings map to its real base stats', eq(toEngineStats(g(BUTTERFREE).ceiling), CREATURES_BY_ID[String(BUTTERFREE)].stats));
check('never below 1', toEngineStats(S(0, 0, 0, 0, 0, 0)).hp === 1);
check('Judge words', potentialWord(80) === 'Fantastic' && potentialWord(73) === 'Very Good' && potentialWord(50) === 'Pretty Good' && potentialWord(30) === 'Decent' && potentialWord(23) === 'No Good');
check('Judge sentence', potentialSentence('spd', 80) === 'Its Speed shows fantastic potential.');
check('growth toast', growthLines('Caterpie', { level: 6, gains: { hp: 1, spd: 1 }, capped: ['spd'], tryingHard: false }).join(' | ') === "Caterpie grew! | HP +1 · Speed +1 | Caterpie's Speed won't go any higher!");
check('trying-hard toast', growthLines('Caterpie', { level: 6, gains: { hp: 1 }, capped: [], tryingHard: true }).join(' | ') === 'Caterpie is trying hard! | HP +1');
check('evolution toast', evolutionLines('Metapod', 'Butterfree', S(2, 6, 20, 0, 16, 11)).join(' | ') === 'Metapod evolved into Butterfree! | HP +2 · P.Atk +6 · E.Atk +20 · E.Def +16 · Speed +11');
check('isBaseStats accepts six finite numbers only', isBaseStats(S(1, 2, 3, 4, 5, 6)) && !isBaseStats({ hp: 1 }) && !isBaseStats(null) && !isBaseStats({ ...S(1, 2, 3, 4, 5, 6), hp: 'x' }));
check('expPercent reads the bar', expPercent(1, 0) === 0 && expPercent(1, 10) === 50 && expPercent(1, 999) === 100 && expPercent(MAX_LEVEL, 0) === 100);

console.log('\n[6] the Caterpie promise through the engine (100 seeds)');
{
  const at = (id: number, stats: BaseStats): Creature => ({ ...CREATURES_BY_ID[String(id)], stats: toEngineStats(stats) });
  const wins = (a: Creature, b: Creature): number => {
    let n = 0;
    for (let i = 0; i < 100; i++) if (simulateBattle([a], [b], `promise#${i}`).winner === 'player') n++;
    return n;
  };
  const promise = wins(at(CATERPIE, g(CATERPIE).ceiling), at(BUTTERFREE, g(BUTTERFREE).floor));
  check(`a Caterpie at its ceilings beats a fresh Butterfree at least 85 of 100 (got ${promise})`, promise >= 85);
  const identity = wins(at(BUTTERFREE, g(BUTTERFREE).ceiling), at(CATERPIE, g(CATERPIE).ceiling));
  check(`a Butterfree at its ceilings beats a Caterpie at its ceilings at least 95 of 100 (got ${identity})`, identity >= 95);
}

console.log('\n[7] the creature the engine fights with');
{
  const base = { id: 'o1', dexId: BUTTERFREE, level: 32, exp: 0, sign: 'aries' as const, shiny: false, altColor: false, origin: 'catch' as const, caughtAt: 0 };
  const trained = ownedMonToCreature({ ...base, stats: g(BUTTERFREE).ceiling });
  check('a Butterfree at its ceilings fights with its real base stats', trained !== null && eq(trained.stats, CREATURES_BY_ID[String(BUTTERFREE)].stats));
  const fresh = ownedMonToCreature({ ...base, level: 1, stats: g(BUTTERFREE).floor });
  check('a fresh one fights at a fifth of that', fresh !== null && fresh.stats.eatk === toEngineStats(g(BUTTERFREE).floor).eatk);
  const stale = ownedMonToCreature({ ...base, stats: undefined as unknown as BaseStats });
  check('a row without stats fights as the average individual of its level', stale !== null && eq(stale.stats, toEngineStats(expectedStats(BUTTERFREE, 32))));
  check('an unknown species is null', ownedMonToCreature({ ...base, dexId: 99999, stats: g(BUTTERFREE).floor }) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
