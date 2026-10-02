import { useEffect, useRef } from 'react';
import type { OwnedMon } from '../../game/box';
import { ownedMonToCreature } from '../../game/box';
import { ballUrl } from '../../game/balls';
import { formatMoney, itemById } from '../../game/items';
import { asAltColor, asShiny, CREATURES_BY_ID, portraitUrl, spriteUrl } from '../../game/pokemon';
import type { RouteEvent } from '../../game/route-actions';
import { MEADOW_LANDMARKS, ROUTE_RULES } from '../../game/route-rules';
import { ExpBar } from '../ui/ExpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { MeadowScene } from './MeadowScene';
import { scenePreviewStyle } from './puzzle-art';
import { growthLines, monName, POKEBALL, speciesName } from './scene';
import { foragedText, inventoryChangeText, moneyChangeText, nothingLine, resultFind } from './route-copy';

const OUTCOME_LABEL = {
  caught: 'A new companion!', escaped: 'The Pokémon escaped', won: 'Battle won!', lost: 'Your party is out of strength',
  left: 'Onward to the meadow', talked: 'A moment on the path', accepted: 'Meadow survey accepted', found: 'A little discovery!', nothing: 'Nothing this time',
  solved: 'Puzzle solved!',
};

/** After a won battle, names the members that fainted mid-battle: they earned no EXP. A loss has its own whiteout line. */
export function FaintedNote({ event, box }: { event: RouteEvent; box: OwnedMon[] }) {
  if (event.outcome === 'lost') return null;
  const fainted = (event.battle?.fielded ?? []).filter((f) => f.hp === 0)
    .map((f) => { const mon = box.find((m) => m.id === f.id); return mon ? monName(mon) : 'A Pokémon'; });
  return fainted.length > 0 ? <p className="mt-2 text-sm text-ink-dim">{fainted.join(', ')} fainted and earned no EXP.</p> : null;
}

/** A find with no Pokémon or person: the ball, valuable, or coin pouch it turned up. */
function FindArt({ event }: { event: RouteEvent }) {
  const icon = (path: string, size: number) => <PixelSprite src={`${import.meta.env.BASE_URL}${path}`} size={size} alt="" className="mt-8" />;
  if (event.kind === 'nothing') return icon('sprites/ui/night/96/explore.png', 96);
  if (event.kind === 'landmark') return icon('sprites/ui/night/96/field-journal.png', 96);
  if (event.kind === 'secret') return icon('sprites/items/honey.png', 90);
  // A puzzle that paid nothing (given up) shows the picture it hid.
  if (event.kind === 'puzzle' && event.puzzle && !event.items.some((item) => item.quantity > 0)) {
    return <span aria-hidden="true" className="mt-8 block h-24 w-24 border-2 border-edge bg-no-repeat" style={scenePreviewStyle(event.puzzle.scene)} />;
  }
  const find = resultFind(event);
  if (find?.kind === 'money') return <p className="mt-10 rounded-[3px] border border-window-rim bg-window px-4 py-3 text-center shadow-[3px_3px_0_var(--color-edge)]"><span className="block font-label text-[10px] uppercase text-info">Coin pouch</span><span className="mt-1 block text-2xl text-accent">{formatMoney(find.amount)}</span></p>;
  if (find?.kind === 'item' && find.item.category === 'valuable') return <div className="mt-8 flex flex-col items-center gap-2">
    <span className="rounded-[3px] border border-window-rim bg-slot p-4 shadow-[3px_3px_0_var(--color-edge)]"><img src={`${import.meta.env.BASE_URL}${find.item.icon}`} width={30} height={30} alt="" className="block [image-rendering:pixelated]" /></span>
    <span className="rounded-[3px] border border-window-rim bg-window px-3 py-1 font-label text-[10px] uppercase text-ink shadow-[2px_2px_0_var(--color-edge)]">{find.item.name}</span>
  </div>;
  return <img src={ballUrl(find?.item.id ?? 'poke')} width={96} height={96} alt="Capture supplies" className="mt-6 h-24 w-24 object-contain [image-rendering:pixelated]" />;
}

