import type { Creature } from '../game/types';

/**
 * Team miniature. The icon files are 2-frame animation sheets (frames laid out
 * side by side, so width = 2 × height), so we render the image as a background
 * scaled to 200% width and anchored left to show only the first frame, crisp.
 */
export function MiniSprite({
  creature,
  className = 'h-8 w-8',
}: {
  creature: Creature;
  className?: string;
}) {
  const sprite = (
    <div
      role="img"
      aria-label={creature.name}
      title={creature.name}
      className={`bg-no-repeat [image-rendering:pixelated] ${className}`}
      style={{
        backgroundImage: `url(${creature.mini})`,
        backgroundSize: '200% 100%',
        backgroundPosition: 'left center',
      }}
    />
  );
  if (!creature.shiny) return sprite;
  // The mini icons have no shiny recolour, so mark a shiny with a small twinkle.
  return (
    <div className="relative inline-grid place-items-center">
      {sprite}
      <span
        aria-hidden
        className="shiny-twinkle pointer-events-none absolute -right-0.5 -top-0.5 text-[9px] leading-none drop-shadow"
        style={{ color: '#ffd76b' }}
      >
        ✦
      </span>
    </div>
  );
}
