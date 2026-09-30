import { Redis } from '@upstash/redis';

// Reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from the environment
// (set them in the Vercel project, or .env.local for `vercel dev`).
//
// IMPORTANT: `Redis.fromEnv()` throws synchronously when those vars are missing
// or malformed. If we called it at module load, that throw would crash the
// entire serverless function before the handler runs — surfacing only an opaque
// `FUNCTION_INVOCATION_FAILED` 500. So we init lazily and let callers degrade
// gracefully (clean error) when Redis isn't configured.
let client: Redis | null = null;
let initialized = false;

export function getRedis(): Redis | null {
  if (initialized) return client;
  initialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error(
      '[redis] Redis disabled: missing UPSTASH_REDIS_REST_URL / ' +
        'UPSTASH_REDIS_REST_TOKEN. Set them in the Vercel project (Settings → ' +
        'Environment Variables) or in .env.local for `vercel dev`.',
    );
    return null;
  }

  try {
    client = new Redis({ url, token });
  } catch (err) {
    console.error('[redis] Failed to initialize Redis client:', err);
    client = null;
  }
  return client;
}
