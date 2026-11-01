import { defineConfig } from 'vitest/config'

// One Vitest run over every workspace. Each project has its own vitest.config.ts:
// unit (packages/shared), component (apps/web, jsdom), api (apps/api, workerd).
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/web', 'apps/api'],
  },
})
