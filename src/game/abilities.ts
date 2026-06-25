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
  198: ['moxie', 'inner-focus', 'super-luck'], // Murkrow — Moxie, Inner Focus or Super Luck
  214: ['guts', 'moxie', 'swarm'], // Heracross — Guts, Moxie or Swarm
  262: ['intimidate', 'moxie', 'menace', 'shadow-rush'], // Mightyena — Intimidate, Moxie, Menace or Shadow Rush
  373: ['intimidate', 'moxie'], // Salamence — Intimidate or Moxie
  430: ['moxie', 'inner-focus', 'super-luck'], // Honchkrow — Moxie, Inner Focus or Super Luck
  551: ['moxie', 'intimidate'], // Sandile — Moxie or Intimidate
  552: ['moxie', 'intimidate'], // Krokorok — Moxie or Intimidate
  553: ['moxie', 'intimidate', 'anger-point', 'shadow-cabinet', 'menace'], // Krookodile — Moxie, Intimidate, Anger Point, Shadow Cabinet or Menace
  559: ['moxie', 'intimidate', 'shed-skin'], // Scraggy — Moxie, Intimidate or Shed Skin
  560: ['moxie', 'intimidate', 'shed-skin'], // Scrafty — Moxie, Intimidate or Shed Skin

  // --- Speed Boost: fast, frail accelerators -----------------------------
  193: ['speed-boost', 'tinted-lens'], // Yanma — Speed Boost or Tinted Lens
  255: ['speed-boost', 'blaze'], // Torchic — Speed Boost or Blaze
  256: ['speed-boost', 'blaze'], // Combusken — Speed Boost or Blaze
  257: ['speed-boost', 'blaze'], // Blaziken — Speed Boost or Blaze
  291: ['speed-boost', 'technician'], // Ninjask — Speed Boost or Technician
  318: ['guts', 'speed-boost', 'rough-skin'], // Carvanha — Guts, Speed Boost or Rough Skin
  319: ['guts', 'speed-boost', 'rough-skin', 'predator'], // Sharpedo — Guts, Speed Boost, Rough Skin or Predator
  469: ['speed-boost', 'tinted-lens'], // Yanmega — Speed Boost or Tinted Lens

  // --- Guts: status-loving brawlers --------------------------------------
  66: ['guts', 'steadfast'], // Machop — Guts or Steadfast
  67: ['guts', 'steadfast'], // Machoke — Guts or Steadfast
  68: ['guts', 'steadfast', 'sheer-force', 'pack-alpha', 'veteran', 'no-guard'], // Machamp — Guts, Steadfast, Sheer Force, Pack Alpha, Veteran or No Guard
  136: ['flash-fire', 'guts', 'flare-boost'], // Flareon — Flash Fire, Guts or Flare Boost
  217: ['guts', 'quick-feet'], // Ursaring — Guts or Quick Feet
  901: ['guts', 'quick-feet'], // Ursaluna — Guts or Quick Feet
  276: ['guts', 'scrappy'], // Taillow — Guts or Scrappy
  277: ['guts', 'scrappy'], // Swellow — Guts or Scrappy
  296: ['guts', 'thick-fat'], // Makuhita — Guts or Thick Fat
  297: ['guts', 'thick-fat', 'sheer-force', 'pack-alpha', 'rebel-spirit'], // Hariyama — Guts, Thick Fat, Sheer Force, Pack Alpha or Rebel Spirit
  532: ['guts', 'sheer-force'], // Timburr — Guts or Sheer Force
  533: ['guts', 'sheer-force'], // Gurdurr — Guts or Sheer Force
  534: ['guts', 'sheer-force', 'pack-alpha'], // Conkeldurr — Guts, Sheer Force or Pack Alpha

  // --- Adaptability: doubled-STAB nukes ----------------------------------
  341: ['adaptability', 'anger-shell'], // Corphish — Adaptability or Anger Shell
  342: ['adaptability', 'anger-shell'], // Crawdaunt — Adaptability or Anger Shell
  474: ['adaptability', 'overload', 'download', 'showboat'], // Porygon-Z — Adaptability, Overload, Download or Showboat
  550: ['adaptability', 'moxie'], // Basculin — Adaptability or Moxie (relentlessly aggressive)
  902: ['adaptability', 'moxie'], // Basculegion (keeps Basculin's pool on evolution)
  690: ['adaptability', 'poison-point'], // Skrelp — Adaptability or Poison Point
  691: ['adaptability', 'poison-point'], // Dragalge — Adaptability or Poison Point

  // --- Intimidate: entry-control bruisers ---------------------------------
  58: ['intimidate', 'flash-fire'], // Growlithe — Intimidate or Flash Fire
  59: ['intimidate', 'flash-fire', 'flame-emperor', 'second-wind'], // Arcanine — Intimidate, Flash Fire, Flame Emperor or Second Wind
  128: ['intimidate', 'anger-point', 'opening-act'], // Tauros — Intimidate, Anger Point or Opening Act
  130: ['intimidate', 'moxie', 'predator', 'daunt', 'menace'], // Gyarados — Intimidate, Moxie, Predator, Daunt or Menace
  303: ['intimidate', 'hyper-cutter'], // Mawile — Intimidate or Hyper Cutter
  398: ['intimidate', 'defiant', 'sky-lord', 'opening-act', 'reckless'], // Staraptor — Intimidate, Defiant, Sky Lord, Opening Act or Reckless
  405: ['intimidate', 'static', 'volt-squad'], // Luxray — Intimidate, Static or Volt Squad

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
  94: ['levitate', 'liquid-ooze', 'eerie-aura', 'cursed-body', 'opportunist'], // Gengar — Levitate, Liquid Ooze, Eerie Aura, Cursed Body or Opportunist
  109: ['levitate', 'liquid-ooze'], // Koffing — Levitate or Liquid Ooze
  110: ['levitate', 'liquid-ooze'], // Weezing — Levitate or Liquid Ooze
  200: ['levitate', 'magic-guard', 'eerie-aura'], // Misdreavus — Levitate, Magic Guard or Eerie Aura
  201: ['levitate'], // Unown (a cipher — kept deliberately minimal)
  329: ['levitate', 'sheer-force'], // Vibrava — Levitate or Sheer Force
  330: ['levitate', 'sheer-force', 'sand-rush'], // Flygon — Levitate, Sheer Force or Sand Rush
  343: ['levitate', 'sturdy'], // Baltoy — Levitate or Sturdy (ancient clay)
  344: ['levitate', 'sturdy'], // Claydol — Levitate or Sturdy
  429: ['levitate', 'magic-guard', 'eerie-aura'], // Mismagius — Levitate, Magic Guard or Eerie Aura
  436: ['levitate', 'heatproof'], // Bronzor — Levitate or Heatproof
  437: ['levitate', 'heatproof', 'gravity'], // Bronzong — Levitate, Heatproof or Gravity
  602: ['levitate', 'volt-absorb'], // Tynamo — Levitate or Volt Absorb
  603: ['levitate', 'volt-absorb'], // Eelektrik — Levitate or Volt Absorb
  604: ['levitate', 'volt-absorb', 'volt-squad'], // Eelektross — Levitate, Volt Absorb or Volt Squad

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
  350: ['marvel-scale', 'water-veil', 'tide-matriarch'], // Milotic — Marvel Scale, Water Veil or Tide Matriarch

  // --- Pickup: scavenges rarer relics at item events ----------------------
  52: ['pickup', 'technician', 'fortune'], // Meowth — Pickup, Technician or Fortune

  // --- Technician: weak moves punch above their weight --------------------
  53: ['technician', 'limber', 'pickup', 'fortune', 'fur-coat'], // Persian — Technician, Limber, Pickup, Fortune or Fur Coat
  107: ['technician', 'inner-focus'], // Hitmonchan — Technician or Inner Focus
  212: ['swarm', 'technician', 'steel-heart', 'iron-barbs'], // Scizor — Swarm, Technician, Steel Heart or Iron Barbs
  215: ['technician', 'inner-focus', 'finisher'], // Sneasel — Technician, Inner Focus or Finisher
  461: ['technician', 'inner-focus', 'shadow-cabinet', 'shadow-rush', 'finisher'], // Weavile — Technician, Inner Focus, Shadow Cabinet, Shadow Rush or Finisher
  903: ['technician', 'poison-point'], // Sneasler — Technician or Poison Point

  // --- Blaze: Fire starters' pinch boost ----------------------------------
  4: ['blaze'], // Charmander
  5: ['blaze'], // Charmeleon
  6: ['blaze', 'dragonlord', 'flame-emperor', 'flare-boost'], // Charizard — Blaze, Dragonlord, Flame Emperor or Flare Boost
  155: ['blaze'], // Cyndaquil
  156: ['blaze'], // Quilava
  157: ['blaze', 'flame-emperor'], // Typhlosion — Blaze or Flame Emperor
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
  658: ['torrent', 'tide-matriarch'], // Greninja — Torrent or Tide Matriarch

  // --- Overgrow: Grass starters' pinch boost ------------------------------
  1: ['overgrow'], // Bulbasaur
  2: ['overgrow'], // Ivysaur
  3: ['overgrow', 'grass-warden'], // Venusaur — Overgrow or Grass Warden
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

  // --- Cocoon Guard: the Harden cocoons shield the whole team -------------
  // Defense-dominant transitional shells. Their signature turns "Harden" into a
  // team passive — every ally takes a little less damage while a cocoon rides
  // along — so even a throwaway in-between stage carries real identity.
  11: ['cocoon-guard', 'sturdy', 'shed-skin'], // Metapod — Cocoon Guard, Sturdy or Shed Skin
  14: ['cocoon-guard', 'swarm', 'shed-skin'], // Kakuna — Cocoon Guard, Swarm or Shed Skin
  266: ['cocoon-guard', 'sturdy', 'shed-skin'], // Silcoon — Cocoon Guard, Sturdy or Shed Skin
  268: ['cocoon-guard', 'sturdy', 'shed-skin'], // Cascoon — Cocoon Guard, Sturdy or Shed Skin
  665: ['cocoon-guard', 'sturdy', 'shed-skin'], // Spewpa — Cocoon Guard, Sturdy or Shed Skin

  // --- Swarm: Bug attackers' pinch boost ----------------------------------
  13: ['swarm', 'poison-point'], // Weedle — Swarm or Poison Point
  15: ['swarm', 'poison-point', 'hive-queen'], // Beedrill — Swarm, Poison Point or Hive Queen
  165: ['swarm', 'early-bird'], // Ledyba — Swarm or Early Bird
  166: ['swarm', 'early-bird'], // Ledian — Swarm or Early Bird
  167: ['swarm', 'sniper'], // Spinarak — Swarm or Sniper
  168: ['swarm', 'sniper', 'sticky'], // Ariados — Swarm, Sniper or Sticky
  267: ['swarm', 'tinted-lens'], // Beautifly — Swarm or Tinted Lens
  540: ['swarm', 'overgrow'], // Sewaddle — Swarm or Overgrow
  541: ['swarm', 'overgrow'], // Swadloon — Swarm or Overgrow
  542: ['swarm', 'overgrow', 'hive-queen'], // Leavanny — Swarm, Overgrow or Hive Queen

  // --- Static: paralyzes a careless attacker ------------------------------
  25: ['static', 'motor-drive'], // Pikachu — Static or Motor Drive
  26: ['static', 'motor-drive', 'volt-fury'], // Raichu — Static, Motor Drive or Volt Fury
  172: ['static', 'motor-drive'], // Pichu — Static or Motor Drive
  125: ['static', 'vital-spirit'], // Electabuzz — Static or Vital Spirit
  239: ['static', 'vital-spirit'], // Elekid — Static or Vital Spirit
  466: ['motor-drive', 'static', 'volt-fury'], // Electivire — Motor Drive, Static or Volt Fury
  309: ['static', 'quick-feet'], // Electrike — Static or Quick Feet
  310: ['static', 'intimidate', 'volt-fury'], // Manectric — Static, Intimidate or Volt Fury
  587: ['static', 'motor-drive'], // Emolga — Static or Motor Drive

  // --- Flame Body: burns a careless attacker ------------------------------
  126: ['flame-body', 'vital-spirit'], // Magmar — Flame Body or Vital Spirit
  240: ['flame-body', 'vital-spirit'], // Magby — Flame Body or Vital Spirit
  467: ['flame-body', 'vital-spirit', 'torch-pass'], // Magmortar — Flame Body, Vital Spirit or Torch Pass
  218: ['flame-body', 'flash-fire'], // Slugma — Flame Body or Flash Fire
  219: ['flame-body', 'weak-armor'], // Magcargo — Flame Body or Weak Armor
  636: ['flame-body', 'swarm'], // Larvesta — Flame Body or Swarm
  637: ['flame-body', 'swarm', 'flame-emperor', 'torch-pass'], // Volcarona — Flame Body, Swarm, Flame Emperor or Torch Pass

  // --- Poison Point: poisons a careless attacker --------------------------
  29: ['poison-point', 'sheer-force'], // Nidoran♀ — Poison Point or Sheer Force
  30: ['poison-point', 'sheer-force'], // Nidorina — Poison Point or Sheer Force
  31: ['poison-point', 'sheer-force'], // Nidoqueen — Poison Point or Sheer Force
  32: ['poison-point', 'sheer-force'], // Nidoran♂ — Poison Point or Sheer Force
  33: ['poison-point', 'sheer-force'], // Nidorino — Poison Point or Sheer Force
  34: ['poison-point', 'sheer-force'], // Nidoking — Poison Point or Sheer Force
  211: ['poison-point', 'intimidate'], // Qwilfish — Poison Point or Intimidate
  904: ['poison-point', 'intimidate'], // Overqwil (keeps Qwilfish's pool on evolution)
  315: ['poison-point', 'overgrow', 'natural-cure'], // Roselia — Poison Point, Overgrow or Natural Cure
  406: ['poison-point', 'overgrow'], // Budew — Poison Point or Overgrow
  407: ['poison-point', 'overgrow', 'grass-warden', 'thorn-wreath'], // Roserade — Poison Point, Overgrow, Grass Warden or Thorn Wreath

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
  445: ['rough-skin', 'sturdy', 'sand-rush', 'predator'], // Garchomp — Rough Skin, Sturdy, Sand Rush or Predator
  621: ['rough-skin', 'stamina'], // Druddigon — Rough Skin or Stamina

  // --- Stamina: digs in harder with every hit -----------------------------
  304: ['stamina', 'sturdy'], // Aron — Stamina or Sturdy
  305: ['stamina', 'sturdy'], // Lairon — Stamina or Sturdy
  306: ['stamina', 'sturdy', 'iron-marshal', 'veteran', 'burden-bearer'], // Aggron — Stamina, Sturdy, Iron Marshal, Veteran or Burden Bearer
  324: ['stamina', 'thick-fat', 'white-smoke'], // Torkoal — Stamina, Thick Fat or White Smoke
  410: ['sturdy', 'stamina'], // Shieldon — Sturdy or Stamina
  411: ['sturdy', 'stamina', 'filter-down'], // Bastiodon — Sturdy, Stamina or Filter Down

  // --- Multiscale: full-HP veil softens the first blow --------------------
  131: ['thick-fat', 'multiscale', 'hydration'], // Lapras — Thick Fat, Multiscale or Hydration
  248: ['multiscale', 'intimidate'], // Tyranitar — Multiscale or Intimidate

  // --- Solid Rock: blunts super-effective hits ----------------------------
  464: ['solid-rock', 'sturdy', 'veteran', 'heavy-hitter'], // Rhyperior — Solid Rock, Sturdy, Veteran or Heavy Hitter
  323: ['solid-rock', 'thick-fat'], // Camerupt — Solid Rock or Thick Fat
  112: ['solid-rock', 'sturdy'], // Rhydon — Solid Rock or Sturdy
  111: ['solid-rock', 'sturdy'], // Rhyhorn — Solid Rock or Sturdy

  // --- Tinted Lens: doubles its resisted hits -----------------------------
  12: ['tinted-lens', 'swarm', 'compound-eyes', 'shield-dust'], // Butterfree — Tinted Lens, Swarm, Compound Eyes or Shield Dust
  49: ['tinted-lens', 'poison-point', 'shield-dust', 'compound-eyes'], // Venomoth — Tinted Lens, Poison Point, Shield Dust or Compound Eyes

  // --- Battle Armor: seals out critical hits ------------------------------
  140: ['battle-armor', 'sturdy'], // Kabuto — Battle Armor or Sturdy
  141: ['battle-armor', 'sniper'], // Kabutops — Battle Armor or Sniper
  347: ['battle-armor', 'swarm'], // Anorith — Battle Armor or Swarm
  348: ['battle-armor', 'sturdy', 'filter-down'], // Armaldo — Battle Armor, Sturdy or Filter Down
  104: ['legacy', 'battle-armor'], // Cubone — Legacy (its mother's memory) or Battle Armor
  105: ['legacy', 'battle-armor'], // Marowak — Legacy or Battle Armor

  // --- Quick Feet: status fuels its Speed ---------------------------------
  263: ['quick-feet', 'guts', 'treasure-hound'], // Zigzagoon — Quick Feet, Guts or Treasure Hound
  264: ['quick-feet', 'guts', 'treasure-hound'], // Linoone — Quick Feet, Guts or Treasure Hound

  // --- Magic Guard: shrugs off chip damage --------------------------------
  35: ['magic-guard', 'unaware'], // Clefairy — Magic Guard or Unaware
  36: ['magic-guard', 'unaware'], // Clefable — Magic Guard or Unaware
  173: ['magic-guard', 'unaware'], // Cleffa — Magic Guard or Unaware
  561: ['magic-guard', 'levitate'], // Sigilyph — Magic Guard or Levitate

  // --- Poison Heal: thrives while poisoned --------------------------------
  286: ['poison-heal', 'technician', 'effect-spore', 'toxic-boost'], // Breloom — Poison Heal, Technician, Effect Spore or Toxic Boost
  472: ['poison-heal', 'intimidate'], // Gliscor — Poison Heal or Intimidate

  // --- Clear Body: unshakeable, immune to stat drops ----------------------
  72: ['clear-body', 'liquid-ooze'], // Tentacool — Clear Body or Liquid Ooze
  73: ['clear-body', 'poison-point', 'liquid-ooze'], // Tentacruel — Clear Body, Poison Point or Liquid Ooze
  374: ['clear-body', 'heatproof'], // Beldum — Clear Body or Heatproof
  375: ['clear-body', 'heatproof'], // Metang — Clear Body or Heatproof
  376: ['clear-body', 'heatproof', 'iron-marshal', 'steel-heart'], // Metagross — Clear Body, Heatproof, Iron Marshal or Steel Heart

  // --- Defiant: an enemy debuff spikes its Attack -------------------------
  509: ['defiant', 'limber', 'unburden'], // Purrloin — Defiant, Limber or Unburden
  510: ['defiant', 'glory-hog', 'prankster', 'opportunist', 'underdog'], // Liepard — Defiant, Glory Hog, Prankster, Opportunist or Underdog
  624: ['defiant', 'inner-focus'], // Pawniard — Defiant or Inner Focus
  625: ['defiant', 'inner-focus', 'iron-marshal', 'steel-heart'], // Bisharp — Defiant, Inner Focus, Iron Marshal or Steel Heart
  627: ['defiant', 'sturdy'], // Rufflet — Defiant or Sturdy
  628: ['defiant', 'sturdy', 'gale-force', 'second-wind'], // Braviary — Defiant, Sturdy, Gale Force or Second Wind

  // --- Water Absorb: soaks up Water and heals --------------------------------
  134: ['water-absorb', 'water-veil', 'tide-matriarch', 'hydration'], // Vaporeon — Water Absorb, Water Veil, Tide Matriarch or Hydration
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
  608: ['flash-fire', 'levitate', 'soul-battery'], // Lampent — Flash Fire, Levitate or Soul Battery
  609: ['flash-fire', 'levitate', 'soul-battery', 'flare-boost'], // Chandelure — Flash Fire, Levitate, Soul Battery or Flare Boost

  // --- Sap Sipper: grazes on Grass attacks for an Attack boost ---------------
  184: ['sap-sipper', 'thick-fat'], // Azumarill — Sap Sipper or Thick Fat
  241: ['sap-sipper', 'thick-fat'], // Miltank — Sap Sipper or Thick Fat
  585: ['sap-sipper', 'overgrow'], // Deerling — Sap Sipper or Overgrow
  586: ['sap-sipper', 'overgrow'], // Sawsbuck — Sap Sipper or Overgrow
  626: ['sap-sipper', 'guts', 'reckless'], // Bouffalant — Sap Sipper, Guts or Reckless
  672: ['sap-sipper', 'overgrow'], // Skiddo — Sap Sipper or Overgrow
  673: ['sap-sipper', 'overgrow'], // Gogoat — Sap Sipper or Overgrow

  // --- Dry Skin: Water mends it, Fire sears it -------------------------------
  46: ['dry-skin', 'poison-point'], // Paras — Dry Skin or Poison Point
  47: ['dry-skin', 'poison-point', 'effect-spore'], // Parasect — Dry Skin, Poison Point or Effect Spore
  453: ['dry-skin', 'poison-point'], // Croagunk — Dry Skin or Poison Point
  454: ['dry-skin', 'poison-point', 'toxic-boost', 'opportunist'], // Toxicroak — Dry Skin, Poison Point, Toxic Boost or Opportunist

  // --- Immunity: a clean constitution, never poisoned ------------------------
  335: ['immunity', 'quick-feet'], // Zangoose — Immunity or Quick Feet

  // --- Water Veil: a moist sheen, never burned -------------------------------
  118: ['water-veil', 'sniper'], // Goldeen — Water Veil or Sniper (its horn)
  119: ['water-veil', 'sniper'], // Seaking — Water Veil or Sniper
  320: ['water-veil', 'thick-fat'], // Wailmer — Water Veil or Thick Fat
  321: ['water-veil', 'thick-fat'], // Wailord — Water Veil or Thick Fat

  // --- Limber: too supple to be paralyzed ------------------------------------
  106: ['limber', 'steadfast', 'long-reach'], // Hitmonlee — Limber, Steadfast or Long Reach
  132: ['limber'], // Ditto (a transforming blob — kept singular)

  // --- Own Tempo: marches to its own beat, never confused --------------------
  108: ['own-tempo', 'thick-fat'], // Lickitung — Own Tempo or Thick Fat
  463: ['own-tempo', 'thick-fat'], // Lickilicky — Own Tempo or Thick Fat
  235: ['own-tempo', 'technician', 'moody'], // Smeargle — Own Tempo, Technician or Moody
  327: ['own-tempo', 'contrary'], // Spinda — Own Tempo or Contrary

  // --- Contrary: the foe's debuffs only feed it ------------------------------
  686: ['contrary', 'own-tempo'], // Inkay — Contrary or Own Tempo
  687: ['contrary', 'own-tempo'], // Malamar — Contrary or Own Tempo

  // --- Simple: every stat shift it takes is doubled --------------------------
  399: ['moody', 'simple', 'unaware'], // Bidoof — Moody, Simple or Unaware
  400: ['simple', 'unaware'], // Bibarel — Simple or Unaware
  322: ['simple', 'solid-rock'], // Numel — Simple or Solid Rock
  527: ['unaware', 'simple'], // Woobat — Unaware or Simple
  528: ['unaware', 'simple'], // Swoobat — Unaware or Simple

  // --- Anger Point: a crit tips it into a full rage --------------------------
  56: ['anger-point', 'vital-spirit'], // Mankey — Anger Point or Vital Spirit
  57: ['anger-point', 'vital-spirit', 'revenge-cry', 'swagger-king'], // Primeape — Anger Point, Vital Spirit, Revenge Cry or Swagger King
  98: ['hyper-cutter', 'anger-point'], // Krabby — Hyper Cutter or Anger Point
  99: ['hyper-cutter', 'anger-point'], // Kingler — Hyper Cutter or Anger Point

  // --- Justified: its honor flares against Dark attacks ----------------------
  448: ['justified', 'inner-focus', 'pack-alpha', 'rival'], // Lucario — Justified, Inner Focus, Pack Alpha or Rival
  475: ['justified', 'steadfast'], // Gallade — Justified or Steadfast

  // --- Disguise: a costume eats the first hit --------------------------------
  778: ['disguise', 'plot-armor', 'trickster'], // Mimikyu — Disguise, Plot Armor or Trickster

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
  18: ['big-pecks', 'early-bird', 'sky-lord', 'gale-force'], // Pidgeot — Big Pecks, Early Bird, Sky Lord or Gale Force
  580: ['big-pecks', 'water-absorb'], // Ducklett — Big Pecks or Water Absorb
  581: ['big-pecks', 'water-absorb'], // Swanna — Big Pecks or Water Absorb
  661: ['big-pecks', 'early-bird'], // Fletchling — Big Pecks or Early Bird

  // --- Inner Focus: unshakeable, never flinches, ignores Intimidate ----------
  41: ['inner-focus', 'quick-feet', 'scout', 'screech'], // Zubat — Inner Focus, Quick Feet, Scout or Screech
  42: ['inner-focus', 'quick-feet', 'scout', 'screech'], // Golbat — Inner Focus, Quick Feet, Scout or Screech
  169: ['inner-focus', 'quick-feet', 'scout', 'gale-force'], // Crobat — Inner Focus, Quick Feet, Scout or Gale Force
  447: ['inner-focus', 'steadfast'], // Riolu — Inner Focus or Steadfast

  // --- Steadfast: every flinch only quickens its resolve ---------------------
  123: ['technician', 'steadfast'], // Scyther — Technician or Steadfast
  359: ['sniper', 'steadfast', 'fortune', 'shadow-rush', 'super-luck', 'pressure'], // Absol — Sniper, Steadfast, Fortune, Shadow Rush, Super Luck or Pressure

  // --- Hustle: raw power bought with shakier aim -----------------------------
  554: ['hustle', 'sheer-force'], // Darumaka — Hustle or Sheer Force
  555: ['hustle', 'sheer-force'], // Darmanitan — Hustle or Sheer Force
  632: ['hustle', 'swarm'], // Durant — Hustle or Swarm
  633: ['hustle', 'sheer-force'], // Deino — Hustle or Sheer Force
  634: ['hustle', 'sheer-force'], // Zweilous — Hustle or Sheer Force
  635: ['levitate', 'sheer-force', 'shadow-rush', 'predator'], // Hydreigon — Levitate, Sheer Force, Shadow Rush or Predator

  // --- Defeatist: loses heart once worn down ---------------------------------
  566: ['defeatist'], // Archen
  567: ['defeatist', 'slow-start'], // Archeops — Defeatist or Slow Start

  // --- Weak Armor: a hit cracks its plating but lightens its step -------------
  227: ['sturdy', 'weak-armor', 'iron-barbs'], // Skarmory — Sturdy, Weak Armor or Iron Barbs
  557: ['sturdy', 'anger-shell'], // Dwebble — Sturdy or Anger Shell
  558: ['sturdy', 'anger-shell'], // Crustle — Sturdy or Anger Shell

  // --- Aftermath: it goes off like a bomb when it's downed --------------------
  100: ['aftermath', 'static'], // Voltorb — Aftermath or Static
  101: ['aftermath', 'static'], // Electrode — Aftermath or Static
  434: ['aftermath', 'poison-point'], // Stunky — Aftermath or Poison Point
  435: ['aftermath', 'poison-point'], // Skuntank — Aftermath or Poison Point
  425: ['aftermath', 'levitate'], // Drifloon — Aftermath or Levitate
  426: ['aftermath', 'levitate', 'unburden'], // Drifblim — Aftermath, Levitate or Unburden

  // --- Liquid Ooze: drainers choke on its toxic fluids -----------------------
  316: ['liquid-ooze', 'thick-fat'], // Gulpin — Liquid Ooze or Thick Fat
  317: ['liquid-ooze', 'thick-fat', 'sticky'], // Swalot — Liquid Ooze, Thick Fat or Sticky

  // --- Overload: runs hot — bigger boosts, but burn/poison bite harder -------
  64: ['magic-guard', 'overload'], // Kadabra — Magic Guard or Overload
  65: ['magic-guard', 'overload'], // Alakazam — Magic Guard or Overload
  181: ['static', 'overload', 'volt-squad', 'volt-fury'], // Ampharos — Static, Overload, Volt Squad or Volt Fury

  // --- Glass Cannon: all offence, paper-thin guard ---------------------------
  142: ['glass-cannon', 'sniper'], // Aerodactyl — Glass Cannon or Sniper
  408: ['glass-cannon', 'sheer-force'], // Cranidos — Glass Cannon or Sheer Force
  409: ['glass-cannon', 'sheer-force', 'heavy-hitter'], // Rampardos — Glass Cannon, Sheer Force or Heavy Hitter

  // --- Last Stand: it fights hardest with its back to the wall ----------------
  83: ['last-stand', 'inner-focus', 'bargain', 'long-reach'], // Farfetch'd — Last Stand, Inner Focus, Bargain or Long Reach
  538: ['guts', 'last-stand', 'underdog'], // Throh — Guts, Last Stand or Underdog
  539: ['inner-focus', 'last-stand', 'underdog'], // Sawk — Inner Focus, Last Stand or Underdog

  // --- Legacy: a fallen mon passes its strength to its successor --------------
  355: ['levitate', 'legacy'], // Duskull — Levitate or Legacy (a lingering spirit)
  356: ['levitate', 'legacy'], // Dusclops — Levitate or Legacy
  477: ['levitate', 'legacy', 'soul-battery', 'pressure'], // Dusknoir — Levitate, Legacy, Soul Battery or Pressure

  // --- Rally: a supportive heart fires up the next ally in --------------------
  113: ['rally', 'regenerator', 'curator', 'parting-gift', 'natural-cure'], // Chansey — Rally, Regenerator, Curator, Parting Gift or Natural Cure
  242: ['rally', 'regenerator', 'curator', 'parting-gift', 'natural-cure'], // Blissey — Rally, Regenerator, Curator, Parting Gift or Natural Cure
  531: ['regenerator', 'rally', 'curator', 'parting-gift', 'pacifist'], // Audino — Regenerator, Rally, Curator, Parting Gift or Pacifist

  // --- Team commanders & run helpers (expanded roster) -------------------------
  164: ['scout', 'inner-focus'], // Noctowl — Scout or Inner Focus
  178: ['diviner', 'early-bird'], // Xatu — Diviner or Early Bird
  196: ['diviner', 'magic-guard'], // Espeon — Diviner or Magic Guard
  197: ['shadow-cabinet', 'inner-focus'], // Umbreon — Shadow Cabinet or Inner Focus
  225: ['bargain', 'vital-spirit'], // Delibird — Bargain or Vital Spirit
  282: ['fairy-court', 'magic-guard', 'diviner'], // Gardevoir — Fairy Court, Magic Guard or Diviner
  468: ['fairy-court', 'magic-guard'], // Togekiss — Fairy Court or Magic Guard
  700: ['fairy-court', 'magic-guard'], // Sylveon — Fairy Court or Magic Guard
  417: ['bargain', 'static'], // Pachirisu — Bargain or Static
  416: ['hive-queen', 'pressure'], // Vespiquen — Hive Queen or Pressure
  505: ['scout', 'inner-focus'], // Watchog — Scout or Inner Focus
  598: ['grass-warden', 'iron-barbs', 'sturdy'], // Ferrothorn — Grass Warden, Iron Barbs or Sturdy
  663: ['blaze', 'flame-body', 'flame-emperor', 'sky-lord'], // Talonflame — Blaze, Flame Body, Flame Emperor or Sky Lord
  820: ['treasure-hound', 'pickup'], // Greedent — Treasure Hound or Pickup

  // --- Iconic & signature passives -------------------------------------------
  292: ['wonder-guard'], // Shedinja — Wonder Guard (iconic)
  352: ['color-change'], // Kecleon — Color Change (iconic)
  486: ['slow-start'], // Regigigas — Slow Start (iconic)
  442: ['pressure', 'gravity', 'eerie-aura'], // Spiritomb — Pressure, Gravity or Eerie Aura
  302: ['prankster', 'stall', 'super-luck'], // Sableye — Prankster, Stall or Super Luck
  547: ['prankster', 'contrary'], // Whimsicott — Prankster or Contrary
  479: ['trickster', 'levitate'], // Rotom — Trickster or Levitate
  137: ['download', 'adaptability'], // Porygon — Download or Adaptability
  233: ['download', 'adaptability'], // Porygon2 — Download or Adaptability
  202: ['oblivious', 'pacifist', 'burden-bearer'], // Wobbuffet — Oblivious, Pacifist or Burden Bearer

  // --- On faint (expanded) ---------------------------------------------------
  758: ['toxic-boost', 'opportunist'], // Salazzle — Toxic Boost or Opportunist
  295: ['revenge-cry', 'scrappy'], // Exploud — Revenge Cry or Scrappy
  354: ['grudge', 'cursed-body'], // Banette — Grudge or Cursed Body
  764: ['parting-gift', 'natural-cure'], // Comfey — Parting Gift or Natural Cure

  // --- Entry (expanded) ------------------------------------------------------
  862: ['swagger-king', 'defiant'], // Obstagoon — Swagger King or Defiant

  // --- Pinch offence (expanded) ----------------------------------------------
  478: ['snow-cloak', 'cursed-body'], // Froslass — Snow Cloak or Cursed Body
  362: ['sheer-cold', 'inner-focus'], // Glalie — Sheer Cold or Inner Focus
  144: ['sheer-cold', 'pressure'], // Articuno — Sheer Cold or Pressure
  530: ['sand-rush', 'rough-skin'], // Excadrill — Sand Rush or Rough Skin
  334: ['filter', 'natural-cure'], // Altaria — Filter or Natural Cure
  617: ['heavy-hitter', 'moxie'], // Haxorus — Heavy Hitter or Moxie
  571: ['rival', 'defiant'], // Zoroark — Rival or Defiant
  706: ['rebel-spirit', 'gale-force', 'long-reach'], // Hawlucha — Rebel Spirit, Gale Force or Long Reach
  887: ['predator', 'cursed-body'], // Dragapult — Predator or Cursed Body
  894: ['volt-fury', 'motor-drive'], // Regieleki — Volt Fury or Motor Drive

  // --- Defensive (expanded) ----------------------------------------------------
  748: ['filter', 'pressure'], // Toxapex — Filter or Pressure
  759: ['fur-coat', 'pickup'], // Stufful — Fur Coat or Pickup
  724: ['long-reach', 'overgrow'], // Decidueye — Long Reach or Overgrow
  786: ['long-reach', 'overgrow'], // Dhelmise — Long Reach or Overgrow
  631: ['white-smoke', 'flash-fire'], // Heatmor — White Smoke or Flash Fire
  537: ['hydration', 'water-absorb'], // Seismitoad — Hydration or Water Absorb

  // --- Contact (expanded) ----------------------------------------------------
  591: ['effect-spore', 'regenerator'], // Amoonguss — Effect Spore or Regenerator
  596: ['sticky', 'compound-eyes'], // Galvantula — Sticky or Compound Eyes
  867: ['perish-body', 'sturdy'], // Runerigus — Perish Body or Sturdy
  864: ['perish-body', 'cursed-body'], // Cursola — Perish Body or Cursed Body
  681: ['stall', 'no-guard'], // Aegislash — Stall or No Guard

  // --- Status & misc (expanded) ----------------------------------------------
  622: ['unburden', 'hydration'], // Accelgor — Unburden or Hydration
  89: ['toxic-boost', 'poison-point'], // Muk — Toxic Boost or Poison Point
  332: ['thorn-wreath', 'rough-skin'], // Cacturne — Thorn Wreath or Rough Skin
  205: ['iron-barbs', 'sturdy'], // Forretress — Iron Barbs or Sturdy
  232: ['heavy-hitter', 'sand-rush', 'sturdy'], // Donphan — Heavy Hitter, Sand Rush or Sturdy
  145: ['static', 'pressure', 'volt-fury'], // Zapdos — Static, Pressure or Volt Fury
  601: ['no-guard', 'clear-body'], // Klinklang — No Guard or Clear Body
  269: ['shield-dust', 'compound-eyes'], // Dustox — Shield Dust or Compound Eyes

  // --- Glory Hog: a selfish star that hogs the team's strength ----------------
  431: ['glory-hog', 'limber'], // Glameow — Glory Hog or Limber
  432: ['glory-hog', 'thick-fat'], // Purugly — Glory Hog or Thick Fat
  668: ['moxie', 'glory-hog', 'showboat'], // Pyroar — Moxie, Glory Hog or Showboat (the proud lion)
};

