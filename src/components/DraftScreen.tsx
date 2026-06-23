import { useMemo, useState } from 'react';
import type { Creature, Role } from '../game/types';
import { rollPool, TEAM_SIZE } from '../game/run';
import { randomSeed } from '../game/rng';
import { withRole } from '../game/pokemon';
import { CreatureCard } from './CreatureCard';

export function DraftScreen({
  seed,
  onReroll,
  onConfirm,
}: {
  seed: string;
  onReroll: (newSeed: string) => void;
  onConfirm: (team: Creature[]) => void;
}) {
  const basePool = useMemo(() => rollPool(seed), [seed]);
  const [picked, setPicked] = useState<string[]>([]);
  const [roleBy, setRoleBy] = useState<Record<string, Role>>({});

  // Pool reflects each Pokémon's currently-chosen role.
  const pool = basePool.map((c) =>
    roleBy[c.id] ? withRole(c, roleBy[c.id]) : c,
  );

  const toggle = (c: Creature) => {
    setPicked((prev) => {
      if (prev.includes(c.id)) return prev.filter((id) => id !== c.id);
      if (prev.length >= TEAM_SIZE) return prev;
      return [...prev, c.id];
    });
  };

  const setRole = (c: Creature, role: Role) =>
    setRoleBy((prev) => ({ ...prev, [c.id]: role }));

  const team = picked
    .map((id) => pool.find((c) => c.id === id))
    .filter((c): c is Creature => Boolean(c));

  const canConfirm = team.length === TEAM_SIZE;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-32">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black">Draft your team</h2>
          <p className="mt-1 text-sm text-white/55">
            Pick {TEAM_SIZE} from your rolled pool, and choose each one's{' '}
            <span className="text-white/80">role</span> to tune its stats and
            moves. Beat a trainer and you can recruit their Pokémon afterward.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
            <span className="text-white/40">seed</span>{' '}
            <span className="font-mono text-white/80">{seed}</span>
          </div>
          <button
            type="button"
            onClick={() => onReroll(randomSeed())}
            className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold transition hover:bg-white/10"
          >
            🎲 Reroll
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {pool.map((c) => (
          <CreatureCard
            key={c.id}
            creature={c}
            selected={picked.includes(c.id)}
            disabled={picked.length >= TEAM_SIZE}
            onClick={() => toggle(c)}
            onSelectRole={(role) => setRole(c, role)}
          />
        ))}
      </div>

      {/* Sticky team tray */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0c0c14]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex flex-1 items-center gap-2 overflow-x-auto">
            {Array.from({ length: TEAM_SIZE }).map((_, i) => {
              const c = team[i];
              return (
                <div
                  key={i}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${
                    c
                      ? 'border-white/30 bg-white/10'
                      : 'border-dashed border-white/15 bg-white/[0.02] text-white/20'
                  }`}
                  title={c?.name}
                >
                  {c ? (
                    <img
                      src={c.sprite}
                      alt={c.name}
                      className="h-11 w-11 object-contain"
                    />
                  ) : (
                    <span className="text-sm">{i + 1}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-right">
            <div className="text-xs text-white/50">
              {team.length}/{TEAM_SIZE} picked
            </div>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() => onConfirm(team)}
              className="mt-1 rounded-full bg-white px-6 py-2.5 font-bold text-black transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {canConfirm
                ? 'Enter the gauntlet →'
                : `Pick ${TEAM_SIZE - team.length} more`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
