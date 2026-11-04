import { createMiddleware } from 'hono/factory'

import { type GetJwks, verifyAccess } from '../auth/access'
import type { AppEnv } from '../types'
import { signInRequired } from './responses'

/** Anything but exactly "public" keeps the whole site private (fail closed). */
export const isPublic = (env: Env): boolean => env.SITE_MODE === 'public'

/** The only paths readable without Access while the site is private. */
const UNGATED_PATHS = new Set(['/robots.txt', '/llms.txt', '/.well-known/security.txt'])

/**
 * Pre-launch gate (docs/architecture.md, "Site gate"). While SITE_MODE is not "public", every
 * request needs a valid Access token, static files included. Any identity Access let in may
 * pass (admins, guest testers, service tokens); admin routes check ADMIN_EMAILS separately.
 */
export const siteGate = (getJwks: GetJwks) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (isPublic(c.env)) {
      await next()
      return
    }

    // Set now for early returns (401) and again after the handler, because a response built
    // outside Hono (static assets) does not pick up headers set with c.header().
    c.header('X-Robots-Tag', 'noindex, nofollow')

    // robots.txt says "Disallow: /" and nothing else, llms.txt only "not public yet" (llms-txt.ts),
    // and security.txt names only the repo's
    // public vulnerability-reporting page, so both may be read without signing in.
    if (UNGATED_PATHS.has(c.req.path)) {
      await next()
      c.res.headers.set('X-Robots-Tag', 'noindex, nofollow')
      return
    }

    const identity = await verifyAccess(c.req.raw, c.env, getJwks)
    if (!identity) return signInRequired(c)

    c.set('identity', identity)
    await next()
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return
  })
