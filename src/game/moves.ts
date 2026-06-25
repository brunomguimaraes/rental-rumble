import type {
  AbilityId,
  AttackAnim,
  BaseStats,
  Move,
  MoveEffect,
  PokemonType,
  Sign,
  StageStat,
} from './types.js';
import { SIGN_INFO, type Element } from './zodiac.js';

const STAT_LABEL: Record<StageStat, string> = {
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
};

/**
 * A short, human-readable summary of a move's secondary effect — used by the
 * moveset UI (see MovesModal). Pure-status moves (chance 1) read as a verb
 * ("Burns"), on-hit riders carry their odds ("30% burn").
 */
export function moveEffectLabel(effect: MoveEffect): string {
  const pct = (c: number) => `${Math.round(c * 100)}%`;
  switch (effect.kind) {
    case 'burn':
      return effect.chance >= 1 ? 'Burns the foe' : `${pct(effect.chance)} burn`;
    case 'stun':
      return effect.chance >= 1 ? 'Paralyzes the foe' : `${pct(effect.chance)} paralyze`;
    case 'poison':
      return effect.chance >= 1 ? 'Badly poisons the foe' : `${pct(effect.chance)} poison`;
    case 'sleep':
      return effect.chance >= 1 ? 'Puts the foe to sleep' : `${pct(effect.chance)} sleep`;
    case 'confuse':
      return effect.chance >= 1 ? 'Confuses the foe' : `${pct(effect.chance)} confuse`;
    case 'heal':
      return `Heals up to ${Math.round(effect.amount * 100)}% HP (less each repeat)`;
    case 'lifesteal':
      return `Drains ${Math.round(effect.fraction * 100)}% of damage`;
    case 'fracdamage':
      return `Cuts ${Math.round(effect.fraction * 100)}% of current HP (ignores DEF)`;
    case 'taunt':
      return 'Seals setup & heals for a few turns';
    case 'recoil':
      return `Recoils ${Math.round(effect.fraction * 100)}% of damage dealt`;
    case 'flinch':
      return effect.chance >= 1
        ? 'Makes the foe flinch (if it moves first)'
        : `${pct(effect.chance)} flinch (if faster)`;
    case 'stage': {
      const sign = effect.delta > 0 ? '+' : '';
      const who = effect.target === 'self' ? 'own' : "foe's";
      const change = `${sign}${effect.delta} ${who} ${STAT_LABEL[effect.stat]}`;
      return effect.chance >= 1 ? change : `${pct(effect.chance)} ${change}`;
    }
    case 'multistage': {
      const who = effect.target === 'self' ? 'own' : "foe's";
      const verb = effect.stages[0].delta > 0 ? 'Raises' : 'Lowers';
      const stats = effect.stages.map((s) => STAT_LABEL[s.stat]).join(' & ');
      const sharply = Math.abs(effect.stages[0].delta) >= 2 ? ' sharply' : '';
      return `${verb} ${who} ${stats}${sharply}`;
    }
  }
}

const mk = (
  name: string,
  type: PokemonType,
  power: number,
  accuracy = 1,
  effect?: Move['effect'],
): Move => ({ name, type, power, accuracy, effect });

