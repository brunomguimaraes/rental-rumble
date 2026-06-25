import type { AbilityId, BaseStats, Creature, DexEntry, PokemonType } from './types.js';
import type { RNG } from './rng.js';
import { RAW_DEX } from './pokedex.gen.js';
import { NEW_ABILITIES } from './abilities-new.js';
import { teamHasAbility as teamHasAbilityEffect } from './ability-effects.js';

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
    description: 'Loafs around every other turn, unable to act.',
  },
  'vital-spirit': {
    id: 'vital-spirit',
    name: 'Vital Spirit',
    description: 'Too wired to ever fall asleep.',
  },
  moxie: {
    id: 'moxie',
    name: 'Moxie',
    description: 'Each knockout it scores raises its Attack.',
  },
  'speed-boost': {
    id: 'speed-boost',
    name: 'Speed Boost',
    description: 'Its Speed rises a stage at the end of every turn.',
  },
  guts: {
    id: 'guts',
    name: 'Guts',
    description: 'Hits harder while burned, poisoned, or paralyzed.',
    devDescription: 'Hits 1.5\u00d7 harder while burned, poisoned, or paralyzed.',
  },
  adaptability: {
    id: 'adaptability',
    name: 'Adaptability',
    description: 'Its same-type attacks hit even harder.',
    devDescription: 'Its same-type attacks hit even harder (STAB doubled to 2\u00d7).',
  },
  intimidate: {
    id: 'intimidate',
    name: 'Intimidate',
    description: "On entry, it lowers the foe's Attack a stage.",
  },
  sturdy: {
    id: 'sturdy',
    name: 'Sturdy',
    description: 'If at full health, it survives a hit that would knock it out.',
    devDescription: 'If at full health, it survives a knockout hit with 1 HP.',
  },
  levitate: {
    id: 'levitate',
    name: 'Levitate',
    description: 'Ground-type moves do nothing to it.',
  },
  'thick-fat': {
    id: 'thick-fat',
    name: 'Thick Fat',
    description: 'Takes half damage from Fire and Ice moves.',
  },
  'marvel-scale': {
    id: 'marvel-scale',
    name: 'Marvel Scale',
    description: 'While afflicted by a status, its Defense rises by half.',
  },
  technician: {
    id: 'technician',
    name: 'Technician',
    description: 'Its weaker attacks hit harder.',
    devDescription: 'Any attack of 60 power or less hits 1.5\u00d7 harder.',
  },
  blaze: {
    id: 'blaze',
    name: 'Blaze',
    description: 'Below a third of its HP, its Fire moves hit harder.',
    devDescription: 'Below a third of its HP, its Fire moves hit at 1.5\u00d7 power.',
  },
  torrent: {
    id: 'torrent',
    name: 'Torrent',
    description: 'Below a third of its HP, its Water moves hit harder.',
    devDescription: 'Below a third of its HP, its Water moves hit at 1.5\u00d7 power.',
  },
  overgrow: {
    id: 'overgrow',
    name: 'Overgrow',
    description: 'Below a third of its HP, its Grass moves hit harder.',
    devDescription: 'Below a third of its HP, its Grass moves hit at 1.5\u00d7 power.',
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm',
    description: 'Below a third of its HP, its Bug moves hit harder.',
    devDescription: 'Below a third of its HP, its Bug moves hit at 1.5\u00d7 power.',
  },
  static: {
    id: 'static',
    name: 'Static',
    description: 'A foe that lands a hit may be paralyzed.',
  },
  'flame-body': {
    id: 'flame-body',
    name: 'Flame Body',
    description: 'A foe that lands a hit may be burned.',
  },
  'poison-point': {
    id: 'poison-point',
    name: 'Poison Point',
    description: 'A foe that lands a hit may be badly poisoned.',
  },
  regenerator: {
    id: 'regenerator',
    name: 'Regenerator',
    description: 'Recovers a little HP at the end of every turn.',
  },
  'rough-skin': {
    id: 'rough-skin',
    name: 'Rough Skin',
    description: 'A foe that lands a hit takes recoil damage.',
  },
  stamina: {
    id: 'stamina',
    name: 'Stamina',
    description: 'Its Defense rises a stage each time it is hit.',
  },
  multiscale: {
    id: 'multiscale',
    name: 'Multiscale',
    description: 'At full health, it takes half damage from the first hit.',
  },
  'solid-rock': {
    id: 'solid-rock',
    name: 'Solid Rock',
    description: 'Takes less damage from super-effective hits.',
    devDescription: 'Takes only 0.75\u00d7 from super-effective hits.',
  },
  'tinted-lens': {
    id: 'tinted-lens',
    name: 'Tinted Lens',
    description: 'Its not-very-effective moves deal double damage.',
  },
  'battle-armor': {
    id: 'battle-armor',
    name: 'Battle Armor',
    description: 'Can never be struck by a critical hit.',
  },
  'quick-feet': {
    id: 'quick-feet',
    name: 'Quick Feet',
    description: 'While afflicted by a status, its Speed rises by half and paralysis no longer slows it.',
  },
  'magic-guard': {
    id: 'magic-guard',
    name: 'Magic Guard',
    description: 'Only direct attacks can hurt it; burn and poison deal no chip damage.',
  },
  'poison-heal': {
    id: 'poison-heal',
    name: 'Poison Heal',
    description: 'While poisoned, it heals each turn instead of taking damage.',
  },
  'clear-body': {
    id: 'clear-body',
    name: 'Clear Body',
    description: 'The foe can never lower its stats.',
  },
  defiant: {
    id: 'defiant',
    name: 'Defiant',
    description: 'When the foe lowers one of its stats, its Attack rises two stages.',
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    description: 'Its critical hits strike even harder.',
    devDescription: 'Its critical hits strike for 2.25\u00d7 instead of 1.5\u00d7.',
  },
  'sheer-force': {
    id: 'sheer-force',
    name: 'Sheer Force',
    description: 'Hits harder, but its moves\u2019 added effects never trigger.',
    devDescription: 'Deals 30% more damage, but its moves\u2019 added effects never trigger.',
  },
  'shed-skin': {
    id: 'shed-skin',
    name: 'Shed Skin',
    description: 'Has about a one-in-three chance to cure its status each turn.',
  },
  'early-bird': {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Wakes from sleep twice as fast.',
  },
  scrappy: {
    id: 'scrappy',
    name: 'Scrappy',
    description: 'Its Normal and Fighting moves can hit Ghost-types.',
  },
  unaware: {
    id: 'unaware',
    name: 'Unaware',
    description: 'Ignores the foe\u2019s stat changes when attacking and defending.',
  },
  'water-absorb': {
    id: 'water-absorb',
    name: 'Water Absorb',
    description: 'Water moves do no damage and heal it instead.',
    devDescription: 'Water moves do no damage and heal it for about a quarter of its HP.',
  },
  'volt-absorb': {
    id: 'volt-absorb',
    name: 'Volt Absorb',
    description: 'Electric moves do no damage and heal it instead.',
    devDescription: 'Electric moves do no damage and heal it for about a quarter of its HP.',
  },
  'flash-fire': {
    id: 'flash-fire',
    name: 'Flash Fire',
    description: 'Fire moves do nothing to it; once hit by Fire, its own Fire moves hit harder.',
    devDescription:
      'Fire moves do nothing; once hit by Fire, its own Fire moves hit 1.5\u00d7 harder.',
  },
  'sap-sipper': {
    id: 'sap-sipper',
    name: 'Sap Sipper',
    description: 'Grass moves do no damage and raise its Attack a stage instead.',
  },
  'motor-drive': {
    id: 'motor-drive',
    name: 'Motor Drive',
    description: 'Electric moves do no damage and raise its Speed a stage instead.',
  },
  'dry-skin': {
    id: 'dry-skin',
    name: 'Dry Skin',
    description: 'Water moves heal it, but Fire moves hit harder.',
    devDescription: 'Water moves heal it, but Fire moves deal 1.25\u00d7 damage.',
  },
  heatproof: {
    id: 'heatproof',
    name: 'Heatproof',
    description: 'Takes half damage from Fire-type moves.',
  },
  immunity: {
    id: 'immunity',
    name: 'Immunity',
    description: 'Can never be poisoned.',
  },
  'water-veil': {
    id: 'water-veil',
    name: 'Water Veil',
    description: 'Can never be burned.',
  },
  limber: {
    id: 'limber',
    name: 'Limber',
    description: 'Can never be paralyzed.',
  },
  'own-tempo': {
    id: 'own-tempo',
    name: 'Own Tempo',
    description: 'Can never be confused.',
  },
  contrary: {
    id: 'contrary',
    name: 'Contrary',
    description: 'Stat drops raise its stats and boosts lower them.',
  },
  simple: {
    id: 'simple',
    name: 'Simple',
    description: 'Every stat change it takes is doubled.',
  },
  'anger-point': {
    id: 'anger-point',
    name: 'Anger Point',
    description: 'Taking a critical hit maxes out its Attack.',
  },
  justified: {
    id: 'justified',
    name: 'Justified',
    description: 'Being hit by a Dark move raises its Attack a stage.',
  },
  disguise: {
    id: 'disguise',
    name: 'Disguise',
    description: 'A costume shrugs off the first hit it takes.',
  },
  'hyper-cutter': {
    id: 'hyper-cutter',
    name: 'Hyper Cutter',
    description: 'The foe can never lower its Attack.',
  },
  'big-pecks': {
    id: 'big-pecks',
    name: 'Big Pecks',
    description: 'The foe can never lower its Defense.',
  },
  'inner-focus': {
    id: 'inner-focus',
    name: 'Inner Focus',
    description: 'It never flinches, and ignores Intimidate.',
  },
  steadfast: {
    id: 'steadfast',
    name: 'Steadfast',
    description: 'Its Speed rises a stage each time it flinches.',
  },
  hustle: {
    id: 'hustle',
    name: 'Hustle',
    description: 'Hits with more Attack, but its accuracy suffers.',
    devDescription: 'Hits with 1.5\u00d7 Attack, but its accuracy drops to 0.8\u00d7.',
  },
  defeatist: {
    id: 'defeatist',
    name: 'Defeatist',
    description: 'At half HP or less, its Attack is halved.',
  },
  'weak-armor': {
    id: 'weak-armor',
    name: 'Weak Armor',
    description: 'Each hit it takes lowers its Defense but raises its Speed.',
  },
  'anger-shell': {
    id: 'anger-shell',
    name: 'Anger Shell',
    description: 'Dropping below half HP lowers its Defense but raises its Attack and Speed.',
  },
  aftermath: {
    id: 'aftermath',
    name: 'Aftermath',
    description: 'If a direct hit knocks it out, the attacker loses HP too.',
    devDescription: 'If a direct hit knocks it out, the attacker loses a quarter of its HP.',
  },
  'liquid-ooze': {
    id: 'liquid-ooze',
    name: 'Liquid Ooze',
    description: 'Anything that drains its HP loses HP instead.',
  },
  overload: {
    id: 'overload',
    name: 'Overload',
    description: 'Its stat boosts are stronger, but burn and poison hurt it more.',
    devDescription: 'Its stat boosts are 25% stronger, but burn and poison deal 50% more.',
  },
  'glass-cannon': {
    id: 'glass-cannon',
    name: 'Glass Cannon',
    description: 'Deals more damage, but takes more from every hit.',
    devDescription: 'Deals 1.3\u00d7 damage, but takes 1.2\u00d7 from every hit.',
  },
  'last-stand': {
    id: 'last-stand',
    name: 'Last Stand',
    description: 'The lower its HP, the more damage it deals.',
    devDescription: 'As its HP empties, its damage climbs toward 1.5\u00d7.',
  },
  legacy: {
    id: 'legacy',
    name: 'Legacy',
    description: 'When it faints, the next ally enters with a boost to its best stat.',
    devDescription: 'When it faints, the next ally enters with +2 to its best stat.',
  },
  rally: {
    id: 'rally',
    name: 'Rally',
    description: 'When it faints, the next ally enters with raised Attack and Speed.',
    devDescription: 'When it faints, the next ally enters with +1 Attack and +1 Speed.',
  },
  'glory-hog': {
    id: 'glory-hog',
    name: 'Glory Hog',
    description: 'It fights above its stats, but drags the rest of its team below theirs.',
    devDescription: 'It fights at 1.15\u00d7 its stats, but drags the rest of its team to 0.9\u00d7.',
  },
  dragonlord: {
    id: 'dragonlord',
    name: 'Dragonlord',
    description: 'Commands the team\u2019s Dragons, strengthening every Dragon-type ally.',
    devDescription:
      'Every Dragon-type teammate fights at 1.1\u00d7 its Attack, Defense and Speed.',
  },
  pickup: {
    id: 'pickup',
    name: 'Pickup',
    description: 'While it\u2019s on the team, item events lean toward rarer relics.',
    devDescription:
      'While it\u2019s on the team, rare relics weigh 1.5\u00d7 and legendary relics weigh 2\u00d7 in item events.',
  },
  ...Object.fromEntries(
    Object.entries(NEW_ABILITIES).map(([k, v]) => [k, { ...v, id: k as AbilityId }]),
  ),
} as Record<AbilityId, AbilityDef>;

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
  198: ['moxie', 'inner-focus'], // Murkrow — Moxie or Inner Focus
  214: ['guts', 'moxie', 'swarm'], // Heracross — Guts, Moxie or Swarm
  262: ['intimidate', 'moxie'], // Mightyena — Intimidate or Moxie
  373: ['intimidate', 'moxie'], // Salamence — Intimidate or Moxie
  430: ['moxie', 'inner-focus'], // Honchkrow — Moxie or Inner Focus
  551: ['moxie', 'intimidate'], // Sandile — Moxie or Intimidate
  552: ['moxie', 'intimidate'], // Krokorok — Moxie or Intimidate
  553: ['moxie', 'intimidate', 'anger-point'], // Krookodile — Moxie, Intimidate or Anger Point
  559: ['moxie', 'intimidate', 'shed-skin'], // Scraggy — Moxie, Intimidate or Shed Skin
  560: ['moxie', 'intimidate', 'shed-skin'], // Scrafty — Moxie, Intimidate or Shed Skin

  // --- Speed Boost: fast, frail accelerators -----------------------------
  193: ['speed-boost', 'tinted-lens'], // Yanma — Speed Boost or Tinted Lens
  255: ['speed-boost', 'blaze'], // Torchic — Speed Boost or Blaze
  256: ['speed-boost', 'blaze'], // Combusken — Speed Boost or Blaze
  257: ['speed-boost', 'blaze'], // Blaziken — Speed Boost or Blaze
  291: ['speed-boost', 'technician'], // Ninjask — Speed Boost or Technician
  318: ['guts', 'speed-boost', 'rough-skin'], // Carvanha — Guts, Speed Boost or Rough Skin
  319: ['guts', 'speed-boost', 'rough-skin'], // Sharpedo — Guts, Speed Boost or Rough Skin
  469: ['speed-boost', 'tinted-lens'], // Yanmega — Speed Boost or Tinted Lens

  // --- Guts: status-loving brawlers --------------------------------------
  66: ['guts', 'steadfast'], // Machop — Guts or Steadfast
  67: ['guts', 'steadfast'], // Machoke — Guts or Steadfast
  68: ['guts', 'steadfast', 'sheer-force'], // Machamp — Guts, Steadfast or Sheer Force
  136: ['flash-fire', 'guts'], // Flareon — Flash Fire or Guts
  217: ['guts', 'quick-feet'], // Ursaring — Guts or Quick Feet
  901: ['guts', 'quick-feet'], // Ursaluna — Guts or Quick Feet
  276: ['guts', 'scrappy'], // Taillow — Guts or Scrappy
  277: ['guts', 'scrappy'], // Swellow — Guts or Scrappy
  296: ['guts', 'thick-fat'], // Makuhita — Guts or Thick Fat
  297: ['guts', 'thick-fat', 'sheer-force'], // Hariyama — Guts, Thick Fat or Sheer Force
  532: ['guts', 'sheer-force'], // Timburr — Guts or Sheer Force
  533: ['guts', 'sheer-force'], // Gurdurr — Guts or Sheer Force
  534: ['guts', 'sheer-force'], // Conkeldurr — Guts or Sheer Force

  // --- Adaptability: doubled-STAB nukes ----------------------------------
  341: ['adaptability', 'anger-shell'], // Corphish — Adaptability or Anger Shell
  342: ['adaptability', 'anger-shell'], // Crawdaunt — Adaptability or Anger Shell
  474: ['adaptability', 'overload'], // Porygon-Z — Adaptability or Overload (overclocked)
  550: ['adaptability', 'moxie'], // Basculin — Adaptability or Moxie (relentlessly aggressive)
  902: ['adaptability', 'moxie'], // Basculegion (keeps Basculin's pool on evolution)
  690: ['adaptability', 'poison-point'], // Skrelp — Adaptability or Poison Point
  691: ['adaptability', 'poison-point'], // Dragalge — Adaptability or Poison Point

  // --- Intimidate: entry-control bruisers ---------------------------------
  58: ['intimidate', 'flash-fire'], // Growlithe — Intimidate or Flash Fire
  59: ['intimidate', 'flash-fire'], // Arcanine — Intimidate or Flash Fire
  128: ['intimidate', 'anger-point'], // Tauros — Intimidate or Anger Point
  130: ['intimidate', 'moxie'], // Gyarados — Intimidate or Moxie
  303: ['intimidate', 'hyper-cutter'], // Mawile — Intimidate or Hyper Cutter
  398: ['intimidate', 'defiant'], // Staraptor — Intimidate or Defiant
  405: ['intimidate', 'static'], // Luxray — Intimidate or Static

  // --- Sturdy: refuses to go down in one hit ------------------------------
  74: ['sturdy', 'solid-rock'], // Geodude — Sturdy or Solid Rock
  75: ['sturdy', 'solid-rock'], // Graveler — Sturdy or Solid Rock
  76: ['sturdy', 'solid-rock'], // Golem — Sturdy or Solid Rock
  95: ['sturdy', 'weak-armor'], // Onix — Sturdy or Weak Armor
  185: ['sturdy', 'solid-rock'], // Sudowoodo — Sturdy or Solid Rock
  208: ['sturdy', 'sheer-force'], // Steelix — Sturdy or Sheer Force
  213: ['sturdy', 'contrary'], // Shuckle — Sturdy or Contrary
  299: ['sturdy', 'solid-rock'], // Nosepass — Sturdy or Solid Rock
  476: ['sturdy', 'solid-rock'], // Probopass — Sturdy or Solid Rock
  524: ['sturdy', 'solid-rock'], // Roggenrola — Sturdy or Solid Rock
  525: ['sturdy', 'solid-rock'], // Boldore — Sturdy or Solid Rock
  526: ['sturdy', 'solid-rock'], // Gigalith — Sturdy or Solid Rock

  // --- Levitate: immune to Ground moves -----------------------------------
  92: ['levitate', 'liquid-ooze'], // Gastly — Levitate or Liquid Ooze (a body of poison gas)
  93: ['levitate', 'liquid-ooze'], // Haunter — Levitate or Liquid Ooze
  94: ['levitate', 'liquid-ooze'], // Gengar — Levitate or Liquid Ooze
  109: ['levitate', 'liquid-ooze'], // Koffing — Levitate or Liquid Ooze
  110: ['levitate', 'liquid-ooze'], // Weezing — Levitate or Liquid Ooze
  200: ['levitate', 'magic-guard'], // Misdreavus — Levitate or Magic Guard
  201: ['levitate'], // Unown (a cipher — kept deliberately minimal)
  329: ['levitate', 'sheer-force'], // Vibrava — Levitate or Sheer Force
  330: ['levitate', 'sheer-force'], // Flygon — Levitate or Sheer Force
  343: ['levitate', 'sturdy'], // Baltoy — Levitate or Sturdy (ancient clay)
  344: ['levitate', 'sturdy'], // Claydol — Levitate or Sturdy
  429: ['levitate', 'magic-guard'], // Mismagius — Levitate or Magic Guard
  436: ['levitate', 'heatproof'], // Bronzor — Levitate or Heatproof
  437: ['levitate', 'heatproof'], // Bronzong — Levitate or Heatproof
  602: ['levitate', 'volt-absorb'], // Tynamo — Levitate or Volt Absorb
  603: ['levitate', 'volt-absorb'], // Eelektrik — Levitate or Volt Absorb
  604: ['levitate', 'volt-absorb'], // Eelektross — Levitate or Volt Absorb

  // --- Thick Fat: shrugs off Fire & Ice -----------------------------------
  143: ['thick-fat', 'immunity'], // Snorlax — Thick Fat or Immunity
  446: ['thick-fat', 'immunity'], // Munchlax — Thick Fat or Immunity
  220: ['thick-fat', 'sturdy'], // Swinub — Thick Fat or Sturdy
  221: ['thick-fat', 'sturdy'], // Piloswine — Thick Fat or Sturdy
  473: ['thick-fat', 'sturdy'], // Mamoswine — Thick Fat or Sturdy
  363: ['thick-fat', 'water-absorb'], // Spheal — Thick Fat or Water Absorb
  364: ['thick-fat', 'water-absorb'], // Sealeo — Thick Fat or Water Absorb
  365: ['thick-fat', 'water-absorb'], // Walrein — Thick Fat or Water Absorb

  // --- Marvel Scale: status hardens its hide ------------------------------
  147: ['marvel-scale', 'shed-skin'], // Dratini — Marvel Scale or Shed Skin
  148: ['marvel-scale', 'shed-skin'], // Dragonair — Marvel Scale or Shed Skin
  149: ['marvel-scale', 'multiscale'], // Dragonite — Marvel Scale or Multiscale
  350: ['marvel-scale', 'water-veil'], // Milotic — Marvel Scale or Water Veil

  // --- Pickup: scavenges rarer relics at item events ----------------------
  52: ['pickup', 'technician'], // Meowth — Pickup or Technician

  // --- Technician: weak moves punch above their weight --------------------
  53: ['technician', 'limber', 'pickup'], // Persian — Technician, Limber or Pickup
  107: ['technician', 'inner-focus'], // Hitmonchan — Technician or Inner Focus
  212: ['swarm', 'technician'], // Scizor — Swarm or Technician
  215: ['technician', 'inner-focus'], // Sneasel — Technician or Inner Focus
  461: ['technician', 'inner-focus'], // Weavile — Technician or Inner Focus
  903: ['technician', 'poison-point'], // Sneasler — Technician or Poison Point

  // --- Blaze: Fire starters' pinch boost ----------------------------------
  4: ['blaze'], // Charmander
  5: ['blaze'], // Charmeleon
  6: ['blaze', 'dragonlord'], // Charizard — Blaze or Dragonlord (a fire lizard that rallies true dragons)
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
  13: ['swarm', 'poison-point'], // Weedle — Swarm or Poison Point
  14: ['swarm', 'shed-skin'], // Kakuna — Swarm or Shed Skin
  15: ['swarm', 'poison-point'], // Beedrill — Swarm or Poison Point
  165: ['swarm', 'early-bird'], // Ledyba — Swarm or Early Bird
  166: ['swarm', 'early-bird'], // Ledian — Swarm or Early Bird
  167: ['swarm', 'sniper'], // Spinarak — Swarm or Sniper
  168: ['swarm', 'sniper'], // Ariados — Swarm or Sniper
  267: ['swarm', 'tinted-lens'], // Beautifly — Swarm or Tinted Lens
  540: ['swarm', 'overgrow'], // Sewaddle — Swarm or Overgrow
  541: ['swarm', 'overgrow'], // Swadloon — Swarm or Overgrow
  542: ['swarm', 'overgrow'], // Leavanny — Swarm or Overgrow

  // --- Static: paralyzes a careless attacker ------------------------------
  25: ['static', 'motor-drive'], // Pikachu — Static or Motor Drive
  26: ['static', 'motor-drive'], // Raichu — Static or Motor Drive
  172: ['static', 'motor-drive'], // Pichu — Static or Motor Drive
  125: ['static', 'vital-spirit'], // Electabuzz — Static or Vital Spirit
  239: ['static', 'vital-spirit'], // Elekid — Static or Vital Spirit
  466: ['motor-drive', 'static'], // Electivire — Motor Drive or Static
  309: ['static', 'quick-feet'], // Electrike — Static or Quick Feet
  310: ['static', 'intimidate'], // Manectric — Static or Intimidate
  587: ['static', 'motor-drive'], // Emolga — Static or Motor Drive

  // --- Flame Body: burns a careless attacker ------------------------------
  126: ['flame-body', 'vital-spirit'], // Magmar — Flame Body or Vital Spirit
  240: ['flame-body', 'vital-spirit'], // Magby — Flame Body or Vital Spirit
  467: ['flame-body', 'vital-spirit'], // Magmortar — Flame Body or Vital Spirit
  218: ['flame-body', 'flash-fire'], // Slugma — Flame Body or Flash Fire
  219: ['flame-body', 'weak-armor'], // Magcargo — Flame Body or Weak Armor
  636: ['flame-body', 'swarm'], // Larvesta — Flame Body or Swarm
  637: ['flame-body', 'swarm'], // Volcarona — Flame Body or Swarm

  // --- Poison Point: poisons a careless attacker --------------------------
  29: ['poison-point', 'sheer-force'], // Nidoran♀ — Poison Point or Sheer Force
  30: ['poison-point', 'sheer-force'], // Nidorina — Poison Point or Sheer Force
  31: ['poison-point', 'sheer-force'], // Nidoqueen — Poison Point or Sheer Force
  32: ['poison-point', 'sheer-force'], // Nidoran♂ — Poison Point or Sheer Force
  33: ['poison-point', 'sheer-force'], // Nidorino — Poison Point or Sheer Force
  34: ['poison-point', 'sheer-force'], // Nidoking — Poison Point or Sheer Force
  211: ['poison-point', 'intimidate'], // Qwilfish — Poison Point or Intimidate
  904: ['poison-point', 'intimidate'], // Overqwil (keeps Qwilfish's pool on evolution)
  315: ['poison-point', 'overgrow'], // Roselia — Poison Point or Overgrow
  406: ['poison-point', 'overgrow'], // Budew — Poison Point or Overgrow
  407: ['poison-point', 'overgrow'], // Roserade — Poison Point or Overgrow

  // --- Regenerator: slow self-mending attrition ---------------------------
  79: ['regenerator', 'own-tempo'], // Slowpoke — Regenerator or Own Tempo
  80: ['regenerator', 'own-tempo'], // Slowbro — Regenerator or Own Tempo
  199: ['regenerator', 'own-tempo'], // Slowking — Regenerator or Own Tempo
  114: ['regenerator', 'overgrow'], // Tangela — Regenerator or Overgrow
  465: ['regenerator', 'overgrow'], // Tangrowth — Regenerator or Overgrow
  619: ['regenerator', 'quick-feet'], // Mienfoo — Regenerator or Quick Feet
  620: ['regenerator', 'quick-feet'], // Mienshao — Regenerator or Quick Feet
  222: ['regenerator', 'sturdy'], // Corsola — Regenerator or Sturdy

  // --- Rough Skin: punishes a careless attacker ---------------------------
  28: ['sturdy', 'rough-skin'], // Sandslash — Sturdy or Rough Skin
  443: ['rough-skin', 'sturdy'], // Gible — Rough Skin or Sturdy
  444: ['rough-skin', 'sturdy'], // Gabite — Rough Skin or Sturdy
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
  12: ['tinted-lens', 'swarm'], // Butterfree — Tinted Lens or Swarm
  49: ['tinted-lens', 'poison-point'], // Venomoth — Tinted Lens or Poison Point

  // --- Battle Armor: seals out critical hits ------------------------------
  140: ['battle-armor', 'sturdy'], // Kabuto — Battle Armor or Sturdy
  141: ['battle-armor', 'sniper'], // Kabutops — Battle Armor or Sniper
  347: ['battle-armor', 'swarm'], // Anorith — Battle Armor or Swarm
  348: ['battle-armor', 'sturdy'], // Armaldo — Battle Armor or Sturdy
  104: ['legacy', 'battle-armor'], // Cubone — Legacy (its mother's memory) or Battle Armor
  105: ['legacy', 'battle-armor'], // Marowak — Legacy or Battle Armor

  // --- Quick Feet: status fuels its Speed ---------------------------------
  263: ['quick-feet', 'guts'], // Zigzagoon — Quick Feet or Guts
  264: ['quick-feet', 'guts'], // Linoone — Quick Feet or Guts

  // --- Magic Guard: shrugs off chip damage --------------------------------
  35: ['magic-guard', 'unaware'], // Clefairy — Magic Guard or Unaware
  36: ['magic-guard', 'unaware'], // Clefable — Magic Guard or Unaware
  173: ['magic-guard', 'unaware'], // Cleffa — Magic Guard or Unaware
  561: ['magic-guard', 'levitate'], // Sigilyph — Magic Guard or Levitate

  // --- Poison Heal: thrives while poisoned --------------------------------
  286: ['poison-heal', 'technician'], // Breloom — Poison Heal or Technician
  472: ['poison-heal', 'intimidate'], // Gliscor — Poison Heal or Intimidate

  // --- Clear Body: unshakeable, immune to stat drops ----------------------
  72: ['clear-body', 'liquid-ooze'], // Tentacool — Clear Body or Liquid Ooze
  73: ['clear-body', 'poison-point', 'liquid-ooze'], // Tentacruel — Clear Body, Poison Point or Liquid Ooze
  374: ['clear-body', 'heatproof'], // Beldum — Clear Body or Heatproof
  375: ['clear-body', 'heatproof'], // Metang — Clear Body or Heatproof
  376: ['clear-body', 'heatproof'], // Metagross — Clear Body or Heatproof

  // --- Defiant: an enemy debuff spikes its Attack -------------------------
  509: ['defiant', 'limber'], // Purrloin — Defiant or Limber
  510: ['defiant', 'glory-hog'], // Liepard — Defiant or Glory Hog (a treacherous diva)
  624: ['defiant', 'inner-focus'], // Pawniard — Defiant or Inner Focus
  625: ['defiant', 'inner-focus'], // Bisharp — Defiant or Inner Focus
  627: ['defiant', 'sturdy'], // Rufflet — Defiant or Sturdy
  628: ['defiant', 'sturdy'], // Braviary — Defiant or Sturdy

  // --- Water Absorb: soaks up Water and heals --------------------------------
  134: ['water-absorb', 'water-veil'], // Vaporeon — Water Absorb or Water Veil
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
  170: ['volt-absorb', 'water-absorb'], // Chinchou — Volt Absorb or Water Absorb
  171: ['volt-absorb', 'water-absorb'], // Lanturn — Volt Absorb or Water Absorb
  311: ['volt-absorb', 'rally'], // Plusle — Volt Absorb or Rally (a cheering partner)
  312: ['volt-absorb', 'rally'], // Minun — Volt Absorb or Rally (a cheering partner)
  522: ['motor-drive', 'static'], // Blitzle — Motor Drive or Static
  523: ['motor-drive', 'static'], // Zebstrika — Motor Drive or Static

  // --- Flash Fire: doused in flame, it only burns hotter ---------------------
  37: ['flash-fire', 'magic-guard'], // Vulpix — Flash Fire or Magic Guard (a mystic fox)
  38: ['flash-fire', 'magic-guard'], // Ninetales — Flash Fire or Magic Guard
  77: ['flash-fire', 'flame-body'], // Ponyta — Flash Fire or Flame Body
  78: ['flash-fire', 'flame-body'], // Rapidash — Flash Fire or Flame Body
  228: ['flash-fire', 'early-bird'], // Houndour — Flash Fire or Early Bird
  229: ['flash-fire', 'early-bird'], // Houndoom — Flash Fire or Early Bird
  607: ['flash-fire', 'levitate'], // Litwick — Flash Fire or Levitate
  608: ['flash-fire', 'levitate'], // Lampent — Flash Fire or Levitate
  609: ['flash-fire', 'levitate'], // Chandelure — Flash Fire or Levitate

  // --- Sap Sipper: grazes on Grass attacks for an Attack boost ---------------
  184: ['sap-sipper', 'thick-fat'], // Azumarill — Sap Sipper or Thick Fat
  241: ['sap-sipper', 'thick-fat'], // Miltank — Sap Sipper or Thick Fat
  585: ['sap-sipper', 'overgrow'], // Deerling — Sap Sipper or Overgrow
  586: ['sap-sipper', 'overgrow'], // Sawsbuck — Sap Sipper or Overgrow
  626: ['sap-sipper', 'guts'], // Bouffalant — Sap Sipper or Guts
  672: ['sap-sipper', 'overgrow'], // Skiddo — Sap Sipper or Overgrow
  673: ['sap-sipper', 'overgrow'], // Gogoat — Sap Sipper or Overgrow

  // --- Dry Skin: Water mends it, Fire sears it -------------------------------
  46: ['dry-skin', 'poison-point'], // Paras — Dry Skin or Poison Point
  47: ['dry-skin', 'poison-point'], // Parasect — Dry Skin or Poison Point
  453: ['dry-skin', 'poison-point'], // Croagunk — Dry Skin or Poison Point
  454: ['dry-skin', 'poison-point'], // Toxicroak — Dry Skin or Poison Point

  // --- Immunity: a clean constitution, never poisoned ------------------------
  335: ['immunity', 'quick-feet'], // Zangoose — Immunity or Quick Feet

  // --- Water Veil: a moist sheen, never burned -------------------------------
  118: ['water-veil', 'sniper'], // Goldeen — Water Veil or Sniper (its horn)
  119: ['water-veil', 'sniper'], // Seaking — Water Veil or Sniper
  320: ['water-veil', 'thick-fat'], // Wailmer — Water Veil or Thick Fat
  321: ['water-veil', 'thick-fat'], // Wailord — Water Veil or Thick Fat

  // --- Limber: too supple to be paralyzed ------------------------------------
  106: ['limber', 'steadfast'], // Hitmonlee — Limber or Steadfast
  132: ['limber'], // Ditto (a transforming blob — kept singular)

  // --- Own Tempo: marches to its own beat, never confused --------------------
  108: ['own-tempo', 'thick-fat'], // Lickitung — Own Tempo or Thick Fat
  463: ['own-tempo', 'thick-fat'], // Lickilicky — Own Tempo or Thick Fat
  235: ['own-tempo', 'technician'], // Smeargle — Own Tempo or Technician
  327: ['own-tempo', 'contrary'], // Spinda — Own Tempo or Contrary

  // --- Contrary: the foe's debuffs only feed it ------------------------------
  686: ['contrary', 'own-tempo'], // Inkay — Contrary or Own Tempo
  687: ['contrary', 'own-tempo'], // Malamar — Contrary or Own Tempo

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
  90: ['battle-armor', 'sturdy'], // Shellder — Battle Armor or Sturdy
  91: ['battle-armor', 'sturdy'], // Cloyster — Battle Armor or Sturdy

  // --- Hyper Cutter: proud blades the foe can't blunt ------------------------
  127: ['hyper-cutter', 'moxie'], // Pinsir — Hyper Cutter or Moxie
  207: ['hyper-cutter', 'immunity'], // Gligar — Hyper Cutter or Immunity
  328: ['hyper-cutter', 'sheer-force'], // Trapinch — Hyper Cutter or Sheer Force

  // --- Big Pecks: a puffed-out chest guards its Defense ----------------------
  16: ['big-pecks', 'early-bird'], // Pidgey — Big Pecks or Early Bird
  17: ['big-pecks', 'early-bird'], // Pidgeotto — Big Pecks or Early Bird
  18: ['big-pecks', 'early-bird'], // Pidgeot — Big Pecks or Early Bird
  580: ['big-pecks', 'water-absorb'], // Ducklett — Big Pecks or Water Absorb
  581: ['big-pecks', 'water-absorb'], // Swanna — Big Pecks or Water Absorb
  661: ['big-pecks', 'early-bird'], // Fletchling — Big Pecks or Early Bird

  // --- Inner Focus: unshakeable, never flinches, ignores Intimidate ----------
  41: ['inner-focus', 'quick-feet'], // Zubat — Inner Focus or Quick Feet
  42: ['inner-focus', 'quick-feet'], // Golbat — Inner Focus or Quick Feet
  169: ['inner-focus', 'quick-feet'], // Crobat — Inner Focus or Quick Feet
  447: ['inner-focus', 'steadfast'], // Riolu — Inner Focus or Steadfast

  // --- Steadfast: every flinch only quickens its resolve ---------------------
  123: ['technician', 'steadfast'], // Scyther — Technician or Steadfast
  359: ['sniper', 'steadfast'], // Absol — Sniper or Steadfast

  // --- Hustle: raw power bought with shakier aim -----------------------------
  554: ['hustle', 'sheer-force'], // Darumaka — Hustle or Sheer Force
  555: ['hustle', 'sheer-force'], // Darmanitan — Hustle or Sheer Force
  632: ['hustle', 'swarm'], // Durant — Hustle or Swarm
  633: ['hustle', 'sheer-force'], // Deino — Hustle or Sheer Force
  634: ['hustle', 'sheer-force'], // Zweilous — Hustle or Sheer Force
  635: ['levitate', 'sheer-force'], // Hydreigon — Levitate or Sheer Force

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
  434: ['aftermath', 'poison-point'], // Stunky — Aftermath or Poison Point
  435: ['aftermath', 'poison-point'], // Skuntank — Aftermath or Poison Point
  425: ['aftermath', 'levitate'], // Drifloon — Aftermath or Levitate
  426: ['aftermath', 'levitate'], // Drifblim — Aftermath or Levitate

  // --- Liquid Ooze: drainers choke on its toxic fluids -----------------------
  316: ['liquid-ooze', 'thick-fat'], // Gulpin — Liquid Ooze or Thick Fat
  317: ['liquid-ooze', 'thick-fat'], // Swalot — Liquid Ooze or Thick Fat

  // --- Overload: runs hot — bigger boosts, but burn/poison bite harder -------
  64: ['magic-guard', 'overload'], // Kadabra — Magic Guard or Overload
  65: ['magic-guard', 'overload'], // Alakazam — Magic Guard or Overload
  181: ['static', 'overload'], // Ampharos — Static or Overload

  // --- Glass Cannon: all offence, paper-thin guard ---------------------------
  142: ['glass-cannon', 'sniper'], // Aerodactyl — Glass Cannon or Sniper
  408: ['glass-cannon', 'sheer-force'], // Cranidos — Glass Cannon or Sheer Force
  409: ['glass-cannon', 'sheer-force'], // Rampardos — Glass Cannon or Sheer Force

  // --- Last Stand: it fights hardest with its back to the wall ----------------
  83: ['last-stand', 'inner-focus'], // Farfetch'd — Last Stand or Inner Focus
  538: ['guts', 'last-stand'], // Throh — Guts or Last Stand
  539: ['inner-focus', 'last-stand'], // Sawk — Inner Focus or Last Stand

  // --- Legacy: a fallen mon passes its strength to its successor --------------
  355: ['levitate', 'legacy'], // Duskull — Levitate or Legacy (a lingering spirit)
  356: ['levitate', 'legacy'], // Dusclops — Levitate or Legacy
  477: ['levitate', 'legacy'], // Dusknoir — Levitate or Legacy

  // --- Rally: a supportive heart fires up the next ally in --------------------
  113: ['rally', 'regenerator'], // Chansey — Rally or Regenerator
  242: ['rally', 'regenerator'], // Blissey — Rally or Regenerator
  531: ['regenerator', 'rally'], // Audino — Regenerator or Rally

  // --- Glory Hog: a selfish star that hogs the team's strength ----------------
  431: ['glory-hog', 'limber'], // Glameow — Glory Hog or Limber
  432: ['glory-hog', 'thick-fat'], // Purugly — Glory Hog or Thick Fat
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

/** Whether any team member carries a given ability (run-wide or battle roster). */
export function teamHasAbility(
  team: readonly { ability?: AbilityId }[],
  id: AbilityId,
): boolean {
  return teamHasAbilityEffect(team as readonly Creature[], id);
}
