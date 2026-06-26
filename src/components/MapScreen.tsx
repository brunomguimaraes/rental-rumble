import { useEffect, useRef, useState } from 'react';
import type { Creature, Opponent, RelicId } from '../game/types';
import type { Difficulty } from '../game/run';
import { TIER_LABEL, isTypeThemed, opponentAccent } from '../game/opponents';
import { teamHasAbility } from '../game/abilities';
import { TypeBadge } from './TypeBadge';
import { TrainerSprite } from './TrainerSprite';
import { LineupEditor } from './LineupEditor';
import { RelicStrip } from './RelicStrip';
import { DEV } from '../game/dev';
import { scrollToSection } from '../ui-scroll';

// On Master an un-fought foe's type is concealed, so its type-coloured accent
// (the avatar tile + the current-foe glow) would leak it. Swap in a generic
// rainbow wash instead — kept faint to match the normal ~12%-alpha tile, so the
// row reads as "a mystery" rather than a specific type.
const CONCEALED_TILE =
  'conic-gradient(from 0deg, rgba(248,113,113,0.16), rgba(251,191,36,0.16), rgba(52,211,153,0.16), rgba(96,165,250,0.16), rgba(167,139,250,0.16), rgba(244,114,182,0.16), rgba(248,113,113,0.16))';
const CONCEALED_GLOW = '0 0 0 1px rgba(255,255,255,0.30)';

export function MapScreen({
  gauntlet,
  team,
  relics = [],
  stage,
  seed,
  difficulty,
  onFight,
  onSkip,
  onQuit,
  onReorder,
}: {
  gauntlet: Opponent[];
  team: Creature[];
  /** Team-wide relics collected so far this run (see relics.ts). */
  relics?: RelicId[];
  stage: number;
  seed: string;
  difficulty: Difficulty;
  onFight: () => void;
  onSkip: () => void;
  onQuit: () => void;
  onReorder: (team: Creature[]) => void;
}) {
  const [confirmingQuit, setConfirmingQuit] = useState(false);
  const currentOpp = gauntlet[stage];

  // On harder modes the gauntlet runs long enough that the trainer you're about
  // to fight starts below the fold — so bring it into view when the map opens and
  // whenever the stage advances. (No-op when it's already visible, e.g. stage 1.)
  const currentTrainerRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    scrollToSection(currentTrainerRef.current, 'center');
  }, [stage]);
  // Skippable foes (the rare bonus challenge) don't count toward the mandatory
  // tally — you can wave them off and still be crowned Champion.
  const required = gauntlet.filter((o) => !o.skippable).length;
  // Master hides the type of foes you haven't beaten yet: no scouting ahead to
  // pre-arrange your lineup, so every battle is a blind read.
  const concealTypes = difficulty === 'master' && !teamHasAbility(team, 'scout');
  return (
    <div className="mx-auto max-w-5xl px-3 py-6 pb-28 sm:px-4 sm:py-8 sm:pb-28">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">The Gauntlet</h2>
          <p className="mt-1 text-sm text-white/55">
            Defeat all {required} to be crowned Champion.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmingQuit(true)}
          className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10"
        >
          Forfeit
        </button>
      </div>

      {confirmingQuit && (
        <ForfeitDialog
          required={required}
          stage={stage}
          onConfirm={onQuit}
          onCancel={() => setConfirmingQuit(false)}
        />
      )}

      {/* Your team — arrange the lineup (slot 1 leads) */}
      <div className="mt-6">
        <LineupEditor team={team} onChange={onReorder} />
        <RelicStrip relics={relics} className="mt-3 justify-center sm:justify-start" />
      </div>

      {/* Gauntlet ladder */}
      <ol className="mt-6 space-y-2">
        {gauntlet.map((opp, i) => {
          const done = i < stage;
          const current = i === stage;
          const color = opponentAccent(opp);
          // A type-themed foe you haven't fought yet on Master hides its type, so
          // its type-coloured accent + badge are swapped for generic stand-ins.
          const concealed = concealTypes && !done && isTypeThemed(opp);
          return (
            <li
              key={opp.id}
              ref={current ? currentTrainerRef : undefined}
              className={`flex items-center gap-3 rounded-2xl border p-2.5 transition sm:gap-4 sm:p-3 ${
                current
                  ? 'border-white/50 bg-white/[0.07]'
                  : done
                    ? 'border-emerald-400/30 bg-emerald-400/[0.04]'
                    : 'border-white/10 bg-white/[0.02] opacity-60'
              }`}
              style={
                current
                  ? { boxShadow: concealed ? CONCEALED_GLOW : `0 0 0 1px ${color}66` }
                  : undefined
              }
            >
              <div className="relative shrink-0">
                <div
                  className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl sm:h-14 sm:w-14"
                  style={{ background: concealed ? CONCEALED_TILE : `${color}1f` }}
                >
                  <TrainerSprite
                    opponent={opp}
                    className={`h-12 w-12 sm:h-14 sm:w-14 ${done ? 'opacity-40 grayscale' : ''}`}
                  />
                </div>
                {/* The corner badge is the foe's type icon, so it would give away
                    an un-fought foe's type on Master. Hidden for concealed foes;
                    the Champion's crown badge (not a type) and already-beaten foes
                    still show theirs. */}
                {!concealed && (
                  <img
                    src={opp.badge}
                    alt=""
                    className={`absolute -bottom-1 -right-1 z-10 h-5 w-5 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] sm:h-6 sm:w-6 ${
                      done ? 'opacity-40 grayscale' : ''
                    }`}
                  />
                )}
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
                  {concealTypes && !done ? (
                    <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                      ??? Type
                    </span>
                  ) : isTypeThemed(opp) ? (
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
          {DEV && (
            <div className="self-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs sm:self-auto">
              <span className="text-white/40">seed</span>{' '}
              <span className="font-mono text-white/80">{seed}</span>
            </div>
          )}
          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
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

/**
 * Forfeit confirmation modal. Following destructive-action best practice, the
 * safe choice (Keep playing) is the auto-focused default, Escape and a backdrop
 * click both cancel, and the destructive action is visually separated so it
 * can't be triggered by a stray double-tap.
 */
function ForfeitDialog({
  required,
  stage,
  onConfirm,
  onCancel,
}: {
  required: number;
  stage: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="forfeit-title"
        aria-describedby="forfeit-desc"
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0c0c14] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="forfeit-title" className="text-lg font-black">
          Rage quit this run?
        </h3>
        <p id="forfeit-desc" className="mt-1 text-sm text-white/55">
          {stage > 0
            ? `You've beaten ${stage} of ${required}. Bailing now ends the run — and enshrines you in the Hall of Shame, tagged as a Ragequitter.`
            : `This ends the run before it really begins — and lands you in the Hall of Shame as a Ragequitter.`}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-red-400/40 bg-red-500/15 px-4 py-2.5 text-sm font-bold text-red-300 transition hover:bg-red-500/25"
          >
            🏳 Rage quit
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-white/90"
          >
            Keep playing
          </button>
        </div>
      </div>
    </div>
  );
}
