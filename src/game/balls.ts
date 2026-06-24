import type { RNG } from './rng.js';

// Ball icons are served locally from public/sprites/balls (copied from the Gen 9
// Essentials item set, keyed by our short ball id). BASE_URL keeps paths valid
// under sub-paths.
const ASSET = import.meta.env?.BASE_URL ?? '/';

export type BallId =
  | 'poke'
  | 'great'
  | 'ultra'
  | 'master'
  | 'premier'
  | 'luxury'
  | 'heal'
  | 'net'
  | 'nest'
  | 'dive'
  | 'dusk'
  | 'quick'
  | 'timer'
  | 'repeat'
  | 'love'
  | 'friend'
  | 'moon'
  | 'fast'
  | 'heavy'
  | 'dream'
  | 'beast'
  | 'cherish'
  | 'safari'
  | 'level'
  | 'lure'
  | 'sport';

export interface Ball {
  id: BallId;
  name: string;
}

/** The ball a Pokémon is sent out in by default. */
export const DEFAULT_BALL: BallId = 'poke';

/**
 * Selectable balls, in the order they appear in the draft picker. Purely
 * cosmetic — the ball only drives the send-out throw animation, never stats.
 */
export const BALLS: Ball[] = [
  { id: 'poke', name: 'Poké Ball' },
  { id: 'great', name: 'Great Ball' },
  { id: 'ultra', name: 'Ultra Ball' },
  { id: 'master', name: 'Master Ball' },
  { id: 'premier', name: 'Premier Ball' },
  { id: 'luxury', name: 'Luxury Ball' },
  { id: 'heal', name: 'Heal Ball' },
  { id: 'net', name: 'Net Ball' },
  { id: 'nest', name: 'Nest Ball' },
  { id: 'dive', name: 'Dive Ball' },
  { id: 'dusk', name: 'Dusk Ball' },
  { id: 'quick', name: 'Quick Ball' },
  { id: 'timer', name: 'Timer Ball' },
  { id: 'repeat', name: 'Repeat Ball' },
  { id: 'love', name: 'Love Ball' },
  { id: 'friend', name: 'Friend Ball' },
  { id: 'moon', name: 'Moon Ball' },
  { id: 'fast', name: 'Fast Ball' },
  { id: 'heavy', name: 'Heavy Ball' },
  { id: 'dream', name: 'Dream Ball' },
  { id: 'beast', name: 'Beast Ball' },
  { id: 'cherish', name: 'Cherish Ball' },
  { id: 'safari', name: 'Safari Ball' },
  { id: 'level', name: 'Level Ball' },
  { id: 'lure', name: 'Lure Ball' },
  { id: 'sport', name: 'Sport Ball' },
];

const BALL_BY_ID: Record<string, Ball> = Object.fromEntries(
  BALLS.map((b) => [b.id, b]),
);

export function ballName(id: string): string {
  return BALL_BY_ID[id]?.name ?? 'Poké Ball';
}

/** Icon URL for a ball id (falls back to the Poké Ball). */
export function ballUrl(id: string): string {
  const ball = BALL_BY_ID[id] ? id : DEFAULT_BALL;
  return `${ASSET}sprites/balls/${ball}.png`;
}

// Opponents toss a flavourful mix of common balls so their send-outs feel as
// lively as the player's, without the rarer "trophy" balls the player picks.
const OPPONENT_BALLS: BallId[] = [
  'poke',
  'poke',
  'great',
  'great',
  'ultra',
  'premier',
  'nest',
  'dusk',
  'quick',
  'net',
  'timer',
  'repeat',
];

/** Pick a seeded, flavourful ball for an opponent's Pokémon. */
export function rollOpponentBall(rng: RNG): BallId {
  return rng.pick(OPPONENT_BALLS);
}
