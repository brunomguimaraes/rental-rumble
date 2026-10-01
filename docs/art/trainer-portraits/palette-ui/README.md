# Unnamed palette choices — 2026-10-01

The trainer editor offers six skin swatches and twelve hair swatches without color
names. A reset icon restores Original. Deep brown and Ebony are omitted from the
picker; existing saved palette IDs still render and validate. Radio controls use
numbered accessible names, and the selected swatch has a check mark and gold border.
All 40 faces share one paged gallery without gender labels or filters.

Browser verification used the actual `TrainerIdentityPicker` and
`TrainerAppearanceDialog` in a temporary component fixture on the running local
Vite server at port 3000. No account data was written; the fixture was removed.
Tested local changes based on `2004892e6`.

- Desktop skin menu: six color choices and Original, no color names.
- 320×568 mobile: [skin](skin-mobile.png), [hair](hair-mobile.png),
  [all-face gallery](faces-mobile.png). Menus fit the viewport.
- Selected skin choice 6, reset to Original, selected hair choice 9, and observed
  the matching preview updates and radio selection states.
- Paged from faces 1–9 to 37–40; Next disables on the final page.
- Selected Golden Ribbon and closed the dialog; the main preview matched.
- Browser console: no warnings or errors. `npx tsc -b` and `git diff --check` passed.
- `npm run lint && npm test && npm run build` passed. Vite reported its existing
  large-chunk warning.
