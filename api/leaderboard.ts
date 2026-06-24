import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Redis } from '@upstash/redis';
import {
  LEADERBOARD_TOP,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type LeaderboardSummary,
} from '../src/game/leaderboard.js';
import { buildChampion, dailyKey } from '../src/game/opponents.js';
import {
  isBracketId,
  DEFAULT_BRACKET,
  GEN_BRACKETS,
  type BracketId,
} from '../src/game/gens.js';
import {
  getRedis,
  boardKey,
  boardDataKey,
  type BoardEntryData,
} from './_redis.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function championInfo(
  date: string,
  bracket: BracketId,
): LeaderboardResponse['champion'] {
  try {
    const champ = buildChampion(new Date(`${date}T12:00:00Z`), bracket);
    return { name: champ.name, type: champ.type };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.date;
  const date = typeof raw === 'string' && YMD.test(raw) ? raw : dailyKey();

  // Digest mode: every era's top finisher in one call, for the title-screen
  // "today's champions" showcase. Boss info is deterministic, so the response is
  // useful even when Redis is down or no one has cleared a board yet.
  if (req.query.summary !== undefined) {
    const redis = getRedis();
    const brackets = await Promise.all(
      GEN_BRACKETS.map(async (b) => {
        let total = 0;
        let leader: LeaderboardEntry | null = null;
        if (redis) {
          try {
            ({ total, leader } = await bracketLeader(redis, date, b.id));
          } catch (err) {
            console.error(`[leaderboard] summary read failed (${b.id}):`, err);
          }
        }
        return {
          bracket: b.id,
          champion: championInfo(date, b.id),
          total,
          leader,
        };
      }),
    );
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ date, brackets } satisfies LeaderboardSummary);
  }

  const bracket: BracketId = isBracketId(req.query.bracket)
    ? req.query.bracket
    : DEFAULT_BRACKET;

  const key = boardKey(date, bracket);
  const dataKey = boardDataKey(date, bracket);

  let entries: LeaderboardEntry[] = [];
  let total = 0;

  const redis = getRedis();
  if (redis) {
    try {
      // Best first: the sorted-set score is a composite of difficulty (harder =
      // better) and clear time (earlier breaks ties), so plain ascending order
      // already gives the ranking we want. The raw win time lives in the data
      // hash, since the score is no longer a bare timestamp.
      const [names, count] = await Promise.all([
        redis.zrange<string[]>(key, 0, LEADERBOARD_TOP - 1),
        redis.zcard(key),
      ]);
      total = count ?? 0;

      const meta =
        names.length > 0
          ? await redis.hmget<Record<string, BoardEntryData | string>>(
              dataKey,
              ...names,
            )
          : {};

      entries = names.map((name, i) => {
        const rawMeta = meta?.[name];
        const data: Partial<BoardEntryData> =
          typeof rawMeta === 'string' ? safeParse(rawMeta) : rawMeta ?? {};
        return {
          rank: i + 1,
          name,
          // Legacy entries (pre-difficulty) default to the normal mode.
          difficulty: data.difficulty ?? 'normal',
          at: Number(data.at) || 0,
          clearedStages: data.clearedStages ?? 0,
          team: Array.isArray(data.team) ? data.team : [],
        } satisfies LeaderboardEntry;
      });
    } catch (err) {
      // A Redis hiccup should never take down the whole page — serve an empty
      // board (champion info still works) and log the real cause for debugging.
      console.error('[leaderboard] Redis read failed:', err);
      entries = [];
      total = 0;
    }
  }

  const body: LeaderboardResponse = {
    date,
    bracket,
    champion: championInfo(date, bracket),
    total,
    entries,
  };

  // Small CDN cache so a popular board doesn't hammer Redis.
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  return res.status(200).json(body);
}

function safeParse(s: string): Partial<BoardEntryData> {
  try {
    return JSON.parse(s) as Partial<BoardEntryData>;
  } catch {
    return {};
  }
}

/** Top finisher (rank #1) and total clears for one era's daily board. */
async function bracketLeader(
  redis: Redis,
  date: string,
  bracket: BracketId,
): Promise<{ total: number; leader: LeaderboardEntry | null }> {
  const key = boardKey(date, bracket);
  const [names, count] = await Promise.all([
    redis.zrange<string[]>(key, 0, 0),
    redis.zcard(key),
  ]);
  const total = count ?? 0;
  if (names.length === 0) return { total, leader: null };

  const name = names[0];
  const meta = await redis.hmget<Record<string, BoardEntryData | string>>(
    boardDataKey(date, bracket),
    name,
  );
  const rawMeta = meta?.[name];
  const data: Partial<BoardEntryData> =
    typeof rawMeta === 'string' ? safeParse(rawMeta) : rawMeta ?? {};

  return {
    total,
    leader: {
      rank: 1,
      name,
      difficulty: data.difficulty ?? 'normal',
      at: Number(data.at) || 0,
      clearedStages: data.clearedStages ?? 0,
      team: Array.isArray(data.team) ? data.team : [],
    },
  };
}
