import { useState } from 'react';
import type { Opponent } from '../game/types';

/**
 * Overworld trainer icon. Renders the looping idle GIF when `animated`, else
 * the front-facing PNG; a GIF that fails falls back to the PNG. An opponent
 * with no art (or art that fails to load) shows its emoji `sprite` instead of
 * a broken image. Pixel-art is scaled crisply.
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
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const src = [animated ? opponent.artGif : '', opponent.art].find((s) => s && !broken.has(s));

  if (!src) {
    return (
      <span role="img" aria-label={opponent.name} title={opponent.name} className={`grid place-items-center text-2xl leading-none ${className}`}>
        {opponent.sprite}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={opponent.name}
      title={opponent.name}
      onError={() => setBroken((b) => new Set(b).add(src))}
      className={`object-contain [image-rendering:pixelated] ${className}`}
    />
  );
}
