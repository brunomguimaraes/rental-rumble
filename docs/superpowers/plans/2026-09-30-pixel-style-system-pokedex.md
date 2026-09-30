# Night Pixel Style System + Handheld Pokédex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "Night" pixel style system (tokens, utilities, two primitives, rules doc) and rebuild the
Pokédex on it as a DS-style red handheld.

**Architecture:** Tokens live in a `@theme static` block in `src/index.css` so Tailwind v4 generates
`bg-window`, `text-lcd-ink`, `font-pixel`, and so on. Frame effects are `@utility ui-*` classes. Two
presentational primitives go in `src/components/ui/`. The Pokédex splits into `src/components/pokedex/`, and
`PokedexScreen.tsx` keeps its path and props, so `App.tsx` doesn't change.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4.3 (`@tailwindcss/vite`), oxlint, Vite.

**Spec:** `docs/superpowers/specs/2026-09-30-pixel-style-system-pokedex-design.md`

## Global Constraints

- Work on `development`. Commit only the paths each task names. Don't touch `src/App.tsx` or `src/components/HubScreen.tsx`.
- Commit messages carry no `Co-Authored-By` trailer (owner preference).
- No API, schema, seed, or save changes. `fetchPokedex` and `/api/me/pokedex` stay as they are.
- Colours come from tokens. The only literal colours allowed are `TYPE_COLORS` (type chips) and `#fff`/`#000`
  in text-shadows.
- Pixel sprites render at their native size or a whole multiple of it, with `[image-rendering:pixelated]`:
  front 192 → 96 or 192; portrait 40 → 40 or 80; icon frame 64 → 64.
- Font sizes: Pixelify Sans (`font-pixel`) ≥ 12px; Silkscreen (`font-label`) 8–11px, uppercase; Press Start 2P
  only in `.dmg-number`.
- Every control is a real `<button>` or `<input>` with `ui-focus`. Text contrast ≥ 4.5:1 against its surface.
- Runtime relative imports in `src/components` may omit `.js` (matching neighbouring files).
- No new unit tests. Filter logic moves unchanged, and nothing new meets `.agents/rules/testing.md`'s four
  questions. Evidence is `npm run lint && npm test && npm run build` plus a browser check.

## Review Focus

1. **The sticky top screen hides the selected row on a phone.** Pressing ↓ or tapping must leave the selected
   row visible below the pinned LCD. The rows' `scroll-mt-[320px]` handles this; check it at 375px in Task 5.
2. **A filter change strands the selection outside the revealed rows.** The selected species must always
   appear in the list. `shownCount = max(visible, selectedIndex + 1)` covers this; check it in Task 5 by
   selecting #0200, then typing "2".
3. **The collection fetch fails while signed in.** The dex must say "Couldn't load your collection." and show
   no pips, rather than rendering every species as uncaught. Check it in Task 5 by blocking
   `/api/me/pokedex` in DevTools.
4. **Arrow keys while typing in search.** The cursor must move inside the input, not the selection. The
   handler returns early for `HTMLInputElement`; check it in Task 5.
5. **A missing sprite file.** An image that fails to load must fall back once, not loop. `PixelSprite` guards
   the swap with `data-fell-back`; check it in Task 5 by pointing one row at a bad URL in DevTools.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `index.html` | modify | Load Pixelify Sans and Silkscreen with Press Start 2P |
| `src/index.css` | modify | Night `@theme static` tokens, `ui-*` utilities, Night field on `body` |
| `.agents/rules/styling.md` | create | The styling rules |
| `AGENTS.md` | modify | Task-table row → `styling.md` |
| `.agents/rules/frontend.md` | modify | Styling section points to `styling.md` |
| `src/components/ui/StatBar.tsx` | create | Segmented block bar |
| `src/components/ui/PixelSprite.tsx` | create | Crisp sprite, 2-frame sheet crop, one-shot fallback, silhouette |
| `src/components/pokedex/dex.ts` | create | Pure dex view helpers: numbering, marks, filter, tabs, layers |
| `src/components/pokedex/CollectionPips.tsx` | create | Three collection pips for light dex screens |
| `src/components/pokedex/DexTopScreen.tsx` | create | LCD: header and the STATS / ABILITY / MOVES / SIGNS tabs |
| `src/components/pokedex/DexFilters.tsx` | create | Search plus type filter strip |
| `src/components/pokedex/DexList.tsx` | create | Paper list rows plus the MORE row |
| `src/components/pokedex/DexDevice.tsx` | create | Red shell, sticky top bezel, hinge, bottom bezel |
| `src/components/PokedexScreen.tsx` | rewrite | State, fetch, keyboard, composition |
| `CHANGELOG.md` | modify | `[Unreleased]` → Changed |

---

### Task 1: Night tokens, utilities, fonts, and the rules doc

**Files:**
- Modify: `index.html` (the Google Fonts `<link>` near line 57)
- Modify: `src/index.css` (after the existing `@theme` block at lines 3–5, and the `body` rule at lines 41–51)
- Create: `.agents/rules/styling.md`
- Modify: `AGENTS.md` (task table, lines 14–22)
- Modify: `.agents/rules/frontend.md` (the first bullet under `## Styling and accessibility`)

**Interfaces:**
- Produces: Tailwind colour utilities for every `--color-*` below (`bg-window`, `text-ink`, `bg-lcd`,
  `text-lcd-ink`, `bg-lcd-dim`, `bg-paper`, `text-paper-ink`, `bg-select`, `bg-dex-red`, `bg-dex-red-dark`,
  `bg-dex-red-light`, `bg-dex-bezel`, `bg-dex-lens`, `bg-caught-alt-ink`, `bg-caught-shiny-ink`, `bg-edge`,
  `bg-exp`, …); `font-pixel`, `font-label`; the utilities `ui-field`, `ui-window`, `ui-button`, `ui-focus`.

