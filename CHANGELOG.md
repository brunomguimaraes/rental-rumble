# Changelog

All notable changes to **Rental Rumble** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Jot changes under **[Unreleased]** as you work; `npm run release <type>` stamps
them into a dated, versioned section and opens a fresh Unreleased. See
[RELEASING.md](./RELEASING.md).

## [Unreleased]

### Added
- **World map** — Hearthvale, a pixel-art region: Hearth Town and six places (Sunny Meadow, Mossy Woods, Mirror Lake, Flint Quarry, Cloudcap Trail, Starfall Ruins). Drag, zoom and recenter the map, or browse the list; each place shows its local Pokémon, landmarks, guardian, rewards, and what it takes to open it.
- **Expeditions** — short trips of about five checkpoints: sightings, landmarks, battles, and a fork where you pick the way. Beat the guardian at the end to clear the place and open the next ones. A trip resumes after a reload or on another device; heading home or losing a battle keeps the EXP already earned.
- **Training** — send your party to train at any open place while you're away: one battle every few minutes on the server's clock, up to 8 hours, stopping at the first defeat. Bring them home to collect EXP, growth and evolutions; results wait until you've seen them.
- **Your party** — choose up to six Pokémon, reorder them and pick a lead. The party is saved to your account, and every trip starts with the party you set.
- **Install app** — a hub button with step-by-step iPhone and Android guides for adding the game to your home screen so it opens full-screen; Android Chrome gets a one-tap Install.
- **Night icon library** — reusable transparent menu and navigation icons, with the original mobile concept, an asset index, and a preview gallery.
- **Professor Andre** — new trainers meet a stone and fossil researcher with a custom sprite; existing Oak mentor records and the non-fossil starter pool are preserved.
- **Trainer route** — pick the Trainer profession; Professor Oak offers three weak, three-stage starters from a pool of ten, fixed per account, and you keep one.
- **Box** — nickname your Pokémon; starters evolve twice, early, caught Pokémon later.
- **Accounts** — sign in with email and password, Discord or Google; email verification and password reset via Resend. Login is now required to play.

### Changed
- **Growth** — levels are hidden. A Pokémon shows an EXP bar and six stats; when the bar fills it grows: each stat rolls against its potential (read out in Judge words) and rises by one, up to the species' ceiling. Evolution carries every point over and adds a bonus. A fully trained Pokémon fights exactly as strong as before.
- **Pokédex** — rebuilt as a pixel-art handheld: a detail screen on top (stats, ability, moves, signs) and the species list below, with crisp sprites and arrow-key browsing. The game's backdrop moves to the new "Night" pixel style.
- **Pokédex** — species you haven't caught stay a mystery: a silhouette and "???" with no stats, ability, moves, or signs, and search by name only finds ones you've caught.
- **Hub** — the six-slot Night party window shows your saved party, lead first, with Edit; below it sit the World map and Your box, and what your trainer is doing right now.
- **Login required** — anonymous play is gone; the hub and box are per-account.

### Removed
- Level numbers on the Hub, in the Box and on the starter reveal.
- The Rental draft gauntlet, relics, the daily Champion board, the Throne, the Hall of Shame and My Runs.

## [0.1.0] - 2026-06-29

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

### Changed

- **Switch AI holds for the kill** — the voluntary-switch logic now reads a real
  KO _probability_ (accuracy, the 0.85–1.0 damage roll, and crits) instead of a
  single average hit, and stands its ground when it can likely KO the foe this
  turn and will actually get to swing (it outspeeds, or survives the hit). Stops
  a set-up sweeper like a +2 Gyarados from pivoting away from a foe it could just
  kill. Hold threshold: 60% on Normal/Hard, 50% on Master.

[Unreleased]: https://github.com/brunomguimaraes/rental-rumble/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/brunomguimaraes/rental-rumble/releases/tag/v0.1.0
