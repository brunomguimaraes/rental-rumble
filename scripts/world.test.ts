/**
 * Hearthvale's pure rules: region integrity, unlocks and map states, reward
 * falloff, training battle counts, and the level display seams.
 *
 *   npx --yes tsx scripts/world.test.ts
 */
import {
  ROUTES,
  MAP_SIZE,
  placeById,
  routeById,
  isPlayableId,
  placeTitle,
  placeState,
  newlyUnlocked,
  unlockText,
  expSharePct,
  scaleExp,
  rateParty,
  trainingBattleCount,
  formatLevel,
  formatRecommended,
  EMPTY_PROGRESS,
  type ChoiceId,
  type ExpeditionNode,
  type ExpeditionTemplate,
  type RoutePlace,
} from '../src/game/world.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { RNG } from '../src/game/rng.js';
import type { OwnedMon } from '../src/game/box.js';
import { expectedStats } from '../src/game/growth.js';
import type { Creature } from '../src/game/types.js';
import { buildWild, pickFromPool, rollPoolWild, rollGuardian } from '../src/game/wilds.js';
import { simulateTraining, trainingFoe } from '../src/game/training.js';
import {
  initialExpedition,
  currentNode,
  resolveStep,
  checkpointView,
  replayBattle,
  parseExpeditionState,
  type StepResolution,
} from '../src/game/expedition.js';
import {
  configFor,
  parseConfig,
  parseResult,
  normaliseSnapshot,
  partyCreatures,
  planGrowth,
  type ActivityConfig,
} from '../src/game/activity.js';
import { parsePartyInput, resolveParty, sameParty, partyMembers } from '../src/game/party.js';
import { STARTER_POOL } from '../src/game/professions.js';
import { COCOONS, stageDex, midLevel, trainingWinRate, guardianWinRate } from './world-gates.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const HOUR = 60 * 60 * 1000;
const route = (id: string): RoutePlace => {
  const r = routeById(id);
  if (!r) throw new Error(`missing route ${id}`);
  return r;
};

/** Every walk from the start to the guardian: the checkpoint counts along each path. */
function pathLengths(t: ExpeditionTemplate): number[] {
  const out: number[] = [];
  const walk = (id: string, depth: number, seen: Set<string>) => {
    const node = t.nodes[id];
    if (!node || seen.has(id) || depth > 20) {
      out.push(-1);
      return;
    }
    const next = new Set(seen).add(id);
    if (node.kind === 'guardian') out.push(depth + 1);
    else if (node.kind === 'fork') node.options.forEach((o) => walk(o.next, depth + 1, next));
    else walk(node.next, depth + 1, next);
  };
  walk(t.start, 0, new Set());
  return out;
}

console.log('[1] region integrity');
const ids = ROUTES.map((r) => r.id);
check('six playable routes', ROUTES.length === 6);
check('route ids are unique', new Set(ids).size === ids.length);
check('home exists', placeById('home')?.kind === 'home');
for (const r of ROUTES) {
  for (const n of r.neighbours) {
    const other = placeById(n);
    check(`${r.id} neighbour ${n} exists`, other !== null);
    check(`${r.id} ↔ ${n} is symmetric`, Boolean(other?.neighbours.includes(r.id)));
  }
  const rares = r.wild.pool.filter((e) => e.rare);
  check(`${r.id} has exactly one rare`, rares.length === 1);
  for (const e of r.wild.pool) {
    check(`${r.id} pool ${e.dexId} is a normal-tier species`, CREATURES_BY_ID[String(e.dexId)]?.tier === 'normal');
    check(`${r.id} pool ${e.dexId} has a positive weight`, e.weight > 0);
  }
  check(`${r.id} guardian is a normal-tier species`, CREATURES_BY_ID[String(r.guardian.dexId)]?.tier === 'normal');
  check(`${r.id} wild range is ordered`, r.wild.min <= r.wild.max);
  check(`${r.id} recommended range is ordered`, r.recommended.min < r.recommended.max);
  check(`${r.id} lies on the map`, r.map.x > 0 && r.map.x < MAP_SIZE.width && r.map.y > 0 && r.map.y < MAP_SIZE.height);
  const lengths = pathLengths(r.expedition);
  check(`${r.id} every path reaches the guardian in 4–6 checkpoints (${lengths.join(',')})`, lengths.length >= 2 && lengths.every((n) => n >= 4 && n <= 6));
  const landmarkNodes = Object.values(r.expedition.nodes).filter((n) => n.kind === 'landmark');
  for (const n of landmarkNodes) {
    if (n.kind === 'landmark') check(`${r.id} node ${n.id} names a real landmark`, r.landmarks.some((l) => l.id === n.landmark));
  }
  for (const l of r.landmarks) {
    check(`${r.id} landmark ${l.id} sits on a path`, landmarkNodes.some((n) => n.kind === 'landmark' && n.landmark === l.id));
  }
}
const recMin = (id: string) => route(id).recommended.min;
check('recommended levels rise along the roads',
  recMin('r1') < recMin('r2') && recMin('r2') < recMin('lake') && recMin('r2') < recMin('quarry') &&
  recMin('quarry') < recMin('trail') && recMin('trail') < recMin('ruins') && recMin('lake') < recMin('ruins'));

