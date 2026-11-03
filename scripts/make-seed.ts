// `node scripts/make-seed.ts [--from preview|production] [--per-state 120]`: writes
// apps/api/seed/seed.sql, the test data for preview and local development (docs/deployment.md,
// "Preview data"). It samples each published state list (real, state-published rows), favouring
// codes several states share so the comparisons have something to compare, and keeps that
// state's sources, category mappings and unified mappings for the sampled categories. Admin
// identities become the seed actor (the repo is public), and the script stops if any other email
// address is left. No reference data, so no AHRQ or CMS text. It only reads the source database.
//
// Load it with `pnpm db:seed:local` or `pnpm db:seed:preview` (scripts/seed.ts), then press
// Rebuild coverage (Admin → Unified categories). Runs directly on Node 26 (type stripping).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { finishSql, insertSql, parseWranglerJson, sqlString, statesSql } from './copy-state-data.ts'

export const SEED_ACTOR = 'seed@localhost'

/** A text or number column as a string; anything else (NULL) as ''. */
const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** Columns that hold an admin's Access identity. */
const IDENTITY_COLUMNS = new Set([
  'uploaded_by',
  'created_by',
  'published_by',
  'mapped_by',
  'reviewed_by',
  'actor_email',
])

/** A row with every admin identity replaced by the seed actor. */
export function scrub(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      IDENTITY_COLUMNS.has(k) && v !== null ? SEED_ACTOR : v,
    ]),
  )
}

/** Throws if the SQL holds an email address other than the seed actor's. */
export function assertNoEmails(sql: string): void {
  const found = [...sql.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)*/g)]
    .map((m) => m[0])
    .filter((e) => e !== SEED_ACTOR)
  if (found.length > 0)
    throw new Error(`The seed would hold ${String(found.length)} email address(es)`)
}

/**
 * Clears state data and the derived rows, never reference data, states, unified categories or
 * watch items. States first: a state must not point at a deleted version.
 */
export const RESET_SQL = [
  "UPDATE states SET published_version_id = NULL, status = 'none';",
  'DELETE FROM entry_unified;',
  'DELETE FROM unified_universe;',
  'DELETE FROM state_similarity;',
  'DELETE FROM entries;',
  'DELETE FROM version_sources;',
  'DELETE FROM draft_parts;',
  'DELETE FROM dataset_versions;',
  'DELETE FROM column_profiles;',
  'DELETE FROM category_mappings;',
  'DELETE FROM chapter_mappings;',
  'DELETE FROM unified_mappings;',
  'DELETE FROM source_documents;',
  'DELETE FROM audit_log;',
]

/**
 * A unified mapping's INSERT. Its target is found by slug, because ids differ between databases
 * (migration 0011 skips slugs that already exist, and local tests create categories).
 */
export function mappingSql(
  row: Record<string, unknown>,
  slugOf: ReadonlyMap<number, string>,
): string {
  const target = row['unified_id']
  if (target === null) return insertSql('unified_mappings', row)
  const slug = slugOf.get(Number(target))
  if (slug === undefined) throw new Error(`No slug for unified category ${text(target)}`)
  const plain = insertSql('unified_mappings', row, ['unified_id'])
  const match = /^INSERT INTO unified_mappings \((.*)\) VALUES \((.*)\);$/s.exec(plain)
  if (!match) throw new Error('Unexpected INSERT')
  return `INSERT INTO unified_mappings (${match[1] ?? ''}, unified_id) SELECT ${match[2] ?? ''}, id FROM unified_categories WHERE slug = ${sqlString(slug)};`
}

interface SampleEntry {
  id: number
  code_system: string
  code_norm: string
  state_category: string | null
  state_subcategory: string | null
  qualification: string
}

const byCode = (a: SampleEntry, b: SampleEntry) =>
  a.code_system.localeCompare(b.code_system) ||
  a.code_norm.localeCompare(b.code_norm) ||
  a.id - b.id

const groupKey = (e: SampleEntry) =>
  [e.code_system, e.state_category ?? '', e.state_subcategory ?? '', e.qualification].join('|')

/** Indices 0..n-1 in van der Corput order, so any prefix is spread evenly over the range. */
function spreadOrder(n: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  for (let k = 0; out.length < n; k++) {
    let x = 0
    let f = 0.5
    for (let i = k; i > 0; i >>= 1, f /= 2) if (i & 1) x += f
    const index = Math.floor(x * n)
    if (!seen.has(index)) {
      seen.add(index)
      out.push(index)
    }
  }
  return out
}

/** The list in code order, reordered so that taking the first few spreads them over it. */
const spread = <T extends SampleEntry>(list: readonly T[]): T[] => {
  const sorted = [...list].sort(byCode)
  return spreadOrder(sorted.length).flatMap((i) => (sorted[i] ? [sorted[i]] : []))
}

