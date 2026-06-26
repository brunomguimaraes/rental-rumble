import type {
  AttackAnim,
  Battler,
  Creature,
  Move,
  OpponentTier,
  PokemonType,
  RelicId,
  RelicMods,
  Sign,
  Side,
  StageStat,
  StatusKind,
  VolatileKind,
} from './types.js';
import type { Difficulty } from './run.js';
import { identityMods, relicMods, relicDamageMult } from './relics.js';
import { effectiveness } from './typechart.js';
import { RNG } from './rng.js';
import { CREATURES, withSign, withAbility, SHINY_STAT_MULT } from './pokemon.js';
import { rollAbility, teamHasAbility } from './abilities.js';
import { attackAnimFor, moveCategory, HEAL_DECAY, TAUNT_TURNS } from './moves.js';
import { SIGN_SPREAD, rollSign, bestRareSign } from './zodiac.js';
import { rollOpponentBall } from './balls.js';
import { famousTeamCreatures } from './specials.js';
import {
  applyContactAbilities,
  applyEnergyStruckAbilities,
  applyEntryAbilities,
  applyFaintAbilities,
  applyRosterAbilities,
  abilityTypeMult,
  critChance,
  critDamageMult,
  defaultAbilityPassive,
  effectiveAccuracy,
  extraAttackDamageMult,
  extraDefendDamageMult,
  flareBoostEnergyMult,
  gravityDamageMult,
  movePriority,
  slowStartStatMult,
  veteranStatMult,
  MOODY_STATS,
  isContactHit,
} from './ability-effects.js';

const LEVEL = 50;

// Striking first used to grant a small flat damage bump (the faster mon hit ~7%
// harder *on top of* moving first). That double-rewarded Speed and helped pin the
// meta to a pure race-to-hit-first, so the bonus is neutralised: moving first is
// reward enough. Left as a tunable dial — nudge it back above 1 to re-favour speed.
const MOMENTUM_MULT = 1.0;

// A single global damage scalar. Trimming every hit a touch lengthens battles
// across the board, which is what gives status, setup and sustain room to pay off
// instead of everything dying in two or three turns. Symmetric (both sides), so it
// shifts battle *length*, not who wins — the hero edge (PLAYER_STAT_MULT) and the
// type chart still decide that. One knob: nudge toward 1 for a faster, swingier
// meta, lower for a grindier one.
const GLOBAL_DAMAGE_MULT = 0.9;

// --- Volatile disruption tuning (Weight Down / Blinded / Disarmed) -----------
// Three power-0 utility statuses that don't occupy the single primary-status slot
// (so they stack with burn/poison and with each other):
//   Weight Down — crushes Speed to 45% for a few turns, enough to flip most turn
//                 orders (a slow bruiser's way to strike first).
//   Blinded     — saps the victim's OWN accuracy to 65% for a few turns.
//   Disarmed    — seals the foe's single strongest move for a few turns.
const WEIGHT_SPD_MULT = 0.45;
const WEIGHT_TURNS = 3;
const BLIND_TURNS = 3;
const DISARM_TURNS = 3;
// (Blinded's accuracy multiplier lives with effectiveAccuracy in ability-effects.)

/** Identity an active Pokémon morphs into (Ditto's Transform). */
export interface TransformInfo {
  dexId: number;
  name: string;
  types: PokemonType[];
  sign: Sign;
  sprite: string; // front battle sprite
  back: string; // back battle sprite
}

export interface BattleEvent {
  kind:
    | 'sendout'
    | 'withdraw'
    | 'move'
    | 'miss'
    | 'hit'
    | 'noeffect'
    | 'status'
    | 'stat'
    | 'heal'
    | 'statusTick'
    | 'stunned'
    | 'ability'
    | 'transform'
    | 'faint'
    | 'end';
  text: string;
  actor?: Side;
  affected?: Side;
  moveName?: string;
  moveType?: PokemonType;
  moveAnim?: AttackAnim;
  damage?: number;
  mult?: number;
  crit?: boolean;
  hp?: number;
  maxHp?: number;
  index?: number;
  name?: string;
  status?: StatusKind;
  // A volatile affliction toggling on/off (Weight Down / Blinded / Disarmed). The
  // battle UI tracks these as a stack of badges separate from the primary status.
  volatile?: VolatileKind;
  volatileOn?: boolean;
  transform?: TransformInfo;
  winner?: Side;
}

/** National Dex id of Ditto, whose Transform copies the foe it faces. */
const DITTO_DEX_ID = 132;

export interface BattleResult {
  winner: Side;
  events: BattleEvent[];
  turns: number;
}

function hpStat(base: number): number {
  return Math.floor((2 * base * LEVEL) / 100) + LEVEL + 10;
}
function otherStat(base: number): number {
  return Math.floor((2 * base * LEVEL) / 100) + 5;
}

/** The flat per-creature stat factor a shiny carries (1 for a normal mon). */
function shinyMult(creature: Creature): number {
  return creature.shiny ? SHINY_STAT_MULT : 1;
}

export function makeBattler(
  creature: Creature,
  statMult = 1,
  mods: RelicMods = identityMods(),
): Battler {
  const spread = SIGN_SPREAD[creature.sign];
  const mult = statMult * shinyMult(creature);
  const maxHp = Math.floor(hpStat(creature.stats.hp) * spread.hp * mult);
  const pp: Record<string, number> = {};
  for (const mv of creature.moves) {
    if (mv.pp !== undefined) pp[mv.name] = mv.pp;
  }
  const battler: Battler = {
    creature,
    maxHp,
    hp: maxHp,
    status: null,
    statusTurns: 0,
    toxicCounter: 0,
    confusion: 0,
    typeLock: null,
    flinched: false,
    taunted: 0,
    stages: { atk: 0, eatk: 0, def: 0, edef: 0, spd: 0 },
    pp,
    healsUsed: 0,
    loafing: false,
    flashFire: false,
    disguiseBusted: false,
    teamFactor: 1,
    damageDealtMult: 1,
    damageTakenMult: 1,
    actedTurns: 0,
    openingActUsed: false,
    secondWindUsed: false,
    plotArmorUsed: false,
    unburdenUsed: false,
    hydrationCounter: 0,
    colorResistType: null,
    sealedMoveName: null,
    sealedTurns: 0,
    weightTurns: 0,
    blindTurns: 0,
    perishCountdown: 0,
    torchPassTurns: 0,
    statusSusceptMult: 1,
    statusSuspectTurns: 0,
    shellShieldUsed: false,
    cheekPouchUsed: false,
    riposteUsed: false,
    gluttonyUsed: false,
    phoenixUsed: false,
    hexTurns: 0,
    avengeName: null,
    abilityPassive: defaultAbilityPassive(),
    mods,
  };
  const ab = creature.ability;
  if (ab === 'no-guard') battler.abilityPassive.noGuard = true;
  if (ab === 'long-reach') battler.abilityPassive.longReach = true;
  if (ab === 'oblivious') battler.abilityPassive.immuneTaunt = true;
  if (ab === 'white-smoke') battler.abilityPassive.whiteSmoke = true;
  if (ab === 'filter-down') battler.abilityPassive.filterDown = true;
  // Overmind / Magic Bounce both lock out stat drops (the Clear Body machinery).
  if (ab === 'overmind' || ab === 'magic-bounce') battler.abilityPassive.clearBody = true;
  // Vampiric bakes innate lifesteal on — clone mods so the run-wide relic object
  // (shared across the side) isn't mutated for its teammates.
  if (ab === 'vampiric') {
    battler.mods = { ...mods, lifesteal: Math.max(mods.lifesteal, 0.125) };
  }
  return battler;
}

/** True if `attacker` may still use `move` this battle (respects PP caps). */
function hasPP(attacker: Battler, move: Move): boolean {
  return move.pp === undefined || (attacker.pp[move.name] ?? 0) > 0;
}

/**
 * A move is locked out when the battler recently fired a `lockTurns` nuke of the
 * same type and it's still recharging (see Battler.typeLock). The AI treats a
 * locked move as unavailable when planning and picking, so a Blastoise that just
 * loosed Hydro Cannon falls back to coverage until its cannons repower.
 */
function isLocked(attacker: Battler, move: Move): boolean {
  return (
    attacker.typeLock !== null &&
    attacker.typeLock.turns > 0 &&
    attacker.typeLock.type === move.type
  );
}

/**
 * True if `move` is sealed on `attacker` and so cannot be used this turn — set by
 * Disarmed (the foe's strongest move, for DISARM_TURNS) or Cursed Body (the move
 * that struck it, for 1 turn). Checked everywhere the AI weighs or picks a move,
 * so a sealed move drops out of consideration entirely. (This is also what makes
 * Cursed Body bite — it sets the seal, and until now nothing read it.)
 */
function isSealed(attacker: Battler, move: Move): boolean {
  return attacker.sealedTurns > 0 && attacker.sealedMoveName === move.name;
}

// Classic Pokémon stat-stage curve: +1 = 1.5×, +2 = 2×, … and the inverse on
// the way down. Clamped to ±6.
function stageMult(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

// Overload runs its systems hot: the *positive* slice of any stage multiplier is
// amplified by 25% (its boosts bite harder). Drops and the neutral 1× are left
// alone — and the trade-off (burn/poison hurting more) is paid at end of turn.
function overloadStage(b: Battler, m: number): number {
  // Overload and Overmind both run their boosts 25% hotter (Overmind without the
  // burn/poison downside Overload pays at end of turn).
  const amped = b.creature.ability === 'overload' || b.creature.ability === 'overmind';
  return amped && m > 1 ? 1 + (m - 1) * 1.25 : m;
}

// Which battle stage a species is best at — used by Legacy to hand the right
// boost down to its successor. Considers both halves of the Physical/Energy
// split plus Speed; ties resolve in declaration order (physical first).
function dominantStage(stats: {
  atk: number;
  eatk: number;
  def: number;
  edef: number;
  spd: number;
}): StageStat {
  const order: StageStat[] = ['atk', 'eatk', 'def', 'edef', 'spd'];
  let best: StageStat = 'atk';
  let bestVal = -Infinity;
  for (const k of order) {
    if (stats[k] > bestVal) {
      bestVal = stats[k];
      best = k;
    }
  }
  return best;
}

// Which offence stage an "Attack-boosting" ability should pump. Physical and
// energy attackers both deserve the payoff, so the boost follows the channel the
// mon actually hits with (its higher base attack); ties favour the physical side.
function offenseStage(c: { stats: { atk: number; eatk: number } }): StageStat {
  return c.stats.eatk > c.stats.atk ? 'eatk' : 'atk';
}

// The attacking move's category picks which offence stat is brought to bear: a
// physical move leans on Physical Attack (atk), an energy move on Energy Attack
// (eatk). Each draws its own sign spread, stat stage and relic multiplier.
// `ignoreStage` blanks out the stat-stage multiplier — used when the *other*
// battler has Unaware and so pays no mind to this one's buffs/drops.
function effectiveAtk(
  b: Battler,
  statMult: number,
  ignoreStage = false,
  category: 'physical' | 'energy' = 'physical',
): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  const mult = statMult * shinyMult(b.creature);
  const energy = category === 'energy';
  const base = energy ? b.creature.stats.eatk : b.creature.stats.atk;
  const spreadVal = energy ? spread.eatk : spread.atk;
  const stageKey: StageStat = energy ? 'eatk' : 'atk';
  const relicMult = energy ? b.mods.eatkMult : b.mods.atkMult;
  // Guts: a status condition that would normally hamper it instead fires it up,
  // boosting its attacks by half while burned / poisoned / paralyzed / asleep.
  const guts = b.status !== null && b.creature.ability === 'guts' ? 1.5 : 1;
  // Burn saps muscle: a burned attacker's physical blows land at half strength
  // (energy attacks are unhurt). Guts shrugs the burn off entirely — its 1.5×
  // already reflects fighting through the pain — so it never eats this penalty.
  // This is what lets a well-timed burn neuter a fast physical sweeper instead of
  // merely chipping it, and what wakes up the status-payoff abilities.
  const burn = !energy && b.status === 'burn' && b.creature.ability !== 'guts' ? 0.5 : 1;
  // Frostbite is Burn's mirror on the energy channel: a frostbitten attacker's
  // energy blows land at half strength (physical attacks are unhurt). Guts shrugs
  // it off exactly as it shrugs off a burn.
  const frostbite =
    energy && b.status === 'frostbite' && b.creature.ability !== 'guts' ? 0.5 : 1;
  const stage = ignoreStage ? 1 : overloadStage(b, stageMult(b.stages[stageKey]));
  // Hustle muscles every blow for 1.5× (paid back in shakier accuracy);
  // Defeatist loses heart once at half HP or less, halving its offence until it
  // climbs back above the line.
  let abil = 1;
  if (b.creature.ability === 'hustle') abil *= 1.5;
  if (b.creature.ability === 'defeatist' && b.hp * 2 <= b.maxHp) abil *= 0.5;
  abil *= slowStartStatMult(b);
  if (energy) abil *= flareBoostEnergyMult(b);
  return Math.floor(
    otherStat(base) *
      spreadVal *
      mult *
      stage *
      guts *
      burn *
      frostbite *
      abil *
      b.teamFactor *
      relicMult,
  );
}
function effectiveDef(
  b: Battler,
  statMult: number,
  ignoreStage = false,
  category: 'physical' | 'energy' = 'physical',
): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  const mult = statMult * shinyMult(b.creature);
  const energy = category === 'energy';
  const base = energy ? b.creature.stats.edef : b.creature.stats.def;
  const spreadVal = energy ? spread.edef : spread.def;
  const stageKey: StageStat = energy ? 'edef' : 'def';
  const relicMult = energy ? b.mods.edefMult : b.mods.defMult;
  // Marvel Scale: a status condition that would normally be a liability instead
  // toughens its hide, raising its guard by half — the defensive mirror of Guts.
  const marvel =
    b.status !== null && b.creature.ability === 'marvel-scale' ? 1.5 : 1;
  const stage = ignoreStage ? 1 : overloadStage(b, stageMult(b.stages[stageKey]));
  return Math.floor(
    otherStat(base) *
      spreadVal *
      mult *
      stage *
      marvel *
      slowStartStatMult(b) *
      b.teamFactor *
      relicMult,
  );
}
function effectiveSpd(b: Battler, statMult: number): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  const mult = statMult * shinyMult(b.creature);
  let base =
    otherStat(b.creature.stats.spd) *
    spread.spd *
    mult *
    overloadStage(b, stageMult(b.stages.spd)) *
    b.teamFactor *
    b.mods.spdMult;
  // Weight Down: a heavy-foot volatile that drags the battler down regardless of
  // status (it stacks on top of paralysis). Quick Feet's status surge doesn't
  // cover it — only stage and status do — so a weighed-down speedster really crawls.
  if (b.weightTurns > 0) base *= WEIGHT_SPD_MULT;
  // Quick Feet: a status condition fires its nerves up rather than slowing it —
  // Speed jumps by half and the usual paralysis slowdown is ignored entirely.
  if (b.creature.ability === 'quick-feet') {
    return b.status !== null ? base * 1.5 : base;
  }
  return b.status === 'stun' ? base * 0.6 : base;
}

