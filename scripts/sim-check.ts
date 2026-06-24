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

const N = 400;
const PLAYER_MULT = 1.13;

const bst = (c: Creature) => c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd;

// Brute-stat draft: top-6 by base-stat total.
const bruteStat = (pool: Creature[]) =>
  [...pool].sort((a, b) => bst(b) - bst(a)).slice(0, 6);

type SignMode = 'asRolled' | 'bestFit';

const applySigns = (team: Creature[], mode: SignMode) =>
  mode === 'bestFit'
    ? team.map((c) => withSign(c, defaultSign(c.stats)))
    : team;

function runGauntlets(mode: SignMode) {
  let wins = 0;
  let runs = 0;
  let totalTurns = 0;
  let championReached = 0;
  let championWins = 0;
  for (let i = 0; i < N; i++) {
    const seed = `test-${i}`;
    const gauntlet = buildGauntlet(seed);
    let team = applySigns(bruteStat(rollPool(seed)), mode);
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
