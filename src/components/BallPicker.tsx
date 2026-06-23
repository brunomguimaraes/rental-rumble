import { useEffect } from 'react';
import { BALLS, ballName, ballUrl } from '../game/balls';

/**
 * Full-screen modal for choosing the (cosmetic) ball a Pokémon is sent out in.
 * Purely flavour — the ball only drives the send-out throw animation in battle.
 */
export function BallPicker({
  creatureName,
  current,
  onSelect,
  onClose,
}: {
  creatureName: string;
  current: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c0c14] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">Choose a Ball</h3>
            <p className="text-xs text-white/50">
              How <span className="text-white/80">{creatureName}</span> enters
              the battle
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/20 text-sm transition hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid max-h-[60vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
          {BALLS.map((ball) => {
            const active = ball.id === current;
            return (
              <button
                key={ball.id}
                type="button"
                title={ball.name}
                onClick={() => {
                  onSelect(ball.id);
                  onClose();
                }}
                className={`flex flex-col items-center gap-1 rounded-2xl border p-2 transition ${
                  active
                    ? 'border-white/70 bg-white/10'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.07]'
                }`}
              >
                <img
                  src={ballUrl(ball.id)}
                  alt={ball.name}
                  className="h-8 w-8 object-contain [image-rendering:pixelated]"
                />
                <span className="text-center text-[9px] leading-tight text-white/55">
                  {ball.name.replace(' Ball', '')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Small round ball badge — used to surface/trigger a Pokémon's current ball. */
export function BallBadge({
  ball,
  onClick,
  className = '',
}: {
  ball: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={`${ballName(ball)} — tap to change`}
      className={`grid place-items-center rounded-full border border-white/20 bg-black/50 backdrop-blur-sm transition hover:scale-110 hover:bg-white/15 ${className}`}
    >
      <img
        src={ballUrl(ball)}
        alt={ballName(ball)}
        className="h-5 w-5 object-contain [image-rendering:pixelated]"
      />
    </button>
  );
}
