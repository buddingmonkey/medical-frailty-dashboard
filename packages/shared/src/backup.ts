// Backups (docs/deployment.md, "Backups and restore"). Two formats, one reader:
// - format 1: one version of one state, written to R2 before every publish replaces it
//   (apps/api/src/db/backup.ts), a bare `.json` file;
// - format 2: every state-data table, downloaded by an admin (`GET /api/admin/backup`) as a
//   `.zip` holding one `.json` file.
// Restore path 2 reads either one in the browser, lets the admin pick one state and one version,
// and sends that version's entries to a new draft through the normal draft API. Nothing here
// writes published rows.
import { Unzip, UnzipInflate } from 'fflate'
import { z } from 'zod'

import {
  type DraftEntry,
  draftEntrySchema,
  entryAttributesSchema,
  validateDraftEntry,
} from './drafts'
import { federalCategories, mappingMethods } from './enums'
import { MAX_ROWS } from './ingest'
import { sourceFileTypeSchema, fileTypeFromName, type SourceFileType } from './sources'

/** The full download's format number. Format 1 is the per-publish R2 backup. */
export const FULL_BACKUP_FORMAT = 2

/**
 * Largest backup file an admin may pick (the `.zip` or bare `.json`), and the largest JSON a
 * zip may inflate to. The 51-state seed (12,153 entries) is 5.4 MB of JSON and a 237 kB zip
 * (docs/deployment.md); entries are ~450 bytes each, so 50 MB is ~110,000 entries across every
 * version kept, and a 50 MB string still parses in a browser tab without trouble. Past that,
 * raise it or use restore path 3.
 */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024

/** Most entries one restored version may hold: the draft API's own ceiling per part. */
export const MAX_RESTORE_ENTRIES = MAX_ROWS * 4

/** The state-data tables a full backup holds, in the order it writes them (parents first). */
export const BACKUP_TABLES = [
  'app_meta',
  'states',
  'source_documents',
  'column_profiles',
  'dataset_versions',
  'version_sources',
  'draft_parts',
  'entries',
  'category_mappings',
  'chapter_mappings',
  'unified_categories',
  'unified_ccsr',
  'unified_mappings',
  'condition_groups',
  'condition_members',
  'watch_items',
  'audit_log',
] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

/**
 * Tables a full backup leaves out, and why (also written into the file's `notes`). Anything
 * else in the database (wrangler's `d1_migrations`, SQLite and FTS5 internals) is not ours.
 */
export const BACKUP_EXCLUDED_TABLES = {
  ref_codes:
    'reference: reload from the pinned CMS files (pnpm db:ref:local, Reference data workflow)',
  ref_ccsr: 'reference: reload from the pinned AHRQ CCSR file',
  ref_ccsr_categories: 'reference: reload from the pinned AHRQ CCSR file',
  entry_unified: 'derived: Rebuild coverage recreates it',
  unified_universe: 'derived: Rebuild coverage recreates it',
  state_similarity: 'derived: Rebuild coverage recreates it',
  entries_fts: "search index: rebuild with INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')",
  ref_codes_fts: 'search index: recreate from migration 0012 and run its backfill INSERT',
} as const

export const BACKUP_NOTES: readonly string[] = [
  'State-data tables only. Left out: ' +
    Object.entries(BACKUP_EXCLUDED_TABLES)
      .map(([table, why]) => `${table} (${why})`)
      .join('; ') +
    '.',
  'source_documents holds each file’s metadata and SHA-256, not the file (nor its R2 key). The files stay in R2.',
  'audit_log holds admin email addresses (Access identities). Keep this file private.',
  'Restore one state: /admin/restore (a new draft, then checks and publish). Whole database: docs/deployment.md, "Backups and restore".',
]

/** `source_documents.r2_key` of a source restored from a backup: no file exists for it. */
export const RESTORED_SOURCE_KEY_PREFIX = 'restored/'

/** A source's `r2Key` says the file was not restored with it. */
export const isRestoredSourceKey = (r2Key: string) => r2Key.startsWith(RESTORED_SOURCE_KEY_PREFIX)

/** Part name for entries a backup stores without one (lists from before parts existed). */
export const RESTORED_PART = 'Restored from backup'

