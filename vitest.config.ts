import { defineConfig } from 'vitest/config'

// One Vitest run over every workspace. Each project has its own vitest.config.ts:
// unit (packages/shared), refdata (packages/reference-data), component (apps/web, jsdom), api (apps/api, workerd),
// scripts (scripts/*.ts).
export default defineConfig({
  test: {
    projects: ['packages/shared', 'packages/reference-data', 'apps/web', 'apps/api', 'scripts'],
  },
})