console.log('\n[2] unlocks and states');
const none = new Set<string>();
const state = (id: string, cleared: Set<string>, over = {}) => placeState(route(id), { ...EMPTY_PROGRESS, ...over }, cleared);
check('fresh: Sunny Meadow is available', state('r1', none) === 'available');
check('fresh: Mossy Woods is locked', state('r2', none) === 'locked');
check('fresh: the far places are undiscovered',
  ['lake', 'quarry', 'trail', 'ruins'].every((id) => state(id, none) === 'undiscovered'));
const afterR1 = new Set(['r1']);
check('after r1: Sunny Meadow is completed', state('r1', afterR1) === 'completed');
check('after r1: Mossy Woods is available', state('r2', afterR1) === 'available');
check('after r1: lake and quarry are locked', state('lake', afterR1) === 'locked' && state('quarry', afterR1) === 'locked');
check('a visited open route is discovered', state('r1', none, { explores: 1 }) === 'discovered');
check('a trained-at open route is discovered', state('r1', none, { trainings: 1 }) === 'discovered');
const almost = new Set(['r1', 'r2', 'quarry', 'trail']);
check('ruins stay locked without the lake', state('ruins', almost) === 'locked');
check('ruins requirement names Mirror Lake', unlockText(route('ruins')).includes('Mirror Lake'));
check('ruins open with trail and lake', state('ruins', new Set([...almost, 'lake'])) === 'available');
check('clearing r2 opens lake then quarry', JSON.stringify(newlyUnlocked(afterR1, new Set(['r1', 'r2']))) === '["lake","quarry"]');
check('clearing nothing new opens nothing', newlyUnlocked(afterR1, afterR1).length === 0);
check('r1 needs nothing', unlockText(route('r1')) === 'Open from the start.');
check('r2 names Sunny Meadow', unlockText(route('r2')) === 'Beat the guardian of Sunny Meadow.');

console.log('\n[3] rewards');
const rec = { min: 3, max: 8 };
check('at the top of the range: full EXP', expSharePct(8, rec) === 100);
check('below the range: full EXP', expSharePct(2, rec) === 100);
check('one level over: 85%', expSharePct(9, rec) === 85);
check('five levels over: the 25% floor', expSharePct(13, rec) === 25);
check('far over: still 25%', expSharePct(40, rec) === 25);
check('scaleExp floors', scaleExp(10, 85) === 8);
check('scaleExp of zero', scaleExp(0, 100) === 0);
check('scaleExp ignores negative raw EXP', scaleExp(-5, 100) === 0);
check('in range: even', rateParty([5], rec) === 'even');
check('below range: risky', rateParty([2], rec) === 'risky');
check('above range: comfortable', rateParty([9], rec) === 'comfortable');
check('the strongest member decides', rateParty([2, 9], rec) === 'comfortable');
check('an empty party is risky', rateParty([], rec) === 'risky');

