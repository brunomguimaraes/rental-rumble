export type PokemonType =
  | 'normal'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy';

export type StatusKind = 'burn' | 'stun' | null;

export type MoveEffect =
  | { kind: 'burn'; chance: number }
  | { kind: 'stun'; chance: number }
  | { kind: 'heal'; amount: number } // fraction of max hp
  | { kind: 'lifesteal'; fraction: number };

/**
 * Which PMD attack animation a move should play. PMDCollab sprites ship several
 * distinct attack anims, so the move we pick can drive a fitting motion instead
 * of one generic lunge: a claw swipe (`strike`), a beam/projectile (`shoot`), an
 * aura/sound burst (`special`), a heavy ground/rock slam (`swing`), or a
 * self-targeted wind-up for status & heals (`charge`). Each falls back to the
 * generic `Attack` sheet for species that don't have the richer one.
 */
export type AttackAnim = 'strike' | 'shoot' | 'special' | 'swing' | 'charge';

export interface Move {
  name: string;
  type: PokemonType;
  power: number; // 0 for pure-status / heal moves
  accuracy: number; // 0..1
  effect?: MoveEffect;
}

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export type Role = 'Sweeper' | 'Tank' | 'Support' | 'Bruiser';

/** Rarity tier — legendary/mythical/pseudo are "special" (gold-bordered). */
export type SpecialTier = 'normal' | 'legendary' | 'mythical' | 'pseudo';

/** Raw generated dex row (see scripts/gen-pokedex.ts). */
export interface DexEntry {
  id: number;
  name: string;
  types: PokemonType[];
  stats: BaseStats;
  tier: SpecialTier;
}

export interface Creature {
  id: string; // string form of dex id, used as a stable key
  dexId: number;
  name: string;
  sprite: string; // front battle sprite (opponent's active)
  back: string; // back battle sprite (player's active)
  portrait: string; // PMD-style square portrait (selector cards)
  mini: string; // box/icon mini sprite sheet (team miniatures)
  types: PokemonType[]; // 1 or 2 real types
  tier: SpecialTier;
  role: Role; // currently selected role
  eligibleRoles: Role[]; // roles this Pokémon may take, best-fit first
  stats: BaseStats;
  moves: Move[];
}

/** A creature as it exists during a battle (with live HP & status). */
export interface Battler {
  creature: Creature;
  maxHp: number;
  hp: number;
  status: StatusKind;
  statusTurns: number;
}

export type Side = 'player' | 'foe';

export type OpponentTier = 'trainer' | 'gym' | 'elite' | 'champion';

export interface Opponent {
  id: string;
  name: string;
  title: string;
  sprite: string; // emoji fallback for the trainer
  badge: string; // Gym/League badge image URL
  art: string; // overworld trainer icon (front-facing PNG) URL
  artGif: string; // overworld trainer idle-animation (GIF) URL
  type: PokemonType; // thematic specialty
  teamSize: number;
  tier: OpponentTier;
  quote: string;
}
