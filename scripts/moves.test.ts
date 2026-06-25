/**
 * Stand-alone sanity check for the move system — specifically the support/setup
 * variety layer (Dragon Dance, Bulk Up, Charm, Screech, Scary Face, Confuse Ray
 * and the `multistage` effect). No Redis / network: it exercises the pure,
 * deterministic pieces (moveEffectLabel + movesFor) plus pool invariants across
 * the whole dex, so a regression in distribution or labelling fails loudly.
 *
 *   npx --yes tsx scripts/moves.test.ts
 */
import {
  moveEffectLabel,
  moveSelfNote,
  movesFor,
  MOVE_SLOTS,
  moveCategory,
  canRollBuild,
  redistributeForBuild,
  candidateMovesFor,
  moveByName,
} from '../src/game/moves.js';
import {
  CREATURES,
  CREATURES_BY_ID,
  withBuild,
  withMoveOverride,
} from '../src/game/pokemon.js';
import { monToRecord, teamFromMons } from '../src/game/leaderboard.js';
import type { BaseStats, Move, MoveEffect } from '../src/game/types.js';

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

// The single-stat setup buttons (movesFor grants at most ONE of these per mon).
const SETUP_BUTTONS = new Set([
  'Swords Dance',
  'Agility',
  'Iron Defense',
  'Dragon Dance',
  'Bulk Up',
]);
// The support/disruption layer (movesFor grants at most ONE of these per mon).
const SUPPORT_MOVES = new Set(['Charm', 'Screech', 'Scary Face', 'Confuse Ray']);

// Keeps the legacy (hp, atk, def, spd) call shape used throughout this test;
// Energy Attack/Defense default to mirror the physical pair, so these fixtures
// read as balanced mons unless a test cares about the split.
const stats = (
  hp: number,
  atk: number,
  def: number,
  spd: number,
  eatk: number = atk,
  edef: number = def,
): BaseStats => ({
  hp,
  atk,
  eatk,
  def,
  edef,
  spd,
});
const has = (moves: Move[], name: string) => moves.some((m) => m.name === name);
const named = (moves: Move[], name: string) => moves.find((m) => m.name === name);

console.log('\n[1] moveEffectLabel — multistage + foe debuff strings');
{
  const dance: MoveEffect = {
    kind: 'multistage',
    stages: [
      { stat: 'atk', delta: 1 },
      { stat: 'spd', delta: 1 },
    ],
    chance: 1,
    target: 'self',
  };
  check('Dragon-Dance label reads as a self buff', moveEffectLabel(dance) === 'Raises own ATK & SPD');

  const bulk: MoveEffect = {
    kind: 'multistage',
    stages: [
      { stat: 'atk', delta: 1 },
      { stat: 'def', delta: 1 },
    ],
    chance: 1,
    target: 'self',
  };
  check('Bulk-Up label reads as a self buff', moveEffectLabel(bulk) === 'Raises own ATK & DEF');

  const charm: MoveEffect = { kind: 'stage', stat: 'atk', delta: -2, chance: 1, target: 'foe' };
  check("Charm label reads as a foe debuff", moveEffectLabel(charm) === "-2 foe's ATK");
}

console.log('\n[2] movesFor — type-themed support/setup lands on the right mon');
{
  // Hard-hitting Dragon → Dragon Dance (and the multistage effect is intact).
  const dragon = movesFor(['dragon'], stats(90, 100, 90, 40), 'aries');
  check('fast/strong Dragon gets Dragon Dance', has(dragon, 'Dragon Dance'));
  const dd = named(dragon, 'Dragon Dance');
  check(
    'Dragon Dance is a power-0 self multistage',
    !!dd && dd.power === 0 && dd.effect?.kind === 'multistage' && dd.effect.target === 'self',
  );

  // Hard-hitting Fighter → Bulk Up.
  const fighter = movesFor(['fighting'], stats(90, 100, 90, 40), 'aries');
  check('strong Fighter gets Bulk Up', has(fighter, 'Bulk Up'));

  // Defensive Fairy → Charm.
  const fairy = movesFor(['fairy'], stats(70, 50, 100, 60), 'aries');
  check('defensive Fairy gets Charm', has(fairy, 'Charm'));

  // Ghost → Confuse Ray.
  const ghost = movesFor(['ghost'], stats(60, 70, 60, 80), 'aries');
  check('Ghost gets Confuse Ray', has(ghost, 'Confuse Ray'));

  // Bulky non-themed attacker → Screech (stat-based).
  const wallbreaker = movesFor(['steel'], stats(90, 100, 90, 40), 'aries');
  check('bulky attacker gets Screech', has(wallbreaker, 'Screech'));

  // Slow bulky non-themed mon → Scary Face (stat-based).
  const slowWall = movesFor(['water'], stats(100, 70, 90, 40), 'aries');
  check('slow wall gets Scary Face', has(slowWall, 'Scary Face'));
}

