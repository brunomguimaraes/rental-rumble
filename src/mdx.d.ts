declare module '*.mdx' {
  import type { ComponentType } from 'react';
  import type { MDXComponents } from 'mdx/types';

  /** YAML frontmatter exported by `remark-mdx-frontmatter` (see vite.config.ts). */
  export const frontmatter: {
    title: string;
    /** Sidebar position; lower sorts first. */
    order?: number;
    /** URL slug; defaults to the filename. */
    slug?: string;
    /** One-line teaser shown under the title. */
    summary?: string;
    icon?: string;
  };

  const MDXComponent: ComponentType<{ components?: MDXComponents }>;
  export default MDXComponent;
}
