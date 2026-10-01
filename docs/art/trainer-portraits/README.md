# Trainer portraits v1

Forty transparent portraits: `m01`–`m20` and `f01`–`f20`. The gallery filters are presentation styles available to everyone; no gender is stored on the account. `f01` (Golden Ribbon) is the blonde girl requested in the reference. `m01` uses the cap and face style of the boy reference.

Art was generated with the built-in image generation tool, one portrait per request. The exact final prompts and references are recorded in [generation-prompts.json](generation-prompts.json). Generated originals are preserved under `public/sprites/trainer-portraits/v1/source/`; the app uses the native 64×64 PNGs directly above that directory, rendered at 64 or 128 pixels with nearest-neighbor scaling.

## Palette swaps

Each portrait has one base PNG and one material mask, regardless of how many colors are offered. The mask's red channel identifies skin and its green channel identifies hair. Channel values encode the original shading, centered on 128. Transparent or unmarked pixels keep their original RGBA values. The renderer changes those two materials independently, preserving linework and the protected clothing/accessory regions.

The account stores a portrait ID and two palette IDs, not an image or a generated color variant. Eight skin tones and twelve hair colors, plus Original for each, are defined in `src/game/trainer-colors.ts`. Dune wears a headscarf with no exposed hair, so its hair color control has no visible effect.

`scripts/build-trainer-portraits.mjs` derives the sprites and masks from the masters. Hand-adjusted samples, face/hair polygons and protected regions live in [materials.json](materials.json). [material-coverage.json](material-coverage.json) records the material pixel counts from the latest build. Rebuild with `node scripts/build-trainer-portraits.mjs` in an environment with `sharp` available (`NODE_PATH` can point to a shared tool runtime). The game build consumes the checked-in PNGs and does not require sharp.

## Integration

`TrainerIdentityPicker` leads new-player onboarding. Choices remain editable until the starter is selected. The server validates the name, portrait and palette IDs, then writes the trainer profile, display name and starter together. `TrainerPortrait` renders both the picker and Hub header from the same saved choices.

Storage adds nullable `profiles.avatar_id` and `profiles.avatar_colors` through the existing idempotent `COLUMN_ADDS` migration path. Production and `local.db` were not migrated or wiped for this work. Apply the normal schema setup as part of preparing the owner's fresh database before using the new onboarding flow.

Previews: [all 40 portraits](gallery.png), [picker](picker-mobile.png), [mobile gallery](gallery-mobile.png), [saved trainer header](hub-mobile.png). Verification details are recorded in [validation.md](validation.md).
