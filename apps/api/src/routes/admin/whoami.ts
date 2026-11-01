import { type WhoamiResponse, whoamiResponseSchema } from '@mfcd/shared'
import { Hono } from 'hono'

import type { AppEnv } from '../../types'

// Mounted behind requireAdmin, so an identity with an email is always present here.
export const whoami = new Hono<AppEnv>().get('/', (c) => {
  const body: WhoamiResponse = whoamiResponseSchema.parse({ email: c.var.identity?.email })
  return c.json(body)
})
