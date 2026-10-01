import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { isHurt } from '../../game/health';
import { partyMembers } from '../../game/party';
import type { RouteState } from '../../game/route-actions';
import { HpBar } from '../ui/HpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { Panel } from './Panel';
import { monName, POKEBALL } from './scene';

/** Hearth Town's Pokémon Center: see who is hurt, heal everyone for free. */
export function CenterView({ state, box, partyIds, busy, onHeal, onEditParty, onOpenBox }: {
  state: RouteState;
  box: OwnedMon[];
  partyIds: string[];
  busy: boolean;
  onHeal: () => void;
  onEditParty: () => void;
  onOpenBox: () => void;
}) {
  const party = partyMembers(partyIds, box);
  const hurtInBox = box.filter((m) => !partyIds.includes(m.id) && isHurt(m)).length;
  const anyHurt = box.some(isHurt);
  // The route screen shows the trip to town instead of this view; this guards a stale render.
  const away = state.activated && state.trainerAt !== 'home';
  const reason = away ? 'Walk back to Hearth Town to visit the Pokémon Center.'
    : state.activeEvent ? 'Finish or leave your Sunny Meadow encounter first, then come back to heal.'
    : !anyHurt ? 'Your Pokémon are all in perfect health.' : null;
  return <>
    <Panel title="Pokémon Center">
      <p className="text-sm leading-relaxed">Welcome to the Pokémon Center! I can restore your Pokémon to full health. It’s always free.</p>
    </Panel>
    <Panel title="Your party" aside={<button type="button" onClick={onEditParty} className="ui-button ui-focus min-h-11 px-2 font-label text-[9px] uppercase">Edit party</button>}>
      {party.length === 0 ? <p className="text-sm">Your party is empty. Choose your Pokémon to bring them along.</p>
        : <ul className="flex flex-col gap-2">{party.map((mon) => <li key={mon.id} className="flex items-center gap-2 rounded-[3px] bg-slot p-2">
          <PixelSprite src={ownedMonToCreature(mon)?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt="" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm">{monName(mon)}</p><HpBar mon={mon} showNumbers /></div>
        </li>)}</ul>}
      {hurtInBox > 0 && <p className="mt-2 text-sm text-ink-dim">{hurtInBox} Pokémon in your Box also {hurtInBox === 1 ? 'needs' : 'need'} care. Healing covers them too.</p>}
    </Panel>
    <div className="m-2 flex flex-col gap-2">
      {!away && <button type="button" disabled={busy || reason !== null} onClick={onHeal} className="ui-button-primary ui-focus min-h-12 w-full px-3 font-label text-[11px] uppercase">{busy ? 'Healing…' : 'Heal my Pokémon · free'}</button>}
      {reason && <p className="text-sm text-ink-dim">{reason}</p>}
      <button type="button" onClick={onOpenBox} className="ui-button ui-focus min-h-11 w-full px-3 font-label text-[10px] uppercase">Open your Box</button>
    </div>
  </>;
}
