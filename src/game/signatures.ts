import type { Move, MoveCategory, PokemonType } from './types.js';

// Local move-builder, mirroring the one in moves.ts (kept here so this data
// module has no dependency on the engine — it is plain, declarative content).
const mk = (
  name: string,
  type: PokemonType,
  power: number,
  accuracy = 1,
  effect?: Move['effect'],
  category?: MoveCategory,
): Move => ({ name, type, power, accuracy, effect, category });

/**
 * Signature moves: one-of-a-kind attacks invented for this game and bolted onto a
 * whole evolution LINE by its base-species (National Dex) id, so a marquee family
 * plays unlike anything the type tables could produce. A member inherits the
 * signature of the nearest ancestor that defines one (so one entry covers a
 * linear line; a branched line overrides only where it diverges), and its power
 * scales down for earlier stages (see signatureMoveFor in moves.ts) — a
 * Charmander's blast is a softer echo of Charizard's.
 *
 * They lean on the two custom riders — `selfStage` (a guaranteed self stat-tax
 * paid on every hit) and `lockTurns` (the move benches its own type for a beat
 * after firing) — to trade raw power for a real drawback. The stored `power` is
 * the FINAL-stage value. Woven in first by movesFor so a line's identity move is
 * never crowded out of its pool.
 *
 * Keyed by line base-species dex id. Authored per generation; see the GEN markers.
 */
