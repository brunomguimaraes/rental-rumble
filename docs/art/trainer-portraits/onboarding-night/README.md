# Night onboarding — 2026-10-01

The three-step flow is trainer identity → Professor Andre and starter choices → optional partner nickname. The profession picker is omitted; the existing request assigns Trainer automatically. Every step uses the same Night tokens and controls as the Hub. Starter choices and partner naming now use framed windows and controls, pixel type, and gold focus states. Starter portraits render at 80px and 120px, whole multiples of their native 40px art.

Phone previews: [trainer identity](identity-390.png), [starter choices](starters-390.png), [partner nickname](nickname-390.png). The folder also contains 320px and 1280px checks and the nickname-saving state.

Verified the local styling diff on `development` with final shared-checkout HEAD `cbcb82cfef7bc245971742126cc7c021b3651ce2`:

- Focused: `node --import tsx scripts/profile.test.ts` (29 passed) and `npx tsc -b` passed.
- Full gate: `npm run lint && npm test && npm run build` passed. Vite reports a large RouteScreen chunk and plugin timing warnings.
- Browser: Chromium under `npm run dev:local`, using two new accounts in a disposable file database. Verified direct navigation from identity to starter choices, the absence of the profession step, automatic Trainer assignment, keyboard focus, back navigation, real starter creation, optional blank nickname, Enter submission, nickname persistence and skipping setup after refresh. Starter and nickname screens fit at 320, 390 and 1280px; the final three-step identity heading also fits at 320px.
- Failure states: intercepted one starter request and one nickname request with a 503 response, then allowed each retry to reach the real local API. Error text remained visible, controls recovered, and delayed nickname saving disabled both input and submit. No browser page errors.
- The identity-only screenshot check mocked an absent profile for a completed test account to capture the new step heading without changing its saved trainer.
- `git diff --check` passed. Screenshots were visually inspected. Production and `local.db` were untouched.

This slice changes onboarding presentation and form affordances; existing profile and API tests cover its save contracts. No new implementation-mirroring test was added for Tailwind classes.
