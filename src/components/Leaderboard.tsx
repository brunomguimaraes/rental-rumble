import { useEffect, useRef, useState } from 'react';
import type { Creature } from '../game/types';
import { portraitUrl, spriteUrl } from '../game/pokemon';
import { GEN_BRACKETS, bracketById, type BracketId } from '../game/gens';
import { DIFFICULTY_INFO, type Difficulty } from '../game/run';
import { CupIcon } from './CupIcon';
import {
  buildSubmission,
  fetchLeaderboard,
  submitWin,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from '../game/leaderboard';

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
  };
  /** Start a just-for-fun exhibition match against a saved team. */
  onChallenge?: (entry: LeaderboardEntry) => void;
}) {
  // Which era's board is being viewed. Defaults to the one you just played, but
  // every era's board is browsable via the tabs.
  const [activeBracket, setActiveBracket] = useState<BracketId>(runBracket);
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(
    () => localStorage.getItem('lb-name') ?? '',
  );
  // The submit form lives on the run's own bracket; track that board's status.
  const doneKey = `lb-done-${date}-${runBracket}`;
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'done' | 'error'
  >(() => (localStorage.getItem(doneKey) ? 'done' : 'idle'));
  const [placement, setPlacement] = useState<{
    rank: number | null;
    total?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(status === 'done');

  const refresh = () => {
    setLoading(true);
    fetchLeaderboard(date, activeBracket)
      .then(setBoard)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [date, activeBracket]);

  const handleSubmit = async () => {
    setStatus('submitting');
    setError(null);
    const trimmed = name.trim();
    localStorage.setItem('lb-name', trimmed);
    const payload = buildSubmission({
      name: trimmed || 'Anonymous',
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
    setStatus('done');
    // Jump to the board the win was just posted to.
    if (activeBracket === runBracket) refresh();
    else setActiveBracket(runBracket);
  };

  // The submit form only belongs on the run's own era board.
  const showForm =
    canSubmit &&
    activeBracket === runBracket &&
    !submittedRef.current &&
    status !== 'done';

  return (
    <div className="mt-8 w-full max-w-sm text-left">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-black text-white">Today’s first clears</h3>
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
            <span className="text-white/70">One name, one slot.</span> Your
            first verified clear sticks — you can’t resubmit to move up.
          </li>
          <li>
            <span className="text-white/70">Fresh boss daily.</span> Everyone
            faces the same six all day; the board resets at 00:00 UTC.
          </li>
        </ul>
      </details>

      {showForm && (
        <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-3">
          <p className="text-sm font-semibold text-amber-200">
            You beat today’s boss! Put your name on the board.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Your name"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-300/60"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={status === 'submitting'}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {status === 'submitting' ? 'Submitting…' : 'Submit'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
      )}

      {status === 'done' && placement?.rank && (
        <p className="mt-3 rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.06] px-4 py-3 text-sm font-semibold text-emerald-200">
          You were #{placement.rank}
          {placement.total ? ` of ${placement.total}` : ''} to beat the boss
          today! 🎉
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            Loading the board…
          </p>
        ) : !board || board.entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            No one has beaten today’s boss yet. Be the first!
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {board.entries.map((e) => (
              <li
                key={`${e.rank}-${e.name}`}
                className="flex items-center gap-2 px-3 py-2"
              >
                <RankNum rank={e.rank} />
                <span
                  title={e.name}
                  className="min-w-0 max-w-[8rem] flex-1 truncate text-sm font-semibold text-white"
                >
                  {e.name}
                </span>
                <DifficultyBadge difficulty={e.difficulty} />
                <div className="hidden shrink-0 items-center gap-1 sm:flex">
                  {e.team.slice(0, 6).map((mon, i) => (
                    <TeamPortrait key={i} dexId={Number(mon.id)} />
                  ))}
                </div>
                <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-white/40 sm:block">
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
          and {board.total - board.entries.length} more today
        </p>
      )}
    </div>
  );
}
