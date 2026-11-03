import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vueRouter from 'vue-router/vite'

/**
 * The body and heading fonts' Latin files, preloaded so text first paints in them: without it the
 * swap from the fallback font moved the home page's table (Lighthouse CLS, M8 step 3). Only the
 * Latin subsets; the browser fetches the others by unicode-range when a page needs them.
 */
export const PRELOADED_FONTS = [
  /^assets\/source-sans-3-latin-wght-normal-[\w-]+\.woff2$/,
  /^assets\/jost-latin-wght-normal-[\w-]+\.woff2$/,
]

function preloadFonts(): Plugin {
  return {
    name: 'mfcd-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (_html, ctx) =>
        Object.keys(ctx.bundle ?? {})
          .filter((file) => PRELOADED_FONTS.some((re) => re.test(file)))
          .map((file) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `/${file}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            injectTo: 'head' as const,
          })),
    },
  }
}

export default defineConfig({
  // The router plugin must come before the Vue plugin.
  plugins: [
    vueRouter({
      // Absolute root, so routes resolve the same when Vitest runs from the repo root.
      root: fileURLToPath(new URL('.', import.meta.url)),
      dts: 'src/typed-router.d.ts',
    }),
    vue(),
    tailwindcss(),
    preloadFonts(),
  ],
  // Module workers, so the parser worker can split code: pdf.js (1.7 MB) loads only for a PDF.
  worker: { format: 'es' },
  // `pnpm --filter @mfcd/web dev` (hot reload on :5173) sends API calls to `pnpm dev` (:8787).
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
