import { createMiddleware } from 'hono/factory'

import { type GetJwks, isAdmin, verifyAccess } from '../auth/access'
import type { AppEnv } from '../types'
import { notAnAdmin, signInRequired } from './responses'

/**
 * Admin routes (/admin*, /api/admin*), in every SITE_MODE: a valid Access token (401 if not)
 * whose email is in ADMIN_EMAILS (403 if not). Access guards these paths too; this check means
 * a misconfigured Access policy alone cannot open them (docs/security.md).
 */
export const requireAdmin = (getJwks: GetJwks) =>
  createMiddleware<AppEnv>(async (c, next) => {
    // Set now for early returns, and again after the handler (static /admin pages are built
    // outside Hono and do not pick up c.header()).
    c.header('X-Robots-Tag', 'noindex, nofollow')
    c.header('Cache-Control', 'no-store')

    const identity = c.var.identity ?? (await verifyAccess(c.req.raw, c.env, getJwks))
    if (!identity) return signInRequired(c)
    if (!isAdmin(identity, c.env.ADMIN_EMAILS)) return notAnAdmin(c)

    c.set('identity', identity)
    await next()
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    c.res.headers.set('Cache-Control', 'no-store')
    return
  })
