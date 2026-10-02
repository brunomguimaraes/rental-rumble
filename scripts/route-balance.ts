/** Fixed-seed first-visit balance: every current starter, alone, against every Route 1 opponent. */
import { pathToFileURL } from 'node:url';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { STARTER_POOL, starterFromOffer } from '../src/game/professions.js';
import { rollRouteFind, ROUTE_RULES, simulateRouteBattle } from '../src/game/route-rules.js';
import type { OwnedMon } from '../src/game/box.js';
import type { FrozenRouteFoe, RouteFind, RouteRules } from '../src/game/route-actions.js';

/** One opponent: the win rate each starter must reach, and its foe for each sample. */
export interface Opponent { label: string; gate: number; foe: (sample: number) => FrozenRouteFoe }
/** Win percentage against each opponent label, for one starter. */
export interface BalanceRow { dexId: number; name: string; wins: Record<string, number> }

const inventory = { revision: 1, money: 0, stacks: [{ itemId: 'poke' as const, quantity: 20 }] };
const rareOnly: RouteRules = { ...ROUTE_RULES, explore: { nothing: 0, item: 0, rare: 1, secret: 0 } };
const speciesName = (dexId: number) => CREATURES_BY_ID[String(dexId)].name;

function starter(dexId: number, sample: number): OwnedMon {
  // Use the production starter offer/mint seam, including the full rolled stats.
  for (let attempt = 0; ; attempt++) {
    const id = `route-balance:${dexId}:${sample}:${attempt}`;
    const mint = starterFromOffer(id, dexId);
    if (mint) return { ...mint, id, exp: 0, origin: 'starter', caughtAt: 0 };
  }
}

/** The first foe over successive seeds that `match` accepts, rolled through the real search rules. */
function firstFoe(prefix: string, roll: (seed: string) => RouteFind, match: (find: RouteFind) => boolean): FrozenRouteFoe {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const find = roll(`${prefix}:${attempt}`);
    if (find.foe && match(find)) return find.foe;
  }
  throw new Error(`No ${prefix} foe in 10,000 seeds`);
}

/** Every opponent a fresh starter can meet on Route 1, with the win rate it must reach. */
export function routeOpponents(): Opponent[] {
  return [
    { label: 'wild', gate: 75, foe: (i) => rollRouteFind({ seed: `balance-wild:${i}`, kind: 'wild', inventory }).foe! },
    ...['meadow-scout', 'youngster', 'lass', 'bug-catcher'].map((id): Opponent => ({
      label: id, gate: 60,
      foe: (i) => firstFoe(`balance-trainer:${id}:${i}`, (seed) => rollRouteFind({ seed, kind: 'trainer', inventory }), (find) => find.npc?.id === id),
    })),
    ...ROUTE_RULES.exploreRares.pool.map(({ dexId }): Opponent => ({
      label: speciesName(dexId), gate: 60,
      foe: (i) => firstFoe(`balance-rare:${dexId}:${i}`, (seed) => rollRouteFind({ seed, kind: 'explore', inventory, rules: rareOnly }), (find) => find.foe?.view.dexId === dexId),
    })),
  ];
}

export function measureRouteBalance(samples = 200, opponents: readonly Opponent[] = routeOpponents()): BalanceRow[] {
  const foes = opponents.map((opponent) => Array.from({ length: samples }, (_, i) => opponent.foe(i)));
  return STARTER_POOL.map((dexId) => {
    const mons = Array.from({ length: samples }, (_, i) => starter(dexId, i));
    const wins: Record<string, number> = {};
    opponents.forEach((opponent, k) => {
      let won = 0;
      for (let i = 0; i < samples; i++) {
        if (simulateRouteBattle({ party: [mons[i]], foe: foes[k][i], seed: `balance:${dexId}:${opponent.label}:${i}` }).won) won++;
      }
      wins[opponent.label] = (100 * won) / samples;
    });
    return { dexId, name: speciesName(dexId), wins };
  });
}

/** Each starter and opponent pair below its gate, as "Lotad vs Heracross: 58%". */
export function balanceFailures(rows: readonly BalanceRow[], opponents: readonly Opponent[]): string[] {
  return rows.flatMap((row) => opponents.filter((o) => row.wins[o.label] < o.gate).map((o) => `${row.name} vs ${o.label}: ${row.wins[o.label]}%`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opponents = routeOpponents();
  const rows = measureRouteBalance(200, opponents);
  console.log('200 seeds per fresh starter and opponent; lone starters, actual minted stats, no growth between battles.');
  console.table(rows.map((row) => ({ Starter: row.name, ...row.wins })));
  const failures = balanceFailures(rows, opponents);
  console.log(failures.length ? `Balance gate failed: ${failures.join('; ')}.` : 'Every starter passes: wild ≥75%, every other opponent ≥60%.');
  process.exitCode = failures.length ? 1 : 0;
}
