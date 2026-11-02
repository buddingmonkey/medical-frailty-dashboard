import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import { createDb, type Db } from '../db/client'
import { appMeta } from '../db/schema'
import type { AppEnv } from '../types'
import { isPublic } from './site-gate'

// Edge cache for public GET routes (docs/architecture.md, "Caching"). The cache key is the
// request URL plus `app_meta.data_version`, which every publish, rollback and mapping change
// bumps, plus the deployed Worker version, so a stale entry is never read again. While the site is private nothing is stored or
// served from the shared cache: a response that needed a sign-in must not reach anyone else.
// Note: the Cache API does nothing on *.workers.dev hosts; it starts working on a custom domain.

export const PUBLIC_MAX_AGE = 300

/** The current `data_version` (0 before the first publish). One row read. */
export async function dataVersion(db: Db): Promise<number> {
  const [row] = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, 'data_version'))
  const n = Number(row?.value ?? 0)
  return Number.isSafeInteger(n) && n >= 0 ? n : 0
}

interface PublicCacheOptions {
  /** More of the cache key, e.g. the hash of the built index.html for server-rendered pages. */
  keyExtra?: (c: Context<AppEnv>) => Promise<string>
  /** What browsers get. Defaults to the edge's own `public, max-age=300`. */
  browserCacheControl?: string
}

/** The cache middleware with options; `publicCache` is the plain one for JSON routes. */
export function cachePublic({ keyExtra, browserCacheControl }: PublicCacheOptions = {}) {
  const edgeCacheControl = `public, max-age=${String(PUBLIC_MAX_AGE)}`
  const browser = browserCacheControl ?? edgeCacheControl

  return createMiddleware<AppEnv>(async (c, next) => {
    const version = await dataVersion(createDb(c.env.DB))
    c.set('dataVersion', version)

    if (!isPublic(c.env) || c.req.method !== 'GET') {
      await next()
      c.res.headers.set('Cache-Control', 'private, no-store')
      return
    }

    const key = new URL(c.req.url)
    key.searchParams.set('__dv', String(version))
    // The deployed code's version: a deploy starts with an empty cache.
    key.searchParams.set('__wv', c.env.CF_VERSION_METADATA.id)
    if (keyExtra) key.searchParams.set('__k', await keyExtra(c))
    const cacheKey = new Request(key.toString(), { method: 'GET' })
    const cache = caches.default

    const hit = await cache.match(cacheKey)
    if (hit) {
      // A copy, so the security headers middleware can still add to it.
      const res = new Response(hit.body, hit)
      res.headers.set('Cache-Control', browser)
      return res
    }

    await next()
    if (c.res.status !== 200) {
      c.res.headers.set('Cache-Control', 'no-store')
      return
    }
    const toStore = c.res.clone()
    toStore.headers.set('Cache-Control', edgeCacheControl)
    c.res.headers.set('Cache-Control', browser)
    const stored = cache.put(cacheKey, toStore)
    // Outside a Worker request (unit tests call app.request) there is no execution context.
    try {
      c.executionCtx.waitUntil(stored)
    } catch {
      await stored
    }
    return
  })
}

export const publicCache = cachePublic()