console.log('\n[4] training battle counts');
const r1Pace = { paceMs: 240_000, maxEncounters: 120 };
check('no time, no battles', trainingBattleCount(0, r1Pace) === 0);
check('just under one pace: none', trainingBattleCount(239_999, r1Pace) === 0);
check('exactly one pace: one', trainingBattleCount(240_000, r1Pace) === 1);
check('eight hours: 120', trainingBattleCount(8 * HOUR, r1Pace) === 120);
check('nine hours: still 120', trainingBattleCount(9 * HOUR, r1Pace) === 120);
check('a clock before the start: none', trainingBattleCount(-5, r1Pace) === 0);
check('slower pace: 96 in eight hours', trainingBattleCount(8 * HOUR, { paceMs: 300_000, maxEncounters: 96 }) === 96);
check('the count cap wins over time', trainingBattleCount(8 * HOUR, { paceMs: 240_000, maxEncounters: 10 }) === 10);
check('the time cap wins over the count', trainingBattleCount(20 * HOUR, { paceMs: 60_000, maxEncounters: 1000 }) === 480);

console.log('\n[5] display seams');
check('formatLevel', formatLevel({ level: 12 }) === 'Lv 12');
check('formatRecommended', formatRecommended(route('r1')) === 'Lv 3–8');
check('placeTitle with a route label', placeTitle(route('r1')) === 'Route 1 · Sunny Meadow');
check('placeTitle without one', placeTitle(route('lake')) === 'Mirror Lake');

console.log('\n[5b] map art');
// Place markers are laid out in MAP_SIZE pixels over the generated art, so the
// art must be exactly that size (the PNG IHDR holds width and height).
const art = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'world', 'hearthvale.png'));
check('the region art is a PNG', art.subarray(1, 4).toString('latin1') === 'PNG');
check(`the region art is ${MAP_SIZE.width}×${MAP_SIZE.height}`, art.readUInt32BE(16) === MAP_SIZE.width && art.readUInt32BE(20) === MAP_SIZE.height);

console.log('\n[6] lookups');
check('constructor is not a route', routeById('constructor') === null);
check('__proto__ is not a route', routeById('__proto__') === null);
check('home is not playable', isPlayableId('home') === false);
check('r2 is playable', isPlayableId('r2') === true);
check('non-strings are not places', placeById(7) === null && routeById(null) === null);

// --- Wilds, training, expeditions, growth ----------------------------------------

const mon = (over: Partial<OwnedMon> & { id: string; dexId: number; level: number }): OwnedMon => ({
  exp: 0,
  stats: expectedStats(over.dexId, over.level),
  sign: 'aries',
  shiny: false,
  altColor: false,
  origin: 'catch',
  caughtAt: 0,
  ...over,
});
const machamp = mon({ id: 'champ', dexId: 68, level: 50 });
const cfgOf = (id: string) => configFor(route(id));

/** Resolve checkpoints with `policy` until the trip ends (or 12 steps). */
function walk(party: Creature[], seed: string, cfg: ActivityConfig, policy: (n: ExpeditionNode) => ChoiceId) {
  let state = initialExpedition(cfg);
  const steps: StepResolution[] = [];
  for (let i = 0; i < 12; i++) {
    const node = currentNode(cfg, state);
    if (!node) throw new Error(`no node ${state.node}`);
    const res = resolveStep(party, seed, cfg, state, policy(node));
    if (!res) throw new Error(`invalid choice at ${node.id}`);
    steps.push(res);
    state = res.state;
    if (res.terminal) return { state, steps, terminal: res.terminal };
  }
  return { state, steps, terminal: null };
}
const bold = (branch: 'a' | 'b') => (n: ExpeditionNode): ChoiceId =>
  n.kind === 'fork' ? branch : n.kind === 'sighting' ? 'challenge' : n.kind === 'landmark' ? 'investigate' : n.kind === 'battle' ? 'fight' : 'challenge';

