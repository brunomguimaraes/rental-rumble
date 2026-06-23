import type { PokemonType } from '../game/types';
import { TYPE_COLORS, typeIconUrl, typeLabel } from '../game/typechart';

export function TypeBadge({
  type,
  size = 'md',
  icon = true,
}: {
  type: PokemonType;
  size?: 'sm' | 'md';
  icon?: boolean;
}) {
  const color = TYPE_COLORS[type];
  const sm = size === 'sm';
  const pad = icon
    ? sm
      ? 'py-0.5 pl-0.5 pr-2 text-[10px] gap-1'
      : 'py-1 pl-1 pr-2.5 text-xs gap-1.5'
    : sm
      ? 'px-2 py-0.5 text-[10px]'
      : 'px-2.5 py-1 text-xs';
  const iconSize = sm ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wide ${pad}`}
      style={{
        background: `${color}26`,
        color,
        border: `1px solid ${color}66`,
      }}
    >
      {icon && (
        <img
          src={typeIconUrl(type)}
          alt=""
          className={`${iconSize} shrink-0 object-contain`}
        />
      )}
      {typeLabel(type)}
    </span>
  );
}

export function TypeBadges({
  types,
  size = 'sm',
  icon = true,
}: {
  types: PokemonType[];
  size?: 'sm' | 'md';
  icon?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {types.map((t) => (
        <TypeBadge key={t} type={t} size={size} icon={icon} />
      ))}
    </span>
  );
}
