import type { Opponent, PokemonType } from './types';
import { typeLabel } from './typechart';
import { RNG } from './rng';

// The road to Champion: 8 gym leaders → 1 Elite → 1 Champion. All 6v6.
export const GYM_COUNT = 8;

export const TIER_LABEL: Record<Opponent['tier'], string> = {
  gym: 'Gym',
  elite: 'Elite',
  champion: 'Champion',
};

const ALL_TYPES: PokemonType[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
  'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost',
  'dragon', 'dark', 'steel', 'fairy',
];

const TYPE_EMOJI: Record<PokemonType, string> = {
  normal: '🔘', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿',
  ice: '❄️', fighting: '🥊', poison: '☠️', ground: '⛰️', flying: '🕊️',
  psychic: '🔮', bug: '🐛', rock: '🪨', ghost: '👻', dragon: '🐉',
  dark: '🌑', steel: '⚙️', fairy: '✨',
};

// Real Paldea/SV Gym & League badge icons (see scripts/fetch-badges.mjs).
const ASSET = import.meta.env?.BASE_URL ?? '/';
const badgeUrl = (key: PokemonType | 'champion') =>
  `${ASSET}sprites/badges/${key}.png`;

// Real gym leaders from across the series — picked at random for each run.
const GYM_LEADERS = [
  'Brock', 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine',
  'Giovanni', 'Falkner', 'Bugsy', 'Whitney', 'Morty', 'Chuck', 'Jasmine',
  'Pryce', 'Clair', 'Roxanne', 'Brawly', 'Wattson', 'Flannery', 'Norman',
  'Winona', 'Tate', 'Liza', 'Wallace', 'Juan', 'Roark', 'Gardenia',
  'Maylene', 'Crasher Wake', 'Fantina', 'Byron', 'Candice', 'Volkner',
  'Cilan', 'Chili', 'Cress', 'Lenora', 'Burgh', 'Elesa', 'Clay', 'Skyla',
  'Brycen', 'Drayden', 'Roxie', 'Marlon', 'Viola', 'Grant', 'Korrina',
  'Ramos', 'Clemont', 'Valerie', 'Olympia', 'Wulfric', 'Milo', 'Nessa',
  'Kabu', 'Bea', 'Allister', 'Opal', 'Gordie', 'Melony', 'Piers', 'Raihan',
  'Katy', 'Brassius', 'Iono', 'Kofu', 'Larry', 'Ryme', 'Tulip', 'Grusha',
];

// Real Elite Four members from across the series.
const ELITE_TRAINERS = [
  'Lorelei', 'Bruno', 'Agatha', 'Lance', 'Will', 'Karen', 'Sidney',
  'Phoebe', 'Glacia', 'Drake', 'Aaron', 'Bertha', 'Flint', 'Lucian',
  'Shauntal', 'Marshal', 'Grimsley', 'Caitlin', 'Malva', 'Siebold',
  'Wikstrom', 'Drasna', 'Hala', 'Olivia', 'Acerola', 'Kahili', 'Molayne',
  'Rika', 'Poppy', 'Hassel',
];

// Famous Champions — the daily boss draws a name from here.
const CHAMPIONS = [
  'Blue', 'Red', 'Lance', 'Steven', 'Wallace', 'Cynthia', 'Alder', 'Iris',
  'Diantha', 'Kukui', 'Hau', 'Leon', 'Geeta', 'Nemona', 'Trace', 'Mustard',
];

const GYM_QUOTES = [
  'Show me what you’ve got!',
  'You won’t get past me that easily.',
  'My team has trained for this.',
  'Let’s see if you’re ready for the badge.',
  'I won’t hold back, challenger.',
  'This is my turf.',
];
const ELITE_QUOTES = [
  'Few make it this far. Fewer leave.',
  'The real battles begin now.',
  'I already know how this ends.',
  'Impress me, if you can.',
];
const CHAMP_QUOTES = [
  'Show me the team that earned its way here.',
  'Only the very best reach me. Prove it.',
  'Today, the crown is mine to defend.',
  'Let’s make this a battle to remember.',
];

/** Local YYYY-MM-DD key — the daily champion is shared by everyone that day. */
export function dailyKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Seed for the daily Champion (name + team), independent of the run seed. */
export function championSeed(d = new Date()): string {
  return `champion:${dailyKey(d)}`;
}

/** Build the daily Champion opponent (same for everyone on a given day). */
export function buildChampion(d = new Date()): Opponent {
  const rng = new RNG(championSeed(d));
  const type = rng.pick(ALL_TYPES);
  return {
    id: 'champion',
    name: rng.pick(CHAMPIONS),
    title: 'Champion',
    sprite: '👑',
    badge: badgeUrl('champion'),
    type,
    teamSize: 6,
    tier: 'champion',
    quote: rng.pick(CHAMP_QUOTES),
  };
}

/**
 * Build a full gauntlet from a run seed: 8 gym leaders (random names + random,
 * distinct type themes) and 1 Elite trainer (random name + theme). The final
 * Champion is the shared daily boss and ignores the run seed.
 */
export function buildGauntlet(seed: string, d = new Date()): Opponent[] {
  const rng = new RNG(`gauntlet:${seed}`);
  const themes = rng.shuffle(ALL_TYPES); // distinct themes for gyms + elite
  const leaders = rng.shuffle(GYM_LEADERS);

  const gyms: Opponent[] = Array.from({ length: GYM_COUNT }, (_, i) => {
    const type = themes[i];
    return {
      id: `gym-${i}-${type}`,
      name: leaders[i],
      title: `${typeLabel(type)} Gym Leader`,
      sprite: TYPE_EMOJI[type],
      badge: badgeUrl(type),
      type,
      teamSize: 6,
      tier: 'gym' as const,
      quote: rng.pick(GYM_QUOTES),
    };
  });

  const eliteType = themes[GYM_COUNT];
  const elite: Opponent = {
    id: `elite-${eliteType}`,
    name: rng.pick(ELITE_TRAINERS),
    title: `Elite — ${typeLabel(eliteType)}`,
    sprite: TYPE_EMOJI[eliteType],
    badge: badgeUrl(eliteType),
    type: eliteType,
    teamSize: 6,
    tier: 'elite',
    quote: rng.pick(ELITE_QUOTES),
  };

  return [...gyms, elite, buildChampion(d)];
}