export interface SampleHints {
  /** Codes to take first (at most half the sample): shared by states and in a category. */
  preferred: ReadonlySet<string>
  /** Codes in a unified category: first within each group. */
  useful: ReadonlySet<string>
}

/**
 * Up to `size` entries of one state's list, the same for the same input: preferred codes first
 * (at most half), then one entry per group (code system, state category, subcategory,
 * qualification) in turn, groups not yet shown first. Within each part, useful codes come first
 * and picks spread over the code range.
 */
export function sampleEntries<T extends SampleEntry>(
  list: readonly T[],
  hints: SampleHints,
  size: number,
): T[] {
  if (list.length <= size) return [...list].sort(byCode)
  const picked = spread(list.filter((e) => hints.preferred.has(e.code_norm))).slice(
    0,
    Math.floor(size / 2),
  )
  const taken = new Set(picked.map((e) => e.id))
  const members = new Map<string, T[]>()
  for (const e of list) {
    if (taken.has(e.id)) continue
    const key = groupKey(e)
    members.set(key, [...(members.get(key) ?? []), e])
  }
  const groups = new Map(
    [...members].map(([key, rows]) => [
      key,
      [
        ...spread(rows.filter((e) => hints.useful.has(e.code_norm))),
        ...spread(rows.filter((e) => !hints.useful.has(e.code_norm))),
      ],
    ]),
  )
  const shown = new Set(picked.map(groupKey))
  const keys = [...groups.keys()].sort()
  const order = [...keys.filter((k) => !shown.has(k)), ...keys.filter((k) => shown.has(k))]
  while (picked.length < size) {
    for (const key of order) {
      const next = groups.get(key)?.shift()
      if (next && picked.length < size) picked.push(next)
    }
  }
  return picked
}

// ---- Running it ----

const apiDir = join(import.meta.dirname, '..', 'apps', 'api')
export const SEED_FILE = join(apiDir, 'seed', 'seed.sql')

function query(from: 'preview' | 'production', sql: string): Record<string, unknown>[] {
  const target = from === 'preview' ? ['frailty-preview', '--env', 'preview'] : ['frailty-prod']
  const r = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', ...target, '--remote', '--json', '--command', sql],
    {
      cwd: apiDir,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
    },
  )
  if (r.status !== 0) throw new Error(`Query failed (exit ${String(r.status)})`)
  return parseWranglerJson(r.stdout)
}

const ids = (rows: Record<string, unknown>[], key: string) =>
  [...new Set(rows.map((r) => Number(r[key])))].sort((a, b) => a - b).join(', ')

