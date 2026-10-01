/** Fixed-seed first-visit balance: every current starter, alone, over 200 encounters. */
import { pathToFileURL } from 'node:url';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';
import { STARTER_POOL, starterFromOffer } from '../src/game/professions.js';
import { rollRouteFind, simulateRouteBattle } from '../src/game/route-rules.js';
import type { OwnedMon } from '../src/game/box.js';
import type { FrozenRouteFoe } from '../src/game/route-actions.js';

interface BalanceRow { dexId: number; name: string; wild: number; scout: number; youngster: number }
const inventory = { revision: 1, stacks: [{ itemId: 'poke' as const, quantity: 20 }] };

function starter(dexId: number, sample: number): OwnedMon {
  // Use the production starter offer/mint seam, including the full rolled stats.
  for (let attempt = 0; ; attempt++) {
    const id = `route-balance:${dexId}:${sample}:${attempt}`;
    const mint = starterFromOffer(id, dexId);
    if (mint) return { ...mint, id, exp: 0, origin: 'starter', caughtAt: 0 };
  }
}

function trainerFoe(npcId: 'meadow-scout' | 'youngster', sample: number): FrozenRouteFoe {
  for (let attempt = 0; ; attempt++) {
    const find = rollRouteFind({
      seed: `balance-trainer:${npcId}:${sample}:${attempt}`,
      kind: 'npc', knownLandmarks: [], questClaimed: true, inventory,
    });
    if (find.npc?.id === npcId && find.foe) return find.foe;
  }
}

export function measureRouteBalance(samples = 200): BalanceRow[] {
  const encounters = Array.from({ length: samples }, (_, i) => ({
    wild: rollRouteFind({ seed: `balance-wild:${i}`, kind: 'wild', knownLandmarks: [], questClaimed: false, inventory }).foe!,
    scout: trainerFoe('meadow-scout', i),
    youngster: trainerFoe('youngster', i),
  }));
  return STARTER_POOL.map((dexId) => {
    const wins = { wild: 0, scout: 0, youngster: 0 };
    for (let i = 0; i < samples; i++) {
      const mon = starter(dexId, i);
      for (const kind of ['wild', 'scout', 'youngster'] as const) {
        if (simulateRouteBattle({ party: [mon], foe: encounters[i][kind], seed: `balance:${dexId}:${kind}:${i}` }).won) wins[kind]++;
      }
    }
    return {
      dexId, name: CREATURES_BY_ID[String(dexId)].name,
      wild: (100 * wins.wild) / samples,
      scout: (100 * wins.scout) / samples,
      youngster: (100 * wins.youngster) / samples,
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = measureRouteBalance();
  console.log('200 seeds per fresh starter and encounter type; lone starters, actual minted stats, no growth between battles.');
  console.table(rows.map(({ name, wild, scout, youngster }) => ({
    Starter: name, 'Wild win %': wild, 'Meadow Scout win %': scout, 'Youngster win %': youngster,
  })));
  const failed = rows.filter((row) => row.wild < 75 || row.scout < 60 || row.youngster < 60);
  console.log(failed.length ? `Balance gate failed for ${failed.map((row) => row.name).join(', ')}.` : 'Every starter passes: wild ≥75%, each trainer ≥60%.');
  process.exitCode = failed.length ? 1 : 0;
}
