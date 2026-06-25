/**
 * Stand-alone sanity check for the team-passive "relic" system. No Redis /
 * network: it exercises the new pieces — the mods accumulator, the battle hooks,
 * the deterministic offer/criteria, the event scheduler, and the client/server
 * re-sim parity that keeps a relic run rankable.
 *
 *   npx --yes tsx scripts/relics.test.ts
 */
import {
  RELICS,
  ALL_RELICS,
  isRelicId,
  identityMods,
  relicMods,
  relicDamageMult,
  rollRelicOffer,
  itemEventStages,
  sanitizeRelics,
  MAX_RELICS,
  RELIC_OFFER_COUNT,
} from '../src/game/relics.js';
import { simulateBattle, PLAYER_STAT_MULT } from '../src/game/battle.js';
import {
  teamFromMons,
  verifyChampionWin,
  buildSubmission,
  type SubmissionMon,
} from '../src/game/leaderboard.js';
import { buildChampionTeam, championFoeStatMult } from '../src/game/battle.js';
import { CREATURES, CREATURES_BY_ID } from '../src/game/pokemon.js';
import { nextDailyResetMs } from '../src/game/opponents.js';
import type { Creature, RelicId } from '../src/game/types.js';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

console.log('\n[1] relicMods accumulator + damage mult');
{
  const id = identityMods();
  check(
    'identity mods are neutral',
    id.atkMult === 1 && id.defMult === 1 && id.spdMult === 1 &&
      id.allDmgMult === 1 && id.lifesteal === 0 && id.endTurnHeal === 0 &&
      Object.keys(id.dmgMult).length === 0,
  );
  check('empty / undefined relics → identity', relicMods([]).atkMult === 1 && relicMods(undefined).allDmgMult === 1);

  const stacked = relicMods(['wiseglasses', 'lifeorb']);
  check('Wise Glasses + Life Orb stack allDmgMult', approx(stacked.allDmgMult, 1.1 * 1.3));

  const fire = relicMods(['charcoal']);
  check('Charcoal boosts fire only', approx(relicDamageMult(fire, 'fire'), 1.1) && approx(relicDamageMult(fire, 'water'), 1));

  const both = relicMods(['lifeorb', 'charcoal']);
  check('Life Orb + Charcoal compound on fire', approx(relicDamageMult(both, 'fire'), 1.3 * 1.1));

  check('Leftovers grants end-of-turn heal', relicMods(['leftovers']).endTurnHeal > 0);
  check('Shell Bell grants lifesteal', relicMods(['shellbell']).lifesteal === 0.15);
}

console.log('\n[2] Relics change battle outcomes (mirror match)');
{
  // A mirror match (identical teams) is decided by coin-flips on speed ties, so
  // a one-sided damage relic should reliably tip it. The seed is fixed so the
  // result is deterministic and reproducible across client & server.
  const mirror: SubmissionMon[] = [
    { id: '6', sign: 'leo' }, // Charizard
    { id: '9', sign: 'leo' }, // Blastoise
    { id: '3', sign: 'leo' }, // Venusaur
  ];
  const team = teamFromMons(mirror);
  const seed = 'relic-mirror#7';
  const opts = { playerStatMult: PLAYER_STAT_MULT, foeStatMult: PLAYER_STAT_MULT };
  const strong: RelicId[] = ['lifeorb', 'wiseglasses', 'assaultvest'];

  const playerBuffed = simulateBattle(team, team, seed, { ...opts, playerRelics: strong });
  check('player with strong relics wins the mirror', playerBuffed.winner === 'player');

  const neutral = simulateBattle(team, team, seed, opts);
  const neutralAgain = simulateBattle(team, team, seed, opts);
  check('relic-free fight is deterministic', neutral.winner === neutralAgain.winner && neutral.turns === neutralAgain.turns);

  // In a fight the player already wins, a big damage relic should never make it
  // take longer — relics help, measurably (fewer or equal turns to the KO).
  const strongTeam = teamFromMons([
    { id: '150', sign: 'leo' }, { id: '384', sign: 'leo' }, { id: '493', sign: 'leo' },
  ]);
  const weakTeam = teamFromMons([
    { id: '10', sign: 'pisces' }, { id: '13', sign: 'pisces' }, { id: '129', sign: 'pisces' },
  ]);
  const baseSeed = 'relic-speed#3';
  const plain = simulateBattle(strongTeam, weakTeam, baseSeed, opts);
  const buffed = simulateBattle(strongTeam, weakTeam, baseSeed, { ...opts, playerRelics: ['lifeorb'] });
  check('player still wins with and without the relic', plain.winner === 'player' && buffed.winner === 'player');
  check('Life Orb makes the win no slower', buffed.turns <= plain.turns);
}

