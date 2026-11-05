import { refLookupRequestSchema, refLookupResponseSchema } from '@mfcd/shared'
import { inArray } from 'drizzle-orm'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { chunk, D1_MAX_PARAMS } from '../../db/d1-limits'
import { refCodes } from '../../db/schema'
import type { AppEnv } from '../../types'

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
  const [first, ...rest] = chunk(codes, D1_MAX_PARAMS).map(select)
  if (!first) return c.json({ items: [] })
  const results = await db.batch([first, ...rest])
  const items = results.flat().map((r) => ({
    codeNorm: r.codeNorm,
    codeSystem: r.codeSystem,
    billable: r.billable === null ? null : r.billable === 1,
  }))
  return c.json(refLookupResponseSchema.parse({ items }))
})
