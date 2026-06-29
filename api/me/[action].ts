import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedis } from '../_redis.js';
import { rateLimit } from '../_ratelimit.js';
import { readSession } from '../_session.js';
import {
  getDb,
  RUNS_LIMIT,
  DEX_LAYERS,
  DEX_MAX_ID,
  type Db,
  type RunOutcome,
} from '../_db.js';
import {
  getTokenSecret,
  verifyRunToken,
  RUN_TOKEN_TTL_MS,
  MIN_RUN_MS,
} from '../_token.js';
import {
  verifyChampionWin,
  teamFromMons,
  monToRecord,
  type SubmissionMon,
  type SubmissionPayload,
} from '../../src/game/leaderboard.js';
import { reachableForms } from '../../src/game/progression.js';
import { gauntletLength } from '../../src/game/run.js';
import type { RelicId } from '../../src/game/types.js';

// The per-account endpoints behind one Vercel function (dynamic `[action]`
// route): `/api/me/record-run`, `/api/me/pokedex`, `/api/me/runs`. Same URLs,
// one Serverless Function (Hobby 12-function cap), libSQL data layer.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  switch (action) {
    case 'record-run':
      return recordRun(req, res);
    case 'pokedex':
      return pokedex(req, res);
    case 'runs':
      return runs(req, res);
    default:
      return res.status(404).json({ ok: false, error: 'not found' });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  return typeof req.body === 'string'
    ? JSON.parse(req.body || '{}')
    : (req.body ?? {});
}

// --- record-run: the ONE place progression is written ------------------------

const layerSet = new Set<string>(DEX_LAYERS);
const MAX_FORMS = 400;

function parseForm(f: unknown): { dexId: number; layer: string } | null {
  if (typeof f !== 'string') return null;
  const colon = f.indexOf(':');
  if (colon <= 0) return null;
  const dexId = Number(f.slice(0, colon));
  const layer = f.slice(colon + 1);
  if (!Number.isInteger(dexId) || dexId < 1 || dexId > DEX_MAX_ID) return null;
  if (!layerSet.has(layer)) return null;
  return { dexId, layer };
}

