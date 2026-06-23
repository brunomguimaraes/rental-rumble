import type { Creature, SpecialTier } from './types';
import { CREATURES, withRole, withRandomPortrait } from './pokemon';
import { rollRole } from './roles';
import { RNG } from './rng';

/** Roll a fresh pool/reroll entry: a random eligible role + random emotion. */
function rollCreature(creature: Creature, rng: RNG): Creature {
  return withRandomPortrait(withRole(creature, rollRole(creature.stats, rng)), rng);
}

export const POOL_SIZE = 10;
export const TEAM_SIZE = 6;

/** How many candidates are offered per pick in the sequential draft. */
export const DRAFT_CHOICES = 3;

export type Difficulty = 'easy' | 'normal' | 'hard' | 'master';

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'master'];

export const DIFFICULTY_INFO: Record<
  Difficulty,
  { label: string; skips: number; blurb: string }
> = {
  easy: { label: 'Easy', skips: 5, blurb: 'Skip up to 5 sets you don’t like.' },
  normal: { label: 'Normal', skips: 3, blurb: 'Skip up to 3 sets of picks.' },
  hard: { label: 'Hard', skips: 1, blurb: 'A single skip. Choose wisely.' },
  master: { label: 'Master', skips: 0, blurb: 'No skips. Take what you’re offered.' },
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
export function rollPool(seed: string): Creature[] {
  const rng = new RNG(`pool:${seed}`);
  const allowSpecial = rng.chance(SPECIAL_POOL_CHANCE);
  const shuffled = rng.shuffle(CREATURES);
  const pool: Creature[] = [];
  let usedSpecial = false;
  for (const c of shuffled) {
    if (pool.length >= POOL_SIZE) break;
    if (isSpecial(c.tier)) {
      if (!allowSpecial || usedSpecial) continue;
      usedSpecial = true;
    }
    // Role is auto-assigned (with variance) here — not chosen by the player.
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
export function rollDraftDeck(seed: string): Creature[] {
  const rng = new RNG(`draft:${seed}`);
  const allowSpecial = rng.chance(SPECIAL_POOL_CHANCE);
  const normals = CREATURES.filter((c) => !isSpecial(c.tier));
  const specials = CREATURES.filter((c) => isSpecial(c.tier));
  const candidates =
    allowSpecial && specials.length > 0
      ? [...normals, rng.pick(specials)]
      : normals;
  return rng
    .shuffle(candidates)
    .slice(0, DRAFT_DECK_SIZE)
    .map((c) => rollCreature(c, rng));
}
