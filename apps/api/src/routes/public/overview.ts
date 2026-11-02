import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicOverview } from '../../db/public-overview'
import type { AppEnv } from '../../types'

// GET /api/public/overview (roadmap M5 step 4): every state against every published unified
// category, read from precomputed rows with SQL aggregates. Cached on data_version
// (publicCache), like /api/public/states.

export const publicOverviewRoute = new Hono<AppEnv>().get('/', async (c) =>
  c.json(await publicOverview(createDb(c.env.DB), c.get('dataVersion') ?? 0)),
)
