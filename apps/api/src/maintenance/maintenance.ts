import {
  DRAFT_EXPIRY_DAYS,
  isRestoredSourceKey,
  KEEP_MANUAL_DUMPS,
  KEEP_PUBLISH_BACKUPS,
  KEEP_WEEKLY_DUMPS,
  LAST_MAINTENANCE_KEY,
  type MaintenancePart,
  type MaintenancePartResult,
  type MaintenanceRun,
  maintenanceParts,
  maintenanceRunSchema,
  publishBackupKey,
  WEEKLY_DUMP_MAX_BYTES,
  WEEKLY_DUMP_PREFIX,
  type WeeklyDump,
  weeklyDumpDate,
} from '@mfcd/shared'

import { auditInsert } from '../db/audit'
import { backupBaseName, createZipWriter, writeFullBackup } from '../db/backup-dump'
import { createDb, type Db } from '../db/client'
import { appMeta } from '../db/schema'

// Weekly maintenance (docs/deployment.md, "Backups and restore"). The Cron Trigger and
// `POST /api/admin/maintenance` both call `runMaintenance`. Each part has its own try/catch, so
// one failure never skips the rest; the result (counts and error messages only, never row
// data) goes to `app_meta.last_maintenance`.

export interface MaintenanceEnv {
  DB: D1Database
  FILES: R2Bucket
  ENVIRONMENT: string
}

export interface MaintenanceOptions {
  trigger: MaintenanceRun['trigger']
  /** Audit actor: the admin's Access email, or `maintenance (cron)`. */
  actor: string
  now?: Date
}

/** The audit actor of a scheduled run (there is no admin behind it). */
export const CRON_ACTOR = 'maintenance (cron)'

/**
 * Drafts handled per run. Each one costs about 8 D1 queries; with the dump's ~44 the run stays
 * far under the 1,000 queries per invocation of Workers Paid. What is left waits a week.
 */
const DRAFTS_PER_RUN = 20

type Counts = Record<string, number>

/** Every object under `prefix`, following R2's pages. */
async function listAll(
  files: R2Bucket,
  prefix: string,
  include: R2ListOptions['include'] = [],
): Promise<R2Object[]> {
  const out: R2Object[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await files.list({
      prefix,
      limit: 1000,
      include,
      ...(cursor ? { cursor } : {}),
    })
    out.push(...page.objects)
    if (!page.truncated) return out
    cursor = page.cursor
  }
}

/** R2 deletes at most 1000 keys per call. */
async function deleteKeys(files: R2Bucket, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) await files.delete(keys.slice(i, i + 1000))
}

/**
 * The full backup (the same zip as the admin download) plus R2 keys, at
 * `backups/weekly/<UTC date>.zip`, tagged with the run's trigger (custom metadata `trigger`) so
 * pruning keeps the cron's weekly dumps apart from manual ones. A manual run on the day of a
 * weekly dump replaces it but keeps the `cron` tag: it still stands for that week. The zip is buffered, then put in one call: R2 needs a known
 * length, real data zips to about 1 MB, and the cap stops a runaway well inside 128 MB.
 */
export async function writeWeeklyDump(
  env: MaintenanceEnv,
  now: Date,
  trigger: MaintenanceRun['trigger'] = 'cron',
): Promise<Counts> {
  const writtenAt = now.toISOString()
  const base = backupBaseName(env.ENVIRONMENT, writtenAt)
  const chunks: Uint8Array[] = []
  let total = 0
  const zip = createZipWriter(`${base}.json`, (bytes) => {
    total += bytes.byteLength
    if (total > WEEKLY_DUMP_MAX_BYTES) {
      return Promise.reject(
        new Error(`weekly dump is over ${String(WEEKLY_DUMP_MAX_BYTES)} bytes zipped`),
      )
    }
    chunks.push(bytes)
    return Promise.resolve()
  })
  const stats = await writeFullBackup(
    env.DB,
    { environment: env.ENVIRONMENT, writtenAt },
    zip.write,
    { storageKeys: true },
  )
  await zip.end()
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  const key = `${WEEKLY_DUMP_PREFIX}${writtenAt.slice(0, 10)}.zip`
  const replaced = trigger === 'manual' ? await env.FILES.head(key) : null
  const tag = replaced && dumpTrigger(replaced) === 'cron' ? 'cron' : trigger
  await env.FILES.put(key, body, {
    httpMetadata: { contentType: 'application/zip' },
    customMetadata: { writtenAt, file: `${base}.zip`, trigger: tag },
  })
  return {
    rows: stats.rows,
    rowsRead: stats.rowsRead,
    queries: stats.queries,
    jsonChars: stats.chars,
    zipBytes: zip.bytes,
  }
}

