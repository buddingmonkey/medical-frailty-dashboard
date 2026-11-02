import {
  columnProfileQuerySchema,
  columnProfileResponseSchema,
  columnProfileSaveSchema,
  columnProfileSchema,
  headerKey,
} from '@mfcd/shared'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'

import { auditInsert } from '../../db/audit'
import { createDb } from '../../db/client'
import { columnProfiles, states } from '../../db/schema'
import type { AppEnv } from '../../types'

// Mounted behind requireAdmin and adminWriteGuard.
export const columnProfilesRoute = new Hono<AppEnv>()
  .get('/', async (c) => {
    const query = columnProfileQuerySchema.safeParse(c.req.query())
    if (!query.success) return c.json({ error: 'Invalid query' }, 400)
    const [row] = await createDb(c.env.DB)
      .select()
      .from(columnProfiles)
      .where(
        and(
          eq(columnProfiles.stateId, query.data.stateId),
          eq(columnProfiles.headerKey, query.data.headerKey),
        ),
      )
    return c.json(
      columnProfileResponseSchema.parse({
        item: row
          ? {
              headerKey: row.headerKey,
              profile: columnProfileSchema.parse(JSON.parse(row.profileJson)),
              updatedBy: row.updatedBy,
              updatedAt: row.updatedAt,
            }
          : null,
      }),
    )
  })

  .put('/', async (c) => {
    const body = columnProfileSaveSchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Invalid profile' }, 400)
    const { stateId, header, profile } = body.data
    const db = createDb(c.env.DB)
    const [state] = await db.select({ id: states.id }).from(states).where(eq(states.id, stateId))
    if (!state) return c.json({ error: 'Unknown state' }, 400)

    const actor = c.var.identity?.email ?? ''
    const key = headerKey(header)
    const profileJson = JSON.stringify(profile)
    await db.batch([
      db
        .insert(columnProfiles)
        .values({ stateId, headerKey: key, profileJson, updatedBy: actor })
        .onConflictDoUpdate({
          target: [columnProfiles.stateId, columnProfiles.headerKey],
          set: {
            profileJson,
            updatedBy: actor,
            updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
          },
        }),
      auditInsert(db, {
        actorEmail: actor,
        action: 'column_profile.save',
        target: `state:${stateId}`,
        details: { header, roles: profile.roles },
      }),
    ])
    return c.json({ ok: true })
  })
