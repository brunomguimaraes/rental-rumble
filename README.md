# Rental Rumble

A web-based, auto-battling team-builder roguelite using **real Pokémon**. Roll a
pool, draft a team of six, and auto-battle your way from rookie to **Champion** —
recruiting the Pokémon you beat along the way. No grinding, just the perfect
team. Inspired by the rental-Pokémon format (everyone at level 50, the skill is
in the *build*) and the instant roll → build → simulate loop of
[7a0](https://7a0.com.br/en).

> Private project for me and my friends — not for commercial use. Pokémon data
> comes from [PokeAPI](https://pokeapi.co/). Battle sprites (front/back) and
> team icons come from a local Gen 9 Pokémon Essentials sprite pack, served from
> `public/sprites`. The selector-card **portraits are the non-commercial,
> fan-made PMD-style portraits** from the [PMD Sprite Repository](https://sprites.pmdcollab.org/)
> ([PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab)), © their
> respective artists. Each species ships a *set* of emotion portraits (Normal,
> Happy, Sad, Angry, Inspired, …); every rolled rental Pokémon is dealt a random
> emotion for extra flavour. Gym/League **badge icons** are the Paldea (Scarlet/Violet)
> badges from [Bulbagarden Archives](https://archives.bulbagarden.net/wiki/Category:Badges).
> All Pokémon, badges, and trademarks are © Nintendo/Game Freak.
>
> Sprites are imported with helper scripts (run once, output committed under
> `public/sprites`): `node scripts/import-sprites.mjs "<pack>/Graphics/Pokemon"`
> copies Front/Back/Icons keyed by Dex id, `node scripts/fetch-portraits.mjs`
> downloads every emotion portrait into `public/sprites/portrait/<id>/<Emotion>.png`
> and regenerates the `src/game/portraits.gen.ts` manifest (use `--resume` to skip
> files already saved, or `--manifest-only` to rebuild just the manifest), and
> `node scripts/fetch-badges.mjs` downloads the type/League badges.

## How it plays

1. **Pick a difficulty** — it sets how many sets you can skip: Easy 5, Normal 3,
   Hard 1, Master 0.
2. **Draft** — a seed deterministically deals **3** Pokémon at a time. Pick one
   and the next, totally fresh set of three appears, until you've drafted six.
3. **Skip** — don't like a set? Skip it for a brand-new trio (within your
   budget). Roles are auto-assigned to each card (tuning stats and moves).
4. **Arrange** — on the map before each battle, set your lead and reorder your
   lineup (slot 1 leads; the rest send out in order as Pokémon faint).
5. **Gauntlet** — auto-battle (always **6v6**) through 8 type-specialist gym
   leaders and a type-specialist Elite, then the Champion — who specializes in
   no type and fields a randomized, all-rounder powerhouse team. Lose one battle
   and the run is over.
6. **Recruit** — after each win, swap any of your Pokémon for the ones you just
   defeated, then re-arrange your lineup. Your team snowballs as you climb.
7. **Share** — the draft pool is reproducible from its seed.

## Core systems

- **All 1025 Pokémon** with real base stats and types, plus a rarity tier
  (legendary / mythical / pseudo-legendary). Generated via
  `scripts/gen-pokedex.ts` (one PokeAPI GraphQL query) into
  `src/game/pokedex.gen.ts`.
- **Rarity rules** — at most one legendary/mythical/pseudo-legendary per draft
  pool; specials get a gold card. Trainers never use legendaries/mythicals
  (pseudo-legendaries like Dragonite are fair game); a legendary is a rare
  player-only boon.
- **Real 18-type chart** with dual types and immunities (`src/game/typechart.ts`).
- **Roles** (`src/game/roles.ts`) — Sweeper/Bruiser/Tank/Support tilt stats and
  movesets, with stat-based eligibility (frail Pokémon can't Tank).
- **Seeded RNG** (`src/game/rng.ts`) and a pure **battle engine**
  (`src/game/battle.ts`) returning a replayable event log.

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

## Balance check (optional)

A headless simulator runs thousands of gauntlets to sanity-check difficulty and
battle length:

```bash
npx tsx scripts/sim-check.ts
```

Current tuning (player "hero" edge `1.12`): a strong, well-drafted team clears
the full gauntlet ~40% of the time. Battles average ~14 turns with no stalls.
Adjust `PLAYER_STAT_MULT` in `src/App.tsx` to make runs easier/harder.

## Tech

React 19 · TypeScript · Vite · Tailwind CSS v4. Pure frontend, no backend.
