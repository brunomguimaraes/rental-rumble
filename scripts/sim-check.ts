import { CREATURES } from '../src/game/pokemon';
import { GAUNTLET } from '../src/game/opponents';
import { buildOpponentTeam, simulateBattle, TIER_STAT_MULT } from '../src/game/battle';
import { rollPool } from '../src/game/run';

let PLAYER_MULT = 1.05;
const N = 300;

type Pick = (pool: typeof CREATURES) => typeof CREATURES;

const bruteStat: Pick = (pool) =>
  [...pool]
    .sort(
      (a, b) =>
        b.stats.hp + b.stats.atk + b.stats.def + b.stats.spd -
        (a.stats.hp + a.stats.atk + a.stats.def + a.stats.spd),
    )
    .slice(0, 6);

// Coverage: maximise distinct types, then stats.
const coverage: Pick = (pool) => {
  const seen = new Set<string>();
  const out: typeof CREATURES = [];
  const sorted = [...pool].sort(
    (a, b) =>
      b.stats.atk + b.stats.spd - (a.stats.atk + a.stats.spd),
  );
  for (const c of sorted) {
    if (!seen.has(c.type)) {
      out.push(c);
      seen.add(c.type);
    }
    if (out.length === 6) break;
  }
  for (const c of sorted) {
    if (out.length === 6) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
};

const bstOf = (c: (typeof CREATURES)[number]) =>
  c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd;

function runGauntlets(pick: Pick, recruit: boolean) {
  let runs = 0;
  let wins = 0;
  let capHits = 0;
  let totalTurns = 0;
  let totalEvents = 0;
  for (let i = 0; i < N; i++) {
    const seed = `test-${i}`;
    let team = pick(rollPool(seed));
    let alive = true;
    for (let s = 0; s < GAUNTLET.length && alive; s++) {
      const opp = GAUNTLET[s];
      const bseed = `${seed}#${s}`;
      const foe = buildOpponentTeam(opp.type, opp.teamSize, opp.tier, bseed);
      const res = simulateBattle(team, foe, bseed, {
        playerStatMult: PLAYER_MULT,
        foeStatMult: TIER_STAT_MULT[opp.tier] ?? 1,
      });
      runs++;
      totalTurns += res.turns;
      totalEvents += res.events.length;
      if (res.turns >= 200) capHits++;
      if (res.winner === 'foe') {
        alive = false;
      } else if (recruit) {
        // Greedily keep the 6 strongest from (team ∪ defeated foes).
        team = [...team, ...foe]
          .sort((a, b) => bstOf(b) - bstOf(a))
          .slice(0, 6);
      }
      if (s === GAUNTLET.length - 1 && alive) wins++;
    }
  }
  return { runs, wins, capHits, totalTurns, totalEvents };
}

console.log('Player-edge sweep (brute-stat draft, greedy recruiting):');
for (const mult of [1.05, 1.1, 1.15, 1.2, 1.25]) {
  PLAYER_MULT = mult;
  const r = runGauntlets(bruteStat, true);
  console.log(
    `  edge ${mult.toFixed(2)} → ${((r.wins / N) * 100).toFixed(1)}% full clears, avg ${(r.totalTurns / r.runs).toFixed(1)} turns`,
  );
}

PLAYER_MULT = 1.18;
console.log('\nAt chosen edge 1.18:');
for (const [label, pick, recruit] of [
  ['brute-stat, recruiting', bruteStat, true],
  ['coverage, recruiting', coverage, true],
] as const) {
  const r = runGauntlets(pick, recruit);
  console.log(
    `  [${label}] ${((r.wins / N) * 100).toFixed(1)}% full clears, cap hits ${r.capHits}, avg ${(r.totalTurns / r.runs).toFixed(1)} turns / ${(r.totalEvents / r.runs).toFixed(0)} events`,
  );
}
console.log('\nroster size:', CREATURES.length);

// Determinism check
const a = simulateBattle(rollPool('x').slice(0, 6), buildOpponentTeam('Ember', 3, 'gym', 'x#0'), 'x#0');
const b = simulateBattle(rollPool('x').slice(0, 6), buildOpponentTeam('Ember', 3, 'gym', 'x#0'), 'x#0');
console.log('deterministic:', a.winner === b.winner && a.turns === b.turns && a.events.length === b.events.length);
