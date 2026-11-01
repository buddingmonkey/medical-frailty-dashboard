import { describe, expect, it } from 'vitest'

import { accessToken, call, fakeAssets } from '../test/access-fixtures'

// Required tests (docs/testing.md). Do not delete.

describe('admin API', () => {
  it('returns 401 without a token', async () => {
    expect((await call('/api/admin/whoami')).status).toBe(401)
  })

  it.each([
    ['a bad signature', { wrongKey: true }],
    ['the wrong audience', { audience: 'some-other-app' }],
    ['the wrong issuer', { issuer: 'https://evil.cloudflareaccess.com' }],
    ['an expired token', { expiresIn: '-1m' }],
  ])('returns 401 for %s', async (_label, options) => {
    const res = await call('/api/admin/whoami', { token: await accessToken(options) })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Sign-in required' })
  })

  it('returns 401 for a token that is not a JWT', async () => {
    expect((await call('/api/admin/whoami', { token: 'not-a-jwt' })).status).toBe(401)
  })

  it('returns 403 for a valid token whose email is not an admin', async () => {
    const res = await call('/api/admin/whoami', {
      token: await accessToken({ email: 'guest@example.org' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Not an admin' })
  })

  it('returns 403 for a service token (no email)', async () => {
    const res = await call('/api/admin/whoami', {
      token: await accessToken({ email: null, extra: { common_name: 'ci.access' } }),
    })
    expect(res.status).toBe(403)
  })

  it('lets an admin in, matching the email case-insensitively', async () => {
    const res = await call('/api/admin/whoami', {
      token: await accessToken({ email: 'second.admin@example.org' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: 'second.admin@example.org' })
  })

  it('stays locked in public mode', async () => {
    const vars = { SITE_MODE: 'public' }
    expect((await call('/api/admin/whoami', { vars })).status).toBe(401)
    expect((await call('/admin', { vars })).status).toBe(401)
    expect((await call('/admin/ingest', { vars })).status).toBe(401)
  })

  it('serves /admin pages to an admin, marked noindex and no-store', async () => {
    const res = await call('/admin', {
      token: await accessToken(),
      vars: { SITE_MODE: 'public', ASSETS: fakeAssets },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('protects the /admin pages the same way', async () => {
    const guest = await accessToken({ email: 'guest@example.org' })
    expect((await call('/admin', { token: guest, vars: { SITE_MODE: 'public' } })).status).toBe(403)
  })
})

describe('site gate, SITE_MODE=private', () => {
  it.each(['/', '/compare', '/assets/index.js', '/api/public/health'])(
    'returns 401 for %s without a token',
    async (path) => {
      const res = await call(path)
      expect(res.status).toBe(401)
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    },
  )

  it('answers an API path with JSON and a page path with text', async () => {
    expect((await call('/api/public/health')).headers.get('content-type')).toContain(
      'application/json',
    )
    expect((await call('/')).headers.get('content-type')).toContain('text/plain')
  })

  it('lets in any identity Access approved, including guests', async () => {
    const res = await call('/api/public/health', {
      token: await accessToken({ email: 'guest@example.org' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('marks static pages noindex once signed in', async () => {
    const res = await call('/', { token: await accessToken(), vars: { ASSETS: fakeAssets } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('lets in a service token (for CI smoke tests)', async () => {
    const res = await call('/api/public/health', {
      token: await accessToken({ email: null, extra: { common_name: 'ci.access' } }),
    })
    expect(res.status).toBe(200)
  })

  it('fails closed when SITE_MODE is missing or misspelled', async () => {
    expect((await call('/api/public/health', { vars: { SITE_MODE: '' } })).status).toBe(401)
    expect((await call('/api/public/health', { vars: { SITE_MODE: 'Public' } })).status).toBe(401)
  })

  it('fails closed when Access is not configured', async () => {
    const token = await accessToken()
    expect((await call('/api/public/health', { token, vars: { ACCESS_AUD: '' } })).status).toBe(401)
    expect(
      (await call('/api/public/health', { token, vars: { ACCESS_TEAM_DOMAIN: '' } })).status,
    ).toBe(401)
  })
})

describe('site gate, SITE_MODE=public', () => {
  const vars = { SITE_MODE: 'public' }

  it('serves public routes without a token and without noindex', async () => {
    const res = await call('/api/public/health', { vars })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBeNull()
  })
})

describe('robots.txt', () => {
  it('is reachable while private and disallows everything', async () => {
    const res = await call('/robots.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body).toMatch(/^User-agent: \*$/m)
    expect(body).toMatch(/^Disallow: \/$/m)
    expect(body).not.toContain('Content-Signal')
  })

  it('once public, allows the site but not admin or API paths', async () => {
    const body = await (await call('/robots.txt', { vars: { SITE_MODE: 'public' } })).text()
    expect(body).toMatch(/^User-agent: \*$/m)
    expect(body).toMatch(/^Allow: \/$/m)
    expect(body).toMatch(/^Disallow: \/admin$/m)
    expect(body).toMatch(/^Disallow: \/api\/$/m)
    expect(body).not.toMatch(/^Disallow: \/$/m)
  })

  // Project lead, 2026-11-01: AI crawlers are welcome, for search, answers and training.
  it('once public, welcomes AI use with a Content-Signal line', async () => {
    const body = await (await call('/robots.txt', { vars: { SITE_MODE: 'public' } })).text()
    expect(body).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m)
  })
})

describe('dev bypass', () => {
  const dev = { ENVIRONMENT: 'development', DEV_ADMIN_EMAIL: 'dev@localhost' }

  it('signs in as DEV_ADMIN_EMAIL on localhost in development', async () => {
    for (const host of ['localhost:8787', '127.0.0.1:8787']) {
      const res = await call('/api/admin/whoami', { host, vars: dev })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ email: 'dev@localhost' })
    }
  })

  // Required test: the bypass is off unless ENVIRONMENT=development.
  it.each(['test', 'preview', 'production', ''])('is off when ENVIRONMENT=%s', async (name) => {
    const res = await call('/api/admin/whoami', {
      host: 'localhost:8787',
      vars: { ...dev, ENVIRONMENT: name },
    })
    expect(res.status).toBe(401)
  })

  it('is off for any host other than localhost', async () => {
    const res = await call('/api/admin/whoami', { host: 'frailty.example.com', vars: dev })
    expect(res.status).toBe(401)
  })
})
