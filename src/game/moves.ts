import type {
  AbilityId,
  AttackAnim,
  BaseStats,
  Build,
  Move,
  MoveCategory,
  MoveEffect,
  PokemonType,
  Sign,
  StageStat,
} from './types.js';
import { SIGN_INFO, type Element } from './zodiac.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { RNG } from './rng.js';

const STAT_LABEL: Record<StageStat, string> = {
  atk: 'ATK',
  eatk: 'E.ATK',
  def: 'DEF',
  edef: 'E.DEF',
  spd: 'SPD',
};

// The types whose attacks default to the ENERGY half of the split (special-style
// elemental blasts, beams and auras). Everything else defaults to PHYSICAL. A
// move can override this per-entry via Move.category — see moveCategory().
const ENERGY_TYPES = new Set<PokemonType>([
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'psychic',
  'dark',
  'dragon',
  'fairy',
]);

/**
 * Resolve a move's damage category, honouring an explicit `category` override and
 * otherwise deriving it: power-0 moves are `status`, energy-typed attacks are
 * `energy`, the rest are `physical`. Centralised so the battle engine and the UI
 * agree without every move having to spell its category out.
 */
export function moveCategory(move: Move): MoveCategory {
  if (move.category) return move.category;
  if (move.power === 0) return 'status';
  return ENERGY_TYPES.has(move.type) ? 'energy' : 'physical';
}

/** Human-readable label for a move's damage category. */
export function moveCategoryLabel(move: Move): string {
  const c = moveCategory(move);
  return c === 'physical' ? 'Physical' : c === 'energy' ? 'Energy' : 'Status';
}

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
    case 'frostbite':
      return effect.chance >= 1 ? 'Frostbites the foe' : `${pct(effect.chance)} frostbite`;
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
    case 'weight':
      return 'Weighs the foe down — a heavy Speed cut';
    case 'blind':
      return 'Blinds the foe, sapping its accuracy';
    case 'disarm':
      return 'Seals the foe’s strongest move for a few turns';
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
  category?: MoveCategory,
): Move => ({ name, type, power, accuracy, effect, category });

/**
 * The damaging kit for one half of the Physical/Energy split within a type.
 *   - `safe`: workhorse attacks ordered reliable-first. Any mon of the type can
 *     pack these; bulky and defensive mons stop here.
 *   - `nuke`: an optional premium-power finisher that bites back (recoil, an
 *     accuracy gamble, or a self stat-tax). Handed ONLY to fragile, hard-hitting
 *     sweepers — the high-risk top of the curve, never to a wall.
 *
 * Splitting STAB by the attacker's own category (and risk appetite) is what
 * breaks the old "every Fire-type runs Flamethrower" convergence: a glass-cannon
 * and a tank of the same type now reach for genuinely different moves.
 */
interface MoveLine {
  safe: Move[];
  nuke?: Move;
}
/** A type's full damaging menu plus its signature status/utility move. */
interface TypeKit {
  physical: MoveLine;
  energy: MoveLine;
  status?: Move;
}

