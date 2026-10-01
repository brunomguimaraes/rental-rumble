// Hearth Town, the home place of Hearthvale: its eight destinations, laid over
// the town art. public/sprites/world/hearth-town-v2/hotspots.json is the source
// of truth for the ids, numbers, names, kinds, bounds and anchors below, and
// scripts/town.test.ts keeps this list aligned with it, so regenerated art
// cannot silently move the hit regions. The description and role are the game's
// own card copy, written for players; the versions in hotspots.json are art
// notes. Pure data: no DOM, no clock, no I/O.

export type TownDestinationId =
  | 'bakery'
  | 'market'
  | 'pokemon-center'
  | 'library'
  | 'daycare'
  | 'professors-lab'
  | 'town-square'
  | 'north-exit';

/** What a destination's card opens: a screen (party, dex, box) or a place (`r1`, Sunny Meadow). */
export type TownLink = 'party' | 'dex' | 'box' | 'r1';

export interface TownDestination {
  id: TownDestinationId;
  /** '01'…'08', as printed on the map markers. */
  number: string;
  name: string;
  kind: 'service' | 'public-space' | 'exit';
  /** Hit region in source pixels of the 1536×1024 art, origin top-left. */
  bounds: { x: number; y: number; width: number; height: number };
  /** Marker point in the same source pixels; inside `bounds`. */
  anchor: { x: number; y: number };
  /** What the place looks like, in the game's voice. */
  description: string;
  /** What the place is to the town, in the game's voice. */
  role: string;
  /** What the destination's card opens; null = nothing to open yet. */
  link: TownLink | null;
}

/**
 * The town art the screen draws, as paths relative to `import.meta.env.BASE_URL`.
 * Both are web derivatives of the masters (scripts/build-hearth-town.py). `map`
 * keeps the full 1536×1024 coordinate space of the bounds below; `avatar` is a
 * 256×256 image with real alpha.
 */
export const TOWN_ART: { readonly width: 1536; readonly height: 1024; readonly map: string; readonly avatar: string } = {
  width: 1536,
  height: 1024,
  map: 'sprites/world/hearth-town-v2/derived/town.webp',
  avatar: 'sprites/world/hearth-town-v2/derived/avatar-256.webp',
};

/**
 * The destinations in hotspots.json order, 01…08. In the art's own layout the
 * town square's rectangle overlaps the library's and the daycare's.
 */
export const TOWN_DESTINATIONS: readonly TownDestination[] = [
  {
    id: 'bakery',
    number: '01',
    name: 'Village bakery',
    kind: 'service',
    bounds: { x: 299, y: 300, width: 268, height: 216 },
    anchor: { x: 417, y: 490 },
    description: 'A warm brick bakery on the western lane, with an oven chimney, bread window, and striped awning.',
    role: 'Everyday food and a familiar face on the way through town.',
    link: null,
  },
  {
    id: 'market',
    number: '02',
    name: 'Village market',
    kind: 'service',
    bounds: { x: 634, y: 80, width: 293, height: 240 },
    anchor: { x: 777, y: 283 },
    description: 'A timber shop and open produce stalls under striped awnings.',
    role: 'Where the town’s gardens and orchards send their harvest.',
    link: null,
  },
  {
    id: 'pokemon-center',
    number: '03',
    name: 'Pokémon Center',
    kind: 'service',
    bounds: { x: 938, y: 303, width: 282, height: 216 },
    anchor: { x: 1069, y: 491 },
    description: 'A small country Pokémon Center with a covered entrance, bright red roof, and garden borders.',
    role: 'The town’s welcoming stop for trainers and their partners.',
    link: 'party',
  },
  {
    id: 'library',
    number: '04',
    name: 'Town library',
    kind: 'service',
    bounds: { x: 417, y: 538, width: 259, height: 286 },
    anchor: { x: 524, y: 785 },
    description: 'An old stone library with a steep slate roof, book sign, and quiet garden.',
    role: 'Shelves of local history and Pokémon lore.',
    link: 'dex',
  },
  {
    id: 'daycare',
    number: '05',
    name: 'Pokémon daycare',
    kind: 'service',
    bounds: { x: 810, y: 581, width: 396, height: 305 },
    anchor: { x: 1017, y: 786 },
    description: 'A yellow farmhouse with a fenced, mown play garden, shade tree, slide, and swings.',
    role: 'Where Pokémon come to play and rest.',
    link: 'box',
  },
  {
    id: 'professors-lab',
    number: '06',
    name: 'Professor’s lab',
    kind: 'service',
    bounds: { x: 216, y: 29, width: 331, height: 216 },
    anchor: { x: 394, y: 213 },
    description: 'A teal-roofed research house with a glass greenhouse and carefully tended beds.',
    role: 'Where the professor studies Pokémon and keeps notes on Hearthvale.',
    link: null,
  },
  {
    id: 'town-square',
    number: '07',
    name: 'Town square',
    kind: 'public-space',
    bounds: { x: 621, y: 367, width: 283, height: 244 },
    anchor: { x: 749, y: 568 },
    description: 'A mature shade tree, well, benches, and flower beds connect the town’s paths.',
    role: 'The town’s shared living room and central meeting point.',
    link: null,
  },
  {
    id: 'north-exit',
    number: '08',
    name: 'Road to Sunny Meadow',
    kind: 'exit',
    bounds: { x: 978, y: 0, width: 157, height: 160 },
    anchor: { x: 1040, y: 106 },
    description: 'The road north through the trees to Sunny Meadow.',
    role: 'Wild Pokémon rustle in the tall grass just beyond the town.',
    link: 'r1',
  },
];

const DESTINATION_BY_ID = new Map<string, TownDestination>(TOWN_DESTINATIONS.map((d) => [d.id, d]));

/** The destination with this id, or null for an id that is not one. */
export function townDestinationById(id: string): TownDestination | null {
  return DESTINATION_BY_ID.get(id) ?? null;
}