export const LINE_SIGNATURES: Record<number, Move> = {
  // --- The original marquee thirteen, now keyed by line base ---

  // Ponyta line (Rapidash) — a headlong blazing charge: it almost always sears
  // the foe, but running this hot costs the horse its own footing.
  77: {
    ...mk('Searing Gallop', 'fire', 100, 1, { kind: 'burn', chance: 0.5 }, 'physical'),
    selfStage: { stat: 'spd', delta: -1 },
  },
  // The Kanto starters' "ultimate" blasts — colossal single hits whose cannons /
  // furnace / root-network need a couple of turns to repower.
  7: { ...mk('Hydro Cannon', 'water', 150, 0.95), lockTurns: 3 }, // Squirtle line
  4: { ...mk('Blast Burn', 'fire', 150, 0.95), lockTurns: 3 }, // Charmander line
  1: { ...mk('Frenzy Plant', 'grass', 150, 0.95), lockTurns: 3 }, // Bulbasaur line
  // Bagon line (Salamence) — a meteor swarm called down from on high.
  371: {
    ...mk('Draco Meteor', 'dragon', 130, 0.95, undefined, 'physical'),
    selfStage: { stat: 'atk', delta: -2 },
  },
  // Gastly line (Gengar) — a creeping shadow that smothers the foe in toxin.
  92: mk('Shadow Smother', 'ghost', 90, 1, { kind: 'poison', chance: 1 }, 'energy'),
  // Machop line (Machamp) — a wild, telegraphed haymaker that always confuses.
  66: mk('Dynamic Punch', 'fighting', 100, 0.8, { kind: 'confuse', chance: 1 }),
  // Magikarp line (Gyarados) — a thrashing assault that leaves its guard open.
  129: {
    ...mk('Thrash', 'water', 130, 1, undefined, 'physical'),
    selfStage: { stat: 'def', delta: -1 },
  },
  // Larvitar line (Tyranitar) — a crushing avalanche that always caves Defense.
  246: mk('Sandstorm Slam', 'rock', 120, 0.9, {
    kind: 'stage',
    stat: 'def',
    delta: -1,
    chance: 1,
    target: 'foe',
  }),
  // Abra line (Alakazam) — a single psionic detonation it can't fire twice running.
  63: { ...mk('Psycho Boost', 'psychic', 140, 0.9), lockTurns: 2 },
  // Aron line (Aggron) — hurls its whole steel-clad bulk, always bowling the foe over.
  304: mk('Heavy Slam', 'steel', 130, 1, {
    kind: 'stage',
    stat: 'spd',
    delta: -1,
    chance: 1,
    target: 'foe',
  }),
  // Zubat line (Crobat) — a vampiric flurry of fangs that drains deep.
  41: mk('Vampire Fang', 'poison', 95, 1, { kind: 'lifesteal', fraction: 0.75 }),

  // ============================ GEN I ============================

  // Pikachu line — the cheek-sparked suicide charge.
  25: mk('Volt Tackle', 'electric', 120, 1, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
  // Sandshrew line (Sandslash) — a spinning earth-render that shreds the foe's guard.
  27: mk('Sand Spiral', 'ground', 95, 1, {
    kind: 'stage',
    stat: 'def',
    delta: -1,
    chance: 0.3,
    target: 'foe',
  }),
  // Nidoran♂ line (Nidoking) — a regal quake that cracks open the foe's Defense.
  32: mk('Regal Quake', 'ground', 110, 0.95, {
    kind: 'stage',
    stat: 'def',
    delta: -1,
    chance: 0.3,
    target: 'foe',
  }),
  // Nidoran♀ line (Nidoqueen) — a poison-barbed bulwark blow that badly poisons.
  29: mk('Venom Bulwark', 'poison', 90, 1, { kind: 'poison', chance: 1 }, 'physical'),
  // Vulpix line (Ninetales) — nine spectral flames that wreathe the foe in fire.
  37: mk('Ninefold Flame', 'fire', 85, 1, { kind: 'burn', chance: 0.4 }),
  // Oddish line (Vileplume / Bellossom) — a drowsy bloom of paralysing spores.
  43: mk('Spore Bloom', 'grass', 95, 1, { kind: 'stun', chance: 0.4 }),
  // Diglett line (Dugtrio) — three heads strike as one, a flinch-inducing ambush.
  50: mk('Triple Dig', 'ground', 90, 1, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Growlithe line (Arcanine) — a legendary blazing rush that scorches on contact.
  58: mk('Legend Blaze', 'fire', 110, 1, { kind: 'burn', chance: 0.3 }, 'physical'),
  // Geodude line (Golem) — curls up and bowls the foe over, flinching on impact.
  74: mk('Boulder Roll', 'rock', 110, 0.9, { kind: 'flinch', chance: 0.3 }),
  // Shellder line (Cloyster) — a volley of impaling icicles behind its shell.
  90: mk('Spike Cannon', 'ice', 110, 0.9, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Staryu line (Starmie) — a whirling cosmic beam from its core gem.
  120: mk('Cosmic Spiral', 'psychic', 110, 0.95, undefined, 'energy'),
  // Scyther line (Scizor) — a blinding cross-slash of blades.
  123: mk('Cross Reaper', 'bug', 100, 1, { kind: 'flinch', chance: 0.2 }, 'physical'),
  // Lapras (standalone) — a tidal freeze that locks the foe in place.
  131: mk('Tidal Freeze', 'water', 110, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Eevee line — adaptive surge: a versatile burst keyed to its Normal core.
  // NOTE: branched line — the eeveelutions all inherit this Normal-typed move. A
  // per-branch (type-matched) signature is an open question for the fan-out.
  133: mk('Adaptive Surge', 'normal', 95, 1, undefined, 'energy'),
  // Snorlax line — a full-bodied slam so heavy it must recover after landing it.
  143: { ...mk('Giga Impact', 'normal', 150, 0.9, undefined, 'physical'), lockTurns: 2 },
  // Articuno — a sweeping aurora of ice.
  144: mk('Frost Aegis', 'ice', 110, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Zapdos — a sky-splitting bolt.
  145: mk('Sky Voltage', 'electric', 120, 0.9, { kind: 'stun', chance: 0.3 }),
  // Moltres — a plummeting pyre.
  146: mk('Sky Pyre', 'fire', 120, 0.9, { kind: 'burn', chance: 0.3 }),
  // Dratini line (Dragonite) — a crushing wyrm strike that buckles the foe's Defense.
  147: mk(
    'Wyrm Crush',
    'dragon',
    120,
    1,
    { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' },
    'physical',
  ),
  // Mewtwo — its mind made manifest as a piercing strike.
  150: { ...mk('Psystrike', 'psychic', 130, 0.95, undefined, 'energy'), lockTurns: 2 },
  // Mew — the source genome, a flowing pulse of pure potential (no drawback).
  151: mk('Genome Pulse', 'psychic', 110, 1, undefined, 'energy'),

  // <<<FANOUT>>> — gens I (remainder)–IX appended here by the authoring pass.
};
