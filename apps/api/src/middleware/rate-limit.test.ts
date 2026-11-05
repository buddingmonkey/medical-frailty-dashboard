import { beforeEach, describe, expect, it } from 'vitest'

import { call, fakeAssets } from '../test/access-fixtures'
import { NO_CLIENT_IP_KEY, RETRY_AFTER_SECONDS } from './rate-limit'

// Public API rate limits (docs/security.md, "Abuse and cost controls"): a Workers Rate Limiting
// binding keyed on the client IP, a stricter one on search. The real bindings count per
// Cloudflare location; these tests use fakes that allow or refuse and record the keys.

interface FakeLimiter extends RateLimit {
  keys: string[]
  allow: boolean
}

function fakeLimiter(): FakeLimiter {
  const limiter: FakeLimiter = {
    keys: [],
    allow: true,
    limit: ({ key }) => {
      limiter.keys.push(key)
      return Promise.resolve({ success: limiter.allow })
    },
  }
  return limiter
}

let publicLimiter: FakeLimiter
let searchLimiter: FakeLimiter

beforeEach(() => {
  publicLimiter = fakeLimiter()
  searchLimiter = fakeLimiter()
})

function get(path: string, options: { ip?: string; environment?: string } = {}) {
  return call(path, {
    vars: {
      SITE_MODE: 'public',
      ENVIRONMENT: options.environment ?? 'production',
      PUBLIC_RATE_LIMITER: publicLimiter,
      SEARCH_RATE_LIMITER: searchLimiter,
      ASSETS: fakeAssets,
    },
    ...(options.ip === undefined ? {} : { headers: { 'CF-Connecting-IP': options.ip } }),
  })
}

describe('public API rate limits', () => {
  it('lets a request under the limit through, keyed on the client IP', async () => {
    const res = await get('/api/public/health', { ip: '203.0.113.7' })
    expect(res.status).toBe(200)
    expect(publicLimiter.keys).toEqual(['203.0.113.7'])
    expect(searchLimiter.keys).toEqual([])
  })

  it('answers 429 JSON with Retry-After once the limit is reached', async () => {
    publicLimiter.allow = false
    const res = await get('/api/public/states', { ip: '203.0.113.7' })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe(String(RETRY_AFTER_SECONDS))
    expect(RETRY_AFTER_SECONDS).toBe(60)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.json()).toEqual({ error: 'Too many requests' })
  })

  it('keeps the security headers on a 429', async () => {
    publicLimiter.allow = false
    const res = await get('/api/public/overview', { ip: '203.0.113.7' })
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'")
  })

  it('counts search against the stricter search limiter only', async () => {
    searchLimiter.allow = false
    const res = await get('/api/public/codes/search?q=F20', { ip: '198.51.100.2' })
    expect(res.status).toBe(429)
    expect(searchLimiter.keys).toEqual(['198.51.100.2'])
    expect(publicLimiter.keys).toEqual([])
  })

  it('counts code pages against the public limiter, not the search one', async () => {
    await get('/api/public/codes/icd10cm/F200', { ip: '198.51.100.2' })
    expect(publicLimiter.keys).toEqual(['198.51.100.2'])
    expect(searchLimiter.keys).toEqual([])
  })

  it('uses one shared fallback key when CF-Connecting-IP is missing', async () => {
    const res = await get('/api/public/health')
    expect(res.status).toBe(200)
    expect(publicLimiter.keys).toEqual([NO_CLIENT_IP_KEY])
  })

  it('leaves admin routes, the home and states pages, info pages and files alone', async () => {
    publicLimiter.allow = false
    searchLimiter.allow = false
    const paths = ['/api/admin/whoami', '/', '/states', '/about', '/robots.txt', '/assets/app.js']
    for (const path of paths) {
      const res = await get(path, { ip: '203.0.113.7' })
      expect(res.status, path).not.toBe(429)
    }
    expect(publicLimiter.keys).toEqual([])
    expect(searchLimiter.keys).toEqual([])
  })

  // The pages and downloads that read D1 per query: without a limit they bypass the API's.
  const limitedPages = [
    '/compare',
    '/compare/codes?states=GA,MT&category=sud',
    '/compare/codes.csv?states=GA,MT&category=sud',
    '/compare.csv?states=GA',
    '/compare/states/ga-vs-mt',
    '/compare/states/ga-vs-mt/codes.csv',
    '/compare/some-category/codes.csv',
    '/codes/icd10cm/F20.0',
    '/states/mt',
    '/states/mt/codes.csv',
    '/states/mt/codes.json',
    '/sitemap.xml',
    '/sitemaps/codes-9999.xml',
  ]

  it.each(limitedPages)('answers 429 on %s past the limit', async (path) => {
    publicLimiter.allow = false
    const res = await get(path, { ip: '203.0.113.7' })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe(String(RETRY_AFTER_SECONDS))
    expect(publicLimiter.keys).toEqual(['203.0.113.7'])
    expect(searchLimiter.keys).toEqual([])
  })

  it.each(limitedPages)('counts %s once under the limit', async (path) => {
    const res = await get(path, { ip: '203.0.113.7' })
    expect(res.status).not.toBe(429)
    expect(publicLimiter.keys).toEqual(['203.0.113.7'])
  })

  it('is off on local Workers (development, test), so e2e runs never trip it', async () => {
    publicLimiter.allow = false
    for (const environment of ['development', 'test']) {
      const res = await get('/api/public/health', { ip: '127.0.0.1', environment })
      expect(res.status, environment).toBe(200)
    }
    expect(publicLimiter.keys).toEqual([])
  })

  it('applies on preview and on any unknown environment value (fail safe)', async () => {
    publicLimiter.allow = false
    for (const environment of ['preview', 'staging', '']) {
      const res = await get('/api/public/health', { ip: '203.0.113.7', environment })
      expect(res.status, environment).toBe(429)
    }
  })
})
