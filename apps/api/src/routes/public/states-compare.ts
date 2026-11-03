import { statesCompareQueryFromRecord, statesFromApiQuery } from '@mfcd/shared'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicStatesCompare } from '../../db/public-states-compare'
import type { AppEnv } from '../../types'

// Compare 2–4 states (roadmap M5 step 7): `GET /api/public/states-compare?states=GA,LA&diff=0
// &page=2` gives one page of the codes where the states differ (every code with `diff=0`),
// grouped by unified category, with the summary counts and, for two states, their similarity.
// Counted in D1 (src/db/public-states-compare.ts). Cached on data_version (publicCache).

export const publicStatesCompareRoute = new Hono<AppEnv>().get('/', async (c) => {
  const ids = statesFromApiQuery(c.req.query('states'))
  if (!ids) return c.json({ error: 'Choose 2 to 4 different states' }, 400)
  const body = await publicStatesCompare(
    createDb(c.env.DB),
    ids,
    statesCompareQueryFromRecord(c.req.queries()),
    { dataVersion: c.get('dataVersion') ?? 0 },
  )
  return body ? c.json(body) : c.json({ error: 'Unknown state' }, 404)
})
