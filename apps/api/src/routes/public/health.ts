import { Hono } from 'hono'

export const health = new Hono<{ Bindings: Env }>().get('/', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true, environment: c.env.ENVIRONMENT })
})
