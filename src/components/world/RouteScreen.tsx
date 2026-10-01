import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OwnedMon } from '../../game/box';
import { partyMembers } from '../../game/party';
import type { CaptureBallId, RouteCatch, RouteChoice, RouteEvent, RouteState, SearchKind } from '../../game/route-actions';
import {
  clearPendingRouteCommand, dismissRouteResult, fetchRouteState, newRouteRequestId, readPendingRouteCommand,
  reconcileRouteState, runRouteCommand, savePendingRouteCommand, type RouteCommand,
} from '../../game/route-actions-client';
import { formatMoney } from '../../game/items';
import { ROUTE_RULES } from '../../game/route-rules';
import { TOWN_DESTINATIONS, type TownDestinationId } from '../../game/town';
import { placeById, placeTitle, routeById } from '../../game/world';
import { dismissResult as dismissLegacyResult } from '../../game/world-client';
import { scrollToTop } from '../../ui-scroll';
import { BagButton } from '../ui/BagButton';
import { BattleReplay } from './BattleReplay';
import { CenterView } from './CenterView';
import { Panel } from './Panel';
import { CatchSequence } from './CatchSequence';
import { RouteResultView } from './RouteResultView';
import { tradeText } from './route-copy';
import { backdropUrl } from './scene';
import { SunnyMeadow } from './SunnyMeadow';
import { MarketScreen } from './MarketScreen';
import { MeadowEncounter } from './MeadowEncounter';
import { RouteBagDialog } from './RouteBagDialog';
import { TownAvatar, TownSummary, TownView, type TownService } from './TownView';
import { TravelPanel } from './TravelPanel';
import { WorldMap, type MapView } from './WorldMap';

type Page = 'map' | 'list' | 'home' | 'center' | 'r1' | 'encounter' | 'market';

/** Where the world screen opens instead of its map: Sunny Meadow, or inside Hearth Town at a destination. */
export type WorldEntry = { place: 'r1'; focus?: 'encounter' | 'result' | 'survey' } | { place: 'home'; spot: TownDestinationId };

// The town opens on its road to Sunny Meadow, the way on to the playable route.
const TOWN_START: TownDestinationId = TOWN_DESTINATIONS.find((d) => d.link === 'r1')?.id ?? TOWN_DESTINATIONS[0].id;


export interface RouteScreenProps {
  accountKey: string;
  state: RouteState | null;
  error: string | null;
  box: OwnedMon[];
  partyIds: string[];
  view: MapView | null;
  onView: (view: MapView) => void;
  onState: (state: RouteState, box?: OwnedMon[]) => void;
  onEditParty: () => void;
  /** A town destination opens the party editor, Pokédex or box; back returns to that destination. */
  onVisit: (screen: TownService, spot: TownDestinationId) => void;
  onBack: () => void;
  onRetry: () => void;
  onExpired: () => void;
  onPartyChanged?: (ids: string[]) => void;
  entry?: WorldEntry;
  /** Shown above the world's pages, except during an encounter. */
  trainerBar?: ReactNode;
}

