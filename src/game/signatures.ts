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

  // Pikachu line (keyed at Pichu, the base, so Pichu/Pikachu/Raichu all inherit & scale).
  172: mk('Volt Tackle', 'electric', 120, 1, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
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
  // Snorlax line (keyed at Munchlax, the base, so Munchlax/Snorlax inherit & scale).
  446: { ...mk('Giga Impact', 'normal', 150, 0.9, undefined, 'physical'), lockTurns: 2 },
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


  // ============================ GEN 1 ============================
  // Caterpie line (final: Butterfree) — sheds glittering sleep-scales from its wings to lull prey
  10: mk('Dreamdust Flurry', 'bug', 85, 1, { kind: 'sleep', chance: 0.3 }, 'energy'),
  // Weedle line (final: Beedrill) — a swarming barrage of venom-tipped forelances
  13: mk('Venom Lance Volley', 'bug', 90, 1, { kind: 'poison', chance: 0.3 }),
  // Pidgey line (final: Pidgeot) — a sovereign dive on howling gale-force winds
  16: mk('Skylord Gale', 'flying', 100, 1, { kind: 'flinch', chance: 0.2 }),
  // Rattata line (final: Raticate) — ever-growing incisors tear and drain the wound
  19: mk('Incisor Rend', 'normal', 85, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Spearow line (final: Fearow) — a relentless plummeting beak-stab from on high
  21: mk('Beakspear Plunge', 'flying', 95, 1),
  // Ekans line (final: Arbok) — coils and crushes, the menacing hood loosening the foe's guard
  23: mk('Constrictor Coil', 'poison', 90, 1, { kind: 'stage', stat: 'def', delta: -1, chance: 1, target: 'foe' }),
  // Paras line (final: Parasect) — the host mushroom showers paralytic spores as it claws
  46: mk('Sporing Seizure', 'grass', 85, 1, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Venonat line (final: Venomoth) — scatters a cloud of toxic scale-powder from beating wings
  48: mk('Noxious Wingdust', 'poison', 85, 1, { kind: 'poison', chance: 0.4 }, 'energy'),
  // Meowth line — Meowth/Persian's nimble snatch-and-scratch (steel Perrserker keyed at 863).
  52: mk('Coin Fury', 'normal', 90, 1, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }, 'physical'),
  // Psyduck line (final: Golduck) — a mystic riptide laced with mind-fogging psychic current
  54: mk('Esper Undertow', 'water', 90, 1, { kind: 'confuse', chance: 0.3 }),
  // Mankey line (final: Annihilape) — boundless rage made flesh, tearing the user as it strikes
  56: mk('Wrath Eternal', 'fighting', 120, 0.95, { kind: 'recoil', fraction: 1/3 }),
  // Poliwag line (final: Poliwrath; branch: Politoed/water) — a hammering knuckle wreathed in a vortex
  60: mk('Maelstrom Knuckle', 'water', 100, 1, undefined, 'physical'),
  // Bellsprout line (final: Victreebel) — sprays digestive acid mist from its gaping pitcher
  69: mk('Corrosive Bloom', 'grass', 100, 1, { kind: 'poison', chance: 0.3 }),
  // Tentacool line (final: Tentacruel) — a curtain of stinging tendrils that numb on contact
  72: mk('Medusa Lash', 'water', 90, 1, { kind: 'stun', chance: 0.3 }),
  // Slowpoke line (final: Slowking; branch: Slowbro) — a regal mind-pressure that dulls the foe's focus
  79: mk('Sovereign Psyche', 'psychic', 90, 1, { kind: 'stage', stat: 'eatk', delta: -1, chance: 1, target: 'foe' }),
  // Magnemite line (final: Magnezone) — a tri-magnet field collapse that overloads the nervous system
  81: mk('Polarity Storm', 'electric', 120, 0.9, { kind: 'stun', chance: 0.3 }),
  // Farfetch'd line (final: Sirfetch'd) — a gallant knight's precise, unerring leek-lance thrust
  83: mk('Gallant Skewer', 'fighting', 115, 0.95),
  // Doduo line (final: Dodrio) — three heads strike in a blinding, staggering peck-flurry
  84: mk('Tri-Beak Blitz', 'flying', 95, 1, { kind: 'flinch', chance: 0.3 }),
  // Seel line (final: Dewgong) — an elegant glide trailing supercooled, flesh-numbing frost
  86: mk('Glacial Serenade', 'ice', 90, 1, { kind: 'frostbite', chance: 0.3 }),
  // Grimer line (final: Muk) — a smothering wave of clinging sludge that bogs the foe down
  88: mk('Putrid Avalanche', 'poison', 100, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.5, target: 'foe' }),
  // Onix line (final: Steelix) — the iron serpent's whole body coils into a crushing earthen tremor
  95: mk('Ironclad Tremor', 'ground', 105, 0.95),
  // Drowzee line (final: Hypno) — a swaying pendulum that drags the foe into helpless slumber
  96: mk('Pendulum Lull', 'psychic', 85, 1, { kind: 'sleep', chance: 0.3 }),
  // Krabby line (final: Kingler) — a colossal pincer slams shut with bone-splintering force
  98: mk('Crusher Pincer', 'water', 110, 0.95, undefined, 'physical'),
  // Voltorb line (final: Electrode) — vents its entire charge in a self-rending detonation
  100: mk('Overload Burst', 'electric', 110, 0.95, { kind: 'recoil', fraction: 1/2 }),
  // Exeggcute line (final: Exeggutor) — every head unleashes a thundering psychic-fueled growth surge
  102: mk('Verdant Cataclysm', 'grass', 120, 0.9),
  // Cubone line (final: Marowak) — hurls its mother's bone in a grief-stricken, returning arc
  104: mk('Wraithbone Hurl', 'ground', 90, 1),
  // Lickitung line (final: Lickilicky) — a colossal tongue-lash that slathers and numbs the foe
  108: mk('Slobber Lash', 'normal', 90, 1, { kind: 'stun', chance: 0.3 }),
  // Koffing line (final: Weezing) — exhales a lingering, lung-searing cloud of poison gas
  109: mk('Choking Smogfall', 'poison', 90, 1, { kind: 'poison', chance: 0.5 }, 'energy'),
  // Rhyhorn line (final: Rhyperior) — fires a salvo of geodes from its arm-cannons, bracing through recoil
  111: { ...mk('Geode Cannonade', 'rock', 130, 0.9), selfStage: { stat: 'def', delta: -1 } },
  // Tangela line (final: Tangrowth) — endless thorned vines coil the foe and siphon its vigor
  114: mk('Thornmass Siphon', 'grass', 115, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Kangaskhan (standalone) — a parent's protective fury, a body-check that rattles the foe
  115: mk('Matriarch Fury', 'normal', 100, 1, { kind: 'flinch', chance: 0.2 }),
  // Horsea line (final: Kingdra; water/dragon) — summons an abyssal tempest, an ultimate that exhausts its wyrm-might
  116: { ...mk('Tempest Wyrm', 'dragon', 130, 0.9), lockTurns: 2 },
  // Goldeen line (final: Seaking) — a goring upstream charge driven by its horn
  118: mk('Hornpoint Charge', 'water', 95, 1, undefined, 'physical'),
  // Pinsir (standalone) — clamps the foe in vice-like horns and wrenches its guard apart
  127: mk('Vicegrip Sunder', 'bug', 110, 0.95, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }),
  // Tauros (standalone) — a thrashing three-tail stampede that batters user and foe alike
  128: mk('Stampede Rampage', 'normal', 110, 0.95, { kind: 'recoil', fraction: 1/3 }),
  // Ditto (standalone) — half-shifts into a lashing pseudopod and slaps with copied form
  132: mk('Morphic Lash', 'normal', 80, 1),
  // Porygon line (final: Porygon-Z) — floods the foe with corrupted data, scrambling its senses
  137: mk('Datastream Havoc', 'normal', 120, 0.9, { kind: 'confuse', chance: 0.3 }, 'energy'),
  // Omanyte line (final: Omastar) — focuses crushing abyssal pressure through its spiral shell
  138: mk('Primeval Spiral', 'water', 110, 0.95),
  // Kabuto line (final: Kabutops) — sickle-scythes rake deep and drain the foe's bodily fluids
  140: mk('Bloodscythe Reaver', 'rock', 105, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Aerodactyl (standalone) — a supersonic stoop, fanged maw first, that leaves the foe reeling
  142: mk('Skyfang Plummet', 'rock', 105, 0.95, { kind: 'flinch', chance: 0.3 }),

  // ============================ GEN 2 ============================
  // Chikorita line (final: Meganium) — its calming herbal aroma lulls a foe's fury before the petalstorm lands.
  152: mk('Soothing Petalfall', 'grass', 90, 1, { kind: 'stage', stat: 'atk', delta: -1, chance: 1, target: 'foe' }),
  // Cyndaquil line (final: Typhlosion) — a cloak of flame erupts from its nape and wraps the battlefield in fire.
  155: mk('Infernal Mantle', 'fire', 110, 0.95, { kind: 'burn', chance: 0.3 }),
  // Totodile line (final: Feraligatr) — bone-crushing jaws snap shut from the depths; pure predatory power.
  158: mk('Abyssal Chomp', 'water', 115, 0.9, undefined, 'physical'),
  // Sentret line (final: Furret) — it coils its long body and springs from ambush before the foe can react.
  161: mk('Coil Ambush', 'normal', 88, 1, { kind: 'flinch', chance: 0.2 }),
  // Hoothoot line (final: Noctowl) — a hypnotic moonlit wingbeat that scrambles the senses.
  163: mk('Mesmer Gale', 'flying', 95, 1, { kind: 'confuse', chance: 0.3 }, 'energy'),
  // Ledyba line (final: Ledian) — it gathers starlight in its spots and unleashes a flurry of glowing jabs.
  165: mk('Starborne Flurry', 'bug', 85, 1, undefined, 'energy'),
  // Spinarak line (final: Ariados) — venom-soaked silk lashes out and fangs sink in from the dark.
  167: mk('Threadfang Snare', 'bug', 88, 1, { kind: 'poison', chance: 0.3 }),
  // Chinchou line (final: Lanturn) — the deep-sea lure flares and discharges a stunning current.
  170: mk('Anglerlight Surge', 'electric', 95, 1, { kind: 'stun', chance: 0.3 }),
  // Cleffa line (final: Clefable) — a moonlit waltz of fairy light that bewilders all who watch.
  173: mk('Moonbloom Waltz', 'fairy', 95, 1, { kind: 'confuse', chance: 0.3 }),
  // Igglybuff line (final: Wigglytuff) — a soft lullaby that drifts foes off to sleep mid-fight.
  174: mk('Slumber Serenade', 'normal', 85, 1, { kind: 'sleep', chance: 0.3 }, 'energy'),
  // Togepi line (final: Togekiss) — a radiant burst of blessing that rains joy and ruin alike.
  175: mk('Empyrean Jubilee', 'fairy', 115, 0.9),
  // Natu line (final: Xatu) — gazing at past and future at once, it looses a sun-bright divination.
  177: mk('Solstice Augury', 'psychic', 95, 1, { kind: 'confuse', chance: 0.3 }),
  // Mareep line (final: Ampharos) — its tail-beacon flares like a lighthouse and hurls a guiding bolt.
  179: mk('Beacon Bolt', 'electric', 110, 0.95, { kind: 'stun', chance: 0.3 }),
  // Hoppip line (final: Jumpluff) — it rides the wind and showers sleep-laden cotton spores.
  187: mk('Cottonspore Drift', 'grass', 85, 1, { kind: 'sleep', chance: 0.3 }),
  // Aipom line (final: Ambipom) — twin tails hammer in rapid tandem, dazing the target.
  190: mk('Tandem Tailstorm', 'normal', 95, 1, { kind: 'flinch', chance: 0.3 }),
  // Sunkern line (final: Sunflora) — it drinks the noon sun and exhales a blistering solar bloom.
  191: mk('Helios Bloom', 'grass', 90, 1),
  // Yanma line (final: Yanmega) — ancient wings clap out a sonic shockwave that rattles the foe.
  193: mk('Resonant Wingstorm', 'bug', 110, 0.95, { kind: 'flinch', chance: 0.3 }, 'energy'),
  // Wooper line (branched -> Clodsire/Quagsire; final shown: Clodsire) — venom-tipped spines erupt from the bog underfoot.
  194: mk('Quagspine Ambush', 'ground', 90, 1, { kind: 'poison', chance: 0.3 }),
  // Murkrow line (final: Honchkrow) — the night boss calls in its murder and falls upon the foe.
  198: mk('Nightboss Reckoning', 'dark', 115, 0.9, undefined, 'physical'),
  // Misdreavus line (final: Mismagius) — a cursed incantation whose syllables warp the mind.
  200: mk('Grimoire Chant', 'ghost', 100, 0.95, { kind: 'confuse', chance: 0.3 }, 'energy'),
  // Unown — countless ancient glyphs swirl up and crash down as raw hidden power.
  201: mk('Glyphstorm', 'psychic', 80, 1),
  // Girafarig line (final: Farigiraf) — front brain and tail brain pulse out of sync, a maddening psychic wave.
  203: mk('Dualbrain Resonance', 'psychic', 110, 0.95, { kind: 'confuse', chance: 0.3 }),
  // Pineco line (final: Forretress) — the steel fortress vents a self-rending blast of shrapnel.
  204: mk('Bulwark Detonation', 'steel', 100, 0.95, { kind: 'recoil', fraction: 1/4 }),
  // Dunsparce line (final: Dudunsparce) — the land-serpent bores forward in an unstoppable drilling rush.
  206: mk('Boreworm Rampage', 'normal', 110, 0.95),
  // Gligar line (final: Gliscor) — a silent night-glide ends in a fang-strike that drains the foe's blood.
  207: mk('Eclipse Fang', 'ground', 100, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Snubbull line (final: Granbull) — a colossal fairy-fanged bite that cracks the guard wide open.
  209: mk('Fellfang Crush', 'fairy', 100, 0.95, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }, 'physical'),
  // Qwilfish line (final: Overqwil) — a malice-fueled barrage of a thousand venomous barbs.
  211: mk('Venomspite Barrage', 'dark', 105, 0.95, { kind: 'poison', chance: 0.3 }, 'physical'),
  // Shuckle — it splashes its infamous fermented berry brew, a feeble splash but reliably toxic.
  213: mk('Putrid Vintage', 'poison', 55, 1, { kind: 'poison', chance: 1 }, 'energy'),
  // Heracross — it digs in its heels and hurls the foe with a reckless, world-shaking horn gore.
  214: mk('Goliath Gore', 'bug', 115, 0.9, { kind: 'recoil', fraction: 1/4 }),
  // Sneasel line — Sneasel/Weavile's dark-ice claw flurry (fighting/poison Sneasler keyed at 903).
  215: mk('Nightfall Reaver', 'dark', 110, 1, undefined, 'physical'),
  // Teddiursa line (final: Ursaluna) — under the blood moon it goes berserk, smashing the earth heedless of harm.
  216: mk('Crimsonmoon Crush', 'ground', 120, 0.9, { kind: 'recoil', fraction: 1/3 }),
  // Slugma line (final: Magcargo) — molten 1800-degree lava sluices from its shell in a searing flow.
  218: mk('Cinderflow Surge', 'fire', 90, 1, { kind: 'burn', chance: 0.3 }),
  // Swinub line (final: Mamoswine) — an ice-age mammoth's tusks gore through with primeval force.
  220: mk('Tundra Gore', 'ice', 115, 0.9, undefined, 'physical'),
  // Corsola line (branched; final shown: Cursola) — its cursed coral leeches the soul's vitality away.
  222: mk('Cursebrand Drain', 'ghost', 105, 0.95, { kind: 'lifesteal', fraction: 0.5 }, 'energy'),
  // Remoraid line (final: Octillery) — eight suckered arms clamp the foe in a crushing aquatic vice.
  223: mk('Tentacle Vice', 'water', 100, 0.95, undefined, 'physical'),
  // Delibird — it lobs its sack-gift, an icy surprise that may leave the foe frostbitten.
  225: mk('Yuletide Surprise', 'ice', 80, 1, { kind: 'frostbite', chance: 0.3 }),
  // Skarmory — it dives with bladed steel pinions that shred straight through armor.
  227: mk('Razorpinion Dive', 'steel', 95, 1, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }),
  // Houndour line (final: Houndoom) — hellhound flames that scar with a burn slow to ever heal.
  228: mk('Cerberus Pyre', 'fire', 105, 0.95, { kind: 'burn', chance: 0.4 }),
  // Phanpy line (final: Donphan) — it curls into a wheel and barrels through, taking the bruises itself.
  231: mk('Tuskwheel Charge', 'ground', 110, 0.95, { kind: 'recoil', fraction: 1/4 }),
  // Stantler line (final: Wyrdeer) — its mystic antlers conjure a disorienting spectral mirage.
  234: mk('Spectral Antler', 'psychic', 110, 0.95, { kind: 'confuse', chance: 0.3 }),
  // Smeargle — a chaotic splatter of tail-paint that smears the foe's vision and senses.
  235: mk('Prismatic Smear', 'normal', 70, 1, { kind: 'confuse', chance: 0.3 }),
  // Tyrogue line (branched -> Hitmontop/Hitmonchan/Hitmonlee; shared brawler identity, stats shown: Hitmontop) — a whirling spiral kick.
  236: mk('Spiral Tempo Kick', 'fighting', 95, 1),
  // Smoochum line (final: Jynx) — an icy diva's aria that chills foes to a frostbitten stupor.
  238: mk('Glacial Aria', 'ice', 100, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Elekid line (final: Electivire) — twin tails pin the foe and dump a galvanic fist-flurry of current.
  239: mk('Galvanic Onslaught', 'electric', 115, 0.9, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Magby line (final: Magmortar) — both arm-cannons roar, raining 2000-degree fireballs.
  240: mk('Inferno Cannonade', 'fire', 115, 0.9, { kind: 'burn', chance: 0.3 }),
  // Miltank — a thundering rolling stampede that bowls the foe over before it can brace.
  241: mk('Heartland Stampede', 'normal', 95, 1, { kind: 'flinch', chance: 0.3 }),
  // Raikou — the thunder-beast looses a storm-roar that splits the sky and numbs the foe.
  243: mk('Tempest Roar', 'electric', 120, 0.9, { kind: 'stun', chance: 0.3 }),
  // Entei — the volcano-beast charges wreathed in eruptive flame that sears on contact.
  244: mk('Pyroclasm Charge', 'fire', 120, 0.9, { kind: 'burn', chance: 0.3 }, 'physical'),
  // Suicune — the north-wind embodiment washes a chilling aurora-tide that saps the foe's energy.
  245: mk('Northwind Aurora', 'water', 115, 0.9, { kind: 'stage', stat: 'eatk', delta: -1, chance: 0.3, target: 'foe' }),
  // Lugia — guardian of the seas conjures a world-stirring vortex so vast it must rest after (off-type psychic coverage).
  249: { ...mk('Tempest Genesis', 'flying', 150, 0.95, undefined, 'energy'), lockTurns: 3 },
  // Ho-Oh — the rainbow phoenix dives in sacred flame, immolating itself to ash before it rises again.
  250: { ...mk('Phoenix Rainbowdive', 'fire', 150, 0.95, undefined, 'physical'), selfStage: { stat: 'def', delta: -2 } },
  // Celebi — voice of the forest, it pours the renewing tide of life through time and draws vitality back.
  251: mk('Worldtree Renewal', 'grass', 115, 0.9, { kind: 'lifesteal', fraction: 0.5 }),

  // ============================ GEN 3 ============================
  // Treecko line (final: Sceptile) — the forest's blade-armed monitor unleashes a green gale.
  252: mk('Emerald Tempest', 'grass', 110, 0.95),
  // Torchic line (final: Blaziken) — a blazing martial-arts kick that scorches on impact.
  255: { ...mk('Phoenix Talon', 'fire', 112, 0.95, { kind: 'burn', chance: 0.2 }, 'physical') },
  // Mudkip line (final: Swampert) — a muscle-driven tidal hammer; physical despite the Water typing.
  258: mk('Tidal Maul', 'water', 110, 0.95, undefined, 'physical'),
  // Poochyena line (final: Mightyena) — a pack predator's moonlit lunge for the throat.
  261: mk('Nightfang Rush', 'dark', 90, 1, undefined, 'physical'),
  // Zigzagoon line (final: Obstagoon) — punk-rocker barricade smash; line ends Dark/Normal.
  263: mk('Outlaw Smash', 'dark', 95, 1, undefined, 'physical'),
  // Wurmple branch (final shown: Beautifly) — soporific bloom-dust drifts over the foe.
  265: mk('Mesmer Pollen', 'bug', 82, 1, { kind: 'sleep', chance: 0.2 }, 'energy'),
  // Lotad line (final: Ludicolo) — a carefree dancer summons a festive downpour.
  270: mk('Mariachi Maelstrom', 'water', 95, 1),
  // Seedot line (final: Shiftry) — the tengu's fan-leaves carve a dark whirlwind (physical Dark).
  273: mk('Tengu Tempest', 'dark', 100, 0.95, undefined, 'physical'),
  // Taillow line (final: Swellow) — a screaming dive-bomb that rattles the prey.
  276: mk('Falcon Plummet', 'flying', 92, 0.95, { kind: 'flinch', chance: 0.3 }),
  // Wingull line (final: Pelipper) — the storm-bringer pelican empties a gale-fed deluge.
  278: mk('Stormgale Deluge', 'water', 90, 1),
  // Ralts branch (final shown: Gallade; Gardevoir is the Fairy energy sibling) — psychic blade-elbow flurry.
  280: mk('Mindblade Flurry', 'psychic', 112, 0.95, undefined, 'physical'),
  // Surskit line (final: Masquerain) — false-eye wing patterns cow the foe into shrinking back.
  283: mk('Hypnotic Eyespots', 'bug', 88, 1, { kind: 'stage', stat: 'atk', delta: -1, chance: 1, target: 'foe' }, 'energy'),
  // Shroomish line (final: Breloom) — a Technician-fast spore-fist combo straight to the jaw.
  285: mk('Mycelial Uppercut', 'fighting', 108, 0.9),
  // Slakoth line (final: Slaking) — a colossal, lazy haymaker; the brute loafs afterward.
  287: { ...mk('Brute Cataclysm', 'normal', 150, 0.9), selfStage: { stat: 'atk', delta: -2 } },
  // Nincada branch (final shown: Ninjask) — a wingbeat too fast to track, leaving the foe reeling.
  290: mk('Blinding Wingbeat', 'bug', 88, 1, { kind: 'flinch', chance: 0.4 }),
  // Whismur line (final: Exploud) — a disorienting seismic bellow (sound = energy-side Normal).
  293: mk('Cacophonous Roar', 'normal', 95, 0.95, { kind: 'confuse', chance: 0.2 }, 'energy'),
  // Makuhita line (final: Hariyama) — a thunderous sumo palm-thrust.
  296: mk('Tectonic Palm', 'fighting', 108, 0.9),
  // Azurill line (final: Azumarill) — a Huge-Power haymaker in soft pink fists (physical Fairy).
  298: mk('Pixie Pummel', 'fairy', 90, 0.95, undefined, 'physical'),
  // Nosepass line (final: Probopass) — a magnetic ore-barrage hurled from its mini-units (energy Steel).
  299: mk('Lodestone Pulse', 'steel', 90, 1, undefined, 'energy'),
  // Skitty line (final: Delcatty) — a prim, plush-pawed pounce.
  300: mk('Velvet Pounce', 'normal', 82, 1),
  // Sableye (single stage) — a thieving gemstone-clawed swipe from the dark (physical Dark).
  302: mk('Larcenous Claw', 'dark', 82, 1, undefined, 'physical'),
  // Mawile (single stage) — the deceiver's enormous steel jaws clamp shut.
  303: mk('Deceiver\'s Bite', 'steel', 90, 0.95),
  // Meditite line (final: Medicham) — Pure-Power channeled into a meditative strike.
  307: mk('Yogic Fury', 'fighting', 90, 0.95),
  // Electrike line (final: Manectric) — a crackling thunder-howl that can lock muscles.
  309: mk('Voltaic Howl', 'electric', 95, 1, { kind: 'stun', chance: 0.3 }),
  // Plusle (single stage) — a bright, morale-boosting spark.
  311: mk('Rallying Spark', 'electric', 84, 1),
  // Minun (single stage) — a defensive minus-charge that snags the foe's nerves.
  312: mk('Negative Charge', 'electric', 78, 1, { kind: 'stun', chance: 0.3 }),
  // Volbeat (single stage) — a glowing tail-ram in the night.
  313: mk('Glowtail Ram', 'bug', 82, 1),
  // Illumise (single stage) — a maddening sweet pheromone cloud (energy Bug).
  314: mk('Bewitching Aroma', 'bug', 80, 1, { kind: 'confuse', chance: 0.3 }, 'energy'),
  // Gulpin line (final: Swalot) — a corrosive gulp-and-spew that always leaves toxin behind.
  316: mk('Acid Gulp', 'poison', 80, 1, { kind: 'poison', chance: 1 }),
  // Carvanha line (final: Sharpedo) — a reckless torpedo-charge; the bullet shark tears itself up.
  318: mk('Torpedo Charge', 'water', 105, 0.95, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
  // Wailmer line (final: Wailord) — the float whale erupts a leviathan-sized spout.
  320: mk('Leviathan Spout', 'water', 100, 0.95),
  // Numel line (final: Camerupt) — twin volcanic humps blast a searing caldera burst.
  322: mk('Caldera Burst', 'fire', 98, 0.95, { kind: 'burn', chance: 0.2 }),
  // Torkoal (single stage) — slow-burning coals belch smoldering embers that scald.
  324: mk('Smoldering Cinders', 'fire', 85, 1, { kind: 'burn', chance: 0.5 }),
  // Spoink line (final: Grumpig) — its black pearls hum a mind-rattling resonance.
  325: mk('Pearl Resonance', 'psychic', 92, 1),
  // Spinda (single stage) — a staggering, off-balance waltz that dizzies all involved.
  327: mk('Dizzy Waltz', 'normal', 75, 1, { kind: 'confuse', chance: 0.5 }),
  // Trapinch line (final: Flygon) — the Desert Spirit's mirage-cloaked wyrm-dive (physical Dragon).
  328: mk('Mirage Wyrmstrike', 'dragon', 110, 0.95, undefined, 'physical'),
  // Cacnea line (final: Cacturne) — barbed roots drink the foe's vitality under the desert moon.
  331: mk('Thornroot Siphon', 'grass', 95, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Swablu line (final: Altaria) — the cloud-dragon's soaring, resonant aria.
  333: mk('Empyrean Aria', 'dragon', 92, 1),
  // Zangoose (single stage) — a vendetta-fueled claw-frenzy that shreds the foe's guard.
  335: mk('Vendetta Claw', 'normal', 98, 0.95, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }),
  // Seviper (single stage) — a venom-slicked blade-tail lash, eternal rival to Zangoose.
  336: mk('Bladed Venomtail', 'poison', 95, 0.95, { kind: 'poison', chance: 0.3 }),
  // Lunatone (single stage) — cold moonstone light lances out (energy Rock).
  337: mk('Selenite Beam', 'rock', 90, 1, undefined, 'energy'),
  // Solrock (single stage) — a solar-forged body-slam that can sear (physical Rock).
  338: mk('Sunforge Slam', 'rock', 90, 0.95, { kind: 'burn', chance: 0.2 }),
  // Barboach line (final: Whiscash) — the whiskered catfish triggers a muddy local quake.
  339: mk('Quagmire Quake', 'ground', 90, 0.95),
  // Corphish line (final: Crawdaunt) — the rogue's oversized pincer crushes (physical Water).
  341: mk('Crushing Pincer', 'water', 102, 0.95, undefined, 'physical'),
  // Baltoy line (final: Claydol) — the ancient clay idol channels a geomantic surge (energy Ground).
  343: mk('Geomantic Pulse', 'ground', 90, 1, undefined, 'energy'),
  // Lileep line (final: Cradily) — primeval tentacle-fronds ensnare and root the prey in place.
  345: mk('Primeval Snare', 'grass', 88, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 1, target: 'foe' }),
  // Anorith line (final: Armaldo) — fossil claws said to cleave steel.
  347: mk('Primal Cleaver', 'rock', 102, 0.95),
  // Feebas line (final: Milotic) — the tender serpent unleashes a shimmering cascade.
  349: mk('Serpentine Cascade', 'water', 110, 0.95),
  // Castform (single stage) — its weather-shifting body lashes out in a sudden tempest (energy Normal).
  351: mk('Tempest Shift', 'normal', 85, 0.95, undefined, 'energy'),
  // Kecleon (single stage) — a color-shifting whip of its long sticky tongue.
  352: mk('Chameleon Lash', 'normal', 88, 1),
  // Shuppet line (final: Banette) — the grudge-doll lurches forward on cursed strings.
  353: mk('Vengeful Marionette', 'ghost', 98, 0.95),
  // Duskull line (final: Dusknoir) — the reaper's maw devours a soul and drains its life.
  355: mk('Soul Siphon Grasp', 'ghost', 100, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Tropius (single stage) — banana-laden boughs sweep a fragrant orchard gale.
  357: mk('Fruitful Tempest', 'grass', 88, 1),
  // Absol (single stage) — its disaster-horn carves an omen of ruin (physical Dark).
  359: mk('Disaster\'s Edge', 'dark', 110, 0.95, undefined, 'physical'),
  // Wynaut line (final: Wobbuffet) — a patient counter-blow that saps the striker's power.
  360: mk('Stoic Backlash', 'psychic', 75, 1, { kind: 'stage', stat: 'eatk', delta: -1, chance: 1, target: 'foe' }),
  // Snorunt branch (final shown: Froslass) — the snow-spirit's frost-numbing kiss.
  361: mk('Yuki-Onna\'s Kiss', 'ice', 92, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Spheal line (final: Walrein) — the ice-breaker bull-walrus bellows a hailstorm.
  363: mk('Hailstorm Bellow', 'ice', 110, 0.9),
  // Clamperl branch (final shown: Gorebyss) — the deep-sea beauty siphons fluids through its slender mouth.
  366: mk('Abyssal Siphon', 'water', 95, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Relicanth (single stage) — a living-fossil headbutt as heavy as the abyss it endures.
  369: mk('Fossil Ram', 'rock', 90, 0.95, { kind: 'recoil', fraction: 1 / 4 }),
  // Luvdisc (single stage) — a heart-shaped splash that flusters the foe.
  370: mk('Sweetheart Splash', 'water', 75, 1),
  // Beldum line (final: Metagross) — four linked brains drive a crushing iron hammer-blow.
  374: mk('Hyperbrain Hammer', 'steel', 128, 0.9),
  // Regirock (legendary golem) — a megalithic boulder-crush of titanic mass.
  377: mk('Megalith Crush', 'rock', 115, 0.9),
  // Regice (legendary golem) — absolute-zero energy that bites with deep frostbite.
  378: mk('Absolute Zero Pulse', 'ice', 112, 0.9, { kind: 'frostbite', chance: 0.3 }),
  // Registeel (legendary golem) — an adamantine onslaught of alien-dense metal.
  379: mk('Adamant Barrage', 'steel', 112, 0.9),
  // Latias (Eon legendary) — an empathic mirage-burst that bends the foe's senses.
  380: mk('Empath\'s Mirage', 'psychic', 122, 0.95),
  // Latios (Eon legendary) — a streaking, intellect-honed dragon dive from the stratosphere.
  381: mk('Eonstorm Dive', 'dragon', 130, 0.9),
  // Kyogre (box legendary) — the primal sea swells into a world-drowning deluge; the effort drains it.
  382: { ...mk('Primordial Deluge', 'water', 150, 0.95), selfStage: { stat: 'eatk', delta: -2 } },
  // Groudon (box legendary) — continents split as molten earth heaves; the recoil saps its strength.
  383: { ...mk('Continental Rift', 'ground', 150, 0.95), selfStage: { stat: 'atk', delta: -2 } },
  // Rayquaza (sky legendary) — the ozone serpent's ultimate skyfall; it can't repeat a Dragon move at once.
  384: { ...mk('Emerald Skybreaker', 'dragon', 150, 0.95), lockTurns: 3 },
  // Jirachi (mythical) — a wish-granting comet plummets in a thousand-year fall.
  385: mk('Cometfall Wish', 'psychic', 122, 0.95),
  // Deoxys Normal (mythical) — its mutated DNA overloads into a stellar burst; the strain drains its psyche.
  386: { ...mk('Astral Mutagen', 'psychic', 150, 0.95), selfStage: { stat: 'eatk', delta: -2 } },

  // ============================ GEN 4 ============================
  // Turtwig line (final: Torterra) — the living continent heaves its forest-shell skyward.
  387: mk('Tectonic Bloom', 'ground', 110),
  // Chimchar line (final: Infernape) — a blazing martial flurry of flaming fists.
  390: mk('Pyre Gauntlet', 'fire', 110, 1, { kind: 'flinch', chance: 0.2 }, 'physical'),
  // Piplup line (final: Empoleon) — the steel emperor calls down a crowned whirlpool.
  393: mk('Imperial Maelstrom', 'water', 110),
  // Starly line (final: Staraptor) — a fearless raptor folds its wings and plummets.
  396: mk('Skyfall Talon', 'flying', 115, 0.95, { kind: 'recoil', fraction: 1/3 }),
  // Bidoof line (final: Bibarel) — gnashing dam-builder's teeth on a bursting floodgate.
  399: mk('Floodgate Gnaw', 'water', 90, 1, undefined, 'physical'),
  // Kricketot line (final: Kricketune) — a maddening, off-key insect serenade.
  401: mk('Discordant Serenade', 'bug', 88, 1, { kind: 'confuse', chance: 0.3 }),
  // Shinx line (final: Luxray) — x-ray eyes mark the prey before the electric pounce.
  403: mk('Voltfang Ambush', 'electric', 115, 0.95, { kind: 'stun', chance: 0.2 }, 'physical'),
  // Budew line (final: Roserade) — a dancer's bouquet showers venomous petals.
  406: mk('Masquerade Bloom', 'grass', 110, 1, { kind: 'poison', chance: 0.3 }),
  // Cranidos line (final: Rampardos) — the battering-ram skull caves in everything.
  408: mk('Skullbreaker Charge', 'rock', 120, 0.95, { kind: 'recoil', fraction: 1/3 }),
  // Shieldon line (final: Bastiodon) — the living fortress answers with a shield-bash quake.
  410: mk('Rampart Slam', 'steel', 90, 1, { kind: 'stun', chance: 0.3 }),
  // Burmy line — Burmy/Wormadam's cloak-spun scale burst (flying Mothim keyed at 414).
  412: mk('Mantle Spores', 'bug', 90, 1, undefined, 'energy'),
  // Combee line (final: Vespiquen) — the hive-queen looses a vengeful stinging swarm.
  415: mk('Regent\'s Swarm', 'bug', 95, 1, { kind: 'poison', chance: 0.3 }),
  // Pachirisu (standalone) — charged cheek-fur snaps a stinging jolt.
  417: mk('Cheekspark Jolt', 'electric', 80, 1, { kind: 'stun', chance: 0.3 }),
  // Buizel line (final: Floatzel) — the sea-weasel rides the undertow into a blindside.
  418: mk('Undertow Rush', 'water', 100, 1, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Cherubi line (final: Cherrim) — the sun-bloom unfurls in a blast of radiant pollen.
  420: mk('Radiant Bloom', 'grass', 90),
  // Shellos line (final: Gastrodon) — a brackish tide of clinging ooze drags the foe down.
  422: mk('Mire Tide', 'water', 95, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.3, target: 'foe' }),
  // Drifloon line (final: Drifblim) — the drifting balloon levies its toll in souls.
  425: mk('Soul Tithe', 'ghost', 90, 1, { kind: 'lifesteal', fraction: 0.5 }, 'energy'),
  // Buneary line (final: Lopunny) — a blur of elegant high-kicks rains down.
  427: mk('Highstep Barrage', 'normal', 95, 1, { kind: 'flinch', chance: 0.3 }),
  // Glameow line (final: Purugly) — the smug brawler bowls the foe over in a back-alley rush.
  431: mk('Alley Ambush', 'normal', 90, 1, { kind: 'flinch', chance: 0.3 }),
  // Chingling line (final: Chimecho) — a wind-borne death-knell rings the mind senseless.
  433: mk('Aeolian Knell', 'psychic', 90, 1, { kind: 'confuse', chance: 0.3 }),
  // Stunky line (final: Skuntank) — a backfiring jet of rancid, choking spray.
  434: mk('Rancid Spray', 'poison', 95, 1, { kind: 'poison', chance: 0.4 }),
  // Bronzor line (final: Bronzong) — the ancient bell tolls a hypnotic, drowsing gong.
  436: mk('Hypnotic Carillon', 'steel', 95, 1, { kind: 'sleep', chance: 0.3 }),
  // Bonsly line (final: Sudowoodo) — the false tree swings a petrified, stone-hard bough.
  438: mk('Petrified Slam', 'rock', 90, 1, { kind: 'stun', chance: 0.2 }),
  // Mime Jr. line (final: Mr. Rime) — an icy vaudeville waltz freezes the stage.
  439: mk('Glacial Pantomime', 'ice', 110, 1, { kind: 'frostbite', chance: 0.3 }),
  // Happiny line (final: Blissey) — a tender lullaby that lulls any foe to sleep.
  440: mk('Blissful Lullaby', 'normal', 0, 0.75, { kind: 'sleep', chance: 1 }),
  // Chatot (standalone) — a parrot's discordant babble unravels the senses.
  441: mk('Mockingbird Cacophony', 'flying', 85, 1, { kind: 'confuse', chance: 0.5 }, 'energy'),
  // Spiritomb (standalone) — one hundred and eight bound souls wail and drain.
  442: mk('Wailing Keystone', 'ghost', 95, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Gible line (final: Garchomp) — the jet-fast land shark carves the air in two (ultimate).
  443: { ...mk('Jetstream Devastation', 'dragon', 140, 0.95, undefined, 'physical'), lockTurns: 3 },
  // Riolu line (final: Lucario) — a cresting wave of aura erupts from an open palm.
  447: mk('Aurabreak Palm', 'fighting', 115, 0.95, undefined, 'energy'),
  // Hippopotas line (final: Hippowdon) — the desert maw swallows the foe in a sand-tomb.
  449: mk('Sandtomb Maw', 'ground', 110, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.3, target: 'foe' }),
  // Skorupi line (final: Drapion) — twin pincers clamp shut in a venom-slick vice.
  451: mk('Scorpion\'s Vice', 'poison', 100, 1, { kind: 'poison', chance: 0.3 }),
  // Croagunk line (final: Toxicroak) — a venom-spiked knuckle haymaker.
  453: mk('Venomous Haymaker', 'poison', 100, 1, { kind: 'poison', chance: 0.5 }),
  // Carnivine (standalone) — vine-jaws snap shut and feast on the captured foe.
  455: mk('Devouring Snare', 'grass', 95, 1, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Finneon line (final: Lumineon) — bioluminescent fins weave a hypnotic deep-sea mirage.
  456: mk('Phosphor Mirage', 'water', 88, 1, { kind: 'confuse', chance: 0.3 }),
  // Mantyke line (final: Mantine) — the ray banks low and skims a tidal wing across the sea.
  458: mk('Skywave Glide', 'water', 90),
  // Snover line (final: Abomasnow) — the frost-tree titan summons a biting pine-blizzard.
  459: mk('Frostpine Tempest', 'ice', 100, 1, { kind: 'frostbite', chance: 0.3 }),
  // Rotom (standalone) — the plasma-ghost short-circuits everything in a haywire surge.
  479: mk('Haywire Haunt', 'electric', 90, 1, { kind: 'stun', chance: 0.3 }),
  // Uxie (legendary) — the Being of Knowledge wipes memory away in a single glance.
  480: mk('Knowledge\'s Erasure', 'psychic', 110, 1, { kind: 'confuse', chance: 0.3 }),
  // Mesprit (legendary) — the Being of Emotion floods the mind with a heart-rending pulse.
  481: mk('Heartrend Pulse', 'psychic', 115, 0.95, { kind: 'stage', stat: 'eatk', delta: -1, chance: 0.3, target: 'foe' }),
  // Azelf (legendary) — the Being of Willpower drives a psychic willblade clean through.
  482: mk('Willsever Strike', 'psychic', 120, 0.95, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Dialga (box legendary) — the Master of Time roars and shatters the moment (ultimate).
  483: { ...mk('Temporal Cataclysm', 'dragon', 150, 0.95), lockTurns: 3 },
  // Palkia (box legendary) — the Master of Space tears the dimension apart (ultimate).
  484: { ...mk('Dimensional Sundering', 'water', 150, 0.95), lockTurns: 3 },
  // Heatran (legendary) — the magma-beast erupts molten rock from a steel caldera.
  485: mk('Caldera Eruption', 'fire', 125, 0.95, { kind: 'burn', chance: 0.3 }),
  // Regigigas (legendary) — the titan that dragged continents heaves with all its might (ultimate).
  486: { ...mk('Worldshaper\'s Heave', 'normal', 150, 0.95), selfStage: { stat: 'atk', delta: -2 } },
  // Giratina, Altered (legendary) — the Renegade's banished fury rampages from the void.
  487: mk('Renegade\'s Rampage', 'ghost', 130, 0.95),
  // Cresselia (legendary) — the lunar swan drapes the foe in a deep, dreaming reverie.
  488: mk('Crescent Reverie', 'psychic', 110, 1, { kind: 'sleep', chance: 0.3 }),
  // Phione (mythical) — the sea-drifter rides a wandering ocean current.
  489: mk('Wandering Current', 'water', 90),
  // Manaphy (mythical) — the prince of the sea surges with the ocean's living heart.
  490: mk('Oceanheart Surge', 'water', 110, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Darkrai (mythical) — the nightmare-bringer wraps the foe in an umbral sleep.
  491: mk('Umbral Nightmare', 'dark', 125, 0.95, { kind: 'sleep', chance: 0.3 }),
  // Shaymin, Land (mythical) — a halo of gratitude-blooms bursts, withering defenses (Gracidea).
  492: mk('Gracidea Bloom', 'grass', 110, 1, { kind: 'stage', stat: 'edef', delta: -2, chance: 0.2, target: 'foe' }),
  // Arceus (creation god) — the Alpha hands down the edict of creation itself (ultimate).
  493: { ...mk('Genesis Edict', 'normal', 150, 0.95, undefined, 'energy'), selfStage: { stat: 'eatk', delta: -2 } },

  // ============================ GEN 5 ============================
  // Victini (final: Victini) — the Victory mythical hurls its V-shaped power in one ruinous, self-spending blaze.
  494: { ...mk('Conqueror\'s Blaze', 'fire', 130, 0.95, undefined, 'physical'), selfStage: { stat: 'def', delta: -1 } },
  // Snivy line (final: Serperior) — the Regal serpent constricts, throttling the foe's footwork with every coil.
  495: mk('Coiling Sovereign', 'grass', 95, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 1, target: 'foe' }),
  // Tepig line (final: Emboar) — a flame-wreathed boar barrels in, searing itself on its own pyre.
  498: mk('Magmahoof Charge', 'fire', 120, 0.95, { kind: 'recoil', fraction: 1/3 }, 'physical'),
  // Oshawott line (final: Samurott) — a single drawn seamitar cleaves a tidal arc.
  501: mk('Shellblade Onslaught', 'water', 105, 0.95, undefined, 'physical'),
  // Patrat line (final: Watchog) — the lookout strikes the instant a guard drops.
  504: mk('Vigil Pounce', 'normal', 88, 1),
  // Lillipup line (final: Stoutland) — a noble guardian hound bowls the foe over with its windswept mane.
  506: mk('Noble Mane Charge', 'normal', 100, 1),
  // Purrloin line (final: Liepard) — the thieving cat darts in, snatches, and is gone before the blow lands.
  509: mk('Pilfering Ambush', 'dark', 90, 1, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Pansage line (final: Simisage) — a tantrum of whipping bramble-vines.
  511: mk('Bramble Cyclone', 'grass', 95, 1),
  // Pansear line (final: Simisear) — playful cinders that catch and smoulder.
  513: mk('Cinder Capers', 'fire', 95, 1, { kind: 'burn', chance: 0.3 }),
  // Panpour line (final: Simipour) — a mischievous geyser from the tail-tuft.
  515: mk('Torrent Caper', 'water', 95, 1),
  // Munna line (final: Musharna) — dream-smoke that drags the foe into slumber.
  517: mk('Somnolent Haze', 'psychic', 95, 1, { kind: 'sleep', chance: 0.3 }),
  // Pidove line (final: Unfezant) — the proud cock-bird skewers from above with its crest-feathers.
  519: mk('Plumed Skewer', 'flying', 110, 0.95),
  // Blitzle line (final: Zebstrika) — a galloping lightning-charge that leaves the air crackling.
  522: mk('Voltaic Gallop', 'electric', 100, 1, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Roggenrola line (final: Gigalith) — the compression chamber overloads in a quaking detonation.
  524: mk('Boulderquake Crush', 'rock', 120, 0.9),
  // Woobat line (final: Swoobat) — disorienting ultrasonic waves from a heart-shaped nose.
  527: mk('Sonic Reverie', 'psychic', 90, 1, { kind: 'confuse', chance: 0.3 }),
  // Drilbur line (final: Excadrill) — a spinning bore that grinds clean through armor.
  529: mk('Augur Drillstorm', 'ground', 115, 0.9, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }),
  // Audino (final: Audino) — the carer turns harm back on the attacker and siphons their vigor to mend itself.
  531: mk('Mercy Backlash', 'normal', 80, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Timburr line (final: Conkeldurr) — twin concrete pillars come down like a falling building.
  532: mk('Concrete Cataclysm', 'fighting', 120, 0.9),
  // Tympole line (final: Seismitoad) — bumps on its skin release a ground-shuddering pulse.
  535: mk('Quagmire Tremor', 'ground', 100, 1),
  // Throh (final: Throh) — a textbook judo throw that uses the foe's own weight against them.
  538: mk('Judo Heave', 'fighting', 100, 1),
  // Sawk (final: Sawk) — a meditative karate strike said to split mountainsides.
  539: mk('Mountain-Cleaving Chop', 'fighting', 115, 0.9),
  // Sewaddle line (final: Leavanny) — the tailor-mantis carves with razor leaf-scissors.
  540: mk('Guillotine Stitch', 'bug', 105, 0.95),
  // Venipede line (final: Scolipede) — a high-speed venom-tipped trampling.
  543: mk('Virulent Stampede', 'poison', 100, 1, { kind: 'poison', chance: 0.3 }),
  // Cottonee line (final: Whimsicott) — a prankster gust of bewildering cotton-fluff.
  546: mk('Whimsy Whirlwind', 'fairy', 90, 1, { kind: 'confuse', chance: 0.3 }),
  // Petilil line (final: Lilligant) — a hypnotic flower-waltz that lulls onlookers to sleep.
  548: mk('Hypnotic Bloomdance', 'grass', 100, 1, { kind: 'sleep', chance: 0.3 }),
  // Basculin line (final: Basculegion Male) — vengeful spirits drive the body forward, heedless of the wounds.
  550: mk('Lamenting Torrent', 'water', 120, 0.95, { kind: 'recoil', fraction: 1/3 }, 'physical'),
  // Sandile line (final: Krookodile) — the desert ambusher's gaze cows the foe as its jaws close.
  551: mk('Predator\'s Maw', 'dark', 115, 0.95, { kind: 'stage', stat: 'atk', delta: -1, chance: 0.3, target: 'foe' }, 'physical'),
  // Darumaka line (final: Darmanitan Standard) — a blazing daruma headbutt fueled by burning fat.
  554: mk('Daruma Inferno Charge', 'fire', 120, 0.9, { kind: 'recoil', fraction: 1/3 }, 'physical'),
  // Maractus (final: Maractus) — a sun-soaked castanet rhythm that flings pollen-needles.
  556: mk('Prickly Crescendo', 'grass', 95, 1),
  // Dwebble line (final: Crustle) — the foe is crushed beneath the crab's borrowed boulder-shell.
  557: mk('Strata Crush', 'rock', 105, 0.95),
  // Scraggy line (final: Scrafty) — a headbutt from beneath its baggy hide cracks the foe's stance.
  559: mk('Crestfall Headbutt', 'dark', 90, 1, { kind: 'stage', stat: 'def', delta: -1, chance: 1, target: 'foe' }, 'physical'),
  // Sigilyph (final: Sigilyph) — ancient glyphs flare and scramble the foe's focus.
  561: mk('Wardglyph Pulse', 'psychic', 95, 1, { kind: 'stage', stat: 'eatk', delta: -1, chance: 0.3, target: 'foe' }),
  // Yamask line (branched -> Cofagrigus / Runerigus; final shown: Runerigus) — a cursed slab seals the foe under ancient stone.
  562: mk('Tomb-Sealed Slam', 'ghost', 100, 0.95),
  // Tirtouga line (final: Carracosta) — the prehistoric turtle slams down an unbreakable shell-wall.
  564: mk('Ancient Tidewall', 'water', 105, 0.95, undefined, 'physical'),
  // Archen line (final: Archeops) — the first bird folds its wings and plummets like a falling fossil.
  566: mk('Cretaceous Plummet', 'rock', 120, 0.9, { kind: 'recoil', fraction: 1/4 }),
  // Trubbish line (final: Garbodor) — a guaranteed gout of septic sludge.
  568: mk('Septic Outburst', 'poison', 90, 1, { kind: 'poison', chance: 1 }),
  // Zorua line (final: Zoroark) — an illusory onslaught from a foe that was never really there.
  570: mk('Nightfall Mirage', 'dark', 115, 0.95),
  // Minccino line (final: Cinccino) — a blistering barrage of scarf-tail slaps.
  572: mk('Tailscarf Barrage', 'normal', 90, 1, { kind: 'flinch', chance: 0.3 }),
  // Gothita line (final: Gothitelle) — the astrologer reads a fatal constellation and calls it down.
  574: mk('Zodiac Requiem', 'psychic', 100, 0.95),
  // Solosis line (final: Reuniclus) — a runaway cascade of multiplying psychic cells.
  577: mk('Cerebral Detonation', 'psychic', 110, 0.95),
  // Ducklett line (final: Swanna) — a graceful spiraling water-dance on the wing.
  580: mk('Aerial Pirouette', 'flying', 95, 1),
  // Vanillite line (final: Vanilluxe) — the two-headed snowstorm exhales a chilling twin-blast.
  582: mk('Twin-Frost Tempest', 'ice', 105, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Deerling line (final: Sawsbuck) — antlers crowned with the season's growth gore the foe.
  585: mk('Solstice Stampede', 'normal', 100, 1),
  // Emolga (final: Emolga) — a static-charged glide that jolts on contact.
  587: mk('Aerostatic Jolt', 'electric', 90, 1, { kind: 'stun', chance: 0.3 }),
  // Karrablast line (final: Escavalier) — a twin-lance jousting charge in stolen steel armor.
  588: mk('Twin-Lance Joust', 'bug', 115, 0.9),
  // Foongus line (final: Amoonguss) — luring spores that coax the foe into helpless slumber.
  590: mk('Mycelial Lullaby', 'grass', 85, 1, { kind: 'sleep', chance: 0.3 }),
  // Frillish line (final: Jellicent) — a phantom undertow that drains the life of the drowned.
  592: mk('Sailor\'s Lament', 'water', 90, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Alomomola (final: Alomomola) — a nursing wave-slam that mends the caregiver as it strikes.
  594: mk('Mending Wavecrash', 'water', 80, 1, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Joltik line (final: Galvantula) — an electrified web that snares and numbs.
  595: mk('Galvanic Webshock', 'electric', 90, 1, { kind: 'stun', chance: 0.5 }),
  // Ferroseed line (final: Ferrothorn) — a slow grind of barbed steel caltrops.
  597: mk('Caltrop Gyro', 'steel', 100, 0.95),
  // Klink line (final: Klinklang) — meshing gears spit out a paralyzing electric grind.
  599: mk('Cogwheel Discharge', 'steel', 105, 0.95, { kind: 'stun', chance: 0.3 }),
  // Tynamo line (final: Eelektross) — the abyssal eel coils and unloads a stunning jolt.
  602: mk('Leviathan Shock', 'electric', 110, 0.95, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Elgyem line (final: Beheeyem) — alien fingers wipe a piece of the foe's mind clean away.
  605: mk('Mindwipe Pulse', 'psychic', 105, 0.95, { kind: 'stage', stat: 'eatk', delta: -1, chance: 0.3, target: 'foe' }),
  // Litwick line (final: Chandelure) — a witchlight flame that incinerates the very soul.
  607: mk('Soul-Incinerating Flare', 'fire', 115, 0.95, { kind: 'burn', chance: 0.5 }),
  // Axew line (final: Haxorus) — an adamantine axe-tusk shears straight through the foe's guard.
  610: mk('Adamant Axe Cleave', 'dragon', 130, 0.9, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }, 'physical'),
  // Cubchoo line (final: Beartic) — the freezing bear hurls a glacial maul of its own icy breath.
  613: mk('Avalauncher Maul', 'ice', 115, 0.9, undefined, 'physical'),
  // Cryogonal (final: Cryogonal) — a lattice of freezing crystal-chains snaps shut.
  615: mk('Hoarfrost Lattice', 'ice', 90, 1, { kind: 'frostbite', chance: 0.5 }),
  // Shelmet line (final: Accelgor) — the unshelled ninja blitzes too fast for the foe to react.
  616: mk('Ninjutsu Blitz', 'bug', 100, 0.95, { kind: 'flinch', chance: 0.3 }, 'energy'),
  // Stunfisk (final: Stunfisk) — a buried ambush that delivers a numbing surge from the mud.
  618: mk('Quagmire Jolt', 'electric', 85, 1, { kind: 'stun', chance: 0.5 }),
  // Mienfoo line (final: Mienshao) — a relentless flurry from whip-like sleeved arms.
  619: mk('Crashing Sleeve Flurry', 'fighting', 115, 0.9),
  // Druddigon (final: Druddigon) — craggy claws rake from the cave-dark.
  621: mk('Craggy Wyrmclaw', 'dragon', 110, 0.95, undefined, 'physical'),
  // Golett line (final: Golurk) — the ancient automaton drives an unstoppable colossal fist.
  622: mk('Golemheart Smash', 'ground', 110, 0.95),
  // Pawniard line (final: Kingambit) — the warlord issues a decree of slaughter, breaking the foe's resolve.
  624: mk('Warlord\'s Decree', 'dark', 125, 0.9, { kind: 'stage', stat: 'atk', delta: -1, chance: 0.3, target: 'foe' }, 'physical'),
  // Bouffalant (final: Bouffalant) — a reckless afro-cushioned headlong charge.
  626: mk('Wooly Headcharge', 'normal', 110, 0.95, { kind: 'recoil', fraction: 1/4 }),
  // Rufflet line (final: Braviary) — the warrior-eagle's valiant, bone-jarring dive.
  627: mk('Eagle\'s Valor Dive', 'flying', 115, 0.95, { kind: 'recoil', fraction: 1/3 }),
  // Vullaby line (final: Mandibuzz) — a scavenger's bone-drop that cows the foe into weakness.
  629: mk('Scavenger\'s Pall', 'flying', 85, 1, { kind: 'stage', stat: 'atk', delta: -1, chance: 1, target: 'foe' }),
  // Heatmor (final: Heatmor) — a molten anteater-tongue lashes and sears.
  631: mk('Smelter\'s Lash', 'fire', 100, 1, { kind: 'burn', chance: 0.3 }),
  // Durant (final: Durant) — an iron-ant colony swarms with crushing mandibles.
  632: mk('Steelmaw Swarm', 'bug', 105, 0.95),
  // Deino line (final: Hydreigon) — all three maws unleash ruin at once, leaving the beast spent of dark power.
  633: { ...mk('Hydra\'s Triple Ruin', 'dark', 135, 0.95), lockTurns: 2 },
  // Larvesta line (final: Volcarona) — a searing dance of sun-fire from six fiery wings.
  636: mk('Pyre-Wing Tempest', 'fire', 120, 0.95, { kind: 'burn', chance: 0.3 }),
  // Cobalion (final: Cobalion) — a resolute iron blade that shakes the foe's nerve.
  638: mk('Resolute Steelblade', 'steel', 100, 0.95, { kind: 'stage', stat: 'atk', delta: -1, chance: 0.3, target: 'foe' }),
  // Terrakion (final: Terrakion) — a cliff-shattering sacred horn-blade.
  639: mk('Cragbound Sacred Blade', 'rock', 120, 0.9),
  // Virizion (final: Virizion) — a graceful, gleaming green sword-edge.
  640: mk('Verdant Sacred Edge', 'grass', 100, 0.95),
  // Tornadus Incarnate (final: Tornadus Incarnate) — the storm-genie's bewildering cyclone.
  641: mk('Galeforce Maelstrom', 'flying', 120, 0.9, { kind: 'confuse', chance: 0.3 }, 'energy'),
  // Thundurus Incarnate (final: Thundurus Incarnate) — the thunder-genie's scourging stormbolt.
  642: mk('Thunderscourge Maelstrom', 'electric', 120, 0.9, { kind: 'stun', chance: 0.3 }),
  // Reshiram (final: Reshiram) — the white dragon engulfs the world in the flames of truth, then must cool its furnace.
  643: { ...mk('Vast Truthflame', 'fire', 150, 0.95), lockTurns: 3 },
  // Zekrom (final: Zekrom) — the black dragon crashes down a bolt of pure ideals, its generator left to recharge.
  644: { ...mk('Ideal Lightning Crash', 'electric', 150, 0.95, undefined, 'physical'), lockTurns: 3 },
  // Landorus Incarnate (final: Landorus Incarnate) — the land-spirit splits the earth in a bountiful upheaval.
  645: mk('Bountiful Cataclysm', 'ground', 125, 0.9),
  // Kyurem (final: Kyurem) — absolute-zero breath freezes the foe to the boundary of life.
  646: mk('Absolute Boundary Freeze', 'ice', 135, 0.9, { kind: 'frostbite', chance: 0.5 }),
  // Keldeo Ordinary (final: Keldeo Ordinary) — a sacred hoof-blade cascade of mystic water.
  647: mk('Sacred Hoofcascade', 'water', 120, 0.9),
  // Meloetta Aria (final: Meloetta Aria) — an enchanting relic-song that beguiles the listener.
  648: mk('Enchanted Relic Aria', 'psychic', 115, 0.95, { kind: 'confuse', chance: 0.3 }),
  // Genesect (final: Genesect) — the reborn cyborg fires a prismatic drive-cannon burst.
  649: mk('Prism Drive Cannon', 'bug', 120, 0.9, undefined, 'energy'),

  // ============================ GEN 6 ============================
  // Chespin line (final: Chesnaught) — spike-armored knight that bodychecks foes through its own bramble shell
  650: mk('Bramblewreck Charge', 'grass', 120, 0.95, { kind: 'recoil', fraction: 1/3 }, 'physical'),
  // Fennekin line (final: Delphox) — fox mage reading doom in the flames it conjures from its wand
  653: mk('Witchflame Augury', 'fire', 110, 0.95, { kind: 'burn', chance: 0.3 }),
  // Froakie line (final: Greninja) — ninja frog hurling a flurry of compressed water stars
  656: mk('Cascade Shuriken', 'water', 95, 1, { kind: 'flinch', chance: 0.3 }),
  // Bunnelby line (final: Diggersby) — pile-driver ears that move earth like power shovels
  659: mk('Excavator Wallop', 'ground', 90, 1),
  // Fletchling line (final: Talonflame) — blazing falcon that folds into a suicidal flaming stoop
  661: mk('Inferno Stoop', 'fire', 115, 1, { kind: 'recoil', fraction: 1/3 }, 'physical'),
  // Scatterbug line (final: Vivillon) — scatters drowsy prismatic scales on a dance of wingbeats
  664: mk('Slumberscale Waltz', 'bug', 80, 1, { kind: 'sleep', chance: 0.3 }, 'energy'),
  // Litleo line (final: Pyroar) — regal lion whose mane-roar erupts into searing flame
  667: mk('Sovereign Pyre Roar', 'fire', 105, 0.95, { kind: 'burn', chance: 0.2 }),
  // Flabebe line (final: Florges) — garden queen crowning the battlefield in everblooming light
  669: mk('Verdant Coronation', 'fairy', 105, 1),
  // Skiddo line (final: Gogoat) — sun-charged horns that drain vitality as they gore
  672: mk('Sunhorn Siphon', 'grass', 95, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Pancham line (final: Pangoro) — brawler that fights dirty with bone-cracking back-alley haymakers
  674: mk('Backalley Beatdown', 'dark', 115, 0.95, undefined, 'physical'),
  // Furfrou (final: Furfrou) — pampered royal hound striking with prim, startling precision
  676: mk('Regal Coiffure Rush', 'normal', 90, 1, { kind: 'flinch', chance: 0.3 }),
  // Espurr line (final: Meowstic) — unleashes the disorienting force pent beneath its folded ears
  677: mk('Inner Eye Burst', 'psychic', 90, 1, { kind: 'confuse', chance: 0.3 }),
  // Honedge line (final: Aegislash) — the royal blade's verdict, shearing through any guard it meets
  679: mk("Sovereign's Reckoning", 'steel', 95, 1, { kind: 'stage', stat: 'def', delta: -1, chance: 1, target: 'foe' }),
  // Spritzee line (final: Aromatisse) — billowing perfume so cloying the foe loses its bearings
  682: mk('Cloying Mirage', 'fairy', 90, 1, { kind: 'confuse', chance: 0.3 }),
  // Swirlix line (final: Slurpuff) — smothers the foe in clinging sticky whipped cream
  684: mk('Whipcream Maelstrom', 'fairy', 95, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.5, target: 'foe' }),
  // Inkay line (final: Malamar) — flips reality and saps the foe's strength through hypnotic manipulation
  686: mk('Topsy-Turvy Torment', 'dark', 105, 0.95, { kind: 'stage', stat: 'atk', delta: -1, chance: 0.5, target: 'foe' }, 'physical'),
  // Binacle line (final: Barbaracle) — seven barnacle hands hammer down as one
  688: mk('Heptaclaw Smash', 'rock', 110, 0.95),
  // Skrelp line (final: Dragalge) — spews caustic sargasso brine from its kelp-camouflaged maw
  690: mk('Sargasso Venom', 'poison', 95, 1, { kind: 'poison', chance: 0.3 }, 'energy'),
  // Clauncher line (final: Clawitzer) — fires a high-pressure cannonade from its oversized claw
  692: mk('Tidal Howitzer', 'water', 110, 0.95),
  // Helioptile line (final: Heliolisk) — sun-charged frill discharges a blinding photovoltaic surge
  694: mk('Photon Frillburst', 'electric', 100, 1, { kind: 'stun', chance: 0.3 }),
  // Tyrunt line (final: Tyrantrum) — the despot king's jaws crush armor like brittle bone
  696: mk("Despot's Maw", 'dragon', 120, 0.95, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }, 'physical'),
  // Amaura line (final: Aurorus) — ancient sauropod calling down a frostbitten polar aurora
  698: mk('Borealis Requiem', 'ice', 105, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Hawlucha (final: Hawlucha) — luchador hawk diving into a high-flying aerial plancha
  701: mk('Skyfall Plancha', 'fighting', 100, 1, { kind: 'flinch', chance: 0.3 }),
  // Dedenne (final: Dedenne) — antenna whiskers broadcast a crackling jolt of radio static
  702: mk('Radiowave Jolt', 'electric', 85, 1, { kind: 'stun', chance: 0.3 }),
  // Carbink (final: Carbink) — jewel-body refracts the cavern's light into a dazzling beam
  703: mk('Adamant Brilliance', 'rock', 90, 1, undefined, 'energy'),
  // Goomy line (final: Goodra) — gooey wyrm drowning the field in a viscous draconic deluge
  704: { ...mk('Glutinous Deluge', 'dragon', 130, 0.9), selfStage: { stat: 'eatk', delta: -1 } },
  // Klefki (final: Klefki) — fairy locksmith whacking foes with a jangling fistful of keys
  707: mk('Jangling Mischief', 'fairy', 90, 1, undefined, 'physical'),
  // Phantump line (final: Trevenant) — the haunted elder tree drains life through grasping roots
  708: mk('Gallowsroot Siphon', 'ghost', 95, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Pumpkaboo line (final: Gourgeist) — a wailing reap by grave-light from within the hollow gourd
  710: mk('Gravelight Reaping', 'ghost', 105, 0.95),
  // Bergmite line (final: Avalugg) — a continental iceberg grinding down to flatten its prey
  712: mk('Tectonic Glacier', 'ice', 115, 0.95, undefined, 'physical'),
  // Noibat line (final: Noivern) — a focused ultrasonic barrage that shatters the foe's resolve
  714: mk('Ultrasonic Rupture', 'flying', 100, 0.95, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.5, target: 'foe' }, 'energy'),
  // Xerneas (final: Xerneas) — the life-giver's bloom that flowers anew by drawing life across the field
  716: mk('Genesis Radiance', 'fairy', 115, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Yveltal (final: Yveltal) — the destroyer unfurls its wings in a world-darkening pulse of ruin
  717: { ...mk('Doomwing Eclipse', 'dark', 145, 0.95), lockTurns: 2 },
  // Zygarde 50% (final: Zygarde) — order's serpentine verdict, its cells swarming to bind the foe fast
  718: mk('Terrestrial Verdict', 'ground', 120, 0.95, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.5, target: 'foe' }),
  // Diancie (final: Diancie) — shatters its own crystal crown to unleash an apotheosis of diamonds
  719: { ...mk('Diamond Apotheosis', 'rock', 125, 0.95), selfStage: { stat: 'def', delta: -1 } },
  // Hoopa (final: Hoopa) — tears open rings of hyperspace for an overwhelming portal barrage
  720: { ...mk('Voidgate Barrage', 'psychic', 145, 0.95), lockTurns: 2 },
  // Volcanion (final: Volcanion) — vents superheated geyser steam that scalds on contact
  721: mk('Boiling Geyser Burst', 'water', 120, 0.95, { kind: 'burn', chance: 0.3 }),

  // ============================ GEN 7 ============================
  // Rowlet line (final: Decidueye) — the spectral archer looses a soul-fletched arrow that never misses its mark.
  722: mk('Spirit Fletching', 'ghost', 110, 0.95),
  // Litten line (final: Incineroar) — the heel hoists its foe skyward and drives them into a blazing canvas.
  725: mk('Suplex Inferno', 'fire', 120, 0.95, { kind: 'recoil', fraction: 1/4 }, 'physical'),
  // Popplio line (final: Primarina) — a soaring soprano note crystallizes into a cascade of radiant water.
  728: mk('Prismatic Serenade', 'water', 120, 0.95),
  // Pikipek line (final: Toucannon) — superheats its beak and unloads a point-blank seed broadside.
  731: mk('Ballistic Beak', 'normal', 115, 0.95),
  // Yungoos line (final: Gumshoos) — patient stakeout ends with a sudden, committed pounce.
  734: mk('Ambush Lunge', 'normal', 95, 1),
  // Grubbin line (final: Vikavolt) — charges its mandibles into a humming electromagnetic slug.
  736: mk('Mandible Railgun', 'electric', 120, 0.9, { kind: 'stun', chance: 0.2 }),
  // Crabrawler line (final: Crabominable) — a frostbitten haymaker so heavy it staggers the thrower's own footing.
  739: { ...mk('Permafrost Haymaker', 'ice', 120, 0.9, undefined, 'physical'), selfStage: { stat: 'spd', delta: -1 } },
  // Oricorio Baile — a fiery flamenco whose every stamp scatters scalding embers.
  741: mk('Ember Flamenco', 'fire', 95, 1, { kind: 'burn', chance: 0.2 }),
  // Cutiefly line (final: Ribombee) — flits in and bursts a dazzling pollen bomb before the foe can react.
  742: mk('Dazzling Pollen', 'bug', 90, 1, { kind: 'flinch', chance: 0.2 }, 'energy'),
  // Rockruff line (final: Lycanroc Midday) — a blinding noonday rush of fangs along the high sun's arc.
  744: mk('Meridian Fang', 'rock', 105, 0.95, { kind: 'flinch', chance: 0.2 }),
  // Wishiwashi Solo — the lone fry rallies a phantom school into one surging tide.
  746: mk('Tidal Rally', 'water', 80, 1),
  // Mareanie line (final: Toxapex) — coral barbs inject a venom that festers without fail.
  747: mk('Coral Toxin', 'poison', 75, 1, { kind: 'poison', chance: 1 }),
  // Mudbray line (final: Mudsdale) — a tireless draft kick that drives the earth like a fencepost.
  749: mk('Piledriver Kick', 'ground', 115, 0.95),
  // Dewpider line (final: Araquanid) — encases the foe's head in a bubble and drains them as they drown.
  751: mk('Suffocating Bubble', 'water', 90, 1, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Fomantis line (final: Lurantis) — sunlight focused along a razor petal into a single clean cut.
  753: mk('Petal Saber', 'grass', 105, 0.95, undefined, 'physical'),
  // Morelull line (final: Shiinotic) — a hypnotic luminescence that lulls any onlooker into deep sleep.
  755: mk('Drowsing Glow', 'grass', 75, 1, { kind: 'sleep', chance: 1 }),
  // Salandit line (final: Salazzle) — lays down a corrosive, intoxicating cinder that eats at the flesh.
  757: mk('Venom Cinder', 'poison', 100, 0.95, { kind: 'poison', chance: 0.3 }, 'energy'),
  // Stufful line (final: Bewear) — a deceptively gentle hug that crushes the breath from its target.
  759: mk('Crushing Embrace', 'fighting', 115, 0.95),
  // Bounsweet line (final: Tsareena) — a regal heel-drop that always leaves the foe cowed and weakened.
  761: mk('Imperial Trounce', 'grass', 95, 1, { kind: 'stage', stat: 'atk', delta: -1, chance: 1, target: 'foe' }, 'physical'),
  // Comfey — wraps the foe in its lei and siphons their vitality through the blossoms.
  764: mk('Lei Embrace', 'fairy', 90, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Oranguru — a withering psychic admonishment that scrambles a lesser mind.
  765: mk('Sapient Rebuke', 'psychic', 95, 1, { kind: 'confuse', chance: 0.2 }),
  // Passimian — a coordinated squad rush of hurled berries and bodies.
  766: mk('Squad Blitz', 'fighting', 110, 0.95),
  // Wimpod line (final: Golisopod) — a single decisive sweep of the chitin scythe.
  767: mk('Carapace Cleaver', 'bug', 120, 0.95),
  // Sandygast line (final: Palossand) — a sinking sand-vortex that swallows and feeds on the trapped foe.
  769: mk('Devouring Dunes', 'ground', 95, 1, { kind: 'lifesteal', fraction: 0.5 }, 'energy'),
  // Pyukumuku — ejects its innards in a startling visceral jab.
  771: mk('Innard Jab', 'water', 80, 1, undefined, 'physical'),
  // Type Null line (final: Silvally) — the synthetic beast cuts loose every weapon at once.
  772: mk('Chimera Rampage', 'normal', 115, 0.95),
  // Minior Red Meteor — drops from orbit as a reckless burning shard.
  774: mk('Falling Star Impact', 'rock', 95, 0.95, { kind: 'recoil', fraction: 1/4 }),
  // Komala — flails out of its eternal slumber, leaving the foe dazed.
  775: mk('Dreamlog Bash', 'normal', 105, 0.95, { kind: 'confuse', chance: 0.2 }),
  // Turtonator — vents the volatile gas in its shell into a searing detonation.
  776: mk('Magma Shellburst', 'fire', 100, 0.95, { kind: 'burn', chance: 0.3 }),
  // Togedemaru — curls up and skewers the foe on a static-charged spine.
  777: mk('Static Spinneedle', 'electric', 90, 0.95, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Mimikyu Disguised — the wronged costume lashes out from beneath its shroud.
  778: mk('Shroud Reprisal', 'ghost', 95, 0.95, { kind: 'flinch', chance: 0.2 }),
  // Bruxish — a psychically-charged riptide of grinding teeth.
  779: mk('Razortooth Riptide', 'water', 100, 0.95, { kind: 'flinch', chance: 0.2 }, 'physical'),
  // Drampa — the elder cloud-dragon exhales a vast tempest from on high.
  780: mk('Eldersky Breath', 'dragon', 115, 0.9),
  // Dhelmise — swings its colossal anchor in a bone-jarring, self-staggering arc.
  781: mk('Abyssal Anchor', 'ghost', 120, 0.9, { kind: 'recoil', fraction: 1/4 }),
  // Jangmo-o line (final: Kommo-o) — clashes its scales into a deafening, type-locking resonance.
  782: { ...mk('Scaleforge Dissonance', 'dragon', 130, 0.9), lockTurns: 2 },
  // Tapu Koko — the guardian's verdict falls as a blinding islewide thunderclap.
  785: mk('Islebolt Verdict', 'electric', 115, 0.95, { kind: 'flinch', chance: 0.2 }, 'physical'),
  // Tapu Lele — a shimmering veil of intoxicating, mind-bending scales.
  786: mk('Euphoric Mirage', 'psychic', 120, 0.95, { kind: 'confuse', chance: 0.2 }),
  // Tapu Bulu — the bull-deity gores through a wall of conjured brambles.
  787: mk('Thornhide Charge', 'grass', 120, 0.9, { kind: 'recoil', fraction: 1/4 }, 'physical'),
  // Tapu Fini — a disorienting tide of guardian mist sweeps the foe under.
  788: mk('Mistshroud Tide', 'water', 110, 0.95, { kind: 'confuse', chance: 0.2 }),
  // Cosmog line — the nebula's nascent starlight (Solgaleo keyed at 791, Lunala at 792).
  789: mk('Starlit Genesis', 'psychic', 90, 1, undefined, 'energy'),
  // Nihilego — floods the foe with a parasitic neurotoxin that lingers.
  793: mk('Beguiling Venom', 'poison', 120, 0.9, { kind: 'poison', chance: 0.3 }, 'energy'),
  // Buzzwole — plunges its swollen proboscis in and gorges on the foe's lifeblood.
  794: mk('Proboscis Drain', 'bug', 120, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Pheromosa — a blurred, elegant lunge faster than the eye can follow.
  795: mk('Mach Sashay', 'bug', 125, 0.95, { kind: 'flinch', chance: 0.3 }),
  // Xurkitree — dumps its entire charge in one self-frying capacitor discharge.
  796: { ...mk('Capacitor Meltdown', 'electric', 130, 0.9), selfStage: { stat: 'eatk', delta: -1 } },
  // Celesteela — ignites its bamboo thrusters into a roaring rocket blast.
  797: mk('Aerorocket Blast', 'steel', 115, 0.95, { kind: 'burn', chance: 0.2 }, 'energy'),
  // Kartana — a thousand-layered paper edge that bites so deep it warps its own folds.
  798: { ...mk('Thousand-Fold Slash', 'steel', 130, 0.9), selfStage: { stat: 'def', delta: -1 } },
  // Guzzlord — an insatiable maw that rends and consumes everything it bites.
  799: mk('All-Devouring Gnash', 'dark', 120, 0.9, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Necrozma — splits a stolen sun through its prism into a self-exhausting lance of light.
  800: { ...mk('Prism Cataclysm', 'psychic', 130, 0.9), selfStage: { stat: 'eatk', delta: -1 } },
  // Magearna — overloads its Soul-Heart into a flower-shaped cannon blast at great cost.
  801: { ...mk('Soulheart Cannon', 'fairy', 135, 0.9), selfStage: { stat: 'eatk', delta: -2 } },
  // Marshadow — a relentless shadow-boxing flurry from the foe's own silhouette.
  802: mk('Shadowbox Flurry', 'fighting', 120, 0.95, { kind: 'flinch', chance: 0.2 }),
  // Poipole line (final: Naganadel) — strafes the foe with a barrage of dripping venom darts.
  803: mk('Venom Drone Barrage', 'poison', 115, 0.9, { kind: 'poison', chance: 0.3 }, 'energy'),
  // Stakataka — the living rampart topples its full megaton mass onto the foe.
  805: mk('Megaton Topple', 'rock', 120, 0.9),
  // Blacephalon — detonates its own head in a gleeful firework display, scorching itself.
  806: mk('Carnival Detonation', 'fire', 135, 0.9, { kind: 'recoil', fraction: 1/3 }),
  // Zeraora — closes the gap in a single thunderous, stunningly fast rush.
  807: mk('Voltaic Onrush', 'electric', 120, 0.95, { kind: 'flinch', chance: 0.2 }, 'physical'),
  // Meltan line (final: Melmetal) — winds up its whole frame to drive a colossal hex-nut piston.
  808: { ...mk('Titanic Pile Bunker', 'steel', 130, 0.9), selfStage: { stat: 'def', delta: -1 } },

  // ============================ GEN 8 ============================
  // Grookey line (final: Rillaboom) — beats a war-tempo on its log drum, then caves the foe in.
  810: mk('Jungle Cadence', 'grass', 115, 0.95, undefined, 'physical'),
  // Scorbunny line (final: Cinderace) — a blazing bicycle-kick fired off too fast to read.
  813: mk('Volcanic Volley', 'fire', 110, 0.95, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Sobble line (final: Inteleon) — a marksman's single, dead-center water round that never strays.
  816: mk('Crosshair Cascade', 'water', 105, 1),
  // Skwovet line (final: Greedent) — disgorges a hoard of cheek-stored berries and gorges back the spoils.
  819: mk('Cheekful Barrage', 'normal', 90, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Rookidee line (final: Corviknight) — an armored knight's plunging lance that splits the guard.
  821: mk('Knightfall Dive', 'flying', 95, 1, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }),
  // Blipbug line (final: Orbeetle) — a hivemind shockwave that scrambles the mind (energy-side bug hit).
  824: mk('Hivemind Pulse', 'bug', 95, 1, { kind: 'confuse', chance: 0.3 }, 'energy'),
  // Nickit line (final: Thievul) — slips in unseen, robs the foe's vitality, and is gone.
  827: mk('Phantom Heist', 'dark', 85, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Gossifleur line (final: Eldegoss) — a smothering drift of cotton fluff that bogs the target down.
  829: mk('Downy Tempest', 'grass', 85, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.3, target: 'foe' }),
  // Wooloo line (final: Dubwool) — a runaway curl-horn ram that hurts the rammer too.
  831: mk('Curlhorn Charge', 'normal', 95, 1, { kind: 'recoil', fraction: 1 / 4 }),
  // Chewtle line (final: Drednaw) — jaws strong enough to bite through rock, shattering the foe's guard.
  833: mk('Bedrock Chomp', 'rock', 105, 0.95, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }),
  // Yamper line (final: Boltund) — a lightning-charged lunge-bite that locks muscles up (physical electric).
  835: mk('Voltfang Blitz', 'electric', 95, 1, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Rolycoly line (final: Coalossal) — bursts its coal furnace open in a searing eruption.
  837: mk('Coalbed Eruption', 'fire', 100, 0.95, { kind: 'burn', chance: 0.3 }),
  // Applin branch (final: Hydrapple; also Appletun/Flapple/Dipplin) — many syrup-dragon maws sap the foe dry.
  840: mk('Cidermaw Deluge', 'grass', 110, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Silicobra line (final: Sandaconda) — a desert-wind constriction spun from its coiled sand-sac.
  843: mk('Sirocco Coil', 'ground', 105, 0.95),
  // Cramorant (standalone) — hurls a half-swallowed mouthful of prey back into the foe's face.
  845: mk('Disgorge Cannon', 'water', 90, 0.95, { kind: 'flinch', chance: 0.3 }),
  // Arrokuda line (final: Barraskewda) — the sea's fastest skewers through before anything reacts (physical water).
  846: mk('Bladefin Skewer', 'water', 100, 1, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Toxel line (final: Toxtricity) — a venom-laced power chord that poisons all who hear it.
  848: mk('Distortion Anthem', 'electric', 110, 0.95, { kind: 'poison', chance: 0.3 }),
  // Sizzlipede line (final: Centiskorch) — wraps the foe in a red-hot coil and sears them (physical fire).
  850: mk('Molten Coil Wrap', 'fire', 105, 0.95, { kind: 'burn', chance: 0.4 }, 'physical'),
  // Clobbopus line (final: Grapploct) — a many-armed submission throw, slamming the foe to the mat.
  852: mk('Cephalo Suplex', 'fighting', 110, 0.95),
  // Sinistea line (final: Polteageist) — pours a draught of its own lethal cursed tea (energy ghost).
  854: mk('Spectral Steeping', 'ghost', 110, 0.95, { kind: 'poison', chance: 0.3 }, 'energy'),
  // Hatenna line (final: Hatterene) — the silent witch lashes out with razor hair, warping the senses.
  856: mk('Witching Hour Lash', 'psychic', 115, 0.9, { kind: 'confuse', chance: 0.3 }),
  // Impidimp line (final: Grimmsnarl) — hammerfist clad in malevolent fae hair-muscle (physical fairy).
  859: mk('Fae-Hair Hammerfist', 'fairy', 110, 0.95, undefined, 'physical'),
  // Milcery line (final: Alcremie) — a sickly-rich cream barrage that softens the foe's resolve.
  868: mk('Decadent Cream Cannon', 'fairy', 100, 1, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.3, target: 'foe' }),
  // Falinks (standalone) — a six-soldier phalanx punching clean through the line.
  870: mk('Phalanx Breakthrough', 'fighting', 95, 1),
  // Pincurchin (standalone) — flicks charged spines that lock the nerves (physical electric).
  871: mk('Voltspine Lash', 'electric', 90, 1, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Snom line (final: Frosmoth) — sheds a cloud of sub-zero scales that frostbite the foe (energy ice).
  872: mk('Permafrost Scales', 'ice', 105, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Stonjourner (standalone) — drops a standing megalith with crushing, ancient weight.
  874: mk('Megalith Bash', 'rock', 105, 0.95),
  // Eiscue Ice (standalone) — headbutts with its frozen ice-helm (physical ice).
  875: mk('Iceberg Headbutt', 'ice', 90, 1, undefined, 'physical'),
  // Indeedee Male (standalone) — a wave of attentive psychic service turned weaponized.
  876: mk('Hospitality Surge', 'psychic', 100, 0.95),
  // Morpeko Full Belly (standalone) — a famished, vicious maul that feeds on the bite (physical dark).
  877: mk('Hangry Maul', 'dark', 90, 1, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Cufant line (final: Copperajah) — a verdigris-bronze stampede of sheer tonnage.
  878: mk('Verdigris Stampede', 'steel', 110, 0.95),
  // Dracozolt (standalone) — swings its overpowered tail like a club (physical dragon).
  880: mk('Thagomizer Crash', 'dragon', 100, 0.95, undefined, 'physical'),
  // Arctozolt (standalone) — a freezing surge of static off its permafrost hide.
  881: mk('Subzero Voltcharge', 'ice', 100, 0.95),
  // Dracovish (standalone) — a primal, savage rend of its jaws that drains the prey (physical water).
  882: mk('Primordial Rend', 'water', 95, 1, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Arctovish (standalone) — snaps shut with frost-rimed fangs from the deep (physical ice).
  883: mk('Hadal Frostsnap', 'ice', 90, 1, undefined, 'physical'),
  // Duraludon line (final: Archaludon) — fires a charged beam down its bridge-truss frame (energy steel).
  884: mk('Suspension Cannon', 'steel', 115, 0.95, undefined, 'energy'),
  // Dreepy line (final: Dragapult) — launches its Dreepy brood as homing missiles (physical dragon).
  885: mk('Stealth Dragon Volley', 'dragon', 125, 0.95, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Zacian (legendary) — the crowned wolf-king's sovereign sabre cuts in a flash (physical fairy).
  888: mk('Sovereign Sabreslash', 'fairy', 130, 0.95, undefined, 'physical'),
  // Zamazenta (legendary) — a shield-wolf bash that staves in the foe's guard.
  889: mk('Bulwark Bash', 'fighting', 125, 0.95, { kind: 'stage', stat: 'def', delta: -1, chance: 0.3, target: 'foe' }),
  // Eternatus (legendary) — a world-ending nova; afterglow forbids re-firing dragon power for 2 turns.
  890: { ...mk('Eternabane Nova', 'dragon', 150, 0.95), lockTurns: 2 },
  // Kubfu branch (final: Urshifu Single Strike) — one perfect, fatal dark-fist blow (physical dark).
  891: mk('Mortal Knuckle', 'dark', 125, 0.95, undefined, 'physical'),
  // Zarude (mythical) — the jungle sovereign flays with sap-draining vines (physical grass).
  893: mk('Vinecrown Ravage', 'grass', 120, 0.95, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Regieleki (legendary titan) — pure electric annihilation at impossible speed.
  894: mk('Voltaic Annihilation', 'electric', 125, 0.9),
  // Regidrago (legendary titan) — pours out its raw dragon reserve, exhausting itself (-1 e.atk).
  895: { ...mk('Primeval Wyrmsurge', 'dragon', 140, 0.9), selfStage: { stat: 'eatk', delta: -1 } },
  // Glastrier (legendary) — a reckless, bone-crushing ice trample that batters the rider too (physical ice).
  896: mk('Glacier Trample', 'ice', 135, 0.95, { kind: 'recoil', fraction: 1 / 3 }, 'physical'),
  // Spectrier (legendary) — a spectral charge that gorges on the foe's life force (energy ghost).
  897: mk('Wraithgale Gallop', 'ghost', 130, 0.9, { kind: 'lifesteal', fraction: 0.75 }, 'energy'),
  // Calyrex (legendary) — the king issues a binding decree that saps the foe's speed.
  898: mk('Monarch Decree', 'psychic', 110, 0.95, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.3, target: 'foe' }),
  // Enamorus Incarnate (legendary) — an overwhelming bloom of spring rapture.
  905: mk('Vernal Rapture', 'fairy', 125, 0.95),

  // ============================ GEN 9 ============================
  // Sprigatito line (final: Meowscarada) — a sleight-of-hand card flung as a razor petal.
  906: mk("Conjurer's Bouquet", 'grass', 105, 0.95, undefined, 'physical'),
  // Fuecoco line (final: Skeledirge) — a haunting funeral hymn sung in living flame.
  909: mk('Dirge of Embers', 'fire', 105, 0.95, { kind: 'burn', chance: 0.3 }),
  // Quaxly line (final: Quaquaval) — a whirling carnival routine that crashes like surf.
  912: mk('Cabaret Cascade', 'water', 110, 0.95, undefined, 'physical'),
  // Lechonk line (final: Oinkologne Male) — a perfumed bull-rush of musky charge.
  915: mk('Perfumed Trample', 'normal', 95, 1),
  // Tarountula line (final: Spidops) — a silken cord cinched tight to hobble the prey.
  917: mk('Silken Garrote', 'bug', 80, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 1, target: 'foe' }),
  // Nymble line (final: Lokix) — a vigilante flurry of merciless lawless kicks.
  919: mk('Vermin Onslaught', 'bug', 95, 1, { kind: 'flinch', chance: 0.2 }),
  // Pawmi line (final: Pawmot) — a static-charged fist combo crackling between paws.
  921: mk('Plasma Fist Flurry', 'electric', 105, 0.95, { kind: 'stun', chance: 0.3 }, 'physical'),
  // Tandemaus line (final: Maushold Family Of Four) — the whole family piles on at once.
  924: mk('Family Stampede', 'normal', 85, 1, { kind: 'flinch', chance: 0.3 }),
  // Fidough line (final: Dachsbun) — a pounce of oven-fresh, crust-hot bread.
  926: mk('Oven Pounce', 'fairy', 85, 1, { kind: 'burn', chance: 0.3 }, 'physical'),
  // Smoliv line (final: Arboliva) — a torrent of bitter, brilliant golden olive oil.
  928: mk('Golden Oilfall', 'grass', 105, 0.95),
  // Squawkabilly (Green Plumage) — a rowdy gang dive-bomb straight off the wires.
  931: mk('Hooligan Dive', 'flying', 90, 1),
  // Nacli line (final: Garganacl) — a flung crust of curing salt that eats away at flesh.
  932: mk('Brinebreaker', 'rock', 95, 1, { kind: 'poison', chance: 0.3 }),
  // Charcadet line (final: Ceruledge; branch: Armarouge) — a ghostly blade that drinks the foe's life.
  935: mk('Soulfire Saber', 'fire', 110, 0.95, { kind: 'lifesteal', fraction: 0.5 }, 'physical'),
  // Tadbulb line (final: Bellibolt) — a booming croak that discharges its whole belly.
  938: mk('Galvanic Croak', 'electric', 95, 1, { kind: 'stun', chance: 0.3 }),
  // Wattrel line (final: Kilowattrel) — a screaming high-voltage seabird dive.
  940: mk('Thunderpetrel Dive', 'electric', 95, 1, { kind: 'flinch', chance: 0.3 }),
  // Maschiff line (final: Mabosstiff) — a boss's settling of an old grudge.
  942: mk('Bossfang Vendetta', 'dark', 105, 0.95, { kind: 'stage', stat: 'atk', delta: -1, chance: 0.3, target: 'foe' }, 'physical'),
  // Shroodle line (final: Grafaiai) — toxic graffiti smeared straight onto the target.
  944: mk('Venom Mural', 'poison', 90, 1, { kind: 'poison', chance: 1 }),
  // Bramblin line (final: Brambleghast) — a shrieking gale of barbed tumbleweed.
  946: mk('Thornwind Lash', 'grass', 105, 0.95, undefined, 'physical'),
  // Toedscool line (final: Toedscruel) — corrosive mycelium that saps the foe's resilience.
  948: mk('Mycelium Sap', 'grass', 90, 1, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.3, target: 'foe' }),
  // Klawf — a lightning ambush pincer from the cliff face.
  950: mk('Ambush Pincer', 'rock', 90, 1),
  // Capsakid line (final: Scovillain) — a twin-headed burst of searing capsaicin.
  951: mk('Scarlet Pepperburst', 'fire', 95, 1, { kind: 'burn', chance: 0.3 }),
  // Rellor line (final: Rabsca) — a rolling sun-scarab orb humming with rebirth.
  953: mk("Khepri's Roll", 'psychic', 95, 1, { kind: 'confuse', chance: 0.3 }),
  // Flittle line (final: Espathra) — a hypnotic flash from its mesmerizing plumes.
  955: mk('Mesmer Plume', 'psychic', 95, 1, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.3, target: 'foe' }),
  // Tinkatink line (final: Tinkaton) — a colossal hammer hurled out of the sky.
  957: mk('Skyfall Hammer', 'fairy', 100, 0.95, undefined, 'physical'),
  // Wiglett line (final: Wugtrio) — three sand-eel heads strike as one trident.
  960: mk('Sandeel Trident', 'water', 90, 1, { kind: 'flinch', chance: 0.3 }, 'physical'),
  // Bombirdier — a payload of stones dropped from high altitude.
  962: mk('Aerial Bombardment', 'flying', 95, 1),
  // Finizen line (final: Palafin Zero) — a hero's surging power released in one breaker.
  963: mk("Champion's Breaker", 'water', 95, 0.95, undefined, 'physical'),
  // Varoom line (final: Revavroom) — a redlined engine ram in a cloud of exhaust.
  965: mk('Overdrive Ram', 'steel', 105, 0.95),
  // Cyclizar — a slipstream charge spun from its rotary gear.
  967: mk('Gearwheel Rush', 'dragon', 95, 1, undefined, 'physical'),
  // Orthworm — a magnetic burrow that drags the foe down with it.
  968: mk('Magnetic Burrow', 'steel', 90, 1, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.3, target: 'foe' }),
  // Glimmet line (final: Glimmora) — a poison-petal cannon of toxic crystal shards.
  969: mk('Venom Crystalburst', 'rock', 110, 0.95, { kind: 'poison', chance: 0.3 }, 'energy'),
  // Greavard line (final: Houndstone) — a graveyard guardian's bite that feeds on warmth.
  971: mk('Eternal Vigil Bite', 'ghost', 95, 1, { kind: 'lifesteal', fraction: 0.5 }),
  // Flamigo — a flamenco-sharp kick driven by a coiled neck.
  973: mk('Tango Spike Kick', 'fighting', 100, 0.95),
  // Cetoddle line (final: Cetitan) — a glacier-sized body breaching through the ice.
  974: mk('Permafrost Breach', 'ice', 110, 0.95, undefined, 'physical'),
  // Veluza — a crescent fillet cut that pares the foe clean.
  976: mk('Razortide Slice', 'water', 95, 1, undefined, 'physical'),
  // Dondozo — a leviathan belly-flop of crushing tonnage.
  977: mk('Gargantuan Wallop', 'water', 100, 0.95, undefined, 'physical'),
  // Tatsugiri (Curly) — a deceptive deluge that leaves the foe dazed.
  978: mk('Mirage Torrent', 'dragon', 100, 0.95, { kind: 'confuse', chance: 0.3 }),
  // Great Tusk — a prehistoric goring charge that batters the user too.
  984: mk('Antediluvian Charge', 'ground', 120, 0.9, { kind: 'recoil', fraction: 1/4 }),
  // Scream Tail — an ancient lullaby that lulls the foe to sleep.
  985: mk('Ancient Lullaby', 'fairy', 90, 1, { kind: 'sleep', chance: 0.3 }),
  // Brute Bonnet — a violent burst of primeval toxic spores.
  986: mk('Primeval Sporeburst', 'grass', 115, 0.95, { kind: 'poison', chance: 0.3 }, 'physical'),
  // Flutter Mane — a banshee shriek faster than the eye can follow.
  987: mk('Phantasmal Shriek', 'ghost', 115, 0.95, { kind: 'flinch', chance: 0.2 }, 'energy'),
  // Slither Wing — an all-out moth-fist barrage that drops its own guard.
  988: { ...mk('Primeval Wingstrike', 'bug', 120, 0.9), selfStage: { stat: 'def', delta: -1 } },
  // Sandy Shocks — a lodestone surge that locks the foe's nerves.
  989: mk('Lodestone Surge', 'electric', 110, 0.95, { kind: 'stun', chance: 0.3 }),
  // Iron Treads — a hypercharged rollout that runs the foe flat.
  990: mk('Quantum Rollout', 'ground', 110, 0.95, { kind: 'stage', stat: 'spd', delta: -1, chance: 0.3, target: 'foe' }),
  // Iron Bundle — a glacial barrage of supercooled volleys.
  991: mk('Glacial Barrage', 'ice', 110, 0.95, { kind: 'frostbite', chance: 0.3 }),
  // Iron Hands — a thunderous grapple that drains the foe dry.
  992: mk('Thunderclap Grapple', 'fighting', 120, 0.9, { kind: 'lifesteal', fraction: 0.5 }),
  // Iron Jugulis — a three-mawed salvo that batters the foe's special guard.
  993: mk('Tri-Maw Cannonade', 'dark', 110, 0.95, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.3, target: 'foe' }),
  // Iron Moth — a venomous fire-dance shedding toxic embers.
  994: mk('Venomflare Waltz', 'fire', 115, 0.95, { kind: 'poison', chance: 0.3 }),
  // Iron Thorns — a quaking slam supercharged with stray voltage.
  995: mk('Thornquake Slam', 'rock', 120, 0.9, { kind: 'stun', chance: 0.2 }),
  // Frigibax line (final: Baxcalibur) — an ultimate ice-dragon glaive; recharge between strikes.
  996: { ...mk('Cryoglaive Devastation', 'dragon', 150, 0.95, undefined, 'physical'), lockTurns: 2 },
  // Gimmighoul line (final: Gholdengo) — a downpour of gold coins flung at the cost of focus.
  999: { ...mk('Midas Mintstorm', 'steel', 120, 0.95, undefined, 'energy'), selfStage: { stat: 'eatk', delta: -1 } },
  // Wo-Chien — a withering decree that saps the foe's strength.
  1001: mk('Withering Grudge', 'dark', 105, 0.95, { kind: 'stage', stat: 'atk', delta: -1, chance: 0.3, target: 'foe' }),
  // Chien-Pao — twin frost sabres reaping in a blur of speed.
  1002: mk('Twin Sabre Reaping', 'ice', 115, 0.95, { kind: 'flinch', chance: 0.2 }, 'physical'),
  // Ting-Lu — an abyssal stomp that caves in the earth and the foe's spirit.
  1003: mk('Abyssal Stomp', 'ground', 110, 0.95, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.3, target: 'foe' }),
  // Chi-Yu — a conflagration kindled by its ruinous flame-beads.
  1004: mk('Emberbead Conflagration', 'fire', 115, 0.95, { kind: 'burn', chance: 0.3 }),
  // Roaring Moon — a bloodmoon rampage so violent it needs winding down.
  1005: { ...mk('Bloodmoon Rampage', 'dragon', 135, 0.9, undefined, 'physical'), lockTurns: 2 },
  // Iron Valiant — a tempest of saintsteel blades from twin arms.
  1006: mk('Knightblade Tempest', 'fighting', 120, 0.9),
  // Koraidon — the apex collision of the ancient ruler; a self-shattering charge.
  1007: { ...mk('Scarlet Apex Crash', 'fighting', 150, 0.95), selfStage: { stat: 'def', delta: -2 } },
  // Miraidon — a tachyon surge from the future; locks its drive while it spools back up.
  1008: { ...mk('Hypertachyon Surge', 'electric', 145, 0.95), lockTurns: 2 },
  // Walking Wake — a primeval geyser-roar that wears down the foe's resistance.
  1009: mk('Tempestide Roar', 'water', 115, 0.95, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.3, target: 'foe' }),
  // Iron Leaves — a verdant photon greatsword cleave.
  1010: mk('Verdant Lightblade', 'grass', 115, 0.95, undefined, 'physical'),
  // Poltchageist line (final: Sinistcha) — a cursed brew of matcha that heals the drinker.
  1012: mk('Hauntea Infusion', 'grass', 105, 0.95, { kind: 'lifesteal', fraction: 0.5 }),
  // Okidogi — a venom-laced haymaker from corded muscle.
  1014: mk('Plaguefist Barrage', 'fighting', 115, 0.95, { kind: 'poison', chance: 0.3 }),
  // Munkidori — a hallucinogenic psychic pulse that scrambles the mind.
  1015: mk('Hallucinogen Pulse', 'psychic', 115, 0.95, { kind: 'confuse', chance: 0.3 }),
  // Fezandipiti — an alluring storm of feathers that saps the foe's nerve.
  1016: mk('Beguiling Plumage', 'poison', 100, 0.95, { kind: 'stage', stat: 'atk', delta: -1, chance: 0.3, target: 'foe' }),
  // Ogerpon — a furious smash of the masked oni's cudgel.
  1017: mk('Oni Cudgel Crush', 'grass', 115, 0.95, undefined, 'physical'),
  // Gouging Fire — a magma-fanged goring wreathed in flame.
  1020: mk('Volcanic Goring', 'fire', 115, 0.95, { kind: 'burn', chance: 0.3 }, 'physical'),
  // Raging Bolt — a thunderhead's roar crashing down in a paralyzing strike.
  1021: mk('Voltaic Thunderhead', 'electric', 115, 0.95, { kind: 'stun', chance: 0.3 }),
  // Iron Boulder — a tectonic cleave delivered faster than thought.
  1022: mk('Tectonic Cleave', 'rock', 115, 0.95, { kind: 'flinch', chance: 0.2 }),
  // Iron Crown — a coronal lance of light that pierces special defenses.
  1023: mk('Aurora Lance', 'steel', 115, 0.95, { kind: 'stage', stat: 'edef', delta: -1, chance: 0.3, target: 'foe' }, 'energy'),
  // Terapagos — a prismatic rain of crystalline starlight.
  1024: mk('Prismatic Starfall', 'normal', 110, 0.95, undefined, 'energy'),
  // Pecharunt — binding peach-rot chains that always leave the foe poisoned.
  1025: mk('Peachrot Bindings', 'poison', 95, 1, { kind: 'poison', chance: 1 }, 'energy'),

  // ===================== BRANCHED-LINE PER-BRANCH OVERRIDES =====================
  // Keyed at the diverging branch TIP so each final form gets a type-matched
  // signature instead of inheriting a sibling's; the shared base/pre-evos keep the
  // line's root entry above. (signatureMoveFor: nearest ancestor-or-self wins.)

  // Eevee's eeveelutions (Eevee itself keeps the Normal "Adaptive Surge").
  134: mk('Mistral Deluge', 'water', 110, 1), // Vaporeon
  135: mk('Voltaic Bristle', 'electric', 110, 1, { kind: 'stun', chance: 0.3 }), // Jolteon
  136: mk('Cinder Maul', 'fire', 115, 1, { kind: 'burn', chance: 0.3 }, 'physical'), // Flareon
  196: mk('Lucent Foretell', 'psychic', 110, 1), // Espeon
  197: mk('Moonlit Hex', 'dark', 90, 1, { kind: 'stage', stat: 'eatk', delta: -1, chance: 1, target: 'foe' }), // Umbreon
  470: mk('Verdant Razor', 'grass', 115, 1, undefined, 'physical'), // Leafeon
  471: mk('Rime Lattice', 'ice', 110, 1, { kind: 'frostbite', chance: 0.3 }), // Glaceon
  700: mk('Ribbon Reverie', 'fairy', 110, 1, { kind: 'stage', stat: 'eatk', delta: -1, chance: 0.3, target: 'foe' }), // Sylveon

  // Other diverging branch tips (the sibling kept the line's base move/type above).
  863: mk('Plunder Cleave', 'steel', 110, 0.95, undefined, 'physical'), // Perrserker (vs Normal Persian)
  903: mk('Venomtalon Pounce', 'fighting', 110, 0.95, { kind: 'poison', chance: 0.3 }, 'physical'), // Sneasler (vs Dark/Ice Weavile)
  414: mk('Duskwing Flurry', 'flying', 100, 0.95, { kind: 'flinch', chance: 0.3 }, 'energy'), // Mothim (vs Bug Wormadam)
  791: mk('Daybreak Sunsteel', 'steel', 130, 0.95, undefined, 'physical'), // Solgaleo (vs Psychic base / Ghost Lunala)
  792: { ...mk('Eclipse Requiem', 'ghost', 130, 0.95, undefined, 'energy'), selfStage: { stat: 'eatk', delta: -1 } }, // Lunala
  // Gardevoir is a special attacker where its Gallade sibling is physical.
  282: mk('Aria of Reverie', 'fairy', 115, 1, undefined, 'energy'), // Gardevoir (Gallade keeps the physical base)
};
