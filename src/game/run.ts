import type { Creature } from './types';
import { CREATURES } from './pokemon';
import { RNG } from './rng';

export const POOL_SIZE = 15;
export const TEAM_SIZE = 6;

/** Deterministically roll a draft pool from a seed. */
export function rollPool(seed: string): Creature[] {
  const rng = new RNG(`pool:${seed}`);
  return rng.shuffle(CREATURES).slice(0, POOL_SIZE);
}
