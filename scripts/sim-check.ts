import { CREATURES, withRole } from '../src/game/pokemon';
import { buildGauntlet, championSeed } from '../src/game/opponents';
import {
  buildChampionTeam,
  buildOpponentTeam,
  simulateBattle,
  TIER_STAT_MULT,
} from '../src/game/battle';
import { rollPool } from '../src/game/run';
import { defaultRole, eligibleRoles, rollRole, ALL_ROLES } from '../src/game/roles';
import { RNG } from '../src/game/rng';
import type { Creature, Role } from '../src/game/types';

const N = 400;
const PLAYER_MULT = 1.13;

const bst = (c: Creature) => c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd;

// Brute-stat draft: top-6 by base-stat total.
const bruteStat = (pool: Creature[]) =>
  [...pool].sort((a, b) => bst(b) - bst(a)).slice(0, 6);

type RoleMode = 'asRolled' | 'bestFit';

const applyRoles = (team: Creature[], mode: RoleMode) =>
  mode === 'bestFit'
    ? team.map((c) => withRole(c, defaultRole(c.stats)))
    : team;

function runGauntlets(mode: RoleMode) {
  let wins = 0;
  let runs = 0;
  let totalTurns = 0;
  let championReached = 0;
  let championWins = 0;
  for (let i = 0; i < N; i++) {
    const seed = `test-${i}`;
    const gauntlet = buildGauntlet(seed);
    let team = applyRoles(bruteStat(rollPool(seed)), mode);
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
    `  roles=${mode.padEnd(8)} → ${((r.wins / N) * 100).toFixed(1)}% full clears, ` +
      `reached champ ${((r.championReached / N) * 100).toFixed(0)}% (won ${champRate}% of those), ` +
      `avg ${(r.totalTurns / r.runs).toFixed(1)} turns`,
  );
}

// How much variance does rollRole actually inject?
const rng = new RNG('role-dist');
const dist: Record<Role, number> = { Sweeper: 0, Bruiser: 0, Tank: 0, Support: 0 };
let offBest = 0;
let total = 0;
let multiRole = 0;
for (const c of CREATURES) {
  if (eligibleRoles(c.stats).length > 1) multiRole++;
  for (let k = 0; k < 20; k++) {
    const r = rollRole(c.stats, rng);
    dist[r]++;
    if (r !== defaultRole(c.stats)) offBest++;
    total++;
  }
}
console.log(`\nrollRole over all ${CREATURES.length} mons × 20 draws:`);
console.log(
  `  multi-role-capable: ${((multiRole / CREATURES.length) * 100).toFixed(0)}% of dex`,
);
console.log(
  `  landed off the best-fit role: ${((offBest / total) * 100).toFixed(1)}% of draws`,
);
console.log(
  '  role mix: ' +
    ALL_ROLES.map((r) => `${r} ${((dist[r] / total) * 100).toFixed(0)}%`).join(', '),
);

// Determinism check.
const a = simulateBattle(bruteStat(rollPool('x')), buildOpponentTeam('fire', 6, 'gym', 'x#0'), 'x#0');
const b = simulateBattle(bruteStat(rollPool('x')), buildOpponentTeam('fire', 6, 'gym', 'x#0'), 'x#0');
console.log('\ndeterministic:', a.winner === b.winner && a.turns === b.turns);
