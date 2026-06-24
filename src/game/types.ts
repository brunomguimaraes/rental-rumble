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
  // Lops off a fixed share of the foe's CURRENT hp, ignoring Defense entirely
  // (Super Fang). The meta's answer to Iron Defense walls and raw bulk — bulk
  // can't blunt it, though it can never KO on its own.
  | { kind: 'fracdamage'; fraction: number }
  // Seals the foe's setup/heal buttons for a few turns (Taunt): a forced trade
  // that stops a wall from fortifying or out-healing. Deals no damage itself.
  | { kind: 'taunt'; chance: number }
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
  // Power Points: how many times this move may be used in a battle. `undefined`
  // means unlimited. Used to cap sustain moves (Recover) so two bulky walls can't
  // heal each other forever — see chooseMove/takeTurn in battle.ts.
  pp?: number;
  effect?: MoveEffect;
}

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

/**
 * Zodiac sign — the "personality" a Pokémon is born under. Replaces the old
 * Sweeper/Tank/Support/Bruiser roles: a sign is an identity (any mon can carry
 * any sign) that gently tilts its stats. See zodiac.ts for spreads/elements.
 *
 * The 12 common signs are gentle, net-neutral trade-offs. Beyond them sit rare
 * "celestial" signs that only appear at long odds: the four off-ecliptic
 * constellations the Moon and planets wander through (Orion / Cetus / Aquila /
 * Serpens) give big, mixed boosts, and the mythic Abhijit — the dropped 28th
 * Vedic lunar mansion — buffs every stat by half.
 */
export type Sign =
  // The classic twelve.
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces'
  // Rare celestial wanderers.
  | 'orion'
  | 'cetus'
  | 'aquila'
  | 'serpens'
  // Mythic.
  | 'abhijit';

/** Rarity tier — legendary/mythical are "special" (gold-bordered). */
export type SpecialTier = 'normal' | 'legendary' | 'mythical';

/**
 * A passive species Ability. Unlike zodiac signs (stat tilts) or moves, an
 * ability is a rule that bends the battle engine itself. Only a handful of
 * species carry one for now — this is the scaffolding we grow over time, so the
 * union starts small (see abilities.ts for the registry + species mapping).
 *
 * - `truant`      — loafs around every other turn (Slaking line). The drawback
 *                   that keeps a brute with monstrous stats honest.
 * - `vital-spirit`— too wired to doze off; can never be put to sleep.
 */
export type AbilityId = 'truant' | 'vital-spirit';

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
  sign: Sign; // zodiac sign this Pokémon is born under (tilts its stats)
  eligibleSigns: Sign[]; // all 12 signs, ordered best-fit-first for these stats
  stats: BaseStats;
  moves: Move[];
  /**
   * The species' passive Ability, if it has one (most don't — yet). Carried
   * through evolution, sign/ball swaps and recolours like any other trait, and
   * read by the battle engine to apply its rule (e.g. Truant's loafing). See
   * abilities.ts for the registry.
   */
  ability?: AbilityId;
  pokeball: string; // cosmetic ball id this Pokémon is sent out in (see balls.ts)
  /**
   * A rare shiny: an alternate colouration with a small, flat all-stat blessing
   * (see SHINY_STAT_MULT in pokemon.ts). Cosmetically it swaps the battle sprite
   * & portrait for the PMD shiny recolour; mechanically every stat is nudged up
   * by the same gentle factor, so a shiny is strictly a lucky upgrade without
   * warping balance the way a celestial sign can.
   */
  shiny: boolean;
  /**
   * A fan-made *alternate colour* (non-shiny) palette — purely cosmetic. Swaps
   * the battle sprite & portrait for the PMDCollab "Altcolor"/"Alternate" recolour
   * with zero stat or card change. Rolls more often than a shiny but, unlike one,
   * carries no boost and no special framing — just a different-looking colour.
   * Mutually exclusive with `shiny` (a mon is at most one special colouring).
   */
  altColor: boolean;
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
  // Remaining turns the battler is taunted: while >0 it cannot set up, heal or
  // throw a pure-status move — it must attack. A volatile that ticks down each
  // round (see endOfTurnStatus) and breaks the fortify-and-heal wall loop.
  taunted: number;
  stages: { atk: number; def: number; spd: number }; // -6..+6 battle buffs/debuffs
  // Remaining uses for any move that carries a `pp` cap (keyed by move name).
  // Moves without a cap are absent here and may be used freely.
  pp: Record<string, number>;
  // How many times this battler has self-healed (Recover) so far this battle.
  // Drives diminishing returns: each successive heal restores less, so two
  // healers can't drag a fight out by trading near-full Recovers forever.
  healsUsed: number;
  // Truant ability state: when true, this battler loafs around (skips its
  // action) on its next turn. Toggles on each turn it actually acts, so a Truant
  // user moves only every other turn. Always false for non-Truant species.
  loafing: boolean;
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
  /**
   * An optional fight the player may skip outright (no battle, no penalty) and
   * advance straight to the next rung. Used by the rare `bonus` challenger
   * (Prof. Oak); ordinary ladder foes are mandatory.
   */
  skippable?: boolean;
  /**
   * Whether beating this opponent unlocks the "reroll a sign" reward on the
   * recruit screen. Set only on the run's *last* special trainer (the single
   * special, or the second one when a run fields two), so the gamble is a
   * once-per-run treat.
   */
  signRerollReward?: boolean;
}
