# Trainer mask audit — 2026-10-01

The v3 pass replaces the earlier masks for all 40 portraits. Base artwork is unchanged from v2. Each avatar still needs only one base image and one skin/hair mask; selecting colors does not duplicate assets or change the saved profile format.

## Findings and corrections

- Coarse regions and hue competition mixed warm hair with skin, missed portions of the neck, and included hats, clips and clothing in the hair material. The new configuration follows each portrait's face, neck, eyes, hair and accessories. Local source colors refine region edges; Willow, Finch and Rose use sampled source palettes at ambiguous hairlines.
- The old renderer pushed highlights toward white. Ebony and Deep brown consequently showed pale, gray-looking flecks. Highlights now stay relative to the selected pigment, and the mask's median shade map reduces source noise while retaining the original image and transparency.
- Reviewed boundary corrections include Trail Cap's brim, Golden Ribbon's headband, Willow's beret/ear, Raven's violet jacket, Reed's beanie cuff, Maple's bandana, Slate's neckline, and Skye's star clip. Dune's headscarf stays outside the hair mask.

## Visual evidence

[Before / after comparison](before-after.png): six affected portraits, with Ebony skin and Silver hair, rendered with the old masks/shader and the revised ones.

All 40 portraits were reviewed at 256px. Every row below shows Original, Ebony skin, Silver hair, and Deep brown skin with Blue hair:

- [01–05](sheet-1.png)
- [06–10](sheet-2.png)
- [11–15](sheet-3.png)
- [16–20](sheet-4.png)
- [21–25](sheet-5.png)
- [26–30](sheet-6.png)
- [31–35](sheet-7.png)
- [36–40](sheet-8.png)

Browser captures: [Ebony gallery at 320px](gallery-ebony-320.png), [Willow with Ebony skin](willow-ebony-320.png), [Ebony and Silver at 320px](willow-ebony-silver-320.png), [desktop](willow-desktop.png).

## Verification

Tested `development` at HEAD `bb97caf070de45e4a50d445016b106da4fcde839` plus the local trainer editor/mask changes. Unrelated catch-animation work was present in the checkout and was not edited for this audit.

- `node --import tsx scripts/profile.test.ts`: 30 passed. The dark-skin highlight assertion first failed against the previous renderer.
- `node --import tsx scripts/trainer-portraits.test.ts`: 341 passed. Tests decode the actual PNGs, verify unchanged base artwork and transparency, exercise independent color choices, and check reviewed material landmarks. The final suite fails six material landmarks with `TRAINER_PORTRAIT_VERSION=v2`; seven additional boundary assertions also failed against an intermediate v3 before those boundaries were corrected.
- `npx tsc -b`: passed.
- `npm run lint && npm test && npm run build`: passed. Vite reports its existing large-chunk warning.
- Chromium browser check under `npm run dev:local`: all 80 v3 base/mask images loaded, all 40 gallery previews rendered with Ebony, all eight skin tones produced different previews, the actual canvas preserved the beret and recolored the cheek, and restoring both Original choices cleared the color overlay. Editor bounds passed at 320×568, 390×844 and 1280×800; the paged gallery fit the 320×568 viewport. No page errors.
- An independent reviewer checked all eight final sheets and the source diff with no remaining P0/P1/P2 findings.

The browser used an isolated temporary database and a profile-read response override to enter onboarding. It did not write a new profile. Physical phones and Safari were not tested. Production and `local.db` were not modified, and this work has not been deployed.
