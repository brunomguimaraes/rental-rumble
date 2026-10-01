import type { CaptureBallId, InventoryState, ItemDefinition, ItemId, ValuableId } from './route-actions.js';

// Usable inventory is deliberately separate from the cosmetic ball catalog.
// A definition describes an item and its market prices; only a persisted
// inventory stack owns one. The server never reads a price from the client.
export const ITEMS: readonly ItemDefinition[] = [
  {
    id: 'poke', name: 'Poké Ball', plural: 'Poké Balls',
    description: 'One throw at a wild Pokémon. Battle first to improve your chance. Find more in Sunny Meadow or buy them at the Village market.',
    category: 'capture', useContext: 'wild', catchBonus: 0, price: { buy: 200, sell: 100 }, icon: 'sprites/balls/poke.png',
  },
  {
    id: 'great', name: 'Great Ball', plural: 'Great Balls',
    description: 'One throw with a better catch chance. Find these in Sunny Meadow, earn them from the Meadow survey, or buy them at the Village market.',
    category: 'capture', useContext: 'wild', catchBonus: 0.2, price: { buy: 600, sell: 300 }, icon: 'sprites/balls/great.png',
  },
  {
    id: 'honey', name: 'Honey', plural: 'Honey',
    description: 'Sweet honey from the meadow’s wildflowers. The Village market buys it.',
    category: 'valuable', useContext: null, catchBonus: 0, price: { sell: 150 }, icon: 'sprites/items/honey.png',
  },
  {
    id: 'tiny-mushroom', name: 'Tiny Mushroom', plural: 'Tiny Mushrooms',
    description: 'A small, rare mushroom from under the Hilltop Oak. The Village market buys it.',
    category: 'valuable', useContext: null, catchBonus: 0, price: { sell: 250 }, icon: 'sprites/items/tiny-mushroom.png',
  },
  {
    id: 'big-mushroom', name: 'Big Mushroom', plural: 'Big Mushrooms',
    description: 'A large, prized mushroom. The Village market pays well for it.',
    category: 'valuable', useContext: null, catchBonus: 0, price: { sell: 1000 }, icon: 'sprites/items/big-mushroom.png',
  },
];

export const MAX_TRADE_QUANTITY = 99;

export function isCaptureBallId(id: unknown): id is CaptureBallId {
  return id === 'poke' || id === 'great';
}

export function isItemId(id: unknown): id is ItemId {
  return ITEMS.some((item) => item.id === id);
}

export const CAPTURE_ITEMS = ITEMS.filter((item): item is ItemDefinition & { id: CaptureBallId } => isCaptureBallId(item.id));
export const VALUABLE_ITEMS = ITEMS.filter((item): item is ItemDefinition & { id: ValuableId } => item.category === 'valuable');

export function itemById(id: unknown): ItemDefinition | null {
  return ITEMS.find((item) => item.id === id) ?? null;
}

export function itemQuantity(inventory: InventoryState, itemId: ItemId): number {
  const quantity = inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0;
}

/** Only implemented capture items count toward the empty-Bag supply rule. */
export function ballCount(inventory: InventoryState): number {
  return itemQuantity(inventory, 'poke') + itemQuantity(inventory, 'great');
}

/** The ₽ a trade moves, or null when the market does not trade it that way. */
export function tradeTotal(itemId: unknown, side: unknown, quantity: unknown): number | null {
  const item = itemById(itemId);
  if (!item || (side !== 'buy' && side !== 'sell')) return null;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TRADE_QUANTITY) return null;
  const unit = item.price[side];
  if (unit === undefined) return null;
  const total = unit * quantity;
  return Number.isSafeInteger(total) ? total : null;
}

export function formatMoney(amount: number): string {
  return `₽${amount.toLocaleString('en-US')}`;
}
