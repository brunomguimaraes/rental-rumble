import { useEffect, useState } from 'react';
import type { RouteState } from '../game/route-actions';

const ICON = (name: string) => `${import.meta.env.BASE_URL}sprites/ui/night/96/${name}.png`;

/** Search allowance and resumable encounters, without an offline activity loop. */
export function HubActivity({
  world, worldError, serverOffsetMs, onOpenMap, onOpenActivity, onOpenBox, onOpenBag, onRetry,
}: {
  world: RouteState | null;
  worldError: string | null;
  serverOffsetMs: number;
  onOpenMap: () => void;
  onOpenActivity: () => void;
  onOpenBox: () => void;
  onOpenBag: () => void;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const next = world?.allowance.nextRefillAt;
  const minutes = next ? Math.max(0, Math.ceil((next - now - serverOffsetMs) / 60_000)) : null;
  const card = world?.activeEvent
    ? { title: 'Sunny Meadow encounter', line: 'Your encounter is ready to continue.', action: 'Resume encounter' }
    : world?.result
      ? { title: 'Your last discovery', line: 'Your rewards are already saved.', action: 'See results' }
      : { title: 'Sunny Meadow', line: 'Find wild Pokémon, meet trainers, and explore.', action: world?.activated ? 'Visit route' : 'Begin exploring' };
  const balls = world?.inventory.stacks.reduce((total, stack) => total + stack.quantity, 0) ?? 0;

  return (
    <section aria-label="Adventure" className="mt-6 flex w-full max-w-[520px] flex-col gap-4 self-center font-pixel">
      <div className="ui-window m-2 flex flex-col gap-3 p-3">
        <h2 className="font-label text-[11px] uppercase text-info">{card.title}</h2>
        <p className="text-sm text-ink">{card.line}</p>
        {world?.activated && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-dim">
            <span>{world.allowance.available}/{world.allowance.capacity} actions · {balls} balls in your Bag</span>
            {minutes !== null && (minutes > 0
              ? <span>Next action in {minutes} min</span>
              : <button type="button" onClick={onRetry} className="ui-button ui-focus min-h-11 px-3">Refresh actions</button>)}
          </div>
        )}
        <button type="button" onClick={onOpenActivity} className="ui-button-primary ui-focus min-h-11 px-4 font-label text-[10px] uppercase">
          {card.action}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 px-2">
        <button type="button" onClick={onOpenMap} className="ui-button ui-focus flex min-h-16 items-center gap-2 px-2 py-2 text-left">
          <img src={ICON('world-map')} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" />
          <span className="font-label text-[11px] uppercase">World map</span>
        </button>
        <button type="button" onClick={onOpenBox} className="ui-button ui-focus flex min-h-16 items-center gap-2 px-2 py-2 text-left">
          <img src={ICON('your-box')} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" />
          <span className="font-label text-[11px] uppercase">Your box</span>
        </button>
        <button type="button" onClick={onOpenBag} className="ui-button ui-focus col-span-2 flex min-h-11 items-center justify-center gap-2 px-3 py-2">
          <img src={`${import.meta.env.BASE_URL}sprites/balls/poke.png`} alt="" width={24} height={24} className="h-6 w-6 object-contain [image-rendering:pixelated]" />
          <span className="font-label text-[11px] uppercase">Bag</span>
        </button>
      </div>
      {worldError && (
        <p role="alert" className="mx-2 flex items-center justify-between gap-3 text-sm text-ink-dim">
          <span>{worldError}</span>
          <button type="button" onClick={onRetry} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">Retry</button>
        </p>
      )}
    </section>
  );
}
