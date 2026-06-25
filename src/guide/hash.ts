// Docs-independent hash helpers. Kept in their own tiny module so App can check
// for a guide deep link without importing the registry (which eagerly pulls in
// every .mdx page + the MDX runtime — all of which we want lazy-loaded).

export const HASH_PREFIX = 'guide';

/** Build the shareable hash for a doc, e.g. `guide/zodiac`. */
export function guideHash(slug: string): string {
  return `${HASH_PREFIX}/${slug}`;
}

/** Whether the URL hash currently points at the guide. */
export function hashIsGuide(): boolean {
  return window.location.hash.startsWith(`#${HASH_PREFIX}`);
}