function hasStab(b: Battler, move: Move): boolean {
  // Genome (Mew) carries every blueprint, so every move it throws reads as same-type.
  return b.creature.ability === 'genome' || b.creature.types.includes(move.type);
}

// Same-type attack bonus. Normally 1.5×; Adaptability doubles it to 2×, turning
// a STAB attacker into a genuine wall-breaker.
function stabMult(b: Battler): number {
  return b.creature.ability === 'adaptability' ? 2 : 1.5;
}

// Type effectiveness, accounting for ability-granted immunities. Levitate floats
// clear of the ground, so Ground-type moves do nothing to it (0×) — everything
// else falls through to the plain type chart. Used everywhere the engine asks
// "does this move connect?", so a Levitate mon shrugs off Ground damage, Ground
// status moves and Ground Super Fang alike.
function typeMult(move: Move, defender: Battler, attacker?: Battler): number {
  const dAbility = defender.creature.ability;
  if (dAbility === 'levitate' && move.type === 'ground') return 0;
  // Absorption abilities soak a whole type: the move connects for no damage (and,
  // for damaging moves, the engine then heals or buffs the defender — see the
  // damaging branch). Surfacing the immunity here also steers the AI off a move
  // that would do nothing.
  if ((dAbility === 'water-absorb' || dAbility === 'dry-skin') && move.type === 'water') {
    return 0;
  }
  if ((dAbility === 'volt-absorb' || dAbility === 'motor-drive') && move.type === 'electric') {
    return 0;
  }
  if (dAbility === 'flash-fire' && move.type === 'fire') return 0;
  if (dAbility === 'sap-sipper' && move.type === 'grass') return 0;
  const base = effectiveness(move.type, defender.creature.types);
  // Scrappy: Normal and Fighting moves land on Ghosts in spite of the immunity.
  // Strip the Ghost typing out and re-judge against whatever's left (neutral if
  // the foe is pure Ghost).
  if (
    base === 0 &&
    attacker?.creature.ability === 'scrappy' &&
    (move.type === 'normal' || move.type === 'fighting') &&
    defender.creature.types.includes('ghost')
  ) {
    const rest = defender.creature.types.filter((t) => t !== 'ghost');
    return rest.length > 0 ? effectiveness(move.type, rest) : 1;
  }
  // Deluge / Magma: a legendary's Water / Ground moves bull straight through a
  // resisted matchup, landing at full effectiveness (the +10% rides on top in
  // extraAttackDamageMult — the same shape as Sheer Cold for Ice).
  if (
    base > 0 &&
    base < 1 &&
    attacker &&
    ((attacker.creature.ability === 'deluge' && move.type === 'water') ||
      (attacker.creature.ability === 'magma' && move.type === 'ground'))
  ) {
    return abilityTypeMult(move, defender, 1);
  }
  return abilityTypeMult(move, defender, base);
}

// Flat damage multiplier from the ATTACKER's ability for a given move — see
// extraAttackDamageMult in ability-effects.ts for the full set.
function attackAbilityMult(attacker: Battler, defender: Battler, move: Move, team: Battler[]): number {
  return extraAttackDamageMult(attacker, defender, move, team);
}

// Flat damage multiplier from the DEFENDER's ability — see extraDefendDamageMult.
function defendAbilityMult(defender: Battler, move: Move, typeEff: number): number {
  return extraDefendDamageMult(defender, move, typeEff);
}

interface SideState {
  team: Battler[];
  active: number;
  statMult: number;
}

function aliveIndex(s: SideState, from = 0): number {
  for (let i = from; i < s.team.length; i++) {
    if (s.team[i].hp > 0) return i;
  }
  return -1;
}

/** True if the battler is currently riding any positive stat stage (drives the
 *  Muscle Band relic, which only rewards a mon that has actually set up). */
function hasPositiveStage(b: Battler): boolean {
  return (
    b.stages.atk > 0 ||
    b.stages.eatk > 0 ||
    b.stages.def > 0 ||
    b.stages.edef > 0 ||
    b.stages.spd > 0
  );
}

/** The attacker's setup-reward relic factor (Muscle Band): >1 only while it holds
 *  a stat boost, otherwise 1. */
function boostedRelicMult(attacker: Battler): number {
  return attacker.mods.boostedDmgMult !== 1 && hasPositiveStage(attacker)
    ? attacker.mods.boostedDmgMult
    : 1;
}

// Average-case damage (no crit, mid variance) used by the AI to compare moves
// and spot guaranteed KOs. Mirrors damageRoll but draws no randomness, so it can
// also drive turn-order prediction without disturbing the RNG stream.
function estimateDamage(
  attacker: Battler,
  defender: Battler,
  move: Move,
  atkStatMult: number,
  defStatMult: number,
): number {
  if (move.power <= 0) return 0;
  const mult = typeMult(move, defender);
  if (mult === 0) return 0;
  const cat = moveCategory(move) === 'energy' ? 'energy' : 'physical';
  const atk = effectiveAtk(attacker, atkStatMult, false, cat);
  const def = effectiveDef(defender, defStatMult, false, cat);
  const base = (2 * LEVEL) / 5 + 2;
  const raw = (base * move.power * (atk / def)) / 50 + 2;
  const stab = hasStab(attacker, move) ? stabMult(attacker) : 1;
  const abil =
    attackAbilityMult(attacker, defender, move, [attacker]) *
    defendAbilityMult(defender, move, mult);
  const relic =
    relicDamageMult(attacker.mods, move.type) *
    boostedRelicMult(attacker) *
    defender.mods.damageTakenMult;
  return raw * stab * mult * abil * relic * GLOBAL_DAMAGE_MULT * 0.925 * move.accuracy;
}

/** The damaging move the AI intends to throw, KO-aware (prefers a priority KO). */
function planAttack(
  attacker: Battler,
  defender: Battler,
  atkStatMult: number,
  defStatMult: number,
): { move: Move; dmg: number } {
  let best: Move | null = null;
  let bestDmg = -1;
  for (const mv of attacker.creature.moves) {
    if (mv.power <= 0 || isLocked(attacker, mv) || isSealed(attacker, mv)) continue;
    const d = estimateDamage(attacker, defender, mv, atkStatMult, defStatMult);
    if (d > bestDmg) {
      bestDmg = d;
      best = mv;
    }
  }
  // If a priority move already secures the KO, lead with it to strike first.
  if (best) {
    for (const mv of attacker.creature.moves) {
      if ((mv.priority ?? 0) > 0 && !isLocked(attacker, mv) && !isSealed(attacker, mv)) {
        const d = estimateDamage(attacker, defender, mv, atkStatMult, defStatMult);
        if (d > 0 && d >= defender.hp) return { move: mv, dmg: d };
      }
    }
  }
  return { move: best ?? attacker.creature.moves[0], dmg: Math.max(0, bestDmg) };
}

// How sharply the AI favors its hardest-hitting move. The chance of picking a
// given damaging move is proportional to (estimated damage ^ focus):
//   - Infinity -> perfect play (always the single best move)
//   - higher   -> more optimal play (almost always the best move)
//   - lower    -> more variety (it'll more often throw a weaker option)
//   - 0        -> uniform random among all damaging moves
// Guaranteed KOs are handled separately in chooseMove and ignore this entirely.
const AI_FOCUS_DEFAULT = 4; // normal/hard foes, and the player's own team
const AI_FOCUS_SLOPPY = 1; // easy foes: barely weights toward stronger moves
const AI_FOCUS_PERFECT = Infinity; // master foes: never misjudge a move

/**
 * The move-pick focus the *foe* plays with for a given run difficulty. The
 * player's team always uses AI_FOCUS_DEFAULT; only the opponent gets sharper on
 * Master and sloppier on Easy. Normal/Hard (and an unspecified difficulty) are
 * left at the default, so nothing else changes.
 */
function foeMoveFocus(difficulty: Difficulty | undefined): number {
  if (difficulty === 'master') return AI_FOCUS_PERFECT;
  if (difficulty === 'easy') return AI_FOCUS_SLOPPY;
  return AI_FOCUS_DEFAULT;
}

/**
 * A small, bounded credit (≤0.12) for a matchup where `me` can do more than trade
 * blows: cripple `foe` with a well-aimed status, or snowball with its own setup.
 * Layered on top of the raw damage-race read in matchupScore so the AI's switch
 * and replacement choices stop treating status/setup as worthless — it will pivot
 * a burner in on a physical attacker, a paralyser in on a faster threat, and hold
 * a healthy setup sweeper rather than flee an even trade. Deliberately tiny so it
 * only breaks ties; who actually wins the damage exchange still dominates. Pure
 * (no RNG), so it's safe to use inside the turn-order prediction like the rest of
 * matchupScore.
 */
function statusMatchupBonus(
  me: Battler,
  foe: Battler,
  meMult: number,
  foeMult: number,
): number {
  let bonus = 0;
  if (foe.status === null && foe.confusion === 0) {
    const foePhysical = foe.creature.stats.atk >= foe.creature.stats.eatk;
    const foeFaster = effectiveSpd(foe, foeMult) > effectiveSpd(me, meMult);
    for (const mv of me.creature.moves) {
      const eff = mv.effect;
      // Only pure-status buttons we can actually land (a 0× type matchup means it
      // bounces off — e.g. Thunder Wave into a Ground type).
      if (!eff || mv.power !== 0 || typeMult(mv, foe) === 0) continue;
      if (eff.kind === 'burn' && foePhysical) bonus = Math.max(bonus, 0.12);
      else if (eff.kind === 'frostbite' && !foePhysical) bonus = Math.max(bonus, 0.12);
      else if (eff.kind === 'stun' && foeFaster) bonus = Math.max(bonus, 0.12);
      else if (eff.kind === 'sleep') bonus = Math.max(bonus, 0.1);
      else if (eff.kind === 'poison' || eff.kind === 'confuse')
        bonus = Math.max(bonus, 0.06);
    }
  }
  // A healthy mon holding a live setup button out-values its bare trade a touch.
  if (me.hp / me.maxHp > 0.6 && me.creature.moves.some(isSelfSetup)) {
    bonus = Math.max(bonus, 0.06);
  }
  return bonus;
}

/**
 * How good a matchup `me` has against `foe`, as a single per-turn trade number:
 * the share of the foe's health our best honest hit removes, minus the share of
 * our own health the foe's best hit removes. Both halves are KO-aware estimates
 * (see estimateDamage/planAttack) normalised by max HP, so the metric is
 * comparable across mons of different bulk — a positive score means we out-trade
 * the foe, negative means we're losing the exchange. Drives both the smart
 * faint-replacement pick and the voluntary-switch decision. The core of it is a
 * pure damage-race read (the honest worst case), nudged by a small status/setup
 * credit (see statusMatchupBonus) so a crippling burn or a setup sweep isn't
 * invisible to the AI's switching.
 */
function matchupScore(
  me: Battler,
  foe: Battler,
  meMult: number,
  foeMult: number,
): number {
  const myDmg = planAttack(me, foe, meMult, foeMult).dmg;
  const foeDmg = planAttack(foe, me, foeMult, meMult).dmg;
  return (
    myDmg / foe.maxHp -
    foeDmg / me.maxHp +
    statusMatchupBonus(me, foe, meMult, foeMult)
  );
}

/**
 * The swap behaviour a side plays with, derived from its move-pick `focus` so
 * switching scales on the same difficulty dial as everything else (the player's
 * team and normal/hard foes share AI_FOCUS_DEFAULT; Easy is sloppy, Master is
 * perfect). Three tiers:
 *   - Easy: dull — sends out the next mon in line on a faint and never bails out
 *     of a bad matchup voluntarily.
 *   - Normal / Hard / the player's own team: competent — replaces a fainted mon
 *     with its best answer to the foe, and will spend a turn pivoting out of a
 *     clearly losing matchup, but only twice a battle and only into a mon that
 *     actually wins the trade.
 *   - Master: sharp — a deeper switch budget and a lower bar to pivot.
 */
interface SwitchTuning {
  /** Pick the best matchup on a faint (vs. plain roster order). */
  smartReplace: boolean;
  /** Voluntary mid-battle switches allowed this whole battle. */
  maxSwitches: number;
  /** Only pivot when our matchupScore is below this (we're clearly losing). */
  triggerThreshold: number;
  /** And only when a bench mon beats our score by at least this margin. */
  improveThreshold: number;
}

function switchTuning(focus: number): SwitchTuning {
  // Master: perfect movers also pivot decisively.
  if (!Number.isFinite(focus)) {
    return {
      smartReplace: true,
      maxSwitches: 3,
      triggerThreshold: -0.1,
      improveThreshold: 0.3,
    };
  }
  // Easy: dull — next-in-line replacement, no voluntary switching.
  if (focus <= AI_FOCUS_SLOPPY) {
    return {
      smartReplace: false,
      maxSwitches: 0,
      triggerThreshold: -Infinity,
      improveThreshold: Infinity,
    };
  }
  // Normal / Hard, and the player's own team: competent but sparing.
  return {
    smartReplace: true,
    maxSwitches: 2,
    triggerThreshold: -0.2,
    improveThreshold: 0.4,
  };
}

