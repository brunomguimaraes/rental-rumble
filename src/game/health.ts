import { creatureMaxHp } from './battle.js';
import { ownedMonToCreature, type OwnedMon } from './box.js';
import type { FieldedMember } from './route-actions.js';

// Persistent HP between battles. The engine owns max HP; an owned Pokémon only
// stores the damage it carries, so growth raises current HP with max HP. Pure:
// no clock, no I/O, shared by the server and the screens.

/** Max HP exactly as a route battle sees this individual; 0 for an unknown species. */
export function ownedMaxHp(mon: OwnedMon): number {
  const creature = ownedMonToCreature(mon);
  return creature ? creatureMaxHp(creature) : 0;
}

/** Damage carried, never negative; rows from before persistent HP carry none. */
export function hpLost(mon: OwnedMon): number {
  const n = mon.hpLost ?? 0;
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function currentHp(mon: OwnedMon): number {
  return Math.max(0, ownedMaxHp(mon) - hpLost(mon));
}

export function isFainted(mon: OwnedMon): boolean {
  return currentHp(mon) === 0;
}

export function isHurt(mon: OwnedMon): boolean {
  return hpLost(mon) > 0;
}

/** After a battle: does any party member still stand? Fielded members use their final HP. */
export function partyStanding(party: readonly OwnedMon[], fielded: readonly FieldedMember[]): boolean {
  const after = new Map(fielded.map((f) => [f.id, f.hp]));
  return party.some((m) => (after.get(m.id) ?? currentHp(m)) > 0);
}

/** How an HP bar reads: classic green, amber at half of max or less, red at a fifth or less, then fainted. */
export type HpTone = 'healthy' | 'low' | 'critical' | 'fainted';

export function hpTone(hp: number, max: number): HpTone {
  if (hp <= 0 || max <= 0) return 'fainted';
  if (hp * 5 <= max) return 'critical';
  if (hp * 2 <= max) return 'low';
  return 'healthy';
}
