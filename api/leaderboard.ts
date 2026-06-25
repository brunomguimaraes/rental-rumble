import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Redis } from '@upstash/redis';
import {
  LEADERBOARD_TOP,
  type ChampionRecord,
  type HistoryDay,
  type LeaderboardEntry,
  type LeaderboardHistory,
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
  CHAMPIONS_KEY,
  championField,
  archiveDailyChampion,
  readBoardLeader,
  displayName,
  type ArchivedChampion,
  type BoardEntryData,
} from './_redis.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// How many past days the hall of champions shows by default, and the hard cap.
const HISTORY_DEFAULT_DAYS = 30;
const HISTORY_MAX_DAYS = 60;
// Live boards self-expire after ~40 days; only those can be back-filled.
const ARCHIVABLE_DAYS = 39;
const ONE_DAY_MS = 86_400_000;

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

  // History mode: the permanent "hall of champions" — each past day's #1 per
  // era, oldest boards included even after they've expired from Redis.
  if (req.query.history !== undefined) {
    const days = clampDays(req.query.days);
    const body = await readHistory(days);
    // Past days never change, so this can cache hard; only the trailing edge
    // (yesterday, still being back-filled) benefits from a short revalidate.
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json(body);
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
      const [members, count] = await Promise.all([
        redis.zrange<string[]>(key, 0, LEADERBOARD_TOP - 1),
        redis.zcard(key),
      ]);
      total = count ?? 0;

      const meta =
        members.length > 0
          ? await redis.hmget<Record<string, BoardEntryData | string>>(
              dataKey,
              ...members,
            )
          : {};

      entries = members.map((member, i) => {
        const rawMeta = meta?.[member];
        const data: Partial<BoardEntryData> =
          typeof rawMeta === 'string' ? safeParse(rawMeta) : rawMeta ?? {};
        return {
          rank: i + 1,
          id: member,
          name: displayName(member, data),
          // Legacy entries (pre-difficulty) default to the normal mode.
          difficulty: data.difficulty ?? 'normal',
          at: Number(data.at) || 0,
          // The real win time for throne rows (whose `at` is a back-dated sort
          // key); absent on normal/legacy rows, where the client falls back to `at`.
          ...(data.wonAt != null ? { wonAt: Number(data.wonAt) } : {}),
          clearedStages: data.clearedStages ?? 0,
          team: Array.isArray(data.team) ? data.team : [],
          ...(Array.isArray(data.relics) ? { relics: data.relics } : {}),
          defeated:
            typeof data.defeated === 'string' ? data.defeated : undefined,
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

function clampDays(raw: unknown): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n)) return HISTORY_DEFAULT_DAYS;
  return Math.max(1, Math.min(HISTORY_MAX_DAYS, Math.round(n)));
}

/** The last `days` daily keys, ending yesterday (today is the live ladder). */
function pastDates(days: number): string[] {
  const now = Date.now();
  return Array.from({ length: days }, (_, i) =>
    dailyKey(new Date(now - (i + 1) * ONE_DAY_MS)),
  );
}

function toRecord(c: ArchivedChampion): ChampionRecord {
  return {
    bracket: c.bracket,
    name: c.name,
    difficulty: c.difficulty,
    at: c.at,
    clearedStages: c.clearedStages,
    team: Array.isArray(c.team) ? c.team : [],
    champion: championInfo(c.date, c.bracket),
    ...(c.defeated ? { defeated: c.defeated } : {}),
  };
}

/**
 * Build the hall of champions for the last `days` days. Reads the permanent
 * archive first, then back-fills any gap from a still-live board (writing the
 * snapshot through so it survives the board's TTL). Degrades to an empty list
 * if Redis is unavailable.
 */
async function readHistory(days: number): Promise<LeaderboardHistory> {
  const dates = pastDates(days);
  const redis = getRedis();
  if (!redis) return { days: dates.map((date) => ({ date, champions: [] })) };

  // One round trip: pull every (date × era) snapshot we already have.
  const fields = dates.flatMap((date) =>
    GEN_BRACKETS.map((b) => championField(date, b.id)),
  );
  const found = new Map<string, ArchivedChampion>();
  try {
    const archived = await redis.hmget<Record<string, ArchivedChampion | string>>(
      CHAMPIONS_KEY,
      ...fields,
    );
    if (archived) {
      for (const [field, val] of Object.entries(archived)) {
        if (val == null) continue;
        const champ = typeof val === 'string' ? safeParseChampion(val) : val;
        if (champ) found.set(field, champ);
      }
    }
  } catch (err) {
    console.error('[leaderboard] history archive read failed:', err);
  }

  // Back-fill gaps from boards that are still alive in Redis. Older entries
  // (pre-archive deploys) get captured permanently the first time history is
  // viewed, just before their board would have expired.
  const now = Date.now();
  const gaps: { date: string; bracket: BracketId; field: string }[] = [];
  for (const date of dates) {
    const ageDays = Math.round((now - Date.parse(`${date}T00:00:00Z`)) / ONE_DAY_MS);
    if (ageDays > ARCHIVABLE_DAYS) continue;
    for (const b of GEN_BRACKETS) {
      const field = championField(date, b.id);
      if (!found.has(field)) gaps.push({ date, bracket: b.id, field });
    }
  }
  if (gaps.length > 0) {
    await Promise.all(
      gaps.map(async ({ date, bracket, field }) => {
        try {
          const champ = await readBoardLeader(redis, date, bracket);
          if (champ) found.set(field, champ);
        } catch {
          /* a single missing board shouldn't sink the page */
        }
      }),
    );
    // Persist what we recovered so future loads are a single archive read.
    void Promise.all(
      gaps
        .filter((g) => found.has(g.field))
        .map((g) => archiveDailyChampion(redis, g.date, g.bracket)),
    ).catch(() => {});
  }

  const out: HistoryDay[] = dates.map((date) => {
    const champions = GEN_BRACKETS.map((b) => found.get(championField(date, b.id)))
      .filter((c): c is ArchivedChampion => !!c)
      .map(toRecord);
    return { date, champions };
  });
  return { days: out };
}

function safeParseChampion(s: string): ArchivedChampion | null {
  try {
    return JSON.parse(s) as ArchivedChampion;
  } catch {
    return null;
  }
}

/** Top finisher (rank #1) and total clears for one era's daily board. */
async function bracketLeader(
  redis: Redis,
  date: string,
  bracket: BracketId,
): Promise<{ total: number; leader: LeaderboardEntry | null }> {
  const key = boardKey(date, bracket);
  const [members, count] = await Promise.all([
    redis.zrange<string[]>(key, 0, 0),
    redis.zcard(key),
  ]);
  const total = count ?? 0;
  if (members.length === 0) return { total, leader: null };

  const member = members[0];
  const meta = await redis.hmget<Record<string, BoardEntryData | string>>(
    boardDataKey(date, bracket),
    member,
  );
  const rawMeta = meta?.[member];
  const data: Partial<BoardEntryData> =
    typeof rawMeta === 'string' ? safeParse(rawMeta) : rawMeta ?? {};

  return {
    total,
    leader: {
      rank: 1,
      id: member,
      name: displayName(member, data),
      difficulty: data.difficulty ?? 'normal',
      at: Number(data.at) || 0,
      clearedStages: data.clearedStages ?? 0,
      team: Array.isArray(data.team) ? data.team : [],
      ...(Array.isArray(data.relics) ? { relics: data.relics } : {}),
      defeated: typeof data.defeated === 'string' ? data.defeated : undefined,
    },
  };
}
