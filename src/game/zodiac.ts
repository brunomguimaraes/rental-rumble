import type { BaseStats, Sign } from './types.js';
import type { RNG } from './rng.js';
import { celestialOddsScale } from './ability-effects.js';

// Sprites are served locally from public/sprites/zodiac (see scripts/build-zodiac.py).
const ASSET = import.meta.env?.BASE_URL ?? '/';

/** White zodiac glyph sprite (sliced from the alchemy icon sheet). */
export function signIconUrl(sign: Sign): string {
  return `${ASSET}sprites/zodiac/${sign}.png`;
}

/** Title-cased sign name for display, e.g. 'aries' -> 'Aries'. */
export function signLabel(sign: Sign): string {
  return sign.charAt(0).toUpperCase() + sign.slice(1);
}

function tilt(mult: number): string {
  const d = Math.round((mult - 1) * 100);
  return d === 0 ? '±0%' : `${d > 0 ? '+' : ''}${d}%`;
}

/** Rarity tier of a sign. */
export function signTier(sign: Sign): SignTier {
  return SIGN_INFO[sign].tier;
}

/**
 * Multi-line hover summary of the stat changes a sign applies, plus its
 * element/modality (or rarity, for celestial signs) and tagline. Used as the
 * `title` on every sign badge so hovering anywhere on the sign reveals exactly
 * how it tilts the stats.
 */
export function signSummary(sign: Sign): string {
  const sp = SIGN_SPREAD[sign];
  const info = SIGN_INFO[sign];
  const subtitle =
    info.element && info.modality
      ? `${info.element}/${info.modality}`
      : `${info.tier} celestial sign`;
  return (
    `${signLabel(sign)} — ${subtitle}\n` +
    `HP ${tilt(sp.hp)}   ATK ${tilt(sp.atk)}   E.ATK ${tilt(sp.eatk)}\n` +
    `DEF ${tilt(sp.def)}   E.DEF ${tilt(sp.edef)}   SPD ${tilt(sp.spd)}\n` +
    info.tagline
  );
}

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';

/** Rarity class of a sign. Drives roll odds and card-border treatment. */
export type SignTier = 'common' | 'rare' | 'mythic';

// Astrological order. Each Pokémon is born under one sign, which gives it a
// personality (a stat tilt) the way the old role system did — but a sign is an
// identity, not a job, so any Pokémon can wear any sign. The 12 break down as
// 4 elements × 3 modalities: the element sets the broad archetype (fire =
// offense, earth = bulk, air = speed, water = sustain) and the modality sets the
// flavour within it (cardinal = initiating/Speed-lean, fixed = stubborn/extreme,
// mutable = adaptable/rounded).
export const ZODIAC_SIGNS: Sign[] = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
];

// Rare "celestial" wanderers — the off-ecliptic constellations the Moon and
// planets pass through. They never appear via best-fit ordering; only the long
// odds in rollSign can surface them. Each is a big, mixed boost (well above the
// gentle ±14% of the common twelve).
export const RARE_SIGNS: Sign[] = ['orion', 'cetus', 'aquila', 'serpens'];

// Mythic — the dropped 28th Vedic lunar mansion. A flat +50% to everything.
export const MYTHIC_SIGNS: Sign[] = ['abhijit'];

/** Every valid sign (12 common + 4 rare + 1 mythic), for payload validation. */
export const ALL_SIGNS: Sign[] = [...ZODIAC_SIGNS, ...RARE_SIGNS, ...MYTHIC_SIGNS];

// Odds a single drafted Pokémon is born under a celestial sign, for a regular
// player. Opponents roll at half these odds (see rollSign's `oddsScale`), and
// special trainers additionally get a flat team-level chance (see battle.ts).
export const RARE_ODDS = 1 / 60;
export const MYTHIC_ODDS = 1 / 4000;

export const ELEMENT_ORDER: Element[] = ['fire', 'earth', 'air', 'water'];

export const ELEMENT_INFO: Record<
  Element,
  { label: string; color: string; blurb: string }
> = {
  fire: { label: 'Fire', color: '#ff7a4d', blurb: 'Offensive — fast, hard-hitting, frail.' },
  earth: { label: 'Earth', color: '#c79a5b', blurb: 'Bulky walls that hit slow.' },
  air: { label: 'Air', color: '#7fc6e8', blurb: 'Speedy and well-balanced.' },
  water: { label: 'Water', color: '#5b8def', blurb: 'Sustain — durable and steady.' },
};

export interface SignSpread {
  hp: number;
  atk: number; // Physical Attack
  eatk: number; // Energy Attack
  def: number; // Physical Defense
  edef: number; // Energy Defense
  spd: number;
}

