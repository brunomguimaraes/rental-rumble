# Styling

The game's look is **Night**: dark GBA-style menu windows on a striped navy field, pixel type, crisp
sprites. The Pokédex is the one exception: a red handheld with an LCD and a paper list. Tokens and
utilities live in `src/index.css`. `src/components/PokedexScreen.tsx` is the reference screen.

## Tokens

Use the Tailwind utilities the tokens generate (`bg-window`, `text-ink`, `border-edge`, `font-pixel`, …).
Never write a hex value in a component. The exceptions are `TYPE_COLORS` for type chips and `#fff`/`#000`
in text-shadows.

| Token | Use |
|---|---|
| `field`, `field-stripe-a/b` | Page background (`ui-field`; `body` already paints it) |
| `window`, `window-rim`, `window-frame`, `edge` | Windows (`ui-window`), bar troughs, hard shadows |
| `ink`, `ink-dim` | Primary and secondary text on Night surfaces |
| `accent` | Menu cursor, selection, focus ring, the one highlight per window |
| `info` | Small section labels |
| `exp` | EXP and progress fills |
| `hp`, `hp-low`, `hp-critical` | Current-HP fills (`HpBar`): above half, at half or less, at a fifth or less. 9.9:1, 9.0:1 and 6.0:1 against the `edge` trough |
| `danger` | Debt and over-limit readouts (travel stamina below zero) |
| `slot`, `button` | Sprite slots inside windows, button fill |
| `caught-normal/alt/shiny` | Collection layers on Night surfaces |
| `dex-*`, `lcd*`, `paper*`, `select`, `caught-*-ink` | **Pokédex only** (`src/components/pokedex/`) |

## Type

| Font | Utility | Use | Size |
|---|---|---|---|
| Pixelify Sans | `font-pixel` | UI text, names, body copy on migrated screens | ≥ 12px |
| Silkscreen | `font-label` | Labels, numbers, tabs, buttons; always `uppercase` | 8–11px |
| Press Start 2P | `.dmg-number` | Battle damage numbers only | as set |

Screens that haven't migrated keep `font-display` until their migration slice.

## Frames and surfaces

- Group content in `ui-window`. Leave ≥ 8px (`m-2`/`gap-2`) around a window; its rings are drawn outside the box.
- Buttons are `ui-button ui-focus` with a `font-label` caption. Menus use a ▶ cursor on the active row.
- Shadows are hard (no blur). Corners are square or at most 6px.
- Migrated screens drop `backdrop-blur`, glass panels (`bg-white/[0.0x]`, `border-white/10`), gradients,
  `rounded-full` pills, and soft `shadow-*`.

## Sprites

Render pixel art at its native size or a whole multiple of it, always with `[image-rendering:pixelated]`.
Use `PixelSprite` (`src/components/ui/PixelSprite.tsx`).

| Asset | File size | Allowed sizes |
|---|---|---|
| Front/back battle sprite | 192 (2× art) | 96, 192 |
| PMD portrait | 40 | 40, 80, 120 |
| Box icon sheet (2 frames) | 128 × 64 | 64 per frame (`sheet`) |
| Type and sign icons | 128, smooth art | any, `object-contain` |
| Hearth Town art (generated illustrations, WebP) | map 1536 × 1024, avatar 256 | fitted to the window, any size; smooth (`[image-rendering:auto]`), never `pixelated` |

## Motion

Keep animation short and purposeful. Use `steps()` where it should read as pixel motion. Every animation is
disabled under `prefers-reduced-motion`.

## Accessibility

- Every control is a real `<button>`/`<a>`/`<input>` with `ui-focus`. On light surfaces (the dex's paper and LCD)
  use `ui-focus-ink`, an inset ring in the control's own ink; the gold ring disappears there.
- Text meets 4.5:1 against its surface, and non-text marks like pips meet 3:1. Dimmed text uses a colour
  with an alpha (for example `text-paper-ink/75`), never `opacity` below 0.75.
- Meaningful sprites carry `alt`. Use `alt=""` when the name is printed right next to the sprite.

## Primitives

`src/components/ui/` holds a primitive only once a screen uses it: `StatBar` and `PixelSprite` today.
`Window` and `MenuList` arrive with the Hub migration.

## Migration order

Hub → Box → Account / Login / Onboarding → Battle. Migrate one screen per slice. Each slice takes the screen
off `font-display` and glass, and adds the primitives it is the first to need.