console.log('\n[3] Pool invariants hold across the entire dex');
{
  let tooLong = 0;
  let doubleSetup = 0;
  let doubleSupport = 0;
  let ironAndRecover = 0;
  let badMultistage = 0;
  const counts: Record<string, number> = {
    'Dragon Dance': 0,
    'Bulk Up': 0,
    Charm: 0,
    Screech: 0,
    'Scary Face': 0,
    'Confuse Ray': 0,
  };

  for (const c of CREATURES) {
    if (c.moves.length > MOVE_SLOTS) tooLong++;
    const setups = c.moves.filter((m) => SETUP_BUTTONS.has(m.name));
    const supports = c.moves.filter((m) => SUPPORT_MOVES.has(m.name));
    if (setups.length > 1) doubleSetup++;
    if (supports.length > 1) doubleSupport++;
    if (has(c.moves, 'Iron Defense') && has(c.moves, 'Recover')) ironAndRecover++;
    for (const m of c.moves) {
      if (m.name in counts) counts[m.name]++;
      // Every multistage move we ship is a power-0 self setup — never a rider.
      if (m.effect?.kind === 'multistage' && (m.power !== 0 || m.effect.target !== 'self')) {
        badMultistage++;
      }
    }
  }

  check('no pool exceeds MOVE_SLOTS', tooLong === 0);
  check('never two setup buttons on one mon', doubleSetup === 0);
  check('never two support moves on one mon', doubleSupport === 0);
  check('never Iron Defense + Recover together', ironAndRecover === 0);
  check('multistage moves are all power-0 self setups', badMultistage === 0);

  // Distribution sanity — each new move must actually reach some species, or the
  // movesFor wiring silently regressed.
  for (const [name, n] of Object.entries(counts)) {
    check(`${name} is distributed to at least one species`, n > 0);
  }
}

console.log('\n[4] Recoil & flinch — labels and distribution');
{
  // Labels read cleanly for the two new effect kinds.
  const recoil: MoveEffect = { kind: 'recoil', fraction: 1 / 3 };
  check('recoil label reads as a self-damage rider', moveEffectLabel(recoil) === 'Recoils 33% of damage dealt');
  const flinch: MoveEffect = { kind: 'flinch', chance: 0.3 };
  check('flinch label notes the speed requirement', moveEffectLabel(flinch) === '30% flinch (if faster)');

  // A hard-hitting, non-bulky attacker of a recoil-capable type packs the nuke.
  const recklessFire = movesFor(['fire'], stats(70, 110, 60, 100), 'aries');
  check('hard-hitting Fire gets Flare Blitz', has(recklessFire, 'Flare Blitz'));
  const flareBlitz = named(recklessFire, 'Flare Blitz');
  check(
    'Flare Blitz is a high-power recoil move',
    !!flareBlitz && flareBlitz.power >= 100 && flareBlitz.effect?.kind === 'recoil',
  );

  // A bulky mon never takes the suicidal nuke (it's the offensive answer to bulk,
  // not a tool for the walls themselves).
  const bulkyFire = movesFor(['fire'], stats(110, 110, 100, 50), 'aries');
  check('bulky Fire skips the recoil nuke', !has(bulkyFire, 'Flare Blitz'));

  // Across the dex: both new effect kinds actually reach some species (recoil via
  // the nukes, flinch via Iron Head / Rock Slide / Air Slash STAB cores).
  let recoilMons = 0;
  let flinchMons = 0;
  let powerlessRecoil = 0;
  for (const c of CREATURES) {
    if (c.moves.some((m) => m.effect?.kind === 'recoil')) recoilMons++;
    if (c.moves.some((m) => m.effect?.kind === 'flinch')) flinchMons++;
    // A recoil move is always a damaging finisher, never a power-0 utility.
    if (c.moves.some((m) => m.effect?.kind === 'recoil' && m.power <= 0)) powerlessRecoil++;
  }
  check('recoil moves reach at least one species', recoilMons > 0);
  check('flinch moves reach at least one species', flinchMons > 0);
  check('every recoil move deals damage (never power-0)', powerlessRecoil === 0);
}