console.log('\n[7] wild seam');
const lv5 = buildWild(10, 5, new RNG('w'));
check('a level-5 Caterpie has 18 HP (45 × level 5 scale)', lv5?.creature.stats.hp === 18);
check('a level-50 Caterpie has its full 45 HP', buildWild(10, 50, new RNG('w'))?.creature.stats.hp === 45);
check('levels above 50 clamp to 50', buildWild(10, 99, new RNG('w'))?.creature.stats.hp === 45);
check('the same seed builds the same wild', JSON.stringify(buildWild(10, 5, new RNG('w'))) === JSON.stringify(lv5));
check('an unknown species builds nothing', buildWild(99999, 5, new RNG('w')) === null);
const r1Pool = route('r1').wild.pool;
let rareBoosted = 0;
let rarePlain = 0;
for (let i = 0; i < 100; i++) {
  if (pickFromPool(r1Pool, new RNG(`p${i}`), 1000).rare) rareBoosted++;
  if (pickFromPool(r1Pool, new RNG(`p${i}`), 1).rare) rarePlain++;
}
check(`a big rare boost finds the rare (${rareBoosted}/100)`, rareBoosted >= 90);
check(`without a boost the rare stays rare (${rarePlain}/100)`, rarePlain <= 15);
let inRange = true;
for (let i = 0; i < 60; i++) {
  const w = rollPoolWild(route('r1').wild, new RNG(`lv${i}`), { levelBonus: 1 });
  if (w.view.level < 3 || w.view.level > 6 || w.statMult !== 0.6 || w.view.guardian) inRange = false;
}
check('pool wilds land in the route range plus the bonus (3–6 on r1)', inRange);
const guard = rollGuardian(route('r1').guardian, new RNG('g'));
check('the guardian is Furret at level 7', guard.view.dexId === 162 && guard.view.level === 7 && guard.view.guardian);
check('the guardian fights at its own handicap, not the wilds’',
  guard.statMult === route('r1').guardian.statMult && guard.statMult !== route('r1').wild.statMult);

console.log('\n[8] training');
const butterfree = mon({ id: 'bf', dexId: 12, level: 20 });
const strong = partyCreatures([butterfree]);
const runA = simulateTraining(strong, 'seed-a', cfgOf('r1'), 30);
check('the same seed replays the same training', JSON.stringify(runA) === JSON.stringify(simulateTraining(strong, 'seed-a', cfgOf('r1'), 30)));
check('no battles when no time has passed', JSON.stringify(simulateTraining(strong, 'seed-a', cfgOf('r1'), 0)) === JSON.stringify({ battles: [], wins: 0, fell: false }));
check('an empty party fights nobody', simulateTraining([], 'seed-a', cfgOf('r1'), 10).battles.length === 0);
check('battle k meets the slot-k foe', runA.battles.every((b) => JSON.stringify(b.foe) === JSON.stringify(trainingFoe('seed-a', cfgOf('r1'), b.slot).view)));
const weak = partyCreatures([mon({ id: 'cat', dexId: 10, level: 1 })]);
const runB = simulateTraining(weak, 'seed-b', cfgOf('r2'), 30);
check('a level-1 Caterpie falls in Mossy Woods', runB.fell);
check('training stops at the first loss', runB.wins === runB.battles.length - 1 && runB.battles.at(-1)?.won === false && runB.battles.slice(0, -1).every((b) => b.won));

console.log('\n[9] expedition determinism and choices');
for (const r of ROUTES) {
  const cfg = configFor(r);
  const champ = partyCreatures([machamp]);
  const a1 = walk(champ, 'x1', cfg, bold('a'));
  const a2 = walk(champ, 'x1', cfg, bold('a'));
  const b1 = walk(champ, 'x1', cfg, bold('b'));
  check(`${r.id}: same seed and choices, same trip`, JSON.stringify(a1.state) === JSON.stringify(a2.state));
  const afterFork = (w: typeof a1) => w.steps.find((s) => s.entry.kind === 'fork')?.state.node;
  check(`${r.id}: the fork sends a and b to different checkpoints`, afterFork(a1) === 'a1' && afterFork(b1) === 'b1');
  check(`${r.id}: a Lv 50 Machamp completes both branches`, a1.terminal === 'complete' && b1.terminal === 'complete');
}
const secretCfg = cfgOf('r1');
const secretState = initialExpedition(secretCfg);
const view0 = checkpointView('SEED-SECRET-123', secretCfg, secretState, route('r1'), new Set());
check('the trailhead is a sighting with three choices', view0?.kind === 'sighting' && JSON.stringify(view0.options.map((o) => o.id)) === '["observe","challenge","retreat"]');
check('the checkpoint view never carries the seed', !JSON.stringify(view0).includes('SEED-SECRET'));
const champParty = partyCreatures([machamp]);
const challenged = resolveStep(champParty, 'SEED-SECRET-123', secretCfg, secretState, 'challenge');
check('you battle the Pokémon you were shown', JSON.stringify(challenged?.entry.foe) === JSON.stringify(view0?.foe));
const atFork = walk(champParty, 'x2', secretCfg, (n) => (n.kind === 'sighting' ? 'observe' : 'retreat')).steps[0].state;
check('a battle choice on a fork is invalid', resolveStep(champParty, 'x2', secretCfg, atFork, 'fight') === null);
const retreat0 = resolveStep(champParty, 'x2', secretCfg, secretState, 'retreat');
check('retreating at the trailhead ends the trip without a battle', retreat0?.terminal === 'retreat' && retreat0.battle === null && retreat0.entry.outcome === 'retreated');
const observed = resolveStep(champParty, 'x2', secretCfg, secretState, 'observe');
check('watching quietly records the species without a battle', observed?.battle === null && observed.state.seen.length === 1 && observed.seen === observed.state.seen[0]);