/** Keep the server's detailed growth and evolution receipts reachable without competing with the next action. */
export function RouteBattleRewards({ event, box, onReplay }: { event: RouteEvent; box: OwnedMon[]; onReplay: () => void }) {
  return <details className="ui-window m-2 mt-4 p-3">
    <summary className="ui-focus min-h-8 rounded-[3px] font-label text-[10px] uppercase text-info">Battle rewards & replay{event.members.length > 0 ? ` · +${event.members.reduce((sum, member) => sum + member.expGained, 0)} EXP` : ''}</summary>
    {event.members.length > 0 ? <ul className="mt-3 flex flex-col gap-3" aria-label="Saved battle rewards">{event.members.map((member) => {
      const mon = box.find((owned) => owned.id === member.id);
      const name = mon ? monName(mon) : speciesName(member.after.dexId);
      return <li key={member.id} className="flex gap-2 rounded-[3px] bg-slot p-2">
        <PixelSprite src={portraitUrl(member.after.dexId)} fallback={POKEBALL} size={40} alt="" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-1 text-sm"><span>{name}</span><span className="font-label text-[9px] uppercase text-exp">+{member.expGained} EXP</span></div>
          <div className="mt-2"><ExpBar level={member.after.level} exp={member.after.exp} /></div>
          {member.sharePct < 100 && <p className="mt-1 text-xs text-ink-dim">{member.sharePct}% EXP share: this Pokémon outclasses the meadow.</p>}
          {growthLines(member, name).map((line) => <p key={line} className="mt-1 text-sm text-accent">{line}</p>)}
        </div>
      </li>;
    })}</ul> : <p className="mt-2 text-sm text-ink-dim">{event.outcome === 'lost' ? 'No EXP earned.' : 'No EXP earned. Your party is ready for another encounter.'}</p>}
    {event.battle && <button type="button" onClick={onReplay} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Replay battle</button>}
  </details>;
}

