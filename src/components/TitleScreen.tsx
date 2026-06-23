import { useState } from 'react';
import { DIFFICULTIES, DIFFICULTY_INFO, type Difficulty } from '../game/run';
import { TypeMarquee } from './TypeMarquee';

export function TitleScreen({
  onStart,
}: {
  onStart: (difficulty: Difficulty, seed?: string) => void;
}) {
  const [seedInput, setSeedInput] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-5 py-10 text-center sm:px-6">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
        alt="Poké Ball"
        className="mb-3 h-16 w-16 animate-floaty object-contain [image-rendering:pixelated] drop-shadow-[0_4px_16px_rgba(255,80,80,0.35)] sm:h-20 sm:w-20"
      />
      <h1 className="bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-6xl">
        RENTAL RUMBLE
      </h1>
      <p className="mt-3 max-w-md text-balance text-white/60">
        Roll a pool of Pokémon, draft a team of six, and auto-battle your way
        from rookie to <span className="text-white">Champion</span> — recruiting
        the Pokémon you beat along the way.
      </p>

      <div className="mt-6 w-full">
        <TypeMarquee />
      </div>

      {/* Difficulty picker */}
      <div className="mt-8 w-full max-w-md">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Difficulty — sets how many sets you can skip
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIFFICULTIES.map((d) => {
            const active = d === difficulty;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`rounded-2xl border px-2 py-2.5 text-center transition ${
                  active
                    ? 'border-white/70 bg-white/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-sm font-bold">
                  {DIFFICULTY_INFO[d].label}
                </div>
                <div className="text-[11px] text-white/50">
                  {DIFFICULTY_INFO[d].skips} skips
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-white/45">
          {DIFFICULTY_INFO[difficulty].blurb}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onStart(difficulty)}
        className="mt-7 rounded-full bg-white px-8 py-3 text-lg font-bold text-black transition-transform hover:scale-105 active:scale-95"
      >
        Roll the dice →
      </button>

      <div className="mt-6 flex items-center gap-2">
        <input
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          placeholder="custom seed (optional)"
          className="w-48 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-white/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onStart(difficulty, seedInput.trim() || undefined)}
          disabled={!seedInput.trim()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-30"
        >
          Use seed
        </button>
      </div>

      <p className="mt-10 max-w-sm text-xs leading-relaxed text-white/35">
        Every run is defined by its seed — share it and a friend gets the exact
        same draft pool and gauntlet.
      </p>
    </div>
  );
}
