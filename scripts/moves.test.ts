/**
 * Stand-alone sanity check for the move system — specifically the support/setup
 * variety layer (Dragon Dance, Bulk Up, Charm, Screech, Scary Face, Confuse Ray
 * and the `multistage` effect). No Redis / network: it exercises the pure,
 * deterministic pieces (moveEffectLabel + movesFor) plus pool invariants across
 * the whole dex, so a regression in distribution or labelling fails loudly.
 *
 *   npx --yes tsx scripts/moves.test.ts
 */
import { moveEffectLabel, movesFor, MOVE_SLOTS } from '../src/game/moves.js';
import { CREATURES } from '../src/game/pokemon.js';
import type { BaseStats, Move, MoveEffect, PokemonType } from '../src/game/types.js';

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

const stats = (hp: number, atk: number, def: number, spd: number): BaseStats => ({
  hp,
  atk,
  def,
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

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
