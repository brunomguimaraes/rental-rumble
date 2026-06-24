import type {
  AttackAnim,
  BaseStats,
  Move,
  MoveEffect,
  PokemonType,
  Sign,
  StageStat,
} from './types.js';
import { SIGN_INFO, type Element } from './zodiac.js';

const STAT_LABEL: Record<StageStat, string> = {
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
};

/**
 * A short, human-readable summary of a move's secondary effect — used by the
 * moveset UI (see MovesModal). Pure-status moves (chance 1) read as a verb
 * ("Burns"), on-hit riders carry their odds ("30% burn").
 */
export function moveEffectLabel(effect: MoveEffect): string {
  const pct = (c: number) => `${Math.round(c * 100)}%`;
  switch (effect.kind) {
    case 'burn':
      return effect.chance >= 1 ? 'Burns the foe' : `${pct(effect.chance)} burn`;
    case 'stun':
      return effect.chance >= 1 ? 'Paralyzes the foe' : `${pct(effect.chance)} paralyze`;
    case 'poison':
      return effect.chance >= 1 ? 'Badly poisons the foe' : `${pct(effect.chance)} poison`;
    case 'sleep':
      return effect.chance >= 1 ? 'Puts the foe to sleep' : `${pct(effect.chance)} sleep`;
    case 'confuse':
      return effect.chance >= 1 ? 'Confuses the foe' : `${pct(effect.chance)} confuse`;
    case 'heal':
      return `Heals up to ${Math.round(effect.amount * 100)}% HP (less each repeat)`;
    case 'lifesteal':
      return `Drains ${Math.round(effect.fraction * 100)}% of damage`;
    case 'fracdamage':
      return `Cuts ${Math.round(effect.fraction * 100)}% of current HP (ignores DEF)`;
    case 'taunt':
      return 'Seals setup & heals for a few turns';
    case 'stage': {
      const sign = effect.delta > 0 ? '+' : '';
      const who = effect.target === 'self' ? 'own' : "foe's";
      const change = `${sign}${effect.delta} ${who} ${STAT_LABEL[effect.stat]}`;
      return effect.chance >= 1 ? change : `${pct(effect.chance)} ${change}`;
    }
  }
}

const mk = (
  name: string,
  type: PokemonType,
  power: number,
  accuracy = 1,
  effect?: Move['effect'],
): Move => ({ name, type, power, accuracy, effect });

