import { defineConfig, devices } from '@playwright/test'

// E2E runs against the real Worker (wrangler dev) serving the production build, on :8788 so it
// does not clash with `pnpm dev` on :8787. `pnpm e2e` builds first. SITE_MODE=public because no
// Access sits in front of local wrangler; the API tests cover the gate.
const PORT = 8788
const isCI = Boolean(process.env['CI'])

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'line',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --dir ../api exec wrangler dev --port ${String(PORT)} --var ENVIRONMENT:test --var SITE_MODE:public`,
    url: `http://localhost:${String(PORT)}/api/public/health`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})
