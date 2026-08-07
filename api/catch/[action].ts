import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedis } from '../_redis.js';
import { rateLimit } from '../_ratelimit.js';
import { readSession } from '../_session.js';
import {
  getDb,
  BOX_LIMIT,
  countOwned,
  readOwnedByIds,
  readOwnedByUser,
  insertOwned,
  updateOwnedGrowth,
  type Db,
} from '../_db.js';
import { getTokenSecret, newSeed, newNonce, NONCE_TTL_SECONDS } from '../_token.js';
import {
  signCatchToken,
  verifyCatchToken,
  CATCH_TOKEN_TTL_MS,
  MIN_CATCH_MS,
} from '../_catchtoken.js';
import { zoneById, isPartyEligible, type CatchZone } from '../../src/game/zones.js';
import { ownedMonToCreature, type MintSpec, type OwnedMon } from '../../src/game/box.js';
import { simulateCatchMission, rollCatchReward } from '../../src/game/catch.js';
import { applyExp } from '../../src/game/levels.js';
import type { Creature } from '../../src/game/types.js';

// Both Catch endpoints behind one dynamic `[action]` route (Hobby 12-function
// cap): `/api/catch/start` authorises a run, `/api/catch/complete` re-simulates
// it and — only on a genuine clear — mints the reward and grants EXP. The server
// is the sole writer of the box; the client outcome is never trusted.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  switch (action) {
    case 'start':
      return start(req, res);
    case 'complete':
      return complete(req, res);
    default:
      return res.status(404).json({ ok: false, error: 'not found' });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
}

/** The pokedex_cells layer a caught variant lands in. */
function layerFor(mon: { shiny: boolean; altColor: boolean }): 'n' | 'a' | 's' {
  return mon.shiny ? 's' : mon.altColor ? 'a' : 'n';
}

/** OR the caught form into the completion overlay (idempotent). */
async function creditDexCell(db: Db, uid: string, dexId: number, layer: string, now: number) {
  await db.execute({
    sql: 'insert or ignore into pokedex_cells (user_id, dex_id, layer, caught_at) values (?, ?, ?, ?)',
    args: [uid, dexId, layer, now],
  });
}

// --- start -------------------------------------------------------------------

