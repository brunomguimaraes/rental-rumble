import { useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { miniUrl, spriteUrl } from '../../game/pokemon';
import type { PublicActivity, StepEvent } from '../../game/activity';
import type { TrailEntry } from '../../game/expedition';
import { routeById, type ChoiceId, type RoutePlace } from '../../game/world';
import { stepExpedition } from '../../game/world-client';
import { ExpBar } from '../ui/ExpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { BattleReplay } from './BattleReplay';
import { Backdrop } from './Backdrop';
import { PixelIcon } from './PixelIcon';
import { POKEBALL, TRAINER, backdropUrl, speciesName, type ActivityPatch } from './scene';

// An expedition in progress: the scene, the checkpoint in front of the
// trainer, its choices, and the trail so far. Every choice goes to the server;
// what comes back is what happened.

const TYPICAL_STEPS = 5;

function landmarkName(route: RoutePlace, id: string | undefined): string {
  return route.landmarks.find((l) => l.id === id)?.name ?? 'a landmark';
}

function trailLine(entry: TrailEntry, route: RoutePlace): string {
  const foe = entry.foe ? speciesName(entry.foe.dexId) : '';
  switch (entry.outcome) {
    case 'observed':
      return `Watched a ${foe}`;
    case 'won':
      return `Beat ${entry.foe?.guardian ? 'the guardian ' : 'a wild '}${foe}`;
    case 'lost':
      return `Lost to ${foe}`;
    case 'found':
      return entry.foe ? `Found ${landmarkName(route, entry.landmark)} past a ${foe}` : `Found ${landmarkName(route, entry.landmark)}`;
    case 'passed':
      return 'Pressed on';
    case 'took-a':
    case 'took-b': {
      const node = route.expedition.nodes[entry.node];
      const option = node?.kind === 'fork' ? node.options.find((o) => o.id === entry.choice) : undefined;
      return `Took the ${option?.label.toLowerCase() ?? 'path'}`;
    }
    case 'retreated':
      return 'Headed home';
  }
}

function discoveryNote(event: StepEvent, route: RoutePlace): string | null {
  if (event.landmark && event.newLandmark) return `${landmarkName(route, event.landmark)} discovered`;
  if (event.foe && event.newSeen) return `New sighting: ${speciesName(event.foe.dexId)}`;
  return null;
}

export function ExpeditionView({
  activity,
  onPatch,
  onRefresh,
  onLeave,
  onExpired,
}: {
  activity: PublicActivity;
  onPatch: (patch: ActivityPatch) => void;
  onRefresh: () => Promise<void>;
  onLeave: () => void;
  onExpired: () => void;
}) {
  const route = routeById(activity.locationId);
  const exp = activity.expedition;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ event: StepEvent; patch: ActivityPatch } | null>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (!route || !exp) return null;
  const checkpoint = exp.checkpoint;

  const choose = async (choice: ChoiceId) => {
    if (!checkpoint) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await stepExpedition({ activityId: activity.id, step: checkpoint.step, choice });
    setBusy(false);
    if (!res.ok) {
      if (res.expired) return onExpired();
      // Another tab or a retry already decided this checkpoint: show where things stand.
      if (res.status === 409) {
        onPatch({ activity: res.activity ?? null, result: res.result ?? null });
        void onRefresh();
      }
      setError(res.error);
      return;
    }
    const patch: ActivityPatch = { activity: res.activity, result: res.result, box: res.box };
    if (res.event.battle) {
      setReplay({ event: res.event, patch });
      return;
    }
    setNote(discoveryNote(res.event, route));
    onPatch(patch);
    if (res.result) void onRefresh();
  };

  if (replay?.event.battle && replay.event.foe) {
    return (
      <BattleReplay
        events={replay.event.battle.events}
        party={activity.party}
        foe={replay.event.foe}
        backdrop={backdropUrl(route)}
        onDone={() => {
          setNote(discoveryNote(replay.event, route));
          onPatch(replay.patch);
          if (replay.patch.result) void onRefresh();
          setReplay(null);
        }}
      />
    );
  }

  const options = checkpoint?.options.filter((o) => o.id !== 'retreat') ?? [];
  const steps = Math.max(TYPICAL_STEPS, exp.step + 1);

  return (
    <div className="flex flex-col">
      <section className="ui-window m-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-label text-[11px] uppercase text-info">Checkpoint {exp.step + 1}</h2>
          <ol className="flex gap-1" aria-label={`Checkpoint ${exp.step + 1} of about ${steps}`}>
            {Array.from({ length: steps }, (_, i) => (
              <li
                key={i}
                className={`h-2.5 w-2.5 rounded-full border-2 ${i < exp.step ? 'border-accent bg-accent' : i === exp.step ? 'border-accent bg-transparent' : 'border-ink-dim bg-transparent'}`}
              />
            ))}
          </ol>
        </div>
        <p className="mt-1 flex items-center gap-1.5 font-label text-[9px] uppercase text-ink-dim">
          <PixelIcon name="exp" size={12} className="text-exp" /> {exp.expUnits} EXP banked · {exp.wins} {exp.wins === 1 ? 'win' : 'wins'}
        </p>
      </section>

      <div className="ui-window relative m-2 h-44 overflow-hidden p-0" aria-hidden="true">
        <Backdrop src={backdropUrl(route)} />
        <div className="absolute bottom-2 left-2 flex items-end gap-0.5">
          <img src={reduced ? TRAINER.still : TRAINER.walk} alt="" width={32} height={48} className="[image-rendering:pixelated]" />
          {activity.party.slice(0, 3).map((mon) => (
            <PixelSprite key={mon.id} src={miniUrl(mon.dexId)} size={64} alt="" sheet className={reduced ? '' : 'animate-world-walk'} />
          ))}
        </div>
        {checkpoint?.foe && (
          <PixelSprite src={spriteUrl(checkpoint.foe.dexId)} fallback={POKEBALL} size={96} alt="" className="absolute bottom-3 right-3" />
        )}
      </div>

      {note && (
        <p role="status" className="ui-window m-2 flex items-center gap-2 p-2 text-sm">
          <PixelIcon name="book" size={14} className="text-accent" /> {note}
        </p>
      )}

      {checkpoint ? (
        <section className="ui-window m-2 p-3" aria-labelledby="checkpoint-title">
          <h2 id="checkpoint-title" className="font-label text-[12px] uppercase text-accent">
            {checkpoint.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed">{checkpoint.text}</p>
          {checkpoint.foe && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>{speciesName(checkpoint.foe.dexId)}</span>
              {checkpoint.foe.guardian && <span className="font-label text-[8px] uppercase text-accent">Guardian</span>}
              {checkpoint.foe.rare && <span className="font-label text-[8px] uppercase text-caught-shiny">Rare</span>}
              {checkpoint.foe.shiny && <span className="font-label text-[8px] uppercase text-caught-shiny">✦ Shiny</span>}
            </p>
          )}
          {checkpoint.landmark && (
            <p className="mt-2 text-sm text-ink-dim">
              {checkpoint.landmark.name}
              {checkpoint.landmark.known ? ' (found before)' : ''}
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-2">
            {options.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void choose(o.id)}
                  className={`${i === 0 ? 'ui-button-primary' : 'ui-button'} ui-focus group flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left`}
                >
                  <span aria-hidden="true" className="font-label text-[10px] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                    ▶
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-label text-[11px] uppercase">{o.label}</span>
                    <span className="block text-xs">{o.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-2 text-sm text-accent">
              {error}
            </p>
          )}
        </section>
      ) : (
        <section className="ui-window m-2 p-3 text-sm">This trip is over. {error}</section>
      )}

      <div className="m-2 flex items-center justify-between gap-3">
        <button type="button" onClick={onLeave} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
          Pause
        </button>
        {checkpoint && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose('retreat')}
            className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase"
          >
            Head home
          </button>
        )}
      </div>

      {exp.trail.length > 0 && (
        <section className="ui-window m-2 mt-3 p-3" aria-labelledby="trail-title">
          <h2 id="trail-title" className="mb-2 font-label text-[11px] uppercase text-info">
            The trail so far
          </h2>
          <ol className="flex flex-col gap-1 text-sm">
            {exp.trail.map((entry) => (
              <li key={entry.step} className="flex items-baseline gap-2">
                <span className="w-4 shrink-0 font-label text-[9px] text-ink-dim">{entry.step + 1}</span>
                <span className={entry.outcome === 'lost' ? 'text-accent' : ''}>{trailLine(entry, route)}</span>
                {entry.expUnits ? <span className="ml-auto shrink-0 font-label text-[9px] text-exp">+{entry.expUnits}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      )}

      <PartyStrip party={activity.party} />
    </div>
  );
}

function PartyStrip({ party }: { party: readonly OwnedMon[] }) {
  return (
    <section className="ui-window m-2 mt-3 p-2.5" aria-label="Party on this trip">
      <ol className="flex flex-wrap gap-1.5">
        {party.map((mon) => {
          const c = ownedMonToCreature(mon);
          return (
            <li key={mon.id} className="flex w-14 flex-col items-center rounded-[3px] bg-slot px-1 py-1">
              <PixelSprite src={c?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt={c?.name ?? ''} />
              <ExpBar level={mon.level} exp={mon.exp} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
