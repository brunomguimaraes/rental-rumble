/**
 * Multi-axis balance sweep — surfaces where the ladder, signs, and draft
 * archetypes still skew. Run with SIM_N=4000 for a long pass:
 *
 *   SIM_N=4000 npx tsx scripts/balance-audit.ts
 */
import { CREATURES, withSign } from '../src/game/pokemon';
import { buildGauntlet, championSeed } from '../src/game/opponents';
import {
  buildChampionTeam,
  buildOpponentTeam,
  simulateBattle,
  TIER_STAT_MULT,
} from '../src/game/battle';
import { rollPool } from '../src/game/run';
import { defaultSign, SIGN_SPREAD, ZODIAC_SIGNS } from '../src/game/zodiac';
import { canRollBuild } from '../src/game/moves';
import type { Creature, Sign } from '../src/game/types';

const N = Number(process.env.SIM_N) || 2000;
const PLAYER_MULT = 1.13;

const bst = (c: Creature) => {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
};
const bulk = (c: Creature) => c.stats.hp + Math.max(c.stats.def, c.stats.edef);
const speed = (c: Creature) => c.stats.spd;
const offense = (c: Creature) => Math.max(c.stats.atk, c.stats.eatk);

const draft = (pool: Creature[], score: (c: Creature) => number) =>
  [...pool].sort((a, b) => score(b) - score(a)).slice(0, 6);

const bestFit = (team: Creature[]) =>
  team.map((c) => withSign(c, defaultSign(c.stats)));

type GauntletResult = {
  clears: number;
  stageWins: number[];
  stageLosses: number[];
  champReached: number;
  champWins: number;
  totalTurns: number;
  battleCount: number;
};

function runSweep(
  label: string,
  pick: (pool: Creature[]) => Creature[],
  fitSigns = true,
): GauntletResult {
  const stageWins: number[] = [];
  const stageLosses: number[] = [];
  let clears = 0;
  let champReached = 0;
  let champWins = 0;
  let totalTurns = 0;
  let battleCount = 0;

  for (let i = 0; i < N; i++) {
    const seed = `audit-${label}-${i}`;
    const gauntlet = buildGauntlet(seed);
    const team = fitSigns ? bestFit(pick(rollPool(seed))) : pick(rollPool(seed));
    let alive = true;
    for (let s = 0; s < gauntlet.length && alive; s++) {
      const opp = gauntlet[s];
      const bseed = `${seed}#${s}`;
      const foe =
        opp.tier === 'champion'
          ? buildChampionTeam(championSeed(), opp.teamSize)
          : buildOpponentTeam(opp.type, opp.teamSize, opp.tier, bseed);
      if (opp.tier === 'champion') champReached++;
      const res = simulateBattle(team, foe, bseed, {
        playerStatMult: PLAYER_MULT,
        foeStatMult: TIER_STAT_MULT[opp.tier] ?? 1,
      });
      battleCount++;
      totalTurns += res.turns;
      if (res.winner === 'player') {
        stageWins[s] = (stageWins[s] ?? 0) + 1;
        if (opp.tier === 'champion') champWins++;
      } else {
        stageLosses[s] = (stageLosses[s] ?? 0) + 1;
        alive = false;
      }
      if (s === gauntlet.length - 1 && alive) clears++;
    }
  }

  return {
    clears,
    stageWins,
    stageLosses,
    champReached,
    champWins,
    totalTurns,
    battleCount,
  };
}

function pct(n: number, d: number) {
  return d ? ((n / d) * 100).toFixed(1) : '–';
}

function printSweep(label: string, r: GauntletResult) {
  const champWin = r.champReached ? pct(r.champWins, r.champReached) : '–';
  console.log(
    `  ${label.padEnd(22)} clears ${pct(r.clears, N)}%  ` +
      `champ ${pct(r.champReached, N)}%→${champWin}%  ` +
      `avg ${(r.totalTurns / r.battleCount).toFixed(1)}t`,
  );
}

console.log(`Balance audit — ${N} gauntlets each (edge ${PLAYER_MULT})\n`);

console.log('Draft archetypes (best-fit signs):');
const archetypes: [string, (pool: Creature[]) => Creature[]][] = [
  ['BST top-6', (p) => draft(p, bst)],
  ['bulk (hp+guard)', (p) => draft(p, bulk)],
  ['speed-first', (p) => draft(p, speed)],
  ['offense-first', (p) => draft(p, offense)],
  [
    'mixed (3 phys + 3 energy)',
    (p) => {
      const by = [...p].sort((a, b) => bst(b) - bst(a));
      const phys = by.filter((c) => c.stats.atk >= c.stats.eatk).slice(0, 3);
      const ener = by.filter((c) => c.stats.eatk > c.stats.atk).slice(0, 3);
      const ids = new Set([...phys, ...ener].map((c) => c.id));
      const fill = by.filter((c) => !ids.has(c.id));
      return [...phys, ...ener, ...fill].slice(0, 6);
    },
  ],
];

const results = new Map<string, GauntletResult>();
for (const [label, pick] of archetypes) {
  const r = runSweep(label, pick);
  results.set(label, r);
  printSweep(label, r);
}