// Each type provides a reliable STAB attack plus a utility/coverage move
// (often carrying an effect). Real move names, lightly tuned power/accuracy.
const TYPE_MOVES: Record<PokemonType, [Move, Move]> = {
  normal: [
    mk('Body Slam', 'normal', 85, 1, { kind: 'stun', chance: 0.3 }),
    mk('Hyper Voice', 'normal', 90, 1),
  ],
  fire: [
    mk('Flamethrower', 'fire', 90, 1, { kind: 'burn', chance: 0.1 }),
    mk('Will-O-Wisp', 'fire', 0, 0.85, { kind: 'burn', chance: 1 }),
  ],
  water: [
    mk('Surf', 'water', 90, 1),
    mk('Scald', 'water', 80, 1, { kind: 'burn', chance: 0.3 }),
  ],
  electric: [
    mk('Thunderbolt', 'electric', 90, 1, { kind: 'stun', chance: 0.1 }),
    mk('Thunder Wave', 'electric', 0, 0.9, { kind: 'stun', chance: 1 }),
  ],
  grass: [
    mk('Energy Ball', 'grass', 90, 1),
    mk('Giga Drain', 'grass', 75, 1, { kind: 'lifesteal', fraction: 0.5 }),
  ],
  ice: [
    mk('Ice Beam', 'ice', 90, 1, { kind: 'stun', chance: 0.1 }),
    mk('Icicle Crash', 'ice', 85, 0.9, { kind: 'stun', chance: 0.3 }),
  ],
  fighting: [
    // Close Combat lowers the user's own Defense as it connects.
    mk('Close Combat', 'fighting', 100, 1, {
      kind: 'stage',
      stat: 'def',
      delta: -1,
      chance: 1,
      target: 'self',
    }),
    mk('Drain Punch', 'fighting', 75, 1, { kind: 'lifesteal', fraction: 0.5 }),
  ],
  poison: [
    mk('Sludge Bomb', 'poison', 90, 1, { kind: 'poison', chance: 0.3 }),
    mk('Toxic', 'poison', 0, 0.9, { kind: 'poison', chance: 1 }),
  ],
  ground: [
    mk('Earthquake', 'ground', 100, 1),
    mk('Earth Power', 'ground', 90, 1),
  ],
  flying: [
    mk('Hurricane', 'flying', 100, 0.8, { kind: 'stun', chance: 0.2 }),
    mk('Air Slash', 'flying', 75, 0.95, { kind: 'flinch', chance: 0.3 }),
  ],
  psychic: [
    mk('Psychic', 'psychic', 90, 1),
    mk('Hypnosis', 'psychic', 0, 0.75, { kind: 'sleep', chance: 1 }),
  ],
  bug: [
    mk('Bug Buzz', 'bug', 90, 1),
    mk('Leech Life', 'bug', 80, 1, { kind: 'lifesteal', fraction: 0.5 }),
  ],
  rock: [
    mk('Stone Edge', 'rock', 100, 0.8),
    mk('Rock Slide', 'rock', 75, 0.9, { kind: 'flinch', chance: 0.3 }),
  ],
  ghost: [
    mk('Shadow Ball', 'ghost', 90, 1),
    mk('Shadow Claw', 'ghost', 70, 1),
  ],
  dragon: [
    mk('Dragon Pulse', 'dragon', 85, 1),
    mk('Dragon Claw', 'dragon', 80, 1),
  ],
  dark: [
    mk('Dark Pulse', 'dark', 80, 1, { kind: 'confuse', chance: 0.2 }),
    // Crunch has a chance to drop the target's Defense.
    mk('Crunch', 'dark', 80, 1, {
      kind: 'stage',
      stat: 'def',
      delta: -1,
      chance: 0.3,
      target: 'foe',
    }),
  ],
  steel: [
    mk('Iron Head', 'steel', 80, 1, { kind: 'flinch', chance: 0.3 }),
    mk('Flash Cannon', 'steel', 80, 1),
  ],
  fairy: [
    mk('Moonblast', 'fairy', 95, 1),
    mk('Dazzling Gleam', 'fairy', 80, 1),
  ],
};

const BODY_SLAM = TYPE_MOVES.normal[0];
// Priority move: always strikes before slower foes (and ties) regardless of Speed.
const QUICK_ATTACK: Move = {
  name: 'Quick Attack',
  type: 'normal',
  power: 40,
  accuracy: 1,
  priority: 1,
};
// Sustain. No longer granted by a role/sign — it's a regular move any
// sufficiently bulky Pokémon can pack (see movesFor). Capped at HEAL_PP uses so
// two bulky walls (e.g. Chansey) can't out-heal each other into an endless
// stalemate — once the heals dry up, the fight is decided on damage.
export const HEAL_PP = 3;
// Diminishing returns on repeated self-heals within a single battle: every
// Recover after the first restores HEAL_DECAY as much as the previous one
// (heal #n = amount * HEAL_DECAY^(n-1)). The first heal still bites for the
// full amount, but a healer-vs-healer war decays fast instead of stalling —
// applied in battle.ts where the heal is resolved (see Battler.healsUsed).
export const HEAL_DECAY = 0.5;
const RECOVER: Move = {
  ...mk('Recover', 'normal', 0, 1, { kind: 'heal', amount: 0.3 }),
  pp: HEAL_PP,
};