- [ ] **Step 1: Load the fonts.** In `index.html`, replace the stylesheet `href` with:

```html
      href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Press+Start+2P&family=Silkscreen&display=swap"
```

- [ ] **Step 2: Add the Night tokens.** In `src/index.css`, insert this directly after the existing
`@theme { --font-display: … }` block:

```css
/* Night — the game-wide pixel system (see .agents/rules/styling.md). `static`
   emits every token as a CSS variable, because the ui-* utilities below read
   them through var() rather than through a generated class. */
@theme static {
  --color-field: #141a2c;
  --color-field-stripe-a: #161d31;
  --color-field-stripe-b: #121828;
  --color-window: #1e2740;
  --color-window-rim: #8fa6cc;
  --color-window-frame: #3a4c74;
  --color-edge: #0a0d18;
  --color-ink: #f2f0e6;
  --color-ink-dim: #9aa6c4;
  --color-accent: #ffd447;
  --color-info: #7fb4ff;
  --color-exp: #5fd4ff;
  --color-slot: #161e34;
  --color-button: #2a3656;

  /* Pokédex device — only inside src/components/pokedex/. */
  --color-dex-red: #d62e3a;
  --color-dex-red-dark: #8f1622;
  --color-dex-red-light: #f0707a;
  --color-dex-bezel: #222222;
  --color-dex-lens: #5ec8f2;
  --color-dex-lens-dark: #2a8fc0;
  --color-lcd: #e8f0d8;
  --color-lcd-grid: #d8e4c8;
  --color-lcd-ink: #203018;
  --color-lcd-dim: #b8c8a8;
  --color-paper: #f8f8f0;
  --color-paper-ink: #282828;
  --color-select: #f8d030;

  /* Collection layers: Night surfaces, then the darker pair for the dex's light screens. */
  --color-caught-normal: #ffffff;
  --color-caught-alt: #5eead4;
  --color-caught-shiny: #f5c542;
  --color-caught-alt-ink: #1d9a86;
  --color-caught-shiny-ink: #a67c00;

  --font-pixel: 'Pixelify Sans', system-ui, sans-serif;
  --font-label: 'Silkscreen', ui-monospace, monospace;
}

@utility ui-field {
  background-color: var(--color-field);
  background-image: repeating-linear-gradient(
    45deg,
    var(--color-field-stripe-a) 0 6px,
    var(--color-field-stripe-b) 6px 12px
  );
}

/* A GBA menu window: light rim, frame, dark edge, then a hard drop shadow. The
   rings are spread shadows drawn outside the box, so leave ≥ 8px around it. */
@utility ui-window {
  background-color: var(--color-window);
  color: var(--color-ink);
  border-radius: 6px;
  box-shadow:
    0 0 0 2px var(--color-window-rim),
    0 0 0 5px var(--color-window-frame),
    0 0 0 7px var(--color-edge),
    5px 5px 0 7px rgb(0 0 0 / 0.45);
}

/* A pressable pixel button: the hard shadow collapses as it moves 2px in. */
@utility ui-button {
  background-color: var(--color-button);
  color: var(--color-ink);
  border-radius: 3px;
  box-shadow:
    0 0 0 2px var(--color-window-frame),
    2px 2px 0 2px var(--color-edge);
  &:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 2px var(--color-window-frame);
  }
  &:disabled {
    opacity: 0.5;
  }
}

@utility ui-focus {
  &:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 3: Paint the Night field on `body`.** In the `body` rule, replace the three-line `background:`
declaration (the two radial gradients plus `#0a0a0f`) with:

```css
  background-color: var(--color-field);
  background-image: repeating-linear-gradient(
    45deg,
    var(--color-field-stripe-a) 0 6px,
    var(--color-field-stripe-b) 6px 12px
  );
```

Leave `color`, `font-family`, and the rest of the rule unchanged.

- [ ] **Step 4: Write `.agents/rules/styling.md`:**

````markdown
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

## Motion

Keep animation short and purposeful. Use `steps()` where it should read as pixel motion. Every animation is
disabled under `prefers-reduced-motion`.

## Accessibility

- Every control is a real `<button>`/`<a>`/`<input>` with `ui-focus`.
- Text meets 4.5:1 against its surface, and non-text marks like pips meet 3:1. Dimmed text uses a colour
  with an alpha (for example `text-paper-ink/75`), never `opacity` below 0.75.
- Meaningful sprites carry `alt`. Use `alt=""` when the name is printed right next to the sprite.

## Primitives

`src/components/ui/` holds a primitive only once a screen uses it: `StatBar` and `PixelSprite` today.
`Window` and `MenuList` arrive with the Hub migration.

## Migration order

Hub → Box → Account / Login / Onboarding → Battle. Migrate one screen per slice. Each slice takes the screen
off `font-display` and glass, and adds the primitives it is the first to need.
````

- [ ] **Step 5: Link the rules.** In `AGENTS.md`, add this row after the frontend row:

```markdown
| Colours, type, sprites, visual style | `.agents/rules/styling.md` |
```

In `.agents/rules/frontend.md`, replace the first bullet under `## Styling and accessibility` with:

```markdown
- Tailwind utilities from the Night tokens; follow `.agents/rules/styling.md` for colours, type, frames, and
  sprite scaling. Pixel sprites keep `[image-rendering:pixelated]`.
```

