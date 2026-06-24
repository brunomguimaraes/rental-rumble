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
} from './types';
import { effectiveness } from './typechart';
import { RNG } from './rng';
import { CREATURES, withSign } from './pokemon';
import { attackAnimFor } from './moves';
import { SIGN_SPREAD, rollSign, bestRareSign } from './zodiac';
import { rollOpponentBall } from './balls';
import { famousTeamCreatures } from './specials';

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

export function makeBattler(creature: Creature, statMult = 1): Battler {
  const spread = SIGN_SPREAD[creature.sign];
  const maxHp = Math.floor(hpStat(creature.stats.hp) * spread.hp * statMult);
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
    stages: { atk: 0, def: 0, spd: 0 },
    pp,
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
  return Math.floor(
    otherStat(b.creature.stats.atk) * spread.atk * statMult * stageMult(b.stages.atk),
  );
}
function effectiveDef(b: Battler, statMult: number): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  return Math.floor(
    otherStat(b.creature.stats.def) * spread.def * statMult * stageMult(b.stages.def),
  );
}
function effectiveSpd(b: Battler, statMult: number): number {
  const spread = SIGN_SPREAD[b.creature.sign];
  const base =
    otherStat(b.creature.stats.spd) * spread.spd * statMult * stageMult(b.stages.spd);
  return b.status === 'stun' ? base * 0.6 : base;
}