// Nature/EV-style tilts applied on top of base stats. Kept gentle (≈0.84–1.16)
// so the sign flavours a Pokémon without swinging balance wildly. Within an
// element the three signs share a broad direction (fire = offense, earth = bulk,
// air = speed, water = sustain) but the modality also leans the mon toward the
// PHYSICAL or ENERGY half of the split — so a sign is now an identity on both
// axes (e.g. Aries is a physical rusher, Sagittarius an energy skirmisher).
export const SIGN_SPREAD: Record<Sign, SignSpread> = {
  // Fire — offense.
  aries: { hp: 0.92, atk: 1.15, eatk: 0.96, def: 0.88, edef: 0.9, spd: 1.13 }, // cardinal: physical glass-cannon rusher
  leo: { hp: 1.0, atk: 1.06, eatk: 0.98, def: 0.98, edef: 0.96, spd: 0.96 }, // fixed: proud physical heavy hitter
  sagittarius: { hp: 0.96, atk: 0.96, eatk: 1.12, def: 0.92, edef: 0.94, spd: 1.1 }, // mutable: ranged energy skirmisher
  // Earth — bulk.
  capricorn: { hp: 1.06, atk: 1.02, eatk: 0.92, def: 1.14, edef: 1.02, spd: 0.9 }, // cardinal: physical wall that pushes
  taurus: { hp: 1.12, atk: 1.02, eatk: 0.86, def: 1.16, edef: 1.0, spd: 0.86 }, // fixed: immovable physical wall
  virgo: { hp: 1.04, atk: 0.9, eatk: 1.0, def: 1.02, edef: 1.14, spd: 0.94 }, // mutable: efficient energy-warding bulk
  // Air — speed / balance.
  libra: { hp: 1.0, atk: 1.0, eatk: 1.0, def: 1.01, edef: 1.01, spd: 1.03 }, // cardinal: perfectly balanced
  aquarius: { hp: 1.0, atk: 0.9, eatk: 1.06, def: 1.0, edef: 1.02, spd: 1.08 }, // fixed: slippery energy control
  gemini: { hp: 0.96, atk: 1.08, eatk: 0.96, def: 0.94, edef: 0.96, spd: 1.13 }, // mutable: quick physical skirmisher (less glass, still fastest common sign)
  // Water — sustain.
  cancer: { hp: 1.1, atk: 0.94, eatk: 0.96, def: 1.08, edef: 1.08, spd: 0.9 }, // cardinal: protective mixed wall
  scorpio: { hp: 0.98, atk: 1.12, eatk: 0.96, def: 0.96, edef: 0.98, spd: 1.04 }, // fixed: venomous physical striker
  pisces: { hp: 1.06, atk: 0.92, eatk: 1.06, def: 1.02, edef: 1.04, spd: 0.98 }, // mutable: dreamy energy all-rounder
  // Rare celestial wanderers — big, lopsided boosts with at most a slight dip.
  orion: { hp: 1.06, atk: 1.24, eatk: 1.2, def: 0.98, edef: 0.98, spd: 1.2 }, // the Hunter: overwhelming offense
  cetus: { hp: 1.3, atk: 1.06, eatk: 1.06, def: 1.24, edef: 1.24, spd: 0.92 }, // the Sea Monster: monstrous bulk
  aquila: { hp: 1.0, atk: 1.14, eatk: 1.14, def: 0.96, edef: 0.96, spd: 1.34 }, // the Eagle: blinding speed
  serpens: { hp: 1.14, atk: 1.16, eatk: 1.16, def: 1.12, edef: 1.12, spd: 1.16 }, // the Serpent: strong all-rounder
  // Mythic — a flat blessing across the board.
  abhijit: { hp: 1.5, atk: 1.5, eatk: 1.5, def: 1.5, edef: 1.5, spd: 1.5 },
};

export interface SignMeta {
  glyph: string;
  tier: SignTier;
  /** Present on the common twelve; celestial signs are element-less. */
  element?: Element;
  modality?: Modality;
  tagline: string;
}

