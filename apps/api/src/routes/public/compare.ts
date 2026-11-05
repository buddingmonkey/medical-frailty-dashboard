import { compareQuerySchema, compareResponseSchema } from '@mfcd/shared'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicCompare } from '../../db/public-compare'
import type { AppEnv } from '../../types'

// GET /api/public/compare (roadmap M4 step 1): one category's codes, aligned across the
// selected states, a page at a time. Cached on data_version (publicCache); the cache key is the
// URL with the compare parameters (middleware/cache-query.ts), so each selection is its own entry.

export const publicCompareRoute = new Hono<AppEnv>().get('/', async (c) => {
  const query = compareQuerySchema.safeParse(c.req.query())
  if (!query.success) return c.json({ error: 'Invalid compare query' }, 400)
  const load = await publicCompare(createDb(c.env.DB), query.data)
  if (!load.ok) {
    return c.json({ error: `Unknown state: ${load.unknownStates.join(', ')}` }, 400)
  }
  return c.json(
    compareResponseSchema.parse({ dataVersion: c.get('dataVersion') ?? 0, ...load.result }),
  )
})
