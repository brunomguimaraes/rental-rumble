import type { Opponent, OpponentTier, PokemonType } from './types';
import { TYPE_COLORS, typeLabel } from './typechart';
import { RNG } from './rng';
import { GAUNTLET_SHAPE, type Difficulty } from './run';
import { TRAINER_SPRITES, type TrainerCategory } from './trainers.gen';
import { artGender, artName, genderMatches, type Gender } from './trainers.meta';

export const TIER_LABEL: Record<OpponentTier, string> = {
  trainer: 'Trainer',
  gym: 'Gym',
  elite: 'Elite',
  champion: 'Champion',
};

// Gym Leaders and the Elite specialize in a type. The Champion does not — it
// fields a randomized, all-rounder team, so it gets a neutral rank accent.
const TIER_ACCENT: Partial<Record<OpponentTier, string>> = {
  champion: '#f5c542',
};

/** Whether this opponent is built around a single type (everyone but Champion). */
export function isTypeThemed(opp: Opponent): boolean {
  return opp.tier !== 'champion';
}

/** Accent color for an opponent: its type color, or a neutral rank color. */
export function opponentAccent(opp: Opponent): string {
  return TIER_ACCENT[opp.tier] ?? TYPE_COLORS[opp.type];
}

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

const ASSET = import.meta.env?.BASE_URL ?? '/';

// Real Paldea/SV Gym & League badge icons (see scripts/fetch-badges.mjs).
const badgeUrl = (key: PokemonType | 'champion') =>
  `${ASSET}sprites/badges/${key}.png`;

// Overworld trainer sprites (see scripts/build-trainers.mjs).
const artUrl = (key: string) => `${ASSET}sprites/trainers/${key}.png`;
const gifUrl = (key: string) => `${ASSET}sprites/trainers/${key}.gif`;

/** Resolve a possibly-neutral sex to a concrete one so name/class/art agree. */
function concreteGender(rng: RNG, g: Gender): Gender {
  return g === 'x' ? (rng.next() < 0.5 ? 'm' : 'f') : g;
}

/**
 * Pick a roadside sprite whose sex is acceptable for `want` (neutral art
 * matches anyone). Falls back to the whole pool if nothing matches, so a
 * missing metadata entry degrades to the old behaviour instead of crashing.
 */
function pickSpriteForGender(
  rng: RNG,
  cat: TrainerCategory,
  want: Gender,
): string {
  const pool = TRAINER_SPRITES[cat].filter((k) =>
    genderMatches(artGender(k), want),
  );
  return rng.pick(pool.length ? pool : [...TRAINER_SPRITES[cat]]);
}

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

// Roadside "random" trainers: a class (the title) + a given name. Both carry a
// sex so we can hand them a matching overworld sprite ('x' = unisex). A "Lass"
// is never drawn over a male body, and "Beth the Beauty" never wears one either.
interface Person {
  name: string;
  g: Gender;
}

const TRAINER_CLASSES: Person[] = [
  { name: 'Youngster', g: 'm' }, { name: 'Lass', g: 'f' },
  { name: 'Bug Catcher', g: 'm' }, { name: 'Hiker', g: 'm' },
  { name: 'Beauty', g: 'f' }, { name: 'Ace Trainer', g: 'x' },
  { name: 'Black Belt', g: 'm' }, { name: 'Psychic', g: 'x' },
  { name: 'Picnicker', g: 'f' }, { name: 'Camper', g: 'm' },
  { name: 'Fisherman', g: 'm' }, { name: 'Sailor', g: 'm' },
  { name: 'Roughneck', g: 'm' }, { name: 'Rich Boy', g: 'm' },
  { name: 'Lady', g: 'f' }, { name: 'Veteran', g: 'x' },
  { name: 'Scientist', g: 'x' }, { name: 'Ranger', g: 'x' },
  { name: 'Swimmer', g: 'x' }, { name: 'Dancer', g: 'x' },
  { name: 'Artist', g: 'x' }, { name: 'Guitarist', g: 'm' },
  { name: 'Breeder', g: 'x' }, { name: 'Schoolkid', g: 'x' },
  { name: 'Gentleman', g: 'm' }, { name: 'Cooltrainer', g: 'x' },
  { name: 'Hex Maniac', g: 'f' }, { name: 'Bird Keeper', g: 'm' },
  { name: 'Tamer', g: 'm' },
];

const TRAINER_NAMES: Person[] = [
  { name: 'Joey', g: 'm' }, { name: 'Mikey', g: 'm' },
  { name: 'Calvin', g: 'm' }, { name: 'Tristan', g: 'm' },
  { name: 'Vincent', g: 'm' }, { name: 'Liam', g: 'm' },
  { name: 'Haley', g: 'f' }, { name: 'Janine', g: 'f' },
  { name: 'Dahlia', g: 'f' }, { name: 'Reed', g: 'm' },
  { name: 'Cole', g: 'm' }, { name: 'Bridget', g: 'f' },
  { name: 'Owen', g: 'm' }, { name: 'Marcus', g: 'm' },
  { name: 'Beth', g: 'f' }, { name: 'Nico', g: 'x' },
  { name: 'Kira', g: 'f' }, { name: 'Sam', g: 'x' },
  { name: 'Reli', g: 'x' }, { name: 'Tara', g: 'f' },
  { name: 'Devon', g: 'm' }, { name: 'Polly', g: 'f' },
  { name: 'Gus', g: 'm' }, { name: 'Hana', g: 'f' },
  { name: 'Wade', g: 'm' }, { name: 'Ivy', g: 'f' },
  { name: 'Otto', g: 'm' }, { name: 'Rena', g: 'f' },
  { name: 'Pike', g: 'x' }, { name: 'June', g: 'f' },
  { name: 'Theo', g: 'm' }, { name: 'Mara', g: 'f' },
  { name: 'Felix', g: 'm' }, { name: 'Lola', g: 'f' },
];

