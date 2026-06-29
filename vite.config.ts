import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import { readFileSync } from 'node:fs'

// Stamp the build with the package.json version so the app can show what's
// deployed (exposed as the `__APP_VERSION__` global; see src/vite-env.d.ts).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // MDX must run before the React plugin so it can hand off the compiled JSX.
    // `providerImportSource` lets <MDXProvider> style the markdown output, and
    // the remark plugins add GitHub-flavoured markdown + YAML frontmatter that
    // each doc exports as `frontmatter` (title/order) for the auto-built sidebar.
    {
      enforce: 'pre',
      ...mdx({
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
      }),
    },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }),
    tailwindcss(),
  ],
  define: {
    // Replaced at build time with the literal version string, e.g. "0.1.0".
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
