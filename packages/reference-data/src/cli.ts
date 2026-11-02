// `pnpm --filter @mfcd/reference-data build`: download the CMS releases in src/sources.ts,
// check their SHA-256, parse them and write SQL chunks to dist/.
// `pnpm --filter @mfcd/reference-data load --local` (or `--env preview [--max-rows N]`): apply
// the chunks that D1 does not have yet. See README.md.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { unzipSync } from 'fflate'

import { parseHcpcsFile } from './hcpcs.ts'
import { parseIcd10cmOrderFile } from './icd10cm.ts'
import { releases, type Release } from './sources.ts'
import { chunkMarkerKey, toSqlChunks, type RefCodeRow } from './sql.ts'

const root = join(import.meta.dirname, '..')
const cacheDir = join(root, '.cache')
const distDir = join(root, 'dist')
const apiDir = join(root, '..', '..', 'apps', 'api')

interface Manifest {
  chunks: { name: string; file: string; rowCount: number }[]
}

async function download(release: Release): Promise<Uint8Array> {
  mkdirSync(cacheDir, { recursive: true })
  const cached = join(cacheDir, `${release.sha256}.zip`)
  let bytes: Uint8Array
  if (existsSync(cached)) {
    bytes = readFileSync(cached)
  } else {
    console.log(`downloading ${release.url}`)
    const response = await fetch(release.url)
    if (!response.ok) throw new Error(`${release.url}: HTTP ${String(response.status)}`)
    bytes = new Uint8Array(await response.arrayBuffer())
  }
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== release.sha256) {
    throw new Error(
      `${release.id}: SHA-256 is ${actual}, expected ${release.sha256}. CMS may have replaced ` +
        'the file: check it, then update src/sources.ts.',
    )
  }
  writeFileSync(cached, bytes)
  return bytes
}

function parseRelease(release: Release, zip: Uint8Array): RefCodeRow[] {
  const files = unzipSync(zip, { filter: (file) => file.name === release.member })
  const member = files[release.member]
  if (!member) throw new Error(`${release.id}: ${release.member} is not in the zip`)
  const options = { validFrom: release.validFrom }
  return release.codeSystem === 'icd10cm'
    ? parseIcd10cmOrderFile(new TextDecoder('utf-8', { fatal: true }).decode(member), options)
    : parseHcpcsFile(new TextDecoder('latin1').decode(member), options)
}

async function build(): Promise<void> {
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })
  const manifest: Manifest = { chunks: [] }
  for (const release of releases) {
    const rows = parseRelease(release, await download(release))
    for (const chunk of toSqlChunks(rows, { release: release.id })) {
      const file = `${chunk.name}.sql`
      writeFileSync(join(distDir, file), chunk.sql)
      manifest.chunks.push({ name: chunk.name, file, rowCount: chunk.rowCount })
    }
    console.log(`${release.id}: ${String(rows.length)} codes`)
  }
  writeFileSync(join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const total = manifest.chunks.reduce((n, c) => n + c.rowCount, 0)
  console.log(
    `wrote ${String(manifest.chunks.length)} chunks, ${String(total)} rows, to ${distDir}`,
  )
}

/** True inside GitHub Actions, where the job's environment supplies the Cloudflare token. */
const inCi = process.env['GITHUB_ACTIONS'] === 'true'

/**
 * Runs `wrangler d1 execute` in apps/api. Locally, remote commands go through `pnpm cf`
 * (this repo's own token); in CI, wrangler reads the job's CLOUDFLARE_API_TOKEN directly.
 */
function wrangler(target: string[], args: string[]): string {
  const viaCf = !target.includes('--local') && !inCi
  const command = viaCf
    ? ['cf', 'd1', 'execute', 'DB', ...target, ...args]
    : ['exec', 'wrangler', 'd1', 'execute', 'DB', ...target, ...args]
  const result = spawnSync('pnpm', command, {
    cwd: viaCf ? join(apiDir, '..', '..') : apiDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`wrangler failed:\n${result.stdout}${result.stderr}`)
  }
  return result.stdout
}

function loadedChunks(target: string[]): Set<string> {
  const out = wrangler(target, [
    '--json',
    '--command',
    "SELECT key FROM app_meta WHERE key LIKE 'ref_codes_chunk:%'",
  ])
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results: { key: string }[] }[]
  return new Set(parsed.flatMap((r) => r.results.map((row) => row.key)))
}

function load(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      local: { type: 'boolean', default: false },
      env: { type: 'string' },
      // D1 free tier: 100,000 rows written per day for the whole account. Leave headroom.
      'max-rows': { type: 'string', default: '80000' },
    },
  })
  if (values.local === (values.env !== undefined)) {
    throw new Error('Pass exactly one of --local or --env preview.')
  }
  if (values.env !== undefined && values.env !== 'preview' && values.env !== 'production') {
    throw new Error(`Unknown --env ${values.env}.`)
  }
  if (values.env === 'production' && !inCi) {
    // Production changes only from CI (CLAUDE.md): .github/workflows/reference-data.yml.
    throw new Error('Refusing --env production outside CI: run the "Reference data" workflow.')
  }
  // Top level of wrangler.jsonc is production; preview is `--env preview`.
  const target = values.local
    ? ['--local']
    : values.env === 'production'
      ? ['--remote']
      : ['--remote', '--env', 'preview']
  const budget = values.local ? Infinity : Number(values['max-rows'])
  if (!Number.isFinite(budget) || budget <= 0)
    throw new Error('--max-rows must be a positive number.')

  const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8')) as Manifest
  const done = loadedChunks(target)
  let written = 0
  let skipped = 0
  let loaded = 0
  for (const chunk of manifest.chunks) {
    if (done.has(chunkMarkerKey(chunk.name))) {
      skipped++
      continue
    }
    if (written + chunk.rowCount > budget) {
      console.log(`stopping at the daily budget (${String(written)} rows); run again tomorrow`)
      break
    }
    wrangler(target, ['--file', join(distDir, chunk.file)])
    written += chunk.rowCount
    loaded++
    console.log(`${chunk.name}: ${String(chunk.rowCount)} rows`)
  }
  const left = manifest.chunks.length - skipped - loaded
  console.log(
    `loaded ${String(written)} rows in ${String(loaded)} chunks; ${String(skipped)} were already ` +
      `loaded` +
      (left > 0 ? `; ${String(left)} left for another day (run again after 00:00 UTC)` : ''),
  )
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'build') await build()
else if (command === 'load') load(rest)
else {
  console.error('usage: cli.ts build | load (--local | --env preview) [--max-rows N]')
  process.exitCode = 1
}
