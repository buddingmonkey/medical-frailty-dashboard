import { sql } from 'drizzle-orm'

import type { Db } from './client'
import { appMeta } from './schema'

/**
 * `app_meta.data_version` + 1, as an unrun statement for the publish or rollback batch.
 * Public caches key on it, so any change to published data invalidates them.
 */
export function bumpDataVersion(db: Db) {
  return db
    .insert(appMeta)
    .values({ key: 'data_version', value: '1' })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: sql`CAST(CAST(${appMeta.value} AS INTEGER) + 1 AS TEXT)` },
    })
}
