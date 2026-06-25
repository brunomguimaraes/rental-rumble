import type { AbilityId, BaseStats, DexEntry, PokemonType } from './types.js';
import type { RNG } from './rng.js';
import { RAW_DEX } from './pokedex.gen.js';

/**
 * The abilities framework — species-level passives that bend the battle engine
 * (as opposed to zodiac signs, which only tilt stats, or moves, which are chosen
 * each turn).
 *
 * Three layers:
 *   1. ABILITIES          — display metadata (name + description) per ability.
 *   2. SPECIES_ABILITIES  — hand-curated ability *options* for a National Dex id,
 *                           used for flavour/canon (e.g. the Slaking line's
 *                           Truant). An override layer: anything listed here wins.
 *   3. derivedAbilities   — the universal fallback. Every species NOT in the
 *                           curated table is given a small 2–3 ability pool drawn
 *                           from its types and stats, so *every* Pokémon has an
 *                           ability and most have a real choice. A freshly-rolled
 *                           mon picks one of its pool at random (seeded), the same
 *                           way its zodiac sign and shiny luck are rolled.
 *
 * The actual battle behaviour lives in battle.ts (so the client sim and the
 * server re-sim stay byte-identical, the same pattern used for status/move
 * effects). This file is purely data: identity, copy, and the species mapping.
 *
 * We grow the union (see AbilityId in types.ts) and these tables as we implement
 * more.
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
  regenerator: {
    id: 'regenerator',
    name: 'Regenerator',
    description: 'Knits itself back together, recovering a little HP at the end of every turn.',
  },
  'rough-skin': {
    id: 'rough-skin',
    name: 'Rough Skin',
    description: 'Its hide is studded with barbs — a foe that lands a hit takes a chunk of recoil.',
  },
  stamina: {
    id: 'stamina',
    name: 'Stamina',
    description: 'Digs in with every blow it weathers, raising its Defense a stage each time it is hit.',
  },
  multiscale: {
    id: 'multiscale',
    name: 'Multiscale',
    description: 'At full health a shimmering veil halves the damage of the first hit it takes.',
  },
  'solid-rock': {
    id: 'solid-rock',
    name: 'Solid Rock',
    description: 'A rugged frame blunts super-effective hits, taking only 0.75× from them.',
  },
  'tinted-lens': {
    id: 'tinted-lens',
    name: 'Tinted Lens',
    description: 'Focuses its weak hits — its not-very-effective moves deal double damage.',
  },
  'battle-armor': {
    id: 'battle-armor',
    name: 'Battle Armor',
    description: 'Hard plating seals out critical hits entirely.',
  },
  'quick-feet': {
    id: 'quick-feet',
    name: 'Quick Feet',
    description: 'A status condition sends it into overdrive, boosting Speed by half (and ignoring paralysis).',
  },
  'magic-guard': {
    id: 'magic-guard',
    name: 'Magic Guard',
    description: 'Only direct attacks can hurt it — it shrugs off burn and poison chip damage.',
  },
  'poison-heal': {
    id: 'poison-heal',
    name: 'Poison Heal',
    description: 'Thrives on toxins — while poisoned it heals each turn instead of taking damage.',
  },
  'clear-body': {
    id: 'clear-body',
    name: 'Clear Body',
    description: 'Utterly composed — the foe can never lower its stats (Intimidate included).',
  },
  defiant: {
    id: 'defiant',
    name: 'Defiant',
    description: 'Bristles at being belittled — an enemy stat drop spikes its Attack two stages.',
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    description: 'Takes deadly aim — its critical hits strike for 2.25× instead of the usual 1.5×.',
  },
  'sheer-force': {
    id: 'sheer-force',
    name: 'Sheer Force',
    description: 'Hits with raw power for 30% more damage, but its moves\u2019 added effects never trigger.',
  },
  'shed-skin': {
    id: 'shed-skin',
    name: 'Shed Skin',
    description: 'Sloughs off its skin — a roughly one-in-three chance to cure its status each turn.',
  },
  'early-bird': {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'A restless sleeper — it wakes from sleep twice as fast.',
  },
  scrappy: {
    id: 'scrappy',
    name: 'Scrappy',
    description: 'Fears no Ghost — its Normal and Fighting moves hit them despite the immunity.',
  },
  unaware: {
    id: 'unaware',
    name: 'Unaware',
    description: 'Pays no mind to the foe\u2019s stat boosts or drops, ignoring them on attack and defense.',
  },
};

/**
 * National Dex id → hand-curated ability options, an OVERRIDE layer on top of the
 * universal type/stat derivation below. A single-entry list pins a fixed ability
 * (e.g. the Slaking line's Truant); a multi-entry list rolls one at random per
 * freshly-rolled mon (see rollAbility). Species absent from this table fall back
 * to derivedAbilities() — so every Pokémon still gets a pool, these are just the
 * ones we wanted to flavour by hand (Slaking loafs with Truant, Heracross is
 * famously Guts/Moxie/Swarm, …).
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
  318: ['guts', 'speed-boost', 'rough-skin'], // Carvanha — Guts, Speed Boost or Rough Skin
  319: ['guts', 'speed-boost', 'rough-skin'], // Sharpedo — Guts, Speed Boost or Rough Skin
  469: ['speed-boost', 'tinted-lens'], // Yanmega — Speed Boost or Tinted Lens

  // --- Guts: status-loving brawlers --------------------------------------
  66: ['guts'], // Machop
  67: ['guts'], // Machoke
  68: ['guts'], // Machamp
  136: ['guts'], // Flareon
  217: ['guts', 'quick-feet'], // Ursaring — Guts or Quick Feet
  901: ['guts', 'quick-feet'], // Ursaluna — Guts or Quick Feet
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
  130: ['intimidate', 'moxie'], // Gyarados — Intimidate or Moxie
  303: ['intimidate'], // Mawile
  398: ['intimidate', 'defiant'], // Staraptor — Intimidate or Defiant
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
  149: ['marvel-scale', 'multiscale'], // Dragonite — Marvel Scale or Multiscale
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
  267: ['swarm', 'tinted-lens'], // Beautifly — Swarm or Tinted Lens
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

  // --- Regenerator: slow self-mending attrition ---------------------------
  79: ['regenerator'], // Slowpoke
  80: ['regenerator'], // Slowbro
  199: ['regenerator'], // Slowking
  114: ['regenerator'], // Tangela
  465: ['regenerator'], // Tangrowth
  619: ['regenerator', 'quick-feet'], // Mienfoo — Regenerator or Quick Feet
  620: ['regenerator', 'quick-feet'], // Mienshao — Regenerator or Quick Feet
  222: ['regenerator', 'sturdy'], // Corsola — Regenerator or Sturdy

  // --- Rough Skin: punishes a careless attacker ---------------------------
  28: ['sturdy', 'rough-skin'], // Sandslash — Sturdy or Rough Skin
  443: ['rough-skin'], // Gible
  444: ['rough-skin'], // Gabite
  445: ['rough-skin', 'sturdy'], // Garchomp — Rough Skin or Sturdy
  621: ['rough-skin', 'stamina'], // Druddigon — Rough Skin or Stamina

  // --- Stamina: digs in harder with every hit -----------------------------
  304: ['stamina', 'sturdy'], // Aron — Stamina or Sturdy
  305: ['stamina', 'sturdy'], // Lairon — Stamina or Sturdy
  306: ['stamina', 'sturdy'], // Aggron — Stamina or Sturdy
  324: ['stamina', 'thick-fat'], // Torkoal — Stamina or Thick Fat
  410: ['sturdy', 'stamina'], // Shieldon — Sturdy or Stamina
  411: ['sturdy', 'stamina'], // Bastiodon — Sturdy or Stamina

  // --- Multiscale: full-HP veil softens the first blow --------------------
  131: ['thick-fat', 'multiscale'], // Lapras — Thick Fat or Multiscale
  248: ['multiscale', 'intimidate'], // Tyranitar — Multiscale or Intimidate

  // --- Solid Rock: blunts super-effective hits ----------------------------
  464: ['solid-rock', 'sturdy'], // Rhyperior — Solid Rock or Sturdy
  323: ['solid-rock', 'thick-fat'], // Camerupt — Solid Rock or Thick Fat
  112: ['solid-rock', 'sturdy'], // Rhydon — Solid Rock or Sturdy
  111: ['solid-rock', 'sturdy'], // Rhyhorn — Solid Rock or Sturdy

  // --- Tinted Lens: doubles its resisted hits -----------------------------
  12: ['tinted-lens'], // Butterfree
  49: ['tinted-lens'], // Venomoth

  // --- Battle Armor: seals out critical hits ------------------------------
  140: ['battle-armor'], // Kabuto
  141: ['battle-armor'], // Kabutops
  347: ['battle-armor'], // Anorith
  348: ['battle-armor', 'sturdy'], // Armaldo — Battle Armor or Sturdy
  104: ['battle-armor'], // Cubone
  105: ['battle-armor', 'rough-skin'], // Marowak — Battle Armor or Rough Skin

  // --- Quick Feet: status fuels its Speed ---------------------------------
  263: ['quick-feet'], // Zigzagoon
  264: ['quick-feet'], // Linoone
  135: ['quick-feet'], // Jolteon

  // --- Magic Guard: shrugs off chip damage --------------------------------
  35: ['magic-guard'], // Clefairy
  36: ['magic-guard'], // Clefable
  173: ['magic-guard'], // Cleffa
  561: ['magic-guard', 'levitate'], // Sigilyph — Magic Guard or Levitate

  // --- Poison Heal: thrives while poisoned --------------------------------
  286: ['poison-heal', 'technician'], // Breloom — Poison Heal or Technician
  472: ['poison-heal', 'intimidate'], // Gliscor — Poison Heal or Intimidate

  // --- Clear Body: unshakeable, immune to stat drops ----------------------
  72: ['clear-body'], // Tentacool
  73: ['clear-body', 'poison-point'], // Tentacruel — Clear Body or Poison Point
  374: ['clear-body'], // Beldum
  375: ['clear-body'], // Metang
  376: ['clear-body'], // Metagross

  // --- Defiant: an enemy debuff spikes its Attack -------------------------
  509: ['defiant'], // Purrloin
  510: ['defiant'], // Liepard
  624: ['defiant'], // Pawniard
  625: ['defiant'], // Bisharp
  627: ['defiant', 'sturdy'], // Rufflet — Defiant or Sturdy
  628: ['defiant', 'sturdy'], // Braviary — Defiant or Sturdy
};

/**
 * Per-type ability flavour, ordered best-fit-first. The [0] entry is a type's
 * "signature" passive (and becomes a derived species' canonical default); the
 * rest round out its pool. Mixes the classic type passives with our own riffs so
 * each type reads distinctly.
 */
