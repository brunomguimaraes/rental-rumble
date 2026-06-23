import { useState } from 'react';
import type { Creature } from '../game/types';
import {
  DIFFICULTY_INFO,
  DRAFT_CHOICES,
  TEAM_SIZE,
  rollDraftDeck,
  type Difficulty,
} from '../game/run';
import { CreatureCard } from './CreatureCard';
import { MiniSprite } from './MiniSprite';

export function DraftScreen({
  seed,
  difficulty,
  onConfirm,
}: {
  seed: string;
  difficulty: Difficulty;
  onConfirm: (team: Creature[]) => void;
}) {
  const [deck] = useState<Creature[]>(() => rollDraftDeck(seed));
  const [picked, setPicked] = useState<Creature[]>([]);
  const [skipsUsed, setSkipsUsed] = useState(0);

  const skipBudget = DIFFICULTY_INFO[difficulty].skips;
  const skipsLeft = skipBudget - skipsUsed;

  const done = picked.length >= TEAM_SIZE;
  // Each pick and each skip burns one trio off the front of the deck.
  const cursor = (picked.length + skipsUsed) * DRAFT_CHOICES;
  const choices = deck.slice(cursor, cursor + DRAFT_CHOICES);

  const pick = (c: Creature) => {
    if (done) return;
    setPicked((prev) => (prev.length >= TEAM_SIZE ? prev : [...prev, c]));
  };

  const skip = () => {
    if (done || skipsLeft <= 0) return;
    setSkipsUsed((u) => u + 1);
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 pb-36 sm:px-4 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">Draft your team</h2>
          <p className="mt-1 max-w-prose text-sm text-white/55">
            You'll be shown {DRAFT_CHOICES} Pokémon at a time — pick one and the
            next, totally fresh set appears. Each one's{' '}
            <span className="text-white/80">role</span> is auto-assigned (it tunes
            stats and moves). Beat a trainer and you can recruit their Pokémon
            afterward.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
            <span className="text-white/40">{DIFFICULTY_INFO[difficulty].label}</span>
          </span>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              skipsLeft > 0
                ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                : 'border-white/10 bg-white/5 text-white/40'
            }`}
            title="Skip the current set for a fresh one"
          >
            ⏭ {skipsLeft} skip{skipsLeft === 1 ? '' : 's'} left
          </span>
        </div>
      </div>

      {done ? (
        <div className="mt-10 text-center">
          <div className="text-4xl">✅</div>
          <h3 className="mt-2 text-xl font-black sm:text-2xl">Your team is set</h3>
          <p className="mt-1 text-sm text-white/55">
            Six drafted — review them below and enter the gauntlet.
          </p>
          <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
            {picked.map((c, i) => (
              <CreatureCard key={`${c.id}-${i}`} creature={c} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">
              Pick {picked.length + 1}
              <span className="text-white/25"> / {TEAM_SIZE}</span>
            </h3>
            <button
              type="button"
              onClick={skip}
              disabled={skipsLeft <= 0}
              className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
              title="Discard these and draw a fresh set"
            >
              ⏭ Skip this set{skipsLeft > 0 ? ` (${skipsLeft})` : ''}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {choices.map((c, i) => (
              <CreatureCard
                key={`${c.id}-${cursor}-${i}`}
                creature={c}
                onClick={() => pick(c)}
              />
            ))}
          </div>
        </>
      )}

      {/* Sticky team tray */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0c0c14]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
          <div className="flex flex-1 items-center gap-1.5 overflow-x-auto sm:gap-2">
            {Array.from({ length: TEAM_SIZE }).map((_, i) => {
              const c = picked[i];
              return (
                <div
                  key={i}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border sm:h-12 sm:w-12 ${
                    c
                      ? 'border-white/30 bg-white/10'
                      : 'border-dashed border-white/15 bg-white/[0.02] text-white/20'
                  }`}
                  title={c?.name}
                >
                  {c ? (
                    <MiniSprite creature={c} className="h-9 w-9 sm:h-10 sm:w-10" />
                  ) : (
                    <span className="text-sm">{i + 1}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-white/50 sm:text-xs">
              {picked.length}/{TEAM_SIZE} picked
            </div>
            <button
              type="button"
              disabled={!done}
              onClick={() => onConfirm(picked)}
              className="mt-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 sm:px-6 sm:py-2.5 sm:text-base"
            >
              {done
                ? 'Enter the gauntlet →'
                : `Pick ${TEAM_SIZE - picked.length} more`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
