# Changelog

All notable changes to **Rental Rumble** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Jot changes under **[Unreleased]** as you work; `npm run release <type>` stamps
them into a dated, versioned section and opens a fresh Unreleased. See
[RELEASING.md](./RELEASING.md).

## [Unreleased]

### Added
- **Pokémon Center** — HP now carries over between Sunny Meadow battles. Fainted Pokémon sit out, only Pokémon still standing earn EXP, and losing with your whole party sends you back to Hearth Town. The nurse in the Pokémon Center heals every Pokémon you own, instantly and for free. HP bars appear in Sunny Meadow and its encounters, and on the party, Box and Center screens.
- **Village market** — buy Poké Balls and Great Balls with Pokédollars (₽) in Hearth Town, and sell balls, Honey, and mushrooms. Trainer wins, coin pouches, and the Meadow survey pay ₽; retries never pay or charge twice.
- **Trainer portraits** — new players choose their display name and a portrait before meeting their professor. One gallery offers all 40 faces, including Golden Ribbon, with six skin tones and twelve hair colors shown as unnamed swatches. The selected portrait, colors and name persist on the account and appear in the trainer header. Existing trainers keep their onboarding state and use a default portrait.
- **Pokédex seen and caught** — like the games, each entry is unseen (a silhouette), seen (name, sprite and types) or caught (every tab). The counter shows both totals, list rows mark seen and caught species, meeting a trainer's Pokémon counts as seeing it, and your starter and every form your Pokémon have evolved through count as caught. A new Area tab lists where each species lives in the wild, rare finds included, even before you've seen it; the Sunny Meadow screen no longer lists its possible encounters.
- **Bag and catching** — persistent Poké Ball and Great Ball stacks, starting supplies, Explore finds, and inventory-backed capture. Each throw consumes one ball; retries cannot duplicate catches or item rewards.
- **Sunny Meadow action board** — Sunny Meadow's page is a board: the meadow scene, six action cards, and one button that states its cost. **Wild Pokémon** to battle and catch (EXP, no prize money), **Trainer** for more EXP and ₽200, **Puzzle** to slide stone panels back into a meadow picture for the item it hides, **Quest** to work through the Meadow survey one step at a time, **Explore** for a gamble — a rare Pokémon, a rare item, a secret, or nothing — and **Forage** for Honey and mushrooms. Explore can uncover the Honey Tree: spread Honey on it to draw Combee, Burmy, Heracross or Munchlax. Actions recover every ten minutes up to 48; encounters and results resume across visits.
- **Hearth Town** — enter the town from the world map. Its six services, the town square and the road north each have a numbered marker on the town map, a row in Places to visit, and a card. The library and daycare open your Pokédex and box, and the Pokémon Center heals your Pokémon; the north road leads on to Sunny Meadow; the bakery and lab open in a later update. The art pack's guide and clickable preview stay in `docs/art/night/hearth-town-v2/`.
- **World map** — Hearthvale, a pixel-art region with Hearth Town and Sunny Meadow as its first playable locations. Drag, zoom and recenter the map, or browse the list; Sunny Meadow shows its landmarks.
- **Your party** — choose up to six Pokémon, reorder them and pick a lead. The party is saved to your account, and every trip starts with the party you set.
- **Install app** — a hub button with step-by-step iPhone and Android guides for adding the game to your home screen so it opens full-screen; Android Chrome gets a one-tap Install.
- **Night icon library** — reusable transparent menu and navigation icons, with the original mobile concept, an asset index, and a preview gallery. Includes an Item Bag backpack with a Poké Ball clasp.
- **Professor Andre** — new trainers meet a stone and fossil researcher with a custom sprite; existing Oak mentor records and the non-fossil starter pool are preserved.
- **Trainer route** — pick the Trainer profession; Professor Oak offers three weak, three-stage starters from a pool of ten, fixed per account, and you keep one.
- **Box** — nickname your Pokémon; starters evolve twice, early, caught Pokémon later.
- **Accounts** — sign in with email and password, Discord or Google; email verification and password reset via Resend. Login is now required to play.
- **Travel stamina** — trips between Hearth Town and Sunny Meadow cost travel points that refill over time, cheaper with a ride Pokémon in your party. The trainer bar shows Travel and Actions on the Hub and across the world.