/**
 * How much the AI should *discount* a move because of the self-cost it carries
 * (a negative `selfStage`). Returns a 0–1 factor applied to the move's estimated
 * damage when ranking options, so the AI stops short of spamming a move that
 * cannibalises its own stats turn after turn.
 *
 * The big one is an Attack-tax (e.g. Draco Meteor): since the engine resolves
 * every hit off Attack, the factor is the share of offence that *survives* the
 * drop (via the stage curve), so once Attack is already crashed the move looks as
 * weak to the AI as it has actually become. Speed/Defense self-costs don't sap
 * our damage, so they get only a gentle nudge. No self-cost → 1 (no change).
 */
function selfCostFactor(attacker: Battler, move: Move): number {
  const ss = move.selfStage;
  if (!ss || ss.delta >= 0) return 1;
  if (ss.stat === 'atk') {
    // Worth swinging on a fresh Attack (a light haircut so it still opens with
    // the nuke), but every stage already spent scales the move down in lockstep
    // with the offence it's bleeding — so the AI fires it, then leans on its
    // other moves while Attack sits in the gutter instead of re-crashing it.
    return Math.min(1, 0.85 * stageMult(attacker.stages.atk));
  }
  // A Speed or Defense tax is real but doesn't blunt this hit — weigh it lightly
  // so the move stays worth throwing, just not back-to-back forever.
  const per = ss.stat === 'spd' ? 0.93 : 0.97;
  return per ** Math.abs(ss.delta);
}

/**
 * Pick a damaging move, optionally with a bit of randomness instead of always
 * locking onto the single best one. Each damaging move is weighted by its
 * estimated damage — discounted by any self-cost it carries (see selfCostFactor)
 * — raised to `focus`, so strong moves stay heavily favored while weaker ones
 * still get thrown now and then. A non-finite `focus` means perfect play: it
 * takes the single highest-value (cost-aware) move outright. Status/setup/heal
 * decisions and guaranteed-KO handling live in chooseMove; this only varies the
 * honest hit.
 */
function pickDamagingMove(
  attacker: Battler,
  defender: Battler,
  atkStatMult: number,
  defStatMult: number,
  focus: number,
  fallback: Move,
  rng: RNG,
): Move {
  const options: { move: Move; weight: number }[] = [];
  let total = 0;
  let bestMove: Move | null = null;
  let bestValue = -1;
  for (const mv of attacker.creature.moves) {
    if (mv.power <= 0 || isLocked(attacker, mv) || isSealed(attacker, mv)) continue;
    const d = estimateDamage(attacker, defender, mv, atkStatMult, defStatMult);
    if (d <= 0) continue;
    // Don't fling a recoil nuke that would knock the user out unless it also
    // secures the KO — a reckless trade is only worth it when it finishes the
    // foe. (A guaranteed KO is already handled upstream in chooseMove.)
    if (mv.effect?.kind === 'recoil') {
      const recoil = Math.floor(d * mv.effect.fraction);
      if (recoil >= attacker.hp && d < defender.hp) continue;
    }
    // Rank by self-cost-aware value, not raw damage, so a stat-cannibalising nuke
    // slides down the list as its drawback bites.
    const value = d * selfCostFactor(attacker, mv);
    if (value > bestValue) {
      bestValue = value;
      bestMove = mv;
    }
    const weight = focus <= 0 ? 1 : value ** focus;
    options.push({ move: mv, weight });
    total += weight;
  }
  if (options.length === 0) return fallback;
  // Perfect play: take the single highest-value (cost-aware) move outright.
  if (!Number.isFinite(focus)) return bestMove ?? fallback;
  if (options.length === 1) return options[0].move;

  let roll = rng.range(0, total);
  for (const opt of options) {
    roll -= opt.weight;
    if (roll <= 0) return opt.move;
  }
  return options[options.length - 1].move;
}

const STATUS_RIDER_KINDS = ['burn', 'stun', 'poison', 'sleep', 'frostbite', 'confuse'] as const;

/** The stat stages a pure buff/debuff move touches (single- or multi-stat). */
function stagedStats(move: Move): StageStat[] {
  if (move.effect?.kind === 'stage') return [move.effect.stat];
  if (move.effect?.kind === 'multistage')
    return move.effect.stages.map((s) => s.stat);
  return [];
}

/** A power-0 move that buffs the user's own stage(s) — a setup button. */
function isSelfSetup(move: Move): boolean {
  return (
    move.power === 0 &&
    (move.effect?.kind === 'stage' || move.effect?.kind === 'multistage') &&
    move.effect.target === 'self'
  );
}

/** A power-0 move that drops the foe's stage(s) — a pure debuff. */
function isFoeDebuff(move: Move): boolean {
  return (
    move.power === 0 &&
    (move.effect?.kind === 'stage' || move.effect?.kind === 'multistage') &&
    move.effect.target === 'foe'
  );
}

function chooseMove(
  attacker: Battler,
  defender: Battler,
  atkStatMult: number,
  defStatMult: number,
  focus: number,
  rng: RNG,
): Move {
  const moves = attacker.creature.moves;
  const plan = planAttack(attacker, defender, atkStatMult, defStatMult);

  // Always take a guaranteed KO over anything else.
  if (plan.dmg > 0 && plan.dmg >= defender.hp) return plan.move;

  // While taunted a battler is locked into attacking — no setup, no heals, no
  // pure-status moves. It may still throw Super Fang (it deals damage), so the
  // chip logic below stays live; everything else here is skipped.
  const taunted = attacker.taunted > 0;

  // Taunt a staller: if the foe packs a heal or self-setup button and isn't
  // already shut down, lock it out so it has to trade damage instead of
  // fortifying/out-healing. Worth a coin flip while it can still matter.
  if (!taunted) {
    const taunt = moves.find((mv) => mv.effect?.kind === 'taunt');
    const foeStalls = defender.creature.moves.some(
      (mv) => mv.effect?.kind === 'heal' || isSelfSetup(mv),
    );
    if (
      taunt &&
      foeStalls &&
      defender.taunted === 0 &&
      defender.status !== 'sleep' &&
      rng.chance(0.5)
    ) {
      return taunt;
    }
  }

  // Heal when badly hurt — but only while the move still has PP left and we're
  // not taunted. Once a wall burns through its limited heals it has to start
  // trading damage, which breaks the Chansey-style "we both heal forever"
  // stalemate.
  if (!taunted) {
    const healMove = moves.find(
      (mv) => mv.effect?.kind === 'heal' && hasPP(attacker, mv),
    );
    if (healMove && attacker.hp / attacker.maxHp < 0.35 && rng.chance(0.6)) {
      return healMove;
    }
  }

  // Super Fang a healthy wall: when our best honest hit barely dents the foe
  // and it's still above half, halve its HP (ignores Defense) to crack it open
  // instead of chipping. Skipped if the foe is Normal-immune (filtered out).
  const fang = moves.find(
    (mv) => mv.effect?.kind === 'fracdamage' && typeMult(mv, defender) !== 0,
  );
  if (
    fang &&
    defender.hp > defender.maxHp * 0.5 &&
    plan.dmg < defender.hp * 0.33 &&
    rng.chance(0.7)
  ) {
    return fang;
  }

  // Set up when healthy and not already stacked. Covers single-stat buttons
  // (Swords Dance, Agility, Iron Defense) and dual-stat ones (Dragon Dance, Bulk
  // Up): worth it only while at least one of the move's stats has headroom left.
  if (!taunted) {
    const setup = moves.find(isSelfSetup);
    if (
      setup &&
      attacker.hp / attacker.maxHp > 0.5 &&
      stagedStats(setup).some((st) => attacker.stages[st] < 4)
    ) {
      // Only spend the tempo when we can weather the free turn: if the foe's best
      // hit barely dents us, setup snowballs and is taken eagerly; if it'd cave us
      // in, fall through and just attack. Replaces a flat 40% with a survival-aware
      // gate, so the AI sets up on the things it actually walls instead of in front
      // of a mon that will punish the lost turn.
      const foeHit = planAttack(defender, attacker, defStatMult, atkStatMult).dmg;
      const safe = foeHit < attacker.hp * 0.35;
      if (rng.chance(safe ? 0.7 : 0.2)) return setup;
    }
  }

  // Lower the foe's stats when it's still healthy: a defensive Charm, a wall-
  // cracking Screech, or a speed-tanking Scary Face. Pointless once the foe is
  // nearly dead (just hit it) or the targeted stat is already bottomed out.
  if (!taunted) {
    const debuff = moves.find(isFoeDebuff);
    if (
      debuff &&
      defender.hp / defender.maxHp > 0.5 &&
      rng.chance(0.35) &&
      stagedStats(debuff).some((st) => defender.stages[st] > -4)
    ) {
      return debuff;
    }
  }

  // Spread a status onto an as-yet-unafflicted foe. How readily it goes out now
  // depends on how much *this* status hurts *this* foe: a burn neuters a physical
  // attacker, paralysis kneecaps a faster threat, sleep is always a tempo swing,
  // and toxic wants a healthy foe with turns left to rot. A well-aimed status is
  // thrown far more often than the old flat 35% — and any status still feeds the
  // status-payoff abilities (Opportunist, Hex, Guts, Quick Feet, …).
  if (!taunted) {
    const statusMove = moves.find(
      (mv) =>
        mv.power === 0 &&
        mv.effect !== undefined &&
        (STATUS_RIDER_KINDS as readonly string[]).includes(mv.effect.kind),
    );
    if (
      statusMove &&
      statusMove.effect &&
      defender.status === null &&
      defender.confusion === 0 &&
      typeMult(statusMove, defender) !== 0
    ) {
      const kind = statusMove.effect.kind;
      const foePhysical =
        defender.creature.stats.atk >= defender.creature.stats.eatk;
      const foeFaster =
        effectiveSpd(defender, defStatMult) > effectiveSpd(attacker, atkStatMult);
      let chance = 0.4;
      if (kind === 'burn') chance = foePhysical ? 0.75 : 0.45;
      else if (kind === 'frostbite') chance = foePhysical ? 0.45 : 0.75;
      else if (kind === 'stun') chance = foeFaster ? 0.75 : 0.45;
      else if (kind === 'sleep') chance = 0.7;
      else if (kind === 'poison')
        chance = defender.hp / defender.maxHp > 0.6 ? 0.6 : 0.3;
      if (rng.chance(chance)) return statusMove;
    }
  }

  // Volatile disruption (Weigh Down / Sand Attack / Disable), each gated on being
  // worth a turn against THIS foe so the AI doesn't fritter tempo on a no-op:
  //   - Weigh Down: only to steal the speed tier — throw it when the foe is
  //     currently faster and isn't already weighed down.
  //   - Blind: sap a still-healthy attacker's aim.
  //   - Disarm: seal a hard hitter's best move, but only when that move genuinely
  //     threatens us and the foe is healthy enough to keep swinging it.
  if (!taunted) {
    for (const mv of moves) {
      const k = mv.effect?.kind;
      if (k !== 'weight' && k !== 'blind' && k !== 'disarm') continue;
      if (typeMult(mv, defender) === 0) continue;
      if (k === 'weight') {
        const foeFaster =
          effectiveSpd(defender, defStatMult) > effectiveSpd(attacker, atkStatMult);
        if (defender.weightTurns === 0 && foeFaster && rng.chance(0.7)) return mv;
      } else if (k === 'blind') {
        if (
          defender.blindTurns === 0 &&
          defender.hp / defender.maxHp > 0.4 &&
          rng.chance(0.45)
        ) {
          return mv;
        }
      } else {
        const foeBest = planAttack(defender, attacker, defStatMult, atkStatMult).dmg;
        if (
          defender.sealedTurns === 0 &&
          foeBest > attacker.hp * 0.4 &&
          defender.hp / defender.maxHp > 0.4 &&
          rng.chance(0.6)
        ) {
          return mv;
        }
      }
    }
  }

  // No special play this turn — throw a damaging move. Variety depends on
  // `focus`: perfect foes always take plan.move, sloppier ones sometimes don't.
  return pickDamagingMove(
    attacker,
    defender,
    atkStatMult,
    defStatMult,
    focus,
    plan.move,
    rng,
  );
}

function damageRoll(
  attacker: Battler,
  defender: Battler,
  move: Move,
  atkStatMult: number,
  defStatMult: number,
  rng: RNG,
  atkTeam: Battler[],
  movedFirst = false,
): { damage: number; mult: number; crit: boolean } {
  const mult = typeMult(move, defender, attacker);
  if (mult === 0) return { damage: 0, mult: 0, crit: false };

  // Physical moves trade Physical Attack vs Physical Defense; energy moves trade
  // Energy Attack vs Energy Defense.
  const cat = moveCategory(move) === 'energy' ? 'energy' : 'physical';
  // Unaware: each side that has it tunes out the *other's* stat stages.
  const atk = effectiveAtk(attacker, atkStatMult, defender.creature.ability === 'unaware', cat);
  const def = effectiveDef(defender, defStatMult, attacker.creature.ability === 'unaware', cat);
  const base = (2 * LEVEL) / 5 + 2;
  const raw = (base * move.power * (atk / def)) / 50 + 2;
  const stab = hasStab(attacker, move) ? stabMult(attacker) : 1;
  let abil =
    attackAbilityMult(attacker, defender, move, atkTeam) * defendAbilityMult(defender, move, mult);
  // Tinted Lens: lenses sharpen a resisted hit, doubling it so a "not very
  // effective" attack lands at full strength instead.
  if (attacker.creature.ability === 'tinted-lens' && mult > 0 && mult < 1) {
    abil *= 2;
  }
  // Sheer Force: throws its full weight behind the blow for 30% more — its
  // payoff for shedding the move's secondary effect (handled at on-hit time).
  if (attacker.creature.ability === 'sheer-force') {
    abil *= 1.3;
  }
  // Analytic: striking after the foe has committed lets it pick the blow apart.
  if (attacker.creature.ability === 'analytic' && !movedFirst && move.power > 0) {
    abil *= 1.3;
  }
  // Solid Rock: a rugged frame cushions a super-effective blow to 0.75×.
  // (handled in extraDefendDamageMult; multiscale below is separate.)
  // Multiscale: untouched and at full HP, a protective veil halves the first hit.
  if (defender.creature.ability === 'multiscale' && defender.hp >= defender.maxHp) {
    abil *= 0.5;
  }
  abil *= gravityDamageMult([attacker, defender]);
  // Draw the crit regardless so the RNG stream stays identical; Battle Armor then
  // simply seals it shut.
  let crit = rng.chance(critChance(attacker, defender));
  // First Strike: its opening attack of the battle always finds the mark.
  if (attacker.creature.ability === 'first-strike' && attacker.actedTurns === 0 && move.power > 0) {
    crit = true;
  }
  if (defender.creature.ability === 'battle-armor') crit = false;
  const critMult = crit ? critDamageMult(attacker) : 1;
  // Team relics: the attacker's flat/type damage (Wise Glasses, Life Orb, type
  // boosters) and setup-reward (Muscle Band) lift the hit; the defender's bulk
  // relic (Big Root) softens it.
  const relic =
    relicDamageMult(attacker.mods, move.type) *
    boostedRelicMult(attacker) *
    defender.mods.damageTakenMult;
  const variance = rng.range(0.85, 1);
  const momentum = movedFirst && move.power > 0 ? MOMENTUM_MULT : 1;
  const damage = Math.max(
    1,
    Math.floor(
      raw * stab * mult * abil * critMult * relic * momentum * variance * GLOBAL_DAMAGE_MULT,
    ),
  );
  return { damage, mult, crit };
}

