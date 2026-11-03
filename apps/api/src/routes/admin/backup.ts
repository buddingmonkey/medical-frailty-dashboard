import {
  RESTORED_SOURCE_KEY_PREFIX,
  restoreMappingsQuerySchema,
  restoreMappingsSchema,
  restoreSourceRequestSchema,
  restoreSourceResponseSchema,
} from '@mfcd/shared'
import { and, eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { backupBaseName, createZipWriter, writeFullBackup } from '../../db/backup-dump'
import { createDb, type Db } from '../../db/client'
import { bumpDataVersion } from '../../db/meta'
import {
  categoryMappings,
  chapterMappings,
  columnProfiles,
  datasetVersions,
  sourceDocuments,
  states,
} from '../../db/schema'
import type { AppEnv } from '../../types'

// Backups (docs/deployment.md, "Backups and restore"). Mounted at /api/admin/backup behind
// requireAdmin and adminWriteGuard. The download is a zip with one JSON file (format 2). Restore
// path 2 reads a backup in the browser and sends one version through the normal draft API; the
// routes here only add what that API lacks: the cited source (metadata only, when its file is
// gone) and, if the admin asks, the state's mappings.

/** D1 binds at most 100 parameters per statement. */
const D1_MAX_PARAMS = 100

const actorOf = (c: Context<AppEnv>) => c.var.identity?.email ?? ''

async function stateExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db.select({ id: states.id }).from(states).where(eq(states.id, id))
  return row !== undefined
}

/** Inserts in chunks under D1's parameter limit. */
function chunked<T extends object>(rows: T[]): T[][] {
  const columns = Object.keys(rows[0] ?? { x: 0 }).length
  const per = Math.max(1, Math.floor(D1_MAX_PARAMS / columns))
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += per) chunks.push(rows.slice(i, i + per))
  return chunks
}