export function RouteResultView({ event, box, busy, surveyProgress = null, onDone, onReplay }: {
  event: RouteEvent;
  box: OwnedMon[];
  busy: boolean;
  surveyProgress?: { done: number; total: number } | null;
  onDone: () => void;
  onReplay: () => void;
}) {
  const caught = event.catch?.owned;
  const caughtCreature = caught ? ownedMonToCreature(caught) : null;
  const base = event.foe ? CREATURES_BY_ID[String(event.foe.dexId)] : null;
  const foeCreature = base ? event.foe?.shiny ? asShiny(base) : event.foe?.altColor ? asAltColor(base) : base : null;
  const sprite = caughtCreature?.sprite ?? foeCreature?.sprite ?? (event.foe ? spriteUrl(event.foe.dexId) : null);
  const foraged = event.searchKind === 'forage' ? foragedText(event.items) : null;
  const title = foraged ?? (event.kind === 'secret' ? 'A secret in the meadow!' : event.kind === 'landmark' ? 'Landmark surveyed' : event.outcome ? OUTCOME_LABEL[event.outcome] : 'Battle rewards');
  const exp = event.members.reduce((sum, member) => sum + member.expGained, 0);
  const heading = useRef<HTMLHeadingElement>(null);
  // The result replaces the screen the player acted on, where focus was (a solved puzzle's panels are disabled by then).
  // Move it to the title once, so the outcome is read out and the next Tab starts here.
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <>
    <section className="ui-window m-2" aria-label="Encounter result">
      <MeadowScene className="min-h-[340px]">
        <div className="absolute left-3 right-3 top-3 rounded-[3px] border border-window-rim bg-window px-3 py-2 text-center shadow-[3px_3px_0_var(--color-edge)]"><p className="font-label text-[9px] uppercase text-info">Encounter complete</p><h2 ref={heading} tabIndex={-1} className="ui-focus mt-1 rounded-[3px] text-xl text-accent">{title}</h2></div>
        <div className="absolute left-1/2 top-[28%] -translate-x-1/2">
          {sprite ? <PixelSprite src={sprite} fallback={POKEBALL} size={192} alt={caught ? monName(caught) : event.foe ? speciesName(event.foe.dexId) : ''} />
            : event.npc ? <img src={`${import.meta.env.BASE_URL}sprites/trainers/${event.npc.spriteKey}.png`} width={192} height={192} alt={event.npc.name} className="h-48 w-48 object-contain [image-rendering:pixelated]" />
              : <FindArt event={event} />}
        </div>
      </MeadowScene>
      <div className="border-t-2 border-window-frame p-3" aria-live="polite">
        {caught && <p className="text-lg">{event.catch?.joinedParty ? `${monName(caught)} joined your party!` : `${monName(caught)} joined your Box. Edit your party to bring them along.`}</p>}
        {event.catch && <p className="mt-1 text-sm text-ink-dim">Used 1 {itemById(event.catch.ballId)?.name ?? 'ball'}. {event.catch.caught ? 'Your new companion is saved.' : 'The throw is finished. There are more Pokémon to meet.'}</p>}
        {exp > 0 && <p className="mt-2 text-lg text-exp">+{exp} EXP earned by your party</p>}
        {event.members.filter((member) => member.before.dexId !== member.after.dexId).map((member) => <p key={member.id} className="mt-2 text-base text-accent">{speciesName(member.before.dexId)} evolved into {speciesName(member.after.dexId)}!</p>)}
        {event.outcome === 'lost' && <p className="text-sm text-ink-dim">You hurried back to Hearth Town. No EXP earned; the Pokémon Center will heal everyone for free.</p>}
        <FaintedNote event={event} box={box} />
        {event.outcome === 'left' && <p className="text-sm text-ink-dim">{event.kind === 'puzzle' ? 'You left the stone panels. No reward this time.' : 'Your search action stays spent. Battle rewards and discoveries are saved.'}</p>}
        {event.outcome === 'accepted' && <p className="text-sm">Survey the three landmarks from the Quest card for {ROUTE_RULES.questGreatBalls} Great Balls and {formatMoney(ROUTE_RULES.questMoney)}. Earlier discoveries count.</p>}
        {event.outcome === 'talked' && <p className="text-sm">Your survey progress is saved on the Quest card.</p>}
        {event.outcome === 'nothing' && <><p className="text-base">{nothingLine(event.id)}</p><p className="mt-1 text-sm text-ink-dim">Your action is spent. Explore again, or try another card.</p></>}
        {event.kind === 'secret' && <p className="text-base">Bees hum around an old tree by the path. The Honey Tree is in your quests now: spread Honey on it to see who comes.</p>}
        {event.kind === 'landmark' && event.newLandmarks.map((id) => { const landmark = MEADOW_LANDMARKS.find((l) => l.id === id); return landmark ? <p key={id} className="text-base">{landmark.name}: {landmark.blurb}</p> : null; })}
        {event.kind === 'landmark' && surveyProgress && <p className="mt-2 text-sm text-ink-dim">{surveyProgress.done} of {surveyProgress.total} landmarks recorded.</p>}
        {event.questId === 'honey-tree' && event.kind === 'wild' && <p className="mt-2 text-sm text-ink-dim">You spread 1 Honey on the Honey Tree.</p>}
        {event.items.some((item) => item.quantity > 0) && <ul className="space-y-1 text-base text-accent">{event.items.filter((item) => item.quantity > 0).map((item) => <li key={item.itemId}>{inventoryChangeText(item)}</li>)}</ul>}
        {moneyChangeText(event) && <p className="mt-2 text-sm text-accent">{moneyChangeText(event)}</p>}
        {event.kind !== 'landmark' && event.newLandmarks.length > 0 && <p className="mt-2 text-sm text-accent">◆ Discovered: {event.newLandmarks.map((id) => MEADOW_LANDMARKS.find((landmark) => landmark.id === id)?.name ?? id).join(', ')}</p>}
        {event.newSeen.length > 0 && <p className="mt-2 text-sm text-ink-dim">First seen: {event.newSeen.map(speciesName).join(', ')}.</p>}
        <button type="button" disabled={busy} onClick={onDone} className="ui-button-primary ui-focus mt-4 min-h-12 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Continuing…' : event.outcome === 'lost' ? 'Go to the Pokémon Center' : 'Continue exploring'}</button>
      </div>
    </section>
    {event.battle && <RouteBattleRewards event={event} box={box} onReplay={onReplay} />}
  </>;
}
