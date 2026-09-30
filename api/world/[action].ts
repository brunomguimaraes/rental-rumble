import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedis } from '../_redis.js';
import { rateLimit } from '../_ratelimit.js';
import { readSession } from '../_session.js';
import { getDb, isMissingSchema, type Db } from '../_db.js';
import {
  loadWorldState,
  parseStartInput,
  startActivity,
  parseStepInput,
  stepExpedition,
  finishActivity,
  dismissResult,
} from '../_world.js';

// The world map's endpoints behind one Vercel function (dynamic `[action]`
// route): `/api/world/state`, `/start`, `/step`, `/finish`, `/dismiss`. Each
// action is thin — method, session, rate limit, input — and api/_world.ts does
// the work. The client sends intent and ids only; the server owns the seed,
// the clock, every battle, and every reward.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  switch (action) {
    case 'state':
      return state(req, res);
    case 'start':
      return start(req, res);
    case 'step':
      return step(req, res);
    case 'finish':
      return finish(req, res);
    case 'dismiss':
      return dismiss(req, res);
    default:
      return res.status(404).json({ ok: false, error: 'not found' });
  }
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

// --- state ---------------------------------------------------------------------

async function state(req: VercelRequest, res: VercelResponse) {
  const g = gate(req, res);
  if (!g) return;
  try {
    const s = await loadWorldState(g.db, g.uid, Date.now());
    return res.status(200).json({ ok: true, ...s });
  } catch (err) {
    return failed(res, 'state', err, 'Couldn’t load the world.');
  }
}

// --- start ---------------------------------------------------------------------

async function start(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = gate(req, res);
  if (!g) return;
  if (await limited(g.uid, res)) return;
  const input = parseStartInput(parseBody(req));
  if (!input) return res.status(400).json({ ok: false, error: 'Pick a place, a mode, and your party.' });
  try {
    const out = await startActivity(g.db, g.uid, input, Date.now());
    switch (out.status) {
      case 'ok':
        return res.status(200).json({ ok: true, activity: out.activity });
      case 'busy':
        return res.status(409).json({ ok: false, error: 'Your trainer is already out.', activity: out.activity });
      case 'party_changed':
        return res.status(409).json({ ok: false, error: 'Your party changed. Check it and try again.', party: out.party });
      case 'locked':
        return res.status(400).json({ ok: false, error: 'That place is still locked.' });
      case 'no_profile':
        return res.status(400).json({ ok: false, error: 'Finish onboarding first.' });
      case 'no_party':
        return res.status(400).json({ ok: false, error: 'Choose at least one Pokémon for your party.' });
    }
  } catch (err) {
    return failed(res, 'start', err, 'Couldn’t send your trainer out.');
  }
}

// --- step ----------------------------------------------------------------------

async function step(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = gate(req, res);
  if (!g) return;
  if (await limited(g.uid, res)) return;
  const input = parseStepInput(parseBody(req));
  if (!input) return res.status(400).json({ ok: false, error: 'That choice isn’t available here.' });
  try {
    const out = await stepExpedition(g.db, g.uid, input, Date.now());
    switch (out.status) {
      case 'ok':
        return res.status(200).json({ ok: true, activity: out.activity, event: out.event, result: out.result, box: out.box });
      case 'not_found':
        return res.status(404).json({ ok: false, error: 'No such expedition.' });
      case 'not_expedition':
        return res.status(400).json({ ok: false, error: 'That isn’t an expedition.' });
      case 'invalid_choice':
        return res.status(400).json({ ok: false, error: 'That choice isn’t available here.' });
      case 'conflict':
        return res.status(409).json({ ok: false, error: 'That checkpoint was already decided.', activity: out.activity, result: out.result });
    }
  } catch (err) {
    return failed(res, 'step', err, 'Couldn’t continue the expedition.');
  }
}

// --- finish --------------------------------------------------------------------

async function finish(req: VercelRequest, res: VercelResponse) {
  if (!requirePost(req, res)) return;
  const g = gate(req, res);
  if (!g) return;
  if (await limited(g.uid, res)) return;
  const { activityId } = parseBody(req);
  if (typeof activityId !== 'string' || activityId.length < 1 || activityId.length > 64) {
    return res.status(404).json({ ok: false, error: 'Nothing to collect.' });
  }
  try {
    const out = await finishActivity(g.db, g.uid, activityId, Date.now());
    if (out.status === 'not_found') return res.status(404).json({ ok: false, error: 'Nothing to collect.' });
    return res.status(200).json({ ok: true, result: out.result, box: out.box });
  } catch (err) {
    return failed(res, 'finish', err, 'Couldn’t bring your trainer home.');
  }
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