const STATUS_LABEL: Record<Exclude<StatusKind, null>, string> = {
  burn: 'was burned',
  stun: 'is paralyzed',
  poison: 'was badly poisoned',
  sleep: 'fell asleep',
  frostbite: 'was frostbitten',
};

const STAGE_LABEL: Record<StageStat, string> = {
  atk: 'Physical Attack',
  eatk: 'Energy Attack',
  def: 'Physical Defense',
  edef: 'Energy Defense',
  spd: 'Speed',
};

export function simulateBattle(
  playerTeam: Creature[],
  foeTeam: Creature[],
  seed: string,
  opts: {
    playerStatMult?: number;
    foeStatMult?: number;
    difficulty?: Difficulty;
    // Team-wide relics the player has collected this run (see relics.ts). Baked
    // onto every player Battler so the run-long passives apply to whoever's
    // active. `foeRelics` mirrors it for PvP fights (the Throne Challenge), where
    // both sides bring their own collected relics. Absent = a relic-free side.
    playerRelics?: readonly RelicId[];
    foeRelics?: readonly RelicId[];
    /** Opponent tier for Veteran ability (+5% player stats vs gym+). */
    foeTier?: OpponentTier;
  } = {},
): BattleResult {
  const rng = new RNG(seed);
  const playerStatMult = opts.playerStatMult ?? 1;
  const foeStatMult = opts.foeStatMult ?? 1;
  const playerMods = relicMods(opts.playerRelics);
  const foeMods = relicMods(opts.foeRelics);
  // The player's team always plays at the default focus; only the foe's move
  // picking sharpens (Master) or loosens (Easy) with the run difficulty.
  const moveFocus: Record<Side, number> = {
    player: AI_FOCUS_DEFAULT,
    foe: foeMoveFocus(opts.difficulty),
  };
  // Each side's remaining voluntary mid-battle switches, scaled by its focus
  // (see switchTuning). Spent down in takeTurn; the cap is what keeps a pivot war
  // from stalling out the battle.
  const switchBudget: Record<Side, number> = {
    player: switchTuning(moveFocus.player).maxSwitches,
    foe: switchTuning(moveFocus.foe).maxSwitches,
  };

  const sides: Record<Side, SideState> = {
    player: {
      team: playerTeam.map((c) => makeBattler(c, playerStatMult, playerMods)),
      active: 0,
      statMult: playerStatMult,
    },
    foe: {
      team: foeTeam.map((c) => makeBattler(c, foeStatMult, foeMods)),
      active: 0,
      statMult: foeStatMult,
    },
  };

  // Roster-wide Abilities resolved up front (see ability-effects.ts).
  for (const side of ['player', 'foe'] as Side[]) {
    applyRosterAbilities(sides[side].team);
  }

  const veteranMult =
    opts.foeTier ? veteranStatMult(playerTeam, opts.foeTier) : 1;
  if (veteranMult !== 1) {
    sides.player.statMult *= veteranMult;
  }

  const events: BattleEvent[] = [];
  const push = (e: BattleEvent) => events.push(e);
  const otherSide = (s: Side): Side => (s === 'player' ? 'foe' : 'player');

  // --- Status / stage / switching helpers (close over sides + rng) ----------

  const applyStatus = (
    targetSide: Side,
    kind: Exclude<StatusKind, null>,
  ): boolean => {
    const t = sides[targetSide].team[sides[targetSide].active];
    if (t.status !== null) return false;
    // Magic Bounce: a shimmering barrier often deflects an affliction outright.
    if (t.creature.ability === 'magic-bounce' && rng.chance(0.5)) return false;
    // Status-ward abilities: each shrugs off one affliction outright.
    const ability = t.creature.ability;
    // Corrosion: the source's venom is so virulent it poisons even the immune.
    const source = sides[otherSide(targetSide)].team[sides[otherSide(targetSide)].active];
    const corrosivePoison = kind === 'poison' && source?.creature.ability === 'corrosion';
    if (kind === 'sleep' && ability === 'vital-spirit') return false; // too wired to doze
    if (kind === 'poison' && ability === 'immunity' && !corrosivePoison) return false; // clean constitution
    if (kind === 'burn' && ability === 'water-veil') return false; // moist sheen
    if (kind === 'stun' && ability === 'limber') return false; // too supple to seize up
    t.status = kind;
    if (kind === 'stun') t.statusTurns = 3;
    else if (kind === 'burn') t.statusTurns = 4;
    else if (kind === 'frostbite') t.statusTurns = 4;
    else if (kind === 'sleep') t.statusTurns = rng.int(1, 3);
    else if (kind === 'poison') {
      t.statusTurns = 0;
      t.toxicCounter = 1;
    }
    push({
      kind: 'status',
      actor: otherSide(targetSide),
      affected: targetSide,
      status: kind,
      text: `${t.creature.name} ${STATUS_LABEL[kind]}!`,
    });
    if (t.creature.ability === 'unburden' && !t.unburdenUsed) {
      t.unburdenUsed = true;
      applyStage(targetSide, 'spd', 2);
    }
    return true;
  };

  const applyConfuse = (targetSide: Side): boolean => {
    const t = sides[targetSide].team[sides[targetSide].active];
    if (t.confusion > 0) return false;
    // Own Tempo: it keeps its own rhythm and simply cannot be confused.
    if (t.creature.ability === 'own-tempo') return false;
    t.confusion = rng.int(2, 4);
    push({
      kind: 'status',
      actor: otherSide(targetSide),
      affected: targetSide,
      text: `${t.creature.name} became confused!`,
    });
    return true;
  };

  const applyStage = (
    ownerSide: Side,
    stat: StageStat,
    rawDelta: number,
    // Where the change came from: a self-inflicted buff/drop ('self') or one
    // forced on it by the opponent ('opponent'). Only opponent-forced drops feed
    // Clear Body (which blocks them) and Defiant (which retaliates).
    source: 'self' | 'opponent' = 'self',
  ) => {
    const b = sides[ownerSide].team[sides[ownerSide].active];
    const ability = b.creature.ability;
    // Contrary turns the world upside-down (a drop becomes a boost and vice
    // versa); Simple makes it impressionable (every change is doubled). Resolve
    // the *effective* delta first so Clear Body / Defiant judge what truly lands —
    // a Contrary mon's "drop" is really a boost, so neither of them fires.
    let delta = rawDelta;
    if (source === 'self' && delta > 0) {
      const oppSide = otherSide(ownerSide);
      const oppActive = sides[oppSide].team[sides[oppSide].active];
      if (oppActive.creature.ability === 'white-smoke' || oppActive.abilityPassive.whiteSmoke) {
        push({
          kind: 'ability',
          actor: oppSide,
          affected: ownerSide,
          name: 'White Smoke',
          text: `${oppActive.creature.name}'s White Smoke blocks the stat rise!`,
        });
        return;
      }
      if (oppActive.creature.ability === 'filter-down' || oppActive.abilityPassive.filterDown) {
        delta = Math.max(0, delta - 1);
        if (delta === 0) return;
      }
    }
    if (ability === 'contrary') delta = -delta;
    else if (ability === 'simple') delta *= 2;
    const enemyDrop = source === 'opponent' && delta < 0;
    // Clear Body: keeps its cool — an opponent simply cannot lower its stats.
    if (enemyDrop && (ability === 'clear-body' || b.abilityPassive.clearBody)) {
      push({
        kind: 'ability',
        actor: ownerSide,
        affected: ownerSide,
        name: 'Clear Body',
        text: `${b.creature.name}'s Clear Body prevents stat loss!`,
      });
      return;
    }
    // Hyper Cutter / Big Pecks: a single-stat version of Clear Body — the foe
    // can't blunt its prized Attack (the blades) or its puffed-out Defense.
    if (enemyDrop && stat === 'atk' && ability === 'hyper-cutter') {
      push({
        kind: 'ability',
        actor: ownerSide,
        affected: ownerSide,
        name: 'Hyper Cutter',
        text: `${b.creature.name}'s Hyper Cutter kept its Attack from dropping!`,
      });
      return;
    }
    if (enemyDrop && stat === 'def' && ability === 'big-pecks') {
      push({
        kind: 'ability',
        actor: ownerSide,
        affected: ownerSide,
        name: 'Big Pecks',
        text: `${b.creature.name}'s Big Pecks kept its Defense from dropping!`,
      });
      return;
    }
    const before = b.stages[stat];
    const after = Math.max(-6, Math.min(6, before + delta));
    if (after === before) {
      push({
        kind: 'stat',
        actor: ownerSide,
        affected: ownerSide,
        text: `${b.creature.name}'s ${STAGE_LABEL[stat]} won't go ${
          delta > 0 ? 'higher' : 'lower'
        }!`,
      });
    } else {
      b.stages[stat] = after;
      push({
        kind: 'stat',
        actor: ownerSide,
        affected: ownerSide,
        text: `${b.creature.name}'s ${STAGE_LABEL[stat]} ${
          delta > 0 ? 'rose' : 'fell'
        }${Math.abs(delta) >= 2 ? ' sharply' : ''}!`,
      });
    }
    // Defiant: belittled by an enemy debuff, it answers with a sharp Attack spike.
    // The retaliation is self-sourced, so it never loops back through here.
    if (enemyDrop && ability === 'defiant') {
      push({
        kind: 'ability',
        actor: ownerSide,
        affected: ownerSide,
        name: 'Defiant',
        text: `${b.creature.name}'s Defiant flared up!`,
      });
      applyStage(ownerSide, offenseStage(b.creature), 2);
    }
  };

  // Battlers that have already used Ditto's Transform (once per send-out).
  const transformed = new Set<Battler>();

  const snapshot = (side: Side): Pick<BattleEvent, 'hp' | 'maxHp'> => {
    const b = sides[side].team[sides[side].active];
    return { hp: Math.max(0, b.hp), maxHp: b.maxHp };
  };

  const sendOut = (side: Side, index: number) => {
    sides[side].active = index;
    const b = sides[side].team[index];
    push({
      kind: 'sendout',
      actor: side,
      affected: side,
      index,
      name: b.creature.name,
      text:
        side === 'player'
          ? `Go, ${b.creature.name}!`
          : `Foe sent out ${b.creature.name}!`,
      ...snapshot(side),
    });
    const opp = otherSide(side);
    const t = sides[opp].team[sides[opp].active];
    if (t.hp > 0) {
      applyEntryAbilities(
        side,
        b,
        t,
        sides[side].team.map((x) => x.creature),
        (s, stat, delta, who) => applyStage(s, stat, delta, who === 'opponent' ? 'opponent' : 'self'),
        (s) => applyConfuse(s),
        (name, text, actor, affected) => {
          push({
            kind: 'ability',
            actor,
            affected,
            name,
            text,
          });
        },
        rng,
      );
    }
  };

  // The opponent leads off, then you answer — the classic battle-start beat.
  sendOut('foe', 0);
  sendOut('player', 0);

  // Who to send out next. A competent side (see switchTuning) answers with its
  // best matchup against the foe's current active; a sloppy (Easy) side just
  // grabs the next able body in party order, the classic-games default. Returns
  // -1 only when the whole party is down.
  const chooseReplacement = (side: Side): number => {
    const s = sides[side];
    const tuning = switchTuning(moveFocus[side]);
    const fallback = aliveIndex(s);
    if (fallback === -1 || !tuning.smartReplace) return fallback;
    const oppSide = otherSide(side);
    const foeActive = sides[oppSide].team[sides[oppSide].active];
    let best = fallback;
    let bestScore = -Infinity;
    for (let i = 0; i < s.team.length; i++) {
      if (s.team[i].hp <= 0) continue;
      const score = matchupScore(
        s.team[i],
        foeActive,
        s.statMult,
        sides[oppSide].statMult,
      );
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  };

  // Decide whether to spend the turn pivoting instead of acting. Returns the
  // bench index to switch to, or -1 to stand and fight. Fires only when we have
  // switch budget left, can't just KO the foe this turn, our current matchup is
  // clearly losing (matchupScore below the side's trigger), and a benched mon
  // both beats that score by a clear margin AND actually wins its own trade
  // (positive score) — so we never burn a turn pivoting into another losing spot
  // or ping-pong back and forth. The incoming mon eats the foe's hit this turn,
  // the cost that keeps the pivot honest.
  const planSwitch = (side: Side): number => {
    const tuning = switchTuning(moveFocus[side]);
    if (switchBudget[side] <= 0) return -1;
    const s = sides[side];
    const oppSide = otherSide(side);
    const foeActive = sides[oppSide].team[sides[oppSide].active];
    const active = s.team[s.active];
    const oppMult = sides[oppSide].statMult;
    // Never bail when we can close out the foe right now.
    const myPlan = planAttack(active, foeActive, s.statMult, oppMult);
    if (myPlan.dmg > 0 && myPlan.dmg >= foeActive.hp) return -1;
    const activeScore = matchupScore(active, foeActive, s.statMult, oppMult);
    if (activeScore >= tuning.triggerThreshold) return -1;
    let best = -1;
    let bestScore = activeScore;
    for (let i = 0; i < s.team.length; i++) {
      if (i === s.active || s.team[i].hp <= 0) continue;
      const score = matchupScore(s.team[i], foeActive, s.statMult, oppMult);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1) return -1;
    if (bestScore - activeScore < tuning.improveThreshold) return -1;
    if (bestScore <= 0) return -1;
    return best;
  };

  const handleFaint = (side: Side, killer?: Battler, koMove?: string): boolean => {
    const s = sides[side];
    const b = s.team[s.active];
    if (b.creature.ability === 'natural-cure') {
      b.status = null;
      b.statusTurns = 0;
      b.toxicCounter = 0;
    }
    push({
      kind: 'faint',
      actor: side,
      affected: side,
      index: s.active,
      name: b.creature.name,
      text: `${side === 'player' ? '' : 'Foe '}${b.creature.name} fainted!`,
    });
    const fainted = b;
    const next = chooseReplacement(side);
    if (next === -1) return false;
    sendOut(side, next);

    // Party-scoped "passing the torch" Abilities: the mon that just fell hands
    // something to the ally taking its place. Applied after the send-out, so the
    // boost lands on the freshly-active successor.
    const incoming = sides[side].team[sides[side].active];
    if (fainted.creature.ability === 'legacy') {
      const stat = dominantStage(fainted.creature.stats);
      push({
        kind: 'ability',
        actor: side,
        affected: side,
        name: 'Legacy',
        text: `${fainted.creature.name}'s Legacy lives on in ${incoming.creature.name}!`,
      });
      applyStage(side, stat, 2);
    } else if (fainted.creature.ability === 'rally') {
      push({
        kind: 'ability',
        actor: side,
        affected: side,
        name: 'Rally',
        text: `${fainted.creature.name} rallied ${incoming.creature.name} on its way down!`,
      });
      applyStage(side, offenseStage(incoming.creature), 1);
      applyStage(side, 'spd', 1);
    }
    const faintBonus = applyFaintAbilities(
      fainted,
      incoming,
      killer ?? null,
      koMove,
      (s, stat, delta) => applyStage(s, stat, delta, 'self'),
      side,
    );
    if (faintBonus.torchPassTurns > 0) incoming.torchPassTurns = faintBonus.torchPassTurns;
    return true;
  };

  const takeTurn = (side: Side, movedFirst = false): 'continue' | Side => {
    const me = sides[side];
    const foe = sides[otherSide(side)];
    const attacker = me.team[me.active];
    const defender = foe.team[foe.active];
    if (attacker.hp <= 0) return 'continue';

    // Ditto copies the opposing active Pokémon the first time it acts: types,
    // stats, sign and moves all become the foe's, so it fights as a mirror of
    // whatever it's up against. HP stays Ditto's own (classic Transform), and
    // only this battler's copy mutates — the team's Creature is untouched, so a
    // recruited Ditto is still a Ditto. This is a free action; it then attacks.
    if (attacker.creature.dexId === DITTO_DEX_ID && !transformed.has(attacker)) {
      transformed.add(attacker);
      const target = defender.creature;
      const copy: Creature = {
        ...target,
        id: attacker.creature.id,
        name: attacker.creature.name,
        pokeball: attacker.creature.pokeball,
      };
      push({
        kind: 'transform',
        actor: side,
        affected: side,
        text: `${attacker.creature.name} transformed into ${target.name}!`,
        transform: {
          dexId: copy.dexId,
          name: copy.name,
          types: copy.types,
          sign: copy.sign,
          sprite: copy.sprite,
          back: copy.back,
        },
      });
      attacker.creature = copy;
      // Re-seed PP for the freshly copied moveset (Transform adopts the foe's
      // moves, so the old PP map no longer applies).
      attacker.pp = {};
      for (const mv of copy.moves) {
        if (mv.pp !== undefined) attacker.pp[mv.name] = mv.pp;
      }
    }

    // Truant: a powerhouse that can only bring itself to act every other turn.
    // On a "loafing" turn it does nothing — the drawback that keeps brutes like
    // Slaking in check despite monstrous stats. The flag is set the previous
    // turn (just before it chose a move below), so it loafs exactly half the
    // time. Sits ahead of the status checks so a loaf is a clean wasted turn.
    if (attacker.creature.ability === 'truant' && attacker.loafing) {
      attacker.loafing = false;
      push({
        kind: 'ability',
        actor: side,
        affected: side,
        name: 'Truant',
        text: `${attacker.creature.name} is loafing around!`,
      });
      return 'continue';
    }

    // Sleep: snooze for a few turns, then wake. Early Bird is a light sleeper and
    // burns through those turns twice as fast.
    if (attacker.status === 'sleep') {
      attacker.statusTurns -= attacker.creature.ability === 'early-bird' ? 2 : 1;
      if (attacker.statusTurns <= 0) {
        attacker.status = null;
        push({
          kind: 'status',
          actor: side,
          affected: side,
          status: null,
          text: `${attacker.creature.name} woke up!`,
        });
      } else {
        push({
          kind: 'stunned',
          actor: side,
          text: `${attacker.creature.name} is fast asleep.`,
        });
        return 'continue';
      }
    }

    // Flinch: a faster foe's hit this turn rattled it before it could act, so it
    // loses the turn. Consumed here (and cleared at end of turn either way), so a
    // flinch can only ever cost a single, not-yet-taken action.
    if (attacker.flinched) {
      attacker.flinched = false;
      push({
        kind: 'stunned',
        actor: side,
        text: `${attacker.creature.name} flinched and couldn't move!`,
      });
      // Steadfast: balking only sharpens it — its Speed climbs a stage even as it
      // forfeits this action.
      if (attacker.creature.ability === 'steadfast') {
        push({
          kind: 'ability',
          actor: side,
          affected: side,
          name: 'Steadfast',
          text: `${attacker.creature.name}'s Steadfast kicked in!`,
        });
        applyStage(side, 'spd', 1);
      }
      return 'continue';
    }

    // Paralysis: a chance to be unable to move.
    if (attacker.status === 'stun') {
      if (rng.chance(0.3)) {
        push({
          kind: 'stunned',
          actor: side,
          text: `${attacker.creature.name} is paralyzed and can't move!`,
        });
        return 'continue';
      }
      attacker.statusTurns -= 1;
      if (attacker.statusTurns <= 0) {
        attacker.status = null;
        push({
          kind: 'status',
          actor: side,
          affected: side,
          status: null,
          text: `${attacker.creature.name} shook off the paralysis!`,
        });
      }
    }

    // Confusion: tick down, then risk hurting itself instead of acting.
    if (attacker.confusion > 0) {
      attacker.confusion -= 1;
      push({
        kind: 'stunned',
        actor: side,
        text:
          attacker.confusion <= 0
            ? `${attacker.creature.name} snapped out of confusion!`
            : `${attacker.creature.name} is confused!`,
      });
      if (rng.chance(0.33)) {
        const atk = effectiveAtk(attacker, me.statMult);
        const def = effectiveDef(attacker, me.statMult);
        const base = (2 * LEVEL) / 5 + 2;
        let dmg = Math.max(1, Math.floor((base * 40 * (atk / def)) / 50 + 2));
        if (attacker.creature.ability === 'trickster') dmg = Math.max(1, Math.floor(dmg / 2));
        attacker.hp -= dmg;
        push({
          kind: 'hit',
          actor: side,
          affected: side,
          damage: dmg,
          text: 'It hurt itself in its confusion!',
          ...snapshot(side),
        });
        if (attacker.hp <= 0) {
          const survives = handleFaint(side);
          if (!survives) return otherSide(side);
        }
        return 'continue';
      }
    }

    // Voluntary pivot: bail out of a clearly losing matchup into a better bench
    // answer (see planSwitch). It costs the whole turn — the incoming mon takes
    // the foe's hit — and draws from a small per-battle budget, so it reads as a
    // real tactical switch rather than free tempo. Sits after the can-it-act
    // gating above, so switching is this turn's action, not a way to dodge sleep.
    const swapTo = planSwitch(side);
    if (swapTo !== -1) {
      switchBudget[side] -= 1;
      push({
        kind: 'withdraw',
        actor: side,
        affected: side,
        text:
          side === 'player'
            ? `${attacker.creature.name}, come back!`
            : `Foe withdrew ${attacker.creature.name}!`,
      });
      sendOut(side, swapTo);
      return 'continue';
    }

    // A Truant user is about to act, so it must loaf on its *next* turn. Set
    // here (not on every early-return above) so only a turn it genuinely acts on
    // costs it the follow-up loaf.
    if (attacker.creature.ability === 'truant') attacker.loafing = true;

    const move = chooseMove(
      attacker,
      defender,
      me.statMult,
      foe.statMult,
      moveFocus[side],
      rng,
    );
    // Spend a use of any PP-capped move (consumed on use, even if it later
    // misses — matching how the games charge PP).
    if (move.pp !== undefined) {
      const cost = defender.creature.ability === 'pressure' ? 2 : 1;
      attacker.pp[move.name] = Math.max(0, (attacker.pp[move.name] ?? move.pp) - cost);
    }
    push({
      kind: 'move',
      actor: side,
      moveName: move.name,
      moveType: move.type,
      moveAnim: attackAnimFor(move),
      text: `${attacker.creature.name} used ${move.name}!`,
    });

    // Hustle trades aim for power: its damaging moves land 0.8× as reliably
    // (status moves keep their usual accuracy).
    const accuracy = effectiveAccuracy(attacker, defender, move);
    if (!rng.chance(accuracy)) {
      push({ kind: 'miss', actor: side, text: 'But it missed!' });
      return 'continue';
    }

    // Self-heal move. Diminishing returns: each successive heal this battle
    // restores HEAL_DECAY as much as the last, so two healers can't trade
    // near-full Recovers into a stalemate (see Battler.healsUsed / HEAL_DECAY).
    if (move.effect?.kind === 'heal') {
      const renewal = attacker.creature.ability === 'renewal' ? 1.5 : 1;
      const amount = move.effect.amount * renewal * HEAL_DECAY ** attacker.healsUsed;
      attacker.healsUsed += 1;
      const heal = Math.floor(attacker.maxHp * amount);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      push({
        kind: 'heal',
        actor: side,
        affected: side,
        text: `${attacker.creature.name} restored its health.`,
        ...snapshot(side),
      });
      return 'continue';
    }

    // Super Fang: lop off a fixed share of the foe's CURRENT HP, ignoring
    // Defense and bulk entirely. Never KOs on its own (leaves >=1 HP from this
    // move). Normal-typed, so Ghosts are immune.
    if (move.effect?.kind === 'fracdamage') {
      if (typeMult(move, defender) === 0) {
        push({
          kind: 'noeffect',
          actor: side,
          text: `It doesn't affect ${defender.creature.name}…`,
        });
        return 'continue';
      }
      const dmg = Math.max(1, Math.floor(defender.hp * move.effect.fraction));
      defender.hp -= dmg;
      push({
        kind: 'hit',
        actor: side,
        affected: otherSide(side),
        moveName: move.name,
        moveType: move.type,
        damage: dmg,
        mult: 1,
        crit: false,
        text: '',
        ...snapshot(otherSide(side)),
      });
      if (defender.hp <= 0) {
        const survives = handleFaint(otherSide(side), attacker, move.name);
        if (!survives) return side;
      }
      return 'continue';
    }

    // Taunt: seal the foe's setup/heal/status buttons for a few turns.
    if (move.effect?.kind === 'taunt') {
      const immune = typeMult(move, defender) === 0;
      if (immune) {
        push({
          kind: 'noeffect',
          actor: side,
          text: `It doesn't affect ${defender.creature.name}…`,
        });
      } else if (
        defender.abilityPassive.immuneTaunt ||
        defender.creature.ability === 'oblivious'
      ) {
        const tauntSide = otherSide(side);
        push({
          kind: 'ability',
          actor: tauntSide,
          affected: tauntSide,
          name: 'Oblivious',
          text: `${defender.creature.name} ignored the taunt!`,
        });
      } else {
        defender.taunted = TAUNT_TURNS;
        push({
          kind: 'status',
          actor: side,
          affected: otherSide(side),
          text: `${defender.creature.name} fell for the taunt!`,
        });
      }
      return 'continue';
    }

    // Weight Down / Blinded / Disarmed: power-0 volatile disruptions laid on the
    // foe. Each respects a 0× type immunity like the other status moves, and is
    // announced so the log and the status badge can pick it up. None occupy the
    // primary-status slot, so they stack with whatever else the foe is carrying.
    if (
      move.power === 0 &&
      move.effect &&
      (move.effect.kind === 'weight' ||
        move.effect.kind === 'blind' ||
        move.effect.kind === 'disarm')
    ) {
      const vk = move.effect.kind;
      const tSide = otherSide(side);
      if (typeMult(move, defender) === 0) {
        push({
          kind: 'noeffect',
          actor: side,
          text: `It doesn't affect ${defender.creature.name}…`,
        });
        return 'continue';
      }
      const alreadyOn =
        (vk === 'weight' && defender.weightTurns > 0) ||
        (vk === 'blind' && defender.blindTurns > 0) ||
        (vk === 'disarm' && defender.sealedTurns > 0);
      if (alreadyOn) {
        push({ kind: 'noeffect', actor: side, text: 'But it failed!' });
        return 'continue';
      }
      if (vk === 'weight') {
        defender.weightTurns = WEIGHT_TURNS;
        push({
          kind: 'status',
          actor: side,
          affected: tSide,
          volatile: 'weight',
          volatileOn: true,
          text: `${defender.creature.name} was weighed down!`,
        });
      } else if (vk === 'blind') {
        defender.blindTurns = BLIND_TURNS;
        push({
          kind: 'status',
          actor: side,
          affected: tSide,
          volatile: 'blind',
          volatileOn: true,
          text: `${defender.creature.name} was blinded!`,
        });
      } else {
        // Disarm: seal the foe's single best move — highest estimated damage, with
        // raw power as a tiebreaker so it still bites a foe we resist. Nothing to
        // seal if it carries no damaging move (a pure staller); that just fails.
        let target: Move | null = null;
        let best = -1;
        for (const mv of defender.creature.moves) {
          if (mv.power <= 0) continue;
          const d = estimateDamage(defender, attacker, mv, foe.statMult, me.statMult);
          const sc = d > 0 ? d : mv.power;
          if (sc > best) {
            best = sc;
            target = mv;
          }
        }
        if (!target) {
          push({ kind: 'noeffect', actor: side, text: 'But it failed!' });
          return 'continue';
        }
        defender.sealedMoveName = target.name;
        defender.sealedTurns = DISARM_TURNS;
        push({
          kind: 'status',
          actor: side,
          affected: tSide,
          volatile: 'disarm',
          volatileOn: true,
          text: `${defender.creature.name} was disarmed — its ${target.name} was sealed!`,
        });
      }
      return 'continue';
    }

    // Pure setup move: shift the user's (or, rarely, the foe's) stat stages.
    if (move.power === 0 && move.effect?.kind === 'stage') {
      const toSelf = move.effect.target === 'self';
      const owner = toSelf ? side : otherSide(side);
      applyStage(owner, move.effect.stat, move.effect.delta, toSelf ? 'self' : 'opponent');
      return 'continue';
    }

    // Dual-stat setup/utility (Dragon Dance, Bulk Up, …): shift several of the
    // owner's stages in one go.
    if (move.power === 0 && move.effect?.kind === 'multistage') {
      const toSelf = move.effect.target === 'self';
      const owner = toSelf ? side : otherSide(side);
      for (const s of move.effect.stages)
        applyStage(owner, s.stat, s.delta, toSelf ? 'self' : 'opponent');
      return 'continue';
    }

    // Pure status move (Will-O-Wisp, Thunder Wave, Toxic, Hypnosis, …).
    if (
      move.power === 0 &&
      move.effect &&
      (STATUS_RIDER_KINDS as readonly string[]).includes(move.effect.kind)
    ) {
      const immune = typeMult(move, defender) === 0;
      let landed = false;
      if (!immune) {
        landed =
          move.effect.kind === 'confuse'
            ? applyConfuse(otherSide(side))
            : applyStatus(
                otherSide(side),
                move.effect.kind as Exclude<StatusKind, null>,
              );
      }
      if (immune) {
        push({
          kind: 'noeffect',
          actor: side,
          text: `It doesn't affect ${defender.creature.name}…`,
        });
      } else if (!landed) {
        push({ kind: 'noeffect', actor: side, text: 'But it failed!' });
      }
      return 'continue';
    }

    // --- Defender absorption abilities: soak a whole type rather than take it.
    // These intercept the hit before any damage is rolled, then heal or buff the
    // defender. (typeMult already reports the type as a 0× immunity, so the AI
    // steers clear of throwing these moves in the first place.)
    const dSide = otherSide(side);
    const defAbility = defender.creature.ability;
    if (
      move.type === 'water' &&
      (defAbility === 'water-absorb' || defAbility === 'dry-skin')
    ) {
      const room = defender.hp < defender.maxHp;
      if (room) {
        defender.hp = Math.min(
          defender.maxHp,
          defender.hp + Math.max(1, Math.floor(defender.maxHp / 4)),
        );
      }
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: defAbility === 'dry-skin' ? 'Dry Skin' : 'Water Absorb',
        text: room
          ? `${defender.creature.name} drank in ${move.name} and recovered HP!`
          : `${defender.creature.name} drank in ${move.name}!`,
        ...snapshot(dSide),
      });
      return 'continue';
    }
    if (move.type === 'electric' && defAbility === 'volt-absorb') {
      const room = defender.hp < defender.maxHp;
      if (room) {
        defender.hp = Math.min(
          defender.maxHp,
          defender.hp + Math.max(1, Math.floor(defender.maxHp / 4)),
        );
      }
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Volt Absorb',
        text: room
          ? `${defender.creature.name} soaked up ${move.name} and recovered HP!`
          : `${defender.creature.name} soaked up ${move.name}!`,
        ...snapshot(dSide),
      });
      return 'continue';
    }
    if (move.type === 'electric' && defAbility === 'motor-drive') {
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Motor Drive',
        text: `${defender.creature.name}'s Motor Drive kicked into gear!`,
      });
      applyStage(dSide, 'spd', 1);
      return 'continue';
    }
    if (move.type === 'grass' && defAbility === 'sap-sipper') {
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Sap Sipper',
        text: `${defender.creature.name} grazed on ${move.name}!`,
      });
      applyStage(dSide, offenseStage(defender.creature), 1);
      return 'continue';
    }
    if (move.type === 'fire' && defAbility === 'flash-fire') {
      const firstTime = !defender.flashFire;
      defender.flashFire = true;
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Flash Fire',
        text: firstTime
          ? `${defender.creature.name} drew in the flames — its Fire moves grew stronger!`
          : `${defender.creature.name} shrugged off the flames!`,
      });
      return 'continue';
    }

    // Damaging move.
    const { damage, mult, crit } = damageRoll(
      attacker,
      defender,
      move,
      me.statMult,
      foe.statMult,
      rng,
      me.team,
      movedFirst,
    );

    if (mult === 0) {
      push({
        kind: 'noeffect',
        actor: side,
        text: `It doesn't affect ${defender.creature.name}…`,
      });
      return 'continue';
    }

    // Disguise: a flimsy costume eats the first hit that would land. The blow is
    // shrugged off entirely (no damage, status or secondary effect) and the
    // disguise breaks, so every hit afterwards connects normally.
    if (defender.creature.ability === 'disguise' && !defender.disguiseBusted) {
      defender.disguiseBusted = true;
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Disguise',
        text: `${defender.creature.name}'s disguise took the hit and broke!`,
        ...snapshot(dSide),
      });
      return 'continue';
    }

    // Sturdy: at full health it braces against a knockout blow, clinging to a
    // single HP instead of fainting. A one-time safety net (it must be at full
    // HP for it to kick in), not a permanent wall.
    const hpBefore = defender.hp;
    // Shell Shield: the first damaging blow each battle is halved before anything
    // else weighs in (so the survive-checks below see the softened hit).
    let incoming = damage;
    let shellHeld = false;
    if (
      defender.creature.ability === 'shell-shield' &&
      !defender.shellShieldUsed &&
      incoming > 0
    ) {
      defender.shellShieldUsed = true;
      shellHeld = true;
      incoming = Math.max(1, Math.floor(incoming / 2));
    }
    const plotHold =
      defender.creature.ability === 'plot-armor' &&
      !defender.plotArmorUsed &&
      defender.hp > defender.maxHp / 2 &&
      incoming >= defender.hp;
    const sturdyHold =
      defender.creature.ability === 'sturdy' &&
      defender.hp === defender.maxHp &&
      incoming >= defender.hp;
    // Phoenix: the first fatal blow each battle leaves it clinging to 1 HP, from
    // any health (unlike Sturdy/Plot Armor, which need a healthy starting point).
    const phoenixHold =
      defender.creature.ability === 'phoenix' &&
      !defender.phoenixUsed &&
      incoming >= defender.hp;
    let dealt = incoming;
    if (plotHold) {
      defender.plotArmorUsed = true;
      dealt = defender.hp - 1;
    } else if (sturdyHold) {
      dealt = defender.hp - 1;
    } else if (phoenixHold) {
      defender.phoenixUsed = true;
      dealt = defender.hp - 1;
    }
    defender.hp -= dealt;
    push({
      kind: 'hit',
      actor: side,
      affected: otherSide(side),
      moveName: move.name,
      moveType: move.type,
      damage: dealt,
      mult,
      crit,
      text: crit ? 'A critical hit!' : '',
      ...snapshot(otherSide(side)),
    });
    if (sturdyHold) {
      push({
        kind: 'ability',
        actor: otherSide(side),
        affected: otherSide(side),
        name: 'Sturdy',
        text: `${defender.creature.name} endured the hit with Sturdy!`,
      });
    }
    if (plotHold) {
      push({
        kind: 'ability',
        actor: otherSide(side),
        affected: otherSide(side),
        name: 'Plot Armor',
        text: `${defender.creature.name}'s Plot Armor kept it standing!`,
      });
    }
    if (shellHeld) {
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Shell Shield',
        text: `${defender.creature.name} tucked into its shell and blunted the blow!`,
      });
    }
    if (phoenixHold) {
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Phoenix',
        text: `${defender.creature.name} rose from the ashes and clung on!`,
      });
    }
    // Gluttony: the first time it's worn to half HP or below, it stuffs itself.
    if (
      defender.creature.ability === 'gluttony' &&
      !defender.gluttonyUsed &&
      hpBefore > defender.maxHp / 2 &&
      defender.hp > 0 &&
      defender.hp <= defender.maxHp / 2
    ) {
      defender.gluttonyUsed = true;
      defender.hp = Math.min(defender.maxHp, defender.hp + Math.floor(defender.maxHp * 0.33));
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Gluttony',
        text: `${defender.creature.name} stuffed itself and bounced back!`,
        ...snapshot(dSide),
      });
    }
    if (
      defender.creature.ability === 'second-wind' &&
      !defender.secondWindUsed &&
      hpBefore > defender.maxHp / 3 &&
      defender.hp > 0 &&
      defender.hp <= defender.maxHp / 3
    ) {
      defender.secondWindUsed = true;
      defender.hp = Math.min(
        defender.maxHp,
        defender.hp + Math.floor(defender.maxHp * 0.25),
      );
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Second Wind',
        text: `${defender.creature.name} rallied with Second Wind!`,
        ...snapshot(dSide),
      });
    }
    if (dealt > 0 && defender.creature.ability === 'color-change') {
      defender.colorResistType = move.type;
    }

    if (move.effect?.kind === 'lifesteal' && dealt > 0) {
      const drained = Math.floor(dealt * move.effect.fraction);
      if (defender.creature.ability === 'liquid-ooze') {
        // Liquid Ooze: the fluids it siphoned are toxic — the would-be heal is
        // turned into damage on the attacker (and can be the death of it).
        attacker.hp -= drained;
        push({
          kind: 'ability',
          actor: dSide,
          affected: side,
          name: 'Liquid Ooze',
          text: `${attacker.creature.name} sucked up the Liquid Ooze and was hurt!`,
          ...snapshot(side),
        });
        if (attacker.hp <= 0) {
          if (defender.hp <= 0 && !handleFaint(otherSide(side), attacker, move.name)) return side;
          const survives = handleFaint(side);
          if (!survives) return otherSide(side);
          return 'continue';
        }
      } else {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + drained);
        push({
          kind: 'heal',
          actor: side,
          affected: side,
          text: `${attacker.creature.name} drained energy!`,
          ...snapshot(side),
        });
      }
    }

    // Shell Bell (a relic): the attacker siphons back a slice of the damage it
    // just dealt. Distinct from a lifesteal move (both can apply on the same
    // hit), and never revives a fainted attacker.
    if (attacker.mods.lifesteal > 0 && dealt > 0 && attacker.hp > 0) {
      const drained = Math.floor(dealt * attacker.mods.lifesteal);
      if (drained > 0 && attacker.hp < attacker.maxHp) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + drained);
        push({
          kind: 'heal',
          actor: side,
          affected: side,
          text: `${attacker.creature.name} recovered HP with its Shell Bell!`,
          ...snapshot(side),
        });
      }
    }

    // Recoil: a reckless hit bites back, costing the attacker a share of the
    // damage it dealt. Magic Guard shrugs off the kickback (it only ever takes
    // direct hits). Surfaced as a self-inflicted 'hit' so the bar drops and a
    // damage number pops on the attacker. The recoil can itself be the KO — even
    // a trade where both go down — so it's resolved before the foe's faint.
    if (
      move.effect?.kind === 'recoil' &&
      dealt > 0 &&
      attacker.hp > 0 &&
      attacker.creature.ability !== 'magic-guard'
    ) {
      const recoilFrac = move.effect.fraction * (attacker.creature.ability === 'reckless' ? 1.25 : 1);
      const recoil = Math.max(1, Math.floor(dealt * recoilFrac));
      attacker.hp -= recoil;
      push({
        kind: 'hit',
        actor: side,
        affected: side,
        damage: recoil,
        text: `${attacker.creature.name} is hit with recoil!`,
        ...snapshot(side),
      });
      if (attacker.hp <= 0) {
        // The foe may have gone down to the same blow — resolve its faint first
        // so the battle ends correctly if both sides are now empty.
        if (defender.hp <= 0 && !handleFaint(otherSide(side), attacker, move.name)) return side;
        const survives = handleFaint(side);
        if (!survives) return otherSide(side);
        return 'continue';
      }
    }

    // Guaranteed self-cost riders on a move that connected: a self stat-tax
    // (selfStage) and/or a type lockout (lockTurns). Resolved here — before the
    // foe's faint — so the price is paid the moment the move commits, whether or
    // not it scored the knockout (a recharging cannon doesn't care that it hit).
    if (move.selfStage) {
      applyStage(side, move.selfStage.stat, move.selfStage.delta, 'self');
    }
    if (move.lockTurns) {
      attacker.typeLock = { type: move.type, turns: move.lockTurns };
    }

    if (defender.hp <= 0) {
      const survives = handleFaint(otherSide(side), attacker, move.name);
      // Aftermath: felled by a direct hit, it detonates in the attacker's face
      // for a quarter of that attacker's HP — a parting blow that can trade the
      // KO right back (resolved before Moxie, since a fainted attacker can't bask
      // in the knockout).
      if (
        dealt > 0 &&
        attacker.hp > 0 &&
        defender.creature.ability === 'aftermath'
      ) {
        const blast = Math.max(1, Math.floor(attacker.maxHp / 4));
        attacker.hp -= blast;
        push({
          kind: 'ability',
          actor: otherSide(side),
          affected: side,
          name: 'Aftermath',
          text: `${attacker.creature.name} was caught in the Aftermath blast!`,
          ...snapshot(side),
        });
        if (attacker.hp <= 0) {
          if (!survives) return side; // foe's team already wiped — you still win
          const atkSurvives = handleFaint(side);
          if (!atkSurvives) return otherSide(side);
          return 'continue';
        }
      }
      // Moxie: emboldened by the knockout, the attacker's offence rises a stage —
      // letting a sweeper build momentum as it cuts through the foe's team. The
      // boost follows whichever attack the mon leans on, so energy sweepers snowball
      // too. (No point once the battle's already won, so only while it continues.)
      if (survives && attacker.hp > 0 && attacker.creature.ability === 'moxie') {
        applyStage(side, offenseStage(attacker.creature), 1);
      }
      if (!survives) return side;
      return 'continue';
    }

    // Contact abilities: static, flame body, rough skin, iron barbs, sticky, etc.
    if (dealt > 0 && attacker.hp > 0 && isContactHit(attacker, move)) {
      applyContactAbilities(defender, attacker, move.name, rng);
      if (attacker.hp <= 0) {
        const survives = handleFaint(side);
        if (!survives) return otherSide(side);
        return 'continue';
      }
    }

    // Backlash: an energy (special) hit recoils on a reactive-hide defender —
    // the special-attack twin of Rough Skin / Iron Barbs above.
    if (dealt > 0 && attacker.hp > 0 && moveCategory(move) === 'energy') {
      applyEnergyStruckAbilities(defender, attacker, move);
      if (attacker.hp <= 0) {
        const survives = handleFaint(side);
        if (!survives) return otherSide(side);
        return 'continue';
      }
    }

    // Riposte: the first contact blow of the battle is turned back on the attacker.
    if (
      dealt > 0 &&
      attacker.hp > 0 &&
      defender.creature.ability === 'riposte' &&
      !defender.riposteUsed &&
      isContactHit(attacker, move)
    ) {
      defender.riposteUsed = true;
      const back = Math.max(1, Math.floor(dealt * 0.5));
      attacker.hp = Math.max(0, attacker.hp - back);
      push({
        kind: 'ability',
        actor: dSide,
        affected: dSide,
        name: 'Riposte',
        text: `${defender.creature.name} turned the blow back on ${attacker.creature.name}!`,
      });
      if (attacker.hp <= 0) {
        const survives = handleFaint(side);
        if (!survives) return otherSide(side);
        return 'continue';
      }
    }

    // Stamina: every blow it weathers makes it dig in, hardening its Defense a
    // stage — the longer it stays in, the harder it is to break through.
    if (defender.creature.ability === 'stamina' && dealt > 0) {
      push({
        kind: 'ability',
        actor: otherSide(side),
        affected: otherSide(side),
        name: 'Stamina',
        text: `${defender.creature.name}'s Stamina kicked in!`,
      });
      applyStage(otherSide(side), 'def', 1);
    }

    // Weak Armor: every blow cracks its plating (−Defense) but shears off weight,
    // so it springs back a little quicker (+Speed) each time it's struck.
    if (defender.creature.ability === 'weak-armor' && dealt > 0) {
      push({
        kind: 'ability',
        actor: otherSide(side),
        affected: otherSide(side),
        name: 'Weak Armor',
        text: `${defender.creature.name}'s Weak Armor shifted!`,
      });
      applyStage(otherSide(side), 'def', -1);
      applyStage(otherSide(side), 'spd', 1);
    }

    // Anger Shell: the blow that first drops it below half HP cracks its shell —
    // its guard falls, but the fury that floods in spikes its Attack and Speed.
    // Triggers only on the crossing, not on every later hit.
    if (defender.creature.ability === 'anger-shell' && dealt > 0) {
      const beforeHp = defender.hp + dealt;
      const half = defender.maxHp / 2;
      if (beforeHp > half && defender.hp <= half) {
        push({
          kind: 'ability',
          actor: otherSide(side),
          affected: otherSide(side),
          name: 'Anger Shell',
          text: `${defender.creature.name}'s Anger Shell cracked — it's enraged!`,
        });
        applyStage(otherSide(side), 'def', -1);
        applyStage(otherSide(side), 'atk', 1);
        applyStage(otherSide(side), 'spd', 1);
      }
    }

    // Anger Point: a critical hit tips it into a blind rage, slamming its Attack
    // straight to the ceiling (the +12 simply clamps to the +6 max).
    if (crit && dealt > 0 && defender.creature.ability === 'anger-point') {
      push({
        kind: 'ability',
        actor: otherSide(side),
        affected: otherSide(side),
        name: 'Anger Point',
        text: `${defender.creature.name}'s Anger Point sent it into a fury!`,
      });
      applyStage(otherSide(side), 'atk', 12);
    }

    // Justified: a Dark-type strike offends its sense of honour, steeling its
    // Attack a stage in answer.
    if (move.type === 'dark' && dealt > 0 && defender.creature.ability === 'justified') {
      push({
        kind: 'ability',
        actor: otherSide(side),
        affected: otherSide(side),
        name: 'Justified',
        text: `${defender.creature.name}'s Justified flared up!`,
      });
      applyStage(otherSide(side), 'atk', 1);
    }

    // On-hit rider effects: a status, confusion, or a stat-stage shift. Sheer
    // Force trades all of these away for its flat damage boost, so it skips them.
    const eff = move.effect;
    if (eff && attacker.creature.ability !== 'sheer-force') {
      if (
        (eff.kind === 'burn' ||
          eff.kind === 'stun' ||
          eff.kind === 'poison' ||
          eff.kind === 'sleep' ||
          eff.kind === 'frostbite') &&
        rng.chance(eff.chance)
      ) {
        applyStatus(otherSide(side), eff.kind);
      } else if (eff.kind === 'confuse' && rng.chance(eff.chance)) {
        applyConfuse(otherSide(side));
      } else if (eff.kind === 'flinch' && rng.chance(eff.chance)) {
        // Only bites if the foe still has its turn coming this round; a flinch
        // landed by the slower mon does nothing (cleared at end of turn). The
        // flag is read at the top of the foe's takeTurn. Inner Focus is too
        // composed to ever balk, so the flinch simply never takes hold.
        if (defender.creature.ability !== 'inner-focus') defender.flinched = true;
      } else if (eff.kind === 'stage' && rng.chance(eff.chance)) {
        const toSelf = eff.target === 'self';
        applyStage(
          toSelf ? side : otherSide(side),
          eff.stat,
          eff.delta,
          toSelf ? 'self' : 'opponent',
        );
      }
    }

    if (dealt > 0) {
      attacker.actedTurns += 1;
      if (attacker.creature.ability === 'opening-act') attacker.openingActUsed = true;
      // Cheek Pouch: spend the stored charge once an Electric move has connected.
      if (attacker.creature.ability === 'cheek-pouch' && move.type === 'electric') {
        attacker.cheekPouchUsed = true;
      }
      // Tempest: its Electric strikes crackle with a chance to paralyze.
      if (
        attacker.creature.ability === 'tempest' &&
        move.type === 'electric' &&
        rng.chance(0.2)
      ) {
        applyStatus(otherSide(side), 'stun');
      }
    }

    return 'continue';
  };

  const endOfTurnStatus = (side: Side): 'continue' | Side => {
    const s = sides[side];
    const b = s.team[s.active];
    if (b.hp <= 0) return 'continue';

    // Clear any flinch that didn't get consumed this round — i.e. one the slower
    // mon landed on a foe that had already acted. Flinch never carries over.
    b.flinched = false;

    // Tick down a self type-lockout; once it lapses the recharged weapon is free
    // to fire again next turn.
    if (b.typeLock) {
      b.typeLock.turns -= 1;
      if (b.typeLock.turns <= 0) {
        const t = b.typeLock.type;
        b.typeLock = null;
        push({
          kind: 'status',
          actor: side,
          affected: side,
          text: `${b.creature.name}'s ${t[0].toUpperCase()}${t.slice(1)} moves are ready again!`,
        });
      }
    }

    // Taunt wears off after a few rounds, freeing setup/heal again.
    if (b.taunted > 0) {
      b.taunted -= 1;
      if (b.taunted === 0) {
        push({
          kind: 'status',
          actor: side,
          affected: side,
          text: `${b.creature.name} shook off the taunt.`,
        });
      }
    }

    // Speed Boost: its Speed ratchets up a stage every turn, so a fast, frail
    // attacker only pulls further ahead the longer it stays in.
    if (b.creature.ability === 'speed-boost' && b.stages.spd < 6) {
      applyStage(side, 'spd', 1);
    }

    if (b.torchPassTurns > 0) b.torchPassTurns -= 1;
    if (b.sealedTurns > 0) {
      b.sealedTurns -= 1;
      if (b.sealedTurns <= 0) {
        const freed = b.sealedMoveName;
        b.sealedMoveName = null;
        push({
          kind: 'status',
          actor: side,
          affected: side,
          volatile: 'disarm',
          volatileOn: false,
          text: freed
            ? `${b.creature.name} can use ${freed} again!`
            : `${b.creature.name} is rearmed!`,
        });
      }
    }
    if (b.weightTurns > 0) {
      b.weightTurns -= 1;
      if (b.weightTurns <= 0) {
        push({
          kind: 'status',
          actor: side,
          affected: side,
          volatile: 'weight',
          volatileOn: false,
          text: `${b.creature.name} shook off the weight.`,
        });
      }
    }
    if (b.blindTurns > 0) {
      b.blindTurns -= 1;
      if (b.blindTurns <= 0) {
        push({
          kind: 'status',
          actor: side,
          affected: side,
          volatile: 'blind',
          volatileOn: false,
          text: `${b.creature.name}'s sight cleared.`,
        });
      }
    }
    if (b.statusSuspectTurns > 0) {
      b.statusSuspectTurns -= 1;
      if (b.statusSuspectTurns <= 0) b.statusSusceptMult = 1;
    }
    if (b.hexTurns > 0) b.hexTurns -= 1; // Jinx curse wears off
    if (b.perishCountdown > 0) {
      const chip = Math.max(1, Math.floor(b.maxHp / 3));
      b.hp -= chip;
      push({
        kind: 'statusTick',
        actor: side,
        affected: side,
        damage: chip,
        text: `${b.creature.name} is trapped by Perish Body!`,
        ...snapshot(side),
      });
      b.perishCountdown -= 1;
      if (b.perishCountdown <= 0) b.hp = 0;
    }
    if (b.creature.ability === 'hydration') {
      b.hydrationCounter += 1;
      if (b.hydrationCounter >= 3 && b.status !== null) {
        b.status = null;
        b.statusTurns = 0;
        b.toxicCounter = 0;
        b.hydrationCounter = 0;
        push({
          kind: 'ability',
          actor: side,
          affected: side,
          name: 'Hydration',
          text: `${b.creature.name} shook off its status with Hydration!`,
        });
      }
    }
    if (b.creature.ability === 'moody') {
      const up = rng.pick(MOODY_STATS);
      let down = rng.pick(MOODY_STATS);
      while (down === up) down = rng.pick(MOODY_STATS);
      b.stages[up] = Math.min(6, b.stages[up] + 2);
      b.stages[down] = Math.max(-6, b.stages[down] - 1);
      push({
        kind: 'ability',
        actor: side,
        affected: side,
        name: 'Moody',
        text: `${b.creature.name}'s Moody shifted its stats!`,
      });
    }
    const roster = s.team.map((x) => x.creature);
    if (
      teamHasAbility(roster, 'grass-warden') &&
      b.creature.types.includes('grass') &&
      b.hp > 0 &&
      b.hp < b.maxHp
    ) {
      b.hp = Math.min(b.maxHp, b.hp + Math.max(1, Math.floor(b.maxHp / 16)));
    }
    if (
      teamHasAbility(roster, 'tide-matriarch') &&
      b.creature.types.includes('water') &&
      b.hp > 0 &&
      b.hp < b.maxHp
    ) {
      b.hp = Math.min(b.maxHp, b.hp + Math.max(1, Math.floor(b.maxHp / 32)));
    }

    // Shed Skin: about a third of the time it sloughs off whatever ails it,
    // before the status would tick — so a lucky shed dodges that turn's chip too.
    if (b.creature.ability === 'shed-skin' && b.status !== null && rng.chance(1 / 3)) {
      b.status = null;
      b.statusTurns = 0;
      b.toxicCounter = 0;
      push({
        kind: 'status',
        actor: side,
        affected: side,
        status: null,
        text: `${b.creature.name} shed its skin and healed its status!`,
      });
    }

    // Magic Guard: indirect harm rolls off — burn and poison still tick down and
    // expire, they just never sap any HP.
    const magicGuard = b.creature.ability === 'magic-guard';

    if (b.status === 'burn') {
      if (!magicGuard) {
        // Overload runs hot — its trade-off is that burn gnaws 50% harder.
        const overload = b.creature.ability === 'overload' ? 1.5 : 1;
        const dmg = Math.max(1, Math.floor((b.maxHp / 12) * overload));
        b.hp -= dmg;
        push({
          kind: 'statusTick',
          actor: side,
          affected: side,
          status: 'burn',
          damage: dmg,
          text: `${b.creature.name} is hurt by its burn!`,
          ...snapshot(side),
        });
      }
      b.statusTurns -= 1;
      if (b.statusTurns <= 0) {
        b.status = null;
        if (b.hp > 0) {
          push({
            kind: 'status',
            actor: side,
            affected: side,
            status: null,
            text: `${b.creature.name}'s burn faded.`,
          });
        }
      }
    } else if (b.status === 'frostbite') {
      if (!magicGuard) {
        // Overload runs hot — the frostbite gnaws 50% deeper, same as its burn.
        const overload = b.creature.ability === 'overload' ? 1.5 : 1;
        const dmg = Math.max(1, Math.floor((b.maxHp / 12) * overload));
        b.hp -= dmg;
        push({
          kind: 'statusTick',
          actor: side,
          affected: side,
          status: 'frostbite',
          damage: dmg,
          text: `${b.creature.name} is nipped by frostbite!`,
          ...snapshot(side),
        });
      }
      b.statusTurns -= 1;
      if (b.statusTurns <= 0) {
        b.status = null;
        if (b.hp > 0) {
          push({
            kind: 'status',
            actor: side,
            affected: side,
            status: null,
            text: `${b.creature.name}'s frostbite thawed.`,
          });
        }
      }
    } else if (b.status === 'poison') {
      if (b.creature.ability === 'poison-heal') {
        // Poison Heal: it feeds on the toxin, mending HP instead of losing it.
        if (b.hp < b.maxHp) {
          const heal = Math.max(1, Math.floor(b.maxHp / 8));
          b.hp = Math.min(b.maxHp, b.hp + heal);
          push({
            kind: 'ability',
            actor: side,
            affected: side,
            name: 'Poison Heal',
            text: `${b.creature.name} is restored by Poison Heal!`,
            ...snapshot(side),
          });
        }
      } else if (!magicGuard) {
        // Toxic-style escalation: each turn hurts a little more than the last.
        // Overload's hot-running systems take 50% more from the poison too.
        const overload = b.creature.ability === 'overload' ? 1.5 : 1;
        const dmg = Math.max(1, Math.floor(((b.maxHp * b.toxicCounter) / 16) * overload));
        b.hp -= dmg;
        push({
          kind: 'statusTick',
          actor: side,
          affected: side,
          status: 'poison',
          damage: dmg,
          text: `${b.creature.name} is hurt by poison!`,
          ...snapshot(side),
        });
      }
      b.toxicCounter += 1;
    }

    // Regenerator: it quietly knits itself back together, recovering a sliver of
    // HP each turn — slow attrition that outlasts the foe in a long grind. Runs
    // after status ticks so it can claw back some of that chip damage.
    if (b.creature.ability === 'regenerator' && b.hp > 0 && b.hp < b.maxHp) {
      const heal = Math.max(1, Math.floor(b.maxHp / 16));
      b.hp = Math.min(b.maxHp, b.hp + heal);
      push({
        kind: 'ability',
        actor: side,
        affected: side,
        name: 'Regenerator',
        text: `${b.creature.name} regenerated some health!`,
        ...snapshot(side),
      });
    }

    // Verdant: it drinks in light, mending a little each turn.
    if (b.creature.ability === 'verdant' && b.hp > 0 && b.hp < b.maxHp) {
      const heal = Math.max(1, Math.floor(b.maxHp / 16));
      b.hp = Math.min(b.maxHp, b.hp + heal);
      push({
        kind: 'ability',
        actor: side,
        affected: side,
        name: 'Verdant',
        text: `${b.creature.name} drank in the light.`,
        ...snapshot(side),
      });
    }

    // Transfusion: it channels a sliver of vitality to its most wounded ally.
    if (b.creature.ability === 'transfusion' && b.hp > 0) {
      let target: Battler | null = null;
      for (const ally of sides[side].team) {
        if (ally === b || ally.hp <= 0 || ally.hp >= ally.maxHp) continue;
        if (!target || ally.maxHp - ally.hp > target.maxHp - target.hp) target = ally;
      }
      if (target) {
        target.hp = Math.min(target.maxHp, target.hp + Math.max(1, Math.floor(target.maxHp / 16)));
        push({
          kind: 'ability',
          actor: side,
          affected: side,
          name: 'Transfusion',
          text: `${b.creature.name} shared its vitality with ${target.creature.name}.`,
        });
      }
    }

    // Leftovers (a relic): the active member nibbles back a sliver of HP each
    // turn. Runs after status ticks, like Regenerator, so it can offset that
    // chip — but never the turn it would otherwise faint.
    if (b.mods.endTurnHeal > 0 && b.hp > 0 && b.hp < b.maxHp) {
      const heal = Math.max(1, Math.floor(b.maxHp * b.mods.endTurnHeal));
      b.hp = Math.min(b.maxHp, b.hp + heal);
      push({
        kind: 'heal',
        actor: side,
        affected: side,
        text: `${b.creature.name} restored a little HP with its Leftovers.`,
        ...snapshot(side),
      });
    }

    if (b.hp <= 0) {
      const survives = handleFaint(side);
      if (!survives) return otherSide(side);
    }
    return 'continue';
  };

  let turns = 0;
  const MAX_TURNS = 200;
  let winner: Side | null = null;

  while (turns < MAX_TURNS && winner === null) {
    turns++;
    const pActive = sides.player.team[sides.player.active];
    const fActive = sides.foe.team[sides.foe.active];

    // Turn order: higher move priority strikes first; otherwise faster Speed,
    // ties broken by a coin flip. Priority is predicted from each side's planned
    // attack (KO-aware) without consuming RNG, so the stream stays stable.
    const pPlan = planAttack(pActive, fActive, sides.player.statMult, sides.foe.statMult);
    const fPlan = planAttack(fActive, pActive, sides.foe.statMult, sides.player.statMult);
    const pPrio = movePriority(pActive, pPlan.move);
    const fPrio = movePriority(fActive, fPlan.move);
    const pSpd = effectiveSpd(pActive, sides.player.statMult);
    const fSpd = effectiveSpd(fActive, sides.foe.statMult);

    let order: Side[];
    if (pPrio !== fPrio) {
      order = pPrio > fPrio ? ['player', 'foe'] : ['foe', 'player'];
    } else if (pSpd === fSpd) {
      order = rng.chance(0.5) ? ['player', 'foe'] : ['foe', 'player'];
    } else {
      order = pSpd > fSpd ? ['player', 'foe'] : ['foe', 'player'];
    }

    for (const side of order) {
      const r = takeTurn(side, side === order[0]);
      if (r !== 'continue') {
        winner = r;
        break;
      }
    }
    if (winner) break;

    for (const side of order) {
      const r = endOfTurnStatus(side);
      if (r !== 'continue') {
        winner = r;
        break;
      }
    }
  }

  if (winner === null) {
    const frac = (s: SideState) =>
      s.team.reduce((acc, b) => acc + Math.max(0, b.hp), 0) /
      s.team.reduce((acc, b) => acc + b.maxHp, 0);
    winner = frac(sides.player) >= frac(sides.foe) ? 'player' : 'foe';
  }

  push({
    kind: 'end',
    winner,
    text:
      winner === 'player' ? 'You won the battle!' : 'Your team was defeated…',
  });

  return { winner, events, turns };
}

