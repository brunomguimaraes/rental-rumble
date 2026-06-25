import type {
  AbilityId,
  AbilityPassiveFlags,
  Battler,
  Creature,
  Move,
  OpponentTier,
  PokemonType,
  Side,
  StageStat,
  StatusKind,
} from './types.js';
import { moveCategory } from './moves.js';

/** Whether any team member carries a given ability. */
export function teamHasAbility(team: readonly Creature[], id: AbilityId): boolean {
  return team.some((c) => c.ability === id);
}

export function defaultAbilityPassive(): AbilityPassiveFlags {
  return {
    clearBody: false,
    ignoreIntimidate: false,
    whiteSmoke: false,
    filterDown: false,
    immuneTaunt: false,
    longReach: false,
    noGuard: false,
  };
}

/** Scales celestial sign odds when Diviner is on the team. */
export function celestialOddsScale(
  team: readonly { ability?: AbilityId }[] | undefined,
  base = 1,
): number {
  return team?.some((c) => c.ability === 'diviner') ? base * 1.5 : base;
}

/** Relic offer count — Curator adds one choice. */
export function relicOfferCountForTeam(team: readonly Creature[], base = 3): number {
  return teamHasAbility(team, 'curator') ? base + 1 : base;
}

/** Extra item events when Treasure Hound is on the team. */
export function treasureHoundBonus(team: readonly Creature[]): number {
  return teamHasAbility(team, 'treasure-hound') ? 1 : 0;
}

/** Player stat mult when Veteran faces gym-tier or stronger foes. */
export function veteranStatMult(team: readonly Creature[], foeTier?: OpponentTier): number {
  if (!foeTier || foeTier === 'trainer') return 1;
  return teamHasAbility(team, 'veteran') ? 1.05 : 1;
}

const PINCH_ABILITIES: Partial<Record<AbilityId, PokemonType>> = {
  'gale-force': 'flying',
  'sand-rush': 'ground',
  'snow-cloak': 'ice',
  'volt-fury': 'electric',
  'shadow-rush': 'ghost',
  'steel-heart': 'steel',
  'fairy-wrath': 'fairy',
  'rebel-spirit': 'fighting',
};

/** Roster-wide ability modifiers baked at fight start. */
export function applyRosterAbilities(team: Battler[]): void {
  const has = (id: AbilityId) => team.some((b) => b.creature.ability === id);

  if (has('glory-hog')) {
    for (const b of team) {
      b.teamFactor *= b.creature.ability === 'glory-hog' ? 1.15 : 0.9;
    }
  }
  if (has('dragonlord')) {
    for (const b of team) {
      if (b.creature.types.includes('dragon')) b.teamFactor *= 1.1;
    }
  }
  if (has('flame-emperor')) {
    for (const b of team) {
      if (b.creature.types.includes('fire')) b.teamFactor *= 1.1;
    }
  }
  if (has('tide-matriarch')) {
    for (const b of team) {
      if (b.creature.types.includes('water')) b.teamFactor *= 1.08;
    }
  }
  if (has('iron-marshal')) {
    for (const b of team) {
      if (b.creature.types.includes('steel')) b.damageTakenMult *= 0.92;
    }
  }
  if (has('fairy-court')) {
    for (const b of team) {
      if (b.creature.types.includes('fairy')) {
        b.damageDealtMult *= 1.08;
        b.abilityPassive.clearBody = true;
      }
    }
  }
  if (has('pack-alpha')) {
    for (const b of team) {
      if (b.creature.types.includes('fighting')) {
        b.teamFactor *= 1.1;
        b.abilityPassive.ignoreIntimidate = true;
      }
    }
  }
  if (has('hive-queen')) {
    const bugs = team.filter((b) => b.creature.types.includes('bug')).length;
    if (bugs >= 2) {
      for (const b of team) b.teamFactor *= 1.06;
    }
  }
  if (has('cocoon-guard')) {
    for (const b of team) b.damageTakenMult *= 0.95;
  }
  // --- Gen I type commanders ---
  if (has('stone-council')) {
    for (const b of team) if (b.creature.types.includes('rock')) b.damageTakenMult *= 0.9;
  }
  if (has('den-mother')) {
    for (const b of team) if (b.creature.types.includes('normal')) b.damageTakenMult *= 0.92;
  }
  if (has('earth-warden')) {
    for (const b of team) if (b.creature.types.includes('ground')) b.teamFactor *= 1.08;
  }
  if (has('permafrost')) {
    for (const b of team) if (b.creature.types.includes('ice')) b.damageDealtMult *= 1.1;
  }
  if (has('toxic-crown')) {
    for (const b of team) if (b.creature.types.includes('poison')) b.damageDealtMult *= 1.1;
  }
}

