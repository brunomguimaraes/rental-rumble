import { CREATURES, withSign } from '../src/game/pokemon';
import { buildGauntlet, championSeed } from '../src/game/opponents';
import {
  buildChampionTeam,
  buildOpponentTeam,
  simulateBattle,
  TIER_STAT_MULT,
} from '../src/game/battle';
import { rollPool } from '../src/game/run';
import { defaultSign, rollSign, ZODIAC_SIGNS } from '../src/game/zodiac';
import { RNG } from '../src/game/rng';
import type { Creature, Sign } from '../src/game/types';

const N = Number(process.env.SIM_N) || 400;
const PLAYER_MULT = 1.13;

const bst = (c: Creature) =>
  c.stats.hp + c.stats.atk + c.stats.eatk + c.stats.def + c.stats.edef + c.stats.spd;

// Brute-stat draft: top-6 by base-stat total.
const bruteStat = (pool: Creature[]) =>
  [...pool].sort((a, b) => bst(b) - bst(a)).slice(0, 6);

// Archetype drafts: pick the strongest (top-BST) mons that lean on a given
// offensive channel, so physical vs energy is compared at *comparable power*
// rather than by lopsidedness (which would just select frail glass cannons).
const isPhysical = (c: Creature) => c.stats.atk >= c.stats.eatk;
const isEnergy = (c: Creature) => c.stats.eatk > c.stats.atk;
const draftLeaning = (pool: Creature[], lean: (c: Creature) => boolean) => {
  const byBst = [...pool].sort((a, b) => bst(b) - bst(a));
  const leaning = byBst.filter(lean);
  // Top up from the best remaining mons if a pool is short on this leaning, so
  // every team still fields six (no empty-bench crashes on sparse seeds).
  const filler = byBst.filter((c) => !lean(c));
  return [...leaning, ...filler].slice(0, 6);
};

type SignMode = 'asRolled' | 'bestFit';

const applySigns = (team: Creature[], mode: SignMode) =>
  mode === 'bestFit'
    ? team.map((c) => withSign(c, defaultSign(c.stats)))
    : team;

function runGauntlets(
  mode: SignMode,
  draft: (pool: Creature[]) => Creature[] = bruteStat,
) {
  let wins = 0;
  let runs = 0;
  let totalTurns = 0;
  let championReached = 0;
  let championWins = 0;
  for (let i = 0; i < N; i++) {
    const seed = `test-${i}`;
    const gauntlet = buildGauntlet(seed);
    let team = applySigns(draft(rollPool(seed)), mode);
    let alive = true;
    for (let s = 0; s < gauntlet.length && alive; s++) {
      const opp = gauntlet[s];
      const bseed = `${seed}#${s}`;
      const foe =
        opp.tier === 'champion'
          ? buildChampionTeam(championSeed(), opp.teamSize)
          : buildOpponentTeam(opp.type, opp.teamSize, opp.tier, bseed);
      if (opp.tier === 'champion') championReached++;
      const res = simulateBattle(team, foe, bseed, {
        playerStatMult: PLAYER_MULT,
        foeStatMult: TIER_STAT_MULT[opp.tier] ?? 1,
      });
      runs++;
      totalTurns += res.turns;
      if (res.winner === 'foe') alive = false;
      if (opp.tier === 'champion' && res.winner === 'player') championWins++;
      if (s === gauntlet.length - 1 && alive) wins++;
    }
  }
  return { wins, runs, totalTurns, championReached, championWins };
}

console.log(`Full-gauntlet clears over ${N} runs (normal ladder: trainers + gyms + elite + daily champion, edge ${PLAYER_MULT}):`);
for (const mode of ['bestFit', 'asRolled'] as const) {
  const r = runGauntlets(mode);
  const champRate = r.championReached
    ? ((r.championWins / r.championReached) * 100).toFixed(0)
    : '–';
  console.log(
    `  signs=${mode.padEnd(8)} → ${((r.wins / N) * 100).toFixed(1)}% full clears, ` +
      `reached champ ${((r.championReached / N) * 100).toFixed(0)}% (won ${champRate}% of those), ` +
      `avg ${(r.totalTurns / r.runs).toFixed(1)} turns`,
  );
}

// Archetype balance: do physical-leaning and energy-leaning drafts clear at a
// comparable rate? A large gap would mean the split quietly favours one channel.
console.log(`\nArchetype balance over ${N} runs (best-fit signs, top-BST within each leaning):`);
for (const [label, lean] of [
  ['physical', isPhysical],
  ['energy', isEnergy],
] as const) {
  const r = runGauntlets('bestFit', (pool) => draftLeaning(pool, lean));
  console.log(
    `  ${label.padEnd(8)} → ${((r.wins / N) * 100).toFixed(1)}% full clears, ` +
      `reached champ ${((r.championReached / N) * 100).toFixed(0)}% ` +
      `(won ${r.championReached ? ((r.championWins / r.championReached) * 100).toFixed(0) : '–'}% of those), ` +
      `avg ${(r.totalTurns / r.runs).toFixed(1)} turns`,
  );
}

// How much variance does rollSign actually inject?
const rng = new RNG('sign-dist');
const dist = Object.fromEntries(ZODIAC_SIGNS.map((s) => [s, 0])) as Record<Sign, number>;
let offBest = 0;
let total = 0;
for (const c of CREATURES) {
  for (let k = 0; k < 20; k++) {
    const r = rollSign(c.stats, rng);
    dist[r]++;
    if (r !== defaultSign(c.stats)) offBest++;
    total++;
  }
}
console.log(`\nrollSign over all ${CREATURES.length} mons × 20 draws:`);
console.log(
  `  landed off the best-fit sign: ${((offBest / total) * 100).toFixed(1)}% of draws`,
);
console.log(
  '  sign mix: ' +
    ZODIAC_SIGNS.map((s) => `${s} ${((dist[s] / total) * 100).toFixed(0)}%`).join(', '),
);

// Determinism check.
const a = simulateBattle(bruteStat(rollPool('x')), buildOpponentTeam('fire', 6, 'gym', 'x#0'), 'x#0');
const b = simulateBattle(bruteStat(rollPool('x')), buildOpponentTeam('fire', 6, 'gym', 'x#0'), 'x#0');
console.log('\ndeterministic:', a.winner === b.winner && a.turns === b.turns);
