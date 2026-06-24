import { useState } from 'react';
import type { Creature, SpecialTier } from '../game/types';
import { SHINY_STAT_MULT } from '../game/pokemon';
import { TYPE_COLORS } from '../game/typechart';
import {
  SIGN_INFO,
  SIGN_SPREAD,
  signIconUrl,
  signLabel,
  signSummary,
  signTier,
} from '../game/zodiac';
import { TypeBadges } from './TypeBadge';
import { MovesModal } from './MovesModal';

const GOLD = '#f5c542';

const TIER_BADGE: Record<SpecialTier, string | null> = {
  normal: null,
  legendary: '★ Legendary',
  mythical: '✦ Mythical',
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
  const [showMoves, setShowMoves] = useState(false);
  const color = TYPE_COLORS[creature.types[0]];
  const spread = SIGN_SPREAD[creature.sign];
  const special = creature.tier !== 'normal';
  const shiny = creature.shiny;
  // A shiny nudges every stat by the same flat factor, stacked on the sign's
  // spread, so the card's bars match what the battle actually computes.
  const shinyMult = shiny ? SHINY_STAT_MULT : 1;
  const accent = shiny ? GOLD : special ? GOLD : color;
  const clickable = Boolean(onClick) && (!disabled || selected);
  const tierBadge = TIER_BADGE[creature.tier];

  // A rare/mythic celestial sign overrides the normal/legendary border with an
  // animated rainbow (rare) or shimmering "super different" frame (mythic).
  const tier = signTier(creature.sign);
  const celestial = tier === 'rare' || tier === 'mythic';
  const celestialClass = tier === 'rare' ? 'sign-rare' : tier === 'mythic' ? 'sign-mythic' : '';

  const borderClass =
    celestial || special || shiny
      ? 'border-transparent'
      : selected
        ? 'border-white/70'
        : 'border-white/10 hover:border-white/30';

  const baseShadow = celestial
    ? tier === 'mythic'
      ? selected
        ? '0 0 0 1px #fff, 0 10px 42px rgba(255,205,80,0.55)'
        : '0 6px 34px rgba(255,205,80,0.4)'
      : selected
        ? '0 8px 32px rgba(255,255,255,0.28)'
        : '0 6px 28px rgba(150,110,255,0.26)'
    : special
      ? selected
        ? `0 0 0 2px ${GOLD}, 0 8px 34px ${GOLD}55`
        : `0 0 0 1.5px ${GOLD}aa, 0 4px 20px ${GOLD}33`
      : selected
        ? `0 0 0 1px ${color}, 0 8px 30px ${color}44`
        : undefined;

  // Shiny "foil" frame: a gold ring with a warm glow plus a faint aqua halo, so
  // it reads as iridescent. Layered in front of any base shadow so a shiny that's
  // also legendary/celestial keeps its other cues underneath.
  const shinyShadow = selected
    ? '0 0 0 2px #ffd76b, 0 0 24px rgba(255,210,90,0.6), 0 0 44px rgba(120,230,255,0.28)'
    : '0 0 0 1.5px #ffd76b, 0 6px 26px rgba(255,210,90,0.42), 0 0 36px rgba(120,230,255,0.2)';
  const boxShadow = shiny
    ? baseShadow
      ? `${shinyShadow}, ${baseShadow}`
      : shinyShadow
    : baseShadow;

  return (
    <>
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
      className={`group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-all ${celestialClass} ${shiny ? 'shiny-card' : ''} ${borderClass} ${
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
          {shiny && (
            <span
              title="Shiny — a rare colour variant with a flat stat boost"
              className="shiny-twinkle pointer-events-none absolute -left-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full text-[12px] drop-shadow"
              style={{
                background: 'radial-gradient(circle, #fff6d6 0%, #ffd76b 55%, #f5a623 100%)',
                color: '#7a4b00',
              }}
            >
              ✦
            </span>
          )}
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
        <StatBar label="HP" value={creature.stats.hp} mult={spread.hp * shinyMult} />
        <StatBar label="ATK" value={creature.stats.atk} mult={spread.atk * shinyMult} />
        <StatBar label="DEF" value={creature.stats.def} mult={spread.def * shinyMult} />
        <StatBar label="SPD" value={creature.stats.spd} mult={spread.spd * shinyMult} />
      </div>

      <div className="mt-2.5 border-t border-white/10 pt-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="inline-flex min-w-0 cursor-help items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80"
              title={signSummary(creature.sign)}
            >
              <img
                src={signIconUrl(creature.sign)}
                alt=""
                className="h-3.5 w-3.5 shrink-0 object-contain"
              />
              <span className="truncate">{signLabel(creature.sign)}</span>
            </span>
            {shiny && (
              <span
                title={`Shiny — every stat boosted ×${SHINY_STAT_MULT}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: 'linear-gradient(90deg, #ffe9a8, #ffd76b, #bfefff)',
                  color: '#5c3b00',
                }}
              >
                ✦ Shiny
              </span>
            )}
          </div>
          <button
            type="button"
            title={`View ${creature.name}'s moveset`}
            aria-label={`View ${creature.name}'s moveset`}
            onClick={(e) => {
              e.stopPropagation();
              setShowMoves(true);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/65 transition hover:bg-white/15 hover:text-white"
          >
            ⚔ Moves
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/40">
          {SIGN_INFO[creature.sign].tagline}
        </p>
      </div>
    </div>
    {showMoves && (
      <MovesModal creature={creature} onClose={() => setShowMoves(false)} />
    )}
    </>
  );
}
