import { randomBytes } from 'node:crypto';
import {
  acceptRouteQuest, changeInventory, changeMoney, dismissPriorRouteEvents, insertDiscovery, insertRouteEvent,
  markRouteQuestClaimed, newId, readDiscoveries, readRouteQuests, type Executor,
} from './_db.js';
import { fail } from './_route-error.js';
import type { OwnedMon } from '../src/game/box.js';
import { legalChoices, rollRouteFind, ROUTE_RULES } from '../src/game/route-rules.js';
import { canAfford, questRecords, questViews } from '../src/game/route-quests.js';
import type { InventoryState, QuestId, RouteEvent, RouteFind, RoutePhase, SearchKind, StoredRouteEvent } from '../src/game/route-actions.js';

/** The phase a find opens in. Finds without a Pokémon or a person settle at once. */
function openingPhase(find: RouteFind): RoutePhase {
  return find.kind === 'wild' || find.kind === 'trainer' || find.kind === 'researcher' || find.kind === 'puzzle' ? find.kind : 'resolved';
}

/**
 * One search's find, rolled and persisted with its discoveries, items, ₽ and quest rows inside the search's
 * write transaction. The caller has validated the trainer and party and spent the action.
 */
export async function commitFind(tx: Executor, { uid, kind, questId, party, inventory, now }: {
  uid: string;
  kind: SearchKind;
  questId?: QuestId;
  party: OwnedMon[];
  inventory: InventoryState;
  now: number;
}): Promise<RouteEvent> {
  const [discoveries, rows] = await Promise.all([readDiscoveries(tx, uid), readRouteQuests(tx, uid)]);
  const landmarks = discoveries.filter((d) => d.locationId === 'r1' && d.kind === 'landmark').map((d) => d.ref);
  const records = questRecords(rows);
  let questStep: 'meet' | 'survey' | 'spread-honey' | undefined;
  if (kind === 'quest') {
    // The step comes from stored progress, never from the request.
    const quest = questViews(records, landmarks).find((q) => q.id === questId);
    if (!quest) return fail(409, 'You haven’t found that quest yet.');
    const next = quest.next;
    if (!next) return fail(409, 'That quest is complete.');
    if (next.step === 'claim') return fail(409, 'Your survey is complete. Claim its reward.');
    if (!canAfford(next, inventory)) return fail(409, 'You have no Honey. Forage for some first.');
    questStep = next.step;
  }
  const seed = randomBytes(16).toString('hex');
  const find = rollRouteFind({ seed, kind, questStep, knownLandmarks: landmarks, honeyTreeFound: records.some((q) => q.questId === 'honey-tree'), inventory, rules: ROUTE_RULES });
  const phase = openingPhase(find);
  const event: RouteEvent = {
    id: newId(), locationId: 'r1', searchKind: kind, kind: find.kind, rulesVersion: ROUTE_RULES.version, revision: 0,
    startedAt: now, resolvedAt: phase === 'resolved' ? now : null, phase, party,
    foe: find.foe?.view ?? null, npc: find.npc, choices: legalChoices(phase),
    catchChances: null,
    battle: null, members: [], catch: null, items: find.items, newSeen: [], newLandmarks: [],
    outcome: phase !== 'resolved' ? null : find.kind === 'nothing' ? 'nothing' : 'found', money: find.money,
    ...(find.questId ? { questId: find.questId } : {}),
    ...(find.puzzle ? { puzzle: find.puzzle } : {}),
  };
  for (const landmark of find.landmarks) {
    if (await insertDiscovery(tx, { uid, locationId: 'r1', kind: 'landmark', ref: landmark, foundAt: now })) event.newLandmarks.push(landmark);
  }
  // A trainer's Pokémon counts as seen too, as in the games.
  if (find.foe && await insertDiscovery(tx, { uid, locationId: 'r1', kind: 'seen', ref: String(find.foe.view.dexId), foundAt: now })) event.newSeen.push(find.foe.view.dexId);
  for (const item of find.items) {
    if (!await changeInventory(tx, uid, item.itemId, item.quantity)) fail(409, 'Your Bag changed. Check it and try again.');
  }
  if (find.money > 0 && !await changeMoney(tx, uid, find.money)) throw new Error('Balance overflow');
  if (find.kind === 'secret') await acceptRouteQuest(tx, uid, 'honey-tree', now);
  // The first honey-tree encounter completes its quest; later ones leave it complete.
  if (find.questId === 'honey-tree' && find.kind === 'wild') await markRouteQuestClaimed(tx, uid, 'honey-tree', now);
  await dismissPriorRouteEvents(tx, uid, now);
  const data: StoredRouteEvent = { event, seed, config: ROUTE_RULES, foe: find.foe };
  await insertRouteEvent(tx, uid, { id: event.id, createdAt: now, revision: 0, active: phase !== 'resolved', seenAt: null, data });
  return event;
}
