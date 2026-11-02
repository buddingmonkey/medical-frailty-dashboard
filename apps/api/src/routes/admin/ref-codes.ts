import { refLookupRequestSchema, refLookupResponseSchema } from '@mfcd/shared'
import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { refCodes } from '../../db/schema'
import type { AppEnv } from '../../types'

/** D1 binds at most 100 parameters per query. */
const CHUNK = 100

// Mounted behind requireAdmin and adminWriteGuard. A read sent as POST: up to 1,000 codes do
// not fit in a URL.
export const refCodesRoute = new Hono<AppEnv>().post('/lookup', async (c) => {
  const body = refLookupRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Invalid codes' }, 400)
  const codes = [...new Set(body.data.codes)]
  const db = createDb(c.env.DB)
  const select = (chunk: string[]) =>
    db
      .select({
        codeNorm: refCodes.codeNorm,
        codeSystem: refCodes.codeSystem,
        billable: refCodes.billable,
      })
      .from(refCodes)
      .where(inArray(refCodes.codeNorm, chunk))
  const chunks: string[][] = []
  for (let i = 0; i < codes.length; i += CHUNK) chunks.push(codes.slice(i, i + CHUNK))
  const [first, ...rest] = chunks.map(select)
  if (!first) return c.json({ items: [] })
  const results = await db.batch([first, ...rest])
  const items = results.flat().map((r) => ({
    codeNorm: r.codeNorm,
    codeSystem: r.codeSystem,
    billable: r.billable === null ? null : r.billable === 1,
  }))
  return c.json(refLookupResponseSchema.parse({ items }))
})
