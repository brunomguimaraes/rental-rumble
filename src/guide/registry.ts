import type { ComponentType } from 'react';
import type { MDXComponents } from 'mdx/types';

export type GuideDoc = {
  slug: string;
  title: string;
  order: number;
  icon?: string;
  summary?: string;
  Content: ComponentType<{ components?: MDXComponents }>;
};

type MdxModule = {
  default: ComponentType<{ components?: MDXComponents }>;
  frontmatter?: {
    title?: string;
    slug?: string;
    order?: number;
    icon?: string;
    summary?: string;
    /** Hide this page (and its sidebar entry) outside dev builds. */
    dev?: boolean;
  };
};

// Docusaurus-style auto-discovery: every .mdx file in ./pages becomes a doc, no
// central list to maintain. Drop a new file in (with frontmatter) and it shows
// up in the sidebar, ordered by its `order`. Eager so the sidebar metadata is
// available synchronously; the bundles are tiny prose.
const modules = import.meta.glob<MdxModule>('./pages/*.mdx', { eager: true });

export const GUIDE_DOCS: GuideDoc[] = Object.entries(modules)
  .filter(([, mod]) => !mod.frontmatter?.dev || import.meta.env.DEV)
  .map(([path, mod]) => {
    const fileSlug = path.split('/').pop()!.replace(/\.mdx$/, '');
    const fm = mod.frontmatter ?? {};
    return {
      slug: fm.slug ?? fileSlug,
      title: fm.title ?? fileSlug,
      order: fm.order ?? 999,
      icon: fm.icon,
      summary: fm.summary,
      Content: mod.default,
    };
  })
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export function findDoc(slug: string | null | undefined): GuideDoc | undefined {
  if (!slug) return undefined;
  return GUIDE_DOCS.find((d) => d.slug === slug);
}

/** Resolve the current `#guide/<slug>` into a known doc slug. */
export function slugFromHash(): string {
  const m = window.location.hash.match(/^#guide(?:\/(.+))?$/);
  return findDoc(m?.[1])?.slug ?? GUIDE_DOCS[0]?.slug ?? '';
}
