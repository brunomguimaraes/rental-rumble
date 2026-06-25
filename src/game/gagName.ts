// A throwaway "gag name" for the Hall of Shame. When a defeated player can't be
// bothered to type a name, we still want their flop immortalised — so instead of
// a sad "Anonymous" we mint a goofy, on-theme alias like "Sir Faintsalot" or
// "Soggy Magikarp". Pure and seedable so the same lost run always yields the same
// name (stable across reloads) and so it runs identically in the browser and on
// the serverless function.

import { RNG } from './rng.js';

// Mock-heroic honourifics — the funnier the title, the harder the fall.
const TITLES = [
  'Sir',
  'Captain',
  'Lord',
  'Lady',
  'Baron',
  'Dr.',
  'Professor',
  'King',
  'Queen',
  'Chief',
  'Madame',
  'Count',
  'General',
  'Coach',
] as const;

// Surnames that wear the defeat on their sleeve.
const SURNAMES = [
  'Faintsalot',
  'Whiffington',
  'Wipeout',
  'Benchwarmer',
  'Choke-a-lot',
  'Missington',
  'Glasscannon',
  'Onehitko',
  'Ragequit',
  'Forfeiter',
  'Tripsworth',
  'Sweepable',
  'Critdodger',
  'Fumblebee',
  'Nopington',
  'Splashalot',
  'Pushover',
  'Lastplace',
] as const;

// Adjectives of misfortune.
const ADJECTIVES = [
  'Soggy',
  'Fainted',
  'Benched',
  'Tragic',
  'Hapless',
  'Doomed',
  'Crispy',
  'Salty',
  'Washed-Up',
  'Confused',
  'Paralyzed',
  'Toasted',
  'Frozen',
  'Cursed',
  'Sleepy',
  'Flinchy',
  'Wobbly',
  'Clumsy',
] as const;

// Nouns that pair with the adjectives — the easiest mons to dunk on plus a few
// "you, specifically" zingers.
const NOUNS = [
  'Magikarp',
  'Bidoof',
  'Wurmple',
  'Sunkern',
  'Feebas',
  'Zubat',
  'Rookie',
  'Underdog',
  'Rival',
  'Nobody',
  'Trainer',
  'Greenhorn',
  'Pushover',
  'Casualty',
  'Disaster',
  'Benchwarmer',
] as const;

// Roman numerals (a "Sir Whiffington III" implies a proud dynasty of losing).
const NUMERALS = ['II', 'III', 'IV', 'V', 'IX', 'XL'] as const;

/**
 * Mint a goofy alias. Pass a `seed` (e.g. the run seed) for a deterministic,
 * reproducible name; omit it for a fresh random one. Always trimmed to the
 * board's 24-char display cap.
 */
export function gagName(seed?: string): string {
  const rng = new RNG(
    seed !== undefined ? `gag:${seed}` : Math.floor(Math.random() * 0xffffffff),
  );

  let name: string;
  switch (rng.int(0, 3)) {
    case 0:
      // "Captain Faintsalot"
      name = `${rng.pick(TITLES)} ${rng.pick(SURNAMES)}`;
      break;
    case 1:
      // "Soggy Magikarp"
      name = `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)}`;
      break;
    case 2:
      // "Sir Whiffington III" — a storied lineage of defeat
      name = `${rng.pick(TITLES)} ${rng.pick(SURNAMES)} ${rng.pick(NUMERALS)}`;
      break;
    default:
      // "Benched Bidoof #0404"
      name = `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)} #${rng
        .int(0, 9999)
        .toString()
        .padStart(4, '0')}`;
  }

  return name.slice(0, 24);
}