console.log('\n[10] expedition outcomes');
const done = walk(champParty, 'x3', secretCfg, bold('a'));
const perWin = secretCfg.explore.expPerWin;
check('the guardian ends the trip as complete', done.terminal === 'complete' && done.steps.at(-1)?.entry.kind === 'guardian');
check('EXP banks per win', done.state.wins >= 1 && done.state.expUnits === done.state.wins * perWin);
const lastWin = done.steps.find((s) => s.battle?.won);
const replay = lastWin ? replayBattle(champParty, 'x3', secretCfg, lastWin.entry) : null;
check('replaying a won battle ends in a player win', replay?.at(-1)?.kind === 'end' && replay.at(-1)?.winner === 'player');
check('the replay matches the original battle', JSON.stringify(replay) === JSON.stringify(lastWin?.battle?.events));
const lost = walk(partyCreatures([mon({ id: 'cat1', dexId: 10, level: 1 })]), 'x4', cfgOf('r2'), bold('a'));
const lostStep = lost.steps.at(-1);
check('a level-1 Caterpie is defeated in Mossy Woods', lost.terminal === 'defeat' && lostStep?.entry.outcome === 'lost');
check('the lost battle banks no EXP', lostStep?.entry.expUnits === undefined &&
  lost.state.expUnits === lost.steps.filter((s) => s.entry.outcome === 'won').length * cfgOf('r2').explore.expPerWin);

console.log('\n[11] growth seam');
const starter = mon({ id: 's1', dexId: 10, level: 7, origin: 'starter' });
const g1 = planGrowth([{ ...starter, nickname: 'Bug' }], [starter], 140, route('r1').recommended, 'act-1');
check('140 EXP takes a level-7 starter Caterpie to level 8', g1.members[0]?.after.level === 8 && g1.members[0].after.exp === 0);
check('and it evolves into Metapod', g1.members[0]?.after.dexId === 11 && JSON.stringify(g1.members[0].evolutions) === '[{"fromDexId":10,"toDexId":11}]');
check('the renamed row keeps its nickname', g1.changed[0]?.nickname === 'Bug' && g1.changed[0].origin === 'starter' && g1.changed[0].sign === 'aries');
const over = mon({ id: 'o1', dexId: 12, level: 12 });
const g2 = planGrowth([over], [over], 50, route('r1').recommended, 'act-2');
check('a level-12 member on Sunny Meadow earns 40%', g2.members[0]?.sharePct === 40 && g2.members[0].expGained === 20);
const g3 = planGrowth([{ ...over, level: 12 }], [{ ...over, level: 8 }], 50, route('r1').recommended, 'act-3');
check('the share uses the level the trip started at', g3.members[0]?.sharePct === 100 && g3.members[0].expGained === 50);
const g4 = planGrowth([starter], [starter, over], 50, route('r1').recommended, 'act-4');
check('a member no longer owned is skipped', g4.members.length === 1 && g4.members[0].id === 's1');
const g5 = planGrowth([starter], [starter], 0, route('r1').recommended, 'act-5');
check('no EXP changes nothing', g5.changed.length === 0 && g5.members[0]?.expGained === 0);

