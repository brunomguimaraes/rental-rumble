import { formatMoney, itemById } from '../../game/items.js';
import type { MeterView } from '../../game/meter.js';
import type { TravelQuote } from '../../game/travel.js';
import type { ItemDefinition, ItemGrant, MarketTrade, RouteEvent } from '../../game/route-actions.js';

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

export type ResultFind = { kind: 'item'; item: ItemDefinition } | { kind: 'money'; amount: number };

/** What a find with no Pokémon or person turned up: the first item granted, else a coin pouch. */
export function resultFind(event: Pick<RouteEvent, 'items' | 'money'>): ResultFind | null {
  const grant = event.items.find((item) => item.quantity > 0);
  const item = grant ? itemById(grant.itemId) : null;
  if (item) return { kind: 'item', item };
  const amount = event.money ?? 0;
  return amount > 0 ? { kind: 'money', amount } : null;
}

export function tradeText(trade: MarketTrade): string {
  const item = itemById(trade.itemId);
  const name = trade.quantity === 1 ? item?.name ?? trade.itemId : item?.plural ?? trade.itemId;
  return `${trade.side === 'buy' ? 'Bought' : 'Sold'} ${trade.quantity} ${name} for ${formatMoney(trade.total)}.`;
}

export function waitText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Why a trip cannot start right now, or null. Mirrors the server's checks for a disabled button. */
export function travelBlock({ quote, travel, encounterOpen, now }: { quote: TravelQuote | null; travel: MeterView; encounterOpen: boolean; now: number }): string | null {
  if (encounterOpen) return 'Finish or leave your encounter before you travel.';
  if (!quote) return 'You can’t get there from here.';
  const missing = quote.cost - travel.available;
  if (missing <= 0) return null;
  const firstAt = travel.nextRefillAt ?? now;
  const readyAt = firstAt + (missing - 1) * travel.refillEveryMs;
  return `Not enough travel stamina. Enough to travel in ${waitText(readyAt - now)}.`;
}

const NOTHING_LINES = [
  'Only the wind in the tall grass.',
  'A Pidgey feather drifts by. Nothing else turns up.',
  'You followed a rustle, but it was just the breeze.',
  'The meadow is quiet for now.',
] as const;

/** Explore's empty result: one line per encounter, the same every time it is shown. */
export function nothingLine(eventId: string): string {
  const sum = [...eventId].reduce((total, ch) => total + ch.charCodeAt(0), 0);
  return NOTHING_LINES[sum % NOTHING_LINES.length];
}
