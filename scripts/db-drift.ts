// `pnpm db:drift`: fails when apps/api/src/db/schema.ts has changes that no migration covers.
// It runs `drizzle-kit generate`; if that writes a new file, the schema drifted. The new
// migration is left in place to review and commit (docs/testing.md, "Database").
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { runPnpm } from './lib/run.ts'

const apiDir = join(import.meta.dirname, '..', 'apps', 'api')
const migrationsDir = join(apiDir, 'migrations')

function snapshot(): Map<string, string> {
  const files = readdirSync(migrationsDir, { recursive: true, withFileTypes: true })
  return new Map(
    files
      .filter((f) => f.isFile())
      .map((f) => {
        const path = join(f.parentPath, f.name)
        return [path, createHash('sha256').update(readFileSync(path)).digest('hex')]
      }),
  )
}

const before = snapshot()
const result = runPnpm(['exec', 'drizzle-kit', 'generate'], {
  cwd: apiDir,
  encoding: 'utf8',
})
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
if (result.status !== 0) {
  process.exitCode = result.status ?? 1
} else {
  const after = snapshot()
  const changed = [...after].filter(([path, hash]) => before.get(path) !== hash).map(([p]) => p)
  if (changed.length > 0) {
    console.error(
      `Schema drift: src/db/schema.ts changed without a migration. drizzle-kit wrote:\n` +
        changed.map((p) => `  ${p}`).join('\n') +
        `\nReview the new SQL, then commit it with the schema change.`,
    )
    process.exitCode = 1
  } else {
    console.log('no schema drift')
  }
}
