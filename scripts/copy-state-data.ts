// `node scripts/copy-state-data.ts --to production|local [--persist-to <dir>]`: copies the state
// lists the admins loaded on preview (versions, entries, sources and their R2 files, mappings,
// similarity, audit) into an empty target, so preview can then be reset to seed data
// (docs/deployment.md, "Preview data"). Reference data and unified categories are not copied:
// both databases already have them, and the script checks the unified ids match.
//
// Production is a target only inside GitHub Actions (the `Copy state data` workflow, which waits
// for the project lead's approval), never from a laptop (CLAUDE.md). `--to local` is the dry run.
//
// wrangler's output is never printed: an export prints a signed download link, and the rows hold
// admin email addresses. Runs directly on Node 26 (type stripping).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Columns too long for one statement, written in pieces after the rows (`appendSql`). Their
 * tables are copied from `d1 execute --json` rows instead of `d1 export`.
 */
const LONG_COLUMNS: Partial<Record<string, string>> = { dataset_versions: 'check_report_json' }

/** Characters per piece: at most 4 bytes each, so a statement stays under D1's 100 KB. */
const PIECE = 20_000

/** Tables copied, in foreign-key order. Every one must be empty in the target. */
export const COPY_TABLES = [
  'source_documents',
  'column_profiles',
  'dataset_versions',
  'version_sources',
  'draft_parts',
  'entries',
  'category_mappings',
  'chapter_mappings',
  'unified_mappings',
  'entry_unified',
  'state_similarity',
  'audit_log',
] as const

export type Target = 'production' | 'local'

/** Why the copy may not run, or null. */
export function copyAllowed(target: Target, env: Record<string, string | undefined>) {
  if (target === 'production' && env['GITHUB_ACTIONS'] !== 'true') {
    return 'Refused: production is written only from CI (the Copy state data workflow).'
  }
  return null
}

/** Tables that already have rows in the target, as "name (count)". Missing counts fail closed. */
export function targetNotEmpty(counts: Record<string, number>): string[] {
  return COPY_TABLES.filter((t) => counts[t] !== 0).map((t) => `${t} (${String(counts[t] ?? '?')})`)
}

interface UnifiedRow {
  id: number
  slug: string
  status: string
}

/** Unified category ids that do not match between preview and the target. */
export function unifiedDifferences(source: UnifiedRow[], target: UnifiedRow[]): string[] {
  const there = new Map(target.map((r) => [r.id, r.slug]))
  const here = new Map(source.map((r) => [r.id, r.slug]))
  const out: string[] = []
  for (const id of [...new Set([...here.keys(), ...there.keys()])].sort((a, b) => a - b)) {
    const a = here.get(id)
    const b = there.get(id)
    if (a === undefined) out.push(`${String(id)}: only in the target`)
    else if (b === undefined) out.push(`${String(id)}: only in preview`)
    else if (a !== b) out.push(`${String(id)}: ${a} ≠ ${b}`)
  }
  return out
}

export const sqlString = (value: string | null) =>
  value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`

interface StateRow {
  id: string
  status: string
  published_version_id: number | null
  updated_at: string | null
}

/** The states rows' list columns, as UPDATEs (the 51 rows exist in both databases). */
export function statesSql(rows: StateRow[]): string[] {
  return rows.map((r) => {
    if (!/^[A-Z]{2}$/.test(r.id)) throw new Error(`Unexpected state id: ${r.id}`)
    const version = r.published_version_id
    if (version !== null && !Number.isInteger(version)) {
      throw new Error(`Unexpected published version id for ${r.id}`)
    }
    return `UPDATE states SET status = ${sqlString(r.status)}, published_version_id = ${version === null ? 'NULL' : String(version)}, updated_at = ${sqlString(r.updated_at)} WHERE id = '${r.id}';`
  })
}

/** A data_version bump (public caches) and one audit row for the copy. */
export function finishSql(rows: Record<string, number>, at: string): [string, string] {
  return [
    "INSERT INTO app_meta (key, value) VALUES ('data_version', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT);",
    `INSERT INTO audit_log (at, actor_email, action, target, details_json) VALUES (${sqlString(at)}, 'ci: copy-state-data', 'data.copy', 'env:preview', ${sqlString(JSON.stringify({ rows }))});`,
  ]
}

/** One INSERT for a row from `d1 execute --json`, without the columns in `omit`. */
export function insertSql(
  table: string,
  row: Record<string, unknown>,
  omit: string[] = [],
): string {
  const columns = Object.keys(row).filter((c) => !omit.includes(c))
  const values = columns.map((c) => {
    if (!/^[a-z][a-z0-9_]*$/.test(c)) throw new Error(`Unexpected column name: ${c}`)
    const v = row[c]
    if (v === null || typeof v === 'string') return sqlString(v)
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    throw new Error(`Unexpected value in ${table}.${c}`)
  })
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`
}

