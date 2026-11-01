import { type HealthResponse, healthResponseSchema } from '@mfcd/shared'
import { Hono } from 'hono'

import type { AppEnv } from '../../types'

export const health = new Hono<AppEnv>().get('/', (c) => {
  const body: HealthResponse = healthResponseSchema.parse({
    ok: true,
    environment: c.env.ENVIRONMENT,
  })
  c.header('Cache-Control', 'no-store')
  return c.json(body)
})
