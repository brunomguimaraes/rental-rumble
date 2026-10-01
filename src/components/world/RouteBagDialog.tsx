import { useEffect, useId, useRef } from 'react';
import { ballUrl } from '../../game/balls';
import { ballCount, ITEMS, itemQuantity } from '../../game/items';
import type { CaptureBallId, RouteEvent, RouteState } from '../../game/route-actions';

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
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  // StrictMode reopens after effect cleanup; ignore the old, queued close event.
  return <dialog ref={dialog} onClose={(event) => { if (!event.currentTarget.open) onClose(); }} aria-labelledby={title}
    className="ui-window fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2.5rem)] max-w-[400px] overflow-y-auto p-4 font-pixel text-ink backdrop:bg-edge/75">
    <header className="flex items-center justify-between gap-3">
      <div><p className="font-label text-[10px] uppercase text-info">Capture supplies</p><h2 id={title} className="mt-1 text-2xl">{canCatch ? 'Choose a ball' : 'Your Bag'}</h2></div>
      <button type="button" autoFocus onClick={onClose} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">Close</button>
    </header>
    <p className="mt-3 text-sm text-ink-dim">{canCatch ? 'Choosing is free. You’ll confirm your one throw in the encounter.' : 'Find more balls by exploring the meadow.'}</p>
    {full && canCatch && <p className="mt-3 text-sm text-accent">Your Box is full (600 Pokémon). You can still battle or leave.</p>}
    <ul className="mt-4 flex flex-col gap-3">{ITEMS.map((item) => {
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
      ? `${event ? 'Finish or leave your encounter, then ' : ''}Explore for 3 guaranteed Poké Balls while your Bag is empty.`
      : canCatch ? 'One throw uses one ball and ends the encounter, whether the Pokémon stays or escapes.' : 'Winning a wild battle improves your catch chance.'}</p>
  </dialog>;
}