// Anti-wall counterplay (granted to offensive mons in movesFor, never to walls
// themselves — these are the answer TO bulk).
//
// Super Fang: lops off half the foe's CURRENT HP regardless of Defense, so a
// fortified or naturally bulky wall can't soak it. It can't KO on its own
// (always leaves the foe at >=1 HP from this move), so it sets up a finisher
// rather than replacing one. Normal-typed, so Ghosts are immune.
const SUPER_FANG = mk('Super Fang', 'normal', 0, 0.9, {
  kind: 'fracdamage',
  fraction: 0.5,
});
// Taunt: locks the foe out of setup, heals and pure-status moves for a few
// turns, forcing a wall to trade damage instead of stalling. Deals nothing
// itself — pure disruption.
const TAUNT = mk('Taunt', 'dark', 0, 1, { kind: 'taunt', chance: 1 });
// How many turns a Taunt keeps the foe locked into attacking.
export const TAUNT_TURNS = 3;

// Reckless recoil "nukes": premium-power STAB attacks that bite back, spending a
// share of the damage dealt as the attacker's own HP (see the `recoil` effect in
// battle.ts). Handed to hard-hitting, non-bulky attackers as a high-risk finisher
// — a glass cannon trades longevity for a hit that few walls can eat. Only the
// physical-contact types that canonically own one get an entry; everyone else
// just sticks to their reliable STAB.
const RECOIL_NUKES: Partial<Record<PokemonType, Move>> = {
  normal: mk('Double-Edge', 'normal', 120, 1, { kind: 'recoil', fraction: 1 / 3 }),
  fire: mk('Flare Blitz', 'fire', 120, 1, { kind: 'recoil', fraction: 1 / 3 }),
  water: mk('Wave Crash', 'water', 120, 1, { kind: 'recoil', fraction: 1 / 3 }),
  electric: mk('Wild Charge', 'electric', 90, 1, { kind: 'recoil', fraction: 1 / 4 }),
  grass: mk('Wood Hammer', 'grass', 120, 1, { kind: 'recoil', fraction: 1 / 3 }),
  flying: mk('Brave Bird', 'flying', 120, 1, { kind: 'recoil', fraction: 1 / 3 }),
  rock: mk('Head Smash', 'rock', 130, 0.85, { kind: 'recoil', fraction: 1 / 2 }),
};

/**
 * Signature moves: one-of-a-kind attacks invented for this game and bolted onto a
 * specific species by National Dex id, so a marquee mon plays unlike anything the
 * type tables could produce. They lean on the two custom riders — `selfStage` (a
 * guaranteed self stat-tax paid on every hit) and `lockTurns` (the move benches
 * its own type for a beat after firing) — to trade raw power for a real drawback.
 *
 * Woven in first by movesFor (see below) so a species' identity move is never
 * crowded out of its pool. Purely additive: a mon without an entry here is built
 * exactly as before.
 */
