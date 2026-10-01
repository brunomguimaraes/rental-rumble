import { useEffect, useId, useRef } from 'react';
import { ballUrl } from '../../game/balls';
import { ballCount, CAPTURE_ITEMS, formatMoney, itemQuantity, VALUABLE_ITEMS } from '../../game/items';
import type { CaptureBallId, RouteEvent, RouteState } from '../../game/route-actions';
import { guaranteesSupplies, ROUTE_RULES } from '../../game/route-rules';

/** Native dialog keeps focus, Escape and the saved scene underneath the Bag. */
export function RouteBagDialog({ state, event, busy, onClose, onSelect }: {
  state: RouteState;
  event: RouteEvent | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (id: CaptureBallId) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const canCatch = Boolean(event?.choices.includes('catch') && event.catchChances);
  const full = state.ownedCount >= 600;
  const valuables = VALUABLE_ITEMS.filter((item) => itemQuantity(state.inventory, item.id) > 0);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  // StrictMode reopens after effect cleanup; ignore the old, queued close event.
  return <dialog ref={dialog} onClose={(event) => { if (!event.currentTarget.open) onClose(); }} aria-labelledby={title}
    className="ui-window fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2.5rem)] max-w-[400px] overflow-y-auto p-4 font-pixel text-ink backdrop:bg-edge/75">
    <header className="flex items-center justify-between gap-3">
      <div><p className="font-label text-[10px] uppercase text-info">{canCatch ? 'Capture supplies' : 'Supplies and valuables'}</p><h2 id={title} className="mt-1 text-2xl">{canCatch ? 'Choose a ball' : 'Your Bag'}</h2></div>
      <button type="button" autoFocus onClick={onClose} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">Close</button>
    </header>
    <p className="mt-3 flex items-center justify-between gap-2 rounded-[3px] bg-slot px-3 py-2"><span className="font-label text-[11px] uppercase text-info">Money</span><span className="font-label text-[11px] uppercase text-accent">{formatMoney(state.inventory.money)}</span></p>
    <p className="mt-3 text-sm text-ink-dim">{canCatch ? 'Choosing is free. You’ll confirm your one throw in the encounter.' : 'Find balls in Sunny Meadow or buy them at the Village market.'}</p>
    {full && canCatch && <p className="mt-3 text-sm text-accent">Your Box is full (600 Pokémon). You can still battle or leave.</p>}
    <ul className="mt-4 flex flex-col gap-3">{CAPTURE_ITEMS.map((item) => {
      const quantity = itemQuantity(state.inventory, item.id);
      const chance = event?.catchChances?.[item.id];
      const content = <><img src={ballUrl(item.id)} width={40} height={40} alt="" className="shrink-0 object-contain [image-rendering:pixelated]" />
        <span className="min-w-0 flex-1"><span className="block text-lg">{item.name}</span><span className="block text-sm text-ink-dim">{quantity} in your Bag</span></span>
        {canCatch && chance !== undefined && <span className="text-right"><span className="block text-xl text-accent">{Math.round(chance * 100)}%</span><span className="block text-xs text-ink-dim">catch chance</span></span>}</>;
      return <li key={item.id}>{canCatch ? <button type="button" disabled={busy || full || quantity === 0} onClick={() => onSelect(item.id)} aria-label={`${item.name}, ${quantity} owned, ${Math.round((chance ?? 0) * 100)}% catch chance`}
        className="ui-button ui-focus flex min-h-20 w-full items-center gap-3 p-3 text-left">{content}</button>
        : <div className="flex min-h-20 items-center gap-3 rounded-[3px] bg-slot p-3">{content}</div>}</li>;
    })}</ul>
    <p className="mt-4 border-t border-window-frame pt-3 text-sm text-ink-dim">{ballCount(state.inventory) === 0
      ? `No capture balls. Buy Poké Balls at the Village market, or after finishing any current encounter, Explore Sunny Meadow.${guaranteesSupplies(state.inventory) ? ` Explore guarantees ${ROUTE_RULES.pokeBundleQuantity} Poké Balls for 1 action.` : ''}`
      : canCatch ? 'One throw uses one ball and ends the encounter, whether the Pokémon stays or escapes.' : 'Winning a wild battle improves your catch chance.'}</p>
    {!canCatch && <section className="mt-4 border-t border-window-frame pt-3" aria-label="Valuables">
      <h3 className="font-label text-[11px] uppercase text-info">Valuables</h3>
      <p className="mt-2 text-sm text-ink-dim">Sell these at the Village market in Hearth Town.</p>
      {valuables.length === 0
        ? <p className="mt-3 text-sm">None yet. Explore Sunny Meadow to find Honey and mushrooms.</p>
        : <ul className="mt-3 flex flex-col gap-3">{valuables.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-[3px] bg-slot p-3"><img src={`${import.meta.env.BASE_URL}${item.icon}`} alt="" width={30} height={30} className="shrink-0 [image-rendering:pixelated]" /><span className="min-w-0 flex-1 text-base">{item.name}</span><span className="font-label text-[11px] uppercase" aria-label={`${itemQuantity(state.inventory, item.id)} owned`}>×{itemQuantity(state.inventory, item.id)}</span></li>)}</ul>}
    </section>}
  </dialog>;
}
