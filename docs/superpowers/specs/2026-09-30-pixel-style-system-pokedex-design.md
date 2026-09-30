# Pixel style system (Night) + handheld Pokédex — design

Date: 2026-09-30 · Status: approved in brainstorming, awaiting spec review

## Result

The game gets a named visual system, **Night**: dark GBA-style menu windows (double rim, hard drop shadow)
on a striped navy field, pixel type, and crisp integer-scaled sprites. The system ships as tokens, a few
utilities, two primitives, and a rules doc. The Pokédex is rebuilt on it as a **DS-style red handheld**: a
detail LCD on top, a hinge, and the species list below. The Pokédex is the reference screen. Other screens
migrate in later slices.

Visual references (brainstorm mockups, not committed): `.superpowers/brainstorm/*/content/direction.html` (A
handheld = the dex, B menu windows = the game), `dark-b-palette.html` (option 1 · Night), `dex-layout.html`
(option 2 · DS stacked).

## Acceptance criteria

1. `src/index.css` defines the Night, dex-device, and collection tokens and the font tokens in `@theme`. Tailwind
   utilities such as `bg-window`, `text-ink`, `font-pixel`, and `bg-lcd` resolve.
2. `ui-field`, `ui-window`, `ui-button`, and `ui-focus` exist as `@utility` classes. `body` paints the Night
   field. `index.html` loads Pixelify Sans and Silkscreen next to Press Start 2P.
3. `.agents/rules/styling.md` exists. It is linked from the `AGENTS.md` task table and from the styling section
   of `.agents/rules/frontend.md`.
4. The Pokédex renders as the stacked handheld at 375px and at desktop width, with no horizontal page scroll.
5. The Pokédex keeps every capability it has today: search by name or number, filtering by one type, a paged
   list (120 at a time), a caught count and variant pips when signed in, base stats plus total, possible
   abilities, possible moves (with STAB marked), and sign fit (best fit first).
6. Keyboard: ↑/↓ changes the selected species, ←/→ changes the top-screen tab, and Esc returns to the Hub. None
   of these fire while focus is in the search input. Every control is a real `<button>`/`<input>` with a
   visible `ui-focus` outline.
7. States: signed out, signed in, signed in with the collection fetch failing, and no results all render as
   described below.
8. `npm run lint && npm test && npm run build` passes. A browser check under `npm run dev:local` covers phone
   and desktop width, signed in and signed out.

## Exclusions

- Restyling Hub, Box, Account, Login, Onboarding, Battle, Guide, or the modals (a later slice each).
- `Window` and `MenuList` primitives (they arrive with the Hub migration, their first consumer).
- Animated sprites, shiny/alt sprite toggles in the dex, sound, list virtualisation.
- Any API, schema, or seed/save change. `fetchPokedex` and `/api/me/pokedex` are untouched.
- Changing the portraits' smooth-scaling elsewhere (Box, battle cards) — those screens migrate later.

## 1. Night system

### Tokens (`@theme` in `src/index.css`)

