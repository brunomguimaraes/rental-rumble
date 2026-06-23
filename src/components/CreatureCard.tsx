import type { Creature, SpecialTier } from '../game/types';
import { TYPE_COLORS } from '../game/typechart';
import { ROLE_INFO } from '../game/roles';
import { TypeBadges } from './TypeBadge';

const GOLD = '#f5c542';

const TIER_BADGE: Record<SpecialTier, string | null> = {
  normal: null,
  legendary: '★ Legendary',
  mythical: '✦ Mythical',
  pseudo: '◆ Pseudo',
};

function StatBar({
  label,
  value,
  max = 160,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/55"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-7 text-right text-[10px] tabular-nums text-white/60">
        {value}
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
        <span className="text-[11px] text-white/50" title={creature.role}>
          {ROLE_INFO[creature.role].glyph}
        </span>
      </div>
      <div className="mt-1">
        <TypeBadges types={creature.types} />
      </div>
      <div className="mt-2 space-y-1">
        <StatBar label="HP" value={creature.stats.hp} />
        <StatBar label="ATK" value={creature.stats.atk} />
        <StatBar label="DEF" value={creature.stats.def} />
        <StatBar label="SPD" value={creature.stats.spd} />
      </div>

      <div className="mt-2.5 border-t border-white/10 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">
            {ROLE_INFO[creature.role].glyph} {creature.role}
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/40">
          {ROLE_INFO[creature.role].tagline}
        </p>
      </div>
    </div>
  );
}
