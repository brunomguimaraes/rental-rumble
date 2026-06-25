import type { Creature } from './types.js';
import type { SubmissionMon } from './leaderboard.js';
import { monToRecord } from './leaderboard.js';
import type { BracketId } from './gens.js';
import type { Difficulty } from './run.js';
import { gagName } from './gagName.js';

/**
 * The Hall of Shame — the leaderboard's mischievous twin. Where the board
 * celebrates the first to topple the daily boss, the Hall of Shame immortalises
 * the runs that *didn't make it*. Every defeat is enshrined automatically; the
 * only optional part is the name — leave it blank and we hand you a goofy alias
 * (see gagName) instead of a sad "Anonymous".
 *
 * Unlike a win, a loss can't be deterministically re-simulated server-side: the
 * team mutates all run long (recruits, evolutions, move tweaks), so there's no
 * canonical "team at the moment of death" to rebuild from the seed. There's also
 * essentially zero incentive to forge a *loss*. So the Hall of Shame trusts the
 * submitted run, but still sanitises every field (real species/signs only,
 * clamped counts) so a junk payload can't poison the board.
 */

/** How many entries the public Hall of Shame shows by default. */
export const SHAME_TOP = 25;

/**
 * Composite sort key for a shame entry (Redis sorted-set score, read ascending
 * so smallest = rank #1 = most shameful). Fewer cleared stages is more
 * embarrassing, so it dominates; among equally-pathetic runs the *most recent*
 * flop floats up (so the board always feels alive). `SHAME_TIER` dwarfs any
 * possible `at`, so the stage count always wins, and the magnitude stays well
 * inside IEEE-754's exact-integer range.
 */
const SHAME_TIER = 1e13;

export function shameScore(clearedStages: number, at: number): number {
  return clearedStages * SHAME_TIER - at;
}

/** What the client POSTs after a lost run (or to rename an existing entry). */
export interface ShameSubmission {
  name: string;
  date: string; // dailyKey, e.g. "2026-06-25"
  bracket: BracketId; // the era this run was locked to (display only)
  difficulty: Difficulty; // the mode it was played on (display only)
  clearedStages: number; // how far they got before the wipe
  team: SubmissionMon[]; // their roster at the moment of defeat
  fellTo: string; // the trainer who ended the run
  fellToTeam?: SubmissionMon[]; // that trainer's roster, for mini portraits
  // When set, rename an *existing* row instead of adding a new one — so editing
  // the auto-assigned gag name never spawns a duplicate flop.
  eid?: string;
}

/** One row on the public Hall of Shame. */
export interface ShameEntry {
  rank: number; // 1-based (rank #1 = most shameful)
  id?: string; // the row's unique board id
  name: string;
  difficulty: Difficulty;
  bracket: BracketId;
  clearedStages: number;
  at: number; // epoch ms of the defeat
  team: SubmissionMon[];
  fellTo: string;
  fellToTeam?: SubmissionMon[];
}

export interface ShameResponse {
  date: string;
  total: number;
  entries: ShameEntry[];
}

export interface SubmitShameResult {
  ok: boolean;
  eid?: string; // the row this defeat landed on (echoed back for renames)
  rank?: number; // 1-based placement among the day's flops
  total?: number;
  error?: string;
}

/**
 * Resolve the name a defeat is recorded under: the player's saved board name if
 * they have one, otherwise a deterministic gag alias seeded by the run (so the
 * same lost run always shows the same goofy name).
 */
export function resolveShameName(savedName: string, seed: string): string {
  const trimmed = savedName.trim();
  return trimmed || gagName(seed);
}

/** Build the POST payload from a finished, *lost* run. */
export function buildShameSubmission(args: {
  name: string;
  date: string;
  bracket: BracketId;
  difficulty: Difficulty;
  clearedStages: number;
  team: Creature[];
  fellTo: string;
  fellToTeam?: Creature[];
  eid?: string;
}): ShameSubmission {
  return {
    name: args.name.trim().slice(0, 24),
    date: args.date,
    bracket: args.bracket,
    difficulty: args.difficulty,
    clearedStages: args.clearedStages,
    team: args.team.map(monToRecord),
    fellTo: args.fellTo.slice(0, 40),
    ...(args.fellToTeam ? { fellToTeam: args.fellToTeam.map(monToRecord) } : {}),
    ...(args.eid ? { eid: args.eid } : {}),
  };
}

export async function submitLoss(
  payload: ShameSubmission,
): Promise<SubmitShameResult> {
  try {
    const res = await fetch('/api/submit-loss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as SubmitShameResult;
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return data;
  } catch {
    return { ok: false, error: 'network error' };
  }
}

export async function fetchHallOfShame(
  date: string,
  opts: { fresh?: boolean } = {},
): Promise<ShameResponse | null> {
  try {
    let url = `/api/hall-of-shame?date=${encodeURIComponent(date)}`;
    // Right after writing a fresh flop, skip the CDN edge cache so the player
    // immediately sees themselves on the board (mirrors fetchLeaderboard).
    if (opts.fresh) url += `&_=${Date.now()}`;
    const res = await fetch(url, opts.fresh ? { cache: 'no-store' } : undefined);
    if (!res.ok) return null;
    return (await res.json()) as ShameResponse;
  } catch {
    return null;
  }
}
