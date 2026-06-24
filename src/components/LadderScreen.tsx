import { dailyKey } from '../game/opponents';
import { DEFAULT_BRACKET } from '../game/gens';
import { Leaderboard } from './Leaderboard';
import { SupportLinks } from './SupportLinks';

/**
 * Standalone view of today's ladder, reachable from the title screen without
 * playing a run. It reuses the post-run {@link Leaderboard} (era tabs and all)
 * but with submitting disabled — there's no finished run to post here.
 */
export function LadderScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center px-4 py-8 text-center sm:px-6">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
        alt="Poké Ball"
        className="mb-3 h-14 w-14 animate-floaty object-contain [image-rendering:pixelated] drop-shadow-[0_4px_16px_rgba(255,80,80,0.35)]"
      />
      <h2 className="text-3xl font-black text-amber-300 sm:text-4xl">
        Today’s Ladder
      </h2>
      <p className="mt-2 max-w-md text-balance text-white/60">
        The first players to topple each era’s daily Champion. Beat the boss in
        a run to put your name on the board.
      </p>

      <Leaderboard
        date={dailyKey()}
        runBracket={DEFAULT_BRACKET}
        canSubmit={false}
        run={{ seed: '', stage: 0, clearedStages: 0, team: [] }}
      />

      <button
        type="button"
        onClick={onBack}
        className="mt-8 rounded-full border border-white/20 px-6 py-3 font-bold transition hover:bg-white/10"
      >
        ← Back
      </button>

      <div className="mt-8">
        <p className="mb-2 text-xs text-white/40">
          Enjoying Rental Rumble? Help keep it running:
        </p>
        <SupportLinks />
      </div>
    </div>
  );
}
