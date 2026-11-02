import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import vueRouter from 'vue-router/vite'

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
  ],
  // Module workers, so the parser worker can split code: pdf.js (1.7 MB) loads only for a PDF.
  worker: { format: 'es' },
  // `pnpm --filter @mfcd/web dev` (hot reload on :5173) sends API calls to `pnpm dev` (:8787).
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