console.log('\n[3] Client/server re-sim parity (verifyChampionWin)');
{
  // A strong full-dex team that clears the daily Champion, run with relics. The
  // client posts buildSubmission(...); the server re-sims via verifyChampionWin.
  // Both must agree, or a relic win would be rejected on submit.
  const date = '2026-06-24';
  const seed = 'parity-seed-xyz';
  const stage = 16; // master ladder Champion index (gauntletLength('master') - 1 = 16)
  const team: Creature[] = teamFromMons([
    { id: '150', sign: 'leo' },
    { id: '384', sign: 'leo' },
    { id: '493', sign: 'leo' },
    { id: '249', sign: 'leo' },
    { id: '250', sign: 'leo' },
    { id: '643', sign: 'leo' },
  ]);
  const relics: RelicId[] = ['lifeorb', 'wiseglasses', 'leftovers'];

  const payload = buildSubmission({
    name: 'Tester',
    date,
    bracket: 'all',
    difficulty: 'master',
    seed,
    stage,
    clearedStages: stage,
    team,
    relics,
  });
  check('buildSubmission carries the relics', JSON.stringify(payload.relics) === JSON.stringify(relics));

  // The exact fight the client runs before posting (mirrors App.tsx).
  const foeTeam = buildChampionTeam(`champion:${date}`, 6, CREATURES);
  const clientSim = simulateBattle(team, foeTeam, `${seed}#${stage}`, {
    playerStatMult: PLAYER_STAT_MULT,
    // Match the boss's hidden difficulty passive the verifier now applies.
    foeStatMult: championFoeStatMult('master'),
    difficulty: 'master',
    playerRelics: relics,
  });
  const verdict = verifyChampionWin(payload);
  check('server verdict matches client winner', (clientSim.winner === 'player') === verdict.ok);
  if (verdict.ok) {
    check('verified payload echoes the validated relics', JSON.stringify(verdict.relics) === JSON.stringify(relics));
  } else {
    console.log('  (champion not beaten with this team/date — parity still asserted above)');
  }

  // A forged payload that drops the relics should re-sim differently when the
  // relics actually mattered (and at minimum must never crash / pass blindly).
  const noRelics = verifyChampionWin({ ...payload, relics: [] });
  check('re-sim without the relics is still a clean verdict', typeof noRelics.ok === 'boolean');
}

console.log('\n[4] sanitizeRelics — validation, dedupe, cap');
{
  check('drops bogus ids', JSON.stringify(sanitizeRelics(['leftovers', 'NOPE', 42, null])) === JSON.stringify(['leftovers']));
  check('de-dupes', JSON.stringify(sanitizeRelics(['lifeorb', 'lifeorb'])) === JSON.stringify(['lifeorb']));
  check('non-array → []', sanitizeRelics('leftovers').length === 0 && sanitizeRelics(undefined).length === 0);
  const huge = sanitizeRelics(ALL_RELICS.concat(ALL_RELICS));
  check('caps at MAX_RELICS', huge.length === MAX_RELICS);
  check('isRelicId guards', isRelicId('leftovers') && !isRelicId('leftover') && !isRelicId(7));
}

