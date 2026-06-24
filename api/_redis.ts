import { Redis } from '@upstash/redis';
import type { SubmissionMon } from '../src/game/leaderboard';
import type { BracketId } from '../src/game/gens';

// Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the environment
// (set them in the Vercel project, or .env.local for `vercel dev`).
export const redis = Redis.fromEnv();

// Keep the free tier tidy: daily boards self-expire after ~40 days.
export const BOARD_TTL_SECONDS = 60 * 60 * 24 * 40;

// Each generation bracket has its own daily board. The full-dex main mode
// (`all`) keeps the bare, legacy keys so its existing board stays continuous.
const suffix = (bracket: BracketId) => (bracket === 'all' ? '' : `:${bracket}`);

export const boardKey = (date: string, bracket: BracketId = 'all') =>
  `lb:${date}${suffix(bracket)}`;
export const boardDataKey = (date: string, bracket: BracketId = 'all') =>
  `lb:${date}${suffix(bracket)}:data`;

export interface BoardEntryData {
  clearedStages: number;
  team: SubmissionMon[]; // species + sign, so the team can be re-fought
  at: number;
}
