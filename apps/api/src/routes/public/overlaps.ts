import { overlapsQuerySchema } from '@mfcd/shared'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicOverlaps } from '../../db/public-overlaps'
import type { AppEnv } from '../../types'

// GET /api/public/overlaps?category=<slug> (project lead, 2026-11-12): the Overlaps tab's data,
// the exclusive intersections of the states' sets of rows in one category
// (src/db/public-overlaps.ts). Cached on data_version (publicCache), keyed on `category` only
// (middleware/cache-query.ts).

export const publicOverlapsRoute = new Hono<AppEnv>().get('/', async (c) => {
  const query = overlapsQuerySchema.safeParse(c.req.queries())
  if (!query.success) return c.json({ error: 'Invalid category' }, 400)
  const body = await publicOverlaps(
    createDb(c.env.DB),
    query.data.category,
    c.get('dataVersion') ?? 0,
  )
  return body ? c.json(body) : c.json({ error: 'Not found' }, 404)
})
