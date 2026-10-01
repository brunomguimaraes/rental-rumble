import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ballUrl } from '../../game/balls';
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { ballCount, itemById, itemQuantity } from '../../game/items';
import { partyMembers } from '../../game/party';
import { altColorPortraitUrl, portraitUrl, shinyPortraitUrl } from '../../game/pokemon';
import type { CaptureBallId, RouteChoice, RouteEvent, RouteState, SearchKind } from '../../game/route-actions';
import {
  clearPendingRouteCommand, dismissRouteResult, fetchRouteState, newRouteRequestId, readPendingRouteCommand,
  reconcileRouteState, runRouteCommand, savePendingRouteCommand, type RouteCommand,
} from '../../game/route-actions-client';
import { MEADOW_LANDMARKS, ROUTE_RULES } from '../../game/route-rules';
import { TOWN_DESTINATIONS, type TownDestinationId } from '../../game/town';
import { EMPTY_PROGRESS, placeById, placeTitle, routeById } from '../../game/world';
import { dismissResult as dismissLegacyResult } from '../../game/world-client';
import { scrollToTop } from '../../ui-scroll';
import { BagScreen } from '../BagScreen';
import { ExpBar } from '../ui/ExpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { Backdrop } from './Backdrop';
import { BattleReplay } from './BattleReplay';
import { RouteResultView } from './RouteResultView';
import { backdropUrl, formatDuration, growthLines, monName, POKEBALL, speciesName } from './scene';
import { TownAvatar, TownSummary, TownView, type TownService } from './TownView';
import { WorldMap, type MapView } from './WorldMap';

type Page = 'map' | 'list' | 'home' | 'r1' | 'encounter';

/** Where the world screen opens instead of its map: Sunny Meadow, or inside Hearth Town at a destination. */
export type WorldEntry = { place: 'r1' } | { place: 'home'; spot: TownDestinationId };

// The town opens on its road to Sunny Meadow, the way on to the playable route.
const TOWN_START: TownDestinationId = TOWN_DESTINATIONS.find((d) => d.link === 'r1')?.id ?? TOWN_DESTINATIONS[0].id;

function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="ui-window m-2 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-label text-[11px] uppercase text-info">{title}</h2>{aside}</div>{children}</section>;
}

function AllowanceView({ state, onRefresh }: { state: RouteState; onRefresh: () => void }) {
  const [clock, setClock] = useState(() => ({ serverNow: state.serverNow, at: performance.now(), elapsed: 0 }));
  useEffect(() => {
    const at = performance.now();
    const timer = window.setInterval(() => setClock({ serverNow: state.serverNow, at, elapsed: performance.now() - at }), 1000);
    return () => window.clearInterval(timer);
  }, [state.serverNow]);
  const elapsed = clock.serverNow === state.serverNow ? clock.elapsed : 0;
  const remaining = state.allowance.nextRefillAt === null ? null : Math.max(0, state.allowance.nextRefillAt - state.serverNow - elapsed);
  return <div>
    <p className="text-base"><span className="font-label text-lg text-accent">{state.allowance.available}</span> / {state.allowance.capacity} actions available</p>
    <p className="mt-1 text-sm text-ink-dim">Recover 1 action every {Math.round(state.allowance.refillEveryMs / 60000)} minutes. Each search uses 1 action; finishing an encounter is free.</p>
    {remaining !== null && <p className="mt-2 text-sm" role="timer">{remaining > 0 ? `Next action in ${formatDuration(remaining)}.` : 'An action may be ready.'}</p>}
    {remaining === 0 && <button type="button" onClick={onRefresh} className="ui-button ui-focus mt-2 min-h-11 px-3 font-label text-[10px] uppercase">Refresh actions</button>}
    {state.allowance.available === 0 && <p className="mt-2 text-sm text-ink-dim">New searches are paused. You can still finish your encounter, check your Bag, or edit your party.</p>}
  </div>;
}

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
}