async function start(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const uid = readSession(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'sign in to play' });

  const db = getDb();
  const secret = getTokenSecret();
  if (!db || !secret) {
    return res.status(200).json({ ok: false, error: 'catch runs unavailable' });
  }

  const redis = getRedis();
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:catch:m:${uid}`, 20, 60),
    rateLimit(redis, `rl:catch:d:${uid}`, 300, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) {
    return res.status(429).json({ ok: false, error: 'too many runs, slow down' });
  }

  const body = parseBody(req);
  const zone = zoneById(body.zone);
  if (!zone) return res.status(400).json({ ok: false, error: 'unknown zone' });

  try {
    let partyIds: string[] = [];

    if (zone.id === 'tutorial') {
      // The tutorial catch is a one-time gift for a brand-new (empty) box.
      const owned = await countOwned(db, uid);
      if (owned > 0) {
        return res.status(400).json({ ok: false, error: 'tutorial already complete' });
      }
    } else {
      const owned = await countOwned(db, uid);
      if (owned >= BOX_LIMIT) {
        return res.status(400).json({ ok: false, error: 'your box is full' });
      }
      const raw = Array.isArray(body.party) ? body.party : [];
      partyIds = [...new Set(raw.filter((p): p is string => typeof p === 'string'))];
      if (partyIds.length < 1 || partyIds.length > 6) {
        return res.status(400).json({ ok: false, error: 'pick 1-6 of your Pokémon' });
      }
      const rows = await readOwnedByIds(db, uid, partyIds);
      if (rows.length !== partyIds.length) {
        return res.status(400).json({ ok: false, error: 'that party includes a mon you don’t own' });
      }
      if (!isPartyEligible(rows.map((m) => m.level), zone)) {
        return res.status(400).json({
          ok: false,
          error: `every mon must be level ${zone.min}-${zone.max} for ${zone.name}`,
        });
      }
    }

    const seed = newSeed();
    const token = signCatchToken(
      { uid, zone: zone.id, party: partyIds, seed, n: newNonce(), iat: Date.now() },
      secret,
    );
    return res.status(200).json({ ok: true, seed, token, zone: zone.id });
  } catch (err) {
    console.error('[catch/start] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not start run' });
  }
}

// --- complete ----------------------------------------------------------------

async function complete(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const uid = readSession(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'sign in to play' });

  const db = getDb();
  const secret = getTokenSecret();
  if (!db || !secret) {
    return res.status(200).json({ ok: false, error: 'catch runs unavailable' });
  }

  const redis = getRedis();
  const okMin = await rateLimit(redis, `rl:catchdone:m:${uid}`, 30, 60);
  if (!okMin) return res.status(429).json({ ok: false, error: 'slow down' });

  const body = parseBody(req);
  const verdict = verifyCatchToken(body.token, secret);
  if (!verdict.ok) {
    return res.status(200).json({ ok: false, error: `unverified: ${verdict.reason}` });
  }
  const claims = verdict.claims;
  if (claims.uid !== uid) {
    return res.status(403).json({ ok: false, error: 'this run belongs to another account' });
  }
  const age = Date.now() - claims.iat;
  if (age < 0 || age > CATCH_TOKEN_TTL_MS) {
    return res.status(400).json({ ok: false, error: 'this run expired — start a new one' });
  }
  if (age < MIN_CATCH_MS) {
    return res.status(400).json({ ok: false, error: 'run finished implausibly fast' });
  }

  const zone = zoneById(claims.zone);
  if (!zone) return res.status(400).json({ ok: false, error: 'unknown zone' });

  try {
    // Burn the nonce so one authorised run can't be cashed in twice.
    const claimed = await burnNonce(redis, `catch:used:${claims.n}`);
    if (!claimed) {
      return res.status(409).json({ ok: false, error: 'this run was already completed' });
    }

    const now = Date.now();

    if (zone.id === 'tutorial') {
      return await finishTutorial(db, uid, claims.seed, zone, now, res);
    }

    // Rebuild the exact party from the owned rows the token pinned, re-checking
    // ownership + level band (a mon could have grown out of band since /start).
    const rows = await readOwnedByIds(db, uid, claims.party);
    const byId = new Map<string, OwnedMon>(rows.map((m) => [m.id, m]));
    const party: OwnedMon[] = [];
    for (const id of claims.party) {
      const m = byId.get(id);
      if (m) party.push(m);
    }
    if (party.length !== claims.party.length) {
      return res.status(400).json({ ok: false, error: 'that party is no longer valid' });
    }
    if (!isPartyEligible(party.map((m) => m.level), zone)) {
      return res.status(400).json({ ok: false, error: 'a party mon is no longer in this zone’s band' });
    }

    const creatures: Creature[] = [];
    for (const m of party) {
      const c = ownedMonToCreature(m);
      if (!c) return res.status(400).json({ ok: false, error: 'could not rebuild your party' });
      creatures.push(c);
    }

    // Re-simulate authoritatively: the server, not the client, decides the clear.
    const outcome = simulateCatchMission(creatures, claims.seed, zone);
    if (!outcome.cleared) {
      return res.status(200).json({ ok: true, cleared: false });
    }

    // Clear! Mint the deterministic reward and grant EXP to the party.
    const spec: MintSpec = rollCatchReward(claims.seed, zone);
    const caught = await insertOwned(db, uid, spec, 'catch', now);
    await creditDexCell(db, uid, caught.dexId, layerFor(caught), now);

    const levelUps: { id: string; fromLevel: number; toLevel: number }[] = [];
    for (const m of party) {
      const next = applyExp(m.level, m.exp, zone.expReward);
      if (next.level !== m.level || next.exp !== m.exp) {
        await updateOwnedGrowth(db, uid, m.id, next.level, next.exp);
      }
      if (next.levelsGained > 0) {
        levelUps.push({ id: m.id, fromLevel: m.level, toLevel: next.level });
      }
    }

    const box = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, cleared: true, caught, levelUps, box });
  } catch (err) {
    console.error('[catch/complete] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not finish run' });
  }
}

async function finishTutorial(
  db: Db,
  uid: string,
  seed: string,
  zone: CatchZone,
  now: number,
  res: VercelResponse,
) {
  // Guard against a replayed tutorial token: the gift is only for an empty box.
  const owned = await countOwned(db, uid);
  if (owned > 0) {
    return res.status(400).json({ ok: false, error: 'tutorial already complete' });
  }
  const spec = rollCatchReward(seed, zone);
  const caught = await insertOwned(db, uid, spec, 'tutorial', now);
  await creditDexCell(db, uid, caught.dexId, layerFor(caught), now);
  const box = await readOwnedByUser(db, uid);
  return res.status(200).json({ ok: true, cleared: true, caught, levelUps: [], box });
}

/** Single-use nonce burn: NX set returns null when already spent. */
async function burnNonce(
  redis: ReturnType<typeof getRedis>,
  key: string,
): Promise<boolean> {
  if (!redis) return true; // no Redis: skip replay protection (dev/offline)
  try {
    const set = await redis.set(key, '1', { nx: true, ex: NONCE_TTL_SECONDS });
    return set !== null;
  } catch {
    return true;
  }
}
