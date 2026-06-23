import type { Move, PokemonType, Role } from './types';

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
    mk('Close Combat', 'fighting', 100, 1),
    mk('Drain Punch', 'fighting', 75, 1, { kind: 'lifesteal', fraction: 0.5 }),
  ],
  poison: [
    mk('Sludge Bomb', 'poison', 90, 1, { kind: 'burn', chance: 0.3 }),
    mk('Poison Jab', 'poison', 80, 1, { kind: 'burn', chance: 0.2 }),
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
    mk('Zen Headbutt', 'psychic', 80, 0.9, { kind: 'stun', chance: 0.2 }),
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
    mk('Dark Pulse', 'dark', 80, 1, { kind: 'stun', chance: 0.2 }),
    mk('Crunch', 'dark', 80, 1),
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
const QUICK_ATTACK = mk('Quick Attack', 'normal', 40, 1);
const RECOVER = mk('Recover', 'normal', 0, 1, { kind: 'heal', amount: 0.3 });

/** Build a 4-move set from a creature's types and role. */
export function movesFor(types: PokemonType[], role: Role): Move[] {
  const moves: Move[] = [];

  if (types.length >= 2) {
    const [a, b] = types;
    moves.push(TYPE_MOVES[a][0], TYPE_MOVES[b][0], TYPE_MOVES[a][1]);
    // Tanks trade their 4th coverage slot for sustain.
    moves.push(role === 'Tank' ? RECOVER : TYPE_MOVES[b][1]);
  } else {
    const a = types[0];
    moves.push(TYPE_MOVES[a][0], TYPE_MOVES[a][1]);
    moves.push(role === 'Tank' ? RECOVER : BODY_SLAM);
    moves.push(role === 'Sweeper' ? QUICK_ATTACK : BODY_SLAM);
  }

  // De-duplicate (e.g. a Normal-type would otherwise get Body Slam twice).
  const seen = new Set<string>();
  return moves.filter((m) => {
    if (seen.has(m.name)) return false;
    seen.add(m.name);
    return true;
  });
}
