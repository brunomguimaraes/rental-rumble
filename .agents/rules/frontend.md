# Frontend

Vite SPA, React 19, Tailwind CSS v4. `src/App.tsx` owns the phase state machine and top-level data; screens in
`src/components/` render it. Follow the neighboring file when it has a more specific pattern.

## Data flow

**Screen → `src/game/*-client.ts` or fetch helper → `/api/...`**

- Components never call `fetch` directly. Add or extend a helper next to its domain (`idle-client.ts`,
  `account.ts`, `box.ts`, `profile.ts`).
- Helpers send `credentials: 'include'`, never throw, and return `{ ok, error? }`. `ok: false` means the request
  failed; callers must not read it as an empty result (no session, empty box). Keep that distinction in new helpers.
- Show the server's `error` string to the player; it is written for them.
- The server is authoritative for levels, EXP, evolutions, and the box. Render what a response returns; never
  compute growth client-side and write it back.
- Load independent requests together (`Promise.all`), not in a chain of awaits or cascading effects.

## TypeScript

- Keep strict TypeScript intact. No new `any`; narrow `unknown` at the boundary instead.
- Reuse domain types from `src/game/` (`OwnedMon`, `Creature`, `RouteId`, …) instead of redeclaring shapes.
- A function that needs more than three arguments takes one typed object.
- Client env comes from `import.meta.env`; `process.env` belongs to `api/` and `scripts/` only.

## Naming

- Components and types: PascalCase (`ClaimScreen`, `IdleSession`). Component files match the component name.
- Functions and variables: camelCase, functions start with a verb (`fetchBox`, `needsOnboarding`).
- Hooks: `use` prefix. Avoid abbreviations beyond established terms (`id`, `dex`, `exp`, `hp`, `api`).

## React

- Derive values during render. Use effects only to sync with something external (fetch on mount, timers,
  `hashchange`), never for derived state or to react to a user action.
- Do not define components inside other components.
- Add `useMemo`/`useCallback`/`memo` only for a real cost, such as filtering or sorting the 1025-species dex or
  large sprite lists; not by default.
- Keep state close to its readers; lift to `App.tsx` only what several screens share.
- Every async screen handles loading, empty, and error states. Disable a submit while its request is in flight.
- No `console.log` left behind in components.

## Performance

Fix in this order:

1. Request waterfalls: sequential awaits, cascading effects.
2. Bundle size: lazy-load screens that are not on the first path (`lazy()` in `App.tsx`); keep heavy generated
   data (`*.gen.ts`) out of the eager bundle where possible.
3. Re-renders from wide state or unstable props.
4. Rendering: long lists need stable ids as keys (never the index); sprites use `loading="lazy"` off-screen.

## Styling and accessibility

- Tailwind utilities; match the palette and spacing of neighboring screens (theme tokens live in `src/index.css`). Pixel sprites keep `[image-rendering:pixelated]`.
- Layouts work at phone width. Interactive elements are real `<button>`/`<a>` with a visible focus state;
  sprites and icons that carry meaning have `alt` text.
