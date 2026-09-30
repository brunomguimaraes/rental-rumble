import type { MintSpec } from './box.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { RNG } from './rng.js';
import { rollIdentity } from './identity.js';

// The role-play frame. A profession is the lens the game is played through;
// only the trainer route ships, the rest are locked teasers so the data model
// reserves room for them. One professor offers each new trainer three weak,
// three-stage lines drawn from a pool of ten; the trainer keeps one.

const ASSET = import.meta.env?.BASE_URL ?? '/';

export type ProfessionId = 'trainer' | 'breeder' | 'ranger' | 'researcher';

export interface Profession {
  id: ProfessionId;
  name: string;
  blurb: string;
  locked: boolean;
}

export const PROFESSIONS: readonly Profession[] = [
  { id: 'trainer', name: 'Trainer', blurb: 'Battle wild Pokémon on the road and catch the ones you beat.', locked: false },
  { id: 'breeder', name: 'Breeder', blurb: 'Raise eggs and affection; hatch instead of catch.', locked: true },
  { id: 'ranger', name: 'Ranger', blurb: 'Patrol routes and befriend the rare and the shy.', locked: true },
  { id: 'researcher', name: 'Researcher', blurb: 'Survey zones for dex entries and rare colours.', locked: true },
];

export function isProfessionId(v: unknown): v is ProfessionId {
  return typeof v === 'string' && PROFESSIONS.some((p) => p.id === v);
}

/** Mentor ids ever stored on a profile. New trainers meet Andre. */
export type ProfessorId = 'andre' | 'oak' | 'elm' | 'birch' | 'rowan';

export interface Professor {
  id: ProfessorId;
  name: string;
  blurb: string;
  /** Key under public/sprites/trainers, or null for the generic fallback. */
  spriteKey: string | null;
  /** Custom art outside the generated trainer sprite directory. */
  artPath?: string;
}

export const PROFESSORS: readonly Professor[] = [
  {
    id: 'andre',
    name: 'Professor Andre',
    blurb: 'Every stone has a story! I study rocks and fossils, but your first partner is no fossil. Choose a little Pokémon and discover how far you can grow together.',
    spriteKey: null,
    artPath: 'sprites/professors/andre.png',
  },
];

// Keep existing players’ mentor names intact without offering retired mentors.
const RETIRED_PROFESSORS: readonly Professor[] = [
  {
    id: 'oak',
    name: 'Professor Oak',
    blurb: 'The Kanto classic. Three Poké Balls on the desk, and none of them hold anything strong. Pick the one you want to grow with.',
    spriteKey: 'special-oak',
  },
];

/** Base forms of the ten weak, three-stage lines a new trainer can be offered. */
export const STARTER_POOL: readonly number[] = [
  10, // Caterpie
  13, // Weedle
  16, // Pidgey
  43, // Oddish
  60, // Poliwag
  74, // Geodude
  179, // Mareep
  187, // Hoppip
  270, // Lotad
  396, // Starly
];

export const STARTER_OFFER_SIZE = 3;
export const STARTER_LEVEL = 5;

export function professorById(id: unknown): Professor | null {
  return PROFESSORS.find((p) => p.id === id) ?? RETIRED_PROFESSORS.find((p) => p.id === id) ?? null;
}

/** The three dex ids of a starter line, first branch on a fork. */
export function starterLine(baseDexId: number): number[] {
  const line = [baseDexId];
  let cur = baseDexId;
  for (let i = 0; i < 2; i++) {
    const next = (EVOLUTIONS[cur] ?? []).find((id) => Boolean(CREATURES_BY_ID[String(id)]));
    if (next === undefined) break;
    line.push(next);
    cur = next;
  }
  return line;
}

/** Front-facing art for the professor card (generic professor when no sprite). */
export function professorArtUrl(p: Professor): string {
  if (p.artPath) return `${ASSET}${p.artPath}`;
  return `${ASSET}sprites/trainers/${p.spriteKey ?? 'special-oak'}.png`;
}

/**
 * The three distinct pool lines offered to an account, in pool order.
 * Deterministic per seed (use `offer:${uid}`), so client and server agree and
 * a reload shows the same three.
 */
export function starterOffer(seed: string): number[] {
  const rng = new RNG(`starter-offer:${seed}`);
  const pool = [...STARTER_POOL];
  const picked = new Set<number>();
  while (picked.size < STARTER_OFFER_SIZE) picked.add(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return STARTER_POOL.filter((id) => picked.has(id));
}

/**
 * The starter an account gets for picking `dexId`, or null when that line was
 * not in its offer. Deterministic per account and pick, so a retried
 * onboarding mints the same individual.
 */
export function starterFromOffer(uid: string, dexId: unknown): MintSpec | null {
  if (typeof dexId !== 'number' || !starterOffer(`offer:${uid}`).includes(dexId)) return null;
  const species = CREATURES_BY_ID[String(dexId)];
  if (!species) return null;
  const rng = new RNG(`starter:${uid}:${dexId}`);
  return { dexId: species.dexId, level: STARTER_LEVEL, ...rollIdentity(species, rng) };
}
