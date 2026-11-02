import type { Db } from './client'
import { auditLog } from './schema'

export interface AuditRecord {
  /** The admin's Access email. Never a member's name, ID or claim (CLAUDE.md). */
  actorEmail: string
  /** Dotted verb, e.g. `source.upload`, `version.publish`, `watch.close`. */
  action: string
  /** What was acted on, e.g. `state:MT`, `version:12`, `watch:3`. */
  target: string
  /** Small JSON facts about the action (counts, file names, hashes). No row data. */
  details?: Record<string, unknown>
}

/**
 * An insert into `audit_log`, not yet run. Await it, or pass it to `db.batch()` so the audit row
 * is written in the same transaction as the change it records (publish, rollback).
 */
export function auditInsert(db: Db, record: AuditRecord) {
  return db.insert(auditLog).values({
    actorEmail: record.actorEmail,
    action: record.action,
    target: record.target,
    detailsJson: record.details === undefined ? null : JSON.stringify(record.details),
  })
}
