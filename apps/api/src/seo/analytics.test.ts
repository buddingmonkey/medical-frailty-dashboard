import { beforeEach, describe, expect, it } from 'vitest'

import { accessToken, call } from '../test/access-fixtures'
import { seedStatesCompare } from '../test/overview-fixtures'
import { BEACON_ORIGIN, BEACON_SRC, beaconToken, REPORT_ORIGIN } from './analytics'

// Cloudflare Web Analytics (roadmap M8 step 6; docs/deployment.md, "Web Analytics"): with the
// Worker var CF_BEACON_TOKEN set, every public HTML page loads Cloudflare's beacon and the CSP
// allows it; unset (local dev, tests, a host that has not registered the site), nothing changes.
// Admin pages never load it.

// A made-up 32-hex token, built at runtime so secret scanners do not read it as a real key.
const TOKEN = '0123456789abcdef'.repeat(2) // gitleaks:allow (fake test token)
const HOST = 'frailty.example.org'

/** A built index.html with a <head>, for the pages and the SPA shell. */
const assets: Fetcher = {
  fetch: () =>
    Promise.resolve(
      new Response(
        '<!doctype html><html><head><title>app</title></head><body><div id="app"></div></body></html>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
    ),
  connect: () => {
    throw new Error('not used in tests')
  },
}

function get(path: string, token?: string, sessionToken?: string) {
  return call(path, {
    host: HOST,
    ...(sessionToken ? { token: sessionToken } : {}),
    vars: {
      SITE_MODE: 'public',
      ASSETS: assets,
      ...(token === undefined ? {} : { CF_BEACON_TOKEN: token }),
    },
  })
}

const beaconTags = (html: string) =>
  html.match(/<script\b[^>]*static\.cloudflareinsights\.com[^>]*><\/script>/g) ?? []

/** One CSP directive's sources. */
function directive(res: Response, name: string): string[] {
  const csp = res.headers.get('content-security-policy') ?? ''
  const part = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
  return part?.split(/\s+/).slice(1) ?? []
}

const PUBLIC_PAGES = ['/', '/states/ga', '/about', '/compare', '/codes/icd-10-cm/F20.0']

beforeEach(async () => {
  await seedStatesCompare()
})

describe('the analytics token', () => {
  it('is on only for a Cloudflare site token (32 hex characters)', () => {
    expect(beaconToken({ CF_BEACON_TOKEN: TOKEN })).toBe(TOKEN)
    expect(beaconToken({ CF_BEACON_TOKEN: TOKEN.toUpperCase() })).toBe(TOKEN.toUpperCase())
    expect(beaconToken({ CF_BEACON_TOKEN: '' })).toBeNull()
    expect(beaconToken({ CF_BEACON_TOKEN: `${TOKEN}"><script>` })).toBeNull()
    expect(beaconToken({ CF_BEACON_TOKEN: 'abc' })).toBeNull()
    expect(beaconToken({})).toBeNull()
  })
})

describe('analytics off (no token)', () => {
  it.each(PUBLIC_PAGES)('%s has no beacon and the strict CSP', async (path) => {
    const res = await get(path)
    expect(res.status).toBe(200)
    expect(beaconTags(await res.text())).toEqual([])
    expect(directive(res, 'script-src')).toEqual(["'self'"])
    expect(directive(res, 'connect-src')).toEqual(["'self'"])
  })

  it('stays off for a value that is not a token', async () => {
    const res = await get('/', 'not-a-token')
    expect(beaconTags(await res.text())).toEqual([])
    expect(directive(res, 'script-src')).toEqual(["'self'"])
  })
})

describe('analytics on (CF_BEACON_TOKEN set)', () => {
  it.each([...PUBLIC_PAGES, '/no-such-page'])(
    '%s loads the beacon once, deferred, and the CSP allows it',
    async (path) => {
      const res = await get(path, TOKEN)
      const html = await res.text()

      const tags = beaconTags(html)
      expect(tags).toHaveLength(1)
      const tag = tags[0] ?? ''
      expect(tag).toContain(`src="${BEACON_SRC}"`)
      expect(tag).toMatch(/\sdefer[\s>]/)
      expect(tag).toContain(`data-cf-beacon="{&quot;token&quot;:&quot;${TOKEN}&quot;}"`)
      // In <head>, and no inline script.
      expect(html.indexOf(tag)).toBeLessThan(html.indexOf('</head>'))
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/)

      expect(directive(res, 'script-src')).toEqual(["'self'", BEACON_ORIGIN])
      expect(directive(res, 'connect-src')).toEqual(["'self'", REPORT_ORIGIN])
    },
  )

  it('never loads on admin pages, whose CSP stays strict', async () => {
    const session = await accessToken()
    for (const path of ['/admin', '/admin/sources']) {
      const res = await get(path, TOKEN, session)
      expect(res.status, path).toBe(200)
      expect(beaconTags(await res.text()), path).toEqual([])
      expect(directive(res, 'script-src'), path).toEqual(["'self'"])
      expect(directive(res, 'connect-src'), path).toEqual(["'self'"])
    }
  })

  it('leaves JSON and text responses alone', async () => {
    const json = await get('/api/public/states', TOKEN)
    expect(json.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await json.text()).not.toContain('cloudflareinsights')

    const robots = await get('/robots.txt', TOKEN)
    expect(await robots.text()).not.toContain('cloudflareinsights')
  })
})
