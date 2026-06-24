import { useState } from 'react';
import type { Creature, Opponent } from '../game/types';
import { TIER_LABEL, isTypeThemed, opponentAccent } from '../game/opponents';
import { TypeBadge } from './TypeBadge';
import { TrainerSprite } from './TrainerSprite';
import { LineupEditor } from './LineupEditor';

export function MapScreen({
  gauntlet,
  team,
  stage,
  seed,
  onFight,
  onSkip,
  onQuit,
  onReorder,
}: {
  gauntlet: Opponent[];
  team: Creature[];
  stage: number;
  seed: string;
  onFight: () => void;
  onSkip: () => void;
  onQuit: () => void;
  onReorder: (team: Creature[]) => void;
}) {
  const [confirmingQuit, setConfirmingQuit] = useState(false);
  const currentOpp = gauntlet[stage];
  // Skippable foes (the rare bonus challenge) don't count toward the mandatory
  // tally — you can wave them off and still be crowned Champion.
  const required = gauntlet.filter((o) => !o.skippable).length;
  return (
    <div className="mx-auto max-w-5xl px-3 py-6 pb-28 sm:px-4 sm:py-8 sm:pb-28">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">The Gauntlet</h2>
          <p className="mt-1 text-sm text-white/55">
            Defeat all {required} to be crowned Champion.
          </p>
        </div>
        {confirmingQuit ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-white/60 sm:inline">Forfeit run?</span>
            <button
              type="button"
              onClick={onQuit}
              className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/25"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmingQuit(false)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingQuit(true)}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10"
          >
            Forfeit
          </button>
        )}
      </div>

      {/* Your team — arrange the lineup (slot 1 leads) */}
      <div className="mt-6">
        <LineupEditor team={team} onChange={onReorder} />
      </div>

      {/* Gauntlet ladder */}
      <ol className="mt-6 space-y-2">
        {gauntlet.map((opp, i) => {
          const done = i < stage;
          const current = i === stage;
          const color = opponentAccent(opp);
          return (
            <li
              key={opp.id}
              className={`flex items-center gap-3 rounded-2xl border p-2.5 transition sm:gap-4 sm:p-3 ${
                current
                  ? 'border-white/50 bg-white/[0.07]'
                  : done
                    ? 'border-emerald-400/30 bg-emerald-400/[0.04]'
                    : 'border-white/10 bg-white/[0.02] opacity-60'
              }`}
              style={current ? { boxShadow: `0 0 0 1px ${color}66` } : undefined}
            >
              <div className="relative shrink-0">
                <div
                  className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl sm:h-14 sm:w-14"
                  style={{ background: `${color}1f` }}
                >
                  <TrainerSprite
                    opponent={opp}
                    className={`h-12 w-12 sm:h-14 sm:w-14 ${done ? 'opacity-40 grayscale' : ''}`}
                  />
                </div>
                <img
                  src={opp.badge}
                  alt=""
                  className={`absolute -bottom-1 -right-1 z-10 h-5 w-5 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] sm:h-6 sm:w-6 ${
                    done ? 'opacity-40 grayscale' : ''
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    {TIER_LABEL[opp.tier]}
                  </span>
                  {opp.skippable && (
                    <span className="rounded-full border border-amber-300/50 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                      Optional
                    </span>
                  )}
                  {isTypeThemed(opp) ? (
                    <TypeBadge type={opp.type} size="sm" />
                  ) : (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{
                        background: `${color}26`,
                        color,
                        border: `1px solid ${color}66`,
                      }}
                    >
                      All-rounder
                    </span>
                  )}
                </div>
                <div className="truncate font-bold">
                  {opp.name}{' '}
                  <span className="font-normal text-white/45">
                    · {opp.title}
                  </span>
                </div>
                {current && (
                  <p className="mt-0.5 truncate text-xs italic text-white/50">
                    “{opp.quote}”
                  </p>
                )}
              </div>
              <div className="hidden shrink-0 text-xs text-white/40 sm:block">
                {opp.teamSize} mons
              </div>
            </li>
          );
        })}
      </ol>

      {/* Anchored action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0c0c14]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-col-reverse items-stretch gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="self-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs sm:self-auto">
            <span className="text-white/40">seed</span>{' '}
            <span className="font-mono text-white/80">{seed}</span>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {currentOpp.skippable && (
              <button
                type="button"
                onClick={onSkip}
                className="w-full rounded-full border border-white/20 px-6 py-3 text-base font-bold text-white/80 transition hover:bg-white/10 sm:w-auto"
              >
                Skip ⏭
              </button>
            )}
            <button
              type="button"
              onClick={onFight}
              className="w-full rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95 sm:w-auto sm:text-lg"
            >
              Battle {currentOpp.name} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
