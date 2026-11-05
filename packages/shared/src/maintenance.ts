import { z } from 'zod'

// Weekly maintenance (docs/deployment.md, "Backups and restore"; docs/data-model.md, "Replacing
// a state's list", step 6). A Cron Trigger runs it on Sunday; admins can run it from
// /admin/restore. The last run's result is kept in `app_meta.last_maintenance`.

/** `app_meta` key holding the last run (a `maintenanceRunSchema` value, as JSON). */
export const LAST_MAINTENANCE_KEY = 'last_maintenance'
/** Open drafts idle this long are deleted; discarded ones this old lose their entries. */
export const DRAFT_EXPIRY_DAYS = 30
/** Per-publish backups (`backups/<state>/<version id>.json`) kept per state. */
export const KEEP_PUBLISH_BACKUPS = 20
/**
 * Weekly dumps (`backups/weekly/<UTC date>.zip`) kept: the cron's. A dump's R2 custom metadata
 * `trigger` says what made it; one without the tag (written before it existed) counts as weekly.
 */
export const KEEP_WEEKLY_DUMPS = 12
/** Dumps made by "Run maintenance now" kept, apart from the weekly ones. */
export const KEEP_MANUAL_DUMPS = 3
/**
 * Hard cap on a weekly dump's zip, which is buffered in memory before the R2 put. The real full
 * data zips to about 1 MB; a Worker has 128 MB. Above the cap the dump fails and says so.
 */
export const WEEKLY_DUMP_MAX_BYTES = 32 * 1024 * 1024
export const WEEKLY_DUMP_PREFIX = 'backups/weekly/'

/** In run order. Each part runs even when an earlier one failed. */
export const maintenanceParts = [
  'weeklyDump',
  'pruneWeeklyDumps',
  'prunePublishBackups',
  'draftCleanup',
] as const
export type MaintenancePart = (typeof maintenanceParts)[number]

export const maintenancePartLabels: Record<MaintenancePart, string> = {
  weeklyDump: 'Backup saved',
  pruneWeeklyDumps: 'Old backups removed',
  prunePublishBackups: 'Old backups of each publish removed',
  draftCleanup: 'Old drafts cleaned up',
}

export const maintenancePartResultSchema = z.object({
  status: z.enum(['ok', 'failed']),
  ms: z.number().int().min(0),
  /** Counts only (rows, bytes, deleted, kept). Never row data. */
  counts: z.record(z.string(), z.number().int().min(0)),
  error: z.string().max(300).nullable(),
})
export type MaintenancePartResult = z.infer<typeof maintenancePartResultSchema>

export const maintenanceRunSchema = z.object({
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  trigger: z.enum(['cron', 'manual']),
  parts: z.object({
    weeklyDump: maintenancePartResultSchema,
    pruneWeeklyDumps: maintenancePartResultSchema,
    prunePublishBackups: maintenancePartResultSchema,
    draftCleanup: maintenancePartResultSchema,
  }),
})
export type MaintenanceRun = z.infer<typeof maintenanceRunSchema>

/** A weekly dump's date: a real calendar day, `YYYY-MM-DD`. */
export const weeklyDumpDateSchema = z.iso.date()

export const weeklyDumpSchema = z.object({
  date: weeklyDumpDateSchema,
  size: z.number().int().min(0),
  uploadedAt: z.iso.datetime(),
})
export type WeeklyDump = z.infer<typeof weeklyDumpSchema>

export const maintenanceStatusSchema = z.object({
  last: maintenanceRunSchema.nullable(),
  /** Newest first. */
  weekly: z.array(weeklyDumpSchema),
})
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>

/** `backups/weekly/<date>.zip` → the date, or null for any other key. */
export function weeklyDumpDate(key: string): string | null {
  const m = /^backups\/weekly\/(\d{4}-\d{2}-\d{2})\.zip$/.exec(key)
  const date = m?.[1]
  return date !== undefined && weeklyDumpDateSchema.safeParse(date).success ? date : null
}

/** `backups/<state>/<version id>.json` → its parts, or null for any other key. */
export function publishBackupKey(key: string): { stateId: string; versionId: number } | null {
  const m = /^backups\/([A-Z]{2})\/(\d{1,12})\.json$/.exec(key)
  if (!m?.[1] || !m[2]) return null
  return { stateId: m[1], versionId: Number(m[2]) }
}
