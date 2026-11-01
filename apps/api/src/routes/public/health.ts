import { type HealthResponse, healthResponseSchema } from '@mfcd/shared'
import { Hono } from 'hono'

export const health = new Hono<{ Bindings: Env }>().get('/', (c) => {
  const body: HealthResponse = healthResponseSchema.parse({
    ok: true,
    environment: c.env.ENVIRONMENT,
  })
  c.header('Cache-Control', 'no-store')
  return c.json(body)
})
