// `node scripts/make-seed.ts [--from production|preview] [--per-state 300]`: writes
// apps/api/seed/seed.sql, the test data for preview and local development (docs/deployment.md,
// "Preview data"). It reads production by default (the real lists live there; preview holds
// only the seed). Two parts:
//
// - The real states: it samples each published state list (real, state-published rows),
//   favouring codes several states share so the comparisons have something to compare, and keeps
//   that state's sources, category mappings and unified mappings for the sampled categories.
// - Every other state: a synthetic list (scripts/synthetic-states.ts) drawn from the real lists'
//   code patterns, without their text, so the matrix, map and comparisons show 51 states.
//
// Admin identities become the seed actor (the repo is public), and the script stops if any
// other email address is left. No reference data, so no AHRQ or CMS text. It only reads the
// source database.
//
// Load it with `pnpm db:seed:local` or `pnpm db:seed:preview` (scripts/seed.ts), then press
// Rebuild coverage (Admin → Unified categories). Runs directly on Node 26 (type stripping).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { finishSql, insertSql, parseWranglerJson, sqlString, statesSql } from './copy-state-data.ts'
import {
  assignStatuses,
  buildCandidates,
  dedupePool,
  mixSystems,
  type PoolEntry,
  SYNTHETIC_IDS,
  syntheticState,
  withCategoryCodes,
} from './synthetic-states.ts'

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

export interface SeedArgs {
  from: 'preview' | 'production'
  perState: number
}

/** The command line: production and 300 entries per real state unless told otherwise. */
export function parseArgs(argv: readonly string[]): SeedArgs {
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  const from = value('--from') ?? 'production'
  if (from !== 'preview' && from !== 'production') throw new Error('--from preview|production')
  const perState = Number(value('--per-state') ?? 300)
  if (!Number.isInteger(perState) || perState < 1) throw new Error('--per-state <n>')
  return { from, perState }
}

/**
 * Rows with the same columns as INSERTs of up to `per` rows each, a third of the size of one
 * INSERT per row. Keep `per` small enough for D1's statement size (about 100 KB).
 */
export function insertRowsSql(
  table: string,
  rows: readonly Record<string, unknown>[],
  per: number,
): string[] {
  const columns = Object.keys(rows[0] ?? {}).join(', ')
  const tuples = rows.map((r) => {
    const one = insertSql(table, r)
    const head = `INSERT INTO ${table} (${columns}) VALUES `
    if (!one.startsWith(head)) throw new Error(`Rows of ${table} differ in their columns`)
    return one.slice(head.length, -1)
  })
  const out: string[] = []
  for (let i = 0; i < tuples.length; i += per)
    out.push(`INSERT INTO ${table} (${columns}) VALUES\n${tuples.slice(i, i + per).join(',\n')};`)
  return out
}

/** Throws if a real row's id reaches the synthetic ids' range. */
export function assertIdsBelow(
  table: string,
  rows: readonly Record<string, unknown>[],
  offset: number,
): void {
  if (rows.some((r) => Number(r['id']) >= offset))
    throw new Error(`A real ${table} id reaches the synthetic range (${String(offset)})`)
}

/**
 * Each unified category's full ICD-10-CM list, as `universeStatements` (apps/api/src/db/
 * placement.ts) builds it, for every category at once: a read, since the source database's
 * `unified_universe` is only filled by Rebuild coverage.
 */
const UNIVERSE_SQL = `WITH groups AS (SELECT u.slug, uc.ccsr_category FROM unified_ccsr uc
    JOIN unified_categories u ON u.id = uc.unified_id),
  cats AS (SELECT DISTINCT substr(code_norm, 1, 3) AS cat FROM ref_ccsr
    WHERE ccsr_category IN (SELECT ccsr_category FROM groups)),
  hits AS (SELECT c.code_norm AS code, length(r.code_norm) AS len, r.ccsr_category AS grp
    FROM cats JOIN ref_codes c
      ON c.code_system = 'icd10cm' AND c.code_norm >= cats.cat AND c.code_norm < cats.cat || '~'
    JOIN ref_ccsr r ON r.code_norm IN (substr(c.code_norm, 1, 3), substr(c.code_norm, 1, 4),
      substr(c.code_norm, 1, 5), substr(c.code_norm, 1, 6), substr(c.code_norm, 1, 7))
    WHERE c.billable = 1 AND c.valid_to IS NULL),
  best AS (SELECT code, max(len) AS len FROM hits GROUP BY code)
SELECT DISTINCT g.slug AS slug, h.code AS code FROM hits h
  JOIN best b ON b.code = h.code AND b.len = h.len
  JOIN groups g ON g.ccsr_category = h.grp
  ORDER BY g.slug, h.code`

