import type { Creature, Role } from './types';
import { RAW_DEX } from './pokedex.gen';
import { movesFor } from './moves';
import { defaultRole, eligibleRoles } from './roles';

export function spriteUrl(dexId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexId}.png`;
}

export const CREATURES: Creature[] = RAW_DEX.map((e) => {
  const role = defaultRole(e.stats);
  return {
    id: String(e.id),
    dexId: e.id,
    name: e.name,
    sprite: spriteUrl(e.id),
    types: e.types,
    role,
    eligibleRoles: eligibleRoles(e.stats),
    stats: e.stats,
    moves: movesFor(e.types, role),
  };
});

export const CREATURES_BY_ID: Record<string, Creature> = Object.fromEntries(
  CREATURES.map((c) => [c.id, c]),
);

export function getCreature(id: string): Creature {
  const c = CREATURES_BY_ID[id];
  if (!c) throw new Error(`Unknown creature: ${id}`);
  return c;
}

/** Return a copy of the creature playing a different (eligible) role. */
export function withRole(creature: Creature, role: Role): Creature {
  if (creature.role === role) return creature;
  return { ...creature, role, moves: movesFor(creature.types, role) };
}