console.log('\n[12] parsers');
check('a snapshot missing fields is rejected', normaliseSnapshot([{ id: 'a' }]) === null);
check('an empty snapshot is rejected', normaliseSnapshot([]) === null);
check('a non-array snapshot is rejected', normaliseSnapshot('x') === null);
const roundTrip = normaliseSnapshot(JSON.parse(JSON.stringify([{ ...starter, nickname: 'Bug', ability: 'overgrow' }])));
check('a real snapshot round-trips', roundTrip?.[0].nickname === 'Bug' && roundTrip[0].dexId === 10 && roundTrip[0].level === 7);
check('a snapshot of an unknown species is rejected', normaliseSnapshot([{ ...starter, dexId: 99999 }]) === null);
check('config round-trips', JSON.stringify(parseConfig(JSON.parse(JSON.stringify(cfgOf('r1'))))) === JSON.stringify(cfgOf('r1')));
check('another rules version is rejected', parseConfig({ ...cfgOf('r1'), v: 2 }) === null);
const st = initialExpedition(cfgOf('r1'));
check('expedition state round-trips', JSON.stringify(parseExpeditionState(JSON.parse(JSON.stringify(st)))) === JSON.stringify(st));
check('a broken expedition state is rejected', parseExpeditionState({ node: 5 }) === null);
check('no result parses from null', parseResult(null) === null);

console.log('\n[13] party');
check('an empty party is invalid', parsePartyInput([]) === null);
check('a duplicate is invalid', parsePartyInput(['a', 'a']) === null);
check('a non-string id is invalid', parsePartyInput(['a', 1]) === null);
check('seven members are too many', parsePartyInput(['a', 'b', 'c', 'd', 'e', 'f', 'g']) === null);
check('a bare string is not a party', parsePartyInput('a') === null);
check('an over-long id is invalid', parsePartyInput(['x'.repeat(65)]) === null);
check('an empty id is invalid', parsePartyInput(['']) === null);
check('two ids keep their order', JSON.stringify(parsePartyInput(['b', 'a'])) === '["b","a"]');
const sMon = mon({ id: 's', dexId: 10, level: 5, origin: 'starter' });
const bMon = mon({ id: 'b', dexId: 16, level: 5 });
check('no saved party: the starter', JSON.stringify(resolveParty(null, [sMon], 's')) === '["s"]');
check('released members drop out, order kept', JSON.stringify(resolveParty(['gone', 'b', 's'], [bMon, sMon], 's')) === '["b","s"]');
check('nothing left: back to the starter', JSON.stringify(resolveParty(['gone'], [bMon, sMon], 's')) === '["s"]');
check('no starter either: the newest mon', JSON.stringify(resolveParty(null, [bMon], 'missing')) === '["b"]');
check('an empty box: no party', resolveParty(null, [], 's').length === 0);
check('a saved duplicate collapses', JSON.stringify(resolveParty(['b', 'b'], [bMon], 's')) === '["b"]');
check('order matters when comparing parties', sameParty(['a', 'b'], ['b', 'a']) === false && sameParty(['a'], ['a']));
check('party members come back in party order', JSON.stringify(partyMembers(['s', 'b'], [bMon, sMon]).map((m) => m.id)) === '["s","b"]');

// Capture is out of scope, so most trainers own one Pokémon: every starter line
// must be able to walk the whole region alone. Pinned seeds; exact, repeatable rates.
console.log('\n[14] balance gates (every starter line, alone)');
for (const base of STARTER_POOL) {
  const rate = trainingWinRate(base, 5, cfgOf('r1'), 300);
  check(`${base} at Lv 5 wins ≥ 95% on Sunny Meadow (${rate}%)`, rate >= 95);
}
for (const r of ROUTES) {
  const cfg = configFor(r);
  const mid = midLevel(r);
  for (const base of STARTER_POOL) {
    const floor = COCOONS.has(stageDex(base, mid)) ? 85 : 90;
    const train = trainingWinRate(base, mid, cfg, 200);
    check(`${r.id}: ${base} at Lv ${mid} wins ≥ ${floor}% of training (${train}%)`, train >= floor);
    const guard = guardianWinRate(base, r.recommended.max, cfg, 100);
    check(`${r.id}: ${base} at Lv ${r.recommended.max} beats the guardian ≥ 50% (${guard}%)`, guard >= 50);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
