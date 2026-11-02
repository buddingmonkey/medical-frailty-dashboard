import { defineConfig, devices } from '@playwright/test'

// E2E runs against the real Worker (wrangler dev) serving the production build, on :8788 so it
// does not clash with `pnpm dev` on :8787. `pnpm e2e` builds first. SITE_MODE=public because no
// Access sits in front of local wrangler; the API tests cover the gate.
const PORT = 8788
// Admin pages: a second Worker in development mode, whose localhost-only bypass signs in a
// made-up admin, with its own local D1 (migrations applied first). Tests: e2e/*.admin.spec.ts.
const ADMIN_PORT = 8789
const ADMIN_STATE = '.wrangler/e2e-admin'
const PUBLIC_STATE = '.wrangler/e2e-public'
const isCI = Boolean(process.env['CI'])

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'line',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /\.admin\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(PORT)}` },
    },
    {
      name: 'admin',
      testMatch: /\.admin\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(ADMIN_PORT)}` },
    },
  ],
  webServer: [
    {
      // Its own local D1 with every migration (the 50 states and DC, no lists), so the run never
      // depends on what `pnpm dev` left in the default local database.
      command:
        `pnpm --dir ../api exec wrangler d1 migrations apply DB --local --persist-to ${PUBLIC_STATE}` +
        ` && pnpm --dir ../api exec wrangler dev --port ${String(PORT)} --persist-to ${PUBLIC_STATE}` +
        ' --var ENVIRONMENT:test --var SITE_MODE:public',
      url: `http://localhost:${String(PORT)}/api/public/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command:
        `pnpm --dir ../api exec wrangler d1 migrations apply DB --local --persist-to ${ADMIN_STATE}` +
        ` && pnpm --dir ../api exec wrangler dev --port ${String(ADMIN_PORT)}` +
        ` --persist-to ${ADMIN_STATE} --var ENVIRONMENT:development` +
        ' --var DEV_ADMIN_EMAIL:e2e-admin@localhost --var SITE_MODE:public',
      url: `http://localhost:${String(ADMIN_PORT)}/api/public/health`,
      reuseExistingServer: !isCI,
      timeout: 90_000,
    },
  ],
})
