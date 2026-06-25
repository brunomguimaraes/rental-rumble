import type {
  AttackAnim,
  Battler,
  Creature,
  Move,
  PokemonType,
  Sign,
  Side,
  StageStat,
  StatusKind,
} from './types.js';
import type { Difficulty } from './run.js';
import { effectiveness } from './typechart.js';
import { RNG } from './rng.js';
import { CREATURES, withSign, withAbility, SHINY_STAT_MULT } from './pokemon.js';
import { rollAbility } from './abilities.js';
import { attackAnimFor, HEAL_DECAY, TAUNT_TURNS } from './moves.js';
import { SIGN_SPREAD, rollSign, bestRareSign } from './zodiac.js';
import { rollOpponentBall } from './balls.js';
import { famousTeamCreatures } from './specials.js';

const LEVEL = 50;

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

export function makeBattler(creature: Creature, statMult = 1): Battler {
  const spread = SIGN_SPREAD[creature.sign];
  const mult = statMult * shinyMult(creature);
  const maxHp = Math.floor(hpStat(creature.stats.hp) * spread.hp * mult);
  const pp: Record<string, number> = {};
  for (const mv of creature.moves) {
    if (mv.pp !== undefined) pp[mv.name] = mv.pp;
  }
  return {
    creature,
    maxHp,
    hp: maxHp,
    status: null,
    statusTurns: 0,
    toxicCounter: 0,
    confusion: 0,
    taunted: 0,
    stages: { atk: 0, def: 0, spd: 0 },
    pp,
    healsUsed: 0,
    loafing: false,
  };
}

/** True if `attacker` may still use `move` this battle (respects PP caps). */
function hasPP(attacker: Battler, move: Move): boolean {
  return move.pp === undefined || (attacker.pp[move.name] ?? 0) > 0;
}

// Classic Pokémon stat-stage curve: +1 = 1.5×, +2 = 2×, … and the inverse on
// the way down. Clamped to ±6.
function stageMult(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

function effectiveAtk(b: Battler, statMult: number): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  const mult = statMult * shinyMult(b.creature);
  // Guts: a status condition that would normally hamper it instead fires it up,
  // boosting Attack by half while burned / poisoned / paralyzed / asleep.
  const guts = b.status !== null && b.creature.ability === 'guts' ? 1.5 : 1;
  return Math.floor(
    otherStat(b.creature.stats.atk) * spread.atk * mult * stageMult(b.stages.atk) * guts,
  );
}
function effectiveDef(b: Battler, statMult: number): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  const mult = statMult * shinyMult(b.creature);
  // Marvel Scale: a status condition that would normally be a liability instead
  // toughens its hide, raising Defense by half — the defensive mirror of Guts.
  const marvel =
    b.status !== null && b.creature.ability === 'marvel-scale' ? 1.5 : 1;
  return Math.floor(
    otherStat(b.creature.stats.def) * spread.def * mult * stageMult(b.stages.def) * marvel,
  );
}
function effectiveSpd(b: Battler, statMult: number): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  const mult = statMult * shinyMult(b.creature);
  const base =
    otherStat(b.creature.stats.spd) * spread.spd * mult * stageMult(b.stages.spd);
  // Quick Feet: a status condition fires its nerves up rather than slowing it —
  // Speed jumps by half and the usual paralysis slowdown is ignored entirely.
  if (b.creature.ability === 'quick-feet') {
    return b.status !== null ? base * 1.5 : base;
  }
  return b.status === 'stun' ? base * 0.6 : base;
}

