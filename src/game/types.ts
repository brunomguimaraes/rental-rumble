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
  | { kind: 'stage'; stat: StageStat; delta: number; chance: number; target: 'self' | 'foe' }
  // Multi-stat buff/debuff: shifts SEVERAL stat stages at once on self or the foe
  // (Dragon Dance, Bulk Up, …). Every entry shares the same sign so the UI can
  // read it as a single "Raises/Lowers" line. Pure setup/utility only (power 0),
  // so it resolves alongside `stage` in the setup branch — never as an on-hit
  // rider. `chance` mirrors `stage` (1 for guaranteed setup moves).
  | {
      kind: 'multistage';
      stages: { stat: StageStat; delta: number }[];
      chance: number;
      target: 'self' | 'foe';
    };

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
 * ability is a rule that bends the battle engine itself. We grow this union (and
 * the registry + species mapping in abilities.ts) over time, sticking to passives
 * that are clearly fair — deliberately skipping the meta-warpers (Huge Power,
 * Wonder Guard, Protean…) and anything that needs systems we don't
 * model (weather, freeze, flinch, mid-battle switching). Some entries are our own
 * inventions or tamed riffs on canon (kept gentle on purpose), since abilities
 * here only need to be fun and balanced — not faithful to the games.
 *
 * - `truant`       — loafs around every other turn (Slaking line). The drawback
 *                    that keeps a brute with monstrous stats honest.
 * - `vital-spirit` — too wired to doze off; can never be put to sleep.
 * - `moxie`        — basks in each KO, raising its own Attack a stage. Snowball
 *                    fuel that lets a fragile sweeper tear through a wall core.
 * - `speed-boost`  — its Speed climbs a stage at the end of every turn.
 * - `guts`         — shrugs off the downside of a status to hit 1.5× harder
 *                    while afflicted; turns burn/poison/paralysis into a boon.
 * - `adaptability` — its same-type bonus is doubled (STAB 2× instead of 1.5×).
 * - `intimidate`   — cows the foe on entry, dropping its Attack a stage. A
 *                    defensive tempo-swing that softens physical leads.
 * - `sturdy`       — when at full HP, endures any hit that would KO it, clinging
 *                    to 1 HP. A one-time safety net, not raw bulk.
 * - `levitate`     — floats clear of the ground, taking no damage from
 *                    Ground-type moves at all.
 * - `thick-fat`    — a layer of blubber halves the damage it takes from Fire and
 *                    Ice attacks.
 * - `marvel-scale` — a status condition toughens its hide, raising Defense by
 *                    half while afflicted — the defensive mirror of Guts.
 * - `technician`   — wrings extra power from its weakest moves: any attack of 60
 *                    power or less hits 1.5× harder.
 * - `blaze`/`torrent`/`overgrow`/`swarm` — the starter pinch boosts: when worn
 *                    down to a third of its HP, its Fire / Water / Grass / Bug
 *                    moves rally to 1.5× power.
 * - `static`/`flame-body`/`poison-point` — its body is a hazard: a foe that
 *                    lands a hit risks being paralyzed / burned / poisoned.
 * - `regenerator`  — mends a sliver of HP (~1/16 max) at the end of every turn;
 *                    quiet attrition that wears the foe down over a long fight.
 * - `rough-skin`   — a foe that lands a hit recoils on its barbed hide, losing a
 *                    chip of its own HP — punishing tempo for hitting it.
 * - `stamina`      — every hit it weathers stiffens its guard, raising Defense a
 *                    stage; the longer it survives, the harder it is to break.
 * - `multiscale`   — at full HP a protective sheen halves the first blow it takes.
 * - `solid-rock`   — its sturdy frame blunts super-effective hits to 0.75×.
 * - `tinted-lens`  — lenses focus its weak hits: not-very-effective moves it uses
 *                    deal double, ignoring the resistance.
 * - `battle-armor` — hard plating seals out critical hits entirely.
 * - `quick-feet`   — a status condition sends adrenaline surging, boosting Speed
 *                    by half (and shrugging off paralysis' slowdown).
 * - `magic-guard`  — takes no chip damage from burn or poison; only direct hits
 *                    can wound it.
 * - `poison-heal`  — thrives on toxins: while poisoned it heals each turn instead
 *                    of taking damage.
 * - `clear-body`   — unflappable; the foe can't lower its stats (Intimidate and
 *                    debuffs slide right off).
 * - `defiant`      — an enemy stat drop stings its pride into a sharp two-stage
 *                    Attack spike.
 * - `sniper`       — its critical hits cut deeper, dealing 2.25× instead of 1.5×.
 * - `sheer-force`  — throws its whole weight behind every blow: +30% damage, but
 *                    its moves' bonus effects (burns, drops, …) never trigger.
 * - `shed-skin`    — sloughs off a status condition outright about a third of the
 *                    time at the end of each turn.
 * - `early-bird`   — a light sleeper: it shakes off sleep twice as fast.
 * - `scrappy`      — undaunted by Ghosts — its Normal and Fighting moves land on
 *                    them as if the immunity weren't there.
 * - `unaware`      — ignores the foe's stat-stage changes entirely, both when
 *                    attacking and defending — a hard counter to setup sweepers.
 */
export type AbilityId =
  | 'truant'
  | 'vital-spirit'
  | 'moxie'
  | 'speed-boost'
  | 'guts'
  | 'adaptability'
  | 'intimidate'
  | 'sturdy'
  | 'levitate'
  | 'thick-fat'
  | 'marvel-scale'
  | 'technician'
  | 'blaze'
  | 'torrent'
  | 'overgrow'
  | 'swarm'
  | 'static'
  | 'flame-body'
  | 'poison-point'
  | 'regenerator'
  | 'rough-skin'
  | 'stamina'
  | 'multiscale'
  | 'solid-rock'
  | 'tinted-lens'
  | 'battle-armor'
  | 'quick-feet'
  | 'magic-guard'
  | 'poison-heal'
  | 'clear-body'
  | 'defiant'
  | 'sniper'
  | 'sheer-force'
  | 'shed-skin'
  | 'early-bird'
  | 'scrappy'
  | 'unaware';

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
  /**
   * Hidden reward tier for the sign reroll, carried over from the special
   * trainer's `strong` flag (see specials.ts). When `true`, beating this
   * opponent grants the *strong* reward — a guaranteed rare sign — instead of
   * the ordinary random reroll. Only meaningful alongside `signRerollReward`,
   * and never surfaced to the player.
   */
  signRerollStrong?: boolean;
}
