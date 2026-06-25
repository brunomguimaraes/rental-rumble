import type { Creature, PokemonType, RelicId, RelicMods } from './types.js';
import type { Difficulty } from './run.js';
import { RNG } from './rng.js';
import { teamHasAbility } from './abilities.js';
import { relicOfferCountForTeam, treasureHoundBonus } from './ability-effects.js';

/**
 * Team-wide passive "relics" — the Slay-the-Spire-style run-long buffs the
 * player collects from item events between battles. Each relic is built from a
 * held-item sprite (public/sprites/items/<icon>.png) and grants a small, fair
 * team-wide effect resolved once per fight by `relicMods` (see types.ts:RelicMods).
 *
 * Relics are deliberately gentle and stack additively, mirroring how shinies and
 * zodiac signs nudge — never warp — the meta. Effects are pure and seed-free, so
 * the deterministic battle sim (and the server's leaderboard re-sim) reproduce a
 * relic run exactly from the collected ids alone.
 */

export type RelicRarity = 'common' | 'rare' | 'legendary';

export interface RelicDef {
  id: RelicId;
  name: string;
  /** Lowercased item-art filename in public/sprites/items (see itemUrl). */
  icon: string;
  rarity: RelicRarity;
  /** Short player-facing blurb of what the relic does. */
  description: string;
  /**
   * Earliest ladder stage this relic may be offered at (the index of the battle
   * it appears before). Keeps the punchier relics out of the opening stretch.
   */
  minStage?: number;
  /**
   * The move type this relic powers up. Set only on the type-booster relics,
   * which are offered only when the team actually fields that type (see
   * `relicRelevant`). Absent on general-purpose relics.
   */
  boostType?: PokemonType;
  /** Folds this relic's effect into the running team mods. */
  apply: (m: RelicMods) => void;
}

const STAT_BOOST = {
  def: 1.18,
  spd: 1.15,
} as const;

/** How much a type-booster lifts its matching move type. */
const TYPE_BOOST = 1.1;

/** A type-booster relic def, generated so all 18 types share one shape. */
function typeRelic(
  id: RelicId,
  name: string,
  icon: string,
  type: PokemonType,
): RelicDef {
  return {
    id,
    name,
    icon,
    rarity: 'common',
    boostType: type,
    description: `Powers up the team's ${type}-type moves.`,
    apply: (m) => {
      m.dmgMult[type] = (m.dmgMult[type] ?? 1) * TYPE_BOOST;
    },
  };
}