function hasStab(b: Battler, move: Move): boolean {
  return b.creature.types.includes(move.type);
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
function typeMult(move: Move, defender: Battler): number {
  if (defender.creature.ability === 'levitate' && move.type === 'ground') {
    return 0;
  }
  return effectiveness(move.type, defender.creature.types);
}

// Flat damage multiplier from the ATTACKER's ability for a given move:
//   - the starter pinch boosts (Blaze/Torrent/Overgrow/Swarm) rally a matching
//     STAB type to 1.5× once HP is at or below a third, and
//   - Technician wrings 1.5× out of any move of 60 power or less.
// Returns 1 for a mon without a damage-shaping ability, so ordinary fights are
// byte-identical.
function attackAbilityMult(attacker: Battler, move: Move): number {
  let m = 1;
  const ability = attacker.creature.ability;
  if (attacker.hp <= attacker.maxHp / 3) {
    if (
      (ability === 'blaze' && move.type === 'fire') ||
      (ability === 'torrent' && move.type === 'water') ||
      (ability === 'overgrow' && move.type === 'grass') ||
      (ability === 'swarm' && move.type === 'bug')
    ) {
      m *= 1.5;
    }
  }
  if (ability === 'technician' && move.power > 0 && move.power <= 60) m *= 1.5;
  return m;
}

// Flat damage multiplier from the DEFENDER's ability: Thick Fat's blubber halves
// the sting of Fire and Ice attacks. 1 otherwise.
function defendAbilityMult(defender: Battler, move: Move): number {
  if (
    defender.creature.ability === 'thick-fat' &&
    (move.type === 'fire' || move.type === 'ice')
  ) {
    return 0.5;
  }
  return 1;
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
  const atk = effectiveAtk(attacker, atkStatMult);
  const def = effectiveDef(defender, defStatMult);
  const base = (2 * LEVEL) / 5 + 2;
  const raw = (base * move.power * (atk / def)) / 50 + 2;
  const stab = hasStab(attacker, move) ? stabMult(attacker) : 1;
  const abil = attackAbilityMult(attacker, move) * defendAbilityMult(defender, move);
  return raw * stab * mult * abil * 0.925 * move.accuracy;
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
    if (mv.power <= 0) continue;
    const d = estimateDamage(attacker, defender, mv, atkStatMult, defStatMult);
    if (d > bestDmg) {
      bestDmg = d;
      best = mv;
    }
  }
  // If a priority move already secures the KO, lead with it to strike first.
  if (best) {
    for (const mv of attacker.creature.moves) {
      if ((mv.priority ?? 0) > 0) {
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
 * Pick a damaging move, optionally with a bit of randomness instead of always
 * locking onto the single best one. Each damaging move is weighted by its
 * estimated damage raised to `focus`, so strong moves stay heavily favored while
 * weaker ones still get thrown now and then. A non-finite `focus` means perfect
 * play: it returns the precomputed best move (`fallback`) outright. Status/setup/
 * heal decisions and guaranteed-KO handling live in chooseMove; this only varies
 * the honest hit.
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
  // Perfect play: the best damaging move is already in `fallback` (plan.move).
  if (!Number.isFinite(focus)) return fallback;

  const options: { move: Move; weight: number }[] = [];
  let total = 0;
  for (const mv of attacker.creature.moves) {
    if (mv.power <= 0) continue;
    const d = estimateDamage(attacker, defender, mv, atkStatMult, defStatMult);
    if (d <= 0) continue;
    const weight = focus <= 0 ? 1 : d ** focus;
    options.push({ move: mv, weight });
    total += weight;
  }
  if (options.length === 0) return fallback;
  if (options.length === 1) return options[0].move;

  let roll = rng.range(0, total);
  for (const opt of options) {
    roll -= opt.weight;
    if (roll <= 0) return opt.move;
  }
  return options[options.length - 1].move;
}

const STATUS_RIDER_KINDS = ['burn', 'stun', 'poison', 'sleep', 'confuse'] as const;

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
      attacker.hp / attacker.maxHp > 0.6 &&
      rng.chance(0.4) &&
      stagedStats(setup).some((st) => attacker.stages[st] < 4)
    ) {
      return setup;
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

  // Spread a status onto an as-yet-unafflicted foe.
  if (!taunted) {
    const statusMove = moves.find(
      (mv) =>
        mv.power === 0 &&
        mv.effect !== undefined &&
        (STATUS_RIDER_KINDS as readonly string[]).includes(mv.effect.kind),
    );
    if (
      statusMove &&
      defender.status === null &&
      defender.confusion === 0 &&
      rng.chance(0.35)
    ) {
      return statusMove;
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
): { damage: number; mult: number; crit: boolean } {
  const mult = typeMult(move, defender);
  if (mult === 0) return { damage: 0, mult: 0, crit: false };

  const atk = effectiveAtk(attacker, atkStatMult);
  const def = effectiveDef(defender, defStatMult);
  const base = (2 * LEVEL) / 5 + 2;
  const raw = (base * move.power * (atk / def)) / 50 + 2;
  const stab = hasStab(attacker, move) ? stabMult(attacker) : 1;
  let abil = attackAbilityMult(attacker, move) * defendAbilityMult(defender, move);
  // Tinted Lens: lenses sharpen a resisted hit, doubling it so a "not very
  // effective" attack lands at full strength instead.
  if (attacker.creature.ability === 'tinted-lens' && mult > 0 && mult < 1) {
    abil *= 2;
  }
  // Solid Rock: a rugged frame cushions a super-effective blow to 0.75×.
  if (defender.creature.ability === 'solid-rock' && mult > 1) {
    abil *= 0.75;
  }
  // Multiscale: untouched and at full HP, a protective veil halves the first hit.
  if (defender.creature.ability === 'multiscale' && defender.hp >= defender.maxHp) {
    abil *= 0.5;
  }
  // Draw the crit regardless so the RNG stream stays identical; Battle Armor then
  // simply seals it shut.
  let crit = rng.chance(0.0625);
  if (defender.creature.ability === 'battle-armor') crit = false;
  const critMult = crit ? 1.5 : 1;
  const variance = rng.range(0.85, 1);
  const damage = Math.max(
    1,
    Math.floor(raw * stab * mult * abil * critMult * variance),
  );
  return { damage, mult, crit };
}

const STATUS_LABEL: Record<Exclude<StatusKind, null>, string> = {
  burn: 'was burned',
  stun: 'is paralyzed',
  poison: 'was badly poisoned',
  sleep: 'fell asleep',
};

const STAGE_LABEL: Record<StageStat, string> = {
  atk: 'Attack',
  def: 'Defense',
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
  } = {},
): BattleResult {
  const rng = new RNG(seed);
  const playerStatMult = opts.playerStatMult ?? 1;
  const foeStatMult = opts.foeStatMult ?? 1;
  // The player's team always plays at the default focus; only the foe's move
  // picking sharpens (Master) or loosens (Easy) with the run difficulty.
  const moveFocus: Record<Side, number> = {
    player: AI_FOCUS_DEFAULT,
    foe: foeMoveFocus(opts.difficulty),
  };

  const sides: Record<Side, SideState> = {
    player: {
      team: playerTeam.map((c) => makeBattler(c, playerStatMult)),
      active: 0,
      statMult: playerStatMult,
    },
    foe: {
      team: foeTeam.map((c) => makeBattler(c, foeStatMult)),
      active: 0,
      statMult: foeStatMult,
    },
  };

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
    // Vital Spirit: the species is too wired to ever fall asleep.
    if (kind === 'sleep' && t.creature.ability === 'vital-spirit') return false;
    t.status = kind;
    if (kind === 'stun') t.statusTurns = 3;
    else if (kind === 'burn') t.statusTurns = 4;
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
    return true;
  };

  const applyConfuse = (targetSide: Side): boolean => {
    const t = sides[targetSide].team[sides[targetSide].active];
    if (t.confusion > 0) return false;
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
    delta: number,
    // Where the change came from: a self-inflicted buff/drop ('self') or one
    // forced on it by the opponent ('opponent'). Only opponent-forced drops feed
    // Clear Body (which blocks them) and Defiant (which retaliates).
    source: 'self' | 'opponent' = 'self',
  ) => {
    const b = sides[ownerSide].team[sides[ownerSide].active];
    const enemyDrop = source === 'opponent' && delta < 0;
    // Clear Body: keeps its cool — an opponent simply cannot lower its stats.
    if (enemyDrop && b.creature.ability === 'clear-body') {
      push({
        kind: 'ability',
        actor: ownerSide,
        affected: ownerSide,
        name: 'Clear Body',
        text: `${b.creature.name}'s Clear Body prevents stat loss!`,
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
    if (enemyDrop && b.creature.ability === 'defiant') {
      push({
        kind: 'ability',
        actor: ownerSide,
        affected: ownerSide,
        name: 'Defiant',
        text: `${b.creature.name}'s Defiant flared up!`,
      });
      applyStage(ownerSide, 'atk', 2);
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
    // Intimidate: striding in, it cows whoever's across from it and saps a stage
    // of Attack — a defensive tempo-swing that re-triggers on every send-out, so
    // a fresh Intimidate body softens the foe each time it enters.
    if (b.creature.ability === 'intimidate') {
      const opp = otherSide(side);
      const t = sides[opp].team[sides[opp].active];
      if (t.hp > 0) {
        push({
          kind: 'ability',
          actor: side,
          affected: opp,
          name: 'Intimidate',
          text: `${b.creature.name} intimidates ${t.creature.name}!`,
        });
        applyStage(opp, 'atk', -1, 'opponent');
      }
    }
  };

  // The opponent leads off, then you answer — the classic battle-start beat.
  sendOut('foe', 0);
  sendOut('player', 0);

  const handleFaint = (side: Side): boolean => {
    const s = sides[side];
    const b = s.team[s.active];
    push({
      kind: 'faint',
      actor: side,
      affected: side,
      index: s.active,
      name: b.creature.name,
      text: `${side === 'player' ? '' : 'Foe '}${b.creature.name} fainted!`,
    });
    const next = aliveIndex(s);
    if (next === -1) return false;
    sendOut(side, next);
    return true;
  };

  const takeTurn = (side: Side): 'continue' | Side => {
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

    // Sleep: snooze for a few turns, then wake.
    if (attacker.status === 'sleep') {
      attacker.statusTurns -= 1;
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
        const dmg = Math.max(1, Math.floor((base * 40 * (atk / def)) / 50 + 2));
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
      attacker.pp[move.name] = (attacker.pp[move.name] ?? move.pp) - 1;
    }
    push({
      kind: 'move',
      actor: side,
      moveName: move.name,
      moveType: move.type,
      moveAnim: attackAnimFor(move),
      text: `${attacker.creature.name} used ${move.name}!`,
    });

    if (!rng.chance(move.accuracy)) {
      push({ kind: 'miss', actor: side, text: 'But it missed!' });
      return 'continue';
    }

    // Self-heal move. Diminishing returns: each successive heal this battle
    // restores HEAL_DECAY as much as the last, so two healers can't trade
    // near-full Recovers into a stalemate (see Battler.healsUsed / HEAL_DECAY).
    if (move.effect?.kind === 'heal') {
      const amount = move.effect.amount * HEAL_DECAY ** attacker.healsUsed;
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
        const survives = handleFaint(otherSide(side));
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

    // Damaging move.
    const { damage, mult, crit } = damageRoll(
      attacker,
      defender,
      move,
      me.statMult,
      foe.statMult,
      rng,
    );

    if (mult === 0) {
      push({
        kind: 'noeffect',
        actor: side,
        text: `It doesn't affect ${defender.creature.name}…`,
      });
      return 'continue';
    }

    // Sturdy: at full health it braces against a knockout blow, clinging to a
    // single HP instead of fainting. A one-time safety net (it must be at full
    // HP for it to kick in), not a permanent wall.
    const sturdyHold =
      defender.creature.ability === 'sturdy' &&
      defender.hp === defender.maxHp &&
      damage >= defender.hp;
    const dealt = sturdyHold ? defender.hp - 1 : damage;
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

    if (move.effect?.kind === 'lifesteal' && dealt > 0) {
      const drained = Math.floor(dealt * move.effect.fraction);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + drained);
      push({
        kind: 'heal',
        actor: side,
        affected: side,
        text: `${attacker.creature.name} drained energy!`,
        ...snapshot(side),
      });
    }

    if (defender.hp <= 0) {
      const survives = handleFaint(otherSide(side));
      // Moxie: emboldened by the knockout, the attacker's Attack rises a stage —
      // letting a sweeper build momentum as it cuts through the foe's team. (No
      // point once the battle's already won, so only while the fight continues.)
      if (survives && attacker.hp > 0 && attacker.creature.ability === 'moxie') {
        applyStage(side, 'atk', 1);
      }
      if (!survives) return side;
      return 'continue';
    }

    // Body-hazard abilities: a defender that takes the hit and lives can punish
    // its attacker with a status (Static paralyzes, Flame Body burns, Poison
    // Point badly poisons) — making it risky to keep swinging at it.
    const onHitStatus: Exclude<StatusKind, null> | null =
      defender.creature.ability === 'static'
        ? 'stun'
        : defender.creature.ability === 'flame-body'
          ? 'burn'
          : defender.creature.ability === 'poison-point'
            ? 'poison'
            : null;
    if (
      onHitStatus &&
      dealt > 0 &&
      attacker.hp > 0 &&
      attacker.status === null &&
      rng.chance(0.3)
    ) {
      applyStatus(side, onHitStatus);
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

    // Rough Skin: the attacker tears itself on the barbed hide, recoiling for a
    // chip of its own HP. That recoil can itself be the knockout blow.
    if (defender.creature.ability === 'rough-skin' && dealt > 0 && attacker.hp > 0) {
      const recoil = Math.max(1, Math.floor(attacker.maxHp / 8));
      attacker.hp -= recoil;
      push({
        kind: 'ability',
        actor: otherSide(side),
        affected: side,
        name: 'Rough Skin',
        text: `${attacker.creature.name} was hurt by Rough Skin!`,
        ...snapshot(side),
      });
      if (attacker.hp <= 0) {
        const survives = handleFaint(side);
        if (!survives) return otherSide(side);
        return 'continue';
      }
    }

    // On-hit rider effects: a status, confusion, or a stat-stage shift.
    const eff = move.effect;
    if (eff) {
      if (
        (eff.kind === 'burn' ||
          eff.kind === 'stun' ||
          eff.kind === 'poison' ||
          eff.kind === 'sleep') &&
        rng.chance(eff.chance)
      ) {
        applyStatus(otherSide(side), eff.kind);
      } else if (eff.kind === 'confuse' && rng.chance(eff.chance)) {
        applyConfuse(otherSide(side));
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

    return 'continue';
  };

  const endOfTurnStatus = (side: Side): 'continue' | Side => {
    const s = sides[side];
    const b = s.team[s.active];
    if (b.hp <= 0) return 'continue';

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

    // Magic Guard: indirect harm rolls off — burn and poison still tick down and
    // expire, they just never sap any HP.
    const magicGuard = b.creature.ability === 'magic-guard';

    if (b.status === 'burn') {
      if (!magicGuard) {
        const dmg = Math.max(1, Math.floor(b.maxHp / 12));
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
        const dmg = Math.max(1, Math.floor((b.maxHp * b.toxicCounter) / 16));
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
    const pPrio =
      planAttack(pActive, fActive, sides.player.statMult, sides.foe.statMult)
        .move.priority ?? 0;
    const fPrio =
      planAttack(fActive, pActive, sides.foe.statMult, sides.player.statMult)
        .move.priority ?? 0;
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
      const r = takeTurn(side);
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
  elite: 1.05,
  special: 1.05, // mini-boss cameo — a notch above a Gym Leader
  champion: 1.1,
};

// "Hero" edge so a well-drafted (and well-recruited) team can realistically run
// the gauntlet. Shared by the client run loop and the server-side leaderboard
// verifier so a win reproduces identically on both. See scripts/sim-check.ts.
export const PLAYER_STAT_MULT = 1.13;

function bst(c: Creature): number {
  return c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd;
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
  return assignSigns(roster, rng, signOptsForTier(tier));
}
