import { useState } from 'react';
import type { Creature, Opponent } from '../game/types';
import { TYPE_COLORS } from '../game/typechart';
import { TypeBadges } from './TypeBadge';
import { MiniSprite } from './MiniSprite';

export function ResultScreen({
  gauntlet,
  won,
  team,
  seed,
  clearedStages,
  onPlayAgain,
}: {
  gauntlet: Opponent[];
  won: boolean;
  team: Creature[];
  seed: string;
  clearedStages: number;
  onPlayAgain: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const fellTo = !won ? gauntlet[clearedStages] : null;

  const share = async () => {
    const names = team.map((c) => c.name).join(', ');
    const line = won
      ? `I became Champion in Rental Rumble! 👑 Team: ${names} · seed ${seed}`
      : `I fell to ${fellTo?.name} (${clearedStages}/${gauntlet.length}) in Rental Rumble. Team: ${names} · seed ${seed} — can you do better?`;
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
      <div className="text-6xl animate-floaty sm:text-7xl">
        {won ? '👑' : '💀'}
      </div>
      <h2
        className={`mt-4 text-3xl font-black sm:text-4xl ${
          won ? 'text-amber-300' : 'text-rose-300'
        }`}
      >
        {won ? 'CHAMPION!' : 'Run Over'}
      </h2>
      <p className="mt-2 text-white/60">
        {won
          ? 'You ran the gauntlet and took the crown. Flawless drafting.'
          : `Your team cleared ${clearedStages} of ${gauntlet.length} and fell to ${fellTo?.name}, the ${fellTo?.title}.`}
      </p>

      {/* Progress pips */}
      <div className="mt-5 flex items-center gap-1.5">
        {gauntlet.map((g, i) => (
          <span
            key={g.id}
            className={`h-2.5 w-2.5 rounded-full ${
              i < clearedStages
                ? 'bg-emerald-400'
                : i === clearedStages && !won
                  ? 'bg-rose-400'
                  : 'bg-white/15'
            }`}
            title={g.name}
          />
        ))}
      </div>

      {/* Team card */}
      <div className="mt-6 w-full rounded-3xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 text-xs uppercase tracking-widest text-white/40">
          Your team
        </div>
        <div className="grid grid-cols-3 gap-2">
          {team.map((c) => {
            const color = TYPE_COLORS[c.types[0]];
            return (
              <div
                key={c.id}
                className="flex flex-col items-center gap-1 rounded-2xl p-2"
                style={{ background: `${color}14` }}
              >
                <MiniSprite creature={c} className="h-14 w-14" />
                <span className="text-xs font-semibold">{c.name}</span>
                <TypeBadges types={c.types} />
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-white/40">
          seed <span className="font-mono text-white/70">{seed}</span>
        </div>
      </div>

      <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={share}
          className="rounded-full border border-white/20 px-6 py-3 font-bold transition hover:bg-white/10"
        >
          {copied ? '✓ Copied!' : 'Share result'}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded-full bg-white px-6 py-3 font-bold text-black transition-transform hover:scale-105 active:scale-95"
        >
          New run →
        </button>
      </div>
    </div>
  );
}
