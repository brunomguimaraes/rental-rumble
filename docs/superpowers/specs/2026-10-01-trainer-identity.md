# First-entry trainer identity

Approved scope: new players choose a display name and one of 40 trainer portraits before meeting Professor Andre and selecting a starter. The profession picker is omitted for now; Trainer is assigned automatically through the existing onboarding request. Existing profiles skip the picker and render a default portrait. All portraits are available to everyone in one gallery, without gender labels or filters.

Acceptance: 20 portraits in each style, including the requested blonde girl; responsive keyboard-accessible picker with a live trainer-card preview; server validation; name, portrait, profile and starter commit together; chosen identity survives refresh and appears in the Hub header; existing starters are never reminted.

Storage: additive nullable `profiles.avatar_id`; existing `users.display_name` stores the chosen name. Unmigrated profiles remain readable. New portrait saves fail clearly until the additive migration runs. No production or local.db migration is authorized by this implementation request.

Exclusions: login/session changes, account gender, identity editing after onboarding, rates, growth, seed/save changes, inbox or currency features, production deployment.

User refinement: six skin tones and twelve hair colors plus Original, rendered from separate per-portrait material masks; persist palette IDs in additive profiles.avatar_colors. Show unnamed swatches and a reset icon for Original, with numbered accessible labels. Remove Deep brown and Ebony from the picker while retaining support for their saved IDs. Colors change skin/hair independently without duplicating portrait images. New-account setup is the focus; the owner plans to wipe the database separately. No database wipe is authorized here.

UI refinement: a compact name field plus portrait beside Face / Skin tone / Hair color controls. A paged face dialog exposes all 40 portraits on demand; palette dialogs preview changes immediately. Main editor and dialogs fit a 320×568 portrait viewport without scrolling. Tiny viewports or enlarged text may scroll rather than clip controls. Render from 256px masters-derived sprites and masks at versioned v3 URLs; retain v1/v2 for older clients. No profession picker.

Mask quality refinement: audit every portrait at 256px with original colors, Ebony, Silver hair, and Deep brown with Blue hair. Keep the base artwork exact; use reviewed face/neck/hair/accessory regions and source palette boundaries. Dark-skin highlights remain warm and close to the selected pigment. Protect original eye details, hats and clothes, and cover the full visible face and neck. Regression checks exercise real checked-in PNGs as part of `npm test`.
