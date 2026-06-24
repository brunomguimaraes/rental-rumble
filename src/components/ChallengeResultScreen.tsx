import type { Creature } from '../game/types';
import { MiniSprite } from './MiniSprite';

export function ChallengeResultScreen({
  won,
  foeName,
  foeTeam,
  onRematch,
  onHome,
}: {
  won: boolean;
  foeName: string;
  foeTeam: Creature[];
  onRematch: () => void;
  onHome: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
      <div className="animate-floaty text-6xl sm:text-7xl">
        {won ? '⚔️' : '🛡️'}
      </div>
      <h2
        className={`mt-3 text-3xl font-black sm:text-4xl ${
          won ? 'text-emerald-300' : 'text-rose-300'
        }`}
      >
        {won ? 'Challenge won!' : 'Challenge lost'}
      </h2>
      <p className="mt-2 text-white/60">
        {won
          ? `Your team beat ${foeName}'s saved team.`
          : `${foeName}'s saved team came out on top.`}
      </p>

      <div className="mt-6 w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
          {foeName}'s team
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {foeTeam.map((c, i) => (
            <MiniSprite key={i} creature={c} className="h-9 w-9" />
          ))}
        </div>
      </div>

      <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={onRematch}
          className="rounded-full bg-white px-6 py-3 font-bold text-black transition-transform hover:scale-105 active:scale-95"
        >
          Rematch 🔁
        </button>
        <button
          type="button"
          onClick={onHome}
          className="rounded-full border border-white/20 px-6 py-3 font-bold transition hover:bg-white/10"
        >
          Back to title →
        </button>
      </div>
    </div>
  );
}
