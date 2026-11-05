import { drillQueryFromRecord, parsePatternKey } from '@mfcd/shared'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicDrill, publicDrillDetail } from '../../db/public-drill'
import type { AppEnv } from '../../types'

// The category drill-down's data (roadmap M5 step 6): `GET /api/public/categories/:slug` gives
// one page of the category's codes with their state counts; `…/:slug/detail?code=` gives every
// state's cell for one row. Counted in D1 (src/db/public-drill.ts). Cached on data_version
// (publicCache); the cache key is the URL with the drill-down's own parameters
// (middleware/cache-query.ts).

export const publicCategoriesRoute = new Hono<AppEnv>()
  .get('/:slug', async (c) => {
    const body = await publicDrill(
      createDb(c.env.DB),
      c.req.param('slug'),
      drillQueryFromRecord(c.req.queries()),
      { dataVersion: c.get('dataVersion') ?? 0 },
    )
    return body ? c.json(body) : c.json({ error: 'Not found' }, 404)
  })
  .get('/:slug/detail', async (c) => {
    const code = c.req.query('code') ?? ''
    if (parsePatternKey(code) === null) return c.json({ error: 'Invalid code' }, 400)
    const body = await publicDrillDetail(
      createDb(c.env.DB),
      c.req.param('slug'),
      code,
      c.get('dataVersion') ?? 0,
    )
    return body ? c.json(body) : c.json({ error: 'Not found' }, 404)
  })
