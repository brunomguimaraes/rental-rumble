import { useMemo, useState } from 'react';
import type { Creature, PokemonType } from '../game/types';
import {
  DIFFICULTY_INFO,
  DRAFT_CHOICES,
  TEAM_SIZE,
  rollDraftDeck,
  type Difficulty,
} from '../game/run';
import { withBall } from '../game/pokemon';
import { ballUrl } from '../game/balls';
import { CreatureCard } from './CreatureCard';
import { BallBadge, BallPicker } from './BallPicker';
import { MiniSprite } from './MiniSprite';
import {
  ALL_TYPES,
  TYPE_COLORS,
  typeIconUrl,
  typeLabel,
  typeMultiplier,
} from '../game/typechart';

export function DraftScreen({
  seed,
  difficulty,
  dex,
  onConfirm,
}: {
  seed: string;
  difficulty: Difficulty;
  dex?: Creature[];
  onConfirm: (team: Creature[]) => void;
}) {
  const [deck] = useState<Creature[]>(() => rollDraftDeck(seed, dex));
  const [picked, setPicked] = useState<Creature[]>([]);
  const [skipsUsed, setSkipsUsed] = useState(0);
  const [ballEditor, setBallEditor] = useState<number | null>(null);

  const setBall = (index: number, ball: string) => {
    setPicked((prev) =>
      prev.map((c, i) => (i === index ? withBall(c, ball) : c)),
    );
  };

  const skipBudget = DIFFICULTY_INFO[difficulty].skips;
  const skipsLeft = skipBudget - skipsUsed;

  const done = picked.length >= TEAM_SIZE;

  // Every type your picks bring — one entry per occurrence (two Fire mons => two
  // Fire icons), grouped by type so duplicates sit together.
  const teamTypes = useMemo(
    () =>
      picked
        .flatMap((c) => c.types)
        .sort((a, b) => ALL_TYPES.indexOf(a) - ALL_TYPES.indexOf(b)),
    [picked],
  );

  // Distinct types your picks cover, with how many Pokémon contribute each.
  const teamTypeCounts = useMemo(() => {
    const counts = new Map<PokemonType, number>();
    for (const t of teamTypes) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].map(([type, count]) => ({ type, count }));
  }, [teamTypes]);

  // Offensive-coverage helper for the gentler modes: which defending types can't
  // your picks' types hit super-effectively, and which attacking types would
  // best plug those holes if you drafted them next.
  const coverage = useMemo(() => {
    const have = new Set(teamTypes);
    const uncovered = ALL_TYPES.filter(
      (def) => ![...have].some((atk) => typeMultiplier(atk, def) === 2),
    );
    const recommended = ALL_TYPES.filter((atk) => !have.has(atk))
      .map((atk) => ({
        type: atk,
        gain: uncovered.filter((def) => typeMultiplier(atk, def) === 2).length,
      }))
      .filter((r) => r.gain > 0)
      .sort((a, b) => b.gain - a.gain || ALL_TYPES.indexOf(a.type) - ALL_TYPES.indexOf(b.type))
      .slice(0, 4);
    return { uncovered, recommended };
  }, [teamTypes]);

  const showCoverageTip =
    (difficulty === 'easy' || difficulty === 'normal') && !done;
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
            <span className="text-white/80">zodiac sign</span> is auto-assigned (it
            tunes stats and moves). Beat a trainer and you can recruit their
            Pokémon afterward.
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

      {showCoverageTip && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          {picked.length === 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/55">
              <span className="font-bold uppercase tracking-wider text-white/40">
                Coverage tip
              </span>
              Pick a Pokémon to see which types your team can't hit
              super-effectively yet.
            </div>
          ) : coverage.uncovered.length === 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/55">
              <span className="font-bold uppercase tracking-wider text-emerald-300/80">
                Great coverage
              </span>
              Your picks already hit every type super-effectively.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                  Coverage tip
                </span>
                <span className="text-xs text-white/55">
                  Can't hit super-effectively yet:
                </span>
                {coverage.uncovered.map((t) => (
                  <TypeChip key={t} type={t} muted />
                ))}
              </div>
              {coverage.recommended.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="text-xs text-white/55">
                    Good picks to cover them:
                  </span>
                  {coverage.recommended.map((r) => (
                    <TypeChip key={r.type} type={r.type} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {done ? (
        <div className="mt-10 text-center">
          <div className="text-4xl">✅</div>
          <h3 className="mt-2 text-xl font-black sm:text-2xl">Your team is set</h3>
          <p className="mt-1 text-sm text-white/55">
            Six drafted — tap a Pokémon's{' '}
            <span className="text-white/80">ball</span> to choose how it's sent
            into battle, then enter the gauntlet.
          </p>
          <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
            {picked.map((c, i) => (
              <div key={`${c.id}-${i}`} className="relative">
                <CreatureCard creature={c} />
                <BallBadge
                  ball={c.pokeball}
                  onClick={() => setBallEditor(i)}
                  className="absolute right-2 top-2 z-10 h-8 w-8"
                />
              </div>
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

          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:gap-x-4 sm:px-4 sm:py-3">
          <div className="order-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:flex-none sm:gap-2">
            {Array.from({ length: TEAM_SIZE }).map((_, i) => {
              const c = picked[i];
              return (
                <div
                  key={i}
                  className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border sm:h-12 sm:w-12 ${
                    c
                      ? 'border-white/30 bg-white/10'
                      : 'border-dashed border-white/15 bg-white/[0.02] text-white/20'
                  }`}
                  title={c?.name}
                >
                  {c ? (
                    <>
                      <MiniSprite creature={c} className="h-9 w-9 sm:h-10 sm:w-10" />
                      <img
                        src={ballUrl(c.pokeball)}
                        alt=""
                        className="absolute -bottom-1 -right-1 h-4 w-4 object-contain drop-shadow [image-rendering:pixelated]"
                      />
                    </>
                  ) : (
                    <span className="text-sm">{i + 1}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Team typing — each type once, with a count on its left. Single
              scrollable row so a wide spread of types never wraps and pushes the
              fixed tray up over the content (drops to its own line on phones). */}
          {teamTypeCounts.length > 0 && (
          <div className="order-3 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto sm:order-2 sm:w-auto sm:flex-1">
            {teamTypeCounts.map(({ type, count }) => (
              <span
                key={type}
                title={`${count}× ${typeLabel(type)}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md py-0.5 pl-1 pr-1.5"
                style={{
                  background: `${TYPE_COLORS[type]}26`,
                  border: `1px solid ${TYPE_COLORS[type]}66`,
                }}
              >
                <span
                  className="text-[11px] font-bold tabular-nums sm:text-xs"
                  style={{ color: TYPE_COLORS[type] }}
                >
                  {count}
                </span>
                <img
                  src={typeIconUrl(type)}
                  alt={typeLabel(type)}
                  className="h-4 w-4 object-contain sm:h-[18px] sm:w-[18px]"
                />
              </span>
            ))}
          </div>
          )}

          <div className="order-2 ml-auto shrink-0 text-right sm:order-3 sm:ml-0">
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

      {ballEditor !== null && picked[ballEditor] && (
        <BallPicker
          creatureName={picked[ballEditor].name}
          current={picked[ballEditor].pokeball}
          onSelect={(id) => setBall(ballEditor, id)}
          onClose={() => setBallEditor(null)}
        />
      )}
    </div>
  );
}

function TypeChip({ type, muted = false }: { type: PokemonType; muted?: boolean }) {
  const color = TYPE_COLORS[type];
  return (
    <span
      title={typeLabel(type)}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{
        background: `${color}${muted ? '14' : '26'}`,
        color,
        border: `1px solid ${color}${muted ? '40' : '66'}`,
        opacity: muted ? 0.85 : 1,
      }}
    >
      <img src={typeIconUrl(type)} alt="" className="h-3.5 w-3.5 object-contain" />
      {typeLabel(type)}
    </span>
  );
}
