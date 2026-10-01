import { useEffect, useRef, useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { currentHp, isFainted, ownedMaxHp } from '../../game/health';
import { ballCount, formatMoney, itemQuantity } from '../../game/items';
import { miniUrl } from '../../game/pokemon';
import type { RouteState, SearchKind } from '../../game/route-actions';
import { guaranteesSupplies, MEADOW_LANDMARKS, ROUTE_RULES } from '../../game/route-rules';
import { routeById } from '../../game/world';
import { BagButton } from '../ui/BagButton';
import { ExpBar } from '../ui/ExpBar';
import { HpBar } from '../ui/HpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { MeadowScene } from './MeadowScene';
import { formatDuration, growthLines, monName, POKEBALL, speciesName } from './scene';

const SPOTS: readonly { kind: SearchKind; name: string; label: string; description: string; action: string; position: string }[] = [
  { kind: 'wild', name: 'Tall grass', label: 'Wild Pokémon', description: 'Something is rustling in the grass. Find a wild Pokémon to battle or catch.', action: 'Search the grass', position: 'left-[5%] top-[57%] h-[28%] w-[40%]' },
  { kind: 'npc', name: 'Meadow path', label: 'Meet someone', description: 'Meet a friendly trainer for a battle, or the Meadow Researcher with a survey.', action: 'Find someone', position: 'left-[62%] top-[33%] h-[30%] w-[34%]' },
  { kind: 'explore', name: 'Meadow trail', label: 'Explore', description: 'Find a wild Pokémon, an NPC, items, Honey and mushrooms, or a coin pouch. You may also discover a landmark.', action: 'Explore the meadow', position: 'left-[9%] top-[14%] h-[24%] w-[40%]' },
];

/** Isolated clock avoids re-rendering the scene every second. Never credits actions locally. */
function ActionClock({ state, onRefresh, busy }: { state: RouteState; onRefresh: () => void; busy: boolean }) {
  const [clock, setClock] = useState(() => ({ serverNow: state.serverNow, elapsed: 0 }));
  useEffect(() => {
    const at = performance.now();
    const timer = window.setInterval(() => setClock({ serverNow: state.serverNow, elapsed: performance.now() - at }), 1000);
    return () => window.clearInterval(timer);
  }, [state.serverNow]);
  const elapsed = clock.serverNow === state.serverNow ? clock.elapsed : 0;
  const remaining = state.allowance.nextRefillAt === null ? null : Math.max(0, state.allowance.nextRefillAt - state.serverNow - elapsed);
  return <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-sm">
    <p><span className="text-xl text-accent">{state.allowance.available}</span><span className="text-ink-dim"> / {state.allowance.capacity}</span> actions</p>
    {remaining === 0 ? <button type="button" disabled={busy} onClick={onRefresh} className="ui-button ui-focus min-h-11 px-3 text-sm">Check refill</button>
      : <p className="text-xs text-ink-dim">{remaining === null ? 'Fully rested' : <>+1 in <span role="timer">{formatDuration(remaining)}</span></>}</p>}
  </div>;
}

export interface SunnyMeadowProps {
  state: RouteState;
  party: OwnedMon[];
  locked: boolean;
  busy: boolean;
  showSurvey?: boolean;
  onSearch: (kind: SearchKind) => void;
  onActivate: () => void;
  onResume: () => void;
  onResult: () => void;
  onBag: () => void;
  onEditParty: () => void;
  /** The Pokémon Center page; away from Hearth Town it offers the paid trip there first. */
  onCenter: () => void;
  onRefresh: () => void;
  onClaim: () => void;
  onDismissLegacy: (id: string) => void;
}

export function SunnyMeadow({ state, party, locked, busy, showSurvey, onSearch, onActivate, onResume, onResult, onBag, onEditParty, onCenter, onRefresh, onClaim, onDismissLegacy }: SunnyMeadowProps) {
  const [selected, setSelected] = useState<SearchKind | null>(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(() => showSurvey || state.quest.status === 'ready');
  const surveyRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!showSurvey) return;
    surveyRef.current?.scrollIntoView({ block: 'start' });
    surveyRef.current?.focus({ preventScroll: true });
  }, [showSurvey]);
  const spot = SPOTS.find((entry) => entry.kind === selected);
  const balls = ballCount(state.inventory);
  const guaranteed = guaranteesSupplies(state.inventory);
  const starting = !state.activated || state.legacy.pending;
  const active = state.activeEvent;
  const noActions = state.allowance.available === 0;
  const noParty = party.length === 0;
  // The server refuses a search when no party member can battle; the Center or the Box is the way back.
  const partyDown = !noParty && party.every(isFainted);
  const canSearch = !locked && !starting && !active && !noActions && !noParty && !partyDown;
  const discovered = state.places.find((place) => place.id === 'r1')?.progress.landmarks ?? [];

  return <>
    <section className="ui-window m-2" aria-label="Explore Sunny Meadow" aria-busy={busy}>
      <div className="flex min-h-9 items-center justify-between gap-2 border-b-2 border-window-frame px-3 font-label text-[9px] uppercase"><span className="text-info">Your surroundings</span><span className="text-ink-dim">Route 01</span></div>
      <MeadowScene label="Choose a place in Sunny Meadow">
        <p className="pointer-events-none absolute left-3 top-3 z-10 rounded-[3px] border border-window-rim bg-window px-2 py-1 font-label text-[9px] uppercase text-ink shadow-[2px_2px_0_var(--color-edge)]">
          {busy ? 'Looking around…' : partyDown ? 'Your party needs care' : '◆ You are here'}
        </p>
        {!active && SPOTS.map((entry) => <button key={entry.kind} type="button" disabled={locked} onClick={() => setSelected(entry.kind)}
          aria-pressed={selected === entry.kind} aria-controls="meadow-action" aria-label={`${entry.name}: ${entry.label}. Search costs 1 action.`}
          className={`ui-focus group absolute flex min-h-14 min-w-20 flex-col items-center justify-center rounded-[3px] border-2 p-1 ${entry.position} ${selected === entry.kind ? 'border-accent bg-accent/15' : 'border-transparent hover:border-accent hover:bg-accent/10'}`}>
          {entry.kind === 'npc' && <img src={`${import.meta.env.BASE_URL}sprites/trainers/random-frlg-bird-keeper.png`} width={64} height={64} alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" />}
          <span className={`max-w-full rounded-[3px] border px-1 py-1 text-center min-[360px]:px-2 shadow-[3px_3px_0_var(--color-edge)] ${selected === entry.kind ? 'border-edge bg-accent text-edge' : 'border-window-rim bg-window text-ink'}`}>
            <span className="block whitespace-nowrap text-xs min-[360px]:text-sm">{entry.name}</span><span className={`block text-xs ${selected === entry.kind ? 'text-edge' : 'text-accent'}`}>{entry.label}</span>
          </span>
        </button>)}
        {active && <button type="button" onClick={onResume} className="ui-focus absolute left-1/2 top-1/2 flex min-h-36 w-48 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-[3px] border-2 border-window-rim bg-window p-3 shadow-[4px_4px_0_var(--color-edge)]">
          {active.foe ? <PixelSprite src={miniUrl(active.foe.dexId)} size={64} sheet alt="" /> : <img src={`${import.meta.env.BASE_URL}sprites/trainers/${active.npc?.spriteKey ?? 'random-scientist-f'}.png`} width={64} height={64} alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" />}
          <span className="text-lg">{active.npc?.name ?? (active.foe ? speciesName(active.foe.dexId) : 'Your encounter')}</span><span className="mt-2 text-sm text-accent">Resume encounter ›</span>
        </button>}
      </MeadowScene>
      <div id="meadow-action" aria-live="polite" className="min-h-40 border-t-2 border-window-frame p-3">
        {starting ? <>
          <h2 className="text-xl">A little adventure awaits.</h2><p className="mt-1 text-sm text-ink-dim">Begin with {ROUTE_RULES.initialActions} actions and {ROUTE_RULES.starterBalls} Poké Balls. Tap the meadow to decide where to go.</p>
          {state.legacy.pending && <p className="mt-2 text-sm text-ink-dim">Your previous journey’s rewards will be saved before you begin.</p>}
          <button type="button" disabled={locked} onClick={onActivate} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Getting ready…' : 'Begin exploring'}</button>
        </> : active ? <>
          <h2 className="text-xl">Pick up where you left off.</h2><p className="mt-1 text-sm text-ink-dim">Finish or leave your saved encounter before searching again. Continuing costs no extra actions.</p>
          <button type="button" onClick={onResume} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">Resume encounter</button>
        </> : noParty ? <>
          <h2 className="text-xl">Bring a Pokémon along.</h2><p className="mt-1 text-sm text-ink-dim">Choose at least one party member before searching the meadow.</p>
          <button type="button" onClick={onEditParty} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">Choose your party</button>
        </> : partyDown ? <>
          <h2 className="text-xl">Your party needs care</h2><p className="mt-1 text-sm text-ink-dim">Every Pokémon in your party has fainted. Visit the Pokémon Center in Hearth Town, or bring healthy Pokémon from your Box.</p>
          <button type="button" onClick={onCenter} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">Travel to Hearth Town</button>
        </> : noActions ? <>
          <h2 className="text-xl">Time for a breather.</h2><p className="mt-1 text-sm text-ink-dim">Recover 1 action every {Math.round(state.allowance.refillEveryMs / 60000)} minutes. Your Bag, party, and survey are still available.</p>
          <button type="button" disabled={locked} onClick={onRefresh} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Check for an action</button>
        </> : spot ? <>
          <div className="flex items-center justify-between gap-2"><h2 className="text-xl">{spot.name}</h2><span className="shrink-0 font-label text-[9px] uppercase text-accent">1 action</span></div>
          <p className="mt-1 text-sm text-ink-dim">{spot.kind === 'explore' && guaranteed ? `You have no capture balls. Exploring guarantees ${ROUTE_RULES.pokeBundleQuantity} Poké Balls, and may reveal a landmark.` : spot.description}</p>
          <button type="button" disabled={!canSearch} onClick={() => onSearch(spot.kind)} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Searching…' : `${spot.action} · 1 action`}</button>
        </> : <>
          <p className="font-label text-[10px] uppercase text-info">Your next adventure</p><h2 className="mt-1 text-xl">Where will you go?</h2><p className="mt-2 text-sm text-ink-dim">Tap the tall grass, the path, or the trail above. Looking around is free; each search costs 1 action.</p>
          {balls === 0 && <p className="mt-2 text-sm text-accent">{guaranteed ? 'No balls left? Choose Explore for guaranteed supplies.' : 'No balls left. Buy Poké Balls at the Village market in Hearth Town.'}</p>}
        </>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-window-frame bg-slot p-2">
        <button type="button" onClick={() => setPartyOpen(!partyOpen)} aria-expanded={partyOpen} aria-controls="meadow-party" className="ui-focus flex min-h-11 items-center gap-1 rounded-[3px] px-1 text-sm">
          {party[0] && <PixelSprite src={ownedMonToCreature(party[0])?.portrait ?? POKEBALL} size={40} alt="" />} Party · {party.length} <span className="text-accent">{partyOpen ? '▴' : '▾'}</span>
        </button>
        <BagButton compact opensDialog onClick={onBag} />
        <button type="button" onClick={() => setSurveyOpen(!surveyOpen)} aria-expanded={surveyOpen} aria-controls="meadow-survey" className="ui-focus min-h-11 rounded-[3px] px-1 text-sm">Survey <span className="text-accent">{state.quest.status === 'ready' ? 'Reward!' : state.quest.status === 'claimed' ? '✓' : `${discovered.length}/3`}</span></button>
      </div>
    </section>

    {state.activated && <details className="ui-window m-2 mt-4 p-3"><summary className="ui-focus min-h-8 rounded-[3px] font-label text-[10px] uppercase text-info">Trail energy · {state.allowance.available} / {state.allowance.capacity}</summary><ActionClock state={state} onRefresh={onRefresh} busy={locked} /><p className="mt-2 text-sm text-ink-dim">Each search uses one action. Looking around is free.</p></details>}

    {partyOpen && <section id="meadow-party" className="ui-window m-2 mt-4 p-3" aria-label="Your party">
      <div className="flex items-center justify-between gap-2"><h2 className="font-label text-[11px] uppercase text-info">Your party</h2><button type="button" onClick={onEditParty} className="ui-button ui-focus min-h-11 px-3 font-label text-[9px] uppercase">Edit party</button></div>
      {noParty ? <p className="mt-2 text-sm text-ink-dim">Choose a Pokémon to start exploring.</p> : <ol className="mt-3 grid grid-cols-3 gap-2">{party.map((mon) => <li key={mon.id} className="flex min-w-0 flex-col items-center rounded-[3px] bg-slot p-2">
        <PixelSprite src={ownedMonToCreature(mon)?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt="" /><span className="mt-1 w-full truncate text-center text-sm">{monName(mon)}</span><div className="mt-2 w-full"><ExpBar level={mon.level} exp={mon.exp} /></div><div className="mt-1 w-full"><HpBar mon={mon} /></div><span className="self-end font-label text-[9px] text-ink-dim">{currentHp(mon)}/{ownedMaxHp(mon)}</span>
      </li>)}</ol>}
      {active && <p className="mt-3 text-sm text-ink-dim">Your encounter keeps its starting party. Edits apply to your next search.</p>}
    </section>}

    {surveyOpen && <section ref={surveyRef} tabIndex={-1} id="meadow-survey" className="ui-window ui-focus m-2 mt-4 scroll-mt-4 p-3" aria-label="Meadow survey">
      <h2 className="font-label text-[11px] uppercase text-info">Meadow survey</h2>
      <p className="mt-2 text-sm text-ink-dim">{state.quest.status === 'not-accepted' ? 'Meet the Meadow Researcher on the path to start a survey. Earlier discoveries count.' : state.quest.status === 'claimed' ? 'Survey complete. Your reward is in your Bag.' : `Discover all three to receive ${ROUTE_RULES.questGreatBalls} Great Balls and ${formatMoney(ROUTE_RULES.questMoney)}.`}</p>
      <ul className="mt-3 space-y-2">{MEADOW_LANDMARKS.map((landmark) => <li key={landmark.id} className="rounded-[3px] bg-slot px-3 py-2 text-sm"><span className={discovered.includes(landmark.id) ? 'text-accent' : 'text-ink-dim'}>{discovered.includes(landmark.id) ? `◆ ${landmark.name}` : '◇ Undiscovered landmark'}</span>{discovered.includes(landmark.id) && <p className="mt-1 text-ink-dim">{landmark.blurb}</p>}</li>)}</ul>
      {state.quest.status === 'ready' && <button type="button" disabled={locked} onClick={onClaim} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">Claim reward · free</button>}
    </section>}

    {state.result && !active && <div className="mx-2 mt-4"><button type="button" onClick={onResult} className="ui-button ui-focus min-h-11 w-full px-3 text-sm">View your last encounter ›</button></div>}
    <details className="ui-window m-2 mt-4 p-3"><summary className="ui-focus min-h-8 rounded-[3px] font-label text-[10px] uppercase text-info">Field guide</summary>
      <p className="mt-2 text-sm text-ink-dim">Each search finds something. Battle to grow your party. Winning a wild battle improves your catch chance. You get one throw per encounter.</p>
      <p className="mt-2 text-sm text-ink-dim">Poké Balls: {itemQuantity(state.inventory, 'poke')} · Great Balls: {itemQuantity(state.inventory, 'great')}</p>
      <p className="mt-1 text-sm text-ink-dim">Money: {formatMoney(state.inventory.money)}</p>

    </details>
    {(state.legacy.notice || state.legacy.result) && <details className="ui-window m-2 mt-4 p-3"><summary className="ui-focus min-h-8 rounded-[3px] font-label text-[10px] uppercase text-info">Your previous journey</summary>
      {state.legacy.notice && <p className="mt-2 text-sm">{state.legacy.notice}</p>}
      {state.legacy.result && <>
        <p className="mt-2 text-sm">{state.legacy.result.wins} battles won · {formatDuration(state.legacy.result.elapsedMs)}. Rewards and discoveries are saved.</p>
        {state.legacy.result.members.map((member) => <div key={member.id} className="mt-2 text-sm"><p>{speciesName(member.after.dexId)}: +{member.expGained} EXP</p><ExpBar level={member.after.level} exp={member.after.exp} />{growthLines(member, speciesName(member.after.dexId)).map((line) => <p key={line} className="text-accent">{line}</p>)}</div>)}
        {state.legacy.result.newSeen.length > 0 && <p className="mt-2 text-sm">First seen: {state.legacy.result.newSeen.map(speciesName).join(', ')}.</p>}
        {state.legacy.result.newLandmarks.length > 0 && <p className="mt-2 text-sm">Landmarks: {state.legacy.result.newLandmarks.map((id) => routeById(state.legacy.result!.locationId)?.landmarks.find((landmark) => landmark.id === id)?.name ?? id).join(', ')}.</p>}
        <button type="button" disabled={locked} onClick={() => onDismissLegacy(state.legacy.result!.id)} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 text-sm">Dismiss previous journey</button>
      </>}
    </details>}
  </>;
}