// --- Opponent team construction (seeded) --------------------------------

export const TIER_STAT_MULT: Record<string, number> = {
  trainer: 0.9,
  gym: 1.0,
  elite: 1.03,
  special: 1.05, // mini-boss cameo — a notch above a Gym Leader
  champion: 1.08,
};

/**
 * The daily boss's hidden, difficulty-scaled "passive" — never shown to players.
 * It's a flat stat handicap/boost layered on top of the Champion's base tier edge
 * (TIER_STAT_MULT.champion): Easy weakens the boss, Normal leaves it bare, and
 * Hard / Master toughen it by +7.5% / +15%. Applied identically on the client run
 * loop and the server's leaderboard re-sim (see championFoeStatMult), so a win
 * reproduces on both. Only the Champion carries it; every other rung is unchanged.
 */
export const CHAMPION_DIFFICULTY_MULT: Record<Difficulty, number> = {
  easy: 0.9, // a handicap — the boss fights with weaker stats
  normal: 1, // the bare daily Champion
  hard: 1.075, // +7.5%
  master: 1.15, // +15%
};

/**
 * The boss's effective foe stat multiplier for a run difficulty: its base
 * Champion tier edge times the hidden difficulty passive above. Use this for the
 * Champion fight on both client and server so the verified re-sim matches.
 */
