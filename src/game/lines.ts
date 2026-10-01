import { EVOLUTIONS } from './evolutions.gen.js';
import { CREATURES_BY_ID } from './pokemon.js';

// Evolution-line geometry shared by evolution.ts and growth.ts. It lives apart
// from evolution.ts so growth.ts can read it without an import cycle.

// child → parent, derived once from the forward table.
const PRE_EVOLUTION: Record<number, number> = {};
for (const [parent, children] of Object.entries(EVOLUTIONS)) {
  for (const child of children) PRE_EVOLUTION[child] = Number(parent);
}

/** The species this one evolves from, or null for a base form. */
export function preEvolution(dexId: number): number | null {
  return PRE_EVOLUTION[dexId] ?? null;
}

/** Real, in-dex evolution targets for a species. */
export function evolutionTargets(dexId: number): number[] {
  return (EVOLUTIONS[dexId] ?? []).filter((id) => Boolean(CREATURES_BY_ID[String(id)]));
}

/** 0 for a base form, 1 for a middle stage, 2 for a final stage (of a 3-line). */
export function stageOf(dexId: number): number {
  let stage = 0;
  let cur = dexId;
  while (PRE_EVOLUTION[cur] !== undefined && stage < 8) {
    cur = PRE_EVOLUTION[cur];
    stage++;
  }
  return stage;
}

/**
 * Stages in this species' line: 1 for a single-stage species, 3 for Caterpie's.
 * Walks to the root, then forward along the first branch.
 */
export function lineLength(dexId: number): number {
  let root = dexId;
  for (let guard = 0; PRE_EVOLUTION[root] !== undefined && guard < 8; guard++) root = PRE_EVOLUTION[root];
  let length = 1;
  let cur = root;
  for (let guard = 0; guard < 8; guard++) {
    const next = evolutionTargets(cur)[0];
    if (next === undefined) break;
    length++;
    cur = next;
  }
  return length;
}
