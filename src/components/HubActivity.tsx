import { useEffect, useState } from 'react';
import type { WorldState } from '../game/activity';
import { routeById } from '../game/world';
import { OUTCOME_TITLE, formatDuration } from './world/scene';

const ICON = (name: string) => `${import.meta.env.BASE_URL}sprites/ui/night/96/${name}.png`;

/** What the trainer is doing right now, and the way into the world. */
export function HubActivity({
  world,
  worldError,
  serverOffsetMs,
  onOpenMap,
  onOpenActivity,
  onOpenBox,
  onRetry,
}: {
  world: WorldState | null;
  worldError: string | null;
  serverOffsetMs: number;
  onOpenMap: () => void;
  onOpenActivity: () => void;
  onOpenBox: () => void;
  onRetry: () => void;
}) {
  const activity = world?.activity ?? null;
  const result = world?.result ?? null;
  const training = activity?.training ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!training) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [training]);

  const route = routeById(activity?.locationId ?? result?.locationId);
  let card: { title: string; line: string; action: string } | null = null;
  if (activity && route && training) {
    const elapsed = Math.max(0, Math.min(now + serverOffsetMs - activity.startedAt, training.capMs));
    const wins = `${training.wins} ${training.wins === 1 ? 'win' : 'wins'} so far`;
    card = {
      title: `Training at ${route.name}`,
      line: training.fell
        ? 'Your party fell. Bring them home to collect.'
        : elapsed >= training.capMs
          ? '8 hours done. Bring them home to collect.'
          : `${formatDuration(elapsed)} of 8h · ${wins}`,
      action: 'View',
    };
  } else if (activity && route && activity.expedition) {
    card = {
      title: `Exploring ${route.name}`,
      line: `Checkpoint ${activity.expedition.step + 1} · ${activity.expedition.expUnits} EXP banked`,
      action: 'Resume',
    };
  } else if (result && route) {
    card = { title: `Back from ${route.name}`, line: OUTCOME_TITLE[result.outcome], action: 'See results' };
  }

  return (
    <section aria-label="Adventure" className="mt-6 flex w-full max-w-[520px] flex-col gap-4 self-center font-pixel">
      {card && (
        <div className="ui-window m-2 flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-label text-[11px] uppercase text-info">{card.title}</h2>
            <p className="mt-1 text-sm text-ink">{card.line}</p>
          </div>
          <button type="button" onClick={onOpenActivity} className="ui-button-primary ui-focus min-h-11 shrink-0 px-4 font-label text-[10px] uppercase">
            {card.action}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 px-2">
        <button
          type="button"
          onClick={onOpenMap}
          className={`${card ? 'ui-button' : 'ui-button-primary'} ui-focus flex min-h-16 items-center gap-2 px-2 py-2 text-left`}
        >
          <img src={ICON('world-map')} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
          <span className="font-label text-[11px] uppercase">World map</span>
        </button>
        <button type="button" onClick={onOpenBox} className="ui-button ui-focus flex min-h-16 items-center gap-2 px-2 py-2 text-left">
          <img src={ICON('your-box')} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
          <span className="font-label text-[11px] uppercase">Your box</span>
        </button>
      </div>

      {worldError && (
        <p className="mx-2 flex items-center justify-between gap-3 text-sm text-ink-dim">
          <span>{worldError}</span>
          <button type="button" onClick={onRetry} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">
            Retry
          </button>
        </p>
      )}
    </section>
  );
}
