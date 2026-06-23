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
  creaturesForGens,
  genCount,
  type Generation,
} from '../game/gens';
import { buildChampion, championSeed } from '../game/opponents';
import { buildChampionTeam } from '../game/battle';
import { MiniSprite } from './MiniSprite';
import { TrainerSprite } from './TrainerSprite';

export function GenSelectScreen({
  onStart,
  onBack,
}: {
  onStart: (
    difficulty: Difficulty,
    gens: Generation[],
    seed?: string,
  ) => void;
  onBack: () => void;
}) {
  const [seedInput, setSeedInput] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [gen, setGen] = useState<Generation | null>(null);

  // Today's Champion persona is gen-independent; only its team gets locked to
  // the chosen generation so the whole ladder — foes included — stays in-gen.
  const champion = useMemo(() => buildChampion(), []);
  const championTeam = useMemo(() => {
    if (gen === null) return [];
    return buildChampionTeam(
      championSeed(),
      champion.teamSize,
      creaturesForGens([gen]),
    );
  }, [champion, gen]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-5 py-10 text-center sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 self-start rounded-full border border-white/15 px-4 py-1.5 text-sm font-semibold text-white/70 transition hover:bg-white/10"
      >
        ← Back
      </button>

      <h1 className="bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-5xl">
        GEN-LOCKED CHALLENGE
      </h1>
      <p className="mt-3 max-w-md text-balance text-white/60">
        Pick a single generation. Your draft pool{' '}
        <span className="text-white">and every foe</span> — roadside trainers,
        Gym Leaders, the Elite, and the Champion — are all built from that one
        region's dex.
      </p>

      {/* Generation picker — single select */}
      <div className="mt-8 w-full max-w-md">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Generation — the only dex in play
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GENERATIONS.map((g) => {
            const active = g === gen;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGen(g)}
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
          {gen === null ? (
            <span className="text-amber-300/80">
              Pick a generation to lock in.
            </span>
          ) : (
            <>
              {GEN_INFO[gen].label} · {GEN_INFO[gen].region} ·{' '}
              {genCount(gen)} Pokémon in play.
            </>
          )}
        </p>
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

      {/* Champion preview for the chosen gen — proof the boss is in-gen too */}
      {gen !== null && championTeam.length > 0 && (
        <div className="mt-8 w-full max-w-md rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-amber-300/15">
              <TrainerSprite opponent={champion} className="h-11 w-11" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
                Champion — {GEN_INFO[gen].region} only
              </div>
              <div className="truncate font-bold">{champion.name}</div>
            </div>
            <span className="shrink-0 text-lg">👑</span>
          </div>
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

      <button
        type="button"
        onClick={() => gen !== null && onStart(difficulty, [gen])}
        disabled={gen === null}
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
            gen !== null &&
            onStart(difficulty, [gen], seedInput.trim() || undefined)
          }
          disabled={!seedInput.trim() || gen === null}
          className="shrink-0 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-30"
        >
          Use seed
        </button>
      </div>

      <p className="mt-10 max-w-sm text-xs leading-relaxed text-white/35">
        Same seed, same gen — share both and a friend gets the exact same
        gen-locked run.
      </p>
    </div>
  );
}