/**
 * The gen-by-gen SIGNATURE PASS: every species gets at least one unique, on-theme
 * passive so no mon is left on a purely generic pool. The signature leads the list
 * (so it's the canonical default) and a couple of fitting generic options trail it,
 * still rollable. This table OVERRIDES SPECIES_ABILITIES entirely for any id it
 * lists — for these species, edit *here*, not in the table above. Rolled out one
 * generation at a time; un-passed species still fall back to the curated/derived
 * pools.
 */
export const SIGNATURES: Record<number, AbilityId[]> = {
  // ===== Gen I — Kanto =====
  // Starters & cradle bugs
  1: ['verdant', 'overgrow'], // Bulbasaur
  2: ['verdant', 'overgrow'], // Ivysaur
  3: ['grass-warden', 'overgrow'], // Venusaur — promote its team-heal to signature
  4: ['roaring-flame', 'blaze'], // Charmander
  5: ['roaring-flame', 'blaze'], // Charmeleon
  6: ['dragonlord', 'flame-emperor', 'blaze', 'flare-boost'], // Charizard — the dragon by form
  7: ['shell-shield', 'torrent'], // Squirtle
  8: ['shell-shield', 'torrent'], // Wartortle
  9: ['shell-shield', 'cannoneer', 'torrent'], // Blastoise
  10: ['verdant', 'shield-dust'], // Caterpie — munches leaves to mend
  12: ['lullaby', 'tinted-lens', 'compound-eyes'], // Butterfree — sleep powder
  13: ['corrosion', 'swarm'], // Weedle
  15: ['hive-queen', 'corrosion', 'swarm', 'poison-point'], // Beedrill
  // Birds & early routes
  16: ['tailwind', 'big-pecks', 'early-bird'], // Pidgey
  17: ['tailwind', 'big-pecks', 'early-bird'], // Pidgeotto
  18: ['sky-lord', 'big-pecks', 'early-bird', 'gale-force'], // Pidgeot
  19: ['giant-slayer', 'scrappy', 'quick-feet'], // Rattata
  20: ['giant-slayer', 'scrappy', 'quick-feet'], // Raticate
  21: ['first-strike', 'scrappy'], // Spearow
  22: ['first-strike', 'scrappy'], // Fearow
  23: ['corrosion', 'intimidate'], // Ekans
  24: ['corrosion', 'intimidate'], // Arbok
  25: ['cheek-pouch', 'static', 'motor-drive'], // Pikachu
  26: ['cheek-pouch', 'static', 'volt-fury'], // Raichu
  27: ['counterweight', 'sturdy'], // Sandshrew
  28: ['counterweight', 'sturdy', 'rough-skin'], // Sandslash
  29: ['toxic-crown', 'poison-point'], // Nidoran♀
  30: ['toxic-crown', 'poison-point'], // Nidorina
  31: ['toxic-crown', 'earth-warden', 'poison-point', 'sheer-force'], // Nidoqueen
  32: ['toxic-crown', 'poison-point'], // Nidoran♂
  33: ['toxic-crown', 'poison-point'], // Nidorino
  34: ['toxic-crown', 'earth-warden', 'poison-point', 'sheer-force'], // Nidoking
  35: ['renewal', 'magic-guard', 'unaware'], // Clefairy — Moonlight
  36: ['renewal', 'magic-guard', 'unaware'], // Clefable
  37: ['jinx', 'flash-fire', 'magic-guard'], // Vulpix — the cursed fox
  38: ['jinx', 'flash-fire', 'magic-guard'], // Ninetales
  39: ['lullaby', 'thick-fat'], // Jigglypuff — Sing
  40: ['lullaby', 'den-mother', 'thick-fat'], // Wigglytuff
  // Caves, woods & water
  41: ['vampiric', 'scout', 'inner-focus', 'quick-feet'], // Zubat
  42: ['vampiric', 'scout', 'inner-focus', 'quick-feet'], // Golbat
  43: ['corrosion', 'overgrow'], // Oddish
  44: ['corrosion', 'overgrow'], // Gloom
  45: ['corrosion', 'lullaby', 'overgrow'], // Vileplume
  46: ['vampiric', 'dry-skin'], // Paras
  47: ['vampiric', 'dry-skin', 'effect-spore'], // Parasect
  48: ['wild-card', 'tinted-lens'], // Venonat
  49: ['wild-card', 'tinted-lens', 'shield-dust'], // Venomoth
  50: ['earth-warden', 'sturdy'], // Diglett
  51: ['earth-warden', 'sturdy', 'sand-rush'], // Dugtrio
  54: ['wild-card', 'own-tempo'], // Psyduck — the headache
  55: ['wild-card', 'own-tempo'], // Golduck
  56: ['momentum', 'anger-point', 'vital-spirit'], // Mankey
  58: ['avenger', 'intimidate', 'flash-fire'], // Growlithe — loyal hound
  60: ['riposte', 'water-absorb'], // Poliwag
  61: ['riposte', 'water-absorb'], // Poliwhirl
  62: ['riposte', 'rebel-spirit', 'water-absorb'], // Poliwrath
  63: ['psi-network', 'magic-guard'], // Abra
  64: ['psi-network', 'overload', 'magic-guard'], // Kadabra
  65: ['psi-network', 'overload', 'magic-guard'], // Alakazam
  66: ['pack-alpha', 'guts', 'steadfast'], // Machop
  67: ['pack-alpha', 'guts', 'steadfast'], // Machoke
  69: ['vampiric', 'overgrow'], // Bellsprout
  70: ['vampiric', 'overgrow'], // Weepinbell
  71: ['vampiric', 'corrosion', 'overgrow'], // Victreebel
  72: ['backlash', 'clear-body', 'liquid-ooze'], // Tentacool — the jelly
  73: ['backlash', 'toxic-crown', 'clear-body', 'liquid-ooze'], // Tentacruel
  74: ['stone-council', 'sturdy', 'solid-rock'], // Geodude
  75: ['stone-council', 'sturdy', 'solid-rock'], // Graveler
  76: ['stone-council', 'sturdy', 'solid-rock'], // Golem
  77: ['momentum', 'flash-fire', 'flame-body'], // Ponyta
  78: ['momentum', 'flash-fire', 'flame-body'], // Rapidash
  79: ['analytic', 'regenerator', 'own-tempo'], // Slowpoke
  80: ['analytic', 'regenerator', 'own-tempo'], // Slowbro
  81: ['iron-marshal', 'sturdy'], // Magnemite
  82: ['iron-marshal', 'sturdy'], // Magneton
  83: ['first-strike', 'bargain', 'last-stand', 'inner-focus'], // Farfetch'd — leek crit
  84: ['momentum', 'early-bird'], // Doduo
  85: ['momentum', 'early-bird'], // Dodrio
  86: ['permafrost', 'thick-fat', 'water-absorb'], // Seel
  87: ['permafrost', 'thick-fat', 'water-absorb'], // Dewgong
  88: ['corrosion', 'poison-point'], // Grimer
  89: ['corrosion', 'toxic-crown', 'toxic-boost', 'poison-point'], // Muk
  90: ['counterweight', 'battle-armor', 'sturdy'], // Shellder
  91: ['counterweight', 'permafrost', 'battle-armor', 'sturdy'], // Cloyster
  92: ['wraith-choir', 'levitate', 'liquid-ooze'], // Gastly
  93: ['wraith-choir', 'levitate', 'liquid-ooze'], // Haunter
  94: ['wraith-choir', 'eerie-aura', 'cursed-body', 'levitate', 'liquid-ooze'], // Gengar
  95: ['stone-council', 'counterweight', 'sturdy'], // Onix
  96: ['lullaby', 'magic-guard'], // Drowzee — Hypnosis
  97: ['lullaby', 'magic-guard'], // Hypno
  98: ['cannoneer', 'hyper-cutter', 'anger-point'], // Krabby
  99: ['cannoneer', 'hyper-cutter', 'anger-point'], // Kingler
  102: ['verdant', 'psi-network'], // Exeggcute
  103: ['verdant', 'psi-network', 'overgrow'], // Exeggutor
  105: ['legacy', 'avenger', 'battle-armor'], // Marowak — bone-club vengeance
  106: ['first-strike', 'limber', 'steadfast', 'long-reach'], // Hitmonlee
  107: ['riposte', 'technician', 'inner-focus'], // Hitmonchan — the counter-puncher
  108: ['wild-card', 'own-tempo', 'thick-fat'], // Lickitung
  109: ['corrosion', 'levitate', 'liquid-ooze'], // Koffing
  110: ['corrosion', 'levitate', 'liquid-ooze'], // Weezing
  111: ['momentum', 'stone-council', 'solid-rock', 'sturdy'], // Rhyhorn
  112: ['momentum', 'stone-council', 'solid-rock', 'sturdy'], // Rhydon
  113: ['renewal', 'rally', 'curator', 'parting-gift', 'regenerator'], // Chansey — the egg nurse
  114: ['verdant', 'regenerator', 'overgrow'], // Tangela
  115: ['den-mother', 'scrappy'], // Kangaskhan — parent & child
  116: ['tide-matriarch', 'sniper'], // Horsea
  117: ['tide-matriarch', 'sniper'], // Seadra
  118: ['first-strike', 'water-veil', 'sniper'], // Goldeen — horn drill
  119: ['first-strike', 'water-veil', 'sniper'], // Seaking
  120: ['renewal', 'natural-cure'], // Staryu — Recover
  121: ['renewal', 'psi-network', 'natural-cure'], // Starmie
  122: ['magic-bounce', 'filter', 'magic-guard'], // Mr. Mime — the barrier
  123: ['first-strike', 'technician', 'steadfast'], // Scyther
  124: ['lullaby', 'sheer-cold'], // Jynx — Lovely Kiss
  125: ['wild-card', 'static', 'vital-spirit'], // Electabuzz
  126: ['roaring-flame', 'flame-body', 'vital-spirit'], // Magmar
  127: ['giant-slayer', 'hyper-cutter', 'moxie'], // Pinsir
  128: ['opening-act', 'momentum', 'intimidate', 'anger-point'], // Tauros — the stampede
  129: ['latent-power'], // Magikarp — hidden potential
  131: ['transfusion', 'permafrost', 'thick-fat', 'multiscale'], // Lapras — the ferry
  132: ['transform'], // Ditto
  133: ['latent-power', 'adaptability'], // Eevee — evolutionary potential
  136: ['roaring-flame', 'flash-fire', 'guts'], // Flareon
  137: ['download', 'analytic', 'adaptability'], // Porygon
  138: ['vampiric', 'stone-council', 'sturdy'], // Omanyte
  139: ['vampiric', 'stone-council', 'sturdy'], // Omastar
  140: ['first-strike', 'battle-armor', 'sturdy'], // Kabuto
  141: ['first-strike', 'battle-armor', 'sniper'], // Kabutops
  142: ['first-strike', 'sky-lord', 'glass-cannon', 'sniper'], // Aerodactyl
  143: ['gluttony', 'den-mother', 'thick-fat', 'immunity'], // Snorlax
  144: ['permafrost', 'sheer-cold', 'pressure'], // Articuno
  145: ['tempest', 'volt-fury', 'static', 'pressure'], // Zapdos
  146: ['phoenix', 'flame-emperor', 'flash-fire'], // Moltres
  147: ['renewal', 'marvel-scale', 'shed-skin'], // Dratini — mystic recovery
  148: ['renewal', 'marvel-scale', 'shed-skin'], // Dragonair
  149: ['dragonlord', 'marvel-scale', 'multiscale'], // Dragonite — the true dragon
  150: ['overmind', 'psi-network', 'pressure'], // Mewtwo
  151: ['genome', 'latent-power', 'adaptability'], // Mew — every blueprint
  // Already-curated Kanto finals — promote their flavour passive to the default
  // so the signature leads, matching the rest of the pass (options unchanged).
  53: ['pickup', 'fortune', 'technician', 'limber', 'fur-coat'], // Persian — the money cat
  57: ['revenge-cry', 'swagger-king', 'anger-point', 'vital-spirit'], // Primeape — the rage
  59: ['flame-emperor', 'second-wind', 'intimidate', 'flash-fire'], // Arcanine — the legendary hound
  68: ['pack-alpha', 'veteran', 'guts', 'steadfast', 'sheer-force', 'no-guard'], // Machamp
  130: ['menace', 'daunt', 'intimidate', 'moxie', 'predator'], // Gyarados — the wrath
  134: ['tide-matriarch', 'water-absorb', 'water-veil', 'hydration'], // Vaporeon
  135: ['overload', 'volt-absorb', 'quick-feet'], // Jolteon

  // ===== Gen II — Johto =====
  152: ['verdant', 'overgrow'], // Chikorita
  153: ['verdant', 'overgrow'], // Bayleef
  154: ['grass-warden', 'verdant', 'overgrow'], // Meganium
  155: ['roaring-flame', 'blaze'], // Cyndaquil
  156: ['roaring-flame', 'blaze'], // Quilava
  157: ['flame-emperor', 'roaring-flame', 'blaze'], // Typhlosion
  158: ['first-strike', 'torrent'], // Totodile
  159: ['first-strike', 'torrent'], // Croconaw
  160: ['first-strike', 'giant-slayer', 'torrent'], // Feraligatr
  161: ['scout', 'first-strike'], // Sentret
  162: ['scout', 'first-strike'], // Furret
  163: ['scout', 'lullaby', 'early-bird'], // Hoothoot
  164: ['scout', 'lullaby', 'inner-focus'], // Noctowl
  165: ['tailwind', 'early-bird'], // Ledyba
  166: ['tailwind', 'early-bird'], // Ledian
  167: ['corrosion', 'sniper'], // Spinarak
  168: ['corrosion', 'sniper', 'sticky'], // Ariados
  169: ['vampiric', 'scout', 'inner-focus', 'quick-feet'], // Crobat
  170: ['volt-squad', 'water-absorb'], // Chinchou
  171: ['volt-squad', 'water-absorb', 'volt-absorb'], // Lanturn
  172: ['cheek-pouch', 'static'], // Pichu
  173: ['renewal', 'magic-guard'], // Cleffa
  174: ['lullaby', 'thick-fat'], // Igglybuff
  175: ['fortune', 'magic-guard'], // Togepi
  176: ['fairy-court', 'fortune', 'magic-guard'], // Togetic
  177: ['diviner', 'early-bird'], // Natu
  179: ['cheek-pouch', 'static'], // Mareep
  180: ['cheek-pouch', 'static'], // Flaaffy
  181: ['overload', 'volt-squad', 'static', 'volt-fury'], // Ampharos
  182: ['verdant', 'lullaby', 'overgrow'], // Bellossom
  183: ['giant-slayer', 'thick-fat'], // Marill
  184: ['giant-slayer', 'thick-fat', 'sap-sipper'], // Azumarill
  185: ['stone-council', 'counterweight', 'sturdy'], // Sudowoodo
  186: ['tide-matriarch', 'rally'], // Politoed
  187: ['tailwind', 'verdant'], // Hoppip
  188: ['tailwind', 'verdant'], // Skiploom
  189: ['vampiric', 'tailwind'], // Jumpluff
  190: ['wild-card', 'technician'], // Aipom
  191: ['verdant', 'overgrow'], // Sunkern
  192: ['verdant', 'overgrow'], // Sunflora
  193: ['first-strike', 'speed-boost', 'tinted-lens'], // Yanma
  194: ['earth-warden', 'unaware', 'water-absorb'], // Wooper
  195: ['earth-warden', 'unaware', 'water-absorb'], // Quagsire
  198: ['jinx', 'super-luck', 'moxie'], // Murkrow
  199: ['analytic', 'psi-network', 'regenerator'], // Slowking
  200: ['wraith-choir', 'eerie-aura', 'levitate', 'magic-guard'], // Misdreavus
  201: ['wild-card', 'levitate'], // Unown
  202: ['riposte', 'oblivious', 'burden-bearer'], // Wobbuffet
  203: ['psi-network', 'wild-card'], // Girafarig
  204: ['counterweight', 'sturdy'], // Pineco
  205: ['iron-marshal', 'counterweight', 'sturdy'], // Forretress
  206: ['wild-card', 'sturdy'], // Dunsparce (Serene Grace)
  207: ['earth-warden', 'sky-lord', 'hyper-cutter'], // Gligar
  208: ['iron-marshal', 'earth-warden', 'stone-council', 'sturdy'], // Steelix
  209: ['first-strike', 'intimidate'], // Snubbull
  210: ['first-strike', 'intimidate'], // Granbull
  211: ['corrosion', 'backlash', 'intimidate'], // Qwilfish
  212: ['iron-marshal', 'first-strike', 'technician', 'steel-heart'], // Scizor
  213: ['counterweight', 'stall', 'sturdy'], // Shuckle
  214: ['pack-alpha', 'giant-slayer', 'guts', 'moxie'], // Heracross
  215: ['first-strike', 'technician', 'inner-focus'], // Sneasel
  216: ['giant-slayer', 'gluttony', 'guts'], // Teddiursa
  217: ['giant-slayer', 'gluttony', 'guts'], // Ursaring
  218: ['roaring-flame', 'flame-body'], // Slugma
  219: ['roaring-flame', 'stone-council', 'flame-body'], // Magcargo
  220: ['permafrost', 'thick-fat'], // Swinub
  221: ['permafrost', 'thick-fat'], // Piloswine
  222: ['renewal', 'regenerator', 'sturdy'], // Corsola
  223: ['cannoneer', 'sniper'], // Remoraid
  224: ['cannoneer', 'sniper'], // Octillery
  226: ['tide-matriarch', 'sky-lord', 'water-absorb'], // Mantine
  227: ['iron-marshal', 'sky-lord', 'sturdy'], // Skarmory
  228: ['shadow-cabinet', 'roaring-flame', 'flash-fire'], // Houndour
  229: ['shadow-cabinet', 'roaring-flame', 'flash-fire'], // Houndoom
  230: ['tide-matriarch', 'dragonlord'], // Kingdra
  231: ['earth-warden', 'momentum'], // Phanpy
  232: ['earth-warden', 'momentum', 'stone-council'], // Donphan
  233: ['download', 'analytic', 'adaptability'], // Porygon2
  234: ['lullaby', 'intimidate'], // Stantler
  235: ['moody', 'transform', 'own-tempo', 'technician'], // Smeargle (Sketch)
  236: ['pack-alpha', 'giant-slayer'], // Tyrogue
  237: ['riposte', 'pack-alpha'], // Hitmontop
  238: ['lullaby', 'sheer-cold'], // Smoochum
  239: ['cheek-pouch', 'static', 'vital-spirit'], // Elekid
  240: ['roaring-flame', 'flame-body', 'vital-spirit'], // Magby
  241: ['renewal', 'thick-fat', 'sap-sipper'], // Miltank
  242: ['renewal', 'rally', 'curator', 'parting-gift', 'regenerator'], // Blissey
  243: ['tempest', 'volt-squad'], // Raikou
  244: ['flame-emperor', 'roaring-flame'], // Entei
  245: ['tide-matriarch', 'renewal'], // Suicune
  246: ['stone-council', 'sturdy'], // Larvitar
  247: ['stone-council', 'counterweight'], // Pupitar
  248: ['stone-council', 'intimidate', 'heavy-hitter', 'multiscale'], // Tyranitar
  249: ['magic-bounce', 'multiscale', 'pressure'], // Lugia
  250: ['phoenix', 'flame-emperor'], // Ho-Oh
  251: ['renewal', 'grass-warden'], // Celebi

  // ===== Gen III — Hoenn =====
  252: ['verdant', 'first-strike'], // Treecko
  253: ['first-strike', 'verdant'], // Grovyle
  254: ['first-strike', 'verdant', 'overgrow'], // Sceptile
  255: ['roaring-flame', 'speed-boost', 'blaze'], // Torchic
  256: ['roaring-flame', 'rebel-spirit', 'speed-boost'], // Combusken
  257: ['roaring-flame', 'rebel-spirit', 'speed-boost'], // Blaziken
  258: ['earth-warden', 'torrent'], // Mudkip
  259: ['earth-warden', 'torrent'], // Marshtomp
  260: ['earth-warden', 'giant-slayer', 'torrent'], // Swampert
  261: ['shadow-cabinet', 'intimidate'], // Poochyena
  262: ['menace', 'shadow-cabinet', 'intimidate', 'moxie'], // Mightyena
  263: ['treasure-hound', 'quick-feet', 'guts'], // Zigzagoon
  264: ['treasure-hound', 'quick-feet', 'guts'], // Linoone
  265: ['corrosion', 'shield-dust'], // Wurmple
  267: ['tailwind', 'tinted-lens', 'swarm'], // Beautifly
  269: ['wild-card', 'shield-dust', 'compound-eyes'], // Dustox
  270: ['verdant', 'tide-matriarch'], // Lotad
  271: ['verdant', 'tide-matriarch'], // Lombre
  272: ['tide-matriarch', 'verdant'], // Ludicolo
  273: ['verdant', 'overgrow'], // Seedot
  274: ['shadow-cabinet', 'verdant'], // Nuzleaf
  275: ['shadow-cabinet', 'gale-force'], // Shiftry
  276: ['first-strike', 'guts', 'scrappy'], // Taillow
  277: ['first-strike', 'guts', 'scrappy'], // Swellow
  278: ['tailwind', 'sky-lord'], // Wingull
  279: ['tide-matriarch', 'sky-lord'], // Pelipper
  280: ['fairy-court', 'psi-network'], // Ralts
  281: ['fairy-court', 'psi-network'], // Kirlia
  283: ['wild-card', 'tinted-lens'], // Surskit
  284: ['tailwind', 'wild-card', 'tinted-lens'], // Masquerain
  285: ['lullaby', 'poison-heal', 'effect-spore'], // Shroomish
  286: ['lullaby', 'pack-alpha', 'poison-heal', 'technician'], // Breloom
  288: ['momentum', 'vital-spirit'], // Vigoroth
  290: ['counterweight', 'sturdy'], // Nincada
  291: ['first-strike', 'tailwind', 'speed-boost'], // Ninjask
  293: ['wild-card', 'scrappy'], // Whismur
  294: ['wild-card', 'scrappy'], // Loudred
  295: ['revenge-cry', 'wild-card', 'scrappy'], // Exploud
  296: ['pack-alpha', 'thick-fat', 'guts'], // Makuhita
  297: ['pack-alpha', 'giant-slayer', 'guts', 'thick-fat'], // Hariyama
  298: ['giant-slayer', 'thick-fat'], // Azurill
  299: ['stone-council', 'sturdy', 'solid-rock'], // Nosepass
  300: ['fortune', 'wild-card'], // Skitty
  301: ['fortune', 'wild-card'], // Delcatty
  303: ['first-strike', 'fairy-court', 'intimidate'], // Mawile
  304: ['counterweight', 'stamina', 'sturdy'], // Aron
  305: ['counterweight', 'stamina', 'sturdy'], // Lairon
  306: ['iron-marshal', 'stone-council', 'veteran', 'stamina'], // Aggron
  307: ['giant-slayer', 'pack-alpha'], // Meditite
  308: ['giant-slayer', 'pack-alpha'], // Medicham
  309: ['cheek-pouch', 'static', 'quick-feet'], // Electrike
  310: ['cheek-pouch', 'intimidate', 'volt-fury'], // Manectric
  313: ['wild-card', 'tailwind'], // Volbeat
  314: ['wild-card', 'tailwind'], // Illumise
  315: ['corrosion', 'grass-warden', 'overgrow'], // Roselia
  316: ['corrosion', 'liquid-ooze', 'thick-fat'], // Gulpin
  317: ['corrosion', 'liquid-ooze', 'sticky'], // Swalot
  318: ['first-strike', 'predator', 'rough-skin'], // Carvanha
  319: ['first-strike', 'predator', 'speed-boost'], // Sharpedo
  320: ['gluttony', 'water-veil', 'thick-fat'], // Wailmer
  321: ['gluttony', 'water-veil', 'thick-fat'], // Wailord
  322: ['earth-warden', 'roaring-flame', 'simple'], // Numel
  323: ['earth-warden', 'roaring-flame', 'solid-rock'], // Camerupt
  324: ['roaring-flame', 'stamina', 'white-smoke'], // Torkoal
  325: ['psi-network', 'wild-card'], // Spoink
  326: ['psi-network', 'wild-card'], // Grumpig
  327: ['wild-card', 'own-tempo', 'contrary'], // Spinda
  328: ['giant-slayer', 'hyper-cutter', 'sheer-force'], // Trapinch
  329: ['earth-warden', 'levitate', 'sheer-force'], // Vibrava
  330: ['earth-warden', 'dragonlord', 'levitate', 'sand-rush'], // Flygon
  331: ['corrosion', 'rough-skin'], // Cacnea
  332: ['thorn-wreath', 'corrosion', 'rough-skin'], // Cacturne
  333: ['renewal', 'tailwind', 'natural-cure'], // Swablu
  334: ['dragonlord', 'sky-lord', 'renewal', 'filter'], // Altaria
  335: ['first-strike', 'immunity', 'quick-feet'], // Zangoose
  336: ['corrosion', 'first-strike'], // Seviper
  337: ['psi-network', 'levitate'], // Lunatone
  338: ['psi-network', 'levitate'], // Solrock
  339: ['earth-warden', 'wild-card'], // Barboach
  340: ['earth-warden', 'gluttony'], // Whiscash
  341: ['first-strike', 'adaptability', 'anger-shell'], // Corphish
  342: ['cannoneer', 'adaptability', 'anger-shell'], // Crawdaunt
  343: ['earth-warden', 'levitate', 'sturdy'], // Baltoy
  344: ['earth-warden', 'levitate', 'sturdy'], // Claydol
  345: ['vampiric', 'stamina', 'sturdy'], // Lileep
  346: ['vampiric', 'stamina', 'sturdy'], // Cradily
  347: ['first-strike', 'battle-armor', 'swarm'], // Anorith
  348: ['first-strike', 'stone-council', 'battle-armor'], // Armaldo
  349: ['latent-power'], // Feebas
  350: ['tide-matriarch', 'renewal', 'marvel-scale', 'water-veil'], // Milotic
  351: ['wild-card'], // Castform
  353: ['wraith-choir', 'vampiric', 'levitate'], // Shuppet
  354: ['wraith-choir', 'grudge', 'cursed-body'], // Banette
  357: ['verdant', 'renewal', 'sap-sipper'], // Tropius
  358: ['renewal', 'psi-network'], // Chimecho
  360: ['riposte', 'oblivious'], // Wynaut
  361: ['permafrost', 'sheer-cold', 'inner-focus'], // Snorunt
  362: ['permafrost', 'sheer-cold', 'inner-focus'], // Glalie
  363: ['permafrost', 'gluttony', 'thick-fat'], // Spheal
  364: ['permafrost', 'gluttony', 'thick-fat'], // Sealeo
  365: ['permafrost', 'gluttony', 'thick-fat'], // Walrein
  366: ['shell-shield', 'counterweight'], // Clamperl
  367: ['first-strike', 'predator'], // Huntail
  368: ['vampiric', 'renewal'], // Gorebyss
  369: ['stone-council', 'sturdy'], // Relicanth
  370: ['fortune', 'renewal'], // Luvdisc
  371: ['latent-power', 'rough-skin'], // Bagon
  372: ['shell-shield', 'counterweight'], // Shelgon
  373: ['dragonlord', 'sky-lord', 'intimidate', 'moxie'], // Salamence
  374: ['iron-marshal', 'psi-network', 'clear-body'], // Beldum
  375: ['iron-marshal', 'psi-network', 'clear-body'], // Metang
  376: ['iron-marshal', 'psi-network', 'clear-body', 'steel-heart'], // Metagross
  377: ['stone-council', 'counterweight', 'sturdy'], // Regirock
  378: ['permafrost', 'counterweight'], // Regice
  379: ['iron-marshal', 'counterweight'], // Registeel
  380: ['magic-bounce', 'psi-network'], // Latias
  381: ['dragonlord', 'psi-network'], // Latios
  382: ['deluge', 'tide-matriarch'], // Kyogre
  383: ['magma', 'earth-warden'], // Groudon
  384: ['dragonlord', 'sky-lord', 'gale-force'], // Rayquaza
  385: ['fortune', 'renewal'], // Jirachi
  386: ['overmind', 'first-strike', 'glass-cannon'], // Deoxys
  // Curated Johto/Hoenn mons whose legacy default was generic — promote the signature.
  311: ['rally', 'volt-absorb'], // Plusle
  312: ['rally', 'volt-absorb'], // Minun
  355: ['legacy', 'levitate'], // Duskull
  356: ['legacy', 'levitate'], // Dusclops
  359: ['fortune', 'super-luck', 'sniper', 'steadfast'], // Absol
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
  return SIGNATURES[dexId] ?? SPECIES_ABILITIES[dexId] ?? derivedAbilities(dexId);
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