export const SIGN_INFO: Record<Sign, SignMeta> = {
  aries: { glyph: '♈', tier: 'common', element: 'fire', modality: 'cardinal', tagline: 'Glass-cannon rusher — fast and fierce, but frail.' },
  taurus: { glyph: '♉', tier: 'common', element: 'earth', modality: 'fixed', tagline: 'Immovable wall; hits slow but never breaks.' },
  gemini: { glyph: '♊', tier: 'common', element: 'air', modality: 'mutable', tagline: 'Blazing speed and versatility, little bulk.' },
  cancer: { glyph: '♋', tier: 'common', element: 'water', modality: 'cardinal', tagline: 'Protective and bulky; outlasts the clock.' },
  leo: { glyph: '♌', tier: 'common', element: 'fire', modality: 'fixed', tagline: 'Proud, heavy-hitting power with steady bulk.' },
  virgo: { glyph: '♍', tier: 'common', element: 'earth', modality: 'mutable', tagline: 'Efficient bulk — precise and hard to wear down.' },
  libra: { glyph: '♎', tier: 'common', element: 'air', modality: 'cardinal', tagline: 'Perfectly balanced across every stat.' },
  scorpio: { glyph: '♏', tier: 'common', element: 'water', modality: 'fixed', tagline: 'Venomous striker — quick and aggressive.' },
  sagittarius: { glyph: '♐', tier: 'common', element: 'fire', modality: 'mutable', tagline: 'Ranged skirmisher; fast attacker, soft.' },
  capricorn: { glyph: '♑', tier: 'common', element: 'earth', modality: 'cardinal', tagline: 'Disciplined wall that still pushes forward.' },
  aquarius: { glyph: '♒', tier: 'common', element: 'air', modality: 'fixed', tagline: 'Unconventional — fast and slippery.' },
  pisces: { glyph: '♓', tier: 'common', element: 'water', modality: 'mutable', tagline: 'Dreamy all-rounder with gentle bulk.' },
  // Rare celestial wanderers.
  orion: { glyph: '🏹', tier: 'rare', tagline: 'The Hunter' },
  cetus: { glyph: '🐋', tier: 'rare', tagline: 'The Sea Monster' },
  aquila: { glyph: '🦅', tier: 'rare', tagline: 'The Eagle' },
  serpens: { glyph: '🐍', tier: 'rare', tagline: 'The Serpent' },
  // Mythic.
  abhijit: { glyph: '✴', tier: 'mythic', tagline: 'The Victorious' },
};

/**
 * How well a sign suits a stat line: rewards spreads that amplify the stats the
 * Pokémon is already good at (a fast mon "fits" Speed-tilted signs, a bulky one
 * fits Defense-tilted signs). It's the dot product of the spread's tilt with the
 * base stats, so a sign that boosts a 130 Speed scores far higher than one that
 * boosts a 50 Attack. Used only for ordering and weighting — never to forbid a
 * sign, since a sign is an identity any Pokémon may carry.
 */
export function signFit(sign: Sign, s: BaseStats): number {
  const sp = SIGN_SPREAD[sign];
  return (
    (sp.hp - 1) * s.hp +
    (sp.atk - 1) * s.atk +
    (sp.eatk - 1) * s.eatk +
    (sp.def - 1) * s.def +
    (sp.edef - 1) * s.edef +
    (sp.spd - 1) * s.spd
  );
}

/** All 12 signs, ordered best-fit first for the given stats. */
export function signsByFit(s: BaseStats): Sign[] {
  return [...ZODIAC_SIGNS].sort((a, b) => signFit(b, s) - signFit(a, s));
}

export function defaultSign(s: BaseStats): Sign {
  return signsByFit(s)[0];
}

/**
 * The rare celestial sign whose boost best matches this stat line's *shape*.
 * Plain signFit would almost always pick Serpens (its multipliers are high on
 * every stat), so instead we correlate each rare's tilt with how the mon's
 * stats deviate from its own mean: a lopsided line leans into the matching
 * lopsided wanderer (offense → Orion, speed → Aquila, bulk → Cetus), while a
 * flat, well-rounded line gets the all-around Serpens.
 */
export function bestRareSign(s: BaseStats): Sign {
  const mean = (s.hp + s.atk + s.eatk + s.def + s.edef + s.spd) / 6;
  const dev = {
    hp: s.hp - mean,
    atk: s.atk - mean,
    eatk: s.eatk - mean,
    def: s.def - mean,
    edef: s.edef - mean,
    spd: s.spd - mean,
  };
  const spread = Math.max(
    Math.abs(dev.hp),
    Math.abs(dev.atk),
    Math.abs(dev.eatk),
    Math.abs(dev.def),
    Math.abs(dev.edef),
    Math.abs(dev.spd),
  );
  if (spread < 12) return 'serpens';

  const shaped: Sign[] = ['orion', 'aquila', 'cetus'];
  let best: Sign = shaped[0];
  let bestScore = -Infinity;
  for (const sign of shaped) {
    const sp = SIGN_SPREAD[sign];
    const score =
      dev.hp * (sp.hp - 1) +
      dev.atk * (sp.atk - 1) +
      dev.eatk * (sp.eatk - 1) +
      dev.def * (sp.def - 1) +
      dev.edef * (sp.edef - 1) +
      dev.spd * (sp.spd - 1);
    if (score > bestScore) {
      bestScore = score;
      best = sign;
    }
  }
  return best;
}

