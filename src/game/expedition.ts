import type { BattleEvent } from './battle.js';
import type { Creature } from './types.js';
import type { ActivityConfig } from './activity.js';
import type { ChoiceId, ExpeditionNode, LandmarkNode, NodeKind, RoutePlace } from './world.js';
import { simulateBattle } from './battle.js';
import { RNG } from './rng.js';
import { rollGuardian, rollPoolWild, type RolledWild, type WildView } from './wilds.js';

// An expedition is a walk through a route's authored checkpoints. What waits
// at step n (which wild, whether a landmark is guarded) comes from the
// activity's server seed and n, so a reload, a second device, or a retried
// request always meets the same thing. The client only ever sees the current
// checkpoint and the ones already resolved.

export type TrailOutcome = 'observed' | 'won' | 'lost' | 'found' | 'passed' | 'took-a' | 'took-b' | 'retreated';

/** One resolved checkpoint. Safe to show: it is already in the past. */
export interface TrailEntry {
  step: number;
  node: string;
  kind: NodeKind;
  choice: ChoiceId;
  outcome: TrailOutcome;
  foe?: WildView;
  landmark?: string;
  turns?: number;
  expUnits?: number;
  /** Set by the server when this step's species or landmark was a first for the trainer. */
  newSeen?: boolean;
  newLandmark?: boolean;
}

/** Stored on the activity row between steps (server-side). */
export interface ExpeditionState {
  node: string;
  trail: TrailEntry[];
  wins: number;
  /** EXP banked so far, before the over-level falloff; applied at settlement. */
  expUnits: number;
  seen: number[];
  landmarks: string[];
  /** Species and landmarks this trip found for the first time (set by the server from its records). */
  newSeen: number[];
  newLandmarks: string[];
}

export interface CheckpointView {
  step: number;
  node: string;
  kind: NodeKind;
  title: string;
  text: string;
  foe: WildView | null;
  landmark: { id: string; name: string; known: boolean } | null;
  options: { id: ChoiceId; label: string; hint: string }[];
}

export interface StepResolution {
  entry: TrailEntry;
  state: ExpeditionState;
  terminal: 'complete' | 'retreat' | 'defeat' | null;
  battle: { won: boolean; turns: number; events: BattleEvent[] } | null;
  /** The species seen at this step, if any. */
  seen: number | null;
  /** The landmark found at this step, if any. */
  landmark: string | null;
}

export function initialExpedition(cfg: ActivityConfig): ExpeditionState {
  return { node: cfg.expedition.start, trail: [], wins: 0, expUnits: 0, seen: [], landmarks: [], newSeen: [], newLandmarks: [] };
}