const SIGNATURE_MOVES: Record<number, Move> = {
  // Rapidash — a headlong blazing charge: it almost always sears the foe, but
  // running this hot costs the horse its own footing (a stage of Speed each use).
  78: {
    ...mk('Searing Gallop', 'fire', 100, 1, { kind: 'burn', chance: 0.5 }),
    selfStage: { stat: 'spd', delta: -1 },
  },

  // The Kanto starters' "ultimate" blasts — colossal single hits whose cannons /
  // furnace / root-network need a couple of turns to repower, so the user can't
  // fire the same element again right after (it falls back to coverage meanwhile).
  9: { ...mk('Hydro Cannon', 'water', 150, 0.95), lockTurns: 3 }, // Blastoise
  6: { ...mk('Blast Burn', 'fire', 150, 0.95), lockTurns: 3 }, // Charizard
  3: { ...mk('Frenzy Plant', 'grass', 150, 0.95), lockTurns: 3 }, // Venusaur

  // Salamence — a meteor swarm called down from on high: devastating, but the
  // strain of pulling it off saps the dragon's own Attack two stages.
  373: {
    ...mk('Draco Meteor', 'dragon', 130, 0.95),
    selfStage: { stat: 'atk', delta: -2 },
  },

  // Gengar — a creeping shadow that smothers the foe in toxin: middling power,
  // but it ALWAYS leaves the target badly poisoned, so a fast Gengar can stamp
  // a clock on something and then dance around it.
  94: mk('Shadow Smother', 'ghost', 90, 1, { kind: 'poison', chance: 1 }),

  // Machamp — a wild, telegraphed haymaker: it can whiff (low accuracy), but on
  // contact it ALWAYS leaves the foe reeling in confusion.
  68: mk('Dynamic Punch', 'fighting', 100, 0.8, { kind: 'confuse', chance: 1 }),

  // Gyarados — a thrashing, all-out assault that hits like a truck but leaves the
  // serpent's own guard wide open (a stage of Defense each use).
  130: {
    ...mk('Thrash', 'water', 130, 1),
    selfStage: { stat: 'def', delta: -1 },
  },

  // Tyranitar — a crushing avalanche that ALWAYS caves in the foe's Defense,
  // cracking open a wall for the rest of the team to pour through.
  248: mk('Sandstorm Slam', 'rock', 120, 0.9, {
    kind: 'stage',
    stat: 'def',
    delta: -1,
    chance: 1,
    target: 'foe',
  }),
};

/** A short note for a move's self-cost riders (selfStage / lockTurns), or null. */
export function moveSelfNote(move: Move): string | null {
  const parts: string[] = [];
  if (move.selfStage) {
    const { stat, delta } = move.selfStage;
    const sign = delta > 0 ? '+' : '';
    const sharply = Math.abs(delta) >= 2 ? ' sharply' : '';
    parts.push(`${sign}${delta} own ${STAT_LABEL[stat]}${sharply}`);
  }
  if (move.lockTurns) {
    const t = `${move.type[0].toUpperCase()}${move.type.slice(1)}`;
    parts.push(`locks its own ${t} moves briefly`);
  }
  return parts.length ? parts.join(' · ') : null;
}

// Pure setup moves (power 0): sharply raise one of the user's own stat stages.
const SWORDS_DANCE = mk('Swords Dance', 'normal', 0, 1, {
  kind: 'stage',
  stat: 'atk',
  delta: 2,
  chance: 1,
  target: 'self',
});
const AGILITY = mk('Agility', 'psychic', 0, 1, {
  kind: 'stage',
  stat: 'spd',
  delta: 2,
  chance: 1,
  target: 'self',
});
const IRON_DEFENSE = mk('Iron Defense', 'steel', 0, 1, {
  kind: 'stage',
  stat: 'def',
  delta: 2,
  chance: 1,
  target: 'self',
});

// Dual-stat setup (power 0): raise two of the user's stages at once. These are
// the type-flavored "dance" buttons handed to the relevant attackers in
// movesFor — a Dragon that's fast and hits hard, a Fighter that snowballs while
// toughening up. One button per mon, same anti-stall rules as the single setups.
const DRAGON_DANCE = mk('Dragon Dance', 'dragon', 0, 1, {
  kind: 'multistage',
  stages: [
    { stat: 'atk', delta: 1 },
    { stat: 'spd', delta: 1 },
  ],
  chance: 1,
  target: 'self',
});
const BULK_UP = mk('Bulk Up', 'fighting', 0, 1, {
  kind: 'multistage',
  stages: [
    { stat: 'atk', delta: 1 },
    { stat: 'def', delta: 1 },
  ],
  chance: 1,
  target: 'self',
});

