import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readSession } from '../_session.js';
import {
  getDb,
  DEX_LAYERS,
  DEX_MAX_ID,
  readOwnedByUser,
  readProfile,
  insertProfileWithStarter,
  readOwnedByIds,
  updateOwnedNickname,
  type Db,
} from '../_db.js';
import { isProfessorId, professorById, rollStarter } from '../../src/game/professions.js';
import { cleanNickname } from '../../src/game/profile.js';

// The per-account endpoints behind one Vercel function (dynamic `[action]`
// route): `/api/me/pokedex`, `/api/me/box`, `/api/me/profile`, …. Same URLs,
// one Serverless Function (Hobby 12-function cap), libSQL data layer.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  switch (action) {
    case 'pokedex':
      return pokedex(req, res);
    case 'box':
      return box(req, res);
    case 'profile':
      return profile(req, res);
    case 'onboard':
      return onboard(req, res);
    case 'nickname':
      return nickname(req, res);
    default:
      return res.status(404).json({ ok: false, error: 'not found' });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? JSON.parse(req.body || '{}')
    : (req.body ?? {});
}

const BYTES = (DEX_MAX_ID >> 3) + 1;

async function pokedex(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(200).json({ ok: true, owned: null });
  const db = getDb();
  if (!db) return res.status(200).json({ ok: true, owned: null });

  try {
    const rs = await db.execute({
      sql: 'select dex_id, layer from pokedex_cells where user_id = ?',
      args: [uid],
    });
    const maps: Record<string, Uint8Array> = {
      n: new Uint8Array(BYTES),
      a: new Uint8Array(BYTES),
      s: new Uint8Array(BYTES),
    };
    const counts: Record<string, number> = { n: 0, a: 0, s: 0 };
    for (const r of rs.rows as unknown as { dex_id: number; layer: string }[]) {
      const map = maps[r.layer];
      if (!map) continue;
      const d = Number(r.dex_id);
      if (!Number.isInteger(d) || d < 1 || d > DEX_MAX_ID) continue;
      const byte = d >> 3;
      const bit = 1 << (d & 7);
      if ((map[byte] & bit) === 0) {
        map[byte] |= bit;
        counts[r.layer] += 1;
      }
    }
    const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
    return res.status(200).json({
      ok: true,
      owned: { n: b64(maps.n), a: b64(maps.a), s: b64(maps.s) },
      counts: { n: counts.n, a: counts.a, s: counts.s },
      total: DEX_MAX_ID,
      layers: DEX_LAYERS,
    });
  } catch (err) {
    console.error('[me/pokedex] failed:', err);
    return res.status(200).json({ ok: true, owned: null });
  }
}

// --- runs: the personal archive ----------------------------------------------

async function box(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(200).json({ ok: true, box: [] });
  const db: Db | null = getDb();
  if (!db) return res.status(200).json({ ok: true, box: [] });

  try {
    const owned = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, box: owned });
  } catch (err) {
    console.error('[me/box] failed:', err);
    return res.status(200).json({ ok: true, box: [] });
  }
}

// --- profile / onboard / nickname -------------------------------------------

function toProfile(p: { profession: string; mentor: string; starterId: string; currentRoute: string; createdAt: number }) {
  return { profession: p.profession, mentor: p.mentor, starterId: p.starterId, currentRoute: p.currentRoute, createdAt: p.createdAt };
}

async function profile(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'sign in first' });
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: 'accounts unavailable' });
  try {
    const p = await readProfile(db, uid);
    return res.status(200).json({ ok: true, profile: p ? toProfile(p) : null });
  } catch (err) {
    console.error('[me/profile] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not load profile' });
  }
}

async function onboard(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'sign in first' });
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: 'accounts unavailable' });

  const body = parseBody(req);
  if (body.profession !== 'trainer') {
    return res.status(400).json({ ok: false, error: 'only the Trainer route is open for now' });
  }
  if (!isProfessorId(body.mentor)) return res.status(400).json({ ok: false, error: 'unknown professor' });
  const professor = professorById(body.mentor)!;

  try {
    // A missing profile is the only precondition. Accounts that owned Pokémon
    // before slice 1 (earlier catches) still onboard; the profiles primary key
    // inside insertProfileWithStarter stops a second, concurrent onboarding.
    if (await readProfile(db, uid)) {
      return res.status(400).json({ ok: false, error: 'you already have a profile' });
    }
    const now = Date.now();
    const base = { userId: uid, profession: 'trainer', mentor: professor.id, currentRoute: 'r1', createdAt: now };
    const starter = await insertProfileWithStarter(db, base, rollStarter(`starter:${uid}`, professor), now);
    const row = { ...base, starterId: starter.id };
    const box = await readOwnedByUser(db, uid);
    return res.status(200).json({ ok: true, profile: toProfile(row), starter, box });
  } catch (err) {
    console.error('[me/onboard] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not start your journey' });
  }
}

async function nickname(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(401).json({ ok: false, error: 'sign in first' });
  const db = getDb();
  if (!db) return res.status(200).json({ ok: false, error: 'accounts unavailable' });

  const body = parseBody(req);
  const id = typeof body.id === 'string' ? body.id : '';
  const name = cleanNickname(body.nickname);
  if (!id || !name) return res.status(400).json({ ok: false, error: 'nickname must be 1–12 characters' });
  try {
    const [mon] = await readOwnedByIds(db, uid, [id]);
    if (!mon) return res.status(404).json({ ok: false, error: 'not your Pokémon' });
    await updateOwnedNickname(db, uid, id, name);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[me/nickname] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not save nickname' });
  }
}