const TYPE_ABILITIES: Record<PokemonType, AbilityId[]> = {
  normal: ['adaptability', 'scrappy', 'quick-feet'],
  fire: ['blaze', 'flame-body', 'sheer-force'],
  water: ['torrent', 'rough-skin', 'unaware'],
  electric: ['static', 'quick-feet', 'sniper'],
  grass: ['overgrow', 'regenerator', 'shed-skin'],
  ice: ['thick-fat', 'multiscale', 'sniper'],
  fighting: ['guts', 'defiant', 'scrappy'],
  poison: ['poison-point', 'poison-heal', 'shed-skin'],
  ground: ['rough-skin', 'sturdy', 'sheer-force'],
  flying: ['intimidate', 'defiant', 'early-bird'],
  psychic: ['magic-guard', 'levitate', 'unaware'],
  bug: ['swarm', 'technician', 'tinted-lens'],
  rock: ['sturdy', 'solid-rock', 'battle-armor'],
  ghost: ['levitate', 'magic-guard', 'sniper'],
  dragon: ['marvel-scale', 'multiscale', 'sheer-force'],
  dark: ['moxie', 'intimidate', 'defiant'],
  steel: ['clear-body', 'battle-armor', 'sturdy'],
  fairy: ['magic-guard', 'clear-body', 'unaware'],
};