// Pure debuff moves (power 0): drop one of the FOE's stages with no damage —
// support/disruption tools the AI throws at a healthy foe (see chooseMove). They
// reuse the existing `stage` effect with target 'foe', so the battle engine
// already resolves them; only the AI needed teaching to pick them.
//
// - Charm  : saps the foe's Attack, letting a defensive Fairy tank physical hits.
// - Screech: melts a wall's Defense so a bulky attacker can punch through it.
// - Scary Face: tanks the foe's Speed so a slow bruiser moves first.
const CHARM = mk('Charm', 'fairy', 0, 1, {
  kind: 'stage',
  stat: 'atk',
  delta: -2,
  chance: 1,
  target: 'foe',
});
const SCREECH = mk('Screech', 'normal', 0, 0.9, {
  kind: 'stage',
  stat: 'def',
  delta: -2,
  chance: 1,
  target: 'foe',
});
const SCARY_FACE = mk('Scary Face', 'normal', 0, 1, {
  kind: 'stage',
  stat: 'spd',
  delta: -2,
  chance: 1,
  target: 'foe',
});

// Confuse Ray: a no-damage Ghost utility that confuses the foe outright. Shares
// the pure-status pipeline with Will-O-Wisp/Thunder Wave (confusion is already a
// status rider kind), so the AI's "spread status" logic uses it for free.
const CONFUSE_RAY = mk('Confuse Ray', 'ghost', 0, 1, {
  kind: 'confuse',
  chance: 1,
});

// Off-type coverage offered by each element. Because a Pokémon's sign is rolled
// per run, its element-themed coverage shifts run to run — part of what makes an
// 8-move pool feel more varied than a fixed 4-move set. Each entry is a real
// damaging move pulled from the type's kit.
const ELEMENT_COVERAGE: Record<Element, PokemonType[]> = {
  fire: ['fighting', 'rock'],
  earth: ['rock', 'ground'],
  air: ['flying', 'electric'],
  water: ['ice', 'poison'],
};

// Celestial signs are element-less, so they reach for broad, premium coverage
// to match their outsized stats.
const CELESTIAL_COVERAGE: PokemonType[] = ['fighting', 'ice', 'rock', 'ground'];

/** Bulky enough to justify a sustain/defensive button (Recover, Iron Defense). */
function isBulky(s: BaseStats): boolean {
  return s.hp + s.def >= 170;
}

// Contact moves — punches, claws, bites, body checks and dashes — play a melee
// "Strike" (dart in, hit, dart back).
const CONTACT_MOVES = new Set([
  'Body Slam',
  'Quick Attack',
  'Close Combat',
  'Drain Punch',
  'Poison Jab',
  'Zen Headbutt',
  'Leech Life',
  'Shadow Claw',
  'Dragon Claw',
  'Crunch',
  'Iron Head',
  // Reckless recoil nukes — all body-checks/charges, so they read as a melee
  // strike (Head Smash slams head-first; Wild Charge dashes in).
  'Double-Edge',
  'Flare Blitz',
  'Wave Crash',
  'Wild Charge',
  'Wood Hammer',
  'Brave Bird',
  'Head Smash',
  // Signature melee — a galloping body-check, a haymaker, a thrashing assault.
  'Searing Gallop',
  'Dynamic Punch',
  'Thrash',
]);

// Heavy, ground-shaking AoE moves play a big "Swing" slam.
const HEAVY_MOVES = new Set([
  'Earthquake',
  'Stone Edge',
  'Rock Slide',
  'Icicle Crash',
  // Tyranitar's signature avalanche lands as a heavy slam.
  'Sandstorm Slam',
]);

// Aura / sound / mind-burst specials play "SpAttack" (a stationary special cast)
// rather than a fired projectile.
const SPECIAL_MOVES = new Set([
  'Hyper Voice',
  'Surf',
  'Giga Drain',
  'Earth Power',
  'Psychic',
  'Bug Buzz',
  'Dazzling Gleam',
  // Signature blasts — huge channelled bursts, cast in place rather than thrown.
  'Hydro Cannon',
  'Blast Burn',
  'Frenzy Plant',
  'Draco Meteor',
  // Gengar's smothering shadow wells up in place rather than firing outward.
  'Shadow Smother',
]);