function main() {
  const argv = process.argv.slice(2)
  const from = argv.includes('--from') ? argv[argv.indexOf('--from') + 1] : 'preview'
  if (from !== 'preview' && from !== 'production') throw new Error('--from preview|production')
  const perState = argv.includes('--per-state')
    ? Number(argv[argv.indexOf('--per-state') + 1])
    : 120
  const envFile = join(apiDir, '.env.cloudflare')
  if (!process.env['CLOUDFLARE_API_TOKEN'] && existsSync(envFile)) process.loadEnvFile(envFile)

  const states = query(
    from,
    "SELECT id, status, published_version_id, updated_at FROM states WHERE status <> 'none' OR published_version_id IS NOT NULL ORDER BY id",
  ) as {
    id: string
    status: string
    published_version_id: number | null
    updated_at: string | null
  }[]
  const published = states.filter((s) => s.published_version_id !== null)
  if (published.length === 0) throw new Error(`No published lists on ${from}`)
  const versionIds = published.map((s) => String(s.published_version_id)).join(', ')

  const all = query(from, `SELECT * FROM entries WHERE version_id IN (${versionIds})`) as (Record<
    string,
    unknown
  > &
    SampleEntry & { version_id: number })[]
  // Codes at least two states list.
  const statesOf = new Map<string, Set<number>>()
  for (const e of all)
    statesOf.set(e.code_norm, (statesOf.get(e.code_norm) ?? new Set()).add(e.version_id))
  const shared = new Set([...statesOf].filter(([, v]) => v.size > 1).map(([k]) => k))
  // ICD-10-CM codes whose CCSR group (any prefix, 3 to 7 characters) is in a unified category.
  const useful = new Set(
    query(
      from,
      `SELECT DISTINCT e.code_norm AS code FROM entries e
        JOIN ref_ccsr r ON r.code_norm IN (substr(e.code_norm, 1, 3), substr(e.code_norm, 1, 4),
          substr(e.code_norm, 1, 5), substr(e.code_norm, 1, 6), substr(e.code_norm, 1, 7))
        JOIN unified_ccsr u ON u.ccsr_category = r.ccsr_category
        WHERE e.version_id IN (${versionIds}) AND e.code_system = 'icd10cm'`,
    ).map((r) => String(r['code'])),
  )
  const hints = { preferred: new Set([...shared].filter((c) => useful.has(c))), useful }

  const sample = published.flatMap((s) =>
    sampleEntries(
      all.filter((e) => e.version_id === s.published_version_id),
      hints,
      perState,
    ),
  )
  const sampledCats = new Set(
    sample.map(
      (e) => `${String(e.version_id)}|${e.state_category ?? ''}|${e.state_subcategory ?? ''}`,
    ),
  )
  const stateOfVersion = new Map(published.map((s) => [s.published_version_id, s.id]))
  const catKeys = new Set(
    [...sampledCats].map((k) => {
      const [v, ...rest] = k.split('|')
      return `${stateOfVersion.get(Number(v)) ?? ''}|${rest.join('|')}`
    }),
  )
  const inSample = (r: Record<string, unknown>) =>
    catKeys.has(
      `${text(r['state_id'])}|${text(r['state_category'])}|${text(r['state_subcategory'])}`,
    )

  const versions = query(
    from,
    `SELECT * FROM dataset_versions WHERE id IN (${versionIds}) ORDER BY id`,
  )
  const links = query(from, `SELECT * FROM version_sources WHERE version_id IN (${versionIds})`)
  const docIds = [
    ...new Set([
      ...links.map((l) => Number(l['source_document_id'])),
      ...sample.map((e) => Number(e['source_document_id'])),
    ]),
  ]
  const docs = query(
    from,
    `SELECT * FROM source_documents WHERE id IN (${docIds.join(', ')}) ORDER BY id`,
  )
  const stateList = published.map((s) => `'${s.id}'`).join(', ')
  const catMaps = query(
    from,
    `SELECT * FROM category_mappings WHERE state_id IN (${stateList}) ORDER BY id`,
  ).filter(inSample)
  const uniMaps = query(
    from,
    `SELECT * FROM unified_mappings WHERE state_id IN (${stateList}) AND status <> 'superseded' ORDER BY id`,
  ).filter(inSample)

  const slugOf = new Map(
    query(from, 'SELECT id, slug FROM unified_categories').map((u) => [
      Number(u['id']),
      String(u['slug']),
    ]),
  )

  const countOf = new Map<number, number>()
  for (const e of sample) countOf.set(e.version_id, (countOf.get(e.version_id) ?? 0) + 1)
  const now = new Date().toISOString()
  const lines = [
    `-- Seed data for preview and local development (docs/deployment.md, "Preview data").`,
    `-- Written by scripts/make-seed.ts from ${from} on ${now.slice(0, 10)}: up to ${String(perState)} entries`,
    `-- per published state list (real, state-published rows), their sources and mappings. Admin`,
    `-- identities are replaced by ${SEED_ACTOR}. No reference data. Do not edit by hand.`,
    `-- Loading it DELETES every state list, mapping and audit row in the target first.`,
    'PRAGMA defer_foreign_keys=TRUE;',
    ...RESET_SQL,
    ...docs.map((d) => insertSql('source_documents', scrub(d))),
    ...versions.map((v) =>
      insertSql(
        'dataset_versions',
        scrub({ ...v, check_report_json: null, row_count: countOf.get(Number(v['id'])) ?? 0 }),
      ),
    ),
    ...links.map((l) => insertSql('version_sources', l)),
    ...[...sample].sort((a, b) => a.id - b.id).map((e) => insertSql('entries', e)),
    ...catMaps.map((m) => insertSql('category_mappings', scrub(m))),
    // As they are (proposed or approved), so preview also tests the approval flow.
    ...uniMaps.map((m) => mappingSql(scrub({ ...m, superseded_by: null }), slugOf)),
    // The starter categories (migration 0011), published so every public page has content.
    "UPDATE unified_categories SET status = 'published', updated_by = 'seed@localhost' WHERE status = 'draft' AND created_by = 'migration 0011';",
    ...statesSql(states),
    ...finishSql({ entries: sample.length }, now).map((s) =>
      s.replace(
        "'ci: copy-state-data', 'data.copy', 'env:preview'",
        `${sqlString(SEED_ACTOR)}, 'seed.load', ${sqlString(`env:${from}`)}`,
      ),
    ),
  ]
  const sql = `${lines.join('\n')}\n`
  assertNoEmails(sql)
  mkdirSync(join(apiDir, 'seed'), { recursive: true })
  writeFileSync(SEED_FILE, sql)
  console.log(
    `Wrote ${SEED_FILE}: ${String(sample.length)} entries (${published.map((s) => `${s.id} ${String(countOf.get(s.published_version_id ?? 0) ?? 0)}`).join(', ')}), ` +
      `${String(docs.length)} sources, ${String(catMaps.length)} category mappings, ${String(uniMaps.length)} unified mappings; ` +
      `${String(shared.size)} codes shared by two or more states, ${String(useful.size)} in a unified category. Versions ${ids(versions, 'id')}.`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
