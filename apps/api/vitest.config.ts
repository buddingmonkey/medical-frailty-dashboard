import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { fileURLToPath } from 'node:url'

import { defineProject } from 'vitest/config'

// API tests run inside workerd with the bindings from wrangler.jsonc, on a local D1 with every
// migration in ./migrations applied (src/test/apply-migrations.ts).
const migrations = await readD1Migrations(
  fileURLToPath(new URL('./migrations', import.meta.url).href),
)

export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Integration tests through `exports.default` see the site as public; the gate tests in
      // src/middleware/access.test.ts set SITE_MODE themselves.
      miniflare: {
        bindings: { ENVIRONMENT: 'test', SITE_MODE: 'public', TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/apply-migrations.ts'],
    // Windows CI runners run workerd about 3x slower than Linux; the 5 s test and 10 s hook defaults timed out there.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