const TRAINER_QUOTES = [
  'Hey, you! Let’s battle!',
  'I’ve been training all week for this!',
  'You can’t just walk past me!',
  'My team’s tougher than it looks.',
  'A battle? Don’t mind if I do!',
  'I won’t lose — not today!',
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
  // The art is a specific person — let it name the Champion (fallback for any
  // sprite we haven't identified yet).
  const sprite = rng.pick([...TRAINER_SPRITES.champion]);
  return {
    id: 'champion',
    name: artName(sprite) ?? rng.pick(CHAMPIONS),
    title: 'Champion',
    sprite: '👑',
    badge: badgeUrl('champion'),
    art: artUrl(sprite),
    artGif: gifUrl(sprite),
    type,
    teamSize: 6,
    tier: 'champion',
    quote: rng.pick(CHAMP_QUOTES),
  };
}

/**
 * Build a full gauntlet from a run seed and difficulty. The ladder ramps:
 * a handful of random roadside trainers, then type-themed Gym Leaders, then
 * one or two Elite trainers, capped by the shared daily Champion. Counts come
 * from GAUNTLET_SHAPE; the Champion specializes in no type and ignores the run
 * seed (it's the same daily boss for everyone).
 */
export function buildGauntlet(
  seed: string,
  difficulty: Difficulty = 'normal',
  d = new Date(),
): Opponent[] {
  const rng = new RNG(`gauntlet:${seed}:${difficulty}`);
  const shape = GAUNTLET_SHAPE[difficulty];

  // Distinct type themes for the named leaders + elite trainers.
  const themes = rng.shuffle(ALL_TYPES);
  const names = rng.shuffle(TRAINER_NAMES);
  // Each famous sprite *is* a specific person, so we hand out distinct sprites
  // and let the art decide the name. The shuffled name lists are only a
  // fallback for any sprite we haven't identified in trainers.meta.ts.
  const leaders = rng.shuffle(GYM_LEADERS);
  const elites = rng.shuffle(ELITE_TRAINERS);
  const gymSprites = rng.shuffle([...TRAINER_SPRITES.gym]);
  const eliteSprites = rng.shuffle([...TRAINER_SPRITES.elite]);
  let themeCursor = 0;

  // Random roadside trainers: small, type-themed warm-up fights. The name sets
  // the sex; the class and overworld sprite are then chosen to match it.
  const trainers: Opponent[] = Array.from({ length: shape.trainers }, (_, i) => {
    const type = rng.pick(ALL_TYPES);
    const person = names[i % names.length];
    const g = concreteGender(rng, person.g);
    const klass = rng.pick(TRAINER_CLASSES.filter((c) => genderMatches(c.g, g)));
    const sprite = pickSpriteForGender(rng, 'random', g);
    return {
      id: `trainer-${i}`,
      name: person.name,
      title: klass.name,
      sprite: TYPE_EMOJI[type],
      badge: badgeUrl(type),
      art: artUrl(sprite),
      artGif: gifUrl(sprite),
      type,
      teamSize: 3,
      tier: 'trainer' as const,
      quote: rng.pick(TRAINER_QUOTES),
    };
  });

  // Gym Leaders: full 6-mon, type-themed teams. The displayed leader is whoever
  // the sprite depicts (e.g. the cowboy is always Clay).
  const gyms: Opponent[] = Array.from({ length: shape.gyms }, (_, i) => {
    const type = themes[themeCursor++];
    const sprite = gymSprites[i % gymSprites.length];
    return {
      id: `gym-${i}-${type}`,
      name: artName(sprite) ?? leaders[i % leaders.length],
      title: `${typeLabel(type)} Gym Leader`,
      sprite: TYPE_EMOJI[type],
      badge: badgeUrl(type),
      art: artUrl(sprite),
      artGif: gifUrl(sprite),
      type,
      teamSize: 6,
      tier: 'gym' as const,
      quote: rng.pick(GYM_QUOTES),
    };
  });

  // Elite trainer(s) — likewise named after the character in the art.
  const elite: Opponent[] = Array.from({ length: shape.elites }, (_, i) => {
    const type = themes[themeCursor++];
    const sprite = eliteSprites[i % eliteSprites.length];
    return {
      id: `elite-${i}-${type}`,
      name: artName(sprite) ?? elites[i % elites.length],
      title: `Elite — ${typeLabel(type)}`,
      sprite: TYPE_EMOJI[type],
      badge: badgeUrl(type),
      art: artUrl(sprite),
      artGif: gifUrl(sprite),
      type,
      teamSize: 6,
      tier: 'elite' as const,
      quote: rng.pick(ELITE_QUOTES),
    };
  });

  return [...trainers, ...gyms, ...elite, buildChampion(d)];
}
