import { publicStatesResponseSchema } from '@mfcd/shared'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { publicStateDetail } from '../../db/public-state'
import { publicSummaries } from '../../db/public-summary'
import type { AppEnv } from '../../types'

// GET /api/public/states (roadmap M3 step 1): every state with its published counts, for the
// home map. GET /api/public/states/:slug (step 3): one state's page. Both cached on
// data_version (publicCache).

export const publicStates = new Hono<AppEnv>()
  .get('/', async (c) => {
    const { items } = await publicSummaries(createDb(c.env.DB))
    return c.json(
      publicStatesResponseSchema.parse({ dataVersion: c.get('dataVersion') ?? 0, items }),
    )
  })
  .get('/:slug', async (c) => {
    const detail = await publicStateDetail(
      createDb(c.env.DB),
      c.req.param('slug').toLowerCase(),
      c.get('dataVersion') ?? 0,
    )
    return detail ? c.json(detail) : c.json({ error: 'Not found' }, 404)
  })
