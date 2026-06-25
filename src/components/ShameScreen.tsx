import { dailyKey } from '../game/opponents';
import { HallOfShame } from './HallOfShame';
import { SupportLinks } from './SupportLinks';

/**
 * Standalone view of today's Hall of Shame, reachable from the title screen
 * without playing a run. It reuses the post-run {@link HallOfShame}, but with no
 * `run` passed it's purely read-only — nothing is enshrined here, it just shows
 * the day's wall of flops.
 */
export function ShameScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center px-4 py-8 text-center sm:px-6">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/cubone-skull.png`}
        alt="Skull"
        className="mb-3 h-14 w-14 animate-floaty object-contain [image-rendering:pixelated] drop-shadow-[0_4px_16px_rgba(255,255,255,0.15)]"
      />
      <h2 className="text-3xl font-black text-rose-300 sm:text-4xl">
        Hall of Shame
      </h2>
      <p className="mt-2 max-w-md text-balance text-white/60">
        Every run that didn’t make it — ranked by how few you cleared, biggest
        flops first. Lose a run and you’re enshrined here automatically.
      </p>

      <HallOfShame date={dailyKey()} />

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