// ---------------------------------------------------------------------------------------------
// File schemas. Loose on purpose: a backup from an older schema must still read, and one bad
// row must not hide the other states. Each entry is checked strictly when it becomes a draft
// entry (`restorePlan`).

const int = z.number().int()
const nullableText = z.string().nullable().default(null)
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)

export const backupVersionRowSchema = z.looseObject({
  id: int,
  stateId: z.string(),
  versionNo: int,
  status: z.string(),
  label: nullableText,
  effectiveDate: nullableText,
  statePublishedDate: nullableText,
  publishedAt: nullableText,
  createdAt: z.string().optional(),
  rowCount: int.optional(),
})
export type BackupVersionRow = z.infer<typeof backupVersionRowSchema>

export const backupSourceRowSchema = z.looseObject({
  id: int,
  stateId: z.string().optional(),
  title: z.string(),
  url: nullableText,
  publisherDate: nullableText,
  sha256,
  fileType: z.string().optional(),
  byteSize: int.optional(),
})
export type BackupSourceRow = z.infer<typeof backupSourceRowSchema>

export const backupPartRowSchema = z.looseObject({
  versionId: int.optional(),
  sourceDocumentId: int,
  part: z.string(),
  expectedEntries: int,
  invalidRowCount: int.default(0),
  namedStateIdsJson: z.string().default('[]'),
})
export type BackupPartRow = z.infer<typeof backupPartRowSchema>

export const backupEntryRowSchema = z.looseObject({
  id: int,
  versionId: int,
  codeSystem: z.string(),
  rawCode: z.string(),
  codeNorm: z.string(),
  matchKind: z.string(),
  rangeEndNorm: nullableText,
  includesChildren: int.nullable().default(null),
  descriptionPublished: nullableText,
  stateCategory: z.string(),
  stateSubcategory: z.string().default(''),
  tier: nullableText,
  attributesJson: nullableText,
  qualification: z.string().default('unknown'),
  qualificationBasis: z.string().default('published'),
  sourceDocumentId: int,
  sourceLocator: nullableText,
  sourcePart: z.string().default(''),
})
export type BackupEntryRow = z.infer<typeof backupEntryRowSchema>

/** Format 1: `backups/<state>/<version id>.json` in R2. */
export const versionBackupSchema = z.object({
  format: z.literal(1),
  writtenAt: z.string(),
  version: backupVersionRowSchema,
  sources: z.array(backupSourceRowSchema),
  parts: z.array(backupPartRowSchema).default([]),
  entries: z.array(backupEntryRowSchema),
})
export type VersionBackup = z.infer<typeof versionBackupSchema>

// The mapping rows a full backup can put back for one state (only when the admin asks).
export const backupCategoryMappingSchema = z.object({
  stateId: z.string(),
  stateCategory: z.string().max(200),
  stateSubcategory: z.string().max(200).default(''),
  federalCategory: z.enum(federalCategories),
  method: z.enum(mappingMethods),
  confidence: z.number().min(0).max(1).nullable().default(null),
  mappedBy: z.string().max(320).nullable().default(null),
  mappedAt: z.string().max(40),
})
export type BackupCategoryMapping = z.infer<typeof backupCategoryMappingSchema>

export const backupChapterMappingSchema = z.object({
  stateId: z.string(),
  chapter: int.min(1).max(22),
  federalCategory: z.enum(federalCategories),
  mappedBy: z.string().max(320),
  mappedAt: z.string().max(40),
})
export type BackupChapterMapping = z.infer<typeof backupChapterMappingSchema>

export const backupColumnProfileSchema = z.object({
  stateId: z.string(),
  headerKey: z.string().max(4000),
  profileJson: z.string().max(100_000),
  updatedBy: z.string().max(320),
  updatedAt: z.string().max(40),
})
export type BackupColumnProfile = z.infer<typeof backupColumnProfileSchema>

const anyRow = z.record(z.string(), z.unknown())

