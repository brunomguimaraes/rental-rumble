import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyThroneWin,
  boardScore,
  type SubmissionMon,
} from '../src/game/leaderboard.js';
import { dailyKey } from '../src/game/opponents.js';
import { isBracketId, DEFAULT_BRACKET, type BracketId } from '../src/game/gens.js';
import {
  getRedis,
  boardKey,
  boardDataKey,
  BOARD_TTL_SECONDS,
  archiveDailyChampion,
  displayName,
  type BoardEntryData,
} from './_redis.js';
import { rateLimit, clientIp } from './_ratelimit.js';
import {
  getTokenSecret,
  verifyThroneToken,
  THRONE_TOKEN_TTL_MS,
  NONCE_TTL_SECONDS,
} from './_token.js';

// How deep to look for the reigning Master #1. Master sits in the top tier, so
// its leader is at (or very near) the top of the board; a small scan is plenty.
const SCAN_DEPTH = 60;

/** UTC daily keys for [yesterday, today, tomorrow] — tolerates client tz drift. */
function allowedDates(): Set<string> {
  const now = Date.now();
  const day = 86_400_000;
  return new Set([-day, 0, day].map((off) => dailyKey(new Date(now + off))));
}

function cleanName(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '').trim().replace(/\s+/g, ' ');
  return s.slice(0, 24) || 'Anonymous';
}

