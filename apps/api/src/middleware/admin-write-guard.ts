import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../types'

/** Largest JSON body an admin write may send (docs/security.md, "Write safety"). */
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const limitBody = bodyLimit({
  maxSize: MAX_JSON_BODY_BYTES,
  onError: (c) => c.json({ error: 'Request body too large' }, 413),
})

/**
 * Second CSRF layer for `/api/admin/*` writes, after requireAdmin. Access cookies are
 * SameSite=Lax already; on top of that a write must come from our own origin (browsers always
 * send Origin on fetch POST/PUT/DELETE) and be JSON, so no HTML form on another site can make
 * one. Reads pass through.
 */
export const adminWriteGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (READ_METHODS.has(c.req.method)) return next()

  if (c.req.header('Origin') !== new URL(c.req.url).origin) {
    return c.json({ error: 'Cross-origin write refused' }, 403)
  }
  const type = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') {
    return c.json({ error: 'Content-Type must be application/json' }, 415)
  }
  return limitBody(c, next)
})