export const RELICS: Record<RelicId, RelicDef> = {
  leftovers: {
    id: 'leftovers',
    name: 'Leftovers',
    icon: 'leftovers',
    rarity: 'common',
    description: 'Your active Pokémon recovers a little HP at the end of every turn.',
    apply: (m) => {
      m.endTurnHeal += 1 / 16;
    },
  },
  assaultvest: {
    id: 'assaultvest',
    name: 'Assault Vest',
    icon: 'assaultvest',
    rarity: 'common',
    description: `Toughens the whole team's Physical & Energy Defense.`,
    apply: (m) => {
      m.defMult *= STAT_BOOST.def;
      m.edefMult *= STAT_BOOST.def;
    },
  },
  quickclaw: {
    id: 'quickclaw',
    name: 'Quick Claw',
    icon: 'quickclaw',
    rarity: 'common',
    description: `Quickens the whole team's Speed.`,
    apply: (m) => {
      m.spdMult *= STAT_BOOST.spd;
    },
  },
  wiseglasses: {
    id: 'wiseglasses',
    name: 'Wise Glasses',
    icon: 'wiseglasses',
    rarity: 'common',
    description: 'A small boost to all the damage your team deals.',
    apply: (m) => {
      m.allDmgMult *= 1.1;
    },
  },
  shellbell: {
    id: 'shellbell',
    name: 'Shell Bell',
    icon: 'shellbell',
    rarity: 'rare',
    minStage: 2,
    description: 'Heals your active Pokémon for a portion of the damage it deals.',
    apply: (m) => {
      m.lifesteal += 0.15;
    },
  },
  lifeorb: {
    id: 'lifeorb',
    name: 'Life Orb',
    icon: 'lifeorb',
    rarity: 'legendary',
    minStage: 4,
    description: 'A big boost to all the damage your team deals.',
    apply: (m) => {
      m.allDmgMult *= 1.3;
    },
  },
  silkscarf: typeRelic('silkscarf', 'Silk Scarf', 'silkscarf', 'normal'),
  charcoal: typeRelic('charcoal', 'Charcoal', 'charcoal', 'fire'),
  mysticwater: typeRelic('mysticwater', 'Mystic Water', 'mysticwater', 'water'),
  magnet: typeRelic('magnet', 'Magnet', 'magnet', 'electric'),
  miracleseed: typeRelic('miracleseed', 'Miracle Seed', 'miracleseed', 'grass'),
  nevermeltice: typeRelic('nevermeltice', 'Never-Melt Ice', 'nevermeltice', 'ice'),
  blackbelt: typeRelic('blackbelt', 'Black Belt', 'blackbelt', 'fighting'),
  poisonbarb: typeRelic('poisonbarb', 'Poison Barb', 'poisonbarb', 'poison'),
  softsand: typeRelic('softsand', 'Soft Sand', 'softsand', 'ground'),
  sharpbeak: typeRelic('sharpbeak', 'Sharp Beak', 'sharpbeak', 'flying'),
  twistedspoon: typeRelic('twistedspoon', 'Twisted Spoon', 'twistedspoon', 'psychic'),
  silverpowder: typeRelic('silverpowder', 'Silver Powder', 'silverpowder', 'bug'),
  hardstone: typeRelic('hardstone', 'Hard Stone', 'hardstone', 'rock'),
  spelltag: typeRelic('spelltag', 'Spell Tag', 'spelltag', 'ghost'),
  dragonfang: typeRelic('dragonfang', 'Dragon Fang', 'dragonfang', 'dragon'),
  blackglasses: typeRelic('blackglasses', 'Black Glasses', 'blackglasses', 'dark'),
  metalcoat: typeRelic('metalcoat', 'Metal Coat', 'metalcoat', 'steel'),
  fairyfeather: typeRelic('fairyfeather', 'Fairy Feather', 'fairyfeather', 'fairy'),
};

export const ALL_RELICS: RelicId[] = Object.keys(RELICS) as RelicId[];

export function isRelicId(v: unknown): v is RelicId {
  return typeof v === 'string' && v in RELICS;
}

/** Identity mods: leave a relic-free side byte-identical to the old engine. */
export function identityMods(): RelicMods {
  return {
    atkMult: 1,
    eatkMult: 1,
    defMult: 1,
    edefMult: 1,
    spdMult: 1,
    allDmgMult: 1,
    dmgMult: {},
    lifesteal: 0,
    endTurnHeal: 0,
  };
}

/** Resolve a set of collected relics into the team-wide battle mods they grant. */
export function relicMods(relics: readonly RelicId[] | undefined): RelicMods {
  const m = identityMods();
  if (!relics) return m;
  for (const id of relics) {
    const def = RELICS[id];
    if (def) def.apply(m);
  }
  return m;
}

/**
 * The total damage multiplier an attacker's relics grant a move of `type`: the
 * flat all-damage boost times any matching type-booster. 1 when the team holds
 * no damage relics, so ordinary hits are unchanged.
 */
export function relicDamageMult(mods: RelicMods, type: PokemonType): number {
  return mods.allDmgMult * (mods.dmgMult[type] ?? 1);
}

/**
 * Whether a relic is worth offering to this team right now. Type boosters are
 * only relevant when the team actually fields a mon of that type — no point
 * offering a Charcoal to a team with no Fire moves.
 */
export function relicRelevant(def: RelicDef, team: readonly Creature[]): boolean {
  if (def.boostType) {
    return team.some((c) => c.types.includes(def.boostType!));
  }
  return true;
}

