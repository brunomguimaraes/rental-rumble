import { useState } from 'react';
import type { PokemonType } from '../game/types';
import { TypeBadge } from './TypeBadge';

const SAMPLE_TYPES: PokemonType[] = [
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'dragon',
];

export function TitleScreen({
  onStart,
}: {
  onStart: (seed?: string) => void;
}) {
  const [seedInput, setSeedInput] = useState('');

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-6xl animate-floaty">⚔️</div>
      <h1 className="bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
        RENTAL RUMBLE
      </h1>
      <p className="mt-3 max-w-md text-balance text-white/60">
        Roll a pool of Pokémon, draft a team of six, and auto-battle your way
        from rookie to <span className="text-white">Champion</span> — recruiting
        the Pokémon you beat along the way.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {SAMPLE_TYPES.map((t) => (
          <TypeBadge key={t} type={t} size="sm" />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onStart()}
        className="mt-8 rounded-full bg-white px-8 py-3 text-lg font-bold text-black transition-transform hover:scale-105 active:scale-95"
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
          onClick={() => onStart(seedInput.trim() || undefined)}
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
