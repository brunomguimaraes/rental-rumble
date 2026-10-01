import type { CaptureBallId, InventoryState, ItemDefinition } from './route-actions.js';

// Usable inventory is deliberately separate from the cosmetic ball catalog.
// A definition describes an item; only a persisted inventory stack owns one.
export const ITEMS: readonly ItemDefinition[] = [
  {
    id: 'poke',
    name: 'Poké Ball',
    description: 'One throw at a wild Pokémon. Battle first to improve your chance. Find more while exploring Sunny Meadow.',
    category: 'capture',
    useContext: 'wild',
    catchBonus: 0,
  },
  {
    id: 'great',
    name: 'Great Ball',
    description: 'One throw with a better catch chance. Find these while exploring or completing the Meadow survey.',
    category: 'capture',
    useContext: 'wild',
    catchBonus: 0.2,
  },
];

export function isCaptureBallId(id: unknown): id is CaptureBallId {
  return id === 'poke' || id === 'great';
}

export function itemById(id: unknown): ItemDefinition | null {
  return ITEMS.find((item) => item.id === id) ?? null;
}

export function itemQuantity(inventory: InventoryState, itemId: CaptureBallId): number {
  const quantity = inventory.stacks.find((stack) => stack.itemId === itemId)?.quantity ?? 0;
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0;
}

/** Only implemented capture items count toward the empty-Bag supply rule. */
export function ballCount(inventory: InventoryState): number {
  return itemQuantity(inventory, 'poke') + itemQuantity(inventory, 'great');
}