// Each type provides a reliable STAB attack plus a utility/coverage move
// (often carrying an effect). Real move names, lightly tuned power/accuracy.
const TYPE_MOVES: Record<PokemonType, [Move, Move]> = {
  normal: [
    mk('Body Slam', 'normal', 85, 1, { kind: 'stun', chance: 0.3 }),
    mk('Hyper Voice', 'normal', 90, 1),
  ],
  fire: [
    mk('Flamethrower', 'fire', 90, 1, { kind: 'burn', chance: 0.1 }),
    mk('Will-O-Wisp', 'fire', 0, 0.85, { kind: 'burn', chance: 1 }),
  ],
  water: [
    mk('Surf', 'water', 90, 1),
    mk('Scald', 'water', 80, 1, { kind: 'burn', chance: 0.3 }),
  ],
  electric: [
    mk('Thunderbolt', 'electric', 90, 1, { kind: 'stun', chance: 0.1 }),
    mk('Thunder Wave', 'electric', 0, 0.9, { kind: 'stun', chance: 1 }),
  ],
  grass: [
    mk('Energy Ball', 'grass', 90, 1),
    mk('Giga Drain', 'grass', 75, 1, { kind: 'lifesteal', fraction: 0.5 }),
  ],
  ice: [
    mk('Ice Beam', 'ice', 90, 1, { kind: 'stun', chance: 0.1 }),
    mk('Icicle Crash', 'ice', 85, 0.9, { kind: 'stun', chance: 0.3 }),
  ],
  fighting: [
    // Close Combat lowers the user's own Defense as it connects.
    mk('Close Combat', 'fighting', 100, 1, {
      kind: 'stage',
      stat: 'def',
      delta: -1,
      chance: 1,
      target: 'self',
    }),
    mk('Drain Punch', 'fighting', 75, 1, { kind: 'lifesteal', fraction: 0.5 }),
  ],
  poison: [
    mk('Sludge Bomb', 'poison', 90, 1, { kind: 'poison', chance: 0.3 }),
    mk('Toxic', 'poison', 0, 0.9, { kind: 'poison', chance: 1 }),
  ],
  ground: [
    mk('Earthquake', 'ground', 100, 1),
    mk('Earth Power', 'ground', 90, 1),
  ],
  flying: [
    mk('Hurricane', 'flying', 100, 0.8, { kind: 'stun', chance: 0.2 }),
    mk('Air Slash', 'flying', 75, 0.95, { kind: 'stun', chance: 0.3 }),
  ],
  psychic: [
    mk('Psychic', 'psychic', 90, 1),
    mk('Hypnosis', 'psychic', 0, 0.75, { kind: 'sleep', chance: 1 }),
  ],
  bug: [
    mk('Bug Buzz', 'bug', 90, 1),
    mk('Leech Life', 'bug', 80, 1, { kind: 'lifesteal', fraction: 0.5 }),
  ],
  rock: [
    mk('Stone Edge', 'rock', 100, 0.8),
    mk('Rock Slide', 'rock', 75, 0.9, { kind: 'stun', chance: 0.3 }),
  ],
  ghost: [
    mk('Shadow Ball', 'ghost', 90, 1),
    mk('Shadow Claw', 'ghost', 70, 1),
  ],
  dragon: [
    mk('Dragon Pulse', 'dragon', 85, 1),
    mk('Dragon Claw', 'dragon', 80, 1),
  ],
  dark: [
    mk('Dark Pulse', 'dark', 80, 1, { kind: 'confuse', chance: 0.2 }),
    // Crunch has a chance to drop the target's Defense.
    mk('Crunch', 'dark', 80, 1, {
      kind: 'stage',
      stat: 'def',
      delta: -1,
      chance: 0.3,
      target: 'foe',
    }),
  ],
  steel: [
    mk('Iron Head', 'steel', 80, 1, { kind: 'stun', chance: 0.3 }),
    mk('Flash Cannon', 'steel', 80, 1),
  ],
  fairy: [
    mk('Moonblast', 'fairy', 95, 1),
    mk('Dazzling Gleam', 'fairy', 80, 1),
  ],
};

const BODY_SLAM = TYPE_MOVES.normal[0];
// Priority move: always strikes before slower foes (and ties) regardless of Speed.
const QUICK_ATTACK: Move = {
  name: 'Quick Attack',
  type: 'normal',
  power: 40,
  accuracy: 1,
  priority: 1,
};
// Sustain. No longer granted by a role/sign — it's a regular move any
// sufficiently bulky Pokémon can pack (see movesFor). Capped at HEAL_PP uses so
// two bulky walls (e.g. Chansey) can't out-heal each other into an endless
// stalemate — once the heals dry up, the fight is decided on damage.
export const HEAL_PP = 3;
// Diminishing returns on repeated self-heals within a single battle: every
// Recover after the first restores HEAL_DECAY as much as the previous one
// (heal #n = amount * HEAL_DECAY^(n-1)). The first heal still bites for the
// full amount, but a healer-vs-healer war decays fast instead of stalling —
// applied in battle.ts where the heal is resolved (see Battler.healsUsed).
export const HEAL_DECAY = 0.5;
const RECOVER: Move = {
  ...mk('Recover', 'normal', 0, 1, { kind: 'heal', amount: 0.3 }),
  pp: HEAL_PP,
};

