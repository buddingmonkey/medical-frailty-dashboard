import { defineProject } from 'vitest/config'

// Tests for the repo's own Node scripts (scripts/*.ts).
export default defineProject({
  test: { name: 'scripts', environment: 'node', include: ['*.test.ts'] },
})
