import {
  idParamSchema,
  isRestoredSourceKey,
  type SourceDocument,
  sha256Hex,
  sniffMatches,
  sourceDetailsSchema,
  sourceDocumentSchema,
  sourceListQuerySchema,
  sourceListResponseSchema,
  sourceUploadQuerySchema,
  sourceUploadResponseSchema,
} from '@mfcd/shared'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb, type Db } from '../../db/client'
import { chunk, D1_MAX_PARAMS } from '../../db/d1-limits'
import { bumpDataVersion } from '../../db/meta'
import { datasetVersions, sourceDocuments, states, versionSources } from '../../db/schema'
import type { AppEnv } from '../../types'
import { actorOf, notFound } from './request'

type Row = typeof sourceDocuments.$inferSelect

/** Rows plus the versions built from each, for the duplicate warning ("as version N"). */
async function withVersions(db: Db, rows: Row[]): Promise<SourceDocument[]> {
  const select = (ids: number[]) =>
    db
      .select({
        sourceId: versionSources.sourceDocumentId,
        id: datasetVersions.id,
        versionNo: datasetVersions.versionNo,
        status: datasetVersions.status,
      })
      .from(versionSources)
      .innerJoin(datasetVersions, eq(versionSources.versionId, datasetVersions.id))
      .where(inArray(versionSources.sourceDocumentId, ids))
      .orderBy(datasetVersions.versionNo)
  // A state can have more source files than D1 binds parameters.
  const ids = rows.map((r) => r.id)
  const [first, ...rest] = chunk(ids, D1_MAX_PARAMS).map(select)
  const links = first ? (await db.batch([first, ...rest])).flat() : []
  // sourceDocumentSchema strips r2Key: the storage key never leaves the Worker.
  return rows.map((row) =>
    sourceDocumentSchema.parse({
      ...row,
      versions: links
        .filter((l) => l.sourceId === row.id)
        .map(({ id, versionNo, status }) => ({ id, versionNo, status })),
    }),
  )
}

// Mounted behind requireAdmin and adminWriteGuard (which allows a raw file body only on
// POST /api/admin/sources, up to MAX_SOURCE_BYTES).
export const sources = new Hono<AppEnv>()
  .get('/', async (c) => {
    const query = sourceListQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: 'Invalid query' }, 400)
    const { stateId, sha256 } = query.data
    const db = createDb(c.env.DB)
    const rows = await db
      .select()
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.stateId, stateId),
          sha256 === undefined ? undefined : eq(sourceDocuments.sha256, sha256),
        ),
      )
      .orderBy(desc(sourceDocuments.id))
    return c.json(sourceListResponseSchema.parse({ items: await withVersions(db, rows) }))
  })

  .post('/', async (c) => {
    const query = sourceUploadQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: 'Invalid upload' }, 400)
    const meta = query.data
    const db = createDb(c.env.DB)

    const [state] = await db
      .select({ id: states.id })
      .from(states)
      .where(eq(states.id, meta.stateId))
    if (!state) return c.json({ error: 'Unknown state' }, 400)

    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.byteLength === 0) return c.json({ error: 'Empty file' }, 400)
    const sha256 = await sha256Hex(bytes)
    if (sha256 !== meta.sha256) return c.json({ error: 'File hash does not match' }, 400)
    if (!sniffMatches(bytes, meta.fileType)) {
      return c.json({ error: `File content is not a ${meta.fileType}` }, 400)
    }

    const [existing] = await db
      .select()
      .from(sourceDocuments)
      .where(and(eq(sourceDocuments.stateId, meta.stateId), eq(sourceDocuments.sha256, sha256)))
    if (existing) {
      const [source] = await withVersions(db, [existing])
      return c.json(sourceUploadResponseSchema.parse({ source, duplicate: true }), 200)
    }

    // Random key, stored as a download: R2 never serves it inline from our origin
    // (docs/security.md, "Upload safety"). R2 checks the SHA-256 on write.
    const r2Key = `sources/${crypto.randomUUID()}`
    await c.env.FILES.put(r2Key, bytes, {
      sha256,
      httpMetadata: { contentType: 'application/octet-stream', contentDisposition: 'attachment' },
    })

    const actor = actorOf(c)
    try {
      const [inserted] = await db
        .insert(sourceDocuments)
        .values({
          stateId: meta.stateId,
          title: meta.title,
          url: meta.url,
          publisherDate: meta.publisherDate,
          fileType: meta.fileType,
          sha256,
          r2Key,
          byteSize: bytes.byteLength,
          uploadedBy: actor,
        })
        .returning()
      if (!inserted) throw new Error('source insert returned no row')
      await auditInsert(db, {
        actorEmail: actor,
        action: 'source.upload',
        target: `source:${String(inserted.id)}`,
        details: {
          stateId: meta.stateId,
          title: meta.title,
          fileType: meta.fileType,
          sha256,
          byteSize: bytes.byteLength,
        },
      })
      const [source] = await withVersions(db, [inserted])
      return c.json(sourceUploadResponseSchema.parse({ source, duplicate: false }), 201)
    } catch (err) {
      // No row, no file: never leave an orphan in R2.
      await c.env.FILES.delete(r2Key)
      throw err
    }
  })

  // Fix the details shown on public pages (title, state URL, publisher date) after upload.
  // The file, hash and R2 key never change. A source of a version the public pages show
  // (published, or superseded in the history) bumps data_version, so cached pages refresh.
  .put('/:id', async (c) => {
    const id = idParamSchema.safeParse(c.req.param('id'))
    if (!id.success) return notFound(c)
    const body = sourceDetailsSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? 'Invalid details' }, 400)
    }
    const db = createDb(c.env.DB)
    const [row] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, id.data))
    if (!row) return notFound(c)

    const [shown] = await db
      .select({ id: datasetVersions.id })
      .from(versionSources)
      .innerJoin(datasetVersions, eq(versionSources.versionId, datasetVersions.id))
      .where(
        and(
          eq(versionSources.sourceDocumentId, row.id),
          inArray(datasetVersions.status, ['published', 'superseded']),
        ),
      )
      .limit(1)

    const next = body.data
    const update = db
      .update(sourceDocuments)
      .set({ title: next.title, url: next.url, publisherDate: next.publisherDate })
      .where(eq(sourceDocuments.id, row.id))
      .returning()
    const audit = auditInsert(db, {
      actorEmail: actorOf(c),
      action: 'source.update',
      target: `source:${String(row.id)}`,
      details: {
        stateId: row.stateId,
        before: { title: row.title, url: row.url, publisherDate: row.publisherDate },
        after: next,
      },
    })
    const [updated] = shown
      ? (await db.batch([update, audit, bumpDataVersion(db)]))[0]
      : (await db.batch([update, audit]))[0]
    if (!updated) return notFound(c)
    const [source] = await withVersions(db, [updated])
    return c.json(source)
  })

  .get('/:id/file', async (c) => {
    const id = idParamSchema.safeParse(c.req.param('id'))
    if (!id.success) return notFound(c)
    const [row] = await createDb(c.env.DB)
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, id.data))
    if (row && isRestoredSourceKey(row.r2Key)) {
      return c.json({ error: 'Restored from a backup: the file is not available.' }, 404)
    }
    const object = row ? await c.env.FILES.get(row.r2Key) : null
    if (!row || !object) return notFound(c)

    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${row.stateId}-source-${String(row.id)}.${row.fileType}"`,
        'Content-Length': String(object.size),
      },
    })
  })