// Per-stage survival for the baseline BST draft.
const base = results.get('BST top-6')!;
const stages = Math.max(base.stageWins.length, base.stageLosses.length);
console.log('\nStage survival (BST top-6 — % of runs that *reach* each fight and win it):');
let stillAlive = N;
for (let s = 0; s < stages; s++) {
  const wins = base.stageWins[s] ?? 0;
  const reached = stillAlive;
  const winRate = reached ? ((wins / reached) * 100).toFixed(0) : '–';
  const losses = base.stageLosses[s] ?? 0;
  stillAlive = wins;
  console.log(`  stage ${String(s + 1).padStart(2)}  win ${winRate}% of ${reached} remaining  (drop ${losses})`);
}

// Forced-sign sweep: give every mon in a reference pool the same sign and see
// which signs over/under-perform on a neutral BST draft.
console.log('\nForced-sign power (same BST draft, every mon gets sign X):');
const refPool = rollPool('sign-ref');
const refTeam = draft(refPool, bst);
const signScores: { sign: Sign; clears: number }[] = [];

for (const sign of ZODIAC_SIGNS) {
  let clears = 0;
  for (let i = 0; i < Math.min(N, 800); i++) {
    const seed = `sign-${sign}-${i}`;
    const gauntlet = buildGauntlet(seed);
    const team = refTeam.map((c) => withSign(c, sign));
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
      if (res.winner === 'foe') alive = false;
      if (s === gauntlet.length - 1 && alive) clears++;
    }
  }
  signScores.push({ sign, clears });
}
signScores.sort((a, b) => b.clears - a.clears);
const subN = Math.min(N, 800);
const avgClears = signScores.reduce((a, x) => a + x.clears, 0) / signScores.length;
for (const { sign, clears } of signScores) {
  const sp = SIGN_SPREAD[sign];
  const totalMult =
    sp.hp + sp.atk + sp.eatk + sp.def + sp.edef + sp.spd;
  const delta = clears - avgClears;
  console.log(
    `  ${sign.padEnd(12)} ${pct(clears, subN)}%  (Σtilt ${totalMult.toFixed(2)}, Δavg ${delta >= 0 ? '+' : ''}${(delta / subN * 100).toFixed(1)}pp)`,
  );
}

// Physical/Energy channel + rolled-sign variance (mirrors sim-check.ts).
console.log('\nOffense channel (best-fit signs, top-BST within each leaning):');
const isPhysical = (c: Creature) => c.stats.atk >= c.stats.eatk;
const isEnergy = (c: Creature) => c.stats.eatk > c.stats.atk;
const draftLeaning = (pool: Creature[], lean: (c: Creature) => boolean) => {
  const byBst = [...pool].sort((a, b) => bst(b) - bst(a));
  const leaning = byBst.filter(lean);
  const filler = byBst.filter((c) => !lean(c));
  return [...leaning, ...filler].slice(0, 6);
};
for (const [label, lean] of [
  ['physical', isPhysical],
  ['energy', isEnergy],
] as const) {
  const r = runSweep(label, (p) => draftLeaning(p, lean));
  printSweep(label, r);
}

console.log('\nSign assignment mode (BST draft):');
const rolled = runSweep('asRolled signs', (p) => draft(p, bst), false);
printSweep('asRolled signs', rolled);

// Build-roll prevalence on mixed attackers in a typical draft pool.
let mixedPool = 0;
let mixedRolled = 0;
for (let i = 0; i < 500; i++) {
  for (const c of rollPool(`build-prev-${i}`)) {
    const base = CREATURES.find((x) => x.id === c.id)!;
    if (!canRollBuild(base.stats)) continue;
    mixedPool++;
    if (c.build) mixedRolled++;
  }
}
console.log(
  `\nBuild roll: ${pct(mixedRolled, mixedPool)}% of mixed-eligible pool entries carry a build ` +
    `(${mixedRolled}/${mixedPool} across 500 pools).`,
);

// Spread sanity: BST-weighted average tilt each sign applies across the dex.
console.log('\nDex-weighted sign tilt (how much each sign amplifies the average mon):');
const w = CREATURES.reduce(
  (acc, c) => {
    acc.hp += c.stats.hp;
    acc.atk += c.stats.atk;
    acc.eatk += c.stats.eatk;
    acc.def += c.stats.def;
    acc.edef += c.stats.edef;
    acc.spd += c.stats.spd;
    return acc;
  },
  { hp: 0, atk: 0, eatk: 0, def: 0, edef: 0, spd: 0 },
);
const n = CREATURES.length;
const avg = {
  hp: w.hp / n,
  atk: w.atk / n,
  eatk: w.eatk / n,
  def: w.def / n,
  edef: w.edef / n,
  spd: w.spd / n,
};
for (const sign of ZODIAC_SIGNS) {
  const sp = SIGN_SPREAD[sign];
  const eff =
    sp.hp * avg.hp +
    sp.atk * avg.atk +
    sp.eatk * avg.eatk +
    sp.def * avg.def +
    sp.edef * avg.edef +
    sp.spd * avg.spd;
  console.log(`  ${sign.padEnd(12)} effective ${eff.toFixed(1)}`);
}
