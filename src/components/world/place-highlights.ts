import type { RouteState } from '../../game/route-actions.js';

export interface PlaceHighlight {
  kind: 'sighting' | 'person' | 'discovery' | 'quest';
  label: string;
  detail: string;
  focus: 'encounter' | 'result' | 'survey';
  dexId?: number;
  spriteKey?: string;
}

/** Highlights describe saved events, never invented activity or unread counts. */
export function placeHighlights(state: RouteState): PlaceHighlight[] {
  const highlights: PlaceHighlight[] = [];
  const active = state.activeEvent;
  const result = state.result;
  if (active?.kind === 'wild' && active.foe) {
    highlights.push({ kind: 'sighting', label: active.newSeen.includes(active.foe.dexId) ? 'New sighting' : 'In the tall grass',
      detail: 'A wild Pokémon is waiting in the meadow.', focus: 'encounter', dexId: active.foe.dexId });
  } else if (active?.npc && (active.kind !== 'researcher' || state.quest.status !== 'not-accepted')) {
    highlights.push({ kind: 'person', label: 'On the meadow path', detail: `${active.npc.name} is waiting to meet you.`,
      focus: 'encounter', spriteKey: active.npc.spriteKey });
  } else if (!active && result && (result.newSeen.length > 0 || result.newLandmarks.length > 0)) {
    highlights.push({ kind: 'discovery', label: result.newSeen.length > 0 ? 'Latest sighting' : 'New discovery',
      detail: result.newSeen.length > 0 ? 'A new face in your field notes.' : 'You found a new meadow landmark.',
      focus: 'result', dexId: result.newSeen[0] });
  }

  const quest = state.quest;
  if (quest.status === 'ready') {
    highlights.push({ kind: 'quest', label: 'Reward ready', detail: 'Your Meadow survey is complete. Collect your Great Balls.', focus: 'survey' });
  } else if (quest.status === 'active') {
    const found = quest.required.filter((id) => quest.landmarks.includes(id)).length;
    highlights.push({ kind: 'quest', label: 'Meadow survey', detail: `${found} of ${quest.required.length} landmarks recorded. Follow the trail to find more.`, focus: 'survey' });
  } else if (quest.status === 'not-accepted' && active?.kind === 'researcher') {
    highlights.push({ kind: 'quest', label: 'New quest', detail: 'The Meadow Researcher has a survey for you.', focus: 'encounter', spriteKey: active.npc?.spriteKey });
  } else if (quest.status === 'not-accepted' && highlights.length === 0) {
    highlights.push({ kind: 'quest', label: 'Meadow survey', detail: 'Look for the Meadow Researcher on the path to start a survey.', focus: 'survey' });
  }
  return highlights;
}
