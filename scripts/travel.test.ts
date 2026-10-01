/** Travel rules: mode costs, the cheapest mount, open links, and the refilling meter with debt. */
import { isDeepStrictEqual } from 'node:util';
import type { OwnedMon } from '../src/game/box.js';
import { quoteTravel, spendTravel, travelQuotes, travelView } from '../src/game/travel.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b);
// quoteTravel reads only the species; a full OwnedMon is not needed to price a trip.
const mon = (dexId: number): OwnedMon => ({ id: `m${dexId}`, dexId } as OwnedMon);
const CATERPIE = 10, PONYTA = 77, RAPIDASH = 78, PIDGEOT = 18;
const MIN = 60_000;
const STEP = 15 * MIN;

check('walking to Sunny Meadow costs 4', same(quoteTravel({ from: 'home', to: 'r1', party: [mon(CATERPIE)] }), { to: 'r1', walk: 4, cost: 4, mode: 'walk', via: null }));
check('walking home costs the same', quoteTravel({ from: 'r1', to: 'home', party: [] })?.cost === 4);
check('no trip to where you already are', quoteTravel({ from: 'home', to: 'home', party: [] }) === null);
check('a land mount halves the trip', same(quoteTravel({ from: 'home', to: 'r1', party: [mon(CATERPIE), mon(RAPIDASH)] }), { to: 'r1', walk: 4, cost: 2, mode: 'land', via: 'Rapidash' }));
check('a flyer quarters the trip', same(quoteTravel({ from: 'home', to: 'r1', party: [mon(PIDGEOT)] }), { to: 'r1', walk: 4, cost: 1, mode: 'flyer', via: 'Pidgeot' }));
check('the cheapest mount wins regardless of order', quoteTravel({ from: 'home', to: 'r1', party: [mon(RAPIDASH), mon(PIDGEOT)] })?.mode === 'flyer');
check('equal mounts go by party order', quoteTravel({ from: 'home', to: 'r1', party: [mon(PONYTA), mon(RAPIDASH)] })?.via === 'Ponyta');
check('town links only to the open route', same(travelQuotes('home', []).map((q) => q.to), ['r1']));
check('the meadow links only to open places, not Route 2', same(travelQuotes('r1', []).map((q) => q.to), ['home']));

check('a full meter has no next refill', travelView({ available: 12, refilledAt: 0 }, 5 * STEP).nextRefillAt === null);
check('spending from full starts the refill clock now', same(spendTravel({ available: 12, refilledAt: 0 }, 1_000_000, 4), { available: 8, refilledAt: 1_000_000 }));
check('a trip the meter cannot cover is refused', spendTravel({ available: 3, refilledAt: 0 }, 0, 4) === null);
check('the last points can be spent to zero', spendTravel({ available: 4, refilledAt: 0 }, 0, 4)?.available === 0);
check('one point returns after 15 minutes', travelView({ available: 0, refilledAt: 0 }, STEP).available === 1);
check('debt recovers one point per interval', travelView({ available: -4, refilledAt: 0 }, 8 * STEP).available === 4 && travelView({ available: -4, refilledAt: 0 }, 8 * STEP - 1).available === 3);
check('a long absence caps at 12', travelView({ available: -4, refilledAt: 0 }, 1_000 * STEP).available === 12);
check('a record below the floor reads at the floor', travelView({ available: -50, refilledAt: 0 }, 0).available === -12);

console.log(`travel: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
