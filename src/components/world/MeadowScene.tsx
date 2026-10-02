import type { ReactNode } from 'react';

/** One coordinate space for the illustration and what sits on it. `wide` crops it to the board's banner. */
export function MeadowScene({ children, label = 'Sunny Meadow', className = '', wide = false }: { children?: ReactNode; label?: string; className?: string; wide?: boolean }) {
  // On short screens the board's banner flattens so its button stays above the fold.
  const shape = wide ? 'aspect-[4/3] [@media(max-height:700px)]:aspect-[16/9]' : 'aspect-square rounded-t-[3px]';
  return <div className={`relative isolate w-full overflow-hidden bg-slot ${shape} ${className}`} aria-label={label}>
    <img src={`${import.meta.env.BASE_URL}sprites/world/sunny-meadow-v1/meadow.webp`} alt="" width={1254} height={1254}
      draggable={false} decoding="async" fetchPriority="high" className={`pointer-events-none absolute inset-0 h-full w-full select-none object-cover [image-rendering:auto] ${wide ? 'object-[center_45%]' : ''}`} />
    {children}
  </div>;
}
