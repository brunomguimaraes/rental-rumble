import type { Creature, Opponent } from '../game/types';
import { TIER_LABEL } from '../game/opponents';
import { TYPE_COLORS } from '../game/typechart';
import { ROLE_INFO } from '../game/roles';
import { TypeBadge } from './TypeBadge';
import { MiniSprite } from './MiniSprite';

export function MapScreen({
  gauntlet,
  team,
  stage,
  seed,
  onFight,
  onQuit,
}: {
  gauntlet: Opponent[];
  team: Creature[];
  stage: number;
  seed: string;
  onFight: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">The Gauntlet</h2>
          <p className="mt-1 text-sm text-white/55">
            Defeat all {gauntlet.length} to be crowned Champion.
          </p>
        </div>
        <button
          type="button"
          onClick={onQuit}
          className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10"
        >
          Forfeit
        </button>
      </div>

      {/* Your team */}
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <span className="mr-1 text-xs uppercase tracking-wider text-white/40">
          Your team
        </span>
        {team.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-2.5"
            title={`${c.name} · ${c.types.join('/')} · ${c.role}`}
          >
            <MiniSprite creature={c} className="h-7 w-7" />
            <span className="text-xs font-semibold">{c.name}</span>
            <span className="text-[11px]" title={c.role}>
              {ROLE_INFO[c.role].glyph}
            </span>
          </div>
        ))}
      </div>

      {/* Gauntlet ladder */}
      <ol className="mt-6 space-y-2">
        {gauntlet.map((opp, i) => {
          const done = i < stage;
          const current = i === stage;
          const color = TYPE_COLORS[opp.type];
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
              <div
                className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12"
                style={{ background: `${color}1f` }}
              >
                <img
                  src={opp.badge}
                  alt={opp.title}
                  className={`h-8 w-8 object-contain sm:h-9 sm:w-9 ${done ? 'opacity-40' : ''}`}
                />
                {done && (
                  <span className="absolute -bottom-1 -right-1 text-sm">✅</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    {TIER_LABEL[opp.tier]}
                  </span>
                  <TypeBadge type={opp.type} size="sm" />
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

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="self-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs sm:self-auto">
          <span className="text-white/40">seed</span>{' '}
          <span className="font-mono text-white/80">{seed}</span>
        </div>
        <button
          type="button"
          onClick={onFight}
          className="w-full rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95 sm:w-auto sm:text-lg"
        >
          Battle {gauntlet[stage].name} →
        </button>
      </div>
    </div>
  );
}