/**
 * Sets a long text column in pieces of at most `size` characters, so no statement passes D1's
 * statement size limit (a check report can be 700 KB). Splits on code points, never inside one.
 */
export function appendSql(
  table: string,
  id: number,
  column: string,
  value: string | null,
  size: number,
): string[] {
  if (value === null) return []
  const chars = Array.from(value)
  const out = [`UPDATE ${table} SET ${column} = '' WHERE id = ${String(id)};`]
  for (let i = 0; i < chars.length; i += size) {
    const piece = chars.slice(i, i + size).join('')
    out.push(
      `UPDATE ${table} SET ${column} = ${column} || ${sqlString(piece)} WHERE id = ${String(id)};`,
    )
  }
  return out
}

/** The result rows of the first statement in `wrangler d1 execute --json` output. */
export function parseWranglerJson(stdout: string): Record<string, unknown>[] {
  const start = stdout.indexOf('[')
  if (start < 0) throw new Error('wrangler printed no JSON')
  const parsed = JSON.parse(stdout.slice(start)) as { results: Record<string, unknown>[] }[]
  return parsed[0]?.results ?? []
}

// ---- Running it ----

const apiDir = join(import.meta.dirname, '..', 'apps', 'api')

const redact = (text: string) =>
  text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/https:\/\/\S+/g, '<url>')
    .slice(-800)

function wrangler(args: string[]): string {
  const r = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: apiDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
  })
  if (r.status !== 0) {
    throw new Error(
      `wrangler ${args.slice(0, 2).join(' ')} failed:\n${redact(r.stderr + r.stdout)}`,
    )
  }
  return r.stdout
}

interface Place {
  d1: string[]
  bucket: string
  r2: string[]
}

function places(target: Target, persistTo: string | undefined): { from: Place; to: Place } {
  const local = persistTo ? ['--local', '--persist-to', persistTo] : ['--local']
  return {
    from: {
      d1: ['frailty-preview', '--env', 'preview', '--remote'],
      bucket: 'frailty-preview-files',
      r2: ['--remote'],
    },
    to:
      target === 'production'
        ? { d1: ['frailty-prod', '--remote'], bucket: 'frailty-prod-files', r2: ['--remote'] }
        : { d1: ['DB', ...local], bucket: 'frailty-prod-files', r2: local },
  }
}

const query = (place: Place, sql: string) =>
  parseWranglerJson(wrangler(['d1', 'execute', ...place.d1, '--json', '--command', sql]))

function counts(place: Place): Record<string, number> {
  const sql = `SELECT ${COPY_TABLES.map((t) => `(SELECT count(*) FROM ${t}) AS ${t}`).join(', ')}`
  const [row] = query(place, sql)
  return Object.fromEntries(COPY_TABLES.map((t) => [t, Number(row?.[t] ?? NaN)]))
}

