import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../types'

// Public API rate limits (docs/security.md, "Abuse and cost controls"). Mounted on
// /api/public/* only: admin is behind Access, and server-rendered pages are cached at the edge.
// Search has its own, stricter limiter (it costs the most D1 reads); every other public route
// shares PUBLIC_RATE_LIMITER. Limits live in wrangler.jsonc ("ratelimits"), counted per
// Cloudflare location and approximate. The client IP is the key and is never logged.

/** Seconds a refused client should wait: the limiters' whole period (wrangler.jsonc). */
export const RETRY_AFTER_SECONDS = 60

/**
 * The key when CF-Connecting-IP is missing. Cloudflare sets the header on every request from
 * the internet, so only local or test requests share this one bucket.
 */
export const NO_CLIENT_IP_KEY = 'no-client-ip'

const SEARCH_PATH = /^\/api\/public\/codes\/search\/?$/

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
  return c.json({ error: 'Too many requests' }, 429)
})
