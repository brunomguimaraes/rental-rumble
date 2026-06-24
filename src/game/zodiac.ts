import type { BaseStats, Sign } from './types';
import type { RNG } from './rng';

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

/**
 * Multi-line hover summary of the stat changes a sign applies, plus its
 * element/modality and tagline. Used as the `title` on every sign badge so
 * hovering anywhere on the sign reveals exactly how it tilts the stats.
 */
export function signSummary(sign: Sign): string {
  const sp = SIGN_SPREAD[sign];
  const info = SIGN_INFO[sign];
  return (
    `${signLabel(sign)} — ${info.element}/${info.modality}\n` +
    `HP ${tilt(sp.hp)}   ATK ${tilt(sp.atk)}   DEF ${tilt(sp.def)}   SPD ${tilt(sp.spd)}\n` +
    info.tagline
  );
}

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';

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
  atk: number;
  def: number;
  spd: number;
}

// Nature/EV-style tilts applied on top of base stats. Kept gentle (≈0.84–1.14)
// so the sign flavours a Pokémon without swinging balance wildly. Within an
// element the three signs share a direction but differ by modality.
export const SIGN_SPREAD: Record<Sign, SignSpread> = {
  // Fire — offense.
  aries: { hp: 0.92, atk: 1.1, def: 0.88, spd: 1.12 }, // cardinal: glass-cannon rusher
  leo: { hp: 1.0, atk: 1.14, def: 0.96, spd: 0.98 }, // fixed: proud heavy hitter
  sagittarius: { hp: 0.94, atk: 1.06, def: 0.92, spd: 1.1 }, // mutable: ranged skirmisher
  // Earth — bulk.
  capricorn: { hp: 1.08, atk: 0.94, def: 1.12, spd: 0.9 }, // cardinal: wall that pushes
  taurus: { hp: 1.14, atk: 0.92, def: 1.14, spd: 0.84 }, // fixed: immovable
  virgo: { hp: 1.04, atk: 0.98, def: 1.08, spd: 0.94 }, // mutable: efficient bulk
  // Air — speed / balance.
  libra: { hp: 1.02, atk: 1.0, def: 1.02, spd: 1.04 }, // cardinal: perfectly balanced
  aquarius: { hp: 1.0, atk: 0.98, def: 1.02, spd: 1.1 }, // fixed: slippery control
  gemini: { hp: 0.94, atk: 1.04, def: 0.9, spd: 1.14 }, // mutable: quick & versatile
  // Water — sustain.
  cancer: { hp: 1.12, atk: 0.94, def: 1.06, spd: 0.92 }, // cardinal: protective
  scorpio: { hp: 0.96, atk: 1.1, def: 0.94, spd: 1.04 }, // fixed: venomous striker
  pisces: { hp: 1.06, atk: 0.98, def: 1.02, spd: 1.0 }, // mutable: dreamy all-rounder
};

export const SIGN_INFO: Record<
  Sign,
  { glyph: string; element: Element; modality: Modality; tagline: string }
> = {
  aries: { glyph: '♈', element: 'fire', modality: 'cardinal', tagline: 'Glass-cannon rusher — fast and fierce, but frail.' },
  taurus: { glyph: '♉', element: 'earth', modality: 'fixed', tagline: 'Immovable wall; hits slow but never breaks.' },
  gemini: { glyph: '♊', element: 'air', modality: 'mutable', tagline: 'Blazing speed and versatility, little bulk.' },
  cancer: { glyph: '♋', element: 'water', modality: 'cardinal', tagline: 'Protective and bulky; outlasts the clock.' },
  leo: { glyph: '♌', element: 'fire', modality: 'fixed', tagline: 'Proud, heavy-hitting power with steady bulk.' },
  virgo: { glyph: '♍', element: 'earth', modality: 'mutable', tagline: 'Efficient bulk — precise and hard to wear down.' },
  libra: { glyph: '♎', element: 'air', modality: 'cardinal', tagline: 'Perfectly balanced across every stat.' },
  scorpio: { glyph: '♏', element: 'water', modality: 'fixed', tagline: 'Venomous striker — quick and aggressive.' },
  sagittarius: { glyph: '♐', element: 'fire', modality: 'mutable', tagline: 'Ranged skirmisher; fast attacker, soft.' },
  capricorn: { glyph: '♑', element: 'earth', modality: 'cardinal', tagline: 'Disciplined wall that still pushes forward.' },
  aquarius: { glyph: '♒', element: 'air', modality: 'fixed', tagline: 'Unconventional — fast and slippery.' },
  pisces: { glyph: '♓', element: 'water', modality: 'mutable', tagline: 'Dreamy all-rounder with gentle bulk.' },
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
    (sp.def - 1) * s.def +
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
 * Seeded sign for the draft. Weighted toward the best-fit signs but with a long
 * tail, so a Pokémon usually shows up "in character" yet can be born under an
 * off-beat sign now and then — that's the draft variance. The weight of the
 * Nth-best sign decays smoothly (1/(N+1.3)), keeping every sign reachable.
 */
export function rollSign(s: BaseStats, rng: RNG): Sign {
  const ranked = signsByFit(s);
  const weights = ranked.map((_, i) => 1 / (i + 1.3));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < ranked.length; i++) {
    r -= weights[i];
    if (r <= 0) return ranked[i];
  }
  return ranked[0];
}