- [ ] **Step 6: Verify the build and that the tokens are emitted.**

Run: `npm run build && grep -o -- '--color-window-rim:#8fa6cc\|--color-lcd-ink:#203018' dist/assets/*.css | sort -u`
Expected: build succeeds; both tokens print (proves `@theme static` emits them).

- [ ] **Step 7: Commit**

```bash
git add index.html src/index.css .agents/rules/styling.md AGENTS.md .agents/rules/frontend.md
git commit -m "Add the Night pixel style system: tokens, ui utilities, fonts, styling rules"
```

---

### Task 2: `StatBar` and `PixelSprite` primitives

**Files:**
- Create: `src/components/ui/StatBar.tsx`
- Create: `src/components/ui/PixelSprite.tsx`

**Interfaces:**
- Consumes: the Task 1 tokens (`bg-lcd-ink`, `bg-lcd-dim`, `bg-exp`, `bg-edge`).
- Produces:
  - `StatBar(props: { value: number; max: number; tone: 'lcd' | 'night'; label: string; segments?: number })`
  - `PixelSprite(props: { src: string; size: number; alt: string; fallback?: string; sheet?: boolean; silhouette?: boolean; className?: string })`

- [ ] **Step 1: Write `src/components/ui/StatBar.tsx`:**

```tsx
type Tone = 'lcd' | 'night';

const FILL: Record<Tone, string> = { lcd: 'bg-lcd-ink', night: 'bg-exp' };
const TROUGH: Record<Tone, string> = { lcd: 'bg-lcd-dim', night: 'bg-edge' };

/**
 * A segmented block bar. `value` out of `max` rounds up to whole segments, so
 * any non-zero value lights at least one block; values above `max` fill it.
 */
export function StatBar({
  value,
  max,
  tone,
  label,
  segments = 10,
}: {
  value: number;
  max: number;
  tone: Tone;
  label: string;
  segments?: number;
}) {
  const filled = value <= 0 ? 0 : Math.min(segments, Math.ceil((value / max) * segments));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="flex min-w-0 flex-1 gap-px"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={`h-2 flex-1 ${i < filled ? FILL[tone] : TROUGH[tone]}`} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/ui/PixelSprite.tsx`:**

```tsx
/**
 * Pixel art drawn crisp. `size` is the rendered edge in px: the art's native
 * size or a whole multiple of it (.agents/rules/styling.md). A `className`
 * width/height (e.g. `sm:h-48 sm:w-48`) may step it up at a breakpoint.
 *
 * `sheet` sprites are 2-frame icon sheets (width = 2 × height), drawn as a
 * background so only the first frame shows. `silhouette` blacks the art out
 * for an uncaught species. `fallback` replaces a failed image once.
 */
export function PixelSprite({
  src,
  size,
  alt,
  fallback,
  sheet = false,
  silhouette = false,
  className = '',
}: {
  src: string;
  size: number;
  alt: string;
  fallback?: string;
  sheet?: boolean;
  silhouette?: boolean;
  className?: string;
}) {
  const tint = silhouette ? 'brightness-0 opacity-40' : '';
  if (sheet) {
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`shrink-0 bg-no-repeat [image-rendering:pixelated] ${tint} ${className}`}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${src})`,
          backgroundSize: '200% 100%',
          backgroundPosition: 'left center',
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (!fallback || img.dataset.fellBack) return;
        img.dataset.fellBack = '1';
        img.src = fallback;
      }}
      className={`shrink-0 object-contain [image-rendering:pixelated] ${tint} ${className}`}
    />
  );
}
```

- [ ] **Step 3: Type-check and lint.**

Run: `npx tsc -b && npm run lint`
Expected: no errors (oxlint may report pre-existing warnings elsewhere; none from `src/components/ui/`).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/StatBar.tsx src/components/ui/PixelSprite.tsx
git commit -m "Add StatBar and PixelSprite primitives"
```

---

### Task 3: Dex helpers, collection pips, and the LCD top screen

**Files:**
- Create: `src/components/pokedex/dex.ts`
- Create: `src/components/pokedex/CollectionPips.tsx`
- Create: `src/components/pokedex/DexTopScreen.tsx`

**Interfaces:**
- Consumes: `StatBar`, `PixelSprite` (Task 2); `hasForm`, `OwnedDex` from `src/game/account.ts`;
  `abilitiesForDex`, `abilityInfo` (`src/game/abilities.ts`); `candidateMovesFor`, `moveCategoryLabel`,
  `moveEffectLabel`, `moveSelfNote` (`src/game/moves.ts`); `TYPE_COLORS`, `typeLabel`
  (`src/game/typechart.ts`); `signIconUrl`, `signLabel`, `signSummary` (`src/game/zodiac.ts`).
- Produces:
  - `dex.ts`: `type VariantMarks = { n: boolean; a: boolean; s: boolean }`,
    `type DexTab = 'stats' | 'ability' | 'moves' | 'signs'`,
    `DEX_TABS: readonly { id: DexTab; label: string }[]`, `PAGE = 120`,
    `COLLECTION_LAYERS: readonly { key: keyof VariantMarks; label: string; fill: string }[]`,
    `paddedDexNo(dexId: number): string`, `marksFor(owned: OwnedDex | null, dexId: number): VariantMarks | null`,
    `caughtAny(marks: VariantMarks): boolean`, `baseStatTotal(c: Creature): number`,
    `filterCreatures(all: readonly Creature[], query: string, type: PokemonType | null): Creature[]`
  - `CollectionPips(props: { marks: VariantMarks })`
  - `DexTopScreen(props: { creature: Creature | null; marks: VariantMarks | null; collectionError: boolean; tab: DexTab; onTab: (tab: DexTab) => void })`