function parseEntry(raw: unknown): Partial<BoardEntryData> {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const body: {
    token?: unknown;
    name?: unknown;
    eid?: unknown;
    kingEid?: unknown;
    date?: unknown;
    bracket?: unknown;
    seed?: unknown;
  } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

  const date = typeof body.date === 'string' ? body.date : '';
  const bracket: BracketId = isBracketId(body.bracket)
    ? body.bracket
    : DEFAULT_BRACKET;

  if (!allowedDates().has(date)) {
    return res
      .status(400)
      .json({ ok: false, error: 'the throne is only open for today’s board' });
  }

  const redis = getRedis();
  if (!redis) {
    return res
      .status(503)
      .json({ ok: false, error: 'leaderboard is temporarily unavailable' });
  }

  const ip = clientIp(req);
  const [okDay, okMin] = await Promise.all([
    rateLimit(redis, `rl:throne:d:${ip}:${date}`, 60, 60 * 60 * 24),
    rateLimit(redis, `rl:throne:m:${ip}`, 10, 60),
  ]);
  if (!okDay || !okMin) {
    return res
      .status(429)
      .json({ ok: false, error: 'too many challenges, slow down' });
  }

  // Resolve who is challenging and which (server-issued) seed the fight used.
  // With a secret configured, both come from the signed, single-use throne
  // token, so neither the seed nor the name can be tampered with. Without one
  // (enforcement off, e.g. local dev), fall back to the body — consistent with
  // how the rest of the board degrades when no secret is set.
  const secret = getTokenSecret();
  let name: string;
  let seed: string;
  // The challenger's exact board row to promote. Names can repeat (no accounts),
  // so the row is addressed by its unique id, not by name. May be empty for an
  // old client / legacy token, in which case we fall back to a name match.
  let challengerEid = '';
  let nonceKey: string | null = null;

  if (secret) {
    const verdict = verifyThroneToken(body.token, secret);
    if (!verdict.ok) {
      return res
        .status(400)
        .json({ ok: false, error: `unverified: ${verdict.reason}` });
    }
    const c = verdict.claims;
    if (c.date !== date || c.bracket !== bracket || c.difficulty !== 'master') {
      return res
        .status(400)
        .json({ ok: false, error: 'unverified: throne token does not match' });
    }
    const age = Date.now() - c.iat;
    if (age < 0 || age > THRONE_TOKEN_TTL_MS) {
      return res
        .status(400)
        .json({ ok: false, error: 'unverified: throne token expired' });
    }
    name = c.name;
    seed = c.seed;
    challengerEid = typeof c.eid === 'string' ? c.eid : '';
    nonceKey = `usedthrone:${c.n}`;
  } else {
    name = cleanName(body.name);
    challengerEid = typeof body.eid === 'string' ? body.eid : '';
    seed = typeof body.seed === 'string' ? body.seed : '';
    if (seed.length === 0 || seed.length > 120) {
      return res.status(400).json({ ok: false, error: 'bad seed' });
    }
  }

  const key = boardKey(date, bracket);
  const dataKey = boardDataKey(date, bracket);

  try {
    // Find the reigning Master champion: the first Master entry from the top of
    // the board (Master sits in the top rank tier, so this is the de-facto #1).
    const topMembers = await redis.zrange<string[]>(key, 0, SCAN_DEPTH - 1);
    if (topMembers.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: 'no one has cleared the board yet' });
    }
    const topMeta = await redis.hmget<Record<string, BoardEntryData | string>>(
      dataKey,
      ...topMembers,
    );

    let kingMember: string | null = null;
    let kingData: Partial<BoardEntryData> | null = null;

    // Prefer the *exact* champion the challenger fought (their row id, echoed
    // from the board). Re-simulating against that specific saved team — rather
    // than "whoever is #1 right now" — means a king who got dethroned between
    // the title shot and this request can't turn an honest win into a spurious
    // mismatch. The fought row must still be a Master with a real team, so this
    // can only ever target a legitimate crown holder. Falls back to the current
    // top Master for old clients that don't send a kingEid.
    const requestedKingEid =
      typeof body.kingEid === 'string' ? body.kingEid : '';
    if (requestedKingEid) {
      const m = await redis.hmget<Record<string, BoardEntryData | string>>(
        dataKey,
        requestedKingEid,
      );
      const d = parseEntry(m?.[requestedKingEid]);
      if (
        d.difficulty === 'master' &&
        Array.isArray(d.team) &&
        d.team.length > 0
      ) {
        kingMember = requestedKingEid;
        kingData = d;
      }
    }
    if (!kingMember || !kingData) {
      for (const m of topMembers) {
        const d = parseEntry(topMeta?.[m]);
        if (d.difficulty === 'master') {
          kingMember = m;
          kingData = d;
          break;
        }
      }
    }
    if (!kingMember || !kingData) {
      return res.status(400).json({
        ok: false,
        error: 'no reigning Master champion to challenge yet',
      });
    }
    const kingName = displayName(kingMember, kingData);
    // The challenger can't dethrone their own row.
    if (kingMember === challengerEid) {
      return res
        .status(409)
        .json({ ok: false, error: 'you already hold the throne' });
    }

    // Resolve the challenger's exact board row. Addressed by id when available
    // (names can repeat); otherwise fall back to a name match for old clients /
    // legacy tokens. They must already be on the board (Master win submitted
    // first). Fight with the team that publicly represents them.
    let challengerMember = challengerEid;
    let challengerData: Partial<BoardEntryData>;
    if (challengerMember) {
      const m = await redis.hmget<Record<string, BoardEntryData | string>>(
        dataKey,
        challengerMember,
      );
      challengerData = parseEntry(m?.[challengerMember]);
    } else {
      // Legacy fallback: pick the best (highest-ranked) row whose name matches.
      const found = topMembers.find(
        (m) => displayName(m, parseEntry(topMeta?.[m])) === name,
      );
      challengerMember = found ?? '';
      challengerData = found ? parseEntry(topMeta?.[found]) : {};
    }
    if (
      !challengerMember ||
      !Array.isArray(challengerData.team) ||
      challengerData.team.length === 0
    ) {
      return res
        .status(400)
        .json({ ok: false, error: 'submit your Master win before challenging' });
    }

    // The honest part: re-simulate the title fight server-side.
    const verdict = verifyThroneWin({
      challengerTeam: challengerData.team as SubmissionMon[],
      kingTeam: (kingData.team ?? []) as SubmissionMon[],
      seed,
    });
    if (!verdict.ok) {
      return res
        .status(400)
        .json({ ok: false, error: `unverified: ${verdict.reason}` });
    }

    // Burn the one-shot nonce so a single championship can't be cashed in more
    // than once. NX returns null if it was already spent.
    if (nonceKey) {
      const claimed = await redis.set(nonceKey, '1', {
        nx: true,
        ex: NONCE_TTL_SECONDS,
      });
      if (claimed === null) {
        return res
          .status(409)
          .json({ ok: false, error: 'this title shot was already used' });
      }
    }

    // Take the throne: slot the challenger one tick ahead of the exact champion
    // they beat. In the common case that champion is the reigning #1, so this
    // makes the challenger the new #1 Master (and, since Master is the top tier,
    // the top of the whole board). If the crown changed hands mid-challenge, the
    // challenger still lands just above the team they actually toppled.
    const kingAt = Number(kingData.at) || Date.now();
    const newAt = kingAt - 1;
    const score = boardScore('master', newAt);

    await redis.zadd(key, { score, member: challengerMember });

    const updated: BoardEntryData = {
      name,
      difficulty: 'master',
      clearedStages: Number(challengerData.clearedStages) || 0,
      team: challengerData.team as SubmissionMon[],
      at: newAt,
      defeated: kingName,
    };
    await redis.hset(dataKey, { [challengerMember]: updated });

    await Promise.all([
      redis.expire(key, BOARD_TTL_SECONDS),
      redis.expire(dataKey, BOARD_TTL_SECONDS),
    ]);

    const [rank0, total] = await Promise.all([
      redis.zrank(key, challengerMember),
      redis.zcard(key),
    ]);

    // The throne just changed hands — refresh the permanent archive's #1.
    await archiveDailyChampion(redis, date, bracket);

    return res.status(200).json({
      ok: true,
      rank: typeof rank0 === 'number' ? rank0 + 1 : 1,
      total,
      defeated: kingName,
    });
  } catch (err) {
    console.error('[challenge-king] Redis write failed:', err);
    return res
      .status(503)
      .json({ ok: false, error: 'leaderboard is temporarily unavailable' });
  }
}
