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
  /**
   * One-line, player-facing explanation (used on cards and in the guide). This
   * deliberately omits hard numbers (multipliers, percentages, exact stages) —
   * players get the gist, not the tuning. The precise figures live in
   * `devDescription`.
   */
  description: string;
  /**
   * The exact-numbers version, shown only in dev builds (see
   * `abilityDescription`). Present only on abilities whose player copy hides a
   * number; everything else reads the same in both modes.
   */
  devDescription?: string;
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
      'Powers through a status condition, hitting noticeably harder while burned, poisoned or paralyzed.',
    devDescription:
      'Powers through a status condition, hitting 1.5× harder while burned, poisoned or paralyzed.',
  },
  adaptability: {
    id: 'adaptability',
    name: 'Adaptability',
    description: 'Its same-type attacks hit even harder — its STAB bonus is doubled.',
    devDescription: 'Its same-type attacks hit even harder — STAB is doubled to 2×.',
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
      'If at full health, it endures any hit that would knock it out, hanging on by a thread.',
    devDescription:
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
    description: 'Masters its weaker moves — its weaker attacks hit noticeably harder.',
    devDescription: 'Masters its weaker moves — any attack of 60 power or less hits 1.5× harder.',
  },
  blaze: {
    id: 'blaze',
    name: 'Blaze',
    description: 'Cornered and below a third of its HP, its Fire-type moves flare with extra power.',
    devDescription:
      'Cornered and below a third of its HP, its Fire-type moves flare to 1.5× power.',
  },
  torrent: {
    id: 'torrent',
    name: 'Torrent',
    description:
      'Cornered and below a third of its HP, its Water-type moves surge with extra power.',
    devDescription:
      'Cornered and below a third of its HP, its Water-type moves surge to 1.5× power.',
  },
  overgrow: {
    id: 'overgrow',
    name: 'Overgrow',
    description:
      'Cornered and below a third of its HP, its Grass-type moves bloom with extra power.',
    devDescription:
      'Cornered and below a third of its HP, its Grass-type moves bloom to 1.5× power.',
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm',
    description: 'Cornered and below a third of its HP, its Bug-type moves swarm with extra power.',
    devDescription: 'Cornered and below a third of its HP, its Bug-type moves swarm to 1.5× power.',
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
    description: 'A rugged frame blunts super-effective hits, taking noticeably less from them.',
    devDescription: 'A rugged frame blunts super-effective hits, taking only 0.75× from them.',
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
    description: 'Takes deadly aim — its critical hits strike for even more than usual.',
    devDescription:
      'Takes deadly aim — its critical hits strike for 2.25× instead of the usual 1.5×.',
  },
  'sheer-force': {
    id: 'sheer-force',
    name: 'Sheer Force',
    description: 'Hits with raw power for extra damage, but its moves\u2019 added effects never trigger.',
    devDescription:
      'Hits with raw power for 30% more damage, but its moves\u2019 added effects never trigger.',
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
  'water-absorb': {
    id: 'water-absorb',
    name: 'Water Absorb',
    description: 'Drinks in Water moves — they do no damage and instead restore about a quarter of its HP.',
  },
  'volt-absorb': {
    id: 'volt-absorb',
    name: 'Volt Absorb',
    description: 'Feeds on electricity — Electric moves do nothing and heal it for about a quarter of its HP.',
  },
  'flash-fire': {
    id: 'flash-fire',
    name: 'Flash Fire',
    description: 'Fire can\u2019t touch it; once doused in flame, its own Fire moves burn hotter.',
    devDescription:
      'Fire can\u2019t touch it; once doused in flame, its own Fire moves burn 1.5\u00d7 hotter.',
  },
  'sap-sipper': {
    id: 'sap-sipper',
    name: 'Sap Sipper',
    description: 'Grazes on Grass attacks — they deal no damage and raise its Attack a stage instead.',
  },
  'motor-drive': {
    id: 'motor-drive',
    name: 'Motor Drive',
    description: 'Electricity jolts it into gear — Electric moves do nothing and its Speed climbs a stage.',
  },
  'dry-skin': {
    id: 'dry-skin',
    name: 'Dry Skin',
    description: 'A porous hide: Water heals it, but Fire bites for extra damage.',
    devDescription: 'A porous hide: Water heals it, but Fire bites for 1.25\u00d7 the damage.',
  },
  heatproof: {
    id: 'heatproof',
    name: 'Heatproof',
    description: 'Insulated against heat — it takes only half the damage from Fire-type moves.',
  },
  immunity: {
    id: 'immunity',
    name: 'Immunity',
    description: 'A clean constitution that can never be poisoned.',
  },
  'water-veil': {
    id: 'water-veil',
    name: 'Water Veil',
    description: 'Wrapped in a moist sheen — it can never be burned.',
  },
  limber: {
    id: 'limber',
    name: 'Limber',
    description: 'Supple-limbed and loose — it can never be paralyzed.',
  },
  'own-tempo': {
    id: 'own-tempo',
    name: 'Own Tempo',
    description: 'Marches to its own beat, so it can never be confused.',
  },
  contrary: {
    id: 'contrary',
    name: 'Contrary',
    description: 'Everything\u2019s upside-down — stat drops raise it and boosts lower it, so a foe\u2019s debuffs only help.',
  },
  simple: {
    id: 'simple',
    name: 'Simple',
    description: 'Easily swayed — every stat change it takes, up or down, is doubled.',
  },
  'anger-point': {
    id: 'anger-point',
    name: 'Anger Point',
    description: 'A critical hit sends it into a fury, maxing out its Attack on the spot.',
  },
  justified: {
    id: 'justified',
    name: 'Justified',
    description: 'Its sense of justice flares against Dark moves — being struck by one raises its Attack a stage.',
  },
  disguise: {
    id: 'disguise',
    name: 'Disguise',
    description: 'A flimsy costume eats the first hit it takes — that blow is shrugged off before the disguise breaks.',
  },
  'hyper-cutter': {
    id: 'hyper-cutter',
    name: 'Hyper Cutter',
    description: 'Proud of its blades — the foe can never lower its Attack.',
  },
  'big-pecks': {
    id: 'big-pecks',
    name: 'Big Pecks',
    description: 'Puffs out its chest — the foe can never lower its Defense.',
  },
  'inner-focus': {
    id: 'inner-focus',
    name: 'Inner Focus',
    description: 'Unshakeable composure — it never flinches and ignores Intimidate entirely.',
  },
  steadfast: {
    id: 'steadfast',
    name: 'Steadfast',
    description: 'Every flinch only steels it — its Speed rises a stage each time it\u2019s made to balk.',
  },
  hustle: {
    id: 'hustle',
    name: 'Hustle',
    description: 'Throws its whole body into each blow for more Attack, at the cost of shakier accuracy.',
    devDescription:
      'Throws its whole body into each blow for 1.5\u00d7 Attack, at the cost of shakier accuracy (0.8\u00d7).',
  },
  defeatist: {
    id: 'defeatist',
    name: 'Defeatist',
    description: 'Loses heart at half HP or less — its Attack is halved until it heals back up.',
  },
  'weak-armor': {
    id: 'weak-armor',
    name: 'Weak Armor',
    description: 'Each hit cracks its plating (lowering Defense) but sheds weight, quickening it (raising Speed).',
  },
  'anger-shell': {
    id: 'anger-shell',
    name: 'Anger Shell',
    description: 'A blow that drops it below half HP cracks its shell — Defense falls, but its Attack and Speed surge.',
  },
  aftermath: {
    id: 'aftermath',
    name: 'Aftermath',
    description: 'If a direct hit knocks it out, the blast catches the attacker for a quarter of its HP.',
  },
  'liquid-ooze': {
    id: 'liquid-ooze',
    name: 'Liquid Ooze',
    description: 'Its fluids are foul — anything that drains its HP is poisoned by the ooze and loses HP instead.',
  },
  overload: {
    id: 'overload',
    name: 'Overload',
    description: 'Runs hot: the stat boosts it gains are stronger, but burn and poison gnaw at it harder.',
    devDescription:
      'Runs hot: the stat boosts it gains are 25% stronger, but burn and poison gnaw at it 50% harder.',
  },
  'glass-cannon': {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    description: 'All offence, no guard — it deals extra damage but takes more from every hit in return.',
    devDescription:
      'All offence, no guard — it deals 1.3\u00d7 damage but takes 1.2\u00d7 from every hit in return.',
  },
  'last-stand': {
    id: 'last-stand',
    name: 'Last Stand',
    description: 'The more wounded it is, the harder it fights — its damage climbs as its HP empties.',
    devDescription:
      'The more wounded it is, the harder it fights — its damage climbs toward 1.5\u00d7 as its HP empties.',
  },
  legacy: {
    id: 'legacy',
    name: 'Legacy',
    description: 'When it faints, it passes on its strength — the next ally enters with a sharp boost to the stat it was best at.',
    devDescription:
      'When it faints, it passes on its strength — the next ally enters with a sharp +2 to the stat it was best at.',
  },
  rally: {
    id: 'rally',
    name: 'Rally',
    description: 'Its fall rallies the team — the next ally charges out fired up, with raised Attack and Speed.',
    devDescription:
      'Its fall rallies the team — the next ally charges out fired up, with +1 Attack and +1 Speed.',
  },
  'glory-hog': {
    id: 'glory-hog',
    name: 'Glory Hog',
    description: 'A spotlight-stealing star: it fights above its stats, but hogs the glory, dragging the rest of its team below theirs.',
    devDescription:
      'A spotlight-stealing star: it fights at 1.15\u00d7 its stats, but hogs the glory, dragging the rest of its team to 0.9\u00d7.',
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
  136: ['flash-fire', 'guts'], // Flareon — Flash Fire or Guts
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
  341: ['adaptability', 'anger-shell'], // Corphish — Adaptability or Anger Shell
  342: ['adaptability', 'anger-shell'], // Crawdaunt — Adaptability or Anger Shell
  474: ['adaptability'], // Porygon-Z
  550: ['adaptability'], // Basculin
  902: ['adaptability'], // Basculegion (keeps Basculin's Adaptability on evolution)
  690: ['adaptability'], // Skrelp
  691: ['adaptability'], // Dragalge

  // --- Intimidate: entry-control bruisers ---------------------------------
  58: ['intimidate', 'flash-fire'], // Growlithe — Intimidate or Flash Fire
  59: ['intimidate', 'flash-fire'], // Arcanine — Intimidate or Flash Fire
  128: ['intimidate', 'anger-point'], // Tauros — Intimidate or Anger Point
  130: ['intimidate', 'moxie'], // Gyarados — Intimidate or Moxie
  303: ['intimidate', 'hyper-cutter'], // Mawile — Intimidate or Hyper Cutter
  398: ['intimidate', 'defiant'], // Staraptor — Intimidate or Defiant
  405: ['intimidate'], // Luxray

  // --- Sturdy: refuses to go down in one hit ------------------------------
  74: ['sturdy'], // Geodude
  75: ['sturdy'], // Graveler
  76: ['sturdy'], // Golem
  95: ['sturdy', 'weak-armor'], // Onix — Sturdy or Weak Armor
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
  436: ['levitate', 'heatproof'], // Bronzor — Levitate or Heatproof
  437: ['levitate', 'heatproof'], // Bronzong — Levitate or Heatproof
  602: ['levitate'], // Tynamo
  603: ['levitate'], // Eelektrik
  604: ['levitate'], // Eelektross

  // --- Thick Fat: shrugs off Fire & Ice -----------------------------------
  143: ['thick-fat', 'immunity'], // Snorlax — Thick Fat or Immunity
  446: ['thick-fat', 'immunity'], // Munchlax — Thick Fat or Immunity
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
  53: ['technician', 'limber'], // Persian — Technician or Limber
  107: ['technician', 'inner-focus'], // Hitmonchan — Technician or Inner Focus
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
  495: ['overgrow', 'contrary'], // Snivy — Overgrow or Contrary
  496: ['overgrow', 'contrary'], // Servine — Overgrow or Contrary
  497: ['overgrow', 'contrary'], // Serperior — Overgrow or Contrary
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
  466: ['motor-drive', 'static'], // Electivire — Motor Drive or Static
  309: ['static'], // Electrike
  310: ['static', 'intimidate'], // Manectric — Static or Intimidate
  587: ['static', 'motor-drive'], // Emolga — Static or Motor Drive

  // --- Flame Body: burns a careless attacker ------------------------------
  126: ['flame-body'], // Magmar
  240: ['flame-body'], // Magby
  467: ['flame-body'], // Magmortar
  218: ['flame-body'], // Slugma
  219: ['flame-body', 'weak-armor'], // Magcargo — Flame Body or Weak Armor
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
  104: ['legacy', 'battle-armor'], // Cubone — Legacy (its mother's memory) or Battle Armor
  105: ['legacy', 'battle-armor'], // Marowak — Legacy or Battle Armor

  // --- Quick Feet: status fuels its Speed ---------------------------------
  263: ['quick-feet'], // Zigzagoon
  264: ['quick-feet'], // Linoone

  // --- Magic Guard: shrugs off chip damage --------------------------------
  35: ['magic-guard'], // Clefairy
  36: ['magic-guard'], // Clefable
  173: ['magic-guard'], // Cleffa
  561: ['magic-guard', 'levitate'], // Sigilyph — Magic Guard or Levitate

  // --- Poison Heal: thrives while poisoned --------------------------------
  286: ['poison-heal', 'technician'], // Breloom — Poison Heal or Technician
  472: ['poison-heal', 'intimidate'], // Gliscor — Poison Heal or Intimidate

  // --- Clear Body: unshakeable, immune to stat drops ----------------------
  72: ['clear-body', 'liquid-ooze'], // Tentacool — Clear Body or Liquid Ooze
  73: ['clear-body', 'poison-point', 'liquid-ooze'], // Tentacruel — Clear Body, Poison Point or Liquid Ooze
  374: ['clear-body'], // Beldum
  375: ['clear-body'], // Metang
  376: ['clear-body'], // Metagross

  // --- Defiant: an enemy debuff spikes its Attack -------------------------
  509: ['defiant'], // Purrloin
  510: ['defiant', 'glory-hog'], // Liepard — Defiant or Glory Hog (a treacherous diva)
  624: ['defiant'], // Pawniard
  625: ['defiant'], // Bisharp
  627: ['defiant', 'sturdy'], // Rufflet — Defiant or Sturdy
  628: ['defiant', 'sturdy'], // Braviary — Defiant or Sturdy

  // --- Water Absorb: soaks up Water and heals --------------------------------
  134: ['water-absorb'], // Vaporeon
  86: ['thick-fat', 'water-absorb'], // Seel — Thick Fat or Water Absorb
  87: ['thick-fat', 'water-absorb'], // Dewgong — Thick Fat or Water Absorb
  194: ['water-absorb', 'unaware'], // Wooper — Water Absorb or Unaware
  195: ['water-absorb', 'unaware'], // Quagsire — Water Absorb or Unaware
  226: ['water-absorb', 'intimidate'], // Mantine — Water Absorb or Intimidate
  458: ['water-absorb', 'intimidate'], // Mantyke — Water Absorb or Intimidate
  592: ['water-absorb', 'levitate'], // Frillish — Water Absorb or Levitate
  593: ['water-absorb', 'levitate'], // Jellicent — Water Absorb or Levitate

  // --- Volt Absorb / Motor Drive: feed on electricity ------------------------
  135: ['volt-absorb', 'quick-feet', 'overload'], // Jolteon — Volt Absorb, Quick Feet or Overload
  170: ['volt-absorb'], // Chinchou
  171: ['volt-absorb'], // Lanturn
  311: ['volt-absorb', 'rally'], // Plusle — Volt Absorb or Rally (a cheering partner)
  312: ['volt-absorb', 'rally'], // Minun — Volt Absorb or Rally (a cheering partner)
  522: ['motor-drive'], // Blitzle
  523: ['motor-drive'], // Zebstrika

  // --- Flash Fire: doused in flame, it only burns hotter ---------------------
  37: ['flash-fire'], // Vulpix
  38: ['flash-fire'], // Ninetales
  77: ['flash-fire'], // Ponyta
  78: ['flash-fire'], // Rapidash
  228: ['flash-fire', 'early-bird'], // Houndour — Flash Fire or Early Bird
  229: ['flash-fire', 'early-bird'], // Houndoom — Flash Fire or Early Bird
  607: ['flash-fire', 'levitate'], // Litwick — Flash Fire or Levitate
  608: ['flash-fire', 'levitate'], // Lampent — Flash Fire or Levitate
  609: ['flash-fire', 'levitate'], // Chandelure — Flash Fire or Levitate

  // --- Sap Sipper: grazes on Grass attacks for an Attack boost ---------------
  184: ['sap-sipper', 'thick-fat'], // Azumarill — Sap Sipper or Thick Fat
  241: ['sap-sipper', 'thick-fat'], // Miltank — Sap Sipper or Thick Fat
  585: ['sap-sipper'], // Deerling
  586: ['sap-sipper'], // Sawsbuck
  626: ['sap-sipper', 'guts'], // Bouffalant — Sap Sipper or Guts
  672: ['sap-sipper'], // Skiddo
  673: ['sap-sipper'], // Gogoat

  // --- Dry Skin: Water mends it, Fire sears it -------------------------------
  46: ['dry-skin'], // Paras
  47: ['dry-skin'], // Parasect
  453: ['dry-skin'], // Croagunk
  454: ['dry-skin'], // Toxicroak

  // --- Immunity: a clean constitution, never poisoned ------------------------
  335: ['immunity', 'quick-feet'], // Zangoose — Immunity or Quick Feet

  // --- Water Veil: a moist sheen, never burned -------------------------------
  118: ['water-veil'], // Goldeen
  119: ['water-veil'], // Seaking
  320: ['water-veil'], // Wailmer
  321: ['water-veil', 'thick-fat'], // Wailord — Water Veil or Thick Fat

  // --- Limber: too supple to be paralyzed ------------------------------------
  106: ['limber', 'steadfast'], // Hitmonlee — Limber or Steadfast
  132: ['limber'], // Ditto

  // --- Own Tempo: marches to its own beat, never confused --------------------
  108: ['own-tempo'], // Lickitung
  463: ['own-tempo'], // Lickilicky
  235: ['own-tempo', 'technician'], // Smeargle — Own Tempo or Technician
  327: ['own-tempo', 'contrary'], // Spinda — Own Tempo or Contrary

  // --- Contrary: the foe's debuffs only feed it ------------------------------
  686: ['contrary'], // Inkay
  687: ['contrary'], // Malamar

  // --- Simple: every stat shift it takes is doubled --------------------------
  399: ['simple', 'unaware'], // Bidoof — Simple or Unaware
  400: ['simple', 'unaware'], // Bibarel — Simple or Unaware
  322: ['simple', 'solid-rock'], // Numel — Simple or Solid Rock
  527: ['unaware', 'simple'], // Woobat — Unaware or Simple
  528: ['unaware', 'simple'], // Swoobat — Unaware or Simple

  // --- Anger Point: a crit tips it into a full rage --------------------------
  56: ['anger-point', 'vital-spirit'], // Mankey — Anger Point or Vital Spirit
  57: ['anger-point', 'vital-spirit'], // Primeape — Anger Point or Vital Spirit
  98: ['hyper-cutter', 'anger-point'], // Krabby — Hyper Cutter or Anger Point
  99: ['hyper-cutter', 'anger-point'], // Kingler — Hyper Cutter or Anger Point

  // --- Justified: its honor flares against Dark attacks ----------------------
  448: ['justified', 'inner-focus'], // Lucario — Justified or Inner Focus
  475: ['justified', 'steadfast'], // Gallade — Justified or Steadfast

  // --- Disguise: a costume eats the first hit --------------------------------
  778: ['disguise'], // Mimikyu

  // --- Battle Armor / Shell Armor: a sealed shell wards off crits ------------
  // Cloyster's spiked shell is armour, not blubber — Shell Armor, not Thick Fat.
  90: ['battle-armor'], // Shellder
  91: ['battle-armor'], // Cloyster

  // --- Hyper Cutter: proud blades the foe can't blunt ------------------------
  127: ['hyper-cutter', 'moxie'], // Pinsir — Hyper Cutter or Moxie
  207: ['hyper-cutter'], // Gligar
  328: ['hyper-cutter'], // Trapinch

  // --- Big Pecks: a puffed-out chest guards its Defense ----------------------
  16: ['big-pecks'], // Pidgey
  17: ['big-pecks'], // Pidgeotto
  18: ['big-pecks'], // Pidgeot
  580: ['big-pecks'], // Ducklett
  581: ['big-pecks'], // Swanna
  661: ['big-pecks'], // Fletchling

  // --- Inner Focus: unshakeable, never flinches, ignores Intimidate ----------
  41: ['inner-focus'], // Zubat
  42: ['inner-focus'], // Golbat
  169: ['inner-focus'], // Crobat
  447: ['inner-focus', 'steadfast'], // Riolu — Inner Focus or Steadfast

  // --- Steadfast: every flinch only quickens its resolve ---------------------
  123: ['technician', 'steadfast'], // Scyther — Technician or Steadfast
  359: ['sniper', 'steadfast'], // Absol — Sniper or Steadfast

  // --- Hustle: raw power bought with shakier aim -----------------------------
  554: ['hustle', 'sheer-force'], // Darumaka — Hustle or Sheer Force
  555: ['hustle', 'sheer-force'], // Darmanitan — Hustle or Sheer Force
  632: ['hustle', 'swarm'], // Durant — Hustle or Swarm
  633: ['hustle'], // Deino
  634: ['hustle'], // Zweilous
  635: ['levitate'], // Hydreigon

  // --- Defeatist: loses heart once worn down ---------------------------------
  566: ['defeatist'], // Archen
  567: ['defeatist'], // Archeops

  // --- Weak Armor: a hit cracks its plating but lightens its step -------------
  227: ['sturdy', 'weak-armor'], // Skarmory — Sturdy or Weak Armor
  557: ['sturdy', 'anger-shell'], // Dwebble — Sturdy or Anger Shell
  558: ['sturdy', 'anger-shell'], // Crustle — Sturdy or Anger Shell

  // --- Aftermath: it goes off like a bomb when it's downed --------------------
  100: ['aftermath', 'static'], // Voltorb — Aftermath or Static
  101: ['aftermath', 'static'], // Electrode — Aftermath or Static
  434: ['aftermath'], // Stunky
  435: ['aftermath'], // Skuntank
  425: ['aftermath'], // Drifloon
  426: ['aftermath'], // Drifblim

  // --- Liquid Ooze: drainers choke on its toxic fluids -----------------------
  316: ['liquid-ooze'], // Gulpin
  317: ['liquid-ooze'], // Swalot

  // --- Overload: runs hot — bigger boosts, but burn/poison bite harder -------
  64: ['magic-guard', 'overload'], // Kadabra — Magic Guard or Overload
  65: ['magic-guard', 'overload'], // Alakazam — Magic Guard or Overload
  181: ['static', 'overload'], // Ampharos — Static or Overload

  // --- Glass Cannon: all offence, paper-thin guard ---------------------------
  142: ['glass-cannon'], // Aerodactyl
  408: ['glass-cannon'], // Cranidos
  409: ['glass-cannon'], // Rampardos

  // --- Last Stand: it fights hardest with its back to the wall ----------------
  83: ['last-stand'], // Farfetch'd
  538: ['guts', 'last-stand'], // Throh — Guts or Last Stand
  539: ['inner-focus', 'last-stand'], // Sawk — Inner Focus or Last Stand

  // --- Legacy: a fallen mon passes its strength to its successor --------------
  355: ['levitate', 'legacy'], // Duskull — Levitate or Legacy (a lingering spirit)
  356: ['levitate', 'legacy'], // Dusclops — Levitate or Legacy
  477: ['levitate', 'legacy'], // Dusknoir — Levitate or Legacy

  // --- Rally: a supportive heart fires up the next ally in --------------------
  113: ['rally'], // Chansey
  242: ['rally'], // Blissey
  531: ['regenerator', 'rally'], // Audino — Regenerator or Rally

  // --- Glory Hog: a selfish star that hogs the team's strength ----------------
  431: ['glory-hog'], // Glameow
  432: ['glory-hog'], // Purugly
  668: ['moxie', 'glory-hog'], // Pyroar — Moxie or Glory Hog (the proud lion)
};

/**
 * Per-type ability flavour, ordered best-fit-first. The [0] entry is a type's
 * "signature" passive (and becomes a derived species' canonical default); the
 * rest round out its pool. Mixes the classic type passives with our own riffs so
 * each type reads distinctly.
 */
const TYPE_ABILITIES: Record<PokemonType, AbilityId[]> = {
  normal: ['adaptability', 'scrappy', 'own-tempo'],
  fire: ['blaze', 'flash-fire', 'flame-body'],
  water: ['torrent', 'water-absorb', 'rough-skin'],
  electric: ['static', 'volt-absorb', 'motor-drive'],
  grass: ['overgrow', 'sap-sipper', 'regenerator'],
  ice: ['thick-fat', 'battle-armor', 'multiscale'],
  fighting: ['guts', 'justified', 'scrappy'],
  poison: ['poison-point', 'immunity', 'poison-heal'],
  ground: ['rough-skin', 'sturdy', 'sheer-force'],
  flying: ['intimidate', 'defiant', 'early-bird'],
  psychic: ['magic-guard', 'levitate', 'own-tempo'],
  bug: ['swarm', 'technician', 'tinted-lens'],
  rock: ['sturdy', 'solid-rock', 'battle-armor'],
  ghost: ['levitate', 'magic-guard', 'sniper'],
  dragon: ['marvel-scale', 'multiscale', 'sheer-force'],
  dark: ['moxie', 'intimidate', 'defiant'],
  steel: ['clear-body', 'heatproof', 'battle-armor'],
  fairy: ['magic-guard', 'clear-body', 'unaware'],
};

/** A stat-flavoured pool keyed to a species' single biggest base stat. The
 *  Physical/Energy split collapses back to "offence" (best of the two attacks)
 *  and "bulk" (best of the two defenses) so the flavour stays type-agnostic. */
function statFlavor(stats: BaseStats): AbilityId[] {
  const { hp, atk, eatk, def, edef, spd } = stats;
  const offense = Math.max(atk, eatk);
  const bulk = Math.max(def, edef);
  const max = Math.max(hp, offense, bulk, spd);
  if (offense === max) return ['moxie', 'sheer-force', 'guts'];
  if (spd === max) return ['speed-boost', 'quick-feet', 'sniper'];
  if (bulk === max) return ['stamina', 'battle-armor', 'sturdy'];
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

/**
 * The description to actually render. Players get the number-free `description`;
 * dev builds get the precise `devDescription` (where one exists) so tuning is
 * still inspectable. Callers pass `import.meta.env.DEV` for `dev` — kept as an
 * explicit arg so this module stays free of Vite-only globals (it's shared with
 * the server re-sim).
 */
export function abilityDescription(id: AbilityId, dev = false): string {
  const def = ABILITIES[id];
  return dev && def.devDescription ? def.devDescription : def.description;
}
