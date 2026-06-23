import { useMemo, useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_INFO,
  gauntletLength,
  type Difficulty,
} from '../game/run';
import {
  GENERATIONS,
  GEN_INFO,
  genCount,
  type Generation,
} from '../game/gens';
import { buildChampion, championSeed, dailyKey } from '../game/opponents';
import { buildChampionTeam } from '../game/battle';
import { TypeMarquee } from './TypeMarquee';
import { MiniSprite } from './MiniSprite';
import { TrainerSprite } from './TrainerSprite';
import { Credits } from './Credits';

export function TitleScreen({
  onStart,
}: {
  onStart: (
    difficulty: Difficulty,
    gens: Generation[],
    seed?: string,
  ) => void;
}) {
  const [seedInput, setSeedInput] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [gens, setGens] = useState<Generation[]>(GENERATIONS);
  const [showChampion, setShowChampion] = useState(false);

  // Today's shared Champion — the same boss (name + team) for everyone, all day.
  const champion = useMemo(() => buildChampion(), []);
  const championTeam = useMemo(
    () => buildChampionTeam(championSeed(), champion.teamSize),
    [champion],
  );

  const allSelected = gens.length === GENERATIONS.length;
  const speciesCount = gens.reduce((n, g) => n + genCount(g), 0);

  const toggleGen = (g: Generation) =>
    setGens((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );

  const toggleAll = () =>
    setGens((prev) => (prev.length === GENERATIONS.length ? [] : GENERATIONS));

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

      {/* Today's Champion — the shared daily boss everyone is racing to topple */}
      <div className="mt-6 w-full max-w-md">
        <button
          type="button"
          onClick={() => setShowChampion((v) => !v)}
          aria-expanded={showChampion}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2.5 text-left transition hover:bg-amber-300/[0.1]"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-amber-300/15">
            <TrainerSprite opponent={champion} className="h-11 w-11" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
              Today’s Champion
            </div>
            <div className="truncate font-bold">
              {champion.name}{' '}
              <span className="font-normal text-white/45">
                · the daily boss
              </span>
            </div>
          </div>
          <span className="shrink-0 text-lg">👑</span>
          <span className="shrink-0 text-white/40">
            {showChampion ? '▲' : '▼'}
          </span>
        </button>

        {showChampion && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-white/55">
              {champion.name} fields the same six all day ({dailyKey()}). Clear
              the ladder, then dethrone them to take the crown.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {championTeam.map((c, i) => (
                <div
                  key={`${c.id}-${i}`}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"
                >
                  <MiniSprite creature={c} className="h-9 w-9" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Difficulty picker */}
      <div className="mt-8 w-full max-w-md">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Difficulty — sets the ladder length & draft skips
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
                  {gauntletLength(d)} foes · {DIFFICULTY_INFO[d].skips} skips
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-white/45">
          {DIFFICULTY_INFO[difficulty].blurb}
        </p>
      </div>

      {/* Generation picker */}
      <div className="mt-8 w-full max-w-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-white/40">
            Generations — the dex you draft & battle from
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/10"
          >
            {allSelected ? 'Clear' : 'All'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
          {GENERATIONS.map((g) => {
            const active = gens.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGen(g)}
                aria-pressed={active}
                className={`rounded-2xl border px-2 py-2 text-center transition ${
                  active
                    ? 'border-white/70 bg-white/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-sm font-bold">{GEN_INFO[g].label}</div>
                <div className="text-[11px] text-white/50">
                  {GEN_INFO[g].region}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-white/45">
          {gens.length === 0 ? (
            <span className="text-amber-300/80">
              Pick at least one generation to play.
            </span>
          ) : (
            <>
              {speciesCount} Pokémon across{' '}
              {allSelected ? 'every' : gens.length} generation
              {gens.length === 1 ? '' : 's'}.
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onStart(difficulty, gens)}
        disabled={gens.length === 0}
        className="mt-7 rounded-full bg-white px-8 py-3 text-lg font-bold text-black transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
      >
        Roll the dice →
      </button>

      <div className="mt-6 flex w-full max-w-md flex-wrap items-center justify-center gap-2">
        <input
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          placeholder="custom seed (optional)"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-white/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() =>
            onStart(difficulty, gens, seedInput.trim() || undefined)
          }
          disabled={!seedInput.trim() || gens.length === 0}
          className="shrink-0 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-30"
        >
          Use seed
        </button>
      </div>

      <p className="mt-10 max-w-sm text-xs leading-relaxed text-white/35">
        Every run is defined by its seed — share it and a friend gets the exact
        same draft pool and gauntlet.
      </p>

      <div className="mt-4">
        <Credits />
      </div>
    </div>
  );
}