export function championFoeStatMult(difficulty: Difficulty): number {
  return (TIER_STAT_MULT.champion ?? 1) * CHAMPION_DIFFICULTY_MULT[difficulty];
}

// "Hero" edge so a well-drafted (and well-recruited) team can realistically run
// the gauntlet. Shared by the client run loop and the server-side leaderboard
// verifier so a win reproduces identically on both. See scripts/sim-check.ts.
export const PLAYER_STAT_MULT = 1.13;

function bst(c: Creature): number {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
}

// Gym/Elite trainers draw from non-legendary/mythical Pokémon (heavy hitters
// like Dragonite are fair game). Legendaries are saved for the Champion.
function trainerPool(dex: Creature[]): Creature[] {
  return dex.filter((c) => c.tier !== 'legendary' && c.tier !== 'mythical');
}

interface SignRollOpts {
  /** Scales celestial-sign odds vs. a player's draft (opponents use 0.5). */
  oddsScale?: number;
  /** Flat chance the whole team fields one swapped-in rare-sign mon. */
  rareTeamChance?: number;
}

// Opponents roll celestial signs at half a player's odds; special-tier cameos
// additionally get a flat chance to field one swapped-in rare-sign mon.
function signOptsForTier(tier: string): SignRollOpts {
  return tier === 'special'
    ? { oddsScale: 0.5, rareTeamChance: 0.05 }
    : { oddsScale: 0.5 };
}

