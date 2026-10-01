# Trainer portraits

Forty transparent portraits: `m01`–`m20` and `f01`–`f20`. All faces share one paged gallery, with no gender labels or filters in the UI. The IDs remain internal; no gender is stored on the account. `f01` (Golden Ribbon) and `m01` follow the original portrait references.

Art was generated with the built-in image generation tool, one portrait per request. The exact final prompts and references are recorded in [generation-prompts.json](generation-prompts.json). Generated originals are preserved under `public/sprites/trainer-portraits/v1/source/`; the app uses 256×256 PNGs in `public/sprites/trainer-portraits/v4/`, derived directly from those masters. The editor renders them at 128px on phones (256 source pixels for a 2× screen) and 256px on larger screens; gallery and header thumbnails are 64px. Pixelated rendering preserves hard edges. The older `v1/`, `v2/` and `v3/` files remain available for open clients.

## Palette swaps

Each portrait has one base PNG and one material mask, regardless of how many colors are offered. The mask's red channel identifies skin and its green channel identifies hair. Channel values encode the original shading, centered on 128. Transparent or unmarked pixels keep their original RGBA values. The renderer changes those two materials independently, preserving linework and the protected clothing/accessory regions.

The account stores a portrait ID and two palette IDs, not an image or a generated color variant. The picker offers six skin tones and twelve hair colors as unnamed swatches, plus a reset icon for Original. Screen readers identify choices by category and number. Deep brown and Ebony are no longer offered; their palette IDs remain supported for existing saved portraits. The palette definitions live in `src/game/trainer-colors.ts`. Dune wears a headscarf with no exposed hair, so its hair color control has no visible effect.

See the [palette and gallery UI checks](palette-ui/README.md) for the current swatches and combined face gallery.

`scripts/build-trainer-portraits.mjs` derives the v4 sprites and masks from the masters. Reviewed face, neck, eye, hair and accessory regions live in [materials-v4.json](materials-v4.json), in 64px reference coordinates. Classification happens at the full 256px output resolution. The builder follows source colors at region boundaries, uses sampled palettes for ambiguous warm hairlines, and removes isolated material speckles. Small reviewed skin regions cover neckline edges; dark ink inside hair stays unmarked. Shade smoothing applies only to tiny color variations, preserving freckles, nose highlights and inner-ear shadows. Skin shading follows the source luminance relative to its middle tone, with warm highlights; hair uses a gentler highlight curve. The base art stays unchanged. [material-coverage-v4.json](material-coverage-v4.json) records the current material pixel counts. Rebuild with `node scripts/build-trainer-portraits.mjs` in an environment with `sharp` available (`NODE_PATH` can point to a shared tool runtime). The game build consumes the checked-in PNGs and does not require sharp.

## Integration

`TrainerIdentityPicker` leads new-player onboarding. Choices remain editable until the starter is selected. The server validates the name, portrait and palette IDs, then writes the trainer profile, display name and starter together. `TrainerPortrait` renders both the picker and Hub header from the same saved choices.

Storage adds nullable `profiles.avatar_id` and `profiles.avatar_colors` through the existing idempotent `COLUMN_ADDS` migration path. Production and `local.db` were not migrated or wiped for this work. Apply the normal schema setup as part of preparing the owner's fresh database before using the new onboarding flow.

Current editor previews and checks: [compact editor](compact-editor/README.md). The first art pass and integration checks remain in [validation.md](validation.md); its 64px gallery and long picker screenshots are historical.

The remaining onboarding steps also use Night styling. New players go directly from their identity to their first partner, with no profession picker. See the [starter and nickname previews and checks](onboarding-night/README.md).

The [v4 shading audit](shading-audit/README.md) includes the Copper and Cobalt before/after comparison, all 40 portraits with contrasting palettes, regression checks and browser verification. The [v3 mask audit](mask-audit/README.md) and original material configuration and coverage files describe earlier passes.
