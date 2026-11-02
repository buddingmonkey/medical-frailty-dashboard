import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { accessToken, call } from '../test/access-fixtures'
import { resetDb } from '../test/reset-db'

const item = { title: 'Test', kind: 'internal', whyMd: 'Because.' }

async function post(options: Parameters<typeof call>[1] = {}) {
  return call('/api/admin/watch', {
    token: await accessToken(),
    method: 'POST',
    body: item,
    ...options,
  })
}

// docs/security.md, "Write safety": admin writes need our own Origin, a JSON body, and stay
// under 5 MB. Reads are not affected.
describe('admin write guard', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
  })

  it('accepts a same-origin JSON write', async () => {
    expect((await post()).status).toBe(201)
  })

  it('refuses a write from another origin, or with no Origin header', async () => {
    for (const origin of [
      'https://evil.example',
      'http://frailty.example.com.evil.example',
      null,
    ]) {
      const res = await post({ origin })
      expect(res.status, String(origin)).toBe(403)
      expect(await res.json()).toEqual({ error: 'Cross-origin write refused' })
    }
  })

  it('refuses a write that is not JSON', async () => {
    for (const contentType of [
      'application/x-www-form-urlencoded',
      'text/plain',
      'multipart/form-data; boundary=x',
      null,
    ]) {
      const res = await post({ contentType, rawBody: JSON.stringify(item) })
      expect(res.status, String(contentType)).toBe(415)
    }
  })

  it('accepts JSON with a charset', async () => {
    const res = await post({ contentType: 'application/json; charset=utf-8' })
    expect(res.status).toBe(201)
  })

  it('refuses a body over 5 MB', async () => {
    const res = await post({
      rawBody: JSON.stringify({ ...item, whyMd: 'x'.repeat(5 * 1024 * 1024) }),
    })
    expect(res.status).toBe(413)
  })

  it('leaves reads alone', async () => {
    const res = await call('/api/admin/watch', {
      token: await accessToken(),
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(200)
  })

  it('checks sign-in first, so strangers learn nothing', async () => {
    const res = await call('/api/admin/watch', {
      method: 'POST',
      body: item,
      origin: 'https://evil.example',
    })
    expect(res.status).toBe(401)
  })
})
