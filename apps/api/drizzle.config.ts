import { defineConfig } from 'drizzle-kit'

// `pnpm db:generate` writes SQL migrations from src/db/schema.ts. Review each one by hand;
// wrangler applies them (`pnpm db:migrate:local`, and CI for preview and production).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
})
