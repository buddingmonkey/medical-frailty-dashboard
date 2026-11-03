import { BACKUP_NOTES, BACKUP_TABLES, type BackupTable, FULL_BACKUP_FORMAT } from '@mfcd/shared'
import { type Column, getTableColumns, getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { Zip, ZipDeflate } from 'fflate'

import * as schema from './schema'

// The full backup (docs/deployment.md, "Backups and restore"): every state-data table as one
// JSON document, written table by table in pages, so neither the Worker nor the caller ever
// holds more than one page. Used by `GET /api/admin/backup` (a Response stream) and, from M7
// step 2, the weekly cron (src/maintenance, buffered then one R2 put): both pass their own `write`.

/** Rows per query. Keyset on rowid, one bound parameter, so D1's 100-parameter limit is far. */
export const DUMP_PAGE_ROWS = 500
/** Text buffered before each `write`, so the sink sees a few large chunks, not one per row. */
const FLUSH_CHARS = 64 * 1024

/** SQL column name → the camelCase key drizzle selects use, per table (format 1 rows match). */
const columnKeys: Record<string, [sqlName: string, key: string][]> = Object.fromEntries(
  Object.values(schema)
    .flatMap((t) => (is(t, SQLiteTable) ? [t] : []))
    .map((t) => [
      getTableName(t),
      Object.entries<Column>(getTableColumns(t)).map(([key, col]) => [col.name, key]),
    ]),
)

export interface DumpStats {
  /** Rows written per table. */
  tables: Partial<Record<BackupTable, number>>
  rows: number
  /** D1's own count (`meta.rows_read`), summed over every query. */
  rowsRead: number
  queries: number
  /** Characters of JSON written (bytes, for this ASCII-heavy text, within a few percent). */
  chars: number
}

export interface DumpMeta {
  environment: string
  writtenAt: string
}

export interface DumpOptions {
  pageRows?: number
  /**
   * Keep `source_documents.r2_key`. False for the download: the R2 key never leaves the Worker
   * (docs/security.md, "Upload safety"). The weekly dump (M7 step 2) stays in R2 and may keep
   * it, so a rebuilt database (restore path 3) still finds each source file.
   */
  storageKeys?: boolean
}

/**
 * Writes the full backup (format 2) to `write`, in order, awaiting each chunk (backpressure).
 * The last key is `"complete": true`, so a file cut off half way never parses as a backup.
 */
export async function writeFullBackup(
  d1: D1Database,
  meta: DumpMeta,
  write: (chunk: string) => Promise<void>,
  { pageRows = DUMP_PAGE_ROWS, storageKeys = false }: DumpOptions = {},
): Promise<DumpStats> {
  const stats: DumpStats = { tables: {}, rows: 0, rowsRead: 0, queries: 0, chars: 0 }
  let buffer = ''
  const out = async (text: string, force = false) => {
    buffer += text
    if (buffer.length >= FLUSH_CHARS || (force && buffer.length > 0)) {
      stats.chars += buffer.length
      const chunk = buffer
      buffer = ''
      await write(chunk)
    }
  }
  const first = async <T>(query: string): Promise<T | null> => {
    stats.queries++
    try {
      const result = await d1.prepare(query).all<T>()
      stats.rowsRead += result.meta.rows_read
      return result.results[0] ?? null
    } catch {
      return null
    }
  }

  const migration = await first<{ name: string }>(
    'SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1',
  )
  const dataVersion = await first<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = 'data_version'",
  )
  const head = {
    format: FULL_BACKUP_FORMAT,
    writtenAt: meta.writtenAt,
    environment: meta.environment,
    migration: migration?.name ?? null,
    dataVersion: dataVersion ? Number(dataVersion.value) : null,
    notes: BACKUP_NOTES,
  }
  // The head without its closing brace, then the tables.
  await out(`${JSON.stringify(head).slice(0, -1)},"tables":{`)

  for (const [t, table] of BACKUP_TABLES.entries()) {
    const all = columnKeys[table]
    if (!all) throw new Error(`backup: no schema for table ${table}`)
    const keys =
      table === 'source_documents' && !storageKeys ? all.filter(([name]) => name !== 'r2_key') : all
    await out(`${t === 0 ? '' : ','}${JSON.stringify(table)}:[`)
    let cursor = 0
    let count = 0
    for (;;) {
      stats.queries++
      const page = await d1
        .prepare(
          `SELECT rowid AS __rowid, * FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ?`,
        )
        .bind(cursor, pageRows)
        .all()
      stats.rowsRead += page.meta.rows_read
      for (const row of page.results) {
        const obj: Record<string, unknown> = {}
        for (const [sqlName, key] of keys) obj[key] = row[sqlName] ?? null
        await out(`${count === 0 ? '' : ','}${JSON.stringify(obj)}`)
        count++
      }
      const last = page.results.at(-1)
      if (!last || page.results.length < pageRows) break
      cursor = Number(last['__rowid'])
    }
    stats.tables[table] = count
    stats.rows += count
    await out(']')
  }
  await out('},"complete":true}', true)
  return stats
}

/** `frailty-backup-<env>-<UTC timestamp>` (no extension), e.g. `…-preview-20261103T120000Z`. */
export function backupBaseName(environment: string, writtenAt: string): string {
  const env = environment.toLowerCase().replaceAll(/[^a-z0-9-]/g, '') || 'unknown'
  const stamp = writtenAt
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z')
  return `frailty-backup-${env}-${stamp}`
}

export interface ZipWriter {
  /** Deflates `text` into the zip's one entry and passes the compressed bytes on. */
  write: (text: string) => Promise<void>
  /** Finishes the entry and the zip's central directory. */
  end: () => Promise<void>
  /** Compressed bytes passed on so far. */
  readonly bytes: number
}

/**
 * A zip with one deflated entry, written as a stream (fflate): `sink` gets each compressed
 * chunk as it is made and is awaited, so the zip is never held whole.
 */
export function createZipWriter(
  entryName: string,
  sink: (bytes: Uint8Array) => Promise<void>,
): ZipWriter {
  const pending: Uint8Array[] = []
  let failure: Error | null = null
  let bytes = 0
  const zip = new Zip((err, data) => {
    if (err) failure = err
    else pending.push(data)
  })
  const entry = new ZipDeflate(entryName, { level: 6 })
  zip.add(entry)
  const encoder = new TextEncoder()
  const flush = async () => {
    if (failure) throw failure
    for (let chunk = pending.shift(); chunk; chunk = pending.shift()) {
      bytes += chunk.byteLength
      await sink(chunk)
    }
  }
  return {
    write: async (text) => {
      entry.push(encoder.encode(text))
      await flush()
    },
    end: async () => {
      entry.push(new Uint8Array(0), true)
      zip.end()
      await flush()
    },
    get bytes() {
      return bytes
    },
  }
}
