// Curated metadata for the overworld trainer sprites in trainers.gen.ts.
//
// trainers.gen.ts is AUTO-GENERATED and only knows opaque keys (`gym-03`); it
// carries no notion of who a sprite depicts or its sex. That caused two bugs:
//   1. sprites whose sex didn't match the trainer's name/class, and
//   2. famous, instantly-recognisable characters (Alder, Elesa, Clay, …) being
//      shown under unrelated names because the name and the art were two
//      independent random draws.
//
// This file pins that down. Every sprite key gets a `gender`, and the
// "famous" tiers (gym / elite / champion) also get the canonical `name` of the
// character the art actually depicts, so the displayed name follows the sprite
// instead of being rolled separately. opponents.ts consumes this to (a) bind
// famous names to their real art and (b) only hand a roadside trainer a sprite
// whose sex matches their name and class.
//
// The famous-tier `name`s below are best-effort visual identifications of the
// Gen-5/Unova-style source rips — if any are wrong, just fix the name here and
// the whole app follows. Run `node scripts/audit-trainers.ts` to eyeball them.

export type Gender = 'm' | 'f' | 'x'; // 'x' = ambiguous/neutral, matches anyone

export interface TrainerArt {
  gender: Gender;
  /** Canonical character depicted (famous tiers only); roadside art is generic. */
  name?: string;
}

export const TRAINER_ART: Record<string, TrainerArt> = {
  // --- Champions: the daily boss is one of these specific people. -----------
  'champion-01': { gender: 'm', name: 'Alder' },
  'champion-02': { gender: 'f', name: 'Iris' },

  // --- Elite Four (Unova). --------------------------------------------------
  'elite-01': { gender: 'f', name: 'Shauntal' },
  'elite-02': { gender: 'm', name: 'Grimsley' },
  'elite-03': { gender: 'f', name: 'Caitlin' },
  'elite-04': { gender: 'm', name: 'Marshal' },

  // --- Gym Leaders (Unova). -------------------------------------------------
  'gym-01': { gender: 'm', name: 'Chili' },
  'gym-02': { gender: 'f', name: 'Lenora' },
  'gym-03': { gender: 'm', name: 'Burgh' },
  'gym-04': { gender: 'f', name: 'Elesa' },
  'gym-05': { gender: 'm', name: 'Clay' },
  'gym-06': { gender: 'f', name: 'Skyla' },
  'gym-07': { gender: 'm', name: 'Brycen' },
  'gym-08': { gender: 'm', name: 'Drayden' },
  'gym-09': { gender: 'm', name: 'Cheren' },
  'gym-10': { gender: 'f', name: 'Opal' },
  'gym-11': { gender: 'm', name: 'Marlon' },

  // --- Roadside "random" trainers: generic classes, sex only. ---------------
  'random-00': { gender: 'x' },
  'random-01': { gender: 'f' },
  'random-02': { gender: 'm' },
  'random-03': { gender: 'f' },
  'random-04': { gender: 'f' },
  'random-05': { gender: 'f' },
  'random-06': { gender: 'm' },
  'random-07': { gender: 'f' },
  'random-08': { gender: 'm' },
  'random-09': { gender: 'm' },
  'random-10': { gender: 'm' },
  'random-11': { gender: 'm' },
  'random-12': { gender: 'm' },
  'random-13': { gender: 'f' },
  'random-14': { gender: 'm' },
  'random-15': { gender: 'f' },
  'random-16': { gender: 'm' },
  'random-17': { gender: 'f' },
  'random-18': { gender: 'm' },
  'random-19': { gender: 'm' },
  'random-20': { gender: 'm' },
  'random-21': { gender: 'm' },
  'random-22': { gender: 'f' },
  'random-23': { gender: 'm' },
  'random-24': { gender: 'm' },
  'random-25': { gender: 'm' },
  'random-26': { gender: 'm' },
  'random-27': { gender: 'm' },
  'random-28': { gender: 'm' },
  'random-29': { gender: 'f' },
  'random-30': { gender: 'm' },
  'random-31': { gender: 'f' },
  'random-32': { gender: 'm' },
  'random-33': { gender: 'f' },
  'random-34': { gender: 'm' },
  'random-35': { gender: 'm' },
  'random-36': { gender: 'f' },
  'random-37': { gender: 'm' },
  'random-38': { gender: 'x' },
  'random-39': { gender: 'm' },
};

/** Sex of a sprite key (defaults to neutral if we have no record of it). */
export function artGender(key: string): Gender {
  return TRAINER_ART[key]?.gender ?? 'x';
}

/** Canonical character name a sprite depicts, if it is a famous-tier rip. */
export function artName(key: string): string | undefined {
  return TRAINER_ART[key]?.name;
}

/** Whether a sprite of sex `have` is acceptable for a trainer wanting `want`. */
export function genderMatches(have: Gender, want: Gender): boolean {
  return have === 'x' || want === 'x' || have === want;
}