/** Active play, with server-owned encounters and inventory; navigation never spends an action. */
export function RouteScreen({ accountKey, state, error: loadError, box, partyIds, view, onView, onState, onEditParty, onVisit, onBack, onRetry, onExpired, onPartyChanged, entry }: RouteScreenProps) {
  const [page, setPage] = useState<Page>(entry?.place ?? 'map');
  const [from, setFrom] = useState<'map' | 'list'>('map');
  const [selected, setSelected] = useState<'home' | 'r1'>(entry?.place ?? state?.trainerAt ?? 'home');
  const [spot, setSpot] = useState<TownDestinationId>(entry?.place === 'home' ? entry.spot : TOWN_START);
  const [bagOpen, setBagOpen] = useState(false);
  const [selectedBall, setSelectedBall] = useState<{ eventId: string; id: CaptureBallId } | null>(null);
  const [pending, setPending] = useState<RouteCommand | null>(() => readPendingRouteCommand(accountKey));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replay, setReplay] = useState<RouteEvent | null>(null);
  const [resultOnly, setResultOnly] = useState(false);
  const currentState = useRef(state);
  useEffect(() => { currentState.current = state; }, [state]);

  const adopt = (incoming: RouteState, nextBox?: OwnedMon[]) => {
    const next = reconcileRouteState(currentState.current, incoming);
    currentState.current = next;
    onState(next, next === incoming ? nextBox : undefined);
    return next;
  };

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
    const reply = await runRouteCommand(command);
    inFlight.current = false;
    setBusy(false);
    if (!reply.ok) {
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
    setResultOnly(false);
    setSelectedBall(null);
    if (command.operation === 'search' || command.operation === 'choose') {
      setPage(fresh.activeEvent || fresh.result ? 'encounter' : 'r1');
      const event = fresh.activeEvent ?? fresh.result;
      if (command.operation === 'choose' && command.input.choice === 'battle' && event?.id === command.input.eventId && event.battle) setReplay(event);
    } else {
      setPage('r1');
      if (command.operation === 'quest-claim') setNotice(`Meadow survey complete. ${ROUTE_RULES.questGreatBalls} Great Balls are saved in your Bag.`);
    }
  };

  const dismiss = async (eventId: string) => {
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
    adopt(reply.state, reply.box);
    setPage('r1');
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
  const balls = state ? ballCount(state.inventory) : 0;
  const locked = busy || pending !== null;

  if (bagOpen) return <BagScreen inventory={state?.inventory ?? null} error={loadError ?? error} busy={locked}
    onBack={() => setBagOpen(false)} onRetry={() => void refresh()}
    onExplore={() => { setBagOpen(false); setPage('r1'); }}
    catchChances={catchContext?.catchChances}
    onSelect={catchContext && state && state.ownedCount < 600 ? (id) => { setSelectedBall({ eventId: catchContext.id, id }); setBagOpen(false); } : undefined}
  />;

  // A place opens at its top: its button can sit below the fold of the map or the town.
  const openPlace = (id: 'home' | 'r1', source: 'map' | 'list') => { scrollToTop(); setSelected(id); setFrom(source); setPage(id); };
  const walkTo = (id: 'r1') => { scrollToTop(); setSelected(id); setPage(id); };
  const choose = (choice: RouteChoice, ballId?: CaptureBallId) => {
    if (!event || locked) return;
    void submit({ operation: 'choose', input: { requestId: newRouteRequestId(), eventId: event.id, expectedRevision: event.revision, choice, ...(ballId ? { ballId } : {}) } });
  };
  const search = (kind: SearchKind) => {
    if (locked) return;
    void submit({ operation: 'search', input: { requestId: newRouteRequestId(), locationId: 'r1', kind, partyIds } });
  };

  return <div className="mx-auto min-h-[100dvh] max-w-[430px] px-2 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] font-pixel text-ink">
    <header className="mb-4 flex items-center gap-2 px-2">
      <button type="button" onClick={() => { setReplay(null); if (page === 'map' || page === 'list') onBack(); else if (page === 'encounter') setPage('r1'); else setPage(from); }} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">◀ {page === 'map' || page === 'list' ? 'Back' : page === 'encounter' ? 'Route' : 'Map'}</button>
      <h1 className="min-w-0 flex-1 font-label text-[12px] uppercase text-accent [text-shadow:2px_2px_0_#000]">{page === 'home' ? home.name : page === 'r1' || page === 'encounter' ? route.name : 'Hearthvale'}</h1>
      {page === 'map' || page === 'list' ? <button type="button" onClick={() => setPage(page === 'map' ? 'list' : 'map')} aria-pressed={page === 'list'} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">{page === 'map' ? 'List' : 'Map'}</button>
        : <button type="button" onClick={() => setBagOpen(true)} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">Bag</button>}
    </header>

    {(error || loadError) && <div role="alert" className="ui-window m-2 p-3 text-sm text-accent"><p>{error ?? loadError}</p><button type="button" disabled={busy} onClick={() => state ? void refresh() : onRetry()} className="ui-button ui-focus mt-2 min-h-11 px-3 font-label text-[10px] uppercase">Refresh route</button></div>}
    {notice && <p role="status" className="ui-window m-2 p-3 text-sm">{notice}</p>}
    {pending && <Panel title="Recover your last action"><p className="text-sm">Your last request may already be saved. Retry it to recover the same result before making another choice.</p><button type="button" disabled={busy} onClick={() => void submit(pending)} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Checking…' : 'Retry last action'}</button></Panel>}
    {!state ? (!loadError && <Panel title="World"><p className="text-sm" role="status">Loading the map, actions, and Bag…</p></Panel>) : <>
      {page !== 'encounter' && state.activeEvent && <Panel title="Your encounter is saved"><p className="text-sm">Finish or leave this encounter before starting another search. Party edits apply to your next search.</p><button type="button" onClick={() => { setResultOnly(false); setPage('encounter'); }} className="ui-button-primary ui-focus mt-2 min-h-11 w-full px-3 font-label text-[10px] uppercase">Resume encounter</button></Panel>}
      {page === 'map' && <>
        <section className="ui-window m-2 p-1.5" aria-label="World map"><WorldMap places={state.places} trainerAt={state.trainerAt} selected={selected} view={view} onView={onView} onSelect={(id) => { if (id === 'home' || id === 'r1') setSelected(id); }} /><p className="mt-2 text-center text-xs text-ink-dim">Drag to look around · tap a place</p></section>
        {selected === 'home' ? <TownSummary onEnter={() => openPlace('home', 'map')} />
          : <Panel title={placeTitle(route)}><p className="text-sm text-ink-dim">{route.blurb}</p><button type="button" onClick={() => openPlace('r1', 'map')} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">Visit {route.name}</button></Panel>}
      </>}
      {page === 'list' && <Panel title="Places"><ul className="flex flex-col gap-2">{[home, route].map((place) => <li key={place.id}><button type="button" onClick={() => openPlace(place.id as 'home' | 'r1', 'list')} className="ui-focus flex min-h-14 w-full items-center gap-3 rounded-[3px] bg-slot p-3 text-left"><span className="min-w-0 flex-1"><span className="block text-base">{placeTitle(place)}</span><span className="text-sm text-ink-dim">{place.id === 'home' ? 'Home town' : 'Wild Pokémon, friendly trainers, and landmarks'}</span></span>{place.id === 'home' && <TownAvatar className="h-10 w-10" />}</button></li>)}</ul></Panel>}
      {page === 'home' && <TownView spot={spot} onSpot={setSpot} onOpen={(screen) => onVisit(screen, spot)} onWalk={walkTo} />}
      {page === 'r1' && <>
        <div className="ui-window relative m-2 h-36 overflow-hidden" aria-hidden="true"><Backdrop src={backdropUrl(route)} /></div>
        <Panel title="Route 1 · Meadow"><p className="text-sm leading-relaxed">{route.blurb}</p><p className="mt-2 text-sm text-ink-dim">Find a wild Pokémon, meet someone, or explore. Each search finds something. Win battles to grow your party.</p></Panel>
        {!state.activated || state.legacy.pending ? <Panel title="Start your meadow journey"><p className="text-sm">Begin with {ROUTE_RULES.initialActions} actions and {ROUTE_RULES.starterBalls} Poké Balls in your Bag.</p>{state.legacy.pending && <p className="mt-2 text-sm text-ink-dim">Your previous trip will finish once, saving rewards earned before the change.</p>}<button type="button" disabled={locked} onClick={() => void submit({ operation: 'activate', input: { requestId: newRouteRequestId() } })} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">{busy ? 'Getting ready…' : 'Begin exploring'}</button></Panel>
          : <Panel title="Route actions"><AllowanceView state={state} onRefresh={() => void refresh()} /></Panel>}
        {(state.legacy.notice || state.legacy.result) && <Panel title="Your previous journey">
          {state.legacy.notice && <p className="text-sm">{state.legacy.notice}</p>}
          {state.legacy.result && <>
            <p className="mt-2 text-sm">{state.legacy.result.wins} {state.legacy.result.wins === 1 ? 'battle won' : 'battles won'} · {formatDuration(state.legacy.result.elapsedMs)}. These rewards and discoveries are already saved.</p>
            {state.legacy.result.members.map((member) => <div key={member.id} className="mt-2 text-sm"><p>{speciesName(member.after.dexId)}: +{member.expGained} EXP saved.</p><ExpBar level={member.after.level} exp={member.after.exp} />{growthLines(member, speciesName(member.after.dexId)).map((line) => <p key={line} className="text-accent">{line}</p>)}</div>)}
            {state.legacy.result.newSeen.length > 0 && <p className="mt-2 text-sm">First seen: {state.legacy.result.newSeen.map(speciesName).join(', ')}.</p>}
            {state.legacy.result.newLandmarks.length > 0 && <p className="mt-2 text-sm">Landmarks found: {state.legacy.result.newLandmarks.map((id) => routeById(state.legacy.result!.locationId)?.landmarks.find((landmark) => landmark.id === id)?.name ?? id).join(', ')}.</p>}
            <button type="button" disabled={locked} onClick={() => void dismissLegacy(state.legacy.result!.id)} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Dismiss previous journey</button>
          </>}
        </Panel>}
        <Panel title="Your party" aside={<button type="button" onClick={onEditParty} className="ui-button ui-focus min-h-11 px-2 font-label text-[9px] uppercase">Edit party</button>}>
          {party.length === 0 ? <p className="text-sm">Choose at least one Pokémon in your party before searching.</p> : <ol className="flex flex-wrap gap-2">{party.map((mon) => <li key={mon.id} className="flex w-14 flex-col items-center rounded-[3px] bg-slot px-1 py-2"><PixelSprite src={ownedMonToCreature(mon)?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt="" /><span className="w-full truncate text-center text-xs">{monName(mon)}</span><ExpBar level={mon.level} exp={mon.exp} /></li>)}</ol>}
        </Panel>
        <Panel title="Capture supplies" aside={<button type="button" onClick={() => setBagOpen(true)} className="ui-button ui-focus min-h-11 px-3 font-label text-[9px] uppercase">Open Bag</button>}><p className="text-sm">Poké Balls: {itemQuantity(state.inventory, 'poke')} · Great Balls: {itemQuantity(state.inventory, 'great')}</p><p className="mt-2 text-sm text-ink-dim">Catching uses one ball. Battle first for a better chance, or try your luck right away.</p>{balls === 0 && <p className="mt-2 text-sm text-accent">No balls left. {state.activeEvent ? 'Finish or leave your encounter, then ' : ''}Explore guarantees {ROUTE_RULES.pokeBundleQuantity} Poké Balls for 1 action.</p>}</Panel>
        <Panel title="What will you find?"><div className="flex flex-col gap-3">{([
          ['wild', 'Find wild Pokémon', 'Find one wild Pokémon. Choose to catch, battle, or leave.'],
          ['npc', 'Find NPC', 'Meet a friendly trainer for a battle or a researcher with a quest.'],
          ['explore', 'Explore', balls === 0 ? `Find ${ROUTE_RULES.pokeBundleQuantity} Poké Balls, guaranteed while your Bag has no capture balls. You may also discover a landmark.` : 'Find a wild Pokémon, an NPC, or items. You may also discover a landmark.'],
        ] as const).map(([kind, label, hint]) => <div key={kind}><p className="mb-1 text-sm text-ink-dim">{hint}</p><button type="button" disabled={locked || !state.activated || state.legacy.pending || state.activeEvent !== null || party.length === 0 || state.allowance.available === 0} onClick={() => search(kind)} className="ui-button-primary ui-focus min-h-12 w-full px-2 font-label text-[10px] uppercase">{label} · 1 action</button></div>)}</div></Panel>
        {state.result && <Panel title="Latest find"><p className="text-sm">Your latest encounter and saved rewards are ready to view.</p><button type="button" onClick={() => { setResultOnly(true); setPage('encounter'); }} className="ui-button ui-focus mt-2 min-h-11 w-full px-3 font-label text-[10px] uppercase">View result</button></Panel>}
        <Panel title="Meadow survey"><p className="text-sm">{state.quest.status === 'not-accepted' ? 'Meet the Meadow Researcher to start a survey of the three landmarks. Earlier discoveries will count.' : state.quest.status === 'claimed' ? 'Survey complete. Your Great Ball reward is saved in your Bag.' : `Landmarks recorded: ${state.quest.landmarks.length} / ${state.quest.required.length}. Discover all three to receive ${ROUTE_RULES.questGreatBalls} Great Balls.`}</p>{state.quest.status === 'ready' && <button type="button" disabled={locked} onClick={() => void submit({ operation: 'quest-claim', input: { requestId: newRouteRequestId(), questId: 'meadow-survey' } })} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Claim {ROUTE_RULES.questGreatBalls} Great Balls · free</button>}</Panel>
        <Panel title="Landmarks"><ul className="flex flex-col gap-3">{MEADOW_LANDMARKS.map((landmark) => {
          const found = (state.places.find((place) => place.id === 'r1')?.progress ?? EMPTY_PROGRESS).landmarks.includes(landmark.id);
          return <li key={landmark.id} className="text-sm"><span className={found ? 'text-accent' : 'text-ink-dim'}>{found ? `◆ ${landmark.name}` : '◇ Undiscovered landmark'}</span><p className="text-ink-dim">{found ? landmark.blurb : 'Explore the meadow to discover this place.'}</p></li>;
        })}</ul></Panel>
      </>}
      {page === 'encounter' && (replay?.battle && replay.foe ? <BattleReplay key={`${replay.id}:${replay.revision}`} events={replay.battle.events} party={replay.party} foe={replay.foe} trainerName={replay.kind === 'trainer' ? replay.npc?.name : undefined} backdrop={backdropUrl(route)} onDone={() => setReplay(null)} /> : event ? <>
        {event.phase !== 'resolved' && <Panel title={event.kind === 'wild' ? event.phase === 'catch' ? 'One catch attempt remains' : 'A wild Pokémon appeared' : event.npc?.name ?? 'An encounter'}>
          {event.npc && <div className="mb-3 flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}sprites/trainers/${event.npc.spriteKey}.png`} alt="" className="h-24 w-24 shrink-0 object-contain [image-rendering:pixelated]" /><p className="text-sm leading-relaxed">{event.npc.text}</p></div>}
          {event.foe && <div className="flex items-center gap-3 rounded-[3px] bg-slot p-3"><PixelSprite src={event.foe.shiny ? shinyPortraitUrl(event.foe.dexId) : event.foe.altColor ? altColorPortraitUrl(event.foe.dexId) : portraitUrl(event.foe.dexId)} fallback={POKEBALL} size={80} alt="" /><div className="min-w-0"><p className="text-lg">{speciesName(event.foe.dexId)}</p><p className="text-sm text-ink-dim">{[event.foe.rare ? 'Rare' : '', event.foe.shiny ? 'Shiny' : event.foe.altColor ? 'Alternate color' : '', event.kind === 'trainer' ? 'Trainer’s Pokémon' : 'Wild Pokémon'].filter(Boolean).join(' · ')}</p></div></div>}
          <p className="mt-3 text-sm text-ink-dim">Your party for this encounter: {event.party.map(monName).join(', ')}. These choices use no extra actions.</p>
          {event.kind === 'wild' && <p className="mt-2 text-sm">One throw per encounter. A throw uses one ball and ends the encounter, whether it succeeds or fails.</p>}
          {event.phase === 'researcher' && <p className="mt-3 text-sm">{state.quest.status === 'not-accepted' ? 'Accept Meadow survey to record your landmark discoveries. You can claim the reward from the route when it is ready.' : state.quest.status === 'ready' ? 'You have found every landmark. Claim your reward from the route panel.' : state.quest.status === 'claimed' ? 'Thank you for completing the survey.' : `Survey progress: ${state.quest.landmarks.length} / ${state.quest.required.length} landmarks.`}</p>}
          {event.choices.includes('catch') && <div className="mt-3">
            {balls === 0 && <p className="mb-2 text-sm text-accent">Your Bag has no capture balls. Battle or leave, then Explore for guaranteed supplies.</p>}
            {state.ownedCount >= 600 && <p className="mb-2 text-sm text-accent">Your Box is full (600 Pokémon). You can still battle or leave.</p>}
            <button type="button" disabled={locked || balls === 0 || state.ownedCount >= 600} onClick={() => setBagOpen(true)} className="ui-button-primary ui-focus min-h-12 w-full px-3 font-label text-[11px] uppercase">Choose a ball</button>
            {selectedBall?.eventId === event.id && event.catchChances && <div className="mt-3 rounded-[3px] border-2 border-window-frame bg-slot p-3" aria-label="Confirm catch">
              <div className="flex items-center gap-2"><img src={ballUrl(selectedBall.id)} width={32} height={32} alt="" className="[image-rendering:pixelated]" /><p className="text-sm">{itemById(selectedBall.id)?.name} · {itemQuantity(state.inventory, selectedBall.id)} owned</p></div>
              <p className="mt-2 text-base text-accent">{Math.round(event.catchChances[selectedBall.id] * 100)}% catch chance</p>
              {itemQuantity(state.inventory, selectedBall.id) === 0 && <p className="mt-2 text-sm">That ball is no longer available. Choose another ball or leave.</p>}
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={locked || itemQuantity(state.inventory, selectedBall.id) === 0 || state.ownedCount >= 600} onClick={() => choose('catch', selectedBall.id)} className="ui-button-primary ui-focus min-h-11 flex-1 px-2 font-label text-[10px] uppercase">Throw 1 ball</button><button type="button" disabled={busy} onClick={() => setSelectedBall(null)} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">Cancel</button></div>
            </div>}
          </div>}
          <div className="mt-3 flex flex-col gap-2">
            {event.choices.includes('battle') && <button type="button" disabled={locked} onClick={() => choose('battle')} className="ui-button-primary ui-focus min-h-12 px-3 font-label text-[11px] uppercase">Battle · earn EXP on a win</button>}
            {event.choices.includes('accept') && <button type="button" disabled={locked} onClick={() => choose('accept')} className="ui-button-primary ui-focus min-h-12 px-3 font-label text-[11px] uppercase">Accept Meadow survey</button>}
            {event.choices.includes('decline') && <button type="button" disabled={locked} onClick={() => choose('decline')} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">Maybe another time</button>}
            {event.choices.includes('talk') && <button type="button" disabled={locked} onClick={() => choose('talk')} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">Finish conversation</button>}
            {event.choices.includes('leave') && <button type="button" disabled={locked} onClick={() => choose('leave')} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">Leave encounter</button>}
          </div>
        </Panel>}
        {(event.phase === 'resolved' || event.battle) && <RouteResultView event={event} box={box} busy={locked} onDone={() => void dismiss(event.id)} onReplay={() => setReplay(event)} />}
        {event.phase !== 'resolved' && event.newLandmarks.length > 0 && <Panel title="Discovered along the way"><p className="text-sm">{event.newLandmarks.map((id) => MEADOW_LANDMARKS.find((landmark) => landmark.id === id)?.name ?? id).join(', ')} — already recorded in your survey.</p></Panel>}
      </> : <Panel title="Ready to explore"><p className="text-sm">This encounter is finished and your progress is saved.</p><button type="button" onClick={() => setPage('r1')} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Return to Sunny Meadow</button></Panel>)}
    </>}
  </div>;
}
