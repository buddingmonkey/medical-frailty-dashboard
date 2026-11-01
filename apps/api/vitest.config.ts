import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineProject } from 'vitest/config'

// API tests run inside workerd with the bindings from wrangler.jsonc.
export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { ENVIRONMENT: 'test' } },
    }),
  ],
  test: { name: 'api', include: ['src/**/*.test.ts'] },
})