/**
 * Pick the PMD attack animation that best fits a move. Pure status/heal moves
 * (power 0) wind up in place ("Charge"); contact, heavy and special moves use
 * their dedicated motions; everything else fires a projectile/beam ("Shoot").
 */
export function attackAnimFor(move: Move): AttackAnim {
  // Super Fang is a power-0 move mechanically but lands as a bite — play the
  // melee strike rather than a self-targeted wind-up.
  if (move.effect?.kind === 'fracdamage') return 'strike';
  if (move.power === 0) return 'charge';
  if (CONTACT_MOVES.has(move.name)) return 'strike';
  if (HEAVY_MOVES.has(move.name)) return 'swing';
  if (SPECIAL_MOVES.has(move.name)) return 'special';
  return 'shoot';
}

/** How many moves a Pokémon carries. Deliberately wider than the games' 4 so
 *  the AI has real choices and the same species plays differently across runs. */
export const MOVE_SLOTS = 8;

/**
 * Build a Pokémon's move pool from its types, stats and sign. Unlike the
 * canonical 4-move limit, every mon carries up to {@link MOVE_SLOTS} moves and
 * the battle AI decides which to throw each turn (see chooseMove in battle.ts).
 *
 * The pool is layered, best-first so attacks are never crowded out:
 *   1. STAB core — both moves of each of the mon's own types.
 *   2. Coverage  — element-themed off-type attacks (driven by the sign, so it
 *      shifts run to run).
 *   2b. Recoil   — a reckless, premium-power STAB nuke for hard hitters (it bites
 *      back, so it's a finisher, not a spam button).
 *   3. Counter  — anti-wall tools (Super Fang / Taunt) for offensive mons.
 *   4. Priority  — Quick Attack for genuinely fast attackers, and for any mon
 *      that can be born with Technician (the ability is dead weight without a
 *      move of 60 power or less to boost, and Quick Attack is the only one in
 *      the kit). A final guarantee below reclaims a slot for it if a crowded
 *      pool would otherwise crowd it out.
 *   5. Setup    — exactly ONE setup/sustain button per mon (see below).
 *   5b. Support — at most ONE disruption move (foe stat-drop / confusion),
 *                 thematic where the typing fits, otherwise stat-based.
 *   6. Filler    — Body Slam as a dependable Normal-type fallback.
 *
 * Defensive button rule (anti-stall): a mon never carries both Iron Defense and
 * Recover. Offensive mons set up to hit harder/faster; a pure wall picks a
 * single tool matched to its build — defence-dominant walls fortify (Iron
 * Defense), HP-dominant walls heal (Recover) — so no wall can stack +DEF *and*
 * out-heal in the same battle.
 */