export function slowStartStatMult(b: Battler): number {
  if (b.creature.ability !== 'slow-start') return 1;
  return b.actedTurns < 2 ? 0.8 : 1.12;
}

export function sharesType(a: Creature, b: Creature): boolean {
  return a.types.some((t) => b.types.includes(t));
}

/** Extra type-chart multiplier from Wonder Guard / Sheer Cold / Color Change. */
export function abilityTypeMult(
  move: Move,
  defender: Battler,
  baseMult: number,
): number {
  const d = defender.creature.ability;
  if (d === 'wonder-guard' && baseMult <= 1) return 0;
  if (d === 'color-change' && defender.colorResistType === move.type) return baseMult * 0.85;
  if (d === 'sheer-cold' && move.type === 'ice' && baseMult > 0 && baseMult < 1) {
    return 1;
  }
  return baseMult;
}

/** Damage multiplier from attacker abilities (after STAB, before relics). */
export function extraAttackDamageMult(
  attacker: Battler,
  defender: Battler,
  move: Move,
  team: readonly Battler[],
): number {
  let m = 1;
  const a = attacker.creature.ability;
  const hpPinch = attacker.hp <= attacker.maxHp / 3;

  if (hpPinch && a && PINCH_ABILITIES[a] === move.type) m *= 1.5;
  if (a === 'blaze' && hpPinch && move.type === 'fire') m *= 1.5;
  if (a === 'torrent' && hpPinch && move.type === 'water') m *= 1.5;
  if (a === 'overgrow' && hpPinch && move.type === 'grass') m *= 1.5;
  if (a === 'swarm' && hpPinch && move.type === 'bug') m *= 1.5;

  if (a === 'technician' && move.power > 0 && move.power <= 60) m *= 1.5;
  if (a === 'flash-fire' && attacker.flashFire && move.type === 'fire') m *= 1.5;
  if (a === 'glass-cannon') m *= 1.3;
  if (a === 'last-stand') m *= 1 + 0.5 * (1 - attacker.hp / attacker.maxHp);
  if (a === 'heavy-hitter' && move.power >= 90) m *= 1.15;
  if (a === 'finisher' && defender.hp * 10 <= defender.maxHp * 3) m *= 1.25;
  if (a === 'opportunist' && defender.status !== null) m *= 1.15;
  if (a === 'showboat' && Object.values(attacker.stages).some((s) => s > 0)) m *= 1.12;
  if (a === 'underdog' && Object.values(attacker.stages).some((s) => s < 0)) m *= 1.15;
  if (a === 'rival' && sharesType(attacker.creature, defender.creature)) m *= 1.12;
  if (a === 'predator' && !sharesType(attacker.creature, defender.creature)) m *= 1.1;
  if (a === 'opening-act' && !attacker.openingActUsed) m *= 1.25;
  if (a === 'pacifist' && move.power > 0) m *= 0.95;
  if (a === 'sheer-cold' && move.type === 'ice') m *= 1.1;
  if (a === 'toxic-boost' && attacker.status === 'poison') m *= 1.3;
  if (attacker.torchPassTurns > 0 && move.type === 'fire') m *= 1.25;

  if (
    attacker.creature.types.includes('dark') &&
    team.some((b) => b.creature.ability === 'shadow-cabinet') &&
    defender.status !== null
  ) {
    m *= 1.12;
  }
  if (
    attacker.creature.types.includes('electric') &&
    team.some((b) => b.creature.ability === 'volt-squad') &&
    move.type === 'electric'
  ) {
    m *= 1.1;
  }

  // --- Gen I signatures (attacker-side) ---
  if (a === 'roaring-flame' && move.type === 'fire' && attacker.hp > attacker.maxHp / 2) m *= 1.5;
  if (a === 'deluge' && move.type === 'water') m *= 1.1;
  if (a === 'magma' && move.type === 'ground') m *= 1.1;
  if (a === 'cannoneer' && defender.stages.def > 0) m *= 1 + 0.12 * Math.min(defender.stages.def, 3);
  if (a === 'giant-slayer' && defender.maxHp > attacker.maxHp) m *= 1.2;
  if (a === 'momentum' && move.power > 0) m *= 1 + 0.06 * Math.min(attacker.actedTurns, 5);
  if (a === 'cheek-pouch' && !attacker.cheekPouchUsed && move.type === 'electric') m *= 1.8;
  if (a === 'corrosion' && defender.status === 'poison') m *= 1.1;
  if (attacker.avengeName !== null && attacker.avengeName === defender.creature.name) m *= 1.2;
  if (
    attacker.creature.types.includes('psychic') &&
    moveCategory(move) === 'energy' &&
    team.some((b) => b.creature.ability === 'psi-network')
  ) {
    m *= 1.1;
  }
  if (
    attacker.creature.types.includes('ghost') &&
    defender.status !== null &&
    team.some((b) => b.creature.ability === 'wraith-choir')
  ) {
    m *= 1.12;
  }

  if (move.effect?.kind === 'recoil' && a === 'reckless') m *= 1.25;

  return m * attacker.damageDealtMult;
}

