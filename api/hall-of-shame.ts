import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  SHAME_TOP,
  type ShameEntry,
  type ShameResponse,
} from '../src/game/hallOfShame.js';
import { dailyKey } from '../src/game/opponents.js';
import { DEFAULT_BRACKET } from '../src/game/gens.js';
import {
  getRedis,
  shameKey,
  shameDataKey,
  type ShameEntryData,
} from './_redis.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function safeParse(s: string): Partial<ShameEntryData> {
  try {
    return JSON.parse(s) as Partial<ShameEntryData>;
  } catch {
    return {};
  }
}

/** Display name for a row, falling back to the board id for a malformed row. */
function shameDisplayName(member: string, data: Partial<ShameEntryData>): string {
  return typeof data.name === 'string' && data.name ? data.name : member;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.date;
  const date = typeof raw === 'string' && YMD.test(raw) ? raw : dailyKey();

  let entries: ShameEntry[] = [];
  let total = 0;

  const redis = getRedis();
  if (redis) {
    try {
      // Ascending order: the sorted-set score makes rank #1 the most shameful
      // run (fewest stages cleared), with the most recent flop breaking ties.
      const [members, count] = await Promise.all([
        redis.zrange<string[]>(shameKey(date), 0, SHAME_TOP - 1),
        redis.zcard(shameKey(date)),
      ]);
      total = count ?? 0;

      const meta =
        members.length > 0
          ? await redis.hmget<Record<string, ShameEntryData | string>>(
              shameDataKey(date),
              ...members,
            )
          : {};

      entries = members.map((member, i) => {
        const rawMeta = meta?.[member];
        const data: Partial<ShameEntryData> =
          typeof rawMeta === 'string' ? safeParse(rawMeta) : rawMeta ?? {};
        return {
          rank: i + 1,
          id: member,
          name: shameDisplayName(member, data),
          difficulty: data.difficulty ?? 'normal',
          bracket: data.bracket ?? DEFAULT_BRACKET,
          clearedStages: data.clearedStages ?? 0,
          at: Number(data.at) || 0,
          team: Array.isArray(data.team) ? data.team : [],
          fellTo: typeof data.fellTo === 'string' ? data.fellTo : '',
          ...(Array.isArray(data.fellToTeam)
            ? { fellToTeam: data.fellToTeam }
            : {}),
        } satisfies ShameEntry;
      });
    } catch (err) {
      // A Redis hiccup should never blank the loss screen — serve an empty board.
      console.error('[hall-of-shame] Redis read failed:', err);
      entries = [];
      total = 0;
    }
  }

  const body: ShameResponse = { date, total, entries };
  // Small CDN cache so a popular board doesn't hammer Redis.
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  return res.status(200).json(body);
}