function hasStab(b: Battler, move: Move): boolean {
  return b.creature.types.includes(move.type);
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
  const mult = effectiveness(move.type, defender.creature.types);
  if (mult === 0) return 0;
  const atk = effectiveAtk(attacker, atkStatMult);
  const def = effectiveDef(defender, defStatMult);
  const base = (2 * LEVEL) / 5 + 2;
  const raw = (base * move.power * (atk / def)) / 50 + 2;
  const stab = hasStab(attacker, move) ? 1.5 : 1;
  return raw * stab * mult * 0.925 * move.accuracy;
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

const STATUS_RIDER_KINDS = ['burn', 'stun', 'poison', 'sleep', 'confuse'] as const;

function chooseMove(
  attacker: Battler,
  defender: Battler,
  atkStatMult: number,
  defStatMult: number,
  rng: RNG,
): Move {
  const moves = attacker.creature.moves;
  const plan = planAttack(attacker, defender, atkStatMult, defStatMult);

  // Always take a guaranteed KO over anything else.
  if (plan.dmg > 0 && plan.dmg >= defender.hp) return plan.move;

  // Heal when badly hurt — but only while the move still has PP left. Once a
  // wall burns through its limited heals it has to start trading damage, which
  // is what breaks the Chansey-style "we both heal forever" stalemate.
  const healMove = moves.find(
    (mv) => mv.effect?.kind === 'heal' && hasPP(attacker, mv),
  );
  if (healMove && attacker.hp / attacker.maxHp < 0.35 && rng.chance(0.6)) {
    return healMove;
  }

  // Set up when healthy and not already stacked on that stat.
  const setup = moves.find(
    (mv) =>
      mv.power === 0 &&
      mv.effect?.kind === 'stage' &&
      mv.effect.target === 'self',
  );
  if (setup && setup.effect?.kind === 'stage') {
    const cur = attacker.stages[setup.effect.stat];
    if (attacker.hp / attacker.maxHp > 0.6 && cur < 4 && rng.chance(0.4)) {
      return setup;
    }
  }

  // Spread a status onto an as-yet-unafflicted foe.
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

  return plan.move;
}

function damageRoll(
  attacker: Battler,
  defender: Battler,
  move: Move,
  atkStatMult: number,
  defStatMult: number,
  rng: RNG,
): { damage: number; mult: number; crit: boolean } {
  const mult = effectiveness(move.type, defender.creature.types);
  if (mult === 0) return { damage: 0, mult: 0, crit: false };

  const atk = effectiveAtk(attacker, atkStatMult);
  const def = effectiveDef(defender, defStatMult);
  const base = (2 * LEVEL) / 5 + 2;
  const raw = (base * move.power * (atk / def)) / 50 + 2;
  const stab = hasStab(attacker, move) ? 1.5 : 1;
  const crit = rng.chance(0.0625);
  const critMult = crit ? 1.5 : 1;
  const variance = rng.range(0.85, 1);
  const damage = Math.max(
    1,
    Math.floor(raw * stab * mult * critMult * variance),
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
  opts: { playerStatMult?: number; foeStatMult?: number } = {},
): BattleResult {
  const rng = new RNG(seed);
  const playerStatMult = opts.playerStatMult ?? 1;
  const foeStatMult = opts.foeStatMult ?? 1;

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

  const applyStage = (ownerSide: Side, stat: StageStat, delta: number) => {
    const b = sides[ownerSide].team[sides[ownerSide].active];
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
      return;
    }
    b.stages[stat] = after;
    push({
      kind: 'stat',
      actor: ownerSide,
      affected: ownerSide,
      text: `${b.creature.name}'s ${STAGE_LABEL[stat]} ${
        delta > 0 ? 'rose' : 'fell'
      }${Math.abs(delta) >= 2 ? ' sharply' : ''}!`,
    });
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

    // Sleep: snooze for a few turns, then wake.
    if (attacker.status === 'sleep') {
      attacker.statusTurns -= 1;
      if (attacker.statusTurns <= 0) {
        attacker.status = null;
        push({
          kind: 'status',
          actor: side,
          affected: side,
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
      if (attacker.statusTurns <= 0) attacker.status = null;
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

    const move = chooseMove(attacker, defender, me.statMult, foe.statMult, rng);
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

    // Self-heal move.
    if (move.effect?.kind === 'heal') {
      const heal = Math.floor(attacker.maxHp * move.effect.amount);
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

    // Pure setup move: shift the user's (or, rarely, the foe's) stat stages.
    if (move.power === 0 && move.effect?.kind === 'stage') {
      const owner = move.effect.target === 'self' ? side : otherSide(side);
      applyStage(owner, move.effect.stat, move.effect.delta);
      return 'continue';
    }

    // Pure status move (Will-O-Wisp, Thunder Wave, Toxic, Hypnosis, …).
    if (
      move.power === 0 &&
      move.effect &&
      (STATUS_RIDER_KINDS as readonly string[]).includes(move.effect.kind)
    ) {
      const immune = effectiveness(move.type, defender.creature.types) === 0;
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

    defender.hp -= damage;
    push({
      kind: 'hit',
      actor: side,
      affected: otherSide(side),
      moveName: move.name,
      moveType: move.type,
      damage,
      mult,
      crit,
      text: crit ? 'A critical hit!' : '',
      ...snapshot(otherSide(side)),
    });

    if (move.effect?.kind === 'lifesteal' && damage > 0) {
      const drained = Math.floor(damage * move.effect.fraction);
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
      if (!survives) return side;
      return 'continue';
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
        applyStage(
          eff.target === 'self' ? side : otherSide(side),
          eff.stat,
          eff.delta,
        );
      }
    }

    return 'continue';
  };

  const endOfTurnStatus = (side: Side): 'continue' | Side => {
    const s = sides[side];
    const b = s.team[s.active];
    if (b.hp <= 0) return 'continue';

    if (b.status === 'burn') {
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
      b.statusTurns -= 1;
      if (b.statusTurns <= 0) b.status = null;
    } else if (b.status === 'poison') {
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
      b.toxicCounter += 1;
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

// Gym/Elite trainers draw from non-legendary/mythical Pokémon (pseudo-legendaries
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
    ...withSign(c, rollSign(c.stats, rng, scale)),
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
 * Pokémon, guaranteed to include at least one "special" (legendary / mythical /
 * pseudo-legendary). Seeded by the daily champion seed so it's the same team for
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