// Anti-wall counterplay (granted to offensive mons in movesFor, never to walls
// themselves — these are the answer TO bulk).
//
// Super Fang: lops off half the foe's CURRENT HP regardless of Defense, so a
// fortified or naturally bulky wall can't soak it. It can't KO on its own
// (always leaves the foe at >=1 HP from this move), so it sets up a finisher
// rather than replacing one. Normal-typed, so Ghosts are immune.
const SUPER_FANG = mk('Super Fang', 'normal', 0, 0.9, {
  kind: 'fracdamage',
  fraction: 0.5,
});
// Taunt: locks the foe out of setup, heals and pure-status moves for a few
// turns, forcing a wall to trade damage instead of stalling. Deals nothing
// itself — pure disruption.
const TAUNT = mk('Taunt', 'dark', 0, 1, { kind: 'taunt', chance: 1 });
// How many turns a Taunt keeps the foe locked into attacking.
export const TAUNT_TURNS = 3;

// Pure setup moves (power 0): sharply raise one of the user's own stat stages.
const SWORDS_DANCE = mk('Swords Dance', 'normal', 0, 1, {
  kind: 'stage',
  stat: 'atk',
  delta: 2,
  chance: 1,
  target: 'self',
});
const AGILITY = mk('Agility', 'psychic', 0, 1, {
  kind: 'stage',
  stat: 'spd',
  delta: 2,
  chance: 1,
  target: 'self',
});
const IRON_DEFENSE = mk('Iron Defense', 'steel', 0, 1, {
  kind: 'stage',
  stat: 'def',
  delta: 2,
  chance: 1,
  target: 'self',
});

// Off-type coverage offered by each element. Because a Pokémon's sign is rolled
// per run, its element-themed coverage shifts run to run — part of what makes an
// 8-move pool feel more varied than a fixed 4-move set. Each entry is a real
// damaging move pulled from the type's kit.
const ELEMENT_COVERAGE: Record<Element, PokemonType[]> = {
  fire: ['fighting', 'rock'],
  earth: ['rock', 'ground'],
  air: ['flying', 'electric'],
  water: ['ice', 'poison'],
};

// Celestial signs are element-less, so they reach for broad, premium coverage
// to match their outsized stats.
const CELESTIAL_COVERAGE: PokemonType[] = ['fighting', 'ice', 'rock', 'ground'];

/** Bulky enough to justify a sustain/defensive button (Recover, Iron Defense). */
function isBulky(s: BaseStats): boolean {
  return s.hp + s.def >= 170;
}

// Contact moves — punches, claws, bites, body checks and dashes — play a melee
// "Strike" (dart in, hit, dart back).
const CONTACT_MOVES = new Set([
  'Body Slam',
  'Quick Attack',
  'Close Combat',
  'Drain Punch',
  'Poison Jab',
  'Zen Headbutt',
  'Leech Life',
  'Shadow Claw',
  'Dragon Claw',
  'Crunch',
  'Iron Head',
]);

// Heavy, ground-shaking AoE moves play a big "Swing" slam.
const HEAVY_MOVES = new Set([
  'Earthquake',
  'Stone Edge',
  'Rock Slide',
  'Icicle Crash',
]);

// Aura / sound / mind-burst specials play "SpAttack" (a stationary special cast)
// rather than a fired projectile.
const SPECIAL_MOVES = new Set([
  'Hyper Voice',
  'Surf',
  'Giga Drain',
  'Earth Power',
  'Psychic',
  'Bug Buzz',
  'Dazzling Gleam',
]);

/**
 * Pick the PMD attack animation that best fits a move. Pure status/heal moves
 * (power 0) wind up in place ("Charge"); contact, heavy and special moves use
 * their dedicated motions; everything else fires a projectile/beam ("Shoot").
 */
