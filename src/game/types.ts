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

/** Raw generated dex row (see scripts/gen-pokedex.ts). */
export interface DexEntry {
  id: number;
  name: string;
  types: PokemonType[];
  stats: BaseStats;
  role: Role;
}

export interface Creature {
  id: string; // string form of dex id, used as a stable key
  dexId: number;
  name: string;
  sprite: string; // sprite image URL
  types: PokemonType[]; // 1 or 2 real types
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

export interface Opponent {
  id: string;
  name: string;
  title: string;
  sprite: string; // emoji badge for the trainer
  type: PokemonType; // thematic specialty
  teamSize: number;
  tier: 'gym' | 'elite' | 'champion';
  quote: string;
}
