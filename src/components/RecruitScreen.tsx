import { useState } from 'react';
import type { Creature } from '../game/types';
import { CreatureCard } from './CreatureCard';

export function RecruitScreen({
  opponentName,
  nextLabel,
  currentTeam,
  defeatedTeam,
  onConfirm,
}: {
  opponentName: string;
  nextLabel: string;
  currentTeam: Creature[];
  defeatedTeam: Creature[];
  onConfirm: (team: Creature[]) => void;
}) {
  const [team, setTeam] = useState<Creature[]>(currentTeam);
  const [used, setUsed] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const reset = () => {
    setTeam(currentTeam);
    setUsed([]);
    setSelected(null);
  };

  const swapInto = (slot: number) => {
    if (selected === null) return;
    const recruit = defeatedTeam[selected];
    setTeam((t) => t.map((c, i) => (i === slot ? recruit : c)));
    setUsed((u) => [...u, selected]);
    setSelected(null);
  };

  const swapsMade = used.length;
  const armed = selected !== null;

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-8">
      <div className="text-center">
        <div className="text-4xl">🏆</div>
        <h2 className="mt-2 text-2xl font-black text-emerald-300 sm:text-3xl">
          {opponentName} defeated!
        </h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-white/55">
          Recruit any of their Pokémon: pick one below, then tap a slot on your
          team to swap it in.
        </p>
      </div>

      {/* Your team */}
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Your team
            {armed && (
              <span className="ml-2 text-emerald-300">
                ← tap a Pokémon to swap in {defeatedTeam[selected!].name}
              </span>
            )}
          </h3>
          {swapsMade > 0 && (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-white/50 underline-offset-2 hover:underline"
            >
              Reset swaps
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {team.map((c, i) => (
            <div
              key={`${c.id}-${i}`}
              className={`rounded-2xl ${armed ? 'ring-2 ring-emerald-300/60' : ''}`}
            >
              <CreatureCard
                creature={c}
                onClick={armed ? () => swapInto(i) : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Defeated pool */}
      <div className="mt-7">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
          {opponentName}'s Pokémon
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {defeatedTeam.map((_, i) => {
            const taken = used.includes(i);
            return (
              <div key={i} className="relative">
                <CreatureCard
                  creature={defeatedTeam[i]}
                  selected={selected === i}
                  disabled={taken}
                  onClick={() =>
                    taken ? undefined : setSelected(selected === i ? null : i)
                  }
                />
                {taken && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-black/60">
                    <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-black">
                      RECRUITED
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onConfirm(team)}
          className="rounded-full bg-white px-8 py-3 text-lg font-bold text-black transition-transform hover:scale-105 active:scale-95"
        >
          {nextLabel} →
        </button>
      </div>
    </div>
  );
}