/**
 * Seeded sign for the draft. First rolls the long-shot celestial signs: the
 * mythic Abhijit, then the rare wanderers (a best-fit pick of the four). Most
 * of the time it falls through to the common twelve, weighted toward the
 * best-fit signs but with a long tail, so a Pokémon usually shows up "in
 * character" yet can be born under an off-beat sign now and then.
 *
 * `oddsScale` scales the celestial odds: 1 for a regular player's draft, 0.5
 * for opponents (who hit the rare signs at half a player's rate).
 */
export function rollSign(
  s: BaseStats,
  rng: RNG,
  oddsScale = 1,
  team?: readonly { ability?: import('./types.js').AbilityId }[],
): Sign {
  const scale = celestialOddsScale(team, oddsScale);
  const gate = rng.next();
  if (gate < MYTHIC_ODDS * scale) return 'abhijit';
  if (gate < (MYTHIC_ODDS + RARE_ODDS) * scale) return bestRareSign(s);
  return rollCommonSign(s, rng);
}

/**
 * Always a celestial sign, for the dev "all rare/mythic" cheat: the mythic
 * Abhijit on a ~1-in-4 gate, otherwise the best-fit rare wanderer. Consumes one
 * `rng` draw so a seeded caller stays deterministic.
 */
export function forcedRareSign(s: BaseStats, rng: RNG): Sign {
  return rng.next() < 0.25 ? 'abhijit' : bestRareSign(s);
}

// Weighted pick among the common twelve: best-fit signs are favoured, but a long
// tail keeps an off-beat sign possible. Shared by the draft roll and the reroll.
// `exclude` drops one sign from the pool (used by the reroll, which must never
// hand back the sign the Pokémon already wears).
function rollCommonSign(s: BaseStats, rng: RNG, exclude?: Sign): Sign {
  const ranked = signsByFit(s).filter((sign) => sign !== exclude);
  const weights = ranked.map((_, i) => 1 / (i + 1.3));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < ranked.length; i++) {
    r -= weights[i];
    if (r <= 0) return ranked[i];
  }
  return ranked[0];
}

// Odds for the special-battle "reroll a sign" reward. Far more generous than a
// normal draft roll — a real shot at a celestial sign — but these numbers are
// deliberately NOT surfaced in the UI: the reward is sold as a plain reroll, and
// the long-shot upside is meant to be a delightful surprise, not a stated rate.
export const REROLL_RARE_ODDS = 1 / 5;
export const REROLL_MYTHIC_ODDS = 1 / 100;

/** The best-fit rare wanderer, guaranteed to differ from `current`. */
function otherRareSign(s: BaseStats, current?: Sign): Sign {
  const best = bestRareSign(s);
  if (best !== current) return best;
  // The best-fit rare is the one they already wear — take the next rare along.
  return RARE_SIGNS.find((sign) => sign !== current) ?? best;
}

/**
 * Reroll a single Pokémon's sign as a special-battle reward. Same weighted
 * common-twelve fall-through as the draft, but with hugely boosted odds of
 * surfacing a rare celestial (≈1/10) or the mythic Abhijit (≈1/100). The roll is
 * driven entirely by `rng`, so a caller seeding it deterministically (per run +
 * stage) gets a fixed, un-fishable outcome.
 *
 * A reroll always *changes* the sign: pass the Pokémon's `current` sign and the
 * result is guaranteed to differ from it (a mythic-tier hit on a Pokémon that's
 * already the mythic falls back to the best-fit rare, since there's nowhere
 * higher to go).
 */
export function rerollSign(s: BaseStats, rng: RNG, current?: Sign): Sign {
  const gate = rng.next();
  if (gate < REROLL_MYTHIC_ODDS) {
    return current === 'abhijit' ? otherRareSign(s, current) : 'abhijit';
  }
  if (gate < REROLL_MYTHIC_ODDS + REROLL_RARE_ODDS) return otherRareSign(s, current);
  return rollCommonSign(s, rng, current);
}

/**
 * The "strong special" reward: a *guaranteed* rare celestial sign — never a
 * common roll, and never the mythic Abhijit (that stays a long-shot reserved
 * for the weak/random reroll). Which of the four wanderers lands is a seeded
 * random pick (so it's "random but defined" — fixed per run+stage, un-fishable),
 * and it's always different from the sign the Pokémon already wears. Stats are
 * accepted only to keep a uniform reroll signature; the pick ignores fit on
 * purpose so the result feels like a roll of the dice, not a best-fit handout.
 */
export function rerollRareSign(_s: BaseStats, rng: RNG, current?: Sign): Sign {
  const pool = RARE_SIGNS.filter((sign) => sign !== current);
  return rng.pick(pool.length > 0 ? pool : RARE_SIGNS);
}
