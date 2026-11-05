import {
  drillQueryKeys,
  drillQuerySchema,
  publicStatesResponseSchema,
  statesCompareQueryKeys,
  statesCompareQuerySchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../db/client'
import { states } from '../db/schema'
import { app, call, fakeAssets } from '../test/access-fixtures'
import { seedOverview } from '../test/overview-fixtures'
import { seedPublicStates } from '../test/public-fixtures'
import { cacheQueryParams, canonicalCacheSearch } from './cache-query'
import { isCacheMiddleware } from './public-cache'

// The edge cache key (docs/architecture.md, "Caching"): only the parameters a route reads,
// sorted, so junk parameters cannot bust the cache; HEAD shares GET's entries.

const db = createDb(env.DB)

let hosts = 0
/** A host of its own per test: the host is part of the cache key. */
const freshHost = () => `cache-key-${String((hosts += 1))}.example.com`

/** The built index.html's shape: pages render into its head and `#app`. */
const assets: Fetcher = {
  ...fakeAssets,
  fetch: () =>
    Promise.resolve(
      new Response(
        '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>x</title></head><body><div id="app"></div></body></html>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
    ),
}

function request(path: string, host: string, method = 'GET') {
  return call(path, { host, method, vars: { SITE_MODE: 'public', ASSETS: assets } })
}

async function stateNames(res: Response) {
  return publicStatesResponseSchema.parse(await res.json()).items.map((s) => s.name)
}

beforeEach(seedPublicStates)

describe('canonicalCacheSearch', () => {
  it('keeps only the listed parameters, sorted by name, values in order', () => {
    const params = new URLSearchParams('page=2&utm_source=x&states=GA,MT&b=1&states=LA&_=123')
    expect(canonicalCacheSearch(params, ['states', 'page'])).toBe('page=2&states=GA%2CMT&states=LA')
  })

  it('is empty for a route that reads no parameters', () => {
    expect(canonicalCacheSearch(new URLSearchParams('fbclid=abc'), [])).toBe('')
  })

  it('names every parameter the query schemas read', () => {
    expect([...drillQueryKeys].sort()).toEqual(Object.keys(drillQuerySchema.shape).sort())
    expect([...statesCompareQueryKeys].sort()).toEqual(
      Object.keys(statesCompareQuerySchema.shape).sort(),
    )
  })

  it('keeps every parameter, sorted, for a route it does not know (never a wrong hit)', () => {
    expect(canonicalCacheSearch(new URLSearchParams('z=1&a=2'), null)).toBe('a=2&z=1')
  })
})

describe('the cache key in the app', () => {
  it('lists the parameters of every cached route', () => {
    const cached = app.routes.filter((r) => isCacheMiddleware(r.handler)).map((r) => r.path)
    expect(cached.length).toBeGreaterThan(20)
    expect(cached.filter((path) => cacheQueryParams(path) === null)).toEqual([])
  })

  it('answers a request with junk parameters from the cache', async () => {
    const host = freshHost()
    await request('/api/public/states?utm_source=news', host)
    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'NE'))
    const res = await request('/api/public/states?fbclid=abc&_=1', host)
    expect(await stateNames(res)).toContain('Nebraska')
  })

  it('still tells apart the parameters a route reads', async () => {
    await seedOverview()
    const host = freshHost()
    const page = async (path: string) => (await request(path, host)).text()
    const smi = '/compare/serious-mental-illness'
    const plain = await page(smi)
    const filtered = await page(`${smi}?show=one&focus=GA`)
    expect(filtered).not.toBe(plain)
    expect(await page(`${smi}?focus=GA&show=one&utm_source=x`)).toBe(filtered)
  })

  it('does not let a junk parameter change the page stored for the bare URL', async () => {
    await seedOverview()
    const host = freshHost()
    const smi = '/compare/serious-mental-illness'
    // A junk parameter is not a filter: the page stays indexed, like the bare one.
    const junk = await (await request(`${smi}?utm_source=x`, host)).text()
    expect(junk).not.toContain('noindex')
    expect(await (await request(smi, host)).text()).not.toContain('noindex')

    // The code table with no selection, not an "invalid link" error stored for everyone.
    const other = freshHost()
    const codes = await (await request('/compare/codes?utm_source=x', other)).text()
    const bare = await (await request('/compare/codes', freshHost())).text()
    expect(codes.replaceAll(other, 'host')).toBe(
      bare.replace(/cache-key-\d+\.example\.com/g, 'host'),
    )
  })

  it('serves HEAD from the entry GET stored, and GET from one HEAD stored', async () => {
    const host = freshHost()
    await request('/api/public/states', host)
    await db.update(states).set({ name: 'Renamed' }).where(eq(states.id, 'NE'))
    const head = await request('/api/public/states', host, 'HEAD')
    expect(head.status).toBe(200)
    expect(head.headers.get('cf-cache-status')).toBe('HIT')

    const other = freshHost()
    await request('/api/public/states', other, 'HEAD')
    await db.update(states).set({ name: 'Renamed again' }).where(eq(states.id, 'NE'))
    expect(await stateNames(await request('/api/public/states', other))).toContain('Renamed')
  })
})
