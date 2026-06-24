import type { AbilityId, Creature, Sign } from './types.js';
import {
  CREATURES_BY_ID,
  withSign,
  withAbility,
  asShiny,
  asAltColor,
  canBeAltColor,
  portraitUrl,
  shinyPortraitUrl,
  altColorPortraitUrl,
  portraitEmotions,
  shinyPortraitEmotions,
  altColorPortraitEmotions,
  portraitEmotionFromUrl,
} from './pokemon.js';
import { isAbilityOption } from './abilities.js';
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
  // Whether this slot was a shiny (gets the flat shiny stat blessing). Optional
  // so legacy payloads without it rebuild as ordinary mons. Trusted the same way
  // `sign` is — the deterministic re-sim must reproduce the client's exact fight,
  // and the board already rebuilds stats from these claimed attributes.
  shiny?: boolean;
  // A fan-made *alternate colour* (non-shiny, purely cosmetic) palette. Mutually
  // exclusive with `shiny`. Carries no stat blessing, so it's display-only — the
  // re-sim ignores it entirely and it's validated against the species' available
  // recolours on rebuild. Omitted on legacy payloads (rebuild as ordinary mons).
  altColor?: boolean;
  // The PMD emotion portrait this slot actually wore during the run (e.g.
  // "Happy"). Cosmetic-only and validated against the species' contributed
  // emotion set for its colour variant, so records can show the *exact* face
  // that was fielded instead of the neutral default. Omitted = neutral "Normal".
  emotion?: string;
  // Which ability the slot was born with (species can have two, rolled at draft).
  // Optional + validated against the species' legal options on rebuild, so a
  // legacy payload falls back to the default and a forged one can't smuggle in
  // an ability the species can't actually have. Trusted like `sign`/`shiny`.
  ability?: AbilityId;
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
  // The row's unique board id (sorted-set member). Lets a Throne Challenge pin
  // the *exact* champion the player fought, so a king that gets dethroned
  // mid-challenge can't turn an honest win into a spurious mismatch. Optional
  // because some legacy/summary responses don't carry it.
  id?: string;
  name: string;
  difficulty: Difficulty; // the mode this win was earned on
  at: number; // epoch ms of the verified win
  clearedStages: number;
  team: SubmissionMon[]; // species + sign, enough to re-fight the team
  // Set when this slot was claimed by dethroning the reigning Master #1 in a
  // Throne Challenge — the name of the champion they beat to take the crown.
  defeated?: string;
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

/** A past day's #1 for one era, kept permanently in the hall of champions. */
export interface ChampionRecord {
  bracket: BracketId;
  name: string;
  difficulty: Difficulty;
  at: number;
  clearedStages: number;
  team: SubmissionMon[];
  // The boss they toppled (deterministic from the date), if it can be rebuilt.
  champion: { name: string; type: string } | null;
  // Set when the crown was taken in a Throne Challenge.
  defeated?: string;
}

/** One past day, with the champion of every era that had a clear. */
export interface HistoryDay {
  date: string;
  champions: ChampionRecord[];
}

/** The permanent hall of champions — recent past days, newest first. */
export interface LeaderboardHistory {
  days: HistoryDay[];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type VerifyResult =
  | { ok: true; team: Creature[]; difficulty: Difficulty }
  | { ok: false; reason: string };

/**
 * Layer a slot's *cosmetic* claims (shiny / alt colour / emotion portrait) onto
 * an already stat-built creature. Purely visual — stats are untouched — so it's
 * safe to apply during the trusted re-sim: it just makes the rebuilt team carry
 * the exact look the run fielded, which then survives into the stored record.
 *
 * Every claim is validated against canonical data: alt colour only when the
 * species actually has a fan-made recolour (and never alongside shiny, which
 * wins), and the emotion only when it's a real portrait for the chosen variant.
 * A forged or stale claim simply falls back to the neutral default.
 */
function applyCosmetic(built: Creature, mon: SubmissionMon): Creature {
  let c = built;
  if (mon.shiny) c = asShiny(c);
  else if (mon.altColor && canBeAltColor(c.dexId)) c = asAltColor(c);

  const emotions = c.shiny
    ? shinyPortraitEmotions(c.dexId)
    : c.altColor
      ? altColorPortraitEmotions(c.dexId)
      : portraitEmotions(c.dexId);
  if (typeof mon.emotion === 'string' && emotions.includes(mon.emotion)) {
    const portrait = c.shiny
      ? shinyPortraitUrl(c.dexId, mon.emotion)
      : c.altColor
        ? altColorPortraitUrl(c.dexId, mon.emotion)
        : portraitUrl(c.dexId, mon.emotion);
    c = { ...c, portrait };
  }
  return c;
}

/**
 * Serialise a (re)built creature back into the tiny canonical record stored on
 * the board: species + sign always, plus the colour/emotion/ability it actually
 * wore when they're not the default. Shared by the client's submission payload
 * and the server's stored entry so both speak the exact same shape.
 */
export function monToRecord(c: Creature): SubmissionMon {
  const emotion = portraitEmotionFromUrl(c.portrait);
  return {
    id: c.id,
    sign: c.sign,
    ...(c.shiny ? { shiny: true } : {}),
    ...(c.altColor ? { altColor: true } : {}),
    ...(c.ability ? { ability: c.ability } : {}),
    ...(emotion && emotion !== 'Normal' ? { emotion } : {}),
  };
}

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
    let built = withSign(base, mon.sign);
    // Apply the claimed ability, but only if it's one the species can legally be
    // born with — otherwise reject, so a forged payload can't grant, say,
    // Adaptability to a mon that never has it. A missing ability keeps the
    // species default (legacy payloads).
    if (mon.ability !== undefined) {
      if (!isAbilityOption(base.dexId, mon.ability)) {
        return { ok: false, reason: `bad ability for ${mon.id}` };
      }
      built = withAbility(built, mon.ability);
    }
    playerTeam.push(applyCosmetic(built, mon));
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
    // Must match the client's Champion fight: on Master the foe plays perfectly,
    // on Easy it plays sloppily, so verification has to use the same difficulty.
    difficulty,
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
    let built = withSign(base, ALL_SIGNS.includes(mon.sign) ? mon.sign : base.sign);
    // Honour the claimed ability when it's legal for the species; otherwise keep
    // the species default so a stale/odd entry still fights sensibly.
    if (mon.ability !== undefined && isAbilityOption(base.dexId, mon.ability)) {
      built = withAbility(built, mon.ability);
    }
    team.push(applyCosmetic(built, mon));
  }
  return team;
}

