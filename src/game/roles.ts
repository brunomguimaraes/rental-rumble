import type { BaseStats, Role } from './types';
import type { RNG } from './rng';

export const ALL_ROLES: Role[] = ['Sweeper', 'Bruiser', 'Tank', 'Support'];

export interface RoleSpread {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

// Nature/EV-style tilts applied on top of base stats. Kept gentle so the
// choice matters without swinging balance wildly.
export const ROLE_SPREAD: Record<Role, RoleSpread> = {
  Sweeper: { hp: 0.95, atk: 1.06, def: 0.9, spd: 1.12 },
  Bruiser: { hp: 1.0, atk: 1.12, def: 1.0, spd: 0.96 },
  Tank: { hp: 1.12, atk: 0.9, def: 1.12, spd: 0.88 },
  Support: { hp: 1.05, atk: 0.97, def: 1.05, spd: 1.0 },
};

export const ROLE_INFO: Record<Role, { glyph: string; tagline: string }> = {
  Sweeper: { glyph: '⚔️', tagline: 'Faster & harder-hitting, but frail.' },
  Bruiser: { glyph: '💥', tagline: 'Raw power with average bulk.' },
  Tank: { glyph: '🛡️', tagline: 'Extra-bulky and learns Recover; hits softer.' },
  Support: { glyph: '✨', tagline: 'Well-rounded with utility moves.' },
};

/** Is a stat line too frail to ever tank? */
function isFrail(s: BaseStats): boolean {
  return s.hp <= 70 && s.def <= 78;
}

/** Per-role suitability score (used for ordering / picking a default). */
function fit(role: Role, s: BaseStats): number {
  switch (role) {
    case 'Sweeper':
      return s.spd * 1.0 + s.atk * 0.6;
    case 'Bruiser':
      return s.atk * 1.0 + (s.hp + s.def) * 0.15;
    case 'Tank':
      return (s.hp + s.def) * 1.0 - s.spd * 0.2;
    case 'Support':
      return 0.5 * (s.atk + s.def) + 0.4 * s.hp + 0.3 * s.spd;
  }
}

/**
 * Roles a Pokémon may take, given its stats, ordered best-fit first.
 * Always returns at least one (Support is the universal fallback).
 * Constraints: frail mons can't Tank, slow mons can't Sweep, weak mons can't
 * be offensive Bruisers/Sweepers.
 */
export function eligibleRoles(s: BaseStats): Role[] {
  const roles: Role[] = ['Support'];

  if (s.spd >= 90 && s.atk >= 85) roles.push('Sweeper');
  if (s.atk >= 95) roles.push('Bruiser');
  if (!isFrail(s) && (s.hp >= 85 || s.def >= 98)) roles.push('Tank');

  return [...new Set(roles)].sort((a, b) => fit(b, s) - fit(a, s));
}

export function defaultRole(s: BaseStats): Role {
  return eligibleRoles(s)[0];
}

// Probability of landing on the Nth-best eligible role. Most Pokémon end up in
// their natural role, but a minority get a twist — this is the draft variance.
const RANK_WEIGHTS = [0.6, 0.25, 0.11, 0.04];

/**
 * Seeded auto-assignment of a role for the draft. Weighted toward the best-fit
 * role (≈60%) but occasionally picks a secondary eligible role, so the same
 * Pokémon can show up built differently from run to run. Never picks a role the
 * stats can't support (eligibleRoles already filters those out).
 */
export function rollRole(s: BaseStats, rng: RNG): Role {
  const roles = eligibleRoles(s);
  if (roles.length === 1) return roles[0];
  const weights = roles.map((_, i) => RANK_WEIGHTS[i] ?? 0.02);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < roles.length; i++) {
    r -= weights[i];
    if (r <= 0) return roles[i];
  }
  return roles[0];
}
