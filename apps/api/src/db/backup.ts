import { asc, eq } from 'drizzle-orm'

import type { Db } from './client'
import { datasetVersions, draftParts, entries, sourceDocuments, versionSources } from './schema'

/**
 * Writes one version (row, sources, parts, entries) to R2 as JSON before a publish replaces it
 * (docs/data-model.md, "Replacing a state's list"). Returns the key. Rollback does not need it:
 * superseded versions stay in D1. It is for restoring a state whose history was lost: the
 * admin's /admin/restore page reads this format (1) and the full download (2) alike
 * (packages/shared/src/backup.ts).
 */
export async function backupVersion(
  db: Db,
  files: R2Bucket,
  stateId: string,
  versionId: number,
): Promise<string> {
  const [version] = await db.select().from(datasetVersions).where(eq(datasetVersions.id, versionId))
  const sources = await db
    .select({
      id: sourceDocuments.id,
      stateId: sourceDocuments.stateId,
      title: sourceDocuments.title,
      url: sourceDocuments.url,
      publisherDate: sourceDocuments.publisherDate,
      sha256: sourceDocuments.sha256,
      // Added in M7 step 1 (format 1 still): restore path 2 recreates a source from these.
      fileType: sourceDocuments.fileType,
      byteSize: sourceDocuments.byteSize,
    })
    .from(versionSources)
    .innerJoin(sourceDocuments, eq(versionSources.sourceDocumentId, sourceDocuments.id))
    .where(eq(versionSources.versionId, versionId))
  const parts = await db.select().from(draftParts).where(eq(draftParts.versionId, versionId))
  const rows = await db
    .select()
    .from(entries)
    .where(eq(entries.versionId, versionId))
    .orderBy(asc(entries.id))
  const key = `backups/${stateId}/${String(versionId)}.json`
  await files.put(
    key,
    JSON.stringify({
      format: 1,
      writtenAt: new Date().toISOString(),
      version,
      sources,
      parts,
      entries: rows,
    }),
    { httpMetadata: { contentType: 'application/json' } },
  )
  return key
}