export function attackAnimFor(move: Move): AttackAnim {
  // Super Fang is a power-0 move mechanically but lands as a bite — play the
  // melee strike rather than a self-targeted wind-up.
  if (move.effect?.kind === 'fracdamage') return 'strike';
  if (move.power === 0) return 'charge';
  if (CONTACT_MOVES.has(move.name)) return 'strike';
  if (HEAVY_MOVES.has(move.name)) return 'swing';
  if (SPECIAL_MOVES.has(move.name)) return 'special';
  return 'shoot';
}

/** How many moves a Pokémon carries. Deliberately wider than the games' 4 so
 *  the AI has real choices and the same species plays differently across runs. */
export const MOVE_SLOTS = 8;

/**
 * Build a Pokémon's move pool from its types, stats and sign. Unlike the
 * canonical 4-move limit, every mon carries up to {@link MOVE_SLOTS} moves and
 * the battle AI decides which to throw each turn (see chooseMove in battle.ts).
 *
 * The pool is layered, best-first so attacks are never crowded out:
 *   1. STAB core — both moves of each of the mon's own types.
 *   2. Coverage  — element-themed off-type attacks (driven by the sign, so it
 *      shifts run to run).
 *   3. Counter  — anti-wall tools (Super Fang / Taunt) for offensive mons.
 *   4. Priority  — Quick Attack for genuinely fast attackers.
 *   5. Defense   — exactly ONE defensive/utility button per mon (see below).
 *   6. Filler    — Body Slam as a dependable Normal-type fallback.
 *
 * Defensive button rule (anti-stall): a mon never carries both Iron Defense and
 * Recover. Offensive mons set up to hit harder/faster; a pure wall picks a
 * single tool matched to its build — defence-dominant walls fortify (Iron
 * Defense), HP-dominant walls heal (Recover) — so no wall can stack +DEF *and*
 * out-heal in the same battle.
 */
export function movesFor(
  types: PokemonType[],
  stats: BaseStats,
  sign: Sign,
): Move[] {
  const moves: Move[] = [];
  const seen = new Set<string>();
  const add = (m: Move | undefined) => {
    if (!m || seen.has(m.name)) return;
    seen.add(m.name);
    moves.push(m);
  };

  // 1) STAB core.
  for (const t of types) {
    add(TYPE_MOVES[t][0]);
    add(TYPE_MOVES[t][1]);
  }

  // 2) Element-themed coverage for off-type reach. Celestial signs have no
  //    element, so they draw from a broad premium-coverage set instead.
  const element = SIGN_INFO[sign].element;
  const coverage = element ? ELEMENT_COVERAGE[element] : CELESTIAL_COVERAGE;
  for (const t of coverage) {
    if (!types.includes(t)) add(TYPE_MOVES[t][0]);
  }

  // 3) Anti-wall counterplay for offensive mons — the answer TO bulk, so walls
  //    themselves never get it. Hard hitters carry Super Fang (DEF-ignoring
  //    chip); fast mons carry Taunt (stall-breaker).
  if (!isBulky(stats) && stats.atk >= 85) add(SUPER_FANG);
  if (!isBulky(stats) && stats.spd >= 90) add(TAUNT);

  // 4) Priority for fast, hard-hitting attackers.
  if (stats.spd >= 95 && stats.atk >= 80) add(QUICK_ATTACK);

  // 5) Exactly one defensive/utility button (never Iron Defense + Recover
  //    together — see the doc comment above).
  if (stats.atk >= 100) {
    add(SWORDS_DANCE);
    if (isBulky(stats)) add(RECOVER); // bulky attacker may still pack sustain
  } else if (stats.spd >= 100) {
    add(AGILITY);
    if (isBulky(stats)) add(RECOVER);
  } else if (isBulky(stats)) {
    // Pure wall: fortify if defence-dominant, otherwise heal. One or the other.
    if (stats.def >= stats.hp) add(IRON_DEFENSE);
    else add(RECOVER);
  }

  // 6) Dependable filler.
  add(BODY_SLAM);

  return moves.slice(0, MOVE_SLOTS);
}
