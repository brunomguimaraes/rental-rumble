import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dailyKey } from '../src/game/opponents.js';
import { isBracketId, DEFAULT_BRACKET, type BracketId } from '../src/game/gens.js';
import { isDifficulty, type Difficulty } from '../src/game/run.js';
import { getRedis } from './_redis.js';
import { rateLimit, clientIp } from './_ratelimit.js';
import { getTokenSecret, signRunToken, newSeed, newNonce } from './_token.js';

// Hands the client a server-chosen run seed and a signed token that binds it to
// today's date/bracket/difficulty. The browser must play *this* seed and echo
// the token back on submit. Without it, a win can't be tied to a run the server
// actually authorised.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const body: { bracket?: unknown; difficulty?: unknown } =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};

  const bracket: BracketId = isBracketId(body.bracket)
    ? body.bracket
    : DEFAULT_BRACKET;
  const difficulty: Difficulty = isDifficulty(body.difficulty)
    ? body.difficulty
    : 'normal';
  const date = dailyKey();

  // Cap how fast one caller can mint tokens — generous for real play (many runs
  // a day), tight enough to make scripted token-fishing expensive.
  const redis = getRedis();
  const ip = clientIp(req);
  const [okDay, okMin] = await Promise.all([
    rateLimit(redis, `rl:start:d:${ip}:${date}`, 200, 60 * 60 * 24),
    rateLimit(redis, `rl:start:m:${ip}`, 20, 60),
  ]);
  if (!okDay || !okMin) {
    return res.status(429).json({ ok: false, error: 'too many runs, slow down' });
  }

  const seed = newSeed();
  const secret = getTokenSecret();
  const token = secret
    ? signRunToken(
        { seed, date, bracket, difficulty, n: newNonce(), iat: Date.now() },
        secret,
      )
    : null;

  // A token must never be cached/shared by a CDN.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, seed, token });
}
