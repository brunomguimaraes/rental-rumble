import { itemById } from '../../game/items.js';
import type { ItemGrant } from '../../game/route-actions.js';

/** Signed item receipts describe grants and consumption using different verbs. */
export function inventoryChangeText(item: ItemGrant): string {
  const quantity = Math.abs(item.quantity);
  const name = `${itemById(item.itemId)?.name ?? item.itemId}${quantity === 1 ? '' : 's'}`;
  return item.quantity > 0 ? `+${quantity} ${name} added to your Bag.` : `Used ${quantity} ${name} from your Bag.`;
}
