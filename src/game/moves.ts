import type { AttackAnim, Move, PokemonType, Role } from './types';

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
const RECOVER = mk('Recover', 'normal', 0, 1, { kind: 'heal', amount: 0.3 });

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

// The setup move each offensive role brings to the table. Tanks (Recover) and
// Support (coverage/utility) keep their existing fourth slot instead.
const SETUP_FOR: Partial<Record<Role, Move>> = {
  Sweeper: AGILITY, // already fast; doubling down on Speed snowballs sweeps
  Bruiser: SWORDS_DANCE, // raw-power role wants the Attack boost
};

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
  if (move.power === 0) return 'charge';
  if (CONTACT_MOVES.has(move.name)) return 'strike';
  if (HEAVY_MOVES.has(move.name)) return 'swing';
  if (SPECIAL_MOVES.has(move.name)) return 'special';
  return 'shoot';
}

/** Build a 4-move set from a creature's types and role. */
export function movesFor(types: PokemonType[], role: Role): Move[] {
  const moves: Move[] = [];

  const setup = SETUP_FOR[role];

  if (types.length >= 2) {
    const [a, b] = types;
    moves.push(TYPE_MOVES[a][0], TYPE_MOVES[b][0], TYPE_MOVES[a][1]);
    // Tanks trade their 4th slot for sustain; offensive roles for a setup move;
    // Support keeps the extra coverage/utility move.
    moves.push(role === 'Tank' ? RECOVER : (setup ?? TYPE_MOVES[b][1]));
  } else {
    const a = types[0];
    moves.push(TYPE_MOVES[a][0], TYPE_MOVES[a][1]);
    moves.push(role === 'Tank' ? RECOVER : BODY_SLAM);
    // Sweepers get priority (Quick Attack); Bruisers a setup move; others filler.
    moves.push(
      role === 'Sweeper' ? QUICK_ATTACK : (setup ?? BODY_SLAM),
    );
  }

  // De-duplicate (e.g. a Normal-type would otherwise get Body Slam twice).
  const seen = new Set<string>();
  return moves.filter((m) => {
    if (seen.has(m.name)) return false;
    seen.add(m.name);
    return true;
  });
}
