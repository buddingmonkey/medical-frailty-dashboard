import { type AuditListResponse, auditListResponseSchema, auditQuerySchema } from '@mfcd/shared'
import { desc, lt } from 'drizzle-orm'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { auditLog } from '../../db/schema'
import type { AppEnv } from '../../types'

function parseDetails(json: string | null): unknown {
  return json === null ? null : JSON.parse(json)
}

// Mounted behind requireAdmin. Newest first; `before` is the smallest id of the previous page.
export const audit = new Hono<AppEnv>().get('/', async (c) => {
  const query = auditQuerySchema.safeParse(c.req.query())
  if (!query.success) return c.json({ error: 'Invalid query' }, 400)
  const { limit, before } = query.data

  // One extra row tells us whether an older page exists.
  const rows = await createDb(c.env.DB)
    .select()
    .from(auditLog)
    .where(before === undefined ? undefined : lt(auditLog.id, before))
    .orderBy(desc(auditLog.id))
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  const body: AuditListResponse = auditListResponseSchema.parse({
    items: page.map((row) => ({
      id: row.id,
      at: row.at,
      actorEmail: row.actorEmail,
      action: row.action,
      target: row.target,
      details: parseDetails(row.detailsJson),
    })),
    nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  })
  return c.json(body)
})
