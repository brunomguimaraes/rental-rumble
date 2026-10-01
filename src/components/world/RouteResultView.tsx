import type { OwnedMon } from '../../game/box';
import { ownedMonToCreature } from '../../game/box';
import { itemById } from '../../game/items';
import { portraitUrl } from '../../game/pokemon';
import type { RouteEvent } from '../../game/route-actions';
import { MEADOW_LANDMARKS } from '../../game/route-rules';
import { ExpBar } from '../ui/ExpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { growthLines, monName, POKEBALL, speciesName } from './scene';
import { inventoryChangeText } from './route-copy';

const OUTCOME_LABEL = {
  caught: 'A new companion', escaped: 'The Pokémon escaped', won: 'Battle won', lost: 'Your party was defeated',
  left: 'Back to the meadow', talked: 'A moment in the meadow', accepted: 'Meadow survey accepted', found: 'Supplies found',
};

export function RouteResultView({ event, box, busy, onDone, onReplay }: {
  event: RouteEvent;
  box: OwnedMon[];
  busy: boolean;
  onDone: () => void;
  onReplay: () => void;
}) {
  const caught = event.catch?.owned;
  const caughtCreature = caught ? ownedMonToCreature(caught) : null;
  return <>
    <section className="ui-window m-2 p-3" aria-label="Encounter result">
      <h2 className="font-label text-[12px] uppercase text-accent">{event.outcome ? OUTCOME_LABEL[event.outcome] : 'Battle rewards'}</h2>
      {caught && <div className="mt-3 flex items-center gap-3">
        <PixelSprite src={caughtCreature?.portrait ?? portraitUrl(caught.dexId)} fallback={POKEBALL} size={80} alt="" />
        <p className="text-base">{monName(caught)} joined your Box. Edit your party to bring them along.</p>
      </div>}
      {event.catch && <p className="mt-2 text-sm text-ink-dim">Used 1 {itemById(event.catch.ballId)?.name ?? 'ball'}. {event.catch.caught ? 'Caught!' : 'The throw is finished. You can look for another Pokémon.'}</p>}
      {event.outcome === 'lost' && <p className="mt-2 text-sm text-ink-dim">No EXP earned. Your party is ready for another encounter.</p>}
      {event.outcome === 'left' && <p className="mt-2 text-sm text-ink-dim">The search action stays spent. Any battle rewards and discoveries are already saved.</p>}
      {event.outcome === 'accepted' && <p className="mt-2 text-sm">Discover the three meadow landmarks. Your earlier discoveries already count. Check Meadow survey on the route for your progress.</p>}
      {event.outcome === 'talked' && <p className="mt-2 text-sm">Your quest progress is saved on the route panel.</p>}
      {event.items.length > 0 && <ul className="mt-3 flex flex-col gap-1 text-sm">{event.items.filter((item) => item.quantity !== 0).map((item) => <li key={item.itemId}>{inventoryChangeText(item)}</li>)}</ul>}
      {event.newLandmarks.length > 0 && <div className="mt-3"><h3 className="font-label text-[10px] uppercase text-info">Landmarks discovered</h3><ul className="mt-1 text-sm">{event.newLandmarks.map((id) => <li key={id}>{MEADOW_LANDMARKS.find((landmark) => landmark.id === id)?.name ?? id}</li>)}</ul></div>}
      {event.newSeen.length > 0 && <p className="mt-3 text-sm text-ink-dim">First seen: {event.newSeen.map(speciesName).join(', ')}.</p>}
      {event.battle && <button type="button" onClick={onReplay} className="ui-button ui-focus mt-3 min-h-11 px-3 font-label text-[10px] uppercase">Replay battle</button>}
    </section>
    {event.members.length > 0 && <section className="ui-window m-2 p-3" aria-label="Saved battle rewards">
      <h2 className="font-label text-[11px] uppercase text-info">Battle rewards · already saved</h2>
      <ul className="mt-3 flex flex-col gap-3">{event.members.map((member) => {
        const mon = box.find((owned) => owned.id === member.id);
        const name = mon ? monName(mon) : speciesName(member.after.dexId);
        const lines = growthLines(member, name);
        return <li key={member.id} className="flex gap-2 rounded-[3px] bg-slot p-2">
          <PixelSprite src={portraitUrl(member.after.dexId)} fallback={POKEBALL} size={40} alt="" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sm"><span>{name}</span><span className="font-label text-[9px] uppercase text-exp">+{member.expGained} EXP</span></div>
            <div className="mt-2"><ExpBar level={member.after.level} exp={member.after.exp} /></div>
            {member.sharePct < 100 && <p className="mt-1 text-xs text-ink-dim">{member.sharePct}% EXP share: this Pokémon outclasses the meadow.</p>}
            {lines.map((line) => <p key={line} className="mt-1 text-sm text-accent">{line}</p>)}
          </div>
        </li>;
      })}</ul>
    </section>}
    {event.phase === 'resolved' && <div className="m-2"><button type="button" disabled={busy} onClick={onDone} className="ui-button-primary ui-focus min-h-12 w-full px-3 font-label text-[11px] uppercase">Continue to Sunny Meadow</button></div>}
  </>;
}