/** Damage taken multiplier from defender abilities. */
export function extraDefendDamageMult(defender: Battler, move: Move, typeEff: number): number {
  let m = 1;
  const d = defender.creature.ability;
  if (d === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) m *= 0.5;
  if (d === 'heatproof' && move.type === 'fire') m *= 0.5;
  if (d === 'dry-skin' && move.type === 'fire') m *= 1.25;
  if (d === 'glass-cannon') m *= 1.2;
  if (d === 'filter' && typeEff > 1) m *= 0.85;
  if (d === 'solid-rock' && typeEff > 1) m *= 0.75;
  if (d === 'fur-coat') {
    const cat = moveCategory(move);
    if (cat === 'physical') m *= 0.75;
    if (cat === 'energy') m *= 1.2;
  }
  // Counterweight: the more it braces (raised Defense), the less a hit lands.
  if (d === 'counterweight' && defender.stages.def > 0) {
    m *= 1 - 0.08 * Math.min(defender.stages.def, 3);
  }
  // Jinx: a hexed battler takes extra damage until the curse wears off.
  if (defender.hexTurns > 0) m *= 1.1;
  return m * defender.damageTakenMult;
}

export function gravityDamageMult(active: Battler[]): number {
  return active.some((b) => b.creature.ability === 'gravity' && b.hp > 0) ? 1.08 : 1;
}

export function movePriority(attacker: Battler, move: Move): number {
  let p = move.priority ?? 0;
  if (attacker.creature.ability === 'prankster' && move.power === 0) p += 1;
  return p;
}

export function effectiveAccuracy(attacker: Battler, defender: Battler, move: Move): number {
  if (
    attacker.abilityPassive.noGuard ||
    defender.abilityPassive.noGuard ||
    attacker.creature.ability === 'no-guard' ||
    defender.creature.ability === 'no-guard'
  ) {
    return 1;
  }
  // Tempest: a living storm — its own attacks simply never miss.
  if (attacker.creature.ability === 'tempest') return 1;
  let acc = move.accuracy;
  if (attacker.creature.ability === 'hustle' && move.power > 0) acc *= 0.8;
  if (attacker.creature.ability === 'compound-eyes') acc *= 1.15;
  if (attacker.creature.ability === 'pacifist' && move.power === 0) acc *= 1.2;
  if (defender.creature.ability === 'trickster' && move.effect?.kind === 'confuse') acc *= 1.5;
  return acc;
}

export function critChance(attacker: Battler, defender: Battler): number {
  let c = 0.0625;
  if (attacker.creature.ability === 'super-luck') c *= 1.5;
  if (defender.creature.ability === 'battle-armor') return 0;
  return c;
}

export function critDamageMult(attacker: Battler): number {
  if (attacker.creature.ability === 'sniper') return 2.25;
  if (attacker.creature.ability === 'super-luck') return 1.5 * 1.2;
  return 1.5;
}

export function isContactHit(attacker: Battler, move: Move): boolean {
  if (attacker.abilityPassive.longReach || attacker.creature.ability === 'long-reach') {
    return false;
  }
  return move.power > 0 && moveCategory(move) === 'physical';
}

export function statusEffectChanceMult(
  attacker: Battler,
  defender: Battler,
  kind: string,
): number {
  let m = 1;
  if (defender.statusSusceptMult > 1) m *= defender.statusSusceptMult;
  if (attacker.creature.ability === 'trickster' && kind === 'confuse') m *= 1.5;
  if (attacker.creature.ability === 'wild-card') m *= 1.3;
  if (defender.creature.ability === 'shield-dust') m *= 0.5;
  return m;
}

export function flareBoostEnergyMult(b: Battler): number {
  return b.creature.ability === 'flare-boost' && b.status === 'burn' ? 1.3 : 1;
}

