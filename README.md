# Rental Rumble

A web-based, login-based idle collecting game using **real Pokémon**. Pick a
profession and a professor, raise your starter, and send your trainer out on
idle routes to battle, grow and evolve while you're away.

> Private project for me and my friends — not for commercial use. Pokémon data
> comes from [PokeAPI](https://pokeapi.co/). The static fallback battle sprites
> (front/back) and team icons come from a local Gen 9 Pokémon Essentials sprite
> pack, served from `public/sprites`. The **animated battle sprites** and the
> selector-card **portraits are the non-commercial, fan-made PMD-style sprites**
> from the [PMD Sprite Repository](https://sprites.pmdcollab.org/)
> ([PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab)), licensed
> [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), © their
> respective artists. The battle screen plays each species' PMD idle/walk/attack/
> hurt/faint animations (with the flat Essentials sprite as a fallback for
> not-yet-contributed species); every rolled rental Pokémon is also dealt a
> random emotion portrait for flavour. **Huge thanks to the SpriteCollab artists**
> — the in-app **Credits & thanks** panel (in the app footer) lists every contributor,
> generated from their `tracker.json` / `credit_names.txt`. Gym/League **badge
> icons** are the Paldea (Scarlet/Violet) badges from
> [Bulbagarden Archives](https://archives.bulbagarden.net/wiki/Category:Badges).
> All Pokémon, badges, and trademarks are © Nintendo/Game Freak.
>
> Sprites are imported with helper scripts (run once, output committed under
> `public/sprites`): `node scripts/import-sprites.mjs "<pack>/Graphics/Pokemon"`
> copies Front/Back/Icons keyed by Dex id, `node scripts/fetch-portraits.mjs`
> downloads every emotion portrait into `public/sprites/portrait/<id>/<Emotion>.png`
> and regenerates `src/game/portraits.gen.ts`, `node scripts/fetch-battle-sprites.mjs`
> downloads the PMD animation sheets into `public/sprites/pmd/<id>/` and regenerates
> the `src/game/pmdSprites.gen.ts` (anim geometry/timing) and `src/game/spriteCredits.gen.ts`
> (artist attribution) manifests, and `node scripts/fetch-badges.mjs` downloads
> the type/League badges. The fetch scripts accept `--resume` (skip files already
> saved), `--manifest-only` (rebuild just the manifests from disk), and the battle
> fetcher also takes `--ids=1,4,6` to grab a subset (handy for testing).

## How it plays

1. **Onboard** — pick the Trainer profession and one of four professors (Oak,
   Elm, Birch, Rowan); receive a fixed, weak, three-stage starter and fight a
   guided first battle and first catch.
2. **Send out** — your trainer walks Route 1 for up to 8 hours of real time,
   auto-battling wild Pokémon. Results are simulated on the server from a fixed
   seed.
3. **Claim** — come back to read the encounter log, collect EXP, level-ups and
   evolutions.
4. **Box** — nickname your Pokémon; starters evolve at 8 and 16, others at 16
   and 32.

Under it all: **1025 Pokémon** with real base stats and types
(`scripts/gen-pokedex.ts` into `src/game/pokedex.gen.ts`), the real 18-type chart
(`src/game/typechart.ts`), seeded RNG (`src/game/rng.ts`) and a pure battle
engine (`src/game/battle.ts`) returning a replayable event log.

## Regenerating the Pokédex

```bash
npx tsx scripts/gen-pokedex.ts   # set MAX_DEX to change how many are included
```

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
```

## Tech

React 19 · TypeScript · Vite · Tailwind CSS v4. Vercel serverless functions (`api/`) backed by Turso (libSQL) for accounts and
progress, and Upstash Redis for rate limiting.
