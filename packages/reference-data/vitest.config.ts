import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'refdata', include: ['src/**/*.test.ts'] },
})