console.log('\n[5] Signature moves — custom riders land on the right species');
{
  // Self-cost note reads cleanly for both new fields.
  check(
    'selfStage note reads as a self stat cost',
    moveSelfNote({ name: '', type: 'fire', power: 95, accuracy: 1, selfStage: { stat: 'spd', delta: -1 } }) ===
      '-1 own SPD',
  );
  check(
    'lockTurns note mentions the type lockout',
    moveSelfNote({ name: '', type: 'water', power: 150, accuracy: 1, lockTurns: 2 }) ===
      'locks its own Water moves briefly',
  );
  check('a plain move has no self-cost note', moveSelfNote({ name: '', type: 'normal', power: 80, accuracy: 1 }) === null);

  // Rapidash (#78): blazing charge that burns at a high clip AND taxes its Speed.
  const rapidash = CREATURES_BY_ID['78'];
  const gallop = rapidash && named(rapidash.moves, 'Searing Gallop');
  check('Rapidash carries Searing Gallop', !!gallop);
  check(
    'Searing Gallop burns on hit and costs the user Speed',
    !!gallop && gallop.effect?.kind === 'burn' && gallop.selfStage?.stat === 'spd' && gallop.selfStage.delta < 0,
  );

  // Blastoise (#9): a water nuke that benches its own Water moves after firing.
  const blastoise = CREATURES_BY_ID['9'];
  const cannon = blastoise && named(blastoise.moves, 'Hydro Cannon');
  check('Blastoise carries Hydro Cannon', !!cannon);
  check(
    'Hydro Cannon is a high-power Water move with a lockout',
    !!cannon && cannon.type === 'water' && cannon.power >= 120 && (cannon.lockTurns ?? 0) > 0,
  );
  // The lockout is only fair because Blastoise has non-Water moves to fall back on.
  check(
    'Blastoise has a non-Water attack to use while locked out',
    !!blastoise && blastoise.moves.some((m) => m.type !== 'water' && m.power > 0),
  );

  // Headliner signatures land on the right marquee species with the right rider.
  const sig = (id: string, move: string) => named(CREATURES_BY_ID[id]?.moves ?? [], move);
  check('Gengar carries Shadow Smother (always badly poisons)', (() => {
    const m = sig('94', 'Shadow Smother');
    return !!m && m.effect?.kind === 'poison' && m.effect.chance >= 1;
  })());
  check('Machamp carries Dynamic Punch (always confuses)', (() => {
    const m = sig('68', 'Dynamic Punch');
    return !!m && m.effect?.kind === 'confuse' && m.effect.chance >= 1;
  })());
  check('Gyarados carries Thrash (drops its own Defense)', (() => {
    const m = sig('130', 'Thrash');
    return !!m && m.power >= 120 && m.selfStage?.stat === 'def' && m.selfStage.delta < 0;
  })());
  check('Tyranitar carries Sandstorm Slam (always shreds foe Defense)', (() => {
    const m = sig('248', 'Sandstorm Slam');
    return !!m && m.effect?.kind === 'stage' && m.effect.target === 'foe' && m.effect.delta < 0 && m.effect.chance >= 1;
  })());
  check('Alakazam carries Psycho Boost (huge Psychic nuke with a lockout)', (() => {
    const m = sig('65', 'Psycho Boost');
    return !!m && m.type === 'psychic' && m.power >= 130 && (m.lockTurns ?? 0) > 0;
  })());
  check('Aggron carries Heavy Slam (always slows the foe)', (() => {
    const m = sig('306', 'Heavy Slam');
    return (
      !!m &&
      m.effect?.kind === 'stage' &&
      m.effect.stat === 'spd' &&
      m.effect.target === 'foe' &&
      m.effect.delta < 0 &&
      m.effect.chance >= 1
    );
  })());
  check('Crobat carries Vampire Fang (drains more than an ordinary leech)', (() => {
    const m = sig('169', 'Vampire Fang');
    return !!m && m.effect?.kind === 'lifesteal' && m.effect.fraction > 0.5;
  })());

  // Every shipped signature with a lockout also leaves its owner a fallback, or
  // the lockout would softlock the AI's damaging-move search.
  let lockSoftlocks = 0;
  for (const c of CREATURES) {
    const locker = c.moves.find((m) => (m.lockTurns ?? 0) > 0);
    if (locker && !c.moves.some((m) => m.type !== locker.type && m.power > 0)) lockSoftlocks++;
  }
  check('no lockout move can softlock its owner', lockSoftlocks === 0);
}

