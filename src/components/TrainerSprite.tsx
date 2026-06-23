import type { Opponent } from '../game/types';

/**
 * Overworld trainer icon. Renders the front-facing PNG by default, or the
 * looping idle GIF when `animated`. Falls back to the static PNG if the GIF is
 * missing. Pixel-art is scaled crisply.
 */
export function TrainerSprite({
  opponent,
  animated = false,
  className = 'h-12 w-12',
}: {
  opponent: Opponent;
  animated?: boolean;
  className?: string;
}) {
  return (
    <img
      src={animated ? opponent.artGif : opponent.art}
      alt={opponent.name}
      title={opponent.name}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src.endsWith('.gif')) img.src = opponent.art;
      }}
      className={`object-contain [image-rendering:pixelated] ${className}`}
    />
  );
}