// Opponents get auto-assigned signs with the same variance as the draft, plus a
// flavourful ball so their send-outs feel as lively as the player's.
function assignSigns(
  list: Creature[],
  rng: RNG,
  opts: SignRollOpts = {},
): Creature[] {
  const scale = opts.oddsScale ?? 1;
  const team = list.map((c) => ({
    ...withAbility(withSign(c, rollSign(c.stats, rng, scale)), rollAbility(c.dexId, rng)),
    pokeball: rollOpponentBall(rng),
  }));
  // Special trainers occasionally pack a guaranteed rare-sign mon on top of the
  // per-mon rolls — a beat-them-and-recruit-it reward.
  if (opts.rareTeamChance && team.length > 0 && rng.chance(opts.rareTeamChance)) {
    const i = rng.int(0, team.length - 1);
    team[i] = { ...withSign(team[i], bestRareSign(team[i].stats)), pokeball: team[i].pokeball };
  }
  return team;
}

/** Gym / Elite team: themed around `type`, topped up with off-type mons. The
 *  optional `dex` restricts which species can appear (e.g. selected gens). */
export function buildOpponentTeam(
  type: PokemonType,
  size: number,
  tier: string,
  seed: string,
  dex: Creature[] = CREATURES,
): Creature[] {
  const rng = new RNG(`team:${seed}`);
  const pool = trainerPool(dex);
  const onType = pool.filter((c) => c.types.includes(type));
  const offType = pool.filter((c) => !c.types.includes(type));
  const team = rng.shuffle(onType).slice(0, size);
  if (team.length < size) {
    team.push(...rng.shuffle(offType).slice(0, size - team.length));
  }
  return assignSigns(rng.shuffle(team), rng, signOptsForTier(tier));
}