/** Entry abilities when a battler is sent out (after the sendout event). */
export function applyEntryAbilities(
  side: 'player' | 'foe',
  b: Battler,
  opp: Battler,
  roster: readonly Creature[],
  applyStage: (side: 'player' | 'foe', stat: StageStat, delta: number, who?: 'self' | 'opponent') => void,
  applyConfuse: (side: 'player' | 'foe') => boolean,
  pushAbility: (name: string, text: string, actor: 'player' | 'foe', affected: 'player' | 'foe') => void,
  rng: { chance: (p: number) => boolean; int: (lo: number, hi: number) => number },
): void {
  const a = b.creature.ability;
  const oppSide = side === 'player' ? 'foe' : 'player';

  if (a === 'intimidate' && opp.hp > 0) {
    if (opp.abilityPassive.ignoreIntimidate || opp.creature.ability === 'inner-focus') {
      pushAbility('Inner Focus', `${opp.creature.name} shrugged off the intimidation!`, oppSide, oppSide);
    } else {
      pushAbility('Intimidate', `${b.creature.name} intimidates ${opp.creature.name}!`, side, oppSide);
      applyStage(oppSide, 'atk', -1, 'opponent');
    }
  }
  if (a === 'daunt' && opp.hp > 0) {
    pushAbility('Daunt', `${b.creature.name} unnerves ${opp.creature.name}!`, side, oppSide);
    applyStage(oppSide, 'spd', -1, 'opponent');
  }
  if (a === 'screech' && opp.hp > 0) {
    pushAbility('Screech', `${b.creature.name} screeches at ${opp.creature.name}!`, side, oppSide);
    applyStage(oppSide, 'def', -1, 'opponent');
  }
  if (a === 'eerie-aura' && opp.hp > 0) {
    opp.statusSusceptMult = 1.25;
    opp.statusSuspectTurns = 3;
    pushAbility('Eerie Aura', `${b.creature.name}'s aura unsettles ${opp.creature.name}!`, side, oppSide);
  }
  if (a === 'swagger-king' && opp.hp > 0) {
    applyStage(oppSide, 'atk', 1, 'opponent');
    applyConfuse(oppSide);
    pushAbility('Swagger King', `${b.creature.name} provoked ${opp.creature.name}!`, side, oppSide);
  }
  if (a === 'download' && opp.hp > 0) {
    const phys = opp.stages.def <= opp.stages.edef ? 'atk' : 'eatk';
    pushAbility('Download', `${b.creature.name} analyzed ${opp.creature.name}!`, side, side);
    applyStage(side, phys, 1, 'self');
  }
  if (a === 'menace' && opp.hp > 0 && opp.status !== null) {
    pushAbility('Menace', `${b.creature.name} smells weakness!`, side, side);
    applyStage(side, 'atk', 1, 'self');
  }
  if (teamHasAbility(roster, 'sky-lord') && b.creature.types.includes('flying')) {
    pushAbility('Sky Lord', `${b.creature.name} soared in with sharp reflexes!`, side, side);
    applyStage(side, 'spd', 1, 'self');
  }
  // --- Gen I entry signatures ---
  if (a === 'tailwind') {
    pushAbility('Tailwind', `${b.creature.name} rode in on a tailwind!`, side, side);
    applyStage(side, 'spd', 1, 'self');
  }
  if (a === 'latent-power') {
    const s = b.creature.stats;
    const cand: [StageStat, number][] = [
      ['atk', s.atk], ['eatk', s.eatk], ['def', s.def], ['edef', s.edef], ['spd', s.spd],
    ];
    let best = cand[0];
    for (const c of cand) if (c[1] > best[1]) best = c;
    pushAbility('Latent Power', `${b.creature.name}'s latent power surfaced!`, side, side);
    applyStage(side, best[0], 1, 'self');
  }
  if (a === 'transform') {
    const s = b.creature.stats;
    const off: StageStat = s.eatk > s.atk ? 'eatk' : 'atk';
    pushAbility('Transform', `${b.creature.name} reshaped into a fighter!`, side, side);
    applyStage(side, off, 2, 'self');
    applyStage(side, 'spd', 1, 'self');
  }
  if (
    a === 'lullaby' &&
    opp.hp > 0 &&
    opp.status === null &&
    opp.creature.ability !== 'vital-spirit' &&
    rng.chance(0.35)
  ) {
    opp.status = 'sleep';
    opp.statusTurns = rng.int(1, 3);
    pushAbility('Lullaby', `${b.creature.name}'s lullaby lulled ${opp.creature.name} to sleep!`, side, oppSide);
  }
  if (a === 'jinx' && opp.hp > 0) {
    opp.statusSusceptMult = 1.25;
    opp.statusSuspectTurns = 3;
    opp.hexTurns = 3;
    pushAbility('Jinx', `${b.creature.name} hexed ${opp.creature.name}!`, side, oppSide);
  }
}

