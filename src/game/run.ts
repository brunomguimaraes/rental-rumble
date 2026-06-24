import type { Creature, SpecialTier } from './types.js';
import { CREATURES, withSign, withRandomPortrait } from './pokemon.js';
import { rollSign } from './zodiac.js';
import { RNG } from './rng.js';

/** Roll a fresh pool/reroll entry: a random zodiac sign + random emotion. */
function rollCreature(creature: Creature, rng: RNG): Creature {
  return withRandomPortrait(withSign(creature, rollSign(creature.stats, rng)), rng);
}

export const POOL_SIZE = 10;
export const TEAM_SIZE = 6;

/** How many candidates are offered per pick in the sequential draft. */
export const DRAFT_CHOICES = 3;

export type Difficulty = 'easy' | 'normal' | 'hard' | 'master';

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'master'];

/**
 * How "good" each difficulty is for ranking. Higher is harder, and a harder win
 * always outranks an easier one on the leaderboard — even if the easier player
 * cleared the boss first. Time only breaks ties within the same difficulty.
 */
export const DIFFICULTY_RANK: Record<Difficulty, number> = {
  easy: 0,
  normal: 1,
  hard: 2,
  master: 3,
};

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as string[]).includes(v);
}

/**
 * Shape of the gauntlet ladder per difficulty. The Champion is always a single,
 * fixed daily boss; everything before it scales up with difficulty — more random
 * trainers to warm up on, more gym leaders, and (on the high end) a second Elite.
 */
export interface GauntletShape {
  trainers: number; // 2–8 random roadside trainers
  specials: number; // 0–2 famous anime/manga cameo mini-bosses (fixed teams)
  gyms: number; // 2–4 type-themed Gym Leaders
  elites: number; // 1–2 Elite trainers
}

export const GAUNTLET_SHAPE: Record<Difficulty, GauntletShape> = {
  easy: { trainers: 2, specials: 1, gyms: 2, elites: 1 },
  normal: { trainers: 4, specials: 1, gyms: 3, elites: 1 },
  hard: { trainers: 6, specials: 2, gyms: 4, elites: 2 },
  master: { trainers: 8, specials: 2, gyms: 4, elites: 2 },
};

/** Total number of opponents in a ladder (the +1 is the Champion). */
export function gauntletLength(diff: Difficulty): number {
  const s = GAUNTLET_SHAPE[diff];
  return s.trainers + s.specials + s.gyms + s.elites + 1;
}

/**
 * The difficulty a finished run's Champion-stage index implies. The Champion is
 * the last rung, so its index is `gauntletLength(diff) - 1` — or one more when
 * the rare bonus challenger slotted in just before it. Every difficulty's ladder
 * is a distinct length, so the mapping is unambiguous. Returns null for a stage
 * that matches no ladder. Used to recover the mode when a submission's difficulty
 * label is missing or stale, instead of discarding an otherwise-legit win.
 */
export function difficultyForStage(stage: number): Difficulty | null {
  for (const diff of DIFFICULTIES) {
    const len = gauntletLength(diff);
    if (stage === len - 1 || stage === len) return diff;
  }
  return null;
}

export const DIFFICULTY_INFO: Record<
  Difficulty,
  { label: string; skips: number; blurb: string }
> = {
  easy: { label: 'Easy', skips: 5, blurb: 'A short ladder and 5 draft skips.' },
  normal: { label: 'Normal', skips: 3, blurb: 'A balanced ladder and 3 skips.' },
  hard: { label: 'Hard', skips: 1, blurb: 'A long ladder and a single skip.' },
  master: {
    label: 'Master',
    skips: 0,
    blurb: 'The full ladder, no skips at all.',
  },
};

export function isSpecial(tier: SpecialTier): boolean {
  return tier !== 'normal';
}

/** Chance a freshly-rolled draft offers a special at all. Specials are meant to
 *  be a rare treat, never guaranteed — and a draft can hold at most one. */
export const SPECIAL_POOL_CHANCE = 0.18;

/**
 * Deterministically roll a draft pool of POOL_SIZE from a seed. Specials
 * (legendary / mythical / pseudo-legendary) are rare: most pools have none, and
 * when one is allowed there is never more than one.
 */
export function rollPool(seed: string, dex: Creature[] = CREATURES): Creature[] {
  const rng = new RNG(`pool:${seed}`);
  const allowSpecial = rng.chance(SPECIAL_POOL_CHANCE);
  const shuffled = rng.shuffle(dex);
  const pool: Creature[] = [];
  let usedSpecial = false;
  for (const c of shuffled) {
    if (pool.length >= POOL_SIZE) break;
    if (isSpecial(c.tier)) {
      if (!allowSpecial || usedSpecial) continue;
      usedSpecial = true;
    }
    // The sign is auto-assigned (with variance) here — not chosen by the player.
    // Each card also gets a random emotion portrait for extra flavour.
    pool.push(rollCreature(c, rng));
  }
  return pool;
}

/**
 * Upper bound on cards a single draft can reveal: one trio per team slot plus
 * the most generous skip budget, with a little headroom. The deck is sliced to
 * this length so we never roll the whole dex up front.
 */
const DRAFT_DECK_SIZE = (TEAM_SIZE + 8) * DRAFT_CHOICES;

/**
 * Deterministically build the ordered deck a sequential draft draws from. The
 * player is shown DRAFT_CHOICES cards at a time; picking one or skipping the set
 * consumes that trio and reveals the next — always totally fresh — one. At most
 * one special may appear, randomly placed, preserving the "specials are rare,
 * at most one per draft" rule.
 */
export function rollDraftDeck(
  seed: string,
  dex: Creature[] = CREATURES,
): Creature[] {
  const rng = new RNG(`draft:${seed}`);
  const allowSpecial = rng.chance(SPECIAL_POOL_CHANCE);
  const normals = dex.filter((c) => !isSpecial(c.tier));
  const specials = dex.filter((c) => isSpecial(c.tier));
  const candidates =
    allowSpecial && specials.length > 0
      ? [...normals, rng.pick(specials)]
      : normals;
  return rng
    .shuffle(candidates)
    .slice(0, DRAFT_DECK_SIZE)
    .map((c) => rollCreature(c, rng));
}
