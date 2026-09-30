// Rarity odds shared by every roll that can produce a special colouring.
// Moved out of run.ts (Rental) so the engine and idle game share one source.

/** Chance a rolled mon is shiny. */
export const SHINY_CHANCE = 1 / 500;

/** Chance a non-shiny rolled mon wears a fan-made alternate colour. */
export const ALT_COLOR_CHANCE = 1 / 20;
