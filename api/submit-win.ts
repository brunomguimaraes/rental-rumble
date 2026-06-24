import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyChampionWin,
  boardScore,
  type SubmissionPayload,
} from '../src/game/leaderboard.js';
import { dailyKey } from '../src/game/opponents.js';
import { isBracketId, DEFAULT_BRACKET, type BracketId } from '../src/game/gens.js';
import {
  getRedis,
  boardKey,
  boardDataKey,
  BOARD_TTL_SECONDS,
  archiveDailyChampion,
  type BoardEntryData,
} from './_redis.js';
import { rateLimit, clientIp } from './_ratelimit.js';
import {
  getTokenSecret,
  verifyRunToken,
  signThroneToken,
  newSeed,
  newNonce,
  newEntryId,
  RUN_TOKEN_TTL_MS,
  MIN_RUN_MS,
  NONCE_TTL_SECONDS,
} from './_token.js';
import type { ThroneGrant } from '../src/game/leaderboard.js';

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

  const redis = getRedis();
  if (!redis) {
    // Misconfigured environment (no Upstash credentials). Return a clean,
    // explicit error instead of letting the function crash with a 500.
    return res.status(503).json({
      ok: false,
      error: 'leaderboard is temporarily unavailable',
    });
  }

  // Throttle per caller so the verify step (a full battle re-sim) can't be
  // hammered, and a single IP can't carpet the board.
  const ip = clientIp(req);
  const [okDay, okMin] = await Promise.all([
    rateLimit(redis, `rl:submit:d:${ip}:${date}`, 100, 60 * 60 * 24),
    rateLimit(redis, `rl:submit:m:${ip}`, 15, 60),
  ]);
  if (!okDay || !okMin) {
    return res.status(429).json({ ok: false, error: 'too many submissions, slow down' });
  }

  // Run-token gate: the seed must come from a token *we* issued for this exact
  // date/bracket/difficulty, so a win can't be forged offline against a
  // hand-picked seed or POSTed without ever launching the game. Enforced only
  // when a secret is configured, so the board keeps working on a deploy that
  // hasn't had LEADERBOARD_SECRET set yet (set it to arm the protection).
  const secret = getTokenSecret();
  const nonceKey = (() => {
    if (!secret) {
      console.warn(
        '[submit-win] LEADERBOARD_SECRET is not set — run tokens are NOT being ' +
          'enforced. Set it in the Vercel project to guarantee legit submits.',
      );
      return null;
    }
    const verdict = verifyRunToken(body.token, secret);
    if (!verdict.ok) {
      return { error: `unverified: ${verdict.reason}` } as const;
    }
    const c = verdict.claims;
    const age = Date.now() - c.iat;
    if (
      c.seed !== body.seed ||
      c.date !== date ||
      c.bracket !== bracket ||
      c.difficulty !== body.difficulty
    ) {
      return { error: 'unverified: run token does not match submission' } as const;
    }
    if (age < 0 || age > RUN_TOKEN_TTL_MS) {
      return { error: 'unverified: run token expired' } as const;
    }
    if (age < MIN_RUN_MS) {
      return { error: 'unverified: run finished implausibly fast' } as const;
    }
    return `used:${c.n}`;
  })();
  if (nonceKey && typeof nonceKey === 'object') {
    return res.status(400).json({ ok: false, error: nonceKey.error });
  }

  // The honest part: re-simulate the Champion fight server-side (per bracket).
  const verdict = verifyChampionWin({ ...body, name, bracket });
  if (!verdict.ok) {
    return res.status(400).json({ ok: false, error: `unverified: ${verdict.reason}` });
  }

  const now = Date.now();
  const key = boardKey(date, bracket);
  const dataKey = boardDataKey(date, bracket);

  // Rank by mode first, then time: harder wins outrank easier ones, and the
  // earliest clear wins each tier. Encoded into a single sortable score.
  const score = boardScore(verdict.difficulty, now);

  try {
    // Burn the token's nonce so one authorised run can't be replayed into the
    // board under several names. NX returns null if it was already spent.
    if (typeof nonceKey === 'string') {
      const claimed = await redis.set(nonceKey, '1', {
        nx: true,
        ex: NONCE_TTL_SECONDS,
      });
      if (claimed === null) {
        return res
          .status(409)
          .json({ ok: false, error: 'this run was already submitted' });
      }
    }

    // No account system yet, so the board is an arcade-style high-score table:
    // every verified win earns its own row, and the same name may appear many
    // times. The member is therefore a unique per-win id (not the name), and the
    // display name is stored in the row's data. The run-token nonce burned above
    // still stops a *single* run from being submitted more than once.
    const eid = newEntryId();
    await redis.zadd(key, { score, member: eid });

    const entry: BoardEntryData = {
      name,
      difficulty: verdict.difficulty,
      clearedStages: Number(body.clearedStages) || 0,
      team: verdict.team.map((c) => ({
        id: c.id,
        sign: c.sign,
        ...(c.shiny ? { shiny: true } : {}),
      })),
      at: now,
    };
    // Upstash serializes objects to JSON automatically (and parses on read).
    await redis.hset(dataKey, { [eid]: entry });

    await Promise.all([
      redis.expire(key, BOARD_TTL_SECONDS),
      redis.expire(dataKey, BOARD_TTL_SECONDS),
    ]);

    const [rank0, total] = await Promise.all([
      redis.zrank(key, eid),
      redis.zcard(key),
    ]);

    // Mirror the day's current #1 into the permanent hall of champions so it
    // outlives the board's ~40-day TTL. Best-effort; never blocks the response.
    await archiveDailyChampion(redis, date, bracket);

    // A Master clear earns one shot at the throne: a server-chosen battle seed
    // (so the deterministic PvP fight can't be brute-forced offline) plus a
    // single-use signed token. The client decides whether there's anyone to
    // challenge (you can't dethrone yourself); this just hands out the pass.
    let throne: ThroneGrant | null = null;
    if (verdict.difficulty === 'master') {
      const throneSeed = newSeed();
      throne = {
        seed: throneSeed,
        // Echo this win's exact row id so the challenge promotes the right row
        // even when the name repeats (and when no secret pins it in the token).
        eid,
        token: secret
          ? signThroneToken(
              {
                name,
                eid,
                date,
                bracket,
                difficulty: 'master',
                seed: throneSeed,
                n: newNonce(),
                iat: now,
              },
              secret,
            )
          : null,
      };
    }

    return res.status(200).json({
      ok: true,
      rank: typeof rank0 === 'number' ? rank0 + 1 : null,
      total,
      throne,
    });
  } catch (err) {
    console.error('[submit-win] Redis write failed:', err);
    return res.status(503).json({
      ok: false,
      error: 'leaderboard is temporarily unavailable',
    });
  }
}
