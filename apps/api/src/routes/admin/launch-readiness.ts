import { launchReadinessResponseSchema } from '@mfcd/shared'
import { Hono } from 'hono'

import { createDb } from '../../db/client'
import { launchReadiness } from '../../db/launch-readiness'
import type { AppEnv } from '../../types'

// The launch data gate (roadmap M8 step 1). Mounted at /api/admin/launch-readiness behind
// requireAdmin. Read only.
export const launchReadinessRoute = new Hono<AppEnv>().get('/', async (c) => {
  const body = await launchReadiness(createDb(c.env.DB))
  return c.json(launchReadinessResponseSchema.parse(body))
})
