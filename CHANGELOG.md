# Changelog

All notable changes to **Rental Rumble** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Jot changes under **[Unreleased]** as you work; `npm run release <type>` stamps
them into a dated, versioned section and opens a fresh Unreleased. See
[RELEASING.md](./RELEASING.md).

## [Unreleased]

### Added

- **Draft & gauntlet roguelite** over all **1025 Pokémon** (Gens I–IX) with real
  base stats, types, and legendary/mythical rarity tiers: roll a seeded pool,
  draft a team of six (three at a time, skipping within a difficulty budget),
  then auto-battle 8 type-specialist Gyms, a type Elite, and the all-rounder
  Champion. Lose once and the run ends.
- **Recruit-on-win** — after each victory, swap your team for the Pokémon you
  just beat and re-arrange your lineup; teams snowball across the climb.
- **Battle engine** — a pure, seeded, replayable 6v6 engine with the full
  18-type chart (dual types + immunities), four **roles**
  (Sweeper/Bruiser/Tank/Support) that tilt stats and movesets, and tuning that
  favours status & setup over raw damage.
- **Signature abilities** — a unique, on-theme ability for every one of the 1025
  species.
- **Move engine** — per-type move kits, role-based STAB, and per-line signature
  moves authored for all 1025 species.
- **Hall of Shame** — lost and forfeited runs are auto-recorded with gag names on
  the title screen.
- **Throne (PvP) ladder** — locked to 1× speed, backed by the serverless `api/`
  and Upstash Redis.
- **Sprites & credits** — flat Gen-9 Essentials battle sprites/icons, PMD-style
  animated battle sprites and emotion portraits (CC BY-NC), Paldea-style badges,
  and an in-app Credits panel generated from contributor data.
- **Difficulty modes** — Easy/Normal/Hard/Master set the skip budget; draft pools
  are reproducible and shareable by seed.

[Unreleased]: https://github.com/brunomguimaraes/rental-rumble/commits/development
