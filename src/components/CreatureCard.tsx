import type { Creature, Role } from '../game/types';
import { TYPE_COLORS } from '../game/typechart';
import { ROLE_INFO } from '../game/roles';
import { TypeBadges } from './TypeBadge';

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

function RoleChips({
  roles,
  current,
  onSelect,
}: {
  roles: Role[];
  current: Role;
  onSelect: (r: Role) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => {
        const active = r === current;
        return (
          <button
            key={r}
            type="button"
            title={ROLE_INFO[r].tagline}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(r);
            }}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition ${
              active
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {ROLE_INFO[r].glyph} {r}
          </button>
        );
      })}
    </div>
  );
}

export function CreatureCard({
  creature,
  selected = false,
  disabled = false,
  onClick,
  onSelectRole,
}: {
  creature: Creature;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onSelectRole?: (role: Role) => void;
}) {
  const color = TYPE_COLORS[creature.types[0]];
  const clickable = Boolean(onClick) && (!disabled || selected);
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
      className={`group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-all ${
        selected
          ? 'scale-[1.01] border-white/70 bg-white/10 shadow-lg'
          : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]'
      } ${disabled && !selected ? 'opacity-40' : ''} ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={
        selected
          ? { boxShadow: `0 0 0 1px ${color}, 0 8px 30px ${color}44` }
          : undefined
      }
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-25 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between">
        <div
          className="grid h-16 w-16 place-items-center rounded-xl"
          style={{ background: `${color}1f` }}
        >
          <img
            src={creature.sprite}
            alt={creature.name}
            loading="lazy"
            className="h-16 w-16 object-contain drop-shadow"
          />
        </div>
        {selected && (
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-black">
            PICKED
          </span>
        )}
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

      {onSelectRole && (
        <div className="mt-2.5 border-t border-white/10 pt-2">
          <RoleChips
            roles={creature.eligibleRoles}
            current={creature.role}
            onSelect={onSelectRole}
          />
          <p className="mt-1 text-[10px] leading-snug text-white/40">
            {ROLE_INFO[creature.role].tagline}
          </p>
        </div>
      )}
    </div>
  );
}
