import {
  rollbackRequestSchema,
  stateListResponseSchema,
  versionListResponseSchema,
} from '@mfcd/shared'
import { and, asc, desc, eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb } from '../../db/client'
import { bumpDataVersion } from '../../db/meta'
import { recomputePlacements } from '../../db/placement'
import { datasetVersions, states } from '../../db/schema'
import type { AppEnv } from '../../types'

// Mounted behind requireAdmin and adminWriteGuard. The state picker for uploads and watch
// items, a state's versions, and rollback.
const stateIdParam = (c: Context<AppEnv>) => {
  const id = c.req.param('stateId') ?? ''
  return /^[A-Z]{2}$/.test(id) ? id : null
}

export const adminStates = new Hono<AppEnv>()
  .get('/', async (c) => {
    const rows = await createDb(c.env.DB)
      .select({ id: states.id, name: states.name, status: states.status })
      .from(states)
      .orderBy(asc(states.name))
    return c.json(stateListResponseSchema.parse({ items: rows }))
  })

  .get('/:stateId/versions', async (c) => {
    const stateId = stateIdParam(c)
    if (!stateId) return c.json({ error: 'Not found' }, 404)
    const items = await createDb(c.env.DB)
      .select({
        id: datasetVersions.id,
        versionNo: datasetVersions.versionNo,
        status: datasetVersions.status,
        rowCount: datasetVersions.rowCount,
        createdBy: datasetVersions.createdBy,
        createdAt: datasetVersions.createdAt,
        publishedBy: datasetVersions.publishedBy,
        publishedAt: datasetVersions.publishedAt,
      })
      .from(datasetVersions)
      .where(eq(datasetVersions.stateId, stateId))
      .orderBy(desc(datasetVersions.versionNo))
    return c.json(versionListResponseSchema.parse({ items }))
  })

  // Re-publishes a superseded version of the same state (docs/data-model.md): no restore is
  // needed, its rows are still in D1. One batch, every statement limited to this state.
  .post('/:stateId/rollback', async (c) => {
    const stateId = stateIdParam(c)
    if (!stateId) return c.json({ error: 'Not found' }, 404)
    const body = rollbackRequestSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid request' }, 400)
    const db = createDb(c.env.DB)
    const [target] = await db
      .select()
      .from(datasetVersions)
      .where(and(eq(datasetVersions.id, body.data.versionId), eq(datasetVersions.stateId, stateId)))
    if (!target) return c.json({ error: 'Not found' }, 404)
    if (target.status !== 'superseded') {
      return c.json({ error: 'Only a version that was published before can be restored' }, 409)
    }
    const [state] = await db
      .select({ publishedVersionId: states.publishedVersionId })
      .from(states)
      .where(eq(states.id, stateId))
    const now = new Date().toISOString()
    const actor = c.var.identity?.email ?? ''
    await db.batch([
      db
        .update(datasetVersions)
        .set({ status: 'superseded' })
        .where(and(eq(datasetVersions.stateId, stateId), eq(datasetVersions.status, 'published'))),
      db
        .update(datasetVersions)
        .set({ status: 'published', contentUpdatedAt: now })
        .where(
          and(
            eq(datasetVersions.id, target.id),
            eq(datasetVersions.stateId, stateId),
            eq(datasetVersions.status, 'superseded'),
          ),
        ),
      db
        .update(states)
        .set({ publishedVersionId: target.id, status: 'published', updatedAt: now })
        .where(eq(states.id, stateId)),
      bumpDataVersion(db),
      auditInsert(db, {
        actorEmail: actor,
        action: 'version.rollback',
        target: `version:${String(target.id)}`,
        details: {
          stateId,
          versionNo: target.versionNo,
          replaced: state?.publishedVersionId ?? null,
        },
      }),
    ])
    await recomputePlacements(db, { stateIds: [stateId] })
    return c.json({ ok: true })
  })
