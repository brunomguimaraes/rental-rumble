# First-entry trainer identity

Approved scope: new players choose a display name and one of 40 trainer portraits before the existing profession and starter steps. Existing profiles skip the picker and render a default portrait. All portraits are available to everyone; masculine and feminine are gallery filters, not account gender.

Acceptance: 20 portraits in each style, including the requested blonde girl; responsive keyboard-accessible picker with a live trainer-card preview; server validation; name, portrait, profile and starter commit together; chosen identity survives refresh and appears in the Hub header; existing starters are never reminted.

Storage: additive nullable `profiles.avatar_id`; existing `users.display_name` stores the chosen name. Unmigrated profiles remain readable. New portrait saves fail clearly until the additive migration runs. No production or local.db migration is authorized by this implementation request.

Exclusions: login/session changes, account gender, identity editing after onboarding, rates, growth, seed/save changes, inbox or currency features, production deployment.

User refinement: eight skin tones and twelve hair colors plus Original, rendered from separate per-portrait material masks; persist palette IDs in additive profiles.avatar_colors. Colors change skin/hair independently without duplicating portrait images. New-account setup is the focus; the owner plans to wipe the database separately. No database wipe is authorized here.