/**
 * Champion team: a strong, type-diverse squad built from the highest-BST
 * Pokémon, guaranteed to include at least one "special" (legendary / mythical).
 * Seeded by the daily champion seed so it's the same team for
 * everyone that day. The optional `dex` restricts which species can appear (e.g.
 * a gen-locked run), defaulting to the full dex.
 */
export function buildChampionTeam(
  seed: string,
  size: number,
  dex: Creature[] = CREATURES,
): Creature[] {
  const rng = new RNG(`champ-team:${seed}`);
  const byBst = [...dex].sort((a, b) => bst(b) - bst(a));
  const topSpecials = byBst.filter((c) => c.tier !== 'normal').slice(0, 40);
  const topNormals = byBst.filter((c) => c.tier === 'normal').slice(0, 80);

  const chosen: Creature[] = [];
  const usedTypes = new Set<PokemonType>();
  const add = (c: Creature) => {
    chosen.push(c);
    usedTypes.add(c.types[0]);
  };

  // Two powerful specials (type-diverse when possible) — at least one always.
  for (const c of rng.shuffle(topSpecials)) {
    if (chosen.length >= 2) break;
    if (usedTypes.has(c.types[0]) && chosen.length > 0) continue;
    add(c);
  }
  // Fill the rest with strong, type-diverse heavy hitters.
  for (const c of rng.shuffle(topNormals)) {
    if (chosen.length >= size) break;
    if (usedTypes.has(c.types[0])) continue;
    add(c);
  }
  // Top up ignoring type if collisions left us short.
  for (const c of rng.shuffle([...topNormals, ...topSpecials])) {
    if (chosen.length >= size) break;
    if (!chosen.includes(c)) chosen.push(c);
  }

  // The champion is a tough regular trainer for sign purposes: half-odds
  // celestial rolls, no guaranteed rare injection.
  return assignSigns(rng.shuffle(chosen), rng, { oddsScale: 0.5 });
}

/**
 * Famous trainer team (see specials.ts). Villain/gag cameos (James, Team Rocket)
 * field their fixed, hand-picked roster in authored send-out order; known Gym
 * Leaders & Elite Four (Brock, Lorelei…) draw a random `size` subset from their
 * on-theme species pool, so their squad varies run-to-run. Signs/balls are rolled
 * from the seed, like any other foe. On a gen-locked run that filters out the
 * whole roster, we fall back to a type-themed squad so the fight still happens.
 */
export function buildFamousTeam(
  famousId: string,
  fallbackType: PokemonType,
  size: number,
  seed: string,
  dex: Creature[] = CREATURES,
  tier = 'special',
): Creature[] {
  const rng = new RNG(`famous-team:${famousId}:${seed}`);
  // Pool-based leaders draw a random subset of `size`; fixed-roster cameos ignore
  // it and field their authored team. The rng is seeded per battle, so a given
  // run/stage always faces the same draw.
  const roster = famousTeamCreatures(famousId, dex, rng, size);
  if (roster.length === 0) {
    return buildOpponentTeam(fallbackType, Math.max(1, size), tier, seed, dex);
  }
  // Some rungs fix the head-count regardless of the cameo's authored roster — the
  // special slots do this (a 3-mon pre-Gym warm-up, a 6-mon pre-Champion
  // gatekeeper). Pool draws already come back at `size`, so this only bites the
  // fixed-team gag cameos: trim a too-long team in send-out order (keeping its
  // signature leads) or top up a too-short one with on-theme mons, so the slot's
  // size is always honoured.
  let final = roster;
  if (roster.length > size) {
    final = roster.slice(0, size);
  } else if (roster.length < size) {
    const have = new Set(roster.map((c) => c.dexId));
    const filler = buildOpponentTeam(fallbackType, size, tier, `${seed}:fill`, dex)
      .filter((c) => !have.has(c.dexId))
      .slice(0, size - roster.length);
    final = [...roster, ...filler];
  }
  return assignSigns(final, rng, signOptsForTier(tier));
}
