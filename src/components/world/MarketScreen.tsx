import { useId, useState } from 'react';
import { formatMoney, ITEMS, itemQuantity, MAX_TRADE_QUANTITY } from '../../game/items';
import type { ItemDefinition, MarketTradeInput, RouteState, TradeSide } from '../../game/route-actions';
import { PixelSprite } from '../ui/PixelSprite';

// The Village market: buy capture balls, sell balls and harvest goods. Prices
// come from the shared catalog; the server re-prices every trade and owns the
// balance, so this screen only proposes a trade and renders the reply.

const ASSET = import.meta.env.BASE_URL;

type TradeProposal = Omit<MarketTradeInput, 'requestId'>;

function TradeRow({ item, side, state, busy, onTrade }: {
  item: ItemDefinition; side: TradeSide; state: RouteState; busy: boolean;
  onTrade: (trade: TradeProposal) => void;
}) {
  const unit = item.price[side] ?? 0;
  const owned = itemQuantity(state.inventory, item.id);
  const max = Math.min(MAX_TRADE_QUANTITY, side === 'buy' ? (unit > 0 ? Math.floor(state.inventory.money / unit) : 0) : owned);
  const [wanted, setWanted] = useState(1);
  const quantity = Math.max(1, Math.min(wanted, Math.max(max, 1)));
  const reasonId = useId();
  const reason = max > 0 ? null : side === 'buy' ? `You need ${formatMoney(unit - state.inventory.money)} more` : 'None to sell';
  return <li className="rounded-[3px] bg-slot p-3">
    <div className="flex items-center gap-3">
      <PixelSprite src={`${ASSET}${item.icon}`} size={item.category === 'capture' ? 48 : 30} alt="" />
      <div className="min-w-0 flex-1">
        <h3 className="text-base">{item.name}</h3>
        <p className="text-sm text-ink-dim">{formatMoney(unit)} each · {owned} owned</p>
      </div>
    </div>
    <div className="mt-3 flex items-center gap-2">
      <button type="button" aria-label={`One fewer ${item.name}`} disabled={busy || quantity <= 1} onClick={() => setWanted(quantity - 1)} className="ui-button ui-focus min-h-11 min-w-11 font-label text-[11px]">−</button>
      <output aria-live="polite" aria-label={`Quantity of ${item.name}`} className="min-w-8 text-center font-label text-[11px]">{quantity}</output>
      <button type="button" aria-label={`One more ${item.name}`} disabled={busy || quantity >= max} onClick={() => setWanted(quantity + 1)} className="ui-button ui-focus min-h-11 min-w-11 font-label text-[11px]">+</button>
      <button type="button" disabled={busy || reason !== null} aria-describedby={reason ? reasonId : undefined} onClick={() => onTrade({ itemId: item.id, side, quantity })} className="ui-button-primary ui-focus min-h-11 flex-1 px-2 font-label text-[10px] uppercase">
        {side === 'buy' ? 'Buy' : 'Sell'} ×{quantity} · {formatMoney(unit * quantity)}
      </button>
    </div>
    {reason && <p id={reasonId} className="mt-2 text-sm text-ink-dim">{reason}</p>}
  </li>;
}

export function MarketScreen({ state, busy, onTrade }: {
  state: RouteState; busy: boolean; onTrade: (trade: TradeProposal) => void;
}) {
  const [side, setSide] = useState<TradeSide>('buy');
  const ids = useId();
  const forSale = ITEMS.filter((item) => item.price.buy !== undefined);
  const sellable = ITEMS.filter((item) => item.price.sell !== undefined && itemQuantity(state.inventory, item.id) > 0);
  const rows = side === 'buy' ? forSale : sellable;
  return <section className="ui-window m-2 p-3" aria-label="Village market">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-label text-[11px] uppercase text-info">Village market</h2>
      <p className="font-label text-[11px] uppercase text-accent"><span className="sr-only">Your money: </span>{formatMoney(state.inventory.money)}</p>
    </div>
    <div role="tablist" aria-label="Market" className="mt-3 grid grid-cols-2 gap-2">
      {(['buy', 'sell'] as const).map((tab) => <button key={tab} type="button" role="tab" id={`${ids}-${tab}`} aria-controls={`${ids}-panel`} aria-selected={side === tab} onClick={() => setSide(tab)} className={`ui-button ui-focus min-h-11 font-label text-[10px] uppercase ${side === tab ? 'text-accent' : ''}`}>{side === tab ? '▶ ' : ''}{tab === 'buy' ? 'Buy' : 'Sell'}</button>)}
    </div>
    <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-${side}`}>
      <p className="mt-3 text-sm text-ink-dim">{side === 'buy' ? 'Capture balls for your next trip to Sunny Meadow.' : 'The market buys balls at half price, and Honey and mushrooms you find while exploring.'}</p>
      {rows.length === 0
        ? <p className="mt-3 text-sm">Nothing to sell yet. Explore Sunny Meadow to find Honey and mushrooms.</p>
        : <ul className="mt-3 flex flex-col gap-3">{rows.map((item) => <TradeRow key={`${side}:${item.id}`} item={item} side={side} state={state} busy={busy} onTrade={onTrade} />)}</ul>}
    </div>
  </section>;
}
