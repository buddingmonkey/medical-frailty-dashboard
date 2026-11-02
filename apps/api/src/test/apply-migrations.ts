// Vitest setup file: applies the D1 migrations before each API test file. The pool gives every
// test isolated storage on top of this migrated database (docs/testing.md).
import { applyD1Migrations, type D1Migration } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// TEST_MIGRATIONS is a test-only binding set in vitest.config.ts, so it is not on `Env`.
const { TEST_MIGRATIONS } = env as Env & { TEST_MIGRATIONS: D1Migration[] }

await applyD1Migrations(env.DB, TEST_MIGRATIONS)
