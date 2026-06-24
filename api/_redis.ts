import { Redis } from '@upstash/redis';
import type { SubmissionMon } from '../src/game/leaderboard.js';
import type { BracketId } from '../src/game/gens.js';
import type { Difficulty } from '../src/game/run.js';

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
  // The player's display name. Since there's no account system, the board is an
  // arcade-style high-score table: the same name may hold many rows, so the
  // sorted-set member is a unique per-win id and the name lives here instead.
  // Optional for legacy rows written when the member *was* the name — those fall
  // back to the member string on read.
  name?: string;
  difficulty: Difficulty; // the mode this win was earned on (drives rank)
  clearedStages: number;
  team: SubmissionMon[]; // species + sign, so the team can be re-fought
  at: number;
  // Set when this slot was taken by dethroning the Master #1 in a Throne
  // Challenge — the name of the champion that was beaten for the crown.
  defeated?: string;
}

/**
 * The name to display for a board row: the name stored in its data, falling
 * back to the sorted-set member itself for legacy rows (written before duplicate
 * names were allowed, when the member *was* the player's name).
 */
export function displayName(
  member: string,
  data: Partial<BoardEntryData>,
): string {
  return typeof data.name === 'string' && data.name ? data.name : member;
}

// --- Permanent champions archive --------------------------------------------
//
// The daily boards self-expire after ~40 days, which would erase every past
// winner. To keep a durable "hall of champions", the day's #1 per era is
// snapshotted into a single, *non-expiring* hash whenever a board is written.
// Field = `${date}${bracketSuffix}` (e.g. `2026-06-23` or `2026-06-23:kanto`),
// value = the archived champion. One write per board change keeps it converging
// to the final #1 by end of day; once the day passes (no more writes) the
// snapshot is frozen forever.
export const CHAMPIONS_KEY = 'lb:champions';

export const championField = (date: string, bracket: BracketId = 'all') =>
  `${date}${suffix(bracket)}`;

export interface ArchivedChampion {
  date: string;
  bracket: BracketId;
  name: string;
  difficulty: Difficulty;
  at: number;
  clearedStages: number;
  team: SubmissionMon[];
  defeated?: string;
}

export function safeParseEntry(raw: unknown): Partial<BoardEntryData> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Partial<BoardEntryData>;
    } catch {
      return {};
    }
  }
  return raw as Partial<BoardEntryData>;
}

/** Read the current #1 entry of a daily board, or null if it has no clears. */
export async function readBoardLeader(
  redis: Redis,
  date: string,
  bracket: BracketId,
): Promise<ArchivedChampion | null> {
  const members = await redis.zrange<string[]>(boardKey(date, bracket), 0, 0);
  if (members.length === 0) return null;
  const member = members[0];
  const meta = await redis.hmget<Record<string, BoardEntryData | string>>(
    boardDataKey(date, bracket),
    member,
  );
  const data = safeParseEntry(meta?.[member]);
  return {
    date,
    bracket,
    name: displayName(member, data),
    difficulty: data.difficulty ?? 'normal',
    at: Number(data.at) || 0,
    clearedStages: data.clearedStages ?? 0,
    team: Array.isArray(data.team) ? data.team : [],
    ...(typeof data.defeated === 'string' ? { defeated: data.defeated } : {}),
  };
}

/**
 * Snapshot a board's current #1 into the permanent champions archive. Called
 * after every board write so the archive always mirrors the latest top finisher
 * for the day. Best-effort: archiving must never break a real submission.
 */
export async function archiveDailyChampion(
  redis: Redis,
  date: string,
  bracket: BracketId,
): Promise<void> {
  try {
    const champ = await readBoardLeader(redis, date, bracket);
    if (!champ) return;
    await redis.hset(CHAMPIONS_KEY, { [championField(date, bracket)]: champ });
  } catch (err) {
    console.error('[leaderboard] champion archive failed:', err);
  }
}
