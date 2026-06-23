import type {
  AttackAnim,
  Battler,
  Creature,
  Move,
  PokemonType,
  Side,
  StatusKind,
} from './types';
import { effectiveness } from './typechart';
import { RNG } from './rng';
import { CREATURES, withRole } from './pokemon';
import { attackAnimFor } from './moves';
import { ROLE_SPREAD, rollRole } from './roles';

const LEVEL = 50;

export interface BattleEvent {
  kind:
    | 'sendout'
    | 'move'
    | 'miss'
    | 'hit'
    | 'noeffect'
    | 'status'
    | 'heal'
    | 'statusTick'
    | 'stunned'
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
  winner?: Side;
}

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
  const spread = ROLE_SPREAD[creature.role];
  const maxHp = Math.floor(hpStat(creature.stats.hp) * spread.hp * statMult);
  return { creature, maxHp, hp: maxHp, status: null, statusTurns: 0 };
}

function effectiveAtk(b: Battler, statMult: number): number {
  const spread = ROLE_SPREAD[b.creature.role];
  return Math.floor(otherStat(b.creature.stats.atk) * spread.atk * statMult);
}
function effectiveDef(b: Battler, statMult: number): number {
  const spread = ROLE_SPREAD[b.creature.role];
  return Math.floor(otherStat(b.creature.stats.def) * spread.def * statMult);
}
function effectiveSpd(b: Battler, statMult: number): number {
  const spread = ROLE_SPREAD[b.creature.role];
  const base = otherStat(b.creature.stats.spd) * spread.spd * statMult;
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

function expectedDamage(
  attacker: Battler,
  defender: Battler,
  move: Move,
): number {
  if (move.power <= 0) return 0;
  const stab = hasStab(attacker, move) ? 1.5 : 1;
  const mult = effectiveness(move.type, defender.creature.types);
  return move.power * stab * mult * move.accuracy;
}

function chooseMove(attacker: Battler, defender: Battler, rng: RNG): Move {
  const moves = attacker.creature.moves;

  const healMove = moves.find((mv) => mv.effect?.kind === 'heal');
  if (healMove && attacker.hp / attacker.maxHp < 0.35 && rng.chance(0.6)) {
    return healMove;
  }

  let best: Move | null = null;
  let bestScore = -1;
  for (const mv of rng.shuffle(moves)) {
    const score = expectedDamage(attacker, defender, mv);
    if (score > bestScore) {
      bestScore = score;
      best = mv;
    }
  }
  return best ?? moves[0];
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

  sendOut('player', 0);
  sendOut('foe', 0);

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

    const move = chooseMove(attacker, defender, rng);
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

    // Pure status move (e.g. Will-O-Wisp, Thunder Wave).
    if (
      move.power === 0 &&
      (move.effect?.kind === 'burn' || move.effect?.kind === 'stun')
    ) {
      const immune = effectiveness(move.type, defender.creature.types) === 0;
      if (immune) {
        push({
          kind: 'noeffect',
          actor: side,
          text: `It doesn't affect ${defender.creature.name}…`,
        });
      } else if (defender.status === null) {
        defender.status = move.effect.kind;
        defender.statusTurns = move.effect.kind === 'stun' ? 3 : 4;
        push({
          kind: 'status',
          actor: side,
          affected: otherSide(side),
          status: move.effect.kind,
          text: `${defender.creature.name} ${STATUS_LABEL[move.effect.kind]}!`,
        });
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

    if (
      (move.effect?.kind === 'burn' || move.effect?.kind === 'stun') &&
      defender.status === null &&
      rng.chance(move.effect.chance)
    ) {
      defender.status = move.effect.kind;
      defender.statusTurns = move.effect.kind === 'stun' ? 3 : 4;
      push({
        kind: 'status',
        actor: side,
        affected: otherSide(side),
        status: move.effect.kind,
        text: `${defender.creature.name} ${STATUS_LABEL[move.effect.kind]}!`,
      });
    }

    return 'continue';
  };

  const endOfTurnStatus = (side: Side): 'continue' | Side => {
    const s = sides[side];
    const b = s.team[s.active];
    if (b.hp > 0 && b.status === 'burn') {
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
      if (b.hp <= 0) {
        const survives = handleFaint(side);
        if (!survives) return otherSide(side);
      }
    }
    return 'continue';
  };

  let turns = 0;
  const MAX_TURNS = 200;
  let winner: Side | null = null;

  while (turns < MAX_TURNS && winner === null) {
    turns++;
    const pSpd = effectiveSpd(
      sides.player.team[sides.player.active],
      sides.player.statMult,
    );
    const fSpd = effectiveSpd(
      sides.foe.team[sides.foe.active],
      sides.foe.statMult,
    );
    const order: Side[] =
      pSpd === fSpd
        ? rng.chance(0.5)
          ? ['player', 'foe']
          : ['foe', 'player']
        : pSpd > fSpd
          ? ['player', 'foe']
          : ['foe', 'player'];

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
  champion: 1.1,
};

function bst(c: Creature): number {
  return c.stats.hp + c.stats.atk + c.stats.def + c.stats.spd;
}

// Gym/Elite trainers draw from non-legendary/mythical Pokémon (pseudo-legendaries
// like Dragonite are fair game). Legendaries are saved for the Champion.
function trainerPool(dex: Creature[]): Creature[] {
  return dex.filter((c) => c.tier !== 'legendary' && c.tier !== 'mythical');
}

// Opponents get auto-assigned roles with the same variance as the draft.
function assignRoles(list: Creature[], rng: RNG): Creature[] {
  return list.map((c) => withRole(c, rollRole(c.stats, rng)));
}

/** Gym / Elite team: themed around `type`, topped up with off-type mons. The
 *  optional `dex` restricts which species can appear (e.g. selected gens). */
export function buildOpponentTeam(
  type: PokemonType,
  size: number,
  _tier: string,
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
  return assignRoles(rng.shuffle(team), rng);
}

/**
 * Champion team: a strong, type-diverse squad built from the highest-BST
 * Pokémon, guaranteed to include at least one "special" (legendary / mythical /
 * pseudo-legendary). Seeded by the daily champion seed so it's the same team for
 * everyone that day.
 */
export function buildChampionTeam(seed: string, size: number): Creature[] {
  const rng = new RNG(`champ-team:${seed}`);
  const byBst = [...CREATURES].sort((a, b) => bst(b) - bst(a));
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

  return assignRoles(rng.shuffle(chosen), rng);
}
