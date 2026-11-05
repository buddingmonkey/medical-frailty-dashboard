import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../types'

// Public rate limits (docs/security.md, "Abuse and cost controls"). Mounted on /api/public/*
// and on the server-rendered pages and downloads in LIMITED_PAGE_PATHS, which do the same D1
// work as the API. Admin is behind Access and not limited; nor are the home, states and info
// pages or static files. Search has its own, stricter limiter (it costs the most D1 reads);
// every other limited route shares PUBLIC_RATE_LIMITER. Limits live in wrangler.jsonc ("ratelimits"), counted per
// Cloudflare location and approximate. The client IP is the key and is never logged.

/** Seconds a refused client should wait: the limiters' whole period (wrangler.jsonc). */
export const RETRY_AFTER_SECONDS = 60

/**
 * The key when CF-Connecting-IP is missing. Cloudflare sets the header on every request from
 * the internet, so only local or test requests share this one bucket.
 */
export const NO_CLIENT_IP_KEY = 'no-client-ip'

const SEARCH_PATH = /^\/api\/public\/codes\/search\/?$/

/**
 * Page, download and sitemap routes that read D1 per query (src/routes/pages.ts). Hono's
 * `/x/*` also matches `/x` (so `/compare` is counted once, and `/states` would be too: hence
 * `/states/:slug/*`, which covers a state's page and its downloads, not `/states/*`).
 */
export const LIMITED_PAGE_PATHS = [
  '/compare/*',
  '/compare.csv',
  '/codes/*',
  '/states/:slug/*',
  '/sitemap.xml',
  '/sitemaps/*',
] as const

/** Local Workers (`pnpm dev`, e2e, Vitest) skip the limits; any other value applies them. */
const LOCAL_ENVIRONMENTS = new Set(['development', 'test'])

export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  if (LOCAL_ENVIRONMENTS.has(c.env.ENVIRONMENT)) return next()

  const limiter = SEARCH_PATH.test(c.req.path)
    ? c.env.SEARCH_RATE_LIMITER
    : c.env.PUBLIC_RATE_LIMITER
  const key = c.req.header('CF-Connecting-IP') ?? NO_CLIENT_IP_KEY
  const { success } = await limiter.limit({ key })
  if (success) return next()

  c.header('Retry-After', String(RETRY_AFTER_SECONDS))
  if (!c.req.path.startsWith('/api/')) {
    return c.text('Too many requests. Try again in a minute.', 429)
  }
  return c.json({ error: 'Too many requests' }, 429)
})