/** Format 2: the full download. `complete` is written last, so a cut-off file never parses. */
export const fullBackupSchema = z.object({
  format: z.literal(FULL_BACKUP_FORMAT),
  writtenAt: z.string(),
  environment: z.string(),
  /** Name of the last applied D1 migration, e.g. `0014_condition_groups_seed`. */
  migration: z.string().nullable(),
  dataVersion: z.number().nullable(),
  notes: z.array(z.string()),
  tables: z.object({
    app_meta: z.array(anyRow),
    states: z.array(z.looseObject({ id: z.string(), name: z.string() })),
    source_documents: z.array(backupSourceRowSchema),
    column_profiles: z.array(backupColumnProfileSchema.loose()),
    dataset_versions: z.array(backupVersionRowSchema),
    version_sources: z.array(z.looseObject({ versionId: int, sourceDocumentId: int })),
    draft_parts: z.array(backupPartRowSchema.extend({ versionId: int })),
    entries: z.array(backupEntryRowSchema),
    category_mappings: z.array(backupCategoryMappingSchema.loose()),
    chapter_mappings: z.array(backupChapterMappingSchema.loose()),
    unified_categories: z.array(anyRow),
    unified_ccsr: z.array(anyRow),
    unified_mappings: z.array(anyRow),
    condition_groups: z.array(anyRow),
    condition_members: z.array(anyRow),
    watch_items: z.array(anyRow),
    audit_log: z.array(anyRow),
  }),
  complete: z.literal(true),
})
export type FullBackup = z.infer<typeof fullBackupSchema>

// ---------------------------------------------------------------------------------------------
// Reading a file

