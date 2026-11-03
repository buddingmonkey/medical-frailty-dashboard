// `pnpm db:seed:local` / `pnpm db:seed:preview`: replaces every state list, mapping and audit
// row in that database with apps/api/seed/seed.sql (scripts/make-seed.ts; docs/deployment.md,
// "Preview data"), then says to press Rebuild coverage. Never production: production holds the
// real lists. Runs directly on Node 26 (type stripping).
import { join } from 'node:path'

import { runNode, runPnpm } from './lib/run.ts'

const root = join(import.meta.dirname, '..')

/** The wrangler arguments that load `file`, or a throw for any target but local or preview. */
export function seedCommand(argv: readonly string[], file: string): string[] {
  const envs = argv.flatMap((a, i) =>
    a === '--env' ? [argv[i + 1] ?? ''] : a.startsWith('--env=') ? [a.slice(6)] : [],
  )
  const [env] = envs
  if (envs.length !== 1 || (env !== 'local' && env !== 'preview')) {
    throw new Error('Seed data loads only into local or preview (production holds the real lists)')
  }
  if (env === 'preview') {
    return ['d1', 'execute', 'frailty-preview', '--env', 'preview', '--remote', '--file', file]
  }
  const at = argv.indexOf('--persist-to')
  const persist = at >= 0 ? ['--persist-to', argv[at + 1] ?? ''] : []
  return ['d1', 'execute', 'DB', '--local', ...persist, '--file', file]
}

if (import.meta.main) {
  try {
    const args = seedCommand(process.argv.slice(2), join(root, 'apps', 'api', 'seed', 'seed.sql'))
    // Preview through scripts/cf.ts (this repo's own Cloudflare token); local needs none.
    const r = args.includes('--remote')
      ? runNode([join(root, 'scripts', 'cf.ts'), ...args], { stdio: 'inherit' })
      : runPnpm(['exec', 'wrangler', ...args], {
          cwd: join(root, 'apps', 'api'),
          stdio: 'inherit',
        })
    if (r.status !== 0) process.exit(r.status ?? 1)
    console.log(
      '\nSeed loaded. Now press Rebuild coverage (Admin → Unified categories) to rebuild the ' +
        'full code lists, placements and similarity.',
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