/** Faint passives — returns torchPass turns for incoming ally. */
export function applyFaintAbilities(
  fainted: Battler,
  incoming: Battler,
  attacker: Battler | null,
  koMoveName: string | undefined,
  applyStage: (side: Side, stat: StageStat, delta: number) => void,
  side: Side,
): { torchPassTurns: number } {
  const a = fainted.creature.ability;
  let torchPassTurns = 0;

  if (a === 'thorn-wreath' && attacker && attacker.hp > 0) {
    attacker.status = 'poison';
    attacker.toxicCounter = 1;
  }
  if (a === 'parting-gift') {
    incoming.status = null;
    incoming.statusTurns = 0;
    incoming.toxicCounter = 0;
  }
  if (a === 'soul-battery') {
    incoming.hp = Math.min(incoming.maxHp, incoming.hp + Math.floor(incoming.maxHp * 0.2));
  }
  if (a === 'grudge' && attacker && koMoveName && attacker.pp[koMoveName] !== undefined) {
    attacker.pp[koMoveName] = Math.max(0, (attacker.pp[koMoveName] ?? 0) - 2);
  }
  if (a === 'revenge-cry') applyStage(side, 'def', 2);
  if (a === 'avenger' && attacker) incoming.avengeName = attacker.creature.name;
  if (a === 'torch-pass') torchPassTurns = 3;
  if (a === 'burden-bearer' && attacker && attacker.hp > 0) {
    const chip = Math.max(1, Math.floor(attacker.maxHp * 0.15));
    attacker.hp = Math.max(0, attacker.hp - chip);
  }
  return { torchPassTurns };
}

export function applyContactAbilities(
  defender: Battler,
  attacker: Battler,
  moveName: string,
  rng: { chance: (p: number) => boolean; pick: <T>(arr: T[]) => T },
): void {
  const d = defender.creature.ability;
  if (d === 'static' && rng.chance(0.3)) {
    attacker.status = 'stun';
    attacker.statusTurns = 3;
  }
  if (d === 'flame-body' && rng.chance(0.3)) attacker.status = 'burn';
  if (d === 'poison-point' && rng.chance(0.3)) {
    attacker.status = 'poison';
    attacker.toxicCounter = 1;
  }
  if (d === 'rough-skin') {
    const chip = Math.max(1, Math.floor(attacker.maxHp / 16));
    attacker.hp = Math.max(0, attacker.hp - chip);
  }
  if (d === 'iron-barbs') {
    const chip = Math.max(1, Math.floor(attacker.maxHp / 8));
    attacker.hp = Math.max(0, attacker.hp - chip);
  }
  if (d === 'sticky') applyStageDelta(attacker, 'spd', -1);
  if (d === 'effect-spore' && rng.chance(0.3)) {
    const kinds: Exclude<StatusKind, null>[] = ['burn', 'stun', 'poison', 'sleep'];
    const kind = rng.pick(kinds);
    if (kind === 'poison') {
      attacker.status = 'poison';
      attacker.toxicCounter = 1;
    } else if (kind === 'sleep') {
      attacker.status = 'sleep';
      attacker.statusTurns = 3;
    } else if (kind === 'burn') {
      attacker.status = 'burn';
      attacker.statusTurns = 3;
    } else {
      attacker.status = 'stun';
      attacker.statusTurns = 3;
    }
  }
  if (d === 'cursed-body' && rng.chance(0.25)) {
    attacker.sealedMoveName = moveName;
    attacker.sealedTurns = 1;
  }
  if (d === 'perish-body') {
    defender.perishCountdown = 3;
    attacker.perishCountdown = 3;
  }
}

/**
 * Backlash — the energy-attack counterpart to Rough Skin / Iron Barbs. Those
 * punish physical *contact*; this punishes a special hit, so bulky special
 * sponges (jellies, psychics, electric eels) get a retaliation niche of their
 * own. Called from battle.ts after an energy move connects, mirroring the
 * contact-ability site; the caller handles any resulting faint.
 */
export function applyEnergyStruckAbilities(defender: Battler, attacker: Battler, move: Move): void {
  if (defender.creature.ability === 'backlash' && moveCategory(move) === 'energy') {
    const chip = Math.max(1, Math.floor(attacker.maxHp / 8));
    attacker.hp = Math.max(0, attacker.hp - chip);
  }
}

function applyStageDelta(b: Battler, stat: StageStat, delta: number): void {
  b.stages[stat] = Math.max(-6, Math.min(6, b.stages[stat] + delta));
}

export const MOODY_STATS: StageStat[] = ['atk', 'eatk', 'def', 'edef', 'spd'];