// Real move names, lightly tuned. Each type offers a tradeoff curve on both
// halves of the split: a reliable hit, an effect/utility hit, and (for the
// offensive types) a reckless nuke at the top. Coverage and STAB are both drawn
// from here, picked to fit the individual mon (see stabPicks / coverageMove).
const TYPE_KITS: Record<PokemonType, TypeKit> = {
  normal: {
    physical: {
      safe: [mk('Body Slam', 'normal', 85, 1, { kind: 'stun', chance: 0.3 })],
      nuke: mk('Double-Edge', 'normal', 120, 1, { kind: 'recoil', fraction: 1 / 3 }),
    },
    energy: {
      safe: [mk('Hyper Voice', 'normal', 90, 1, undefined, 'energy')],
      nuke: mk('Boomburst', 'normal', 110, 0.9, undefined, 'energy'),
    },
  },
  fire: {
    physical: {
      safe: [
        mk('Fire Punch', 'fire', 75, 1, { kind: 'burn', chance: 0.1 }, 'physical'),
        mk('Fire Fang', 'fire', 65, 0.95, { kind: 'burn', chance: 0.1 }, 'physical'),
      ],
      nuke: mk('Flare Blitz', 'fire', 120, 1, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
    },
    energy: {
      safe: [
        mk('Flamethrower', 'fire', 90, 1, { kind: 'burn', chance: 0.1 }),
        mk('Lava Plume', 'fire', 80, 1, { kind: 'burn', chance: 0.3 }),
      ],
      nuke: mk('Fire Blast', 'fire', 110, 0.85, { kind: 'burn', chance: 0.1 }),
    },
    status: mk('Will-O-Wisp', 'fire', 0, 0.85, { kind: 'burn', chance: 1 }),
  },
  water: {
    physical: {
      safe: [
        mk('Waterfall', 'water', 80, 1, { kind: 'flinch', chance: 0.2 }, 'physical'),
        mk('Aqua Tail', 'water', 85, 0.9, undefined, 'physical'),
      ],
      nuke: mk('Wave Crash', 'water', 120, 1, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
    },
    energy: {
      safe: [mk('Surf', 'water', 90, 1), mk('Scald', 'water', 80, 1, { kind: 'burn', chance: 0.3 })],
      nuke: mk('Hydro Pump', 'water', 110, 0.8),
    },
  },
  electric: {
    physical: {
      safe: [mk('Thunder Fang', 'electric', 65, 0.95, { kind: 'stun', chance: 0.1 }, 'physical')],
      nuke: mk('Wild Charge', 'electric', 90, 1, { kind: 'recoil', fraction: 1 / 4 }, 'physical'),
    },
    energy: {
      safe: [
        mk('Thunderbolt', 'electric', 90, 1, { kind: 'stun', chance: 0.1 }),
        mk('Discharge', 'electric', 80, 1, { kind: 'stun', chance: 0.3 }),
      ],
      nuke: mk('Thunder', 'electric', 110, 0.7, { kind: 'stun', chance: 0.3 }),
    },
    status: mk('Thunder Wave', 'electric', 0, 0.9, { kind: 'stun', chance: 1 }),
  },
  grass: {
    physical: {
      safe: [
        mk('Seed Bomb', 'grass', 80, 1, undefined, 'physical'),
        mk('Leaf Blade', 'grass', 80, 1, undefined, 'physical'),
      ],
      nuke: mk('Wood Hammer', 'grass', 120, 1, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
    },
    energy: {
      safe: [
        mk('Energy Ball', 'grass', 90, 1),
        mk('Giga Drain', 'grass', 75, 1, { kind: 'lifesteal', fraction: 0.5 }),
      ],
      nuke: { ...mk('Leaf Storm', 'grass', 130, 0.9), selfStage: { stat: 'eatk', delta: -2 } },
    },
    status: mk('Sleep Powder', 'grass', 0, 0.75, { kind: 'sleep', chance: 1 }),
  },
  ice: {
    physical: {
      safe: [
        mk('Ice Fang', 'ice', 65, 0.95, { kind: 'frostbite', chance: 0.1 }, 'physical'),
        mk('Icicle Crash', 'ice', 85, 0.9, { kind: 'flinch', chance: 0.3 }, 'physical'),
      ],
      nuke: mk('Avalanche', 'ice', 120, 0.9, undefined, 'physical'),
    },
    energy: {
      safe: [mk('Ice Beam', 'ice', 90, 1, { kind: 'frostbite', chance: 0.1 })],
      nuke: mk('Blizzard', 'ice', 110, 0.7, { kind: 'frostbite', chance: 0.3 }),
    },
  },
  fighting: {
    physical: {
      safe: [
        mk('Drain Punch', 'fighting', 75, 1, { kind: 'lifesteal', fraction: 0.5 }),
        mk('Close Combat', 'fighting', 100, 1, {
          kind: 'stage',
          stat: 'def',
          delta: -1,
          chance: 1,
          target: 'self',
        }),
      ],
      nuke: mk('High Jump Kick', 'fighting', 130, 0.9, undefined, 'physical'),
    },
    energy: {
      safe: [mk('Aura Sphere', 'fighting', 80, 1, undefined, 'energy')],
      nuke: mk('Focus Blast', 'fighting', 110, 0.7, undefined, 'energy'),
    },
  },
  poison: {
    physical: {
      safe: [mk('Poison Jab', 'poison', 80, 1, { kind: 'poison', chance: 0.3 }, 'physical')],
      nuke: mk('Gunk Shot', 'poison', 120, 0.8, { kind: 'poison', chance: 0.3 }, 'physical'),
    },
    energy: {
      safe: [
        mk('Sludge Bomb', 'poison', 90, 1, { kind: 'poison', chance: 0.3 }, 'energy'),
        mk('Sludge Wave', 'poison', 95, 1, { kind: 'poison', chance: 0.1 }, 'energy'),
      ],
    },
    status: mk('Toxic', 'poison', 0, 0.9, { kind: 'poison', chance: 1 }),
  },
  ground: {
    physical: {
      safe: [
        mk('Earthquake', 'ground', 100, 1),
        mk('High Horsepower', 'ground', 95, 0.95, undefined, 'physical'),
      ],
    },
    energy: {
      safe: [mk('Earth Power', 'ground', 90, 1, undefined, 'energy')],
    },
  },
  flying: {
    physical: {
      safe: [
        mk('Acrobatics', 'flying', 75, 1, undefined, 'physical'),
        mk('Drill Peck', 'flying', 80, 1, undefined, 'physical'),
      ],
      nuke: mk('Brave Bird', 'flying', 120, 1, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
    },
    energy: {
      safe: [mk('Air Slash', 'flying', 75, 0.95, { kind: 'flinch', chance: 0.3 }, 'energy')],
      nuke: mk('Hurricane', 'flying', 110, 0.7, { kind: 'stun', chance: 0.2 }, 'energy'),
    },
  },
  psychic: {
    physical: {
      safe: [
        mk('Psycho Cut', 'psychic', 70, 1, undefined, 'physical'),
        mk('Zen Headbutt', 'psychic', 80, 0.9, { kind: 'flinch', chance: 0.2 }, 'physical'),
      ],
    },
    energy: {
      safe: [mk('Psychic', 'psychic', 90, 1), mk('Psyshock', 'psychic', 80, 1, undefined, 'energy')],
    },
    status: mk('Hypnosis', 'psychic', 0, 0.75, { kind: 'sleep', chance: 1 }),
  },
  bug: {
    physical: {
      safe: [
        mk('Leech Life', 'bug', 80, 1, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
        mk('X-Scissor', 'bug', 80, 1, undefined, 'physical'),
      ],
      nuke: mk('Megahorn', 'bug', 120, 0.85, undefined, 'physical'),
    },
    energy: {
      safe: [
        mk('Bug Buzz', 'bug', 90, 1, undefined, 'energy'),
        mk(
          'Struggle Bug',
          'bug',
          50,
          1,
          { kind: 'stage', stat: 'eatk', delta: -1, chance: 1, target: 'foe' },
          'energy',
        ),
      ],
    },
  },
  rock: {
    physical: {
      safe: [
        mk('Rock Slide', 'rock', 75, 0.9, { kind: 'flinch', chance: 0.3 }),
        mk('Stone Edge', 'rock', 100, 0.8),
      ],
      nuke: mk('Head Smash', 'rock', 130, 0.85, { kind: 'recoil', fraction: 1 / 2 }),
    },
    energy: {
      safe: [mk('Power Gem', 'rock', 80, 1, undefined, 'energy')],
    },
  },
  ghost: {
    physical: {
      safe: [
        mk('Shadow Claw', 'ghost', 70, 1, undefined, 'physical'),
        mk('Phantom Force', 'ghost', 90, 1, undefined, 'physical'),
      ],
      nuke: mk('Poltergeist', 'ghost', 110, 0.9, undefined, 'physical'),
    },
    energy: {
      safe: [
        mk('Shadow Ball', 'ghost', 90, 1, undefined, 'energy'),
        mk('Hex', 'ghost', 65, 1, undefined, 'energy'),
      ],
    },
    status: mk('Confuse Ray', 'ghost', 0, 1, { kind: 'confuse', chance: 1 }),
  },
  dragon: {
    physical: {
      safe: [
        mk('Dragon Claw', 'dragon', 80, 1, undefined, 'physical'),
        mk('Dragon Rush', 'dragon', 100, 0.75, { kind: 'flinch', chance: 0.2 }, 'physical'),
      ],
      nuke: mk('Outrage', 'dragon', 120, 1, undefined, 'physical'),
    },
    energy: {
      safe: [mk('Dragon Pulse', 'dragon', 85, 1)],
    },
  },
  dark: {
    physical: {
      safe: [
        mk('Knock Off', 'dark', 75, 1, undefined, 'physical'),
        mk(
          'Crunch',
          'dark',
          80,
          1,
          { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' },
          'physical',
        ),
      ],
    },
    energy: {
      safe: [
        mk('Dark Pulse', 'dark', 80, 1, { kind: 'confuse', chance: 0.2 }),
        mk(
          'Snarl',
          'dark',
          55,
          1,
          { kind: 'stage', stat: 'eatk', delta: -1, chance: 1, target: 'foe' },
          'energy',
        ),
      ],
    },
  },
  steel: {
    physical: {
      safe: [
        mk('Iron Head', 'steel', 80, 1, { kind: 'flinch', chance: 0.3 }),
        mk('Meteor Mash', 'steel', 90, 0.9, undefined, 'physical'),
      ],
    },
    energy: {
      safe: [mk('Flash Cannon', 'steel', 80, 1, undefined, 'energy')],
    },
  },
  fairy: {
    physical: {
      safe: [
        mk(
          'Play Rough',
          'fairy',
          90,
          0.9,
          { kind: 'stage', stat: 'atk', delta: -1, chance: 0.1, target: 'foe' },
          'physical',
        ),
      ],
    },
    energy: {
      safe: [
        mk('Moonblast', 'fairy', 95, 1, {
          kind: 'stage',
          stat: 'eatk',
          delta: -1,
          chance: 0.3,
          target: 'foe',
        }),
        mk('Dazzling Gleam', 'fairy', 80, 1),
      ],
    },
  },
};

const BODY_SLAM = TYPE_KITS.normal.physical.safe[0];
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
export const HEAL_PP = 2;
// Diminishing returns on repeated self-heals within a single battle: every
// Recover after the first restores HEAL_DECAY as much as the previous one
// (heal #n = amount * HEAL_DECAY^(n-1)). The first heal still bites for the
// full amount, but a healer-vs-healer war decays fast instead of stalling —
// applied in battle.ts where the heal is resolved (see Battler.healsUsed).
export const HEAL_DECAY = 0.4;
const RECOVER: Move = {
  ...mk('Recover', 'normal', 0, 1, { kind: 'heal', amount: 0.25 }),
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

/**
 * Signature moves: one-of-a-kind attacks invented for this game and bolted onto a
 * whole evolution LINE by its base-species (National Dex) id, so a marquee family
 * plays unlike anything the type tables could produce. A member inherits the
 * signature of the nearest ancestor that defines one (so one entry covers a
 * linear line; a branched line overrides only where it diverges), and its power
 * scales down for earlier stages (see signatureMoveFor) — a Charmander's blast is
 * a softer echo of Charizard's.
 *
 * They lean on the two custom riders — `selfStage` (a guaranteed self stat-tax
 * paid on every hit) and `lockTurns` (the move benches its own type for a beat
 * after firing) — to trade raw power for a real drawback. The stored `power` is
 * the FINAL-stage value. Woven in first by movesFor so a line's identity move is
 * never crowded out of its pool.
 */
const LINE_SIGNATURES: Record<number, Move> = {
  // --- The original marquee thirteen, now keyed by line base ---

  // Ponyta line (Rapidash) — a headlong blazing charge: it almost always sears
  // the foe, but running this hot costs the horse its own footing.
  77: {
    ...mk('Searing Gallop', 'fire', 100, 1, { kind: 'burn', chance: 0.5 }, 'physical'),
    selfStage: { stat: 'spd', delta: -1 },
  },
  // The Kanto starters' "ultimate" blasts — colossal single hits whose cannons /
  // furnace / root-network need a couple of turns to repower.
  7: { ...mk('Hydro Cannon', 'water', 150, 0.95), lockTurns: 3 }, // Squirtle line
  4: { ...mk('Blast Burn', 'fire', 150, 0.95), lockTurns: 3 }, // Charmander line
  1: { ...mk('Frenzy Plant', 'grass', 150, 0.95), lockTurns: 3 }, // Bulbasaur line
  // Bagon line (Salamence) — a meteor swarm called down from on high.
  371: {
    ...mk('Draco Meteor', 'dragon', 130, 0.95, undefined, 'physical'),
    selfStage: { stat: 'atk', delta: -2 },
  },
  // Gastly line (Gengar) — a creeping shadow that smothers the foe in toxin.
  92: mk('Shadow Smother', 'ghost', 90, 1, { kind: 'poison', chance: 1 }, 'energy'),
  // Machop line (Machamp) — a wild, telegraphed haymaker that always confuses.
  66: mk('Dynamic Punch', 'fighting', 100, 0.8, { kind: 'confuse', chance: 1 }),
  // Magikarp line (Gyarados) — a thrashing assault that leaves its guard open.
  129: {
    ...mk('Thrash', 'water', 130, 1, undefined, 'physical'),
    selfStage: { stat: 'def', delta: -1 },
  },
  // Larvitar line (Tyranitar) — a crushing avalanche that always caves Defense.
  246: mk('Sandstorm Slam', 'rock', 120, 0.9, {
    kind: 'stage',
    stat: 'def',
    delta: -1,
    chance: 1,
    target: 'foe',
  }),
  // Abra line (Alakazam) — a single psionic detonation it can't fire twice running.
  63: { ...mk('Psycho Boost', 'psychic', 140, 0.9), lockTurns: 2 },
  // Aron line (Aggron) — hurls its whole steel-clad bulk, always bowling the foe over.
  304: mk('Heavy Slam', 'steel', 130, 1, {
    kind: 'stage',
    stat: 'spd',
    delta: -1,
    chance: 1,
    target: 'foe',
  }),
  // Zubat line (Crobat) — a vampiric flurry of fangs that drains deep.
  41: mk('Vampire Fang', 'poison', 95, 1, { kind: 'lifesteal', fraction: 0.75 }),

  // --- Gen I signature pass (sample) ---

  // Pikachu line — the cheek-sparked suicide charge.
  25: mk('Volt Tackle', 'electric', 120, 1, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
  // Sandshrew line (Sandslash) — a spinning earth-render that shreds the foe's guard.
  27: mk('Sand Spiral', 'ground', 95, 1, {
    kind: 'stage',
    stat: 'def',
    delta: -1,
    chance: 0.3,
    target: 'foe',
  }),
  // Nidoran♂ line (Nidoking) — a regal quake that cracks open the foe's Defense.
  32: mk('Regal Quake', 'ground', 110, 0.95, {
    kind: 'stage',
    stat: 'def',
    delta: -1,
    chance: 0.3,
    target: 'foe',
  }),
  // Nidoran♀ line (Nidoqueen) — a poison-barbed bulwark blow that badly poisons.
  29: mk('Venom Bulwark', 'poison', 90, 1, { kind: 'poison', chance: 1 }, 'physical'),
  // Vulpix line (Ninetales) — nine spectral flames that wreathe the foe in fire.
  37: mk('Ninefold Flame', 'fire', 85, 1, { kind: 'burn', chance: 0.4 }),
  // Oddish line (Vileplume / Bellossom) — a drowsy bloom of paralysing spores.
  43: mk('Spore Bloom', 'grass', 95, 1, { kind: 'stun', chance: 0.4 }),
  // Diglett line (Dugtrio) — three heads strike as one, a flinch-inducing ambush.
  50: mk('Triple Dig', 'ground', 90, 1, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Growlithe line (Arcanine) — a legendary blazing rush that scorches on contact.
  58: mk('Legend Blaze', 'fire', 110, 1, { kind: 'burn', chance: 0.3 }, 'physical'),
  // Geodude line (Golem) — curls up and bowls the foe over, flinching on impact.
  74: mk('Boulder Roll', 'rock', 110, 0.9, { kind: 'flinch', chance: 0.3 }),
  // Shellder line (Cloyster) — a volley of impaling icicles behind its shell.
  90: mk('Spike Cannon', 'ice', 110, 0.9, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Staryu line (Starmie) — a whirling cosmic beam from its core gem.
  120: mk('Cosmic Spiral', 'psychic', 110, 0.95, undefined, 'energy'),
  // Scyther line (Scizor) — a blinding cross-slash of blades.
  123: mk('Cross Reaper', 'bug', 100, 1, { kind: 'flinch', chance: 0.2 }, 'physical'),
  // Lapras (standalone) — a tidal freeze that locks the foe in place.
  131: mk('Tidal Freeze', 'water', 110, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Eevee line — adaptive surge: a versatile burst keyed to its Normal core.
  // NOTE: branched line — the eeveelutions all inherit this Normal-typed move. A
  // per-branch (type-matched) signature is an open question for the fan-out.
  133: mk('Adaptive Surge', 'normal', 95, 1, undefined, 'energy'),
  // Snorlax line — a full-bodied slam so heavy it must recover after landing it.
  143: { ...mk('Giga Impact', 'normal', 150, 0.9, undefined, 'physical'), lockTurns: 2 },
  // Articuno — a sweeping aurora of ice.
  144: mk('Frost Aegis', 'ice', 110, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Zapdos — a sky-splitting bolt.
  145: mk('Sky Voltage', 'electric', 120, 0.9, { kind: 'stun', chance: 0.3 }),
  // Moltres — a plummeting pyre.
  146: mk('Sky Pyre', 'fire', 120, 0.9, { kind: 'burn', chance: 0.3 }),
  // Dratini line (Dragonite) — a crushing wyrm strike that buckles the foe's Defense.
  147: mk(
    'Wyrm Crush',
    'dragon',
    120,
    1,
    { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' },
    'physical',
  ),
  // Mewtwo — its mind made manifest as a piercing strike.
  150: { ...mk('Psystrike', 'psychic', 130, 0.95, undefined, 'energy'), lockTurns: 2 },
  // Mew — the source genome, a flowing pulse of pure potential (no drawback).
  151: mk('Genome Pulse', 'psychic', 110, 1, undefined, 'energy'),
};

// child dex id -> the species it evolves FROM (built from EVOLUTIONS).
const SIG_PARENT: Map<number, number> = (() => {
  const p = new Map<number, number>();
  for (const [from, tos] of Object.entries(EVOLUTIONS)) {
    for (const to of tos) p.set(to, Number(from));
  }
  return p;
})();

/** Walk to the base species at the top of this dex id's evolution line. */
function lineRoot(dexId: number): number {
  let cur = dexId;
  while (SIG_PARENT.has(cur)) cur = SIG_PARENT.get(cur)!;
  return cur;
}
/** How many evolution steps `dexId` sits below its line's base species. */
function depthFromRoot(dexId: number): number {
  let d = 0;
  let cur = dexId;
  while (SIG_PARENT.has(cur)) {
    cur = SIG_PARENT.get(cur)!;
    d++;
  }
  return d;
}
// Longest downward evolution chain from a node, memoised across the dex.
const MAX_DEPTH_MEMO = new Map<number, number>();
function maxDepthFrom(dexId: number): number {
  const hit = MAX_DEPTH_MEMO.get(dexId);
  if (hit !== undefined) return hit;
  const kids = EVOLUTIONS[dexId] ?? [];
  const d = kids.length === 0 ? 0 : 1 + Math.max(...kids.map(maxDepthFrom));
  MAX_DEPTH_MEMO.set(dexId, d);
  return d;
}

// Each evolution stage below the final form softens the line's signature by this
// much; a pre-evo never falls below SIG_MIN_SCALE of the final power.
const SIG_STAGE_FALLOFF = 0.15;
const SIG_MIN_SCALE = 0.6;

/**
 * The signature move for a species, or undefined. Resolves the nearest
 * ancestor-or-self in {@link LINE_SIGNATURES} and scales its (final-stage) power
 * down for earlier evolution stages, so a whole line shares one identity move
 * that grows as it evolves. Damaging riders (burn chance, lifesteal fraction, …)
 * and lockouts are NOT scaled — only raw power.
 */
export function signatureMoveFor(dexId: number): Move | undefined {
  let spec: Move | undefined;
  let cur: number | undefined = dexId;
  while (cur !== undefined) {
    if (LINE_SIGNATURES[cur]) {
      spec = LINE_SIGNATURES[cur];
      break;
    }
    cur = SIG_PARENT.get(cur);
  }
  if (!spec) return undefined;
  if (spec.power <= 0) return { ...spec };
  const root = lineRoot(dexId);
  const below = Math.max(0, maxDepthFrom(root) - depthFromRoot(dexId));
  const scale = Math.max(SIG_MIN_SCALE, 1 - SIG_STAGE_FALLOFF * below);
  return { ...spec, power: Math.max(1, Math.round(spec.power * scale)) };
}

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
// Energy-side mirrors of Swords Dance / Iron Defense: Nasty Plot pumps Energy
// Attack, Amnesia fortifies Energy Defense. Handed to energy-leaning attackers
// and energy-warding walls so the Physical/Energy split has setup on both axes.
const NASTY_PLOT = mk('Nasty Plot', 'dark', 0, 1, {
  kind: 'stage',
  stat: 'eatk',
  delta: 2,
  chance: 1,
  target: 'self',
});
const AMNESIA = mk('Amnesia', 'psychic', 0, 1, {
  kind: 'stage',
  stat: 'edef',
  delta: 2,
  chance: 1,
  target: 'self',
});
// Calm Mind: the energy counterpart to Bulk Up — raises Energy Attack and
// Energy Defense together, so a special attacker can snowball offence and bulk.
const CALM_MIND = mk('Calm Mind', 'psychic', 0, 1, {
  kind: 'multistage',
  stages: [
    { stat: 'eatk', delta: 1 },
    { stat: 'edef', delta: 1 },
  ],
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

// Three power-0 volatile disruptions (each shows its own battle badge):
// - Weigh Down: a heavy Speed cut that flips the turn order for a slow bruiser.
// - Sand Attack: grit in the eyes — saps the foe's own accuracy.
// - Disable: locks down the foe's single strongest move.
// Type matters only for immunity, the same as Will-O-Wisp/Thunder Wave: Sand
// Attack (Ground) misses Flying/Levitate; Weigh Down (Rock) and Disable (Dark)
// carry no immunity, so they always land. The AI skips an immune target.
const WEIGH_DOWN = mk('Weigh Down', 'rock', 0, 1, { kind: 'weight', chance: 1 });
const SAND_ATTACK = mk('Sand Attack', 'ground', 0, 1, { kind: 'blind', chance: 1 });
const DISABLE = mk('Disable', 'dark', 0, 1, { kind: 'disarm', chance: 1 });

// Confuse Ray: a no-damage Ghost utility that confuses the foe outright. Shares
// the pure-status pipeline with Will-O-Wisp/Thunder Wave (confusion is already a
// status rider kind), so the AI's "spread status" logic uses it for free. It is
// also the Ghost type's `status` kit entry.
const CONFUSE_RAY = TYPE_KITS.ghost.status!;

// Frost Veil: a no-damage Ice utility that frostbites the foe outright — the
// energy-side mirror of Will-O-Wisp. Frostbite halves the foe's Energy Attack and
// chips its HP each turn, so it's the special sweeper's counter the way a burn
// answers a physical one. Shares the pure-status pipeline (frostbite is a status
// rider kind), so the AI's "spread status" logic wields it for free.
const FROST_VEIL = mk('Frost Veil', 'ice', 0, 0.85, {
  kind: 'frostbite',
  chance: 1,
});

// Off-type coverage offered by each element. Because a Pokémon's sign is rolled
// per run, its element-themed coverage shifts run to run — part of what keeps a
// pool feeling varied. Each entry resolves to a real damaging move from the
// type's kit, picked to match the mon's own offensive half (see coverageMove).
const ELEMENT_COVERAGE: Record<Element, PokemonType[]> = {
  fire: ['fighting', 'rock'],
  earth: ['rock', 'ground'],
  air: ['flying', 'electric'],
  water: ['ice', 'poison'],
};

// Celestial signs are element-less, so they reach for broad, premium coverage
// to match their outsized stats.
const CELESTIAL_COVERAGE: PokemonType[] = ['fighting', 'ice', 'rock', 'ground'];

/** A mon's best offensive stat (Physical or Energy Attack) and whether it leans
 *  energy. Used to route setup/coverage to the right half of the split. */
function bestOffense(s: BaseStats): number {
  return Math.max(s.atk, s.eatk);
}
function isEnergyAttacker(s: BaseStats): boolean {
  return s.eatk > s.atk;
}
/** A mon's better guard (Physical or Energy Defense). */
function bestGuard(s: BaseStats): number {
  return Math.max(s.def, s.edef);
}

/** Bulky enough to justify a sustain/defensive button (Recover, Iron Defense). */
function isBulky(s: BaseStats): boolean {
  return s.hp + bestGuard(s) >= 170;
}

/** The role-appropriate damaging line (Physical or Energy) for a stat spread,
 *  falling back to the other half if the preferred one is empty. */
function offenseLine(kit: TypeKit, stats: BaseStats): MoveLine {
  const energy = isEnergyAttacker(stats);
  const primary = energy ? kit.energy : kit.physical;
  if (primary.safe.length) return primary;
  return energy ? kit.physical : kit.energy;
}

/**
 * STAB picks for a type, ordered best-first for THIS mon. A fragile, hard-hitting
 * sweeper leads with the reckless nuke (premium power that bites back); everyone
 * else sticks to the reliable `safe` attacks and never touches the nuke. This is
 * the core of the anti-convergence design — a glass cannon and a tank of the same
 * type pull genuinely different moves from the same kit.
 */
function stabPicks(kit: TypeKit, stats: BaseStats, frail: boolean): Move[] {
  const line = offenseLine(kit, stats);
  if (frail && line.nuke) return [line.nuke, ...line.safe];
  return line.safe.slice();
}

/** A single off-type coverage attack — the reliable hit on the mon's own half. */
function coverageMove(t: PokemonType, stats: BaseStats): Move {
  return offenseLine(TYPE_KITS[t], stats).safe[0];
}

// Contact moves — punches, claws, bites, body checks and dashes — play a melee
// "Strike" (dart in, hit, dart back).
const CONTACT_MOVES = new Set([
  'Body Slam',
  'Double-Edge',
  'Quick Attack',
  'Fire Punch',
  'Fire Fang',
  'Flare Blitz',
  'Waterfall',
  'Aqua Tail',
  'Wave Crash',
  'Thunder Fang',
  'Wild Charge',
  'Seed Bomb',
  'Leaf Blade',
  'Wood Hammer',
  'Ice Fang',
  'Avalanche',
  'Drain Punch',
  'Close Combat',
  'High Jump Kick',
  'Poison Jab',
  'Gunk Shot',
  'Acrobatics',
  'Drill Peck',
  'Brave Bird',
  'Psycho Cut',
  'Zen Headbutt',
  'Leech Life',
  'X-Scissor',
  'Megahorn',
  'Shadow Claw',
  'Phantom Force',
  'Poltergeist',
  'Dragon Claw',
  'Dragon Rush',
  'Outrage',
  'Knock Off',
  'Crunch',
  'Iron Head',
  'Meteor Mash',
  'Play Rough',
  // Signature melee — a galloping body-check, a haymaker, a thrashing assault,
  // a vampiric flurry of fangs, a suicide charge, a full-bodied slam.
  'Searing Gallop',
  'Dynamic Punch',
  'Thrash',
  'Vampire Fang',
  'Volt Tackle',
  'Legend Blaze',
  'Spike Cannon',
  'Cross Reaper',
  'Giga Impact',
  'Wyrm Crush',
  'Venom Bulwark',
  'Triple Dig',
]);

// Heavy, ground-shaking moves play a big "Swing" slam.
const HEAVY_MOVES = new Set([
  'Earthquake',
  'High Horsepower',
  'Stone Edge',
  'Rock Slide',
  'Icicle Crash',
  'Head Smash',
  // Tyranitar's avalanche, Aggron's whole-body slam, and the earth-renders.
  'Sandstorm Slam',
  'Heavy Slam',
  'Boulder Roll',
  'Sand Spiral',
  'Regal Quake',
]);

// Aura / sound / beam / mind-burst specials play "SpAttack" (a stationary cast)
// rather than a fired projectile.
const SPECIAL_MOVES = new Set([
  'Hyper Voice',
  'Boomburst',
  'Flamethrower',
  'Lava Plume',
  'Fire Blast',
  'Surf',
  'Scald',
  'Hydro Pump',
  'Thunderbolt',
  'Discharge',
  'Thunder',
  'Energy Ball',
  'Giga Drain',
  'Leaf Storm',
  'Ice Beam',
  'Blizzard',
  'Aura Sphere',
  'Focus Blast',
  'Sludge Bomb',
  'Sludge Wave',
  'Earth Power',
  'Air Slash',
  'Hurricane',
  'Psychic',
  'Psyshock',
  'Bug Buzz',
  'Struggle Bug',
  'Power Gem',
  'Shadow Ball',
  'Hex',
  'Dragon Pulse',
  'Dark Pulse',
  'Snarl',
  'Flash Cannon',
  'Moonblast',
  'Dazzling Gleam',
  // Signature blasts — huge channelled bursts, cast in place rather than thrown.
  'Hydro Cannon',
  'Blast Burn',
  'Frenzy Plant',
  'Draco Meteor',
  'Shadow Smother',
  'Psycho Boost',
  'Cosmic Spiral',
  'Psystrike',
  'Genome Pulse',
  'Adaptive Surge',
  'Frost Aegis',
  'Sky Voltage',
  'Sky Pyre',
  'Tidal Freeze',
  'Ninefold Flame',
  'Spore Bloom',
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

/** How many moves a Pokémon carries. Tighter than the old 8 so the richer move
 *  menu forces real tradeoffs (a mon can't fit every good move at once), but
 *  still wider than the games' 4 so the AI has genuine choices each turn. */
export const MOVE_SLOTS = 6;

/**
 * Build a Pokémon's move pool from its types, stats and sign. Every mon carries
 * up to {@link MOVE_SLOTS} moves and the battle AI decides which to throw each
 * turn (see chooseMove in battle.ts).
 *
 * The pool is layered, best-first so attacks are never crowded out:
 *   0. Signature — the line's invented identity move (scaled to this stage).
 *   1. STAB core — role-based picks from each of the mon's types (a frail sweeper
 *      reaches for the reckless nuke; everyone else takes reliable hits).
 *   2. Coverage  — ONE element-themed off-type attack (driven by the sign, on the
 *      mon's own offensive half).
 *   3. Priority  — Quick Attack for genuinely fast attackers, and for any mon
 *      that can be born with Technician (dead weight without a ≤60 power move).
 *   4. Counter   — anti-wall tools (Super Fang / Taunt) for offensive mons.
 *   5. Setup     — exactly ONE setup/sustain button (see below).
 *   5b. Support  — at most ONE disruption move (thematic, then stat-based).
 *   6. Filler    — a second coverage hit, then Body Slam, to top up.
 *
 * Defensive button rule (anti-stall): a mon never carries both Iron Defense and
 * Recover. Offensive mons set up to hit harder/faster; a pure wall picks a single
 * tool matched to its build — defence-dominant walls fortify (Iron Defense),
 * HP-dominant walls heal (Recover).
 */
export function movesFor(
  types: PokemonType[],
  stats: BaseStats,
  sign: Sign,
  abilities: AbilityId[] = [],
  dexId?: number,
): Move[] {
  // Technician only pays off on a damaging move of 60 power or less. Key off the
  // species' ability *options* so the canonical moveset always carries the
  // enabler for a two-ability species like Scizor too.
  const hasTechnician = abilities.includes('technician');
  const moves: Move[] = [];
  const seen = new Set<string>();
  const add = (m: Move | undefined) => {
    if (!m || seen.has(m.name)) return;
    seen.add(m.name);
    moves.push(m);
  };

  const energyAtk = isEnergyAttacker(stats);
  const off = bestOffense(stats);
  const bulky = isBulky(stats);
  // A fragile, hard-hitting attacker — the profile that earns the reckless nukes.
  const frail = !bulky && off >= 95;

  // 0) Signature move — slotted first so a line's identity is never crowded out.
  if (dexId !== undefined) add(signatureMoveFor(dexId));

  // 1) STAB core — role-based, fewer per type than the old "both moves" dump so
  //    the freed slots go to coverage/utility (single-type mons get two, dual
  //    types one each).
  const stabPerType = types.length >= 2 ? 1 : 2;
  for (const t of types) {
    for (const m of stabPicks(TYPE_KITS[t], stats, frail).slice(0, stabPerType)) add(m);
  }

  // 2) One element-themed coverage attack for off-type reach. Celestial signs
  //    have no element, so they draw from a broad premium-coverage set instead.
  const element = SIGN_INFO[sign].element;
  const coverage = element ? ELEMENT_COVERAGE[element] : CELESTIAL_COVERAGE;
  const offType = coverage.find((t) => !types.includes(t));
  if (offType) add(coverageMove(offType, stats));

  // 3) Priority for fast, hard-hitting attackers — and for Technician mons,
  //    whose ability is dead without a sub-60 move to wring power from.
  if (
    hasTechnician ||
    (stats.spd >= 95 && stats.atk >= 80) ||
    (stats.spd >= 90 && stats.eatk >= 80)
  ) {
    add(QUICK_ATTACK);
  }

  // 4) Anti-wall counterplay for offensive mons — the answer TO bulk, so walls
  //    themselves never get it. Hard hitters carry Super Fang (DEF-ignoring
  //    chip); fast mons carry Taunt (stall-breaker).
  if (!bulky && off >= 85) add(SUPER_FANG);
  if (!bulky && stats.spd >= 90) add(TAUNT);

  // 5) Exactly one setup/sustain button. Type-flavored dual-stat setups take
  //    precedence for the attackers that fit them, then a single-stat offence
  //    setup matched to the mon's stronger attack, then a pure wall's fortify/
  //    heal. Never two setup buttons together.
  if (off >= 90 && types.includes('dragon') && !energyAtk) {
    add(DRAGON_DANCE);
    if (bulky) add(RECOVER);
  } else if (off >= 90 && types.includes('fighting') && !energyAtk) {
    add(BULK_UP);
    if (bulky) add(RECOVER);
  } else if (off >= 90 && types.includes('psychic') && energyAtk) {
    add(CALM_MIND); // an energy psychic snowballs offence + special bulk
    if (bulky) add(RECOVER);
  } else if (off >= 100) {
    add(energyAtk ? NASTY_PLOT : SWORDS_DANCE);
    if (bulky) add(RECOVER); // bulky attacker may still pack sustain
  } else if (off >= 85 && stats.spd >= 95) {
    // Fast attackers with good (not elite) offence still get a setup button.
    add(energyAtk ? NASTY_PLOT : SWORDS_DANCE);
  } else if (stats.spd >= 95 && !bulky) {
    add(AGILITY);
  } else if (bulky) {
    // Pure wall: fortify if defence-dominant, otherwise heal. Fortify the half
    // it's already better at (Iron Defense for physical, Amnesia for energy).
    if (bestGuard(stats) >= stats.hp) {
      add(stats.edef > stats.def ? AMNESIA : IRON_DEFENSE);
    } else {
      add(RECOVER);
    }
  }

  // 5b) One support/disruption move — thematic where the typing fits, otherwise
  //     stat-based — capped at a single pick. The battle AI decides when to
  //     actually throw these (see chooseMove).
  if (types.includes('fairy') && bestGuard(stats) >= off) {
    add(CHARM); // defensive Fairy saps the foe's Attack
  } else if (types.includes('ghost')) {
    add(CONFUSE_RAY); // Ghosts disrupt with confusion
  } else if (types.includes('ice')) {
    add(FROST_VEIL); // Ice chills the foe's Energy Attack — the special-side burn
  } else if (bulky && off >= 90) {
    add(SCREECH); // bulky attacker melts a wall's Defense
  } else if ((types.includes('rock') || types.includes('steel')) && stats.spd <= 80) {
    add(WEIGH_DOWN); // heavy stone/metal bears the foe down to steal the turn
  } else if (types.includes('ground')) {
    add(SAND_ATTACK); // ground-types kick grit to blind the foe (the canonical user)
  } else if (types.includes('dark')) {
    add(DISABLE); // dark-types sabotage the foe's single strongest move
  } else if (bulky && stats.spd <= 70) {
    add(SCARY_FACE); // non-heavy slow wall flips the speed tier
  }

  // 6) Top-up fillers: a second off-type coverage hit, then dependable Body Slam.
  for (const t of coverage) {
    if (!types.includes(t)) add(coverageMove(t, stats));
  }
  add(BODY_SLAM);

  const pool = moves.slice(0, MOVE_SLOTS);

  // Technician guarantee: a Technician mon must keep at least one move it can
  // actually boost (power 1–60). If a crowded pool pushed Quick Attack past the
  // cut, reclaim the last (lowest-priority) slot for it.
  if (hasTechnician && !pool.some((m) => m.power > 0 && m.power <= 60)) {
    pool[pool.length - 1] = QUICK_ATTACK;
  }

  // Build/offence floor: guarantee the pool can actually leverage the mon's
  // stronger attack — at least ~30% of the slots must be damaging moves of its
  // offensive category. Most mons clear this on STAB alone; it only fires on
  // cross-category builds (e.g. a physical build of an energy-typed species).
  ensureCategoryFloor(pool, stats, dexId, hasTechnician);

  return pool;
}

/** Minimum share of the move pool that must match the mon's offensive category. */
const CATEGORY_FLOOR = 0.3;

// Broadly-available coverage on each side of the split, used to top a pool up to
// the category floor when the mon's typing alone can't. Real, defined moves only
// — drawn in order, skipping anything already carried. Strongest/most-neutral
// first.
const PHYSICAL_FILLER: Move[] = [
  TYPE_KITS.ground.physical.safe[0], // Earthquake
  TYPE_KITS.rock.physical.safe[1], // Stone Edge
  TYPE_KITS.fighting.physical.safe[1], // Close Combat
  TYPE_KITS.dark.physical.safe[1], // Crunch
  TYPE_KITS.steel.physical.safe[0], // Iron Head
  TYPE_KITS.ice.physical.safe[1], // Icicle Crash
  TYPE_KITS.normal.physical.safe[0], // Body Slam
];
const ENERGY_FILLER: Move[] = [
  TYPE_KITS.fire.energy.safe[0], // Flamethrower
  TYPE_KITS.electric.energy.safe[0], // Thunderbolt
  TYPE_KITS.ice.energy.safe[0], // Ice Beam
  TYPE_KITS.psychic.energy.safe[0], // Psychic
  TYPE_KITS.water.energy.safe[0], // Surf
  TYPE_KITS.grass.energy.safe[0], // Energy Ball
  TYPE_KITS.normal.energy.safe[0], // Hyper Voice
];

/**
 * Top a finished pool up so at least {@link CATEGORY_FLOOR} of its slots are
 * damaging moves matching the mon's offensive category (Physical if atk ≥ eatk,
 * else Energy). Mutates `pool` in place. Never displaces the signature (slot 0),
 * a Technician enabler, or a slot that already matches the wanted category —
 * replacing only the lowest-priority off-category/utility slots.
 */
function ensureCategoryFloor(
  pool: Move[],
  stats: BaseStats,
  dexId: number | undefined,
  hasTechnician: boolean,
): void {
  const want: MoveCategory = isEnergyAttacker(stats) ? 'energy' : 'physical';
  const need = Math.ceil(MOVE_SLOTS * CATEGORY_FLOOR);
  const matches = (m: Move) => m.power > 0 && moveCategory(m) === want;
  let have = pool.filter(matches).length;
  if (have >= need) return;

  const hasSignature = dexId !== undefined && signatureMoveFor(dexId) !== undefined;
  const present = new Set(pool.map((m) => m.name));
  const filler = want === 'energy' ? ENERGY_FILLER : PHYSICAL_FILLER;

  for (const repl of filler) {
    if (have >= need) break;
    if (present.has(repl.name)) continue;
    // Replace the lowest-priority slot we're allowed to touch (scan from the end).
    for (let i = pool.length - 1; i >= 0; i--) {
      if (i === 0 && hasSignature) continue; // never bump the signature
      const cur = pool[i];
      if (matches(cur)) continue; // don't trade a matching move for another
      if (hasTechnician && cur.name === QUICK_ATTACK.name) continue; // keep the enabler
      present.delete(cur.name);
      present.add(repl.name);
      pool[i] = repl;
      have++;
      break;
    }
  }
}

/**
 * The set of moves a given species may legally swap *into* a slot via the
 * post-battle "tweak a move" reward — its STAB (both halves + the type status),
 * every off-type coverage it could roll under any sign, its signature, a spread
 * of generic coverage on both halves of the split, and the universal utility/
 * setup kit. Deterministic from (types, dexId) ALONE — never the current moveset,
 * sign or build — so the client's picker and the server's anti-cheat validation
 * always agree. Returned in a stable, readable order; the UI filters out moves
 * already equipped.
 */
export function candidateMovesFor(types: PokemonType[], dexId?: number): Move[] {
  const out: Move[] = [];
  const seen = new Set<string>();
  const add = (m: Move | undefined) => {
    if (!m || seen.has(m.name)) return;
    seen.add(m.name);
    out.push(m);
  };

  // STAB + signature first (the mon's core identity) — both halves, the nuke, and
  // the type's status move.
  for (const t of types) {
    const kit = TYPE_KITS[t];
    for (const m of kit.physical.safe) add(m);
    add(kit.physical.nuke);
    for (const m of kit.energy.safe) add(m);
    add(kit.energy.nuke);
    add(kit.status);
  }
  if (dexId !== undefined) add(signatureMoveFor(dexId));
  // Every element's premium coverage + the celestial set — the full breadth of
  // off-type reach the mon could otherwise only roll one slice of per sign, on
  // both halves so a mixed mon can lean either way.
  const coverTypes = new Set<PokemonType>([
    ...Object.values(ELEMENT_COVERAGE).flat(),
    ...CELESTIAL_COVERAGE,
  ]);
  for (const t of coverTypes) {
    const kit = TYPE_KITS[t];
    add(kit.physical.safe[0]);
    add(kit.energy.safe[0]);
  }
  // Generic coverage on both halves of the split.
  for (const m of PHYSICAL_FILLER) add(m);
  for (const m of ENERGY_FILLER) add(m);
  // Universal utility & setup kit.
  for (const m of [
    QUICK_ATTACK,
    SUPER_FANG,
    TAUNT,
    RECOVER,
    SWORDS_DANCE,
    NASTY_PLOT,
    AGILITY,
    IRON_DEFENSE,
    AMNESIA,
    CALM_MIND,
    DRAGON_DANCE,
    BULK_UP,
    CHARM,
    SCREECH,
    SCARY_FACE,
    CONFUSE_RAY,
  ]) {
    add(m);
  }
  return out;
}

/**
 * Roll a small, seed-pinned set of replacement moves for the post-battle "Tweak a
 * Move" reward. Draws from the species' full legal pool (candidateMovesFor), drops
 * any move the mon already runs, then shuffles with a seeded RNG so the same
 * (run, stage, team-slot, move-slot) always rolls the same options. Returns up to
 * `count` moves (fewer only if the pool is small).
 */
export function rollMoveOptions(
  types: PokemonType[],
  dexId: number | undefined,
  exclude: readonly string[],
  seed: string,
  count = 3,
): Move[] {
  const skip = new Set(exclude);
  const pool = candidateMovesFor(types, dexId).filter((m) => !skip.has(m.name));
  return new RNG(seed).shuffle(pool).slice(0, count);
}

// Every move the game can hand out, indexed by name — the authority the move
// registry resolves a stored override name back to a full Move object through
// (see moveByName), and a deterministic list both client and server share.
const MOVE_BY_NAME: Map<string, Move> = (() => {
  const map = new Map<string, Move>();
  const reg = (m: Move | undefined) => {
    if (m && !map.has(m.name)) map.set(m.name, m);
  };
  for (const kit of Object.values(TYPE_KITS)) {
    for (const m of kit.physical.safe) reg(m);
    reg(kit.physical.nuke);
    for (const m of kit.energy.safe) reg(m);
    reg(kit.energy.nuke);
    reg(kit.status);
  }
  // Signatures register at their FINAL (unscaled) power; the per-stage scaling
  // only ever applies to the default slot-0 placement, never to name lookups.
  for (const m of Object.values(LINE_SIGNATURES)) reg(m);
  for (const m of [
    QUICK_ATTACK,
    SUPER_FANG,
    TAUNT,
    RECOVER,
    BODY_SLAM,
    SWORDS_DANCE,
    NASTY_PLOT,
    AGILITY,
    IRON_DEFENSE,
    AMNESIA,
    CALM_MIND,
    DRAGON_DANCE,
    BULK_UP,
    CHARM,
    SCREECH,
    SCARY_FACE,
    CONFUSE_RAY,
  ]) {
    reg(m);
  }
  return map;
})();

/** Resolve a move name to its canonical Move object (undefined if unknown). */
export function moveByName(name: string): Move | undefined {
  return MOVE_BY_NAME.get(name);
}

/** Apply slot→Move overrides onto a derived move list (out-of-range slots are
 *  ignored). Returns a fresh array; the input is left untouched. */
export function applyMoveOverrides(
  moves: Move[],
  overrides: Record<number, Move> | undefined,
): Move[] {
  if (!overrides) return moves;
  const out = moves.slice();
  for (const [slot, move] of Object.entries(overrides)) {
    const i = Number(slot);
    if (Number.isInteger(i) && i >= 0 && i < out.length) out[i] = move;
  }
  return out;
}

/** Smallest ratio (lower attack ÷ higher attack) for a species to still count as
 *  a genuinely *mixed* attacker — and so roll a Physical/Energy build (see
 *  canRollBuild). At 0.75, a mon whose weaker attack is within a quarter of its
 *  stronger one is "mixed" (e.g. Starmie's 75/100); anything more lopsided keeps
 *  its fixed natural lean. */
const MIXED_BUILD_TOLERANCE = 0.75;
/** A mixed mon must also actually hit hard enough for the choice to matter. */
const MIXED_BUILD_MIN_ATTACK = 70;
/** How far a chosen build tilts the two attack stats around their shared mean
 *  (±12%): budget-neutral, but a clear, usable lean (a 100/100 → 112/88). */
const BUILD_SPREAD = 0.1;

/**
 * Whether a species is a genuinely *mixed* attacker — its Physical and Energy
 * Attack sit within {@link MIXED_BUILD_TOLERANCE} of each other and are high
 * enough to matter — and so can be drafted as either a Physical or Energy build.
 * Clearly-lopsided mons (a 130/65 bruiser) return false: they have no real choice
 * to make and keep their natural stats untouched.
 */
export function canRollBuild(s: BaseStats): boolean {
  const hi = Math.max(s.atk, s.eatk);
  const lo = Math.min(s.atk, s.eatk);
  return hi >= MIXED_BUILD_MIN_ATTACK && lo / hi >= MIXED_BUILD_TOLERANCE;
}

/**
 * Redistribute a (mixed) stat line's two attack stats for the chosen build: the
 * build's side rises and the other falls by {@link BUILD_SPREAD} around their
 * shared mean, so the total offensive budget is preserved while the identity
 * becomes decisive. Defenses, HP and Speed are left alone. Caller is responsible
 * for only applying this to canRollBuild species.
 */
export function redistributeForBuild(s: BaseStats, build: Build): BaseStats {
  const avg = (s.atk + s.eatk) / 2;
  const hi = Math.round(avg * (1 + BUILD_SPREAD));
  const lo = Math.round(avg * (1 - BUILD_SPREAD));
  return build === 'physical'
    ? { ...s, atk: hi, eatk: lo }
    : { ...s, atk: lo, eatk: hi };
}
