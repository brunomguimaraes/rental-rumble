import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  LEADERBOARD_TOP,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from '../src/game/leaderboard.js';
import { buildChampion, dailyKey } from '../src/game/opponents.js';
import { isBracketId, DEFAULT_BRACKET, type BracketId } from '../src/game/gens.js';
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
