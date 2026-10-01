import { useRef, useState, type ReactNode } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { partyMembers } from '../../game/party';
import type { ActivityMode, PublicActivity, WorldState } from '../../game/activity';
import {
  EMPTY_PROGRESS,
  PLACE_LIST,
  masteryOf,
  placeById,
  placeTitle,
  routeById,
  type LocationId,
  type PlayableId,
} from '../../game/world';
import { newRequestId, startActivity } from '../../game/world-client';
import { ExpBar } from '../ui/ExpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { PixelIcon } from './PixelIcon';
import { PlacePanel, StartConfirm } from './PlacePanel';
import { WorldMap, type MapView } from './WorldMap';
import { BIOME_LABEL, POKEBALL, STATE_GLYPH, STATE_LABEL } from './scene';

type Screen =
  | { kind: 'map' }
  | { kind: 'list' }
  | { kind: 'place'; id: PlayableId; from: 'map' | 'list' }
  | { kind: 'confirm'; id: PlayableId; mode: ActivityMode; from: 'map' | 'list' };

const LEGEND = [
  ['undiscovered', '???'],
  ['locked', 'Locked'],
  ['available', 'New'],
  ['discovered', 'Visited'],
  ['completed', 'Cleared'],
] as const;

export function WorldScreen({
  world,
  worldError,
  box,
  partyIds,
  view,
  onView,
  onStarted,
  onPartyChanged,
  onOpenActivity,
  onEditParty,
  onBack,
  onRetry,
  onExpired,
}: {
  world: WorldState | null;
  worldError: string | null;
  box: OwnedMon[];
  partyIds: string[];
  view: MapView | null;
  onView: (v: MapView) => void;
  /** A trip began, or the server says one is already running (then with a notice). */
  onStarted: (activity: PublicActivity, notice?: string) => void;
  onPartyChanged: (party: string[]) => void;
  onOpenActivity: () => void;
  onEditParty: () => void;
  onBack: () => void;
  onRetry: () => void;
  onExpired: () => void;
}) {
  const [screen, setScreen] = useState<Screen>({ kind: 'map' });
  const [selected, setSelected] = useState<LocationId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newRequestId());
  const party = partyMembers(partyIds, box);

  if (!world) {
    return (
      <div className="mx-auto min-h-[100dvh] max-w-[430px] px-4 py-4 font-pixel text-ink">
        <div className="mb-3 flex items-center gap-3">
          <button type="button" onClick={onBack} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
            ◀ Back
          </button>
          <h1 className="font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">World map</h1>
        </div>
        <div className="ui-window m-2 flex flex-col items-start gap-3 p-4">
          <p className="text-sm">{worldError ?? 'Loading the map…'}</p>
          {worldError && (
            <button type="button" onClick={onRetry} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const placeView = (id: PlayableId) => world.places.find((p) => p.id === id) ?? { id, state: 'undiscovered' as const, progress: EMPTY_PROGRESS };
  const openPlace = (id: LocationId, from: 'map' | 'list') => {
    setSelected(id);
    if (routeById(id)) setScreen({ kind: 'place', id: id as PlayableId, from });
  };

  const start = async (id: PlayableId, mode: ActivityMode) => {
    setBusy(true);
    setError(null);
    const res = await startActivity({ mode, locationId: id, partyIds, requestId: requestId.current });
    setBusy(false);
    if (res.ok) {
      requestId.current = newRequestId();
      onStarted(res.activity);
      return;
    }
    if (res.expired) return onExpired();
    if (res.activity) return onStarted(res.activity, res.error);
    if (res.party) onPartyChanged(res.party);
    setError(res.error);
  };

  const shell = (children: ReactNode) => (
    <div className="mx-auto min-h-[100dvh] max-w-[430px] px-2 py-4 font-pixel text-ink">{children}</div>
  );

  if (screen.kind === 'place' || screen.kind === 'confirm') {
    const route = routeById(screen.id);
    if (!route) return null;
    if (screen.kind === 'confirm') {
      return shell(
        <StartConfirm
          route={route}
          mode={screen.mode}
          party={party}
          busy={busy}
          error={error}
          onStart={() => void start(route.id, screen.mode)}
          onCancel={() => {
            setError(null);
            setScreen({ kind: 'place', id: route.id, from: screen.from });
          }}
        />,
      );
    }
    return shell(
      <PlacePanel
        route={route}
        view={placeView(route.id)}
        world={world}
        party={party}
        onBack={() => setScreen({ kind: screen.from })}
        onChoose={(mode) => {
          requestId.current = newRequestId();
          setError(null);
          setScreen({ kind: 'confirm', id: route.id, mode, from: screen.from });
        }}
        onOpenActivity={onOpenActivity}
        onEditParty={onEditParty}
      />,
    );
  }

  const running = world.activity ? routeById(world.activity.locationId) : null;
  const focus = placeById(selected ?? world.trainerAt) ?? placeById('home');
  const focusView = focus?.kind === 'route' ? placeView(focus.id) : null;
  const focusHidden = focusView?.state === 'undiscovered';

  return shell(
    <>
      <div className="mb-3 flex items-center gap-3 px-2">
        <button type="button" onClick={onBack} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
          ◀ Back
        </button>
        <h1 className="min-w-0 flex-1 font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">Hearthvale</h1>
        <button
          type="button"
          onClick={() => setScreen({ kind: screen.kind === 'list' ? 'map' : 'list' })}
          aria-pressed={screen.kind === 'list'}
          className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase"
        >
          {screen.kind === 'list' ? 'Map' : 'List'}
        </button>
      </div>

      {running && world.activity && (
        <div className="ui-window m-2 flex items-center gap-3 p-2.5">
          <p className="min-w-0 flex-1 text-sm">
            {world.activity.mode === 'train' ? 'Training' : 'Exploring'} at {running.name}
          </p>
          <button type="button" onClick={onOpenActivity} className="ui-button-primary ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">
            {world.activity.mode === 'train' ? 'View' : 'Resume'}
          </button>
        </div>
      )}

      {screen.kind === 'list' ? (
        <section className="ui-window m-2 p-2" aria-label="Places">
          <ul className="flex flex-col gap-1">
            {PLACE_LIST.map((place) => {
              const pv = place.kind === 'route' ? placeView(place.id) : null;
              const hidden = pv?.state === 'undiscovered';
              const m = place.kind === 'route' && pv ? masteryOf(place, pv.progress) : null;
              return (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => openPlace(place.id, 'list')}
                    disabled={place.kind === 'home'}
                    className="ui-focus flex min-h-14 w-full items-center gap-3 rounded-[3px] bg-slot px-2 py-1.5 text-left disabled:cursor-default"
                  >
                    <PixelIcon name={pv ? STATE_GLYPH[pv.state] : 'home'} size={16} className={pv?.state === 'completed' ? 'text-accent' : 'text-ink'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{hidden ? '???' : placeTitle(place)}</span>
                      <span className="font-label text-[8px] uppercase text-ink-dim">
                        {pv ? STATE_LABEL[pv.state] : 'Home'}
                      </span>
                    </span>
                    {m && !hidden && (
                      <span className="flex gap-0.5" aria-label={`${[m.cleared, m.surveyed, m.catalogued].filter(Boolean).length} of 3 mastery stars`}>
                        {[m.cleared, m.surveyed, m.catalogued].map((done, i) => (
                          <PixelIcon key={i} name={done ? 'star' : 'starOutline'} size={10} className={done ? 'text-accent' : 'text-ink-dim'} />
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="ui-window m-2 p-1.5" aria-label="World map">
          <WorldMap places={world.places} trainerAt={world.trainerAt} selected={selected} view={view} onView={onView} onSelect={(id) => setSelected(id)} />
          <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 px-1" aria-label="Map key">
            {LEGEND.map(([state, label]) => (
              <li key={state} className="flex items-center gap-1 font-label text-[8px] uppercase text-ink-dim">
                <PixelIcon name={STATE_GLYPH[state]} size={10} className={state === 'completed' ? 'text-accent' : 'text-ink'} />
                {label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {screen.kind === 'map' && focus && (
        <section className="ui-window m-2 mt-4 p-3" aria-live="polite">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-label text-[12px] uppercase text-ink">{focusHidden ? '???' : placeTitle(focus)}</h2>
              <p className="mt-0.5 font-label text-[9px] uppercase text-ink-dim">
                {focus.kind === 'home'
                  ? 'Home'
                  : focusHidden
                    ? 'Undiscovered'
                    : BIOME_LABEL[focus.biome]}
                {focusView && !focusHidden ? ` · ${STATE_LABEL[focusView.state]}` : ''}
              </p>
            </div>
            {world.trainerAt === focus.id && <span className="font-label text-[8px] uppercase text-accent">You are here</span>}
          </div>
          <p className="mt-2 text-sm text-ink-dim">
            {focus.kind === 'home' ? focus.blurb : focusHidden ? 'Explore nearby to find this place.' : focus.blurb}
          </p>
          {party.length > 0 && (
            <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Your party">
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
          )}
          {focus.kind === 'route' && (
            <button
              type="button"
              onClick={() => openPlace(focus.id, 'map')}
              className="ui-button-primary ui-focus mt-3 min-h-12 w-full font-label text-[11px] uppercase"
            >
              {focusHidden ? 'What is this?' : 'View place'}
            </button>
          )}
          <p className="mt-2 text-center font-label text-[8px] uppercase text-ink-dim">Drag to look around · tap a place</p>
        </section>
      )}
    </>,
  );
}
