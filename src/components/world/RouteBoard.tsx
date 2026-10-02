import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { isFainted } from '../../game/health';
import { miniUrl } from '../../game/pokemon';
import type { QuestId, RouteQuestView, RouteState, SearchKind } from '../../game/route-actions';
import { ROUTE_RULES } from '../../game/route-rules';
import { routeById } from '../../game/world';
import { ExpBar } from '../ui/ExpBar';
import { HpBar } from '../ui/HpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { useServerClock } from '../ui/useServerClock';
import { MeadowScene } from './MeadowScene';
import { panelStyle } from './puzzle-art';
import { BOARD_CARDS, boardCta, cardDescription, pickQuest, QUEST_NAMES, questLine, type BoardAction } from './route-board';
import { waitText } from './route-copy';
import { formatDuration, growthLines, monName, POKEBALL, speciesName } from './scene';

const ASSET = import.meta.env.BASE_URL;

export interface RouteBoardProps {
  state: RouteState;
  party: OwnedMon[];
  locked: boolean;
  busy: boolean;
  /** The selected card. RouteScreen keeps it, so it survives encounters for the whole world visit. */
  card: SearchKind;
  /** Selects a card. Choosing is free; only the button spends. */
  onCard: (card: SearchKind) => void;
  /** The quest picked in the Quest card's list; null follows the first quest with a step. */
  picked: QuestId | null;
  /** Picks a quest in the Quest card's list. */
  onPick: (id: QuestId) => void;
  onSearch: (kind: SearchKind, questId?: QuestId) => void;
  onClaim: () => void;
  onActivate: () => void;
  onResume: () => void;
  onResult: () => void;
  onEditParty: () => void;
  /** The Pokémon Center page; away from Hearth Town it offers the paid trip there first. */
  onCenter: () => void;
  onRefresh: () => void;
  onDismissLegacy: (id: string) => void;
}

