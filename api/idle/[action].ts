import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { getRedis } from '../_redis.js';
import { rateLimit } from '../_ratelimit.js';
import { readSession } from '../_session.js';
import {
  getDb,
  readProfile,
  readOwnedByIds,
  readOwnedByUser,
  countOwned,
  insertOwned,
  updateOwnedEvolution,
  readOpenSession,
  readSessionById,
  insertSession,
  closeSession,
  insertEncounters,
  type Db,
} from '../_db.js';
import { routeById, isPartyEligible, isRouteUnlocked, encountersFor, IDLE_CAP_MS } from '../../src/game/routes.js';
import { simulateIdle } from '../../src/game/idle.js';
import { ownedMonToCreature, type OwnedMon } from '../../src/game/box.js';
import { applyGrowthWithEvolution } from '../../src/game/evolution.js';
import { rollTutorialReward } from '../../src/game/catch.js';
import { zoneById } from '../../src/game/zones.js';
import { RNG } from '../../src/game/rng.js';
import type { Creature } from '../../src/game/types.js';

// The idle loop's server half, behind one dynamic function: start opens a
// session row (the seed is fixed here, so a later claim can't re-roll), current
// reports it, claim simulates the elapsed encounters and is the ONLY writer of
// growth and evolution, and tutorial-catch is the one-time guided gift.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  switch (action) {
    case 'start':
      return start(req, res);
    case 'current':
      return current(req, res);
    case 'claim':
      return claim(req, res);
    case 'tutorial-catch':
      return tutorialCatch(req, res);
    default:
      return res.status(404).json({ ok: false, error: 'not found' });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
}

function requirePost(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return false;
  }
  return true;
}

async function gate(req: VercelRequest, res: VercelResponse): Promise<{ uid: string; db: Db } | null> {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'sign in to play' });
    return null;
  }
  const db = getDb();
  if (!db) {
    res.status(200).json({ ok: false, error: 'idle play unavailable' });
    return null;
  }
  return { uid, db };
}

function publicSession(s: { id: string; routeId: string; partyIds: string[]; startedAt: number }) {
  return { id: s.id, routeId: s.routeId, partyIds: s.partyIds, startedAt: s.startedAt };
}

