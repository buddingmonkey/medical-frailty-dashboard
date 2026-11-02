// Turns reference rows into SQL chunk files for `wrangler d1 execute --file`. Each chunk ends by
// marking itself loaded in app_meta, so a load interrupted by D1's daily write limit resumes
// where it stopped (src/cli.ts, `load`). INSERT OR IGNORE: rows already present cost no write.

import type { CcsrCategoryRow, RefCcsrRow } from './ccsr.ts'

export interface RefCodeRow {
  codeSystem: 'icd10cm' | 'hcpcs'
  codeNorm: string
  description: string
  parentNorm: string | null
  chapter: string | null
  /** ICD-10-CM: 1 = valid for billing, 0 = header (category or subcategory). HCPCS: null. */
  billable: 0 | 1 | null
  validFrom: string
  validTo: string | null
}

export interface SqlChunk {
  name: string
  rowCount: number
  sql: string
}

export interface ChunkOptions {
  /** Names the chunks, e.g. `icd10cm-fy2027` → `icd10cm-fy2027-000`. */
  release: string
  rowsPerChunk?: number
  /** D1 caps one statement at 100 KB; 100 rows of the longest descriptions stay well under. */
  rowsPerStatement?: number
}

const COLUMNS =
  'code_system, code_norm, description, parent_norm, chapter, billable, valid_from, valid_to'

function literal(value: string | number | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

function values(row: RefCodeRow): string {
  return `(${[
    row.codeSystem,
    row.codeNorm,
    row.description,
    row.parentNorm,
    row.chapter,
    row.billable,
    row.validFrom,
    row.validTo,
  ]
    .map(literal)
    .join(', ')})`
}

/** Every reference chunk (CMS and CCSR) uses this prefix, so markers already loaded stay valid. */
export function chunkMarkerKey(name: string): string {
  return `ref_codes_chunk:${name}`
}

interface TableChunkOptions<T> {
  release: string
  table: string
  columns: string
  values: (row: T) => string
  rowsPerChunk: number
  rowsPerStatement: number
  /** The first chunk's number, so several tables can share one numbered chunk set. */
  firstIndex: number
}

function tableChunks<T>(rows: readonly T[], options: TableChunkOptions<T>): SqlChunk[] {
  const chunks: SqlChunk[] = []
  for (let start = 0; start < rows.length; start += options.rowsPerChunk) {
    const slice = rows.slice(start, start + options.rowsPerChunk)
    const index = options.firstIndex + chunks.length
    const name = `${options.release}-${String(index).padStart(3, '0')}`
    const statements: string[] = []
    for (let i = 0; i < slice.length; i += options.rowsPerStatement) {
      const batch = slice.slice(i, i + options.rowsPerStatement).map(options.values)
      statements.push(
        `INSERT OR IGNORE INTO ${options.table} (${options.columns}) VALUES\n${batch.join(',\n')};`,
      )
    }
    statements.push(
      `INSERT OR REPLACE INTO app_meta (key, value) VALUES (${literal(chunkMarkerKey(name))}, '1');`,
    )
    chunks.push({ name, rowCount: slice.length, sql: `${statements.join('\n')}\n` })
  }
  return chunks
}

export function toSqlChunks(rows: readonly RefCodeRow[], options: ChunkOptions): SqlChunk[] {
  return tableChunks(rows, {
    release: options.release,
    table: 'ref_codes',
    columns: COLUMNS,
    values,
    rowsPerChunk: options.rowsPerChunk ?? 5_000,
    rowsPerStatement: options.rowsPerStatement ?? 100,
    firstIndex: 0,
  })
}

/**
 * The CCSR release as one chunk set: the category names first (`<release>-000`), then the
 * `ref_ccsr` rows. A partial load therefore always has the names of the groups it loaded.
 */
export function toCcsrSqlChunks(
  categories: readonly CcsrCategoryRow[],
  rows: readonly RefCcsrRow[],
  options: ChunkOptions,
): SqlChunk[] {
  const rowsPerChunk = options.rowsPerChunk ?? 5_000
  const rowsPerStatement = options.rowsPerStatement ?? 100
  const names = tableChunks(categories, {
    release: options.release,
    table: 'ref_ccsr_categories',
    columns: 'ccsr_category, description, body_system, release',
    values: (c) =>
      `(${[c.ccsrCategory, c.description, c.bodySystem, c.release].map(literal).join(', ')})`,
    rowsPerChunk,
    rowsPerStatement,
    firstIndex: 0,
  })
  const codes = tableChunks(rows, {
    release: options.release,
    table: 'ref_ccsr',
    columns: 'code_norm, ccsr_category, is_default, release',
    values: (r) =>
      `(${[r.codeNorm, r.ccsrCategory, r.isDefault, r.release].map(literal).join(', ')})`,
    rowsPerChunk,
    rowsPerStatement,
    firstIndex: names.length,
  })
  return [...names, ...codes]
}

/** Rows one `load` may write: no limit locally; remote loads stop at `--max-rows` (the free
 * tier's daily D1 write limit is 100,000 rows). */
export function loadBudget(local: boolean, maxRows: string): number {
  if (local) return Infinity
  const budget = Number(maxRows)
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error('--max-rows must be a positive number.')
  }
  return budget
}
