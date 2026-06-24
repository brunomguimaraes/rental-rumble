import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  LEADERBOARD_TOP,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from '../src/game/leaderboard';
import { buildChampion, dailyKey } from '../src/game/opponents';
import { isBracketId, DEFAULT_BRACKET, type BracketId } from '../src/game/gens';
import {
  redis,
  boardKey,
  boardDataKey,
  type BoardEntryData,
} from './_redis';

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

  // Earliest wins first: ascending score (= epoch ms) is exactly the order we want.
  const [flat, total] = await Promise.all([
    redis.zrange<(string | number)[]>(key, 0, LEADERBOARD_TOP - 1, {
      withScores: true,
    }),
    redis.zcard(key),
  ]);

  const names: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    names.push(String(flat[i]));
    scores.push(Number(flat[i + 1]));
  }

  const meta =
    names.length > 0
      ? await redis.hmget<Record<string, BoardEntryData | string>>(
          dataKey,
          ...names,
        )
      : {};

  const entries: LeaderboardEntry[] = names.map((name, i) => {
    const rawMeta = meta?.[name];
    const data: Partial<BoardEntryData> =
      typeof rawMeta === 'string' ? safeParse(rawMeta) : rawMeta ?? {};
    return {
      rank: i + 1,
      name,
      at: scores[i],
      clearedStages: data.clearedStages ?? 0,
      team: Array.isArray(data.team) ? data.team : [],
    } satisfies LeaderboardEntry;
  });

  const body: LeaderboardResponse = {
    date,
    bracket,
    champion: championInfo(date, bracket),
    total: total ?? 0,
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
