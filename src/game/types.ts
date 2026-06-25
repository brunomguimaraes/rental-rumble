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

/**
 * How a move resolves its damage. The split mirrors the real games but with our
 * own naming: a `physical` move pits the attacker's Physical Attack against the
 * defender's Physical Defense, an `energy` move pits Energy Attack against Energy
 * Defense, and a `status` move deals no direct damage. A move that omits its
 * category falls back to a type-based default (see moveCategory in moves.ts).
 */
export type MoveCategory = 'physical' | 'energy' | 'status';

/**
 * The offensive "build" a Pokémon is drafted with. Most species lean clearly to
 * one side of the Physical/Energy split, but the genuinely *mixed* attackers
 * (Physical and Energy Attack within a hair of each other — see canRollBuild)
 * roll one of these at draft time, which redistributes their two attack stats so
 * the chosen side is decisively higher (budget-neutral) and biases their moveset
 * to match. It's the same kind of rolled identity as the zodiac sign, so it
 * round-trips through the leaderboard payload and the server re-sim.
 */
export type Build = 'physical' | 'energy';

/**
 * A stat a stage modifier can tilt during battle (HP is never staged). Covers
 * both offence pairs (Physical/Energy Attack) and both guard pairs
 * (Physical/Energy Defense) plus Speed, so setup moves and abilities can target
 * the right half of the split.
 */
export type StageStat = 'atk' | 'eatk' | 'def' | 'edef' | 'spd';

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
  // Recoil: a reckless, high-power hit that bites back, spending `fraction` of
  // the damage dealt as the attacker's own HP (Double-Edge, Flare Blitz, …).
  // Pure risk/reward — a real finisher that can also leave the user wide open.
  | { kind: 'recoil'; fraction: number }
  // Flinch: an on-hit rider (chance <1) that makes the foe lose its turn — but
  // ONLY when the attacker moved first, so it rewards speed and priority. Worth
  // nothing on a slower mon, momentum-defining on a fast one.
  | { kind: 'flinch'; chance: number }
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
  // Physical / Energy / Status. Optional: when omitted the engine derives it from
  // the move's type (the classic offensive split) via moveCategory(). Set only on
  // moves that buck their type's default (a physical Dragon Claw, an energy Earth
  // Power, …). A status move's category is irrelevant to damage.
  category?: MoveCategory;
  accuracy: number; // 0..1
  priority?: number; // >0 moves before slower foes regardless of Speed (default 0)
  // Power Points: how many times this move may be used in a battle. `undefined`
  // means unlimited. Used to cap sustain moves (Recover) so two bulky walls can't
  // heal each other forever — see chooseMove/takeTurn in battle.ts.
  pp?: number;
  effect?: MoveEffect;
  // A guaranteed self stat-stage shift paid whenever the move lands — a built-in
  // *cost* (or, rarely, a kicker) that's distinct from `effect` (which targets
  // the foe). Lets a move stack a foe-rider AND a self-tax in one slot: e.g. a
  // blazing charge that almost always burns but tires the user's own Speed, or a
  // dragon nuke that recoils the user's Attack. Applied unconditionally on a
  // connecting hit (never traded away by Sheer Force — it's a cost, not a perk).
  selfStage?: { stat: StageStat; delta: number };
  // Self type-lockout: after this move connects, the user can't pick another move
  // of THIS move's type for a short spell (see Battler.typeLock). The drawback on
  // an over-the-top nuke — fire it, then it has to do something else while the
  // weapon "recharges". 0/undefined means no lockout.
  lockTurns?: number;
}

