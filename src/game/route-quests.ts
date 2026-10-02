import { itemQuantity } from './items.js';
import type { InventoryState, ItemGrant, QuestId, QuestStep, RouteQuestView, RouteRules } from './route-actions.js';
import { MEADOW_LANDMARKS, ROUTE_RULES } from './route-rules.js';

// Quests on the Quest card: the Meadow survey and the Honey Tree. Pure: the server derives steps from stored rows
// with these rules, and the board renders the views it returns.

/** One stored quest row: when it was accepted (the Honey Tree: found), and when it was first completed. */
export interface QuestRecord { questId: QuestId; acceptedAt: number; claimedAt: number | null }

export const isQuestId = (v: unknown): v is QuestId => v === 'meadow-survey' || v === 'honey-tree';

/** Stored rows for quests this build knows. */
export function questRecords(rows: readonly { questId: string; acceptedAt: number; claimedAt: number | null }[]): QuestRecord[] {
  return rows.flatMap((row) => (isQuestId(row.questId) ? [{ questId: row.questId, acceptedAt: row.acceptedAt, claimedAt: row.claimedAt }] : []));
}

const step = (id: QuestStep['step'], actions: number, items: ItemGrant[] = []): QuestStep => ({ step: id, actions, items });

function surveyView(record: QuestRecord | undefined, landmarks: readonly string[], rules: RouteRules): RouteQuestView {
  const required = MEADOW_LANDMARKS.map((landmark) => landmark.id as string);
  const progress = { done: required.filter((id) => landmarks.includes(id)).length, total: required.length };
  if (!record) return { id: 'meadow-survey', status: 'not-accepted', next: step('meet', rules.costs.quest), progress };
  if (record.claimedAt !== null) return { id: 'meadow-survey', status: 'claimed', next: null, progress };
  if (progress.done === progress.total) return { id: 'meadow-survey', status: 'ready', next: step('claim', 0), progress };
  return { id: 'meadow-survey', status: 'active', next: step('survey', rules.costs.quest), progress };
}

/** The quests the trainer can see: the survey always, then the Honey Tree once found. */
export function questViews(records: readonly QuestRecord[], landmarks: readonly string[], rules: RouteRules = ROUTE_RULES): RouteQuestView[] {
  const views = [surveyView(records.find((r) => r.questId === 'meadow-survey'), landmarks, rules)];
  const tree = records.find((r) => r.questId === 'honey-tree');
  // The Honey Tree never runs out: its first encounter completes it, and it stays baitable while Honey lasts.
  if (tree) views.push({ id: 'honey-tree', status: tree.claimedAt === null ? 'active' : 'claimed', next: step('spread-honey', rules.costs.quest, [{ itemId: 'honey', quantity: 1 }]), progress: null });
  return views;
}

/** Whether the Bag covers a step's item cost. The action cost is checked against the allowance separately. */
export function canAfford(next: QuestStep, inventory: InventoryState): boolean {
  return next.items.every((item) => itemQuantity(inventory, item.itemId) >= item.quantity);
}
