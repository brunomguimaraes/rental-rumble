import type { ReactNode } from 'react';
import { TOWN_ART } from '../../game/town';

/** The same place illustration on Home and inside the world. */
export function LocationScene({ place, children, footer }: {
  place: 'home' | 'r1';
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const town = place === 'home';
  return <div className="overflow-hidden rounded-t-[3px]">
    <div className="flex min-h-9 items-center justify-between gap-2 border-b-2 border-window-frame bg-window px-3">
      <span className="font-label text-[10px] uppercase tracking-wide text-info">Your surroundings</span>
      <span className="font-label text-[9px] uppercase text-ink-dim">{town ? 'Home town' : 'Route 01'}</span>
    </div>
    <div className="relative isolate aspect-[3/2] overflow-hidden bg-slot">
      <img src={`${import.meta.env.BASE_URL}${town ? TOWN_ART.map : 'sprites/world/sunny-meadow-v1/meadow.webp'}`}
        alt={town ? 'Hearth Town, with garden paths, a village square and the Pokémon Center.' : 'Sunny Meadow, with tall grass, sunflowers and a trail beneath the hilltop oak.'}
        width={town ? TOWN_ART.width : 1254} height={town ? TOWN_ART.height : 1254}
        fetchPriority="high" decoding="async" draggable={false}
        className={`absolute inset-0 h-full w-full select-none object-cover [image-rendering:auto] ${town ? '' : 'object-[center_42%]'}`} />
      <span className="absolute left-3 top-3 border border-window-rim bg-window px-2 py-1 font-label text-[9px] uppercase text-accent shadow-[2px_2px_0_var(--color-edge)]">◆ You are here</span>
      {children}
      {footer && <div className="absolute inset-x-0 bottom-0 border-t-2 border-window-frame bg-window/95 px-3 py-2">{footer}</div>}
    </div>
  </div>;
}
