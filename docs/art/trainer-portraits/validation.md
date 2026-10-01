# Trainer identity validation — 2026-10-01

Verified the local diff on `development`, based on `c7e2047368f12427c8a89ab1f58f77e297ef81c1`. Other Hub/world changes were active in the shared checkout and were preserved. No commit, push, release, production migration, or database wipe was performed.

- `npm run lint && npm test && npm run build`: passed. Frontend and API TypeScript checks passed. Lint and build were repeated successfully after the final art refinements. Vite reports a large main chunk and plugin timing warnings.
- Profile helper and API coverage: 29 + 20 checks passed. Covers name/palette validation, independent recoloring, client payloads, account isolation, persistence, duplicate starter prevention, transaction rollback, optional box-read failure after commit, legacy reads, and a clear error when the portrait migration is missing.
- Reviewer subagent: no P0/P1/P2 findings. Removed art-direction text from portrait accessibility labels following its minor feedback.
- Browser under `npm run dev:local`, with an isolated temporary file database: email/password login opened the picker; both style filters showed 20 portraits; blank name showed an error; selecting Golden Ribbon, Tan skin and Copper hair rendered the preview. Back navigation preserved choices. Selecting a real starter saved Nova's name, portrait and colors; the Hub showed them and refresh skipped onboarding. No browser page errors.
- Browser keyboard/mobile: native radio focus and Space selected the final portrait. All controls fit at 320px; the 390px picker and gallery were visually checked. All 40 final portraits rendered with custom material masks. The final gallery-only screenshot check mocked an absent profile to reopen the picker without modifying the completed test trainer.
- Asset checks: 40 distinct IDs, exactly 20 per style; 80 transparent 64×64 app PNGs (40 base sprites + 40 material masks), totaling 285,298 bytes. All skin masks have coverage, every exposed-hair portrait has hair coverage, and material channels never overlap. Across 3,840 skin/hair combinations, alpha and unmarked pixels stayed exact.
- Visual art checks: inspected original and Ebony/Rose palette sheets for all 40 portraits, corrected four masculine designs, and adjusted masks around bangs, eyes, headwear and clothing. Dune's covered hair correctly remains unchanged.
- `git diff --check`: passed.

The generated masters and final prompt set are saved with the assets. The new nullable profile columns still need the normal schema setup on the owner's fresh database before deploying this flow.
