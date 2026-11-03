// `pnpm cf <wrangler args>`: runs this repo's wrangler (in apps/api) with the project's own
// Cloudflare token from apps/api/.env.cloudflare (gitignored), so the global `wrangler login`
// used by other projects on this computer is never touched. See docs/deployment.md.
//
// Production deploys happen only from CI (CLAUDE.md), so this refuses any command that
// deploys or rolls back without `--env preview`.
//
// The D1 ids are not in wrangler.jsonc (scripts/d1-ids.ts): this passes a gitignored copy with
// the ids from apps/api/.env.cloudflare (D1_PREVIEW_DATABASE_ID, optional
// D1_PRODUCTION_DATABASE_ID), unless the command names its own --config.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { localConfigArgs } from './d1-ids.ts'
import { runPnpm } from './lib/run.ts'

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

const ownConfig = args.some((a) => ['--config', '-c'].includes(a) || /^(--config|-c)=/.test(a))
const config = ownConfig ? { args: [], ids: {} } : localConfigArgs()
if (!ownConfig && targetsPreview(args) && config.ids.preview === undefined) {
  console.error(
    'Missing D1_PREVIEW_DATABASE_ID in apps/api/.env.cloudflare: the preview D1 id is not in ' +
      'wrangler.jsonc (docs/deployment.md, "Local Cloudflare access").',
  )
  process.exit(1)
}

const result = runPnpm(['exec', 'wrangler', ...args, ...config.args], {
  cwd: apiDir,
  stdio: 'inherit',
})
process.exitCode = result.status ?? 1