export const backupRoute = new Hono<AppEnv>()
  // The full download: streamed, page by page, through a zip writer (never whole in memory).
  .get('/', async (c) => {
    const environment = c.env.ENVIRONMENT
    const writtenAt = new Date().toISOString()
    const base = backupBaseName(environment, writtenAt)
    await auditInsert(createDb(c.env.DB), {
      actorEmail: actorOf(c),
      action: 'backup.download',
      target: 'backup:full',
      details: { file: `${base}.zip`, writtenAt },
    })

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const zip = createZipWriter(`${base}.json`, (bytes) => writer.write(bytes))
    const started = Date.now()
    void writeFullBackup(c.env.DB, { environment, writtenAt }, zip.write)
      .then(async (stats) => {
        await zip.end()
        await writer.close()
        // Sizes and counts only: the file itself holds admin emails (audit_log).
        console.log(
          JSON.stringify({
            level: 'info',
            message: 'backup written',
            ms: Date.now() - started,
            rows: stats.rows,
            rowsRead: stats.rowsRead,
            queries: stats.queries,
            jsonChars: stats.chars,
            zipBytes: zip.bytes,
          }),
        )
      })
      .catch(async (err: unknown) => {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'backup failed',
            error: err instanceof Error ? err.message : 'unknown',
          }),
        )
        // The download ends broken (no zip directory, no "complete"): the importer refuses it.
        await writer.abort(err).catch(() => undefined)
      })

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${base}.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  })

  // The source a restored version cites: the state's source with the same SHA-256, or a new
  // metadata-only row (no file in R2: its key says so, and its download answers 404).
  .post('/sources', async (c) => {
    const body = restoreSourceRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid source' }, 400)
    const meta = body.data
    const db = createDb(c.env.DB)
    if (!(await stateExists(db, meta.stateId))) return c.json({ error: 'Unknown state' }, 400)

    const [existing] = await db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(eq(sourceDocuments.stateId, meta.stateId), eq(sourceDocuments.sha256, meta.sha256)),
      )
    if (existing) {
      return c.json(
        restoreSourceResponseSchema.parse({ sourceDocumentId: existing.id, reused: true }),
      )
    }
    const actor = actorOf(c)
    const [inserted] = await db
      .insert(sourceDocuments)
      .values({
        stateId: meta.stateId,
        title: meta.title,
        url: meta.url,
        publisherDate: meta.publisherDate,
        fileType: meta.fileType,
        sha256: meta.sha256,
        r2Key: `${RESTORED_SOURCE_KEY_PREFIX}${crypto.randomUUID()}`,
        byteSize: meta.byteSize ?? 0,
        uploadedBy: actor,
      })
      .returning({ id: sourceDocuments.id })
    if (!inserted) return c.json({ error: 'Could not store the source' }, 500)
    await auditInsert(db, {
      actorEmail: actor,
      action: 'source.restore',
      target: `source:${String(inserted.id)}`,
      details: {
        stateId: meta.stateId,
        title: meta.title,
        sha256: meta.sha256,
        note: 'restored from backup, file not available',
      },
    })
    return c.json(
      restoreSourceResponseSchema.parse({ sourceDocumentId: inserted.id, reused: false }),
      201,
    )
  })

  // The state's current mappings, for the diff shown before restoring the backup's.
  .get('/mappings', async (c) => {
    const query = restoreMappingsQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: 'Invalid query' }, 400)
    const { stateId } = query.data
    const db = createDb(c.env.DB)
    const [cats, chapters, profiles] = await db.batch([
      db.select().from(categoryMappings).where(eq(categoryMappings.stateId, stateId)),
      db.select().from(chapterMappings).where(eq(chapterMappings.stateId, stateId)),
      db.select().from(columnProfiles).where(eq(columnProfiles.stateId, stateId)),
    ])
    return c.json(
      restoreMappingsSchema.parse({
        categoryMappings: cats,
        chapterMappings: chapters,
        columnProfiles: profiles,
      }),
    )
  })

  // Replaces the state's mappings with the backup's (only when the admin ticked the box).
  .put('/mappings/:stateId', async (c) => {
    const stateId = c.req.param('stateId')
    if (!/^[A-Z]{2}$/.test(stateId)) return c.json({ error: 'Not found' }, 404)
    const body = restoreMappingsSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid mappings' }, 400)
    const db = createDb(c.env.DB)
    if (!(await stateExists(db, stateId))) return c.json({ error: 'Not found' }, 404)
    const {
      categoryMappings: cats,
      chapterMappings: chapters,
      columnProfiles: profiles,
    } = body.data
    if ([...cats, ...chapters, ...profiles].some((row) => row.stateId !== stateId)) {
      return c.json({ error: 'Every row must belong to this state' }, 400)
    }

    const inserts = [
      ...chunked(cats).map((rows) => db.insert(categoryMappings).values(rows)),
      ...chunked(chapters).map((rows) => db.insert(chapterMappings).values(rows)),
      ...chunked(profiles).map((rows) => db.insert(columnProfiles).values(rows)),
    ]
    // One batch: all of it or none. A mapping change is a change to the public page.
    await db.batch([
      db.delete(categoryMappings).where(eq(categoryMappings.stateId, stateId)),
      db.delete(chapterMappings).where(eq(chapterMappings.stateId, stateId)),
      db.delete(columnProfiles).where(eq(columnProfiles.stateId, stateId)),
      ...inserts,
      db
        .update(datasetVersions)
        .set({ contentUpdatedAt: new Date().toISOString() })
        .where(and(eq(datasetVersions.stateId, stateId), eq(datasetVersions.status, 'published'))),
      bumpDataVersion(db),
      auditInsert(db, {
        actorEmail: actorOf(c),
        action: 'mappings.restore',
        target: `state:${stateId}`,
        details: {
          categoryMappings: cats.length,
          chapterMappings: chapters.length,
          columnProfiles: profiles.length,
        },
      }),
    ])
    return c.json({ ok: true })
  })
