import { useEffect, useRef, useState } from 'react';
import type { Creature } from '../game/types';
import { portraitUrl, spriteUrl } from '../game/pokemon';
import { dailyKey } from '../game/opponents';
import { GEN_BRACKETS, bracketById, type BracketId } from '../game/gens';
import { DIFFICULTY_INFO, type Difficulty } from '../game/run';
import { CupIcon } from './CupIcon';
import {
  buildSubmission,
  fetchLeaderboard,
  submitWin,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type ThroneGrant,
} from '../game/leaderboard';

/** Case/space-insensitive name match (mirrors how the server cleans names). */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(a) === norm(b);
}

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Top three placements get the podium palette (gold / silver / bronze); the
// rest are a quiet white. Everyone's placement is drawn in the chunky 8-bit
// game font for a little arcade-scoreboard flavour.
const RANK_COLOR = ['text-amber-300', 'text-slate-200', 'text-[#cd7f32]'];

function RankNum({ rank }: { rank: number }) {
  return (
    <span
      className={`w-9 shrink-0 text-center text-[11px] leading-none ${
        RANK_COLOR[rank - 1] ?? 'text-white/45'
      }`}
      style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }}
    >
      {rank}
    </span>
  );
}

// Colour-coded pill per mode, so a Master win visibly outranks an Easy one.
const DIFFICULTY_BADGE: Record<Difficulty, string> = {
  easy: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
  normal: 'border-sky-300/40 bg-sky-300/10 text-sky-200',
  hard: 'border-orange-300/40 bg-orange-300/10 text-orange-200',
  master: 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-200',
};

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      title={`${DIFFICULTY_INFO[difficulty].label} mode`}
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DIFFICULTY_BADGE[difficulty]}`}
    >
      {DIFFICULTY_INFO[difficulty].label}
    </span>
  );
}

/**
 * A single team member shown as its PMD-style portrait — more characterful than
 * the box icon. Species without a contributed portrait fall back to the front
 * battle sprite (kept crisp).
 */
function TeamPortrait({ dexId }: { dexId: number }) {
  return (
    <img
      src={portraitUrl(dexId)}
      alt=""
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        const fallback = spriteUrl(dexId);
        if (img.src !== fallback) {
          img.src = fallback;
          img.classList.add('[image-rendering:pixelated]');
        }
      }}
      className="h-7 w-7 rounded-md border border-white/10 bg-white/5 object-cover"
    />
  );
}

export function Leaderboard({
  date,
  runBracket,
  canSubmit,
  run,
  onChallenge,
  onChallengeThrone,
  freshOnMount = false,
}: {
  date: string;
  /** The bracket the just-finished run was locked to — submissions go here. */
  runBracket: BracketId;
  /** True for a won run (the server still verifies the bracket's boss). */
  canSubmit: boolean;
  run: {
    difficulty: Difficulty;
    seed: string;
    stage: number;
    clearedStages: number;
    team: Creature[];
    /** Signed run token proving the server authorised this run. */
    token?: string | null;
  };
  /** Start a just-for-fun exhibition match against a saved team. */
  onChallenge?: (entry: LeaderboardEntry) => void;
  /** Stake a Master win's one shot at the reigning Master #1 (the throne). */
  onChallengeThrone?: (grant: ThroneGrant, king: LeaderboardEntry) => void;
  /**
   * Skip the edge cache on the first load. Used when arriving somewhere a recent
   * write (e.g. a throne takeover) must already be visible — like the standalone
   * ladder opened right after dethroning the #1.
   */
  freshOnMount?: boolean;
}) {
  // When viewing a past day, the live "first clears today" framing no longer
  // applies — the board is a frozen record, so the copy shifts to past tense.
  const isToday = date === dailyKey();
  // Which era's board is being viewed. Defaults to the one you just played, but
  // every era's board is browsable via the tabs.
  const [activeBracket, setActiveBracket] = useState<BracketId>(runBracket);
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(
    () => localStorage.getItem('lb-name') ?? '',
  );
  // The submit form lives on the run's own bracket; track that board's status.
  // Keyed by the run's seed (not just the day) because the board is now an
  // arcade-style high-score table — every separate clear earns its own row, so
  // finishing a *new* run should let you post again under the same name.
  const doneKey = `lb-done-${date}-${runBracket}-${run.seed}`;
  // Win flow as explicit steps: 'name' (lock in who you are) → 'submitting'
  // (post the verified win) → 'done'. Splitting the name out means every later
  // "is the #1 me?" check always has a real name to compare against.
  const [status, setStatus] = useState<
    'name' | 'submitting' | 'done' | 'error'
  >(() => (localStorage.getItem(doneKey) ? 'done' : 'name'));
  const [placement, setPlacement] = useState<{
    rank: number | null;
    total?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(status === 'done');
  // The pass to chase the throne, handed back when a Master win is verified.
  const [throne, setThrone] = useState<ThroneGrant | null>(null);
  // The name this player locked in for the board, captured before the win is
  // posted. Drives the "is the king me?" check so it never compares against a
  // blank from a not-yet-submitted run.
  const [playerName, setPlayerName] = useState<string | null>(null);

  const refresh = (fresh = false) => {
    setLoading(true);
    fetchLeaderboard(date, activeBracket, { fresh })
      .then(setBoard)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh(freshOnMount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, activeBracket]);

  // Step 2: post the verified win under the locked-in name, then surface the
  // placement (and, on a Master clear, the throne pass).
  const submitUnder = async (finalName: string) => {
    setStatus('submitting');
    setError(null);
    const payload = buildSubmission({
      name: finalName,
      date,
      bracket: runBracket,
      ...run,
    });
    const result = await submitWin(payload);
    if (!result.ok) {
      setStatus('error');
      setError(result.error ?? 'Could not submit');
      return;
    }
    submittedRef.current = true;
    localStorage.setItem(doneKey, '1');
    setPlacement({ rank: result.rank ?? null, total: result.total });
    if (result.throne) setThrone(result.throne);
    setStatus('done');
    // Skip the edge cache so the board reflects this win immediately.
    if (activeBracket === runBracket) refresh(true);
    else setActiveBracket(runBracket);
  };

  // Step 1: lock in the player's name (persisted for next time), then submit.
  const confirmName = () => {
    const trimmed = name.trim();
    const finalName = trimmed || 'Anonymous';
    localStorage.setItem('lb-name', trimmed);
    setPlayerName(finalName);
    void submitUnder(finalName);
  };

  // The name-entry step only belongs on a fresh, not-yet-submitted win.
  const showNameStep =
    canSubmit &&
    activeBracket === runBracket &&
    !submittedRef.current &&
    status === 'name';

  // The reigning Master #1 — the de-facto top of the board (Master is the top
  // rank tier) and the only target for a Throne Challenge.
  const king = board?.entries.find((e) => e.difficulty === 'master') ?? null;
  // "Is the #1 me?" — only meaningful once a name is locked in. Comparing against
  // the confirmed name (never a blank) keeps a player from being offered a fight
  // against their own freshly-posted entry.
  const isKingMe = !!(king && playerName && sameName(king.name, playerName));
  // A verified Master champion gets one shot at whoever currently holds the
  // crown — unless that's already them. Gated on a locked-in name so the check
  // can never run before we know who the challenger is.
  const canChallengeThrone =
    !!throne &&
    !!onChallengeThrone &&
    !!playerName &&
    activeBracket === runBracket &&
    !!king &&
    king.team.length > 0 &&
    !isKingMe;

  return (
    <div className="mt-8 w-full max-w-lg text-left">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-black text-white">
          {isToday ? 'Today’s first clears' : 'First clears'}
        </h3>
        {board?.champion && (
          <span className="text-xs text-white/45">
            vs {board.champion.name}
          </span>
        )}
      </div>

      {/* Era tabs — browse every bracket's daily board. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {GEN_BRACKETS.map((b) => {
          const active = b.id === activeBracket;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBracket(b.id)}
              aria-pressed={active}
              title={b.label}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                active
                  ? 'border-white/70 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
              } ${b.id === runBracket ? 'ring-1 ring-amber-300/40' : ''}`}
            >
              <CupIcon
                cup={b.cup}
                className={`h-4 w-4 ${active ? '' : 'opacity-60 grayscale'}`}
              />
              {b.tab}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-white/40">
        {bracketById(activeBracket).label} · {bracketById(activeBracket).tag}
      </p>

      <details className="group mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-left [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-white/70 transition hover:text-white">
          How the ladder works
          <span className="text-white/40 transition group-open:rotate-180">▾</span>
        </summary>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-white/50">
          <li>
            <span className="text-white/70">Mode comes first.</span> A harder
            run always outranks an easier one — Master beats Hard beats Normal
            beats Easy — even if the easier player cleared the boss earlier.
          </li>
          <li>
            <span className="text-white/70">
              Then it’s a race, not a score.
            </span>{' '}
            Within the same mode, rank is the order you beat the boss — first
            clear takes the top slot. Which Pokémon you drafted doesn’t matter.
          </li>
          <li>
            <span className="text-white/70">Every era has its own board.</span>{' '}
            Each generation bracket faces a different daily Champion and is
            ranked separately.
          </li>
          <li>
            <span className="text-white/70">Wins are verified.</span> The server
            re-simulates your fight against the exact same Champion before
            adding you, so the board stays honest.
          </li>
          <li>
            <span className="text-white/70">Many slots per name.</span> Like an
            old arcade high-score table, every verified clear earns its own row —
            so the same name can appear more than once.
          </li>
          <li>
            <span className="text-white/70">Take the throne.</span> Beat the
            boss on Master and you get one shot at the reigning Master #1 — win
            the title fight and you seize the top slot (marked “defeated&nbsp;X”).
          </li>
          <li>
            <span className="text-white/70">Fresh boss daily.</span> Everyone
            faces the same six all day; the board resets at 00:00 UTC.
          </li>
        </ul>
      </details>

      {showNameStep && (
        <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-3">
          <p className="text-sm font-semibold text-amber-200">
            You beat today’s boss! Put your name on the board.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmName();
              }}
              maxLength={24}
              placeholder="Your name"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/60"
            />
            <button
              type="button"
              onClick={confirmName}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
            >
              Claim spot
            </button>
          </div>
        </div>
      )}

      {status === 'submitting' && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/70">
          Posting your win to the board…
        </p>
      )}

      {status === 'error' && (
        <div className="mt-3 rounded-2xl border border-rose-300/30 bg-rose-300/[0.06] p-3">
          <p className="text-sm font-semibold text-rose-200">
            {error ?? 'Could not submit your win.'}
          </p>
          <button
            type="button"
            onClick={() => playerName && submitUnder(playerName)}
            className="mt-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'done' && placement?.rank && (
        <p className="mt-3 rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.06] px-4 py-3 text-sm font-semibold text-emerald-200">
          You were #{placement.rank}
          {placement.total ? ` of ${placement.total}` : ''} to beat the boss
          today! 🎉
        </p>
      )}

      {canChallengeThrone && king && throne && (
        <div className="mt-3 rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-300/[0.12] to-fuchsia-300/[0.06] p-4">
          <p className="text-sm font-black text-amber-200">
            👑 The throne is in reach
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            <span className="font-semibold text-white">{king.name}</span> holds
            the Master crown. Beat their team in a one-shot title fight to seize
            the #1 spot — win or lose, you get a single try.
          </p>
          <button
            type="button"
            onClick={() => onChallengeThrone?.(throne, king)}
            className="mt-3 w-full rounded-full bg-amber-300 px-4 py-2.5 text-sm font-black text-black transition-transform hover:scale-[1.02] active:scale-95"
          >
            Challenge {king.name} for the throne ⚔️
          </button>
        </div>
      )}

      {isKingMe && throne && (
        <p className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] px-4 py-3 text-sm font-semibold text-amber-200">
          👑 You hold the Master throne. Defend it — others will come for the
          crown.
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            Loading the board…
          </p>
        ) : !board || board.entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            {isToday
              ? 'No one has beaten today’s boss yet. Be the first!'
              : 'No clears recorded for this day.'}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {board.entries.map((e) => (
              <li
                key={`${e.rank}-${e.name}`}
                className="flex items-center gap-2 px-3 py-2"
              >
                <RankNum rank={e.rank} />
                <div className="min-w-[4rem] max-w-[10rem] flex-1">
                  <span
                    title={e.name}
                    className="block truncate text-sm font-semibold text-white"
                  >
                    {e.name}
                  </span>
                  {e.defeated && (
                    <span
                      title={`Took the throne from ${e.defeated}`}
                      className="block truncate text-[10px] font-semibold text-amber-300/80"
                    >
                      ⚔ defeated {e.defeated}
                    </span>
                  )}
                </div>
                <DifficultyBadge difficulty={e.difficulty} />
                <div className="hidden shrink-0 items-center gap-1 sm:flex">
                  {e.team.slice(0, 6).map((mon, i) => (
                    <TeamPortrait key={i} dexId={Number(mon.id)} />
                  ))}
                </div>
                <span className="hidden shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-white/40 sm:block">
                  {timeLabel(e.at)}
                </span>
                {onChallenge && e.team.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChallenge(e)}
                    title={`Challenge ${e.name}'s team`}
                    className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold text-white/80 transition hover:border-amber-300/60 hover:text-amber-200"
                  >
                    ⚔️
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {board && board.total > board.entries.length && (
        <p className="mt-2 text-center text-[11px] text-white/35">
          and {board.total - board.entries.length} more
          {isToday ? ' today' : ''}
        </p>
      )}
    </div>
  );
}
