import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedis } from '../_redis.js';
import { rateLimit } from '../_ratelimit.js';
import { readSession } from '../_session.js';
import { getDb, isMissingSchema, type Db } from '../_db.js';
import { dismissResult } from '../_world.js';

import {
  activateRoute, chooseRoute, claimRouteQuest, dismissRouteResult, finishLegacyRoute, loadRouteState,
  parseMarketTrade, parseRouteChoose, parseRouteQuest, parseRouteSearch, parseRouteTravel, RouteError, searchRoute, tradeMarket, travelRoute, validRouteRequestId,
} from '../_route-actions.js';

/** Live routes, Bag and legacy compatibility behind the existing dispatcher. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  if (action === 'state') return state(req, res);
  if (action === 'start' || action === 'step') return retired(req, res);
  if (action === 'finish') return finish(req, res);
  if (action === 'dismiss') return dismiss(req, res);
  if (['activate', 'search', 'choose', 'quest-claim', 'result-dismiss', 'market-trade', 'travel'].includes(action)) return mutate(req, res, action);
  return res.status(404).json({ ok: false, error: 'not found' });
}

/** The JSON body as an object; anything else (bad JSON, an array) reads as {}. */
function parseBody(req: VercelRequest): Record<string, unknown> {
  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function requirePost(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return false;
  }
  return true;
}

function gate(req: VercelRequest, res: VercelResponse): { uid: string; db: Db } | null {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Sign in to play.' });
    return null;
  }
  const db = getDb();
  if (!db) {
    res.status(200).json({ ok: false, error: 'The world is unavailable right now.' });
    return null;
  }
  return { uid, db };
}

/** Per-trainer write limits; true (and a 429 sent) when over. */
async function limited(uid: string, res: VercelResponse): Promise<boolean> {
  const redis = getRedis();
  const [minute, day] = await Promise.all([
    rateLimit(redis, `rl:world:m:${uid}`, 60, 60),
    rateLimit(redis, `rl:world:d:${uid}`, 2000, 60 * 60 * 24),
  ]);
  if (minute && day) return false;
  res.status(429).json({ ok: false, error: 'Too many requests — slow down a little.' });
  return true;
}

function failed(res: VercelResponse, action: string, err: unknown, fallback: string) {
  console.error(`[world/${action}] failed:`, err);
  return res.status(503).json({ ok: false, error: isMissingSchema(err) ? 'The world map isn’t ready yet.' : fallback });
}

async function state(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  const g = gate(req, res);
  if (!g) return;
  try { return res.status(200).json({ ok: true, state: await loadRouteState(g.db, g.uid, Date.now()) }); }
  catch (err) { return failed(res, 'state', err, 'Couldn’t load the world.'); }
}

async function retired(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = gate(req, res);
  if (!g) return;
  if (await limited(g.uid, res)) return;
  return res.status(409).json({ ok: false, error: 'Idle training and expeditions have ended. Refresh to explore Sunny Meadow.', retired: true });
}

async function domainFailure(res: VercelResponse, g: { uid: string; db: Db }, action: string, err: unknown) {
  if (err instanceof RouteError) {
    let state;
    // Optional recovery state never hides the original, actionable rejection.
    try { state = await loadRouteState(g.db, g.uid, Date.now()); } catch { /* unavailable schema */ }
    return res.status(err.status).json({ ok: false, error: err.message, ...(state ? { state } : {}), ...(err.party ? { party: err.party } : {}) });
  }
  return failed(res, action, err, 'Couldn’t save that action. Please try again.');
}

async function mutate(req: VercelRequest, res: VercelResponse, action: string) {
  if (!requirePost(req, res)) return;
  const g = gate(req, res);
  if (!g) return;
  if (await limited(g.uid, res)) return;
  const body = parseBody(req);
  const now = Date.now();
  try {
    let out;
    if (action === 'activate') {
      if (!validRouteRequestId(body.requestId)) return res.status(400).json({ ok: false, error: 'A request ID is required.' });
      out = await activateRoute(g.db, g.uid, body.requestId, now);
    } else if (action === 'search') {
      const input = parseRouteSearch(body);
      if (!input) return res.status(400).json({ ok: false, error: 'Choose a Sunny Meadow search and your saved party.' });
      out = await searchRoute(g.db, g.uid, input, now);
    } else if (action === 'choose') {
      const input = parseRouteChoose(body);
      if (!input) return res.status(400).json({ ok: false, error: 'Choose an available encounter action and supported ball.' });
      out = await chooseRoute(g.db, g.uid, input, now);
    } else if (action === 'quest-claim') {
      const input = parseRouteQuest(body);
      if (!input) return res.status(400).json({ ok: false, error: 'Choose a valid quest reward.' });
      out = await claimRouteQuest(g.db, g.uid, input, now);
    } else if (action === 'market-trade') {
      const input = parseMarketTrade(body);
      if (!input) return res.status(400).json({ ok: false, error: 'Choose an item the market trades and a quantity from 1 to 99.' });
      out = await tradeMarket(g.db, g.uid, input, now);
    } else if (action === 'travel') {
      const input = parseRouteTravel(body);
      if (!input) return res.status(400).json({ ok: false, error: 'Choose a place to travel to and your saved party.' });
      out = await travelRoute(g.db, g.uid, input, now);
    } else {
      if (!validRouteRequestId(body.eventId)) return res.status(400).json({ ok: false, error: 'Choose a settled encounter result.' });
      out = await dismissRouteResult(g.db, g.uid, body.eventId, now);
    }
    return res.status(200).json({ ok: true, ...out });
  } catch (err) { return domainFailure(res, g, action, err); }
}

async function finish(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = gate(req, res);
  if (!g) return;
  if (await limited(g.uid, res)) return;
  const { activityId } = parseBody(req);
  if (!validRouteRequestId(activityId)) return res.status(404).json({ ok: false, error: 'Nothing to collect.' });
  try { return res.status(200).json({ ok: true, ...await finishLegacyRoute(g.db, g.uid, activityId, Date.now()) }); }
  catch (err) { return domainFailure(res, g, 'finish', err); }
}

// --- dismiss -------------------------------------------------------------------

async function dismiss(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = gate(req, res);
  if (!g) return;
  if (await limited(g.uid, res)) return;
  const { activityId } = parseBody(req);
  if (typeof activityId !== 'string' || activityId.length < 1 || activityId.length > 64) {
    return res.status(404).json({ ok: false, error: 'Nothing to dismiss.' });
  }
  try {
    const out = await dismissResult(g.db, g.uid, activityId, Date.now());
    if (out === 'not_found') return res.status(404).json({ ok: false, error: 'Nothing to dismiss.' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return failed(res, 'dismiss', err, 'Couldn’t dismiss that.');
  }
}
