import { MAX_SOURCE_BYTES } from '@mfcd/shared'
import { bodyLimit } from 'hono/body-limit'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../types'

/** Largest JSON body an admin write may send (docs/security.md, "Write safety"). */
export const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const tooLarge = { onError: (c: Context) => c.json({ error: 'Request body too large' }, 413) }
const limitJson = bodyLimit({ maxSize: MAX_JSON_BODY_BYTES, ...tooLarge })
const limitFile = bodyLimit({ maxSize: MAX_SOURCE_BYTES, ...tooLarge })

/** The one write that takes a raw file body: the source upload (docs/ingestion.md, step 2). */
const isFileUpload = (c: Context) => c.req.method === 'POST' && c.req.path === '/api/admin/sources'

/**
 * Second CSRF layer for `/api/admin/*` writes, after requireAdmin. Access cookies are
 * SameSite=Lax already; on top of that a write must come from our own origin (browsers always
 * send Origin on fetch POST/PUT/DELETE) and be JSON (or, for the source upload only, a raw
 * file), so no HTML form on another site can make one. Reads pass through.
 */
export const adminWriteGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (READ_METHODS.has(c.req.method)) return next()

  if (c.req.header('Origin') !== new URL(c.req.url).origin) {
    return c.json({ error: 'Cross-origin write refused' }, 403)
  }
  const type = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  if (isFileUpload(c)) {
    if (type !== 'application/octet-stream') {
      return c.json({ error: 'Content-Type must be application/octet-stream' }, 415)
    }
    return limitFile(c, next)
  }
  if (type !== 'application/json') {
    return c.json({ error: 'Content-Type must be application/json' }, 415)
  }
  return limitJson(c, next)
})
