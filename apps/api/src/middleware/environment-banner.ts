import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../types'

// The test-site banner (docs/deployment.md, "Preview data"). Every HTML page of a Worker whose
// ENVIRONMENT is not exactly "production" opens with it, so nobody mistakes preview's seed data
// for the real lists. Added at run time, not at build time: preview and production run the same
// build, and a missing or wrong ENVIRONMENT shows the banner instead of hiding it. It sits
// before Vue's #app, so client-side navigation keeps it. Styled by `.env-banner` (main.css).

const SAY: Partial<Record<string, string>> = {
  preview: '<strong>Preview site.</strong> Test data, not the real state lists.',
  development: '<strong>Local development.</strong> Test data, not the real state lists.',
}
const OTHER = '<strong>Test site.</strong> Not the live data.'

/** The banner for an environment, or null on production. Fixed text only, never the value. */
export function bannerHtml(environment: string | undefined): string | null {
  if (environment === 'production') return null
  const say = (environment === undefined ? undefined : SAY[environment]) ?? OTHER
  return `<aside class="env-banner" aria-label="Test site">${say}</aside>`
}

export const environmentBanner: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  const banner = bannerHtml(c.env.ENVIRONMENT)
  if (banner === null || !(c.res.headers.get('content-type') ?? '').startsWith('text/html')) return
  const rewritten = new HTMLRewriter()
    .on('body', {
      element(el) {
        el.prepend(banner, { html: true })
      },
    })
    .transform(c.res)
  const headers = new Headers(rewritten.headers)
  // The body grew; a stale length would cut the page short.
  headers.delete('content-length')
  // Hono's setter copies the old response's headers onto the new one (Content-Length too), so
  // clear it first; `headers` already holds every header.
  c.res = undefined
  c.res = new Response(rewritten.body, { status: rewritten.status, headers })
}
