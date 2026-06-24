import type { Creature, Sign } from './types';
import { CREATURES_BY_ID, withSign } from './pokemon';
import { ALL_SIGNS } from './zodiac';
import {
  buildChampionTeam,
  simulateBattle,
  TIER_STAT_MULT,
  PLAYER_STAT_MULT,
} from './battle';
import {
  bracketDex,
  inBracket,
  isBracketId,
  DEFAULT_BRACKET,
  type BracketId,
} from './gens';

/**
 * Champion seed for a date string + bracket. Mirrors `championSeed()` in
 * opponents.ts (which takes a Date); the server only has the YYYY-MM-DD key, so
 * we rebuild the same string here. `all` keeps the bare, legacy seed.
 */
function champSeedForDate(date: string, bracket: BracketId): string {
  const base = `champion:${date}`;
  return bracket === 'all' ? base : `${base}:${bracket}`;
}

/**
 * The "first to beat today's boss" leaderboard.
 *
 * The whole game is deterministic, so the server can re-run the Champion fight
 * from a tiny, tamper-proof payload (species id + sign only — never raw stats)
 * and accept a win only if its own simulation agrees. That keeps the board
 * honest even though the game runs entirely in the browser.
 */

export const CHAMPION_TEAM_SIZE = 6;

/** How many entries the public board shows by default. */
export const LEADERBOARD_TOP = 25;

/** A single team slot, identified canonically (server rebuilds the stats). */
export interface SubmissionMon {
  id: string; // CREATURES id (string form of the National Dex id)
  sign: Sign;
}

/** What the client POSTs after taking the crown. */
export interface SubmissionPayload {
  name: string;
  date: string; // dailyKey, e.g. "2026-06-23"
  bracket: BracketId; // which generation bracket this run was locked to
  seed: string; // run seed
  stage: number; // the Champion's index in the gauntlet
  clearedStages: number;
  team: SubmissionMon[];
}

/** One row on the public board. */
export interface LeaderboardEntry {
  rank: number; // 1-based
  name: string;
  at: number; // epoch ms of the verified win
  clearedStages: number;
  team: SubmissionMon[]; // species + sign, enough to re-fight the team
}

export interface LeaderboardResponse {
  date: string;
  bracket: BracketId;
  champion: { name: string; type: string } | null;
  total: number;
  entries: LeaderboardEntry[];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type VerifyResult =
  | { ok: true; team: Creature[] }
  | { ok: false; reason: string };

/**
 * Re-run the daily Champion fight from a submission and confirm the player won.
 * Pure and dependency-free so it runs identically in the browser and on the
 * serverless function. Rebuilds every mon from canonical dex data, so a forged
 * payload with inflated stats can never pass.
 */
export function verifyChampionWin(payload: SubmissionPayload): VerifyResult {
  const { date, seed, stage, team } = payload;
  const bracket: BracketId = isBracketId(payload.bracket)
    ? payload.bracket
    : DEFAULT_BRACKET;

  if (typeof date !== 'string' || !YMD.test(date)) {
    return { ok: false, reason: 'bad date' };
  }
  if (typeof seed !== 'string' || seed.length === 0 || seed.length > 120) {
    return { ok: false, reason: 'bad seed' };
  }
  if (!Number.isInteger(stage) || stage < 0 || stage > 64) {
    return { ok: false, reason: 'bad stage' };
  }
  if (!Array.isArray(team) || team.length === 0 || team.length > 6) {
    return { ok: false, reason: 'bad team size' };
  }

  const playerTeam: Creature[] = [];
  for (const mon of team) {
    if (!mon || typeof mon.id !== 'string') {
      return { ok: false, reason: 'bad mon' };
    }
    if (!ALL_SIGNS.includes(mon.sign)) {
      return { ok: false, reason: 'bad sign' };
    }
    const base = CREATURES_BY_ID[mon.id];
    if (!base) return { ok: false, reason: `unknown mon ${mon.id}` };
    // A gen-locked board only accepts in-era teams, so a full-dex team can't be
    // farmed against a smaller bracket's (easier) Champion.
    if (!inBracket(base.dexId, bracket)) {
      return { ok: false, reason: `mon ${mon.id} is out of bracket` };
    }
    playerTeam.push(withSign(base, mon.sign));
  }

  // The daily boss for this bracket: same team for everyone, built from the
  // bracket's dex, date-seeded. `all` is the original shared full-dex boss.
  const foeTeam = buildChampionTeam(
    champSeedForDate(date, bracket),
    CHAMPION_TEAM_SIZE,
    bracketDex(bracket),
  );
  const result = simulateBattle(playerTeam, foeTeam, `${seed}#${stage}`, {
    playerStatMult: PLAYER_STAT_MULT,
    foeStatMult: TIER_STAT_MULT.champion ?? 1,
  });

  if (result.winner !== 'player') {
    return { ok: false, reason: 'simulation did not produce a win' };
  }
  return { ok: true, team: playerTeam };
}

/**
 * Rebuild a playable team from its canonical (id + sign) form — used both to
 * verify a win and to let other players challenge a saved team for fun. Unknown
 * ids are skipped, so a stale entry can never crash a battle.
 */
export function teamFromMons(mons: SubmissionMon[]): Creature[] {
  const team: Creature[] = [];
  for (const mon of mons) {
    const base = CREATURES_BY_ID[mon.id];
    if (!base) continue;
    team.push(withSign(base, ALL_SIGNS.includes(mon.sign) ? mon.sign : base.sign));
  }
  return team;
}

/** Build the POST payload from a finished, victorious run. */
export function buildSubmission(args: {
  name: string;
  date: string;
  bracket: BracketId;
  seed: string;
  stage: number;
  clearedStages: number;
  team: Creature[];
}): SubmissionPayload {
  return {
    name: args.name.trim().slice(0, 24),
    date: args.date,
    bracket: args.bracket,
    seed: args.seed,
    stage: args.stage,
    clearedStages: args.clearedStages,
    team: args.team.map((c) => ({ id: c.id, sign: c.sign })),
  };
}

// --- client fetch helpers ---------------------------------------------------

export interface SubmitResult {
  ok: boolean;
  rank?: number; // 1-based placement for the day
  total?: number;
  error?: string;
}

export async function submitWin(
  payload: SubmissionPayload,
): Promise<SubmitResult> {
  try {
    const res = await fetch('/api/submit-win', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as SubmitResult;
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return data;
  } catch {
    return { ok: false, error: 'network error' };
  }
}

export async function fetchLeaderboard(
  date: string,
  bracket: BracketId = DEFAULT_BRACKET,
): Promise<LeaderboardResponse | null> {
  try {
    const res = await fetch(
      `/api/leaderboard?date=${encodeURIComponent(date)}&bracket=${encodeURIComponent(bracket)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardResponse;
  } catch {
    return null;
  }
}
