import { healthResponseSchema } from '@mfcd/shared'
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const BASE = 'http://example.com'

describe('GET /api/public/health', () => {
  it('returns a valid health response that is never cached', async () => {
    const res = await exports.default.fetch(`${BASE}/api/public/health`)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(healthResponseSchema.parse(await res.json()).ok).toBe(true)
  })

  it('carries the security headers', async () => {
    const res = await exports.default.fetch(`${BASE}/api/public/health`)

    const csp = res.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-inline')
    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })
})

describe('public API methods', () => {
  // Required test (docs/testing.md): public routes reject non-GET methods.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s with 405', async (method) => {
    const res = await exports.default.fetch(`${BASE}/api/public/health`, { method })

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
    expect(await res.json()).toEqual({ error: 'Method not allowed' })
  })
})

describe('unknown API paths', () => {
  it('return a JSON 404, not the web app', async () => {
    const res = await exports.default.fetch(`${BASE}/api/nope`)

    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})
