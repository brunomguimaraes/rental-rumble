import type { Creature, Sign } from './types.js';
import { CREATURES_BY_ID, withSign } from './pokemon.js';
import { ALL_SIGNS } from './zodiac.js';
import {
  buildChampionTeam,
  simulateBattle,
  TIER_STAT_MULT,
  PLAYER_STAT_MULT,
} from './battle.js';
import {
  bracketDex,
  inBracket,
  isBracketId,
  DEFAULT_BRACKET,
  type BracketId,
} from './gens.js';
import {
  DIFFICULTY_RANK,
  difficultyForStage,
  gauntletLength,
  isDifficulty,
  type Difficulty,
} from './run.js';

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
  difficulty: Difficulty; // ladder length the run was played on (drives rank)
  seed: string; // run seed (server-issued via /api/start-run)
  stage: number; // the Champion's index in the gauntlet
  clearedStages: number;
  team: SubmissionMon[];
  // Signed proof that the server authorised this run (binds the seed). Null on
  // runs the server never issued a token for (offline/legacy) — those can't be
  // verified once enforcement is on.
  token?: string | null;
}

/** One row on the public board. */
export interface LeaderboardEntry {
  rank: number; // 1-based
  name: string;
  difficulty: Difficulty; // the mode this win was earned on
  at: number; // epoch ms of the verified win
  clearedStages: number;
  team: SubmissionMon[]; // species + sign, enough to re-fight the team
}

/**
 * Composite sort key for a board entry, stored as the Redis sorted-set score.
 * The board is read in ascending order (smallest first = rank #1), so:
 *
 *   - A higher difficulty subtracts a large, tier-sized offset, pushing harder
 *     wins ahead of easier ones no matter when they cleared.
 *   - Within one difficulty, the raw win timestamp breaks the tie, so the
 *     earliest clear still wins that tier.
 *
 * `TIER_SPAN` dwarfs any possible spread of `at` on a single board (entries live
 * at most ~40 days, ≈3.5e9 ms apart), so difficulty always dominates time. The
 * resulting magnitude stays well inside IEEE-754's exact-integer range, so the
 * millisecond timestamp is preserved losslessly.
 */
const TIER_SPAN = 1e13;

export function boardScore(difficulty: Difficulty, at: number): number {
  return at - DIFFICULTY_RANK[difficulty] * TIER_SPAN;
}

export interface LeaderboardResponse {
  date: string;
  bracket: BracketId;
  champion: { name: string; type: string } | null;
  total: number;
  entries: LeaderboardEntry[];
}

/** Today's standing for a single era: its boss and current #1 finisher. */
export interface BracketLeader {
  bracket: BracketId;
  champion: { name: string; type: string } | null;
  total: number;
  leader: LeaderboardEntry | null; // the day's first clear, if anyone has won
}

/**
 * A one-shot digest of every era's board for the day — the top finisher (plus
 * boss + total) per bracket — so the title screen can showcase "today's
 * champions" without firing a fetch per era.
 */
export interface LeaderboardSummary {
  date: string;
  brackets: BracketLeader[];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type VerifyResult =
  | { ok: true; team: Creature[]; difficulty: Difficulty }
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
  // Difficulty is only a ranking label; the Champion's stage index is what truly
  // pins the ladder. A run is exactly `gauntletLength(difficulty)` long, plus an
  // optional rare bonus challenger right before the boss (+1), and every mode's
  // ladder is a distinct length. So trust an explicit difficulty only when it
  // agrees with the stage, and otherwise recover the mode from the stage itself.
  // That keeps a genuine win from a client whose difficulty was missing or stale
  // (e.g. an old tab left open before the field existed) from being thrown away,
  // without ever trusting an unverifiable label.
  const stated = isDifficulty(payload.difficulty) ? payload.difficulty : null;
  const statedLen = stated ? gauntletLength(stated) : -1;
  const difficulty =
    stated && (stage === statedLen - 1 || stage === statedLen)
      ? stated
      : difficultyForStage(stage);
  if (!difficulty) {
    return { ok: false, reason: 'stage does not match any difficulty' };
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
  return { ok: true, team: playerTeam, difficulty };
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
  difficulty: Difficulty;
  seed: string;
  stage: number;
  clearedStages: number;
  team: Creature[];
  token?: string | null;
}): SubmissionPayload {
  return {
    name: args.name.trim().slice(0, 24),
    date: args.date,
    bracket: args.bracket,
    difficulty: args.difficulty,
    seed: args.seed,
    stage: args.stage,
    clearedStages: args.clearedStages,
    team: args.team.map((c) => ({ id: c.id, sign: c.sign })),
    token: args.token ?? null,
  };
}

// --- client fetch helpers ---------------------------------------------------

export interface SubmitResult {
  ok: boolean;
  rank?: number; // 1-based placement for the day
  total?: number;
  error?: string;
}

/** A server-authorised run: the seed to play, plus a signed token to submit. */
export interface RunStart {
  seed: string;
  token: string | null;
}

/**
 * Ask the server to start a run. It returns the seed to play and a signed token
 * that proves the run was authorised, which `submitWin` echoes back. Returns
 * null on failure (offline / API down) — the caller should fall back to a local
 * seed so the game stays playable, just not leaderboard-eligible.
 */
export async function requestRunToken(args: {
  bracket: BracketId;
  difficulty: Difficulty;
}): Promise<RunStart | null> {
  try {
    const res = await fetch('/api/start-run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { seed?: unknown; token?: unknown };
    if (typeof data.seed !== 'string' || data.seed.length === 0) return null;
    return {
      seed: data.seed,
      token: typeof data.token === 'string' ? data.token : null,
    };
  } catch {
    return null;
  }
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

/** Fetch every era's top finisher for the day in a single request. */
export async function fetchLeaderboardSummary(
  date: string,
): Promise<LeaderboardSummary | null> {
  try {
    const res = await fetch(
      `/api/leaderboard?summary=1&date=${encodeURIComponent(date)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardSummary;
  } catch {
    return null;
  }
}