console.log('\n[5] rollRelicOffer — determinism + criteria');
{
  // A pure-Fire team (Charmander line) so type-gating is observable.
  const fireTeam = teamFromMons([
    { id: '4', sign: 'leo' }, // Charmander (Fire)
    { id: '5', sign: 'leo' }, // Charmeleon (Fire)
  ]);
  const seed = 'offerseed';
  const a = rollRelicOffer(seed, 5, fireTeam, []);
  const b = rollRelicOffer(seed, 5, fireTeam, []);
  check('same inputs → same offer (deterministic)', JSON.stringify(a) === JSON.stringify(b));
  check('offers at most RELIC_OFFER_COUNT', a.length <= RELIC_OFFER_COUNT);
  check('no duplicates within an offer', new Set(a).size === a.length);

  // Type gating: a fire team can be offered Charcoal but never a Water booster.
  let sawWaterBooster = false;
  for (let s = 0; s < 40; s++) {
    const offer = rollRelicOffer(`gate:${s}`, 5, fireTeam, []);
    if (offer.includes('mysticwater')) sawWaterBooster = true;
  }
  check('never offers a type booster the team can\'t use', !sawWaterBooster);

  // Owned relics are excluded.
  const owned: RelicId[] = ['leftovers', 'wiseglasses'];
  let offeredOwned = false;
  for (let s = 0; s < 40; s++) {
    const offer = rollRelicOffer(`own:${s}`, 5, CREATURES.slice(0, 6), owned);
    if (offer.some((id) => owned.includes(id))) offeredOwned = true;
  }
  check('never re-offers an owned relic', !offeredOwned);

  // minStage gating: Life Orb (minStage 4) can't appear at stage 1.
  let earlyLifeOrb = false;
  for (let s = 0; s < 40; s++) {
    if (rollRelicOffer(`early:${s}`, 1, CREATURES.slice(0, 6), []).includes('lifeorb')) earlyLifeOrb = true;
  }
  check('respects minStage (no Life Orb at stage 1)', !earlyLifeOrb);

  // Pickup: a Meowth with Pickup leans item events toward rarer relics.
  const pickupTeam = teamFromMons([{ id: '52', sign: 'gemini', ability: 'pickup' }]);
  const plainTeam = teamFromMons([{ id: '52', sign: 'gemini', ability: 'technician' }]);
  let pickupRare = 0;
  let plainRare = 0;
  for (let s = 0; s < 80; s++) {
    const offer = rollRelicOffer(`pickup:${s}`, 5, pickupTeam, []);
    if (offer.some((id) => RELICS[id].rarity !== 'common')) pickupRare++;
    const plain = rollRelicOffer(`pickup:${s}`, 5, plainTeam, []);
    if (plain.some((id) => RELICS[id].rarity !== 'common')) plainRare++;
  }
  check('Pickup leans offers toward rarer relics', pickupRare > plainRare);
}

console.log('\n[6] itemEventStages — count + bounds');
{
  const len = 18; // a master-length ladder
  const easy = itemEventStages('seedA', 'easy', len);
  const master = itemEventStages('seedA', 'master', len);
  check('easy schedules fewer events than master', easy.size < master.size);
  check('master schedules the configured count', master.size === 3);
  check('events never sit on the first battle or the Champion', [...master].every((i) => i >= 1 && i <= len - 2));
  const again = itemEventStages('seedA', 'master', len);
  check('deterministic for a seed', JSON.stringify([...master].sort()) === JSON.stringify([...again].sort()));
  check('a tiny ladder schedules nothing', itemEventStages('seedA', 'master', 2).size === 0);
}

console.log('\n[7] registry integrity');
{
  check('every RelicId has a def whose id matches its key', ALL_RELICS.every((id) => RELICS[id].id === id));
  check('every relic art filename is lowercased', ALL_RELICS.every((id) => RELICS[id].icon === RELICS[id].icon.toLowerCase()));
  check('CREATURES_BY_ID is wired (sanity)', !!CREATURES_BY_ID['6']);
}

console.log('\n[8] Boss difficulty passive + daily reset');
{
  const easy = championFoeStatMult('easy');
  const normal = championFoeStatMult('normal');
  const hard = championFoeStatMult('hard');
  const master = championFoeStatMult('master');
  check('easy handicaps the boss below normal', easy < normal);
  check('hard/master toughen the boss above normal', hard > normal && master > hard);
  check('master is the bare champion edge x1.25', approx(master, normal * 1.25));

  const now = Date.UTC(2026, 5, 25, 10, 0, 0); // 10:00 UTC, past the 03:00 reset
  const next = nextDailyResetMs(new Date(now));
  check('next reset is strictly in the future', next > now);
  check('reset lands on the configured UTC hour (03:00 = midnight BRT)', new Date(next).getUTCHours() === 3);
  const before = Date.UTC(2026, 5, 25, 2, 0, 0); // 02:00 UTC, before the 03:00 reset
  check('a pre-reset time resets later the same day', nextDailyResetMs(new Date(before)) === Date.UTC(2026, 5, 25, 3, 0, 0));
}

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
