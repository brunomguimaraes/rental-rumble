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

  // ===== Gen IV — Sinnoh =====
  387: ['grass-warden', 'shell-shield', 'overgrow'], // Turtwig
  388: ['grass-warden', 'earth-warden', 'overgrow'], // Grotle
  389: ['earth-warden', 'grass-warden', 'stone-council'], // Torterra
  390: ['roaring-flame', 'blaze'], // Chimchar
  391: ['roaring-flame', 'rebel-spirit', 'blaze'], // Monferno
  392: ['roaring-flame', 'rebel-spirit', 'pack-alpha'], // Infernape
  393: ['tide-matriarch', 'torrent'], // Piplup
  394: ['tide-matriarch', 'torrent'], // Prinplup
  395: ['iron-marshal', 'tide-matriarch', 'torrent'], // Empoleon
  396: ['sky-lord', 'opening-act', 'intimidate'], // Starly
  397: ['sky-lord', 'intimidate', 'opening-act'], // Staravia
  398: ['sky-lord', 'reckless', 'opening-act'], // Staraptor
  399: ['moody', 'simple', 'unaware'], // Bidoof
  400: ['pickup', 'simple', 'unaware'], // Bibarel
  401: ['lullaby', 'swarm'], // Kricketot
  402: ['lullaby', 'swarm', 'technician'], // Kricketune
  403: ['volt-squad', 'static', 'volt-absorb'], // Shinx
  404: ['volt-squad', 'static', 'guts'], // Luxio
  405: ['volt-squad', 'intimidate', 'static'], // Luxray
  406: ['thorn-wreath', 'poison-point', 'overgrow'], // Budew
  407: ['thorn-wreath', 'grass-warden', 'toxic-crown'], // Roserade
  408: ['momentum', 'glass-cannon', 'sheer-force'], // Cranidos
  409: ['momentum', 'heavy-hitter', 'glass-cannon'], // Rampardos
  410: ['shell-shield', 'sturdy', 'stamina'], // Shieldon
  411: ['shell-shield', 'counterweight', 'sturdy'], // Bastiodon
  412: ['cocoon-guard', 'latent-power', 'swarm'], // Burmy
  413: ['cocoon-guard', 'overgrow', 'sturdy'], // Wormadam
  414: ['treasure-hound', 'swarm', 'moxie'], // Mothim
  415: ['scout', 'swarm', 'quick-feet'], // Combee
  416: ['hive-queen', 'rally', 'pressure'], // Vespiquen
  417: ['cheek-pouch', 'bargain', 'static'], // Pachirisu
  418: ['first-strike', 'torrent', 'quick-feet'], // Buizel
  419: ['first-strike', 'sniper', 'torrent'], // Floatzel
  420: ['verdant', 'overgrow', 'sap-sipper'], // Cherubi
  421: ['verdant', 'grass-warden', 'sap-sipper'], // Cherrim
  422: ['gluttony', 'shed-skin', 'water-absorb'], // Shellos
  423: ['gluttony', 'regenerator', 'rough-skin'], // Gastrodon
  424: ['first-strike', 'technician', 'scrappy'], // Ambipom
  425: ['aftermath', 'levitate', 'unburden'], // Drifloon
  426: ['aftermath', 'unburden', 'levitate'], // Drifblim
  427: ['first-strike', 'quick-feet', 'scrappy'], // Buneary
  428: ['first-strike', 'scrappy', 'sniper'], // Lopunny
  429: ['jinx', 'eerie-aura', 'magic-guard'], // Mismagius
  430: ['shadow-cabinet', 'moxie', 'super-luck'], // Honchkrow
  431: ['glory-hog', 'limber', 'quick-feet'], // Glameow
  432: ['glory-hog', 'intimidate', 'thick-fat'], // Purugly
  433: ['lullaby', 'magic-guard', 'levitate'], // Chingling
  434: ['corrosion', 'aftermath', 'poison-point'], // Stunky
  435: ['corrosion', 'aftermath', 'poison-point'], // Skuntank
  436: ['gravity', 'levitate', 'heatproof'], // Bronzor
  437: ['gravity', 'levitate', 'heatproof'], // Bronzong
  438: ['disguise', 'sturdy', 'solid-rock'], // Bonsly
  439: ['magic-bounce', 'magic-guard', 'levitate'], // Mime Jr.
  440: ['transfusion', 'renewal', 'den-mother'], // Happiny
  441: ['lullaby', 'tailwind', 'moxie'], // Chatot
  442: ['wraith-choir', 'eerie-aura', 'pressure'], // Spiritomb
  443: ['first-strike', 'rough-skin', 'sturdy'], // Gible
  444: ['first-strike', 'rough-skin', 'sturdy'], // Gabite
  445: ['first-strike', 'predator', 'sand-rush'], // Garchomp
  446: ['gluttony', 'thick-fat', 'immunity'], // Munchlax
  447: ['pack-alpha', 'inner-focus', 'steadfast'], // Riolu
  448: ['pack-alpha', 'justified', 'rival'], // Lucario
  449: ['earth-warden', 'sturdy', 'stamina'], // Hippopotas
  450: ['earth-warden', 'stamina', 'sturdy'], // Hippowdon
  451: ['corrosion', 'battle-armor', 'poison-point'], // Skorupi
  452: ['corrosion', 'sniper', 'moxie'], // Drapion
  453: ['first-strike', 'toxic-boost', 'poison-point'], // Croagunk
  454: ['first-strike', 'toxic-boost', 'opportunist'], // Toxicroak
  455: ['vampiric', 'overgrow', 'guts'], // Carnivine
  456: ['scout', 'speed-boost', 'water-absorb'], // Finneon
  457: ['scout', 'quick-feet', 'water-absorb'], // Lumineon
  458: ['tailwind', 'water-absorb', 'intimidate'], // Mantyke
  459: ['permafrost', 'thick-fat', 'overgrow'], // Snover
  460: ['permafrost', 'grass-warden', 'thick-fat'], // Abomasnow
  461: ['first-strike', 'shadow-cabinet', 'finisher'], // Weavile
  462: ['iron-marshal', 'download', 'static'], // Magnezone
  463: ['gluttony', 'own-tempo', 'thick-fat'], // Lickilicky
  464: ['cannoneer', 'stone-council', 'solid-rock'], // Rhyperior
  465: ['verdant', 'regenerator', 'overgrow'], // Tangrowth
  466: ['giant-slayer', 'motor-drive', 'volt-fury'], // Electivire
  467: ['cannoneer', 'roaring-flame', 'torch-pass'], // Magmortar
  468: ['fairy-court', 'magic-guard', 'tailwind'], // Togekiss
  469: ['first-strike', 'speed-boost', 'tinted-lens'], // Yanmega
  470: ['verdant', 'grass-warden', 'sap-sipper'], // Leafeon
  471: ['permafrost', 'thick-fat', 'battle-armor'], // Glaceon
  472: ['earth-warden', 'sky-lord', 'poison-heal'], // Gliscor
  473: ['permafrost', 'thick-fat', 'sturdy'], // Mamoswine
  474: ['download', 'analytic', 'overload'], // Porygon-Z
  475: ['riposte', 'justified', 'steadfast'], // Gallade
  476: ['stone-council', 'iron-marshal', 'sturdy'], // Probopass
  477: ['legacy', 'soul-battery', 'pressure'], // Dusknoir
  478: ['permafrost', 'wraith-choir', 'cursed-body'], // Froslass
  479: ['trickster', 'levitate', 'prankster'], // Rotom
  480: ['diviner', 'psi-network', 'magic-guard'], // Uxie
  481: ['psi-network', 'magic-guard', 'sheer-force'], // Mesprit
  482: ['overmind', 'psi-network', 'guts'], // Azelf
  483: ['dragonlord', 'iron-marshal', 'clear-body'], // Dialga
  484: ['dragonlord', 'tide-matriarch', 'torrent'], // Palkia
  485: ['flame-emperor', 'iron-marshal', 'flash-fire'], // Heatran
  486: ['slow-start', 'den-mother', 'stamina'], // Regigigas
  487: ['dragonlord', 'wraith-choir', 'levitate'], // Giratina
  488: ['renewal', 'magic-bounce', 'psi-network'], // Cresselia
  489: ['tide-matriarch', 'torrent', 'water-absorb'], // Phione
  490: ['tide-matriarch', 'transfusion', 'torrent'], // Manaphy
  491: ['lullaby', 'shadow-cabinet', 'jinx'], // Darkrai
  492: ['grass-warden', 'verdant', 'natural-cure'], // Shaymin
  493: ['genome', 'overmind', 'adaptability'], // Arceus

  // ===== Gen V — Unova =====
  494: ['fortune', 'roaring-flame'], // Victini
  495: ['grass-warden', 'contrary'], // Snivy
  496: ['grass-warden', 'contrary'], // Servine
  497: ['grass-warden', 'contrary'], // Serperior
  498: ['roaring-flame', 'blaze'], // Tepig
  499: ['roaring-flame', 'rebel-spirit'], // Pignite
  500: ['roaring-flame', 'rebel-spirit'], // Emboar
  501: ['first-strike', 'torrent'], // Oshawott
  502: ['first-strike', 'torrent'], // Dewott
  503: ['first-strike', 'tide-matriarch'], // Samurott
  504: ['scout', 'moxie'], // Patrat
  505: ['scout', 'inner-focus'], // Watchog
  506: ['den-mother', 'guts'], // Lillipup
  507: ['den-mother', 'guts'], // Herdier
  508: ['den-mother', 'scrappy'], // Stoutland
  509: ['trickster', 'unburden'], // Purrloin
  510: ['trickster', 'prankster'], // Liepard
  511: ['verdant', 'sap-sipper'], // Pansage
  512: ['verdant', 'sap-sipper'], // Simisage
  513: ['roaring-flame', 'flash-fire'], // Pansear
  514: ['roaring-flame', 'flash-fire'], // Simisear
  515: ['tide-matriarch', 'water-absorb'], // Panpour
  516: ['tide-matriarch', 'water-absorb'], // Simipour
  517: ['lullaby', 'magic-guard'], // Munna
  518: ['lullaby', 'psi-network'], // Musharna
  519: ['sky-lord', 'intimidate'], // Pidove
  520: ['sky-lord', 'intimidate'], // Tranquill
  521: ['sky-lord', 'intimidate'], // Unfezant
  522: ['momentum', 'static'], // Blitzle
  523: ['momentum', 'motor-drive'], // Zebstrika
  524: ['stone-council', 'sturdy'], // Roggenrola
  525: ['stone-council', 'sturdy'], // Boldore
  526: ['stone-council', 'sturdy'], // Gigalith
  527: ['tailwind', 'unaware'], // Woobat
  528: ['tailwind', 'simple'], // Swoobat
  529: ['earth-warden', 'sand-rush'], // Drilbur
  530: ['earth-warden', 'sand-rush'], // Excadrill
  531: ['renewal', 'rally'], // Audino
  532: ['pack-alpha', 'guts'], // Timburr
  533: ['pack-alpha', 'guts'], // Gurdurr
  534: ['pack-alpha', 'guts'], // Conkeldurr
  535: ['tide-matriarch', 'water-absorb'], // Tympole
  536: ['earth-warden', 'water-absorb'], // Palpitoad
  537: ['earth-warden', 'hydration'], // Seismitoad
  538: ['giant-slayer', 'guts'], // Throh
  539: ['first-strike', 'inner-focus'], // Sawk
  540: ['verdant', 'swarm'], // Sewaddle
  541: ['cocoon-guard', 'verdant'], // Swadloon
  542: ['hive-queen', 'swarm'], // Leavanny
  543: ['corrosion', 'poison-point'], // Venipede
  544: ['cocoon-guard', 'corrosion'], // Whirlipede
  545: ['corrosion', 'speed-boost'], // Scolipede
  546: ['prankster', 'magic-guard'], // Cottonee
  547: ['prankster', 'magic-guard'], // Whimsicott
  548: ['verdant', 'sap-sipper'], // Petilil
  549: ['verdant', 'moxie'], // Lilligant
  550: ['first-strike', 'moxie'], // Basculin
  551: ['menace', 'intimidate'], // Sandile
  552: ['menace', 'intimidate'], // Krokorok
  553: ['menace', 'shadow-cabinet'], // Krookodile
  554: ['roaring-flame', 'hustle'], // Darumaka
  555: ['roaring-flame', 'hustle'], // Darmanitan
  556: ['thorn-wreath', 'sap-sipper'], // Maractus
  557: ['shell-shield', 'sturdy'], // Dwebble
  558: ['stone-council', 'sturdy'], // Crustle
  559: ['swagger-king', 'intimidate'], // Scraggy
  560: ['swagger-king', 'moxie'], // Scrafty
  561: ['magic-bounce', 'magic-guard'], // Sigilyph
  562: ['legacy', 'levitate'], // Yamask
  563: ['wraith-choir', 'legacy'], // Cofagrigus
  564: ['shell-shield', 'sturdy'], // Tirtouga
  565: ['shell-shield', 'stone-council'], // Carracosta
  566: ['defeatist', 'first-strike'], // Archen
  567: ['defeatist', 'first-strike'], // Archeops
  568: ['corrosion', 'poison-point'], // Trubbish
  569: ['corrosion', 'gluttony'], // Garbodor
  570: ['disguise', 'rival'], // Zorua
  571: ['disguise', 'rival'], // Zoroark
  572: ['pickup', 'technician'], // Minccino
  573: ['fortune', 'technician'], // Cinccino
  574: ['diviner', 'magic-guard'], // Gothita
  575: ['diviner', 'levitate'], // Gothorita
  576: ['psi-network', 'diviner'], // Gothitelle
  577: ['backlash', 'magic-guard'], // Solosis
  578: ['backlash', 'magic-guard'], // Duosion
  579: ['backlash', 'psi-network'], // Reuniclus
  580: ['tide-matriarch', 'water-absorb'], // Ducklett
  581: ['sky-lord', 'water-absorb'], // Swanna
  582: ['permafrost', 'thick-fat'], // Vanillite
  583: ['permafrost', 'thick-fat'], // Vanillish
  584: ['permafrost', 'snow-cloak'], // Vanilluxe
  585: ['verdant', 'sap-sipper'], // Deerling
  586: ['verdant', 'sap-sipper'], // Sawsbuck
  587: ['tailwind', 'motor-drive'], // Emolga
  588: ['first-strike', 'swarm'], // Karrablast
  589: ['iron-marshal', 'first-strike'], // Escavalier
  590: ['lullaby', 'effect-spore'], // Foongus
  591: ['lullaby', 'effect-spore'], // Amoonguss
  592: ['wraith-choir', 'water-absorb'], // Frillish
  593: ['wraith-choir', 'water-absorb'], // Jellicent
  594: ['transfusion', 'renewal'], // Alomomola
  595: ['tempest', 'static'], // Joltik
  596: ['tempest', 'sticky'], // Galvantula
  597: ['thorn-wreath', 'stamina'], // Ferroseed
  598: ['grass-warden', 'iron-marshal'], // Ferrothorn
  599: ['iron-marshal', 'sturdy'], // Klink
  600: ['iron-marshal', 'stamina'], // Klang
  601: ['iron-marshal', 'momentum'], // Klinklang
  602: ['volt-squad', 'volt-absorb'], // Tynamo
  603: ['volt-squad', 'levitate'], // Eelektrik
  604: ['volt-squad', 'tempest'], // Eelektross
  605: ['psi-network', 'magic-guard'], // Elgyem
  606: ['psi-network', 'download'], // Beheeyem
  607: ['vampiric', 'flash-fire'], // Litwick
  608: ['soul-battery', 'flash-fire'], // Lampent
  609: ['wraith-choir', 'flash-fire'], // Chandelure
  610: ['dragonlord', 'sheer-force'], // Axew
  611: ['dragonlord', 'sheer-force'], // Fraxure
  612: ['dragonlord', 'heavy-hitter'], // Haxorus
  613: ['permafrost', 'thick-fat'], // Cubchoo
  614: ['permafrost', 'thick-fat'], // Beartic
  615: ['permafrost', 'levitate'], // Cryogonal
  616: ['shell-shield', 'battle-armor'], // Shelmet
  617: ['first-strike', 'moxie'], // Accelgor
  618: ['wild-card', 'regenerator'], // Stunfisk
  619: ['pack-alpha', 'regenerator'], // Mienfoo
  620: ['pack-alpha', 'regenerator'], // Mienshao
  621: ['riposte', 'rough-skin'], // Druddigon
  622: ['earth-warden', 'iron-marshal'], // Golett
  623: ['earth-warden', 'iron-marshal'], // Golurk
  624: ['first-strike', 'defiant'], // Pawniard
  625: ['iron-marshal', 'first-strike'], // Bisharp
  626: ['giant-slayer', 'sap-sipper'], // Bouffalant
  627: ['sky-lord', 'defiant'], // Rufflet
  628: ['sky-lord', 'defiant'], // Braviary
  629: ['vampiric', 'intimidate'], // Vullaby
  630: ['vampiric', 'sky-lord'], // Mandibuzz
  631: ['roaring-flame', 'flash-fire'], // Heatmor
  632: ['iron-marshal', 'hustle'], // Durant
  633: ['dragonlord', 'hustle'], // Deino
  634: ['dragonlord', 'sheer-force'], // Zweilous
  635: ['dragonlord', 'predator'], // Hydreigon
  636: ['roaring-flame', 'flame-body'], // Larvesta
  637: ['flame-emperor', 'torch-pass'], // Volcarona
  638: ['pack-alpha', 'iron-marshal', 'justified'], // Cobalion
  639: ['pack-alpha', 'stone-council'], // Terrakion
  640: ['pack-alpha', 'grass-warden'], // Virizion
  641: ['sky-lord', 'tempest'], // Tornadus
  642: ['tempest', 'sky-lord'], // Thundurus
  643: ['dragonlord', 'flame-emperor', 'roaring-flame'], // Reshiram
  644: ['dragonlord', 'tempest'], // Zekrom
  645: ['earth-warden', 'sky-lord'], // Landorus
  646: ['dragonlord', 'permafrost', 'sheer-cold'], // Kyurem
  647: ['tide-matriarch', 'rebel-spirit'], // Keldeo
  648: ['lullaby', 'psi-network'], // Meloetta
  649: ['iron-marshal', 'download', 'first-strike'], // Genesect

  // ===== Gen VI — Kalos =====
  650: ['thorn-wreath', 'overgrow'], // Chespin
  651: ['counterweight', 'thorn-wreath', 'overgrow'], // Quilladin
  652: ['grass-warden', 'pack-alpha', 'counterweight'], // Chesnaught
  653: ['roaring-flame', 'blaze'], // Fennekin
  654: ['roaring-flame', 'psi-network', 'blaze'], // Braixen
  655: ['roaring-flame', 'psi-network'], // Delphox
  656: ['first-strike', 'torrent'], // Froakie
  657: ['first-strike', 'tide-matriarch', 'torrent'], // Frogadier
  658: ['tide-matriarch', 'first-strike', 'torrent'], // Greninja
  659: ['pickup', 'scrappy', 'scout'], // Bunnelby
  660: ['treasure-hound', 'pickup', 'heavy-hitter'], // Diggersby
  661: ['tailwind', 'big-pecks', 'scout'], // Fletchling
  662: ['roaring-flame', 'flame-body', 'tailwind'], // Fletchinder
  663: ['flame-emperor', 'sky-lord', 'flame-body'], // Talonflame
  664: ['daunt', 'shield-dust', 'swarm'], // Scatterbug
  665: ['cocoon-guard', 'shed-skin', 'sturdy'], // Spewpa
  666: ['tailwind', 'lullaby', 'shield-dust'], // Vivillon
  667: ['glory-hog', 'roaring-flame', 'moxie'], // Litleo
  668: ['glory-hog', 'moxie', 'showboat'], // Pyroar
  669: ['verdant', 'fairy-court', 'magic-guard'], // Flabebe
  670: ['fairy-court', 'verdant', 'magic-guard'], // Floette
  671: ['fairy-court', 'grass-warden'], // Florges
  672: ['verdant', 'sap-sipper', 'overgrow'], // Skiddo
  673: ['verdant', 'sap-sipper'], // Gogoat
  674: ['giant-slayer', 'guts', 'moxie'], // Pancham
  675: ['pack-alpha', 'shadow-cabinet', 'guts'], // Pangoro
  676: ['counterweight', 'fur-coat', 'quick-feet'], // Furfrou
  677: ['latent-power', 'magic-guard', 'levitate'], // Espurr
  678: ['psi-network', 'prankster', 'magic-guard'], // Meowstic Male
  679: ['cursed-body', 'levitate', 'battle-armor'], // Honedge
  680: ['riposte', 'cursed-body', 'iron-marshal'], // Doublade
  681: ['iron-marshal', 'stall', 'no-guard'], // Aegislash Shield
  682: ['lullaby', 'thick-fat', 'magic-guard'], // Spritzee
  683: ['eerie-aura', 'lullaby', 'magic-guard'], // Aromatisse
  684: ['gluttony', 'magic-guard', 'stamina'], // Swirlix
  685: ['treasure-hound', 'gluttony', 'unburden'], // Slurpuff
  686: ['trickster', 'contrary', 'own-tempo'], // Inkay
  687: ['trickster', 'contrary', 'own-tempo'], // Malamar
  688: ['shell-shield', 'counterweight', 'sturdy'], // Binacle
  689: ['stone-council', 'counterweight', 'solid-rock'], // Barbaracle
  690: ['corrosion', 'poison-point', 'adaptability'], // Skrelp
  691: ['toxic-crown', 'corrosion', 'poison-point'], // Dragalge
  692: ['cannoneer', 'water-absorb', 'sturdy'], // Clauncher
  693: ['cannoneer', 'water-absorb', 'torrent'], // Clawitzer
  694: ['tempest', 'cheek-pouch', 'static'], // Helioptile
  695: ['tempest', 'cheek-pouch', 'static'], // Heliolisk
  696: ['first-strike', 'dragonlord', 'moxie'], // Tyrunt
  697: ['dragonlord', 'stone-council', 'first-strike'], // Tyrantrum
  698: ['permafrost', 'thick-fat', 'sturdy'], // Amaura
  699: ['stone-council', 'permafrost', 'thick-fat'], // Aurorus
  700: ['fairy-court', 'magic-guard'], // Sylveon
  701: ['sky-lord', 'rebel-spirit', 'giant-slayer'], // Hawlucha
  702: ['cheek-pouch', 'fairy-court', 'static'], // Dedenne
  703: ['stone-council', 'fairy-court', 'sturdy'], // Carbink
  704: ['renewal', 'marvel-scale', 'multiscale'], // Goomy
  705: ['renewal', 'marvel-scale', 'stamina'], // Sliggoo
  706: ['dragonlord', 'marvel-scale', 'renewal'], // Goodra
  707: ['iron-marshal', 'prankster', 'curator'], // Klefki
  708: ['lullaby', 'levitate', 'overgrow'], // Phantump
  709: ['wraith-choir', 'grass-warden', 'levitate'], // Trevenant
  710: ['lullaby', 'sturdy', 'levitate'], // Pumpkaboo Average
  711: ['wraith-choir', 'gluttony', 'lullaby'], // Gourgeist Average
  712: ['counterweight', 'permafrost', 'thick-fat'], // Bergmite
  713: ['permafrost', 'counterweight', 'thick-fat'], // Avalugg
  714: ['screech', 'gale-force', 'intimidate'], // Noibat
  715: ['dragonlord', 'sky-lord', 'gale-force'], // Noivern
  716: ['fairy-court', 'renewal', 'magic-guard'], // Xerneas
  717: ['shadow-cabinet', 'vampiric', 'sky-lord'], // Yveltal
  718: ['dragonlord', 'earth-warden', 'marvel-scale'], // Zygarde 50
  719: ['stone-council', 'fairy-court', 'magic-guard'], // Diancie
  720: ['psi-network', 'wraith-choir', 'magic-bounce'], // Hoopa
  721: ['flame-emperor', 'tide-matriarch', 'roaring-flame'], // Volcanion

  // ===== Gen VII — Alola =====
  722: ['scout', 'overgrow'], // Rowlet
  723: ['first-strike', 'overgrow', 'regenerator'], // Dartrix
  724: ['first-strike', 'wraith-choir', 'long-reach'], // Decidueye
  725: ['roaring-flame', 'flash-fire', 'blaze'], // Litten
  726: ['roaring-flame', 'speed-boost', 'blaze'], // Torracat
  727: ['roaring-flame', 'shadow-cabinet', 'intimidate'], // Incineroar
  728: ['tide-matriarch', 'torrent'], // Popplio
  729: ['tailwind', 'torrent'], // Brionne
  730: ['tide-matriarch', 'fairy-court', 'lullaby'], // Primarina
  731: ['cannoneer', 'sky-lord'], // Pikipek
  732: ['cannoneer', 'sky-lord', 'intimidate'], // Trumbeak
  733: ['cannoneer', 'sky-lord', 'sheer-force'], // Toucannon
  734: ['first-strike', 'predator', 'scrappy'], // Yungoos
  735: ['first-strike', 'predator', 'scrappy'], // Gumshoos
  736: ['cheek-pouch', 'swarm'], // Grubbin
  737: ['cheek-pouch', 'cocoon-guard', 'static'], // Charjabug
  738: ['tempest', 'cheek-pouch', 'static'], // Vikavolt
  739: ['riposte', 'guts', 'justified'], // Crabrawler
  740: ['pack-alpha', 'permafrost', 'guts'], // Crabominable
  741: ['tailwind', 'wild-card'], // Oricorio
  742: ['tailwind', 'magic-guard'], // Cutiefly
  743: ['fairy-court', 'tailwind', 'magic-guard'], // Ribombee
  744: ['first-strike', 'stone-council', 'sturdy'], // Rockruff
  745: ['first-strike', 'stone-council', 'sand-rush'], // Lycanroc
  746: ['giant-slayer', 'tide-matriarch'], // Wishiwashi
  747: ['corrosion', 'poison-point', 'stamina'], // Mareanie
  748: ['corrosion', 'filter', 'pressure'], // Toxapex
  749: ['counterweight', 'stamina', 'sturdy'], // Mudbray
  750: ['earth-warden', 'stamina', 'sturdy'], // Mudsdale
  751: ['shell-shield', 'torrent', 'battle-armor'], // Dewpider
  752: ['backlash', 'tide-matriarch', 'shell-shield'], // Araquanid
  753: ['first-strike', 'overgrow', 'sap-sipper'], // Fomantis
  754: ['grass-warden', 'first-strike', 'sheer-force'], // Lurantis
  755: ['lullaby', 'magic-guard', 'effect-spore'], // Morelull
  756: ['vampiric', 'lullaby', 'magic-guard'], // Shiinotic
  757: ['corrosion', 'poison-point', 'blaze'], // Salandit
  758: ['corrosion', 'toxic-boost', 'opportunist'], // Salazzle
  759: ['riposte', 'fur-coat', 'guts'], // Stufful
  760: ['pack-alpha', 'den-mother', 'guts'], // Bewear
  761: ['renewal', 'sap-sipper'], // Bounsweet
  762: ['first-strike', 'speed-boost', 'sap-sipper'], // Steenee
  763: ['first-strike', 'rebel-spirit', 'sheer-force'], // Tsareena
  764: ['renewal', 'parting-gift', 'natural-cure'], // Comfey
  765: ['psi-network', 'analytic', 'veteran'], // Oranguru
  766: ['pack-alpha', 'momentum', 'rally'], // Passimian
  767: ['treasure-hound', 'scout', 'torrent'], // Wimpod
  768: ['first-strike', 'backlash', 'stamina'], // Golisopod
  769: ['cursed-body', 'levitate', 'rough-skin'], // Sandygast
  770: ['wraith-choir', 'earth-warden', 'vampiric'], // Palossand
  771: ['counterweight', 'stall', 'aftermath'], // Pyukumuku
  772: ['genome', 'overmind', 'adaptability'], // Type: Null
  773: ['genome', 'overmind', 'adaptability'], // Silvally
  774: ['shell-shield', 'stone-council', 'sturdy'], // Minior
  775: ['lullaby', 'oblivious'], // Komala
  776: ['roaring-flame', 'backlash', 'sturdy'], // Turtonator
  777: ['cheek-pouch', 'iron-barbs', 'static'], // Togedemaru
  778: ['disguise', 'plot-armor', 'trickster'], // Mimikyu
  779: ['first-strike', 'psi-network', 'screech'], // Bruxish
  780: ['dragonlord', 'den-mother', 'marvel-scale'], // Drampa
  781: ['wraith-choir', 'long-reach', 'vampiric'], // Dhelmise
  782: ['first-strike', 'marvel-scale', 'sturdy'], // Jangmo-o
  783: ['menace', 'marvel-scale', 'guts'], // Hakamo-o
  784: ['dragonlord', 'pack-alpha', 'marvel-scale'], // Kommo-o
  785: ['fairy-court', 'tempest', 'volt-squad'], // Tapu Koko
  786: ['fairy-court', 'psi-network', 'renewal'], // Tapu Lele
  787: ['fairy-court', 'grass-warden', 'verdant'], // Tapu Bulu
  788: ['fairy-court', 'tide-matriarch', 'natural-cure'], // Tapu Fini
  789: ['latent-power', 'counterweight', 'levitate'], // Cosmog
  790: ['latent-power', 'counterweight', 'sturdy'], // Cosmoem
  791: ['iron-marshal', 'psi-network', 'first-strike'], // Solgaleo
  792: ['wraith-choir', 'psi-network', 'lullaby'], // Lunala
  793: ['corrosion', 'stone-council', 'eerie-aura'], // Nihilego
  794: ['pack-alpha', 'giant-slayer', 'vampiric'], // Buzzwole
  795: ['first-strike', 'glass-cannon', 'speed-boost'], // Pheromosa
  796: ['tempest', 'cheek-pouch', 'overload'], // Xurkitree
  797: ['iron-marshal', 'sky-lord', 'heavy-hitter'], // Celesteela
  798: ['first-strike', 'iron-marshal', 'giant-slayer'], // Kartana
  799: ['vampiric', 'shadow-cabinet', 'gluttony'], // Guzzlord
  800: ['overmind', 'first-strike', 'psi-network'], // Necrozma
  801: ['iron-marshal', 'fairy-court', 'soul-battery'], // Magearna
  802: ['first-strike', 'wraith-choir', 'pack-alpha'], // Marshadow
  803: ['corrosion', 'cannoneer', 'poison-point'], // Poipole
  804: ['cannoneer', 'corrosion', 'sniper'], // Naganadel
  805: ['stone-council', 'counterweight', 'sturdy'], // Stakataka
  806: ['aftermath', 'roaring-flame', 'levitate'], // Blacephalon
  807: ['tempest', 'first-strike', 'volt-fury'], // Zeraora
  808: ['iron-marshal', 'heavy-hitter', 'heatproof'], // Meltan
  809: ['iron-marshal', 'heavy-hitter', 'counterweight'], // Melmetal

  // ===== Gen VIII — Galar =====
  810: ['grass-warden', 'overgrow', 'sap-sipper'], // Grookey
  811: ['grass-warden', 'momentum', 'overgrow'], // Thwackey
  812: ['grass-warden', 'pack-alpha'], // Rillaboom
  813: ['roaring-flame', 'first-strike', 'blaze'], // Scorbunny
  814: ['roaring-flame', 'first-strike', 'blaze'], // Raboot
  815: ['roaring-flame', 'first-strike'], // Cinderace
  816: ['cannoneer', 'sniper', 'torrent'], // Sobble
  817: ['cannoneer', 'sniper', 'first-strike'], // Drizzile
  818: ['cannoneer', 'first-strike', 'sniper'], // Inteleon
  819: ['treasure-hound', 'pickup', 'gluttony'], // Skwovet
  820: ['treasure-hound', 'pickup'], // Greedent
  821: ['first-strike', 'sky-lord', 'intimidate'], // Rookidee
  822: ['first-strike', 'sky-lord', 'intimidate'], // Corvisquire
  823: ['iron-marshal', 'sky-lord'], // Corviknight
  824: ['scout', 'swarm', 'compound-eyes'], // Blipbug
  825: ['psi-network', 'scout', 'magic-guard'], // Dottler
  826: ['psi-network', 'magic-bounce'], // Orbeetle
  827: ['fortune', 'shadow-cabinet', 'pickup'], // Nickit
  828: ['shadow-cabinet', 'fortune'], // Thievul
  829: ['verdant', 'renewal', 'sap-sipper'], // Gossifleur
  830: ['grass-warden', 'renewal'], // Eldegoss
  831: ['counterweight', 'fur-coat', 'stamina'], // Wooloo
  832: ['counterweight', 'fur-coat'], // Dubwool
  833: ['first-strike', 'predator', 'guts'], // Chewtle
  834: ['stone-council', 'first-strike'], // Drednaw
  835: ['tempest', 'first-strike', 'pickup'], // Yamper
  836: ['tempest', 'first-strike'], // Boltund
  837: ['stone-council', 'roaring-flame', 'sturdy'], // Rolycoly
  838: ['stone-council', 'roaring-flame', 'sturdy'], // Carkol
  839: ['stone-council', 'roaring-flame'], // Coalossal
  840: ['cocoon-guard', 'dragonlord', 'grass-warden'], // Applin
  841: ['dragonlord', 'grass-warden'], // Flapple
  842: ['dragonlord', 'grass-warden', 'thick-fat'], // Appletun
  843: ['earth-warden', 'stamina', 'rough-skin'], // Silicobra
  844: ['earth-warden', 'stamina'], // Sandaconda
  845: ['gluttony', 'tide-matriarch'], // Cramorant
  846: ['first-strike', 'predator', 'speed-boost'], // Arrokuda
  847: ['first-strike', 'tide-matriarch'], // Barraskewda
  848: ['corrosion', 'tempest', 'poison-point'], // Toxel
  849: ['tempest', 'corrosion'], // Toxtricity Amped
  850: ['roaring-flame', 'backlash', 'swarm'], // Sizzlipede
  851: ['roaring-flame', 'backlash'], // Centiskorch
  852: ['pack-alpha', 'riposte', 'guts'], // Clobbopus
  853: ['pack-alpha', 'riposte'], // Grapploct
  854: ['wraith-choir', 'disguise', 'eerie-aura'], // Sinistea
  855: ['wraith-choir', 'eerie-aura'], // Polteageist
  856: ['magic-bounce', 'fairy-court', 'magic-guard'], // Hatenna
  857: ['magic-bounce', 'fairy-court', 'sheer-force'], // Hattrem
  858: ['magic-bounce', 'fairy-court'], // Hatterene
  859: ['prankster', 'shadow-cabinet', 'fairy-court'], // Impidimp
  860: ['trickster', 'prankster', 'fairy-court'], // Morgrem
  861: ['shadow-cabinet', 'fairy-court', 'prankster'], // Grimmsnarl
  862: ['swagger-king', 'first-strike', 'defiant'], // Obstagoon
  863: ['iron-marshal', 'pickup'], // Perrserker
  864: ['perish-body', 'wraith-choir', 'cursed-body'], // Cursola
  865: ['first-strike', 'pack-alpha', 'guts'], // Sirfetch'd
  866: ['magic-bounce', 'permafrost', 'thick-fat'], // Mr. Rime
  867: ['perish-body', 'wraith-choir', 'sturdy'], // Runerigus
  868: ['renewal', 'fairy-court', 'magic-guard'], // Milcery
  869: ['fairy-court', 'renewal'], // Alcremie
  870: ['pack-alpha', 'rally', 'counterweight'], // Falinks
  871: ['backlash', 'tempest', 'static'], // Pincurchin
  872: ['cocoon-guard', 'permafrost', 'swarm'], // Snom
  873: ['permafrost', 'lullaby'], // Frosmoth
  874: ['stone-council', 'counterweight', 'sturdy'], // Stonjourner
  875: ['permafrost', 'shell-shield', 'thick-fat'], // Eiscue Ice
  876: ['psi-network', 'fairy-court', 'renewal'], // Indeedee Male
  877: ['cheek-pouch', 'wild-card', 'quick-feet'], // Morpeko Full Belly
  878: ['iron-marshal', 'earth-warden', 'heatproof'], // Cufant
  879: ['iron-marshal', 'earth-warden'], // Copperajah
  880: ['first-strike', 'earth-warden', 'tempest'], // Dracozolt
  881: ['permafrost', 'tempest', 'static'], // Arctozolt
  882: ['first-strike', 'predator', 'vampiric'], // Dracovish
  883: ['permafrost', 'predator', 'thick-fat'], // Arctovish
  884: ['iron-marshal', 'dragonlord', 'clear-body'], // Duraludon
  885: ['latent-power', 'dragonlord', 'cursed-body'], // Dreepy
  886: ['dragonlord', 'first-strike', 'cursed-body'], // Drakloak
  887: ['dragonlord', 'predator', 'cursed-body'], // Dragapult
  888: ['first-strike', 'fairy-court', 'iron-marshal'], // Zacian
  889: ['pack-alpha', 'iron-marshal', 'counterweight'], // Zamazenta
  890: ['toxic-crown', 'dragonlord', 'corrosion'], // Eternatus
  891: ['pack-alpha', 'first-strike', 'guts'], // Kubfu
  892: ['pack-alpha', 'first-strike', 'shadow-cabinet'], // Urshifu Single Strike
  893: ['shadow-cabinet', 'grass-warden', 'renewal'], // Zarude
  894: ['tempest', 'volt-fury', 'motor-drive'], // Regieleki
  895: ['dragonlord', 'heavy-hitter', 'multiscale'], // Regidrago
  896: ['permafrost', 'counterweight', 'sturdy'], // Glastrier
  897: ['wraith-choir', 'first-strike', 'vampiric'], // Spectrier
  898: ['psi-network', 'grass-warden', 'renewal'], // Calyrex
  899: ['den-mother', 'psi-network', 'adaptability'], // Wyrdeer
  900: ['first-strike', 'heavy-hitter', 'sturdy'], // Kleavor
  901: ['giant-slayer', 'guts', 'quick-feet'], // Ursaluna
  902: ['vampiric', 'adaptability', 'moxie'], // Basculegion Male
  903: ['first-strike', 'technician', 'poison-point'], // Sneasler
  904: ['corrosion', 'poison-point', 'intimidate'], // Overqwil
  905: ['fairy-court', 'sky-lord', 'fairy-wrath'], // Enamorus Incarnate

  // ===== Gen IX — Paldea =====
  906: ['first-strike', 'grass-warden', 'overgrow'], // Sprigatito
  907: ['first-strike', 'grass-warden', 'overgrow'], // Floragato
  908: ['shadow-cabinet', 'first-strike', 'overgrow'], // Meowscarada
  909: ['roaring-flame', 'blaze', 'flash-fire'], // Fuecoco
  910: ['roaring-flame', 'blaze', 'flash-fire'], // Crocalor
  911: ['roaring-flame', 'wraith-choir', 'blaze'], // Skeledirge
  912: ['tide-matriarch', 'first-strike', 'torrent'], // Quaxly
  913: ['tide-matriarch', 'first-strike', 'torrent'], // Quaxwell
  914: ['tide-matriarch', 'pack-alpha', 'first-strike'], // Quaquaval
  915: ['gluttony', 'thick-fat', 'scrappy'], // Lechonk
  916: ['gluttony', 'thick-fat', 'scrappy'], // Oinkologne
  917: ['riposte', 'swarm', 'technician'], // Tarountula
  918: ['riposte', 'swarm', 'technician'], // Spidops
  919: ['first-strike', 'swarm', 'technician'], // Nymble
  920: ['first-strike', 'shadow-cabinet', 'swarm'], // Lokix
  921: ['cheek-pouch', 'static', 'volt-absorb'], // Pawmi
  922: ['cheek-pouch', 'first-strike', 'static'], // Pawmo
  923: ['cheek-pouch', 'first-strike', 'static'], // Pawmot
  924: ['den-mother', 'fortune', 'adaptability'], // Tandemaus
  925: ['den-mother', 'fortune', 'adaptability'], // Maushold
  926: ['fairy-court', 'den-mother', 'magic-guard'], // Fidough
  927: ['fairy-court', 'den-mother', 'heatproof'], // Dachsbun
  928: ['grass-warden', 'verdant', 'overgrow'], // Smoliv
  929: ['grass-warden', 'verdant', 'overgrow'], // Dolliv
  930: ['grass-warden', 'verdant', 'overgrow'], // Arboliva
  931: ['first-strike', 'sky-lord', 'intimidate'], // Squawkabilly
  932: ['stone-council', 'renewal', 'sturdy'], // Nacli
  933: ['stone-council', 'renewal', 'sturdy'], // Naclstack
  934: ['stone-council', 'renewal', 'sturdy'], // Garganacl
  935: ['roaring-flame', 'blaze', 'flash-fire'], // Charcadet
  936: ['roaring-flame', 'psi-network', 'blaze'], // Armarouge
  937: ['wraith-choir', 'roaring-flame', 'blaze'], // Ceruledge
  938: ['tempest', 'static', 'volt-absorb'], // Tadbulb
  939: ['tempest', 'backlash', 'static'], // Bellibolt
  940: ['tempest', 'sky-lord', 'static'], // Wattrel
  941: ['tempest', 'sky-lord', 'static'], // Kilowattrel
  942: ['shadow-cabinet', 'intimidate', 'moxie'], // Maschiff
  943: ['shadow-cabinet', 'intimidate', 'moxie'], // Mabosstiff
  944: ['corrosion', 'poison-point', 'adaptability'], // Shroodle
  945: ['corrosion', 'wild-card', 'poison-point'], // Grafaiai
  946: ['wraith-choir', 'grass-warden', 'levitate'], // Bramblin
  947: ['wraith-choir', 'grass-warden', 'levitate'], // Brambleghast
  948: ['earth-warden', 'grass-warden', 'rough-skin'], // Toedscool
  949: ['earth-warden', 'grass-warden', 'rough-skin'], // Toedscruel
  950: ['stone-council', 'counterweight', 'sturdy'], // Klawf
  951: ['corrosion', 'overgrow', 'sap-sipper'], // Capsakid
  952: ['roaring-flame', 'corrosion', 'overgrow'], // Scovillain
  953: ['momentum', 'swarm', 'technician'], // Rellor
  954: ['psi-network', 'magic-guard', 'swarm'], // Rabsca
  955: ['psi-network', 'magic-guard', 'levitate'], // Flittle
  956: ['psi-network', 'magic-guard', 'speed-boost'], // Espathra
  957: ['fairy-court', 'giant-slayer', 'magic-guard'], // Tinkatink
  958: ['fairy-court', 'giant-slayer', 'magic-guard'], // Tinkatuff
  959: ['fairy-court', 'giant-slayer', 'magic-guard'], // Tinkaton
  960: ['first-strike', 'tide-matriarch', 'water-absorb'], // Wiglett
  961: ['first-strike', 'tide-matriarch', 'water-absorb'], // Wugtrio
  962: ['sky-lord', 'predator', 'intimidate'], // Bombirdier
  963: ['tide-matriarch', 'torrent', 'water-absorb'], // Finizen
  964: ['giant-slayer', 'tide-matriarch', 'transform'], // Palafin
  965: ['iron-marshal', 'momentum', 'poison-point'], // Varoom
  966: ['iron-marshal', 'momentum', 'poison-point'], // Revavroom
  967: ['first-strike', 'dragonlord', 'momentum'], // Cyclizar
  968: ['iron-marshal', 'counterweight', 'sturdy'], // Orthworm
  969: ['stone-council', 'corrosion', 'poison-point'], // Glimmet
  970: ['stone-council', 'corrosion', 'poison-point'], // Glimmora
  971: ['wraith-choir', 'legacy', 'levitate'], // Greavard
  972: ['wraith-choir', 'legacy', 'levitate'], // Houndstone
  973: ['pack-alpha', 'sky-lord', 'intimidate'], // Flamigo
  974: ['permafrost', 'gluttony', 'thick-fat'], // Cetoddle
  975: ['permafrost', 'gluttony', 'thick-fat'], // Cetitan
  976: ['first-strike', 'psi-network', 'torrent'], // Veluza
  977: ['den-mother', 'counterweight', 'water-absorb'], // Dondozo
  978: ['tide-matriarch', 'trickster', 'disguise'], // Tatsugiri
  979: ['revenge-cry', 'rebel-spirit', 'guts'], // Annihilape
  980: ['earth-warden', 'corrosion', 'poison-point'], // Clodsire
  981: ['psi-network', 'den-mother', 'regenerator'], // Farigiraf
  982: ['wild-card', 'sturdy', 'thick-fat'], // Dudunsparce
  983: ['iron-marshal', 'steel-heart', 'pack-alpha'], // Kingambit
  984: ['earth-warden', 'giant-slayer', 'latent-power'], // Great Tusk
  985: ['fairy-court', 'latent-power', 'lullaby'], // Scream Tail
  986: ['shadow-cabinet', 'vampiric', 'latent-power'], // Brute Bonnet
  987: ['wraith-choir', 'latent-power', 'fairy-court'], // Flutter Mane
  988: ['pack-alpha', 'latent-power', 'swarm'], // Slither Wing
  989: ['tempest', 'earth-warden', 'latent-power'], // Sandy Shocks
  990: ['iron-marshal', 'earth-warden', 'latent-power'], // Iron Treads
  991: ['permafrost', 'first-strike', 'latent-power'], // Iron Bundle
  992: ['pack-alpha', 'cheek-pouch', 'latent-power'], // Iron Hands
  993: ['shadow-cabinet', 'sky-lord', 'latent-power'], // Iron Jugulis
  994: ['roaring-flame', 'corrosion', 'latent-power'], // Iron Moth
  995: ['stone-council', 'tempest', 'latent-power'], // Iron Thorns
  996: ['dragonlord', 'permafrost', 'marvel-scale'], // Frigibax
  997: ['dragonlord', 'permafrost', 'marvel-scale'], // Arctibax
  998: ['dragonlord', 'permafrost', 'thick-fat'], // Baxcalibur
  999: ['fortune', 'treasure-hound', 'levitate'], // Gimmighoul
  1000: ['fortune', 'pickup', 'treasure-hound'], // Gholdengo
  1001: ['ruin', 'shadow-cabinet', 'grass-warden'], // Wo-Chien
  1002: ['ruin', 'permafrost', 'first-strike'], // Chien-Pao
  1003: ['ruin', 'earth-warden', 'counterweight'], // Ting-Lu
  1004: ['ruin', 'roaring-flame', 'shadow-cabinet'], // Chi-Yu
  1005: ['dragonlord', 'shadow-cabinet', 'latent-power'], // Roaring Moon
  1006: ['fairy-court', 'first-strike', 'latent-power'], // Iron Valiant
  1007: ['dragonlord', 'pack-alpha', 'first-strike'], // Koraidon
  1008: ['dragonlord', 'tempest', 'volt-squad'], // Miraidon
  1009: ['deluge', 'dragonlord', 'latent-power'], // Walking Wake
  1010: ['grass-warden', 'first-strike', 'latent-power'], // Iron Leaves
  1011: ['dragonlord', 'grass-warden', 'overgrow'], // Dipplin
  1012: ['wraith-choir', 'renewal', 'levitate'], // Poltchageist
  1013: ['wraith-choir', 'renewal', 'levitate'], // Sinistcha
  1014: ['pack-alpha', 'shadow-cabinet', 'guts'], // Okidogi
  1015: ['psi-network', 'wraith-choir', 'corrosion'], // Munkidori
  1016: ['fairy-court', 'fortune', 'corrosion'], // Fezandipiti
  1017: ['grass-warden', 'first-strike', 'sap-sipper'], // Ogerpon
  1018: ['iron-marshal', 'dragonlord', 'cannoneer'], // Archaludon
  1019: ['dragonlord', 'grass-warden', 'overgrow'], // Hydrapple
  1020: ['roaring-flame', 'dragonlord', 'latent-power'], // Gouging Fire
  1021: ['tempest', 'dragonlord', 'latent-power'], // Raging Bolt
  1022: ['stone-council', 'first-strike', 'latent-power'], // Iron Boulder
  1023: ['psi-network', 'iron-marshal', 'latent-power'], // Iron Crown
  1024: ['overmind', 'stone-council', 'multiscale'], // Terapagos
  1025: ['wraith-choir', 'corrosion', 'toxic-crown'], // Pecharunt
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
