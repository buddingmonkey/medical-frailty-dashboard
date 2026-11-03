import { Hono } from 'hono'

import type { AppEnv } from '../types'

// /.well-known/security.txt (RFC 9116; roadmap M8 step 4): where to report a vulnerability.
// Reports go to GitHub private vulnerability reporting (SECURITY.md). Like robots.txt, the site
// gate lets it through without signing in while the site is private (it names only the
// repository's public reporting page), still with `X-Robots-Tag: noindex, nofollow`.

const REPO = 'https://github.com/buddingmonkey/medical-frailty-dashboard'
export const SECURITY_CONTACT = `${REPO}/security/advisories/new`
export const SECURITY_POLICY = `${REPO}/blob/main/SECURITY.md`

/**
 * `Expires`: midnight UTC 365 days after today, computed per request, so the file never goes
 * stale and stays just under the year RFC 9116 recommends.
 */
export function securityTxtExpires(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 365),
  ).toISOString()
}

export const securityTxt = new Hono<AppEnv>().get('/', (c) => {
  // RFC 9116: the canonical URL is https; the host is the one the file was asked on.
  const canonical = `https://${new URL(c.req.url).host}/.well-known/security.txt`
  c.header('Cache-Control', 'public, max-age=86400')
  return c.text(
    [
      `Contact: ${SECURITY_CONTACT}`,
      `Expires: ${securityTxtExpires(new Date())}`,
      'Preferred-Languages: en',
      `Canonical: ${canonical}`,
      `Policy: ${SECURITY_POLICY}`,
      '',
    ].join('\n'),
  )
})
