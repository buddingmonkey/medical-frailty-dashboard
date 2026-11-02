// `pnpm cf <wrangler args>`: runs this repo's wrangler (in apps/api) with the project's own
// Cloudflare token from apps/api/.env.cloudflare (gitignored), so the global `wrangler login`
// used by other projects on this computer is never touched. See docs/deployment.md.
//
// Production deploys happen only from CI (CLAUDE.md), so this refuses any command that
// deploys or rolls back without `--env preview`.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const apiDir = join(import.meta.dirname, '..', 'apps', 'api')
const envFile = join(apiDir, '.env.cloudflare')
const args = process.argv.slice(2)

/** Words that make a command change which code a Worker runs (`deploy`, `versions deploy`, `rollback`). */
const DEPLOYING = new Set(['deploy', 'rollback'])

function targetsPreview(argv: string[]): boolean {
  return argv.some(
    (arg, i) =>
      arg === '--env=preview' ||
      arg === '-e=preview' ||
      ((arg === '--env' || arg === '-e') && argv[i + 1] === 'preview'),
  )
}

// Deliberately broad: any bare `deploy` or `rollback` word counts.
const deploys = args.some((a) => DEPLOYING.has(a))

if (deploys && !targetsPreview(args)) {
  console.error(
    'Refused: production deploys and rollbacks run only from CI (CLAUDE.md). ' +
      'Add `--env preview` to target the preview Worker.',
  )
  process.exit(1)
}

if (!existsSync(envFile)) {
  console.error(
    'Missing apps/api/.env.cloudflare. Create it with CLOUDFLARE_API_TOKEN and ' +
      'CLOUDFLARE_ACCOUNT_ID (docs/deployment.md, "Local Cloudflare access").',
  )
  process.exit(1)
}
process.loadEnvFile(envFile)

const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], { cwd: apiDir, stdio: 'inherit' })
process.exitCode = result.status ?? 1
