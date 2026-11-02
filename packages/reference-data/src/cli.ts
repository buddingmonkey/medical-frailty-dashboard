// `pnpm --filter @mfcd/reference-data build`: download the CMS and AHRQ CCSR releases in
// src/sources.ts, check their SHA-256, parse them and write SQL chunks to dist/.
// `pnpm --filter @mfcd/reference-data load --local` (or `--env preview [--max-rows N]`): apply
// the chunks that D1 does not have yet. `ccsr-coverage`: check local D1's published ICD-10-CM
// codes against ref_ccsr. See README.md.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { unzipSync } from 'fflate'

import { ccsrGroupsOf, ccsrLookupPrefixes, type CcsrRow } from '@mfcd/shared/ccsr'

import { compressCcsr, parseDxccsrCsv } from './ccsr.ts'
import { parseHcpcsFile } from './hcpcs.ts'
import { parseIcd10cmOrderFile } from './icd10cm.ts'
import { ccsrRelease, releases, type Release } from './sources.ts'
import {
  chunkMarkerKey,
  loadBudget,
  toCcsrSqlChunks,
  toSqlChunks,
  type RefCodeRow,
  type SqlChunk,
} from './sql.ts'

const root = join(import.meta.dirname, '..')
const cacheDir = join(root, '.cache')
const distDir = join(root, 'dist')
const apiDir = join(root, '..', '..', 'apps', 'api')

interface Manifest {
  chunks: { name: string; file: string; rowCount: number }[]
}

async function download(release: { id: string; url: string; sha256: string }): Promise<Uint8Array> {
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
      `${release.id}: SHA-256 is ${actual}, expected ${release.sha256}. The publisher may have ` +
        'replaced the file: check it, then update src/sources.ts.',
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

/** The CCSR CSV from the cached, checksummed zip (never committed: README.md, "Licence"). */
async function readCcsrCsv(): Promise<string> {
  const zip = await download(ccsrRelease)
  const files = unzipSync(zip, { filter: (file) => file.name === ccsrRelease.member })
  const member = files[ccsrRelease.member]
  if (!member) throw new Error(`${ccsrRelease.id}: ${ccsrRelease.member} is not in the zip`)
  return new TextDecoder('utf-8', { fatal: true }).decode(member)
}

async function build(): Promise<void> {
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })
  const manifest: Manifest = { chunks: [] }
  const write = (chunks: SqlChunk[]) => {
    for (const chunk of chunks) {
      const file = `${chunk.name}.sql`
      writeFileSync(join(distDir, file), chunk.sql)
      manifest.chunks.push({ name: chunk.name, file, rowCount: chunk.rowCount })
    }
  }
  for (const release of releases) {
    const rows = parseRelease(release, await download(release))
    write(toSqlChunks(rows, { release: release.id }))
    console.log(`${release.id}: ${String(rows.length)} codes`)
  }
  const { codes, categories } = parseDxccsrCsv(await readCcsrCsv(), { release: ccsrRelease.id })
  const ccsrRows = compressCcsr(codes, ccsrRelease.id)
  const uncompressed = codes.reduce((n, c) => n + c.categories.length, 0)
  const ccsrChunks = toCcsrSqlChunks(categories, ccsrRows, { release: ccsrRelease.id })
  write(ccsrChunks)
  console.log(
    `${ccsrRelease.id}: ${String(codes.length)} codes, ${String(categories.length)} categories; ` +
      `${String(uncompressed)} code rows, ${String(ccsrRows.length)} after prefix compression ` +
      `(${String(new Set(ccsrRows.map((r) => r.codeNorm)).size)} keys), ` +
      `${String(ccsrChunks.length)} chunks`,
  )
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

function query<T>(target: string[], sql: string): T[] {
  const out = wrangler(target, ['--json', '--command', sql])
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[]
  return parsed.flatMap((r) => r.results)
}

function loadedChunks(target: string[]): Set<string> {
  return new Set(
    query<{ key: string }>(
      target,
      "SELECT key FROM app_meta WHERE key LIKE 'ref_codes_chunk:%'",
    ).map((row) => row.key),
  )
}