function main() {
  const argv = process.argv.slice(2)
  const target = argv[argv.indexOf('--to') + 1]
  if (target !== 'production' && target !== 'local') {
    console.error('Usage: node scripts/copy-state-data.ts --to production|local [--persist-to dir]')
    process.exit(2)
  }
  const refusal = copyAllowed(target, process.env)
  if (refusal) {
    console.error(refusal)
    process.exit(1)
  }
  const persistAt = argv.indexOf('--persist-to')
  const persistTo = persistAt >= 0 ? argv[persistAt + 1] : undefined
  // Locally, this repo's own token (scripts/cf.ts); in CI the workflow sets it.
  const envFile = join(apiDir, '.env.cloudflare')
  if (!process.env['CLOUDFLARE_API_TOKEN'] && existsSync(envFile)) process.loadEnvFile(envFile)

  const { from, to } = places(target, persistTo)
  const say = (line: string) => {
    console.log(line)
  }

  // 1. Guards: an empty target with the same unified categories.
  const busy = targetNotEmpty(counts(to))
  if (busy.length > 0)
    throw new Error(`The ${target} database already has state data: ${busy.join(', ')}`)
  const unified = (p: Place) =>
    query(p, 'SELECT id, slug, status FROM unified_categories') as unknown as UnifiedRow[]
  const differ = unifiedDifferences(unified(from), unified(to))
  if (differ.length > 0) throw new Error(`Unified categories differ: ${differ.join('; ')}`)
  const source = counts(from)
  say(`Preview rows: ${JSON.stringify(source)}`)

  const work = mkdtempSync(join(tmpdir(), 'mfcd-copy-'))
  try {
    // 2. R2 files first: a row never points at a file the target lacks.
    const docs = query(from, 'SELECT r2_key, sha256 FROM source_documents ORDER BY id') as {
      r2_key: string
      sha256: string
    }[]
    for (const [i, doc] of docs.entries()) {
      if (!/^[\w/.-]+$/.test(doc.r2_key)) throw new Error('Unexpected R2 key')
      const file = join(work, `doc-${String(i)}`)
      wrangler(['r2', 'object', 'get', `${from.bucket}/${doc.r2_key}`, ...from.r2, '--file', file])
      const sha = createHash('sha256').update(readFileSync(file)).digest('hex')
      if (sha !== doc.sha256)
        throw new Error(`Source file ${String(i + 1)}: SHA-256 does not match`)
      wrangler([
        'r2',
        'object',
        'put',
        `${to.bucket}/${doc.r2_key}`,
        ...to.r2,
        '--file',
        file,
        '--content-type',
        'application/octet-stream',
        '--content-disposition',
        'attachment',
      ])
    }
    say(`Copied ${String(docs.length)} source files (SHA-256 checked).`)

    // 3. One SQL file: each table's rows in foreign-key order, then states, data_version, audit.
    const parts = ['PRAGMA defer_foreign_keys=TRUE;']
    for (const table of COPY_TABLES) {
      if (source[table] === 0) continue
      const long = LONG_COLUMNS[table]
      if (long) {
        const rows = query(from, `SELECT * FROM ${table} ORDER BY id`)
        for (const row of rows) parts.push(insertSql(table, row, [long]))
        for (const row of rows) {
          const value = row[long]
          parts.push(
            ...appendSql(
              table,
              Number(row['id']),
              long,
              typeof value === 'string' ? value : null,
              PIECE,
            ),
          )
        }
        continue
      }
      const file = join(work, `${table}.sql`)
      wrangler(['d1', 'export', ...from.d1, '--no-schema', '--table', table, '--output', file])
      const sql = readFileSync(file, 'utf8').replace(/^PRAGMA defer_foreign_keys=TRUE;\n/, '')
      parts.push(sql)
    }
    const stateRows = query(
      from,
      "SELECT id, status, published_version_id, updated_at FROM states WHERE status <> 'none' OR published_version_id IS NOT NULL",
    ) as unknown as StateRow[]
    parts.push(...statesSql(stateRows), ...finishSql(source, new Date().toISOString()))
    const all = join(work, 'copy.sql')
    writeFileSync(all, parts.join('\n'))

    // 4. A restore point, then the import.
    if (target === 'production') {
      const info = wrangler(['d1', 'time-travel', 'info', 'frailty-prod', '--json'])
      const bookmark = (JSON.parse(info.slice(info.indexOf('{'))) as { bookmark: string }).bookmark
      say(`D1 bookmark before the copy: ${bookmark}`)
      say(`Restore: wrangler d1 time-travel restore DB --bookmark=${bookmark}`)
    }
    wrangler(['d1', 'execute', ...to.d1, '--file', all])

    // 5. Check: every table has the same row count (audit_log has one more: the copy itself).
    const after = counts(to)
    const wrong = COPY_TABLES.filter(
      (t) => after[t] !== (source[t] ?? 0) + (t === 'audit_log' ? 1 : 0),
    )
    const [fts] = query(to, 'SELECT (SELECT count(*) FROM entries_fts) AS fts')
    if (wrong.length > 0 || Number(fts?.['fts']) !== source['entries']) {
      throw new Error(`Row counts differ after the copy: ${wrong.join(', ') || 'entries_fts'}`)
    }
    say(`Copied into ${target}: ${JSON.stringify(after)}; search index ${String(fts?.['fts'])}.`)
    say(`States: ${stateRows.map((s) => `${s.id} ${s.status}`).join(', ')}.`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
