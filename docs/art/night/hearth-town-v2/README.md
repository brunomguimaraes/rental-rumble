# Hearth Town — country community, v2

The first town of Hearthvale is a lived-in country community. Six public services sit among varied private
homes, gardens, and a tree-shaded square. The homes are scenery. There is **no tall grass or wild encounter
habitat in town**; those belong on separate route maps.

This replaces the v1 art direction. The first draft is archived in `../hearth-town-v1/`.

## Deliverables

The asset directory is `public/sprites/world/hearth-town-v2/`:

| File | Size | Purpose |
| --- | --- | --- |
| `exploration-map.png` | 1536 × 1024 | Close-up town environment beneath independent interaction controls. |
| `exploration-overlay.svg` | 1536 × 1024 viewBox | Transparent, named hit regions aligned to the artwork. |
| `hotspots.json` | 8 destinations | Coordinates, labels, scenery rules, and proposed service roles. |
| `menu-avatar.png` | 1254 × 1254, RGBA | Town illustration for menu selection; real alpha outside its silhouette. |
| `world-tile.png` | 1254 × 1254 | Wider town-and-countryside section for world-map composition. |
| `manifest.json` | JSON | Dimensions, intended uses, north-road connector, and source information. |

The built-in `image_gen` tool produced all three PNGs. They retain their returned dimensions and alpha;
no raster post-processing was applied. `generation-prompts.json` records the complete final prompt set.
The SVG and JSON describe UI geometry separately from the generated artwork.

## The town ecosystem

| Destination | Role | Interaction ideas for a later gameplay slice |
| --- | --- | --- |
| Village bakery | Everyday food and a familiar local face | Meet the baker; browse daily bakes. |
| Village market | Local produce, traders, and everyday supplies | Browse stalls; meet traders. |
| Pokémon Center | A welcoming trainer and partner-care stop | Talk to the nurse; check party care. |
| Town library | Region knowledge, stories, and local history | Read guides; discover Hearthvale stories. |
| Pokémon daycare | A gentle care space with a maintained play garden | Meet caretakers; visit the garden. |
| Professor’s lab | Research, regional discoveries, and the professor | Visit the professor and research desk. |
| Town square | Meeting point around the oak and well | Meet townspeople; rest by the well. |
| North road | Transition from town to Route 1 · Sunny Meadow | Leave for a separate route map. |

These are interaction proposals. Selecting a destination in the preview displays its role; it does not
buy an item, heal a party, start daycare, or write account state. No prices, item effects, breeding,
training rules, rewards, or encounter tables are introduced. Residential doors have no hit regions.

## Preview and integration

Run `npm run dev:local` and open `/docs/art/night/hearth-town-v2/index.html` on the Vite server. The preview
requires no login and makes only a static request for `hotspots.json`. It shows the map, keyboard-accessible
destination buttons, avatar previews on dark and light surfaces, and the wider world-map section.

`hotspots.json` is the coordinate source of truth. Its origin is top-left, using the exploration PNG's
1536 × 1024 source pixels. Scale horizontal coordinates by `renderedWidth / 1536` and vertical coordinates
by `renderedHeight / 1024`. Preserve the 3:2 aspect ratio; cropping breaks alignment. Put an image and its
absolutely positioned buttons in the same transformed container when adding pan or zoom. Keep the map's
hit regions separate from normal residential scenery and give every control a visible keyboard focus.

The standalone SVG is a reviewable overlay. Its fragment links identify destinations but do not perform
game actions. Inline the SVG to attach handlers, or use real HTML buttons from the JSON as the preview does.
Loading the SVG through an `<img>` makes it visual only. Keep painted labels and controls out of the PNG.

Reference the assets in the app using `${import.meta.env.BASE_URL}sprites/world/hearth-town-v2/...`.
The preview draws the masters with `image-rendering: pixelated`; the game draws its web derivatives smooth
(see [In the game](#in-the-game)). These are generated illustration masters, not a native 16-pixel tileset;
inspect the avatar at its intended size before exporting optimized derivatives. The preview includes
96-, 128-, and 192-pixel samples. Keep the original masters when making variants.

The world section has a north road toward `r1`, a river entering from the northwest and leaving toward the
southeast, and a south footbridge leading to a local garden walk. Future neighboring sections must match
its terrain and road edges; this is not a seamless repeating texture. `manifest.json` gives approximate
connector coordinates. No changes have been made to the existing 384 × 576 Hearthvale map, its generator,
the `home` location ID, or the existing world-map coordinate contract.

## In the game

The app loads `derived/town.webp` (the exploration map at its full 1536 × 1024) and `derived/avatar-256.webp`
(the menu avatar at 256 × 256, alpha kept) from `public/sprites/world/hearth-town-v2/`.
`python3 scripts/build-hearth-town.py` builds both from the masters, which it never modifies.

Both are drawn smooth (`image-rendering: auto`), not pixelated. A phone shows the town map at about 0.2–0.75× of
its pixels, and pixelated sampling breaks up roofs and fences at that scale.

`scripts/town.test.ts` keeps the coordinates in `src/game/town.ts` aligned with `hotspots.json`, so regenerated
art cannot silently move the hit regions. The card copy, each destination's description and role, lives in
`src/game/town.ts` and is written for players; the text in `hotspots.json` is art direction.

## Review criteria

- All six service landmarks are visually distinct and reachable by visible paths.
- Residential houses vary in roof, material, and silhouette and remain non-interactive scenery.
- The daycare has a fenced, maintained garden, and town lawns contain no encounter grass.
- The menu avatar and wider town section share the exploration map's architectural identity.
- Map and list selections stay synchronized; controls work with mouse, touch, and keyboard.
- PNGs and SVG load without failures; avatar transparency works on both dark and light surfaces.

This delivery is an asset pack and interaction-layout preview. Wiring service gameplay and composing the
complete world from adjacent sections are later work.

## Verification record

Validated against HEAD `53beab3e4510e8c4704e58e6e3f0daa312278658` plus this uncommitted art-pack diff:

- `npm run lint`, `npm test`, and `npm run build` passed. The build retains its existing large-chunk warning.
- PNG headers match the manifest dimensions and alpha formats. All eight hit regions are in bounds and
  contain their label anchors; the SVG and JSON destination IDs match.
- Browser review on Vite port 5175: every image loaded, map selection and keyboard selection synchronized
  with the details panel, and the destination toggle worked by keyboard. No browser errors or warnings.
- At a 390 × 844 viewport the page had no horizontal overflow, and keyboard destination selection worked.
  Browser automation did not reliably dispatch checkbox/mobile pointer clicks; those pointer paths were
  not verified. Desktop map pointer selection was verified.
- The gallery was inspected with the existing local API server left alone. `dev:local` could not start a
  second API listener on port 3001, so the art preview used a separate Vite server and made no API requests.

`preview.png` captures the final map and destination menu. The source PNGs remain the deliverable masters.
