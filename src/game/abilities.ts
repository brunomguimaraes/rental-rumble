import type { AbilityId } from './types.js';
import type { RNG } from './rng.js';

/**
 * The abilities framework — scaffolding for species-level passives that bend the
 * battle engine (as opposed to zodiac signs, which only tilt stats, or moves,
 * which are chosen each turn).
 *
 * Two layers:
 *   1. ABILITIES          — display metadata (name + description) per ability.
 *   2. SPECIES_ABILITIES  — which ability *options* each National Dex id can be
 *                           born with. Most listed species have a single fixed
 *                           ability; some have two, and a freshly-rolled mon
 *                           picks one of them at random (seeded), the same way
 *                           its zodiac sign and shiny luck are rolled.
 *
 * The actual battle behaviour lives in battle.ts (so the client sim and the
 * server re-sim stay byte-identical, the same pattern used for status/move
 * effects). This file is purely data: identity, copy, and the species mapping.
 *
 * Deliberately starting small — only the species that genuinely need one have an
 * ability. We grow the union (see AbilityId in types.ts) and these tables as we
 * implement more.
 */

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** One-line, player-facing explanation (used on cards and in the guide). */
  description: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  truant: {
    id: 'truant',
    name: 'Truant',
    description:
      'Loafs around every other turn, unable to act — the brake on a brute whose raw stats would otherwise be overwhelming.',
  },
  'vital-spirit': {
    id: 'vital-spirit',
    name: 'Vital Spirit',
    description: 'Too wired to doze off — can never be put to sleep.',
  },
  moxie: {
    id: 'moxie',
    name: 'Moxie',
    description:
      'Each knockout stokes its confidence, raising its Attack — a sweeper that snowballs through a team.',
  },
  'speed-boost': {
    id: 'speed-boost',
    name: 'Speed Boost',
    description: 'Its Speed climbs a stage at the end of every turn.',
  },
  guts: {
    id: 'guts',
    name: 'Guts',
    description:
      'Powers through a status condition, hitting 1.5× harder while burned, poisoned or paralyzed.',
  },
  adaptability: {
    id: 'adaptability',
    name: 'Adaptability',
    description: 'Its same-type attacks hit even harder — STAB is doubled to 2×.',
  },
  intimidate: {
    id: 'intimidate',
    name: 'Intimidate',
    description:
      "On entering battle, cows the opposing Pokémon and lowers its Attack a stage.",
  },
  sturdy: {
    id: 'sturdy',
    name: 'Sturdy',
    description:
      'If at full health, it endures any hit that would knock it out, hanging on with 1 HP.',
  },
  levitate: {
    id: 'levitate',
    name: 'Levitate',
    description: 'Floats above the ground — Ground-type moves do nothing to it.',
  },
  'thick-fat': {
    id: 'thick-fat',
    name: 'Thick Fat',
    description: 'A layer of fat halves the damage it takes from Fire and Ice moves.',
  },
  'marvel-scale': {
    id: 'marvel-scale',
    name: 'Marvel Scale',
    description:
      'A status condition toughens its scales, raising Defense by half while afflicted.',
  },
  technician: {
    id: 'technician',
    name: 'Technician',
    description: 'Masters its weaker moves — any attack of 60 power or less hits 1.5× harder.',
  },
  blaze: {
    id: 'blaze',
    name: 'Blaze',
    description: 'Cornered and below a third of its HP, its Fire-type moves flare to 1.5× power.',
  },
  torrent: {
    id: 'torrent',
    name: 'Torrent',
    description: 'Cornered and below a third of its HP, its Water-type moves surge to 1.5× power.',
  },
  overgrow: {
    id: 'overgrow',
    name: 'Overgrow',
    description: 'Cornered and below a third of its HP, its Grass-type moves bloom to 1.5× power.',
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm',
    description: 'Cornered and below a third of its HP, its Bug-type moves swarm to 1.5× power.',
  },
  static: {
    id: 'static',
    name: 'Static',
    description: 'Crackling with charge — a foe that lands a hit may be paralyzed.',
  },
  'flame-body': {
    id: 'flame-body',
    name: 'Flame Body',
    description: 'Wreathed in heat — a foe that lands a hit may be burned.',
  },
  'poison-point': {
    id: 'poison-point',
    name: 'Poison Point',
    description: 'Bristling with toxic barbs — a foe that lands a hit may be badly poisoned.',
  },
};

