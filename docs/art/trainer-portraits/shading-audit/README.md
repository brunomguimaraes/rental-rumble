# Portrait shading check — 2026-10-01

Follow-up to the Copper / Deep brown and Cobalt / Ebony + Blue screenshots.
The v4 masks and shader retain painted facial details and warm skin highlights,
cover missed temple and neckline skin, preserve dark ink inside curls, and soften
hair highlights. Original artwork and palette IDs are unchanged.

## Evidence

- [Before / after](before-after.png): original master-derived artwork, v3 masks
  with the previous shader, then v4 with the revised shader. Both rows use the
  palettes from the reported screenshots.
- [Desktop Cobalt](cobalt-desktop.png), [desktop Copper skin menu](copper-desktop.png)
  and [320px Copper skin menu](copper-skin-320.png): actual React picker and dialog.
- [Sheet 1](sheet-1.png), [2](sheet-2.png), [3](sheet-3.png), [4](sheet-4.png),
  [5](sheet-5.png), [6](sheet-6.png), [7](sheet-7.png), [8](sheet-8.png): all 40
  portraits, visually inspected with Original, Ebony skin, Silver hair, and
  Deep brown + Blue. These are offline renders using the real recoloring function.

## Checks

Tested the local portrait diff on `development`, based on `7b117210`. The shared
checkout also contained unrelated work; it was preserved.

- New asset regressions reproduced six missed/misclassified landmarks and four
  shading problems before the fix (341 passing, 10 failing checks).
- `node --import tsx scripts/trainer-portraits.test.ts`: 351 passed. Covers real
  PNG landmarks, freckles, nose and ear shading, hair highlight brightness, all
  40 base images, alpha and independent skin/hair palettes.
- `node --import tsx scripts/profile.test.ts`: 30 passed.
- `npm run lint && npm test && npm run build`: passed, including frontend and API
  type checks. Vite reported its existing large-chunk warning and plugin timings.
- Browser: the real `TrainerIdentityPicker` and `TrainerAppearanceDialog`, mounted
  in a temporary component fixture on the existing local Vite server at port 3000.
  Verified Copper / Deep brown and Cobalt / Ebony + Blue; Original restores source
  colors and hair can switch back to Blue. Desktop and 320×740 mobile previews
  fit their frames. The final browser log contained no warnings or errors.
  The fixture was removed after verification. This check did not exercise account
  persistence or make API writes.
- `git diff --check`: passed.

Build assets with `node scripts/build-trainer-portraits.mjs` in a runtime with
`sharp` installed. Region edits live in `materials-v4.json`; generated PNGs and
`material-coverage-v4.json` come from that script.