| Token | Value | Use |
|---|---|---|
| `--color-field` | `#141a2c` | Page background |
| `--color-field-stripe-a` / `-b` | `#161d31` / `#121828` | 45° 6px stripes on the field |
| `--color-window` | `#1e2740` | Window fill |
| `--color-window-rim` | `#8fa6cc` | Inner (light) window rim |
| `--color-window-frame` | `#3a4c74` | Middle window frame |
| `--color-edge` | `#0a0d18` | Outer edge, bar troughs, hard shadows |
| `--color-ink` | `#f2f0e6` | Primary text on Night |
| `--color-ink-dim` | `#9aa6c4` | Secondary text on Night |
| `--color-accent` | `#ffd447` | Cursor, selection, focus ring, highlights |
| `--color-info` | `#7fb4ff` | Section labels |
| `--color-exp` | `#5fd4ff` | EXP / progress fills |
| `--color-slot` | `#161e34` | Sprite slots inside windows |
| `--color-button` | `#2a3656` | Button fill |
| `--color-dex-red` | `#d62e3a` | Pokédex shell |
| `--color-dex-red-dark` / `-light` | `#8f1622` / `#f0707a` | Shell bevels, hinge |
| `--color-lcd` / `--color-lcd-grid` | `#e8f0d8` / `#d8e4c8` | Top screen and its 8px grid |
| `--color-lcd-ink` / `--color-lcd-dim` | `#203018` / `#b8c8a8` | LCD text, LCD bar troughs and idle tabs |
| `--color-paper` / `--color-paper-ink` | `#f8f8f0` / `#282828` | List screen |
| `--color-select` | `#f8d030` | Selected list row |
| `--color-dex-bezel` | `#222222` | Screen bezels and the filter strip |
| `--color-dex-lens` / `-dark` | `#5ec8f2` / `#2a8fc0` | Device lens |
| `--color-caught-normal` / `-alt` / `-shiny` | `#ffffff` / `#5eead4` / `#f5c542` | Collection pips on Night surfaces (today's values) |
| `--color-caught-alt-ink` / `-shiny-ink` | `#1d9a86` / `#a67c00` | Collection pips on the dex's light screens (≥ 3:1); normal uses the screen's ink |
| `--font-pixel` | `'Pixelify Sans', system-ui, sans-serif` | UI text on migrated screens |
| `--font-label` | `'Silkscreen', monospace` | Small uppercase labels, numbers |

The block is `@theme static`, so every token is emitted as a CSS variable even when only an `@utility` reads it. `--font-display` stays. `body` keeps it until each screen migrates. `.dmg-number` keeps Press Start 2P.

### Utilities (`@utility`)

- `ui-field`: the field colour plus the stripe pattern.
- `ui-window`: `window` fill, small radius, and a layered `box-shadow` for rim → frame → edge plus a 5px hard
  drop shadow. No blur.
- `ui-button`: `button` fill, frame and edge shadow; `:active` shifts 2px down-right and drops the shadow;
  disabled dims.
- `ui-focus`: `focus-visible` → 2px `accent` outline, 2px offset.

### Primitives (`src/components/ui/`)

- `StatBar({ value, max, segments?, tone })`: segmented block bar. `tone` picks LCD or Night colours. It
  replaces the dex's `BaseStatBar`.
- `PixelSprite({ src, fallback?, size, frames?, alt, silhouette? })`: integer-scaled `<img>` (or a
  background-cropped `div` for 2-frame icon sheets, like `MiniSprite`) with `[image-rendering:pixelated]`,
  `loading="lazy"`, an `onError` swap to `fallback`, and an optional black silhouette.

### Rules doc (`.agents/rules/styling.md`)

Contents: the tokens above and when to use each; fonts and minimum sizes (Pixelify ≥ 12px, Silkscreen 8–11px
uppercase, Press Start 2P only for damage numbers); sprite scaling (portrait 40 → 40/80, front 192 → 96/192,
icon frame 64 → 64 only, since the icon art is native 64px; never fractional); what migrated screens drop (blur/`backdrop-blur`, glass
`white/[0.0x]` panels, gradients, `rounded-full` pills, soft shadows); motion (short, `steps()` where it reads
as pixel, always behind `prefers-reduced-motion`); accessibility (focus via `ui-focus`, text contrast ≥ 4.5:1
against its surface, meaningful sprites carry `alt`); the dex-device palette is Pokédex-only; primitives are
added when a first consumer needs them; migration order: Hub → Box → Account/Login/Onboarding → Battle.

## 2. Pokédex (DS stacked handheld)

`src/components/PokedexScreen.tsx` keeps its path, export, and props `{ onBack, me? }`, so `App.tsx` is
untouched. Parts move to `src/components/pokedex/`:

| File | Responsibility |
|---|---|
| `DexDevice.tsx` | Red shell (bevels, lens, three LEDs, count), top bezel slot, hinge, bottom bezel slot, footer (d-pad, A/B) |
| `DexTopScreen.tsx` | LCD: front sprite, `No.0006`, name, type chips, pips; tabs STATS / ABILITY / MOVES / SIGNS; fixed height, own scroll |
| `DexList.tsx` | Paper rows: number, icon, name, pips; selected row in `select`; "▼ MORE (n)" row |
| `DexFilters.tsx` | Search input and type filter in the bottom screen's top strip |
| `PokedexScreen.tsx` | State (query, type, visible count, selected dex id, tab), owned-dex fetch, keyboard |

### Layout

- The page is `ui-field`, the device is centred with `max-w-[520px]` and a 16px side gutter. Above the device
  there is a `ui-button` "◀ Back" that calls `onBack`.
- The top screen has a fixed height (about 300px on phones, taller on desktop) and scrolls internally. On
  phones it is `sticky top-0` so it stays visible while the page scrolls the list.
- Front sprite: 96px on phones, 192px from `sm` up (the 192px files are 2× upscaled art, so 96 is exact). List icons: the
  native 64px frame, shown through a 48px-tall window that crops empty headroom.

### Behaviour

- Selection is stored by `dexId`. On load and when filters change, the current selection stays if it is still
  in the results; otherwise the first result is selected; with no results nothing is selected.
- ↑/↓ moves through the filtered list, growing the reveal window when stepping past it and scrolling the row
  into view. ←/→ cycles tabs. Esc calls `onBack`. The handler ignores events from the search input.
- Clicking a row selects it. The type filter toggles one type or "All", as today.
- STATS tab: collection pips with labels (signed in), six `StatBar`s (max 200, as today), total.
- ABILITY tab: `abilitiesForDex` → name and description.
- MOVES tab: `candidateMovesFor`, one LCD row per move (name, type chip, category, power/accuracy, STAB tag),
  using the same helpers `MoveRow` uses (exported from `MovesModal.tsx` if they are local) instead of
  `MoveRow`, which assumes a dark surface.
- SIGNS tab: `eligibleSigns` with icons, best fit first and highlighted, with the existing explanation line.

### States

| State | Header | List | Top screen |
|---|---|---|---|
| Signed out (`me` absent; unreachable today because login is required, kept because the prop is optional) | `1025 SPECIES` | No pips, all in colour | No collection block |
| Signed in, loaded | `caught / 1025` | Pips; uncaught icon is a silhouette, name shown | Pips; uncaught sprite is a silhouette |
| Signed in, fetch failed (`fetchPokedex` → `null`) | `1025 SPECIES` | No pips | LCD line "Couldn't load your collection." |
| Signed in, loading | `… / 1025` | No pips yet | Normal |
| No results | Count unchanged | "No Pokémon match." | Idle LCD (Poké Ball, "Search the Pokédex") |

## 3. Verification and housekeeping

- No new unit tests. The change is presentation only and the filter logic moves unchanged, so nothing new
  meets `.agents/rules/testing.md`'s four questions. Evidence: the full gate plus the browser check in
  criterion 8, reported with the tested diff.
- `CHANGELOG.md` `[Unreleased]` → Changed: the pixel Pokédex and the Night backdrop.
- `.gitignore` gains `.superpowers/`.
- `App.tsx` and `HubScreen.tsx` are out of scope for this slice and stay untouched. Commits stage only this
  work's paths.