export interface BaseStats {
  hp: number;
  atk: number; // Physical Attack
  eatk: number; // Energy Attack
  def: number; // Physical Defense
  edef: number; // Energy Defense
  spd: number; // Speed
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
 * - `water-absorb` — Water washes over it harmlessly and mends it: a Water move
 *                    heals ~1/4 max HP instead of landing.
 * - `volt-absorb`  — drinks in electricity; an Electric move heals it rather than
 *                    hurting it.
 * - `flash-fire`   — Fire can't touch it, and the first time one tries, the flames
 *                    stoke its own — its Fire moves burn 1.5× hotter thereafter.
 * - `sap-sipper`   — grazes on Grass attacks: they do nothing and its Attack rises
 *                    a stage instead.
 * - `motor-drive`  — Electric jolts it into gear — an Electric move does nothing
 *                    and its Speed climbs a stage.
 * - `dry-skin`     — porous hide: Water heals it, but Fire sears it for 1.25×.
 * - `heatproof`    — insulated against heat, halving the damage it takes from Fire.
 * - `immunity`     — a clean constitution that can never be poisoned.
 * - `water-veil`   — a moist sheen that means it can never be burned.
 * - `limber`       — supple-limbed; it can never be paralyzed.
 * - `own-tempo`    — marches to its own beat and so can never be confused.
 * - `contrary`     — everything's upside-down: stat boosts drop it and drops boost
 *                    it, turning the foe's debuffs into fuel.
 * - `simple`       — easily swayed — every stat change it takes is doubled.
 * - `anger-point`  — a critical hit sends it into a rage, maxing out its Attack.
 * - `justified`    — its sense of justice flares against Dark moves, raising its
 *                    Attack a stage when one strikes it.
 * - `disguise`     — a flimsy costume soaks the first hit it takes for it, breaking
 *                    instead of letting that blow land.
 * - `hyper-cutter` — proud of its blades: the foe can never lower its Attack.
 * - `big-pecks`    — puffs up its chest; the foe can never lower its Defense.
 * - `inner-focus`  — unshakeable composure — it never flinches and shrugs off
 *                    Intimidate's fear entirely.
 * - `steadfast`    — every flinch only steels its resolve, raising its Speed a
 *                    stage even as it loses the turn.
 * - `hustle`       — muscles every hit for 1.5× Attack, but the wind-up costs it
 *                    accuracy (its moves land 0.8× as reliably).
 * - `defeatist`    — loses heart once worn to half HP or less, its Attack halving
 *                    until it recovers.
 * - `weak-armor`   — a hit cracks its plating (−Defense) but lightens it into a
 *                    quicker step (+Speed) each time it's struck.
 * - `anger-shell`  — a blow that drops it below half HP cracks its shell: Defense
 *                    falls, but fury floods in and its Attack and Speed surge.
 * - `aftermath`    — if a direct hit fells it, the blast catches the attacker for
 *                    a quarter of its HP.
 * - `liquid-ooze`  — its fluids are toxic: anything that drains its HP is poisoned
 *                    by the ooze and loses that HP instead of gaining it.
 * - `overload`     — runs its systems hot: every stat boost it gains is 25%
 *                    stronger, but burn and poison gnaw at it 50% harder.
 * - `glass-cannon` — all offence, no guard — it deals 1.3× damage but takes 1.2×
 *                    in return.
 * - `last-stand`   — the more wounded it is, the harder it fights, its blows
 *                    climbing toward 1.5× as its HP empties.
 * - `legacy`       — when it faints, it passes its strength on: the next ally in
 *                    enters with a sharp +2 boost to whichever stat (Attack,
 *                    Defense or Speed) the fallen mon was best at.
 * - `rally`        — its fall rallies the team — the next ally in charges out
 *                    fired up, with +1 Attack and +1 Speed.
 * - `glory-hog`    — a spotlight-stealing star: it fights at 1.15× its stats, but
 *                    hogs everything, dragging the rest of its team to 0.9×.
 * - `dragonlord`   — a born commander of dragons: every Dragon-type teammate
 *                    (the lord itself needn't be one) fights at 1.1× its
 *                    Attack, Defense and Speed. A build-around team buff — worth
 *                    nothing without dragons to rally.
 * - `pickup`       — a scavenger's nose for treasure: while it's on the team,
 *                    item events lean toward rarer relics (rare ×1.5, legendary
 *                    ×2). A run-wide economy buff — useless in battle itself.
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
  | 'unaware'
  | 'water-absorb'
  | 'volt-absorb'
  | 'flash-fire'
  | 'sap-sipper'
  | 'motor-drive'
  | 'dry-skin'
  | 'heatproof'
  | 'immunity'
  | 'water-veil'
  | 'limber'
  | 'own-tempo'
  | 'contrary'
  | 'simple'
  | 'anger-point'
  | 'justified'
  | 'disguise'
  | 'hyper-cutter'
  | 'big-pecks'
  | 'inner-focus'
  | 'steadfast'
  | 'hustle'
  | 'defeatist'
  | 'weak-armor'
  | 'anger-shell'
  | 'aftermath'
  | 'liquid-ooze'
  | 'overload'
  | 'glass-cannon'
  | 'last-stand'
  | 'legacy'
  | 'rally'
  | 'glory-hog'
  | 'dragonlord'
  | 'pickup'
  | 'flame-emperor'
  | 'tide-matriarch'
  | 'iron-marshal'
  | 'fairy-court'
  | 'shadow-cabinet'
  | 'hive-queen'
  | 'sky-lord'
  | 'grass-warden'
  | 'volt-squad'
  | 'pack-alpha'
  | 'diviner'
  | 'fortune'
  | 'treasure-hound'
  | 'curator'
  | 'scout'
  | 'veteran'
  | 'bargain'
  | 'thorn-wreath'
  | 'parting-gift'
  | 'soul-battery'
  | 'grudge'
  | 'revenge-cry'
  | 'torch-pass'
  | 'burden-bearer'
  | 'daunt'
  | 'screech'
  | 'eerie-aura'
  | 'swagger-king'
  | 'download'
  | 'menace'
  | 'gale-force'
  | 'sand-rush'
  | 'snow-cloak'
  | 'volt-fury'
  | 'shadow-rush'
  | 'steel-heart'
  | 'fairy-wrath'
  | 'rebel-spirit'
  | 'heavy-hitter'
  | 'finisher'
  | 'opportunist'
  | 'showboat'
  | 'underdog'
  | 'rival'
  | 'predator'
  | 'opening-act'
  | 'slow-start'
  | 'reckless'
  | 'prankster'
  | 'sheer-cold'
  | 'filter'
  | 'fur-coat'
  | 'filter-down'
  | 'natural-cure'
  | 'hydration'
  | 'second-wind'
  | 'plot-armor'
  | 'shield-dust'
  | 'white-smoke'
  | 'long-reach'
  | 'effect-spore'
  | 'sticky'
  | 'cursed-body'
  | 'perish-body'
  | 'iron-barbs'
  | 'toxic-boost'
  | 'flare-boost'
  | 'unburden'
  | 'pacifist'
  | 'stall'
  | 'pressure'
  | 'super-luck'
  | 'compound-eyes'
  | 'no-guard'
  | 'oblivious'
  | 'wonder-guard'
  | 'gravity'
  | 'trickster'
  | 'moody'
  | 'color-change';

/**
 * A team-wide passive "relic" the player collects from item events across a run
 * (think Slay the Spire relics, built from held-item art). Unlike a species
 * Ability — which lives on one Creature — a relic buffs the *whole* team for the
 * rest of the run, applying to whichever member is active in battle. The full
 * registry (art, rarity, description, appearance criteria and the battle mods
 * each grants) lives in relics.ts.
 */
export type RelicId =
  // General-purpose passives.
  | 'leftovers' // active mon recovers a sliver of HP every turn
  | 'muscleband' // team Attack up
  | 'assaultvest' // team Defense up
  | 'quickclaw' // team Speed up
  | 'wiseglasses' // small all-damage boost
  | 'shellbell' // heal a fraction of the damage you deal
  | 'bigroot' // all healing (Leftovers, Shell Bell, heal moves) hits harder
  | 'lifeorb' // big all-damage boost
  // Type boosters — only offered when the team can use them (see relics.ts).
  | 'silkscarf'
  | 'charcoal'
  | 'mysticwater'
  | 'magnet'
  | 'miracleseed'
  | 'nevermeltice'
  | 'blackbelt'
  | 'poisonbarb'
  | 'softsand'
  | 'sharpbeak'
  | 'twistedspoon'
  | 'silverpowder'
  | 'hardstone'
  | 'spelltag'
  | 'dragonfang'
  | 'blackglasses'
  | 'metalcoat'
  | 'fairyfeather';

/**
 * The accumulated battle effect of a team's collected relics, resolved once per
 * fight (see relicMods in relics.ts) and baked onto every Battler. Identity
 * values (×1, 0, empty) leave the engine byte-identical to a relic-free run, so
 * an ordinary fight is unaffected.
 */
export interface RelicMods {
  atkMult: number; // Physical Attack multiplier (Muscle Band)
  eatkMult: number; // Energy Attack multiplier
  defMult: number; // Physical Defense multiplier (Assault Vest)
  edefMult: number; // Energy Defense multiplier (Assault Vest)
  spdMult: number; // Speed multiplier (Quick Claw)
  allDmgMult: number; // flat multiplier on all damage dealt (Wise Glasses, Life Orb)
  // Per-type damage multipliers, stacked onto allDmgMult for matching move types
  // (the type-booster relics). Absent type = ×1.
  dmgMult: Partial<Record<PokemonType, number>>;
  lifesteal: number; // fraction of damage dealt healed back (Shell Bell), 0 = none
  endTurnHeal: number; // fraction of max HP healed each end of turn (Leftovers), 0 = none
  healMult: number; // multiplier applied to every heal (Big Root)
}

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
  /**
   * The rolled offensive build (Physical/Energy), present only on genuinely
   * mixed-attacker species (see canRollBuild). When set, the creature's `stats`
   * already carry the redistributed attack spread and its moveset is biased to
   * the chosen side. Absent on clearly-lopsided species, which have no choice to
   * make. Round-trips like `sign`/`ability`.
   */
  build?: Build;
  /**
   * Player-applied move tweaks earned as a post-battle reward: a map from move
   * slot index to the replacement Move chosen from the species' legal pool (see
   * candidateMovesFor). Re-applied after every moveset derivation (sign/build
   * change), so a tweak sticks even when the underlying pool is recomputed. The
   * leaderboard payload stores these as {slot, name} pairs, re-validated against
   * the legal pool on the server so a forged payload can't smuggle in an illegal
   * move.
   */
  moveOverrides?: Record<number, Move>;
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

/** Passive flags baked onto a battler from roster-wide or species abilities. */
export interface AbilityPassiveFlags {
  clearBody: boolean;
  ignoreIntimidate: boolean;
  whiteSmoke: boolean;
  filterDown: boolean;
  immuneTaunt: boolean;
  longReach: boolean;
  noGuard: boolean;
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
  // Self type-lockout from a move's `lockTurns`: while set, the battler cannot
  // pick a move whose type matches `type` (its over-the-top nuke is recharging).
  // Ticks down each end of turn and clears at 0; null when nothing is locked.
  typeLock: { type: PokemonType; turns: number } | null;
  // Set when a faster foe lands a flinch this turn: the battler loses its action
  // and the flag is cleared at end of turn (so it can only ever skip one turn,
  // and only when it hadn't yet acted). Always false outside that window.
  flinched: boolean;
  // Remaining turns the battler is taunted: while >0 it cannot set up, heal or
  // throw a pure-status move — it must attack. A volatile that ticks down each
  // round (see endOfTurnStatus) and breaks the fortify-and-heal wall loop.
  taunted: number;
  // -6..+6 battle buffs/debuffs, one slot per staged stat (both attack and both
  // defense halves of the Physical/Energy split, plus Speed).
  stages: { atk: number; eatk: number; def: number; edef: number; spd: number };
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
  // Flash Fire ability state: set once it has soaked a Fire-type move, after
  // which its own Fire moves burn 1.5× hotter. Always false for non-Flash Fire
  // species (and until they're first hit by Fire).
  flashFire: boolean;
  // Disguise ability state: set once its costume has eaten a hit. While false a
  // Disguise mon shrugs off the first damaging blow entirely; afterwards it takes
  // hits normally. Always false for non-Disguise species.
  disguiseBusted: boolean;
  // A flat multiplier on this battler's Attack/Defense/Speed from a roster-wide
  // Ability (Glory Hog: the star itself runs at 1.15×, its teammates at 0.9×).
  // Fixed when the teams are built and 1 for any side without such an Ability.
  teamFactor: number;
  // Ability-driven damage multipliers baked at fight start (team commanders, etc.).
  damageDealtMult: number;
  damageTakenMult: number;
  // Per-battle ability state.
  actedTurns: number;
  openingActUsed: boolean;
  secondWindUsed: boolean;
  plotArmorUsed: boolean;
  unburdenUsed: boolean;
  hydrationCounter: number;
  colorResistType: PokemonType | null;
  sealedMoveName: string | null;
  sealedTurns: number;
  perishCountdown: number;
  torchPassTurns: number;
  statusSusceptMult: number;
  statusSuspectTurns: number;
  abilityPassive: AbilityPassiveFlags;
  // The team's collected relic effects, baked on at send-out so every active
  // member of a side carries the same run-long passives (identity mods for a
  // relic-free side, so ordinary fights are unaffected). See relics.ts.
  mods: RelicMods;
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
