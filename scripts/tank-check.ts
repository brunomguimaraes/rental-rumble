import { withSign } from '../src/game/pokemon';
import { buildGauntlet, championSeed } from '../src/game/opponents';
import {
  buildChampionTeam,
  buildOpponentTeam,
  simulateBattle,
  TIER_STAT_MULT,
} from '../src/game/battle';
import { rollPool } from '../src/game/run';
import { defaultSign } from '../src/game/zodiac';
import type { Creature } from '../src/game/types';

// How dominant is a bulk-first draft compared to a raw-stat draft? If "tanks"
// are over-tuned, the bulky team clears noticeably more often and drags fights
// out (higher avg turns). Run before/after a balance change to see the shift.
const N = 400;
const PLAYER_MULT = 1.13;

const bst = (c: Creature) =>
  c.stats.hp + c.stats.atk + c.stats.eatk + c.stats.def + c.stats.edef + c.stats.spd;
const bulk = (c: Creature) => c.stats.hp + Math.max(c.stats.def, c.stats.edef);

// Top-6 by a scoring function.
const draft = (pool: Creature[], score: (c: Creature) => number) =>
  [...pool].sort((a, b) => score(b) - score(a)).slice(0, 6);

const bestFit = (team: Creature[]) =>
  team.map((c) => withSign(c, defaultSign(c.stats)));

function runGauntlets(score: (c: Creature) => number) {
  let wins = 0;
  let runs = 0;
  let totalTurns = 0;
  for (let i = 0; i < N; i++) {
    const seed = `tank-${i}`;
    const gauntlet = buildGauntlet(seed);
    const team = bestFit(draft(rollPool(seed), score));
    let alive = true;
    for (let s = 0; s < gauntlet.length && alive; s++) {
      const opp = gauntlet[s];
      const bseed = `${seed}#${s}`;
      const foe =
        opp.tier === 'champion'
          ? buildChampionTeam(championSeed(), opp.teamSize)
          : buildOpponentTeam(opp.type, opp.teamSize, opp.tier, bseed);
      const res = simulateBattle(team, foe, bseed, {
        playerStatMult: PLAYER_MULT,
        foeStatMult: TIER_STAT_MULT[opp.tier] ?? 1,
      });
      runs++;
      totalTurns += res.turns;
      if (res.winner === 'foe') alive = false;
      if (s === gauntlet.length - 1 && alive) wins++;
    }
  }
  return { wins, runs, totalTurns };
}

console.log(`Tank-meta check over ${N} gauntlets (edge ${PLAYER_MULT}):`);
for (const [label, score] of [
  ['brute-stat (BST)', bst],
  ['bulk-first (hp+def)', bulk],
] as const) {
  const r = runGauntlets(score);
  console.log(
    `  ${label.padEnd(20)} → ${((r.wins / N) * 100).toFixed(1)}% clears, ` +
      `avg ${(r.totalTurns / r.runs).toFixed(1)} turns`,
  );
}
