import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { AppEnv } from '../../types'
import { actorOf } from './request'

describe('actorOf', () => {
  it("is the identity's email, or '' without one", async () => {
    const app = new Hono<AppEnv>()
      .get('/with', (c) => {
        c.set('identity', { email: 'admin@example.com' })
        return c.text(actorOf(c))
      })
      .get('/token', (c) => {
        c.set('identity', { email: null })
        return c.text(actorOf(c))
      })
      .get('/without', (c) => c.text(actorOf(c)))
    expect(await (await app.request('/with')).text()).toBe('admin@example.com')
    expect(await (await app.request('/token')).text()).toBe('')
    expect(await (await app.request('/without')).text()).toBe('')
  })
})