- [ ] **Step 1: Write `src/components/pokedex/dex.ts`.** The filter is the current `PokedexScreen` filter,
moved unchanged apart from the padded-number helper:

```ts
import type { Creature, PokemonType } from '../../game/types';
import { hasForm, type OwnedDex } from '../../game/account';

/** Which collection layers a player has caught for one species. */
export type VariantMarks = { n: boolean; a: boolean; s: boolean };

export type DexTab = 'stats' | 'ability' | 'moves' | 'signs';

export const DEX_TABS: readonly { id: DexTab; label: string }[] = [
  { id: 'stats', label: 'Stats' },
  { id: 'ability', label: 'Ability' },
  { id: 'moves', label: 'Moves' },
  { id: 'signs', label: 'Signs' },
];

/** List rows revealed at a time; the full National Dex is 1,025. */
export const PAGE = 120;

/** The three layers, in pip order, with their fill on the dex's light screens. */
export const COLLECTION_LAYERS: readonly {
  key: keyof VariantMarks;
  label: string;
  fill: string;
}[] = [
  { key: 'n', label: 'Normal', fill: 'bg-current' },
  { key: 'a', label: 'Alt colour', fill: 'bg-caught-alt-ink' },
  { key: 's', label: 'Shiny', fill: 'bg-caught-shiny-ink' },
];

export function paddedDexNo(dexId: number): string {
  return String(dexId).padStart(4, '0');
}

export function marksFor(owned: OwnedDex | null, dexId: number): VariantMarks | null {
  if (!owned) return null;
  return {
    n: hasForm(owned.n, dexId),
    a: hasForm(owned.a, dexId),
    s: hasForm(owned.s, dexId),
  };
}

export function caughtAny(marks: VariantMarks): boolean {
  return marks.n || marks.a || marks.s;
}

export function baseStatTotal(c: Creature): number {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
}

/** Name substring or dex number ("25", "#25", "0025"), optionally one type. */
export function filterCreatures(
  all: readonly Creature[],
  query: string,
  type: PokemonType | null,
): Creature[] {
  const q = query.trim().toLowerCase();
  const qNum = q.replace(/^#/, '');
  return all.filter((c) => {
    if (type && !c.types.includes(type)) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      String(c.dexId) === qNum ||
      `#${paddedDexNo(c.dexId)}`.includes(qNum)
    );
  });
}
```

- [ ] **Step 2: Write `src/components/pokedex/CollectionPips.tsx`:**

```tsx
import { COLLECTION_LAYERS, type VariantMarks } from './dex';

