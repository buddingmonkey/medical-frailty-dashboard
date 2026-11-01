import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineProject } from 'vitest/config'

// API tests run inside workerd with the bindings from wrangler.jsonc.
export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Integration tests through `exports.default` see the site as public; the gate tests in
      // src/middleware/access.test.ts set SITE_MODE themselves.
      miniflare: { bindings: { ENVIRONMENT: 'test', SITE_MODE: 'public' } },
    }),
  ],
  test: { name: 'api', include: ['src/**/*.test.ts'] },
})
