// Turns reference rows into SQL chunk files for `wrangler d1 execute --file`. Each chunk ends by
// marking itself loaded in app_meta, so a load interrupted by D1's daily write limit resumes
// where it stopped (src/cli.ts, `load`). INSERT OR IGNORE: rows already present cost no write.

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

export function chunkMarkerKey(name: string): string {
  return `ref_codes_chunk:${name}`
}

export function toSqlChunks(rows: readonly RefCodeRow[], options: ChunkOptions): SqlChunk[] {
  const rowsPerChunk = options.rowsPerChunk ?? 5_000
  const rowsPerStatement = options.rowsPerStatement ?? 100
  const chunks: SqlChunk[] = []
  for (let start = 0; start < rows.length; start += rowsPerChunk) {
    const slice = rows.slice(start, start + rowsPerChunk)
    const name = `${options.release}-${String(chunks.length).padStart(3, '0')}`
    const statements: string[] = []
    for (let i = 0; i < slice.length; i += rowsPerStatement) {
      const batch = slice.slice(i, i + rowsPerStatement).map(values)
      statements.push(`INSERT OR IGNORE INTO ref_codes (${COLUMNS}) VALUES\n${batch.join(',\n')};`)
    }
    statements.push(
      `INSERT OR REPLACE INTO app_meta (key, value) VALUES (${literal(chunkMarkerKey(name))}, '1');`,
    )
    chunks.push({ name, rowCount: slice.length, sql: `${statements.join('\n')}\n` })
  }
  return chunks
}
