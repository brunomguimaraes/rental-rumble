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

export type StatusKind = 'burn' | 'stun' | 'poison' | 'sleep' | null;

/** A stat a stage modifier can tilt during battle (HP is never staged). */
export type StageStat = 'atk' | 'def' | 'spd';

export type MoveEffect =
  | { kind: 'burn'; chance: number }
  | { kind: 'stun'; chance: number }
  | { kind: 'poison'; chance: number } // escalating "toxic"-style end-of-turn damage
  | { kind: 'sleep'; chance: number } // skips a few turns, then wakes
  | { kind: 'confuse'; chance: number } // may hurt itself instead of acting
  | { kind: 'heal'; amount: number } // fraction of max hp
  | { kind: 'lifesteal'; fraction: number }
  // Buff/debuff: shifts a stat stage on self or the foe. `chance` is 1 for pure
  // setup moves, <1 for on-hit riders.
  | { kind: 'stage'; stat: StageStat; delta: number; chance: number; target: 'self' | 'foe' };

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
  power: number; // 0 for pure-status / heal / setup moves
  accuracy: number; // 0..1
  priority?: number; // >0 moves before slower foes regardless of Speed (default 0)
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
  pokeball: string; // cosmetic ball id this Pokémon is sent out in (see balls.ts)
}

/** A creature as it exists during a battle (with live HP & status). */
export interface Battler {
  creature: Creature;
  maxHp: number;
  hp: number;
  status: StatusKind;
  statusTurns: number; // remaining turns for burn / stun / sleep
  toxicCounter: number; // escalation step for poison (0 when not poisoned)
  confusion: number; // remaining confused turns (0 = not confused); a volatile
  stages: { atk: number; def: number; spd: number }; // -6..+6 battle buffs/debuffs
}

export type Side = 'player' | 'foe';

export type OpponentTier = 'trainer' | 'gym' | 'elite' | 'champion' | 'special';

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
  /**
   * For famous trainers (any rung): the id into FAMOUS_TRAINERS (see specials.ts)
   * whose hand-picked, canonical anime/manga team this opponent fields instead of
   * a randomly generated one. Present on gym/elite/special cameos like Brock,
   * Lorelei or James.
   */
  famousId?: string;
}
