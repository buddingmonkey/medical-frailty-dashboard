import { createMiddleware } from 'hono/factory'

import type { AppEnv } from '../types'
import { html } from './html'

// Cloudflare Web Analytics (roadmap M8 step 6; docs/deployment.md, "Web Analytics"): no cookies,
// nothing stored in the browser. With the Worker var CF_BEACON_TOKEN set to the site token from
// the dashboard's manual setup, every public HTML page (the Worker's rendered pages and the SPA
// shell) loads Cloudflare's beacon script, and the CSP allows it (security-headers.ts). Unset or
// malformed, nothing changes. Admin pages never load it.

export const BEACON_ORIGIN = 'https://static.cloudflareinsights.com'
export const BEACON_SRC = `${BEACON_ORIGIN}/beacon.min.js`
/** Where the beacon posts its page views (`/cdn-cgi/rum`). */
export const REPORT_ORIGIN = 'https://cloudflareinsights.com'

/** The site token when analytics is on, else null. A token is 32 hex characters. */
export function beaconToken(env: Partial<Pick<Env, 'CF_BEACON_TOKEN'>>): string | null {
  const token = env.CF_BEACON_TOKEN?.trim() ?? ''
  return /^[0-9a-f]{32}$/i.test(token) ? token : null
}

/** `/admin` and everything under it: the beacon never loads there. */
export const isAdminPath = (path: string): boolean => /^\/admin(\/|$)/.test(path)

/** The beacon script tag. Its attribute is escaped like any other value (seo/html.ts). */
export const beaconTag = (token: string) =>
  html`<script defer src="${BEACON_SRC}" data-cf-beacon="${JSON.stringify({ token })}"></script>`

/** Adds the beacon to the <head> of every public HTML response while a token is set. */
export const analyticsBeacon = createMiddleware<AppEnv>(async (c, next) => {
  await next()
  const token = beaconToken(c.env)
  if (!token || isAdminPath(c.req.path)) return
  if (!/^text\/html\b/i.test(c.res.headers.get('content-type') ?? '')) return
  const tag = beaconTag(token).value
  // The body grows, so its old length must go (a static asset's response carries one).
  const res = new Response(c.res.body, c.res)
  res.headers.delete('content-length')
  c.res = undefined
  c.res = new HTMLRewriter()
    .on('head', {
      element(el) {
        el.append(tag, { html: true })
      },
    })
    .transform(res)
})
