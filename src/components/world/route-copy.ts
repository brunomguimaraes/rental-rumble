import { formatMoney, itemById } from '../../game/items.js';
import type { ItemGrant, MarketTrade, RouteEvent } from '../../game/route-actions.js';

/** Signed item receipts describe grants and consumption using different verbs. */
export function inventoryChangeText(item: ItemGrant): string {
  const quantity = Math.abs(item.quantity);
  const def = itemById(item.itemId);
  const name = quantity === 1 ? def?.name ?? item.itemId : def?.plural ?? item.itemId;
  return item.quantity > 0 ? `+${quantity} ${name} added to your Bag.` : `Used ${quantity} ${name} from your Bag.`;
}

/** ₽ an encounter paid, or null when it paid nothing. */
export function moneyChangeText(event: Pick<RouteEvent, 'kind' | 'money'>): string | null {
  const amount = event.money ?? 0;
  if (amount <= 0) return null;
  return event.kind === 'item' ? `Found a coin pouch: +${formatMoney(amount)}.` : `+${formatMoney(amount)} prize money.`;
}

export function tradeText(trade: MarketTrade): string {
  const item = itemById(trade.itemId);
  const name = trade.quantity === 1 ? item?.name ?? trade.itemId : item?.plural ?? trade.itemId;
  return `${trade.side === 'buy' ? 'Bought' : 'Sold'} ${trade.quantity} ${name} for ${formatMoney(trade.total)}.`;
}
