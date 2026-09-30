import type { AbilityId, Build, Creature, Sign } from './types.js';
import type { RNG } from './rng.js';
import {
  portraitEmotions,
  shinyPortraitEmotions,
  altColorPortraitEmotions,
  canBeShiny,
  canBeAltColor,
} from './pokemon.js';
import { rollAbility } from './abilities.js';
import { rollSign } from './zodiac.js';
import { canRollBuild } from './moves.js';
import { SHINY_CHANCE, ALT_COLOR_CHANCE } from './odds.js';

// The rolled identity of an individual Pokémon: its sign, ability, build,
// colouring and portrait face. Starters, tutorial gifts, wild encounters and
// catches all use this one roll so "every Pokémon is a unique individual"
// means the same thing everywhere. Pure: the caller owns the RNG.

export interface RolledIdentity {
  sign: Sign;
  ability?: AbilityId;
  build?: Build;
  shiny: boolean;
  altColor: boolean;
  emotion?: string;
}

function pickEmotion(dexId: number, shiny: boolean, altColor: boolean, rng: RNG): string | undefined {
  const emotions = shiny
    ? shinyPortraitEmotions(dexId)
    : altColor
      ? altColorPortraitEmotions(dexId)
      : portraitEmotions(dexId);
  return emotions.length > 0 ? rng.pick(emotions) : undefined;
}

export function rollIdentity(species: Creature, rng: RNG): RolledIdentity {
  const sign = rollSign(species.stats, rng);
  const ability = rollAbility(species.dexId, rng);
  const build = canRollBuild(species.stats)
    ? (rng.next() < 0.5 ? 'physical' : 'energy')
    : undefined;
  const shiny = rng.chance(SHINY_CHANCE) && canBeShiny(species.dexId);
  const altColor = !shiny && rng.chance(ALT_COLOR_CHANCE) && canBeAltColor(species.dexId);
  const emotion = pickEmotion(species.dexId, shiny, altColor, rng);
  return {
    sign,
    ...(ability ? { ability } : {}),
    ...(build ? { build } : {}),
    shiny,
    altColor,
    ...(emotion ? { emotion } : {}),
  };
}
