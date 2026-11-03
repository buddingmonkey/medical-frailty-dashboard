// D1 database ids are not committed (project lead, 2026-11-01): apps/api/wrangler.jsonc holds
// placeholders that work for local dev and tests, and the real ids come in at deploy time, so a
// new host deploys without editing code (docs/deployment.md, "Environments and CI/CD").
//
// - CI: `node scripts/d1-ids.ts --production <id>` (or `--preview <id>`) writes the id from the
//   GitHub environment variable D1_DATABASE_ID into wrangler.jsonc in place, before any remote
//   wrangler command. Refused outside GitHub Actions, so a laptop's tree never changes.
// - Laptop: scripts/cf.ts (and copy-state-data.ts) pass `--config wrangler.local-ids.jsonc`, a
//   gitignored copy with the ids from apps/api/.env.cloudflare (D1_PREVIEW_DATABASE_ID,
//   optional D1_PRODUCTION_DATABASE_ID). Only those keys are read from that file.
//
// The ids are identifiers, not secrets. Runs directly on Node 26 (type stripping).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'

export const PLACEHOLDER_IDS = {
  production: 'local-frailty-prod',
  preview: 'local-frailty-preview',
} as const

export type D1Env = keyof typeof PLACEHOLDER_IDS
export type D1Ids = Partial<Record<D1Env, string>>

const apiDir = join(import.meta.dirname, '..', 'apps', 'api')
const configPath = join(apiDir, 'wrangler.jsonc')
/** Gitignored. Next to wrangler.jsonc, so its relative paths (main, assets, migrations) hold. */
export const LOCAL_CONFIG = 'wrangler.local-ids.jsonc'

const D1_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The config text with each given id in place of its environment's placeholder. */
export function withDatabaseIds(config: string, ids: D1Ids): string {
  let out = config
  for (const env of ['production', 'preview'] as const) {
    const id = ids[env]
    if (id === undefined) continue
    if (!D1_ID.test(id)) throw new Error(`The ${env} value is not a D1 database id (a UUID).`)
    const placeholder = `"database_id": "${PLACEHOLDER_IDS[env]}"`
    const parts = out.split(placeholder)
    if (parts.length !== 2) {
      throw new Error(
        `apps/api/wrangler.jsonc must hold the ${env} placeholder ${placeholder} exactly once.`,
      )
    }
    out = parts.join(`"database_id": "${id}"`)
  }
  return out
}

/** The D1 ids in a dotenv file's text (apps/api/.env.cloudflare); every other key is ignored. */
export function idsFromEnvFile(text: string): D1Ids {
  const vars = parseEnv(text)
  const ids: D1Ids = {}
  if (vars['D1_PRODUCTION_DATABASE_ID']) ids.production = vars['D1_PRODUCTION_DATABASE_ID']
  if (vars['D1_PREVIEW_DATABASE_ID']) ids.preview = vars['D1_PREVIEW_DATABASE_ID']
  return ids
}

/**
 * Laptop only: writes apps/api/wrangler.local-ids.jsonc from the ids in apps/api/.env.cloudflare
 * and returns the wrangler arguments that use it, or [] when that file names no id.
 */
export function localConfigArgs(): { args: string[]; ids: D1Ids } {
  const envFile = join(apiDir, '.env.cloudflare')
  const ids = existsSync(envFile) ? idsFromEnvFile(readFileSync(envFile, 'utf8')) : {}
  if (ids.production === undefined && ids.preview === undefined) return { args: [], ids }
  writeFileSync(join(apiDir, LOCAL_CONFIG), withDatabaseIds(readFileSync(configPath, 'utf8'), ids))
  return { args: ['--config', LOCAL_CONFIG], ids }
}

if (import.meta.main) {
  try {
    if (process.env['GITHUB_ACTIONS'] !== 'true') {
      throw new Error(
        'Refused: this rewrites apps/api/wrangler.jsonc and runs only in CI. On a laptop, put ' +
          'D1_PREVIEW_DATABASE_ID in apps/api/.env.cloudflare and use `pnpm cf`.',
      )
    }
    const { values } = parseArgs({
      options: { production: { type: 'string' }, preview: { type: 'string' } },
    })
    if (values.production === undefined && values.preview === undefined) {
      throw new Error('Pass --production <id> and/or --preview <id>.')
    }
    writeFileSync(configPath, withDatabaseIds(readFileSync(configPath, 'utf8'), values))
    console.log(
      `D1 database id set for: ${Object.keys(values).join(', ')} (apps/api/wrangler.jsonc).`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