/** Draw weight for a relic's rarity, with legendaries ramping up deeper in. */
function rarityWeight(
  rarity: RelicRarity,
  stage: number,
  pickup = false,
  bargain = false,
): number {
  void bargain;
  if (rarity === 'common') return 100;
  if (rarity === 'rare') return pickup ? 48 : 32;
  const leg = 5 + stage;
  return pickup ? leg * 2 : leg;
}

/** Type-booster draw weight; Bargain doubles it. */
function typeBoosterWeight(bargain: boolean): number {
  return bargain ? 200 : 100;
}

/** How many distinct relics an item event offers the player to choose from. */
export const RELIC_OFFER_COUNT = 3;

/**
 * Deterministically roll the relics offered at one item event. Pinned to the run
 * seed + the stage the event appears before, so leaving and re-entering can't
 * re-fish the luck (mirrors the draft/recruit seeding). Filters out relics the
 * team already owns, ones gated behind a later stage, and type boosters the team
 * can't use, then draws `count` distinct relics weighted by rarity.
 */
export function rollRelicOffer(
  seed: string,
  stage: number,
  team: readonly Creature[],
  owned: readonly RelicId[],
  count = relicOfferCountForTeam(team, RELIC_OFFER_COUNT),
): RelicId[] {
  const eligible = ALL_RELICS.filter((id) => {
    if (owned.includes(id)) return false;
    const def = RELICS[id];
    if ((def.minStage ?? 0) > stage) return false;
    return relicRelevant(def, team);
  });

  const pickup = teamHasAbility(team, 'pickup');
  const bargain = teamHasAbility(team, 'bargain');
  const rng = new RNG(`relics:${seed}:${stage}`);
  const pool = eligible.slice();
  const picked: RelicId[] = [];
  while (picked.length < count && pool.length > 0) {
    const weights = pool.map((id) => {
      const def = RELICS[id];
      if (def.boostType) return typeBoosterWeight(bargain);
      return rarityWeight(def.rarity, stage, pickup);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.range(0, total);
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      roll -= weights[idx];
      if (roll <= 0) break;
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

/** Item events offered across a run, by difficulty (more on the longer ladders). */
export const ITEM_EVENTS: Record<Difficulty, number> = {
  easy: 1,
  normal: 2,
  hard: 3,
  master: 3,
};

/**
 * The set of stage indices an item event appears *before* for a given run. The
 * very first battle and the Champion are excluded (you get a beat to use a relic
 * before the finale), and the chosen slots are pinned to the seed so the run is
 * reproducible. Item events are interstitial — they never enter the Opponent[]
 * gauntlet — so ladder length and the Champion's stage index are untouched.
 */
export function itemEventStages(
  seed: string,
  difficulty: Difficulty,
  ladderLen: number,
  team?: readonly Creature[],
): Set<number> {
  const count = ITEM_EVENTS[difficulty] + (team ? treasureHoundBonus(team) : 0);
  const candidates: number[] = [];
  for (let i = 1; i <= ladderLen - 2; i++) candidates.push(i);
  if (candidates.length === 0 || count <= 0) return new Set();
  const rng = new RNG(`itemevents:${seed}:${difficulty}`);
  return new Set(rng.shuffle(candidates).slice(0, Math.min(count, candidates.length)));
}

/**
 * Sanitise a claimed list of relics from an untrusted source (a leaderboard
 * submission). Drops anything that isn't a real relic id, de-dupes, and caps the
 * count so a forged payload can't smuggle in a stack bigger than a run could ever
 * collect. Trusted thereafter the same way claimed signs/abilities are.
 */
export const MAX_RELICS = 8;

export function sanitizeRelics(raw: unknown): RelicId[] {
  if (!Array.isArray(raw)) return [];
  const out: RelicId[] = [];
  for (const v of raw) {
    if (isRelicId(v) && !out.includes(v)) out.push(v);
    if (out.length >= MAX_RELICS) break;
  }
  return out;
}
