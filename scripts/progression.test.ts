/**
 * Pokédex progression — the server's reachable-forms validator must (a) accept
 * every form an honest run actually owned, (b) carry the variant through
 * evolution (the Squirtle → Wartortle → Blastoise rule), and (c) be fully
 * deterministic from the seed, so it agrees with the browser.
 *
 *   npx --yes tsx scripts/progression.test.ts
 */
import {
  reachableForms,
  unionTeamForms,
  variantOf,
  formKey,
} from '../src/game/progression.js';
import { rollDraftDeck } from '../src/game/run.js';
import { bracketDex } from '../src/game/gens.js';
import { evolutionTargets } from '../src/game/pokemon.js';
import type { Creature } from '../src/game/types.js';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const SEED = 'progression-test-seed';
const reachable = reachableForms(SEED, 'all', 'normal', 0);
const deck = rollDraftDeck(SEED, bracketDex('all'));

console.log('[1] Every drafted form is reachable (no honest claim is rejected)');
let allDraftReachable = true;
for (const card of deck) {
  if (!reachable.has(formKey(card.dexId, variantOf(card)))) {
    allDraftReachable = false;
    console.error(`  missing draft form ${card.dexId}:${variantOf(card)}`);
    break;
  }
}
check('all draft cards present', allDraftReachable);
check('reachable set is non-empty', reachable.size > 0);

console.log('\n[2] Evolution closure carries the variant forward');
let testedEvo = false;
for (const card of deck) {
  const targets = evolutionTargets(card.dexId, 'all');
  if (targets.length === 0) continue;
  testedEvo = true;
  const v = variantOf(card);
  for (const t of targets) {
    check(`${card.dexId}:${v} → ${t}:${v} reachable`, reachable.has(formKey(t, v)));
  }
  break; // one representative chain is enough
}
check('found an evolvable draft card', testedEvo);

console.log('\n[3] reachableForms is deterministic');
const again = reachableForms(SEED, 'all', 'normal', 0);
let identical = again.size === reachable.size;
if (identical) {
  for (const k of reachable) {
    if (!again.has(k)) {
      identical = false;
      break;
    }
  }
}
check('same seed → identical set', identical);

console.log('\n[4] Clearing more stages only widens the set');
const wide = reachableForms(SEED, 'all', 'normal', 99);
let subset = true;
for (const k of reachable) {
  if (!wide.has(k)) {
    subset = false;
    break;
  }
}
check('cleared=0 ⊆ cleared=99', subset);
check('more stages add recruitable foes', wide.size >= reachable.size);

console.log('\n[5] variantOf + unionTeamForms');
check('shiny → s', variantOf({ shiny: true, altColor: false }) === 's');
check('alt → a', variantOf({ shiny: false, altColor: true }) === 'a');
check('plain → n', variantOf({ shiny: false, altColor: false }) === 'n');

// unionTeamForms only reads dexId/shiny/altColor — a minimal cast is enough.
const team = [
  { dexId: 7, shiny: false, altColor: false },
  { dexId: 25, shiny: true, altColor: false },
] as unknown as Creature[];
const s1 = unionTeamForms(new Set<string>(), team);
check('union captures both forms', s1.has('7:n') && s1.has('25:s'));
const s2 = unionTeamForms(s1, team);
check('re-union with nothing new returns the same Set', s2 === s1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