/** Sunny Meadow as a board: the scene, six cards, and one button that states its cost. Choosing a card is free. */
export function RouteBoard({ state, party, locked, busy, card, onCard, picked, onPick, onSearch, onClaim, onActivate, onResume, onResult, onEditParty, onCenter, onRefresh, onDismissLegacy }: RouteBoardProps) {
  const quest = pickQuest(state.quests, picked);
  const starting = !state.activated || state.legacy.pending;
  const active = state.activeEvent;
  const claimable = state.quests.some((q) => q.next?.step === 'claim');
  const run = (action: BoardAction) => {
    switch (action.type) {
      case 'activate': return onActivate();
      case 'resume': return onResume();
      case 'party': return onEditParty();
      case 'center': return onCenter();
      case 'refresh': return onRefresh();
      case 'claim': return onClaim();
      case 'search': return onSearch(action.kind, action.questId);
      case 'none': return;
    }
  };

  return <>
    <section className="ui-window m-2" aria-label="Sunny Meadow" aria-busy={busy}>
      {state.activated && <StaminaChips state={state} />}
      <MeadowScene wide label="Sunny Meadow">
        {busy && <p className="pointer-events-none absolute left-3 top-3 border border-window-rim bg-window px-2 py-1 font-label text-[9px] uppercase text-ink shadow-[2px_2px_0_var(--color-edge)]">Looking around…</p>}
        {active && <button type="button" onClick={onResume} className="ui-focus absolute left-1/2 top-1/2 flex min-h-24 w-44 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-[3px] border-2 border-window-rim bg-window p-2 shadow-[4px_4px_0_var(--color-edge)]">
          {active.foe ? <PixelSprite src={miniUrl(active.foe.dexId)} size={64} sheet alt="" />
            : active.npc ? <img src={`${ASSET}sprites/trainers/${active.npc.spriteKey}.png`} width={64} height={64} alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" />
              : <PanelGlyph />}
          <span className="text-base">{active.npc?.name ?? (active.foe ? speciesName(active.foe.dexId) : 'Stone panels')}</span>
          <span className="text-sm text-accent">Resume encounter ›</span>
        </button>}
      </MeadowScene>
      <div role="group" aria-label="Actions" className="grid grid-cols-3 gap-2 border-t-2 border-window-frame p-2">
        {BOARD_CARDS.map((entry) => {
          const selected = card === entry.kind;
          return <button key={entry.kind} type="button" aria-pressed={selected} disabled={starting || Boolean(active)} onClick={() => onCard(entry.kind)}
            className={`ui-focus relative flex min-h-24 flex-col items-center justify-between gap-1 rounded-[3px] border-2 bg-slot px-1 py-2 disabled:opacity-75 ${selected ? 'border-accent' : 'border-window-frame enabled:hover:border-window-rim'}`}>
            <span className="grid h-16 place-items-center"><CardArt kind={entry.kind} /></span>
            <span className={`text-center font-label text-[9px] uppercase leading-tight ${selected ? 'text-accent' : 'text-ink'}`}>{entry.label}</span>
            {entry.kind === 'quest' && claimable && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-[3px] border border-edge bg-accent font-label text-[10px] text-edge"><span aria-hidden="true">!</span><span className="sr-only">Reward ready</span></span>}
          </button>;
        })}
      </div>
      <div aria-live="polite" className="border-t-2 border-window-frame p-3">
        {starting ? <p className="text-sm text-ink-dim">Begin with {ROUTE_RULES.initialActions} actions and {ROUTE_RULES.starterBalls} Poké Balls.{state.legacy.pending ? ' Your previous journey’s rewards will be saved first.' : ''}</p>
          : card === 'quest' && !active ? <QuestPicker quests={state.quests} picked={quest?.id ?? null} disabled={locked} onPick={onPick} />
            : <p className="text-sm text-ink-dim">{cardDescription(card, state.inventory)}</p>}
        <BoardButton state={state} card={card} quest={quest} party={party} busy={busy} locked={locked} onRun={run} />
      </div>
    </section>
    <PartyStrip party={party} active={Boolean(active)} onEditParty={onEditParty} />
    {state.result && !active && <div className="mx-2 mt-4"><button type="button" onClick={onResult} className="ui-button ui-focus min-h-11 w-full px-3 text-sm">View your last encounter ›</button></div>}
    <PreviousJourney state={state} locked={locked} onDismiss={onDismissLegacy} />
  </>;
}

/** The concept's Travel and Actions chips, with the wait for the next action below its cap. */
function StaminaChips({ state }: { state: RouteState }) {
  const now = useServerClock(state.serverNow);
  const next = state.allowance.nextRefillAt;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-window-frame px-3 py-2">
    <span className="font-label text-[9px] uppercase text-info">Route 01</span>
    <span className="flex flex-wrap items-center justify-end gap-1 font-label text-[10px] uppercase">
      <span className={`border border-window-rim bg-slot px-2 py-1 ${state.travel.available < 0 ? 'text-danger' : 'text-ink'}`}>Travel {state.travel.available}/{state.travel.capacity}</span>
      <span className="border border-window-rim bg-slot px-2 py-1 text-ink">Actions {state.allowance.available}/{state.allowance.capacity}</span>
      {next !== null && <span className="text-ink-dim">+1 in {waitText(Math.max(0, next - now))}</span>}
    </span>
  </div>;
}

/** The button and its reason, on a clock of their own so the scene doesn't re-render every second. */
function BoardButton({ state, card, quest, party, busy, locked, onRun }: {
  state: RouteState; card: SearchKind; quest: RouteQuestView | null; party: OwnedMon[]; busy: boolean; locked: boolean; onRun: (action: BoardAction) => void;
}) {
  const now = useServerClock(state.serverNow);
  const cta = boardCta({ state, card, quest, partySize: party.length, partyDown: party.length > 0 && party.every(isFainted), busy, now });
  return <>
    {cta.reason && <p className="mt-2 text-sm text-accent">{cta.reason}</p>}
    <button type="button" disabled={!cta.enabled || (locked && cta.action.type !== 'resume')} onClick={() => onRun(cta.action)}
      className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">{cta.label}</button>
  </>;
}

/** Each card's picture, from existing sprites and Night icons. */
function CardArt({ kind }: { kind: SearchKind }) {
  switch (kind) {
    case 'wild': return <PixelSprite src={miniUrl(161)} size={64} sheet alt="" />;
    case 'trainer': return <img src={`${ASSET}sprites/trainers/random-youngster.png`} width={64} height={64} alt="" className="h-16 w-16 object-contain [image-rendering:pixelated]" />;
    case 'puzzle': return <PanelGlyph />;
    case 'quest': return <PixelSprite src={`${ASSET}sprites/ui/night/96/field-journal.png`} size={48} alt="" />;
    case 'explore': return <PixelSprite src={`${ASSET}sprites/ui/night/96/explore.png`} size={48} alt="" />;
    case 'forage': return <span className="flex items-end gap-1"><PixelSprite src={`${ASSET}sprites/items/honey.png`} size={30} alt="" /><PixelSprite src={`${ASSET}sprites/items/tiny-mushroom.png`} size={30} alt="" /></span>;
  }
}

/** A tiny panel board, gap last: the Puzzle card's picture. */
function PanelGlyph() {
  return <span aria-hidden="true" className="grid h-12 w-12 grid-cols-3 gap-px border-2 border-edge bg-edge">
    {[1, 2, 3, 4, 5, 6, 7, 8, 0].map((value) => <span key={value} className={value === 0 ? 'bg-slot' : 'bg-no-repeat'} style={value === 0 ? undefined : panelStyle('sunflowers', value, 3)} />)}
  </span>;
}

/** The Quest card's pick list: every quest with its next step. */
function QuestPicker({ quests, picked, disabled, onPick }: { quests: RouteQuestView[]; picked: QuestId | null; disabled: boolean; onPick: (id: QuestId) => void }) {
  return <fieldset disabled={disabled}>
    <legend className="font-label text-[9px] uppercase text-info">Your quests</legend>
    <ul className="mt-2 space-y-2">{quests.map((q) => <li key={q.id}>
      <label className={`flex min-h-11 items-center gap-2 rounded-[3px] border-2 bg-slot px-2 py-1 text-sm ${picked === q.id ? 'border-accent' : 'border-window-frame'} ${q.next ? '' : 'text-ink-dim'}`}>
        <input type="radio" name="board-quest" value={q.id} checked={picked === q.id} disabled={!q.next} onChange={() => onPick(q.id)} className="ui-focus h-4 w-4 shrink-0 accent-accent" />
        <span className="min-w-0 flex-1"><span className="block">{QUEST_NAMES[q.id]}</span><span className="block text-xs text-ink-dim">{questLine(q)}</span></span>
      </label>
    </li>)}</ul>
  </fieldset>;
}

/** The saved party at a glance, with HP. Editing opens the party screen. */
function PartyStrip({ party, active, onEditParty }: { party: OwnedMon[]; active: boolean; onEditParty: () => void }) {
  return <section className="ui-window m-2 mt-4 p-3" aria-label="Your party">
    <div className="flex items-center justify-between gap-2"><h2 className="font-label text-[11px] uppercase text-info">Your party</h2><button type="button" onClick={onEditParty} className="ui-button ui-focus min-h-11 px-3 font-label text-[9px] uppercase">Edit party</button></div>
    {party.length === 0 ? <p className="mt-2 text-sm text-ink-dim">Choose a Pokémon to start exploring.</p>
      : <ol className="mt-3 grid grid-cols-3 gap-2">{party.map((mon) => <li key={mon.id} className="flex min-w-0 flex-col items-center rounded-[3px] bg-slot p-2">
        <PixelSprite src={ownedMonToCreature(mon)?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt="" />
        <span className="mt-1 w-full truncate text-center text-sm">{monName(mon)}</span>
        <div className="mt-1 w-full"><HpBar mon={mon} /></div>
      </li>)}</ol>}
    {active && <p className="mt-3 text-sm text-ink-dim">Your encounter keeps its starting party. Edits apply to your next search.</p>}
  </section>;
}

/** A journey from the retired idle game, saved before the route update. */
function PreviousJourney({ state, locked, onDismiss }: { state: RouteState; locked: boolean; onDismiss: (id: string) => void }) {
  const result = state.legacy.result;
  if (!state.legacy.notice && !result) return null;
  return <details className="ui-window m-2 mt-4 p-3"><summary className="ui-focus min-h-8 rounded-[3px] font-label text-[10px] uppercase text-info">Your previous journey</summary>
    {state.legacy.notice && <p className="mt-2 text-sm">{state.legacy.notice}</p>}
    {result && <>
      <p className="mt-2 text-sm">{result.wins} battles won · {formatDuration(result.elapsedMs)}. Rewards and discoveries are saved.</p>
      {result.members.map((member) => <div key={member.id} className="mt-2 text-sm"><p>{speciesName(member.after.dexId)}: +{member.expGained} EXP</p><ExpBar level={member.after.level} exp={member.after.exp} />{growthLines(member, speciesName(member.after.dexId)).map((line) => <p key={line} className="text-accent">{line}</p>)}</div>)}
      {result.newSeen.length > 0 && <p className="mt-2 text-sm">First seen: {result.newSeen.map(speciesName).join(', ')}.</p>}
      {result.newLandmarks.length > 0 && <p className="mt-2 text-sm">Landmarks: {result.newLandmarks.map((id) => routeById(result.locationId)?.landmarks.find((landmark) => landmark.id === id)?.name ?? id).join(', ')}.</p>}
      <button type="button" disabled={locked} onClick={() => onDismiss(result.id)} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 text-sm">Dismiss previous journey</button>
    </>}
  </details>;
}