/** Active play, with server-owned encounters and inventory; navigation never spends an action. */
export function RouteScreen({ accountKey, state, error: loadError, box, partyIds, view, onView, onState, onEditParty, onVisit, onBack, onRetry, onExpired, onPartyChanged, entry, trainerBar }: RouteScreenProps) {
  // The server decides where the trainer stands; only that place's pages open.
  const here = state?.trainerAt ?? 'home';
  // Before the route account opens (or while a legacy journey finishes) there is no trip to take:
  // the meadow's Begin exploring button is how it opens, so every place stays open until then.
  const roams = !state?.activated || state.legacy.pending;
  const [page, setPage] = useState<Page>(entry?.place === 'r1' && (entry.focus === 'encounter' || entry.focus === 'result') ? 'encounter' : entry?.place ?? 'map');
  const [from, setFrom] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<'home' | 'r1'>(entry?.place ?? here);
  const [spot, setSpot] = useState<TownDestinationId>(entry?.place === 'home' ? entry.spot : TOWN_START);
  const [bagOpen, setBagOpen] = useState(false);
  const [selectedBall, setSelectedBall] = useState<{ eventId: string; id: CaptureBallId } | null>(null);
  const [pending, setPending] = useState<RouteCommand | null>(() => readPendingRouteCommand(accountKey));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replay, setReplay] = useState<RouteEvent | null>(null);
  const [capture, setCapture] = useState<{ requestId: string; event: RouteEvent; ballId: CaptureBallId; result: RouteCatch | null } | null>(null);
  const [resultOnly, setResultOnly] = useState(entry?.place === 'r1' && entry.focus === 'result');
  const currentState = useRef(state);
  useEffect(() => { currentState.current = state; }, [state]);

  const adopt = (incoming: RouteState, nextBox?: OwnedMon[]) => {
    const next = reconcileRouteState(currentState.current, incoming);
    currentState.current = next;
    onState(next, next === incoming ? nextBox : undefined);
    return next;
  };

  const openCenter = () => { scrollToTop(); setSelected('home'); setSpot('pokemon-center'); setPage('center'); };

  const refresh = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const reply = await fetchRouteState();
    inFlight.current = false;
    setBusy(false);
    if (reply.ok) { adopt(reply.state, reply.box); setError(null); }
    else if (reply.expired) onExpired();
    else setError(reply.error);
  };

  const submit = async (command: RouteCommand) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setPending(command);
    savePendingRouteCommand(accountKey, command);
    if (command.operation === 'choose' && command.input.choice === 'catch' && command.input.ballId) {
      const encounter = currentState.current?.activeEvent ?? currentState.current?.result;
      if (encounter?.id === command.input.eventId && encounter.foe) {
        setCapture({ requestId: command.input.requestId, event: encounter, ballId: command.input.ballId, result: null });
        setPage('encounter');
        setReplay(null);
        setBagOpen(false);
        scrollToTop();
      }
    }
    const reply = await runRouteCommand(command);
    inFlight.current = false;
    setBusy(false);
    if (!reply.ok) {
      setCapture(null);
      if (reply.state) adopt(reply.state);
      if (reply.party) onPartyChanged?.(reply.party);
      if (!reply.uncertain) { clearPendingRouteCommand(accountKey); setPending(null); }
      if (reply.expired) return onExpired();
      setError(reply.error);
      return;
    }
    clearPendingRouteCommand(accountKey);
    setPending(null);
    const fresh = adopt(reply.state, reply.box);
    // Commit the server state immediately; the sequence only holds back its visual reveal.
    // A retry may return an old receipt alongside newer state. Never revive that old encounter.
    if (command.operation === 'choose' && command.input.choice === 'catch') {
      const caughtEvent = fresh.result;
      setCapture((current) => current?.requestId === command.input.requestId && caughtEvent?.id === command.input.eventId && caughtEvent.catch
        ? { ...current, result: caughtEvent.catch } : null);
    }
    setResultOnly(false);
    setSelectedBall(null);
    if (command.operation === 'travel') {
      // The fresh state says where the trainer now stands. A trip home from the market's or the Center's
      // travel panel goes back into that building.
      const to = fresh.trainerAt;
      setSelected(to);
      setPage((current) => ((current === 'market' || current === 'center') && to === 'home' ? current : to));
      scrollToTop();
      return;
    }
    if (command.operation === 'search' || command.operation === 'choose') {
      setPage(fresh.activeEvent || fresh.result ? 'encounter' : 'r1');
      scrollToTop();
      const event = fresh.activeEvent ?? fresh.result;
      if (command.operation === 'choose' && command.input.choice === 'battle' && event?.id === command.input.eventId && event.battle) setReplay(event);
    } else if (command.operation === 'heal') {
      setPage('center');
      setNotice('Your Pokémon are fully healed. We hope to see you again!');
    } else if (command.operation === 'market-trade') {
      if (reply.trade) setNotice(tradeText(reply.trade));
    } else {
      setPage('r1');
      if (command.operation === 'quest-claim') setNotice(`Meadow survey complete. ${ROUTE_RULES.questGreatBalls} Great Balls and ${formatMoney(ROUTE_RULES.questMoney)} are saved in your Bag.`);
    }
  };

  const dismiss = async (eventId: string, then: 'r1' | 'center' = 'r1') => {
    if (inFlight.current || pending) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const reply = await dismissRouteResult(eventId);
    inFlight.current = false;
    setBusy(false);
    if (!reply.ok) {
      if (reply.state) adopt(reply.state);
      if (reply.expired) return onExpired();
      setError(reply.error);
      return;
    }
    // Done returns to where the trainer stands; a result can be read after travelling home.
    const fresh = adopt(reply.state, reply.box);
    // After a whiteout the server already stands the trainer in town; away from it, the Center page offers the trip.
    if (then === 'center') openCenter();
    else { setPage(fresh.trainerAt); scrollToTop(); }
  };

  const dismissLegacy = async (activityId: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const reply = await dismissLegacyResult(activityId);
    inFlight.current = false;
    setBusy(false);
    if (!reply.ok) {
      if (reply.expired) return onExpired();
      setError(reply.error);
      return;
    }
    await refresh();
  };

  const party = partyMembers(partyIds, box);
  const route = routeById('r1')!;
  const home = placeById('home')!;
  const event = (resultOnly ? state?.result : state?.activeEvent ?? state?.result) ?? null;
  const catchContext = page === 'encounter' && event && event.choices.includes('catch') ? event : null;
  const locked = busy || pending !== null || capture !== null;

  // A place opens at its top: its button can sit below the fold of the map or the town.
  // Opening a place only enters where the trainer stands; elsewhere it selects the place on the map.
  const openPlace = (id: 'home' | 'r1', source: 'map' | 'list') => {
    scrollToTop(); setSelected(id); setFrom(source);
    setPage(roams || id === here ? id : 'map');
  };
  // The town's road shows the trip and its cost on the map; it never spends on a tap.
  const walkTo = (id: 'r1') => { scrollToTop(); setSelected(id); setPage(roams ? id : 'map'); };
  const choose = (choice: RouteChoice, ballId?: CaptureBallId) => {
    if (!event || locked) return;
    void submit({ operation: 'choose', input: { requestId: newRouteRequestId(), eventId: event.id, expectedRevision: event.revision, choice, ...(ballId ? { ballId } : {}) } });
  };
  const search = (kind: SearchKind) => {
    if (locked) return;
    void submit({ operation: 'search', input: { requestId: newRouteRequestId(), locationId: 'r1', kind, partyIds } });
  };
  const travel = (to: 'home' | 'r1') => {
    if (locked) return;
    void submit({ operation: 'travel', input: { requestId: newRouteRequestId(), to, partyIds } });
  };
  // A place page the trainer is not at (a Hub deep link, a stale page, the meadow's care panel) shows the
  // trip there instead. The market and the Pokémon Center are in Hearth Town.
  const awayFrom: 'home' | 'r1' | null = roams ? null : page === 'market' || page === 'center' ? (here === 'home' ? null : 'home')
    : (page === 'home' || page === 'r1') && page !== here ? page : null;

  return <div className="mx-auto min-h-[100dvh] max-w-[430px] px-2 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] font-pixel text-ink">
    <header className="mb-4 flex items-center gap-2 px-2">
      <button type="button" disabled={capture !== null} onClick={() => { setReplay(null); setNotice(null); if (page === 'map' || page === 'list') onBack(); else if (page === 'encounter') setPage('r1'); else if (page === 'center' || page === 'market') setPage('home'); else setPage(from); }} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">◀ {page === 'map' || page === 'list' ? 'Back' : page === 'encounter' ? 'Route' : page === 'center' || page === 'market' ? 'Town' : 'Map'}</button>
      <h1 className="min-w-0 flex-1 font-label text-[12px] uppercase text-accent [text-shadow:2px_2px_0_#000]">{page === 'center' ? 'Pokémon Center' : page === 'market' ? 'Village market' : page === 'home' ? home.name : page === 'r1' || page === 'encounter' ? route.name : 'Hearthvale'}</h1>
      {page === 'map' || page === 'list' ? <button type="button" onClick={() => setPage(page === 'map' ? 'list' : 'map')} aria-pressed={page === 'list'} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">{page === 'map' ? 'List' : 'Map'}</button>
        : <BagButton compact opensDialog disabled={!state || capture !== null} onClick={() => setBagOpen(true)} />}
    </header>
    {page !== 'encounter' && trainerBar && <div className="m-2">{trainerBar}</div>}

    {(error || loadError) && <div role="alert" className="ui-window m-2 p-3 text-sm text-accent"><p>{error ?? loadError}</p><button type="button" disabled={busy} onClick={() => state ? void refresh() : onRetry()} className="ui-button ui-focus mt-2 min-h-11 px-3 font-label text-[10px] uppercase">Refresh route</button></div>}
    {notice && <p role="status" className="ui-window m-2 p-3 text-sm">{notice}</p>}
    {pending && !capture && <Panel title="Recover your last action"><p className="text-sm">Your last request may already be saved. Retry it to recover the same result before making another choice.</p><button type="button" disabled={busy} onClick={() => void submit(pending)} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Checking…' : 'Retry last action'}</button></Panel>}
    {!state ? (!loadError && <Panel title="World"><p className="text-sm" role="status">Loading the map, actions, and Bag…</p></Panel>) : <>
      {page === 'map' && <>
        <section className="ui-window m-2 p-1.5" aria-label="World map"><WorldMap places={state.places} trainerAt={here} selected={selected} view={view} onView={onView} onSelect={(id) => { if (id === 'home' || id === 'r1') setSelected(id); }} /><p className="mt-2 text-center text-xs text-ink-dim">Drag to look around · tap a place</p></section>
        {!roams && selected !== here ? <TravelPanel to={selected} state={state} busy={locked} onTravel={travel} />
          : selected === 'home' ? <TownSummary onEnter={() => openPlace('home', 'map')} />
          : <Panel title={placeTitle(route)}><p className="text-sm text-ink-dim">{route.blurb}</p><button type="button" onClick={() => openPlace('r1', 'map')} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">Visit {route.name}</button></Panel>}
      </>}
      {page === 'list' && <Panel title="Places"><ul className="flex flex-col gap-2">{[home, route].map((place) => <li key={place.id}><button type="button" onClick={() => openPlace(place.id as 'home' | 'r1', 'list')} className="ui-focus flex min-h-14 w-full items-center gap-3 rounded-[3px] bg-slot p-3 text-left"><span className="min-w-0 flex-1"><span className="block text-base">{placeTitle(place)}</span><span className="text-sm text-ink-dim">{place.id === 'home' ? 'Home town' : 'Wild Pokémon, friendly trainers, and landmarks'}</span></span>{place.id === 'home' && <TownAvatar className="h-10 w-10" />}</button></li>)}</ul></Panel>}
      {awayFrom && <TravelPanel to={awayFrom} state={state} busy={locked} onTravel={travel} />}
      {page === 'home' && !awayFrom && <TownView spot={spot} onSpot={setSpot} onOpen={(screen) => onVisit(screen, spot)} onWalk={walkTo} onCenter={openCenter} onMarket={() => { scrollToTop(); setPage('market'); }} />}
      {page === 'center' && !awayFrom && <CenterView state={state} box={box} partyIds={partyIds} busy={locked}
        onHeal={() => void submit({ operation: 'heal', input: { requestId: newRouteRequestId() } })}
        onEditParty={() => onVisit('party', 'pokemon-center')} onOpenBox={() => onVisit('box', 'pokemon-center')} />}
      {page === 'market' && !awayFrom && (state.activated && !state.legacy.pending
        ? <MarketScreen state={state} busy={locked} onTrade={(trade) => void submit({ operation: 'market-trade', input: { requestId: newRouteRequestId(), ...trade } })} />
        : <Panel title="Village market"><p className="text-sm">Begin exploring Sunny Meadow to open your account at the market.</p><button type="button" onClick={() => walkTo('r1')} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Walk to Sunny Meadow</button></Panel>)}
      {page === 'r1' && !awayFrom && <SunnyMeadow state={state} party={party} locked={locked} busy={busy}
        showSurvey={entry?.place === 'r1' && entry.focus === 'survey'}
        onSearch={search} onActivate={() => void submit({ operation: 'activate', input: { requestId: newRouteRequestId() } })}
        onResume={() => { setResultOnly(false); setPage('encounter'); scrollToTop(); }}
        onResult={() => { setResultOnly(true); setPage('encounter'); scrollToTop(); }}
        onBag={() => setBagOpen(true)} onEditParty={onEditParty} onCenter={openCenter} onRefresh={() => void refresh()}
        onClaim={() => void submit({ operation: 'quest-claim', input: { requestId: newRouteRequestId(), questId: 'meadow-survey' } })}
        onDismissLegacy={(id) => void dismissLegacy(id)} />}
      {page === 'encounter' && (capture ? <CatchSequence key={capture.requestId} event={capture.event} ballId={capture.ballId} result={capture.result} onDone={() => { setCapture(null); scrollToTop(); }} />
        : replay?.battle && replay.foe ? <BattleReplay key={`${replay.id}:${replay.revision}`} events={replay.battle.events} party={replay.battle.fielded ? replay.party.filter((m) => replay.battle!.fielded!.some((f) => f.id === m.id)) : replay.party} foe={replay.foe} trainerName={replay.kind === 'trainer' ? replay.npc?.name : undefined} backdrop={backdropUrl(route)} onDone={() => { setReplay(null); scrollToTop(); }} />
        : event ? event.phase === 'resolved'
          ? <RouteResultView event={event} box={box} busy={locked} onDone={() => void dismiss(event.id, event.outcome === 'lost' ? 'center' : 'r1')} onReplay={() => { setReplay(event); scrollToTop(); }} />
          : <MeadowEncounter key={event.id} event={event} state={state} box={box} locked={locked} busy={busy}
              selectedBall={selectedBall?.eventId === event.id ? selectedBall.id : null}
              onSelectBall={(id) => setSelectedBall(id ? { eventId: event.id, id } : null)} onChoose={choose}
              onBag={() => setBagOpen(true)} onReplay={() => { setReplay(event); scrollToTop(); }} />
        : <Panel title="Ready to explore"><p className="text-sm">This encounter is finished and your progress is saved.</p><button type="button" onClick={() => setPage('r1')} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Return to Sunny Meadow</button></Panel>)}
      {bagOpen && <RouteBagDialog state={state} event={catchContext} busy={locked} onClose={() => setBagOpen(false)}
        onSelect={(id) => { if (catchContext) setSelectedBall({ eventId: catchContext.id, id }); setBagOpen(false); }} />}

    </>}
  </div>;
}