/** The weekly dumps in R2, newest first. */
export async function listWeeklyDumps(files: R2Bucket): Promise<WeeklyDump[]> {
  const objects = await listAll(files, WEEKLY_DUMP_PREFIX)
  return objects
    .flatMap((o) => {
      const date = weeklyDumpDate(o.key)
      return date ? [{ date, size: o.size, uploadedAt: o.uploaded.toISOString() }] : []
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** What made a dump: its `trigger` tag, and `cron` for a dump written before the tag. */
function dumpTrigger(object: R2Object): MaintenanceRun['trigger'] {
  return object.customMetadata?.['trigger'] === 'manual' ? 'manual' : 'cron'
}

/**
 * Keeps the newest KEEP_WEEKLY_DUMPS dumps the cron made and, apart from them, the newest
 * KEEP_MANUAL_DUMPS made by "Run maintenance now", so manual runs never push weekly dumps out.
 */
export async function pruneWeeklyDumps(files: R2Bucket): Promise<Counts> {
  const objects = await listAll(files, WEEKLY_DUMP_PREFIX, ['customMetadata'])
  const dumps = objects
    .flatMap((o) => {
      const date = weeklyDumpDate(o.key)
      return date ? [{ key: o.key, date, trigger: dumpTrigger(o) }] : []
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  const old = [
    ...dumps.filter((d) => d.trigger === 'cron').slice(KEEP_WEEKLY_DUMPS),
    ...dumps.filter((d) => d.trigger === 'manual').slice(KEEP_MANUAL_DUMPS),
  ]
  await deleteKeys(
    files,
    old.map((d) => d.key),
  )
  return { deleted: old.length, kept: dumps.length - old.length }
}

/** Keeps the newest per-publish backups of each state (by version id), with one audit row. */
export async function prunePublishBackups(db: Db, files: R2Bucket, actor: string): Promise<Counts> {
  const byState = new Map<string, { key: string; versionId: number }[]>()
  for (const object of await listAll(files, 'backups/')) {
    const parsed = publishBackupKey(object.key)
    if (!parsed) continue
    const list = byState.get(parsed.stateId) ?? []
    list.push({ key: object.key, versionId: parsed.versionId })
    byState.set(parsed.stateId, list)
  }
  const old: string[] = []
  let kept = 0
  for (const list of byState.values()) {
    list.sort((a, b) => b.versionId - a.versionId)
    old.push(...list.slice(KEEP_PUBLISH_BACKUPS).map((b) => b.key))
    kept += Math.min(list.length, KEEP_PUBLISH_BACKUPS)
  }
  await deleteKeys(files, old)
  const counts = { deleted: old.length, kept, states: byState.size }
  await auditInsert(db, {
    actorEmail: actor,
    action: 'backup.prune',
    target: 'backups',
    details: { ...counts, keepPerState: KEEP_PUBLISH_BACKUPS },
  })
  return counts
}

interface StaleVersion {
  id: number
  state_id: string
  version_no: number
  status: 'draft' | 'discarded'
}

/**
 * Open drafts idle for 30 days are deleted (row, entries, parts, sources cited); discarded ones
 * that old lose their entries and parts but keep their row. Published and superseded versions
 * are never selected. A source document goes too when nothing else cites it. One audit row per
 * draft (`draft.expire`) and per source (`source.expire`).
 */
export async function cleanupDrafts(
  d1: D1Database,
  files: R2Bucket,
  now: Date,
  actor: string,
): Promise<Counts> {
  const db = createDb(d1)
  const cutoff = new Date(now.getTime() - DRAFT_EXPIRY_DAYS * 86_400_000).toISOString()
  const counts = {
    draftsDeleted: 0,
    discardedEmptied: 0,
    entriesDeleted: 0,
    sourcesDeleted: 0,
    left: 0,
  }
  const { results } = await d1
    .prepare(
      `SELECT id, state_id, version_no, status FROM dataset_versions
       WHERE coalesce(updated_at, created_at) < ?1
         AND (status = 'draft'
           OR (status = 'discarded' AND (
             EXISTS (SELECT 1 FROM entries e WHERE e.version_id = dataset_versions.id)
             OR EXISTS (SELECT 1 FROM draft_parts p WHERE p.version_id = dataset_versions.id))))
       ORDER BY id LIMIT ?2`,
    )
    .bind(cutoff, DRAFTS_PER_RUN + 1)
    .all<StaleVersion>()
  counts.left = Math.max(0, results.length - DRAFTS_PER_RUN)

  const sourceCandidates = new Set<number>()
  for (const v of results.slice(0, DRAFTS_PER_RUN)) {
    const entryCount = await d1
      .prepare('SELECT count(*) AS n FROM entries WHERE version_id = ?')
      .bind(v.id)
      .first<{ n: number }>()
    const n = entryCount?.n ?? 0
    const cited = await d1
      .prepare(
        `SELECT source_document_id AS id FROM version_sources WHERE version_id = ?1
         UNION SELECT source_document_id FROM draft_parts WHERE version_id = ?1
         UNION SELECT source_document_id FROM entries WHERE version_id = ?1`,
      )
      .bind(v.id)
      .all<{ id: number }>()
    const remove = v.status === 'draft'
    // Every statement repeats the status guard, so a draft published meanwhile is left alone.
    const guard = `(SELECT status FROM dataset_versions WHERE id = ?1) = ?2`
    const statements = [
      d1.prepare(`DELETE FROM entries WHERE version_id = ?1 AND ${guard}`).bind(v.id, v.status),
      d1.prepare(`DELETE FROM draft_parts WHERE version_id = ?1 AND ${guard}`).bind(v.id, v.status),
    ]
    if (remove) {
      statements.push(
        d1
          .prepare(`DELETE FROM version_sources WHERE version_id = ?1 AND ${guard}`)
          .bind(v.id, v.status),
        d1
          .prepare('DELETE FROM dataset_versions WHERE id = ?1 AND status = ?2')
          .bind(v.id, v.status),
      )
    }
    await d1.batch(statements)
    await auditInsert(db, {
      actorEmail: actor,
      action: 'draft.expire',
      target: `version:${String(v.id)}`,
      details: {
        stateId: v.state_id,
        versionNo: v.version_no,
        entries: n,
        outcome: remove ? 'deleted' : 'emptied',
      },
    })
    counts.entriesDeleted += n
    if (remove) {
      counts.draftsDeleted++
      for (const row of cited.results) sourceCandidates.add(row.id)
    } else {
      counts.discardedEmptied++
    }
  }

  for (const id of sourceCandidates) {
    // One statement: cited again since (a new draft) means it is not deleted.
    const gone = await d1
      .prepare(
        `DELETE FROM source_documents WHERE id = ?1
           AND NOT EXISTS (SELECT 1 FROM version_sources WHERE source_document_id = ?1)
           AND NOT EXISTS (SELECT 1 FROM draft_parts WHERE source_document_id = ?1)
           AND NOT EXISTS (SELECT 1 FROM entries WHERE source_document_id = ?1)
         RETURNING state_id, title, sha256, r2_key`,
      )
      .bind(id)
      .first<{ state_id: string; title: string; sha256: string; r2_key: string }>()
    if (!gone) continue
    // After the row: a failed R2 delete leaves a stray file, never a row without its file.
    if (!isRestoredSourceKey(gone.r2_key)) await files.delete(gone.r2_key)
    await auditInsert(db, {
      actorEmail: actor,
      action: 'source.expire',
      target: `source:${String(id)}`,
      details: { stateId: gone.state_id, title: gone.title, sha256: gone.sha256 },
    })
    counts.sourcesDeleted++
  }
  return counts
}

/** Error text for the stored result: the message only, short. */
function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : 'unknown error'
  return text.slice(0, 300)
}

/** Runs every part in order, records the result in `app_meta`, and returns it. */
export async function runMaintenance(
  env: MaintenanceEnv,
  { trigger, actor, now = new Date() }: MaintenanceOptions,
): Promise<MaintenanceRun> {
  const db = createDb(env.DB)
  const startedAt = new Date().toISOString()
  const jobs: Record<MaintenancePart, () => Promise<Counts>> = {
    weeklyDump: () => writeWeeklyDump(env, now, trigger),
    pruneWeeklyDumps: () => pruneWeeklyDumps(env.FILES),
    prunePublishBackups: () => prunePublishBackups(db, env.FILES, actor),
    draftCleanup: () => cleanupDrafts(env.DB, env.FILES, now, actor),
  }
  const parts: Partial<Record<MaintenancePart, MaintenancePartResult>> = {}
  for (const part of maintenanceParts) {
    const started = Date.now()
    try {
      const counts = await jobs[part]()
      parts[part] = { status: 'ok', ms: Date.now() - started, counts, error: null }
    } catch (err) {
      parts[part] = {
        status: 'failed',
        ms: Date.now() - started,
        counts: {},
        error: errorText(err),
      }
    }
  }
  const run = maintenanceRunSchema.parse({
    startedAt,
    finishedAt: new Date().toISOString(),
    trigger,
    parts,
  })
  const value = JSON.stringify(run)
  await db
    .insert(appMeta)
    .values({ key: LAST_MAINTENANCE_KEY, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } })
  // Counts and timings only (docs/security.md: no row data in logs).
  console.log(
    JSON.stringify({
      level: Object.values(run.parts).some((p) => p.status === 'failed') ? 'error' : 'info',
      message: 'maintenance run',
      trigger,
      parts: Object.fromEntries(
        maintenanceParts.map((p) => [p, { status: run.parts[p].status, ms: run.parts[p].ms }]),
      ),
    }),
  )
  return run
}
