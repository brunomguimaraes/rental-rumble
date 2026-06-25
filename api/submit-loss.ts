import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  teamFromMons,
  monToRecord,
  type SubmissionMon,
} from '../src/game/leaderboard.js';
import {
  shameScore,
  type ShameSubmission,
} from '../src/game/hallOfShame.js';
import { gagName } from '../src/game/gagName.js';
import { dailyKey } from '../src/game/opponents.js';
import { isBracketId, DEFAULT_BRACKET, type BracketId } from '../src/game/gens.js';
import { isDifficulty, type Difficulty } from '../src/game/run.js';
import {
  getRedis,
  shameKey,
  shameDataKey,
  BOARD_TTL_SECONDS,
  type ShameEntryData,
} from './_redis.js';
import { rateLimit, clientIp } from './_ratelimit.js';
import { newEntryId } from './_token.js';

/** UTC daily keys for [yesterday, today, tomorrow] — tolerates client tz drift. */
function allowedDates(): Set<string> {
  const now = Date.now();
  const day = 86_400_000;
  return new Set([-day, 0, day].map((off) => dailyKey(new Date(now + off))));
}

/** Clean the display name, falling back to a goofy gag alias when it's blank. */
function shameName(raw: unknown, seed: string): string {
  const s = (typeof raw === 'string' ? raw : '').trim().replace(/\s+/g, ' ');
  return s.slice(0, 24) || gagName(seed);
}

/** Rebuild a submitted roster into canonical, tamper-proof records (real
 *  species/signs only, capped at six). A junk payload simply yields fewer mons. */
function sanitizeTeam(team: unknown): SubmissionMon[] {
  if (!Array.isArray(team)) return [];
  return teamFromMons(team as SubmissionMon[])
    .slice(0, 6)
    .map(monToRecord);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const body: ShameSubmission =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

  const date = body.date;
  if (!allowedDates().has(date)) {
    return res
      .status(400)
      .json({ ok: false, error: 'the Hall of Shame is only open for today’s run' });
  }

  const redis = getRedis();
  if (!redis) {
    return res
      .status(503)
      .json({ ok: false, error: 'the Hall of Shame is temporarily unavailable' });
  }

  // Throttle per caller. Losses happen far more often than wins (and need no
  // expensive re-sim), so the caps are looser than submit-win's.
  const ip = clientIp(req);
  const [okDay, okMin] = await Promise.all([
    rateLimit(redis, `rl:shame:d:${ip}:${date}`, 300, 60 * 60 * 24),
    rateLimit(redis, `rl:shame:m:${ip}`, 30, 60),
  ]);
  if (!okMin || !okDay) {
    return res
      .status(429)
      .json({ ok: false, error: 'too many submissions, slow down' });
  }

  const dataKey = shameDataKey(date);
  const key = shameKey(date);

  try {
    // --- Rename path: editing the auto-assigned name on an existing flop ------
    // Patches just the display name on the existing row (preserving its score,
    // time and rank), so swapping a gag alias for a real name never duplicates.
    if (typeof body.eid === 'string' && body.eid) {
      const existing = await redis.hget<ShameEntryData | string>(dataKey, body.eid);
      const data: ShameEntryData | null =
        typeof existing === 'string'
          ? (JSON.parse(existing) as ShameEntryData)
          : existing ?? null;
      if (data) {
        data.name = shameName(body.name, body.eid);
        await redis.hset(dataKey, { [body.eid]: data });
        const [rank0, total] = await Promise.all([
          redis.zrank(key, body.eid),
          redis.zcard(key),
        ]);
        return res.status(200).json({
          ok: true,
          eid: body.eid,
          rank: typeof rank0 === 'number' ? rank0 + 1 : null,
          total,
        });
      }
      // The row vanished (board expired / bad id) — fall through and record anew.
    }

    // --- Create path: enshrine a fresh defeat --------------------------------
    const bracket: BracketId = isBracketId(body.bracket)
      ? body.bracket
      : DEFAULT_BRACKET;
    const difficulty: Difficulty = isDifficulty(body.difficulty)
      ? body.difficulty
      : 'normal';
    const clearedStages = Math.max(
      0,
      Math.min(64, Math.floor(Number(body.clearedStages) || 0)),
    );
    const team = sanitizeTeam(body.team);
    const fellToTeam = sanitizeTeam(body.fellToTeam);
    const fellTo =
      typeof body.fellTo === 'string'
        ? body.fellTo.replace(/\s+/g, ' ').trim().slice(0, 40)
        : '';

    const now = Date.now();
    const eid = newEntryId();
    const name = shameName(body.name, eid);
    const score = shameScore(clearedStages, now);

    await redis.zadd(key, { score, member: eid });

    const entry: ShameEntryData = {
      name,
      difficulty,
      bracket,
      clearedStages,
      team,
      fellTo,
      ...(fellToTeam.length > 0 ? { fellToTeam } : {}),
      at: now,
    };
    await redis.hset(dataKey, { [eid]: entry });

    await Promise.all([
      redis.expire(key, BOARD_TTL_SECONDS),
      redis.expire(dataKey, BOARD_TTL_SECONDS),
    ]);

    const [rank0, total] = await Promise.all([
      redis.zrank(key, eid),
      redis.zcard(key),
    ]);

    return res.status(200).json({
      ok: true,
      eid,
      rank: typeof rank0 === 'number' ? rank0 + 1 : null,
      total,
    });
  } catch (err) {
    console.error('[submit-loss] Redis write failed:', err);
    return res
      .status(503)
      .json({ ok: false, error: 'the Hall of Shame is temporarily unavailable' });
  }
}