/**
 * Roadmap M5 step 2's check, against local D1 only: every ICD-10-CM code in a published entry
 * should find CCSR groups by the longest-prefix rule (packages/shared/src/ccsr.ts). A header code
 * whose children have different groups finds none by that rule; it takes the groups of the codes
 * under it, as a wildcard entry does (docs/data-model.md). Fails if a code that exists in
 * ref_codes finds no groups either way.
 */
async function ccsrCoverage(): Promise<void> {
  const target = ['--local']
  const byKey = new Map<string, CcsrRow[]>()
  for (const r of query<{ code_norm: string; ccsr_category: string; is_default: 0 | 1 }>(
    target,
    'SELECT code_norm, ccsr_category, is_default FROM ref_ccsr',
  )) {
    const list = byKey.get(r.code_norm) ?? []
    list.push({ codeNorm: r.code_norm, ccsrCategory: r.ccsr_category, isDefault: r.is_default })
    byKey.set(r.code_norm, list)
  }
  if (byKey.size === 0) throw new Error('ref_ccsr is empty: run pnpm db:ref:local first.')
  const published = `FROM entries e JOIN states s ON s.published_version_id = e.version_id
      WHERE e.code_system = 'icd10cm'`
  const entries = query<{ state: string; code: string; kind: string }>(
    target,
    `SELECT DISTINCT s.id AS state, e.code_norm AS code, e.match_kind AS kind ${published}
     UNION SELECT DISTINCT s.id, e.range_end_norm, 'range end' ${published}
       AND e.range_end_norm IS NOT NULL`,
  )
  const billable = new Map(
    query<{ code_norm: string; billable: 0 | 1 }>(
      target,
      `SELECT DISTINCT code_norm, billable FROM ref_codes WHERE code_system = 'icd10cm'
         AND code_norm IN (SELECT e.code_norm ${published}
                           UNION SELECT e.range_end_norm ${published})`,
    ).map((r) => [r.code_norm, r.billable]),
  )
  const inFile = new Set(
    parseDxccsrCsv(await readCcsrCsv(), { release: ccsrRelease.id }).codes.map((c) => c.codeNorm),
  )
  const keys = [...byKey.keys()]
  const codes = [...new Set(entries.map((e) => e.code))].sort()
  const count = new Map<string, string[]>()
  const add = (bucket: string, code: string) =>
    count.set(bucket, [...(count.get(bucket) ?? []), code])
  for (const code of codes) {
    const found = ccsrGroupsOf(
      code,
      ccsrLookupPrefixes(code).flatMap((p) => byKey.get(p) ?? []),
    )
    const known = billable.get(code)
    if (found && inFile.has(code) && known === 0) {
      add('found: in the CCSR file, but a header in FY2027 (old code kept by CCSR)', code)
    } else if (found && inFile.has(code)) add('found: in the CCSR file', code)
    else if (found && known === 1)
      add('found: FY2027 billable code CCSR lacks (parent prefix)', code)
    else if (found && known === 0) add('found: header code (uniform prefix)', code)
    else if (found) add('found: not in ref_codes (invalid code, prefix matched)', code)
    else if (keys.some((k) => k.startsWith(code)))
      add('not found: header; codes under it have groups', code)
    else if (known === undefined) add('not found: not in ref_codes (invalid code)', code)
    else add('not found: valid code with no groups (FAIL)', code)
  }
  const states = [...new Set(entries.map((e) => e.state))].sort()
  console.log(`${states.join(', ')}: ${String(codes.length)} distinct ICD-10-CM codes`)
  for (const [bucket, list] of [...count].sort()) {
    const examples = list.slice(0, 8).map((code) => {
      const where = entries.filter((e) => e.code === code).map((e) => `${e.state} ${e.kind}`)
      return `${code} (${[...new Set(where)].join(', ')})`
    })
    console.log(`  ${bucket}: ${String(list.length)}\n    e.g. ${examples.join('; ')}`)
  }
  if (count.has('not found: valid code with no groups (FAIL)')) process.exitCode = 1
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
  const budget = loadBudget(values.local, values['max-rows'])

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
else if (command === 'ccsr-coverage') await ccsrCoverage()
else {
  console.error(
    'usage: cli.ts build | load (--local | --env preview) [--max-rows N] | ccsr-coverage',
  )
  process.exitCode = 1
}
