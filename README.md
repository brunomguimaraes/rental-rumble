# Rental Rumble

A web-based, auto-battling team-builder roguelite using **real Pokémon**. Roll a
pool, draft a team of six, and auto-battle your way from rookie to **Champion** —
recruiting the Pokémon you beat along the way. No grinding, just the perfect
team. Inspired by the rental-Pokémon format (everyone at level 50, the skill is
in the *build*) and the instant roll → build → simulate loop of
[7a0](https://7a0.com.br/en).

> Private project for me and my friends. Pokémon data and sprites come from
> [PokeAPI](https://pokeapi.co/); all Pokémon are © Nintendo/Game Freak.

## How it plays

1. **Roll** — a seed deterministically generates a draft pool of 15 Pokémon.
2. **Build** — pick your team of six, minding the type matchups.
3. **Gauntlet** — auto-battle (always **6v6**) through 4 gym leaders, 2 Elite
   Four, and the Champion. Lose one battle and the run is over.
4. **Recruit** — after each win, swap any of your Pokémon for the ones you just
   defeated. Your team snowballs as you climb.
5. **Share** — every run is defined by its seed, so a friend can take the exact
   same pool and gauntlet. Did *your* build do better?

## Core systems

- **Real 18-type chart** with dual types and immunities — see
  `src/game/typechart.ts`.
- **Seeded RNG** (`src/game/rng.ts`) — fully reproducible, shareable runs.
- **Battle engine** (`src/game/battle.ts`) — a pure function that takes two
  teams + a seed and returns the winner plus a replayable event log (STAB,
  crits, burn/paralysis, lifesteal, heals). The UI just plays that log back
  with HP bars and animations.
- **60 Pokémon** (gen 1–4 favourites) with real base stats and types, fetched
  via `scripts/gen-pokedex.ts` into `src/game/pokedex.gen.ts`. Movesets are
  assigned from a real-move table in `src/game/moves.ts`.

## Regenerating the Pokédex

```bash
npx tsx scripts/gen-pokedex.ts   # edit the IDS array to change the roster
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
