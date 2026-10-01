import { PixelSprite } from './PixelSprite';

/** The same inventory entry point on the Hub and in the world. */
export function BagButton({
  onClick,
  disabled = false,
  compact = false,
  opensDialog = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
  opensDialog?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={opensDialog ? 'dialog' : undefined}
      className={`ui-button ui-focus flex shrink-0 items-center gap-2 border border-window-rim text-left text-ink enabled:hover:border-accent enabled:hover:text-accent ${compact ? 'min-h-11 px-2 py-1' : 'min-h-16 px-2 py-2'}`}
    >
      <PixelSprite
        src={`${import.meta.env.BASE_URL}sprites/ui/night/96/item-bag.png`}
        size={compact ? 24 : 40}
        alt=""
      />
      <span className="font-label text-[10px] uppercase">Bag</span>
    </button>
  );
}
