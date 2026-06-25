// Shared scroll helper for the multi-step reward / draft / gauntlet flows. On a
// phone the "next step" (or the current trainer in a long ladder) often sits
// below the fold, so after a pick — or on mount — we bring it into view. The
// scroll is skipped when the target is already fully visible: on a wide screen
// everything fits at once, and yanking the page then is just disorienting.
// Honours prefers-reduced-motion by jumping instantly instead of animating.

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const scrollToSection = (
  el: HTMLElement | null,
  block: ScrollLogicalPosition,
) => {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
  el.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block });
};
