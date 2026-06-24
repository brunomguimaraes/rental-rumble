import { Redis } from '@upstash/redis';
import type { SubmissionMon } from '../src/game/leaderboard';
import type { BracketId } from '../src/game/gens';

// Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the environment
// (set them in the Vercel project, or .env.local for `vercel dev`).
//
// IMPORTANT: `Redis.fromEnv()` throws synchronously when those vars are missing
// or malformed. If we called it at module load, that throw would crash the
// entire serverless function before the handler runs — surfacing only an opaque
// `FUNCTION_INVOCATION_FAILED` 500. So we init lazily and let callers degrade
// gracefully (empty board / clean error) when Redis isn't configured.
let client: Redis | null = null;
let initialized = false;

export function getRedis(): Redis | null {
  if (initialized) return client;
  initialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error(
      '[leaderboard] Redis disabled: missing UPSTASH_REDIS_REST_URL / ' +
        'UPSTASH_REDIS_REST_TOKEN. Set them in the Vercel project (Settings → ' +
        'Environment Variables) or in .env.local for `vercel dev`.',
    );
    return null;
  }

  try {
    client = new Redis({ url, token });
  } catch (err) {
    console.error('[leaderboard] Failed to initialize Redis client:', err);
    client = null;
  }
  return client;
}

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
