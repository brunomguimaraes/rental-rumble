import { formatMoney, itemById } from '../../game/items.js';
import type { InventoryState, ItemGrant, QuestId, QuestStep, RouteQuestView, RouteState, SearchKind } from '../../game/route-actions.js';
import { canAfford } from '../../game/route-quests.js';
import { guaranteesSupplies, ROUTE_RULES } from '../../game/route-rules.js';
import { waitText } from './route-copy.js';

// The Sunny Meadow board's words and its one button. Pure, so the CTA's states are tested without a browser.

/** One card on the board: its caption, its search verb, and what it does. */
export interface BoardCard { kind: SearchKind; label: string; verb: string; description: string }

export const BOARD_CARDS: readonly BoardCard[] = [
  { kind: 'wild', label: 'Wild Pokémon', verb: 'Search the grass', description: 'Battle a wild Pokémon for EXP and try to catch it. No prize money.' },
  { kind: 'trainer', label: 'Trainer', verb: 'Find a trainer', description: `Battle a trainer for more EXP and ${formatMoney(ROUTE_RULES.trainerMoney)}. Their Pokémon can’t be caught.` },
  { kind: 'puzzle', label: 'Puzzle', verb: 'Solve a puzzle', description: 'Slide the stone panels back into a meadow picture to win the item it hides.' },
  { kind: 'quest', label: 'Quest', verb: 'Quest', description: 'Work on a Sunny Meadow quest, one step at a time.' },
  { kind: 'explore', label: 'Explore', verb: 'Explore', description: 'Anything can happen: a rare Pokémon, a rare item, a secret, or nothing at all.' },
  { kind: 'forage', label: 'Forage', verb: 'Forage', description: 'Gather Honey and mushrooms to sell at the market.' },
];

export const QUEST_NAMES: Record<QuestId, string> = { 'meadow-survey': 'Meadow survey', 'honey-tree': 'The Honey Tree' };
// A step this build does not know (a newer server) reads 'Continue the quest' wherever a verb is looked up, never "undefined".
const STEP_VERBS: Record<QuestStep['step'], string> = {
  meet: 'Meet the researcher', survey: 'Survey a landmark', claim: 'Claim reward', 'spread-honey': 'Spread Honey',
};

/** "1 action", "Free", "1 action · 1 Honey". */
export function costText(actions: number, items: readonly ItemGrant[] = []): string {
  const parts = actions > 0 ? [`${actions} ${actions === 1 ? 'action' : 'actions'}`] : [];
  for (const item of items) {
    const def = itemById(item.itemId);
    parts.push(`${item.quantity} ${item.quantity === 1 ? def?.name ?? item.itemId : def?.plural ?? item.itemId}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Free';
}

/** The quest the Quest card acts on: the player's pick while it has a step, else the first quest that has one. */
export function pickQuest(quests: readonly RouteQuestView[], picked: QuestId | null): RouteQuestView | null {
  return quests.find((q) => q.id === picked && q.next !== null) ?? quests.find((q) => q.next !== null) ?? null;
}

/** One line per quest in the Quest card's pick list. */
export function questLine(quest: RouteQuestView): string {
  if (!quest.next) return 'Complete';
  const verb = STEP_VERBS[quest.next.step] ?? 'Continue the quest';
  return quest.progress ? `${verb} · ${quest.progress.done}/${quest.progress.total} landmarks` : verb;
}

export type BoardAction =
  | { type: 'activate' } | { type: 'resume' } | { type: 'party' } | { type: 'center' } | { type: 'refresh' } | { type: 'claim' } | { type: 'none' }
  | { type: 'search'; kind: SearchKind; questId?: QuestId };

/** The board's one button: its words, whether it can run, why not, and what it does. */
export interface BoardCta { label: string; enabled: boolean; reason: string | null; action: BoardAction }

const idle = (label: string, reason: string | null): BoardCta => ({ label, enabled: false, reason, action: { type: 'none' } });

/** What the button says and does for the selected card. Mirrors the server's refusals; the server still decides. */
export function boardCta({ state, card, quest, partySize, partyDown, busy, now }: {
  state: RouteState;
  card: SearchKind;
  quest: RouteQuestView | null;
  partySize: number;
  partyDown: boolean;
  busy: boolean;
  now: number;
}): BoardCta {
  if (busy) return idle('Searching…', null);
  if (!state.activated || state.legacy.pending) return { label: 'Begin exploring', enabled: true, reason: null, action: { type: 'activate' } };
  if (state.activeEvent) return { label: 'Resume encounter', enabled: true, reason: 'Finish or leave your encounter before you search again.', action: { type: 'resume' } };
  if (partySize === 0) return { label: 'Choose your party', enabled: true, reason: 'Bring at least one Pokémon before you search.', action: { type: 'party' } };
  if (partyDown) return { label: 'Travel to Hearth Town', enabled: true, reason: 'Every Pokémon in your party has fainted. The Pokémon Center heals them for free.', action: { type: 'center' } };
  const def = BOARD_CARDS.find((entry) => entry.kind === card)!;
  let verb = def.verb;
  let actions = ROUTE_RULES.costs[card];
  let items: ItemGrant[] = [];
  let questId: QuestId | undefined;
  if (card === 'quest') {
    if (!quest?.next) return idle('Quest', 'No quests right now. Explore to find secrets.');
    if (quest.next.step === 'claim') return { label: 'Claim reward (free)', enabled: true, reason: null, action: { type: 'claim' } };
    verb = STEP_VERBS[quest.next.step] ?? 'Continue the quest';
    // The server prices each quest step; the Quest card charges that count, not the card's.
    actions = quest.next.actions;
    items = quest.next.items;
    questId = quest.id;
    if (!canAfford(quest.next, state.inventory)) return idle(`${verb} (${costText(actions, items)})`, 'Forage for Honey first.');
  }
  const label = `${verb} (${costText(actions, items)})`;
  if (state.allowance.available < actions) {
    const next = state.allowance.nextRefillAt;
    if (next !== null && next <= now) return { label: 'Check for an action', enabled: true, reason: 'An action should be ready.', action: { type: 'refresh' } };
    return idle(label, next === null ? 'No actions left.' : `No actions left. Next action in ${waitText(next - now)}.`);
  }
  return { label, enabled: true, reason: null, action: { type: 'search', kind: card, ...(questId ? { questId } : {}) } };
}

/** The selected card's one-line description. Explore names its free supplies when the Bag is out of balls. */
export function cardDescription(card: SearchKind, inventory: InventoryState): string {
  if (card === 'explore' && guaranteesSupplies(inventory)) return `You have no balls: exploring now guarantees ${ROUTE_RULES.pokeBundleQuantity} Poké Balls.`;
  return BOARD_CARDS.find((entry) => entry.kind === card)!.description;
}
