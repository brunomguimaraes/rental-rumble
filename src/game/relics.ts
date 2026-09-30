import type { PokemonType, RelicMods } from './types.js';

// Reduced to the mods hook the engine still reads; full removal is a slice 5 item.

/** Identity mods: leave a relic-free side byte-identical to the old engine. */
export function identityMods(): RelicMods {
  return {
    atkMult: 1,
    eatkMult: 1,
    defMult: 1,
    edefMult: 1,
    spdMult: 1,
    allDmgMult: 1,
    dmgMult: {},
    lifesteal: 0,
    endTurnHeal: 0,
    damageTakenMult: 1,
    boostedDmgMult: 1,
  };
}

/** Damage multiplier the attacker's mods grant a move of `type`. */
export function relicDamageMult(mods: RelicMods, type: PokemonType): number {
  return mods.allDmgMult * (mods.dmgMult[type] ?? 1);
}
