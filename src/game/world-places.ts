import type { ExpeditionNode, ExpeditionTemplate, Place } from './world.js';

// Hearthvale's authored content. Adding a place is one entry here plus its
// spot in the map art (scripts/build-world-map.ts); the screens, the API and
// the tests iterate this list. `r1` and `r2` keep the ids the paused idle
// routes used, so old session rows still point at real places.

const MIN = 60 * 1000;

type Step =
  | { kind: 'battle'; title: string; text: string; levelBonus?: number; rareBoost?: number }
  | { kind: 'sighting'; title: string; text: string; levelBonus?: number; rareBoost?: number }
  | { kind: 'landmark'; title: string; text: string; landmark: string; guardedChance: number; levelBonus?: number };

interface Branch {
  label: string;
  hint: string;
  steps: Step[];
}

/**
 * Every expedition has the same shape: a trailhead sighting, a fork, one of
 * two branches, then the guardian. Node ids: trailhead, fork, a1…, b1…, guardian.
 */
function expedition(spec: {
  trailhead: { title: string; text: string };
  fork: { title: string; text: string; a: Branch; b: Branch };
  guardian: { title: string; text: string };
}): ExpeditionTemplate {
  const nodes: Record<string, ExpeditionNode> = {};
  const chain = (prefix: 'a' | 'b', steps: Step[]): string => {
    steps.forEach((s, i) => {
      const id = `${prefix}${i + 1}`;
      nodes[id] = { ...s, id, next: i + 1 < steps.length ? `${prefix}${i + 2}` : 'guardian' };
    });
    return `${prefix}1`;
  };
  nodes.trailhead = { kind: 'sighting', id: 'trailhead', next: 'fork', ...spec.trailhead };
  nodes.fork = {
    kind: 'fork',
    id: 'fork',
    title: spec.fork.title,
    text: spec.fork.text,
    options: [
      { id: 'a', label: spec.fork.a.label, hint: spec.fork.a.hint, next: chain('a', spec.fork.a.steps) },
      { id: 'b', label: spec.fork.b.label, hint: spec.fork.b.hint, next: chain('b', spec.fork.b.steps) },
    ],
  };
  nodes.guardian = { kind: 'guardian', id: 'guardian', ...spec.guardian };
  return { start: 'trailhead', nodes };
}