/** Entries in the full non-ICD list that union-basis categories take a share of. */
const NON_ICD_LIST = 60

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
  const { from, perState } = parseArgs(process.argv.slice(2))
  const envFile = join(apiDir, '.env.cloudflare')
  if (!process.env['CLOUDFLARE_API_TOKEN'] && existsSync(envFile)) process.loadEnvFile(envFile)

  const now = new Date().toISOString()
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

  const unified = query(
    from,
    'SELECT id, slug, federal_category FROM unified_categories ORDER BY sort_order, id',
  ).map((u) => ({
    id: Number(u['id']),
    slug: String(u['slug']),
    federal_category: String(u['federal_category']),
  }))
  const slugOf = new Map(unified.map((u) => [u.id, u.slug]))

  // Synthetic lists for every state without a list, from the real lists' code patterns.
  assertIdsBelow('source_documents', docs, SYNTHETIC_IDS.source)
  assertIdsBelow('dataset_versions', versions, SYNTHETIC_IDS.version)
  assertIdsBelow('entries', sample, SYNTHETIC_IDS.entry)
  assertIdsBelow('category_mappings', catMaps, SYNTHETIC_IDS.categoryMapping)
  assertIdsBelow('unified_mappings', uniMaps, SYNTHETIC_IDS.unifiedMapping)
  const universe = new Map<string, string[]>()
  for (const r of query(from, UNIVERSE_SQL)) {
    const slug = String(r['slug'])
    universe.set(slug, [...(universe.get(slug) ?? []), String(r['code'])])
  }
  const pool: PoolEntry[] = all.map((e) => ({
    code_system: e.code_system,
    raw_code: text(e['raw_code']),
    code_norm: e.code_norm,
    match_kind: text(e['match_kind']),
    range_end_norm: typeof e['range_end_norm'] === 'string' ? e['range_end_norm'] : null,
    includes_children: typeof e['includes_children'] === 'number' ? e['includes_children'] : null,
  }))
  const ctx = {
    categories: unified,
    candidates: buildCandidates(withCategoryCodes(pool), universe),
    universeSize: new Map([...universe].map(([k, v]) => [k, v.length])),
    nonIcd: mixSystems(dedupePool(pool.filter((e) => e.code_system !== 'icd10cm')), NON_ICD_LIST),
    actor: SEED_ACTOR,
  }
  const listed = new Set(states.map((s) => s.id))
  const others = (query(from, 'SELECT id FROM states ORDER BY id') as { id: string }[])
    .map((s) => s.id)
    .filter((id) => !listed.has(id))
  const statusOf = assignStatuses(others)
  const synthetic = others
    .filter((id) => statusOf.get(id) === 'published')
    .map((id, i) => ({ id, ...syntheticState(id, i, ctx) }))
  const syntheticStates = others.flatMap((id) => {
    const status = statusOf.get(id) ?? 'none'
    if (status === 'none') return []
    const s = synthetic.find((x) => x.id === id)
    return [
      {
        id,
        status,
        published_version_id: s ? Number(s.version['id']) : null,
        updated_at: s ? String(s.version['published_at']) : now,
      },
    ]
  })
  const syntheticEntries = synthetic.flatMap((s) => s.entries)

  const countOf = new Map<number, number>()
  for (const e of sample) countOf.set(e.version_id, (countOf.get(e.version_id) ?? 0) + 1)
  const lines = [
    `-- Seed data for preview and local development (docs/deployment.md, "Preview data").`,
    `-- Written by scripts/make-seed.ts from ${from} on ${now.slice(0, 10)}: up to ${String(perState)} entries`,
    `-- per published state list (real, state-published rows), their sources and mappings, and a`,
    `-- synthetic list for ${String(synthetic.length)} other states (real code patterns, no text; ids from`,
    `-- ${String(SYNTHETIC_IDS.version)} and ${String(SYNTHETIC_IDS.entry)}). Admin identities are replaced by ${SEED_ACTOR}.`,
    `-- No reference data. Do not edit by hand.`,
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
    ...synthetic.map((x) => insertSql('source_documents', x.source)),
    ...synthetic.map((x) => insertSql('dataset_versions', x.version)),
    ...synthetic.map((x) =>
      insertSql('version_sources', {
        version_id: x.version['id'],
        source_document_id: x.source['id'],
      }),
    ),
    ...insertRowsSql('entries', syntheticEntries, 100),
    ...synthetic.flatMap((x) => x.categoryMappings.map((m) => insertSql('category_mappings', m))),
    ...synthetic.flatMap((x) => x.unifiedMappings.map((m) => mappingSql(m, slugOf))),
    // The starter categories (migration 0011), published so every public page has content.
    "UPDATE unified_categories SET status = 'published', updated_by = 'seed@localhost' WHERE status = 'draft' AND created_by = 'migration 0011';",
    ...statesSql([...states, ...syntheticStates]),
    ...finishSql({ entries: sample.length + syntheticEntries.length }, now).map((s) =>
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
  const counts = synthetic.map((x) => x.entries.length).sort((a, b) => a - b)
  const bands = new Map<string, number>()
  for (const x of synthetic)
    for (const band of Object.values(x.bands)) bands.set(band, (bands.get(band) ?? 0) + 1)
  console.log(
    `Synthetic: ${String(synthetic.length)} published, ` +
      `${String(syntheticStates.length - synthetic.length)} announced, ` +
      `${String(others.length - syntheticStates.length)} none; ${String(syntheticEntries.length)} entries ` +
      `(min ${String(counts[0] ?? 0)}, median ${String(counts[Math.floor(counts.length / 2)] ?? 0)}, ` +
      `max ${String(counts.at(-1) ?? 0)}); target bands ` +
      `${[...bands].map(([b, n]) => `${b} ${String(n)}`).join(', ')}. ${String(Math.round(sql.length / 1024))} KB.`,
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
