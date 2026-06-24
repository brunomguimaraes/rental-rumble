import type { Creature, SpecialTier } from '../game/types';
import { TYPE_COLORS } from '../game/typechart';
import { SIGN_INFO, SIGN_SPREAD, signIconUrl, signLabel, signSummary } from '../game/zodiac';
import { TypeBadges } from './TypeBadge';

const GOLD = '#f5c542';

const TIER_BADGE: Record<SpecialTier, string | null> = {
  normal: null,
  legendary: '★ Legendary',
  mythical: '✦ Mythical',
  pseudo: '◆ Pseudo',
};

// Stat bar showing the sign-adjusted value (base × the sign's spread multiplier),
// with a small arrow + colour when the sign tilts that stat up or down.
function StatBar({
  label,
  value,
  mult = 1,
  max = 160,
}: {
  label: string;
  value: number;
  mult?: number;
  max?: number;
}) {
  const adjusted = Math.round(value * mult);
  const pct = Math.min(100, (adjusted / max) * 100);
  const up = mult > 1.001;
  const down = mult < 0.999;
  const fill = up ? 'bg-emerald-400/70' : down ? 'bg-rose-400/70' : 'bg-white/55';
  const numColor = up ? 'text-emerald-300' : down ? 'text-rose-300' : 'text-white/60';
  const arrow = up ? '▲' : down ? '▼' : '';
  return (
    <div
      className="flex items-center gap-1.5"
      title={
        mult === 1
          ? `${label}: ${adjusted}`
          : `${label}: ${value} base → ${adjusted} as ${up ? 'boosted' : 'lowered'} by sign (${
              mult > 1 ? '+' : ''
            }${Math.round((mult - 1) * 100)}%)`
      }
    >
      <span className="w-6 shrink-0 text-[10px] uppercase tracking-wider text-white/45 sm:w-7">
        {label}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`flex w-8 shrink-0 items-center justify-end gap-0.5 text-[10px] tabular-nums sm:w-9 ${numColor}`}
      >
        {arrow && <span className="text-[7px] leading-none">{arrow}</span>}
        {adjusted}
      </span>
    </div>
  );
}

function handleImgError(e: React.SyntheticEvent<HTMLImageElement>, fallback: string) {
  const img = e.currentTarget;
  if (img.src !== fallback) img.src = fallback;
}

export function CreatureCard({
  creature,
  selected = false,
  disabled = false,
  onClick,
  onReroll,
}: {
  creature: Creature;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onReroll?: () => void;
}) {
  const color = TYPE_COLORS[creature.types[0]];
  const spread = SIGN_SPREAD[creature.sign];
  const special = creature.tier !== 'normal';
  const accent = special ? GOLD : color;
  const clickable = Boolean(onClick) && (!disabled || selected);
  const tierBadge = TIER_BADGE[creature.tier];

  const borderClass = special
    ? 'border-transparent'
    : selected
      ? 'border-white/70'
      : 'border-white/10 hover:border-white/30';

  const boxShadow = special
    ? selected
      ? `0 0 0 2px ${GOLD}, 0 8px 34px ${GOLD}55`
      : `0 0 0 1.5px ${GOLD}aa, 0 4px 20px ${GOLD}33`
    : selected
      ? `0 0 0 1px ${color}, 0 8px 30px ${color}44`
      : undefined;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-all ${borderClass} ${
        selected ? 'scale-[1.01] bg-white/10 shadow-lg' : 'bg-white/[0.03] hover:bg-white/[0.06]'
      } ${disabled && !selected ? 'opacity-40' : ''} ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={boxShadow ? { boxShadow } : undefined}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-25 blur-2xl"
        style={{ background: accent }}
      />

      {tierBadge && (
        <span
          className="absolute left-2 top-2 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
          style={{ background: GOLD, color: '#1a1400' }}
        >
          {tierBadge}
        </span>
      )}

      {onReroll && (
        <button
          type="button"
          title="Reroll this card"
          onClick={(e) => {
            e.stopPropagation();
            onReroll();
          }}
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-black/40 text-sm transition hover:bg-white/20"
        >
          🎲
        </button>
      )}

      <div className="flex items-start justify-between">
        <div
          className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-xl"
          style={{
            background: `${accent}1f`,
            border: `1px solid ${accent}66`,
          }}
        >
          <img
            src={creature.portrait}
            alt={creature.name}
            loading="lazy"
            onError={(e) => handleImgError(e, creature.sprite)}
            className="h-16 w-16 rounded-xl object-cover drop-shadow"
          />
          {selected && (
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-black text-black">
              ✓
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between">
        <h3 className="text-sm font-bold">{creature.name}</h3>
        <img
          src={signIconUrl(creature.sign)}
          alt={signLabel(creature.sign)}
          title={signSummary(creature.sign)}
          className="h-4 w-4 object-contain opacity-70"
        />
      </div>
      <div className="mt-1">
        <TypeBadges types={creature.types} />
      </div>
      <div className="mt-2 space-y-1">
        <StatBar label="HP" value={creature.stats.hp} mult={spread.hp} />
        <StatBar label="ATK" value={creature.stats.atk} mult={spread.atk} />
        <StatBar label="DEF" value={creature.stats.def} mult={spread.def} />
        <StatBar label="SPD" value={creature.stats.spd} mult={spread.spd} />
      </div>

      <div className="mt-2.5 border-t border-white/10 pt-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex cursor-help items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80"
            title={signSummary(creature.sign)}
          >
            <img
              src={signIconUrl(creature.sign)}
              alt=""
              className="h-3.5 w-3.5 object-contain"
            />
            {signLabel(creature.sign)}
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/40">
          {SIGN_INFO[creature.sign].tagline}
        </p>
      </div>
    </div>
  );
}