// --- Throne Challenge (king-of-the-hill PvP endgame) ------------------------

/**
 * The battle seed for a Throne Challenge. The raw seed is server-issued (baked
 * into a signed throne token), so the deterministic fight can't be brute-forced
 * for a favourable RNG offline. Both client and server derive the battle seed
 * the same way so their simulations agree exactly.
 */
export function throneBattleSeed(seed: string): string {
  return `throne#${seed}`;
}

/**
 * Re-run a Throne Challenge and confirm the challenger won. A throne fight is a
 * fair mirror: two saved teams, both with the same "hero" edge, so nothing but
 * the teams and the (server-issued) seed decides it. Pure and deterministic, so
 * it runs identically in the browser and on the serverless function. Teams are
 * rebuilt from canonical (id + sign) form, so neither side's stats can be forged.
 */
export function verifyThroneWin(args: {
  challengerTeam: SubmissionMon[];
  kingTeam: SubmissionMon[];
  seed: string;
}): { ok: boolean; reason?: string } {
  const challenger = teamFromMons(args.challengerTeam);
  const king = teamFromMons(args.kingTeam);
  if (challenger.length === 0) {
    return { ok: false, reason: 'challenger has no team' };
  }
  if (king.length === 0) {
    return { ok: false, reason: 'champion has no team' };
  }
  const result = simulateBattle(challenger, king, throneBattleSeed(args.seed), {
    playerStatMult: PLAYER_STAT_MULT,
    foeStatMult: PLAYER_STAT_MULT,
  });
  if (result.winner !== 'player') {
    return { ok: false, reason: 'challenger did not win' };
  }
  return { ok: true };
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
    team: args.team.map(monToRecord),
    token: args.token ?? null,
  };
}

// --- client fetch helpers ---------------------------------------------------

/**
 * A one-shot pass to challenge the reigning Master #1 for the throne, handed
 * out when a Master win is verified. `seed` is the (server-chosen) battle seed
 * to play; `token` is the signed proof that authorises exactly one title shot
 * (null when the server has no secret configured / enforcement is off).
 */
export interface ThroneGrant {
  token: string | null;
  seed: string;
  /**
   * The challenger's board row id for this win. Echoed back to `challenge-king`
   * so the exact row is promoted — names can repeat (arcade-style board), so a
   * name match alone could pick the wrong row. The signed token also carries it
   * when a secret is configured; this covers the no-secret path.
   */
  eid?: string;
}

export interface SubmitResult {
  ok: boolean;
  rank?: number; // 1-based placement for the day
  total?: number;
  error?: string;
  // Present on a verified Master win: the pass to chase the throne (if any).
  throne?: ThroneGrant | null;
}

export interface ChallengeKingResult {
  ok: boolean;
  rank?: number; // the challenger's new 1-based placement (1 when they took the throne)
  total?: number;
  defeated?: string; // the champion who was dethroned
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

/**
 * Stake your title shot: fight the reigning Master #1's saved team for the
 * crown. The server re-simulates the fight (and verifies the one-shot token)
 * before promoting the challenger above the champion they beat.
 */
export async function challengeKing(payload: {
  token?: string | null;
  name: string;
  /** The challenger's board row id (from the throne grant), so the right row is
   *  promoted when names repeat — used when no secret pins it in the token. */
  eid?: string;
  /** The board row id of the champion the player actually fought. The server
   *  re-simulates against this exact king (not "whoever is #1 now"), so a king
   *  that changes mid-challenge can't reject an otherwise-honest win. */
  kingEid?: string;
  date: string;
  bracket: BracketId;
  seed: string;
}): Promise<ChallengeKingResult> {
  try {
    const res = await fetch('/api/challenge-king', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as ChallengeKingResult;
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    return data;
  } catch {
    return { ok: false, error: 'network error' };
  }
}

export async function fetchLeaderboard(
  date: string,
  bracket: BracketId = DEFAULT_BRACKET,
  opts: { fresh?: boolean } = {},
): Promise<LeaderboardResponse | null> {
  try {
    let url = `/api/leaderboard?date=${encodeURIComponent(date)}&bracket=${encodeURIComponent(bracket)}`;
    // Right after a write (a win submit or a throne takeover) the CDN's short
    // edge cache can still hold the pre-write board, making a fresh #1 / "defeated"
    // look like it never landed. A cache-busting param + no-store sidesteps that
    // so the player immediately sees their new placement.
    if (opts.fresh) url += `&_=${Date.now()}`;
    const res = await fetch(url, opts.fresh ? { cache: 'no-store' } : undefined);
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

/** Fetch the permanent hall of champions for the last `days` past days. */
export async function fetchLeaderboardHistory(
  days = 30,
): Promise<LeaderboardHistory | null> {
  try {
    const res = await fetch(`/api/leaderboard?history=1&days=${days}`);
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardHistory;
  } catch {
    return null;
  }
}