/** Three square pips (normal / alt colour / shiny) in the surrounding ink colour. */
export function CollectionPips({ marks }: { marks: VariantMarks }) {
  const owned = COLLECTION_LAYERS.filter((l) => marks[l.key]).map((l) => l.label.toLowerCase());
  return (
    <span
      role="img"
      aria-label={owned.length ? `Caught: ${owned.join(', ')}` : 'Not caught'}
      className="flex shrink-0 items-center gap-0.5"
    >
      {COLLECTION_LAYERS.map((l) => (
        <span
          key={l.key}
          className={`h-1.5 w-1.5 border border-current ${marks[l.key] ? l.fill : ''}`}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 3: Write `src/components/pokedex/DexTopScreen.tsx`:**

```tsx
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Creature, PokemonType } from '../../game/types';
import { abilitiesForDex, abilityInfo } from '../../game/abilities';
import {
  candidateMovesFor,
  moveCategoryLabel,
  moveEffectLabel,
  moveSelfNote,
} from '../../game/moves';
import { TYPE_COLORS, typeLabel } from '../../game/typechart';
import { signIconUrl, signLabel, signSummary } from '../../game/zodiac';
import { PixelSprite } from '../ui/PixelSprite';
import { StatBar } from '../ui/StatBar';
import { CollectionPips } from './CollectionPips';
import {
  COLLECTION_LAYERS,
  DEX_TABS,
  baseStatTotal,
  caughtAny,
  paddedDexNo,
  type DexTab,
  type VariantMarks,
} from './dex';

const LCD_GRID: CSSProperties = {
  backgroundImage:
    'linear-gradient(var(--color-lcd-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-lcd-grid) 1px, transparent 1px)',
  backgroundSize: '8px 8px',
};

const STAT_ROWS = [
  ['HP', 'hp'],
  ['P.Atk', 'atk'],
  ['E.Atk', 'eatk'],
  ['P.Def', 'def'],
  ['E.Def', 'edef'],
  ['Speed', 'spd'],
] as const;

function TypeChip({ type }: { type: PokemonType }) {
  return (
    <span
      className="inline-block px-1 font-label text-[9px] uppercase leading-4 text-white [text-shadow:1px_1px_0_#000]"
      style={{ background: TYPE_COLORS[type] }}
    >
      {typeLabel(type)}
    </span>
  );
}

function StatsPanel({ creature, marks }: { creature: Creature; marks: VariantMarks | null }) {
  return (
    <div className="space-y-2">
      {marks && (
        <ul className="flex flex-wrap gap-x-3 text-xs">
          {COLLECTION_LAYERS.map((l) => (
            <li key={l.key} className={marks[l.key] ? '' : 'text-lcd-ink/75'}>
              {marks[l.key] ? '■' : '□'} {l.label}
              {marks[l.key] ? '' : ' — not yet'}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1">
        {STAT_ROWS.map(([label, key]) => {
          const value = creature.stats[key];
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="w-11 shrink-0 font-label text-[9px] uppercase">{label}</span>
              <StatBar tone="lcd" value={value} max={200} label={`${label} ${value}`} />
              <span className="w-8 shrink-0 text-right tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>
      <div className="text-right font-label text-[9px] uppercase">
        Total {baseStatTotal(creature)}
      </div>
    </div>
  );
}

function AbilityPanel({ creature }: { creature: Creature }) {
  const abilities = abilitiesForDex(creature.dexId).map(abilityInfo);
  if (abilities.length === 0) return <p className="text-xs">No ability.</p>;
  return (
    <ul className="space-y-2">
      {abilities.map((a) => (
        <li key={a.id}>
          <div className="text-sm font-bold">✦ {a.name}</div>
          <p className="text-xs leading-snug">{a.description}</p>
        </li>
      ))}
    </ul>
  );
}

function MovesPanel({ creature }: { creature: Creature }) {
  const moves = useMemo(
    () => candidateMovesFor(creature.types, creature.dexId),
    [creature.types, creature.dexId],
  );
  const own = new Set(creature.types);
  return (
    <div>
      <div className="flex justify-end gap-2 font-label text-[8px] uppercase">
        <span className="w-9 text-right">Pow</span>
        <span className="w-9 text-right">Acc</span>
      </div>
      <ul>
        {moves.map((move) => {
          const selfNote = moveSelfNote(move);
          return (
            <li
              key={move.name}
              className="flex items-center gap-2 border-b border-dashed border-lcd-dim py-1 text-xs"
            >
              <TypeChip type={move.type} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1 font-semibold">
                  {move.name}
                  {own.has(move.type) && (
                    <span className="bg-lcd-ink px-0.5 font-label text-[8px] text-lcd">STAB</span>
                  )}
                </div>
                <div className="text-lcd-ink/75">
                  {moveCategoryLabel(move)}
                  {move.effect && ` · ${moveEffectLabel(move.effect)}`}
                  {selfNote && ` · ${selfNote}`}
                </div>
              </div>
              <span className="w-9 shrink-0 text-right tabular-nums">
                {move.power === 0 ? '—' : move.power}
              </span>
              <span className="w-9 shrink-0 text-right tabular-nums">
                {Math.round(move.accuracy * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs leading-snug text-lcd-ink/75">
        Every move this species can roll or swap into after battle. Its actual kit depends on sign,
        stats, and build.
      </p>
    </div>
  );
}

function SignsPanel({ creature }: { creature: Creature }) {
  return (
    <div>
      <ul className="flex flex-wrap gap-1">
        {creature.eligibleSigns.map((sign, i) => (
          <li
            key={sign}
            title={signSummary(sign)}
            className={`inline-flex items-center gap-1 px-1 py-0.5 font-label text-[9px] uppercase ${
              i === 0 ? 'bg-lcd-ink text-lcd' : 'bg-lcd-dim'
            }`}
          >
            <img src={signIconUrl(sign)} alt="" className="h-3.5 w-3.5 object-contain" />
            {signLabel(sign)}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs leading-snug text-lcd-ink/75">
        A Pokémon can carry any sign, but the draft favours the ones that suit its stats. The dark one
        is its best fit.
      </p>
    </div>
  );
}

/** The DS top screen: the selected species and its tabbed details. */
export function DexTopScreen({
  creature,
  marks,
  collectionError,
  tab,
  onTab,
}: {
  creature: Creature | null;
  marks: VariantMarks | null;
  collectionError: boolean;
  tab: DexTab;
  onTab: (tab: DexTab) => void;
}) {
  if (!creature) {
    return (
      <div
        className="grid h-[300px] place-items-center bg-lcd font-pixel text-sm text-lcd-ink sm:h-[380px]"
        style={LCD_GRID}
      >
        <div className="flex flex-col items-center gap-2">
          {/* 197px smooth art, not pixel-sized: a plain contained image. */}
          <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="" className="h-12 w-12 object-contain" />
          Search the Pokédex
        </div>
      </div>
    );
  }
  const uncaught = marks !== null && !caughtAny(marks);
  return (
    <div
      className="flex h-[300px] flex-col bg-lcd font-pixel text-lcd-ink sm:h-[380px]"
      style={LCD_GRID}
    >
      <div className="flex items-center gap-3 p-2">
        <PixelSprite
          src={creature.sprite}
          size={96}
          alt={creature.name}
          silhouette={uncaught}
          className="sm:h-48 sm:w-48"
        />
        <div className="min-w-0 flex-1">
          <div className="font-label text-[10px]">No.{paddedDexNo(creature.dexId)}</div>
          <h2 className="truncate text-lg font-bold uppercase leading-tight">{creature.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            {creature.types.map((t) => (
              <TypeChip key={t} type={t} />
            ))}
          </div>
          {marks && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              <CollectionPips marks={marks} />
              {uncaught ? 'Not caught yet' : 'Caught'}
            </div>
          )}
          {collectionError && (
            <p className="mt-1.5 text-xs text-dex-red-dark">Couldn’t load your collection.</p>
          )}
        </div>
      </div>
      <div role="tablist" aria-label="Pokédex details" className="flex gap-0.5 px-2">
        {DEX_TABS.map((t) => (
          <button
            key={t.id}
            id={`dex-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="dex-tabpanel"
            onClick={() => onTab(t.id)}
            className={`ui-focus px-1.5 py-0.5 font-label text-[10px] uppercase ${
              tab === t.id ? 'bg-lcd-ink text-lcd' : 'bg-lcd-dim text-lcd-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id="dex-tabpanel"
        role="tabpanel"
        aria-labelledby={`dex-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {tab === 'stats' && <StatsPanel creature={creature} marks={marks} />}
        {tab === 'ability' && <AbilityPanel creature={creature} />}
        {tab === 'moves' && <MovesPanel creature={creature} />}
        {tab === 'signs' && <SignsPanel creature={creature} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint.**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/pokedex/dex.ts src/components/pokedex/CollectionPips.tsx src/components/pokedex/DexTopScreen.tsx
git commit -m "Add the Pokédex LCD top screen with stats, ability, moves, and signs tabs"
```

---

### Task 4: Device shell, filters, list, and the rewritten `PokedexScreen`

**Files:**
- Create: `src/components/pokedex/DexDevice.tsx`
- Create: `src/components/pokedex/DexFilters.tsx`
- Create: `src/components/pokedex/DexList.tsx`
- Rewrite: `src/components/PokedexScreen.tsx` (keep the export name and the `{ onBack, me? }` props)

**Interfaces:**
- Consumes: everything Task 3 produces; `PixelSprite`; `CREATURES` (`src/game/pokemon.ts`);
  `fetchPokedex(): Promise<OwnedDex | null>`, `AccountUser`, `OwnedDex` (`src/game/account.ts`);
  `ALL_TYPES`, `typeIconUrl`, `typeLabel` (`src/game/typechart.ts`).
- Produces:
  - `DexDevice(props: { countLabel: string; top: ReactNode; bottom: ReactNode })`
  - `DexFilters(props: { query: string; onQuery: (q: string) => void; type: PokemonType | null; onType: (t: PokemonType | null) => void })`
  - `DexList(props: { creatures: Creature[]; total: number; selectedId: number | null; onSelect: (dexId: number) => void; marksOf: (dexId: number) => VariantMarks | null; onMore: () => void })`
  - List rows carry `id="dex-row-<dexId>"` (the keyboard handler finds them by this id).

- [ ] **Step 1: Write `src/components/pokedex/DexDevice.tsx`.** The shell must not have
`overflow-hidden`, because it would break the sticky top screen:

```tsx
import type { ReactNode } from 'react';

/** The red DS-style handheld: lens and lights, top screen, hinge, bottom screen. */
export function DexDevice({
  countLabel,
  top,
  bottom,
}: {
  countLabel: string;
  top: ReactNode;
  bottom: ReactNode;
}) {
  return (
    <div className="rounded-[6px_6px_18px_6px] bg-dex-red p-2.5 shadow-[inset_-4px_-4px_0_var(--color-dex-red-dark),inset_4px_4px_0_var(--color-dex-red-light),6px_6px_0_var(--color-edge)]">
      <div className="mb-2 flex items-center gap-2">
        <span
          aria-hidden
          className="h-5 w-5 rounded-full bg-dex-lens shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--color-dex-bezel),inset_-3px_-3px_0_var(--color-dex-lens-dark)]"
        />
        <span aria-hidden className="ml-1 h-2 w-2 rounded-full bg-dex-red-light shadow-[0_0_0_2px_var(--color-dex-bezel)]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-select shadow-[0_0_0_2px_var(--color-dex-bezel)]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-caught-alt shadow-[0_0_0_2px_var(--color-dex-bezel)]" />
        <span className="ml-auto font-label text-[10px] uppercase text-white [text-shadow:1px_1px_0_#000]">
          {countLabel}
        </span>
      </div>
      <div className="sticky top-0 z-10 -mx-2.5 bg-dex-red px-2.5 py-1 sm:static">
        <div className="bg-dex-bezel p-1.5">{top}</div>
      </div>
      <div
        aria-hidden
        className="-mx-2.5 my-1.5 h-2.5 bg-dex-red-dark shadow-[inset_0_-2px_0_var(--color-dex-red-light)]"
      />
      <div className="bg-dex-bezel p-1.5">{bottom}</div>
      <div aria-hidden className="mt-2 flex items-center justify-between px-1">
        <span className="relative h-8 w-8">
          <span className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 bg-dex-bezel" />
          <span className="absolute inset-y-0 left-1/2 w-2.5 -translate-x-1/2 bg-dex-bezel" />
        </span>
        <span className="flex gap-1.5">
          <span className="h-4 w-4 rounded-full bg-dex-bezel" />
          <span className="h-4 w-4 rounded-full bg-dex-bezel" />
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/pokedex/DexFilters.tsx`:**

```tsx
import type { PokemonType } from '../../game/types';
import { ALL_TYPES, typeIconUrl, typeLabel } from '../../game/typechart';

/** Search plus one-type filter, in the bottom screen's top strip. */
export function DexFilters({
  query,
  onQuery,
  type,
  onType,
}: {
  query: string;
  onQuery: (q: string) => void;
  type: PokemonType | null;
  onType: (t: PokemonType | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 pb-1.5">
      <label htmlFor="dex-search" className="sr-only">
        Search the Pokédex
      </label>
      <input
        id="dex-search"
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search name or no.…"
        autoComplete="off"
        className="ui-focus w-full bg-paper px-2 py-1 font-pixel text-sm text-paper-ink placeholder:text-paper-ink/60"
      />
      <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={type === null}
          onClick={() => onType(null)}
          className={`ui-focus h-6 px-1.5 font-label text-[9px] uppercase ${
            type === null ? 'bg-select text-paper-ink' : 'bg-paper/15 text-paper hover:bg-paper/30'
          }`}
        >
          All
        </button>
        {ALL_TYPES.map((t) => {
          const on = type === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              title={typeLabel(t)}
              onClick={() => onType(on ? null : t)}
              className={`ui-focus grid h-6 w-6 place-items-center ${
                on ? 'bg-select' : 'bg-paper/15 hover:bg-paper/30'
              }`}
            >
              <img src={typeIconUrl(t)} alt={typeLabel(t)} className="h-4 w-4 object-contain" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/pokedex/DexList.tsx`.** On phones, `scroll-mt-[320px]` keeps a scrolled-to
row below the sticky top screen (300px LCD plus bezel padding). From `sm` up, the list scrolls inside itself:

```tsx
import type { Creature } from '../../game/types';
import { PixelSprite } from '../ui/PixelSprite';
import { CollectionPips } from './CollectionPips';
import { caughtAny, paddedDexNo, type VariantMarks } from './dex';

/** The DS bottom screen's paper list. */
export function DexList({
  creatures,
  total,
  selectedId,
  onSelect,
  marksOf,
  onMore,
}: {
  creatures: Creature[];
  total: number;
  selectedId: number | null;
  onSelect: (dexId: number) => void;
  marksOf: (dexId: number) => VariantMarks | null;
  onMore: () => void;
}) {
  if (total === 0) {
    return <p className="bg-paper p-4 text-center font-pixel text-sm text-paper-ink">No Pokémon match.</p>;
  }
  return (
    <ul aria-label="Pokémon" className="bg-paper font-pixel text-paper-ink sm:max-h-[360px] sm:overflow-y-auto">
      {creatures.map((c) => {
        const marks = marksOf(c.dexId);
        const uncaught = marks !== null && !caughtAny(marks);
        const on = c.dexId === selectedId;
        return (
          <li key={c.id}>
            <button
              id={`dex-row-${c.dexId}`}
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => onSelect(c.dexId)}
              className={`ui-focus flex h-12 w-full scroll-mt-[320px] items-center gap-2 border-b border-dashed border-paper-ink/20 pr-2 text-left sm:scroll-mt-0 ${
                on ? 'bg-select' : 'hover:bg-select/30'
              }`}
            >
              <span className="w-10 shrink-0 pl-2 font-label text-[10px]">{paddedDexNo(c.dexId)}</span>
              <span className="h-12 w-16 shrink-0 overflow-hidden">
                <PixelSprite sheet src={c.mini} size={64} alt="" silhouette={uncaught} className="-mt-3" />
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm ${uncaught ? 'text-paper-ink/75' : ''}`}>
                {c.name}
              </span>
              {marks && <CollectionPips marks={marks} />}
            </button>
          </li>
        );
      })}
      {total > creatures.length && (
        <li>
          <button
            type="button"
            onClick={onMore}
            className="ui-focus w-full py-2 font-label text-[10px] uppercase hover:bg-select/30"
          >
            ▼ More ({total - creatures.length})
          </button>
        </li>
      )}
    </ul>
  );
}
```

- [ ] **Step 4: Rewrite `src/components/PokedexScreen.tsx`.** Replace the whole file:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { PokemonType } from '../game/types';
import { CREATURES } from '../game/pokemon';
import { fetchPokedex, type AccountUser, type OwnedDex } from '../game/account';
import { DexDevice } from './pokedex/DexDevice';
import { DexFilters } from './pokedex/DexFilters';
import { DexList } from './pokedex/DexList';
import { DexTopScreen } from './pokedex/DexTopScreen';
import {
  DEX_TABS,
  PAGE,
  caughtAny,
  filterCreatures,
  marksFor,
  type DexTab,
} from './pokedex/dex';

type Collection =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; owned: OwnedDex }
  | { status: 'failed' };

/** The Pokédex as a DS-style handheld: detail LCD on top, species list below. */
export function PokedexScreen({
  onBack,
  me,
}: {
  onBack: () => void;
  me?: AccountUser | null;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PokemonType | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [tab, setTab] = useState<DexTab>('stats');
  const [collection, setCollection] = useState<Collection>(() =>
    me ? { status: 'loading' } : { status: 'none' },
  );

  // The signed-in player's owned dex. `null` from the helper is a failed load,
  // not an empty collection, so it gets its own state.
  useEffect(() => {
    if (!me) {
      setCollection({ status: 'none' });
      return;
    }
    let alive = true;
    setCollection({ status: 'loading' });
    fetchPokedex().then((owned) => {
      if (alive) setCollection(owned ? { status: 'ready', owned } : { status: 'failed' });
    });
    return () => {
      alive = false;
    };
  }, [me]);

  const owned = collection.status === 'ready' ? collection.owned : null;

  const caughtCount = useMemo(() => {
    if (!owned) return 0;
    return CREATURES.filter((c) => {
      const m = marksFor(owned, c.dexId);
      return m !== null && caughtAny(m);
    }).length;
  }, [owned]);

  const filtered = useMemo(
    () => filterCreatures(CREATURES, query, typeFilter),
    [query, typeFilter],
  );

  // Keep the picked species while it still matches; otherwise the first result.
  const selected = filtered.find((c) => c.dexId === pickedId) ?? filtered[0] ?? null;
  const selectedIndex = selected ? filtered.indexOf(selected) : -1;
  // Always reveal far enough to include the selection.
  const shown = filtered.slice(0, Math.max(visible, selectedIndex + 1));

  const countLabel =
    collection.status === 'ready'
      ? `${caughtCount} / ${CREATURES.length}`
      : collection.status === 'loading'
        ? `… / ${CREATURES.length}`
        : `${CREATURES.length} species`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        onBack();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const i = DEX_TABS.findIndex((t) => t.id === tab);
        const step = e.key === 'ArrowRight' ? 1 : DEX_TABS.length - 1;
        setTab(DEX_TABS[(i + step) % DEX_TABS.length].id);
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && selectedIndex >= 0) {
        e.preventDefault();
        const next = filtered[selectedIndex + (e.key === 'ArrowDown' ? 1 : -1)];
        if (!next) return;
        const rowFocused = document.activeElement?.id.startsWith('dex-row-') ?? false;
        setPickedId(next.dexId);
        requestAnimationFrame(() => {
          const row = document.getElementById(`dex-row-${next.dexId}`);
          if (rowFocused) row?.focus({ preventScroll: true });
          row?.scrollIntoView({ block: 'nearest' });
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, tab, filtered, selectedIndex]);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[552px] px-4 py-4 font-pixel text-ink sm:py-8">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="ui-button ui-focus px-3 py-1.5 font-label text-[10px] uppercase"
        >
          ◀ Back
        </button>
        <h1 className="font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">
          Pokédex
        </h1>
      </div>
      <DexDevice
        countLabel={countLabel}
        top={
          <DexTopScreen
            creature={selected}
            marks={selected ? marksFor(owned, selected.dexId) : null}
            collectionError={collection.status === 'failed'}
            tab={tab}
            onTab={setTab}
          />
        }
        bottom={
          <>
            <DexFilters
              query={query}
              onQuery={(q) => {
                setQuery(q);
                setVisible(PAGE);
              }}
              type={typeFilter}
              onType={(t) => {
                setTypeFilter(t);
                setVisible(PAGE);
              }}
            />
            <DexList
              creatures={shown}
              total={filtered.length}
              selectedId={selected?.dexId ?? null}
              onSelect={setPickedId}
              marksOf={(dexId) => marksFor(owned, dexId)}
              onMore={() => setVisible((v) => v + PAGE)}
            />
          </>
        }
      />
    </div>
  );
}
```

(`max-w-[552px]` is the spec's 520px device plus the 16px gutter on each side.)

- [ ] **Step 5: Type-check, lint, and build.**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no errors. `grep -rn "PokedexScreen" src/App.tsx` still shows the unchanged lazy import.

- [ ] **Step 6: Commit**

```bash
git add src/components/pokedex/DexDevice.tsx src/components/pokedex/DexFilters.tsx src/components/pokedex/DexList.tsx src/components/PokedexScreen.tsx
git commit -m "Rebuild the Pokédex as a DS-style handheld on the Night system"
```

---

### Task 5: Browser check, changelog, and the full gate

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Changed`)

- [ ] **Step 1: Start the local stack.** Run `npm run dev:local` in the background. It uses
`.env.local` → `file:local.db`. Never use `.env`, which points at the production Turso database. Open
`http://localhost:5173/` and sign in with a local account (create one on the login screen if none exists).
Go to Hub → Pokédex.

- [ ] **Step 2: Check at desktop width (≥ 1024px).** Confirm each of these:
  - The device is centred on the striped field and the page has no horizontal scroll.
  - The header shows `n / 1025`.
  - The Charizard-style header renders a 192px crisp sprite, with type chips and pips.
  - All four tabs render; MOVES lists moves with STAB tags; SIGNS highlights the best fit.
  - ↑/↓ moves the yellow row and keeps it scrolled into view; ←/→ cycles tabs; Esc returns to the Hub.
  - Typing "char" filters the list; ↑/↓ inside the input moves the text cursor, not the selection.
  - The Fire type filter toggles on and off.
  - "▼ MORE" reveals 120 more rows.

- [ ] **Step 3: Check at 375px (DevTools device mode).** Confirm each of these:
  - The top screen stays pinned while the list scrolls.
  - Tapping a row updates the LCD.
  - ↓ from a row keeps the selected row visible below the pinned screen (Review Focus 1).
  - The sprite is 96px and crisp.
  - There is no horizontal scroll.

- [ ] **Step 4: Check the edge states.**
  - Clear the search, select #0200 via "▼ MORE", then type `2`: #0200 stays selected and visible (Review Focus 2).
  - Type `zzzz`: "No Pokémon match." shows and the LCD shows "Search the Pokédex".
  - Block `/api/me/pokedex` in DevTools (Network → Block request URL) and reload the Pokédex: the header reads
    `1025 species`, the LCD says "Couldn't load your collection.", and no pips show (Review Focus 3).
  - In the Elements panel, change one list row's sprite URL to a bad path, and change the top screen `<img>`
    `src` to a bad path. Neither may loop requests in the Network tab (Review Focus 5).

- [ ] **Step 5: Add the changelog line** under `## [Unreleased]` → `### Changed` in `CHANGELOG.md`:

```markdown
- **Pokédex** — rebuilt as a pixel-art handheld: a detail screen on top (stats, ability, moves, signs) and the species list below, with crisp sprites and arrow-key browsing. The game's backdrop moves to the new "Night" pixel style.
```

- [ ] **Step 6: Run the full gate.**

Run: `npm run lint && npm test && npm run build`
Expected: all three pass. Record `git rev-parse --short HEAD` and the results.

- [ ] **Step 7: Commit**

```bash
git add CHANGELOG.md
git commit -m "Note the pixel Pokédex in the changelog"
```

- [ ] **Step 8: Report.** Report what changed, the gate results, and which browser checks ran and passed.
List anything that couldn't be checked. A local commit is not a push to `development`, and neither is a
release; don't claim either.
