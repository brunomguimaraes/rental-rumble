# Rental Rumble

A web-based, login-based collecting game using **real Pokémon**. Pick a
profession, choose one of three weak starters from Professor Oak, and build your
box. The idle routes are paused while the core loop is reworked.

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

1. **Onboard** — pick the Trainer profession. Professor Oak offers three weak,
   three-stage starters drawn from a pool of ten (Caterpie, Weedle, Pidgey,
   Oddish, Poliwag, Geodude, Mareep, Hoppip, Lotad, Starly). The three are fixed
   per account; the server checks the pick and mints a level 5 starter.
2. **Box** — nickname your Pokémon and see when each one evolves (starters at 8
   and 16, others at 16 and 32). Nothing grants EXP until the next loop lands.

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
