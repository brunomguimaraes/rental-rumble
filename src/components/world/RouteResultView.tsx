import type { OwnedMon } from '../../game/box';
import { ownedMonToCreature } from '../../game/box';
import { ballUrl } from '../../game/balls';
import { itemById } from '../../game/items';
import { asAltColor, asShiny, CREATURES_BY_ID, portraitUrl, spriteUrl } from '../../game/pokemon';
import type { RouteEvent } from '../../game/route-actions';
import { MEADOW_LANDMARKS } from '../../game/route-rules';
import { ExpBar } from '../ui/ExpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { MeadowScene } from './MeadowScene';
import { growthLines, monName, POKEBALL, speciesName } from './scene';
import { inventoryChangeText } from './route-copy';

const OUTCOME_LABEL = {
  caught: 'A new companion!', escaped: 'The Pokémon escaped', won: 'Battle won!', lost: 'A tough encounter',
  left: 'Onward to the meadow', talked: 'A moment on the path', accepted: 'Meadow survey accepted', found: 'A little discovery!',
};

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
    })}</ul> : <p className="mt-2 text-sm text-ink-dim">No EXP earned. Your party is ready for another encounter.</p>}
    {event.battle && <button type="button" onClick={onReplay} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Replay battle</button>}
  </details>;
}

export function RouteResultView({ event, box, busy, onDone, onReplay }: {
  event: RouteEvent;
  box: OwnedMon[];
  busy: boolean;
  onDone: () => void;
  onReplay: () => void;
}) {
  const caught = event.catch?.owned;
  const caughtCreature = caught ? ownedMonToCreature(caught) : null;
  const base = event.foe ? CREATURES_BY_ID[String(event.foe.dexId)] : null;
  const foeCreature = base ? event.foe?.shiny ? asShiny(base) : event.foe?.altColor ? asAltColor(base) : base : null;
  const sprite = caughtCreature?.sprite ?? foeCreature?.sprite ?? (event.foe ? spriteUrl(event.foe.dexId) : null);
  const title = event.outcome ? OUTCOME_LABEL[event.outcome] : 'Battle rewards';
  const exp = event.members.reduce((sum, member) => sum + member.expGained, 0);
  return <>
    <section className="ui-window m-2" aria-label="Encounter result">
      <MeadowScene className="min-h-[340px]">
        <div className="absolute left-3 right-3 top-3 rounded-[3px] border border-window-rim bg-window px-3 py-2 text-center shadow-[3px_3px_0_var(--color-edge)]"><p className="font-label text-[9px] uppercase text-info">Encounter complete</p><h2 className="mt-1 text-xl text-accent">{title}</h2></div>
        <div className="absolute left-1/2 top-[28%] -translate-x-1/2">
          {sprite ? <PixelSprite src={sprite} fallback={POKEBALL} size={192} alt={caught ? monName(caught) : event.foe ? speciesName(event.foe.dexId) : ''} />
            : event.npc ? <img src={`${import.meta.env.BASE_URL}sprites/trainers/${event.npc.spriteKey}.png`} width={192} height={192} alt={event.npc.name} className="h-48 w-48 object-contain [image-rendering:pixelated]" />
              : <img src={ballUrl(event.items.find((item) => item.quantity > 0)?.itemId ?? 'poke')} width={96} height={96} alt="Capture supplies" className="mt-6 h-24 w-24 object-contain [image-rendering:pixelated]" />}
        </div>
      </MeadowScene>
      <div className="border-t-2 border-window-frame p-3" aria-live="polite">
        {caught && <p className="text-lg">{monName(caught)} joined your Box. Edit your party to bring them along.</p>}
        {event.catch && <p className="mt-1 text-sm text-ink-dim">Used 1 {itemById(event.catch.ballId)?.name ?? 'ball'}. {event.catch.caught ? 'Your new companion is saved.' : 'The throw is finished. There are more Pokémon to meet.'}</p>}
        {exp > 0 && <p className="mt-2 text-lg text-exp">+{exp} EXP earned by your party</p>}
        {event.members.filter((member) => member.before.dexId !== member.after.dexId).map((member) => <p key={member.id} className="mt-2 text-base text-accent">{speciesName(member.before.dexId)} evolved into {speciesName(member.after.dexId)}!</p>)}
        {event.outcome === 'lost' && <p className="text-sm text-ink-dim">No EXP earned this time. Your party is ready for another encounter.</p>}
        {event.outcome === 'left' && <p className="text-sm text-ink-dim">Your search action stays spent. Battle rewards and discoveries are saved.</p>}
        {event.outcome === 'accepted' && <p className="text-sm">Find the three landmarks for 3 Great Balls. Earlier discoveries count. Check the survey below the route.</p>}
        {event.outcome === 'talked' && <p className="text-sm">Your survey progress is saved. Check the survey below the route.</p>}
        {event.items.some((item) => item.quantity > 0) && <ul className="space-y-1 text-base text-accent">{event.items.filter((item) => item.quantity > 0).map((item) => <li key={item.itemId}>{inventoryChangeText(item)}</li>)}</ul>}
        {event.newLandmarks.length > 0 && <p className="mt-2 text-sm text-accent">◆ Discovered: {event.newLandmarks.map((id) => MEADOW_LANDMARKS.find((landmark) => landmark.id === id)?.name ?? id).join(', ')}</p>}
        {event.newSeen.length > 0 && <p className="mt-2 text-sm text-ink-dim">First seen: {event.newSeen.map(speciesName).join(', ')}.</p>}
        <button type="button" disabled={busy} onClick={onDone} className="ui-button-primary ui-focus mt-4 min-h-12 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Continuing…' : 'Continue exploring'}</button>
      </div>
    </section>
    {event.battle && <RouteBattleRewards event={event} box={box} onReplay={onReplay} />}
  </>;
}
