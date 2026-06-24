import type { Creature } from '../game/types';
import type { ChallengeKingResult } from '../game/leaderboard';
import { MiniSprite } from './MiniSprite';

/**
 * Outcome of a Throne Challenge — the Master endgame where a fresh champion
 * stakes their one title shot against the reigning Master #1. A win is
 * server-confirmed before it counts, so we wait on that verdict before
 * declaring the takeover.
 */
export function ThroneResultScreen({
  won,
  kingName,
  kingTeam,
  submitting,
  result,
  onHome,
}: {
  won: boolean;
  kingName: string;
  kingTeam: Creature[];
  /** True while the server is confirming the takeover. */
  submitting: boolean;
  /** The server's verdict on the takeover (null until it returns). */
  result: ChallengeKingResult | null;
  onHome: () => void;
}) {
  const confirmed = won && result?.ok;
  const failed = won && result && !result.ok;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
      <div className="animate-floaty text-6xl sm:text-7xl">
        {won ? '👑' : '🛡️'}
      </div>
      <h2
        className={`mt-3 text-3xl font-black sm:text-4xl ${
          won ? 'text-amber-300' : 'text-rose-300'
        }`}
      >
        {won ? 'Throne taken!' : 'Throne defended'}
      </h2>

      <div className="mt-2 min-h-[3rem] text-white/60">
        {won ? (
          submitting ? (
            <p>Confirming your takeover with the league…</p>
          ) : confirmed ? (
            <p>
              You dethroned{' '}
              <span className="font-semibold text-white">{kingName}</span> and
              seized the crown — you’re now{' '}
              <span className="font-bold text-amber-300">
                #{result?.rank ?? 1}
              </span>{' '}
              on Master. 👑
            </p>
          ) : failed ? (
            <p className="text-rose-300">
              You won the fight, but the takeover couldn’t be confirmed
              {result?.error ? `: ${result.error}` : '.'}
            </p>
          ) : (
            <p>You beat {kingName}’s team!</p>
          )
        ) : (
          <p>
            <span className="font-semibold text-white">{kingName}</span> held the
            crown. Run the gauntlet again to earn another title shot.
          </p>
        )}
      </div>

      <div className="mt-6 w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
          {kingName}’s team
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {kingTeam.map((c, i) => (
            <MiniSprite key={i} creature={c} className="h-9 w-9" />
          ))}
        </div>
      </div>

      <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={onHome}
          disabled={submitting}
          className="rounded-full bg-white px-6 py-3 font-bold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
        >
          Back to title →
        </button>
      </div>
    </div>
  );
}