### Changed
- **Defeat it, then catch it** — a wild Pokémon can no longer be caught without a battle. Win the battle to earn your one throw; the catch chance after a win is unchanged (80% common and 55% rare with a Poké Ball, 95% and 75% with a Great Ball). Losing or leaving ends the encounter with no throw.
- **Wild battles and Find NPC** — wild wins no longer pay prize money (trainers still pay ₽200), and the Find NPC search is replaced by the Trainer and Quest cards.
- **Catching** — ball throws now arc into the meadow, draw the Pokémon inside, and build suspense with three shakes before a sparkling catch or breakout reveal. Skip the animation at any time; reduced motion shows a still result.
- **Caught Pokémon join your party** — a catch goes straight into your party when it has fewer than six Pokémon; with a full party it goes to the Box as before.
- **Trainer editor** — a compact portrait beside Face, Skin tone and Hair color controls fits small phones without page scrolling. Faces open in a paged gallery and colors in live-preview menus. New 256px assets preserve facial detail from the original artwork, with versioned URLs for older clients.
- **First journey** — new players go straight from their name and avatar to Professor Andre and starter selection, with the Trainer profession assigned automatically. Starter choices and the partner nickname screen share the avatar picker's Night windows, pixel typography, framed controls and gold focus states, with crisp portraits and clear saving and error messages.
- **Explore** — the guaranteed Poké Balls apply only when you have no balls and under ₽200.
- **Trainer bar** — the Hub header is a Night window with your trainer portrait, your name and mentor, Mail (coming soon) and Settings buttons, and your Bag's ball count.
- **Home and places** — an illustrated Hearth Town or Sunny Meadow scene now leads Home, with your partner, real sighting and survey highlights, and direct links to their details. Home follows where your trainer stands, saved to your account; the party sits below the scene. Town and meadow lead with their surroundings.
- **Bag button** — the Hub, town and route use the Night backpack icon and framed touch-sized buttons that open your saved inventory.
- **Sunny Meadow searches** — need you to be there; travel from the map first.
- **Growth** — levels are hidden. A Pokémon shows an EXP bar and six stats; when the bar fills it grows: each stat rolls against its potential (read out in Judge words) and rises by one, up to the species' ceiling. Evolution carries every point over and adds a bonus. A fully trained Pokémon fights exactly as strong as before.
- **Growth** — stats grow more slowly, so reaching the top of the EXP curve no longer means every stat is maxed: most Pokémon end with a few stats still short of their ceiling, and only a lucky few max all six. Wild Pokémon at Mirror Lake, Flint Quarry, Cloudcap Trail and Starfall Ruins are a little weaker to match.
- **Pokédex** — rebuilt as a pixel-art handheld: a detail screen on top (stats, ability, moves, signs) and the species list below, with crisp sprites and arrow-key browsing. The game's backdrop moves to the new "Night" pixel style.
- **Pokédex** — species you haven't caught stay a mystery: a silhouette and "???" with no stats, ability, moves, or signs, and search by name only finds ones you've caught.
- **Hub** — the six-slot Night party window shows your saved party, lead first, with Edit; below it sit the World map and Your box, and what your trainer is doing right now.
- **Login required** — anonymous play is gone; the hub and box are per-account.
- **Battles come alive** — Sunny Meadow battles play like the original Rental Rumble: animated Pokémon that attack, flinch and faint, a Poké Ball toss on send-out, damage numbers, effectiveness banners, and status and sign badges on each Pokémon's card. Pokémon are drawn at their true relative size, each over a small, medium or large shadow that follows it as it lunges, flinches and faints, and each HP bar fills visibly on send-out. Next and Skip work as before.

### Fixed
- **Trainer colors** — rebuilt all 40 portrait masks to correct missed skin patches and color bleeding into hats and clothes. Dark skin preserves freckles, nose highlights and ear shadows; cleaner hairlines, intact ink outlines and softer hair highlights keep the original portrait detail.

### Removed
- Idle training, checkpoint expeditions, guardian gates, and playable routes beyond Sunny Meadow. Existing sessions retire once with eligible pre-cutover rewards preserved.
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
