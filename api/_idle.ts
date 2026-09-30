import {
  readOwnedByIds,
  updateOwnedEvolution,
  readSessionById,
  claimSession,
  insertEncounters,
  type Db,
} from './_db.js';
import { routeById, encountersFor, IDLE_CAP_MS, type RouteId } from '../src/game/routes.js';
import { simulateIdle } from '../src/game/idle.js';
import { ownedMonToCreature, type OwnedMon } from '../src/game/box.js';
import { applyGrowthWithEvolution } from '../src/game/evolution.js';
import { RNG } from '../src/game/rng.js';
import type { Creature } from '../src/game/types.js';
import type { Transaction } from '@libsql/client';

// The claim itself, free of HTTP so it can be tested against a real database:
// simulate the elapsed encounters from the session's pinned seed, then close
// the session and apply the growth in one transaction. This is the ONLY writer
// of growth and evolution.

export interface IdleClaimLog {
  routeId: RouteId;
  encounters: ReturnType<typeof simulateIdle>['encounters'];
  wins: number;
  stoppedBy: 'loss' | 'cap' | 'early';
  elapsedMs: number;
  expPerWin: number;
}

export type IdleClaimOutcome =
  | {
      status: 'ok';
      log: IdleClaimLog;
      levelUps: { id: string; fromLevel: number; toLevel: number }[];
      evolutions: { id: string; fromDexId: number; toDexId: number }[];
    }
  | { status: 'not_found' | 'already_claimed' | 'invalid_route' | 'invalid_party' };

function isBusy(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  return e?.code === 'SQLITE_BUSY' || String(e?.message ?? '').includes('SQLITE_BUSY');
}

/**
 * Open a write transaction, waiting briefly while another writer holds the
 * lock. A local SQLite file refuses a second concurrent writer outright
 * (SQLITE_BUSY) rather than queueing it; the retry lets the other claim commit
 * first, after which this one sees the session closed.
 */
async function openWriteTx(db: Db): Promise<Transaction> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction('write');
    } catch (err) {
      if (!isBusy(err) || attempt >= 8) throw err;
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
}

export async function claimIdleSession(db: Db, uid: string, sessionId: string, now: number): Promise<IdleClaimOutcome> {
  const s = await readSessionById(db, uid, sessionId);
  if (!s) return { status: 'not_found' };
  if (s.claimedAt !== null) return { status: 'already_claimed' };
  const route = routeById(s.routeId);
  if (!route) return { status: 'invalid_route' };

  const elapsedMs = Math.max(0, Math.min(now - s.startedAt, IDLE_CAP_MS));
  const count = encountersFor(elapsedMs, route);

  // Rebuild the exact party the session pinned. Ownership is re-checked; the
  // level band is NOT (it was legal at start, and a mon may have grown since).
  const rows = await readOwnedByIds(db, uid, s.partyIds);
  const byId = new Map<string, OwnedMon>(rows.map((m) => [m.id, m]));
  const party: OwnedMon[] = s.partyIds.map((id) => byId.get(id)).filter((m): m is OwnedMon => Boolean(m));
  if (party.length !== s.partyIds.length) return { status: 'invalid_party' };
  const creatures: Creature[] = [];
  for (const m of party) {
    const c = ownedMonToCreature(m);
    if (!c) return { status: 'invalid_party' };
    creatures.push(c);
  }

  const outcome = simulateIdle(creatures, s.seed, route, count);
  const stoppedBy: 'loss' | 'cap' | 'early' =
    outcome.stoppedBy === 'loss' ? 'loss' : elapsedMs >= IDLE_CAP_MS ? 'cap' : 'early';

  const gained = outcome.wins * route.expPerWin;
  const levelUps: { id: string; fromLevel: number; toLevel: number }[] = [];
  const evolutions: { id: string; fromDexId: number; toDexId: number }[] = [];
  const changed: OwnedMon[] = [];
  for (const m of party) {
    const grown = applyGrowthWithEvolution(m, gained, new RNG(`evolve:${m.id}:${s.seed}`));
    if (grown.levelUp) levelUps.push({ id: m.id, ...grown.levelUp });
    for (const e of grown.evolutions) evolutions.push({ id: m.id, ...e });
    if (grown.mon.level !== m.level || grown.mon.exp !== m.exp || grown.mon.dexId !== m.dexId) changed.push(grown.mon);
  }

  const log: IdleClaimLog = { routeId: route.id, encounters: outcome.encounters, wins: outcome.wins, stoppedBy, elapsedMs, expPerWin: route.expPerWin };

  // Close the session first, inside one transaction with the growth: only the
  // caller whose update flips claimed_at applies the EXP, so a concurrent or
  // retried claim can never pay out twice.
  const tx = await openWriteTx(db);
  try {
    const claimed = await claimSession(tx, s.id, uid, {
      claimedAt: now,
      stoppedBy,
      encounters: outcome.encounters.length,
      log: JSON.stringify(log),
    });
    if (!claimed) {
      await tx.rollback();
      return { status: 'already_claimed' };
    }
    for (const m of changed) await updateOwnedEvolution(tx, uid, m);
    await insertEncounters(tx, s.id, outcome.encounters);
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }

  return { status: 'ok', log, levelUps, evolutions };
}