function newSeed(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

// --- start -------------------------------------------------------------------

async function start(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = await gate(req, res);
  if (!g) return;
  const { uid, db } = g;

  const redis = getRedis();
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:idle:m:${uid}`, 20, 60),
    rateLimit(redis, `rl:idle:d:${uid}`, 300, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) return res.status(429).json({ ok: false, error: 'too many requests, slow down' });

  const body = parseBody(req);
  const route = routeById(body.routeId);
  if (!route) return res.status(400).json({ ok: false, error: 'unknown route' });

  try {
    const profile = await readProfile(db, uid);
    if (!profile) return res.status(400).json({ ok: false, error: 'finish onboarding first' });
    if (!isRouteUnlocked(route, [])) return res.status(400).json({ ok: false, error: 'that route is locked' });
    if (await readOpenSession(db, uid)) {
      return res.status(409).json({ ok: false, error: 'your trainer is already out — claim first' });
    }
    const raw = Array.isArray(body.partyIds) ? body.partyIds : [];
    const partyIds = [...new Set(raw.filter((p): p is string => typeof p === 'string'))];
    if (partyIds.length < 1 || partyIds.length > 6) {
      return res.status(400).json({ ok: false, error: 'pick 1-6 of your Pokémon' });
    }
    const rows = await readOwnedByIds(db, uid, partyIds);
    if (rows.length !== partyIds.length) {
      return res.status(400).json({ ok: false, error: 'that party includes a Pokémon you don’t own' });
    }
    if (!isPartyEligible(rows.map((m) => m.level), route)) {
      return res.status(400).json({ ok: false, error: `every Pokémon must be level ${route.min}-${route.max} for ${route.name}` });
    }
    const session = { id: randomUUID(), userId: uid, routeId: route.id, partyIds, seed: newSeed(), startedAt: Date.now() };
    await insertSession(db, session);
    return res.status(200).json({ ok: true, session: publicSession(session), serverNow: session.startedAt });
  } catch (err) {
    console.error('[idle/start] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not send your trainer out' });
  }
}

// --- current -----------------------------------------------------------------

async function current(req: VercelRequest, res: VercelResponse) {
  const g = await gate(req, res);
  if (!g) return;
  try {
    const s = await readOpenSession(g.db, g.uid);
    return res.status(200).json({ ok: true, session: s ? publicSession(s) : null, serverNow: Date.now() });
  } catch (err) {
    console.error('[idle/current] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not load session' });
  }
}

// --- claim -------------------------------------------------------------------

async function claim(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = await gate(req, res);
  if (!g) return;
  const { uid, db } = g;

  const redis = getRedis();
  if (!(await rateLimit(redis, `rl:idleclaim:m:${uid}`, 20, 60))) {
    return res.status(429).json({ ok: false, error: 'slow down' });
  }

  const body = parseBody(req);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) return res.status(400).json({ ok: false, error: 'missing session' });

  try {
    const s = await readSessionById(db, uid, sessionId);
    if (!s) return res.status(404).json({ ok: false, error: 'no such session' });
    if (s.claimedAt !== null) return res.status(409).json({ ok: false, error: 'this session was already claimed' });
    const route = routeById(s.routeId);
    if (!route) return res.status(400).json({ ok: false, error: 'unknown route' });

    const now = Date.now();
    const elapsedMs = Math.max(0, Math.min(now - s.startedAt, IDLE_CAP_MS));
    const count = encountersFor(elapsedMs, route);

    // Rebuild the exact party the session pinned. Ownership is re-checked; the
    // level band is NOT (it was legal at start, and a mon may have grown since).
    const rows = await readOwnedByIds(db, uid, s.partyIds);
    const byId = new Map<string, OwnedMon>(rows.map((m) => [m.id, m]));
    const party: OwnedMon[] = s.partyIds.map((id) => byId.get(id)).filter((m): m is OwnedMon => Boolean(m));
    if (party.length !== s.partyIds.length) {
      return res.status(400).json({ ok: false, error: 'that party is no longer valid' });
    }
    const creatures: Creature[] = [];
    for (const m of party) {
      const c = ownedMonToCreature(m);
      if (!c) return res.status(400).json({ ok: false, error: 'could not rebuild your party' });
      creatures.push(c);
    }

    const outcome = simulateIdle(creatures, s.seed, route, count);
    const stoppedBy: 'loss' | 'cap' | 'early' =
      outcome.stoppedBy === 'loss' ? 'loss' : elapsedMs >= IDLE_CAP_MS ? 'cap' : 'early';

    const gained = outcome.wins * route.expPerWin;
    const levelUps: { id: string; fromLevel: number; toLevel: number }[] = [];
    const evolutions: { id: string; fromDexId: number; toDexId: number }[] = [];
    for (const m of party) {
      const grown = applyGrowthWithEvolution(m, gained, new RNG(`evolve:${m.id}:${s.seed}`));
      if (grown.levelUp) levelUps.push({ id: m.id, ...grown.levelUp });
      for (const e of grown.evolutions) evolutions.push({ id: m.id, ...e });
      if (grown.mon.level !== m.level || grown.mon.exp !== m.exp || grown.mon.dexId !== m.dexId) {
        await updateOwnedEvolution(db, uid, grown.mon);
      }
    }

    const log = { routeId: route.id, encounters: outcome.encounters, wins: outcome.wins, stoppedBy, elapsedMs, expPerWin: route.expPerWin };
    await insertEncounters(db, s.id, outcome.encounters);
    await closeSession(db, s.id, { claimedAt: now, stoppedBy, encounters: outcome.encounters.length, log: JSON.stringify(log) });

    const box = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, log, levelUps, evolutions, box });
  } catch (err) {
    console.error('[idle/claim] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not claim the session' });
  }
}

// --- tutorial-catch ----------------------------------------------------------

async function tutorialCatch(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = await gate(req, res);
  if (!g) return;
  const { uid, db } = g;
  try {
    const profile = await readProfile(db, uid);
    if (!profile) return res.status(400).json({ ok: false, error: 'finish onboarding first' });
    if ((await countOwned(db, uid)) !== 1) {
      return res.status(400).json({ ok: false, error: 'tutorial already complete' });
    }
    const zone = zoneById('tutorial')!;
    const now = Date.now();
    const caught = await insertOwned(db, uid, rollTutorialReward(`tutorial:${uid}`, zone), 'tutorial', now);
    await db.execute({
      sql: 'insert or ignore into pokedex_cells (user_id, dex_id, layer, caught_at) values (?, ?, ?, ?)',
      args: [uid, caught.dexId, caught.shiny ? 's' : caught.altColor ? 'a' : 'n', now],
    });
    const box = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, caught, box });
  } catch (err) {
    console.error('[idle/tutorial-catch] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not complete the tutorial' });
  }
}
