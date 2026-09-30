import { useRef, useState } from 'react';
import type { OwnedMon } from '../../game/box';
import type { WorldState } from '../../game/activity';
import { routeById } from '../../game/world';
import { dismissResult, newRequestId, startActivity } from '../../game/world-client';
import { ExpeditionView } from './ExpeditionView';
import { ResultsView } from './ResultsView';
import { TrainingView } from './TrainingView';
import type { ActivityPatch } from './scene';

// Whatever the trainer is doing: an expedition, training, or results waiting
// to be read. One lazy chunk for all three, since they share the battle view
// and the growth copy.

export function ActivityScreen({
  world,
  box,
  partyIds,
  serverOffsetMs,
  onPatch,
  onRefresh,
  onMap,
  onHub,
  onExpired,
}: {
  world: WorldState | null;
  box: OwnedMon[];
  partyIds: string[];
  serverOffsetMs: number;
  onPatch: (patch: ActivityPatch) => void;
  onRefresh: () => Promise<void>;
  onMap: () => void;
  onHub: () => void;
  onExpired: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newRequestId());

  const activity = world?.activity ?? null;
  const result = world?.result ?? null;
  const route = routeById(activity?.locationId ?? result?.locationId);
  const title = activity
    ? activity.mode === 'train'
      ? `Training at ${route?.name ?? '…'}`
      : route?.name ?? 'Expedition'
    : result
      ? `Back from ${route?.name ?? 'the road'}`
      : 'Nothing running';

  const dismiss = async () => {
    if (!result) return true;
    const res = await dismissResult(result.id);
    if (!res.ok && res.expired) {
      onExpired();
      return false;
    }
    // A failed dismiss only means the results show again later.
    onPatch({ result: null });
    return true;
  };

  const again = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    if (!(await dismiss())) return;
    const res = await startActivity({ mode: result.mode, locationId: result.locationId, partyIds, requestId: requestId.current });
    setBusy(false);
    if (res.ok) {
      requestId.current = newRequestId();
      onPatch({ activity: res.activity, result: null });
      return;
    }
    if (res.expired) return onExpired();
    // Already out (another device, or a lost reply): show that trip instead.
    if (res.activity) onPatch({ activity: res.activity, result: null });
    setError(res.error);
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[430px] px-2 pb-10 pt-4 font-pixel text-ink">
      <div className="mb-2 flex items-center gap-3 px-2">
        <button type="button" onClick={onHub} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
          ◀ Hub
        </button>
        <h1 className="min-w-0 truncate font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">{title}</h1>
      </div>

      {error && (
        <p role="alert" className="ui-window m-2 p-3 text-sm text-accent">
          {error}
        </p>
      )}

      {activity?.mode === 'explore' ? (
        <ExpeditionView activity={activity} onPatch={onPatch} onRefresh={onRefresh} onLeave={onHub} onExpired={onExpired} />
      ) : activity?.mode === 'train' ? (
        <TrainingView
          activity={activity}
          serverOffsetMs={serverOffsetMs}
          onPatch={onPatch}
          onRefresh={onRefresh}
          onLeave={onHub}
          onExpired={onExpired}
        />
      ) : result ? (
        <ResultsView
          result={result}
          box={box}
          busy={busy}
          onAgain={() => void again()}
          onMap={() => {
            void dismiss().then((ok) => ok && onMap());
          }}
        />
      ) : (
        <section className="ui-window m-2 flex flex-col items-start gap-3 p-4">
          <p className="text-sm">{world ? 'Your trainer is at home. Pick a place on the map to set out.' : 'Loading…'}</p>
          <button type="button" onClick={onMap} className="ui-button-primary ui-focus min-h-11 px-4 font-label text-[10px] uppercase">
            Open the map
          </button>
        </section>
      )}
    </div>
  );
}
