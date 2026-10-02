import { ballUrl } from '../game/balls';
import { ballCount, CAPTURE_ITEMS, formatMoney, itemQuantity, VALUABLE_ITEMS } from '../game/items';
import type { CaptureBallId, InventoryState } from '../game/route-actions';
import { guaranteesSupplies, ROUTE_RULES } from '../game/route-rules';

export function BagScreen({ inventory, error, onBack, onRetry, onExplore, catchChances, onSelect, busy = false }: {
  inventory: InventoryState | null;
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
  onExplore?: () => void;
  catchChances?: Record<CaptureBallId, number> | null;
  onSelect?: (itemId: CaptureBallId) => void;
  busy?: boolean;
}) {
  const empty = inventory !== null && ballCount(inventory) === 0;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-[430px] px-2 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] font-pixel text-ink">
      <header className="mb-4 flex items-center gap-3 px-2">
        <button type="button" onClick={onBack} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">◀ Back</button>
        <h1 className="font-label text-sm uppercase text-accent">Bag</h1>
      </header>
      {inventory && <section className="ui-window m-2 flex items-center justify-between p-3" aria-label="Money"><h2 className="font-label text-[11px] uppercase text-info">Money</h2><p className="font-label text-[11px] uppercase text-accent">{formatMoney(inventory.money)}</p></section>}
      <section className="ui-window m-2 p-3" aria-label="Capture items">
        <h2 className="font-label text-[11px] uppercase text-info">Capture items</h2>
        <p className="mt-2 text-sm text-ink-dim">Each throw uses one owned ball, whether the Pokémon stays or escapes. Find more in Sunny Meadow or buy them at the Village market.</p>
        {error && <div role="alert" className="mt-3 text-sm text-accent"><p>{error}</p><button type="button" onClick={onRetry} className="ui-button ui-focus mt-2 min-h-11 px-3 font-label text-[10px] uppercase">Retry Bag</button></div>}
        {!inventory && !error && <p className="mt-3 text-sm" role="status">Loading your Bag…</p>}
        {!inventory && onExplore && <button type="button" onClick={onExplore} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Go to Sunny Meadow</button>}
        {inventory && <ul className="mt-3 flex flex-col gap-3">
          {CAPTURE_ITEMS.map((item) => {
            const quantity = itemQuantity(inventory, item.id);
            const canSelect = onSelect && catchChances !== null && catchChances !== undefined;
            return <li key={item.id} className="rounded-[3px] bg-slot p-3">
              <div className="flex items-center gap-3">
                <img src={ballUrl(item.id)} alt="" width={32} height={32} className="shrink-0 [image-rendering:pixelated]" />
                <h3 className="min-w-0 flex-1 text-base">{item.name}</h3>
                <span className="font-label text-[11px] uppercase" aria-label={`${quantity} owned`}>×{quantity}</span>
              </div>
              <p className="mt-2 text-sm text-ink-dim">{item.description}</p>
              {canSelect ? <button type="button" disabled={busy || quantity === 0} onClick={() => onSelect(item.id)} className="ui-button ui-focus mt-3 min-h-11 w-full px-2 font-label text-[10px] uppercase">
                {quantity > 0 ? `Select · ${Math.round(catchChances[item.id] * 100)}% catch chance` : 'None in your Bag'}
              </button> : <p className="mt-2 text-xs text-ink-dim">Use during a wild encounter.</p>}
            </li>;
          })}
        </ul>}
        {empty && <div className="mt-4 border-t border-window-frame pt-3 text-sm">
          <p>No capture balls. Buy Poké Balls at the Village market, or after finishing any current encounter, Explore Sunny Meadow.{guaranteesSupplies(inventory) && ` Explore guarantees ${ROUTE_RULES.pokeBundleQuantity} Poké Balls for 1 action.`}</p>
          {onExplore && <button type="button" onClick={onExplore} className="ui-button-primary ui-focus mt-3 min-h-11 w-full px-3 font-label text-[10px] uppercase">Go to Sunny Meadow</button>}
        </div>}
      </section>
      {inventory && <section className="ui-window m-2 p-3" aria-label="Valuables">
        <h2 className="font-label text-[11px] uppercase text-info">Valuables</h2>
        <p className="mt-2 text-sm text-ink-dim">Sell these at the Village market in Hearth Town.</p>
        {VALUABLE_ITEMS.every((item) => itemQuantity(inventory, item.id) === 0)
          ? <p className="mt-3 text-sm">None yet. Forage in Sunny Meadow to find Honey and mushrooms.</p>
          : <ul className="mt-3 flex flex-col gap-3">{VALUABLE_ITEMS.filter((item) => itemQuantity(inventory, item.id) > 0).map((item) => <li key={item.id} className="flex items-center gap-3 rounded-[3px] bg-slot p-3"><img src={`${import.meta.env.BASE_URL}${item.icon}`} alt="" width={30} height={30} className="shrink-0 [image-rendering:pixelated]" /><span className="min-w-0 flex-1 text-base">{item.name}</span><span className="font-label text-[11px] uppercase" aria-label={`${itemQuantity(inventory, item.id)} owned`}>×{itemQuantity(inventory, item.id)}</span></li>)}</ul>}
      </section>}
    </div>
  );
}
