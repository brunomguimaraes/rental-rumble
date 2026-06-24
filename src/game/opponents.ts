import type { Opponent, OpponentTier, PokemonType } from './types.js';
import { TYPE_COLORS, typeLabel } from './typechart.js';
import { RNG } from './rng.js';
import { GAUNTLET_SHAPE, type Difficulty } from './run.js';
import type { BracketId } from './gens.js';
import {
  TRAINER_SPRITES,
  type TrainerCategory,
  type TrainerGender,
  type TrainerSprite,
} from './trainers.gen.js';
import {
  famousForSlot,
  famousSpriteKey,
  rollBonusChallenge,
  rollSpecialPool,
  type FamousTrainer,
} from './specials.js';

export const TIER_LABEL: Record<OpponentTier, string> = {
  trainer: 'Trainer',
  gym: 'Gym',
  elite: 'Elite',
  special: 'Special',
  champion: 'Champion',
};

// Gym Leaders and the Elite specialize in a type. The Champion does not — it
// fields a randomized, all-rounder team, so it gets a neutral rank accent.
// "Special" cameo trainers keep their type badge but get a distinct rose glow so
// a famous face (James, Misty, Gary, …) reads as a stand-out fight on the ladder.
const TIER_ACCENT: Partial<Record<OpponentTier, string>> = {
  champion: '#f5c542',
  special: '#fb7185',
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

/** Whether a sprite of sex `have` is acceptable for a trainer wanting `want`. */
function genderMatches(have: TrainerGender, want: TrainerGender): boolean {
  return have === 'x' || want === 'x' || have === want;
}

/** A drawer that hands out distinct sprites from a category pool (no repeats
 *  until the pool is exhausted), optionally constrained to a sex. */
function spriteDrawer(rng: RNG, cat: TrainerCategory) {
  const remaining = rng.shuffle([...TRAINER_SPRITES[cat]]);
  return (want: TrainerGender = 'x'): TrainerSprite => {
    const idx = remaining.findIndex((s) => genderMatches(s.gender, want));
    const pick = idx >= 0 ? remaining.splice(idx, 1)[0] : remaining.shift();
    // Pool exhausted (more opponents than sprites): fall back to a fresh draw.
    return pick ?? rng.pick(TRAINER_SPRITES[cat]);
  };
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

// Roadside "random" trainers: the class title comes from the chosen sprite (so
// it always matches the art), and we pair it with a given name of the same sex
// ('x' = unisex). A "Lass" is never drawn over a male body, nor "Beth" over one.
interface Person {
  name: string;
  g: TrainerGender;
}

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

/**
 * UTC hour at which the daily boss flips. 0 = 00:00 UTC, which is prime-time
 * evening in the Americas (~8pm US Eastern / 9pm Brazil / 5pm US Pacific), so
 * the race to be "first to beat the boss" kicks off when the most players are
 * around. Bump to 1–2 to favour the US West coast's evening instead.
 * Keep this within 0–11 so the noon-anchored reconstruction below stays correct.
 */
export const DAILY_RESET_UTC_HOUR = 0;

/**
 * Global YYYY-MM-DD key for the daily boss. Computed in UTC (shifted by the
 * reset hour) so every player worldwide shares the exact same champion and
 * leaderboard, all flipping at the same instant — never a per-timezone local
 * date, which would fragment the daily race.
 */
export function dailyKey(d = new Date()): string {
  const shifted = new Date(d.getTime() - DAILY_RESET_UTC_HOUR * 3_600_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Seed for the daily Champion (name + team), independent of the run seed. Each
 * generation bracket gets its own daily Champion, so the seed is suffixed with
 * the bracket id — except the full-dex main mode (`all`), which keeps the bare,
 * legacy seed so its shared daily boss and leaderboard stay continuous.
 */
export function championSeed(d = new Date(), bracket: BracketId = 'all'): string {
  const base = `champion:${dailyKey(d)}`;
  return bracket === 'all' ? base : `${base}:${bracket}`;
}

/** Build the daily Champion opponent (same for everyone on a given day, per
 *  bracket). The full-dex `all` mode is the original shared daily boss. */
export function buildChampion(d = new Date(), bracket: BracketId = 'all'): Opponent {
  const rng = new RNG(championSeed(d, bracket));
  const type = rng.pick(ALL_TYPES);
  // The face is a specific person — let it name the Champion. The pool is the
  // numbered Champion rips plus the rival (Gary), who can take the crown as a
  // cosmetic face. The Champion's *team* stays the procedural daily boss either
  // way, so the shared daily race and leaderboard are unaffected.
  const faces: { key: string; name?: string }[] = [
    ...TRAINER_SPRITES.champion.map((s) => ({ key: s.key, name: s.name })),
    ...famousForSlot('champion').map((f) => ({
      key: famousSpriteKey(f.id),
      name: f.name,
    })),
  ];
  const face = rng.pick(faces);
  return {
    id: 'champion',
    name: face.name ?? rng.pick(CHAMPIONS),
    title: 'Champion',
    sprite: '👑',
    badge: badgeUrl('champion'),
    art: artUrl(face.key),
    artGif: gifUrl(face.key),
    type,
    teamSize: 6,
    tier: 'champion',
    quote: rng.pick(CHAMP_QUOTES),
  };
}

/**
 * A stand-in opponent representing another player's saved team, for the
 * just-for-fun "challenge this team" exhibition match. The avatar is drawn
 * deterministically from the owner's name so a given player always looks the
 * same. No real difficulty theme — it fields whatever team they saved.
 */
export function challengeOpponent(name: string, seed: string): Opponent {
  const rng = new RNG(`challenge:${seed}:${name}`);
  const sprite = rng.pick(TRAINER_SPRITES.champion);
  return {
    id: `challenge:${name}`,
    name,
    title: 'Saved team',
    sprite: '⚔️',
    badge: badgeUrl('champion'),
    art: artUrl(sprite.key),
    artGif: gifUrl(sprite.key),
    type: rng.pick(ALL_TYPES),
    teamSize: 6,
    tier: 'champion',
    quote: 'Think your team can take mine?',
  };
}

/**
 * Build an Opponent for a famous, fixed-team character (Brock, Lorelei, James…)
 * on a given rung. The art, name, theme type and team are all bound to the
 * character; App fields their hand-picked roster via `famousId`.
 */
function famousOpponent(
  spec: FamousTrainer,
  id: string,
  tier: OpponentTier,
  opts: { skippable?: boolean } = {},
): Opponent {
  return {
    id,
    name: spec.name,
    title: spec.title,
    sprite: TYPE_EMOJI[spec.type],
    badge: badgeUrl(spec.type),
    art: artUrl(famousSpriteKey(spec.id)),
    artGif: gifUrl(famousSpriteKey(spec.id)),
    type: spec.type,
    // Fixed-roster cameos field exactly their team; pool-based leaders draw a
    // standard squad (`draw`, default 6).
    teamSize: spec.team?.length ?? spec.draw ?? 6,
    tier,
    quote: spec.quote,
    famousId: spec.id,
    skippable: opts.skippable,
  };
}

/**
 * Build a full gauntlet from a run seed and difficulty. The ladder ramps:
 * a handful of random roadside trainers, a "special" villain/gag cameo or two,
 * then Gym Leaders, then one or two Elite trainers, capped by the shared daily
 * Champion. Anime Gym Leaders (Brock, Misty…) and Elite Four (Lorelei, Bruno)
 * blend into their own rungs with their real type + team; Team Rocket and friends
 * are the "special" mini-bosses. Counts come from GAUNTLET_SHAPE.
 */
export function buildGauntlet(
  seed: string,
  difficulty: Difficulty = 'normal',
  d = new Date(),
  bracket: BracketId = 'all',
): Opponent[] {
  const rng = new RNG(`gauntlet:${seed}:${difficulty}`);
  const shape = GAUNTLET_SHAPE[difficulty];

  // Distinct type themes for the named leaders + elite trainers.
  const themes = rng.shuffle(ALL_TYPES);
  const names = rng.shuffle(TRAINER_NAMES);
  // Each famous sprite *is* a specific person, so we hand out distinct sprites
  // and let the art decide the name. The shuffled name lists are only a fallback
  // for any sprite we haven't identified.
  const leaders = rng.shuffle(GYM_LEADERS);
  const elites = rng.shuffle(ELITE_TRAINERS);
  const drawRandom = spriteDrawer(rng, 'random');
  const drawGym = spriteDrawer(rng, 'gym');
  const drawElite = spriteDrawer(rng, 'elite');
  // Famous fixed-team cameos for this run, by rung: anime Gym Leaders & Elite
  // Four blend into their own rungs; villains/gags fill the "special" slots.
  const famousGymPool = rng.shuffle(famousForSlot('gym'));
  const famousElitePool = rng.shuffle(famousForSlot('elite'));
  const specialsPool = rollSpecialPool(rng);
  // A genuinely rare, optional challenger (Prof. Oak) — null on almost every run.
  const bonus = rollBonusChallenge(rng);
  const usedThemes = new Set<PokemonType>();
  let themeCursor = 0;
  let nameCursor = 0;

  // Hand out the next distinct, not-yet-used type theme for a procedural leader.
  const nextTheme = (): PokemonType => {
    while (themeCursor < themes.length && usedThemes.has(themes[themeCursor])) {
      themeCursor++;
    }
    const t = themes[themeCursor] ?? rng.pick(ALL_TYPES);
    themeCursor++;
    usedThemes.add(t);
    return t;
  };

  // Random roadside trainers: small, type-themed warm-up fights. The sprite
  // fixes the class + sex; we then pair it with a same-sex given name.
  const trainers: Opponent[] = Array.from({ length: shape.trainers }, (_, i) => {
    const type = rng.pick(ALL_TYPES);
    const sprite = drawRandom();
    // Next shuffled name whose sex is compatible with the sprite.
    let person = names[nameCursor % names.length];
    for (let n = 0; n < names.length; n++) {
      const cand = names[(nameCursor + n) % names.length];
      if (genderMatches(cand.g, sprite.gender)) {
        person = cand;
        nameCursor = nameCursor + n + 1;
        break;
      }
    }
    return {
      id: `trainer-${i}`,
      name: person.name,
      title: sprite.cls ?? 'Trainer',
      sprite: TYPE_EMOJI[type],
      badge: badgeUrl(type),
      art: artUrl(sprite.key),
      artGif: gifUrl(sprite.key),
      type,
      teamSize: 3,
      tier: 'trainer' as const,
      quote: rng.pick(TRAINER_QUOTES),
    };
  });

  // Gym Leaders: famous anime leaders (Brock, Misty, Sabrina, Blaine) blend in
  // with their real type + hand-picked team; the rest are procedural, type-themed
  // leaders whose displayed name follows the sprite (e.g. the cowboy is Clay).
  const gyms: Opponent[] = Array.from({ length: shape.gyms }, (_, i) => {
    const famous =
      famousGymPool.length > 0 && rng.chance(0.6) ? famousGymPool.shift()! : null;
    if (famous) {
      usedThemes.add(famous.type);
      return famousOpponent(famous, `gym-${i}-${famous.id}`, 'gym');
    }
    const type = nextTheme();
    const sprite = drawGym();
    return {
      id: `gym-${i}-${type}`,
      name: sprite.name ?? leaders[i % leaders.length],
      title: `${typeLabel(type)} Gym Leader`,
      sprite: TYPE_EMOJI[type],
      badge: badgeUrl(type),
      art: artUrl(sprite.key),
      artGif: gifUrl(sprite.key),
      type,
      teamSize: 6,
      tier: 'gym' as const,
      quote: rng.pick(GYM_QUOTES),
    };
  });

  // Special cameo trainers: villains & gag faces from the anime (Team Rocket,
  // Ash's mom, a rare Prof. Oak) who field a fixed, hand-picked team. The first
  // drops in just before the Gym Leaders; a second (on the longer ladders) waits
  // right before the Champion. Beating the LAST special — the single one, or the
  // pre-Champion one when there are two — unlocks the sign-reroll reward.
  const specials: Opponent[] = Array.from(
    { length: shape.specials ?? 0 },
    (_, i): Opponent => {
      const spec =
        specialsPool[i % Math.max(1, specialsPool.length)] ??
        rng.pick(famousForSlot('special'));
      const isLast = i === (shape.specials ?? 0) - 1;
      return {
        ...famousOpponent(spec, `special-${i}-${spec.id}`, 'special'),
        signRerollReward: isLast,
        // The reward's hidden tier rides along on the special's `strong` flag:
        // a tough cameo's win guarantees a rare sign, a gag cameo's a plain roll.
        signRerollStrong: isLast ? (spec.strong ?? false) : undefined,
      };
    },
  );
  // The first special warms up the Gym rung; any remaining ones (just the
  // second, on the long ladders) guard the gate to the Champion.
  const preGymSpecials = specials.slice(0, 1);
  const preChampionSpecials = specials.slice(1);

  // Elite Four: famous anime members (Lorelei, Bruno) blend in with their real
  // type + team; the rest are procedural, named after the sprite's character.
  const elite: Opponent[] = Array.from({ length: shape.elites }, (_, i) => {
    const famous =
      famousElitePool.length > 0 && rng.chance(0.7) ? famousElitePool.shift()! : null;
    if (famous) {
      usedThemes.add(famous.type);
      return famousOpponent(famous, `elite-${i}-${famous.id}`, 'elite');
    }
    const type = nextTheme();
    const sprite = drawElite();
    return {
      id: `elite-${i}-${type}`,
      name: sprite.name ?? elites[i % elites.length],
      title: `Elite — ${typeLabel(type)}`,
      sprite: TYPE_EMOJI[type],
      badge: badgeUrl(type),
      art: artUrl(sprite.key),
      artGif: gifUrl(sprite.key),
      type,
      teamSize: 6,
      tier: 'elite' as const,
      quote: rng.pick(ELITE_QUOTES),
    };
  });

  // The rare bonus challenger slots in just before the Champion as an optional
  // "final exam" the player can take on or skip outright (see MapScreen/App).
  const bonusFight: Opponent[] = bonus
    ? [famousOpponent(bonus, `bonus-${bonus.id}`, 'special', { skippable: true })]
    : [];

  return [
    ...trainers,
    ...preGymSpecials,
    ...gyms,
    ...elite,
    ...bonusFight,
    ...preChampionSpecials,
    buildChampion(d, bracket),
  ];
}
