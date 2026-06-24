import type { VercelRequest } from '@vercel/node';
import type { Redis } from '@upstash/redis';

/**
 * Dirt-simple fixed-window limiter on top of the existing Redis client (no new
 * dependency). `incr` is atomic, so concurrent requests can't slip past the cap;
 * the first hit in a window arms the TTL. Anything that goes wrong with Redis is
 * swallowed — a limiter must never be the reason a real player can't submit.
 */
export async function rateLimit(
  redis: Redis | null,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!redis) return true;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSeconds);
    return n <= limit;
  } catch {
    return true;
  }
}

/** Best-effort client IP for per-caller limiting (Vercel sets x-forwarded-for). */
export function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw?.split(',')[0] ?? '').trim() || 'unknown';
}