export class BackupError extends Error {
  override name = 'BackupError'
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
/** Compressed bytes per push: one push can inflate to at most ~1,000 times this. */
const UNZIP_SLICE = 16 * 1024

/** A zip entry name we accept: one plain `.json` file at the top level. */
function isPlainJsonName(name: string): boolean {
  return (
    name.toLowerCase().endsWith('.json') &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..') &&
    name.length <= 200
  )
}

/**
 * The JSON text of a backup file: a bare `.json`, or a `.zip` that holds exactly one `.json`
 * entry. Refuses a file over `limit` bytes, and stops inflating a zip as soon as its JSON passes
 * `limit` (declared or actual size), so a zip bomb cannot fill the tab's memory.
 */
export function readBackupBytes(bytes: Uint8Array, limit = MAX_BACKUP_BYTES): string {
  if (bytes.byteLength === 0) throw new BackupError('The file is empty.')
  if (bytes.byteLength > limit) {
    throw new BackupError(`The file is larger than ${formatMb(limit)}.`)
  }
  const isZip = ZIP_MAGIC.every((b, i) => bytes[i] === b)
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
  if (!isZip) {
    try {
      return decoder.decode(bytes)
    } catch {
      throw new BackupError('The file is neither a zip nor UTF-8 JSON.')
    }
  }

  const chunks: Uint8Array[] = []
  let total = 0
  let files = 0
  // An object, so TypeScript does not narrow it to null across the callbacks.
  const state: { problem: string | null; done: boolean } = { problem: null, done: false }
  const unzip = new Unzip((file) => {
    files++
    if (state.problem) return
    if (files > 1) {
      state.problem = 'The zip must hold exactly one .json file; it holds more.'
      return
    }
    if (!isPlainJsonName(file.name)) {
      state.problem = `The zip holds “${file.name.slice(0, 80)}”; expected one .json file at the top level.`
      return
    }
    if (file.compression !== 0 && file.compression !== 8) {
      state.problem = 'The zip uses a compression method this site does not read.'
      return
    }
    if (file.originalSize !== undefined && file.originalSize > limit) {
      state.problem = `The backup inside the zip is larger than ${formatMb(limit)}.`
      return
    }
    file.ondata = (err, chunk, final) => {
      if (state.problem) return
      if (err) {
        state.problem = 'The zip is damaged.'
        return
      }
      total += chunk.byteLength
      if (total > limit) {
        state.problem = `The backup inside the zip is larger than ${formatMb(limit)}.`
        file.terminate()
        return
      }
      chunks.push(chunk)
      if (final) state.done = true
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  try {
    for (let at = 0; at < bytes.byteLength && !state.problem; at += UNZIP_SLICE) {
      const end = Math.min(at + UNZIP_SLICE, bytes.byteLength)
      unzip.push(bytes.subarray(at, end), end === bytes.byteLength)
    }
  } catch {
    state.problem ??= 'The zip is damaged.'
  }
  if (state.problem) throw new BackupError(state.problem)
  if (files === 0 || !state.done) throw new BackupError('The zip holds no complete .json file.')

  const json = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    json.set(c, offset)
    offset += c.byteLength
  }
  try {
    return decoder.decode(json)
  } catch {
    throw new BackupError('The file inside the zip is not UTF-8 text.')
  }
}

const formatMb = (bytes: number) => `${String(Math.round(bytes / 1024 / 1024))} MB`

// ---------------------------------------------------------------------------------------------
// One shape for both formats

export interface BackupMappings {
  categoryMappings: BackupCategoryMapping[]
  chapterMappings: BackupChapterMapping[]
  columnProfiles: BackupColumnProfile[]
}

export interface BackupVersion {
  version: BackupVersionRow
  sources: BackupSourceRow[]
  parts: BackupPartRow[]
  entries: BackupEntryRow[]
}

export interface BackupBundle {
  format: 1 | 2
  writtenAt: string
  /** Null for format 1 (it does not say). */
  environment: string | null
  migration: string | null
  /** State id → name; format 1 knows only the id. */
  stateNames: Record<string, string>
  /** Newest version first within each state; states in id order. */
  versions: BackupVersion[]
  /** Per state. Null for format 1, which holds no mappings. */
  mappings: Record<string, BackupMappings> | null
}

/** Reads a backup's JSON text into one shape, or throws a `BackupError` with a clear message. */
export function parseBackup(text: string): BackupBundle {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('The file is not valid JSON (it may have been cut off).')
  }
  const head = z.object({ format: z.unknown() }).safeParse(raw)
  if (!head.success) throw new BackupError('The file is not a backup from this site.')
  const { format } = head.data
  if (format === 1) return fromVersionBackup(raw)
  if (format === FULL_BACKUP_FORMAT) return fromFullBackup(raw)
  throw new BackupError(
    `Unknown backup format ${format === undefined ? 'none' : JSON.stringify(format).slice(0, 20)}; this site reads formats 1 and 2.`,
  )
}

function issuesOf(error: z.ZodError): string {
  const first = error.issues[0]
  return first ? `${first.path.join('.') || '(top)'}: ${first.message}` : 'unreadable'
}

function fromVersionBackup(raw: unknown): BackupBundle {
  const parsed = versionBackupSchema.safeParse(raw)
  if (!parsed.success) {
    throw new BackupError(`This format 1 backup does not read (${issuesOf(parsed.error)}).`)
  }
  const { writtenAt, version, sources, parts, entries } = parsed.data
  return {
    format: 1,
    writtenAt,
    environment: null,
    migration: null,
    stateNames: { [version.stateId]: version.stateId },
    versions: [{ version, sources, parts, entries }],
    mappings: null,
  }
}

function fromFullBackup(raw: unknown): BackupBundle {
  const parsed = fullBackupSchema.safeParse(raw)
  if (!parsed.success) {
    throw new BackupError(`This full backup does not read (${issuesOf(parsed.error)}).`)
  }
  const { tables } = parsed.data
  const groupBy = <T>(rows: readonly T[], key: (row: T) => number | string) => {
    const map = new Map<number | string, T[]>()
    for (const row of rows) {
      const k = key(row)
      const list = map.get(k)
      if (list) list.push(row)
      else map.set(k, [row])
    }
    return map
  }
  const sourceById = new Map(tables.source_documents.map((s) => [s.id, s]))
  const links = groupBy(tables.version_sources, (l) => l.versionId)
  const parts = groupBy(tables.draft_parts, (p) => p.versionId)
  const entries = groupBy(tables.entries, (e) => e.versionId)

  const versions = [...tables.dataset_versions]
    .sort((a, b) => a.stateId.localeCompare(b.stateId) || b.versionNo - a.versionNo)
    .map((version) => {
      const versionEntries = entries.get(version.id) ?? []
      const sourceIds = new Set([
        ...(links.get(version.id) ?? []).map((l) => l.sourceDocumentId),
        ...versionEntries.map((e) => e.sourceDocumentId),
      ])
      return {
        version,
        sources: [...sourceIds].flatMap((id) => {
          const s = sourceById.get(id)
          return s ? [s] : []
        }),
        parts: parts.get(version.id) ?? [],
        entries: versionEntries,
      }
    })

  const mappings: Record<string, BackupMappings> = {}
  const forState = (id: string) =>
    (mappings[id] ??= { categoryMappings: [], chapterMappings: [], columnProfiles: [] })
  for (const s of tables.states) forState(s.id)
  for (const m of tables.category_mappings) forState(m.stateId).categoryMappings.push(m)
  for (const m of tables.chapter_mappings) forState(m.stateId).chapterMappings.push(m)
  for (const p of tables.column_profiles) forState(p.stateId).columnProfiles.push(p)

  return {
    format: FULL_BACKUP_FORMAT,
    writtenAt: parsed.data.writtenAt,
    environment: parsed.data.environment,
    migration: parsed.data.migration,
    stateNames: Object.fromEntries(tables.states.map((s) => [s.id, s.name])),
    versions,
    mappings,
  }
}

// ---------------------------------------------------------------------------------------------
// One version → a draft

export interface RestorePart {
  /** The source's id in the backup; the restore maps it to a source on this site. */
  backupSourceId: number
  part: string
  invalidRowCount: number
  namedStateIds: string[]
  entries: DraftEntry[]
}

export interface RestorePlan {
  stateId: string
  versionNo: number
  sources: BackupSourceRow[]
  parts: RestorePart[]
  entryCount: number
  /** Entries that cannot become draft entries, as messages (at most 20). Empty when fine. */
  problems: string[]
}

const MAX_PROBLEMS = 20
const namedStates = z
  .array(z.string().regex(/^[A-Z]{2}$/))
  .max(60)
  .catch([])

/** An entry row as the draft API takes it (the inverse of the API's `entryRow`). */
export function toRestoredEntry(row: BackupEntryRow): unknown {
  let attributes: unknown = { included: true, flags: [] }
  if (row.attributesJson !== null) {
    try {
      const parsed = entryAttributesSchema.safeParse(JSON.parse(row.attributesJson))
      if (parsed.success) attributes = parsed.data
    } catch {
      // Unreadable attributes count as none, as the checks read them.
    }
  }
  return {
    codeSystem: row.codeSystem,
    rawCode: row.rawCode,
    codeNorm: row.codeNorm,
    matchKind: row.matchKind,
    rangeEndNorm: row.rangeEndNorm,
    includesChildren: row.includesChildren,
    descriptionPublished: row.descriptionPublished,
    stateCategory: row.stateCategory,
    stateSubcategory: row.stateSubcategory,
    tier: row.tier ?? '',
    qualification: row.qualification,
    qualificationBasis: row.qualificationBasis,
    sourceLocator: (row.sourceLocator ?? '').slice(0, 200),
    attributes,
  }
}

/** What restoring `version` sends: its entries grouped by source and part, each re-checked. */
export function restorePlan(version: BackupVersion): RestorePlan {
  const problems: string[] = []
  const note = (message: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(message)
  }
  if (version.entries.length > MAX_RESTORE_ENTRIES) {
    note(`This version has more than ${String(MAX_RESTORE_ENTRIES)} entries.`)
  }
  const sourceIds = new Set(version.sources.map((s) => s.id))
  const partRow = new Map(version.parts.map((p) => [`${String(p.sourceDocumentId)}|${p.part}`, p]))
  const parts = new Map<string, RestorePart>()
  for (const [index, row] of version.entries.entries()) {
    if (!sourceIds.has(row.sourceDocumentId)) {
      note(`Entry ${String(index + 1)} cites a source the backup does not hold.`)
      continue
    }
    const parsed = draftEntrySchema.safeParse(toRestoredEntry(row))
    if (!parsed.success) {
      note(`Entry ${String(index + 1)} (“${row.rawCode.slice(0, 40)}”): ${issuesOf(parsed.error)}`)
      continue
    }
    const problem = validateDraftEntry(parsed.data)
    if (problem) {
      note(`Entry ${String(index + 1)}: ${problem}`)
      continue
    }
    const key = `${String(row.sourceDocumentId)}|${row.sourcePart}`
    let part = parts.get(key)
    if (!part) {
      const stored = partRow.get(key)
      part = {
        backupSourceId: row.sourceDocumentId,
        part: row.sourcePart.trim() === '' ? RESTORED_PART : row.sourcePart.trim().slice(0, 200),
        invalidRowCount: Math.max(0, stored?.invalidRowCount ?? 0),
        namedStateIds: stored ? namedStates.parse(safeJson(stored.namedStateIdsJson)) : [],
        entries: [],
      }
      parts.set(key, part)
    }
    part.entries.push(parsed.data)
  }
  return {
    stateId: version.version.stateId,
    versionNo: version.version.versionNo,
    sources: version.sources,
    parts: [...parts.values()],
    entryCount: version.entries.length,
    problems,
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The file type for a restored source: the backup's, else a guess from its URL or title. */
export function restoredFileType(source: BackupSourceRow): SourceFileType {
  const known = sourceFileTypeSchema.safeParse(source.fileType)
  if (known.success) return known.data
  return fileTypeFromName(source.url ?? '') ?? fileTypeFromName(source.title) ?? 'pdf'
}

// ---------------------------------------------------------------------------------------------
// API bodies (`/api/admin/backup/*`)

const stateIdSchema = z.string().regex(/^[A-Z]{2}$/)

/**
 * Body of `POST /api/admin/backup/sources`: the source a restored version cites. The API
 * reuses the state's source with this SHA-256, or stores this metadata with no file.
 */
export const restoreSourceRequestSchema = z.object({
  stateId: stateIdSchema,
  title: z.string().trim().min(1).max(200),
  url: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable(),
  publisherDate: z.iso.date().nullable(),
  fileType: sourceFileTypeSchema,
  sha256,
  byteSize: z
    .number()
    .int()
    .min(0)
    .max(1024 * 1024 * 1024)
    .nullable(),
})
export type RestoreSourceRequest = z.infer<typeof restoreSourceRequestSchema>

export const restoreSourceResponseSchema = z.object({
  sourceDocumentId: int.positive(),
  /** True when the site already had this file (same state and SHA-256). */
  reused: z.boolean(),
})

/** Query of `GET /api/admin/backup/mappings`. */
export const restoreMappingsQuerySchema = z.object({ stateId: stateIdSchema })

const mappingRow = <T extends z.ZodObject>(schema: T) => z.array(schema).max(10_000)

/** `GET /api/admin/backup/mappings` and the body of `PUT /api/admin/backup/mappings/:stateId`. */
export const restoreMappingsSchema = z.object({
  categoryMappings: mappingRow(backupCategoryMappingSchema),
  chapterMappings: mappingRow(backupChapterMappingSchema),
  columnProfiles: mappingRow(backupColumnProfileSchema).max(500),
})
export type RestoreMappings = z.infer<typeof restoreMappingsSchema>

// ---------------------------------------------------------------------------------------------
// Mapping diff (shown before the admin ticks "restore mappings")

export interface MappingDiffLine {
  kind: 'added' | 'removed' | 'changed'
  what: string
  before: string | null
  after: string | null
}

/** What restoring the backup's mappings would change, compared with the current ones. */
export function diffMappings(current: RestoreMappings, backup: RestoreMappings): MappingDiffLine[] {
  const lines: MappingDiffLine[] = []
  const compare = <T>(
    label: string,
    a: readonly T[],
    b: readonly T[],
    key: (row: T) => string,
    value: (row: T) => string,
  ) => {
    const before = new Map(a.map((r) => [key(r), value(r)]))
    const after = new Map(b.map((r) => [key(r), value(r)]))
    for (const [k, v] of after) {
      const old = before.get(k)
      if (old === undefined)
        lines.push({ kind: 'added', what: `${label} ${k}`, before: null, after: v })
      else if (old !== v)
        lines.push({ kind: 'changed', what: `${label} ${k}`, before: old, after: v })
    }
    for (const [k, v] of before) {
      if (!after.has(k))
        lines.push({ kind: 'removed', what: `${label} ${k}`, before: v, after: null })
    }
  }
  compare(
    'Category',
    current.categoryMappings,
    backup.categoryMappings,
    (m) =>
      m.stateSubcategory ? `“${m.stateCategory} / ${m.stateSubcategory}”` : `“${m.stateCategory}”`,
    (m) => `${m.federalCategory} (${m.method})`,
  )
  compare(
    'Chapter',
    current.chapterMappings,
    backup.chapterMappings,
    (m) => String(m.chapter),
    (m) => m.federalCategory,
  )
  compare(
    'Column profile',
    current.columnProfiles,
    backup.columnProfiles,
    (p) => `“${p.headerKey.slice(0, 60)}”`,
    (p) => p.profileJson,
  )
  return lines
}
