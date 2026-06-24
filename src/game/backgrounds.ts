import type { Opponent } from './types.js';

// For now every battle is fought in the same woodland clearing, drawn as a
// single pixel-art scene with three time-of-day variants. The variant follows
// the player's real local clock, so the backdrop matches when you're playing.
//
// Keys map to files at public/sprites/backgrounds/<key>.png (see
// scripts/build-backgrounds.mjs and backgrounds.gen.ts).

const ASSET = import.meta.env?.BASE_URL ?? '/';
const url = (key: string) => `${ASSET}sprites/backgrounds/${key}.png`;

export type TimeOfDay = 'day' | 'afternoon' | 'night';

/** Local clock → coarse time band used to pick a backdrop variant. */
export function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours();
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'afternoon';
  return 'night';
}

/** The backdrop image URL for a battle against `opp`. */
export function backdropFor(_opp: Opponent, d = new Date()): string {
  return url(`woodland-${timeOfDay(d)}`);
}