async function recordRun(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const uid = readSession(req);
  if (!uid) {
    return res.status(401).json({ ok: false, error: 'sign in to save progress' });
  }

  const db = getDb();
  const tokenSecret = getTokenSecret();
  if (!db || !tokenSecret) {
    return res.status(200).json({ ok: false, error: 'progression unavailable' });
  }

  const redis = getRedis();
  const [okMin, okDay] = await Promise.all([
    rateLimit(redis, `rl:record:m:${uid}`, 30, 60),
    rateLimit(redis, `rl:record:d:${uid}`, 1000, 60 * 60 * 24),
  ]);
  if (!okMin || !okDay) {
    return res.status(429).json({ ok: false, error: 'too many submissions, slow down' });
  }

  const body = parseBody(req);

  // Run-token gate (same checks as submit-win), but the nonce is NOT burned —
  // the board may still claim it, and a re-flush stays idempotent via run_id.
  const verdict = verifyRunToken(body.token, tokenSecret);
  if (!verdict.ok) {
    return res.status(200).json({ ok: false, error: `unverified: ${verdict.reason}` });
  }
  const claims = verdict.claims;
  const age = Date.now() - claims.iat;
  if (claims.seed !== body.seed) {
    return res.status(400).json({ ok: false, error: 'run token does not match' });
  }
  if (age < 0 || age > RUN_TOKEN_TTL_MS) {
    return res.status(400).json({ ok: false, error: 'run token expired' });
  }
  if (age < MIN_RUN_MS) {
    return res.status(400).json({ ok: false, error: 'run finished implausibly fast' });
  }

  // Authoritative values come from the verified token, never the body.
  const seed = claims.seed;
  const date = claims.date;
  const bracket = claims.bracket;
  const difficulty = claims.difficulty;

  const outcome: RunOutcome =
    body.outcome === 'win' ? 'win' : body.outcome === 'ragequit' ? 'ragequit' : 'loss';

  const len = gauntletLength(difficulty);
  const clearedNum = Math.max(
    0,
    Math.min(Math.floor(Number(body.clearedStages) || 0), len),
  );
  const effectiveCleared = outcome === 'win' ? len : clearedNum;
  const teamMons = Array.isArray(body.team) ? (body.team as SubmissionMon[]) : [];

  // A recorded win must re-pass the Champion re-sim.
  if (outcome === 'win') {
    const winPayload: SubmissionPayload = {
      name: '',
      date,
      bracket,
      difficulty,
      seed,
      stage: Math.floor(Number(body.stage) || 0),
      clearedStages: clearedNum,
      team: teamMons,
      ...(Array.isArray(body.relics) ? { relics: body.relics as RelicId[] } : {}),
      token: typeof body.token === 'string' ? body.token : null,
    };
    const win = verifyChampionWin(winPayload);
    if (!win.ok) {
      return res.status(400).json({ ok: false, error: `unverified win: ${win.reason}` });
    }
  }

  try {
    // Validate the claimed dex cells against what the seed could have produced.
    const reachable = reachableForms(seed, bracket, difficulty, effectiveCleared);
    const claimed = Array.isArray(body.forms) ? body.forms : [];
    const valid: { dexId: number; layer: string }[] = [];
    const seenKeys = new Set<string>();
    for (const f of claimed) {
      if (valid.length >= MAX_FORMS) break;
      if (typeof f !== 'string' || seenKeys.has(f) || !reachable.has(f)) continue;
      const parsed = parseForm(f);
      if (!parsed) continue;
      seenKeys.add(f);
      valid.push(parsed);
    }

    // OR the valid cells into the Pokédex (INSERT OR IGNORE = idempotent); the
    // count of rows actually inserted is the run's gain.
    let formsGained = 0;
    if (valid.length > 0) {
      const now = Date.now();
      const tuples: string[] = [];
      const args: (string | number)[] = [];
      for (const { dexId, layer } of valid) {
        tuples.push('(?, ?, ?, ?)');
        args.push(uid, dexId, layer, now);
      }
      const rs = await db.execute({
        sql: `insert or ignore into pokedex_cells (user_id, dex_id, layer, caught_at) values ${tuples.join(
          ', ',
        )} returning dex_id`,
        args,
      });
      formsGained = rs.rows.length;
    }

    // Append the run (run_id makes a re-flush a no-op → stats bumped once).
    const runId = `${date}:${seed}`;
    const teamRecords = teamFromMons(teamMons).slice(0, 6).map(monToRecord);
    const fellTo =
      typeof body.fellTo === 'string'
        ? body.fellTo.replace(/\s+/g, ' ').trim().slice(0, 40)
        : '';
    const storedCleared = outcome === 'win' ? len : clearedNum;

    const insertedRun = await db.execute({
      sql: `insert or ignore into runs
            (user_id, run_id, date, bracket, difficulty, outcome, cleared_stages, team, fell_to, forms_gained, at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            returning run_id`,
      args: [
        uid,
        runId,
        date,
        bracket,
        difficulty,
        outcome,
        storedCleared,
        JSON.stringify(teamRecords),
        fellTo || null,
        formsGained,
        Date.now(),
      ],
    });

    if (insertedRun.rows.length > 0) {
      if (outcome === 'win') {
        await db.execute({
          sql: 'update users set runs = runs + 1, wins = wins + 1 where id = ?',
          args: [uid],
        });
      } else {
        await db.execute({
          sql: 'update users set runs = runs + 1, losses = losses + 1 where id = ?',
          args: [uid],
        });
      }
      // Keep only the newest RUNS_LIMIT rows.
      await db.execute({
        sql: `delete from runs
              where user_id = ?
                and run_id not in (
                  select run_id from runs where user_id = ? order by at desc limit ?
                )`,
        args: [uid, uid, RUNS_LIMIT],
      });
    }

    return res.status(200).json({ ok: true, formsGained });
  } catch (err) {
    console.error('[record-run] failed:', err);
    return res.status(503).json({ ok: false, error: 'could not save progress' });
  }
}

// --- pokedex: three bitmaps + counts -----------------------------------------

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

async function runs(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const uid = readSession(req);
  if (!uid) return res.status(200).json({ ok: true, runs: [] });
  const db: Db | null = getDb();
  if (!db) return res.status(200).json({ ok: true, runs: [] });

  try {
    const rs = await db.execute({
      sql: `select run_id, date, bracket, difficulty, outcome, cleared_stages,
                   team, fell_to, forms_gained, at
            from runs where user_id = ? order by at desc limit ?`,
      args: [uid, RUNS_LIMIT],
    });
    const out = (rs.rows as unknown as Record<string, unknown>[]).map((r) => {
      let team: unknown = [];
      try {
        team = typeof r.team === 'string' ? JSON.parse(r.team) : [];
      } catch {
        team = [];
      }
      return {
        runId: String(r.run_id),
        date: String(r.date),
        bracket: String(r.bracket),
        difficulty: String(r.difficulty),
        outcome: String(r.outcome),
        clearedStages: Number(r.cleared_stages) || 0,
        team: Array.isArray(team) ? team : [],
        ...(r.fell_to ? { fellTo: String(r.fell_to) } : {}),
        formsGained: Number(r.forms_gained) || 0,
        at: Number(r.at) || 0,
      };
    });
    return res.status(200).json({ ok: true, runs: out });
  } catch (err) {
    console.error('[me/runs] failed:', err);
    return res.status(200).json({ ok: true, runs: [] });
  }
}