export function movesFor(
  types: PokemonType[],
  stats: BaseStats,
  sign: Sign,
  abilities: AbilityId[] = [],
  dexId?: number,
): Move[] {
  // Technician only pays off on a damaging move of 60 power or less. Key off the
  // species' ability *options* (not a single rolled ability) so the canonical
  // moveset — built once from the default ability and never rebuilt when the
  // ability is rolled — always carries the enabler for a two-ability species
  // like Scizor too.
  const hasTechnician = abilities.includes('technician');
  const moves: Move[] = [];
  const seen = new Set<string>();
  const add = (m: Move | undefined) => {
    if (!m || seen.has(m.name)) return;
    seen.add(m.name);
    moves.push(m);
  };

  // 0) Signature move — a species' invented identity attack, slotted first so it
  //    can never be crowded out of the pool (see SIGNATURE_MOVES).
  if (dexId !== undefined) add(SIGNATURE_MOVES[dexId]);

  // 1) STAB core.
  for (const t of types) {
    add(TYPE_MOVES[t][0]);
    add(TYPE_MOVES[t][1]);
  }

  // 2) Element-themed coverage for off-type reach. Celestial signs have no
  //    element, so they draw from a broad premium-coverage set instead.
  const element = SIGN_INFO[sign].element;
  const coverage = element ? ELEMENT_COVERAGE[element] : CELESTIAL_COVERAGE;
  for (const t of coverage) {
    if (!types.includes(t)) add(TYPE_MOVES[t][0]);
  }

  // 2b) Reckless recoil nuke: a hard-hitting, non-bulky attacker reaches for a
  //     STAB recoil move where its typing owns one — a high-risk finisher that
  //     spends the user's HP for premium power (see RECOIL_NUKES). Added high so
  //     a crowded pool can't crowd it out, and capped at one (the first matching
  //     STAB type) so the rest of the kit stays varied.
  if (!isBulky(stats) && stats.atk >= 95) {
    for (const t of types) {
      const nuke = RECOIL_NUKES[t];
      if (nuke) {
        add(nuke);
        break;
      }
    }
  }

  // 3) Anti-wall counterplay for offensive mons — the answer TO bulk, so walls
  //    themselves never get it. Hard hitters carry Super Fang (DEF-ignoring
  //    chip); fast mons carry Taunt (stall-breaker).
  if (!isBulky(stats) && stats.atk >= 85) add(SUPER_FANG);
  if (!isBulky(stats) && stats.spd >= 90) add(TAUNT);

  // 4) Priority for fast, hard-hitting attackers — and for Technician mons,
  //    whose ability is dead without a sub-60 move to wring power from.
  if (hasTechnician || (stats.spd >= 95 && stats.atk >= 80)) add(QUICK_ATTACK);

  // 5) Exactly one setup/sustain button. Type-flavored dual-stat setups take
  //    precedence for the attackers that fit them (Dragon Dance for fast, hard-
  //    hitting Dragons; Bulk Up for Fighters), then the single-stat setups, then
  //    a pure wall's fortify/heal. Never Iron Defense + Recover together.
  if (stats.atk >= 90 && types.includes('dragon')) {
    add(DRAGON_DANCE);
    if (isBulky(stats)) add(RECOVER);
  } else if (stats.atk >= 90 && types.includes('fighting')) {
    add(BULK_UP);
    if (isBulky(stats)) add(RECOVER);
  } else if (stats.atk >= 100) {
    add(SWORDS_DANCE);
    if (isBulky(stats)) add(RECOVER); // bulky attacker may still pack sustain
  } else if (stats.spd >= 100) {
    add(AGILITY);
    if (isBulky(stats)) add(RECOVER);
  } else if (isBulky(stats)) {
    // Pure wall: fortify if defence-dominant, otherwise heal. One or the other.
    if (stats.def >= stats.hp) add(IRON_DEFENSE);
    else add(RECOVER);
  }

  // 5b) One support/disruption move — thematic where the typing fits, otherwise
  //     stat-based — capped at a single pick so attacks aren't crowded out. The
  //     battle AI decides when to actually throw these (see chooseMove).
  if (types.includes('fairy') && stats.def >= stats.atk) {
    add(CHARM); // defensive Fairy saps the foe's Attack
  } else if (types.includes('ghost')) {
    add(CONFUSE_RAY); // Ghosts disrupt with confusion
  } else if (isBulky(stats) && stats.atk >= 90) {
    add(SCREECH); // bulky attacker melts a wall's Defense
  } else if (isBulky(stats) && stats.spd <= 70) {
    add(SCARY_FACE); // slow wall flips the speed tier
  }

  // 6) Dependable filler.
  add(BODY_SLAM);

  const pool = moves.slice(0, MOVE_SLOTS);

  // Technician guarantee: a Technician mon must keep at least one move it can
  // actually boost (power 1–60). A broad pool — e.g. a dual-type with celestial
  // coverage — can fill all MOVE_SLOTS before Quick Attack and push the enabler
  // past the cut, leaving the ability dead. If that happened, reclaim the last
  // (lowest-priority) slot for it.
  if (hasTechnician && !pool.some((m) => m.power > 0 && m.power <= 60)) {
    pool[pool.length - 1] = QUICK_ATTACK;
  }

  return pool;
}
