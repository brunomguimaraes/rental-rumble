/**
 * Professions, the professor and the starter offer. Every pool line must
 * really be three stages in the dex; the offer and the starter roll must be
 * deterministic per seed, and a pick outside the offer must be refused.
 *
 *   npx --yes tsx scripts/professions.test.ts
 */
import {
  PROFESSIONS,
  PROFESSORS,
  STARTER_LEVEL,
  STARTER_POOL,
  isProfessionId,
  professorById,
  starterLine,
  starterOffer,
  starterFromOffer,
} from '../src/game/professions.js';
import { CREATURES_BY_ID } from '../src/game/pokemon.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

console.log('[1] professions');
check('four professions', PROFESSIONS.length === 4);
check('only trainer is unlocked', PROFESSIONS.filter((p) => !p.locked).map((p) => p.id).join() === 'trainer');
check('isProfessionId accepts trainer', isProfessionId('trainer'));
check('isProfessionId rejects junk', !isProfessionId('wizard'));

console.log('\n[2] one professor');
check('offered mentor resolves for the profile and hub', professorById(PROFESSORS[0].id) === PROFESSORS[0]);
check('oak resolves', professorById('oak')?.name === 'Professor Oak');
check('retired professors no longer resolve', professorById('elm') === null);

console.log('\n[3] starter pool');
check('ten lines', STARTER_POOL.length === 10);
check('no duplicates', new Set(STARTER_POOL).size === 10);
for (const id of STARTER_POOL) {
  const line = starterLine(id);
  const name = CREATURES_BY_ID[String(id)]?.name ?? String(id);
  check(`${name}: three stages`, line.length === 3);
  check(`${name}: every stage is a real species`, line.every((d) => Boolean(CREATURES_BY_ID[String(d)])));
  check(`${name}: line starts at the base form`, line[0] === id);
}

console.log('\n[4] offer of three');
const offer = starterOffer('offer:user-1');
check('three offered', offer.length === 3);
check('three different lines', new Set(offer).size === 3);
check('all from the pool', offer.every((id) => STARTER_POOL.includes(id)));
check('same seed -> same offer', starterOffer('offer:user-1').join() === offer.join());
const seen = new Set<number>();
const offers = new Set<string>();
for (let i = 0; i < 300; i++) {
  const o = starterOffer(`offer:user-${i}`);
  o.forEach((id) => seen.add(id));
  offers.add(o.join());
}
check('every pool line gets offered to someone', seen.size === 10);
check('offers vary between accounts', offers.size > 20);

console.log('\n[5] starter from the offer');
const pick = starterFromOffer('user-1', offer[1]);
check('an offered line mints its base form', pick?.dexId === offer[1]);
check(`at level ${STARTER_LEVEL}`, pick?.level === STARTER_LEVEL);
const again = starterFromOffer('user-1', offer[1]);
check('same account + pick -> same individual', pick?.sign === again?.sign && pick?.ability === again?.ability && pick?.shiny === again?.shiny);
const outside = STARTER_POOL.find((id) => !offer.includes(id))!;
check('a pool line outside the offer is refused', starterFromOffer('user-1', outside) === null);
check('a species outside the pool is refused', starterFromOffer('user-1', 25) === null);
check('junk is refused', starterFromOffer('user-1', '10' as unknown) === null && starterFromOffer('user-1', undefined) === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
