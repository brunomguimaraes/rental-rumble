import type { MintSpec } from './box.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { EVOLUTIONS } from './evolutions.gen.js';
import { RNG } from './rng.js';
import { rollIdentity } from './identity.js';

// The role-play frame. A profession is the lens the game is played through;
// only the trainer route ships in slice 1, the rest are locked teasers so the
// data model reserves room for them. A professor hands the trainer a fixed,
// weak, three-stage starter — the choice is about story, not stats.

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

export type ProfessorId = 'oak' | 'elm' | 'birch' | 'rowan';

export interface Professor {
  id: ProfessorId;
  name: string;
  blurb: string;
  /** One line on what this mentor's route feels like. Flavour only in slice 1. */
  bias: string;
  starterDexId: number;
  /** Key under public/sprites/trainers, or null for the generic fallback. */
  spriteKey: string | null;
}

export const PROFESSORS: readonly Professor[] = [
  {
    id: 'oak',
    name: 'Professor Oak',
    blurb: 'The Kanto classic. Hands you a Caterpie and a pat on the back.',
    bias: 'Classic routes; balanced encounters',
    starterDexId: 10,
    spriteKey: 'special-oak',
  },
  {
    id: 'elm',
    name: 'Professor Elm',
    blurb: 'Nervous, brilliant, and convinced Hoppip is underrated.',
    bias: 'Grass and Flying lean; gentler affection curve later',
    starterDexId: 187,
    spriteKey: 'special-elm',
  },
  {
    id: 'birch',
    name: 'Professor Birch',
    blurb: 'Field researcher. Your Wurmple\'s final form is a roll of the dice.',
    bias: 'Branching evolution; the branch is luck',
    starterDexId: 265,
    spriteKey: null,
  },
  {
    id: 'rowan',
    name: 'Professor Rowan',
    blurb: 'Stern, precise. Starly grows into the strongest of the four.',
    bias: 'Faster early battles; strongest final form',
    starterDexId: 396,
    spriteKey: null,
  },
];

export const STARTER_LEVEL = 5;

export function isProfessorId(v: unknown): v is ProfessorId {
  return typeof v === 'string' && PROFESSORS.some((p) => p.id === v);
}

export function professorById(id: unknown): Professor | null {
  return PROFESSORS.find((p) => p.id === id) ?? null;
}

/** The three dex ids of a professor's starter line, first branch on a fork. */
export function starterLine(p: Professor): number[] {
  const line = [p.starterDexId];
  let cur = p.starterDexId;
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
  return `${ASSET}sprites/trainers/${p.spriteKey ?? 'special-oak'}.png`;
}

/**
 * The starter a professor hands over. Deterministic for a seed (use
 * `starter:${uid}` so a retried onboarding mints the same individual).
 */
export function rollStarter(seed: string, p: Professor): MintSpec {
  const species = CREATURES_BY_ID[String(p.starterDexId)];
  const rng = new RNG(`starter:${seed}:${p.id}`);
  return { dexId: species.dexId, level: STARTER_LEVEL, ...rollIdentity(species, rng) };
}
