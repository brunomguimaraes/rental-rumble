import { PixelSprite } from './PixelSprite';

/** The same inventory entry point on the Hub and in the world. */
export function BagButton({
  onClick,
  disabled = false,
  compact = false,
  balls,
  opensDialog = false,
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
  /** Omit while inventory is unavailable; zero is a real, empty Bag. */
  balls?: number;
  opensDialog?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={opensDialog ? 'dialog' : undefined}
      className={`ui-button ui-focus flex shrink-0 items-center gap-2 border border-window-rim text-left text-ink enabled:hover:border-accent enabled:hover:text-accent ${compact ? 'min-h-11 px-2 py-1' : 'min-h-16 px-3 py-2'} ${className}`}
    >
      <PixelSprite
        src={`${import.meta.env.BASE_URL}sprites/ui/night/96/item-bag.png`}
        size={compact ? 24 : 40}
        alt=""
      />
      <span className={`font-label uppercase ${compact ? 'text-[10px]' : 'text-[11px]'}`}>Bag</span>
      {balls !== undefined && (
        <span className="ml-auto whitespace-nowrap rounded-[2px] border border-window-frame bg-slot px-2 py-1 font-pixel text-xs text-ink-dim">
          {balls} {balls === 1 ? 'ball' : 'balls'}
        </span>
      )}
    </button>
  );
}
