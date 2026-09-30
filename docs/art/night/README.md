# Night UI icon library

Menu, navigation, and utility artwork based on the September 30, 2026 mobile hub concept.

## Files

- `mobile-hub-concept.png` is the original, unmodified concept image.
- `icon-regions.json` records where each reference icon appears in that image.
- `generation-prompts.json` records the prompts used with the built-in image generation tool.
- `icons.html` is a local gallery for inspecting the icons on dark and light surfaces.
- `../../../public/sprites/ui/night/` contains the individual transparent PNG assets and `manifest.json`.

The individual PNGs are generated recreations based on the reference, not pixel-exact crops. Keep the
original concept alongside them as the visual source of truth. The image tool supplied the transparency;
the exported PNGs retain their original resolution and alpha channel.

These are archival masters. Before loading many of them in the mobile app, export appropriately sized,
optimized derivatives as separate files and keep these originals.

## Use in the app

Reference an icon through Vite's base URL, for example:

```tsx
<img
  src={`${import.meta.env.BASE_URL}sprites/ui/night/world-map.png`}
  width={48}
  height={48}
  alt=""
  className="object-contain [image-rendering:pixelated]"
/>
```

Use an empty `alt` when a visible label names the action. For an icon-only control, put an accessible
label on its button. The generated masters contain transparent padding; check the actual visible size
when choosing the display dimensions. Inspect 32px, 48px, and 64px previews in the gallery before use.

The gold `*-active` assets are selected navigation states. Keep the regular assets for inactive states;
do not apply opacity to communicate selection. These assets do not add or enable the proposed features.

Open `icons.html` directly in a browser, or visit `/docs/art/night/icons.html` through the local Vite
server. The gallery does not require authentication or make API requests.
Restart an existing Vite server after adding the library: sprite directories are excluded from its
watcher, so a server started before these files existed may not serve them yet.

## Preservation

Do not overwrite these files when trying a new direction. Add a versioned sibling asset instead and keep
its prompt. Existing Pokémon sprites, item sprites, and the app's current icons remain separate.