export const PLACES: readonly Place[] = [
  {
    kind: 'home',
    id: 'home',
    name: 'Hearth Town',
    biome: 'town',
    blurb: 'Home. The professor’s lab, a Pokémon Center, and the road north to Route 1.',
    map: { x: 104, y: 506 },
    neighbours: ['r1'],
  },
  {
    kind: 'route',
    id: 'r1',
    routeLabel: 'Route 1',
    name: 'Sunny Meadow',
    biome: 'meadow',
    blurb: 'Tall grass and wildflowers just outside town. Every trainer’s first steps.',
    map: { x: 204, y: 430 },
    neighbours: ['home', 'r2'],
    unlock: [],
    recommended: { min: 3, max: 8 },
    wild: {
      min: 2,
      max: 5,
      statMult: 0.6,
      pool: [
        { dexId: 161, weight: 3 }, // Sentret
        { dexId: 263, weight: 3 }, // Zigzagoon
        { dexId: 16, weight: 3 }, // Pidgey
        { dexId: 19, weight: 3 }, // Rattata
        { dexId: 187, weight: 2 }, // Hoppip
        { dexId: 191, weight: 2 }, // Sunkern
        { dexId: 401, weight: 2 }, // Kricketot
        { dexId: 399, weight: 2 }, // Bidoof
        { dexId: 133, weight: 1, rare: true }, // Eevee
      ],
    },
    training: { paceMs: 4 * MIN, maxEncounters: 120, expPerWin: 6 },
    explore: { expPerWin: 10, clearBonus: 30 },
    guardian: { dexId: 162, level: 7, statMult: 0.55, title: 'Meadow guardian' }, // Furret
    landmarks: [
      { id: 'signpost', name: 'Old Signpost', blurb: 'Weathered arrows point to places you haven’t been yet.' },
      { id: 'sunflowers', name: 'Sunflower Patch', blurb: 'Sunkern doze between stalks taller than you.' },
      { id: 'hilltop-oak', name: 'Hilltop Oak', blurb: 'The oldest tree on the route, full of Pidgey nests.' },
    ],
    expedition: expedition({
      trailhead: { title: 'Rustling grass', text: 'The grass by the town gate twitches. Something small is watching you.' },
      fork: {
        title: 'A fork in the path',
        text: 'The path splits at an old wooden fence. Which way?',
        a: {
          label: 'Tall grass',
          hint: 'Tougher battles, better odds of a rare sighting. Passes the Hilltop Oak.',
          steps: [
            { kind: 'battle', title: 'Ambush!', text: 'A wild Pokémon bursts out of the tall grass.', levelBonus: 1, rareBoost: 3 },
            { kind: 'landmark', title: 'Hilltop Oak', text: 'An old oak crowns the hill. Its branches rustle with wings.', landmark: 'hilltop-oak', guardedChance: 0.5, levelBonus: 1 },
          ],
        },
        b: {
          label: 'Meadow path',
          hint: 'Calmer walk past the Old Signpost and the sunflowers.',
          steps: [
            { kind: 'landmark', title: 'Old Signpost', text: 'A signpost leans by the path, its arrows faded by the sun.', landmark: 'signpost', guardedChance: 0 },
            { kind: 'landmark', title: 'Sunflower Patch', text: 'Sunflowers sway in the breeze. Something snores among them.', landmark: 'sunflowers', guardedChance: 0.35 },
          ],
        },
      },
      guardian: { title: 'The meadow guardian', text: 'A wary Furret stands where the meadow meets the woods. It won’t let you pass.' },
    }),
    backdrop: 'meadow',
  },
  {
    kind: 'route',
    id: 'r2',
    routeLabel: 'Route 2',
    name: 'Mossy Woods',
    biome: 'forest',
    blurb: 'A dim, humming forest. Bug Pokémon everywhere, and trails that wind back on themselves.',
    map: { x: 190, y: 318 },
    neighbours: ['r1', 'quarry', 'lake'],
    unlock: ['r1'],
    recommended: { min: 8, max: 15 },
    wild: {
      min: 8,
      max: 12,
      statMult: 0.7,
      pool: [
        { dexId: 10, weight: 3 }, // Caterpie
        { dexId: 13, weight: 3 }, // Weedle
        { dexId: 11, weight: 2 }, // Metapod
        { dexId: 14, weight: 2 }, // Kakuna
        { dexId: 43, weight: 3 }, // Oddish
        { dexId: 46, weight: 2 }, // Paras
        { dexId: 163, weight: 2 }, // Hoothoot
        { dexId: 167, weight: 2 }, // Spinarak
        { dexId: 285, weight: 2 }, // Shroomish
        { dexId: 25, weight: 1, rare: true }, // Pikachu
      ],
    },
    training: { paceMs: 4.5 * MIN, maxEncounters: 106, expPerWin: 10 },
    explore: { expPerWin: 16, clearBonus: 60 },
    guardian: { dexId: 47, level: 14, statMult: 0.8, title: 'Woods guardian' }, // Parasect
    landmarks: [
      { id: 'hollow-log', name: 'Hollow Log', blurb: 'A fallen giant, hollow end to end. Something lives inside.' },
      { id: 'mossy-shrine', name: 'Mossy Shrine', blurb: 'A tiny stone shrine under a blanket of moss.' },
      { id: 'sunbeam', name: 'Sunbeam Clearing', blurb: 'The one place in the woods where the sun reaches the ground.' },
    ],
    expedition: expedition({
      trailhead: { title: 'Buzzing in the dark', text: 'The canopy closes overhead. Wings hum somewhere close.' },
      fork: {
        title: 'Two trails',
        text: 'The trail splits around a mossy boulder.',
        a: {
          label: 'Into the thicket',
          hint: 'Tougher battles, better odds of a rare sighting. Passes the Mossy Shrine.',
          steps: [
            { kind: 'battle', title: 'Webs everywhere', text: 'Something drops from the branches!', levelBonus: 2, rareBoost: 3 },
            { kind: 'landmark', title: 'Mossy Shrine', text: 'A tiny shrine hides under the moss. Eyes glint behind it.', landmark: 'mossy-shrine', guardedChance: 0.6, levelBonus: 1 },
            { kind: 'sighting', title: 'A glimpse of yellow', text: 'Something small darts between the ferns.', rareBoost: 3 },
          ],
        },
        b: {
          label: 'Follow the stream',
          hint: 'Calmer walk past the Hollow Log and a sunny clearing.',
          steps: [
            { kind: 'landmark', title: 'Hollow Log', text: 'A fallen tree lies across the stream, hollow end to end.', landmark: 'hollow-log', guardedChance: 0.2 },
            { kind: 'sighting', title: 'By the water', text: 'A Pokémon drinks from the stream and hasn’t noticed you.' },
            { kind: 'landmark', title: 'Sunbeam Clearing', text: 'Light pours into a quiet clearing.', landmark: 'sunbeam', guardedChance: 0 },
          ],
        },
      },
      guardian: { title: 'The woods guardian', text: 'A Parasect has claimed the crossroads to the quarry and the lake.' },
    }),
    backdrop: 'woodland',
  },
  {
    kind: 'route',
    id: 'lake',
    name: 'Mirror Lake',
    biome: 'lakeside',
    blurb: 'A glassy lake under the eastern cliffs. Calm water, sudden splashes.',
    map: { x: 300, y: 236 },
    neighbours: ['r2', 'ruins'],
    unlock: ['r2'],
    recommended: { min: 14, max: 22 },
    wild: {
      min: 14,
      max: 20,
      statMult: 0.65,
      pool: [
        { dexId: 129, weight: 3 }, // Magikarp
        { dexId: 54, weight: 3 }, // Psyduck
        { dexId: 60, weight: 2 }, // Poliwag
        { dexId: 118, weight: 3 }, // Goldeen
        { dexId: 194, weight: 2 }, // Wooper
        { dexId: 183, weight: 2 }, // Marill
        { dexId: 283, weight: 2 }, // Surskit
        { dexId: 278, weight: 2 }, // Wingull
        { dexId: 418, weight: 2 }, // Buizel
        { dexId: 147, weight: 1, rare: true }, // Dratini
      ],
    },
    training: { paceMs: 5 * MIN, maxEncounters: 96, expPerWin: 16 },
    explore: { expPerWin: 24, clearBonus: 100 },
    guardian: { dexId: 184, level: 21, statMult: 0.75, title: 'Lake guardian' }, // Azumarill
    landmarks: [
      { id: 'dock', name: 'Fisher’s Dock', blurb: 'A creaky dock with a forgotten fishing rod.' },
      { id: 'heron-isle', name: 'Heron Isle', blurb: 'A reedy islet where Wingull rest.' },
      { id: 'shallows', name: 'Mirror Shallows', blurb: 'Water so still it doubles the sky.' },
    ],
    expedition: expedition({
      trailhead: { title: 'Ripples', text: 'Rings spread across the still water. Something just surfaced.' },
      fork: {
        title: 'Around the shore',
        text: 'Stepping stones lead out into the lake; a sandy path follows the shore.',
        a: {
          label: 'Wade to the island',
          hint: 'Tougher battles, better odds of a rare sighting. Reaches Heron Isle.',
          steps: [
            { kind: 'battle', title: 'Splash!', text: 'A Pokémon leaps from the water beside the stones.', levelBonus: 2, rareBoost: 3 },
            { kind: 'landmark', title: 'Heron Isle', text: 'Reeds hiss in the wind. Something nests here.', landmark: 'heron-isle', guardedChance: 0.5, levelBonus: 1 },
          ],
        },
        b: {
          label: 'Walk the shoreline',
          hint: 'Calmer walk past the Fisher’s Dock and the shallows.',
          steps: [
            { kind: 'landmark', title: 'Fisher’s Dock', text: 'An old dock creaks under your feet.', landmark: 'dock', guardedChance: 0.2 },
            { kind: 'sighting', title: 'In the shallows', text: 'A Pokémon basks where the water is warm.' },
            { kind: 'landmark', title: 'Mirror Shallows', text: 'The water is so still it doubles the sky.', landmark: 'shallows', guardedChance: 0.3 },
          ],
        },
      },
      guardian: { title: 'The lake guardian', text: 'An Azumarill surfaces and blocks the cliff path to the ruins.' },
    }),
    backdrop: 'pier',
  },
  {
    kind: 'route',
    id: 'quarry',
    name: 'Flint Quarry',
    biome: 'quarry',
    blurb: 'Terraced pits cut into the western hills. Diggers, brawlers, and loose ground.',
    map: { x: 78, y: 266 },
    neighbours: ['r2', 'trail'],
    unlock: ['r2'],
    recommended: { min: 16, max: 24 },
    wild: {
      min: 16,
      max: 22,
      statMult: 0.65,
      pool: [
        { dexId: 27, weight: 3 }, // Sandshrew
        { dexId: 50, weight: 3 }, // Diglett
        { dexId: 66, weight: 3 }, // Machop
        { dexId: 104, weight: 3 }, // Cubone
        { dexId: 74, weight: 2 }, // Geodude
        { dexId: 231, weight: 2 }, // Phanpy
        { dexId: 296, weight: 2 }, // Makuhita
        { dexId: 328, weight: 2 }, // Trapinch
        { dexId: 246, weight: 1, rare: true }, // Larvitar
      ],
    },
    training: { paceMs: 5 * MIN, maxEncounters: 96, expPerWin: 18 },
    explore: { expPerWin: 28, clearBonus: 110 },
    guardian: { dexId: 111, level: 23, statMult: 0.57, title: 'Quarry guardian' }, // Rhyhorn
    landmarks: [
      { id: 'fossil-wall', name: 'Fossil Wall', blurb: 'Shells and bones pressed into the rock face.' },
      { id: 'minecart', name: 'Rusty Minecart', blurb: 'An old cart still full of flint.' },
      { id: 'echo-shaft', name: 'Echo Shaft', blurb: 'A deep shaft that answers every sound twice.' },
    ],
    expedition: expedition({
      trailhead: { title: 'Falling pebbles', text: 'Pebbles skitter down the terraces. Something up there moved.' },
      fork: {
        title: 'Down into the pit?',
        text: 'Terraces step down into the pit; cart rails curve along the rim.',
        a: {
          label: 'Climb down the terraces',
          hint: 'Tougher battles, better odds of a rare sighting. Reaches the Echo Shaft.',
          steps: [
            { kind: 'battle', title: 'Rockslide!', text: 'A Pokémon rolls down the terrace at you.', levelBonus: 2, rareBoost: 3 },
            { kind: 'landmark', title: 'Echo Shaft', text: 'A shaft drops into darkness. Something growls back.', landmark: 'echo-shaft', guardedChance: 0.6, levelBonus: 1 },
            { kind: 'battle', title: 'The pit floor', text: 'A Pokémon guards the bottom of the pit.', levelBonus: 1 },
          ],
        },
        b: {
          label: 'Follow the cart rails',
          hint: 'Calmer walk past the Rusty Minecart and the Fossil Wall.',
          steps: [
            { kind: 'landmark', title: 'Rusty Minecart', text: 'A cart full of flint sits on the rails.', landmark: 'minecart', guardedChance: 0.2 },
            { kind: 'landmark', title: 'Fossil Wall', text: 'Shells and bones are pressed into the rock face.', landmark: 'fossil-wall', guardedChance: 0.4 },
          ],
        },
      },
      guardian: { title: 'The quarry guardian', text: 'A Rhyhorn charges across the quarry floor, guarding the trail north.' },
    }),
    backdrop: 'cave-sand',
  },
  {
    kind: 'route',
    id: 'trail',
    name: 'Cloudcap Trail',
    biome: 'mountain',
    blurb: 'A steep path into the northern peaks. Thin air, strong winds, and stronger Pokémon.',
    map: { x: 100, y: 140 },
    neighbours: ['quarry', 'ruins'],
    unlock: ['quarry'],
    recommended: { min: 24, max: 34 },
    wild: {
      min: 24,
      max: 32,
      statMult: 0.65,
      pool: [
        { dexId: 67, weight: 3 }, // Machoke
        { dexId: 220, weight: 3 }, // Swinub
        { dexId: 361, weight: 3 }, // Snorunt
        { dexId: 57, weight: 3 }, // Primeape
        { dexId: 22, weight: 2 }, // Fearow
        { dexId: 17, weight: 2 }, // Pidgeotto
        { dexId: 307, weight: 2 }, // Meditite
        { dexId: 75, weight: 1 }, // Graveler
        { dexId: 371, weight: 1, rare: true }, // Bagon
      ],
    },
    training: { paceMs: 6 * MIN, maxEncounters: 80, expPerWin: 26 },
    explore: { expPerWin: 40, clearBonus: 160 },
    guardian: { dexId: 221, level: 33, statMult: 0.67, title: 'Trail guardian' }, // Piloswine
    landmarks: [
      { id: 'windy-ledge', name: 'Windy Ledge', blurb: 'A narrow ledge where the wind never stops.' },
      { id: 'summit-cairn', name: 'Summit Cairn', blurb: 'Every trainer who reaches the top adds a stone.' },
      { id: 'frozen-falls', name: 'Frozen Falls', blurb: 'A waterfall caught mid-fall by the cold.' },
    ],
    expedition: expedition({
      trailhead: { title: 'Wind on the ridge', text: 'A gust nearly knocks you over. Wings beat overhead.' },
      fork: {
        title: 'The switchbacks',
        text: 'A loose scree slope climbs straight up; a ledge path winds around the peak.',
        a: {
          label: 'Scramble up the scree',
          hint: 'Tougher battles, better odds of a rare sighting. Reaches the Summit Cairn.',
          steps: [
            { kind: 'battle', title: 'Loose rocks', text: 'The slope shifts. A Pokémon was hiding in it.', levelBonus: 2, rareBoost: 3 },
            { kind: 'landmark', title: 'Summit Cairn', text: 'A stack of stones marks the top. Something watches from it.', landmark: 'summit-cairn', guardedChance: 0.6, levelBonus: 1 },
            { kind: 'battle', title: 'The descent', text: 'A Pokémon blocks the way down.', levelBonus: 2 },
          ],
        },
        b: {
          label: 'Take the ledge path',
          hint: 'Calmer walk past the Windy Ledge and the Frozen Falls.',
          steps: [
            { kind: 'landmark', title: 'Windy Ledge', text: 'The wind howls along the ledge.', landmark: 'windy-ledge', guardedChance: 0.3 },
            { kind: 'sighting', title: 'Tracks in the snow', text: 'Fresh tracks lead behind a boulder.' },
            { kind: 'landmark', title: 'Frozen Falls', text: 'A waterfall hangs frozen mid-fall.', landmark: 'frozen-falls', guardedChance: 0.4 },
          ],
        },
      },
      guardian: { title: 'The trail guardian', text: 'A Piloswine plods out of the snow, guarding the way to the ruins.' },
    }),
    backdrop: 'mountain',
  },
  {
    kind: 'route',
    id: 'ruins',
    name: 'Starfall Ruins',
    biome: 'ruins',
    blurb: 'Broken pillars on a high plateau where a star is said to have fallen. Strange Pokémon drift between the stones.',
    map: { x: 262, y: 76 },
    neighbours: ['trail', 'lake'],
    unlock: ['trail', 'lake'],
    recommended: { min: 34, max: 50 },
    wild: {
      min: 34,
      max: 46,
      statMult: 0.75,
      pool: [
        { dexId: 201, weight: 3 }, // Unown
        { dexId: 177, weight: 3 }, // Natu
        { dexId: 200, weight: 2 }, // Misdreavus
        { dexId: 93, weight: 2 }, // Haunter
        { dexId: 64, weight: 2 }, // Kadabra
        { dexId: 436, weight: 3 }, // Bronzor
        { dexId: 302, weight: 2 }, // Sableye
        { dexId: 359, weight: 1 }, // Absol
        { dexId: 442, weight: 1, rare: true }, // Spiritomb
      ],
    },
    training: { paceMs: 6 * MIN, maxEncounters: 80, expPerWin: 36 },
    explore: { expPerWin: 55, clearBonus: 240 },
    guardian: { dexId: 178, level: 47, statMult: 0.75, title: 'Ruins guardian' }, // Xatu
    landmarks: [
      { id: 'star-gate', name: 'Star Gate', blurb: 'An arch of carved stone, older than the town.' },
      { id: 'glyph-hall', name: 'Glyph Hall', blurb: 'Walls covered in shapes that look like Unown.' },
      { id: 'fallen-star', name: 'Fallen Star', blurb: 'A glassy crater that glows faintly at night.' },
    ],
    expedition: expedition({
      trailhead: { title: 'Whispers in the stones', text: 'The wind whistles through broken pillars. It almost sounds like words.' },
      fork: {
        title: 'Two ways in',
        text: 'A carved arch leads to the heart of the ruins; a path circles the outer wall.',
        a: {
          label: 'Through the Star Gate',
          hint: 'Tougher battles, better odds of a rare sighting. Reaches the Fallen Star.',
          steps: [
            { kind: 'landmark', title: 'Star Gate', text: 'The arch hums as you pass under it.', landmark: 'star-gate', guardedChance: 0.5, levelBonus: 1 },
            { kind: 'battle', title: 'Shadows move', text: 'A Pokémon peels out of a shadow.', levelBonus: 2, rareBoost: 3 },
            { kind: 'landmark', title: 'Fallen Star', text: 'A glassy crater glows at the center of the ruins.', landmark: 'fallen-star', guardedChance: 0.7, levelBonus: 2 },
          ],
        },
        b: {
          label: 'Around the outer wall',
          hint: 'Calmer walk past the Glyph Hall.',
          steps: [
            { kind: 'sighting', title: 'Drifting shapes', text: 'Something floats between the pillars.' },
            { kind: 'landmark', title: 'Glyph Hall', text: 'Glyphs cover every wall. Some of them move.', landmark: 'glyph-hall', guardedChance: 0.4 },
            { kind: 'battle', title: 'The inner court', text: 'A Pokémon waits in the courtyard.' },
          ],
        },
      },
      guardian: { title: 'The ruins guardian', text: 'A Xatu stares down from the highest pillar. It has been waiting for you.' },
    }),
    backdrop: 'autumn',
  },
];