const NODE_KINDS: readonly NodeKind[] = ['battle', 'sighting', 'landmark', 'fork', 'guardian'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseExpeditionState(raw: unknown): ExpeditionState | null {
  if (!isObj(raw) || typeof raw.node !== 'string' || !Array.isArray(raw.trail)) return null;
  if (!Number.isInteger(raw.wins) || !Number.isInteger(raw.expUnits)) return null;
  const ints = (v: unknown) => Array.isArray(v) && v.every(Number.isInteger);
  const strs = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (!ints(raw.seen) || !strs(raw.landmarks) || !ints(raw.newSeen) || !strs(raw.newLandmarks)) return null;
  const entriesOk = raw.trail.every(
    (e, i) =>
      isObj(e) && e.step === i && typeof e.node === 'string' && NODE_KINDS.includes(e.kind as NodeKind) &&
      typeof e.choice === 'string' && typeof e.outcome === 'string',
  );
  return entriesOk ? (raw as unknown as ExpeditionState) : null;
}

export function currentNode(cfg: ActivityConfig, state: ExpeditionState): ExpeditionNode | null {
  return Object.hasOwn(cfg.expedition.nodes, state.node) ? cfg.expedition.nodes[state.node] : null;
}

export function choicesFor(node: ExpeditionNode): ChoiceId[] {
  switch (node.kind) {
    case 'battle':
      return ['fight', 'retreat'];
    case 'sighting':
      return ['observe', 'challenge', 'retreat'];
    case 'landmark':
      return ['investigate', 'press-on', 'retreat'];
    case 'fork':
      return ['a', 'b', 'retreat'];
    case 'guardian':
      return ['challenge', 'retreat'];
  }
}

/** The battle seed for step n. Derived from the private seed: server-side only. */
export function battleSeed(seed: string, step: number): string {
  return `${seed}#x#${step}`;
}

function stepRng(seed: string, step: number, nodeId: string, salt: 'foe' | 'guard'): RNG {
  return new RNG(`${seed}:x:${step}:${nodeId}:${salt}`);
}

/** The Pokémon waiting at a battle, sighting, or guardian checkpoint. */
export function checkpointFoe(seed: string, cfg: ActivityConfig, step: number, node: ExpeditionNode): RolledWild | null {
  const rng = stepRng(seed, step, node.id, 'foe');
  switch (node.kind) {
    case 'battle':
    case 'sighting':
      return rollPoolWild(cfg.wild, rng, { levelBonus: node.levelBonus, rareBoost: node.rareBoost });
    case 'guardian':
      return rollGuardian(cfg.guardian, rng);
    default:
      return null;
  }
}

/** Whether investigating this landmark rouses a wild Pokémon first, and which one. */
export function landmarkGuard(seed: string, cfg: ActivityConfig, step: number, node: LandmarkNode): RolledWild | null {
  const rng = stepRng(seed, step, node.id, 'guard');
  if (!rng.chance(node.guardedChance)) return null;
  return rollPoolWild(cfg.wild, rng, { levelBonus: node.levelBonus });
}

function optionCopy(node: ExpeditionNode, choice: ChoiceId, cfg: ActivityConfig, route: RoutePlace): { label: string; hint: string } {
  const win = `Win: +${cfg.explore.expPerWin} EXP each. Lose: the trip ends.`;
  switch (choice) {
    case 'retreat':
      return { label: 'Head home', hint: 'End the trip and keep what you earned.' };
    case 'fight':
      return { label: 'Battle', hint: win };
    case 'observe':
      return { label: 'Watch quietly', hint: 'Note it as seen. No battle.' };
    case 'challenge':
      return node.kind === 'guardian'
        ? { label: 'Challenge', hint: `Win: clear ${route.name} and +${cfg.explore.clearBonus} EXP each.` }
        : { label: 'Challenge it', hint: win };
    case 'investigate': {
      if (node.kind !== 'landmark') return { label: 'Investigate', hint: '' };
      const name = route.landmarks.find((l) => l.id === node.landmark)?.name ?? 'A landmark';
      return { label: 'Investigate', hint: node.guardedChance > 0 ? `${name}. Something may guard it.` : `${name}.` };
    }
    case 'press-on':
      return { label: 'Press on', hint: 'Skip it and keep going.' };
    case 'a':
    case 'b': {
      const option = node.kind === 'fork' ? node.options.find((o) => o.id === choice) : undefined;
      return { label: option?.label ?? choice, hint: option?.hint ?? '' };
    }
  }
}

/** The checkpoint the player is standing at: what they see and what they can choose. */
export function checkpointView(
  seed: string,
  cfg: ActivityConfig,
  state: ExpeditionState,
  route: RoutePlace,
  known: ReadonlySet<string>,
): CheckpointView | null {
  const node = currentNode(cfg, state);
  if (!node) return null;
  const step = state.trail.length;
  const foe = checkpointFoe(seed, cfg, step, node);
  const landmark = node.kind === 'landmark' ? route.landmarks.find((l) => l.id === node.landmark) : undefined;
  return {
    step,
    node: node.id,
    kind: node.kind,
    title: node.title,
    text: node.text,
    foe: foe ? foe.view : null,
    landmark: landmark ? { id: landmark.id, name: landmark.name, known: known.has(landmark.id) } : null,
    options: choicesFor(node).map((id) => ({ id, ...optionCopy(node, id, cfg, route) })),
  };
}

function fight(party: Creature[], foe: RolledWild, seed: string, step: number) {
  const r = simulateBattle(party, [foe.creature], battleSeed(seed, step), { foeStatMult: foe.statMult });
  return { won: r.winner === 'player', turns: r.turns, events: r.events };
}

/**
 * Resolve the current checkpoint with `choice`. Pure: returns the entry, the
 * next state, and whether the trip ended — or null when the choice is not one
 * the checkpoint offers.
 */
export function resolveStep(
  party: Creature[],
  seed: string,
  cfg: ActivityConfig,
  state: ExpeditionState,
  choice: ChoiceId,
): StepResolution | null {
  const node = currentNode(cfg, state);
  if (!node || !choicesFor(node).includes(choice)) return null;
  const step = state.trail.length;
  const foe = checkpointFoe(seed, cfg, step, node);
  const next: ExpeditionState = {
    ...state,
    trail: [...state.trail],
    seen: [...state.seen],
    landmarks: [...state.landmarks],
    newSeen: [...state.newSeen],
    newLandmarks: [...state.newLandmarks],
  };
  const base = { step, node: node.id, kind: node.kind, choice };
  let entry: TrailEntry;
  let terminal: StepResolution['terminal'] = null;
  let battle: StepResolution['battle'] = null;
  let landmark: string | null = null;
  let seen: number | null = foe ? foe.view.dexId : null;

  if (choice === 'retreat') {
    entry = { ...base, outcome: 'retreated', ...(foe ? { foe: foe.view } : {}) };
    terminal = 'retreat';
  } else if (node.kind === 'fork') {
    const option = node.options.find((o) => o.id === choice);
    entry = { ...base, outcome: choice === 'a' ? 'took-a' : 'took-b' };
    next.node = option ? option.next : node.options[0].next;
  } else if (node.kind === 'sighting' && choice === 'observe') {
    entry = { ...base, outcome: 'observed', ...(foe ? { foe: foe.view } : {}) };
    next.node = node.next;
  } else if (node.kind === 'landmark') {
    if (choice === 'press-on') {
      entry = { ...base, outcome: 'passed' };
      next.node = node.next;
    } else {
      const guard = landmarkGuard(seed, cfg, step, node);
      if (guard) seen = guard.view.dexId;
      battle = guard ? fight(party, guard, seed, step) : null;
      if (guard && battle && !battle.won) {
        entry = { ...base, outcome: 'lost', foe: guard.view, turns: battle.turns };
        terminal = 'defeat';
      } else {
        entry = {
          ...base,
          outcome: 'found',
          landmark: node.landmark,
          ...(guard && battle ? { foe: guard.view, turns: battle.turns, expUnits: cfg.explore.expPerWin } : {}),
        };
        landmark = node.landmark;
        next.node = node.next;
      }
    }
  } else if (foe) {
    // A battle's fight, a sighting's challenge, or the guardian.
    battle = fight(party, foe, seed, step);
    if (!battle.won) {
      entry = { ...base, outcome: 'lost', foe: foe.view, turns: battle.turns };
      terminal = 'defeat';
    } else {
      entry = { ...base, outcome: 'won', foe: foe.view, turns: battle.turns, expUnits: cfg.explore.expPerWin };
      if (node.kind === 'guardian') terminal = 'complete';
      else if (node.kind === 'battle' || node.kind === 'sighting') next.node = node.next;
    }
  } else {
    return null;
  }

  next.trail.push(entry);
  if (battle?.won) next.wins += 1;
  next.expUnits += entry.expUnits ?? 0;
  if (seen !== null && !next.seen.includes(seen)) next.seen.push(seen);
  if (landmark !== null && !next.landmarks.includes(landmark)) next.landmarks.push(landmark);
  return { entry, state: next, terminal, battle, seen, landmark };
}

/** The event log of a battle already resolved at `entry`, recomputed for a retried request. */
export function replayBattle(party: Creature[], seed: string, cfg: ActivityConfig, entry: TrailEntry): BattleEvent[] | null {
  if (!Object.hasOwn(cfg.expedition.nodes, entry.node)) return null;
  const node = cfg.expedition.nodes[entry.node];
  let foe: RolledWild | null = null;
  if (node.kind === 'landmark') foe = entry.choice === 'investigate' ? landmarkGuard(seed, cfg, entry.step, node) : null;
  else if (entry.choice === 'fight' || entry.choice === 'challenge') foe = checkpointFoe(seed, cfg, entry.step, node);
  return foe ? fight(party, foe, seed, entry.step).events : null;
}