console.log('\n[6] Physical/Energy builds — eligibility, redistribution, move floor');
{
  // Eligibility: genuinely mixed attackers can roll a build; lopsided ones can't.
  const starmie = CREATURES_BY_ID['121']; // 100/100-ish mixed
  const machamp = CREATURES_BY_ID['68']; // 130/65 — clearly physical
  const alakazam = CREATURES_BY_ID['65']; // 50/135 — clearly energy
  check('a mixed attacker is build-eligible', !!starmie && canRollBuild(starmie.stats));
  check('a lopsided physical attacker is NOT build-eligible', !!machamp && !canRollBuild(machamp.stats));
  check('a lopsided energy attacker is NOT build-eligible', !!alakazam && !canRollBuild(alakazam.stats));

  // Redistribution is budget-neutral and decisive in the chosen direction.
  if (starmie) {
    const phys = redistributeForBuild(starmie.stats, 'physical');
    const enr = redistributeForBuild(starmie.stats, 'energy');
    check('physical build makes Physical Attack the higher stat', phys.atk > phys.eatk);
    check('energy build makes Energy Attack the higher stat', enr.eatk > enr.atk);
    const before = starmie.stats.atk + starmie.stats.eatk;
    check(
      'redistribution conserves the offensive budget (±1 rounding)',
      Math.abs(phys.atk + phys.eatk - before) <= 1 && Math.abs(enr.atk + enr.eatk - before) <= 1,
    );
    check('redistribution leaves HP/DEF/SPD untouched', phys.hp === starmie.stats.hp && phys.spd === starmie.stats.spd && phys.def === starmie.stats.def);
  }

  // The move floor: a physical build always carries ≥30% physical attacks, even
  // for an energy-typed species (Starmie is Water/Psychic — both energy types).
  const floor = Math.ceil(MOVE_SLOTS * 0.3);
  if (starmie) {
    const physMon = withBuild(starmie, 'physical');
    const physAttacks = physMon.moves.filter((m) => m.power > 0 && moveCategory(m) === 'physical').length;
    check(
      `physical build of an energy-typed mon still gets ≥${floor} physical moves`,
      physAttacks >= floor,
    );
    const enrMon = withBuild(starmie, 'energy');
    const enrAttacks = enrMon.moves.filter((m) => m.power > 0 && moveCategory(m) === 'energy').length;
    check(`energy build keeps ≥${floor} energy moves`, enrAttacks >= floor);
    check('the two builds produce different stat lines', physMon.stats.atk !== enrMon.stats.atk);
  }

  // withBuild is a no-op on a lopsided species (its stats can't be reshaped).
  if (machamp) {
    const forced = withBuild(machamp, 'energy');
    check('withBuild on a lopsided mon leaves its stats untouched', forced.stats.atk === machamp.stats.atk && forced.build === undefined);
  }
}

console.log('\n[7] Move tweaks + serialization round-trip');
{
  const starmie = CREATURES_BY_ID['121'];
  if (starmie) {
    // candidateMovesFor is stable and never offers a move the registry can't
    // resolve (so a stored name always rebuilds to a real Move).
    const cands = candidateMovesFor(starmie.types, starmie.dexId);
    check('candidate pool is non-empty', cands.length > 0);
    check('every candidate resolves via the move registry', cands.every((m) => moveByName(m.name)?.name === m.name));

    // A built + move-tweaked mon survives monToRecord → teamFromMons byte-for-byte
    // (stats, build and the swapped move all reconstruct identically).
    const built = withBuild(starmie, 'physical');
    const swapIn = cands.find((m) => !built.moves.some((x) => x.name === m.name))!;
    const tweaked = withMoveOverride(built, 2, swapIn);
    const [rebuilt] = teamFromMons([monToRecord(tweaked)]);
    check('rebuilt mon keeps the rolled build', rebuilt.build === 'physical');
    check('rebuilt mon keeps the redistributed stats', rebuilt.stats.atk === tweaked.stats.atk && rebuilt.stats.eatk === tweaked.stats.eatk);
    check('rebuilt mon keeps the swapped move in its slot', rebuilt.moves[2]?.name === swapIn.name);
    check(
      'rebuilt moveset matches the played one exactly',
      rebuilt.moves.map((m) => m.name).join(',') === tweaked.moves.map((m) => m.name).join(','),
    );

    // Anti-cheat: a forged illegal move name is dropped on the lenient rebuild.
    const forged = monToRecord(tweaked);
    forged.moves = [{ slot: 0, name: 'Definitely Not A Real Move' }];
    const [forgedRebuilt] = teamFromMons([forged]);
    check('a forged/illegal move tweak is dropped on rebuild', forgedRebuilt.moves[0]?.name === built.moves[0]?.name);

    // Anti-cheat: a build claimed on a lopsided species is ignored on rebuild.
    const fakeBuild = monToRecord(CREATURES_BY_ID['68']); // Machamp
    fakeBuild.build = 'energy';
    const [machampRebuilt] = teamFromMons([fakeBuild]);
    check('a build forged onto a lopsided mon is ignored', machampRebuilt.stats.atk === CREATURES_BY_ID['68'].stats.atk);
  }
}

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
