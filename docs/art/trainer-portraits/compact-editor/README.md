# Compact trainer editor

Replaces the long identity form with a name field, portrait beside three adjustment controls, and one Continue action. Face opens a nine-at-a-time gallery with All / Masculine / Feminine filters; colors open a palette with a live portrait preview. Done or Escape keeps the current choice and restores focus to the opening control. Back from starter selection preserves name, face and colors. Profession selection remains omitted.

The interaction follows the category-and-preview approach documented in [Nintendo's Wii Mii Channel manual](https://csassets.nintendo.com/noaext/image/private/t_KA_PDF/WiiChEng?_a=DATC1RAAZAA0), particularly its feature menu and style menu on printed pages 8–9. The Night windows, typography and colors come from this game's existing design system.

## Previews

- [320×568 editor](editor-320.png), [390×844 editor](editor-390.png), [tablet](editor-768.png), [desktop](editor-1280.png).
- [Face browser](faces-320.png), [hair palette](hair-320.png), [customized trainer](customized-320.png).
- [Detail comparison](detail-before-after.png): previous 64px export on the left; direct-from-master 256px export on the right. Both are displayed at the same size.
- [Saved trainer in the Hub](saved-hub-390.png).

Screenshots were captured in local Chromium at 2× device pixel ratio. The DEV badge belongs to the local build.

## Verification — 2026-10-01

Tested the local diff on development over `cbcb82cfef7bc245971742126cc7c021b3651ce2` with `npm run dev:local` and a disposable file database. Production and local.db were not modified.

- Before editing, a 390×844 browser had 2,448px of page content. The preview loaded a 64px source displayed at 128px.
- The main editor now has no horizontal or vertical overflow at 320×568, 390×844, 768×1024 and 1280×800. Face and hair dialogs fit 320×568 without internal scrolling. Dialogs can scroll on shorter viewports or enlarged text so controls remain reachable.
- Browser interaction: all 40 faces reachable across five pages; filters and boundaries work; skin and hair selection update the preview; Done/Escape return focus; invalid names focus the field; Back preserves choices.
- Reproduced Enter on a palette radio incorrectly advancing onboarding. Moving the dialog outside the form fixes it; the same browser assertion now passes.
- Real first-entry save: trimmed name, Golden Ribbon, Tan skin and Blue hair persisted through starter creation, Hub entry and reload. The existing request assigns Trainer automatically. Reload skips setup.
- All 80 new base/mask assets are transparent 256×256 PNGs (3,392,398 bytes total). Checked all 3,840 explicit skin/hair combinations: source alpha and unmarked RGBA stay exact. Original and strong palette swaps were visually inspected in a contact sheet. Rowan's uncovered neck region now follows skin color; a pixel probe failed before this correction and passes after it.
- High-resolution assets live at `/sprites/trainer-portraits/v2/`. Original `/v1/` assets remain byte-identical, preserving the older 64px canvas contract.
- Focused profile and API tests: 29 + 20 passed. Full lint, test and build gate passed. Build reports the existing large RouteScreen chunk warning.
- Independent reviewer checked the component and generator diff. Fixed the raised asset-version compatibility concern; no other P0/P1/P2 findings.

Restart an already-running Vite server after adding the v2 directory: this repo intentionally excludes sprites from its watcher, so Vite must rebuild its public-file inventory. Production builds include the new directory.

This is local browser verification, not a physical-phone or Safari test.
