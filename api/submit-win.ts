import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyChampionWin,
  type SubmissionPayload,
} from '../src/game/leaderboard';
import { dailyKey } from '../src/game/opponents';
import { isBracketId, DEFAULT_BRACKET, type BracketId } from '../src/game/gens';
import {
  getRedis,
  boardKey,
  boardDataKey,
  BOARD_TTL_SECONDS,
  type BoardEntryData,
} from './_redis';

/** UTC daily keys for [yesterday, today, tomorrow] — tolerates client tz drift. */
function allowedDates(): Set<string> {
  const now = Date.now();
  const day = 86_400_000;
  return new Set(
    [-day, 0, day].map((off) => dailyKey(new Date(now + off))),
  );
}

function cleanName(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '').trim().replace(/\s+/g, ' ');
  return s.slice(0, 24) || 'Anonymous';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const body: SubmissionPayload =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

  const name = cleanName(body.name);
  const date = body.date;
  const bracket: BracketId = isBracketId(body.bracket)
    ? body.bracket
    : DEFAULT_BRACKET;

  if (!allowedDates().has(date)) {
    return res
      .status(400)
      .json({ ok: false, error: 'submissions are only open for today’s boss' });
  }

  // The honest part: re-simulate the Champion fight server-side (per bracket).
  const verdict = verifyChampionWin({ ...body, name, bracket });
  if (!verdict.ok) {
    return res.status(400).json({ ok: false, error: `unverified: ${verdict.reason}` });
  }

  const redis = getRedis();
  if (!redis) {
    // Misconfigured environment (no Upstash credentials). Return a clean,
    // explicit error instead of letting the function crash with a 500.
    return res.status(503).json({
      ok: false,
      error: 'leaderboard is temporarily unavailable',
    });
  }

  const now = Date.now();
  const key = boardKey(date, bracket);
  const dataKey = boardDataKey(date, bracket);

  try {
    // First verified win per name sticks (NX = don't overwrite an earlier time).
    await redis.zadd(key, { nx: true }, { score: now, member: name });

    const entry: BoardEntryData = {
      clearedStages: Number(body.clearedStages) || 0,
      team: verdict.team.map((c) => ({ id: c.id, sign: c.sign })),
      at: now,
    };
    // Upstash serializes objects to JSON automatically (and parses on read).
    await redis.hsetnx(dataKey, name, entry);

    await Promise.all([
      redis.expire(key, BOARD_TTL_SECONDS),
      redis.expire(dataKey, BOARD_TTL_SECONDS),
    ]);

    const [rank0, total] = await Promise.all([
      redis.zrank(key, name),
      redis.zcard(key),
    ]);

    return res.status(200).json({
      ok: true,
      rank: typeof rank0 === 'number' ? rank0 + 1 : null,
      total,
    });
  } catch (err) {
    console.error('[submit-win] Redis write failed:', err);
    return res.status(503).json({
      ok: false,
      error: 'leaderboard is temporarily unavailable',
    });
  }
}
