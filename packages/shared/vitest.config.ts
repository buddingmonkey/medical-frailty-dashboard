import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'unit', include: ['src/**/*.test.ts'] },
})
