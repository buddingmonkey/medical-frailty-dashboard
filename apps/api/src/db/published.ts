import { asc, eq } from 'drizzle-orm'

import type { Db } from './client'
import { entries, states } from './schema'

/**
 * A state's public rows: the entries of `states.published_version_id`, in a fixed order.
 * Every public query reads through this pointer (docs/data-model.md), so drafts and old
 * versions are never visible, and a rollback restores exactly these rows.
 */
export async function publishedEntries(db: Db, stateId: string) {
  return db
    .select({ entry: entries })
    .from(states)
    .innerJoin(entries, eq(entries.versionId, states.publishedVersionId))
    .where(eq(states.id, stateId))
    .orderBy(asc(entries.id))
    .then((rows) => rows.map((r) => r.entry))
}
