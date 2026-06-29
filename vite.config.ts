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
  // This repo ships ~50k sprite PNGs in public/sprites (plus the build output in
  // dist and Vercel's .vercel cache). Vite's dev watcher would try to watch every
  // one and exhaust the file-descriptor limit (EMFILE), especially under
  // `vercel dev`. NOTE: Vite 8 uses chokidar v4, which DROPPED glob support in
  // `watch.ignored` — so a path predicate (not '**/…' globs, which silently match
  // nothing) is required to actually exclude them. App-code (src/) HMR is
  // unaffected; you just won't get auto-reload when editing a raw sprite/asset.
  server: {
    port: 3000,
    // Local API: Vite proxies /api/* to the standalone handler server
    // (scripts/dev-api.ts on :3001) instead of `vercel dev`, which can't watch
    // this repo's ~50k sprites without EMFILE. `npm run dev:local` runs both
    // together; plain `npm run dev` is frontend-only (so /api just won't answer).
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
    watch: {
      ignored: (filePath: string) =>
        filePath.includes('/public/sprites/') ||
        filePath.includes('/dist/') ||
        filePath.includes('/.vercel/'),
    },
  },
})
