import type { PokemonType } from '../game/types';
import { TYPE_COLORS, typeLabel } from '../game/typechart';

export function TypeBadge({
  type,
  size = 'md',
}: {
  type: PokemonType;
  size?: 'sm' | 'md';
}) {
  const color = TYPE_COLORS[type];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wide ${pad}`}
      style={{
        background: `${color}26`,
        color,
        border: `1px solid ${color}66`,
      }}
    >
      {typeLabel(type)}
    </span>
  );
}

export function TypeBadges({
  types,
  size = 'sm',
}: {
  types: PokemonType[];
  size?: 'sm' | 'md';
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {types.map((t) => (
        <TypeBadge key={t} type={t} size={size} />
      ))}
    </span>
  );
}