/**
 * National Dex id → the ability options that species can be born with. A
 * single-entry list is a fixed ability; a two-entry list rolls one at random
 * per freshly-rolled mon (see rollAbility). Only species with at least one
 * implemented ability appear here; every other species has none.
 *
 * Mirrors canon for the Slaking line (Slakoth/Slaking loaf with Truant, the
 * hyperactive Vigoroth is too wired to sleep) and gives a few species their two
 * real ability slots where both are implemented — e.g. Heracross is famously
 * either Guts or Moxie.
 */
export const SPECIES_ABILITIES: Record<number, AbilityId[]> = {
  // --- Truant / Vital Spirit (the Slaking line) ---------------------------
  287: ['truant'], // Slakoth
  288: ['vital-spirit'], // Vigoroth
  289: ['truant'], // Slaking

  // --- Moxie: KO-snowball sweepers ---------------------------------------
  198: ['moxie'], // Murkrow
  214: ['guts', 'moxie', 'swarm'], // Heracross — Guts, Moxie or Swarm
  262: ['intimidate', 'moxie'], // Mightyena — Intimidate or Moxie
  373: ['intimidate', 'moxie'], // Salamence — Intimidate or Moxie
  430: ['moxie'], // Honchkrow
  551: ['moxie'], // Sandile
  552: ['moxie'], // Krokorok
  553: ['moxie'], // Krookodile
  559: ['moxie'], // Scraggy
  560: ['moxie'], // Scrafty

  // --- Speed Boost: fast, frail accelerators -----------------------------
  193: ['speed-boost'], // Yanma
  255: ['speed-boost'], // Torchic
  256: ['speed-boost'], // Combusken
  257: ['speed-boost'], // Blaziken
  291: ['speed-boost'], // Ninjask
  318: ['guts', 'speed-boost'], // Carvanha — Guts or Speed Boost
  319: ['guts', 'speed-boost'], // Sharpedo — Guts or Speed Boost
  469: ['speed-boost'], // Yanmega

  // --- Guts: status-loving brawlers --------------------------------------
  66: ['guts'], // Machop
  67: ['guts'], // Machoke
  68: ['guts'], // Machamp
  136: ['guts'], // Flareon
  217: ['guts'], // Ursaring
  901: ['guts'], // Ursaluna (keeps Ursaring's Guts on evolution)
  276: ['guts'], // Taillow
  277: ['guts'], // Swellow
  296: ['guts'], // Makuhita
  297: ['guts'], // Hariyama
  532: ['guts'], // Timburr
  533: ['guts'], // Gurdurr
  534: ['guts'], // Conkeldurr

  // --- Adaptability: doubled-STAB nukes ----------------------------------
  341: ['adaptability'], // Corphish
  342: ['adaptability'], // Crawdaunt
  474: ['adaptability'], // Porygon-Z
  550: ['adaptability'], // Basculin
  902: ['adaptability'], // Basculegion (keeps Basculin's Adaptability on evolution)
  690: ['adaptability'], // Skrelp
  691: ['adaptability'], // Dragalge

  // --- Intimidate: entry-control bruisers ---------------------------------
  58: ['intimidate'], // Growlithe
  59: ['intimidate'], // Arcanine
  128: ['intimidate'], // Tauros
  130: ['intimidate'], // Gyarados
  303: ['intimidate'], // Mawile
  398: ['intimidate'], // Staraptor
  405: ['intimidate'], // Luxray

  // --- Sturdy: refuses to go down in one hit ------------------------------
  74: ['sturdy'], // Geodude
  75: ['sturdy'], // Graveler
  76: ['sturdy'], // Golem
  95: ['sturdy'], // Onix
  185: ['sturdy'], // Sudowoodo
  208: ['sturdy'], // Steelix
  213: ['sturdy'], // Shuckle
  299: ['sturdy'], // Nosepass
  476: ['sturdy'], // Probopass
  524: ['sturdy'], // Roggenrola
  525: ['sturdy'], // Boldore
  526: ['sturdy'], // Gigalith

  // --- Levitate: immune to Ground moves -----------------------------------
  92: ['levitate'], // Gastly
  93: ['levitate'], // Haunter
  94: ['levitate'], // Gengar
  109: ['levitate'], // Koffing
  110: ['levitate'], // Weezing
  200: ['levitate'], // Misdreavus
  201: ['levitate'], // Unown
  329: ['levitate'], // Vibrava
  330: ['levitate'], // Flygon
  343: ['levitate'], // Baltoy
  344: ['levitate'], // Claydol
  429: ['levitate'], // Mismagius
  436: ['levitate'], // Bronzor
  437: ['levitate'], // Bronzong
  602: ['levitate'], // Tynamo
  603: ['levitate'], // Eelektrik
  604: ['levitate'], // Eelektross

  // --- Thick Fat: shrugs off Fire & Ice -----------------------------------
  143: ['thick-fat'], // Snorlax
  446: ['thick-fat'], // Munchlax
  220: ['thick-fat'], // Swinub
  221: ['thick-fat'], // Piloswine
  473: ['thick-fat'], // Mamoswine
  363: ['thick-fat'], // Spheal
  364: ['thick-fat'], // Sealeo
  365: ['thick-fat'], // Walrein

  // --- Marvel Scale: status hardens its hide ------------------------------
  147: ['marvel-scale'], // Dratini
  148: ['marvel-scale'], // Dragonair
  149: ['marvel-scale'], // Dragonite (keeps the Dratini line's Marvel Scale)
  350: ['marvel-scale'], // Milotic

  // --- Technician: weak moves punch above their weight --------------------
  53: ['technician'], // Persian
  107: ['technician'], // Hitmonchan
  212: ['swarm', 'technician'], // Scizor — Swarm or Technician
  215: ['technician'], // Sneasel
  461: ['technician'], // Weavile
  903: ['technician'], // Sneasler (keeps Sneasel's Technician on evolution)

  // --- Blaze: Fire starters' pinch boost ----------------------------------
  4: ['blaze'], // Charmander
  5: ['blaze'], // Charmeleon
  6: ['blaze'], // Charizard
  155: ['blaze'], // Cyndaquil
  156: ['blaze'], // Quilava
  157: ['blaze'], // Typhlosion
  390: ['blaze'], // Chimchar
  391: ['blaze'], // Monferno
  392: ['blaze'], // Infernape
  498: ['blaze'], // Tepig
  499: ['blaze'], // Pignite
  500: ['blaze'], // Emboar
  653: ['blaze'], // Fennekin
  654: ['blaze'], // Braixen
  655: ['blaze'], // Delphox

  // --- Torrent: Water starters' pinch boost -------------------------------
  7: ['torrent'], // Squirtle
  8: ['torrent'], // Wartortle
  9: ['torrent'], // Blastoise
  158: ['torrent'], // Totodile
  159: ['torrent'], // Croconaw
  160: ['torrent'], // Feraligatr
  393: ['torrent'], // Piplup
  394: ['torrent'], // Prinplup
  395: ['torrent'], // Empoleon
  501: ['torrent'], // Oshawott
  502: ['torrent'], // Dewott
  503: ['torrent'], // Samurott
  656: ['torrent'], // Froakie
  657: ['torrent'], // Frogadier
  658: ['torrent'], // Greninja

  // --- Overgrow: Grass starters' pinch boost ------------------------------
  1: ['overgrow'], // Bulbasaur
  2: ['overgrow'], // Ivysaur
  3: ['overgrow'], // Venusaur
  152: ['overgrow'], // Chikorita
  153: ['overgrow'], // Bayleef
  154: ['overgrow'], // Meganium
  387: ['overgrow'], // Turtwig
  388: ['overgrow'], // Grotle
  389: ['overgrow'], // Torterra
  495: ['overgrow'], // Snivy
  496: ['overgrow'], // Servine
  497: ['overgrow'], // Serperior
  650: ['overgrow'], // Chespin
  651: ['overgrow'], // Quilladin
  652: ['overgrow'], // Chesnaught

  // --- Swarm: Bug attackers' pinch boost ----------------------------------
  13: ['swarm'], // Weedle
  14: ['swarm'], // Kakuna
  15: ['swarm'], // Beedrill
  165: ['swarm'], // Ledyba
  166: ['swarm'], // Ledian
  167: ['swarm'], // Spinarak
  168: ['swarm'], // Ariados
  267: ['swarm'], // Beautifly
  540: ['swarm'], // Sewaddle
  541: ['swarm'], // Swadloon
  542: ['swarm'], // Leavanny

  // --- Static: paralyzes a careless attacker ------------------------------
  25: ['static'], // Pikachu
  26: ['static'], // Raichu
  172: ['static'], // Pichu
  125: ['static'], // Electabuzz
  239: ['static'], // Elekid
  466: ['static'], // Electivire
  309: ['static'], // Electrike
  310: ['static'], // Manectric
  587: ['static'], // Emolga

  // --- Flame Body: burns a careless attacker ------------------------------
  126: ['flame-body'], // Magmar
  240: ['flame-body'], // Magby
  467: ['flame-body'], // Magmortar
  218: ['flame-body'], // Slugma
  219: ['flame-body'], // Magcargo
  636: ['flame-body'], // Larvesta
  637: ['flame-body'], // Volcarona

  // --- Poison Point: poisons a careless attacker --------------------------
  29: ['poison-point'], // Nidoran♀
  30: ['poison-point'], // Nidorina
  31: ['poison-point'], // Nidoqueen
  32: ['poison-point'], // Nidoran♂
  33: ['poison-point'], // Nidorino
  34: ['poison-point'], // Nidoking
  211: ['poison-point'], // Qwilfish
  904: ['poison-point'], // Overqwil (keeps Qwilfish's Poison Point on evolution)
  315: ['poison-point'], // Roselia
  406: ['poison-point'], // Budew
  407: ['poison-point'], // Roserade
};

/** Every ability a species could be born with (empty when it has none). */
export function abilitiesForDex(dexId: number): AbilityId[] {
  return SPECIES_ABILITIES[dexId] ?? [];
}

/**
 * The species' default ability — the first option. Used as the base value on
 * the canonical CREATURES list and as the server's fallback when a submission
 * carries no explicit ability (legacy payloads).
 */
export function defaultAbilityForDex(dexId: number): AbilityId | undefined {
  return abilitiesForDex(dexId)[0];
}

/**
 * Pick the ability a freshly-rolled mon is born with, seeded so a run stays
 * reproducible. Single-option species don't draw from the RNG (keeping the
 * stream stable for everything else); two-option species roll one at random.
 */
export function rollAbility(dexId: number, rng: RNG): AbilityId | undefined {
  const options = abilitiesForDex(dexId);
  if (options.length <= 1) return options[0];
  return rng.pick(options);
}

/** Whether `id` is a legal ability option for this species. */
export function isAbilityOption(dexId: number, id: AbilityId): boolean {
  return abilitiesForDex(dexId).includes(id);
}

/** Display metadata for an ability id. */
export function abilityInfo(id: AbilityId): AbilityDef {
  return ABILITIES[id];
}
