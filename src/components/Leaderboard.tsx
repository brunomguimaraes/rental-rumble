import { useEffect, useRef, useState } from 'react';
import type { Creature } from '../game/types';
import { miniUrl } from '../game/pokemon';
import { GEN_BRACKETS, bracketById, type BracketId } from '../game/gens';
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

const medal = ['🥇', '🥈', '🥉'];

/** A single team miniature rendered straight from a National Dex id. */
function MiniIcon({ dexId }: { dexId: number }) {
  return (
    <div
      className="h-6 w-6 bg-no-repeat [image-rendering:pixelated]"
      style={{
        backgroundImage: `url(${miniUrl(dexId)})`,
        backgroundSize: '200% 100%',
        backgroundPosition: 'left center',
      }}
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
  run: { seed: string; stage: number; clearedStages: number; team: Creature[] };
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
                <span className="w-7 shrink-0 text-center text-sm font-bold text-white/70">
                  {medal[e.rank - 1] ?? e.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                  {e.name}
                </span>
                <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
                  {e.team.slice(0, 6).map((mon, i) => (
                    <MiniIcon key={i} dexId={Number(mon.id)} />
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
