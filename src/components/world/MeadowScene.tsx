import type { ReactNode } from 'react';

/** One coordinate space for the illustration and its interactive places. */
export function MeadowScene({ children, label = 'Sunny Meadow', className = '' }: { children?: ReactNode; label?: string; className?: string }) {
  return <div className={`relative isolate aspect-square w-full overflow-hidden rounded-t-[3px] bg-slot ${className}`} aria-label={label}>
    <img src={`${import.meta.env.BASE_URL}sprites/world/sunny-meadow-v1/meadow.webp`} alt="" width={1254} height={1254}
      draggable={false} decoding="async" fetchPriority="high" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover [image-rendering:auto]" />
    {children}
  </div>;
}