/** A stat-flavoured pool keyed to a species' single biggest base stat. */
function statFlavor(stats: BaseStats): AbilityId[] {
  const { hp, atk, def, spd } = stats;
  const max = Math.max(hp, atk, def, spd);
  if (atk === max) return ['moxie', 'sheer-force', 'guts'];
  if (spd === max) return ['speed-boost', 'quick-feet', 'sniper'];
  if (def === max) return ['stamina', 'battle-armor', 'sturdy'];
  return ['regenerator', 'thick-fat', 'shed-skin']; // HP-dominant (or tie → HP)
}

const DEX_BY_ID = new Map<number, DexEntry>(RAW_DEX.map((e) => [e.id, e]));
const derivedCache = new Map<number, AbilityId[]>();

/**
 * The universal fallback pool for any species not in the curated table: a small
 * 2–3 ability set woven from its primary/secondary types and its dominant stat.
 * Deterministic (pure function of the static dex row), so the client sim and the
 * server re-sim agree, and cached so we only build it once per species.
 */
function derivedAbilities(dexId: number): AbilityId[] {
  const cached = derivedCache.get(dexId);
  if (cached) return cached;
  const entry = DEX_BY_ID.get(dexId);
  if (!entry) return [];

  const pool: AbilityId[] = [];
  const add = (id: AbilityId | undefined) => {
    if (id && !pool.includes(id) && pool.length < 3) pool.push(id);
  };

  const [primary, secondary] = entry.types;
  const primaryPool = TYPE_ABILITIES[primary];
  const stat = statFlavor(entry.stats);

  // Canonical default first (the primary type's signature), then a stat-flavoured
  // pick varied across the dex by id, then a touch of secondary-type identity.
  add(primaryPool[0]);
  add(stat[entry.id % stat.length]);
  if (secondary) add(TYPE_ABILITIES[secondary][0]);
  add(primaryPool[1]);
  // Guarantee a genuine choice (>=2) even if the picks above collapsed into one.
  add(stat[0]);
  add(stat[1]);

  derivedCache.set(dexId, pool);
  return pool;
}

/**
 * Every ability a species could be born with. Curated entries win; everything
 * else falls back to the type/stat derivation, so every Pokémon has a pool.
 */
export function abilitiesForDex(dexId: number): AbilityId[] {
  return SPECIES_ABILITIES[dexId] ?? derivedAbilities(dexId);
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

/** Whether the species has a real *choice* of ability (a pool of 2+ options). */
export function hasAbilityChoice(dexId: number): boolean {
  return abilitiesForDex(dexId).length >= 2;
}

/**
 * Gamble a *different* ability from the species' pool — the "weak special"
 * ability-reroll reward. Mirrors rerollSign: seeded for reproducibility, and it
 * always lands on something new (excluding the current ability). A species with
 * no real choice (pool < 2) simply keeps what it has.
 */
export function rerollAbility(
  dexId: number,
  rng: RNG,
  current: AbilityId | undefined,
): AbilityId | undefined {
  const options = abilitiesForDex(dexId);
  if (options.length === 0) return current;
  const pool = options.filter((id) => id !== current);
  if (pool.length === 0) return current;
  return rng.pick(pool);
}

/** Display metadata for an ability id. */
export function abilityInfo(id: AbilityId): AbilityDef {
  return ABILITIES[id];
}
