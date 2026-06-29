import type { Creature, Opponent } from './types.js';
import { bracketDex, type BracketId } from './gens.js';
import { rollDraftDeck, SHINY_CHANCE, type Difficulty } from './run.js';
import { buildGauntlet } from './opponents.js';
import { buildOpponentTeam, buildFamousTeam } from './battle.js';
import { pikachuRecruitReward } from './specials.js';
import { evolutionTargets, canBeShiny } from './pokemon.js';
import { RNG } from './rng.js';
import type { SubmissionMon } from './leaderboard.js';

// Pokédex progression — shared by the client (which records the forms a run
// actually owned) and the server (which re-derives, from the run's seed alone,
// the set of forms that run *could* legitimately have produced and accepts only
// claims that fall inside it). Being pure + deterministic, it runs identically
// in the browser and on the serverless function — the same property the
// leaderboard's Champion re-sim already relies on.

/** A Pokédex completion layer: normal, alt-colour, or shiny. */
export type Variant = 'n' | 'a' | 's';

/** The variant a creature is wearing (shiny wins over alt; neither = normal). */
export function variantOf(c: { shiny: boolean; altColor: boolean }): Variant {
  return c.shiny ? 's' : c.altColor ? 'a' : 'n';
}

/** Canonical key for one dex cell, e.g. "9:s" (shiny Blastoise). */
export function formKey(dexId: number, variant: Variant): string {
  return `${dexId}:${variant}`;
}

/**
 * Union a team's current (dexId, variant) cells into a run-scoped owned-forms
 * set. Returns `prev` unchanged when nothing is new, so a React state setter
 * fed by this won't trigger a needless re-render. Because every draft / recruit
 * / evolution funnels through the team and only ever *adds*, calling this after
 * each team change naturally records intermediate evolution forms (Squirtle at
 * draft, Wartortle between the two evolutions, Blastoise after).
 */
export function unionTeamForms(
  prev: Set<string>,
  team: readonly Creature[],
): Set<string> {
  let next = prev;
  for (const c of team) {
    const key = formKey(c.dexId, variantOf(c));
    if (!next.has(key)) {
      if (next === prev) next = new Set(prev);
      next.add(key);
    }
  }
  return next;
}

/** Add a source form and every forward evolution of it (variant carries through). */
function addClosure(
  forms: Set<string>,
  dexId: number,
  variant: Variant,
  bracket: BracketId,
): void {
  const queue: number[] = [dexId];
  const seen = new Set<number>();
  for (let i = 0; i < queue.length; i++) {
    const d = queue[i];
    if (seen.has(d)) continue;
    seen.add(d);
    forms.add(formKey(d, variant));
    for (const next of evolutionTargets(d, bracket)) queue.push(next);
  }
}

// The recruit-shiny roll's threshold rises to 1.3× with the Fortune ability on
// the team. The server can't know whether Fortune was present, so it validates
// against the *ceiling*: a safe over-approximation that never rejects an honest
// non-Fortune shiny (whose roll cleared the lower bar too).
const RECRUIT_SHINY_CEILING = SHINY_CHANCE * 1.3;

/** Whether a beaten foe's recruit-shiny roll could have landed (mirrors RecruitScreen). */
function recruitShinyHits(dexId: number, sign: string): boolean {
  return new RNG(`recruitshiny:${dexId}:${sign}`).chance(RECRUIT_SHINY_CEILING);
}

/** The mon(s) recruitable after beating one stage (mirrors App.onBattleComplete). */
function recruitablesForStage(
  seed: string,
  dex: Creature[],
  opp: Opponent,
  stage: number,
): Creature[] {
  const battleSeed = `${seed}#${stage}`;
  // The special Pikachu cameo hands over a fixed reward mon instead of its team.
  if (opp.famousId === 'pikachu') {
    const reward = pikachuRecruitReward(battleSeed, dex);
    if (reward) return [reward];
  }
  if (opp.famousId) {
    return buildFamousTeam(
      opp.famousId,
      opp.type,
      opp.teamSize,
      battleSeed,
      dex,
      opp.tier,
    );
  }
  return buildOpponentTeam(opp.type, opp.teamSize, opp.tier, battleSeed, dex);
}

/**
 * The set of `(dexId, variant)` forms a run could *legitimately* have owned,
 * re-derived purely from its seed + bracket + difficulty + how far it got:
 *   - the entire draft deck (each card's shiny/alt roll is seed-fixed), and
 *   - every foe recruitable from a cleared, non-Champion stage (normal, plus
 *     shiny when that foe's recruit-shiny roll could have landed),
 * each expanded forward along legal evolution edges (the variant carries).
 *
 * A claimed dex cell is accepted iff it's in this set. The bound a tamperer can
 * reach is therefore exactly "what this server-issued seed could have made" —
 * never an arbitrary species or variant. Returns keys as `${dexId}:${variant}`.
 */
export function reachableForms(
  seed: string,
  bracket: BracketId,
  difficulty: Difficulty,
  clearedStages: number,
): Set<string> {
  const dex = bracketDex(bracket);
  const forms = new Set<string>();

  // 1) The whole draft deck.
  for (const card of rollDraftDeck(seed, dex)) {
    addClosure(forms, card.dexId, variantOf(card), bracket);
  }

  // 2) Recruitable foes from each cleared, non-Champion stage.
  const gauntlet = buildGauntlet(seed, difficulty, undefined, bracket);
  const championIndex = gauntlet.length - 1;
  const beaten = Math.max(
    0,
    Math.min(Math.floor(clearedStages) || 0, gauntlet.length),
  );
  for (let s = 0; s < beaten; s++) {
    if (s === championIndex) continue; // the Champion is never recruited
    const opp = gauntlet[s];
    for (const foe of recruitablesForStage(seed, dex, opp, s)) {
      addClosure(forms, foe.dexId, 'n', bracket);
      if (canBeShiny(foe.dexId) && recruitShinyHits(foe.dexId, foe.sign)) {
        addClosure(forms, foe.dexId, 's', bracket);
      }
    }
  }

  return forms;
}

// --- Client → server flush ---------------------------------------------------

export type RunOutcome = 'win' | 'loss' | 'ragequit';

export interface RecordRunInput {
  seed: string;
  token: string | null; // the server-issued run token (required to earn credit)
  date: string;
  bracket: BracketId;
  difficulty: Difficulty;
  outcome: RunOutcome;
  clearedStages: number;
  stage: number; // the Champion's index, used to verify a win
  team: SubmissionMon[];
  relics?: string[];
  fellTo?: string;
  forms: string[]; // the (dexId:variant) cells this run actually owned
}

/**
 * Flush a finished run's progression to the account. No-ops (without a network
 * call) when the run carries no server token — progression only accrues on
 * authorised runs, and anonymous/offline play simply skips it. Never throws.
 */
export async function recordRun(
  input: RecordRunInput,
): Promise<{ ok: boolean; formsGained?: number }> {
  if (!input.token) return { ok: false };
  try {
    const res = await fetch('/api/me/record-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; formsGained?: number };
    return { ok: !!data.ok, formsGained: data.formsGained };
  } catch {
    return { ok: false };
  }
}
